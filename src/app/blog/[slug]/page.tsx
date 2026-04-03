import { createClient } from '@/lib/supabase/server';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Badge } from '@/components/ui/badge';

type Props = {
  params: Promise<{ slug: string }>;
};

async function getBlogPost(slug: string) {
  const supabase = await createClient();
  const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const query = (supabase as any).from('blog_posts').select('*');
  const { data, error } = await (UUID_RE.test(slug)
    ? query.eq('id', slug).single()
    : query.eq('slug', slug).single());
  if (error || !data) return null;
  return data;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = await getBlogPost(slug);
  if (!post) return { title: 'Post Not Found' };

  const url = `https://aijobclock.com/blog/${post.slug}`;
  const description = post.summary || post.title;

  return {
    title: post.title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: post.title,
      description,
      url,
      type: 'article',
      images: [{ url: 'https://aijobclock.com/og-image.png' }],
      publishedTime: new Date(post.published_date).toISOString(),
      section: post.sector,
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description,
    },
  };
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const post = await getBlogPost(slug);
  if (!post) notFound();

  const url = `https://aijobclock.com/blog/${post.slug}`;
  const description = post.summary || post.title;
  const dateISO = new Date(post.published_date).toISOString();

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description,
    datePublished: dateISO,
    url,
    publisher: {
      '@type': 'Organization',
      name: 'AI Job Clock',
      url: 'https://aijobclock.com',
    },
    articleSection: post.sector,
    image: 'https://aijobclock.com/og-image.png',
  };

  return (
    <div className="min-h-screen bg-background">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <header className="border-b border-border">
        <div className="mx-auto max-w-3xl px-6 py-4">
          <Link
            href="/blog"
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="text-sm">All Briefings</span>
          </Link>
        </div>
      </header>

      <article className="mx-auto max-w-3xl px-6 py-10">
        <div className="flex items-center gap-3 mb-4">
          <Badge variant="secondary">{post.sector}</Badge>
          <span className="text-sm text-muted-foreground">
            {format(parseISO(post.published_date), 'MMMM d, yyyy')}
          </span>
        </div>
        <h1
          className="text-3xl md:text-4xl font-black tracking-tight mb-4 leading-tight"
          style={{ fontFamily: 'var(--font-serif)' }}
        >
          {post.title}
        </h1>
        {post.summary && (
          <p className="text-lg text-muted-foreground mb-8 border-l-2 border-accent pl-4">
            {post.summary}
          </p>
        )}
        <div className="prose prose-neutral dark:prose-invert max-w-none prose-headings:font-bold prose-headings:tracking-tight prose-headings:mt-8 prose-headings:mb-4 prose-a:text-accent prose-a:no-underline hover:prose-a:underline prose-p:leading-relaxed prose-p:mb-4 prose-li:leading-relaxed prose-blockquote:border-accent [&>*]:mb-4">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{post.content}</ReactMarkdown>
        </div>
      </article>
    </div>
  );
}
