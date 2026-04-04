import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getClient, generateImage } from '@/lib/google-ai'
import { FunctionCallingMode, SchemaType } from '@google/generative-ai'
import { createHmac } from 'crypto'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

// ---------------------------------------------------------------------------
// OAuth 1.0a + Twitter helpers
// ---------------------------------------------------------------------------

function percentEncode(str: string): string {
  return encodeURIComponent(str).replace(/[!'()*]/g, (c) =>
    '%' + c.charCodeAt(0).toString(16).toUpperCase(),
  )
}

function hmacSha1(key: string, data: string): string {
  return createHmac('sha1', key).update(data).digest('base64')
}

async function buildOAuthHeader(
  method: string,
  url: string,
  ck: string,
  cs: string,
  at: string,
  ats: string,
): Promise<string> {
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const nonce =
    Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2)
  const params: Record<string, string> = {
    oauth_consumer_key: ck,
    oauth_nonce: nonce,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: timestamp,
    oauth_token: at,
    oauth_version: '1.0',
  }
  const paramString = Object.keys(params)
    .sort()
    .map((k) => `${percentEncode(k)}=${percentEncode(params[k])}`)
    .join('&')
  const signingKey = `${percentEncode(cs)}&${percentEncode(ats)}`
  params['oauth_signature'] = hmacSha1(
    signingKey,
    `${method}&${percentEncode(url)}&${percentEncode(paramString)}`,
  )
  const header = Object.keys(params)
    .sort()
    .map((k) => `${percentEncode(k)}="${percentEncode(params[k])}"`)
    .join(', ')
  return `OAuth ${header}`
}

async function postTweet(
  text: string,
  ck: string,
  cs: string,
  at: string,
  ats: string,
  replyToId?: string,
  mediaIds?: string[],
  poll?: { options: string[]; duration_minutes: number },
): Promise<{ id: string; success: boolean; error?: string }> {
  const url = 'https://api.x.com/2/tweets'
  const auth = await buildOAuthHeader('POST', url, ck, cs, at, ats)
  const body: Record<string, unknown> = { text }
  if (replyToId) body.reply = { in_reply_to_tweet_id: replyToId }
  if (mediaIds?.length) body.media = { media_ids: mediaIds }
  if (poll && poll.options.length >= 2)
    body.poll = { options: poll.options.slice(0, 4), duration_minutes: poll.duration_minutes }
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (res.ok) return { id: (await res.json()).data?.id, success: true }
  return { id: '', success: false, error: await res.text() }
}

async function postThread(
  tweets: string[],
  ck: string,
  cs: string,
  at: string,
  ats: string,
  firstTweetMediaIds?: string[],
  lastTweetPoll?: { options: string[]; duration_minutes: number },
): Promise<Array<{ text: string; result: { id: string; success: boolean; error?: string } }>> {
  const results: Array<{ text: string; result: { id: string; success: boolean; error?: string } }> =
    []
  let lastId: string | undefined
  for (let i = 0; i < tweets.length; i++) {
    if (i > 0) await delay(1500)
    const poll = i === tweets.length - 1 ? lastTweetPoll : undefined
    const result = await postTweet(
      tweets[i],
      ck,
      cs,
      at,
      ats,
      lastId,
      i === 0 ? firstTweetMediaIds : undefined,
      poll,
    )
    results.push({ text: tweets[i], result })
    if (!result.success) break
    lastId = result.id
  }
  return results
}

async function uploadMediaToTwitter(
  dataUrl: string,
  ck: string,
  cs: string,
  at: string,
  ats: string,
): Promise<string | null> {
  const raw = dataUrl.replace(/^data:image\/\w+;base64,/, '')
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      if (attempt > 0) await delay(2000 * attempt)
      const url = 'https://upload.twitter.com/1.1/media/upload.json'
      const auth = await buildOAuthHeader('POST', url, ck, cs, at, ats)
      const formData = new FormData()
      formData.append('media_data', raw)
      formData.append('media_category', 'tweet_image')
      const res = await fetch(url, { method: 'POST', headers: { Authorization: auth }, body: formData })
      if (res.ok) return (await res.json()).media_id_string
      const errText = await res.text()
      console.error(`Media upload attempt ${attempt + 1} failed:`, res.status, errText)
      if (res.status !== 401 && res.status !== 503) break
    } catch (e) {
      console.error(`Media upload attempt ${attempt + 1} error:`, e)
    }
  }
  return null
}

