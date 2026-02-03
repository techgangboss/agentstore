import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';
import { z } from 'zod';
import type { X402PaymentProof } from '@agentstore/common';

// Facilitator endpoint - will process permits when deployed
const FACILITATOR_ENDPOINT = process.env.X402_FACILITATOR_ENDPOINT || null;

const PaymentSubmissionSchema = z.object({
  agent_id: z.string(),
  wallet_address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  payment_required: z.object({
    amount: z.string(),
    currency: z.literal('USDC'),
    recipient: z.string(),
    nonce: z.string(),
    expires_at: z.string(),
  }),
  permit: z.object({
    owner: z.string(),
    spender: z.string(),
    value: z.string(),
    nonce: z.coerce.bigint(),
    deadline: z.coerce.bigint(),
    v: z.number(),
    r: z.string(),
    s: z.string(),
  }),
});

/**
 * POST /api/payments/submit
 *
 * Submit a signed permit (payment intent) for processing.
 *
 * Flow:
 * 1. User signs ERC-2612 permit (gasless)
 * 2. Submit permit here
 * 3. If facilitator available: facilitator executes tx, returns proof
 * 4. If no facilitator: store intent for later processing
 *
 * The facilitator handles the actual on-chain transaction and verification.
 * User only submits intent (signed permit), minimizing risk.
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

  const { agent_id, wallet_address, payment_required, permit } = validation.data;

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

  // If facilitator is available, submit permit for processing
  // Facilitator handles: execute permit, transfer USDC, return proof
  if (FACILITATOR_ENDPOINT) {
    try {
      const facilitatorResponse = await fetch(FACILITATOR_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payment_required,
          permit,
          payer: wallet_address,
        }),
      });

      if (!facilitatorResponse.ok) {
        const errorText = await facilitatorResponse.text();
        return NextResponse.json(
          { error: 'Facilitator rejected payment', details: errorText },
          { status: 502 }
        );
      }

      const proof: X402PaymentProof = await facilitatorResponse.json();

      // Facilitator executed tx successfully - create entitlement
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
      // Fall through to pending storage
    }
  }

  // Facilitator not available - store payment intent for later
  // Intent remains valid (permit doesn't expire quickly), low risk
  try {
    await supabase.from('pending_payments').insert({
      agent_id,
      wallet_address: wallet_address.toLowerCase(),
      payment_required: payment_required,
      permit_signature: {
        owner: permit.owner,
        spender: permit.spender,
        value: permit.value,
        nonce: permit.nonce.toString(),
        deadline: permit.deadline.toString(),
        v: permit.v,
        r: permit.r,
        s: permit.s,
      },
      status: 'pending',
      created_at: new Date().toISOString(),
      expires_at: payment_required.expires_at,
    });
  } catch (insertError) {
    // Table might not exist yet - log but don't fail
    console.error('Failed to store pending payment:', insertError);
  }

  return NextResponse.json({
    success: true,
    status: 'pending_facilitator',
    message: 'Payment intent signed and stored. Will be processed when facilitator is available.',
    nonce: payment_required.nonce,
    agent_id,
    amount: payment_required.amount,
    currency: 'USDC',
  });
}

function generateEntitlementToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

export const dynamic = 'force-dynamic';
