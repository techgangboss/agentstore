import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';
import { createPaymentRequired } from '@/lib/x402';

// Facilitator endpoint - set when facilitator is deployed
const FACILITATOR_ENDPOINT = process.env.X402_FACILITATOR_ENDPOINT || null;

/**
 * GET /api/agents/[agent_id]/access
 *
 * Returns 402 Payment Required if agent is paid and user has no entitlement.
 * Returns install details if agent is free or user has valid entitlement.
 *
 * Headers:
 *   X-Wallet-Address: User's wallet address (required for paid agents)
 *   X-Payment: Payment proof JSON (optional, to verify payment)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { agent_id: string } }
) {
  const { agent_id } = params;
  const walletAddress = request.headers.get('X-Wallet-Address')?.toLowerCase();
  const paymentHeader = request.headers.get('X-Payment');

  const supabase = createAdminClient();

  // Get agent details
  const { data: agent, error } = await supabase
    .from('agents')
    .select(`
      *,
      publisher:publishers(*)
    `)
    .eq('agent_id', agent_id)
    .eq('is_published', true)
    .single();

  if (error || !agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }

  const pricing = agent.manifest?.pricing || { model: 'free', amount: 0 };
  const isFree = pricing.model === 'free' || pricing.amount === 0;

  // Free agents - return install details immediately
  if (isFree) {
    return NextResponse.json({
      access: 'granted',
      agent_id: agent.agent_id,
      install: agent.manifest?.install || null,
      entitlement: null,
    });
  }

  // Paid agent - require wallet address
  if (!walletAddress) {
    return NextResponse.json(
      { error: 'X-Wallet-Address header required for paid agents' },
      { status: 400 }
    );
  }

  // Check for existing valid entitlement
  const { data: entitlement } = await supabase
    .from('entitlements')
    .select('*')
    .eq('agent_id', agent_id)
    .eq('wallet_address', walletAddress)
    .eq('is_active', true)
    .or('expires_at.is.null,expires_at.gt.now()')
    .single();

  if (entitlement) {
    // User has valid entitlement
    return NextResponse.json({
      access: 'granted',
      agent_id: agent.agent_id,
      install: agent.manifest?.install || null,
      entitlement: {
        token: entitlement.entitlement_token,
        expires_at: entitlement.expires_at,
      },
    });
  }

  // Check if payment header provided (user is retrying after payment)
  if (paymentHeader) {
    try {
      const paymentProof = JSON.parse(paymentHeader);

      // Verify the payment proof
      const verified = await verifyPaymentProof(
        supabase,
        paymentProof,
        agent_id,
        walletAddress,
        agent.publisher?.payout_address,
        pricing.amount
      );

      if (verified.success) {
        return NextResponse.json({
          access: 'granted',
          agent_id: agent.agent_id,
          install: agent.manifest?.install || null,
          entitlement: {
            token: verified.entitlement_token,
            expires_at: verified.expires_at,
          },
        });
      } else {
        return NextResponse.json(
          { error: 'Payment verification failed', details: verified.error },
          { status: 402 }
        );
      }
    } catch (e) {
      return NextResponse.json(
        { error: 'Invalid X-Payment header', details: String(e) },
        { status: 400 }
      );
    }
  }

  // No entitlement and no payment - return 402 Payment Required
  const paymentRequired = createPaymentRequired({
    amount: pricing.amount,
    recipient: agent.publisher?.payout_address || '',
    agentId: agent.agent_id,
    agentName: agent.name,
    facilitatorEndpoint: FACILITATOR_ENDPOINT || undefined,
  });

  return NextResponse.json(
    {
      error: 'Payment Required',
      code: 'PAYMENT_REQUIRED',
      payment: paymentRequired,
    },
    {
      status: 402,
      headers: {
        'X-Payment-Required': JSON.stringify(paymentRequired),
        'Content-Type': 'application/json',
      },
    }
  );
}

/**
 * Verify payment proof via facilitator
 * The facilitator handles the actual transaction and provides verification
 */
async function verifyPaymentProof(
  supabase: ReturnType<typeof createAdminClient>,
  proof: {
    tx_hash?: string;
    facilitator_proof?: string;
    nonce?: string;
  },
  agentId: string,
  walletAddress: string,
  _recipientAddress: string | null,
  expectedAmount: number
): Promise<{
  success: boolean;
  entitlement_token?: string;
  expires_at?: string | null;
  error?: string;
}> {
  // Query facilitator verification endpoint if configured
  const FACILITATOR_VERIFY_ENDPOINT = process.env.X402_FACILITATOR_VERIFY_ENDPOINT;

  if (FACILITATOR_VERIFY_ENDPOINT && proof.facilitator_proof) {
    try {
      const verifyResponse = await fetch(FACILITATOR_VERIFY_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proof: proof.facilitator_proof,
          agent_id: agentId,
          wallet_address: walletAddress,
          expected_amount: expectedAmount,
        }),
      });

      if (verifyResponse.ok) {
        const verification = await verifyResponse.json() as {
          verified: boolean;
          tx_hash?: string;
          error?: string;
        };

        if (verification.verified) {
          const entitlementToken = generateEntitlementToken();

          await supabase.from('entitlements').insert({
            agent_id: agentId,
            wallet_address: walletAddress,
            entitlement_token: entitlementToken,
            pricing_model: 'one_time',
            amount_paid: expectedAmount,
            currency: 'USDC',
            is_active: true,
            confirmation_status: 'confirmed',
            tx_hash: verification.tx_hash,
          });

          return {
            success: true,
            entitlement_token: entitlementToken,
            expires_at: null,
          };
        } else {
          return { success: false, error: verification.error || 'Payment not verified' };
        }
      }
    } catch (e) {
      console.error('Facilitator verification error:', e);
      // Fall through to pending state
    }
  }

  // No facilitator available - store intent as pending
  // User has signed permit, awaiting facilitator to process
  if (proof.nonce) {
    return {
      success: false,
      error: 'Payment intent received. Awaiting facilitator processing.',
    };
  }

  return { success: false, error: 'No valid payment proof provided' };
}

function generateEntitlementToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

export const dynamic = 'force-dynamic';
