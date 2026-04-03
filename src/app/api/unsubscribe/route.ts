import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

function buildPage(title: string, message: string, isError = false): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:sans-serif;color:#ffffff;min-height:100vh;display:flex;align-items:center;justify-content:center;">
  <div style="max-width:480px;width:90%;background:#1a1a1a;border-radius:8px;padding:40px;text-align:center;">
    <div style="font-size:40px;margin-bottom:16px;">${isError ? '⚠️' : '✓'}</div>
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;">${title}</h1>
    <p style="margin:0;color:#a0a0a0;font-size:15px;line-height:1.6;">${message}</p>
    <a href="https://aijobclock.com" style="display:inline-block;margin-top:28px;color:#888;font-size:13px;text-decoration:underline;">Return to AI Job Clock</a>
  </div>
</body>
</html>`
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const token = searchParams.get('token')

  if (!token) {
    const html = buildPage(
      'Invalid link',
      'This unsubscribe link is invalid or has already been used.',
      true,
    )
    return new NextResponse(html, {
      status: 400,
      headers: { 'Content-Type': 'text/html' },
    })
  }

  const supabase = await createAdminClient()

  const { data, error } = await supabase
    .from('newsletter_subscribers')
    .update({ active: false })
    .eq('unsubscribe_token', token)
    .eq('active', true)
    .select('email')
    .single()

  if (error || !data) {
    const html = buildPage(
      'Link not found',
      'This unsubscribe link is invalid or your subscription was already cancelled.',
      true,
    )
    return new NextResponse(html, {
      status: 404,
      headers: { 'Content-Type': 'text/html' },
    })
  }

  const html = buildPage(
    "You've been unsubscribed",
    "You've been successfully removed from the AI Job Clock mailing list. You won't receive any further emails from us.",
  )
  return new NextResponse(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html' },
  })
}
