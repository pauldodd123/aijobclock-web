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

function trimToFit(text: string, max: number): string {
  if (text.length <= max) return text
  const trimmed = text.slice(0, max - 1)
  const lastSpace = trimmed.lastIndexOf(' ')
  if (lastSpace > 0) return trimmed.slice(0, lastSpace) + '…'
  return trimmed + '…'
}

async function generateTweetThread(
  headline: string,
  summary: string,
  contentExcerpt: string,
  slug: string,
): Promise<string[]> {
  const model = getClient().getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction:
      'You write contrarian tweets about AI and jobs. Professional but accessible, like a sharp newspaper columnist. No words like \'revolutionizing\', \'transforming\', \'disrupting\', \'paradigm\', \'unprecedented\'. No hashtags. No links. No ellipsis. Each tweet under its character limit.',
  })

  const userPrompt = `Write a 3-tweet thread about this opinion piece:

Headline: ${headline}
Summary: ${summary}

Article excerpt:
${contentExcerpt}

Rules:
- Tweet 1 (max 260 chars): Hook — contrarian, attention-grabbing opening
- Tweet 2 (max 270 chars): Key evidence — the most compelling data point or argument
- Tweet 3 (max 270 chars): Nuanced takeaway — what this really means, complexity acknowledged`

  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    tools: [ // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {
        functionDeclarations: [
          {
            name: 'generate_opinion_thread',
            description: 'Generate a 3-tweet thread for an opinion piece',
            parameters: {
              type: SchemaType.OBJECT as const,
              properties: {
                tweet1: { type: SchemaType.STRING as const, description: 'Hook tweet, max 260 chars' },
                tweet2: { type: SchemaType.STRING as const, description: 'Key evidence tweet, max 270 chars' },
                tweet3: { type: SchemaType.STRING as const, description: 'Nuanced takeaway tweet, max 270 chars' },
              },
              required: ['tweet1', 'tweet2', 'tweet3'],
            },
          },
        ],
      },
    ],
    toolConfig: {
      functionCallingConfig: {
        mode: FunctionCallingMode.ANY,
        allowedFunctionNames: ['generate_opinion_thread'],
      },
    },
  })

  const fc = result.response.candidates?.[0]?.content?.parts?.[0]?.functionCall
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const args = fc?.args as any

  const tweet1 = trimToFit(args?.tweet1 ?? '', 260)
  const tweet2 = trimToFit(args?.tweet2 ?? '', 270)
  const tweet3 = trimToFit(args?.tweet3 ?? '', 270)
  const tweet4 = `📊 Full piece with data and sources:\n\naijobclock.com/blog/${slug}\n\nWhat's your take? Reply below 👇\n\nFollow @AIJobclock for weekly contrarian analysis\n\n#AI #FutureOfWork #AIJobClock`

  return [tweet1, tweet2, tweet3, tweet4]
}

