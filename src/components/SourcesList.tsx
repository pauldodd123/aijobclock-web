'use client';
import { createClient } from '@/lib/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Newspaper } from 'lucide-react';

export function SourcesList() {
  const { data: sources } = useQuery({
    queryKey: ['news-sources'],
    queryFn: async () => {
      const supabase = createClient();
      const { data } = await supabase.from('news_articles').select('source_name').not('source_name', 'is', null);
      const counts = new Map<string, number>();
      data?.forEach((r: any) => {
        const name = r.source_name as string;
        counts.set(name, (counts.get(name) ?? 0) + 1);
      });
      return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
    },
    staleTime: 1000 * 60 * 10,
  });

  return (
    <Dialog>
      <DialogTrigger
        render={
          <button className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors" />
        }
      >
        <Newspaper className="h-3.5 w-3.5" />
        Sources
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle style={{ fontFamily: 'var(--font-serif)' }}>News Sources</DialogTitle>
          <DialogDescription>Publishers aggregated by our scraper.</DialogDescription>
        </DialogHeader>
        <div className="max-h-64 overflow-y-auto space-y-1.5">
          {sources?.length ? (
            sources.map((s) => (
              <div key={s.name} className="flex items-center justify-between text-sm py-1.5 border-b border-border/50 last:border-0">
                <span className="text-foreground/80">{s.name}</span>
                <span className="text-[10px] text-muted-foreground tabular-nums">{s.count} articles</span>
              </div>
            ))
          ) : (
            <p className="text-xs text-muted-foreground text-center py-4">No sources yet.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
