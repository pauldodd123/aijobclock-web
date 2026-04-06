import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getGeminiModel } from '@/lib/google-ai'

const SECTORS = [
  'Tech', 'Finance', 'Healthcare', 'Manufacturing',
  'Retail', 'Media', 'Legal', 'Education', 'Transportation',
]

const SECTOR_SEARCH_QUERIES: Record<string, string[]> = {
  Tech: [
    'software engineering terminology glossary developer jargon',
    'tech industry job titles roles CTO VP engineering staff engineer',
    'AI impact software development terminology automation DevOps SRE',
  ],
  Finance: [
    'finance banking terminology glossary trader analyst portfolio manager',
    'financial services industry jargon terms Wall Street',
    'AI fintech automation impact banking jobs terminology',
  ],
  Healthcare: [
    'healthcare medical terminology glossary clinician physician nurse practitioner',
    'health IT terminology EHR EMR clinical decision support',
    'AI healthcare automation medical imaging diagnostics terminology',
  ],
  Manufacturing: [
    'manufacturing industry terminology glossary shop floor production line',
    'industrial automation robotics terminology Industry 4.0 smart factory',
    'AI manufacturing jobs terminology CNC machinist quality control',
  ],
  Retail: [
    'retail industry terminology glossary merchandising inventory management',
    'ecommerce retail operations terminology omnichannel supply chain',
    'AI retail automation checkout self-service terminology',
  ],
  Media: [
    'media journalism terminology glossary newsroom editorial reporter',
    'content creation publishing industry terms masthead byline editorial',
    'AI media content generation journalism automation terminology',
  ],
  Legal: [
    'legal profession terminology glossary attorney paralegal associate partner',
    'legal technology AI legaltech e-discovery predictive coding TAR CLM',
    'law firm business terminology billable hours matter engagement retainer',
  ],
  Education: [
    'education terminology glossary pedagogy curriculum instructor professor',
    'edtech learning management system terminology LMS adaptive learning',
    'AI education automation grading tutoring terminology',
  ],
  Transportation: [
    'transportation logistics terminology glossary fleet management dispatcher',
    'autonomous vehicles self-driving terminology SAE levels ADAS',
    'AI transportation automation trucking last-mile delivery terminology',
  ],
}

async function checkAuth(request: NextRequest): Promise<boolean> {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true

  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user && user.email === 'paul.dodd@gmail.com') return true

  return false
}

export async function GET(request: NextRequest) {
  if (!await checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  let sector = searchParams.get('sector') ?? ''

  const supabase = await createAdminClient()

  if (!sector) {
    const { data: existing } = await supabase
      .from('terminology_guides')
      .select('sector, last_researched_at')
      .order('last_researched_at', { ascending: true })

    const existingSectors = new Set((existing ?? []).map((e: { sector: string }) => e.sector))
    const missing = SECTORS.find((s) => !existingSectors.has(s))
    if (missing) {
      sector = missing
    } else {
      sector = existing?.[0]?.sector ?? SECTORS[0]
    }
  }

  if (!SECTORS.includes(sector)) {
    return NextResponse.json({ error: `Invalid sector: ${sector}` }, { status: 400 })
  }

  console.log(`Researching terminology for: ${sector}`)

  const firecrawlKey = process.env.FIRECRAWL_API_KEY
  const queries = SECTOR_SEARCH_QUERIES[sector] ?? [`${sector} industry terminology glossary AI impact`]
  let researchContent = ''
  const sources: string[] = []

  for (const query of queries) {
    if (!firecrawlKey) break

    try {
      const searchResp = await fetch('https://api.firecrawl.dev/v1/search', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${firecrawlKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          limit: 3,
          scrapeOptions: { formats: ['markdown'] },
        }),
      })

      const searchData = await searchResp.json()
      if (searchResp.ok && searchData.success && searchData.data) {
        for (const result of searchData.data) {
          if (result.url) sources.push(result.url)
          if (result.markdown) {
            researchContent += `\n\n--- Source: ${result.url} ---\n${result.markdown.slice(0, 2000)}`
          }
        }
      }
    } catch (e) {
      console.error(`Search failed for query "${query}":`, e)
    }
  }

  const systemPrompt = `You are creating a TERMINOLOGY GUIDE for the "${sector}" sector, for an AI journalist that writes daily briefings about AI's impact on that industry and its jobs. Write the guide directly with no preamble.`

  const userPrompt = `Create a comprehensive terminology guide for the "${sector}" sector with these sections:

## CORRECT TERMINOLOGY (use these)
List 40-60 terms/phrases standard in the ${sector} industry, with brief definitions. Group by:
- Industry structure & roles (job titles, hierarchy, departments)
- Practice areas / functions most affected by AI
- Industry-specific tech & AI terms used BY professionals in ${sector}
- Business operations terminology
- Key processes & workflows
- Regulatory & compliance terms

## COMMON MISTAKES (avoid these)
List 20-30 phrases a generic AI writer might use BUT a ${sector} professional would NOT say, paired with the correct alternative. Format: WRONG: "X" → RIGHT: "Y"

## TONE & STYLE NOTES
- How ${sector} professionals talk about their work
- What's credible vs sensationalist in ${sector} media
- Key publications ${sector} professionals read
- Important distinctions in terminology

## AI-SPECIFIC ${sector.toUpperCase()} CONTEXT
- Which roles are most affected by AI
- Which roles are least affected
- Key AI companies/tools in this sector
- Current debates about AI adoption

${researchContent ? `\n\nUse the following research material as reference:\n${researchContent.slice(0, 12000)}` : ''}

Be thorough. This guide will be injected into prompts daily to ensure authentic, credible writing about the ${sector} sector.`

  const model = getGeminiModel('gemini-2.5-flash')
  const result = await model.generateContent([
    { role: 'user', parts: [{ text: systemPrompt + '\n\n' + userPrompt }] },
  ])
  const guideContent = result.response.text()

  if (!guideContent) {
    return NextResponse.json({ error: 'No content generated' }, { status: 500 })
  }

  const uniqueSources = [...new Set(sources)].slice(0, 10)

  const { error: upsertError } = await supabase
    .from('terminology_guides')
    .upsert(
      {
        sector,
        guide_content: guideContent,
        sources: uniqueSources,
        last_researched_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'sector' },
    )

  if (upsertError) {
    console.error('Upsert error:', upsertError)
    return NextResponse.json({ error: 'Failed to save guide', details: upsertError }, { status: 500 })
  }

  console.log(`Terminology guide for ${sector} saved (${guideContent.length} chars, ${uniqueSources.length} sources)`)

  return NextResponse.json({
    success: true,
    sector,
    guide_length: guideContent.length,
    sources_count: uniqueSources.length,
  })
}