function trimToFit(text: string, max: number): string {
  if (text.length <= max) return text
  const candidate = text.slice(0, max)
  const sentenceEnd = Math.max(
    candidate.lastIndexOf('. '),
    candidate.lastIndexOf('.\n'),
    candidate.lastIndexOf('! '),
    candidate.lastIndexOf('? '),
  )
  if (sentenceEnd > max * 0.5) return text.slice(0, sentenceEnd + 1).trim()
  const lastSpace = candidate.lastIndexOf(' ')
  if (lastSpace > 0) return candidate.slice(0, lastSpace) + '…'
  return candidate + '…'
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

// ---------------------------------------------------------------------------
// MCP protocol constants
// ---------------------------------------------------------------------------

const MCP_PROTOCOL_VERSION = '2024-11-05'
const SERVER_INFO = { name: 'ai-job-clock-articles', version: '2.0.0' }

// ---------------------------------------------------------------------------
// Tool definitions (used for tools/list)
// ---------------------------------------------------------------------------

const TOOLS = [
  {
    name: 'get_todays_articles',
    description:
      "Get today's AI job displacement news articles. Returns titles, summaries, sectors, source names, and URLs.",
    inputSchema: {
      type: 'object',
      properties: {
        sector: {
          type: 'string',
          description:
            'Optional sector filter: Tech, Finance, Healthcare, Manufacturing, Retail, Media, Legal, Education, Transportation',
        },
        limit: { type: 'number', description: 'Max articles to return (default 20)' },
      },
    },
  },
  {
    name: 'get_daily_briefing',
    description:
      'Get the latest AI-generated daily briefing blog post for a sector.',
    inputSchema: {
      type: 'object',
      properties: {
        sector: { type: 'string', description: 'Sector to get briefing for (default: Tech)' },
      },
    },
  },
  {
    name: 'get_sector_stats',
    description:
      'Get stats for all sectors including estimated jobs at risk, article counts, and trend directions.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_breaking_news',
    description: 'Get any active breaking news about AI job displacement.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'generate_editors_thoughts',
    description:
      "Generate an Editor's Thoughts opinion piece on a given topic. Requires an API key. The piece is researched via web search, written by AI, published as a blog post and opinion piece, and optionally tweeted as a thread.",
    inputSchema: {
      type: 'object',
      properties: {
        api_key: {
          type: 'string',
          description: 'Required API key — obtain from the site owner',
        },
        topic: {
          type: 'string',
          description:
            "The topic or question to write about, e.g. 'Will AI replace paralegals by 2027?'",
        },
        headline_idea: {
          type: 'string',
          description:
            'Optional headline idea. Grammar/spelling will be corrected but the punchy spirit preserved.',
        },
        base_article: {
          type: 'string',
          description: 'Optional URL or pasted text of an article to base the opinion piece on.',
        },
        sector: {
          type: 'string',
          description: 'Sector lens (Tech, Finance, Healthcare, etc.). Default: general cross-sector',
        },
        tone: {
          type: 'string',
          description: 'Tone: balanced (default), provocative, optimistic, or cautious',
        },
        skip_research: {
          type: 'boolean',
          description: 'Skip web research and rely on AI knowledge only (default false)',
        },
        tweet_only: {
          type: 'boolean',
          description: "Skip generation — just tweet the active Editor's Thoughts piece (default false)",
        },
      },
      required: ['api_key', 'topic'],
    },
  },
  {
    name: 'reply_for_tweet',
    description:
      'Generate 3 length variants (short/medium/long) of a human-toned reply to a tweet about AI and jobs. Supports personality, energy, and spiciness controls.',
    inputSchema: {
      type: 'object',
      properties: {
        tweet_text: { type: 'string', description: 'The full text of the tweet to reply to' },
        author_username: {
          type: 'string',
          description: 'Twitter username of the tweet author',
        },
        conversation_context: {
          type: 'string',
          description: 'Optional prior tweets or reply chain for context',
        },
        personality: {
          type: 'string',
          enum: ['grounded', 'punchy', 'witty', 'contrarian', 'empathetic', 'analyst'],
          description: 'Voice style for the reply (default: grounded)',
        },
        energy: {
          type: 'string',
          enum: ['low', 'medium', 'high'],
          description: 'Intensity level (default: medium)',
        },
        spiciness: {
          type: 'number',
          description:
            'Boldness dial from 0.0 (safe/neutral) to 1.0 (bolder phrasing). Default: 0.3',
        },
      },
      required: ['tweet_text'],
    },
  },
]

// ---------------------------------------------------------------------------
// Tool handlers
// ---------------------------------------------------------------------------

type McpContent = { type: 'text'; text: string }
type McpResult = { content: McpContent[] }

const VALID_SECTORS = [
  'Tech',
  'Finance',
  'Healthcare',
  'Manufacturing',
  'Retail',
  'Media',
  'Legal',
  'Education',
  'Transportation',
]
const VALID_TONES = ['balanced', 'provocative', 'optimistic', 'cautious']

const PERSONALITY_GUIDES: Record<string, string> = {
  grounded:
    'Calm, practical, plain English. State things simply and directly. No drama, no hype — just clear thinking.',
  punchy: 'Short, direct, confident. Lead with your point. Cut every unnecessary word. Land hard.',
  witty: "Light humor, never cringe. A clever observation or turn of phrase. Smart, not try-hard.",
  contrarian:
    "Respectfully challenge assumptions. Flip the framing. Ask the question nobody's asking. Stay curious, not combative.",
  empathetic:
    'Human-centered, supportive tone. Acknowledge the real impact on people. Warm but not soft.',
  analyst:
    'Data-first, sharp but readable. Reference specifics. Think like a researcher writing for a smart friend.',
}

const BANNED_PHRASES = [
  'important development',
  'notable challenge',
  'crucial aspect',
  'it highlights',
  'significant impact',
  'worth noting',
  'interesting to see',
  'great point',
  'key takeaway',
  'paradigm shift',
  'game changer',
  'food for thought',
  'remains to be seen',
  'only time will tell',
  'raises important questions',
]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleTool(toolName: string, args: Record<string, any>): Promise<McpResult> {
  const supabase = await createAdminClient()

  // ── get_todays_articles ────────────────────────────────────────────
  if (toolName === 'get_todays_articles') {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    let query = supabase
      .from('news_articles')
      .select('id, title, url, summary, sector, source_name, scraped_at')
      .gte('scraped_at', today.toISOString())
      .order('scraped_at', { ascending: false })
      .limit(args.limit || 20)

    if (args.sector) query = query.eq('sector', args.sector)
    const { data, error } = await query
    if (error) return { content: [{ type: 'text', text: `Error: ${error.message}` }] }

    if (!data?.length) {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
      let fb = supabase
        .from('news_articles')
        .select('id, title, url, summary, sector, source_name, scraped_at')
        .gte('scraped_at', yesterday.toISOString())
        .order('scraped_at', { ascending: false })
        .limit(args.limit || 20)
      if (args.sector) fb = fb.eq('sector', args.sector)
      const { data: fbData } = await fb
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              { note: 'No articles today, showing last 24h', articles: fbData || [] },
              null,
              2,
            ),
          },
        ],
      }
    }

    return { content: [{ type: 'text', text: JSON.stringify({ articles: data }, null, 2) }] }
  }

  // ── get_daily_briefing ─────────────────────────────────────────────
  if (toolName === 'get_daily_briefing') {
    const { data, error } = await supabase
      .from('blog_posts')
      .select('id, title, slug, sector, summary, content, published_date')
      .eq('sector', args.sector || 'Tech')
      .order('published_date', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) return { content: [{ type: 'text', text: `Error: ${error.message}` }] }
    if (!data) return { content: [{ type: 'text', text: 'No briefing found.' }] }
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
  }

  // ── get_sector_stats ───────────────────────────────────────────────
  if (toolName === 'get_sector_stats') {
    const { data, error } = await supabase
      .from('sector_stats')
      .select('sector_name, estimated_jobs_at_risk, trend_direction, article_count, last_updated')
      .order('estimated_jobs_at_risk', { ascending: false })

    if (error) return { content: [{ type: 'text', text: `Error: ${error.message}` }] }
    return { content: [{ type: 'text', text: JSON.stringify({ sectors: data }, null, 2) }] }
  }

  // ── get_breaking_news ──────────────────────────────────────────────
  if (toolName === 'get_breaking_news') {
    const { data, error } = await supabase
      .from('breaking_news')
      .select('id, headline, summary, blog_post_id, active, expires_at, created_at')
      .eq('active', true)
      .gte('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })

    if (error) return { content: [{ type: 'text', text: `Error: ${error.message}` }] }
    return {
      content: [{ type: 'text', text: JSON.stringify({ breaking_news: data || [] }, null, 2) }],
    }
  }

  // ── generate_editors_thoughts ──────────────────────────────────────
  if (toolName === 'generate_editors_thoughts') {
    const expectedKey = process.env.MCP_EDITOR_KEY
    if (!expectedKey || args.api_key !== expectedKey) {
      return { content: [{ type: 'text', text: 'Error: Invalid or missing API key.' }] }
    }

    const ck = process.env.TWITTER_API_KEY
    const cs = process.env.TWITTER_API_SECRET
    const at = process.env.TWITTER_ACCESS_TOKEN
    const ats = process.env.TWITTER_ACCESS_TOKEN_SECRET
    const hasTwitter = !!(ck && cs && at && ats)

    // ── tweet_only mode ──
    if (args.tweet_only) {
      const { data: active } = await supabase
        .from('opinion_pieces')
        .select('headline, summary, blog_post_id')
        .eq('series', 'editors_thoughts')
        .eq('active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!active?.blog_post_id) {
        return {
          content: [{ type: 'text', text: "Error: No active Editor's Thoughts piece found." }],
        }
      }

      const { data: bp } = await supabase
        .from('blog_posts')
        .select('title, summary, slug, content')
        .eq('id', active.blog_post_id)
        .single()

      if (!bp) {
        return { content: [{ type: 'text', text: 'Error: Blog post not found.' }] }
      }

      if (!hasTwitter) {
        return {
          content: [{ type: 'text', text: 'Error: Twitter keys not configured.' }],
        }
      }

      const threadTweets = await generateEditorsThread(
        bp.title,
        bp.summary,
        (bp.content as string).slice(0, 600),
      )

      const pollQ = trimToFit("✍️ What's your take on this?", 200)
      threadTweets.push(pollQ)

      let mediaIds: string[] | undefined
      const img = await generateImage(buildEditorsImagePrompt(bp.title))
      if (img) {
        const mid = await uploadMediaToTwitter(img, ck!, cs!, at!, ats!)
        if (mid) mediaIds = [mid]
      }

      const threadResults = await postThread(threadTweets, ck!, cs!, at!, ats!, mediaIds, {
        options: ['Strongly agree', 'Partly agree', 'Disagree', "It's complicated"],
        duration_minutes: 1440,
      })

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                mode: 'tweet_only',
                title: bp.title,
                slug: bp.slug,
                twitter_thread: threadResults,
              },
              null,
              2,
            ),
          },
        ],
      }
    }

    // ── Normal generation flow ──
    const chosenSector =
      args.sector && VALID_SECTORS.includes(args.sector) ? args.sector : 'Opinion'
    const chosenTone =
      args.tone && VALID_TONES.includes(args.tone) ? args.tone : 'balanced'

    // Step 1: Web research (optional)
    let researchContext = ''
    const firecrawlKey = process.env.FIRECRAWL_API_KEY
    if (!args.skip_research && firecrawlKey) {
      try {
        const queries = [
          `${args.topic} AI jobs 2025 2026`,
          `${args.topic} workforce automation impact`,
        ]
        const snippets: string[] = []
        await Promise.allSettled(
          queries.map(async (q) => {
            const res = await fetch('https://api.firecrawl.dev/v1/search', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${firecrawlKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ query: q, limit: 3, scrapeOptions: { formats: ['markdown'] } }),
            })
            if (!res.ok) return
            const json = await res.json()
            const results: Array<{ title?: string; url?: string; markdown?: string; description?: string }> =
              json.data || json.results || []
            for (const r of results) {
              const text = r.markdown || r.description || r.title || ''
              if (text) snippets.push(`[${r.title || r.url}]\n${text.slice(0, 1500)}`)
            }
          }),
        )
        if (snippets.length) researchContext = `\n\n## Research sources\n${snippets.join('\n---\n')}`
      } catch (e) {
        console.error('Firecrawl research failed (continuing without):', e)
      }
    }

    // Step 2: Terminology guide
    let terminologyContext = ''
    if (chosenSector !== 'Opinion') {
      const { data: guide } = await supabase
        .from('terminology_guides')
        .select('guide_content')
        .eq('sector', chosenSector)
        .maybeSingle()
      if (guide?.guide_content) {
        terminologyContext = `\n\n## Sector terminology guide\n${(guide.guide_content as string).slice(0, 2000)}`
      }
    }

    // Step 3: Recent opinion pieces (avoid repetition)
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
            .join('\n')}`
        : ''

    // Step 4: Generate via Gemini
    const toneInstructions: Record<string, string> = {
      balanced: 'Present multiple perspectives fairly. Acknowledge complexity. Avoid taking a strong side.',
      provocative: 'Challenge assumptions. Be bold and slightly contrarian. Push the reader to reconsider.',
      optimistic: 'Focus on opportunities and positive outcomes. Acknowledge risks but emphasise potential.',
      cautious: 'Emphasise risks and unknowns. Urge careful consideration. Avoid dismissing concerns.',
    }

    const systemPrompt = `You are the editor of AI Job Clock, a publication tracking how AI is reshaping the global workforce. You write an occasional "Editor's Thoughts" column — a measured, analytical take on a specific topic. Your voice is authoritative but approachable, like a leader column in The Economist.

