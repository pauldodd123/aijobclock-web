'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useNewsArticles, PAGE_SIZE } from '@/hooks/useNewsArticles';
import { useBlogPosts } from '@/hooks/useBlogPosts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ExternalLink, Clock, ChevronDown, BookOpen, ArrowRight } from 'lucide-react';
import { SourcesList } from '@/components/SourcesList';
import { formatDistanceToNow, format, parseISO } from 'date-fns';

const SECTORS = ['All', 'Tech', 'Finance', 'Healthcare', 'Manufacturing', 'Retail', 'Media', 'Legal', 'Education', 'Transportation'];

export function NewsFeed() {
  const [activeSector, setActiveSector] = useState('Tech');
  const [page, setPage] = useState(0);
  const { data, isLoading } = useNewsArticles(activeSector, page);
  const { data: blogPosts } = useBlogPosts(activeSector);
  const latestBrief = blogPosts?.[0];

  const articles = data?.articles ?? [];
  const totalCount = data?.totalCount ?? 0;
  const hasMore = articles.length < totalCount;

  useEffect(() => { setPage(0); }, [activeSector]);

  const latestArticles = articles.slice(0, PAGE_SIZE);
  const olderArticles = articles.slice(PAGE_SIZE);

  return (
    <section className="mx-auto max-w-5xl px-4 sm:px-6 py-10 md:py-24">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between mb-6 md:mb-8 gap-1">
        <div>
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tight" style={{ fontFamily: 'var(--font-serif)' }}>Latest News</h2>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">AI-driven job displacement stories</p>
        </div>
        <SourcesList />
      </div>

      <div className="flex gap-2 mb-6 md:mb-8 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap scrollbar-none">
        {SECTORS.map(s => (
          <button key={s} onClick={() => setActiveSector(s)}
            className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors whitespace-nowrap shrink-0 ${activeSector === s ? 'bg-foreground text-background border-foreground' : 'bg-transparent text-muted-foreground border-border hover:border-foreground/30'}`}>
            {s}
          </button>
        ))}
      </div>

      {isLoading && page === 0 ? (
        <div className="grid gap-3 sm:gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-36 sm:h-40 rounded-lg bg-muted animate-pulse" />)}
        </div>
      ) : !articles.length ? (
        <div className="text-center py-16 md:py-20 text-muted-foreground">
          <p className="text-base md:text-lg mb-2">No articles yet</p>
          <p className="text-xs sm:text-sm">News will appear after the first scrape runs.</p>
        </div>
      ) : (
        <>
          {latestBrief && (
            <Link href={`/blog/${latestBrief.slug}`} className="group block mb-6 rounded-lg border border-border bg-muted/50 p-4 sm:p-5 transition-all hover:border-foreground/20 hover:shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <BookOpen className="h-3.5 w-3.5 text-foreground" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-foreground">Daily Briefing — {format(parseISO(latestBrief.published_date), 'MMM d')}</span>
                <Badge variant="secondary" className="text-[10px] ml-auto">{latestBrief.sector}</Badge>
              </div>
              <h3 className="text-sm sm:text-base font-bold leading-snug mb-1 group-hover:text-accent transition-colors" style={{ fontFamily: 'var(--font-serif)' }}>{latestBrief.title}</h3>
              {latestBrief.summary && <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{latestBrief.summary}</p>}
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-foreground">Read full briefing <ArrowRight className="h-3 w-3" /></span>
            </Link>
          )}

          <div className="grid gap-3 sm:gap-4 sm:grid-cols-2">
            {latestArticles.map(article => <ArticleCard key={article.id} article={article} />)}
          </div>

          {olderArticles.length > 0 && (
            <>
              <div className="flex items-center gap-3 my-8">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wider">Earlier</span>
                <div className="h-px flex-1 bg-border" />
              </div>
              <div className="grid gap-2 sm:gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {olderArticles.map(article => <ArticleCardCompact key={article.id} article={article} />)}
              </div>
            </>
          )}

          {totalCount > 0 && (
            <div className="flex flex-col items-center gap-3 mt-8">
              <p className="text-xs text-muted-foreground/50">Showing {articles.length} of {totalCount} articles</p>
              {hasMore && (
                <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={isLoading} className="rounded-full px-6 text-xs">
                  {isLoading ? 'Loading…' : <><span>Load More</span> <ChevronDown className="h-3 w-3 ml-1" /></>}
                </Button>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

type Article = { id: string; title: string; url: string; summary: string | null; sector: string; source_name: string | null; scraped_at: string; };

function ArticleCard({ article }: { article: Article }) {
  return (
    <a href={article.url} target="_blank" rel="noopener noreferrer" className="group block rounded-lg border border-border bg-card p-4 sm:p-5 transition-all hover:border-foreground/20 hover:shadow-sm">
      <div className="flex items-start justify-between gap-2 sm:gap-3 mb-2 sm:mb-3">
        <h3 className="text-sm font-semibold leading-snug group-hover:text-accent transition-colors line-clamp-2">{article.title}</h3>
        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0 mt-0.5" />
      </div>
      {article.summary && <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2 sm:line-clamp-3 mb-2 sm:mb-3">{article.summary}</p>}
      <ArticleMeta article={article} />
    </a>
  );
}

function ArticleCardCompact({ article }: { article: Article }) {
  return (
    <a href={article.url} target="_blank" rel="noopener noreferrer" className="group block rounded-md border border-border/60 bg-card/50 p-3 transition-all hover:border-foreground/20 hover:bg-card">
      <h3 className="text-xs font-medium leading-snug group-hover:text-accent transition-colors line-clamp-2 mb-2">{article.title}</h3>
      <ArticleMeta article={article} />
    </a>
  );
}

function ArticleMeta({ article }: { article: Article }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 text-[10px] text-muted-foreground/60">
      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5">{article.sector}</Badge>
      {article.source_name && <span>{article.source_name}</span>}
      {article.scraped_at && <span className="flex items-center gap-1"><Clock className="h-2.5 w-2.5" />{formatDistanceToNow(new Date(article.scraped_at), { addSuffix: true })}</span>}
    </div>
  );
}
