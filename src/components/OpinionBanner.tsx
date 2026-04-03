'use client';
import { useState } from 'react';
import { useOpinionPiece } from '@/hooks/useOpinionPiece';
import { X, Lightbulb } from 'lucide-react';
import Link from 'next/link';

export function OpinionBanner() {
  const { data: item } = useOpinionPiece();
  const [dismissed, setDismissed] = useState<string | null>(null);

  if (!item || dismissed === item.id) return null;

  return (
    <div className="bg-primary text-primary-foreground relative">
      <div className="mx-auto max-w-5xl px-3 sm:px-6 py-2 flex items-center justify-between gap-2">
        {item.blog_post_id ? (
          <Link href={`/blog/${item.blog_slug || item.blog_post_id}`} className="min-w-0 hover:opacity-80 transition-opacity">
            <div className="flex items-center gap-2 min-w-0">
              <Lightbulb className="h-3.5 w-3.5 shrink-0" />
              <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider shrink-0">Opinion</span>
              <span className="hidden sm:inline text-xs">—</span>
              <span className="text-xs sm:text-sm font-medium truncate">{item.headline}</span>
            </div>
          </Link>
        ) : (
          <div className="min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <Lightbulb className="h-3.5 w-3.5 shrink-0" />
              <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider shrink-0">Opinion</span>
              <span className="hidden sm:inline text-xs">—</span>
              <span className="text-xs sm:text-sm font-medium truncate">{item.headline}</span>
            </div>
          </div>
        )}
        <button onClick={() => setDismissed(item.id)} className="p-0.5 rounded hover:bg-primary-foreground/10 transition-colors shrink-0" aria-label="Dismiss">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
