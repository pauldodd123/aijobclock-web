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
  pollOptions?: string[],
): Promise<{ id: string; success: boolean; error?: string }> {
  const tweetUrl = 'https://api.x.com/2/tweets'
  const auth = await buildOAuthHeader('POST', tweetUrl, ck, cs, at, ats)
  const body: Record<string, unknown> = { text }
  if (replyToId) body.reply = { in_reply_to_tweet_id: replyToId }
  if (mediaIds?.length) body.media = { media_ids: mediaIds }
  if (pollOptions?.length) {
    body.poll = {
      options: pollOptions,
      duration_minutes: 1440, // 24 hours
    }
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
  const lastPeriod = trimmed.lastIndexOf('. ')
  // Prefer sentence boundary if close enough
  if (lastPeriod > max * 0.6) {
    return trimmed.slice(0, lastPeriod + 1)
  }
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
// Sector tweet builder — Lovable-style, no site links
// ---------------------------------------------------------------------------

function getRiskLabel(jobsAtRisk?: number): string {
  if (!jobsAtRisk) return ''
  if (jobsAtRisk >= 1_000_000) return `${(jobsAtRisk / 1_000_000).toFixed(0)}M+ jobs at risk`
  if (jobsAtRisk >= 1_000) return `${(jobsAtRisk / 1_000).toFixed(0)}K+ jobs at risk`
  return `${jobsAtRisk} jobs at risk`
}

function buildSectorTweet(
  emoji: string,
  sector: string,
  trendEmoji: string,
  teaser: string,
  count: number,
  riskLabel: string,
  sectorTag: string,
): string {
  const countLabel = riskLabel ? `${count} stories tracked` : `${count} AI stories tracked today`
  const statsParts = [countLabel, riskLabel || null].filter(Boolean)
  const statsDisplay = `\n\n📊 ${statsParts.join(' · ')}`
  return trimToFit(
    `${emoji} ${sector} ${trendEmoji}\n\n${teaser}${statsDisplay}\n\n#AI #${sectorTag} #AIJobs`,
    280,
  )
}

function getSectorTweetBudget(
  emoji: string,
  sector: string,
  trendEmoji: string,
  count: number,
  riskLabel: string,
  sectorTag: string,
): number {
  const header = `${emoji} ${sector} ${trendEmoji}\n\n`
  const countLabel = riskLabel ? `${count} stories tracked` : `${count} AI stories tracked today`
  const statsParts = [countLabel, riskLabel || null].filter(Boolean)
  const statsDisplay = `\n\n📊 ${statsParts.join(' · ')}`
  const footer = `${statsDisplay}\n\n#AI #${sectorTag} #AIJobs`
  return Math.max(50, 280 - header.length - footer.length - 5)
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
// Shared data fetcher
// ---------------------------------------------------------------------------

type SectorInput = {
  sector: string
  count: number
  post?: { id: string; title: string; summary: string }
  stats?: { estimated_jobs_at_risk?: number; trend_direction?: string }
  headlines: string[]
  teaserBudget: number
  emoji: string
  sectorTag: string
  trendEmoji: string
  riskLabel: string
}

async function fetchRoundupData(today: string) {
  const supabase = await createAdminClient()
  const dateEnd = `${today}T23:59:59.999Z`
  const todayMs = new Date(`${today}T00:00:00.000Z`).getTime()
  const cutoff48h = new Date(todayMs - 48 * 60 * 60 * 1000).toISOString()
  const cutoff7d = new Date(todayMs - 7 * 24 * 60 * 60 * 1000).toISOString()

  const { data: posts } = await supabase
    .from('blog_posts')
    .select('id, title, sector, summary')
    .gte('published_date', today)
    .lte('published_date', today)
    .order('sector', { ascending: true })

  // Try 48h first, fall back to 7 days (mirrors generate-daily-briefing logic)
  let { data: newsArticles } = await supabase
    .from('news_articles')
    .select('sector, title, summary')
    .gte('scraped_at', cutoff48h)
    .lte('scraped_at', dateEnd)

  if (!newsArticles || newsArticles.length === 0) {
    const { data: wider } = await supabase
      .from('news_articles')
      .select('sector, title, summary')
      .gte('scraped_at', cutoff7d)
      .lte('scraped_at', dateEnd)
    newsArticles = wider
  }

  const sectorCounts: Record<string, number> = {}
  const topHeadlines: Record<string, string[]> = {}

  const globalHeadlines: string[] = []
  for (const article of newsArticles ?? []) {
    sectorCounts[article.sector] = (sectorCounts[article.sector] ?? 0) + 1
    if (!topHeadlines[article.sector]) topHeadlines[article.sector] = []
    if (topHeadlines[article.sector].length < 3) {
      topHeadlines[article.sector].push(article.title)
    }
    if (globalHeadlines.length < 5) globalHeadlines.push(article.title)
  }

  // Rank by article count; fall back to blog_posts order if no articles scraped yet
  const newsRankedSectors = Object.entries(sectorCounts)
    .sort(([, a], [, b]) => b - a)
    .map(([sector, count]) => ({ sector, count }))

  const rankedSectors =
    newsRankedSectors.length > 0
      ? newsRankedSectors
      : (posts ?? []).map((p) => ({ sector: p.sector, count: 0 }))

  const activeSectors = rankedSectors.slice(0, 4)

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

  const sectorInputs: SectorInput[] = activeSectors.map(({ sector, count }) => {
    const post = posts?.find((p) => p.sector === sector)
    const emoji = SECTOR_EMOJI[sector] ?? '📊'
    const sectorTag = sector.replace(/\s+/g, '')
    const trend = sectorStats[sector]?.trend_direction
    const trendEmoji = trend === 'up' ? '📈' : trend === 'down' ? '📉' : '➡️'
    const riskLabel = getRiskLabel(sectorStats[sector]?.estimated_jobs_at_risk)
    const teaserBudget = getSectorTweetBudget(emoji, sector, trendEmoji, count, riskLabel, sectorTag)

    return {
      sector,
      count,
      post: post ? { id: post.id, title: post.title, summary: post.summary ?? '' } : undefined,
      stats: sectorStats[sector],
      headlines: topHeadlines[sector] ?? [],
      teaserBudget,
      emoji,
      sectorTag,
      trendEmoji,
      riskLabel,
    }
  })

  return { posts, rankedSectors, activeSectors, sectorInputs, sectorCounts, topHeadlines, globalHeadlines }
}

// ---------------------------------------------------------------------------
// AI content generator
// ---------------------------------------------------------------------------

async function generateThreadContent(
  sectorInputs: SectorInput[],
  hookBudget: number,
  dateLabel: string,
): Promise<{ hookText: string; sectorTeasers: Record<string, string> }> {
  let hookText = ''
  const sectorTeasers: Record<string, string> = {}

  if (!process.env.GOOGLE_AI_API_KEY) return { hookText, sectorTeasers }

  const sectorInstructions = sectorInputs
    .map(
      (s) =>
        `- "${s.sector}": max ${s.teaserBudget} chars. Source: ${s.post?.title ?? 'N/A'}${s.post?.summary ? ' — ' + s.post.summary : ''}`,
    )
    .join('\n')

  const storyContext = sectorInputs
    .map(
      (s) =>
        `${s.sector}: ${s.post?.title ?? 'N/A'}${s.post?.summary ? ' — ' + s.post.summary : ''}`,
    )
    .join('\n')

  try {
    const aiModel = getClient().getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: `You write tweet content about AI's impact on jobs. Write in clear, confident English — professional but accessible, like a quality newspaper columnist. Not a corporate press release, not a casual text message.

RULES:
- Keep sentences concise and direct. Vary sentence length for natural rhythm.
- Contractions are fine. Avoid slang. Be direct without being blunt.
- NEVER use words like "revolutionizing", "transforming", "disrupting", "paradigm", "landscape", "unprecedented", "leveraging", "synergy", "game-changing", "cutting-edge".
- NEVER start with "Breaking:", "Alert:", or overly dramatic openers.
- Be specific and concrete — real numbers, real examples, not vague claims.
- No hashtags in the content. STRICTLY respect every character limit. Never end with "…" or ellipsis.
- Tone: sharp, informed, measured. Think broadsheet columnist, not LinkedIn post.`,
    })

    const aiResult = await aiModel.generateContent({
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `Generate content for today's AI Job Clock thread.\n\nHOOK (max ${hookBudget} chars): This is the FIRST thing people see — it must open with the single most striking fact, number, or development from today's news. No intro, no "AI Job Clock", no date. Start mid-sentence if needed. Example openings: "Goldman Sachs just cut 300 roles in its London operations…" or "For the first time, AI outperformed radiologists in a large-scale NHS trial." Pick the sharpest, most specific story. Then add one sentence of context or contrast that makes readers want the full thread. Never use vague openers like "AI is changing everything" or "Today's briefing covers".\n\nSECTOR TEASERS (each has its own char limit):\n${sectorInstructions}\n\nStories:\n${storyContext}`,
            },
          ],
        },
      ],
      tools: [
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
                    description: `A compelling 2-3 sentence hook about today's most striking AI job finding. Lead with a specific fact or number, then add context or a second insight. MUST be under ${hookBudget} characters. No hashtags.`,
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
        if (s.sector && s.teaser) {
          const input = sectorInputs.find((i) => i.sector === s.sector)
          sectorTeasers[s.sector] = input
            ? trimToFit(s.teaser, input.teaserBudget)
            : s.teaser
        }
      }
    }
  } catch (aiErr) {
    console.error('tweet-daily-brief AI generation error:', aiErr)
  }

  return { hookText, sectorTeasers }
}