Tone for this piece: ${chosenTone}. ${toneInstructions[chosenTone]}

Rules:
- Write 800–1200 words in markdown
- Use a compelling headline (not the raw topic — craft something editorial)
- If a HEADLINE IDEA is provided below, use it as the foundation. Fix grammar/spelling but keep it punchy.
- Include a 1–2 sentence summary suitable for social sharing
- Reference specific data points, companies, or events where possible
- End with a thought-provoking question or call to reflection
- Do NOT use "AI revolution", "game-changer", "paradigm shift", or "it remains to be seen"
- Write for an intelligent general audience, not AI specialists

CRITICAL — TOPIC ADHERENCE:
- The topic direction provided by the caller is NON-NEGOTIABLE. Stay laser-focused on the specific angle given.
- If a BASE ARTICLE is provided, use it as a primary source — reference its claims, data, and framing.`

    const headlineSection = args.headline_idea
      ? `\n\nHEADLINE IDEA (correct grammar/spelling, keep punchy):\n${args.headline_idea}`
      : ''
    const baseArticleSection = args.base_article
      ? `\n\nBASE ARTICLE (use as primary source):\n${args.base_article}`
      : ''

    const userPrompt = `MANDATORY TOPIC DIRECTION (do not deviate):
${args.topic}
${headlineSection}${baseArticleSection}

