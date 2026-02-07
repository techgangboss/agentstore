import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';
import crypto from 'crypto';

// Admin secret for verification endpoints
const ADMIN_SECRET = process.env.ADMIN_SECRET;

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * POST /api/admin/publishers/[publisher_id]/verify
 *
 * Toggle publisher verification status.
 * Requires X-Admin-Secret header.
 *
 * Body: { verified: boolean }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { publisher_id: string } }
) {
  // Check admin authorization (timing-safe comparison)
  const adminSecret = request.headers.get('X-Admin-Secret');

  if (!ADMIN_SECRET || !adminSecret || !timingSafeEqual(adminSecret, ADMIN_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { publisher_id } = params;

  let body: { verified?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (typeof body.verified !== 'boolean') {
    return NextResponse.json(
      { error: 'verified field must be a boolean' },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();

  // Update verification status
  const { data, error } = await supabase
    .from('publishers')
    .update({ is_verified: body.verified })
    .eq('publisher_id', publisher_id)
    .select('publisher_id, display_name, is_verified')
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: 'Publisher not found' },
      { status: 404 }
    );
  }

  return NextResponse.json({
    success: true,
    publisher: data,
    message: body.verified
      ? `Publisher "${data.display_name}" is now verified`
      : `Publisher "${data.display_name}" verification removed`,
  });
}

export const dynamic = 'force-dynamic';
