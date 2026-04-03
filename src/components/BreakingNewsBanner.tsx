'use client';
import { useState } from 'react';
import { useBreakingNews } from '@/hooks/useBreakingNews';
import { X, Zap } from 'lucide-react';
import Link from 'next/link';

export function BreakingNewsBanner() {
  const { data: item } = useBreakingNews();
  const [dismissed, setDismissed] = useState<string | null>(null);

  if (!item || dismissed === item.id) return null;

  const isExternal = !item.blog_post_id && item.url;

  const content = (
    <div className="flex items-center gap-2 min-w-0">
      <Zap className="h-3.5 w-3.5 shrink-0 animate-pulse" />
      <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider shrink-0">Breaking</span>
      <span className="hidden sm:inline text-xs">—</span>
      <span className="text-xs sm:text-sm font-medium truncate">{item.headline}</span>
    </div>
  );

  return (
    <div className="bg-destructive text-destructive-foreground relative">
      <div className="mx-auto max-w-5xl px-3 sm:px-6 py-2 flex items-center justify-between gap-2">
        {isExternal ? (
          <a href={item.url!} target="_blank" rel="noopener noreferrer" className="min-w-0 hover:opacity-80 transition-opacity">
            {content}
          </a>
        ) : item.blog_post_id ? (
          <Link href={`/blog/${item.blog_post_id}`} className="min-w-0 hover:opacity-80 transition-opacity">
            {content}
          </Link>
        ) : (
          <div className="min-w-0">{content}</div>
        )}
        <button onClick={() => setDismissed(item.id)} className="p-0.5 rounded hover:bg-destructive-foreground/10 transition-colors shrink-0" aria-label="Dismiss">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
