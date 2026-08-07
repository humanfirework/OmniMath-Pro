'use client';

/**
 * OmniMath Pro — 交互式直方图（canvas）
 *
 * 对齐 MATLAB `histfit`：直方图条形 + 可选正态 PDF / KDE 密度叠加线。
 * 内建缩放 / 平移 / 悬停 tooltip，尺寸自适应容器。
 */

import { useMemo } from 'react';
import type { ResultView } from '@/components/workbench/runresults/runResultRender';
import { StatsChart } from './StatsChart';
import { renderHistogram } from '@/lib/probability/statsCanvas';
import { histogramBins, mean, stdDev, sampleRange, type HistBin, type BinRule, type XYPoint } from '@/lib/probability/stats';

export interface HistogramChartProps {
  data: number[];
  binRule?: BinRule;
  /** 是否以密度（归一化）显示，并叠加正态 PDF。 */
  density?: boolean;
  className?: string;
  minHeight?: number;
}

interface HistogramData {
  bins: HistBin[];
  overlay: XYPoint[] | null;
}

function autoscale(data: number[], mu: number, sigma: number): XYPoint[] {
  const { min, max } = sampleRange(data);
  const pad = (max - min) * 0.1 || 1;
  const lo = min - pad;
  const hi = max + pad;
  const pts: XYPoint[] = [];
  const n = 64;
  for (let i = 0; i <= n; i++) {
    const x = lo + ((hi - lo) * i) / n;
    const z = (x - mu) / (sigma || 1);
    pts.push({ x, y: Math.exp((-z * z) / 2) / (sigma * Math.sqrt(2 * Math.PI)) });
  }
  return pts;
}

export function HistogramChart({ data, binRule = 'sturges', density = false, className, minHeight = 220 }: HistogramChartProps) {
  const compute = useMemo(
    () => () => {
      const bins = histogramBins(data, binRule);
      let overlay: XYPoint[] | null = null;
      if (density && data.length > 1) {
        const mu = mean(data);
        const sigma = stdDev(data);
        if (Number.isFinite(sigma) && sigma > 0) overlay = autoscale(data, mu, sigma);
      }
      return { bins, overlay } satisfies HistogramData;
    },
    [data, binRule, density],
  );

  const autoView = useMemo(
    () => (d: HistogramData) => {
      if (d.bins.length === 0) return null;
      const lo = d.bins[0].start;
      const hi = d.bins[d.bins.length - 1].end;
      let maxY = 0;
      for (const b of d.bins) maxY = Math.max(maxY, density ? b.density : b.count);
      if (d.overlay) for (const p of d.overlay) maxY = Math.max(maxY, p.y);
      const yMax = maxY > 0 ? maxY * 1.12 : 1;
      const view: ResultView = { xMin: lo, xMax: hi, yMin: 0, yMax };
      return view;
    },
    [density],
  );

  const draw = useMemo(
    () => (ctx: CanvasRenderingContext2D, view: ResultView, size: { w: number; h: number }, d: HistogramData) => {
      renderHistogram(ctx, view, size, d.bins, { density, overlay: d.overlay ?? undefined });
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