'use client';

/**
 * OmniMath Pro — 交互式经验 CDF（canvas）
 *
 * 对齐 MATLAB `ecdf`：阶梯曲线，可缩放 / 平移 / 悬停 tooltip。
 */

import { useMemo } from 'react';
import type { ResultView } from '@/components/workbench/runresults/runResultRender';
import { StatsChart } from './StatsChart';
import { renderLine } from '@/lib/probability/statsCanvas';
import { ecdfPoints, sampleRange, type XYPoint } from '@/lib/probability/stats';

export interface ECDFChartProps {
  data: number[];
  className?: string;
  minHeight?: number;
}

export function ECDFChart({ data, className, minHeight = 220 }: ECDFChartProps) {
  const compute = useMemo(() => () => ecdfPoints(data), [data]);

  const autoView = useMemo(
    () => (pts: XYPoint[]) => {
      if (pts.length === 0) return null;
      const { min, max } = sampleRange(pts.map((p) => p.x));
      const pad = (max - min) * 0.05 || 1;
      const view: ResultView = { xMin: min - pad, xMax: max + pad, yMin: -0.05, yMax: 1.05 };
      return view;
    },
    [],
  );

  const draw = useMemo(
    () => (ctx: CanvasRenderingContext2D, view: ResultView, size: { w: number; h: number }, pts: XYPoint[]) => {
      renderLine(ctx, view, size, pts, '#38bdf8');
    },
    [],
  );

  return (
    <StatsChart
      compute={compute}
      draw={draw}
      autoView={autoView}
      tooltip={(w) => `x=${w.x.toFixed(3)}  F(x)=${w.y.toFixed(3)}`}
      className={className}
      minHeight={minHeight}
    />
  );
}