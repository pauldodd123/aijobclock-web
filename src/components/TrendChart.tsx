'use client';
import { memo, useMemo, useCallback } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ReferenceDot, ResponsiveContainer,
} from 'recharts';

interface TrendChartProps {
  currentEmployed: number;
  daysToFloor: number;
  floorEmployed: number;
}

export const TrendChart = memo(function TrendChart({ currentEmployed, daysToFloor, floorEmployed }: TrendChartProps) {
  const points = 50;
  const currentYear = new Date().getFullYear();

  const data = useMemo(() => Array.from({ length: points }, (_, i) => {
    const progress = i / (points - 1);
    const year = currentYear + Math.round(10 * progress);
    const employed = floorEmployed + (currentEmployed - floorEmployed) * Math.pow(1 - progress, 1.5);
    return {
      year: year.toString(),
      employed: Math.max(floorEmployed, Math.round(employed)),
      employedBillions: Math.max(floorEmployed / 1e9, employed / 1e9),
    };
  }), [currentEmployed, daysToFloor, floorEmployed, currentYear]);

  const currentPoint = data[0];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const formatTooltip = useCallback((value: any): [string, string] => {
    const num = typeof value === 'number' ? value : 0;
    return [`${num.toFixed(2)}B`, 'Employed'];
  }, []);
  const formatYAxis = useCallback((value: number) => `${value.toFixed(1)}B`, []);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
        <defs>
          <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(0, 72%, 51%)" stopOpacity={0.2} />
            <stop offset="100%" stopColor="hsl(0, 72%, 51%)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="year" tick={{ fontSize: 10, fill: 'hsl(220, 10%, 46%)' }} axisLine={false} tickLine={false} interval={Math.floor(points / 5)} />
        <YAxis dataKey="employedBillions" tick={{ fontSize: 10, fill: 'hsl(220, 10%, 46%)' }} axisLine={false} tickLine={false} tickFormatter={formatYAxis} width={40} />
        <Tooltip
          formatter={formatTooltip}
          labelFormatter={(label) => `Year ${label}`}
          contentStyle={{ fontSize: 11, background: 'hsl(220, 20%, 10%)', color: 'hsl(0, 0%, 95%)', border: 'none', borderRadius: 6, padding: '6px 10px' }}
          itemStyle={{ color: 'hsl(0, 0%, 95%)' }}
        />
        <Area type="monotone" dataKey="employedBillions" stroke="hsl(0, 72%, 51%)" strokeWidth={2} fill="url(#chartGradient)" dot={false} animationDuration={2000} />
        {currentPoint && (
          <ReferenceDot x={currentPoint.year} y={currentPoint.employedBillions} r={4} fill="hsl(0, 72%, 51%)" stroke="hsl(0, 0%, 100%)" strokeWidth={2} />
        )}
      </AreaChart>
    </ResponsiveContainer>
  );
});
