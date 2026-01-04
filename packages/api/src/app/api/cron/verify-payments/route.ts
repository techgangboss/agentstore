import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';
import { verifyFinalConfirmation } from '@/lib/payment-verification';

// This endpoint verifies preconfirmed payments and revokes if not confirmed within deadline
// Should be called every 15-30 seconds by Vercel Cron or external scheduler

// Verify cron secret to prevent unauthorized calls
const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(request: NextRequest) {
  // Verify authorization
  const authHeader = request.headers.get('authorization');
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const adminSupabase = createAdminClient();

  // Find all preconfirmed entitlements that are past their verification deadline
  const { data: pendingEntitlements, error: queryError } = await adminSupabase
    .from('entitlements')
    .select(`
      id,
      agent_id,
      wallet_address,
      verification_deadline,
      transactions!inner(id, tx_hash)
    `)
    .eq('confirmation_status', 'preconfirmed')
    .lt('verification_deadline', new Date().toISOString());

  if (queryError) {
    console.error('Error querying pending entitlements:', queryError);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }

  if (!pendingEntitlements || pendingEntitlements.length === 0) {
    return NextResponse.json({ message: 'No pending verifications', processed: 0 });
  }

  const results = {
    confirmed: 0,
    revoked: 0,
    stillPending: 0,
    errors: 0,
  };

  // Process each pending entitlement
  for (const entitlement of pendingEntitlements) {
    const transactions = entitlement.transactions as { id: string; tx_hash: string }[];
    const tx = transactions[0];

    if (!tx?.tx_hash) {
      console.error(`No transaction found for entitlement ${entitlement.id}`);
      results.errors++;
      continue;
    }

    try {
      const verification = await verifyFinalConfirmation(tx.tx_hash as `0x${string}`);

      if (verification.status === 'confirmed') {
        // Transaction confirmed - update entitlement and transaction
        await adminSupabase
          .from('entitlements')
          .update({
            confirmation_status: 'confirmed',
            verification_deadline: null,
          })
          .eq('id', entitlement.id);

        await adminSupabase
          .from('transactions')
          .update({
            status: 'confirmed',
            block_number: verification.blockNumber ? Number(verification.blockNumber) : null,
            confirmations: verification.confirmations ? Number(verification.confirmations) : null,
          })
          .eq('id', tx.id);

        results.confirmed++;
        console.log(`Confirmed entitlement ${entitlement.id} (tx: ${tx.tx_hash})`);

      } else if (verification.status === 'revoked') {
        // Transaction failed - revoke entitlement
        await adminSupabase
          .from('entitlements')
          .update({
            confirmation_status: 'revoked',
            is_active: false,
            verification_deadline: null,
          })
          .eq('id', entitlement.id);

        await adminSupabase
          .from('transactions')
          .update({ status: 'failed' })
          .eq('id', tx.id);

        // Decrement download count since purchase is revoked
        await adminSupabase.rpc('decrement_download_count', { agent_uuid: entitlement.agent_id });

        results.revoked++;
        console.log(`Revoked entitlement ${entitlement.id} (tx: ${tx.tx_hash}) - transaction failed`);

      } else {
        // Still preconfirmed but past deadline - force revoke
        // mev-commit preconfirmations should confirm within seconds,
        // so 60s past deadline means something went wrong
        await adminSupabase
          .from('entitlements')
          .update({
            confirmation_status: 'revoked',
            is_active: false,
            verification_deadline: null,
          })
          .eq('id', entitlement.id);

        await adminSupabase
          .from('transactions')
          .update({ status: 'failed' })
          .eq('id', tx.id);

        await adminSupabase.rpc('decrement_download_count', { agent_uuid: entitlement.agent_id });

        results.revoked++;
        console.log(`Revoked entitlement ${entitlement.id} (tx: ${tx.tx_hash}) - deadline exceeded`);
      }
    } catch (error) {
      console.error(`Error verifying entitlement ${entitlement.id}:`, error);
      results.errors++;
    }
  }

  return NextResponse.json({
    message: 'Verification complete',
    processed: pendingEntitlements.length,
    results,
  });
}

// Also support POST for flexibility
export { GET as POST };
