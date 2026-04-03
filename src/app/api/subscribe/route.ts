import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { randomUUID } from 'crypto'

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const { email, sectors, frequency } = body

  if (!email) {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 })
  }

  const supabase = await createAdminClient()

  // Check for existing active subscriber
  const { data: existing } = await supabase
    .from('newsletter_subscribers')
    .select('email, active')
    .eq('email', email)
    .single()

  if (existing && existing.active) {
    return NextResponse.json(
      { error: 'Email already subscribed' },
      { status: 409 },
    )
  }

  const unsubscribe_token = randomUUID()

  const { error } = await supabase.from('newsletter_subscribers').insert({
    email,
    sectors: sectors ?? [],
    frequency: frequency ?? 'weekly',
    active: true,
    unsubscribe_token,
  })

  if (error) {
    console.error('subscribe insert error:', error)
    return NextResponse.json(
      { error: 'Failed to subscribe' },
      { status: 500 },
    )
  }

  return NextResponse.json({ success: true, unsubscribe_token })
}
