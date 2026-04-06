import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getClient, generateImage } from '@/lib/google-ai'
import { FunctionCallingMode, SchemaType } from '@google/generative-ai'
import { createHmac } from 'crypto'

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

async function checkAuth(request: NextRequest): Promise<boolean> {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true

  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user && user.email === 'paul.dodd@gmail.com') return true

  return false
}

// ---------------------------------------------------------------------------
// OAuth 1.0a helpers
// ---------------------------------------------------------------------------

function percentEncode(str: string): string {
  return encodeURIComponent(str).replace(/[!'()*]/g, (c) =>
    '%' + c.charCodeAt(0).toString(16).toUpperCase()
  )
}

function hmacSha1(key: string, data: string): string {
  return createHmac('sha1', key).update(data).digest('base64')
}

async function buildOAuthHeader(
  method: string,
  url: string,
  consumerKey: string,
  consumerSecret: string,
  accessToken: string,
  accessTokenSecret: string,
): Promise<string> {
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const nonce =
    Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2)
  const params: Record<string, string> = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: nonce,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: timestamp,
    oauth_token: accessToken,
    oauth_version: '1.0',
  }
  const paramString = Object.keys(params)
    .sort()
    .map((k) => `${percentEncode(k)}=${percentEncode(params[k])}`)
    .join('&')
  const baseString = `${method}&${percentEncode(url)}&${percentEncode(paramString)}`
  const signingKey = `${percentEncode(consumerSecret)}&${percentEncode(accessTokenSecret)}`
  const signature = hmacSha1(signingKey, baseString)
  params['oauth_signature'] = signature
  const header = Object.keys(params)
    .sort()
    .map((k) => `${percentEncode(k)}="${percentEncode(params[k])}"`)
    .join(', ')
  return `OAuth ${header}`
}

// ---------------------------------------------------------------------------
// Twitter helpers
// ---------------------------------------------------------------------------

