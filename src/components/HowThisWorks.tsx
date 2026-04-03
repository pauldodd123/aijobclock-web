'use client';
import { Drawer, DrawerClose, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger, DrawerDescription } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Info } from 'lucide-react';

const BULLETS = [
  'We start from a baseline of ~4 billion employed people worldwide (ILO estimates).',
  'A daily displacement rate is calculated from aggregated news signals and labor reports.',
  'The clock counts down in real time at that rate—purely mechanical extrapolation.',
  'Sector breakdowns are weighted by article volume and known automation exposure.',
  'The model does not account for job creation, policy changes, or economic shifts.',
];

export function HowThisWorks() {
  return (
    <Drawer>
      <DrawerTrigger asChild>
        <button className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors">
          <Info className="h-3.5 w-3.5" />
          How this works
        </button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader className="text-left">
          <DrawerTitle style={{ fontFamily: 'var(--font-serif)' }}>How the model works</DrawerTitle>
          <DrawerDescription>Understanding the methodology behind the numbers.</DrawerDescription>
        </DrawerHeader>
        <div className="px-4 pb-6 space-y-3">
          <ol className="space-y-2.5">
            {BULLETS.map((b, i) => (
              <li key={i} className="flex gap-3 text-sm leading-relaxed">
                <span className="shrink-0 flex items-center justify-center h-5 w-5 rounded-full bg-muted text-[10px] font-bold text-muted-foreground">{i + 1}</span>
                <span className="text-foreground/80">{b}</span>
              </li>
            ))}
          </ol>
          <div className="rounded-lg bg-accent/5 border border-accent/20 p-3 mt-4">
            <p className="text-xs text-accent font-medium">⚠ Speculative projection, not a prediction. This is a thought experiment, not financial or employment advice.</p>
          </div>
          <DrawerClose asChild>
            <Button variant="outline" size="sm" className="w-full rounded-full mt-2 text-xs">Close</Button>
          </DrawerClose>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
