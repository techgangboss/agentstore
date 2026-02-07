import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';
import { createClient } from '@supabase/supabase-js';
import { generateApiKey } from '@/lib/api-key';

// POST /api/auth/link-publisher - Create or link publisher account for authenticated Google user
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

  let body: { display_name?: string; publisher_id?: string };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const adminSupabase = createAdminClient();

  // Check if user already has a publisher account linked
  const { data: existingByAuth } = await adminSupabase
    .from('publishers')
    .select('id, publisher_id, display_name, payout_address, api_key_hash')
    .eq('auth_user_id', user.id)
    .single();

  if (existingByAuth) {
    // Already linked — generate API key if they don't have one yet
    let apiKey: string | undefined;
    if (!existingByAuth.api_key_hash) {
      const { key, hash } = generateApiKey();
      apiKey = key;
      await adminSupabase
        .from('publishers')
        .update({ api_key_hash: hash })
        .eq('id', existingByAuth.id);
    }

    return NextResponse.json({
      success: true,
      publisher: { id: existingByAuth.id, publisher_id: existingByAuth.publisher_id },
      ...(apiKey ? { api_key: apiKey } : {}),
      message: 'Publisher account already exists',
    });
  }

  // If a publisher_id was specified, try to link Google auth to an existing publisher
  // This handles the case where an agent registered via API first, then the human signs in with Google
  if (body.publisher_id) {
    const { data: existingByName } = await adminSupabase
      .from('publishers')
      .select('id, publisher_id, auth_user_id, api_key_hash')
      .eq('publisher_id', body.publisher_id)
      .single();

    if (existingByName && !existingByName.auth_user_id) {
      // Link Google auth to existing publisher
      const updates: Record<string, unknown> = { auth_user_id: user.id };
      if (user.email) updates.email = user.email;
      if (!existingByName.api_key_hash) {
        const { key, hash } = generateApiKey();
        updates.api_key_hash = hash;
        await adminSupabase.from('publishers').update(updates).eq('id', existingByName.id);
        return NextResponse.json({
          success: true,
          publisher: { id: existingByName.id, publisher_id: existingByName.publisher_id },
          api_key: key,
          message: 'Google account linked to existing publisher',
        });
      }
      await adminSupabase.from('publishers').update(updates).eq('id', existingByName.id);
      return NextResponse.json({
        success: true,
        publisher: { id: existingByName.id, publisher_id: existingByName.publisher_id },
        message: 'Google account linked to existing publisher',
      });
    }
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

  // Create publisher account with API key
  const displayName = body.display_name || user.user_metadata?.full_name || user.email?.split('@')[0] || 'Publisher';
  const { key: apiKey, hash: apiKeyHash } = generateApiKey();

  const { data: publisher, error: createError } = await adminSupabase
    .from('publishers')
    .insert({
      publisher_id: publisherId,
      display_name: displayName,
      email: user.email,
      auth_user_id: user.id,
      api_key_hash: apiKeyHash,
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
    api_key: apiKey,
    message: 'Publisher account created successfully. Save your API key — it won\'t be shown again.',
  });
}
