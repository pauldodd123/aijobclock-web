import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const { visitor_id, path } = body

  const supabase = await createAdminClient()

  const { error } = await supabase.from('page_views').insert({
    visitor_id: visitor_id ?? null,
    path: path ?? '/',
  })

  if (error) {
    console.error('track-page-view insert error:', error)
    // Still return success — tracking is best-effort
  }

  return NextResponse.json({ success: true })
}
