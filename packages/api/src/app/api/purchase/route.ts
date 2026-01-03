import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';
import { z } from 'zod';
import crypto from 'crypto';

const PurchaseSchema = z.object({
  agent_id: z.string(),
  wallet_address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  payment_proof: z.object({
    tx_hash: z.string(),
    signature: z.string(),
  }),
});

// POST /api/purchase - Purchase an agent
export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = PurchaseSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.errors },
      { status: 400 }
    );
  }

  const { agent_id, wallet_address, payment_proof } = parsed.data;

  const supabase = createClient();

  // Get agent details
  const { data: agent, error: agentError } = await supabase
    .from('agents')
    .select('*, publisher:publishers(*)')
    .eq('agent_id', agent_id)
    .single();

  if (agentError || !agent) {
    return NextResponse.json(
      { error: 'Agent not found' },
      { status: 404 }
    );
  }

  // Check if already purchased
  const { data: existing } = await supabase
    .from('entitlements')
    .select('id')
    .eq('agent_id', agent.id)
    .eq('wallet_address', wallet_address)
    .eq('is_active', true)
    .single();

  if (existing) {
    return NextResponse.json(
      { error: 'Agent already purchased' },
      { status: 409 }
    );
  }

  // TODO: Verify x402 payment proof on-chain
  // For now, we trust the payment_proof

  const pricing = agent.manifest.pricing;
  const amount = pricing.amount;
  const platformFee = amount * 0.1; // 10% platform fee
  const publisherAmount = amount - platformFee;

  // Generate entitlement token
  const entitlementToken = `ent_${crypto.randomBytes(32).toString('hex')}`;

  // Create entitlement
  const { data: entitlement, error: entitlementError } = await supabase
    .from('entitlements')
    .insert({
      agent_id: agent.id,
      wallet_address,
      entitlement_token: entitlementToken,
      pricing_model: pricing.model,
      amount_paid: amount,
      expires_at: pricing.billing === 'one_time' ? null : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days for per_call
    })
    .select()
    .single();

  if (entitlementError) {
    return NextResponse.json(
      { error: 'Failed to create entitlement' },
      { status: 500 }
    );
  }

  // Record transaction
  await supabase.from('transactions').insert({
    entitlement_id: entitlement.id,
    tx_hash: payment_proof.tx_hash,
    from_address: wallet_address,
    to_address: agent.publisher.payout_address,
    amount,
    platform_fee: platformFee,
    publisher_amount: publisherAmount,
    status: 'confirmed', // TODO: Actually verify
  });

  // Increment download count
  await supabase
    .from('agents')
    .update({ download_count: agent.download_count + 1 })
    .eq('id', agent.id);

  return NextResponse.json({
    success: true,
    entitlement_token: entitlementToken,
    expires_at: entitlement.expires_at,
    install: agent.manifest.install,
  });
}
