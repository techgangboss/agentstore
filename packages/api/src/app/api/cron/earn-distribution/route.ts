import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';
import crypto from 'crypto';

// Monthly earn distribution: 10% of platform fees pooled and distributed to publishers
// Runs 1st of each month at 01:00 UTC via Vercel Cron

const CRON_SECRET = process.env.CRON_SECRET;
const EARN_POOL_PERCENT = 10; // 10% of platform fees go to earn pool

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!CRON_SECRET || !authHeader || !timingSafeEqual(authHeader, `Bearer ${CRON_SECRET}`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const adminSupabase = createAdminClient();

  // Compute previous month boundaries
  const now = new Date();
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)); // 1st of current month
  const periodStart = new Date(Date.UTC(periodEnd.getUTCFullYear(), periodEnd.getUTCMonth() - 1, 1)); // 1st of previous month

  // Idempotency: skip if this period already computed
  const { data: existing } = await adminSupabase
    .from('earn_distributions')
    .select('id')
    .eq('period_start', periodStart.toISOString())
    .single();

  if (existing) {
    return NextResponse.json({ message: 'Distribution already computed for this period', period_start: periodStart.toISOString() });
  }

  // Aggregate confirmed transactions from previous month, grouped by publisher
  // Chain: transactions -> entitlements -> agents -> publishers
  const { data: rows, error: queryError } = await adminSupabase.rpc('aggregate_earn_fees', {
    p_start: periodStart.toISOString(),
    p_end: periodEnd.toISOString(),
  });

  // If the RPC doesn't exist, fall back to raw SQL
  let publisherFees: { publisher_id: string; display_name: string; payout_address: string; total_platform_fee: number }[];

  if (queryError || !rows) {
    // Fallback: use raw query via supabase
    const { data: sqlRows, error: sqlError } = await adminSupabase
      .from('transactions')
      .select(`
        platform_fee,
        entitlements!inner(
          agent_id,
          agents!inner(
            publisher_id,
            publishers!inner(id, display_name, payout_address)
          )
        )
      `)
      .eq('status', 'confirmed')
      .gte('created_at', periodStart.toISOString())
      .lt('created_at', periodEnd.toISOString());

    if (sqlError) {
      console.error('Error querying transactions for earn distribution:', sqlError);
      return NextResponse.json({ error: 'Query failed' }, { status: 500 });
    }

    // Aggregate by publisher
    const feeMap = new Map<string, { display_name: string; payout_address: string; total: number }>();
    for (const tx of sqlRows || []) {
      const ent = tx.entitlements as any;
      const agent = ent?.agents;
      const pub = agent?.publishers;
      if (!pub?.id) continue;

      const entry = feeMap.get(pub.id) || { display_name: pub.display_name || '', payout_address: pub.payout_address || '', total: 0 };
      entry.total += parseFloat(String(tx.platform_fee)) || 0;
      feeMap.set(pub.id, entry);
    }

    publisherFees = Array.from(feeMap.entries()).map(([publisher_id, v]) => ({
      publisher_id,
      display_name: v.display_name,
      payout_address: v.payout_address,
      total_platform_fee: v.total,
    }));
  } else {
    publisherFees = rows;
  }

  if (publisherFees.length === 0) {
    // No transactions in this period — still record the distribution with zero pool
    const { error: insertErr } = await adminSupabase
      .from('earn_distributions')
      .insert({
        period_start: periodStart.toISOString(),
        period_end: periodEnd.toISOString(),
        total_platform_fees: 0,
        earn_pool: 0,
        status: 'computed',
      });

    if (insertErr) {
      console.error('Error inserting empty earn distribution:', insertErr);
      return NextResponse.json({ error: 'Insert failed' }, { status: 500 });
    }

    return NextResponse.json({ message: 'No transactions in period', period_start: periodStart.toISOString(), publishers: 0 });
  }

  // Calculate totals using integer microdollar arithmetic
  const totalPlatformFeesMicro = publisherFees.reduce((sum, p) => sum + Math.round(p.total_platform_fee * 1_000_000), 0);
  const earnPoolMicro = Math.round(totalPlatformFeesMicro * EARN_POOL_PERCENT / 100);

  const totalPlatformFees = totalPlatformFeesMicro / 1_000_000;
  const earnPool = earnPoolMicro / 1_000_000;

  // Sort by contribution descending and assign ranks
  publisherFees.sort((a, b) => b.total_platform_fee - a.total_platform_fee);

  // Insert distribution record
  const { data: distribution, error: distErr } = await adminSupabase
    .from('earn_distributions')
    .insert({
      period_start: periodStart.toISOString(),
      period_end: periodEnd.toISOString(),
      total_platform_fees: totalPlatformFees,
      earn_pool: earnPool,
      status: 'computed',
    })
    .select('id')
    .single();

  if (distErr || !distribution) {
    console.error('Error inserting earn distribution:', distErr);
    return NextResponse.json({ error: 'Distribution insert failed' }, { status: 500 });
  }

  // Insert share rows
  const shares = publisherFees.map((p, index) => {
    const pubFeeMicro = Math.round(p.total_platform_fee * 1_000_000);
    const sharePercent = totalPlatformFeesMicro > 0 ? (pubFeeMicro / totalPlatformFeesMicro) * 100 : 0;
    const earnAmountMicro = totalPlatformFeesMicro > 0 ? Math.round(earnPoolMicro * pubFeeMicro / totalPlatformFeesMicro) : 0;

    return {
      distribution_id: distribution.id,
      publisher_id: p.publisher_id,
      publisher_platform_fees: pubFeeMicro / 1_000_000,
      share_percent: Math.round(sharePercent * 100) / 100, // 2 decimal places
      earn_amount: earnAmountMicro / 1_000_000,
      rank: index + 1,
      payout_address: p.payout_address,
      payout_status: 'pending',
    };
  });

  const { error: sharesErr } = await adminSupabase
    .from('earn_distribution_shares')
    .insert(shares);

  if (sharesErr) {
    console.error('Error inserting earn distribution shares:', sharesErr);
    return NextResponse.json({ error: 'Shares insert failed' }, { status: 500 });
  }

  console.log(`Earn distribution computed: pool=$${earnPool} from $${totalPlatformFees} platform fees, ${publisherFees.length} publishers`);

  return NextResponse.json({
    message: 'Earn distribution computed',
    period_start: periodStart.toISOString(),
    period_end: periodEnd.toISOString(),
    total_platform_fees: totalPlatformFees,
    earn_pool: earnPool,
    publishers: publisherFees.length,
    distribution_id: distribution.id,
  });
}

export { GET as POST };
