import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

const ADMIN_EMAIL = 'paul.dodd@gmail.com'

export async function GET() {
  // Verify the logged-in user
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user || user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const adminSupabase = await createAdminClient()

  // 1. Fetch all subscribers
  const { data: subscribers, error: subError } = await adminSupabase
    .from('newsletter_subscribers')
    .select('email, sectors, frequency, active, subscribed_at')

  if (subError) {
    console.error('admin-stats subscribers error:', subError)
    return NextResponse.json(
      { error: 'Failed to fetch subscribers' },
      { status: 500 },
    )
  }

  // 2. Count totals
  const totalSubscribers = subscribers?.length ?? 0
  const activeSubscribers =
    subscribers?.filter((s) => s.active).length ?? 0

  // 3. Fetch email logs ordered by sent_at desc
  const { data: emailLogs } = await adminSupabase
    .from('email_logs')
    .select('subscriber_email, resend_id, status, sent_at')
    .order('sent_at', { ascending: false })

  // 4. Build map of latest email log per subscriber email
  const latestEmailMap = new Map<
    string,
    { subscriber_email: string; resend_id: string | null; status: string; sent_at: string }
  >()
  for (const log of emailLogs ?? []) {
    if (!latestEmailMap.has(log.subscriber_email)) {
      latestEmailMap.set(log.subscriber_email, log)
    }
  }

  // 5. For logs with resend_id and status='sent', check Resend for delivery status
  const resendApiKey = process.env.RESEND_API_KEY
  if (resendApiKey) {
    const checkPromises: Promise<void>[] = []
    for (const [email, log] of latestEmailMap) {
      if (log.resend_id && log.status === 'sent') {
        checkPromises.push(
          fetch(`https://api.resend.com/emails/${log.resend_id}`, {
            headers: { Authorization: `Bearer ${resendApiKey}` },
          })
            .then((r) => (r.ok ? r.json() : null))
            .then((data) => {
              if (data?.last_event) {
                latestEmailMap.set(email, {
                  ...log,
                  status: data.last_event,
                })
              }
            })
            .catch(() => {}),
        )
      }
    }
    await Promise.all(checkPromises)
  }

  // 6. Enrich subscribers with lastEmail info
  const enrichedSubscribers = (subscribers ?? []).map((sub) => ({
    ...sub,
    lastEmail: latestEmailMap.get(sub.email) ?? null,
  }))

  // 7. Subscribers from last 30 days grouped by date
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const { data: recentSubs } = await adminSupabase
    .from('newsletter_subscribers')
    .select('subscribed_at')
    .gte('subscribed_at', thirtyDaysAgo.toISOString())

  const subsByDate: Record<string, number> = {}
  for (const sub of recentSubs ?? []) {
    const date = sub.subscribed_at?.slice(0, 10)
    if (date) subsByDate[date] = (subsByDate[date] ?? 0) + 1
  }

  // 8. Page views from last 30 days grouped by date
  const { data: recentViews } = await adminSupabase
    .from('page_views')
    .select('viewed_at, visitor_id')
    .gte('viewed_at', thirtyDaysAgo.toISOString())

  const viewsByDate: Record<string, number> = {}
  const uniqueVisitorsByDate: Record<string, Set<string>> = {}

  for (const view of recentViews ?? []) {
    const date = view.viewed_at?.slice(0, 10)
    if (!date) continue
    viewsByDate[date] = (viewsByDate[date] ?? 0) + 1
    if (view.visitor_id) {
      if (!uniqueVisitorsByDate[date]) uniqueVisitorsByDate[date] = new Set()
      uniqueVisitorsByDate[date].add(view.visitor_id)
    }
  }

  // Convert Sets to counts
  const uniqueVisitorsByDateCounts: Record<string, number> = {}
  for (const [date, set] of Object.entries(uniqueVisitorsByDate)) {
    uniqueVisitorsByDateCounts[date] = set.size
  }

  // 9. Today's stats
  const today = new Date().toISOString().slice(0, 10)
  const todayViews = viewsByDate[today] ?? 0
  const todayUnique = uniqueVisitorsByDateCounts[today] ?? 0
  const todaySubs = subsByDate[today] ?? 0

  return NextResponse.json({
    totalSubscribers,
    activeSubscribers,
    subscribers: enrichedSubscribers,
    subsByDate,
    viewsByDate,
    uniqueVisitorsByDate: uniqueVisitorsByDateCounts,
    todayViews,
    todayUnique,
    todaySubs,
  })
}