Sector focus: ${chosenSector === 'Opinion' ? 'Cross-sector / general' : chosenSector}
${previousOpinions}${researchContext}${terminologyContext}`

    const model = getClient().getGenerativeModel({ model: 'gemini-2.5-flash', systemInstruction: systemPrompt })

    let opinionArgs: { title: string; summary: string; content: string } | undefined
    try {
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        tools: [
          {
            functionDeclarations: [
              {
                name: 'publish_editors_thoughts',
                description: 'Publish the generated opinion piece',
                parameters: {
                  type: SchemaType.OBJECT,
                  properties: {
                    title: {
                      type: SchemaType.STRING,
                      description: 'Editorial headline',
                    },
                    summary: {
                      type: SchemaType.STRING,
                      description: '1-2 sentence summary',
                    },
                    content: {
                      type: SchemaType.STRING,
                      description: 'Full article in markdown',
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
            allowedFunctionNames: ['publish_editors_thoughts'],
          },
        },
      })
      const fc = result.response.candidates?.[0]?.content?.parts?.[0]?.functionCall
      opinionArgs = fc?.args as typeof opinionArgs
    } catch (e) {
      console.error('generate_editors_thoughts Gemini error:', e)
      return { content: [{ type: 'text', text: 'Error: AI generation failed.' }] }
    }

    if (!opinionArgs?.title || !opinionArgs?.content) {
      return { content: [{ type: 'text', text: 'Error: No content generated from AI.' }] }
    }

    // Step 5: Persist
    const today = new Date().toISOString().split('T')[0]
    const slug = `editors-thoughts-${opinionArgs.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 60)}-${today}`

    const { data: blogPost, error: blogErr } = await supabase
      .from('blog_posts')
      .insert({
        title: opinionArgs.title,
        summary: opinionArgs.summary,
        content: opinionArgs.content,
        sector: chosenSector,
        slug,
        published_date: today,
      })
      .select('id')
      .single()

    if (blogErr) {
      return { content: [{ type: 'text', text: `Error inserting blog post: ${blogErr.message}` }] }
    }

    await supabase
      .from('opinion_pieces')
      .update({ active: false })
      .eq('series', 'editors_thoughts')
      .eq('active', true)

    const { error: opErr } = await supabase.from('opinion_pieces').insert({
      headline: opinionArgs.title,
      summary: opinionArgs.summary,
      blog_post_id: blogPost.id,
      series: 'editors_thoughts',
      active: true,
    })

    if (opErr) {
      return {
        content: [
          {
            type: 'text',
            text: `Blog post saved but opinion_pieces insert failed: ${opErr.message}`,
          },
        ],
      }
    }

    // Step 6: Tweet thread (optional)
    let twitterThread: unknown = 'skipped — Twitter keys not configured'
    if (hasTwitter) {
      const threadTweets = await generateEditorsThread(
        opinionArgs.title,
        opinionArgs.summary,
        opinionArgs.content.slice(0, 600),
      )
      const pollQ = trimToFit("✍️ What's your take on this?", 200)
      threadTweets.push(pollQ)

      let mediaIds: string[] | undefined
      const img = await generateImage(buildEditorsImagePrompt(opinionArgs.title))
      if (img) {
        const mid = await uploadMediaToTwitter(img, ck!, cs!, at!, ats!)
        if (mid) mediaIds = [mid]
      }

      twitterThread = await postThread(
        threadTweets,
        ck!,
        cs!,
        at!,
        ats!,
        mediaIds,
        {
          options: ['Strongly agree', 'Partly agree', 'Disagree', "It's complicated"],
          duration_minutes: 1440,
        },
      )
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: true,
              title: opinionArgs.title,
              summary: opinionArgs.summary,
              slug,
              blog_post_id: blogPost.id,
              sector: chosenSector,
              word_count: opinionArgs.content.split(/\s+/).length,
              research_sources: researchContext ? 'included' : 'skipped',
              twitter_thread: twitterThread,
            },
            null,
            2,
          ),
        },
      ],
    }
  }

  // ── reply_for_tweet ────────────────────────────────────────────────
  if (toolName === 'reply_for_tweet') {
    const chosenPersonality = (args.personality as string) || 'grounded'
    const chosenEnergy = (args.energy as string) || 'medium'
    const chosenSpiciness = Math.max(0, Math.min(1, (args.spiciness as number) ?? 0.3))
    const personalityGuide = PERSONALITY_GUIDES[chosenPersonality] || PERSONALITY_GUIDES.grounded

    const energyGuide =
      chosenEnergy === 'low'
        ? 'Keep it understated. Quiet confidence. Let the idea do the work.'
        : chosenEnergy === 'high'
          ? 'Bring intensity. Strong verbs, clear conviction, zero hedging.'
          : 'Balanced energy. Confident but not loud.'

    const spicyGuide =
      chosenSpiciness < 0.2
        ? 'Play it safe. Neutral phrasing.'
        : chosenSpiciness < 0.5
          ? 'Slightly bold. Have a clear point of view but do not provoke.'
          : chosenSpiciness < 0.8
            ? 'Bold and opinionated. Take a stance. Use vivid language.'
            : 'Maximum boldness while staying safe. Strong claims, sharp phrasing, memorable lines.'

    const systemPrompt = `You are the voice of AI Job Clock (@AIJobClock), a tracker of AI's impact on employment.

