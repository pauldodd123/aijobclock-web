'use client';
import { useEffect, useState, useMemo, useRef } from 'react';
import { useGlobalStats } from '@/hooks/useGlobalStats';
import { useSectorStats } from '@/hooks/useSectorStats';
import { useNewsArticles } from '@/hooks/useNewsArticles';
import { TrendChart } from './TrendChart';
import { EmbedModal } from './EmbedModal';
import { HowThisWorks } from './HowThisWorks';
import { format, parseISO } from 'date-fns';

const EPOCH = new Date('2026-01-01T00:00:00Z').getTime();
const BASE_EMPLOYED = 4_000_000_000;
const FLOOR_EMPLOYED = 2_000_000_000;
const TEN_YEARS_SECONDS = 10 * 365.25 * 86400;
const CALIBRATED_RATE = (BASE_EMPLOYED - FLOOR_EMPLOYED) / TEN_YEARS_SECONDS;

export function HeroClock() {
  const { data: stats } = useGlobalStats();
  const { data: sectors } = useSectorStats();
  const { data: newsData } = useNewsArticles('All', 0);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const perSecondRate = CALIBRATED_RATE;
  const dailyRate = perSecondRate * 86400;

  const currentEmployed = useMemo(() => {
    const secondsElapsed = (Date.now() - EPOCH) / 1000;
    return Math.max(FLOOR_EMPLOYED, Math.round(BASE_EMPLOYED - secondsElapsed * perSecondRate));
  }, [perSecondRate, tick]);

  const daysToFloor = useMemo(() => {
    const remaining = currentEmployed - FLOOR_EMPLOYED;
    return dailyRate > 0 ? remaining / dailyRate : Infinity;
  }, [currentEmployed, dailyRate]);

  const chartEmployed = useRef(currentEmployed);
  const chartDaysToFloor = useRef(daysToFloor);
  useEffect(() => {
    const id = setInterval(() => {
      chartEmployed.current = currentEmployed;
      chartDaysToFloor.current = daysToFloor;
    }, 60000);
    return () => clearInterval(id);
  }, [currentEmployed, daysToFloor]);
  if (chartEmployed.current === 0) {
    chartEmployed.current = currentEmployed;
    chartDaysToFloor.current = daysToFloor;
  }

  const formattedNumber = currentEmployed.toLocaleString('en-US');
  const formattedDailyRate = dailyRate >= 1e6 ? `${(dailyRate / 1e6).toFixed(1)}M` : `${(dailyRate / 1e3).toFixed(0)}K`;
  const totalDisplaced = BASE_EMPLOYED - currentEmployed;
  const formattedDisplaced = totalDisplaced >= 1e9 ? `${(totalDisplaced / 1e9).toFixed(2)}B` : totalDisplaced >= 1e6 ? `${(totalDisplaced / 1e6).toFixed(0)}M` : totalDisplaced.toLocaleString();
  const sectorsTracked = sectors?.length ?? 9;
  const articlesAnalyzed = newsData?.totalCount ?? 0;
  const lastUpdated = stats?.last_updated ? format(parseISO(stats.last_updated), 'MMM d, yyyy · HH:mm') : null;

  return (
    <section className="relative overflow-hidden border-b border-border">
      <div className="mx-auto max-w-5xl px-6 py-16 md:py-24 text-center">
        <p className="text-xs font-medium uppercase tracking-[0.3em] text-muted-foreground mb-6">
          Global Employment Observatory
        </p>
        <div className="text-5xl sm:text-7xl md:text-8xl lg:text-9xl font-black leading-none tracking-tight mb-3" style={{ fontFamily: 'var(--font-serif)' }}>
          <span className="text-foreground">{formattedNumber}</span>
        </div>
        <p className="text-sm text-muted-foreground mb-2">Estimated global employment · ILO baseline</p>
        {lastUpdated && <p className="text-[10px] text-muted-foreground/50 mb-10">Last updated {lastUpdated} UTC</p>}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 mb-12 max-w-2xl mx-auto">
          <MetricCard label="Daily Rate" value={`~${formattedDailyRate}`} sublabel="jobs/day" />
          <MetricCard label="Total Displaced" value={formattedDisplaced} sublabel="estimated" />
          <MetricCard label="Sectors Tracked" value={sectorsTracked.toString()} />
          <MetricCard label="Articles Analyzed" value={articlesAnalyzed.toLocaleString()} />
        </div>
        <div className="flex items-center justify-center gap-4 mb-8">
          <HowThisWorks />
          <span className="text-muted-foreground/20">·</span>
          <EmbedModal />
        </div>
        <div className="h-48 md:h-64 w-full">
          <TrendChart currentEmployed={chartEmployed.current} daysToFloor={chartDaysToFloor.current} floorEmployed={FLOOR_EMPLOYED} />
        </div>
      </div>
    </section>
  );
}

function MetricCard({ label, value, sublabel }: { label: string; value: string; sublabel?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3 md:p-4 text-center">
      <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground mb-1">{label}</p>
      <p className="text-lg md:text-2xl font-black tabular-nums text-foreground" style={{ fontFamily: 'var(--font-serif)' }}>{value}</p>
      {sublabel && <p className="text-[9px] text-muted-foreground/50 mt-0.5">{sublabel}</p>}
    </div>
  );
}
