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
      support_url: agent.publisher.support_url,
    },
    pricing: agent.manifest.pricing,
    install: agent.manifest.install,
    permissions: agent.manifest.permissions,
    tags: agent.manifest.tags,
    download_count: agent.download_count,
    updated_at: agent.updated_at,
  });
}