export async function POST(request: NextRequest) {
  const authorized = await checkAuth(request)
  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const tweetOnly: boolean = body.tweet_only === true
  const seedContext: string | undefined = body.seed_context

  const supabase = await createAdminClient()

  // --- tweet_only mode ---
  if (tweetOnly) {
    const { data: opinionPiece } = await supabase
      .from('opinion_pieces')
      .select('headline, summary, blog_post_id')
      .eq('active', true)
      .single()

    if (!opinionPiece) {
      return NextResponse.json({ error: 'No active opinion piece found' }, { status: 404 })
    }

    const { data: blogPost } = await supabase
      .from('blog_posts')
      .select('slug, content')
      .eq('id', opinionPiece.blog_post_id)
      .single()

    if (!blogPost) {
      return NextResponse.json({ error: 'Blog post not found' }, { status: 404 })
    }

    const contentExcerpt = (blogPost.content as string).slice(0, 1000)

    try {
      const thread = await generateTweetThread(
        opinionPiece.headline,
        opinionPiece.summary,
        contentExcerpt,
        blogPost.slug,
      )
      return NextResponse.json({ success: true, mode: 'tweet_only', thread })
    } catch (err) {
      console.error('generate-opinion-piece tweet_only error:', err)
      return NextResponse.json(
        { error: 'Failed to generate tweet thread' },
        { status: 500 },
      )
    }
  }

  // --- Normal mode ---

  // 1. Deactivate existing opinion pieces
  await supabase.from('opinion_pieces').update({ active: false }).eq('active', true)

  // 2. Search for contrarian narratives via Firecrawl
  const firecrawlQueries = [
    '"AI jobs" growing OR hiring OR increase 2025',
    '"software developer" demand OR hiring stabilizing 2025',
    '"AI" creating jobs OR "new roles" OR upskilling',
    'AI employment positive OR opportunity OR growth',
    '"future of work" optimistic AI 2025',
  ]

  const firecrawlApiKey = process.env.FIRECRAWL_API_KEY
  const urlsSeen = new Set<string>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const searchResults: any[] = []

  await Promise.allSettled(
    firecrawlQueries.map(async (query) => {
      try {
        const res = await fetch('https://api.firecrawl.dev/v1/search', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${firecrawlApiKey}`,
          },
          body: JSON.stringify({ query, limit: 5, tbs: 'qdr:w' }),
        })
        if (!res.ok) return
        const data = await res.json()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const results: any[] = data.data ?? data.results ?? []
        for (const item of results) {
          const url: string = item.url ?? item.link ?? ''
          if (!url || urlsSeen.has(url)) continue
          urlsSeen.add(url)
          searchResults.push(item)
        }
      } catch (e) {
        console.error('Firecrawl search error for query:', query, e)
      }
    }),
  )

  // 3. Fetch recent Opinion blog posts for previousOpinions context
  const { data: recentOpinions } = await supabase
    .from('blog_posts')
    .select('title, summary, published_date')
    .eq('sector', 'Opinion')
    .order('published_date', { ascending: false })
    .limit(10)

  const previousOpinions =
    recentOpinions && recentOpinions.length > 0
      ? `\n\nRecent opinion pieces (avoid repeating these angles):\n${recentOpinions
          .map(
            (p: { title: string; summary: string; published_date: string }) =>
              `- ${p.published_date}: ${p.title} — ${p.summary}`,
          )
          .join('\n')}\n`
      : ''

  const sourcesContext =
    searchResults.length > 0
      ? `\n\nResearch sources found:\n${searchResults
          .slice(0, 20)
          .map(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (r: any) => `- ${r.title ?? r.url}: ${r.description ?? r.snippet ?? ''}`,
          )
          .join('\n')}`
      : ''

  const seedContextStr = seedContext ? `\n\nSeed context from editor: ${seedContext}` : ''

  // 4. Generate opinion piece via Gemini
  const model = getClient().getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction: `You are an editorial columnist for AI Job Clock. Write "Against the Tide" opinion pieces: 800-1200 words, contrarian, data-driven. Think FT op-ed. Challenge conventional AI doom or hype narratives with evidence. Be specific, cite numbers, challenge assumptions. Professional but readable.`,
  })

  const userPrompt = `Write an "Against the Tide" opinion piece for AI Job Clock based on the research below.

Requirements:
- Contrarian angle: push back against prevailing AI-jobs doom narrative with evidence
- 800-1200 words, full markdown
- Data-driven: cite specific numbers and studies
- FT op-ed quality: professional, accessible, sharp
- Fresh angle not covered in recent pieces
${previousOpinions}${sourcesContext}${seedContextStr}`

  let opinionArgs: { title: string; summary: string; content: string } | undefined

  try {
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      tools: [ // eslint-disable-next-line @typescript-eslint/no-explicit-any
        {
          functionDeclarations: [
            {
              name: 'publish_opinion',
              description: 'Publish the opinion piece with title, summary, and full markdown content',
              parameters: {
                type: SchemaType.OBJECT as const,
                properties: {
                  title: { type: SchemaType.STRING as const, description: 'Punchy headline (without the "Against the Tide:" prefix)' },
                  summary: { type: SchemaType.STRING as const, description: '1-2 sentence summary of the contrarian argument' },
                  content: { type: SchemaType.STRING as const, description: 'Full markdown content 800-1200 words' },
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
          allowedFunctionNames: ['publish_opinion'],
        },
      },
    })

    const fc = result.response.candidates?.[0]?.content?.parts?.[0]?.functionCall
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    opinionArgs = fc?.args as any
  } catch (err) {
    console.error('generate-opinion-piece Gemini error:', err)
    return NextResponse.json(
      { error: 'Failed to generate opinion piece' },
      { status: 500 },
    )
  }

  if (!opinionArgs?.title || !opinionArgs?.content) {
    return NextResponse.json(
      { error: 'No content generated from AI' },
      { status: 500 },
    )
  }

  const fullTitle = `Against the Tide: ${opinionArgs.title}`
  const today = new Date()
  const publishedDate = today.toISOString().split('T')[0]
  const slug = fullTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)

  // 5. Insert blog_post
  const { data: blogPost, error: blogError } = await supabase
    .from('blog_posts')
    .insert({
      sector: 'Opinion',
      title: fullTitle,
      summary: opinionArgs.summary ?? '',
      content: opinionArgs.content,
      published_date: publishedDate,
      slug,
    })
    .select('id')
    .single()

  if (blogError || !blogPost) {
    console.error('generate-opinion-piece blog_posts insert error:', blogError)
    return NextResponse.json(
      { error: 'Failed to save blog post' },
      { status: 500 },
    )
  }

  // 6. Insert opinion_pieces record
  const expiresAt = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
  const { error: opinionError } = await supabase.from('opinion_pieces').insert({
    headline: fullTitle,
    summary: opinionArgs.summary ?? '',
    blog_post_id: blogPost.id,
    active: true,
    expires_at: expiresAt,
  })

  if (opinionError) {
    console.error('generate-opinion-piece opinion_pieces insert error:', opinionError)
    return NextResponse.json(
      { error: 'Failed to save opinion piece record' },
      { status: 500 },
    )
  }

  // 7. Generate tweet thread
  const contentExcerpt = opinionArgs.content.slice(0, 1000)
  let thread: string[] = []
  try {
    thread = await generateTweetThread(fullTitle, opinionArgs.summary ?? '', contentExcerpt, slug)
  } catch (err) {
    console.error('generate-opinion-piece tweet thread error:', err)
    // Non-fatal — return success with empty thread
  }

  return NextResponse.json({
    success: true,
    title: fullTitle,
    blogPostId: blogPost.id,
    thread,
  })
}
