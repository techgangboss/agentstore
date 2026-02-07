import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';
import { createClient } from '@supabase/supabase-js';
import { verifyApiKey } from '@/lib/api-key';
import { z } from 'zod';

// Simplified agent schema - MCP endpoint is optional
const SimpleAgentSchema = z.object({
  agent_id: z.string().regex(/^[a-z0-9-]+\.[a-z0-9-]+$/, 'Format: publisher-id.agent-name'),
  name: z.string().min(1).max(100),
  type: z.enum(['open', 'proprietary']),
  description: z.string().min(10).max(1000),
  version: z.string().regex(/^\d+\.\d+\.\d+$/).default('1.0.0'),
  pricing: z.object({
    model: z.enum(['free', 'one_time']),
    currency: z.enum(['USD', 'USDC']).default('USD'),
    amount: z.number().min(0).default(0),
  }),
  tags: z.array(z.string()).max(5),
  install: z.object({
    agent_wrapper: z.object({
      format: z.enum(['markdown']),
      entrypoint: z.string(),
      content: z.string().optional(),
    }),
    gateway_routes: z.array(z.object({
      route_id: z.string(),
      mcp_endpoint: z.string().url(),
      tools: z.array(z.any()).default([]),
      auth: z.object({
        type: z.enum(['none', 'entitlement', 'api_key']),
      }),
    })).default([]),
  }),
  permissions: z.object({
    requires_network: z.boolean().default(false),
    requires_filesystem: z.boolean().default(false),
    notes: z.string().optional(),
  }).default({}),
  // Auth via Supabase user ID (web dashboard)
  auth_user_id: z.string().uuid().optional(),
});

/**
 * Resolve the publisher using multiple auth methods (in priority order):
 * 1. X-API-Key header (convenience for agents)
 * 2. X-Wallet-Signature + X-Wallet-Address headers (prove wallet ownership)
 * 3. auth_user_id field (web dashboard / Google OAuth)
 * 4. For free agents only: publisher lookup by ID (rate-limited, no auth)
 */
async function resolvePublisher(
  request: NextRequest,
  publisherId: string,
  authUserId: string | undefined,
  isFreeAgent: boolean
): Promise<{ publisher: { id: string; publisher_id: string; payout_address: string }; authMethod: string } | { error: string; status: number }> {
  const adminSupabase = createAdminClient();

  // 1. API key auth
  const apiKeyPublisher = await verifyApiKey(request);
  if (apiKeyPublisher) {
    if (apiKeyPublisher.publisher_id !== publisherId) {
      return { error: `API key does not match publisher: ${publisherId}`, status: 403 };
    }
    return { publisher: apiKeyPublisher, authMethod: 'api_key' };
  }

  // 2. Wallet signature auth (X-Wallet-Signature + X-Wallet-Address headers)
  const walletAddress = request.headers.get('X-Wallet-Address');
  const walletSignature = request.headers.get('X-Wallet-Signature');
  if (walletAddress && walletSignature) {
    const { data: publisher, error } = await adminSupabase
      .from('publishers')
      .select('id, publisher_id, payout_address')
      .eq('publisher_id', publisherId)
      .single();

    if (error || !publisher) {
      return { error: `Publisher not found: ${publisherId}`, status: 404 };
    }

    if (publisher.payout_address.toLowerCase() !== walletAddress.toLowerCase()) {
      return { error: 'Wallet address does not match publisher payout address', status: 403 };
    }

    // Verify the signature
    const expectedMessage = `AgentStore publisher: ${publisherId}`;
    try {
      const { verifyMessage } = await import('viem');
      const isValid = await verifyMessage({
        address: walletAddress as `0x${string}`,
        message: expectedMessage,
        signature: walletSignature as `0x${string}`,
      });

      if (!isValid) {
        return { error: 'Invalid wallet signature', status: 401 };
      }
    } catch {
      return { error: 'Wallet signature verification failed', status: 401 };
    }

    return { publisher, authMethod: 'wallet_signature' };
  }

  // 3. Bearer token auth (web dashboard) — verify token server-side
  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const { createClient: createSupabaseClient } = await import('@supabase/supabase-js');
    const supabaseAuth = createSupabaseClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY!
    );
    const { data: { user } } = await supabaseAuth.auth.getUser(token);
    if (user) {
      const { data: publisher, error } = await adminSupabase
        .from('publishers')
        .select('id, publisher_id, payout_address')
        .eq('publisher_id', publisherId)
        .eq('auth_user_id', user.id)
        .single();

      if (error || !publisher) {
        return { error: `Publisher not found or not authorized: ${publisherId}`, status: 404 };
      }
      return { publisher, authMethod: 'bearer_token' };
    }
  }

  // 4. For free agents: just look up the publisher (rate limits are the guard)
  if (isFreeAgent) {
    const { data: publisher, error } = await adminSupabase
      .from('publishers')
      .select('id, publisher_id, payout_address')
      .eq('publisher_id', publisherId)
      .single();

    if (error || !publisher) {
      return { error: `Publisher not found: ${publisherId}`, status: 404 };
    }
    return { publisher, authMethod: 'rate_limited' };
  }

  return {
    error: 'Authentication required for paid agents. Use X-API-Key header, or X-Wallet-Address + X-Wallet-Signature headers (sign "AgentStore publisher: your-publisher-id" with your payout address).',
    status: 401,
  };
}

