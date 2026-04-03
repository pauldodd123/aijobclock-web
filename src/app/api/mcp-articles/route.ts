import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

async function handleTool(toolName: string, args: any): Promise<any> {
  const supabase = await createAdminClient()

  switch (toolName) {
    case 'get_todays_articles': {
      // args: { sector?: string, limit?: number }
      const today = new Date().toISOString().split('T')[0]
      let query = supabase
        .from('news_articles')
        .select('id, title, url, summary, sector, source_name, scraped_at')
        .gte('scraped_at', today + 'T00:00:00Z')
        .lte('scraped_at', today + 'T23:59:59Z')
        .order('scraped_at', { ascending: false })
      if (args.sector) query = query.eq('sector', args.sector)
      const { data } = await query.limit(args.limit || 20)
      return data || []
    }

    case 'get_daily_briefing': {
      // args: { sector?: string }
      const today = new Date().toISOString().split('T')[0]
      let query = supabase
        .from('blog_posts')
        .select('id, title, slug, sector, summary, content, published_date')
        .eq('published_date', today)
        .order('sector', { ascending: true })
      if (args.sector) query = query.eq('sector', args.sector)
      const { data } = await query
      return data || []
    }

    case 'get_sector_stats': {
      const { data } = await supabase
        .from('sector_stats')
        .select(
          'sector_name, estimated_jobs_at_risk, trend_direction, article_count, last_updated',
        )
        .order('estimated_jobs_at_risk', { ascending: false })
      return data || []
    }

    case 'get_breaking_news': {
      const { data } = await supabase
        .from('breaking_news')
        .select(
          'id, headline, summary, blog_post_id, active, expires_at, created_at',
        )
        .eq('active', true)
        .order('created_at', { ascending: false })
        .limit(1)
      return data || []
    }

    default:
      throw new Error(`Unknown tool: ${toolName}`)
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { jsonrpc, id, method, params } = body

  // Only handle tools/call method
  if (method !== 'tools/call') {
    return NextResponse.json({
      jsonrpc: '2.0',
      id,
      error: { code: -32601, message: 'Method not found' },
    })
  }

  const { name: toolName, arguments: args = {} } = params || {}

  try {
    const result = await handleTool(toolName, args)
    return NextResponse.json({
      jsonrpc: '2.0',
      id,
      result: { content: [{ text: JSON.stringify(result) }] },
    })
  } catch (e: any) {
    return NextResponse.json({
      jsonrpc: '2.0',
      id,
      error: { code: -32603, message: e.message || 'Internal error' },
    })
  }
}

export async function GET() {
  return NextResponse.json({
    tools: [
      {
        name: 'get_todays_articles',
        description: "Get today's news articles",
        parameters: { sector: 'optional string', limit: 'optional number' },
      },
      {
        name: 'get_daily_briefing',
        description: "Get today's daily briefing blog posts",
        parameters: { sector: 'optional string' },
      },
      {
        name: 'get_sector_stats',
        description: 'Get sector employment statistics',
        parameters: {},
      },
      {
        name: 'get_breaking_news',
        description: 'Get active breaking news',
        parameters: {},
      },
    ],
  })
}
