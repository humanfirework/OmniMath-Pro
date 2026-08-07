'use client';

/**
 * OmniMath Pro — 分组直方图（多序列并排比较分布）
 *
 * 把多个数据集在「共享分箱轴」上并排绘制条形，逐区间比较各分布，
 * 对齐 MATLAB `histogram` 的分组叠加能力。内建缩放 / 平移 / 悬停 tooltip。
 */

import { useMemo } from 'react';
import type { ResultView } from '@/components/workbench/runresults/runResultRender';
import { StatsChart } from './StatsChart';
import { renderGroupedHistogram } from '@/lib/probability/statsCanvas';
import { groupedHistogramBins, type GroupedHistogram, type GroupedSeries } from '@/lib/probability/stats';

export interface GroupedHistogramChartProps {
  series: GroupedSeries[];
  /** 是否以概率密度显示（跨不同样本量比较时建议开启）。 */
  density?: boolean;
  className?: string;
  minHeight?: number;
}

export function GroupedHistogramChart({
  series,
  density = true,
  className,
  minHeight = 220,
}: GroupedHistogramChartProps) {
  const compute = useMemo(() => () => groupedHistogramBins(series), [series]);

  const autoView = useMemo(
    () => (d: GroupedHistogram) => {
      if (d.edges.length === 0) return null;
      const lo = d.edges[0].start;
      const hi = d.edges[d.edges.length - 1].end;
      let maxY = 0;
      for (const s of d.series) {
        for (const b of s.bins) maxY = Math.max(maxY, density ? b.density : b.count);
      }
      const yMax = maxY > 0 ? maxY * 1.15 : 1;
      const view: ResultView = { xMin: lo, xMax: hi, yMin: 0, yMax };
      return view;
    },
    [density],
  );

  const draw = useMemo(
    () => (ctx: CanvasRenderingContext2D, view: ResultView, size: { w: number; h: number }, d: GroupedHistogram) => {
      renderGroupedHistogram(ctx, view, size, d, { density });
    },
    [density],
  );

  return (
    <StatsChart
      compute={compute}
      draw={draw}
      autoView={autoView}
      tooltip={(w) => `x=${w.x.toFixed(3)}  y=${w.y.toFixed(3)}`}
      className={className}
      minHeight={minHeight}
    />
  );
}