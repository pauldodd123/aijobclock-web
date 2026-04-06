import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getClient } from '@/lib/google-ai'
import { FunctionCallingMode, SchemaType } from '@google/generative-ai'

async function checkAuth(request: NextRequest): Promise<boolean> {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')
  const isFromCron = cronSecret && authHeader === `Bearer ${cronSecret}`
  if (isFromCron) return true

  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user && user.email === 'paul.dodd@gmail.com') return true

  return false
}

async function generateForSector(sector: string, supabase: Awaited<ReturnType<typeof createAdminClient>>): Promise<string> {
  const today = new Date()
  const cutoff48h = new Date(today.getTime() - 48 * 60 * 60 * 1000).toISOString()
  const cutoff7d = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()

  let { data: articles } = await supabase
    .from('news_articles')
    .select('title, url, summary, source_name, scraped_at')
    .eq('sector', sector)
    .gte('scraped_at', cutoff48h)
    .order('scraped_at', { ascending: false })
    .limit(20)

  if (!articles || articles.length === 0) {
    const { data: wider } = await supabase
      .from('news_articles')
      .select('title, url, summary, source_name, scraped_at')
      .eq('sector', sector)
      .gte('scraped_at', cutoff7d)
      .order('scraped_at', { ascending: false })
      .limit(20)
    articles = wider
  }

  if (!articles || articles.length === 0) {
    return 'skipped - no articles'
  }

  const { data: recentPosts } = await supabase
    .from('blog_posts')
    .select('title, summary, published_date')
    .eq('sector', sector)
    .order('published_date', { ascending: false })
    .limit(7)

  const { data: termGuide } = await supabase
    .from('terminology_guides')
    .select('guide_content')
    .eq('sector', sector)
    .maybeSingle()

  const terminologyContext = termGuide?.guide_content
    ? `\n\nTERMINOLOGY GUIDE — Follow this closely for correct industry language:\n${termGuide.guide_content}`
    : ''

  const previousContext =
    recentPosts && recentPosts.length > 0
      ? `\n\nPREVIOUS BRIEFINGS (avoid repeating these themes, angles, and headlines):\n${recentPosts
          .map(
            (p: { title: string; summary: string; published_date: string }, i: number) =>
              `${i + 1}. [${p.published_date}] "${p.title}" — ${p.summary ?? 'No summary'}`,
          )
          .join('\n')}`
      : ''

  const articleContext = articles
    .map(
      (a: { title: string; url: string; summary: string; source_name?: string; scraped_at: string }, i: number) =>
        `${i + 1}. "${a.title}"${a.source_name ? ` (${a.source_name})` : ''}\n   ${a.summary ?? 'No summary'}\n   URL: ${a.url}`,
    )
    .join('\n\n')

  const model = getClient().getGenerativeModel({
    model: 'gemini-3-flash-preview',
    systemInstruction:
      `You are an expert technology journalist writing daily briefings about AI's impact on jobs and industries. Write in an engaging, editorial style. Be insightful and analytical, not just descriptive. Consider current trending themes in AI and technology. IMPORTANT: Each briefing must feel fresh — avoid repeating headlines, angles, or themes from recent days.${terminologyContext}`,
  })

  const userPrompt = `Write a daily briefing blog post for the "${sector}" sector based on today's scraped news articles below.

Requirements:
- Create an engaging headline that is DIFFERENT from recent briefings listed below
- Write a 1-2 sentence summary/excerpt
- Write the full blog post in markdown (500-800 words)
- Cite sources inline throughout the text — when referencing a specific finding or story, attribute it with the source name in natural prose (e.g. "according to Reuters" or "a report from Bloomberg found...")
- Identify NEW trending themes and patterns — do NOT rehash themes from previous briefings
- Include analysis of what this means for workers in this sector
- End with a forward-looking perspective
- Use correct industry terminology throughout — refer to the terminology guide in your system instructions
- Do NOT include a Sources section — that will be appended automatically
${previousContext}

Today's articles for ${sector}:

${articleContext}`

  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    tools: [ // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {
        functionDeclarations: [
          {
            name: 'publish_blog_post',
            description: 'Publish a blog post with title, summary, and markdown content',
            parameters: {
              type: SchemaType.OBJECT as const,
              properties: {
                title: { type: SchemaType.STRING as const, description: 'Engaging headline for the blog post' },
                summary: { type: SchemaType.STRING as const, description: '1-2 sentence summary of the post' },
                content: { type: SchemaType.STRING as const, description: 'Full markdown content of the post (500-800 words)' },
              },
              required: ['title', 'summary', 'content'],
            },
          },
        ],
      },
    ],
    toolConfig: {
      functionCallingConfig: {
        mode: FunctionCallingMode.ANY,
        allowedFunctionNames: ['publish_blog_post'],
      },
    },
  })

  const fc = result.response.candidates?.[0]?.content?.parts?.[0]?.functionCall
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const args = fc?.args as any

  if (!args?.title || !args?.content) {
    return 'error - no content generated'
  }

  const sourcesSection = articles
    .filter((a) => a.url && a.title)
    .map((a) => `- [${a.title}](${a.url})${a.source_name ? ` — ${a.source_name}` : ''}`)
    .join('\n')

  const contentWithSources = sourcesSection
    ? `${args.content}\n\n## Sources\n\n${sourcesSection}`
    : args.content

  const publishedDate = today.toISOString().split('T')[0]
  const slug = args.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)

  const { error: upsertError } = await supabase
    .from('blog_posts')
    .upsert(
      {
        sector,
        title: args.title,
        summary: args.summary ?? '',
        content: contentWithSources,
        published_date: publishedDate,
        slug,
      },
      { onConflict: 'sector,published_date' },
    )

  if (upsertError) {
    console.error(`generate-daily-briefing upsert error for sector ${sector}:`, upsertError)
    return `error - ${upsertError.message}`
  }

  return 'published'
}

export async function GET(request: NextRequest) {
  const authorized = await checkAuth(request)
  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sector = request.nextUrl.searchParams.get('sector')
  if (!sector) {
    return NextResponse.json({ error: 'sector query param is required' }, { status: 400 })
  }

  const supabase = await createAdminClient()
  try {
    const result = await generateForSector(sector, supabase)
    return NextResponse.json({ success: true, results: { [sector]: result } })
  } catch (err) {
    console.error(`generate-daily-briefing error for sector ${sector}:`, err)
    return NextResponse.json({ success: false, results: { [sector]: `error - ${err instanceof Error ? err.message : String(err)}` } })
  }
}

export async function POST(request: NextRequest) {
  const authorized = await checkAuth(request)
  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const sectorsRaw: string[] | undefined = body.sectors ?? (body.sector ? [body.sector] : undefined)

  if (!sectorsRaw || sectorsRaw.length === 0) {
    return NextResponse.json(
      { error: 'sectors or sector is required' },
      { status: 400 },
    )
  }

  const supabase = await createAdminClient()
  const results: Record<string, string> = {}

  for (const sector of sectorsRaw) {
    try {
      results[sector] = await generateForSector(sector, supabase)
    } catch (err) {
      console.error(`generate-daily-briefing error for sector ${sector}:`, err)
      results[sector] = `error - ${err instanceof Error ? err.message : String(err)}`
    }
  }

  return NextResponse.json({ success: true, results })
}

