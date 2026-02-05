import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';
import { z } from 'zod';
import type { X402PaymentProof } from '@/lib/x402';
import { PLATFORM_WALLET, PLATFORM_FEE_PERCENT } from '@/lib/x402';

// x402 facilitator endpoints
const FACILITATOR_ENDPOINT = process.env.X402_FACILITATOR_ENDPOINT || null;

const PaymentSubmissionSchema = z.object({
  agent_id: z.string(),
  wallet_address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  payment_required: z.object({
    amount: z.string(),
    currency: z.literal('USDC'),
    payTo: z.string(),
    nonce: z.string(),
    expires_at: z.string(),
  }),
  authorization: z.object({
    from: z.string(),
    to: z.string(),
    value: z.string(),
    validAfter: z.string(),
    validBefore: z.string(),
    nonce: z.string(),
    v: z.number(),
    r: z.string(),
    s: z.string(),
  }),
});

/**
 * POST /api/payments/submit
 *
 * Submit a signed EIP-3009 transferWithAuthorization for processing.
 *
 * Flow:
 * 1. User signs transferWithAuthorization (gasless EIP-712 typed data)
 * 2. Submit signed authorization here
 * 3. Server forwards to facilitator /verify then /settle
 * 4. Facilitator's relay wallet submits authorization to USDC on-chain
 * 5. USDC verifies signature and moves funds from user to payTo address
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const validation = PaymentSubmissionSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: validation.error.format() },
      { status: 400 }
    );
  }

  const { agent_id, wallet_address, payment_required, authorization } = validation.data;

  const supabase = createAdminClient();

  // Check if payment request has expired
  if (new Date(payment_required.expires_at) < new Date()) {
    return NextResponse.json(
      { error: 'Payment request has expired. Please request a new one.' },
      { status: 400 }
    );
  }

  // Verify agent exists and matches payment details
  const { data: agent } = await supabase
    .from('agents')
    .select('*, publisher:publishers(*)')
    .eq('agent_id', agent_id)
    .eq('is_published', true)
    .single();

  if (!agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }

  const expectedAmount = agent.manifest?.pricing?.amount || 0;
  if (parseFloat(payment_required.amount) !== expectedAmount) {
    return NextResponse.json(
      { error: 'Payment amount mismatch' },
      { status: 400 }
    );
  }

  // Calculate fee split: 20% platform, 80% publisher
  const publisherWallet = agent.publisher?.wallet_address || payment_required.payTo;
  const platformAmount = expectedAmount * (PLATFORM_FEE_PERCENT / 100);
  const publisherAmount = expectedAmount - platformAmount;

  const feeSplit = {
    platform_address: PLATFORM_WALLET,
    platform_amount: platformAmount.toFixed(2),
    platform_percent: PLATFORM_FEE_PERCENT,
    publisher_address: publisherWallet,
    publisher_amount: publisherAmount.toFixed(2),
    publisher_percent: 100 - PLATFORM_FEE_PERCENT,
  };

  // Forward signed authorization to facilitator for verification and settlement
  if (FACILITATOR_ENDPOINT) {
    try {
      // Step 1: Verify the authorization with the facilitator
      const verifyResponse = await fetch(`${FACILITATOR_ENDPOINT}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          authorization,
          payment_required,
          payer: wallet_address,
          fee_split: feeSplit,
        }),
      });

      if (!verifyResponse.ok) {
        const errorText = await verifyResponse.text();
        return NextResponse.json(
          { error: 'Facilitator rejected authorization', details: errorText },
          { status: 502 }
        );
      }

      // Step 2: Settle — facilitator's relay wallet submits to USDC on-chain
      const settleResponse = await fetch(`${FACILITATOR_ENDPOINT}/settle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          authorization,
          payment_required,
          payer: wallet_address,
          fee_split: feeSplit,
        }),
      });

      if (!settleResponse.ok) {
        const errorText = await settleResponse.text();
        return NextResponse.json(
          { error: 'Settlement failed', details: errorText },
          { status: 502 }
        );
      }

      const proof: X402PaymentProof = await settleResponse.json();

      // Settlement succeeded — create entitlement
      const entitlementToken = generateEntitlementToken();
      await supabase.from('entitlements').insert({
        agent_id,
        wallet_address: wallet_address.toLowerCase(),
        entitlement_token: entitlementToken,
        pricing_model: 'one_time',
        amount_paid: expectedAmount,
        currency: 'USDC',
        is_active: true,
        confirmation_status: proof.status === 'confirmed' ? 'confirmed' : 'preconfirmed',
        tx_hash: proof.tx_hash,
      });

      return NextResponse.json({
        success: true,
        status: 'processed',
        proof,
        entitlement_token: entitlementToken,
        install: agent.manifest?.install || null,
      });
    } catch (error) {
      console.error('Facilitator error:', error);
      return NextResponse.json(
        { error: 'Payment processing failed. Please try again.' },
        { status: 502 }
      );
    }
  }

  // Facilitator not configured — reject payment
  return NextResponse.json(
    { error: 'Payment processing is not available. Facilitator not configured.' },
    { status: 503 }
  );
}

function generateEntitlementToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

export const dynamic = 'force-dynamic';
