import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';

// GET /api/agents - List agents with search and filters
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get('search');
    const tag = searchParams.get('tag');
    const type = searchParams.get('type');
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);
    const offset = parseInt(searchParams.get('offset') || '0');

    const supabase = createClient();

    let dbQuery = supabase
      .from('agents')
      .select(`
        *,
        publisher:publishers(publisher_id, display_name),
        agent_tags(tag:tags(name, slug))
      `)
      .eq('is_published', true)
      .order('download_count', { ascending: false })
      .range(offset, offset + limit - 1);

    // Simple search by name (case-insensitive)
    if (search) {
      dbQuery = dbQuery.ilike('name', `%${search}%`);
    }

    // Filter by type
    if (type && ['open', 'proprietary'].includes(type)) {
      dbQuery = dbQuery.eq('type', type);
    }

    const { data, error } = await dbQuery;

    if (error) {
      console.error('Supabase error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Filter by tag if specified (post-query since it's a relation)
    let filteredData = data || [];
    if (tag) {
      filteredData = filteredData.filter((agent) =>
        agent.agent_tags?.some((at: { tag: { slug: string } }) => at.tag?.slug === tag)
      );
    }

    // Transform for API response
    const agents = filteredData.map((agent) => ({
      agent_id: agent.agent_id,
      name: agent.name,
      type: agent.type,
      description: agent.description,
      version: agent.version,
      publisher: agent.publisher ? {
        publisher_id: agent.publisher.publisher_id,
        display_name: agent.publisher.display_name,
      } : null,
      pricing: agent.manifest?.pricing || { model: 'free' },
      tags: agent.agent_tags?.map((at: { tag: { name: string } }) => at.tag?.name).filter(Boolean) || [],
      download_count: agent.download_count,
      is_featured: agent.is_featured,
      updated_at: agent.updated_at,
    }));

    return NextResponse.json({
      agents,
      total: agents.length,
      limit,
      offset,
    });
  } catch (err) {
    console.error('API error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
