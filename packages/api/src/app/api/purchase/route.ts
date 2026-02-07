import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase';
import { verifyPreconfirmation, usdToEth, PRECONF_VERIFICATION_DEADLINE_MS } from '@/lib/payment-verification';
import { PLATFORM_FEE_PERCENT } from '@/lib/x402';
import { z } from 'zod';
import crypto from 'crypto';

const PurchaseSchema = z.object({
  agent_id: z.string(),
  wallet_address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  tx_hash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
});

// POST /api/purchase - Purchase an agent with verified ETH payment (legacy flow)
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  const parsed = PurchaseSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.errors },
      { status: 400 }
    );
  }

  const { agent_id, wallet_address, tx_hash } = parsed.data;

  // Use regular client for reads (respects RLS)
  const supabase = createClient();
  // Use admin client for writes to protected tables
  const adminSupabase = createAdminClient();

  // Get agent details (public read allowed)
  const { data: agent, error: agentError } = await supabase
    .from('agents')
    .select('*, publisher:publishers(*)')
    .eq('agent_id', agent_id)
    .eq('is_published', true)
    .single();

  if (agentError || !agent) {
    return NextResponse.json(
      { error: 'Agent not found' },
      { status: 404 }
    );
  }

  // Check if agent is free (no payment needed)
  const pricing = agent.manifest?.pricing;
  if (!pricing || pricing.model === 'free' || pricing.amount === 0) {
    return NextResponse.json(
      { error: 'This agent is free. Use /install-agent directly.' },
      { status: 400 }
    );
  }

  // Check if already purchased by this wallet (early exit)
  const { data: existing } = await adminSupabase
    .from('entitlements')
    .select('id')
    .eq('agent_id', agent.id)
    .eq('wallet_address', wallet_address.toLowerCase())
    .eq('is_active', true)
    .single();

  if (existing) {
    return NextResponse.json(
      { error: 'Agent already purchased by this wallet' },
      { status: 409 }
    );
  }

  // Get publisher payout address
  const publisherAddress = agent.publisher?.payout_address;
  if (!publisherAddress) {
    return NextResponse.json(
      { error: 'Publisher payout address not configured' },
      { status: 500 }
    );
  }

  // Convert USD price to ETH
  const priceUsd = pricing.amount_usd || pricing.amount || 0;
  const expectedAmountWei = await usdToEth(priceUsd);

  // Verify the payment via mev-commit RPC (supports preconfirmations for instant access)
  const verification = await verifyPreconfirmation({
    txHash: tx_hash as `0x${string}`,
    expectedFrom: wallet_address,
    expectedTo: publisherAddress,
    expectedAmountWei,
    slippageBps: 500, // 5% slippage for ETH price volatility
  });

  if (!verification.valid) {
    return NextResponse.json(
      { error: `Payment verification failed: ${verification.error}` },
      { status: 402 }
    );
  }

  // Calculate fees (20% platform fee, consistent with x402 flow)
  const amountPaid = parseFloat(verification.txDetails!.valueEth);
  const platformFee = amountPaid * (PLATFORM_FEE_PERCENT / 100);
  const publisherAmount = amountPaid - platformFee;

  // Generate entitlement token
  const entitlementToken = `ent_${crypto.randomBytes(32).toString('hex')}`;

  // Determine confirmation status and set verification deadline for preconfirmed
  const isPreconfirmed = verification.status === 'preconfirmed';
  const verificationDeadline = isPreconfirmed
    ? new Date(Date.now() + PRECONF_VERIFICATION_DEADLINE_MS).toISOString()
    : null;

  // Create entitlement (using admin client to bypass RLS)
  const { data: entitlement, error: entitlementError } = await adminSupabase
    .from('entitlements')
    .insert({
      agent_id: agent.id,
      wallet_address: wallet_address.toLowerCase(),
      entitlement_token: entitlementToken,
      pricing_model: pricing.model,
      amount_paid: amountPaid,
      currency: 'ETH',
      expires_at: pricing.model === 'one_time' ? null : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      confirmation_status: verification.status,
      verification_deadline: verificationDeadline,
    })
    .select()
    .single();

  if (entitlementError) {
    console.error('Entitlement creation error:', entitlementError);
    return NextResponse.json(
      { error: 'Failed to create entitlement' },
      { status: 500 }
    );
  }

  // Record transaction (UNIQUE constraint on tx_hash provides replay protection)
  const blockNumber = verification.txDetails?.blockNumber
    ? Number(verification.txDetails.blockNumber)
    : null;
  const confirmations = verification.txDetails?.confirmations
    ? Number(verification.txDetails.confirmations)
    : 0;

  const { error: txError } = await adminSupabase.from('transactions').insert({
    entitlement_id: entitlement.id,
    tx_hash: tx_hash.toLowerCase(),
    from_address: wallet_address.toLowerCase(),
    to_address: publisherAddress.toLowerCase(),
    amount: amountPaid,
    currency: 'ETH',
    platform_fee: platformFee,
    publisher_amount: publisherAmount,
    status: isPreconfirmed ? 'pending' : 'confirmed',
    block_number: blockNumber,
    confirmations: confirmations,
  });

  if (txError) {
    // Check for unique constraint violation (replay attack)
    if (txError.code === '23505') {
      await adminSupabase.from('entitlements').delete().eq('id', entitlement.id);
      return NextResponse.json(
        { error: 'Transaction already used for a purchase' },
        { status: 409 }
      );
    }
    console.error('Transaction record error:', txError);
  }

  // Increment download count atomically
  await adminSupabase.rpc('increment_download_count', { agent_uuid: agent.id });

  return NextResponse.json({
    success: true,
    entitlement_token: entitlementToken,
    expires_at: entitlement.expires_at,
    confirmation_status: verification.status,
    payment: {
      amount_eth: amountPaid,
      tx_hash: tx_hash,
      status: isPreconfirmed ? 'preconfirmed' : 'confirmed',
      confirmations: confirmations.toString(),
    },
    install: agent.manifest?.install,
  });
}