PERSONALITY: ${chosenPersonality.toUpperCase()}
${personalityGuide}

ENERGY: ${chosenEnergy}
${energyGuide}

SPICINESS: ${chosenSpiciness.toFixed(1)}
${spicyGuide}

Write THREE replies to the tweet below. Return valid JSON only.

Required output format:
{
  "replies": {
    "short": "a complete sentence, ~12 words",
    "medium": "a complete sentence or two, ~140 characters",
    "long": "a complete thought, ~260 characters"
  },
  "notes": "one-line rationale for the angle you chose",
  "style_meta": {
    "personality_used": "${chosenPersonality}",
    "energy_used": "${chosenEnergy}",
    "spiciness_used": ${chosenSpiciness.toFixed(1)},
    "bland_score": 0.0,
    "style_tags": ["tag1", "tag2", "tag3"]
  }
}

ANTI-BLAND RULES (critical):
- NEVER use these phrases: ${BANNED_PHRASES.map((p) => `"${p}"`).join(', ')}
- Prefer short active sentences, concrete words, clear point of view
- Score your own bland_score from 0.0 (sharp, specific) to 1.0 (generic, forgettable)
- If bland_score exceeds 0.35, you MUST rewrite all replies before returning
- style_tags should describe the actual voice used (e.g. "direct", "human", "wry", "data-driven")

