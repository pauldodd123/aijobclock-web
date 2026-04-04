'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip,
} from 'recharts'
import {
  Users, UserPlus, LogOut, Send, Loader2,
  ChevronDown, ChevronUp, Mail
} from 'lucide-react'

interface Subscriber {
  email: string
  sectors: string[]
  frequency: string
  active: boolean
  subscribed_at: string
  lastEmail: { resend_id: string | null; status: string; sent_at: string } | null
}

interface AdminStats {
  totalSubscribers: number
  activeSubscribers: number
  subscribers: Subscriber[]
  subsByDate: Record<string, number>
  todaySubs: number
}

export default function AdminPage() {
  const supabase = createClient()

  const [session, setSession] = useState<any>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [resetSent, setResetSent] = useState(false)
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [statsError, setStatsError] = useState('')
  const [authChecked, setAuthChecked] = useState(false)
  const [tweetDate, setTweetDate] = useState(() => new Date().toISOString().split('T')[0])
  const [tweetPreview, setTweetPreview] = useState<any>(null)
  const [tweetLoading, setTweetLoading] = useState(false)
  const [tweetError, setTweetError] = useState('')
  const [tweetPosting, setTweetPosting] = useState(false)
  const [tweetPostResult, setTweetPostResult] = useState<any>(null)
  const [showSubscribers, setShowSubscribers] = useState(false)

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setAuthChecked(true)
    })
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setAuthChecked(true)
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session || session.user.email !== 'paul.dodd@gmail.com') return
    fetch('/api/admin-stats')
      .then(r => r.json())
      .then(data => setStats(data))
      .catch(e => setStatsError(e.message || 'Failed to load stats'))
  }, [session])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (email !== 'paul.dodd@gmail.com') { setStatsError('Access denied.'); return }
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) setStatsError(error.message)
  }

  const handleResetPassword = async () => {
    if (!email) { setStatsError('Enter your email first.'); return }
    setLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`
    })
    setLoading(false)
    if (error) setStatsError(error.message)
    else setResetSent(true)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setSession(null)
    setStats(null)
  }

  const handleTweetPreview = async () => {
    setTweetLoading(true)
    setTweetError('')
    setTweetPreview(null)
    try {
      const res = await fetch('/api/tweet-daily-brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'roundup', dry_run: true, date: tweetDate })
      })
      const data = await res.json()
      setTweetPreview(data)
    } catch (e: any) {
      setTweetError(e.message || 'Failed to load preview')
    } finally {
      setTweetLoading(false)
    }
  }

  const handleTweetPost = async () => {
    setTweetPosting(true)
    setTweetError('')
    setTweetPostResult(null)
    try {
      const res = await fetch('/api/tweet-daily-brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'roundup', dry_run: false, date: tweetDate })
      })
      const data = await res.json()
      setTweetPostResult(data)
    } catch (e: any) {
      setTweetError(e.message || 'Failed to post tweet')
    } finally {
      setTweetPosting(false)
    }
  }

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    )
  }

  if (!session || session.user.email !== 'paul.dodd@gmail.com') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 space-y-4">
          <h1 className="text-lg font-semibold text-foreground">Admin Login</h1>
          {resetSent ? (
            <p className="text-sm text-muted-foreground">Check your email for a password reset link.</p>
          ) : (
            <form onSubmit={handleLogin} className="space-y-4">
              <input
                type="email"
                placeholder="Email address"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Loading…' : 'Log in'}
              </Button>
              {statsError && <p className="text-sm text-destructive">{statsError}</p>}
              <button
                type="button"
                className="text-xs text-muted-foreground underline w-full text-center"
                onClick={handleResetPassword}
              >
                Forgot password? Send reset link
              </button>
            </form>
          )}
        </div>
      </div>
    )
  }

  // Build chart data
  const last30 = Array.from({ length: 30 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - 29 + i)
    return d.toISOString().split('T')[0]
  })

  const subsChartData = last30.map(date => ({
    date: date.slice(5),
    count: stats?.subsByDate[date] || 0,
  }))

  const statusColor: Record<string, string> = {
    delivered: 'bg-green-500/10 text-green-600',
    bounced: 'bg-destructive/10 text-destructive',
    complained: 'bg-orange-500/10 text-orange-600',
    sent: 'bg-blue-500/10 text-blue-600',
    send_failed: 'bg-destructive/10 text-destructive',
  }

  return (
    <div className="min-h-screen bg-background p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Admin Dashboard</h1>
        <Button variant="ghost" size="sm" onClick={handleLogout}>
          <LogOut className="size-4 mr-1" />
          Log out
        </Button>
      </div>

      {statsError && (
        <p className="text-sm text-destructive">{statsError}</p>
      )}

      {/* Summary cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="rounded-xl border border-border bg-card p-6">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <Users className="size-4" />
              <span className="text-xs font-medium">Total Subscribers</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{stats.totalSubscribers}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-6">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <Users className="size-4" />
              <span className="text-xs font-medium">Active Subscribers</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{stats.activeSubscribers}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-6">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <UserPlus className="size-4" />
              <span className="text-xs font-medium">Subs Today</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{stats.todaySubs}</p>
          </div>
        </div>
      )}

      {/* Subscriber list (collapsible) */}
      {stats && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <button
            className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-muted/50 transition-colors"
            onClick={() => setShowSubscribers(v => !v)}
          >
            <div className="flex items-center gap-2">
              <Mail className="size-4 text-muted-foreground" />
              <span className="font-medium text-foreground">Subscribers ({stats.totalSubscribers})</span>
            </div>
            {showSubscribers ? (
              <ChevronUp className="size-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="size-4 text-muted-foreground" />
            )}
          </button>
          {showSubscribers && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-t border-border bg-muted/30">
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Email</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Sectors</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Freq</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Status</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Last Email</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Subscribed</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.subscribers.map(sub => (
                    <tr key={sub.email} className="border-t border-border hover:bg-muted/20">
                      <td className="px-4 py-2 text-foreground">{sub.email}</td>
                      <td className="px-4 py-2 text-muted-foreground">{sub.sectors.join(', ')}</td>
                      <td className="px-4 py-2 text-muted-foreground">{sub.frequency}</td>
                      <td className="px-4 py-2">
                        <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${sub.active ? 'bg-green-500/10 text-green-600' : 'bg-muted text-muted-foreground'}`}>
                          {sub.active ? 'active' : 'inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        {sub.lastEmail ? (
                          <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${statusColor[sub.lastEmail.status] || 'bg-muted text-muted-foreground'}`}>
                            {sub.lastEmail.status}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-muted-foreground text-xs">
                        {new Date(sub.subscribed_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Subscriber growth chart */}
      {stats && (
        <div className="rounded-xl border border-border bg-card p-6 space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Subscriber Growth (last 30 days)</h2>
          <div className="h-[200px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={subsChartData}>
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="count" fill="var(--chart-1, #3b82f6)" radius={2} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Tweet Thread Preview */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Tweet Thread Preview</h2>
        <div className="flex items-center gap-3 flex-wrap">
          <input
            type="date"
            value={tweetDate}
            onChange={e => setTweetDate(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={handleTweetPreview}
            disabled={tweetLoading}
          >
            {tweetLoading ? <Loader2 className="size-4 animate-spin mr-1" /> : null}
            Preview (dry run)
          </Button>
          <Button
            size="sm"
            onClick={handleTweetPost}
            disabled={tweetPosting}
          >
            {tweetPosting ? <Loader2 className="size-4 animate-spin mr-1" /> : <Send className="size-4 mr-1" />}
            Post Live
          </Button>
        </div>

        {tweetError && <p className="text-sm text-destructive">{tweetError}</p>}

        {tweetPreview && (
          <div className="space-y-3">
            {tweetPreview.hookImage && (
              <img
                src={tweetPreview.hookImage}
                alt="Hook image"
                className="rounded-lg max-h-48 object-cover"
              />
            )}
            {Array.isArray(tweetPreview.thread) && tweetPreview.thread.map((tweet: any, i: number) => (
              <div key={i} className="rounded-lg border border-border bg-muted/30 p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">{tweet.label || `Tweet ${i + 1}`}</span>
                  <span className={`text-xs font-mono ${tweet.chars > 280 ? 'text-destructive font-bold' : 'text-muted-foreground'}`}>
                    {tweet.chars}/280
                  </span>
                </div>
                <p className="text-sm text-foreground whitespace-pre-wrap">{tweet.text}</p>
              </div>
            ))}
          </div>
        )}

        {tweetPostResult && (
          <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Post result</p>
            {Array.isArray(tweetPostResult.results) ? (
              tweetPostResult.results.map((r: any, i: number) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${r.success ? 'bg-green-500/10 text-green-600' : 'bg-destructive/10 text-destructive'}`}>
                    {r.success ? 'ok' : 'fail'}
                  </span>
                  <span className="text-muted-foreground">{r.label || `Tweet ${i + 1}`}</span>
                  {r.error && <span className="text-destructive text-xs">{r.error}</span>}
                </div>
              ))
            ) : (
              <pre className="text-xs text-muted-foreground overflow-x-auto">{JSON.stringify(tweetPostResult, null, 2)}</pre>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
