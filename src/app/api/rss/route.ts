import { createClient } from '@/lib/supabase/server'

export const revalidate = 3600

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export async function GET() {
  const supabase = await createClient()

  const { data: posts } = await supabase
    .from('blog_posts')
    .select('id, title, slug, sector, summary, published_date')
    .order('published_date', { ascending: false })
    .limit(50)

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://aijobclock.com'
  const now = new Date().toUTCString()

  const items =
    posts
      ?.map((post) => {
        const url = `${siteUrl}/blog/${post.slug}`
        const pubDate = post.published_date
          ? new Date(post.published_date).toUTCString()
          : now
        const description = post.summary ? escapeXml(post.summary) : ''
        const category = post.sector ? escapeXml(post.sector) : ''

        return `    <item>
      <title>${escapeXml(post.title)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <pubDate>${pubDate}</pubDate>
      ${description ? `<description>${description}</description>` : ''}
      ${category ? `<category>${category}</category>` : ''}
    </item>`
      })
      .join('\n') ?? ''

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>AI Job Clock</title>
    <link>${siteUrl}</link>
    <description>Tracking how AI is reshaping the job market — in real time.</description>
    <language>en-us</language>
    <lastBuildDate>${now}</lastBuildDate>
    <atom:link href="${siteUrl}/api/rss" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>`

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  })
}
