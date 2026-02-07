import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';
import { createClient } from '@supabase/supabase-js';
import { verifyApiKey } from '@/lib/api-key';

export const dynamic = 'force-dynamic';

const EARN_POOL_PERCENT = 10;

async function getAuthUser(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.substring(7);
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!
  );

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  return user;
}

async function getPublisher(request: NextRequest) {
  const adminSupabase = createAdminClient();

  // API key auth
  const apiKeyPublisher = await verifyApiKey(request);
  if (apiKeyPublisher) {
    const { data } = await adminSupabase
      .from('publishers')
      .select('id, publisher_id, display_name, payout_address')
      .eq('id', apiKeyPublisher.id)
      .single();
    return data;
  }

  // Wallet signature auth
  const walletAddress = request.headers.get('X-Wallet-Address');
  const walletSignature = request.headers.get('X-Wallet-Signature');
  if (walletAddress && walletSignature) {
    const { data: publisher } = await adminSupabase
      .from('publishers')
      .select('id, publisher_id, display_name, payout_address')
      .ilike('payout_address', walletAddress)
      .single();

    if (!publisher) return null;

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

  // Bearer token auth
  const user = await getAuthUser(request);
  if (!user) return null;

  const { data } = await adminSupabase
    .from('publishers')
    .select('id, publisher_id, display_name, payout_address')
    .eq('auth_user_id', user.id)
    .single();

  return data;
}

export async function GET(request: NextRequest) {
  const publisher = await getPublisher(request);
  if (!publisher) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const adminSupabase = createAdminClient();

  // Current month boundaries
  const now = new Date();
  const currentMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const currentMonthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  // Fetch in parallel: current month live stats, historical shares, this publisher's agents
  const [agentsResult, currentTxResult, sharesResult] = await Promise.all([
    adminSupabase
      .from('agents')
      .select('id')
      .eq('publisher_id', publisher.id),

    // All confirmed transactions this month (need totals for share calculation)
    adminSupabase
      .from('transactions')
      .select(`
        platform_fee,
        entitlements!inner(
          agent_id,
          agents!inner(publisher_id)
        )
      `)
      .eq('status', 'confirmed')
      .gte('created_at', currentMonthStart.toISOString())
      .lt('created_at', currentMonthEnd.toISOString()),

    // Last 12 months of finalized shares for this publisher
    adminSupabase
      .from('earn_distribution_shares')
      .select(`
        share_percent, earn_amount, rank, payout_status, payout_tx_hash,
        earn_distributions!inner(period_start, period_end, earn_pool, total_platform_fees)
      `)
      .eq('publisher_id', publisher.id)
      .order('created_at', { ascending: false })
      .limit(12),
  ]);

  const agentIds = new Set((agentsResult.data || []).map((a: any) => a.id));

  // Compute current month stats
  let myPlatformFees = 0;
  let totalPlatformFees = 0;

  for (const tx of currentTxResult.data || []) {
    const fee = parseFloat(String(tx.platform_fee)) || 0;
    totalPlatformFees += fee;
    const ent = tx.entitlements as any;
    if (ent?.agents?.publisher_id === publisher.id) {
      myPlatformFees += fee;
    }
  }

  const totalMicro = Math.round(totalPlatformFees * 1_000_000);
  const myMicro = Math.round(myPlatformFees * 1_000_000);
  const poolMicro = Math.round(totalMicro * EARN_POOL_PERCENT / 100);
  const mySharePercent = totalMicro > 0 ? (myMicro / totalMicro) * 100 : 0;
  const myEstimatedEarn = totalMicro > 0 ? Math.round(poolMicro * myMicro / totalMicro) / 1_000_000 : 0;

  // Compute current rank
  const pubFeeMap = new Map<string, number>();
  for (const tx of currentTxResult.data || []) {
    const ent = tx.entitlements as any;
    const pubId = ent?.agents?.publisher_id;
    if (!pubId) continue;
    const fee = parseFloat(String(tx.platform_fee)) || 0;
    pubFeeMap.set(pubId, (pubFeeMap.get(pubId) || 0) + fee);
  }

  const ranked = Array.from(pubFeeMap.entries())
    .sort((a, b) => b[1] - a[1]);
  const myRank = ranked.findIndex(([id]) => id === publisher.id) + 1;

  // Format history
  const history = (sharesResult.data || []).map((s: any) => {
    const dist = s.earn_distributions as any;
    return {
      period_start: dist?.period_start,
      period_end: dist?.period_end,
      rank: s.rank,
      share_percent: s.share_percent,
      earn_amount: s.earn_amount,
      payout_status: s.payout_status,
      payout_tx_hash: s.payout_tx_hash,
    };
  });

  const totalEarned = history.reduce((sum: number, h: any) => sum + (parseFloat(h.earn_amount) || 0), 0);

  return NextResponse.json({
    current_month: {
      period_start: currentMonthStart.toISOString(),
      period_end: currentMonthEnd.toISOString(),
      rank: myRank || null,
      total_publishers: ranked.length,
      my_platform_fees: myMicro / 1_000_000,
      share_percent: Math.round(mySharePercent * 100) / 100,
      estimated_earn: myEstimatedEarn,
      total_earn_pool: poolMicro / 1_000_000,
    },
    history,
    total_earned: Math.round(totalEarned * 1_000_000) / 1_000_000,
  });
}
