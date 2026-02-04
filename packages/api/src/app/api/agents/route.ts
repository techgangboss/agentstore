import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';

// Mark as dynamic since we use searchParams
export const dynamic = 'force-dynamic';

// Sanitize search input to prevent LIKE pattern injection
function sanitizeSearch(input: string | null): string | null {
  if (!input) return null;
  // Remove LIKE special characters and limit length
  return input
    .replace(/[%_\\]/g, '') // Remove LIKE wildcards
    .replace(/[<>'"`;(){}[\]]/g, '') // Remove potentially dangerous chars
    .trim()
    .slice(0, 100); // Limit to 100 chars
}

// Validate slug format (alphanumeric + hyphens)
function isValidSlug(input: string | null): boolean {
  if (!input) return true;
  return /^[a-z0-9-]+$/.test(input) && input.length <= 50;
}

// GET /api/agents - List agents with search and filters
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const rawSearch = searchParams.get('search');
    const rawTag = searchParams.get('tag');
    const type = searchParams.get('type');
    const rawLimit = searchParams.get('limit');
    const rawOffset = searchParams.get('offset');

    // Validate and sanitize inputs
    const search = sanitizeSearch(rawSearch);
    const tag = isValidSlug(rawTag) ? rawTag : null;
    const limit = Math.min(Math.max(parseInt(rawLimit || '20') || 20, 1), 100);
    const offset = Math.max(parseInt(rawOffset || '0') || 0, 0);

    const supabase = createClient();

    let dbQuery = supabase
      .from('agents')
      .select(`
        *,
        publisher:publishers(*),
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
        is_verified: agent.publisher.is_verified || false,
      } : null,
      pricing: agent.manifest?.pricing || { model: 'free' },
      tags: agent.agent_tags?.map((at: { tag: { name: string } }) => at.tag?.name).filter(Boolean) || [],
      download_count: agent.download_count,
      is_featured: agent.is_featured,
      is_verified: agent.publisher?.is_verified || false,
      updated_at: agent.updated_at,
    }));

    return NextResponse.json({
      agents,
      total: agents.length,
      limit,
      offset,
    }, {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (err) {
    console.error('API error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
