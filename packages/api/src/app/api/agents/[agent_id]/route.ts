import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';

// GET /api/agents/[agent_id] - Get agent details
export async function GET(
  request: NextRequest,
  { params }: { params: { agent_id: string } }
) {
  const { agent_id } = params;

  const supabase = createClient();

  const { data: agent, error } = await supabase
    .from('agents')
    .select(`
      *,
      publisher:publishers(*),
      agent_tags(tag:tags(*))
    `)
    .eq('agent_id', agent_id)
    .eq('is_published', true)
    .single();

  if (error || !agent) {
    return NextResponse.json(
      { error: 'Agent not found' },
      { status: 404 }
    );
  }

  // Validate required nested data exists
  if (!agent.publisher || !agent.manifest) {
    console.error('Agent missing required data:', {
      hasPublisher: !!agent.publisher,
      hasManifest: !!agent.manifest
    });
    return NextResponse.json(
      { error: 'Agent data incomplete' },
      { status: 500 }
    );
  }

  // Return full manifest for installation
  return NextResponse.json({
    agent_id: agent.agent_id,
    name: agent.name,
    type: agent.type,
    description: agent.description,
    version: agent.version,
    publisher: {
      publisher_id: agent.publisher.publisher_id,
      display_name: agent.publisher.display_name,
      support_url: agent.publisher.support_url ?? null,
      payout_address: agent.publisher.payout_address ?? null,
    },
    pricing: agent.manifest.pricing ?? { model: 'free', amount: 0 },
    install: agent.manifest.install ?? null,
    permissions: agent.manifest.permissions ?? { requires_network: false, requires_filesystem: false },
    tags: agent.manifest.tags ?? [],
    download_count: agent.download_count ?? 0,
    updated_at: agent.updated_at,
  });
}
