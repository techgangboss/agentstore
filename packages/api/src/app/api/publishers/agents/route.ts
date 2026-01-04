import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';
import { z } from 'zod';

// Agent manifest schema matching the spec
const GatewayRouteSchema = z.object({
  route_id: z.string(),
  mcp_endpoint: z.string().url(),
  tools: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      inputSchema: z.object({
        type: z.literal('object'),
        properties: z.record(z.unknown()).optional(),
        required: z.array(z.string()).optional(),
      }),
    })
  ),
  auth: z.object({
    type: z.enum(['none', 'entitlement', 'api_key']),
  }),
});

const AgentWrapperSchema = z.object({
  format: z.enum(['markdown']),
  entrypoint: z.string(),
  content: z.string().optional(), // Inline content or URL
  checksum: z.string().optional(),
});

const PricingSchema = z.object({
  model: z.enum(['free', 'one_time', 'subscription', 'usage_based']),
  currency: z.enum(['USD', 'ETH']).default('USD'),
  amount: z.number().min(0).default(0),
  amount_usd: z.number().min(0).optional(),
});

const PermissionsSchema = z.object({
  requires_network: z.boolean().default(false),
  requires_filesystem: z.boolean().default(false),
  notes: z.string().optional(),
});

const SubmitAgentSchema = z.object({
  agent_id: z.string().regex(/^[a-z0-9-]+\.[a-z0-9-]+$/, 'Format: publisher-id.agent-name'),
  name: z.string().min(1).max(100),
  type: z.enum(['open', 'proprietary']),
  description: z.string().min(10).max(1000),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  pricing: PricingSchema,
  install: z.object({
    agent_wrapper: AgentWrapperSchema,
    gateway_routes: z.array(GatewayRouteSchema),
  }),
  permissions: PermissionsSchema,
  tags: z.array(z.string()).max(5),
  // Auth: wallet signature
  signature: z.string().regex(/^0x[a-fA-F0-9]+$/),
  message: z.string(),
});

// POST /api/publishers/agents - Submit a new agent
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = SubmitAgentSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.errors },
      { status: 400 }
    );
  }

  const data = parsed.data;

  // Extract publisher_id from agent_id (format: publisher-id.agent-name)
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

  // Business rule: proprietary agents must use entitlement auth
  if (data.type === 'proprietary') {
    const hasEntitlementAuth = data.install.gateway_routes.some(
      (r) => r.auth.type === 'entitlement'
    );
    if (!hasEntitlementAuth) {
      return NextResponse.json(
        { error: 'Proprietary agents must use entitlement authentication' },
        { status: 400 }
      );
    }
  }

  const adminSupabase = createAdminClient();

  // Get publisher and verify ownership
  const { data: publisher, error: pubError } = await adminSupabase
    .from('publishers')
    .select('id, publisher_id, payout_address')
    .eq('publisher_id', publisherId)
    .single();

  if (pubError || !publisher) {
    return NextResponse.json(
      { error: `Publisher not found: ${publisherId}` },
      { status: 404 }
    );
  }

  // Verify signature matches publisher's payout address
  const expectedMessage = `Submit agent to AgentStore: ${data.agent_id} v${data.version}`;
  if (data.message !== expectedMessage) {
    return NextResponse.json(
      { error: `Invalid message. Expected: "${expectedMessage}"` },
      { status: 400 }
    );
  }

  const { verifyMessage } = await import('viem');
  try {
    const isValid = await verifyMessage({
      address: publisher.payout_address as `0x${string}`,
      message: data.message,
      signature: data.signature as `0x${string}`,
    });

    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid signature - must be signed by publisher payout address' },
        { status: 401 }
      );
    }
  } catch (error) {
    console.error('Signature verification error:', error);
    return NextResponse.json({ error: 'Signature verification failed' }, { status: 401 });
  }

  // Check if agent already exists
  const { data: existingAgent } = await adminSupabase
    .from('agents')
    .select('id, version')
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

    // Store version history
    await adminSupabase.from('agent_versions').insert({
      agent_id: existingAgent.id,
      version: data.version,
      manifest,
      changelog: `Updated to version ${data.version}`,
    });

    return NextResponse.json({
      success: true,
      action: 'updated',
      agent,
    });
  }

  // Create new agent
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
      is_published: false, // Requires manual approval
    })
    .select('agent_id, name, version, created_at')
    .single();

  if (createError) {
    console.error('Agent creation error:', createError);
    if (createError.code === '23505') {
      return NextResponse.json({ error: 'Agent ID already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Failed to create agent' }, { status: 500 });
  }

  // Handle tags
  if (data.tags.length > 0) {
    // Get or create tags
    for (const tagName of data.tags) {
      const slug = tagName.toLowerCase().replace(/\s+/g, '-');

      // Upsert tag
      const { data: tag } = await adminSupabase
        .from('tags')
        .upsert({ name: tagName, slug }, { onConflict: 'slug' })
        .select('id')
        .single();

      if (tag) {
        // Get the new agent's UUID
        const { data: newAgent } = await adminSupabase
          .from('agents')
          .select('id')
          .eq('agent_id', data.agent_id)
          .single();

        if (newAgent) {
          await adminSupabase
            .from('agent_tags')
            .upsert({ agent_id: newAgent.id, tag_id: tag.id });
        }
      }
    }
  }

  return NextResponse.json({
    success: true,
    action: 'created',
    agent,
    message: 'Agent submitted for review. It will be published after approval.',
  });
}
