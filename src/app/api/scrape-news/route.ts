import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

const SECTORS = [
  'Tech',
  'Finance',
  'Healthcare',
  'Manufacturing',
  'Retail',
  'Media',
  'Legal',
  'Education',
  'Transportation',
] as const

const SECTOR_QUERIES: Record<string, string> = {
  Tech: 'AI replacing tech workers software engineering layoffs',
  Finance: 'AI replacing finance banking jobs automation layoffs',
  Healthcare: 'AI replacing healthcare medical jobs automation',
  Manufacturing: 'AI robots replacing manufacturing factory workers',
  Retail: 'AI replacing retail jobs automation stores',
  Media: 'AI replacing journalists media content creators',
  Legal: 'AI replacing lawyers legal jobs automation',
  Education: 'AI replacing teachers education jobs automation',
  Transportation: 'AI replacing transportation drivers autonomous vehicles jobs',
}

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

function extractSummary(markdown: string | undefined, description: string | undefined): string | null {
  if (description && description.length >= 80 && !description.includes('https://') && !description.includes('http://')) {
    return description.substring(0, 300)
  }

  if (markdown) {
    const text = markdown
      .replace(/!?\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\S*https?:\/\/\S+/g, '')
      .replace(/https?:\/\/[^\s]+/g, '')
      .replace(/[#*`>_~]/g, '')
      .replace(
        /\b(GOLD|FOREX|SUBSCRIBE|SIGN UP|LOG IN|MENU|NAVIGATION|ADVERTISEMENT|COOKIE|Skip to main content|Share this|Follow us|Read more|Show more|Load more|Sign in|Create account|Newsletter)\b/gi,
        '',
      )
      .replace(/\b\d+°[CF]\b/g, '')
      .replace(/[ \t]+/g, ' ')

    const lines = text.split(/\n+/)
    for (const line of lines) {
      const cleaned = line.replace(/^[-•|]\s*/, '').trim()
      if (cleaned.length < 80) continue
      if ((cleaned.match(/\|/g) || []).length > 2) continue
      if (/^(Home|About|Contact|Privacy|Terms|Menu|Search|Latest|Section|Share|Follow|Subscribe|Sign|Log|Create|My |Profile|Settings|Dashboard)/i.test(cleaned)) continue
      const words = cleaned.split(/\s+/)
      if (words.length < 8) continue
      const avgWordLen = cleaned.replace(/\s/g, '').length / words.length
      if (avgWordLen < 3.5) continue
      if ((cleaned.match(/ - /g) || []).length > 3) continue
      return cleaned.substring(0, 300)
    }
  }

  if (description && description.length >= 30 && !description.includes('https://')) {
    return description.substring(0, 300)
  }
  return null
}

interface FirecrawlResult {
  url?: string
  title?: string
  description?: string
  markdown?: string
}

async function scrapeSector(
  sector: string,
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  firecrawlKey: string,
  limit: number,
  tbs: string,
): Promise<{ inserted: number; updated: number; errors: string[] }> {
  const query = SECTOR_QUERIES[sector] || `AI job losses ${sector}`
  const errors: string[] = []
  let inserted = 0
  let updated = 0

  const response = await fetch('https://api.firecrawl.dev/v1/search', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${firecrawlKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      limit,
      tbs,
      scrapeOptions: { formats: ['markdown'] },
    }),
  })

  const searchData = await response.json()

  if (!response.ok || !searchData.success) {
    const msg = `firecrawl failed for ${sector}: ${response.status} ${JSON.stringify(searchData).slice(0, 300)}`
    console.error(msg)
    errors.push(msg)
    return { inserted, updated, errors }
  }

  const results: FirecrawlResult[] = searchData.data || []

  for (const result of results) {
    if (!result.url || !result.title) continue

    const summary = extractSummary(result.markdown, result.description)

    let sourceName = 'unknown'
    try {
      sourceName = new URL(result.url).hostname.replace('www.', '')
    } catch {
      /* keep fallback */
    }

    const { data: existing } = await supabase
      .from('news_articles')
      .select('id')
      .eq('url', result.url)
      .maybeSingle()

    if (existing) {
      const { error } = await supabase
        .from('news_articles')
        .update({
          title: result.title,
          summary,
          source_name: sourceName,
          scraped_at: new Date().toISOString(),
        })
        .eq('url', result.url)

      if (error) {
        console.error(`scrape-news update error (${sector}):`, error)
        errors.push(`update ${result.url}: ${error.message}`)
      } else {
        updated++
      }
    } else {
      const { error } = await supabase.from('news_articles').insert({
        title: result.title,
        url: result.url,
        summary,
        sector,
        source_name: sourceName,
        published_at: new Date().toISOString(),
        scraped_at: new Date().toISOString(),
      })

      if (error) {
        console.error(`scrape-news insert error (${sector}):`, error)
        errors.push(`insert ${result.url}: ${error.message}`)
      } else {
        inserted++
      }
    }
  }

  const { count } = await supabase
    .from('news_articles')
    .select('*', { count: 'exact', head: true })
    .eq('sector', sector)

  await supabase
    .from('sector_stats')
    .update({ article_count: count || 0, last_updated: new Date().toISOString() })
    .eq('sector_name', sector)

  return { inserted, updated, errors }
}

