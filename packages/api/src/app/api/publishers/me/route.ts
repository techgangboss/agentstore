import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';
import { createClient } from '@supabase/supabase-js';
import { verifyApiKey } from '@/lib/api-key';
import { z } from 'zod';

// Validate Ethereum address format
function isValidEthAddress(address: string | undefined): boolean {
  if (!address) return false;
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

async function getAuthUser(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!
  );

  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    return null;
  }

  return user;
}

const PUBLISHER_SELECT = 'id, publisher_id, display_name, email, payout_address, support_url, created_at, updated_at';

/**
 * Resolve publisher from X-API-Key, wallet signature headers, or Bearer token.
 */
async function getPublisher(request: NextRequest) {
  const adminSupabase = createAdminClient();

  // 1. API key
  const apiKeyPublisher = await verifyApiKey(request);
  if (apiKeyPublisher) {
    const { data: publisher } = await adminSupabase
      .from('publishers')
      .select(PUBLISHER_SELECT)
      .eq('id', apiKeyPublisher.id)
      .single();
    return publisher;
  }

  // 2. Wallet signature (X-Wallet-Address + X-Wallet-Signature)
  const walletAddress = request.headers.get('X-Wallet-Address');
  const walletSignature = request.headers.get('X-Wallet-Signature');
  if (walletAddress && walletSignature) {
    const { data: publisher } = await adminSupabase
      .from('publishers')
      .select(PUBLISHER_SELECT)
      .ilike('payout_address', walletAddress)
      .single();

    if (!publisher) return null;

    // Verify signature: "AgentStore publisher: {publisher_id}"
    const expectedMessage = `AgentStore publisher: ${publisher.publisher_id}`;
    try {
      const { verifyMessage } = await import('viem');
      const isValid = await verifyMessage({
        address: walletAddress as `0x${string}`,
        message: expectedMessage,
        signature: walletSignature as `0x${string}`,
      });
      if (!isValid) return null;
    } catch {
      return null;
    }

    return publisher;
  }

  // 3. Bearer token (web dashboard)
  const user = await getAuthUser(request);
  if (!user) return null;

  const { data: publisher } = await adminSupabase
    .from('publishers')
    .select(PUBLISHER_SELECT)
    .eq('auth_user_id', user.id)
    .single();

  return publisher;
}

// GET /api/publishers/me - Get current publisher profile with real stats
export async function GET(request: NextRequest) {
  const publisher = await getPublisher(request);
  if (!publisher) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const adminSupabase = createAdminClient();

  // Get agent count and IDs
  const { data: agents } = await adminSupabase
    .from('agents')
    .select('id')
    .eq('publisher_id', publisher.id);

  const agentCount = agents?.length || 0;
  const agentIds = agents?.map(a => a.id) || [];

  let totalSales = 0;
  let totalEarnings = 0;
  let monthlyEarnings = 0;

  if (agentIds.length > 0) {
    // Get sales count and earnings from transactions via entitlements
    const { data: entitlements } = await adminSupabase
      .from('entitlements')
      .select('id')
      .in('agent_id', agentIds)
      .eq('is_active', true)
      .neq('confirmation_status', 'revoked');

    totalSales = entitlements?.length || 0;

    if (totalSales > 0) {
      const entitlementIds = entitlements!.map(e => e.id);

      // Total confirmed earnings
      const { data: txTotals } = await adminSupabase
        .from('transactions')
        .select('publisher_amount, status, created_at')
        .in('entitlement_id', entitlementIds)
        .in('status', ['confirmed', 'pending']);

      if (txTotals) {
        totalEarnings = txTotals.reduce(
          (sum, tx) => sum + (parseFloat(tx.publisher_amount) || 0),
          0
        );

        // Monthly earnings (last 30 days)
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        monthlyEarnings = txTotals
          .filter(tx => tx.created_at >= thirtyDaysAgo)
          .reduce((sum, tx) => sum + (parseFloat(tx.publisher_amount) || 0), 0);
      }
    }
  }

  return NextResponse.json({
    publisher: {
      ...publisher,
      stats: {
        total_agents: agentCount,
        total_sales: totalSales,
        total_earnings: totalEarnings,
        monthly_earnings: monthlyEarnings,
      },
    },
  });
}

const UpdatePublisherSchema = z.object({
  display_name: z.string().min(1).max(100).optional(),
  payout_address: z.string().optional(),
  support_url: z.string().url().optional().or(z.literal('')),
});

// PATCH /api/publishers/me - Update current publisher profile
export async function PATCH(request: NextRequest) {
  const currentPublisher = await getPublisher(request);
  if (!currentPublisher) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = UpdatePublisherSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.errors },
      { status: 400 }
    );
  }

  const updates: Record<string, any> = {};

  if (parsed.data.display_name) {
    updates.display_name = parsed.data.display_name;
  }

  if (parsed.data.payout_address !== undefined) {
    if (parsed.data.payout_address && !isValidEthAddress(parsed.data.payout_address)) {
      return NextResponse.json({ error: 'Invalid Ethereum address' }, { status: 400 });
    }
    updates.payout_address = parsed.data.payout_address.toLowerCase();
  }

  if (parsed.data.support_url !== undefined) {
    updates.support_url = parsed.data.support_url || null;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
  }

  const adminSupabase = createAdminClient();

  const { data: publisher, error } = await adminSupabase
    .from('publishers')
    .update(updates)
    .eq('id', currentPublisher.id)
    .select('id, publisher_id, display_name, email, payout_address, support_url, created_at, updated_at')
    .single();

  if (error) {
    console.error('Publisher update error:', error);
    return NextResponse.json({ error: 'Failed to update publisher' }, { status: 500 });
  }

  return NextResponse.json({ success: true, publisher });
}
