import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';
import { createClient } from '@supabase/supabase-js';
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

// GET /api/publishers/me - Get current publisher profile
export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const adminSupabase = createAdminClient();

  const { data: publisher, error } = await adminSupabase
    .from('publishers')
    .select('id, publisher_id, display_name, email, payout_address, support_url, created_at, updated_at')
    .eq('auth_user_id', user.id)
    .single();

  if (error || !publisher) {
    return NextResponse.json({ error: 'Publisher not found' }, { status: 404 });
  }

  // Get agent count
  const { count: agentCount } = await adminSupabase
    .from('agents')
    .select('id', { count: 'exact', head: true })
    .eq('publisher_id', publisher.id);

  // TODO: Get sales/earnings from transactions when implemented

  return NextResponse.json({
    publisher: {
      ...publisher,
      stats: {
        total_agents: agentCount || 0,
        total_sales: 0,
        total_earnings: 0,
        monthly_earnings: 0,
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
  const user = await getAuthUser(request);
  if (!user) {
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
    .eq('auth_user_id', user.id)
    .select('id, publisher_id, display_name, email, payout_address, support_url, created_at, updated_at')
    .single();

  if (error) {
    console.error('Publisher update error:', error);
    return NextResponse.json({ error: 'Failed to update publisher' }, { status: 500 });
  }

  return NextResponse.json({ success: true, publisher });
}