export async function GET(request: NextRequest) {
  const authorized = await checkAuth(request)
  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const firecrawlKey = process.env.FIRECRAWL_API_KEY
  if (!firecrawlKey) {
    return NextResponse.json({ error: 'FIRECRAWL_API_KEY not configured' }, { status: 500 })
  }

  const sectorParam = request.nextUrl.searchParams.get('sector')
  const limit = Number(request.nextUrl.searchParams.get('limit') ?? '5')
  const tbs = request.nextUrl.searchParams.get('tbs') ?? 'qdr:w'

  const sectorsToScrape = sectorParam
    ? SECTORS.filter((s) => s === sectorParam)
    : [...SECTORS]

  if (sectorsToScrape.length === 0) {
    return NextResponse.json({ error: `Unknown sector: ${sectorParam}` }, { status: 400 })
  }

  const supabase = await createAdminClient()
  const results: Record<string, { inserted: number; updated: number; errors: string[] }> = {}
  let totalInserted = 0
  let totalUpdated = 0

  for (const sector of sectorsToScrape) {
    try {
      const r = await scrapeSector(sector, supabase, firecrawlKey, limit, tbs)
      results[sector] = r
      totalInserted += r.inserted
      totalUpdated += r.updated
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`scrape-news error (${sector}):`, err)
      results[sector] = { inserted: 0, updated: 0, errors: [msg] }
    }
  }

  await supabase
    .from('global_stats')
    .update({ last_updated: new Date().toISOString() })
    .not('id', 'is', null)

  return NextResponse.json({
    success: true,
    totalInserted,
    totalUpdated,
    results,
  })
}

export async function POST(request: NextRequest) {
  const authorized = await checkAuth(request)
  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const firecrawlKey = process.env.FIRECRAWL_API_KEY
  if (!firecrawlKey) {
    return NextResponse.json({ error: 'FIRECRAWL_API_KEY not configured' }, { status: 500 })
  }

  const body = await request.json().catch(() => ({}))
  const requestedSectors: string[] | undefined = body?.sectors
  const limit: number = body?.limit ?? 5
  const tbs: string = body?.tbs ?? 'qdr:w'

  const sectorsToScrape = requestedSectors?.length
    ? SECTORS.filter((s) => requestedSectors.includes(s))
    : [...SECTORS]

  const supabase = await createAdminClient()
  const results: Record<string, { inserted: number; updated: number; errors: string[] }> = {}
  let totalInserted = 0
  let totalUpdated = 0

  for (const sector of sectorsToScrape) {
    try {
      const r = await scrapeSector(sector, supabase, firecrawlKey, limit, tbs)
      results[sector] = r
      totalInserted += r.inserted
      totalUpdated += r.updated
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`scrape-news error (${sector}):`, err)
      results[sector] = { inserted: 0, updated: 0, errors: [msg] }
    }
  }

  await supabase
    .from('global_stats')
    .update({ last_updated: new Date().toISOString() })
    .not('id', 'is', null)

  return NextResponse.json({
    success: true,
    totalInserted,
    totalUpdated,
    results,
  })
}
