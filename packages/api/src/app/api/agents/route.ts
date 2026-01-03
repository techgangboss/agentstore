import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';

// GET /api/agents - List agents with search and filters
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get('q');
  const category = searchParams.get('category');
  const type = searchParams.get('type'); // 'open' or 'proprietary'
  const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);
  const offset = parseInt(searchParams.get('offset') || '0');

  const supabase = createClient();

  let dbQuery = supabase
    .from('agents')
    .select(`
      *,
      publisher:publishers(*),
      agent_tags(tag:tags(*))
    `)
    .eq('is_published', true)
    .order('download_count', { ascending: false })
    .range(offset, offset + limit - 1);

  // Text search
  if (query) {
    dbQuery = dbQuery.textSearch('name', query, {
      type: 'websearch',
      config: 'english',
    });
  }

  // Filter by type
  if (type && ['open', 'proprietary'].includes(type)) {
    dbQuery = dbQuery.eq('type', type);
  }

  // Filter by category/tag
  if (category) {
    dbQuery = dbQuery.contains('manifest->tags', [category]);
  }

  const { data, error, count } = await dbQuery;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Transform for API response
  const agents = data?.map((agent) => ({
    agent_id: agent.agent_id,
    name: agent.name,
    type: agent.type,
    description: agent.description,
    version: agent.version,
    publisher: {
      publisher_id: agent.publisher.publisher_id,
      display_name: agent.publisher.display_name,
    },
    pricing: agent.manifest.pricing,
    tags: agent.manifest.tags,
    download_count: agent.download_count,
    updated_at: agent.updated_at,
  }));

  return NextResponse.json({
    agents,
    total: count,
    limit,
    offset,
  });
}
