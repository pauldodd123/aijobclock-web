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
      const today = new Date()
      const cutoff48h = new Date(today.getTime() - 48 * 60 * 60 * 1000).toISOString()
      const cutoff7d = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()

      let { data: articles } = await supabase
        .from('news_articles')
        .select('title, url, summary, published_at')
        .eq('sector', sector)
        .gte('published_at', cutoff48h)
        .order('published_at', { ascending: false })
        .limit(20)

      if (!articles || articles.length === 0) {
        const { data: wider } = await supabase
          .from('news_articles')
          .select('title, url, summary, published_at')
          .eq('sector', sector)
          .gte('published_at', cutoff7d)
          .order('published_at', { ascending: false })
          .limit(20)
        articles = wider
      }

      if (!articles || articles.length === 0) {
        results[sector] = 'skipped - no articles'
        continue
      }

      const { data: recentPosts } = await supabase
        .from('blog_posts')
        .select('title, summary, published_date')
        .eq('sector', sector)
        .order('published_date', { ascending: false })
        .limit(7)

      const previousContext =
        recentPosts && recentPosts.length > 0
          ? `\n\nRecent posts to avoid repeating:\n${recentPosts
              .map(
                (p: { title: string; summary: string; published_date: string }) =>
                  `- ${p.published_date}: ${p.title} — ${p.summary}`,
              )
              .join('\n')}\n`
          : ''

      const articleContext = articles
        .map(
          (a: { title: string; url: string; summary: string; published_at: string }) =>
            `- ${a.title} (${a.published_at})\n  ${a.summary ?? ''}\n  ${a.url}`,
        )
        .join('\n\n')

      const model = getClient().getGenerativeModel({
        model: 'gemini-2.5-flash',
        systemInstruction:
          'You are an expert technology journalist writing daily briefings about AI\'s impact on jobs and industries. Write in an engaging, editorial style. Be insightful and analytical, not just descriptive. Consider current trending themes in AI and technology. IMPORTANT: Each briefing must feel fresh — avoid repeating headlines, angles, or themes from recent days.',
      })

      const userPrompt = `Write a daily briefing blog post for the '${sector}' sector based on today's scraped news articles below.

Requirements:
- Engaging headline that is different from recent posts
- 1-2 sentence summary
- Full markdown content, 500-800 words
- Reference specific articles from the list
- Identify NEW trends not covered recently
- Worker impact analysis
- Forward-looking perspective
${previousContext}
Today's articles:
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
        results[sector] = 'error - no content generated'
        continue
      }

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
            content: args.content,
            published_date: publishedDate,
            slug,
          },
          { onConflict: 'sector,published_date' },
        )

      if (upsertError) {
        console.error(`generate-daily-briefing upsert error for sector ${sector}:`, upsertError)
        results[sector] = `error - ${upsertError.message}`
        continue
      }

      results[sector] = 'published'
    } catch (err) {
      console.error(`generate-daily-briefing error for sector ${sector}:`, err)
      results[sector] = `error - ${err instanceof Error ? err.message : String(err)}`
    }
  }

  return NextResponse.json({ success: true, results })
}
