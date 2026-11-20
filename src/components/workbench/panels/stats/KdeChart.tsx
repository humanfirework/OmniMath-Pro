'use client';

/**
 * OmniMath Pro — 交互式 KDE（核密度估计）曲线（canvas）
 *
 * 对齐 MATLAB `ksdensity`：填充面积 + 密度曲线，可缩放 / 平移 / tooltip。
 */

import { useMemo } from 'react';
import type { ResultView } from '@/components/workbench/runresults/runResultRender';
import { StatsChart } from './StatsChart';
import { renderArea } from '@/lib/probability/statsCanvas';
import { kde, type XYPoint } from '@/lib/probability/stats';

export interface KdeChartProps {
  data: number[];
  bandwidth?: number;
  className?: string;
  minHeight?: number;
}

export function KdeChart({ data, bandwidth, className, minHeight = 220 }: KdeChartProps) {
  const compute = useMemo(() => () => kde(data, bandwidth ? { bandwidth } : undefined), [data, bandwidth]);

  const autoView = useMemo(
    () => (pts: XYPoint[]) => {
      if (pts.length === 0) return null;
      let min = Infinity;
      let max = -Infinity;
      let maxY = 0;
      for (const p of pts) {
        if (p.x < min) min = p.x;
        if (p.x > max) max = p.x;
        if (p.y > maxY) maxY = p.y;
      }
      if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
      const view: ResultView = { xMin: min, xMax: max, yMin: 0, yMax: maxY * 1.1 || 1 };
      return view;
    },
    [],
  );

  const draw = useMemo(
    () => (ctx: CanvasRenderingContext2D, view: ResultView, size: { w: number; h: number }, pts: XYPoint[]) => {
      renderArea(ctx, view, size, pts, '#38bdf8');
    },
    [],
  );

  return (
    <StatsChart
      compute={compute}
      draw={draw}
      autoView={autoView}
      tooltip={(w) => `x=${w.x.toFixed(3)}  f(x)=${w.y.toFixed(3)}`}
      className={className}
      minHeight={minHeight}
    />
  );
}