import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase';
import { generateApiKey } from '@/lib/api-key';
import { z } from 'zod';

// Mark as dynamic since we use searchParams
export const dynamic = 'force-dynamic';

// Default payout address (platform wallet) if publisher provides invalid address
const DEFAULT_PAYOUT_ADDRESS = '0x71483B877c40eb2BF99230176947F5ec1c2351cb';

const RegisterPublisherSchema = z.object({
  name: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/, 'Must be lowercase alphanumeric with hyphens, used as unique identifier'),
  display_name: z.string().min(1).max(100),
  payout_address: z.string().optional(),
  email: z.string().email().optional(),
  support_url: z.string().url().optional(),
});

// Validate Ethereum address format
function isValidEthAddress(address: string | undefined): boolean {
  if (!address) return false;
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

// GET /api/publishers - List publishers (public)
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const publisherId = searchParams.get('publisher_id');

  const supabase = createClient();

  if (publisherId) {
    // Get specific publisher
    const { data: publisher, error } = await supabase
      .from('publishers')
      .select('publisher_id, display_name, support_url, created_at')
      .eq('publisher_id', publisherId)
      .single();

    if (error || !publisher) {
      return NextResponse.json({ error: 'Publisher not found' }, { status: 404 });
    }

    return NextResponse.json({ publisher });
  }

  // List all publishers
  const { data: publishers, error } = await supabase
    .from('publishers')
    .select('publisher_id, display_name, support_url, created_at')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch publishers' }, { status: 500 });
  }

  return NextResponse.json({ publishers: publishers || [] });
}

// POST /api/publishers - Register new publisher
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = RegisterPublisherSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.errors },
      { status: 400 }
    );
  }

  const { name, display_name, payout_address: rawPayoutAddress, email, support_url } = parsed.data;

  // Validate payout address, default to platform wallet if invalid
  const payout_address = isValidEthAddress(rawPayoutAddress)
    ? rawPayoutAddress!.toLowerCase()
    : DEFAULT_PAYOUT_ADDRESS;

  // Use name as the unique publisher_id
  const publisher_id = name;

  const adminSupabase = createAdminClient();

  // Check if publisher name already exists
  const { data: existing } = await adminSupabase
    .from('publishers')
    .select('id')
    .eq('publisher_id', publisher_id)
    .single();

  if (existing) {
    return NextResponse.json(
      { error: 'Publisher name already taken' },
      { status: 409 }
    );
  }

  // Generate API key for programmatic access
  const { key: apiKey, hash: apiKeyHash } = generateApiKey();

  // Create publisher
  const { data: publisher, error: createError } = await adminSupabase
    .from('publishers')
    .insert({
      publisher_id,
      display_name,
      payout_address,
      email: email || null,
      support_url: support_url || null,
      api_key_hash: apiKeyHash,
    })
    .select('publisher_id, display_name, payout_address, email, support_url, created_at')
    .single();

  if (createError) {
    console.error('Publisher creation error:', createError);
    return NextResponse.json({ error: 'Failed to create publisher' }, { status: 500 });
  }

  const usedDefaultAddress = payout_address === DEFAULT_PAYOUT_ADDRESS;

  return NextResponse.json({
    success: true,
    publisher,
    api_key: apiKey,
    message: usedDefaultAddress
      ? 'Publisher registered. Save your API key — it won\'t be shown again. Note: Invalid wallet address provided, using platform wallet as default. Update your payout address to receive payments.'
      : 'Publisher registered successfully. Save your API key — it won\'t be shown again. You can now submit agents.',
  });
}
