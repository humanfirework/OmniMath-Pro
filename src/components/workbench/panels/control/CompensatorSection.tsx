'use client';

/**
 * OmniMath Pro — 校正器设计（超前 Lead / 滞后 Lag / 超前-滞后 Lead-Lag / PID）
 *
 * 输入开环传递函数 N(s)/D(s)、目标相位裕度与（滞后可选）目标速度误差系数 Kv，
 * 调用 leadCompensator / lagCompensator / leadLagCompensator / pidCompensator
 * 设计各类校正器，并用 KaTeX 渲染校正器公式，对比校正前后闭环阶跃响应。
 */

import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  leadCompensator,
  lagCompensator,
  leadLagCompensator,
  pidCompensator,
  bode,
  stabilityMargins,
  parsePolynomial,
  closedLoopTransfer,
  stepResponse,
  type CompensatorResult,
} from '@/lib/control/transferFunction';
import { renderStepBoth, renderStep } from '@/lib/control/chartRender';
import { StatsChart } from '@/components/workbench/panels/stats/StatsChart';
import type { ResultView } from '@/components/workbench/runresults/runResultRender';
import { FormulaRenderer } from '@/components/workbench/FormulaRenderer';
import { polyToLatexFrac } from '@/components/workbench/panels/control/latex';

type CorrKind = 'lead' | 'lag' | 'leadlag' | 'pid';

const KIND_LABEL: Record<CorrKind, string> = {
  lead: '超前校正 (Lead)',
  lag: '滞后校正 (Lag)',
  leadlag: '超前-滞后 (Lead-Lag)',
  pid: 'PID 校正',
};

const PRESETS: { name: string; num: string; den: string; desc: string }[] = [
  { name: '三阶对象', num: '5', den: 's^3+3s^2+2s', desc: 'G=5/[s(s+1)(s+2)]，需校正' },
  { name: '一阶惯性', num: '10', den: 's+1', desc: 'PM 较高，无需校正示例' },
  { name: '二阶对象', num: '1', den: 's^2+2s+1', desc: '临界阻尼，需滞后提升增益' },
  { name: '积分对象', num: '1', den: 's^3+3s^2+2s', desc: 'G=1/[s(s+1)(s+2)]，适合 PID 整定' },
];

function autoViewOf(pts: { x: number; y: number }[], padRatio = 0.1): ResultView {
  if (pts.length === 0) return { xMin: -1, xMax: 1, yMin: -1, yMax: 1 };
  let loX = Infinity, hiX = -Infinity, loY = Infinity, hiY = -Infinity;
  for (const p of pts) {
    if (Number.isFinite(p.x)) { if (p.x < loX) loX = p.x; if (p.x > hiX) hiX = p.x; }
    if (Number.isFinite(p.y)) { if (p.y < loY) loY = p.y; if (p.y > hiY) hiY = p.y; }
  }
  if (!Number.isFinite(loX) || loX === hiX) { loX -= 1; hiX += 1; }
  if (!Number.isFinite(loY) || loY === hiY) { loY -= 1; hiY += 1; }
  const padX = (hiX - loX) * padRatio || 1;
  const padY = (hiY - loY) * padRatio || 1;
  return { xMin: loX - padX, xMax: hiX + padX, yMin: loY - padY, yMax: hiY + padY };
}

/** 多项式乘法（系数高次在前），用于计算校正后开环 L(s) = C(s)·G(s)。 */
function polyMul(a: number[], b: number[]): number[] {
  const out = new Array<number>(a.length + b.length - 1).fill(0);
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) out[i + j] += a[i] * b[j];
  }
  // 去掉前导 0（且至少保留一个系数）。
  let k = 0;
  while (k < out.length - 1 && Math.abs(out[k]) < 1e-12) k++;
  return out.slice(k);
}

