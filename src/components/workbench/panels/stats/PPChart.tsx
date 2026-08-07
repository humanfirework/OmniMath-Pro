'use client';

/**
 * OmniMath Pro — 交互式 P-P 图（canvas）
 *
 * 对齐 MATLAB `probplot`：x=理论 CDF(样本值)，y=经验 CDF，含 y=x 对角线。
 * 偏离对角线越远，说明该分布拟合越差。用于分布拟合优度可视化。
 */

import { useMemo } from 'react';
import type { ResultView } from '@/components/workbench/runresults/runResultRender';
import { StatsChart } from './StatsChart';
import { renderScatter } from '@/lib/probability/statsCanvas';
import { ppPoints, type XYPoint } from '@/lib/probability/stats';
import { makeDist } from '@/lib/probability/distributions';

export interface PPChartProps {
  data: number[];
  /** 对照分布的 CDF；不传/空则用标准正态。 */
  cdf?: (x: number) => number;
  className?: string;
  minHeight?: number;
}

export function PPChart({ data, cdf, className, minHeight = 220 }: PPChartProps) {
  const compute = useMemo(() => () => ppPoints(data, cdf ?? normCdf), [data, cdf]);

  const autoView = useMemo(
    () => () => ({ xMin: 0, xMax: 1, yMin: 0, yMax: 1 }) as ResultView,
    [],
  );

  const draw = useMemo(
    () => (ctx: CanvasRenderingContext2D, view: ResultView, size: { w: number; h: number }, pts: XYPoint[]) => {
      renderScatter(ctx, view, size, pts, { refLine: true });
    },
    [],
  );

  return (
    <StatsChart
      compute={compute}
      draw={draw}
      autoView={autoView}
      tooltip={(w) => `理论 CDF=${w.x.toFixed(3)}  经验 CDF=${w.y.toFixed(3)}`}
      className={className}
      minHeight={minHeight}
    />
  );
}

/** 标准正态 CDF（复用 erf 近似）。 */
function normCdf(x: number): number {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}

function erf(x: number): number {
  const s = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  const y =
    1 -
    (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-x * x);
  return s * y;
}