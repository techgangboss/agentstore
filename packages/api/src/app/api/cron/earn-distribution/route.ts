import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';
import { PLATFORM_WALLET, USDC_ADDRESS, USDC_DECIMALS } from '@/lib/x402';
import { createPublicClient, http, parseAbi } from 'viem';
import { mainnet } from 'viem/chains';
import crypto from 'crypto';

// Monthly earn distribution: 10% of platform fees pooled and distributed to publishers
// Runs 1st of each month at 01:00 UTC via Vercel Cron
// Also checks on-chain for manual payouts on every run

const CRON_SECRET = process.env.CRON_SECRET;
const EARN_POOL_PERCENT = 10; // 10% of platform fees go to earn pool
const MEV_COMMIT_RPC = 'https://fastrpc.mev-commit.xyz';

const publicClient = createPublicClient({
  chain: mainnet,
  transport: http(MEV_COMMIT_RPC),
});

const USDC_TRANSFER_ABI = parseAbi([
  'event Transfer(address indexed from, address indexed to, uint256 value)',
]);

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * Check on-chain for USDC transfers from PLATFORM_WALLET to pending payout addresses.
 * Scans recent blocks for Transfer events matching pending earn shares.
 */
async function checkPendingPayouts(adminSupabase: ReturnType<typeof createAdminClient>) {
  // Fetch all pending shares with their distribution created_at for time-bounding
  const { data: pendingShares, error } = await adminSupabase
    .from('earn_distribution_shares')
    .select('id, payout_address, earn_amount, created_at, distribution_id')
    .eq('payout_status', 'pending')
    .gt('earn_amount', 0);

  if (error || !pendingShares || pendingShares.length === 0) {
    return { checked: 0, confirmed: 0 };
  }

  // Group by payout_address for efficient log querying
  // We'll scan from the earliest pending share's creation block
  const earliestCreated = pendingShares.reduce((min, s) => {
    const t = new Date(s.created_at).getTime();
    return t < min ? t : min;
  }, Date.now());

  // Estimate start block: ~12s per block on mainnet
  const secondsAgo = Math.ceil((Date.now() - earliestCreated) / 1000) + 3600; // +1hr buffer
  const currentBlock = await publicClient.getBlockNumber();
  const blocksAgo = BigInt(Math.ceil(secondsAgo / 12));
  const fromBlock = currentBlock > blocksAgo ? currentBlock - blocksAgo : BigInt(0);

  // Query USDC Transfer events FROM platform wallet
  let logs;
  try {
    logs = await publicClient.getLogs({
      address: USDC_ADDRESS,
      event: USDC_TRANSFER_ABI[0],
      args: {
        from: PLATFORM_WALLET as `0x${string}`,
      },
      fromBlock,
      toBlock: 'latest',
    });
  } catch (err) {
    console.error('Error fetching USDC transfer logs:', err);
    return { checked: pendingShares.length, confirmed: 0, error: 'Log query failed' };
  }

  if (!logs || logs.length === 0) {
    return { checked: pendingShares.length, confirmed: 0 };
  }

  // Build a lookup: lowercase(payout_address) -> list of pending shares
  const addressMap = new Map<string, typeof pendingShares>();
  for (const share of pendingShares) {
    if (!share.payout_address) continue;
    const addr = share.payout_address.toLowerCase();
    const list = addressMap.get(addr) || [];
    list.push(share);
    addressMap.set(addr, list);
  }

  let confirmed = 0;

  for (const log of logs) {
    const to = (log.args.to as string)?.toLowerCase();
    const value = log.args.value as bigint;
    if (!to || !value) continue;

    const shares = addressMap.get(to);
    if (!shares) continue;

    // Convert on-chain value (USDC has 6 decimals) to dollars
    const transferAmount = Number(value) / (10 ** USDC_DECIMALS);

    // Find matching pending share (within 1 cent tolerance for rounding)
    for (let i = 0; i < shares.length; i++) {
      const share = shares[i];
      const earnAmount = parseFloat(String(share.earn_amount));
      if (Math.abs(transferAmount - earnAmount) <= 0.01) {
        // Match found — mark as paid
        const txHash = log.transactionHash;
        const { error: updateErr } = await adminSupabase
          .from('earn_distribution_shares')
          .update({ payout_status: 'paid', payout_tx_hash: txHash })
          .eq('id', share.id);

        if (!updateErr) {
          confirmed++;
          console.log(`Earn payout confirmed: ${share.payout_address} received $${earnAmount} (tx: ${txHash})`);
          // Remove from list to avoid double-matching
          shares.splice(i, 1);

          // Check if all shares for this distribution are now paid
          await maybeMarkDistributionPaid(adminSupabase, share.distribution_id);
        }
        break;
      }
    }
  }

  return { checked: pendingShares.length, confirmed };
}

