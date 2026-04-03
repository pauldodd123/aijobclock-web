'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useBlogPosts } from '@/hooks/useBlogPosts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, BookOpen } from 'lucide-react';
import { format, parseISO } from 'date-fns';

const SECTORS = [
  'All',
  'Tech',
  'Finance',
  'Healthcare',
  'Manufacturing',
  'Retail',
  'Media',
  'Legal',
  'Education',
  'Transportation',
];

export default function BlogPage() {
  const [activeSector, setActiveSector] = useState('All');
  const { data: posts, isLoading } = useBlogPosts(activeSector);

  const grouped = (posts ?? []).reduce<Record<string, typeof posts>>((acc, post) => {
    const date = post.published_date;
    if (!acc[date]) acc[date] = [];
    acc[date]!.push(post);
    return acc;
  }, {});

  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto max-w-5xl px-6 py-4 flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="text-sm">Back</span>
          </Link>
          <h2
            className="text-lg font-black tracking-tight"
            style={{ fontFamily: 'var(--font-serif)' }}
          >
            Daily Briefings
          </h2>
          <div className="w-16" />
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-6 py-8">
        <div className="text-center mb-8">
          <h1
            className="text-3xl md:text-4xl font-black tracking-tight mb-2"
            style={{ fontFamily: 'var(--font-serif)' }}
          >
            AI &amp; Jobs Daily Briefings
          </h1>
          <p className="text-muted-foreground">
            AI-generated summaries of the latest news, one per sector per day.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 justify-center mb-8">
          {SECTORS.map((s) => (
            <Button
              key={s}
              variant={activeSector === s ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveSector(s)}
              className="text-xs"
            >
              {s}
            </Button>
          ))}
        </div>

        {isLoading ? (
          <div className="space-y-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-6 w-40" />
                <Skeleton className="h-32 w-full rounded-lg" />
              </div>
            ))}
          </div>
        ) : sortedDates.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <BookOpen className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p>No briefings yet. Check back soon!</p>
          </div>
        ) : (
          <div className="space-y-10">
            {sortedDates.map((date) => (
              <div key={date}>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4 border-b border-border pb-2">
                  {format(parseISO(date), 'EEEE, MMMM d, yyyy')}
                </h3>
                <div className="grid gap-4 md:grid-cols-2">
                  {grouped[date]!.map((post) => (
                    <Link
                      key={post.id}
                      href={`/blog/${post.slug}`}
                      className="group block rounded-lg border border-border bg-card p-5 hover:border-foreground/20 transition-colors"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="secondary" className="text-[10px]">
                          {post.sector}
                        </Badge>
                      </div>
                      <h4
                        className="font-bold text-lg leading-tight mb-2 group-hover:text-accent transition-colors"
                        style={{ fontFamily: 'var(--font-serif)' }}
                      >
                        {post.title}
                      </h4>
                      {post.summary && (
                        <p className="text-sm text-muted-foreground line-clamp-2">{post.summary}</p>
                      )}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
