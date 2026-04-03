'use client';
import { useSectorStats } from '@/hooks/useSectorStats';
import { TrendingUp, TrendingDown, Minus, Monitor, Landmark, HeartPulse, Factory, ShoppingCart, Tv, Scale, GraduationCap, Truck } from 'lucide-react';
import { type LucideIcon } from 'lucide-react';

const BASE_EMPLOYED = 4_000_000_000;

const SECTOR_ICONS: Record<string, LucideIcon> = {
  Tech: Monitor, Finance: Landmark, Healthcare: HeartPulse,
  Manufacturing: Factory, Retail: ShoppingCart, Media: Tv,
  Legal: Scale, Education: GraduationCap, Transportation: Truck,
};

export function SectorBreakdown() {
  const { data: sectors, isLoading } = useSectorStats();
  const totalAtRisk = sectors?.reduce((sum, s) => sum + Number(s.estimated_jobs_at_risk), 0) ?? 0;
  const percentAtRisk = ((totalAtRisk / BASE_EMPLOYED) * 100).toFixed(1);
  const maxRisk = sectors ? Math.max(...sectors.map(s => Number(s.estimated_jobs_at_risk))) : 1;

  return (
    <section className="mx-auto max-w-5xl px-4 sm:px-6 py-10 md:py-24 border-t border-border">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2 mb-8 md:mb-10">
        <div>
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tight mb-2" style={{ fontFamily: 'var(--font-serif)' }}>Sector Breakdown</h2>
          <p className="text-xs sm:text-sm text-muted-foreground">Estimated jobs at risk from AI displacement by industry</p>
        </div>
        {!isLoading && sectors && (
          <div className="text-right">
            <p className="text-2xl sm:text-3xl font-black text-foreground tabular-nums" style={{ fontFamily: 'var(--font-serif)' }}>{totalAtRisk.toLocaleString()}</p>
            <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">total at risk · {percentAtRisk}% of {(BASE_EMPLOYED / 1e9).toFixed(0)}bn workforce</p>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-28 sm:h-32 rounded-lg bg-muted animate-pulse" />)}
        </div>
      ) : (
        <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
          {sectors?.map(sector => {
            const risk = Number(sector.estimated_jobs_at_risk);
            const pct = ((risk / BASE_EMPLOYED) * 100).toFixed(1);
            const barWidth = (risk / maxRisk) * 100;
            const Icon = SECTOR_ICONS[sector.sector_name] || Monitor;
            return (
              <div key={sector.id} className="rounded-lg border border-border bg-card p-3 sm:p-5 transition-all hover:border-foreground/20 hover:shadow-sm">
                <div className="flex items-center justify-between mb-2 sm:mb-3">
                  <Icon className="h-5 w-5 text-muted-foreground" />
                  <TrendIcon direction={sector.trend_direction} />
                </div>
                <h3 className="text-xs sm:text-sm font-semibold mb-0.5 sm:mb-1">{sector.sector_name}</h3>
                <p className="text-base sm:text-xl font-black text-foreground tabular-nums" style={{ fontFamily: 'var(--font-serif)' }}>
                  {risk >= 1e9 ? `${(risk / 1e9).toFixed(2)}B` : risk >= 1e6 ? `${(risk / 1e6).toFixed(0)}M` : risk.toLocaleString()}
                </p>
                <p className="text-[9px] sm:text-[10px] text-muted-foreground/60 mt-0.5 sm:mt-1">{pct}% of global workforce</p>
                <div className="mt-2 sm:mt-3 h-1 w-full rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${barWidth}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function TrendIcon({ direction }: { direction: string }) {
  if (direction === 'up') return <TrendingUp className="h-4 w-4 text-accent" />;
  if (direction === 'down') return <TrendingDown className="h-4 w-4 text-muted-foreground" />;
  return <Minus className="h-4 w-4 text-muted-foreground" />;
}