// ---------------------------------------------------------------------------
// Thread builder
// ---------------------------------------------------------------------------

type ThreadTweet = {
  label: string
  text: string
  chars: number
  poll_options?: string[]
}

function buildThread(
  hookTweet: string,
  sectorInputs: SectorInput[],
  sectorTeasers: Record<string, string>,
  pollOptions: string[],
): ThreadTweet[] {
  const thread: ThreadTweet[] = []

  thread.push({ label: 'Tweet 1 (Hook)', text: hookTweet, chars: hookTweet.length })

  for (let i = 0; i < sectorInputs.length; i++) {
    const s = sectorInputs[i]
    const teaser = sectorTeasers[s.sector]
      ? trimToFit(sectorTeasers[s.sector], s.teaserBudget)
      : trimToFit(s.post?.summary ?? s.post?.title ?? s.sector, s.teaserBudget)
    const text = buildSectorTweet(s.emoji, s.sector, s.trendEmoji, teaser, s.count, s.riskLabel, s.sectorTag)
    thread.push({ label: `Tweet ${i + 2} (${s.sector})`, text, chars: text.length })
  }

  const pollText = trimToFit(`Which sector will AI disrupt most this year?`, 280)
  thread.push({
    label: `Tweet ${sectorInputs.length + 2} (Poll)`,
    text: pollText,
    chars: pollText.length,
    poll_options: pollOptions,
  })

  return thread
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
    const { posts, rankedSectors, activeSectors, sectorInputs, sectorCounts, globalHeadlines } = await fetchRoundupData(today)
    const dateLabel = formatDate(today)

    // -----------------------------------------------------------------------
    // booster mode
    // -----------------------------------------------------------------------
    if (mode === 'booster') {
      const rank: number = body.rank ?? 1
      const entry = rankedSectors[rank - 1]
      if (!entry) {
        return NextResponse.json({ error: `No sector at rank ${rank}` }, { status: 400 })
      }
      const s = sectorInputs.find((i) => i.sector === entry.sector)
      if (!s || !s.post) {
        return NextResponse.json(
          { error: `No blog post found for sector ${entry.sector}` },
          { status: 400 },
        )
      }

      // Booster uses the old "Sector Alert" format with a blog link — distinct from roundup sector tweets
      const boosterHeader = `${s.emoji} ${s.sector} Sector Alert — ${dateLabel}\n\n`
      const boosterFooter = `\n\n${s.count} AI-related stories tracked today in ${s.sector}.\n\n#AI #${s.sectorTag} #FutureOfWork #AIJobClock`
      const boosterBudget = 280 - boosterHeader.length - boosterFooter.length
      const teaser = trimToFit(s.post.summary ?? s.post.title, boosterBudget)
      const tweetText = trimToFit(`${boosterHeader}${teaser}${boosterFooter}`, 280)

      if (dryRun) {
        return NextResponse.json({ date: today, mode: 'dry-run-booster', sector: s.sector, tweet: tweetText })
      }

      const result = await postTweet(tweetText, ck, cs, at, ats)
      return NextResponse.json({ date: today, mode: 'booster', sector: s.sector, ...result })
    }

    // -----------------------------------------------------------------------
    // roundup mode
    // -----------------------------------------------------------------------
    const totalArticles = Object.values(sectorCounts).reduce((a: number, b: number) => a + b, 0)
    const activeSectorCount = rankedSectors.length

    const suffix = `\n\n⚡ AI Job Clock · ${dateLabel} | ${totalArticles} stories across ${activeSectorCount} sectors\n🧵`
    const hookBudget = 280 - suffix.length

    const { hookText: aiHook, sectorTeasers } = await generateThreadContent(
      sectorInputs,
      hookBudget,
      dateLabel,
    )

    let hookText = aiHook
    if (!hookText) {
      const topPost = posts?.find((p) => p.sector === activeSectors[0]?.sector)
      hookText = trimToFit(topPost?.summary ?? topPost?.title ?? 'AI is reshaping the job market faster than most people realize.', hookBudget)
    }

    const hookTweet = `${trimToFit(hookText, hookBudget)}${suffix}`
    const pollOptions = activeSectors.slice(0, 4).map((s) => s.sector.slice(0, 25))
    if (pollOptions.length < 2) {
      pollOptions.push('Too early to tell', 'None significantly')
    }
    const thread = buildThread(hookTweet, sectorInputs, sectorTeasers, pollOptions)

    if (dryRun) {
      return NextResponse.json({
        date: today,
        mode: 'dry-run',
        sectors: rankedSectors,
        activeSectors,
        thread,
      })
    }

    // Live posting
    let heroMediaId: string | undefined
    if (process.env.GOOGLE_AI_API_KEY && posts?.[0]) {
      try {
        const topSector = sectorInputs[0]?.sector ?? ''
        const topPost = posts.find((p) => p.sector === activeSectors[0]?.sector)
        const imageContext =
          globalHeadlines.length > 0
            ? globalHeadlines.slice(0, 3).join('; ')
            : (topPost?.summary ?? topPost?.title ?? posts[0].summary ?? posts[0].title)
        const imagePrompt = `Generate a photorealistic, cinematic image for Twitter/X (landscape 16:9) that visually represents this news story: "${posts[0].title}" — ${imageContext}. Sector: ${topSector}.

Style: dramatic photorealistic scene, editorial photography quality, moody cinematic lighting, shallow depth of field. No text, no overlays, no watermarks, no infographic elements. The image should tell the story visually — show the real-world impact through people, workplaces, or technology. Think Reuters/AP photo quality.`
        const imageDataUrl = await generateImage(imagePrompt)
        if (imageDataUrl) {
          const mediaId = await uploadMediaToTwitter(imageDataUrl, ck, cs, at, ats)
          if (mediaId) heroMediaId = mediaId
          // Also persist to Supabase storage
          try {
            const rawBase64 = imageDataUrl.replace(/^data:image\/\w+;base64,/, '')
            const buffer = Buffer.from(rawBase64, 'base64')
            const supabaseImg = await createAdminClient()
            await supabaseImg.storage
              .from('tweet-images')
              .upload(`roundup-${today}.png`, buffer, { contentType: 'image/png', upsert: true })
          } catch (storageErr) {
            console.error('tweet-daily-brief storage upload error:', storageErr)
          }
        }
      } catch (imgErr) {
        console.error('tweet-daily-brief image generation error:', imgErr)
      }
    }

    const tweetResults: Array<{ tweet: string; id?: string; success: boolean; error?: string }> = []

    const hookResult = await postTweet(
      hookTweet, ck, cs, at, ats, undefined, heroMediaId ? [heroMediaId] : undefined,
    )
    tweetResults.push({ tweet: hookTweet, ...hookResult })

    if (!hookResult.success) {
      return NextResponse.json({ date: today, mode: 'roundup', failed: true, results: tweetResults })
    }

    let lastTweetId = hookResult.id

    // Post sector tweets (indices 1..N-1 in thread, last is poll)
    const sectorTweetItems = thread.slice(1, -1)
    for (let i = 0; i < sectorTweetItems.length; i++) {
      await delay(1500)
      const item = sectorTweetItems[i]
      const sectorResult = await postTweet(item.text, ck, cs, at, ats, lastTweetId)
      tweetResults.push({ tweet: item.text, ...sectorResult })
      if (!sectorResult.success) {
        const supabase = await createAdminClient()
        const remainingItems = sectorTweetItems.slice(i + 1)
        for (let j = 0; j < remainingItems.length; j++) {
          await supabase.from('failed_tweets').insert({
            mode: `roundup-t${i + j + 3}`,
            tweet_text: remainingItems[j].text,
            error_message: sectorResult.error,
          })
        }
        break
      }
      lastTweetId = sectorResult.id
    }

    // Post poll tweet if all sector tweets succeeded
    const allSectorSucceeded = tweetResults.slice(1).every((r) => r.success)
    if (allSectorSucceeded) {
      await delay(1500)
      const pollItem = thread[thread.length - 1]
      const pollResult = await postTweet(
        pollItem.text, ck, cs, at, ats, lastTweetId, undefined, pollItem.poll_options,
      )
      tweetResults.push({ tweet: pollItem.text, ...pollResult })
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

  const url = new URL(request.url)
  const isPreview = url.searchParams.get('preview') === 'true'
  const ck = process.env.TWITTER_API_KEY!
  const cs = process.env.TWITTER_API_SECRET!
  const at = process.env.TWITTER_ACCESS_TOKEN!
  const ats = process.env.TWITTER_ACCESS_TOKEN_SECRET!

  const today = new Date().toISOString().split('T')[0]

  try {
    const { posts, rankedSectors, activeSectors, sectorInputs, sectorCounts, globalHeadlines } = await fetchRoundupData(today)
    const dateLabel = formatDate(today)

    if (!posts || posts.length === 0) {
      return NextResponse.json({ message: 'No posts found for today', date: today })
    }

    const totalArticles = Object.values(sectorCounts).reduce((a: number, b: number) => a + b, 0)
    const activeSectorCount = rankedSectors.length

    const suffix = `\n\n⚡ AI Job Clock · ${dateLabel} | ${totalArticles} stories across ${activeSectorCount} sectors\n🧵`
    const hookBudget = 280 - suffix.length

    const { hookText: aiHook, sectorTeasers } = await generateThreadContent(
      sectorInputs,
      hookBudget,
      dateLabel,
    )

    let hookText = aiHook
    if (!hookText) {
      const topPost = posts.find((p) => p.sector === activeSectors[0]?.sector)
      hookText = trimToFit(topPost?.summary ?? topPost?.title ?? 'AI is reshaping the job market faster than most people realize.', hookBudget)
    }

    const hookTweet = `${trimToFit(hookText, hookBudget)}${suffix}`
    const pollOptions = activeSectors.slice(0, 4).map((s) => s.sector.slice(0, 25))
    if (pollOptions.length < 2) {
      pollOptions.push('Too early to tell', 'None significantly')
    }
    const thread = buildThread(hookTweet, sectorInputs, sectorTeasers, pollOptions)

    // -----------------------------------------------------------------------
    // Preview mode — return thread JSON without posting
    // -----------------------------------------------------------------------
    if (isPreview) {
      return NextResponse.json({
        date: today,
        mode: 'preview',
        note: 'Preview mode — no tweets posted',
        sectors: rankedSectors,
        activeSectors: activeSectors.map((s) => s.sector),
        thread,
      })
    }

    // -----------------------------------------------------------------------
    // Live posting (Vercel cron hits GET)
    // -----------------------------------------------------------------------
    let heroMediaId: string | undefined
    if (process.env.GOOGLE_AI_API_KEY && posts[0]) {
      try {
        const topSector = sectorInputs[0]?.sector ?? ''
        const topPost = posts.find((p) => p.sector === activeSectors[0]?.sector)
        const imageContext =
          globalHeadlines.length > 0
            ? globalHeadlines.slice(0, 3).join('; ')
            : (topPost?.summary ?? topPost?.title ?? posts[0].summary ?? posts[0].title)
        const imagePrompt = `Generate a photorealistic, cinematic image for Twitter/X (landscape 16:9) that visually represents this news story: "${posts[0].title}" — ${imageContext}. Sector: ${topSector}.

Style: dramatic photorealistic scene, editorial photography quality, moody cinematic lighting, shallow depth of field. No text, no overlays, no watermarks, no infographic elements. The image should tell the story visually — show the real-world impact through people, workplaces, or technology. Think Reuters/AP photo quality.`
        const imageDataUrl = await generateImage(imagePrompt)
        if (imageDataUrl) {
          const mediaId = await uploadMediaToTwitter(imageDataUrl, ck, cs, at, ats)
          if (mediaId) heroMediaId = mediaId
          // Also persist to Supabase storage
          try {
            const rawBase64 = imageDataUrl.replace(/^data:image\/\w+;base64,/, '')
            const buffer = Buffer.from(rawBase64, 'base64')
            const supabaseImg = await createAdminClient()
            await supabaseImg.storage
              .from('tweet-images')
              .upload(`roundup-${today}.png`, buffer, { contentType: 'image/png', upsert: true })
          } catch (storageErr) {
            console.error('tweet-daily-brief storage upload error:', storageErr)
          }
        }
      } catch (imgErr) {
        console.error('tweet-daily-brief image generation error:', imgErr)
      }
    }

    const tweetResults: Array<{ tweet: string; id?: string; success: boolean; error?: string }> = []

    const hookResult = await postTweet(
      hookTweet, ck, cs, at, ats, undefined, heroMediaId ? [heroMediaId] : undefined,
    )
    tweetResults.push({ tweet: hookTweet, ...hookResult })

    if (!hookResult.success) {
      return NextResponse.json({ date: today, mode: 'roundup', failed: true, results: tweetResults })
    }

    let lastTweetId = hookResult.id

    const sectorTweetItems = thread.slice(1, -1)
    for (let i = 0; i < sectorTweetItems.length; i++) {
      await delay(1500)
      const item = sectorTweetItems[i]
      const sectorResult = await postTweet(item.text, ck, cs, at, ats, lastTweetId)
      tweetResults.push({ tweet: item.text, ...sectorResult })
      if (!sectorResult.success) {
        const supabase = await createAdminClient()
        const remainingItems = sectorTweetItems.slice(i + 1)
        for (let j = 0; j < remainingItems.length; j++) {
          await supabase.from('failed_tweets').insert({
            mode: `roundup-t${i + j + 3}`,
            tweet_text: remainingItems[j].text,
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
      const pollItem = thread[thread.length - 1]
      const pollResult = await postTweet(
        pollItem.text, ck, cs, at, ats, lastTweetId, undefined, pollItem.poll_options,
      )
      tweetResults.push({ tweet: pollItem.text, ...pollResult })
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
