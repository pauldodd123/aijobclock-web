'use client';
import { track } from '@/lib/track';
import { Share2, Link as LinkIcon } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toast } from 'sonner';

const SHARE_TEXT = "A live tracker monitoring AI-driven job displacement — data, not drama.";
const SHARE_TITLE = "AI Job Clock";
const HASHTAGS = "AI,FutureOfWork";

function getUtmUrl(platform: string) {
  if (typeof window === 'undefined') return '';
  const base = window.location.href.split('?')[0];
  return `${base}?utm_source=${platform}&utm_medium=social&utm_campaign=share`;
}

const platforms = [
  {
    name: 'X',
    icon: () => (
      <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
    url: () => `https://x.com/intent/tweet?text=${encodeURIComponent(SHARE_TEXT)}&url=${encodeURIComponent(getUtmUrl('x'))}&hashtags=${HASHTAGS}`,
  },
  {
    name: 'LinkedIn',
    icon: () => (
      <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current">
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
      </svg>
    ),
    url: () => `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(getUtmUrl('linkedin'))}`,
  },
  {
    name: 'Reddit',
    icon: () => (
      <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current">
        <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z" />
      </svg>
    ),
    url: () => `https://www.reddit.com/submit?url=${encodeURIComponent(getUtmUrl('reddit'))}&title=${encodeURIComponent(SHARE_TITLE)}`,
  },
];

export function ShareBar() {
  const handleShare = (platform: string, url: string) => {
    track('share_click', { platform });
    window.open(url, '_blank', 'noopener,noreferrer,width=600,height=500');
    toast('Shared — thank you');
  };

  const handleCopy = async () => {
    track('copy_link', {});
    await navigator.clipboard.writeText(getUtmUrl('copy'));
    toast('Link copied');
  };

  return (
    <Popover>
      <PopoverTrigger
        className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground h-7 px-2.5 rounded-lg text-sm transition-colors"
      >
        <Share2 className="h-3.5 w-3.5" />
        <span className="text-xs">Share</span>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-2" align="end">
        {platforms.map((p) => (
          <button
            key={p.name}
            onClick={() => handleShare(p.name.toLowerCase(), p.url())}
            className="flex items-center gap-2.5 w-full px-2.5 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
          >
            <p.icon />
            {p.name}
          </button>
        ))}
        <div className="h-px bg-border my-1" />
        <button
          onClick={handleCopy}
          className="flex items-center gap-2.5 w-full px-2.5 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
        >
          <LinkIcon className="h-4 w-4" />
          Copy link
        </button>
      </PopoverContent>
    </Popover>
  );
}