export function CompensatorSection() {
  const [kind, setKind] = useState<CorrKind>('lead');
  const [num, setNum] = useState('5');
  const [den, setDen] = useState('s^3+3s^2+2s');
  const [targetPM, setTargetPM] = useState('45');
  const [kv, setKv] = useState('');

  const result = useMemo<CompensatorResult | { error: string } | null>(() => {
    try {
      const n = parsePolynomial(num);
      const d = parsePolynomial(den);
      const pm = Number(targetPM);
      if (!Number.isFinite(pm)) return null;
      const kvNum = kv.trim() ? Number(kv) : undefined;
      if (kv.trim() && !Number.isFinite(kvNum)) return null;
      if (kind === 'lead') return leadCompensator(n, d, { targetPM: pm, tEnd: 12 });
      if (kind === 'lag')
        return lagCompensator(n, d, { targetPM: pm, kv: kvNum && kvNum > 0 ? kvNum : undefined, tEnd: 12 });
      if (kind === 'leadlag')
        return leadLagCompensator(n, d, { targetPM: pm, kv: kvNum && kvNum > 0 ? kvNum : undefined, tEnd: 12 });
      return pidCompensator(n, d, { method: 'pid', tEnd: 12 });
    } catch {
      return null;
    }
  }, [num, den, targetPM, kv, kind]);

  // 校正前闭环阶跃（用于对比）
  const beforeClosed = useMemo(() => {
    try {
      const n = parsePolynomial(num);
      const d = parsePolynomial(den);
      const cl = closedLoopTransfer(n, d);
      return stepResponse(cl.num, cl.den, 12, 400);
    } catch {
      return null;
    }
  }, [num, den]);

  const origPM = useMemo(() => {
    try {
      const n = parsePolynomial(num);
      const d = parsePolynomial(den);
      const m = stabilityMargins(bode(n, d, 0.01, 1000, 800));
      return m.pm;
    } catch {
      return null;
    }
  }, [num, den]);

  // 校正器 C(s) 的 LaTeX 预览
  const compLatex = useMemo<string | null>(() => {
    if (!result || 'error' in result) return null;
    if (result.kind === 'pid') {
      const kp = result.kp ?? 0;
      const ki = result.ki ?? 0;
      const kd = result.kd ?? 0;
      return `C(s) = K_p + \\dfrac{K_i}{s} + K_d\\,s = ${polyToLatexFrac([kd, kp, ki], [1, 0])}`;
    }
    return `C(s) = ${polyToLatexFrac(result.cNum, result.cDen)}`;
  }, [result]);

  // 校正后开环 L(s) = C(s)·G(s) 的分子/分母（用于开环传函预览）。
  const openLoop = useMemo<{ num: number[]; den: number[] } | null>(() => {
    if (!result || 'error' in result) return null;
    try {
      const n = parsePolynomial(num);
      const d = parsePolynomial(den);
      return { num: polyMul(result.cNum, n), den: polyMul(result.cDen, d) };
    } catch {
      return null;
    }
  }, [result, num, den]);
  const openLoopLatex = useMemo<string | null>(() => {
    if (!openLoop) return null;
    return `L(s) = C(s)\\,G(s) = ${polyToLatexFrac(openLoop.num, openLoop.den)}`;
  }, [openLoop]);

  return (
    <div className="space-y-3">
      {/* 校正类型切换 */}
      <div className="flex items-center gap-1 rounded-md border border-border/40 bg-background/30 p-1 w-fit flex-wrap">
        {(Object.keys(KIND_LABEL) as CorrKind[]).map((k) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            className={cn(
              'h-7 px-3 rounded text-[11px] transition-colors',
              kind === k ? 'bg-primary/15 text-primary font-medium' : 'text-muted-foreground hover:bg-accent/60',
            )}
          >
            {KIND_LABEL[k]}
          </button>
        ))}
      </div>

      <div className="rounded-md border border-border/40 bg-background/30 p-3 space-y-2">
        <div className="text-[10.5px] font-medium text-muted-foreground">
          {KIND_LABEL[kind]}：开环 G(s) = N(s) / D(s)
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <label className="text-[10px] text-muted-foreground block">
            分子 N(s)
            <Input value={num} onChange={(e) => setNum(e.target.value)} className="mt-0.5 h-8 font-mono text-[12px]" placeholder="例：5" />
          </label>
          <label className="text-[10px] text-muted-foreground block">
            分母 D(s)
            <Input value={den} onChange={(e) => setDen(e.target.value)} className="mt-0.5 h-8 font-mono text-[12px]" placeholder="例：s^3+3s^2+2s" />
          </label>
          {kind !== 'pid' ? (
            <label className="text-[10px] text-muted-foreground block">
              目标相位裕度 (°)
              <Input value={targetPM} onChange={(e) => setTargetPM(e.target.value)} className="mt-0.5 h-8 font-mono text-[12px]" placeholder="45" />
            </label>
          ) : (
            <div className="text-[10px] text-muted-foreground self-end pb-1">PID 用 Ziegler-Nichols 自动整定</div>
          )}
        </div>
        {kind !== 'pid' && (
          <label className="text-[10px] text-muted-foreground block">
            目标速度误差系数 Kv（可选，用于稳态误差约束）
            <Input value={kv} onChange={(e) => setKv(e.target.value)} className="mt-0.5 h-8 font-mono text-[12px]" placeholder="例：10（留空则忽略）" />
          </label>
        )}
        <div className="flex flex-wrap gap-1">
          {PRESETS.map((ex) => (
            <button
              key={ex.name}
              title={ex.desc}
              onClick={() => { setNum(ex.num); setDen(ex.den); }}
              className={cn(
                'h-6 px-2 rounded text-[10px] border transition-colors',
                den === ex.den && num === ex.num
                  ? 'border-primary/50 bg-primary/10 text-primary'
                  : 'border-border/50 text-muted-foreground hover:bg-accent/60',
              )}
            >
              {ex.name}
            </button>
          ))}
        </div>
      </div>

      {origPM !== null && kind !== 'pid' && (
        <div className="rounded-md border border-border/40 bg-background/30 p-2.5 text-[11.5px]">
          原系统相位裕度 <span className={cn('font-mono', (origPM < Number(targetPM) ? 'text-rose-400' : 'text-emerald-400'))}>PM₀ = {origPM.toFixed(1)}°</span>
          {origPM < Number(targetPM) ? '（不满足目标，需要校正）' : `（已满足目标 ${targetPM}°，可无需${kind === 'lead' ? '超前' : '滞后'}校正）`}
        </div>
      )}

      {result && !('error' in result) && (
        <>
          {/* 校正器信息 + 公式预览 */}
          <div className="rounded-md border border-border/40 bg-background/30 p-2.5 space-y-1.5 text-[11.5px]">
            <div className="text-[10px] text-muted-foreground">校正器 C(s)（渲染预览 + 文本）</div>
            {compLatex && (
              <FormulaRenderer latex={compLatex} displayMode fitToContainer className="text-sm" />
            )}
            <div className="overflow-x-auto font-mono text-primary">
              {result.kind === 'pid'
                ? `C(s) = ${result.kp?.toPrecision(4)} + ${result.ki?.toPrecision(4)}/s + ${result.kd?.toPrecision(4)}·s`
                : `C(s) = ${polyToLatexFrac(result.cNum, result.cDen)}`}
            </div>
            {/* 校正后开环传函预览 */}
            {openLoopLatex && (
              <div className="pt-1 border-t border-border/40">
                <div className="text-[10px] text-muted-foreground mb-1">校正后开环传函 L(s) = C(s)·G(s)</div>
                <div className="overflow-x-auto">
                  <FormulaRenderer latex={openLoopLatex} displayMode fitToContainer className="text-sm" />
                </div>
              </div>
            )}
            <div className="text-muted-foreground">
              {result.kind === 'lead' && `相位超前 ${result.phaseLeadDeg.toFixed(1)}° · α = ${Number(result.alpha).toPrecision(4)}`}
              {result.kind === 'lag' && `β = ${Number(result.alpha).toPrecision(4)} · 零点 ${Number(result.zero).toPrecision(4)} rad/s · 极点 ${Number(result.pole).toPrecision(4)} rad/s`}
              {result.kind === 'leadlag' && `超前相位 ${result.phaseLeadDeg.toFixed(1)}° · α = ${Number(result.alpha).toPrecision(4)} · 滞后 β = ${Number(result.beta ?? 1).toPrecision(4)}`}
              {result.kind === 'pid' && `Kp = ${Number(result.kp).toPrecision(4)} · Ki = ${Number(result.ki).toPrecision(4)} · Kd = ${Number(result.kd).toPrecision(4)}`}
              {' '}· 校正后 PM≈{result.pm?.toFixed(1) ?? '—'}°
            </div>
            <div className="text-[10.5px] opacity-80">{result.note}</div>
          </div>

          {/* 校正后闭环阶跃 */}
          <div>
            <div className="mb-1 text-[10.5px] text-muted-foreground">校正后闭环阶跃响应</div>
            <StatsChart
              compute={() => result.step}
              draw={(ctx, view, size, data) => renderStep(ctx, view, size, data)}
              autoView={(pts) => autoViewOf(pts.map((p) => ({ x: p.t, y: p.y })))}
              tooltip={(w) => `t=${w.x.toFixed(2)}  y=${w.y.toFixed(3)}`}
              minHeight={280}
            />
          </div>

          {/* 校正前后对比 */}
          {beforeClosed && (
            <div>
              <div className="mb-1 text-[10.5px] text-muted-foreground">校正前后闭环响应对比</div>
              <StatsChart
                compute={() => ({ open: beforeClosed, closed: result.step })}
                draw={(ctx, view, size, data) => renderStepBoth(ctx, view, size, data)}
                autoView={(data) =>
                  autoViewOf([
                    ...data.open.map((p) => ({ x: p.t, y: p.y })),
                    ...data.closed.map((p) => ({ x: p.t, y: p.y })),
                  ])
                }
                tooltip={(w) => `t=${w.x.toFixed(2)}  y=${w.y.toFixed(3)}`}
                minHeight={280}
              />
            </div>
          )}
        </>
      )}

      {result && 'error' in result && (
        <div className="rounded-md border border-rose-500/40 bg-rose-500/10 p-2.5 text-[11.5px] text-rose-600 dark:text-rose-300">
          {result.error}
        </div>
      )}
    </div>
  );
}