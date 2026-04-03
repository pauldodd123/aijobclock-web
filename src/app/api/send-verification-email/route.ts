import { NextRequest, NextResponse } from 'next/server'

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://aijobclock.com'

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const { email, token } = body

  if (!email || !token) {
    return NextResponse.json(
      { error: 'email and token are required' },
      { status: 400 },
    )
  }

  const resendApiKey = process.env.RESEND_API_KEY
  if (!resendApiKey) {
    console.error('RESEND_API_KEY is not set')
    return NextResponse.json(
      { error: 'Email service not configured' },
      { status: 500 },
    )
  }

  const confirmUrl = `${SITE_URL}/api/subscribe/confirm?token=${token}`
  const unsubscribeUrl = `${SITE_URL}/api/unsubscribe?token=${token}`

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:sans-serif;color:#ffffff;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:560px;background:#1a1a1a;border-radius:8px;padding:40px;">
          <tr>
            <td>
              <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;">AI Job Clock</h1>
              <p style="margin:0 0 24px;color:#a0a0a0;font-size:14px;">Your weekly pulse on AI's impact on work</p>
              <h2 style="margin:0 0 16px;font-size:18px;font-weight:600;">Confirm your subscription</h2>
              <p style="margin:0 0 24px;color:#d0d0d0;line-height:1.6;">
                Thanks for signing up! Click the button below to confirm your email address and start receiving updates.
              </p>
              <a href="${confirmUrl}"
                style="display:inline-block;background:#ffffff;color:#0a0a0a;padding:12px 28px;border-radius:6px;font-weight:600;font-size:15px;text-decoration:none;">
                Confirm subscription
              </a>
              <p style="margin:32px 0 0;color:#666;font-size:12px;line-height:1.5;">
                If you didn't sign up for AI Job Clock, you can safely ignore this email.
                <br/>
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

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'AI Job Clock <hello@update.aijobclock.com>',
      to: email,
      subject: 'Confirm your AI Job Clock subscription',
      html,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    console.error('Resend error:', res.status, text)
    return NextResponse.json(
      { error: 'Failed to send email' },
      { status: 500 },
    )
  }

  const data = await res.json()
  return NextResponse.json({ success: true, id: data.id })
}
