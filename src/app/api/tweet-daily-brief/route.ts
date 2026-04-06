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
): Promise<{ id: string; success: boolean; error?: string }> {
  const tweetUrl = 'https://api.x.com/2/tweets'
  const auth = await buildOAuthHeader('POST', tweetUrl, ck, cs, at, ats)
  const body: Record<string, unknown> = { text }
  if (replyToId) body.reply = { in_reply_to_tweet_id: replyToId }
  if (mediaIds?.length) body.media = { media_ids: mediaIds }
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
  Technology: '💻',
  Finance: '💰',
  Healthcare: '🏥',
  Manufacturing: '🏭',
  Retail: '🛒',
  Media: '📰',
  Legal: '⚖️',
  Education: '🎓',
  Transportation: '🚗',
}

const ENGAGEMENT_QS = [
  'Which sector are you most worried about?',
  'Which industry will feel the impact first?',
  'Does this change how you think about your career?',
  'Which finding surprised you?',
  'Is your industry ready for this?',
]

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

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
  const mode: string = body.mode ?? 'roundup'
  const dryRun: boolean = body.dry_run === true
  const today = body.date || new Date().toISOString().split('T')[0]

  const ck = process.env.TWITTER_API_KEY!
  const cs = process.env.TWITTER_API_SECRET!
  const at = process.env.TWITTER_ACCESS_TOKEN!
  const ats = process.env.TWITTER_ACCESS_TOKEN_SECRET!

  // -------------------------------------------------------------------------
  // retry mode
  // -------------------------------------------------------------------------
  if (mode === 'retry') {
    try {
      const supabase = await createAdminClient()
      const { data: failedTweets } = await supabase
        .from('failed_tweets')
        .select('*')
        .eq('retried', false)
        .limit(5)

      if (!failedTweets || failedTweets.length === 0) {
        return NextResponse.json({ message: 'No failed tweets to retry', retried: 0 })
      }

      const results = []
      for (const ft of failedTweets) {
        const result = await postTweet(ft.tweet_text, ck, cs, at, ats)
        if (result.success) {
          await supabase
            .from('failed_tweets')
            .update({ retried: true })
            .eq('id', ft.id)
        } else {
          await supabase
            .from('failed_tweets')
            .update({ retry_count: (ft.retry_count ?? 0) + 1 })
            .eq('id', ft.id)
        }
        results.push({ failedTweetId: ft.id, mode: ft.mode, ...result })
      }
      return NextResponse.json({ retried: results.length, results })
    } catch (err) {
      console.error('tweet-daily-brief retry error:', err)
      return NextResponse.json(
        { error: err instanceof Error ? err.message : String(err) },
        { status: 500 },
      )
    }
  }

  // -------------------------------------------------------------------------
  // breaking mode
  // -------------------------------------------------------------------------
  if (mode === 'breaking') {
    const text: string | undefined = body.text
    if (!text) {
      return NextResponse.json({ error: 'text is required for breaking mode' }, { status: 400 })
    }
    const trimmed = trimToFit(text, 280)
    const result = await postTweet(trimmed, ck, cs, at, ats)
    return NextResponse.json(result)
  }

  // -------------------------------------------------------------------------
  // roundup / booster — fetch common data
  // -------------------------------------------------------------------------
  try {
    const supabase = await createAdminClient()
    const dateStart = `${today}T00:00:00.000Z`
    const dateEnd = `${today}T23:59:59.999Z`

    const { data: posts } = await supabase
      .from('blog_posts')
      .select('id, title, sector, summary')
      .gte('published_date', today)
      .lte('published_date', today)
      .order('sector', { ascending: true })

    const { data: newsArticles } = await supabase
      .from('news_articles')
      .select('sector, title, summary')
      .gte('scraped_at', dateStart)
      .lte('scraped_at', dateEnd)

    const sectorCounts: Record<string, number> = {}
    const topHeadlines: Record<string, string[]> = {}

    for (const article of newsArticles ?? []) {
      sectorCounts[article.sector] = (sectorCounts[article.sector] ?? 0) + 1
      if (!topHeadlines[article.sector]) topHeadlines[article.sector] = []
      if (topHeadlines[article.sector].length < 3) {
        topHeadlines[article.sector].push(article.title)
      }
    }

    const rankedSectors = Object.entries(sectorCounts)
      .sort(([, a], [, b]) => b - a)
      .map(([sector, count]) => ({ sector, count }))

    const dateLabel = formatDate(today)

    // -----------------------------------------------------------------------
    // booster mode
    // -----------------------------------------------------------------------
    if (mode === 'booster') {
      const rank: number = body.rank ?? 1
      const entry = rankedSectors[rank - 1]
      if (!entry) {
        return NextResponse.json(
          { error: `No sector at rank ${rank}` },
          { status: 400 },
        )
      }
      const { sector, count } = entry
      const post = posts?.find((p) => p.sector === sector)
      if (!post) {
        return NextResponse.json(
          { error: `No blog post found for sector ${sector}` },
          { status: 400 },
        )
      }

      const emoji = SECTOR_EMOJI[sector] ?? '📊'
      const sectorTag = sector.replace(/\s+/g, '')
      const teaser = trimToFit(post.summary ?? post.title, 120)

      const tweetText = trimToFit(
        `${emoji} ${sector} Sector Alert — ${dateLabel}\n\n${teaser}\n\n${count} AI-related stories tracked today in ${sector}.\n\nFull briefing → aijobclock.com/blog/${post.id}\n\n#AI #${sectorTag} #FutureOfWork #AIJobClock`,
        280,
      )

      if (dryRun) {
        return NextResponse.json({ date: today, mode: 'dry-run-booster', sector, tweet: tweetText })
      }

      const result = await postTweet(tweetText, ck, cs, at, ats)
      return NextResponse.json({ date: today, mode: 'booster', sector, ...result })
    }

    // -----------------------------------------------------------------------
    // roundup mode
    // -----------------------------------------------------------------------
    const activeSectors = rankedSectors.slice(0, 6)

    const { data: sectorStatsRaw } = await supabase
      .from('sector_stats')
      .select('sector_name, estimated_jobs_at_risk, trend_direction')
      .in(
        'sector_name',
        activeSectors.map((s) => s.sector),
      )

    const sectorStats: Record<string, { estimated_jobs_at_risk?: number; trend_direction?: string }> =
      {}
    for (const stat of sectorStatsRaw ?? []) {
      sectorStats[stat.sector_name] = {
        estimated_jobs_at_risk: stat.estimated_jobs_at_risk,
        trend_direction: stat.trend_direction,
      }
    }

    // Calculate day-of-year for engagement question rotation
    const dayOfYear = Math.floor(
      (new Date(today + 'T00:00:00Z').getTime() - new Date(today.slice(0, 4) + '-01-01T00:00:00Z').getTime()) /
        (1000 * 60 * 60 * 24),
    )
    const engagementQ = ENGAGEMENT_QS[dayOfYear % 5]

    const prefix = `⚡ AI Job Clock — ${dateLabel}\n\n`
    const suffix = `\n\n${engagementQ} 👇\n\n🧵`
    const hookBudget = 280 - prefix.length - suffix.length

    // Build per-sector budgets and context
    type SectorInput = {
      sector: string
      count: number
      post?: { id: string; title: string; summary: string }
      stats?: { estimated_jobs_at_risk?: number; trend_direction?: string }
      headlines: string[]
      teaserBudget: number
    }

    const sectorInputs: SectorInput[] = activeSectors.map(({ sector, count }) => {
      const post = posts?.find((p) => p.sector === sector)
      const emoji = SECTOR_EMOJI[sector] ?? '📊'
      const sectorTag = sector.replace(/\s+/g, '')
      const headerLine = `${emoji} ${sector} — ${count} stories\n`
      const statsLine = sectorStats[sector]?.estimated_jobs_at_risk
        ? `${sectorStats[sector].estimated_jobs_at_risk?.toLocaleString()} jobs at risk\n`
        : ''
      const hashtagLine = `\naijobclock.com/blog/${post?.id ?? ''}\n#AI #${sectorTag} #FutureOfWork`
      const teaserBudget = 280 - headerLine.length - statsLine.length - hashtagLine.length - 5

      return {
        sector,
        count,
        post: post ? { id: post.id, title: post.title, summary: post.summary ?? '' } : undefined,
        stats: sectorStats[sector],
        headlines: topHeadlines[sector] ?? [],
        teaserBudget: Math.max(50, teaserBudget),
      }
    })

    // Build the AI prompt
    const sectorContext = sectorInputs
      .map((s) => {
        const headlineList = s.headlines.map((h) => `  - ${h}`).join('\n')
        return `Sector: ${s.sector} (${s.count} stories today)
Post title: ${s.post?.title ?? 'N/A'}
Top headlines:\n${headlineList}
Teaser budget: ${s.teaserBudget} chars`
      })
      .join('\n\n')

    const topPost = posts?.[0]
    const aiModel = getClient().getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction:
        "You write tweet content about AI's impact on jobs. Professional but accessible, like a quality newspaper columnist. NEVER use: revolutionizing, transforming, disrupting, paradigm, landscape, unprecedented, game-changing. No hashtags in content. Strictly respect every character limit. Think broadsheet columnist.",
    })

    let hookText = ''
    let sectorTeasers: Record<string, string> = {}

    try {
      const aiPrompt = `Write a tweet thread hook and sector teasers for today's AI job impact briefing.

Hook budget: ${hookBudget} characters (NO hashtags, this is the hook only)
Date: ${dateLabel}

Sectors to cover:
${sectorContext}

For each sector teaser, keep it under the specified budget. Make it punchy and newsworthy.`

      const aiResult = await aiModel.generateContent({
        contents: [{ role: 'user', parts: [{ text: aiPrompt }] }],
        tools: [ // eslint-disable-next-line @typescript-eslint/no-explicit-any
          {
            functionDeclarations: [
              {
                name: 'generate_thread_content',
                description: 'Generate hook and sector teasers for the tweet thread',
                parameters: {
                  type: SchemaType.OBJECT as const,
                  properties: {
                    hook: {
                      type: SchemaType.STRING as const,
                      description: `Hook text under ${hookBudget} chars, no hashtags`,
                    },
                    sectors: {
                      type: SchemaType.ARRAY as const,
                      description: 'Array of sector teasers',
                      items: {
                        type: SchemaType.OBJECT as const,
                        properties: {
                          sector: { type: SchemaType.STRING as const },
                          teaser: { type: SchemaType.STRING as const },
                        },
                        required: ['sector', 'teaser'],
                      },
                    },
                  },
                  required: ['hook', 'sectors'],
                },
              },
            ],
          },
        ],
        toolConfig: {
          functionCallingConfig: {
            mode: FunctionCallingMode.ANY,
            allowedFunctionNames: ['generate_thread_content'],
          },
        },
      })

      const fc = aiResult.response.candidates?.[0]?.content?.parts?.[0]?.functionCall
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const args = fc?.args as any
      if (args?.hook) {
        hookText = trimToFit(args.hook, hookBudget)
      }
      if (Array.isArray(args?.sectors)) {
        for (const s of args.sectors) {
          sectorTeasers[s.sector] = s.teaser
        }
      }
    } catch (aiErr) {
      console.error('tweet-daily-brief AI generation error:', aiErr)
    }

    // Fallback hook
    if (!hookText && topPost) {
      hookText = trimToFit(topPost.summary ?? topPost.title, hookBudget)
    }
    if (!hookText) {
      hookText = trimToFit(`${activeSectors.length} sectors tracked today`, hookBudget)
    }

    const hookTweet = `${prefix}${hookText}${suffix}`

    // Build sector tweets
    const sectorTweets: string[] = sectorInputs.map((s) => {
      const emoji = SECTOR_EMOJI[s.sector] ?? '📊'
      const sectorTag = s.sector.replace(/\s+/g, '')
      const teaser = sectorTeasers[s.sector]
        ? trimToFit(sectorTeasers[s.sector], s.teaserBudget)
        : trimToFit(s.post?.summary ?? s.post?.title ?? s.sector, s.teaserBudget)
      const statsLine = s.stats?.estimated_jobs_at_risk
        ? `${s.stats.estimated_jobs_at_risk.toLocaleString()} jobs at risk\n`
        : ''
      return trimToFit(
        `${emoji} ${s.sector} — ${s.count} stories\n${statsLine}${teaser}\n\naijobclock.com/blog/${s.post?.id ?? ''}\n#AI #${sectorTag} #FutureOfWork`,
        280,
      )
    })

    const ctaTweet = trimToFit(
      `⚡ Full briefings for all ${posts?.length ?? 0} sectors with sources:\n\naijobclock.com\n\nWhich insight surprised you most? Reply below 👇\n\nFollow @AIJobclock for daily updates on real AI job impact\n\n#AI #FutureOfWork #AIJobs`,
      280,
    )

    const threadTweets = [hookTweet, ...sectorTweets, ctaTweet]

    // -----------------------------------------------------------------------
    // dry_run
    // -----------------------------------------------------------------------
    if (dryRun) {
      let hookImage: string | undefined
      if (process.env.GOOGLE_AI_API_KEY && topPost) {
        const imagePrompt = `Generate a photorealistic, cinematic image for Twitter/X (landscape 16:9) that visually represents this news story: ${topPost.title} — AI's impact on jobs and workers today. Style: dramatic photorealistic scene, editorial photography quality, moody cinematic lighting, shallow depth of field. No text, no overlays, no watermarks. Think Reuters/AP photo quality.`
        const img = await generateImage(imagePrompt)
        if (img) hookImage = img
      }
      return NextResponse.json({
        date: today,
        mode: 'dry-run',
        sectors: rankedSectors,
        activeSectors,
        thread: threadTweets,
        ...(hookImage ? { hookImage } : {}),
      })
    }

    // -----------------------------------------------------------------------
    // Live posting
    // -----------------------------------------------------------------------
    let heroMediaId: string | undefined
    if (process.env.GOOGLE_AI_API_KEY && topPost) {
      try {
        const imagePrompt = `Generate a photorealistic, cinematic image for Twitter/X (landscape 16:9) that visually represents this news story: ${topPost.title} — AI's impact on jobs and workers today. Style: dramatic photorealistic scene, editorial photography quality, moody cinematic lighting, shallow depth of field. No text, no overlays, no watermarks. Think Reuters/AP photo quality.`
        const imageDataUrl = await generateImage(imagePrompt)
        if (imageDataUrl) {
          const mediaId = await uploadMediaToTwitter(imageDataUrl, ck, cs, at, ats)
          if (mediaId) heroMediaId = mediaId
        }
      } catch (imgErr) {
        console.error('tweet-daily-brief image generation error:', imgErr)
      }
    }

    const tweetResults: Array<{ tweet: string; id?: string; success: boolean; error?: string }> = []

    // Post tweet 1 (hook)
    const hookResult = await postTweet(
      hookTweet,
      ck,
      cs,
      at,
      ats,
      undefined,
      heroMediaId ? [heroMediaId] : undefined,
    )
    tweetResults.push({ tweet: hookTweet, ...hookResult })

    if (!hookResult.success) {
      return NextResponse.json({ date: today, mode: 'roundup', failed: true, results: tweetResults })
    }

    let lastTweetId = hookResult.id

    // Post sector tweets
    for (let i = 0; i < sectorTweets.length; i++) {
      await delay(1500)
      const sectorResult = await postTweet(sectorTweets[i], ck, cs, at, ats, lastTweetId)
      tweetResults.push({ tweet: sectorTweets[i], ...sectorResult })
      if (!sectorResult.success) {
        // Save remaining tweets to failed_tweets
        const remainingTweets = [...sectorTweets.slice(i + 1), ctaTweet]
        const supabase = await createAdminClient()
        for (let j = 0; j < remainingTweets.length; j++) {
          await supabase.from('failed_tweets').insert({
            mode: `roundup-t${i + j + 3}`,
            tweet_text: remainingTweets[j],
            error_message: sectorResult.error,
          })
        }
        break
      }
      lastTweetId = sectorResult.id
    }

    // Post CTA tweet if all sector tweets succeeded
    const allSectorSucceeded = tweetResults.slice(1).every((r) => r.success)
    if (allSectorSucceeded) {
      await delay(1500)
      const ctaResult = await postTweet(ctaTweet, ck, cs, at, ats, lastTweetId)
      tweetResults.push({ tweet: ctaTweet, ...ctaResult })
    }

    return NextResponse.json({
      date: today,
      mode: 'roundup',
      tweeted: tweetResults.length,
      results: tweetResults,
    })
  } catch (err) {
    console.error('tweet-daily-brief error:', err)
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

  // For GET, use default behavior (roundup mode with today's date)
  const today = new Date().toISOString().split('T')[0]

  try {
    const supabase = await createAdminClient()
    const dateStart = `${today}T00:00:00.000Z`
    const dateEnd = `${today}T23:59:59.999Z`

    const { data: posts } = await supabase
      .from('blog_posts')
      .select('id, title, sector, summary')
      .gte('published_date', today)
      .lte('published_date', today)
      .order('sector', { ascending: true })

    const { data: newsArticles } = await supabase
      .from('news_articles')
      .select('sector, title, summary')
      .gte('scraped_at', dateStart)
      .lte('scraped_at', dateEnd)

    const sectorCounts: Record<string, number> = {}
    const topHeadlines: Record<string, string[]> = {}

    for (const article of newsArticles ?? []) {
      sectorCounts[article.sector] = (sectorCounts[article.sector] ?? 0) + 1
      if (!topHeadlines[article.sector]) topHeadlines[article.sector] = []
      if (topHeadlines[article.sector].length < 3) {
        topHeadlines[article.sector].push(article.title)
      }
    }

    const rankedSectors = Object.entries(sectorCounts)
      .sort(([, a], [, b]) => b - a)
      .map(([sector, count]) => ({ sector, count }))

    const dateLabel = formatDate(today)

    // roundup mode
    const activeSectors = rankedSectors.slice(0, 6)

    const { data: sectorStatsRaw } = await supabase
      .from('sector_stats')
      .select('sector_name, estimated_jobs_at_risk, trend_direction')
      .in(
        'sector_name',
        activeSectors.map((s) => s.sector),
      )

    const sectorStats: Record<string, { estimated_jobs_at_risk?: number; trend_direction?: string }> =
      {}
    for (const stat of sectorStatsRaw ?? []) {
      sectorStats[stat.sector_name] = {
        estimated_jobs_at_risk: stat.estimated_jobs_at_risk,
        trend_direction: stat.trend_direction,
      }
    }

    // Calculate day-of-year for engagement question rotation
    const dayOfYear = Math.floor(
      (new Date(today + 'T00:00:00Z').getTime() - new Date(today.slice(0, 4) + '-01-01T00:00:00Z').getTime()) /
        (1000 * 60 * 60 * 24),
    )
    const engagementQ = ENGAGEMENT_QS[dayOfYear % 5]

    const prefix = `⚡ AI Job Clock — ${dateLabel}\n\n`
    const suffix = `\n\n${engagementQ} 👇\n\n🧵`
    const hookBudget = 280 - prefix.length - suffix.length

    // Build per-sector budgets and context
    type SectorInput = {
      sector: string
      count: number
      post?: { id: string; title: string; summary: string }
      stats?: { estimated_jobs_at_risk?: number; trend_direction?: string }
      headlines: string[]
      teaserBudget: number
    }

    const sectorInputs: SectorInput[] = activeSectors.map(({ sector, count }) => {
      const post = posts?.find((p) => p.sector === sector)
      const emoji = SECTOR_EMOJI[sector] ?? '📊'
      const sectorTag = sector.replace(/\s+/g, '')
      const headerLine = `${emoji} ${sector} — ${count} stories\n`
      const statsLine = sectorStats[sector]?.estimated_jobs_at_risk
        ? `${sectorStats[sector].estimated_jobs_at_risk?.toLocaleString()} jobs at risk\n`
        : ''
      const hashtagLine = `\naijobclock.com/blog/${post?.id ?? ''}\n#AI #${sectorTag} #FutureOfWork`
      const teaserBudget = 280 - headerLine.length - statsLine.length - hashtagLine.length - 5

      return {
        sector,
        count,
        post: post ? { id: post.id, title: post.title, summary: post.summary ?? '' } : undefined,
        stats: sectorStats[sector],
        headlines: topHeadlines[sector] ?? [],
        teaserBudget: Math.max(50, teaserBudget),
      }
    })

    // Build the AI prompt
    const sectorContext = sectorInputs
      .map((s) => {
        const headlineList = s.headlines.map((h) => `  - ${h}`).join('\n')
        return `Sector: ${s.sector} (${s.count} stories today)
Post title: ${s.post?.title ?? 'N/A'}
Top headlines:\n${headlineList}
Teaser budget: ${s.teaserBudget} chars`
      })
      .join('\n\n')

    const topPost = posts?.[0]
    const aiModel = getClient().getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction:
        "You write tweet content about AI's impact on jobs. Professional but accessible, like a quality newspaper columnist. NEVER use: revolutionizing, transforming, disrupting, paradigm, landscape, unprecedented, game-changing. No hashtags in content. Strictly respect every character limit. Think broadsheet columnist.",
    })

    let hookText = ''
    let sectorTeasers: Record<string, string> = {}

    try {
      const aiPrompt = `Write a tweet thread hook and sector teasers for today's AI job impact briefing.

Hook budget: ${hookBudget} characters (NO hashtags, this is the hook only)
Date: ${dateLabel}

Sectors to cover:
${sectorContext}

For each sector teaser, keep it under the specified budget. Make it punchy and newsworthy.`

      const aiResult = await aiModel.generateContent({
        contents: [{ role: 'user', parts: [{ text: aiPrompt }] }],
        tools: [ // eslint-disable-next-line @typescript-eslint/no-explicit-any
          {
            functionDeclarations: [
              {
                name: 'generate_thread_content',
                description: 'Generate hook and sector teasers for the tweet thread',
                parameters: {
                  type: SchemaType.OBJECT as const,
                  properties: {
                    hook: {
                      type: SchemaType.STRING as const,
                      description: `Hook text under ${hookBudget} chars, no hashtags`,
                    },
                    sectors: {
                      type: SchemaType.ARRAY as const,
                      description: 'Array of sector teasers',
                      items: {
                        type: SchemaType.OBJECT as const,
                        properties: {
                          sector: { type: SchemaType.STRING as const },
                          teaser: { type: SchemaType.STRING as const },
                        },
                        required: ['sector', 'teaser'],
                      },
                    },
                  },
                  required: ['hook', 'sectors'],
                },
              },
            ],
          },
        ],
        toolConfig: {
          functionCallingConfig: {
            mode: FunctionCallingMode.ANY,
            allowedFunctionNames: ['generate_thread_content'],
          },
        },
      })

      const fc = aiResult.response.candidates?.[0]?.content?.parts?.[0]?.functionCall
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const args = fc?.args as any
      if (args?.hook) {
        hookText = trimToFit(args.hook, hookBudget)
      }
      if (Array.isArray(args?.sectors)) {
        for (const s of args.sectors) {
          sectorTeasers[s.sector] = s.teaser
        }
      }
    } catch (aiErr) {
      console.error('tweet-daily-brief AI generation error:', aiErr)
    }

    // Fallback hook
    if (!hookText && topPost) {
      hookText = trimToFit(topPost.summary ?? topPost.title, hookBudget)
    }
    if (!hookText) {
      hookText = trimToFit(`${activeSectors.length} sectors tracked today`, hookBudget)
    }

    const hookTweet = `${prefix}${hookText}${suffix}`

    // Build sector tweets
    const sectorTweets: string[] = sectorInputs.map((s) => {
      const emoji = SECTOR_EMOJI[s.sector] ?? '📊'
      const sectorTag = s.sector.replace(/\s+/g, '')
      const teaser = sectorTeasers[s.sector]
        ? trimToFit(sectorTeasers[s.sector], s.teaserBudget)
        : trimToFit(s.post?.summary ?? s.post?.title ?? s.sector, s.teaserBudget)
      const statsLine = s.stats?.estimated_jobs_at_risk
        ? `${s.stats.estimated_jobs_at_risk.toLocaleString()} jobs at risk\n`
        : ''
      return trimToFit(
        `${emoji} ${s.sector} — ${s.count} stories\n${statsLine}${teaser}\n\naijobclock.com/blog/${s.post?.id ?? ''}\n#AI #${sectorTag} #FutureOfWork`,
        280,
      )
    })

    const ctaTweet = trimToFit(
      `⚡ Full briefings for all ${posts?.length ?? 0} sectors with sources:\n\naijobclock.com\n\nWhich insight surprised you most? Reply below 👇\n\nFollow @AIJobclock for daily updates on real AI job impact\n\n#AI #FutureOfWork #AIJobs`,
      280,
    )

    // Live posting (Vercel cron hits GET)
    let heroMediaId: string | undefined
    if (process.env.GOOGLE_AI_API_KEY && topPost) {
      try {
        const imagePrompt = `Generate a photorealistic, cinematic image for Twitter/X (landscape 16:9) that visually represents this news story: ${topPost.title} — AI's impact on jobs and workers today. Style: dramatic photorealistic scene, editorial photography quality, moody cinematic lighting, shallow depth of field. No text, no overlays, no watermarks. Think Reuters/AP photo quality.`
        const imageDataUrl = await generateImage(imagePrompt)
        if (imageDataUrl) {
          const mediaId = await uploadMediaToTwitter(imageDataUrl, ck, cs, at, ats)
          if (mediaId) heroMediaId = mediaId
        }
      } catch (imgErr) {
        console.error('tweet-daily-brief image generation error:', imgErr)
      }
    }

    const tweetResults: Array<{ tweet: string; id?: string; success: boolean; error?: string }> = []

    const hookResult = await postTweet(
      hookTweet,
      ck,
      cs,
      at,
      ats,
      undefined,
      heroMediaId ? [heroMediaId] : undefined,
    )
    tweetResults.push({ tweet: hookTweet, ...hookResult })

    if (!hookResult.success) {
      return NextResponse.json({ date: today, mode: 'roundup', failed: true, results: tweetResults })
    }

    let lastTweetId = hookResult.id

    for (let i = 0; i < sectorTweets.length; i++) {
      await delay(1500)
      const sectorResult = await postTweet(sectorTweets[i], ck, cs, at, ats, lastTweetId)
      tweetResults.push({ tweet: sectorTweets[i], ...sectorResult })
      if (!sectorResult.success) {
        const remainingTweets = [...sectorTweets.slice(i + 1), ctaTweet]
        for (let j = 0; j < remainingTweets.length; j++) {
          await supabase.from('failed_tweets').insert({
            mode: `roundup-t${i + j + 3}`,
            tweet_text: remainingTweets[j],
            error_message: sectorResult.error,
          })
        }
        break
      }
      lastTweetId = sectorResult.id
    }

    const allSectorSucceeded = tweetResults.slice(1).every((r) => r.success)
    if (allSectorSucceeded) {
      await delay(1500)
      const ctaResult = await postTweet(ctaTweet, ck, cs, at, ats, lastTweetId)
      tweetResults.push({ tweet: ctaTweet, ...ctaResult })
    }

    return NextResponse.json({
      date: today,
      mode: 'roundup',
      tweeted: tweetResults.length,
      results: tweetResults,
    })
  } catch (err) {
    console.error('tweet-daily-brief error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