Length guidelines:
- "short": ~12 words, a quick punchy take
- "medium": roughly tweet-length, ~140 chars
- "long": a fuller reply, ~260 chars, room for nuance

Other rules:
- All 3 replies must be specific to the tweet content
- Plain, conversational English
- No em dashes, no hashtags, no jargon
- No generic filler or template phrases
- Safe: no insults, no defamation, no fabricated stats
- Sound like a knowledgeable human, not a bot
- Do NOT start with "Great point" or "This is so true"

Return ONLY the JSON object, nothing else.`

    let userPrompt = ''
    if (args.conversation_context) userPrompt += `Prior conversation:\n${args.conversation_context}\n\n`
    userPrompt += args.author_username
      ? `Tweet by @${args.author_username}:\n"${args.tweet_text}"`
      : `Tweet:\n"${args.tweet_text}"`

    try {
      const model = getClient().getGenerativeModel({
        model: 'gemini-2.5-flash',
        systemInstruction: systemPrompt,
        generationConfig: {
          temperature: 0.6 + chosenSpiciness * 0.4,
          responseMimeType: 'application/json',
          maxOutputTokens: 600,
        },
      })
      const result = await model.generateContent(userPrompt)
      const raw = result.response.text().trim()
      const parsed = JSON.parse(raw)
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                replies: parsed.replies || {},
                notes: parsed.notes || null,
                style_meta: parsed.style_meta || {
                  personality_used: chosenPersonality,
                  energy_used: chosenEnergy,
                  spiciness_used: chosenSpiciness,
                  bland_score: null,
                  style_tags: [],
                },
              },
              null,
              2,
            ),
          },
        ],
      }
    } catch (e) {
      console.error('reply_for_tweet error:', e)
      return { content: [{ type: 'text', text: JSON.stringify({ error: 'Failed to generate reply' }) }] }
    }
  }

  throw new Error(`Unknown tool: ${toolName}`)
}

// ---------------------------------------------------------------------------
// Helpers for generate_editors_thoughts
// ---------------------------------------------------------------------------

async function generateEditorsThread(
  title: string,
  summary: string,
  contentExcerpt: string,
): Promise<string[]> {
  const model = getClient().getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction:
      "You write thoughtful tweets about AI and the workforce. Professional but approachable, like an editor posing an important question. Concise sentences. NEVER use: 'revolutionizing', 'transforming', 'disrupting', 'paradigm', 'unprecedented'. No hashtags. No links. No ellipsis. Each tweet under its character limit.",
  })

  try {
    const result = await model.generateContent({
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `Write a 3-tweet thread for this Editor's Thoughts piece.\n\nTitle: ${title}\nSummary: ${summary}\nArticle excerpt: ${contentExcerpt}\n\nTweet 1 (max 250 chars): Thought-provoking hook — complete sentence ending with punctuation\nTweet 2 (max 250 chars): Key insight or evidence — one or two complete sentences\nTweet 3 (max 250 chars): Takeaway or call to reflection — one or two complete sentences`,
            },
          ],
        },
      ],
      tools: [
        {
          functionDeclarations: [
            {
              name: 'generate_editors_thread',
              description: 'Generate a 3-tweet thread body',
              parameters: {
                type: SchemaType.OBJECT,
                properties: {
                  tweet1: { type: SchemaType.STRING, description: 'Hook tweet, max 250 chars' },
                  tweet2: { type: SchemaType.STRING, description: 'Key insight tweet, max 250 chars' },
                  tweet3: { type: SchemaType.STRING, description: 'Takeaway tweet, max 250 chars' },
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
          allowedFunctionNames: ['generate_editors_thread'],
        },
      },
    })

    const fc = result.response.candidates?.[0]?.content?.parts?.[0]?.functionCall
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tArgs = fc?.args as any
    if (tArgs?.tweet1) {
      return [
        `✍️ Editor's Thoughts\n\n${trimToFit(tArgs.tweet1, 258)}`,
        trimToFit(tArgs.tweet2, 275),
        trimToFit(tArgs.tweet3, 275),
      ]
    }
  } catch (e) {
    console.error('generateEditorsThread error:', e)
  }

  // Fallback
  return [
    trimToFit(`✍️ Editor's Thoughts\n\n${title}`, 280),
    trimToFit(summary, 280),
    trimToFit('What do you think? The answer may be more complex than it seems.', 280),
  ]
}

