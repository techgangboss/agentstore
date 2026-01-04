import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase';
import { z } from 'zod';

// Mark as dynamic since we use searchParams
export const dynamic = 'force-dynamic';

const RegisterPublisherSchema = z.object({
  publisher_id: z
    .string()
    .min(3)
    .max(50)
    .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, 'Must be lowercase alphanumeric with hyphens'),
  display_name: z.string().min(1).max(100),
  payout_address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Must be valid Ethereum address'),
  support_url: z.string().url().optional(),
  // Wallet signature to prove ownership of payout address
  signature: z.string().regex(/^0x[a-fA-F0-9]+$/),
  message: z.string(),
});

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

  const { publisher_id, display_name, payout_address, support_url, signature, message } =
    parsed.data;

  // Verify the signature proves ownership of the payout address
  // The message should be: "Register as AgentStore publisher: {publisher_id}"
  const expectedMessage = `Register as AgentStore publisher: ${publisher_id}`;
  if (message !== expectedMessage) {
    return NextResponse.json(
      { error: `Invalid message. Expected: "${expectedMessage}"` },
      { status: 400 }
    );
  }

  // Verify signature using viem
  const { verifyMessage } = await import('viem');
  let recoveredAddress: string;
  try {
    const isValid = await verifyMessage({
      address: payout_address as `0x${string}`,
      message: message,
      signature: signature as `0x${string}`,
    });

    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid signature - does not match payout address' },
        { status: 401 }
      );
    }
    recoveredAddress = payout_address;
  } catch (error) {
    console.error('Signature verification error:', error);
    return NextResponse.json({ error: 'Signature verification failed' }, { status: 401 });
  }

  const adminSupabase = createAdminClient();

  // Check if publisher_id already exists
  const { data: existing } = await adminSupabase
    .from('publishers')
    .select('id')
    .eq('publisher_id', publisher_id)
    .single();

  if (existing) {
    return NextResponse.json(
      { error: 'Publisher ID already taken' },
      { status: 409 }
    );
  }

  // Check if payout address is already registered
  const { data: existingAddress } = await adminSupabase
    .from('publishers')
    .select('publisher_id')
    .eq('payout_address', payout_address.toLowerCase())
    .single();

  if (existingAddress) {
    return NextResponse.json(
      { error: `This address is already registered as publisher: ${existingAddress.publisher_id}` },
      { status: 409 }
    );
  }

  // Create publisher
  const { data: publisher, error: createError } = await adminSupabase
    .from('publishers')
    .insert({
      publisher_id,
      display_name,
      payout_address: payout_address.toLowerCase(),
      support_url: support_url || null,
    })
    .select('publisher_id, display_name, support_url, created_at')
    .single();

  if (createError) {
    console.error('Publisher creation error:', createError);
    return NextResponse.json({ error: 'Failed to create publisher' }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    publisher,
    message: 'Publisher registered successfully. You can now submit agents.',
  });
}