async function postTweet(
  text: string,
  ck: string,
  cs: string,
  at: string,
  ats: string,
  replyToId?: string,
  mediaIds?: string[],
  pollOptions?: string[],
): Promise<{ id: string; success: boolean; error?: string }> {
  const tweetUrl = 'https://api.x.com/2/tweets'
  const auth = await buildOAuthHeader('POST', tweetUrl, ck, cs, at, ats)
  const body: Record<string, unknown> = { text }
  if (replyToId) body.reply = { in_reply_to_tweet_id: replyToId }
  if (mediaIds?.length) body.media = { media_ids: mediaIds }
  if (pollOptions?.length) {
    body.poll = { options: pollOptions, duration_minutes: 1440 }
  }
  const res = await fetch(tweetUrl, {
    method: 'POST',
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (res.ok) {
    const data = await res.json()
    return { id: data.data?.id, success: true }
  }
  const errBody = await res.text()
  console.error('Tweet failed:', errBody)
  return { id: '', success: false, error: errBody }
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

async function postThread(
  tweets: string[],
  ck: string,
  cs: string,
  at: string,
  ats: string,
  firstTweetMediaIds?: string[],
  lastTweetPollOptions?: string[],
): Promise<Array<{ text: string; id?: string; success: boolean; error?: string }>> {
  const results: Array<{ text: string; id?: string; success: boolean; error?: string }> = []
  let lastId: string | undefined

  for (let i = 0; i < tweets.length; i++) {
    if (i > 0) await delay(1500)
    const mediaIds = i === 0 ? firstTweetMediaIds : undefined
    const pollOptions = i === tweets.length - 1 ? lastTweetPollOptions : undefined
    const result = await postTweet(tweets[i], ck, cs, at, ats, lastId, mediaIds, pollOptions)
    results.push({ text: tweets[i], ...result })
    if (!result.success) break
    lastId = result.id
  }

  return results
}

async function uploadMediaToTwitter(
  base64DataUrl: string,
  ck: string,
  cs: string,
  at: string,
  ats: string,
): Promise<string | null> {
  const rawBase64 = base64DataUrl.replace(/^data:image\/\w+;base64,/, '')
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      if (attempt > 0) await delay(2000 * attempt)
      const mediaUrl = 'https://upload.twitter.com/1.1/media/upload.json'
      const auth = await buildOAuthHeader('POST', mediaUrl, ck, cs, at, ats)
      const formData = new FormData()
      formData.append('media_data', rawBase64)
      formData.append('media_category', 'tweet_image')
      const res = await fetch(mediaUrl, {
        method: 'POST',
        headers: { Authorization: auth },
        body: formData,
      })
      if (res.ok) {
        const data = await res.json()
        return data.media_id_string
      }
      const errText = await res.text()
      console.error(`Media upload attempt ${attempt + 1} failed:`, res.status, errText)
      if (res.status !== 401 && res.status !== 503) break
    } catch (e) {
      console.error(`Media upload attempt ${attempt + 1} error:`, e)
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function trimToFit(text: string, max: number): string {
  if (text.length <= max) return text
  const trimmed = text.slice(0, max - 1)
  const lastSpace = trimmed.lastIndexOf(' ')
  if (lastSpace > 0) return trimmed.slice(0, lastSpace) + '…'
  return trimmed + '…'
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CONSENSUS_SEARCHES = [
  '"AI replacing" jobs layoffs 2025 2026',
  '"automation" workforce displacement evidence data',
  'AI job losses "white collar" reports 2025',
  '"artificial intelligence" hiring freeze cuts impact',
  '"AI displacement" workers evidence study',
]

const POLL_OPTIONS = [
  'Data clearly supports it',
  'Overstated by media',
  'Depends on the sector',
  'Need more evidence',
]

// ---------------------------------------------------------------------------
// AI helpers
// ---------------------------------------------------------------------------

async function generateTweetThread(
  headline: string,
  summary: string,
  contentExcerpt: string,
): Promise<string[]> {
  const cleanHeadline = headline.replace(/^With the Surf:\s*/i, '')

  const model = getClient().getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction:
      "You write data-driven tweets about AI and jobs from the mainstream consensus perspective. Write in clear, confident English — professional but accessible, like a sharp newspaper columnist making the strongest case for what the data clearly shows. Evidence-based and unflinching. Concise sentences, varied rhythm. Contractions are fine, slang is not. NEVER use words like 'revolutionizing', 'transforming', 'disrupting', 'paradigm', 'landscape', 'unprecedented', 'game-changing'. No hashtags. No links. No ellipsis. Each tweet MUST be under its character limit.",
  })

  const result = await model.generateContent({
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: `Write a 3-tweet thread for this With the Surf opinion piece.

Headline: ${cleanHeadline}
Summary: ${summary}
Article excerpt: ${contentExcerpt}

Tweet 1 (max 260 chars): Compelling hook that reinforces the mainstream data
Tweet 2 (max 270 chars): The strongest evidence supporting the consensus
Tweet 3 (max 270 chars): What the data means going forward — clear-eyed and confident`,
          },
        ],
      },
    ],
    tools: [
      {
        functionDeclarations: [
          {
            name: 'generate_opinion_thread',
            description: 'Generate a 3-tweet opinion thread body. Tweet 4 (poll) is added automatically.',
            parameters: {
              type: SchemaType.OBJECT as const,
              properties: {
                tweet1: {
                  type: SchemaType.STRING as const,
                  description: 'Compelling hook that reinforces the mainstream data. Max 260 chars. No links, no hashtags.',
                },
                tweet2: {
                  type: SchemaType.STRING as const,
                  description: 'The strongest evidence supporting the consensus. Max 270 chars. No links, no hashtags.',
                },
                tweet3: {
                  type: SchemaType.STRING as const,
                  description: 'What the data means going forward — clear-eyed and confident. Max 270 chars. No links, no hashtags.',
                },
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

  if (!args?.tweet1) {
    return []
  }

  return [
    `🌊 With the Surf\n\n${trimToFit(args.tweet1, 258)}`,
    trimToFit(args.tweet2 ?? '', 275),
    trimToFit(args.tweet3 ?? '', 275),
    trimToFit('🌊 Where do you stand on this?', 200),
  ]
}

function buildFallbackThread(headline: string, summary: string): string[] {
  const cleanHeadline = headline.replace(/^With the Surf:\s*/i, '')
  return [
    trimToFit(`🌊 With the Surf\n\n${cleanHeadline}`, 280),
    trimToFit(summary || 'The data is clear — and it backs the consensus.', 280),
    trimToFit('When the evidence points one way, follow it. Here\'s the full analysis.', 280),
    trimToFit('🌊 Where do you stand on this?', 200),
  ]
}

async function generateSurfImage(title: string): Promise<string | null> {
  const cleanTitle = title.replace(/^With the Surf:\s*/i, '')
  return generateImage(
    `Create an editorial opinion infographic for Twitter/X (landscape 16:9). Topic: "With the Surf: ${cleanTitle}".

STRICT COLOR RULES — follow exactly:
- Background: solid very dark teal/black (#0A2028)
- Primary accent color: TEAL (#0D9488) — use for headline, key phrases, divider bars, highlight elements
- Secondary accent: bright cyan (#00B4D8) — use sparingly for the ⚡ logo, small labels
- Text: pure white (#FFFFFF) on dark background — NEVER place light colors on grey panels
- NO grey cards/panels — if using sections, use slightly lighter dark teal (#153038)

Content style: "With the Surf" label at top in teal, bold headline about mainstream consensus, key stats and evidence supporting the mainstream view, simple white icons. "AI Job Clock" watermark bottom-right. Analytical, Economist-style feel.`,
  )
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const authorized = await checkAuth(request)
  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const tweetOnly: boolean = body.tweet_only === true
  const seedContext: string | undefined = body.seed_context

  const ck = process.env.TWITTER_API_KEY!
  const cs = process.env.TWITTER_API_SECRET!
  const at = process.env.TWITTER_ACCESS_TOKEN!
  const ats = process.env.TWITTER_ACCESS_TOKEN_SECRET!

  // -------------------------------------------------------------------------
  // tweet_only mode — tweet the active with_the_surf piece
  // -------------------------------------------------------------------------
  if (tweetOnly) {
    const supabase = await createAdminClient()

    const { data: active } = await supabase
      .from('opinion_pieces')
      .select('headline, summary, blog_post_id')
      .eq('active', true)
      .eq('series', 'with_the_surf')
      .limit(1)
      .single()

    if (!active?.blog_post_id) {
      return NextResponse.json(
        { error: 'No active With the Surf opinion piece found' },
        { status: 404 },
      )
    }

    const { data: blogPost } = await supabase
      .from('blog_posts')
      .select('slug, content')
      .eq('id', active.blog_post_id)
      .single()

    if (!blogPost) {
      return NextResponse.json({ error: 'Blog post not found' }, { status: 404 })
    }

    let thread: string[]
    try {
      thread = await generateTweetThread(
        active.headline,
        active.summary,
        (blogPost.content as string).slice(0, 600),
      )
    } catch (err) {
      console.error('generate-with-the-surf tweet thread error:', err)
      thread = []
    }

    if (thread.length === 0) {
      thread = buildFallbackThread(active.headline, active.summary)
    }

    let mediaIds: string[] | undefined
    try {
      const imageDataUrl = await generateSurfImage(active.headline)
      if (imageDataUrl) {
        const mediaId = await uploadMediaToTwitter(imageDataUrl, ck, cs, at, ats)
        if (mediaId) mediaIds = [mediaId]
      }
    } catch (imgErr) {
      console.error('generate-with-the-surf image error:', imgErr)
    }

    const threadResults = await postThread(thread, ck, cs, at, ats, mediaIds, POLL_OPTIONS)
    console.log('generate-with-the-surf tweet_only thread:', JSON.stringify(threadResults))

    return NextResponse.json({ success: true, mode: 'tweet_only', thread: threadResults })
  }

  // -------------------------------------------------------------------------
  // Normal mode — generate article + tweet
  // -------------------------------------------------------------------------
  const supabase = await createAdminClient()

  // 1. Deactivate previous with_the_surf opinion pieces only
  await supabase
    .from('opinion_pieces')
    .update({ active: false })
    .eq('active', true)
    .eq('series', 'with_the_surf')

  // 2. Search for consensus/mainstream AI displacement narratives via Firecrawl
  console.log('Searching for consensus AI displacement narratives...')
  const firecrawlApiKey = process.env.FIRECRAWL_API_KEY
  const urlsSeen = new Set<string>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const searchResults: any[] = []

  await Promise.allSettled(
    CONSENSUS_SEARCHES.map(async (query) => {
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

  console.log(`Found ${searchResults.length} unique consensus sources`)

  // 3. Fetch recent Opinion blog posts to avoid repetition
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
          .slice(0, 15)
          .map(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (r: any) =>
              `- ${r.title ?? r.url}: ${r.description ?? r.snippet ?? r.markdown?.slice(0, 300) ?? ''}`,
          )
          .join('\n')}`
      : ''

  const seedContextStr = seedContext ? `\n\nSeed context from editor: ${seedContext}` : ''

  // 4. Generate opinion piece via Gemini
  const model = getClient().getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction: `You are the editorial columnist for AI Job Clock (aijobclock.com), writing a weekly "With the Surf" opinion piece. Your job is to write a data-driven analysis that REINFORCES the prevailing narrative about AI displacing jobs where the evidence clearly supports it. You're not a doom-monger — you're a rigorous analyst who follows the data wherever it leads, and right now the data backs the consensus view in many areas. TONE: Confident, evidence-based, clear-eyed. Think Financial Times lead column — not alarmist, but unflinching about what the numbers show. Use specific data points and cite sources. STRUCTURE: 800-1200 words in markdown with ## and ### headings. Do NOT include a title heading. This is NOT doom-mongering — it's clear-eyed consensus analysis backed by hard data.`,
  })

  const userPrompt = `Write this week's "With the Surf" opinion piece for AI Job Clock.

Requirements:
- Reinforces the consensus narrative about AI displacement where evidence supports it
- 800-1200 words, full markdown (no title heading)
- Data-driven: cite specific numbers and studies
- FT op-ed quality: professional, accessible, sharp
- Fresh angle not covered in recent pieces
${previousOpinions}${sourcesContext}${seedContextStr}`

  let opinionArgs: { title: string; summary: string; content: string } | undefined

  try {
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      tools: [
        {
          functionDeclarations: [
            {
              name: 'publish_opinion',
              description: 'Publish the With the Surf opinion piece',
              parameters: {
                type: SchemaType.OBJECT as const,
                properties: {
                  title: {
                    type: SchemaType.STRING as const,
                    description: 'Compelling opinion piece title (no "With the Surf:" prefix — added automatically)',
                  },
                  summary: {
                    type: SchemaType.STRING as const,
                    description: 'One-sentence summary for the banner (max 120 chars)',
                  },
                  content: {
                    type: SchemaType.STRING as const,
                    description: 'Full markdown article content (800-1200 words)',
                  },
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
    console.error('generate-with-the-surf Gemini error:', err)
    return NextResponse.json({ error: 'Failed to generate opinion piece' }, { status: 500 })
  }

  if (!opinionArgs?.title || !opinionArgs?.content) {
    return NextResponse.json({ error: 'No content generated from AI' }, { status: 500 })
  }

  console.log('Generated With the Surf piece:', opinionArgs.title)

  // 5. Insert blog_post
  const fullTitle = `With the Surf: ${opinionArgs.title}`
  const today = new Date()
  const publishedDate = today.toISOString().split('T')[0]
  const slug = fullTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)

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
    console.error('generate-with-the-surf blog_posts insert error:', blogError)
    return NextResponse.json({ error: 'Failed to save blog post' }, { status: 500 })
  }

  // 6. Insert opinion_pieces with series="with_the_surf"
  const expiresAt = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
  const { error: opinionError } = await supabase.from('opinion_pieces').insert({
    headline: fullTitle,
    summary: opinionArgs.summary ?? '',
    blog_post_id: blogPost.id,
    active: true,
    series: 'with_the_surf',
    expires_at: expiresAt,
  })

  if (opinionError) {
    console.error('generate-with-the-surf opinion_pieces insert error:', opinionError)
  }

  // 7. Generate tweet thread
  const contentExcerpt = opinionArgs.content.slice(0, 600)
  let thread: string[] = []
  try {
    thread = await generateTweetThread(fullTitle, opinionArgs.summary ?? '', contentExcerpt)
  } catch (err) {
    console.error('generate-with-the-surf tweet thread error:', err)
  }

  if (thread.length === 0) {
    thread = buildFallbackThread(fullTitle, opinionArgs.summary ?? '')
  }

  // 8. Generate image and upload
  let mediaIds: string[] | undefined
  try {
    const imageDataUrl = await generateSurfImage(fullTitle)
    if (imageDataUrl) {
      const mediaId = await uploadMediaToTwitter(imageDataUrl, ck, cs, at, ats)
      if (mediaId) mediaIds = [mediaId]
    }
  } catch (imgErr) {
    console.error('generate-with-the-surf image error:', imgErr)
  }

  // 9. Post thread
  const threadResults = await postThread(thread, ck, cs, at, ats, mediaIds, POLL_OPTIONS)
  console.log('generate-with-the-surf thread results:', JSON.stringify(threadResults))

  return NextResponse.json({
    success: true,
    title: fullTitle,
    blogPostId: blogPost.id,
    thread: threadResults,
  })
}
