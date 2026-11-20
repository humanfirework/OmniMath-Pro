'use client';

/**
 * OmniMath Pro — 分布拟合视图（Distribution Fitter）
 *
 * 对齐 MATLAB `dfittool`：对一组样本做 MLE 多候选分布拟合，展示：
 *   - 拟合优度对比表（对数似然 / AIC / BIC，按 AIC 升序）
 *   - 数据直方图（密度） + 多分布 PDF 叠加（可单独显隐某条曲线）
 *
 * 复用 `lib/probability/fitter.ts`（纯逻辑）与 `StatsChart` / `statsCanvas`，
 * 与分布探索器共用同一套渲染基础设施。
 */

import { useMemo, useState } from 'react';
import type { ResultView } from '@/components/workbench/runresults/runResultRender';
import { StatsChart } from './StatsChart';
import { renderHistogram, renderLine } from '@/lib/probability/statsCanvas';
import { fitAllDistributions, DIST_LABEL, type FitParams } from '@/lib/probability/fitter';
import { makeDist } from '@/lib/probability/distributions';
import { histogramBins, sampleRange, type HistBin, type XYPoint } from '@/lib/probability/stats';

export interface DistributionFitterProps {
  data: number[];
  className?: string;
  minHeight?: number;
}

/** 叠加曲线调色板（按排名取色，排名高者更醒目）。 */
const PALETTE = ['#38bdf8', '#f472b6', '#a3e635', '#fbbf24', '#c084fc', '#fb7185', '#34d399', '#60a5fa'];

interface FitCurve {
  kind: string;
  pts: XYPoint[];
}

interface FitterData {
  bins: HistBin[];
  /** 每条拟合曲线（按 AIC 排名）。 */
  curves: FitCurve[];
  fits: FitParams[];
}

/** 在 [lo, hi] 范围内均匀采样分布 PDF。 */
function samplePdf(kind: keyof typeof DIST_LABEL, params: Record<string, number>, lo: number, hi: number): XYPoint[] {
  const d = makeDist(kind, params);
  const out: XYPoint[] = [];
  const n = 240;
  for (let i = 0; i <= n; i++) {
    const x = lo + (i / n) * (hi - lo);
    const y = d.pdf(x);
    if (Number.isFinite(y) && y > 0) out.push({ x, y });
  }
  return out;
}

export function DistributionFitter({ data, className, minHeight = 260 }: DistributionFitterProps) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const [xLo, xHi] = useMemo((): [number, number] => {
    if (data.length < 2) return [-1, 1];
    const r = sampleRange(data);
    const pad = (r.max - r.min) * 0.08 || 1;
    return [r.min - pad, r.max + pad];
  }, [data]);

  const compute = useMemo(() => {
    return () => {
      if (data.length < 2) return { bins: [], curves: [], fits: [] } satisfies FitterData;
      const fits = fitAllDistributions(data);
      const bins = histogramBins(data);
      const curves = fits.map((f) => ({ kind: f.kind, pts: samplePdf(f.kind, f.params, xLo, xHi) }));
      return { bins, curves, fits } satisfies FitterData;
    };
  }, [data, xLo, xHi]);

  const autoView = useMemo(
    () => (d: FitterData) => {
      if (d.bins.length === 0) return null;
      let yMax = 0;
      for (const b of d.bins) if (b.density > yMax) yMax = b.density;
      for (const c of d.curves) for (const p of c.pts) if (p.y > yMax) yMax = p.y;
      const view: ResultView = { xMin: xLo, xMax: xHi, yMin: 0, yMax: yMax * 1.1 || 1 };
      return view;
    },
    [xLo, xHi],
  );

  const draw = useMemo(() => {
    return (ctx: CanvasRenderingContext2D, view: ResultView, size: { w: number; h: number }, d: FitterData) => {
      if (d.bins.length === 0) return;
      // 直方图（密度模式，与 PDF 同量纲）
      renderHistogram(ctx, view, size, d.bins, { density: true });
      // 各分布 PDF 叠加
      d.curves.forEach((c, i) => {
        if (hidden.has(c.kind)) return;
        renderLine(ctx, view, size, c.pts, PALETTE[i % PALETTE.length]);
      });
    };
  }, [hidden]);

  const toggleCurve = (kind: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  };

  const fits = useMemo(() => (data.length < 2 ? ([] as FitParams[]) : fitAllDistributions(data)), [data]);

  return (
    <div className={className}>
      {/* 拟合优度表 */}
      <div className="mb-2 overflow-hidden rounded-md border border-border/40">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b border-border/40 bg-black/20 text-muted-foreground">
              <th className="px-2 py-1 text-left font-medium">分布</th>
              <th className="px-2 py-1 text-right font-medium">参数</th>
              <th className="px-2 py-1 text-right font-medium">log L</th>
              <th className="px-2 py-1 text-right font-medium">AIC</th>
              <th className="px-2 py-1 text-right font-medium">BIC</th>
            </tr>
          </thead>
          <tbody>
            {fits.map((f, i) => (
              <tr
                key={f.kind}
                className={`border-b border-border/20 last:border-0 ${i === 0 ? 'bg-primary/5' : ''}`}
              >
                <td className="px-2 py-1">
                  <button
                    onClick={() => toggleCurve(f.kind)}
                    className="flex items-center gap-1.5 text-left hover:text-primary"
                    title="点击显隐曲线"
                  >
                    <span
                      className="inline-block size-2 shrink-0 rounded-full"
                      style={{ background: PALETTE[i % PALETTE.length], opacity: hidden.has(f.kind) ? 0.25 : 1 }}
                    />
                    <span className={hidden.has(f.kind) ? 'text-muted-foreground line-through' : ''}>
                      {DIST_LABEL[f.kind] ?? f.kind}
                    </span>
                    {i === 0 && <span className="rounded bg-primary/15 px-1 text-[9px] text-primary">最佳</span>}
                  </button>
                </td>
                <td className="px-2 py-1 text-right font-mono text-[10px] text-muted-foreground">
                  {fmtParams(f)}
                </td>
                <td className="px-2 py-1 text-right font-mono tabular-nums">{fmt(f.logLik)}</td>
                <td className="px-2 py-1 text-right font-mono tabular-nums">{fmt(f.aic)}</td>
                <td className="px-2 py-1 text-right font-mono tabular-nums">{fmt(f.bic)}</td>
              </tr>
            ))}
            {fits.length === 0 && (
              <tr>
                <td colSpan={5} className="px-2 py-3 text-center text-muted-foreground">
                  无有效拟合结果（数据需 ≥2 个有限数值）
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 多分布 PDF 叠加 */}
      <StatsChart
        compute={compute}
        draw={draw}
        autoView={autoView}
        tooltip={(w) => `x=${w.x.toFixed(3)}  y=${w.y.toFixed(4)}`}
        minHeight={minHeight}
      />
    </div>
  );
}

function fmt(v: number): string {
  if (!Number.isFinite(v)) return '—';
  const abs = Math.abs(v);
  if (abs >= 1e5 || (abs < 1e-3 && abs > 0)) return v.toExponential(1);
  return String(Number(v.toPrecision(5)));
}

function fmtParams(f: FitParams): string {
  const keys = Object.keys(f.params);
  if (keys.length === 0) return '—';
  return keys.map((k) => `${k}=${Number(f.params[k]).toPrecision(3)}`).join(', ');
}