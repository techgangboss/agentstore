import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase';
import { verifyPayment, isTransactionUsed, usdToEth } from '@/lib/payment-verification';
import { z } from 'zod';
import crypto from 'crypto';

const PurchaseSchema = z.object({
  agent_id: z.string(),
  wallet_address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  tx_hash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
});

// POST /api/purchase - Purchase an agent with verified ETH payment
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

  // Check if transaction already used (replay protection)
  const txUsed = await isTransactionUsed(adminSupabase, tx_hash);
  if (txUsed) {
    return NextResponse.json(
      { error: 'Transaction already used for a purchase' },
      { status: 409 }
    );
  }

  // Check if already purchased by this wallet
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

  // Verify the payment on-chain via mev-commit RPC
  const verification = await verifyPayment({
    txHash: tx_hash as `0x${string}`,
    expectedFrom: wallet_address,
    expectedTo: publisherAddress,
    expectedAmountWei,
    slippageBps: 500, // 5% slippage for ETH price volatility
  });

  if (!verification.valid) {
    return NextResponse.json(
      { error: `Payment verification failed: ${verification.error}` },
      { status: 402 } // Payment Required
    );
  }

  // Calculate fees (10% platform fee)
  const amountPaid = parseFloat(verification.txDetails!.valueEth);
  const platformFee = amountPaid * 0.1;
  const publisherAmount = amountPaid - platformFee;

  // Generate entitlement token
  const entitlementToken = `ent_${crypto.randomBytes(32).toString('hex')}`;

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

  // Record transaction (using admin client to bypass RLS)
  const { error: txError } = await adminSupabase.from('transactions').insert({
    entitlement_id: entitlement.id,
    tx_hash: tx_hash.toLowerCase(),
    from_address: wallet_address.toLowerCase(),
    to_address: publisherAddress.toLowerCase(),
    amount: amountPaid,
    currency: 'ETH',
    platform_fee: platformFee,
    publisher_amount: publisherAmount,
    status: 'confirmed',
  });

  if (txError) {
    console.error('Transaction record error:', txError);
    // Don't fail the purchase, just log it
  }

  // Increment download count
  await adminSupabase
    .from('agents')
    .update({ download_count: (agent.download_count || 0) + 1 })
    .eq('id', agent.id);

  return NextResponse.json({
    success: true,
    entitlement_token: entitlementToken,
    expires_at: entitlement.expires_at,
    payment: {
      amount_eth: amountPaid,
      tx_hash: tx_hash,
      confirmations: verification.txDetails!.confirmations.toString(),
    },
    install: agent.manifest?.install,
  });
}
