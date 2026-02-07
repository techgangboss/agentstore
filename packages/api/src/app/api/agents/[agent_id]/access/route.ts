import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase';
import { createPaymentRequired, PLATFORM_WALLET, PLATFORM_FEE_PERCENT } from '@/lib/x402';

// x402 facilitator endpoint
const FACILITATOR_ENDPOINT = process.env.X402_FACILITATOR_ENDPOINT || '';

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

  // Use regular client for reads (RLS allows public reads)
  const supabase = createClient();

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

  // Check for existing valid entitlement using agent UUID (not string agent_id)
  const { data: entitlement } = await supabase
    .from('entitlements')
    .select('*')
    .eq('agent_id', agent.id)
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

      // Verify the payment proof (uses admin client for writes)
      const adminSupabase = createAdminClient();
      const verified = await verifyPaymentProof(
        adminSupabase,
        paymentProof,
        agent.id,
        walletAddress,
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
    payTo: agent.publisher?.payout_address || '',
    agentId: agent.agent_id,
    agentName: agent.name,
    facilitatorEndpoint: FACILITATOR_ENDPOINT,
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
 * Verify payment proof from X-Payment header
 * Uses the facilitator to verify that the on-chain settlement completed
 */
async function verifyPaymentProof(
  supabase: ReturnType<typeof createAdminClient>,
  proof: {
    tx_hash?: string;
    facilitator_proof?: string;
    nonce?: string;
  },
  agentUuid: string,
  walletAddress: string,
  expectedAmount: number
): Promise<{
  success: boolean;
  entitlement_token?: string;
  expires_at?: string | null;
  error?: string;
}> {
  if (FACILITATOR_ENDPOINT && proof.facilitator_proof) {
    try {
      const verifyResponse = await fetch(`${FACILITATOR_ENDPOINT}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proof: proof.facilitator_proof,
          agent_id: agentUuid,
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
          // Check for replay: has this tx_hash already been used?
          if (verification.tx_hash) {
            const { data: existingTx } = await supabase
              .from('transactions')
              .select('id')
              .eq('tx_hash', verification.tx_hash.toLowerCase())
              .single();
            if (existingTx) {
              return { success: false, error: 'Transaction already used for a purchase' };
            }
          }

          const entitlementToken = generateEntitlementToken();
          const platformAmount = expectedAmount * (PLATFORM_FEE_PERCENT / 100);
          const publisherAmount = expectedAmount - platformAmount;

          const { data: entitlement, error: entitlementError } = await supabase.from('entitlements').insert({
            agent_id: agentUuid,
            wallet_address: walletAddress,
            entitlement_token: entitlementToken,
            pricing_model: 'one_time',
            amount_paid: expectedAmount,
            currency: 'USDC',
            is_active: true,
            confirmation_status: 'confirmed',
          }).select().single();

          if (entitlementError) {
            return { success: false, error: 'Failed to create entitlement' };
          }

          // Record transaction for earnings tracking and replay protection
          if (verification.tx_hash) {
            await supabase.from('transactions').insert({
              entitlement_id: entitlement.id,
              tx_hash: verification.tx_hash.toLowerCase(),
              from_address: walletAddress,
              to_address: PLATFORM_WALLET.toLowerCase(),
              amount: expectedAmount,
              currency: 'USDC',
              platform_fee: platformAmount,
              publisher_amount: publisherAmount,
              status: 'confirmed',
            });
          }

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
    }
  }

  return { success: false, error: 'No valid payment proof provided' };
}

function generateEntitlementToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

export const dynamic = 'force-dynamic';
