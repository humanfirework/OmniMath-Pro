'use client';

/**
 * OmniMath Pro — 交互式分布探索器（对齐 MATLAB `disttool`）
 *
 * 用滑块调参，实时重绘分布 PDF / CDF。复用 `lib/probability/distributions.ts`
 * 的分布实现，与面板 / 蓝图节点共用同一套算法，避免行为漂移。
 */

import { useMemo, useState } from 'react';
import type { ResultView } from '@/components/workbench/runresults/runResultRender';
import { StatsChart } from './StatsChart';
import { renderLine } from '@/lib/probability/statsCanvas';
import { makeDist, type DistKind } from '@/lib/probability/distributions';
import type { XYPoint } from '@/lib/probability/stats';

interface SliderDef {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  def: number;
}

const KIND_SLIDERS: Record<DistKind, SliderDef[]> = {
  normal: [
    { key: 'mu', label: '均值 μ', min: -5, max: 5, step: 0.1, def: 0 },
    { key: 'sigma', label: '标准差 σ', min: 0.1, max: 5, step: 0.1, def: 1 },
  ],
  uniform: [
    { key: 'a', label: '下限 a', min: -10, max: 0, step: 0.5, def: 0 },
    { key: 'b', label: '上限 b', min: 0.1, max: 10, step: 0.5, def: 1 },
  ],
  exponential: [{ key: 'rate', label: '速率 λ', min: 0.1, max: 5, step: 0.1, def: 1 }],
  gamma: [
    { key: 'alpha', label: '形状 α', min: 0.5, max: 10, step: 0.1, def: 2 },
    { key: 'beta', label: '速率 β', min: 0.5, max: 5, step: 0.1, def: 1 },
  ],
  beta: [
    { key: 'alpha', label: 'α', min: 0.5, max: 10, step: 0.1, def: 2 },
    { key: 'beta', label: 'β', min: 0.5, max: 10, step: 0.1, def: 2 },
  ],
  chisquare: [{ key: 'df', label: '自由度 ν', min: 1, max: 30, step: 1, def: 5 }],
  studentt: [{ key: 'df', label: '自由度 ν', min: 1, max: 30, step: 1, def: 5 }],
  fdist: [
    { key: 'd1', label: 'd1', min: 1, max: 30, step: 1, def: 5 },
    { key: 'd2', label: 'd2', min: 1, max: 30, step: 1, def: 5 },
  ],
  lognormal: [
    { key: 'mu', label: 'μ', min: -3, max: 3, step: 0.1, def: 0 },
    { key: 'sigma', label: 'σ', min: 0.1, max: 3, step: 0.1, def: 1 },
  ],
  weibull: [
    { key: 'scale', label: '尺度 λ', min: 0.5, max: 10, step: 0.1, def: 1 },
    { key: 'shape', label: '形状 k', min: 0.5, max: 10, step: 0.1, def: 1.5 },
  ],
  binomial: [
    { key: 'n', label: '试验次数 n', min: 1, max: 100, step: 1, def: 20 },
    { key: 'p', label: '成功概率 p', min: 0.01, max: 0.99, step: 0.01, def: 0.5 },
  ],
  poisson: [{ key: 'lambda', label: 'λ', min: 0.1, max: 20, step: 0.1, def: 5 }],
  geometric: [{ key: 'p', label: '成功概率 p', min: 0.01, max: 0.99, step: 0.01, def: 0.3 }],
  negbinomial: [
    { key: 'r', label: '失败次数 r', min: 1, max: 50, step: 1, def: 5 },
    { key: 'p', label: '成功概率 p', min: 0.01, max: 0.99, step: 0.01, def: 0.5 },
  ],
};

const KINDS = Object.keys(KIND_SLIDERS) as DistKind[];

interface ExplorerData {
  pdf: XYPoint[];
  cdf: XYPoint[];
}

function sampleCurves(d: ReturnType<typeof makeDist>, mode: 'pdf' | 'cdf'): XYPoint[] {
  const out: XYPoint[] = [];
  const n = 240;
  for (let i = 0; i <= n; i++) {
    const p = i / n;
    const x = d.kind === 'beta' || d.kind === 'uniform' ? p : xRange(d)[0] + p * (xRange(d)[1] - xRange(d)[0]);
    const y = mode === 'pdf' ? d.pdf(x) : d.cdf(x);
    if (Number.isFinite(y)) out.push({ x, y });
  }
  return out;
}

function xRange(d: ReturnType<typeof makeDist>): [number, number] {
  const qs = [0.001, 0.999].map((p) => d.inv(p));
  if (qs.some((v) => !Number.isFinite(v))) return [-5, 5];
  const lo = Math.min(qs[0], qs[1]);
  const hi = Math.max(qs[0], qs[1]);
  const pad = (hi - lo) * 0.08 || 1;
  return [lo - pad, hi + pad];
}

export function DistributionExplorer() {
  const [kind, setKind] = useState<DistKind>('normal');
  const [params, setParams] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    for (const s of KIND_SLIDERS.normal) init[s.key] = s.def;
    return init;
  });

  const sliders = KIND_SLIDERS[kind];

  const setKindAndReset = (k: DistKind) => {
    setKind(k);
    const init: Record<string, number> = {};
    for (const s of KIND_SLIDERS[k]) init[s.key] = s.def;
    setParams(init);
  };

  const compute = useMemo(
    () => () => {
      const d = makeDist(kind, params);
      return { pdf: sampleCurves(d, 'pdf'), cdf: sampleCurves(d, 'cdf') } satisfies ExplorerData;
    },
    [kind, params],
  );

  const autoView = useMemo(
    () => (d: ExplorerData) => {
      if (d.pdf.length === 0) return null;
      let lo = Infinity;
      let hi = -Infinity;
      let maxY = 0;
      for (const p of d.pdf) {
        if (p.x < lo) lo = p.x;
        if (p.x > hi) hi = p.x;
        if (p.y > maxY) maxY = p.y;
      }
      const view: ResultView = { xMin: lo, xMax: hi, yMin: 0, yMax: maxY * 1.1 || 1 };
      return view;
    },
    [],
  );

  const draw = useMemo(
    () => (ctx: CanvasRenderingContext2D, view: ResultView, size: { w: number; h: number }, d: ExplorerData) => {
      renderLine(ctx, view, size, d.pdf, '#38bdf8');
    },
    [],
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <select
          value={kind}
          onChange={(e) => setKindAndReset(e.target.value as DistKind)}
          className="h-7 rounded border border-border/60 bg-background px-2 text-[11px] outline-none"
        >
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
        {sliders.map((s) => (
          <label key={s.key} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="whitespace-nowrap">{s.label}</span>
            <input
              type="range"
              min={s.min}
              max={s.max}
              step={s.step}
              value={params[s.key]}
              onChange={(e) => setParams((p) => ({ ...p, [s.key]: Number(e.target.value) }))}
              className="w-24"
            />
            <span className="w-10 font-mono text-[10px] text-foreground">{params[s.key]}</span>
          </label>
        ))}
      </div>
      <StatsChart
        compute={compute}
        draw={draw}
        autoView={autoView}
        tooltip={(w) => `x=${w.x.toFixed(3)}  pdf=${w.y.toFixed(4)}`}
        minHeight={260}
      />
    </div>
  );
}