// POST /api/publishers/agents/simple - Submit agent
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = SimpleAgentSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.errors },
      { status: 400 }
    );
  }

  const data = parsed.data;

  // Extract publisher_id from agent_id
  const [publisherId] = data.agent_id.split('.');
  if (!publisherId) {
    return NextResponse.json(
      { error: 'Invalid agent_id format. Must be: publisher-id.agent-name' },
      { status: 400 }
    );
  }

  // Business rule: open agents must be free
  if (data.type === 'open' && data.pricing.model !== 'free') {
    return NextResponse.json(
      { error: 'Open agents must use free pricing model' },
      { status: 400 }
    );
  }

  // Business rule: proprietary agents with MCP routes must use entitlement auth
  if (data.type === 'proprietary' && data.install.gateway_routes.length > 0) {
    const hasEntitlementAuth = data.install.gateway_routes.some(
      (r) => r.auth.type === 'entitlement'
    );
    if (!hasEntitlementAuth) {
      return NextResponse.json(
        { error: 'Proprietary agents with MCP routes must use entitlement authentication' },
        { status: 400 }
      );
    }
  }

  const isFreeAgent = data.pricing.model === 'free';

  // Resolve publisher via multi-method auth
  const result = await resolvePublisher(request, publisherId, data.auth_user_id, isFreeAgent);
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const { publisher } = result;
  const adminSupabase = createAdminClient();

  // Check if agent already exists
  const { data: existingAgent } = await adminSupabase
    .from('agents')
    .select('id, version, publisher_id')
    .eq('agent_id', data.agent_id)
    .single();

  // Build manifest
  const manifest = {
    pricing: data.pricing,
    install: data.install,
    permissions: data.permissions,
    tags: data.tags,
  };

  if (existingAgent) {
    // Verify ownership: the authenticated publisher must own this agent
    if (existingAgent.publisher_id !== publisher.id) {
      return NextResponse.json(
        { error: 'You do not own this agent and cannot update it' },
        { status: 403 }
      );
    }

    // Update existing agent
    const { data: agent, error: updateError } = await adminSupabase
      .from('agents')
      .update({
        name: data.name,
        type: data.type,
        description: data.description,
        version: data.version,
        manifest,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existingAgent.id)
      .select('agent_id, name, version, updated_at')
      .single();

    if (updateError) {
      console.error('Agent update error:', updateError);
      return NextResponse.json({ error: 'Failed to update agent' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      action: 'updated',
      agent,
    });
  }

  // Create new agent - auto-publish immediately
  const { data: agent, error: createError } = await adminSupabase
    .from('agents')
    .insert({
      agent_id: data.agent_id,
      publisher_id: publisher.id,
      name: data.name,
      type: data.type,
      description: data.description,
      version: data.version,
      manifest,
      is_published: true,
    })
    .select('id, agent_id, name, version, created_at')
    .single();

  if (createError) {
    console.error('Agent creation error:', createError);
    if (createError.code === '23505') {
      return NextResponse.json({ error: 'Agent ID already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Failed to create agent' }, { status: 500 });
  }

  // Handle tags — use agent.id from insert result instead of re-querying
  if (data.tags.length > 0) {
    for (const tagName of data.tags) {
      const slug = tagName.toLowerCase().replace(/\s+/g, '-');

      const { data: tag } = await adminSupabase
        .from('tags')
        .upsert({ name: tagName, slug }, { onConflict: 'slug' })
        .select('id')
        .single();

      if (tag) {
        await adminSupabase
          .from('agent_tags')
          .upsert({ agent_id: agent.id, tag_id: tag.id });
      }
    }
  }

  const priceText = data.pricing.model === 'free'
    ? 'free'
    : `priced at $${data.pricing.amount}`;

  return NextResponse.json({
    success: true,
    action: 'created',
    agent,
    message: 'Agent published! It is now available in the marketplace.',
    moltbook: {
      suggested_post: {
        title: `Just published ${data.name} on AgentStore!`,
        content: `I just listed ${data.name} on AgentStore (agentstore.tools) — ${data.description.slice(0, 200)}. It's ${priceText}. Any agent can install it with: \`agentstore install ${data.agent_id}\``,
        submolt: 'agents',
      },
      api_hint: 'POST https://www.moltbook.com/api/v1/posts with your Moltbook API key',
    },
  });
}
