import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getClient, generateImage } from '@/lib/google-ai'
import { FunctionCallingMode, SchemaType } from '@google/generative-ai'
import { createHmac } from 'crypto'

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
  const tweetUrl = 'https://api.x.com/2/tweets'
  const auth = await buildOAuthHeader('POST', tweetUrl, ck, cs, at, ats)
  const body: Record<string, unknown> = { text }
  if (replyToId) body.reply = { in_reply_to_tweet_id: replyToId }
  if (mediaIds?.length) body.media = { media_ids: mediaIds }
  if (poll && poll.options.length >= 2) body.poll = { options: poll.options.slice(0, 4), duration_minutes: poll.duration_minutes }
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
  return { id: '', success: false, error: errBody }
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

function trimToFit(text: string, max: number): string {
  if (text.length <= max) return text
  const trimmed = text.slice(0, max - 1)
  const lastSpace = trimmed.lastIndexOf(' ')
  if (lastSpace > 0) return trimmed.slice(0, lastSpace) + '…'
  return trimmed + '…'
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SECTOR_EMOJI: Record<string, string> = {
  Tech: '💻',
  Finance: '💰',
  Healthcare: '🏥',
  Manufacturing: '🏭',
  Retail: '🛒',
  Media: '📰',
  Legal: '⚖️',
  Education: '🎓',
  Transportation: '🚗',
  Breaking: '🚨',
}

const FIRECRAWL_QUERIES = [
  '"AI" "launch" OR "release" site:openai.com OR site:google.com OR site:anthropic.com',
  '"AI layoffs" OR "AI replacing" OR "workforce reduction" thousands',
  '"AI regulation" OR "AI ban" OR "AI legislation" passed OR signed',
  '"AI" "replaces" OR "eliminates" jobs OR workers OR workforce',
]

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const authorized = await checkAuth(request)
  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const force: boolean = body.force === true
  const customStory: {
    headline: string
    summary: string
    sector: string
    source_url?: string
  } | undefined = body.custom_story

  const ck = process.env.TWITTER_API_KEY!
  const cs = process.env.TWITTER_API_SECRET!
  const at = process.env.TWITTER_ACCESS_TOKEN!
  const ats = process.env.TWITTER_ACCESS_TOKEN_SECRET!

  const supabase = await createAdminClient()
  const today = new Date().toISOString().split('T')[0]

  try {
    // -----------------------------------------------------------------------
    // Determine candidate story
    // -----------------------------------------------------------------------

    type Candidate = {
      headline: string
      summary: string
      sector: string
      source_url?: string
      url?: string
    }

    let candidates: Candidate[] = []
    let evaluation: {
      is_breaking: boolean
      score: number
      story_index: number
      headline: string
      summary: string
      sector: string
      reasoning: string
    } | null = null

    if (customStory) {
      // Custom story path — skip Firecrawl/AI scoring
      candidates = [customStory]
      evaluation = {
        is_breaking: true,
        score: 10,
        story_index: 0,
        headline: customStory.headline,
        summary: customStory.summary,
        sector: customStory.sector,
        reasoning: 'Custom story provided directly',
      }
    } else {
      // -----------------------------------------------------------------------
      // Check 48-hour cooldown
      // -----------------------------------------------------------------------
      if (!force) {
        const cutoff48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
        const { data: recentBreaking } = await supabase
          .from('breaking_news')
          .select('id, created_at')
          .eq('active', true)
          .gte('created_at', cutoff48h)
          .limit(1)

        if (recentBreaking && recentBreaking.length > 0) {
          return NextResponse.json({
            skipped: true,
            reason: 'cooldown',
            lastBreaking: recentBreaking[0].created_at,
          })
        }
      }

      // -----------------------------------------------------------------------
      // Search Firecrawl
      // -----------------------------------------------------------------------
      const firecrawlKey = process.env.FIRECRAWL_API_KEY
      if (!firecrawlKey) {
        return NextResponse.json({ error: 'FIRECRAWL_API_KEY not configured' }, { status: 500 })
      }

      const seenUrls = new Set<string>()
      for (const query of FIRECRAWL_QUERIES) {
        try {
          const fcRes = await fetch('https://api.firecrawl.dev/v1/search', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${firecrawlKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ query, limit: 5, tbs: 'qdr:d' }),
          })
          if (!fcRes.ok) {
            console.error('Firecrawl search failed:', fcRes.status, await fcRes.text())
            continue
          }
          const fcData = await fcRes.json()
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const results: any[] = fcData.data ?? fcData.results ?? []
          for (const result of results) {
            const url: string = result.url ?? result.link ?? ''
            if (url && seenUrls.has(url)) continue
            if (url) seenUrls.add(url)
            candidates.push({
              headline: result.title ?? result.headline ?? '',
              summary: result.description ?? result.snippet ?? result.summary ?? '',
              sector: 'Technology', // will be determined by AI
              source_url: url,
              url,
            })
          }
        } catch (fcErr) {
          console.error('Firecrawl query error:', fcErr)
        }
      }

      if (candidates.length === 0) {
        return NextResponse.json({ skipped: true, reason: 'no_results' })
      }

      const cappedCandidates = candidates.slice(0, 10)

      // -----------------------------------------------------------------------
      // Fetch recent article titles for deduplication
      // -----------------------------------------------------------------------
      const { data: recentArticles } = await supabase
        .from('news_articles')
        .select('title')
        .order('scraped_at', { ascending: false })
        .limit(50)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const recentTitles = (recentArticles ?? []).map((a: any) => a.title as string)

      // -----------------------------------------------------------------------
      // AI scoring
      // -----------------------------------------------------------------------
      const candidatesList = cappedCandidates
        .map((c, i) => `${i + 1}. "${c.headline}" — ${c.summary}`)
        .join('\n')

      const scoringSystemPrompt = `You are a breaking news editor for AI Job Clock (aijobclock.com), an AI employment displacement tracker.

Review these news stories from the last 24 hours and determine if ANY represent genuine BREAKING NEWS worthy of an urgent alert.

BREAKING NEWS criteria (score 8-10):
- Major AI product launch that directly threatens entire job categories (e.g., GPT-5, Gemini 3, a new autonomous AI agent platform)
- Mass layoff of 1,000+ people explicitly citing AI as the reason
- Landmark AI regulation signed into law by a major government
- Fortune 500 company announcing complete AI workforce replacement in a division
- Major AI safety incident with employment implications

NOT breaking (score 1-4):
- Routine AI product updates or minor features
- Small layoffs or normal business restructuring
- Opinion pieces, research papers, or speculation
- Incremental AI progress or benchmark improvements
- Job market reports or surveys

IMPORTANT: Be extremely selective. At most 1 story per week should qualify as breaking. Most runs should return no breaking news.

Recent headlines already covered (avoid duplicates):
${recentTitles.slice(0, 20).join('\n')}

Candidate stories:
${candidatesList}`

      const scoringModel = getClient().getGenerativeModel({
        model: 'gemini-2.5-flash',
        systemInstruction: scoringSystemPrompt,
      })

      const scoringResult = await scoringModel.generateContent({
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: 'Evaluate these stories. Use the evaluate_breaking_news tool to return your assessment.',
              },
            ],
          },
        ],
        tools: [ // eslint-disable-next-line @typescript-eslint/no-explicit-any
          {
            functionDeclarations: [
              {
                name: 'evaluate_breaking_news',
                description: 'Evaluate whether any candidate story qualifies as breaking news',
                parameters: {
                  type: SchemaType.OBJECT as const,
                  properties: {
                    is_breaking: {
                      type: SchemaType.BOOLEAN as const,
                      description: 'Whether any story qualifies as breaking news',
                    },
                    score: {
                      type: SchemaType.NUMBER as const,
                      description: 'Breaking news score 1-10',
                    },
                    story_index: {
                      type: SchemaType.NUMBER as const,
                      description: 'Index of the selected story in the candidates array',
                    },
                    headline: {
                      type: SchemaType.STRING as const,
                      description: 'Refined headline for the breaking story',
                    },
                    summary: {
                      type: SchemaType.STRING as const,
                      description: 'Brief summary of the breaking story',
                    },
                    sector: {
                      type: SchemaType.STRING as const,
                      format: 'enum',
                      description: 'Sector affected',
                      enum: [
                        'Tech',
                        'Finance',
                        'Healthcare',
                        'Manufacturing',
                        'Retail',
                        'Media',
                        'Legal',
                        'Education',
                        'Transportation',
                      ],
                    },
                    reasoning: {
                      type: SchemaType.STRING as const,
                      description: 'Reasoning for the score and decision',
                    },
                  },
                  required: [
                    'is_breaking',
                    'score',
                    'story_index',
                    'headline',
                    'summary',
                    'sector',
                    'reasoning',
                  ],
                },
              },
            ],
          },
        ],
        toolConfig: {
          functionCallingConfig: {
            mode: FunctionCallingMode.ANY,
            allowedFunctionNames: ['evaluate_breaking_news'],
          },
        },
      })

      const scoringFc =
        scoringResult.response.candidates?.[0]?.content?.parts?.[0]?.functionCall
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const scoringArgs = scoringFc?.args as any

      if (!scoringArgs) {
        return NextResponse.json({ skipped: true, reason: 'ai_scoring_failed' })
      }

      evaluation = scoringArgs

      if (!force && (!evaluation!.is_breaking || evaluation!.score < 8)) {
        return NextResponse.json({
          skipped: true,
          reason: 'not_breaking',
          score: evaluation!.score,
          reasoning: evaluation!.reasoning,
        })
      }

      // In force mode with no good candidate, fall back to first
      if (force && evaluation!.story_index === undefined) {
        evaluation!.story_index = 0
      }
    }

    // -----------------------------------------------------------------------
    // We have an evaluation — proceed with publishing
    // -----------------------------------------------------------------------
    const selectedCandidate = candidates[evaluation!.story_index] ?? candidates[0]
    const finalHeadline = evaluation!.headline || selectedCandidate.headline
    const finalSummary = evaluation!.summary || selectedCandidate.summary
    const finalSector = evaluation!.sector || selectedCandidate.sector

    // -----------------------------------------------------------------------
    // Generate blog post
    // -----------------------------------------------------------------------
    const customContext = ''

    const articleSystemPrompt = `You are a senior analyst at AI Job Clock (aijobclock.com), writing a BREAKING NEWS analysis.

Write a detailed breaking news article (800-1200 words) in markdown format about this story:

Headline: ${finalHeadline}
Summary: ${finalSummary}
Source: ${selectedCandidate?.source_url || 'Multiple sources'}
URL: ${selectedCandidate?.url || 'N/A'}
Sector: ${finalSector}
${customContext}

The article should:
1. Open with the breaking news — what happened, when, and why it matters
2. Explain the technology or product in detail and how it works in practice
3. Analyze immediate and medium-term employment impact in the ${finalSector} sector
4. Discuss competitive landscape and what differentiates this development
5. Include concrete estimates, scenarios, and constraints (cost, reliability, regulation, adoption)
6. End with a clear forward-looking perspective for workers and employers
7. Use markdown headings (##, ###), bold, and bullet points for readability

Write in a sharp, editorial tone — urgent but analytical. This is breaking news, not a press release.
Do NOT include a title heading — the title will be displayed separately.`

    const articleModel = getClient().getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: articleSystemPrompt,
    })

    const articleResult = await articleModel.generateContent({
      contents: [{ role: 'user', parts: [{ text: 'Write the breaking news article now. Use the publish_breaking_article tool.' }] }],
      tools: [ // eslint-disable-next-line @typescript-eslint/no-explicit-any
        {
          functionDeclarations: [
            {
              name: 'publish_breaking_article',
              description: 'Publish the breaking news article content',
              parameters: {
                type: SchemaType.OBJECT as const,
                properties: {
                  content: {
                    type: SchemaType.STRING as const,
                    description: 'Full markdown content 800-1200 words',
                  },
                },
                required: ['content'],
              },
            },
          ],
        },
      ],
      toolConfig: {
        functionCallingConfig: {
          mode: FunctionCallingMode.ANY,
          allowedFunctionNames: ['publish_breaking_article'],
        },
      },
    })

    const articleFc =
      articleResult.response.candidates?.[0]?.content?.parts?.[0]?.functionCall
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const articleArgs = articleFc?.args as any
    const articleContent: string = articleArgs?.content ?? ''

    // -----------------------------------------------------------------------
    // Upsert blog post
    // -----------------------------------------------------------------------
    const blogTitle = `BREAKING: ${finalHeadline}`
    const slugBase = finalHeadline
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60)
    const blogSlug = `breaking-${slugBase}-${today}`

    const { data: blogPostData, error: upsertErr } = await supabase
      .from('blog_posts')
      .upsert(
        {
          title: blogTitle,
          slug: blogSlug,
          sector: 'Breaking',
          summary: finalSummary,
          content: articleContent,
          published_date: today,
        },
        { onConflict: 'sector,published_date' },
      )
      .select('id')
      .single()

    if (upsertErr) {
      console.error('detect-breaking-news blog post upsert error:', upsertErr)
      return NextResponse.json(
        { error: `Blog post upsert failed: ${upsertErr.message}` },
        { status: 500 },
      )
    }

    const blogPostId = blogPostData?.id

    // -----------------------------------------------------------------------
    // Deactivate existing breaking_news and insert new record
    // -----------------------------------------------------------------------
    await supabase.from('breaking_news').update({ active: false }).eq('active', true)

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    await supabase.from('breaking_news').insert({
      headline: finalHeadline,
      summary: finalSummary,
      blog_post_id: blogPostId,
      active: true,
      expires_at: expiresAt,
    })

    // -----------------------------------------------------------------------
    // Generate tweet thread
    // -----------------------------------------------------------------------
    const tweetModel = getClient().getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction:
        'You write breaking news tweets about AI and jobs. Write in clear, confident English — professional but accessible, like a quality newspaper columnist covering a developing story. Concise sentences, varied rhythm. Contractions are fine. Avoid slang. NEVER use words like \'revolutionizing\', \'transforming\', \'disrupting\', \'paradigm\', \'landscape\', \'unprecedented\', \'game-changing\'. Be direct — say what happened and why it matters. No hashtags. No links. No ellipsis. Each tweet MUST be under 270 characters.',
    })

    const tweetPrompt = `Write a 3-tweet breaking news thread.\n\nHeadline: ${finalHeadline}\nSummary: ${finalSummary}\nSector: ${finalSector}\n\nTweet 1 (max 270 chars): Urgent hook — what happened\nTweet 2 (max 270 chars): Key details and facts\nTweet 3 (max 270 chars): Why this matters for workers`

    const tweetResult = await tweetModel.generateContent({
      contents: [{ role: 'user', parts: [{ text: tweetPrompt }] }],
      tools: [ // eslint-disable-next-line @typescript-eslint/no-explicit-any
        {
          functionDeclarations: [
            {
              name: 'generate_breaking_thread',
              description: 'Generate a 3-tweet breaking news thread body (tweets 1-3). Tweet 4 (poll) is added automatically.',
              parameters: {
                type: SchemaType.OBJECT as const,
                properties: {
                  tweet1: {
                    type: SchemaType.STRING as const,
                    description: 'Hook tweet: urgent, attention-grabbing opener about what happened. Max 270 chars. No links, no hashtags.',
                  },
                  tweet2: {
                    type: SchemaType.STRING as const,
                    description: 'Detail tweet: key facts, numbers, who\'s affected. Max 270 chars. No links, no hashtags.',
                  },
                  tweet3: {
                    type: SchemaType.STRING as const,
                    description: 'Impact tweet: why this matters for workers and the industry. Max 270 chars. No links, no hashtags.',
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
          allowedFunctionNames: ['generate_breaking_thread'],
        },
      },
    })

    const tweetFc = tweetResult.response.candidates?.[0]?.content?.parts?.[0]?.functionCall
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tweetArgs = tweetFc?.args as any

    const emoji = SECTOR_EMOJI[finalSector] ?? '🚨'
    const tweet1 = trimToFit(`🚨 BREAKING\n\n${tweetArgs?.tweet1 ?? finalHeadline}`, 280)
    const tweet2 = trimToFit(`${emoji} ${tweetArgs?.tweet2 ?? finalSummary}`, 270)
    const tweet3 = trimToFit(tweetArgs?.tweet3 ?? `This affects workers in the ${finalSector} sector.`, 275)
    const pollQuestion = trimToFit(`${emoji} How will this impact jobs in this sector?`, 200)
    const pollOptions = ['Major disruption ahead', 'Gradual shift', 'Net positive for jobs', 'Too early to tell']

    // -----------------------------------------------------------------------
    // Generate and upload hero image
    // -----------------------------------------------------------------------
    const imagePrompt = `Generate a photorealistic, cinematic image for Twitter/X (landscape 16:9) that visually represents this breaking news:\nTitle: "${finalHeadline}"\nSummary: "${finalSummary}"\n\nScene requirements: depict the tension between a small low-cost AI device fleet and large enterprise software power, with knowledge workers and corporate systems in the same frame.\nStyle: dramatic photorealistic scene, editorial photography quality, Reuters/AP style, moody cinematic lighting, shallow depth of field.\nStrictly no text, no logos, no overlays, no watermarks, no infographic elements.`

    const imageDataUrl = await generateImage(imagePrompt)
    if (!imageDataUrl) {
      console.error('detect-breaking-news: image generation failed')
      return NextResponse.json(
        { error: 'Image generation failed' },
        { status: 502 },
      )
    }

    const mediaId = await uploadMediaToTwitter(imageDataUrl, ck, cs, at, ats)
    if (!mediaId) {
      console.error('detect-breaking-news: media upload failed')
      return NextResponse.json(
        { error: 'Twitter media upload failed' },
        { status: 502 },
      )
    }

    // -----------------------------------------------------------------------
    // Post thread
    // -----------------------------------------------------------------------
    const tweetResults: Array<{ tweet: string; id?: string; success: boolean; error?: string }> = []

    // Tweet 1 with image
    const result1 = await postTweet(tweet1, ck, cs, at, ats, undefined, [mediaId])
    tweetResults.push({ tweet: tweet1, ...result1 })

    let lastId = result1.id

    if (result1.success) {
      await delay(1500)
      const res2 = await postTweet(tweet2, ck, cs, at, ats, lastId)
      tweetResults.push({ tweet: tweet2, ...res2 })
      if (res2.success) {
        lastId = res2.id
        await delay(1500)
        const res3 = await postTweet(tweet3, ck, cs, at, ats, lastId)
        tweetResults.push({ tweet: tweet3, ...res3 })
        if (res3.success) {
          lastId = res3.id
          await delay(1500)
          const res4 = await postTweet(pollQuestion, ck, cs, at, ats, lastId, undefined, { options: pollOptions, duration_minutes: 1440 })
          tweetResults.push({ tweet: pollQuestion, ...res4 })
        }
      }
    }

    return NextResponse.json({
      breaking: true,
      tweeted: true,
      score: evaluation!.score,
      headline: finalHeadline,
      sector: finalSector,
      blogPostId,
      blogPostSlug: blogSlug,
      thread: tweetResults,
    })
  } catch (err) {
    console.error('detect-breaking-news error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}

export async function GET(request: NextRequest) {
  const authorized = await checkAuth(request)
  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const ck = process.env.TWITTER_API_KEY!
  const cs = process.env.TWITTER_API_SECRET!
  const at = process.env.TWITTER_ACCESS_TOKEN!
  const ats = process.env.TWITTER_ACCESS_TOKEN_SECRET!

  const supabase = await createAdminClient()
  const today = new Date().toISOString().split('T')[0]

  try {
    // Run detection (no force mode, no custom story) — just run the normal flow
    // -----------------------------------------------------------------------
    // Check 48-hour cooldown
    // -----------------------------------------------------------------------
    const cutoff48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
    const { data: recentBreaking } = await supabase
      .from('breaking_news')
      .select('id, created_at')
      .eq('active', true)
      .gte('created_at', cutoff48h)
      .limit(1)

    if (recentBreaking && recentBreaking.length > 0) {
      return NextResponse.json({
        skipped: true,
        reason: 'cooldown',
        lastBreaking: recentBreaking[0].created_at,
      })
    }

    // -----------------------------------------------------------------------
    // Search Firecrawl
    // -----------------------------------------------------------------------
    const firecrawlKey = process.env.FIRECRAWL_API_KEY
    if (!firecrawlKey) {
      return NextResponse.json({ error: 'FIRECRAWL_API_KEY not configured' }, { status: 500 })
    }

    type Candidate = {
      headline: string
      summary: string
      sector: string
      source_url?: string
      url?: string
    }

    const candidates: Candidate[] = []
    const seenUrls = new Set<string>()
    for (const query of FIRECRAWL_QUERIES) {
      try {
        const fcRes = await fetch('https://api.firecrawl.dev/v1/search', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${firecrawlKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ query, limit: 5, tbs: 'qdr:d' }),
        })
        if (!fcRes.ok) {
          console.error('Firecrawl search failed:', fcRes.status, await fcRes.text())
          continue
        }
        const fcData = await fcRes.json()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const results: any[] = fcData.data ?? fcData.results ?? []
        for (const result of results) {
          const url: string = result.url ?? result.link ?? ''
          if (url && seenUrls.has(url)) continue
          if (url) seenUrls.add(url)
          candidates.push({
            headline: result.title ?? result.headline ?? '',
            summary: result.description ?? result.snippet ?? result.summary ?? '',
            sector: 'Technology', // will be determined by AI
            source_url: url,
            url,
          })
        }
      } catch (fcErr) {
        console.error('Firecrawl query error:', fcErr)
      }
    }

    if (candidates.length === 0) {
      return NextResponse.json({ skipped: true, reason: 'no_results' })
    }

    const cappedCandidates = candidates.slice(0, 10)

    // -----------------------------------------------------------------------
    // Fetch recent article titles for deduplication
    // -----------------------------------------------------------------------
    const { data: recentArticles } = await supabase
      .from('news_articles')
      .select('title')
      .order('scraped_at', { ascending: false })
      .limit(50)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recentTitles = (recentArticles ?? []).map((a: any) => a.title as string)

    // -----------------------------------------------------------------------
    // AI scoring
    // -----------------------------------------------------------------------
    const candidatesList = cappedCandidates
      .map((c, i) => `${i + 1}. "${c.headline}" — ${c.summary}`)
      .join('\n')

    const scoringSystemPrompt = `You are a breaking news editor for AI Job Clock (aijobclock.com), an AI employment displacement tracker.

Review these news stories from the last 24 hours and determine if ANY represent genuine BREAKING NEWS worthy of an urgent alert.

BREAKING NEWS criteria (score 8-10):
- Major AI product launch that directly threatens entire job categories (e.g., GPT-5, Gemini 3, a new autonomous AI agent platform)
- Mass layoff of 1,000+ people explicitly citing AI as the reason
- Landmark AI regulation signed into law by a major government
- Fortune 500 company announcing complete AI workforce replacement in a division
- Major AI safety incident with employment implications

NOT breaking (score 1-4):
- Routine AI product updates or minor features
- Small layoffs or normal business restructuring
- Opinion pieces, research papers, or speculation
- Incremental AI progress or benchmark improvements
- Job market reports or surveys

IMPORTANT: Be extremely selective. At most 1 story per week should qualify as breaking. Most runs should return no breaking news.

Recent headlines already covered (avoid duplicates):
${recentTitles.slice(0, 20).join('\n')}

Candidate stories:
${candidatesList}`

    const scoringModel = getClient().getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: scoringSystemPrompt,
    })

    const scoringResult = await scoringModel.generateContent({
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: 'Evaluate these stories. Use the evaluate_breaking_news tool to return your assessment.',
            },
          ],
        },
      ],
      tools: [ // eslint-disable-next-line @typescript-eslint/no-explicit-any
        {
          functionDeclarations: [
            {
              name: 'evaluate_breaking_news',
              description: 'Evaluate whether any candidate story qualifies as breaking news',
              parameters: {
                type: SchemaType.OBJECT as const,
                properties: {
                  is_breaking: {
                    type: SchemaType.BOOLEAN as const,
                    description: 'Whether any story qualifies as breaking news',
                  },
                  score: {
                    type: SchemaType.NUMBER as const,
                    description: 'Breaking news score 1-10',
                  },
                  story_index: {
                    type: SchemaType.NUMBER as const,
                    description: 'Index of the selected story in the candidates array',
                  },
                  headline: {
                    type: SchemaType.STRING as const,
                    description: 'Refined headline for the breaking story',
                  },
                  summary: {
                    type: SchemaType.STRING as const,
                    description: 'Brief summary of the breaking story',
                  },
                  sector: {
                    type: SchemaType.STRING as const,
                    format: 'enum',
                    description: 'Sector affected',
                    enum: [
                      'Tech',
                      'Finance',
                      'Healthcare',
                      'Manufacturing',
                      'Retail',
                      'Media',
                      'Legal',
                      'Education',
                      'Transportation',
                    ],
                  },
                  reasoning: {
                    type: SchemaType.STRING as const,
                    description: 'Reasoning for the score and decision',
                  },
                },
                required: [
                  'is_breaking',
                  'score',
                  'story_index',
                  'headline',
                  'summary',
                  'sector',
                  'reasoning',
                ],
              },
            },
          ],
        },
      ],
      toolConfig: {
        functionCallingConfig: {
          mode: FunctionCallingMode.ANY,
          allowedFunctionNames: ['evaluate_breaking_news'],
        },
      },
    })

    const scoringFc =
      scoringResult.response.candidates?.[0]?.content?.parts?.[0]?.functionCall
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const scoringArgs = scoringFc?.args as any

    if (!scoringArgs) {
      return NextResponse.json({ skipped: true, reason: 'ai_scoring_failed' })
    }

    const evaluation = scoringArgs

    if (!evaluation.is_breaking || evaluation.score < 8) {
      return NextResponse.json({
        skipped: true,
        reason: 'not_breaking',
        score: evaluation.score,
        reasoning: evaluation.reasoning,
      })
    }

    // -----------------------------------------------------------------------
    // We have a breaking story — proceed with publishing
    // -----------------------------------------------------------------------
    const selectedCandidate = cappedCandidates[evaluation.story_index] ?? cappedCandidates[0]
    const finalHeadline = evaluation.headline || selectedCandidate.headline
    const finalSummary = evaluation.summary || selectedCandidate.summary
    const finalSector = evaluation.sector || selectedCandidate.sector

    // -----------------------------------------------------------------------
    // Generate blog post
    // -----------------------------------------------------------------------
    const customContext = ''

    const articleSystemPrompt = `You are a senior analyst at AI Job Clock (aijobclock.com), writing a BREAKING NEWS analysis.

Write a detailed breaking news article (800-1200 words) in markdown format about this story:

Headline: ${finalHeadline}
Summary: ${finalSummary}
Source: ${selectedCandidate?.source_url || 'Multiple sources'}
URL: ${selectedCandidate?.url || 'N/A'}
Sector: ${finalSector}
${customContext}

The article should:
1. Open with the breaking news — what happened, when, and why it matters
2. Explain the technology or product in detail and how it works in practice
3. Analyze immediate and medium-term employment impact in the ${finalSector} sector
4. Discuss competitive landscape and what differentiates this development
5. Include concrete estimates, scenarios, and constraints (cost, reliability, regulation, adoption)
6. End with a clear forward-looking perspective for workers and employers
7. Use markdown headings (##, ###), bold, and bullet points for readability

Write in a sharp, editorial tone — urgent but analytical. This is breaking news, not a press release.
Do NOT include a title heading — the title will be displayed separately.`

    const articleModel = getClient().getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: articleSystemPrompt,
    })

    const articleResult = await articleModel.generateContent({
      contents: [{ role: 'user', parts: [{ text: 'Write the breaking news article now. Use the publish_breaking_article tool.' }] }],
      tools: [ // eslint-disable-next-line @typescript-eslint/no-explicit-any
        {
          functionDeclarations: [
            {
              name: 'publish_breaking_article',
              description: 'Publish the breaking news article content',
              parameters: {
                type: SchemaType.OBJECT as const,
                properties: {
                  content: {
                    type: SchemaType.STRING as const,
                    description: 'Full markdown content 800-1200 words',
                  },
                },
                required: ['content'],
              },
            },
          ],
        },
      ],
      toolConfig: {
        functionCallingConfig: {
          mode: FunctionCallingMode.ANY,
          allowedFunctionNames: ['publish_breaking_article'],
        },
      },
    })

    const articleFc =
      articleResult.response.candidates?.[0]?.content?.parts?.[0]?.functionCall
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const articleArgs = articleFc?.args as any
    const articleContent: string = articleArgs?.content ?? ''

    // -----------------------------------------------------------------------
    // Upsert blog post
    // -----------------------------------------------------------------------
    const blogTitle = `BREAKING: ${finalHeadline}`
    const slugBase = finalHeadline
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60)
    const blogSlug = `breaking-${slugBase}-${today}`

    const { data: blogPostData, error: upsertErr } = await supabase
      .from('blog_posts')
      .upsert(
        {
          title: blogTitle,
          slug: blogSlug,
          sector: 'Breaking',
          summary: finalSummary,
          content: articleContent,
          published_date: today,
        },
        { onConflict: 'sector,published_date' },
      )
      .select('id')
      .single()

    if (upsertErr) {
      console.error('detect-breaking-news blog post upsert error:', upsertErr)
      return NextResponse.json(
        { error: `Blog post upsert failed: ${upsertErr.message}` },
        { status: 500 },
      )
    }

    const blogPostId = blogPostData?.id

    // -----------------------------------------------------------------------
    // Deactivate existing breaking_news and insert new record
    // -----------------------------------------------------------------------
    await supabase.from('breaking_news').update({ active: false }).eq('active', true)

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    await supabase.from('breaking_news').insert({
      headline: finalHeadline,
      summary: finalSummary,
      blog_post_id: blogPostId,
      active: true,
      expires_at: expiresAt,
    })

    // -----------------------------------------------------------------------
    // Generate tweet thread
    // -----------------------------------------------------------------------
    const tweetModel = getClient().getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction:
        'You write breaking news tweets about AI and jobs. Write in clear, confident English — professional but accessible, like a quality newspaper columnist covering a developing story. Concise sentences, varied rhythm. Contractions are fine. Avoid slang. NEVER use words like \'revolutionizing\', \'transforming\', \'disrupting\', \'paradigm\', \'landscape\', \'unprecedented\', \'game-changing\'. Be direct — say what happened and why it matters. No hashtags. No links. No ellipsis. Each tweet MUST be under 270 characters.',
    })

    const tweetPrompt = `Write a 3-tweet breaking news thread.\n\nHeadline: ${finalHeadline}\nSummary: ${finalSummary}\nSector: ${finalSector}\n\nTweet 1 (max 270 chars): Urgent hook — what happened\nTweet 2 (max 270 chars): Key details and facts\nTweet 3 (max 270 chars): Why this matters for workers`

    const tweetResult = await tweetModel.generateContent({
      contents: [{ role: 'user', parts: [{ text: tweetPrompt }] }],
      tools: [ // eslint-disable-next-line @typescript-eslint/no-explicit-any
        {
          functionDeclarations: [
            {
              name: 'generate_breaking_thread',
              description: 'Generate a 3-tweet breaking news thread body (tweets 1-3). Tweet 4 (poll) is added automatically.',
              parameters: {
                type: SchemaType.OBJECT as const,
                properties: {
                  tweet1: {
                    type: SchemaType.STRING as const,
                    description: 'Hook tweet: urgent, attention-grabbing opener about what happened. Max 270 chars. No links, no hashtags.',
                  },
                  tweet2: {
                    type: SchemaType.STRING as const,
                    description: 'Detail tweet: key facts, numbers, who\'s affected. Max 270 chars. No links, no hashtags.',
                  },
                  tweet3: {
                    type: SchemaType.STRING as const,
                    description: 'Impact tweet: why this matters for workers and the industry. Max 270 chars. No links, no hashtags.',
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
          allowedFunctionNames: ['generate_breaking_thread'],
        },
      },
    })

    const tweetFc = tweetResult.response.candidates?.[0]?.content?.parts?.[0]?.functionCall
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tweetArgs = tweetFc?.args as any

    const emoji = SECTOR_EMOJI[finalSector] ?? '🚨'
    const tweet1 = trimToFit(`🚨 BREAKING\n\n${tweetArgs?.tweet1 ?? finalHeadline}`, 280)
    const tweet2 = trimToFit(`${emoji} ${tweetArgs?.tweet2 ?? finalSummary}`, 270)
    const tweet3 = trimToFit(tweetArgs?.tweet3 ?? `This affects workers in the ${finalSector} sector.`, 275)
    const pollQuestion = trimToFit(`${emoji} How will this impact jobs in this sector?`, 200)
    const pollOptions = ['Major disruption ahead', 'Gradual shift', 'Net positive for jobs', 'Too early to tell']

    // -----------------------------------------------------------------------
    // Generate and upload hero image
    // -----------------------------------------------------------------------
    const imagePrompt = `Generate a photorealistic, cinematic image for Twitter/X (landscape 16:9) that visually represents this breaking news:\nTitle: "${finalHeadline}"\nSummary: "${finalSummary}"\n\nScene requirements: depict the tension between a small low-cost AI device fleet and large enterprise software power, with knowledge workers and corporate systems in the same frame.\nStyle: dramatic photorealistic scene, editorial photography quality, Reuters/AP style, moody cinematic lighting, shallow depth of field.\nStrictly no text, no logos, no overlays, no watermarks, no infographic elements.`

    const imageDataUrl = await generateImage(imagePrompt)
    if (!imageDataUrl) {
      console.error('detect-breaking-news: image generation failed')
      return NextResponse.json(
        { error: 'Image generation failed' },
        { status: 502 },
      )
    }

    const mediaId = await uploadMediaToTwitter(imageDataUrl, ck, cs, at, ats)
    if (!mediaId) {
      console.error('detect-breaking-news: media upload failed')
      return NextResponse.json(
        { error: 'Twitter media upload failed' },
        { status: 502 },
      )
    }

    // -----------------------------------------------------------------------
    // Post thread
    // -----------------------------------------------------------------------
    const tweetResults: Array<{ tweet: string; id?: string; success: boolean; error?: string }> = []

    // Tweet 1 with image
    const result1 = await postTweet(tweet1, ck, cs, at, ats, undefined, [mediaId])
    tweetResults.push({ tweet: tweet1, ...result1 })

    let lastId = result1.id

    if (result1.success) {
      await delay(1500)
      const res2 = await postTweet(tweet2, ck, cs, at, ats, lastId)
      tweetResults.push({ tweet: tweet2, ...res2 })
      if (res2.success) {
        lastId = res2.id
        await delay(1500)
        const res3 = await postTweet(tweet3, ck, cs, at, ats, lastId)
        tweetResults.push({ tweet: tweet3, ...res3 })
        if (res3.success) {
          lastId = res3.id
          await delay(1500)
          const res4 = await postTweet(pollQuestion, ck, cs, at, ats, lastId, undefined, { options: pollOptions, duration_minutes: 1440 })
          tweetResults.push({ tweet: pollQuestion, ...res4 })
        }
      }
    }

    return NextResponse.json({
      breaking: true,
      tweeted: true,
      score: evaluation.score,
      headline: finalHeadline,
      sector: finalSector,
      blogPostId,
      blogPostSlug: blogSlug,
      thread: tweetResults,
    })
  } catch (err) {
    console.error('detect-breaking-news error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
