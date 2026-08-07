'use client';

/**
 * OmniMath Pro — 交互式箱线图（canvas）
 *
 * 对齐 MATLAB `boxplot`：Tukey 须 + 离群点，可缩放 / 平移 / 悬停 tooltip。
 */

import { useMemo } from 'react';
import type { ResultView } from '@/components/workbench/runresults/runResultRender';
import { StatsChart } from './StatsChart';
import { renderBoxPlot } from '@/lib/probability/statsCanvas';
import { boxplotStats, type BoxStats } from '@/lib/probability/stats';

export interface BoxplotChartProps {
  data: number[];
  /** 显示置信凹口（McGill notch）。 */
  notch?: boolean;
  className?: string;
  minHeight?: number;
}

export function BoxplotChart({ data, notch = false, className, minHeight = 220 }: BoxplotChartProps) {
  const compute = useMemo(() => () => boxplotStats(data), [data]);

  const autoView = useMemo(
    () => (b: BoxStats) => {
      if (!Number.isFinite(b.q1)) return null;
      let lo = Number.isFinite(b.whiskerLow) ? b.whiskerLow : b.min;
      let hi = Number.isFinite(b.whiskerHigh) ? b.whiskerHigh : b.max;
      for (const o of b.outliers) {
        lo = Math.min(lo, o);
        hi = Math.max(hi, o);
      }
      const pad = (hi - lo) * 0.1 || 1;
      const view: ResultView = { xMin: lo - pad, xMax: hi + pad, yMin: -1, yMax: 1 };
      return view;
    },
    [],
  );

  const draw = useMemo(
    () => (ctx: CanvasRenderingContext2D, view: ResultView, size: { w: number; h: number }, b: BoxStats) => {
      renderBoxPlot(ctx, view, size, b, { notch });
    },
    [notch],
  );

  return (
    <StatsChart
      compute={compute}
      draw={draw}
      autoView={autoView}
      tooltip={(w) => `x=${w.x.toFixed(3)}`}
      className={className}
      minHeight={minHeight}
    />
  );
}