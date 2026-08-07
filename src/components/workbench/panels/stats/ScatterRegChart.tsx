'use client';

/**
 * OmniMath Pro — 交互式散点 + 回归带（canvas）
 *
 * 对齐 MATLAB `scatter` + `lsline`：散点 + 最小二乘回归线，可缩放 / 平移 / tooltip。
 */

import { useMemo } from 'react';
import type { ResultView } from '@/components/workbench/runresults/runResultRender';
import { StatsChart } from './StatsChart';
import { renderScatter } from '@/lib/probability/statsCanvas';
import { linearRegression, sampleRange, type XYPoint, type RegressionResult } from '@/lib/probability/stats';

export interface ScatterRegChartProps {
  points: XYPoint[];
  className?: string;
  minHeight?: number;
}

interface ScatterData {
  reg: RegressionResult | null;
  pts: XYPoint[];
}

export function ScatterRegChart({ points, className, minHeight = 220 }: ScatterRegChartProps) {
  const compute = useMemo(
    () => () => ({ reg: linearRegression(points), pts: points }) satisfies ScatterData,
    [points],
  );

  const autoView = useMemo(
    () => (d: ScatterData) => {
      if (d.pts.length === 0) return null;
      const xr = sampleRange(d.pts.map((p) => p.x));
      const yr = sampleRange(d.pts.map((p) => p.y));
      const padX = (xr.max - xr.min) * 0.08 || 1;
      const padY = (yr.max - yr.min) * 0.08 || 1;
      const view: ResultView = { xMin: xr.min - padX, xMax: xr.max + padX, yMin: yr.min - padY, yMax: yr.max + padY };
      return view;
    },
    [],
  );

  const draw = useMemo(
    () => (ctx: CanvasRenderingContext2D, view: ResultView, size: { w: number; h: number }, d: ScatterData) => {
      renderScatter(ctx, view, size, d.pts, { reg: d.reg ?? undefined });
    },
    [],
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