'use client';

/**
 * OmniMath Pro — 交互式小提琴图（canvas）
 *
 * 对齐 MATLAB/R 的 violinplot：KDE 密度沿竖直数值轴左右镜像，
 * 叠加中位数（强调线）与四分位（淡线）。可缩放 / 平移 / 悬停 tooltip。
 */

import { useMemo } from 'react';
import type { ResultView } from '@/components/workbench/runresults/runResultRender';
import { StatsChart } from './StatsChart';
import { renderViolin } from '@/lib/probability/statsCanvas';
import { boxplotStats, kde, type BoxStats, type XYPoint } from '@/lib/probability/stats';

export interface ViolinChartProps {
  data: number[];
  className?: string;
  minHeight?: number;
}

interface ViolinData {
  kde: XYPoint[];
  stats: BoxStats;
}

export function ViolinChart({ data, className, minHeight = 220 }: ViolinChartProps) {
  const compute = useMemo(
    () => () => ({ kde: kde(data, { samples: 160 }), stats: boxplotStats(data) }) satisfies ViolinData,
    [data],
  );

  const autoView = useMemo(
    () => (d: ViolinData) => {
      if (d.kde.length === 0) return null;
      let lo = Infinity;
      let hi = -Infinity;
      for (const p of d.kde) {
        if (p.x < lo) lo = p.x;
        if (p.x > hi) hi = p.x;
      }
      const pad = (hi - lo) * 0.08 || 1;
      return { xMin: lo - pad, xMax: hi + pad, yMin: -1, yMax: 1 } as ResultView;
    },
    [],
  );

  const draw = useMemo(
    () => (ctx: CanvasRenderingContext2D, view: ResultView, size: { w: number; h: number }, d: ViolinData) => {
      renderViolin(ctx, view, size, d.kde, d.stats);
    },
    [],
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