/**
 * If all shares in a distribution are paid, mark the distribution as 'paid'.
 */
async function maybeMarkDistributionPaid(
  adminSupabase: ReturnType<typeof createAdminClient>,
  distributionId: string
) {
  const { data: remaining } = await adminSupabase
    .from('earn_distribution_shares')
    .select('id')
    .eq('distribution_id', distributionId)
    .eq('payout_status', 'pending')
    .gt('earn_amount', 0)
    .limit(1);

  if (!remaining || remaining.length === 0) {
    await adminSupabase
      .from('earn_distributions')
      .update({ status: 'paid' })
      .eq('id', distributionId);
    console.log(`Distribution ${distributionId} fully paid`);
  }
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!CRON_SECRET || !authHeader || !timingSafeEqual(authHeader, `Bearer ${CRON_SECRET}`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const adminSupabase = createAdminClient();

  // --- Phase 1: Check pending payouts on-chain (runs every invocation) ---
  const payoutResults = await checkPendingPayouts(adminSupabase);

  // --- Phase 2: Compute new distribution if needed (monthly) ---
  const now = new Date();
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const periodStart = new Date(Date.UTC(periodEnd.getUTCFullYear(), periodEnd.getUTCMonth() - 1, 1));

  // Idempotency: skip if this period already computed
  const { data: existing } = await adminSupabase
    .from('earn_distributions')
    .select('id')
    .eq('period_start', periodStart.toISOString())
    .single();

  if (existing) {
    return NextResponse.json({
      message: 'Distribution already computed for this period',
      period_start: periodStart.toISOString(),
      payout_check: payoutResults,
    });
  }

  // Aggregate confirmed transactions from previous month, grouped by publisher
  const { data: rows, error: queryError } = await adminSupabase.rpc('aggregate_earn_fees', {
    p_start: periodStart.toISOString(),
    p_end: periodEnd.toISOString(),
  });

  let publisherFees: { publisher_id: string; display_name: string; payout_address: string; total_platform_fee: number }[];

  if (queryError || !rows) {
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
      return NextResponse.json({ error: 'Query failed', payout_check: payoutResults }, { status: 500 });
    }

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

    return NextResponse.json({
      message: 'No transactions in period',
      period_start: periodStart.toISOString(),
      publishers: 0,
      payout_check: payoutResults,
    });
  }

  // Calculate totals using integer microdollar arithmetic
  const totalPlatformFeesMicro = publisherFees.reduce((sum, p) => sum + Math.round(p.total_platform_fee * 1_000_000), 0);
  const earnPoolMicro = Math.round(totalPlatformFeesMicro * EARN_POOL_PERCENT / 100);

  const totalPlatformFees = totalPlatformFeesMicro / 1_000_000;
  const earnPool = earnPoolMicro / 1_000_000;

  publisherFees.sort((a, b) => b.total_platform_fee - a.total_platform_fee);

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

  const shares = publisherFees.map((p, index) => {
    const pubFeeMicro = Math.round(p.total_platform_fee * 1_000_000);
    const sharePercent = totalPlatformFeesMicro > 0 ? (pubFeeMicro / totalPlatformFeesMicro) * 100 : 0;
    const earnAmountMicro = totalPlatformFeesMicro > 0 ? Math.round(earnPoolMicro * pubFeeMicro / totalPlatformFeesMicro) : 0;

    return {
      distribution_id: distribution.id,
      publisher_id: p.publisher_id,
      publisher_platform_fees: pubFeeMicro / 1_000_000,
      share_percent: Math.round(sharePercent * 100) / 100,
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
    payout_check: payoutResults,
  });
}

export { GET as POST };
