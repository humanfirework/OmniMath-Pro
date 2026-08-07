'use client';

/**
 * OmniMath Pro — 交互式 QQ 图（canvas）
 *
 * 对齐 MATLAB `qqplot`：样本分位 vs 理论分位，含 y=x 参考线。
 * 默认对照标准正态，也可切换为任意分布（用 `makeDist(...).inv`）。
 */

import { useMemo } from 'react';
import type { ResultView } from '@/components/workbench/runresults/runResultRender';
import { StatsChart } from './StatsChart';
import { renderScatter } from '@/lib/probability/statsCanvas';
import { qqPoints, sampleRange, type XYPoint } from '@/lib/probability/stats';
import { makeDist } from '@/lib/probability/distributions';

export interface QQChartProps {
  data: number[];
  /** 对照分布 kind；不传或 normal 用标准正态。 */
  distKind?: string;
  /** 对照分布参数。 */
  distParams?: Record<string, number>;
  className?: string;
  minHeight?: number;
}

export function QQChart({ data, distKind, distParams = {}, className, minHeight = 220 }: QQChartProps) {
  const theoretical = useMemo(() => {
    if (distKind && distKind !== 'normal') {
      try {
        const d = makeDist(distKind as Parameters<typeof makeDist>[0], distParams);
        return (p: number) => d.inv(p);
      } catch {
        return undefined;
      }
    }
    return undefined;
  }, [distKind, distParams]);

  const compute = useMemo(
    () => () => qqPoints(data, theoretical),
    [data, theoretical],
  );

  const autoView = useMemo(
    () => (pts: XYPoint[]) => {
      if (pts.length === 0) return null;
      const xs = pts.map((p) => p.x);
      const ys = pts.map((p) => p.y);
      const xr = sampleRange(xs);
      const yr = sampleRange(ys);
      const lo = Math.min(xr.min, yr.min);
      const hi = Math.max(xr.max, yr.max);
      const pad = (hi - lo) * 0.08 || 1;
      const view: ResultView = { xMin: lo - pad, xMax: hi + pad, yMin: lo - pad, yMax: hi + pad };
      return view;
    },
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
      tooltip={(w) => `理论=${w.x.toFixed(3)}  样本=${w.y.toFixed(3)}`}
      className={className}
      minHeight={minHeight}
    />
  );
}