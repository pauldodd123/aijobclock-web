'use client';
import { useState } from 'react';
import { track } from '@/lib/track';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Code2 } from 'lucide-react';

export function EmbedModal() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  const siteUrl = typeof window !== 'undefined' ? window.location.origin : 'https://aijobclock.com';
  const embedCode = `<iframe src="${siteUrl}?embed=true&theme=${theme}" width="100%" height="420" style="border:none;border-radius:8px;" title="AI Job Clock"></iframe>`;

  const handleCopy = async () => {
    track('embed_copy', { theme });
    await navigator.clipboard.writeText(embedCode);
    toast('Embed code copied');
  };

  return (
    <Dialog>
      <DialogTrigger
        render={
          <button className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors" />
        }
      >
        <Code2 className="h-3.5 w-3.5" />
        Embed
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle style={{ fontFamily: 'var(--font-serif)' }}>Embed this clock</DialogTitle>
          <DialogDescription>Copy the code below to embed AI Job Clock on your site.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex gap-2">
            {(['light', 'dark'] as const).map((t) => (
              <button key={t} onClick={() => setTheme(t)}
                className={`px-3 py-1 text-xs rounded-full border transition-colors ${theme === t ? 'bg-foreground text-background border-foreground' : 'bg-transparent text-muted-foreground border-border hover:border-foreground/30'}`}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
          <pre className="p-3 rounded-lg bg-muted text-xs leading-relaxed overflow-x-auto select-all whitespace-pre-wrap break-all">
            {embedCode}
          </pre>
          <Button onClick={handleCopy} size="sm" className="w-full rounded-full text-xs">
            Copy embed code
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
