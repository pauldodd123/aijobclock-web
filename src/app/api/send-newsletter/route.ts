import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://aijobclock.com'

function buildEmailHtml(data: {
  articles: any[]
  posts: any[]
  sectorStats: any[]
  frequency: string
  sectors: string[]
  unsubscribeUrl: string
  siteUrl: string
}): string {
  const { articles, posts, sectorStats, frequency, unsubscribeUrl, siteUrl } =
    data

  const dateStr = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const postHtml =
    posts.length > 0
      ? posts
          .map(
            (post) => `
        <tr>
          <td style="padding:16px 0;border-bottom:1px solid #2a2a2a;">
            <p style="margin:0 0 4px;font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.05em;">${post.sector ?? ''}</p>
            <a href="${siteUrl}/blog/${post.id}" style="color:#ffffff;text-decoration:none;font-size:16px;font-weight:600;line-height:1.4;">${post.title}</a>
            ${post.summary ? `<p style="margin:8px 0 0;color:#a0a0a0;font-size:14px;line-height:1.5;">${post.summary}</p>` : ''}
          </td>
        </tr>`,
          )
          .join('')
      : `<tr><td style="padding:16px 0;color:#888;font-size:14px;">No analysis posts this period.</td></tr>`

  const articleHtml =
    articles.length > 0
      ? articles
          .map(
            (article) => `
        <tr>
          <td style="padding:12px 0;border-bottom:1px solid #2a2a2a;">
            <p style="margin:0 0 4px;font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.05em;">${article.sector ?? ''} · ${article.source_name ?? ''}</p>
            <a href="${article.url}" style="color:#e0e0e0;text-decoration:none;font-size:14px;font-weight:500;line-height:1.4;">${article.title}</a>
            ${article.summary ? `<p style="margin:6px 0 0;color:#a0a0a0;font-size:13px;line-height:1.5;">${article.summary}</p>` : ''}
          </td>
        </tr>`,
          )
          .join('')
      : `<tr><td style="padding:12px 0;color:#888;font-size:14px;">No headlines this period.</td></tr>`

  const topSectors = sectorStats.slice(0, 5)
  const sectorHtml =
    topSectors.length > 0
      ? topSectors
          .map(
            (s) => `
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #2a2a2a;">
            <span style="color:#e0e0e0;font-size:14px;">${s.sector_name}</span>
            <span style="float:right;color:#a0a0a0;font-size:13px;">${s.estimated_jobs_at_risk != null ? s.estimated_jobs_at_risk.toLocaleString() + ' jobs at risk' : ''}</span>
          </td>
        </tr>`,
          )
          .join('')
      : ''

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:sans-serif;color:#ffffff;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:600px;background:#1a1a1a;border-radius:8px;padding:40px;">
          <tr>
            <td>
              <!-- Header -->
              <h1 style="margin:0 0 4px;font-size:26px;font-weight:700;">AI Job Clock</h1>
              <p style="margin:0 0 8px;color:#a0a0a0;font-size:13px;">${frequency === 'daily' ? 'Daily' : 'Weekly'} Update · ${dateStr}</p>
              <hr style="border:none;border-top:1px solid #2a2a2a;margin:24px 0;" />

              <!-- Analysis / Blog Posts -->
              <h2 style="margin:0 0 16px;font-size:18px;font-weight:600;">Analysis</h2>
              <table width="100%" cellpadding="0" cellspacing="0">
                ${postHtml}
              </table>

              <hr style="border:none;border-top:1px solid #2a2a2a;margin:28px 0;" />

              <!-- Latest Headlines -->
              <h2 style="margin:0 0 16px;font-size:18px;font-weight:600;">Latest Headlines</h2>
              <table width="100%" cellpadding="0" cellspacing="0">
                ${articleHtml}
              </table>

              ${
                sectorHtml
                  ? `
              <hr style="border:none;border-top:1px solid #2a2a2a;margin:28px 0;" />

              <!-- Sector Snapshot -->
              <h2 style="margin:0 0 16px;font-size:18px;font-weight:600;">Sector Snapshot</h2>
              <table width="100%" cellpadding="0" cellspacing="0">
                ${sectorHtml}
              </table>`
                  : ''
              }

              <!-- Footer -->
              <hr style="border:none;border-top:1px solid #2a2a2a;margin:32px 0 24px;" />
              <p style="margin:0;color:#666;font-size:12px;line-height:1.6;">
                You're receiving this because you subscribed to AI Job Clock updates.<br />
                <a href="${siteUrl}" style="color:#888;text-decoration:underline;">Visit AI Job Clock</a> ·
                <a href="${unsubscribeUrl}" style="color:#888;text-decoration:underline;">Unsubscribe</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

export async function POST(request: NextRequest) {
  // Auth check: allow cron secret or admin user
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')
  const isFromCron = cronSecret && authHeader === `Bearer ${cronSecret}`
  if (!isFromCron) {
    const { createClient } = await import('@/lib/supabase/server')
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user || user.email !== 'paul.dodd@gmail.com') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const resendApiKey = process.env.RESEND_API_KEY
  if (!resendApiKey) {
    console.error('RESEND_API_KEY is not set')
    return NextResponse.json(
      { error: 'Email service not configured' },
      { status: 500 },
    )
  }

  const body = await request.json().catch(() => ({}))
  const targetFrequency: string = body.frequency ?? 'weekly'

  const supabase = await createAdminClient()

  // 1. Fetch active subscribers for this frequency
  const { data: subscribers, error: subError } = await supabase
    .from('newsletter_subscribers')
    .select('email, sectors, frequency, unsubscribe_token')
    .eq('active', true)
    .eq('frequency', targetFrequency)

  if (subError) {
    console.error('send-newsletter subscribers error:', subError)
    return NextResponse.json(
      { error: 'Failed to fetch subscribers' },
      { status: 500 },
    )
  }

  if (!subscribers || subscribers.length === 0) {
    return NextResponse.json({
      message: 'No active subscribers for this frequency',
      sent: 0,
    })
  }

  // 2. Fetch recent content
  const daysBack = targetFrequency === 'daily' ? 1 : 7
  const since = new Date(
    Date.now() - daysBack * 24 * 60 * 60 * 1000,
  ).toISOString()

  const [articlesResult, postsResult, statsResult] = await Promise.all([
    supabase
      .from('news_articles')
      .select('id, title, url, summary, sector, source_name, scraped_at')
      .gte('scraped_at', since)
      .order('scraped_at', { ascending: false })
      .limit(20),
    supabase
      .from('blog_posts')
      .select('id, title, slug, sector, summary, created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('sector_stats')
      .select('sector_name, estimated_jobs_at_risk, trend_direction, article_count')
      .order('estimated_jobs_at_risk', { ascending: false }),
  ])

  const allArticles = (articlesResult.data as any[]) ?? []
  const allPosts = (postsResult.data as any[]) ?? []
  const sectorStats = (statsResult.data as any[]) ?? []

  // 3. Send to each subscriber
  let sent = 0
  const errors: string[] = []
  const date = new Date().toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

  for (const sub of subscribers) {
    const subSectors: string[] = sub.sectors ?? []
    const wantsAll =
      subSectors.length === 0 || subSectors.includes('All')

    // Filter content by subscriber's sectors
    const filteredArticles = wantsAll
      ? allArticles
      : allArticles.filter(
          (a) => a.sector && subSectors.includes(a.sector),
        )
    const filteredPosts = wantsAll
      ? allPosts
      : allPosts.filter(
          (p) => p.sector && subSectors.includes(p.sector),
        )

    // Skip if no relevant content
    if (filteredArticles.length === 0 && filteredPosts.length === 0) {
      continue
    }

    const unsubscribeUrl = `${SITE_URL}/api/unsubscribe?token=${sub.unsubscribe_token}`

    const html = buildEmailHtml({
      articles: filteredArticles,
      posts: filteredPosts,
      sectorStats,
      frequency: targetFrequency,
      sectors: subSectors,
      unsubscribeUrl,
      siteUrl: SITE_URL,
    })

    const subject = `${targetFrequency === 'daily' ? 'Daily' : 'Weekly'} AI Job Clock Update — ${date}`

    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'AI Job Clock <fred@update.aijobclock.com>',
          to: [sub.email],
          subject,
          html,
        }),
      })

      if (res.ok) {
        const resData = await res.json()
        await supabase.from('email_logs').insert({
          subscriber_email: sub.email,
          resend_id: resData.id ?? null,
          status: 'sent',
        })
        sent++
      } else {
        const errText = await res.text()
        console.error(`Resend error for ${sub.email}:`, res.status, errText)
        await supabase.from('email_logs').insert({
          subscriber_email: sub.email,
          status: 'send_failed',
        })
        errors.push(`${sub.email}: ${res.status} ${errText}`)
      }
    } catch (err: any) {
      console.error(`Failed to send to ${sub.email}:`, err)
      await supabase.from('email_logs').insert({
        subscriber_email: sub.email,
        status: 'send_failed',
      })
      errors.push(`${sub.email}: ${err.message ?? 'Unknown error'}`)
    }
  }

  return NextResponse.json({
    sent,
    total: subscribers.length,
    errors: errors.slice(0, 5),
  })
}

