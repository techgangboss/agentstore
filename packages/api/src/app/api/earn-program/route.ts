import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const EARN_POOL_PERCENT = 10;

export async function GET() {
  const adminSupabase = createAdminClient();

  // Current month boundaries for live leaderboard
  const now = new Date();
  const currentMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const currentMonthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  // Fetch live leaderboard (current month transactions) and last finalized distribution in parallel
  const [liveResult, lastDistResult] = await Promise.all([
    // Live: aggregate confirmed transactions this month by publisher
    adminSupabase
      .from('transactions')
      .select(`
        platform_fee,
        entitlements!inner(
          agent_id,
          agents!inner(
            publisher_id,
            publishers!inner(id, display_name)
          )
        )
      `)
      .eq('status', 'confirmed')
      .gte('created_at', currentMonthStart.toISOString())
      .lt('created_at', currentMonthEnd.toISOString()),

    // Last finalized distribution
    adminSupabase
      .from('earn_distributions')
      .select(`
        id, period_start, period_end, total_platform_fees, earn_pool, status,
        earn_distribution_shares(
          publisher_id, share_percent, earn_amount, rank, payout_status,
          publishers:publisher_id(display_name)
        )
      `)
      .order('period_start', { ascending: false })
      .limit(1)
      .single(),
  ]);

  // Build live leaderboard
  const feeMap = new Map<string, { display_name: string; total_platform_fee: number }>();
  for (const tx of liveResult.data || []) {
    const ent = tx.entitlements as any;
    const pub = ent?.agents?.publishers;
    if (!pub?.id) continue;

    const entry = feeMap.get(pub.id) || { display_name: pub.display_name || 'Unknown', total_platform_fee: 0 };
    entry.total_platform_fee += parseFloat(String(tx.platform_fee)) || 0;
    feeMap.set(pub.id, entry);
  }

  const liveEntries = Array.from(feeMap.entries())
    .map(([publisher_id, v]) => ({ publisher_id, ...v }))
    .sort((a, b) => b.total_platform_fee - a.total_platform_fee);

  const liveTotalFeesMicro = liveEntries.reduce((sum, e) => sum + Math.round(e.total_platform_fee * 1_000_000), 0);
  const liveEarnPoolMicro = Math.round(liveTotalFeesMicro * EARN_POOL_PERCENT / 100);

  const liveLeaderboard = liveEntries.slice(0, 20).map((entry, index) => {
    const feeMicro = Math.round(entry.total_platform_fee * 1_000_000);
    const sharePercent = liveTotalFeesMicro > 0 ? (feeMicro / liveTotalFeesMicro) * 100 : 0;
    const estimatedEarnMicro = liveTotalFeesMicro > 0 ? Math.round(liveEarnPoolMicro * feeMicro / liveTotalFeesMicro) : 0;

    return {
      rank: index + 1,
      display_name: entry.display_name,
      share_percent: Math.round(sharePercent * 100) / 100,
      estimated_earn: estimatedEarnMicro / 1_000_000,
    };
  });

  // Format last distribution
  let lastDistribution = null;
  if (lastDistResult.data && !lastDistResult.error) {
    const dist = lastDistResult.data;
    const shares = (dist.earn_distribution_shares as any[]) || [];
    lastDistribution = {
      period_start: dist.period_start,
      period_end: dist.period_end,
      total_platform_fees: dist.total_platform_fees,
      earn_pool: dist.earn_pool,
      status: dist.status,
      top_publishers: shares
        .sort((a: any, b: any) => a.rank - b.rank)
        .slice(0, 20)
        .map((s: any) => ({
          rank: s.rank,
          display_name: (s.publishers as any)?.display_name || 'Unknown',
          share_percent: s.share_percent,
          earn_amount: s.earn_amount,
          payout_status: s.payout_status,
        })),
    };
  }

  return NextResponse.json({
    program: {
      name: 'Publisher Earn Program',
      description: '10% of platform fees are pooled monthly and distributed to publishers proportional to their sales contribution.',
      earn_pool_percent: EARN_POOL_PERCENT,
    },
    current_month: {
      period_start: currentMonthStart.toISOString(),
      period_end: currentMonthEnd.toISOString(),
      total_platform_fees: liveTotalFeesMicro / 1_000_000,
      estimated_earn_pool: liveEarnPoolMicro / 1_000_000,
      leaderboard: liveLeaderboard,
    },
    last_distribution: lastDistribution,
  });
}
