import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';
import { createClient } from '@supabase/supabase-js';

// POST /api/auth/link-publisher - Create or link publisher account for authenticated user
export async function POST(request: NextRequest) {
  // Get auth token from header
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Missing authorization header' }, { status: 401 });
  }

  const token = authHeader.substring(7);

  // Verify the token and get user
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
  }

  let body: { display_name?: string };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const adminSupabase = createAdminClient();

  // Check if user already has a publisher account
  const { data: existingPublisher } = await adminSupabase
    .from('publishers')
    .select('id, publisher_id')
    .eq('auth_user_id', user.id)
    .single();

  if (existingPublisher) {
    return NextResponse.json({
      success: true,
      publisher: existingPublisher,
      message: 'Publisher account already exists',
    });
  }

  // Generate a unique publisher_id from email or name
  const baseName = (user.user_metadata?.full_name || user.email?.split('@')[0] || 'publisher')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 30);

  // Check if name is taken and add random suffix if needed
  let publisherId = baseName;
  let attempts = 0;

  while (attempts < 5) {
    const { data: existing } = await adminSupabase
      .from('publishers')
      .select('id')
      .eq('publisher_id', publisherId)
      .single();

    if (!existing) break;

    // Add random suffix
    publisherId = `${baseName}-${Math.random().toString(36).substring(2, 6)}`;
    attempts++;
  }

  // Create publisher account
  const displayName = body.display_name || user.user_metadata?.full_name || user.email?.split('@')[0] || 'Publisher';

  const { data: publisher, error: createError } = await adminSupabase
    .from('publishers')
    .insert({
      publisher_id: publisherId,
      display_name: displayName,
      email: user.email,
      auth_user_id: user.id,
      // Use platform wallet as default payout address
      payout_address: '0x71483B877c40eb2BF99230176947F5ec1c2351cb',
    })
    .select('id, publisher_id, display_name, email, payout_address, created_at')
    .single();

  if (createError) {
    console.error('Publisher creation error:', createError);
    return NextResponse.json({ error: 'Failed to create publisher account' }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    publisher,
    message: 'Publisher account created successfully',
  });
}