export async function GET(request: NextRequest) {
  // Auth check: allow cron secret or admin user
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')
  const isFromCron = cronSecret && authHeader === `Bearer ${cronSecret}`
  if (!isFromCron) {
    const { createClient } = await import('@/lib/supabase/server')
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user || user.email !== 'paul.dodd@gmail.com') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const resendApiKey = process.env.RESEND_API_KEY
  if (!resendApiKey) {
    console.error('RESEND_API_KEY is not set')
    return NextResponse.json(
      { error: 'Email service not configured' },
      { status: 500 },
    )
  }

  // For GET, default to weekly frequency
  const targetFrequency: string = 'weekly'

  const supabase = await createAdminClient()

  // 1. Fetch active subscribers for this frequency
  const { data: subscribers, error: subError } = await supabase
    .from('newsletter_subscribers')
    .select('email, sectors, frequency, unsubscribe_token')
    .eq('active', true)
    .eq('frequency', targetFrequency)

  if (subError) {
    console.error('send-newsletter subscribers error:', subError)
    return NextResponse.json(
      { error: 'Failed to fetch subscribers' },
      { status: 500 },
    )
  }

  if (!subscribers || subscribers.length === 0) {
    return NextResponse.json({
      message: 'No active subscribers for this frequency',
      sent: 0,
    })
  }

  // 2. Fetch recent content
  const daysBack = targetFrequency === 'daily' ? 1 : 7
  const since = new Date(
    Date.now() - daysBack * 24 * 60 * 60 * 1000,
  ).toISOString()

  const [articlesResult, postsResult, statsResult] = await Promise.all([
    supabase
      .from('news_articles')
      .select('id, title, url, summary, sector, source_name, scraped_at')
      .gte('scraped_at', since)
      .order('scraped_at', { ascending: false })
      .limit(20),
    supabase
      .from('blog_posts')
      .select('id, title, slug, sector, summary, created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('sector_stats')
      .select('sector_name, estimated_jobs_at_risk, trend_direction, article_count')
      .order('estimated_jobs_at_risk', { ascending: false }),
  ])

  const allArticles = (articlesResult.data as any[]) ?? []
  const allPosts = (postsResult.data as any[]) ?? []
  const sectorStats = (statsResult.data as any[]) ?? []

  // 3. Send to each subscriber
  let sent = 0
  const errors: string[] = []
  const date = new Date().toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

  for (const sub of subscribers) {
    const subSectors: string[] = sub.sectors ?? []
    const wantsAll =
      subSectors.length === 0 || subSectors.includes('All')

    // Filter content by subscriber's sectors
    const filteredArticles = wantsAll
      ? allArticles
      : allArticles.filter(
          (a) => a.sector && subSectors.includes(a.sector),
        )
    const filteredPosts = wantsAll
      ? allPosts
      : allPosts.filter(
          (p) => p.sector && subSectors.includes(p.sector),
        )

    // Skip if no relevant content
    if (filteredArticles.length === 0 && filteredPosts.length === 0) {
      continue
    }

    const unsubscribeUrl = `${SITE_URL}/api/unsubscribe?token=${sub.unsubscribe_token}`

    const html = buildEmailHtml({
      articles: filteredArticles,
      posts: filteredPosts,
      sectorStats,
      frequency: targetFrequency,
      sectors: subSectors,
      unsubscribeUrl,
      siteUrl: SITE_URL,
    })

    const subject = `${targetFrequency === 'daily' ? 'Daily' : 'Weekly'} AI Job Clock Update — ${date}`

    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'AI Job Clock <fred@update.aijobclock.com>',
          to: [sub.email],
          subject,
          html,
        }),
      })

      if (res.ok) {
        const resData = await res.json()
        await supabase.from('email_logs').insert({
          subscriber_email: sub.email,
          resend_id: resData.id ?? null,
          status: 'sent',
        })
        sent++
      } else {
        const errText = await res.text()
        console.error(`Resend error for ${sub.email}:`, res.status, errText)
        await supabase.from('email_logs').insert({
          subscriber_email: sub.email,
          status: 'send_failed',
        })
        errors.push(`${sub.email}: ${res.status} ${errText}`)
      }
    } catch (err: any) {
      console.error(`Failed to send to ${sub.email}:`, err)
      await supabase.from('email_logs').insert({
        subscriber_email: sub.email,
        status: 'send_failed',
      })
      errors.push(`${sub.email}: ${err.message ?? 'Unknown error'}`)
    }
  }

  return NextResponse.json({
    sent,
    total: subscribers.length,
    errors: errors.slice(0, 5),
  })
}