function buildEditorsImagePrompt(title: string): string {
  return `Photorealistic editorial photograph for a Twitter/X header (landscape 16:9). This image accompanies an opinion column titled "${title}".

Create a cinematic, evocative scene that visually depicts the core theme of this article. Think award-winning photojournalism or a striking editorial spread in The Economist or Wired.

Style rules:
- Dramatic, moody lighting (golden hour, chiaroscuro, or neon-lit depending on subject)
- Shallow depth of field with a clear focal subject
- NO text, NO overlays, NO logos, NO infographic elements, NO UI elements
- NO corporate stock photo clichés (no handshakes, no people pointing at screens)
- Human subjects should feel candid and authentic, not posed
- Color palette: warm ambers, deep shadows, cool steel blues
- The image should tell a story on its own and provoke curiosity`
}

// ---------------------------------------------------------------------------
// MCP JSON-RPC POST handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  let body: { jsonrpc?: string; id?: unknown; method?: string; params?: Record<string, unknown> }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32700, message: 'Parse error' },
    })
  }

  const { id = null, method, params } = body

  switch (method) {
    // ── Lifecycle ──────────────────────────────────────────────────────
    case 'initialize': {
      const headers = new Headers({ 'Content-Type': 'application/json' })
      // Issue a session ID if the client didn't send one
      if (!request.headers.get('mcp-session-id')) {
        headers.set('mcp-session-id', crypto.randomUUID())
      }
      return new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: MCP_PROTOCOL_VERSION,
            capabilities: { tools: {} },
            serverInfo: SERVER_INFO,
          },
        }),
        { headers },
      )
    }

    case 'initialized':
    case 'notifications/initialized':
    case 'notifications/cancelled':
      // Notifications: no response body required
      return new Response(null, { status: 202 })

    case 'ping':
      return NextResponse.json({ jsonrpc: '2.0', id, result: {} })

    // ── Tools ──────────────────────────────────────────────────────────
    case 'tools/list':
      return NextResponse.json({
        jsonrpc: '2.0',
        id,
        result: { tools: TOOLS },
      })

    case 'tools/call': {
      const { name, arguments: toolArgs = {} } = (params || {}) as {
        name?: string
        arguments?: Record<string, unknown>
      }
      if (!name) {
        return NextResponse.json({
          jsonrpc: '2.0',
          id,
          error: { code: -32602, message: 'Missing tool name' },
        })
      }
      try {
        const result = await handleTool(name, toolArgs as Record<string, unknown>)
        return NextResponse.json({ jsonrpc: '2.0', id, result })
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Internal error'
        return NextResponse.json({
          jsonrpc: '2.0',
          id,
          error: { code: -32603, message: msg },
        })
      }
    }

    default:
      return NextResponse.json({
        jsonrpc: '2.0',
        id,
        error: { code: -32601, message: `Method not found: ${method}` },
      })
  }
}

// ---------------------------------------------------------------------------
// GET — server discovery / health
// ---------------------------------------------------------------------------

export async function GET() {
  return NextResponse.json({
    name: SERVER_INFO.name,
    version: SERVER_INFO.version,
    protocol: MCP_PROTOCOL_VERSION,
    tools: TOOLS.map((t) => ({ name: t.name, description: t.description })),
  })
}
