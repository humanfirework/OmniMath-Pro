'use client';

/**
 * OmniMath Pro — 控制理论分析（ControlTheorySection）
 *
 * 复用 `lib/control/transferFunction.ts` 纯函数库，在 SolverWorkbench 提供：
 *   - Bode 幅相 · 阶跃响应（可开环/闭环对比）
 *   - 根轨迹 rlocus
 *   - 奈奎斯特 nyquist
 *   - PID 整定（Ziegler-Nichols）
 *
 * 增强项：
 *   - 传递函数 LaTeX 公式预览（FormulaRenderer）
 *   - 系统信息卡（直流增益 / 型别 / 阶数 / 稳定性 / 二阶 ωn·ζ）
 *   - 开环 vs 闭环阶跃响应叠加对比
 *   - 命名示例库（一键载入 num + den）
 *   - 每张图带坐标轴单位标注
 *
 * 图表用 `stats/StatsChart`（共享 pan/zoom/tooltip 交互），绘制函数在
 * `lib/control/chartRender.ts`。
 */

import { useMemo, useState } from 'react';
import type { ResultView } from '@/components/workbench/runresults/runResultRender';
import { StatsChart } from '@/components/workbench/panels/stats/StatsChart';
import { FormulaRenderer } from '@/components/workbench/FormulaRenderer';
import {
  renderBodeMag,
  renderBodePhase,
  renderStep,
  renderStepBoth,
  renderRlocus,
  renderNyquist,
} from '@/lib/control/chartRender';
import {
  parsePolynomial,
  transferAnalysis,
  rlocus,
  rlocusKlist,
  nyquist,
  pidTune,
  closedLoopTransfer,
  stepResponse,
  roots,
  stabilityMargins,
  type TransferAnalysis,
  type RlocusPoint,
  type NyquistPoint,
  type StabilityMargins,
} from '@/lib/control/transferFunction';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type CtlTab = 'bode' | 'step' | 'rlocus' | 'nyquist' | 'pid';

/** 阶跃响应点（t, y）的最小结构，供 stepMetrics 使用。 */
interface StepPointLike { t: number; y: number; }

const TABS: { id: CtlTab; label: string }[] = [
  { id: 'bode', label: 'Bode' },
  { id: 'step', label: '阶跃响应' },
  { id: 'rlocus', label: '根轨迹' },
  { id: 'nyquist', label: '奈奎斯特' },
  { id: 'pid', label: 'PID 整定' },
];

/** 命名示例库：一键载入分子/分母，附一句说明。 */
const PRESETS: { name: string; num: string; den: string; desc: string }[] = [
  { name: '一阶惯性', num: '1', den: 's+1', desc: '时间常数 1s，无超调' },
  { name: '二阶临界阻尼', num: '1', den: 's^2+2s+1', desc: 'ζ=1，最快无超调' },
  { name: '二阶恰当阻尼', num: '1', den: 's^2+2s+2', desc: 'ζ=0.707，ωn=√2' },
  { name: '二阶欠阻尼', num: '1', den: 's^2+0.8s+4', desc: 'ζ=0.2，明显超调振荡' },
  { name: '积分环节', num: '1', den: 's', desc: '型别 1，开环阶跃发散' },
  { name: '三阶系统', num: '1', den: 's^3+6s^2+11s+6', desc: '三实极点 -1/-2/-3' },
  { name: '带零点', num: 's+2', den: 's^2+3s+2', desc: '零点 s=-2，改善响应' },
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

/** 系数数组（高次在前）→ LaTeX 多项式，如 [1,3,2] → s^2 + 3s + 2。 */
export function polyToLatex(coeffs: number[]): string {
  const n = coeffs.length;
  const terms: string[] = [];
  for (let i = 0; i < n; i++) {
    const c = coeffs[i];
    if (c === 0) continue;
    const deg = n - 1 - i;
    const sign = i === 0 ? (c < 0 ? '-' : '') : c < 0 ? ' - ' : ' + ';
    const abs = Math.abs(c);
    let coeffStr: string;
    if (deg === 0) coeffStr = String(abs);
    else if (abs === 1) coeffStr = deg === 1 ? 's' : `s^{${deg}}`;
    else coeffStr = deg === 1 ? `${abs}s` : `${abs}s^{${deg}}`;
    terms.push(sign + coeffStr);
  }
  return terms.join('') || '0';
}

/** 由阶跃响应点列计算控制性能指标（终值 / 超调 / 调节时间 / 上升时间 / 峰值时间）。 */
function stepMetrics(pts: StepPointLike[]): {
  finalValue: number;
  overshootPct: number;
  settlingTime: number;
  riseTime: number;
  peakTime: number;
} {
  const n = pts.length;
  if (n === 0) return { finalValue: 0, overshootPct: 0, settlingTime: 0, riseTime: 0, peakTime: 0 };
  const finalValue = pts[n - 1].y;
  const peak = pts.reduce((m, p) => (Math.abs(p.y) > Math.abs(m.y) ? p : m), pts[0]);
  const overshootPct = finalValue !== 0 ? ((peak.y - finalValue) / Math.abs(finalValue)) * 100 : 0;
  const band = Math.abs(finalValue) * 0.02;
  let settlingTime = pts[n - 1].t;
  for (let i = n - 1; i >= 0; i--) {
    if (Math.abs(pts[i].y - finalValue) > band) { settlingTime = pts[i].t; break; }
    settlingTime = pts[i].t;
  }
  // 上升时间：10% → 90% 终值。
  const y10 = finalValue * 0.1;
  const y90 = finalValue * 0.9;
  let t10 = pts[0].t, t90 = pts[n - 1].t;
  for (let i = 0; i < n; i++) { if (pts[i].y >= y10) { t10 = pts[i].t; break; } }
  for (let i = 0; i < n; i++) { if (pts[i].y >= y90) { t90 = pts[i].t; break; } }
  return {
    finalValue,
    overshootPct,
    settlingTime,
    riseTime: t90 - t10,
    peakTime: peak.t,
  };
}

/** 小型指标卡：标题 + 数值，用于阶跃性能指标展示。 */
function MetricCard({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'ok' | 'warn' }) {
  return (
    <div className="rounded-md border border-border/40 bg-background/30 px-2 py-1.5">
      <div className="text-[9.5px] text-muted-foreground">{label}</div>
      <div
        className={cn(
          'font-mono text-[12px] tabular-nums',
          tone === 'ok' ? 'text-emerald-400' : tone === 'warn' ? 'text-amber-400' : 'text-primary',
        )}
      >
        {value}
      </div>
    </div>
  );
}

/** 二阶标准形 a₂s²+a₁s+a₀ → ωn、ζ。 */
function secondOrderMetrics(den: number[]): { omegaN?: number; zeta?: number } {
  if (den.length !== 3 || den[0] === 0) return {};
  const a2 = den[0], a1 = den[1], a0 = den[2];
  if (a0 <= 0) return {};
  const omegaN = Math.sqrt(a0 / a2);
  const zeta = a1 / (2 * omegaN * a2);
  return { omegaN, zeta };
}

export function ControlTheorySection() {
  const [num, setNum] = useState('1');
  const [den, setDen] = useState('s^2+3s+2');
  const [tab, setTab] = useState<CtlTab>('bode');
  const [pidMethod, setPidMethod] = useState<'p' | 'pi' | 'pid'>('pid');
  // 是否在阶跃响应里叠加闭环 T(s)=G/(1+G) 对比。
  const [showClosedLoop, setShowClosedLoop] = useState(true);

  const d = useMemo((): TransferAnalysis | null => {
    try {
      return transferAnalysis({ num, den, fMin: 0.01, fMax: 100, tEnd: 12 });
    } catch {
      return null;
    }
  }, [num, den]);

  const numPoly = useMemo(() => parsePolynomial(num), [num]);
  const denPoly = useMemo(() => parsePolynomial(den), [den]);

  const rlocusData = useMemo(() => {
    const Klist = rlocusKlist(0.01, 100, 120);
    return rlocus(numPoly, denPoly, Klist);
  }, [numPoly, denPoly]);

  const nyquistData = useMemo(() => nyquist(numPoly, denPoly, 1000, 300), [numPoly, denPoly]);

  const pidResult = useMemo(
    () => pidTune(numPoly, denPoly, { method: pidMethod, tEnd: 30, steps: 500 }),
    [numPoly, denPoly, pidMethod],
  );

  const bodeData = useMemo(() => d?.bode ?? [], [d]);
  const stepData = useMemo(() => d?.step ?? [], [d]);

  // 稳定性裕度（Bode 图上标注 PM / GM）。
  const margins = useMemo<StabilityMargins | null>(
    () => (bodeData.length > 0 ? stabilityMargins(bodeData) : null),
    [bodeData],
  );

  // 闭环 T(s)=G/(1+G)（单位反馈）阶跃响应，用于开环对比。
  const closedStepData = useMemo(() => {
    try {
      const cl = closedLoopTransfer(numPoly, denPoly);
      return stepResponse(cl.num, cl.den, 12, 400);
    } catch {
      return [] as ReturnType<typeof stepResponse>;
    }
  }, [numPoly, denPoly]);

  // 系统信息
  const sysInfo = useMemo(() => {
    if (!d) return null;
    const leading = denPoly.length - 1;
    const dcDen = denPoly[denPoly.length - 1];
    const dcNum = numPoly[numPoly.length - 1];
    let sysType = 0;
    while (sysType < denPoly.length && denPoly[denPoly.length - 1 - sysType] === 0) sysType++;
    const isStable = d.poles.every((p) => p.re < 0);
    const { omegaN, zeta } = secondOrderMetrics(denPoly);
    return {
      order: leading,
      type: sysType,
      stable: isStable,
      dcGain: dcDen !== 0 ? dcNum / dcDen : undefined,
      omegaN,
      zeta,
    };
  }, [d, denPoly, numPoly]);

  const stableCount = d?.poles.filter((p) => p.re < 0).length ?? 0;

  // 零点（分子根），用于与极点一同展示。
  const zeros = useMemo(() => {
    try { return roots(numPoly); } catch { return []; }
  }, [numPoly]);

  // 阶跃响应性能指标（闭环，仅当无发散 / 数值正常时展示）。
  const closedStep_metrics = useMemo(
    () => (closedStepData.length > 0 ? stepMetrics(closedStepData) : null),
    [closedStepData],
  );

  return (
    <div className="space-y-3">
      {/* 传递函数输入 */}
      <div className="rounded-md border border-border/40 bg-background/30 p-3 space-y-2">
        <div className="text-[10.5px] font-medium text-muted-foreground">
          传递函数 G(s) = N(s) / D(s)（s 为变量）
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className="text-[10px] text-muted-foreground block">
            分子 N(s)
            <Input
              value={num}
              onChange={(e) => setNum(e.target.value)}
              className="mt-0.5 h-8 font-mono text-[12px]"
              placeholder="例：1 或 s+1"
            />
          </label>
          <label className="text-[10px] text-muted-foreground block">
            分母 D(s)
            <Input
              value={den}
              onChange={(e) => setDen(e.target.value)}
              className="mt-0.5 h-8 font-mono text-[12px]"
              placeholder="例：s^2+3s+2"
            />
          </label>
        </div>

        {/* 示例库：一键载入 num + den（下拉整理，不摊开） */}
        <div className="pt-0.5">
          <div className="text-[10px] text-muted-foreground mb-1">示例库</div>
          <div className="flex flex-wrap items-center gap-1.5">
            <select
              value="-1"
              onChange={(e) => {
                const idx = Number(e.target.value);
                if (idx >= 0 && PRESETS[idx]) {
                  setNum(PRESETS[idx].num);
                  setDen(PRESETS[idx].den);
                }
              }}
              className="h-7 flex-1 min-w-[140px] rounded-md border border-border/60 bg-background px-2 text-[11.5px] outline-none"
            >
              <option value="-1">选择系统示例…</option>
              {PRESETS.map((ex, i) => (
                <option key={ex.name} value={i} title={ex.desc}>
                  {ex.name} — {ex.desc}
                </option>
              ))}
            </select>
            {PRESETS.find((ex) => ex.num === num && ex.den === den) && (
              <button
                type="button"
                onClick={() => { setNum(''); setDen(''); }}
                className="h-7 px-2 rounded text-[10px] border border-border/50 text-muted-foreground hover:bg-accent/60"
              >
                清除
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 公式预览 + 系统信息 */}
      {d && (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="rounded-md border border-border/40 bg-background/30 p-2.5">
            <div className="text-[10px] text-muted-foreground mb-1">传递函数</div>
            <div className="overflow-x-auto">
              <FormulaRenderer
                latex={`G(s)=\\frac{${polyToLatex(d.num)}}{${polyToLatex(d.den)}}`}
                displayMode
              />
            </div>
          </div>
          <div className="rounded-md border border-border/40 bg-background/30 p-2.5">
            <div className="text-[10px] text-muted-foreground mb-1.5">系统信息</div>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { label: '阶数', value: String(sysInfo?.order ?? '—') },
                { label: '型别', value: String(sysInfo?.type ?? '—') },
                { label: '直流增益', value: sysInfo?.dcGain === undefined ? '∞' : Number(sysInfo.dcGain).toPrecision(4) },
                { label: '稳定性', value: sysInfo?.stable ? '稳定' : '不稳定', tone: sysInfo?.stable ? 'ok' : 'warn' },
                ...(sysInfo?.omegaN !== undefined ? [{ label: 'ωn', value: Number(sysInfo.omegaN).toPrecision(4) }] : []),
                ...(sysInfo?.zeta !== undefined ? [{ label: 'ζ', value: Number(sysInfo.zeta).toPrecision(4) }] : []),
                ...(margins && margins.pm !== null ? [{ label: '相位裕度 PM', value: `${margins.pm.toFixed(1)}°`, tone: margins.pm > 0 ? ('ok' as const) : ('warn' as const) }] : []),
                ...(margins && margins.gm !== null ? [{ label: '增益裕度 GM', value: `${margins.gm.toFixed(1)} dB`, tone: margins.gm > 0 ? ('ok' as const) : ('warn' as const) }] : []),
              ].map((f) => (
                <div key={f.label} className="rounded border border-border/40 bg-muted/20 px-1.5 py-1">
                  <div className="text-[9px] text-muted-foreground leading-none">{f.label}</div>
                  <div
                    className={cn(
                      'mt-0.5 font-mono text-[11.5px] tabular-nums leading-none',
                      f.tone === 'ok' ? 'text-emerald-400' : f.tone === 'warn' ? 'text-rose-400' : 'text-foreground',
                    )}
                  >
                    {f.value}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 极点 / 零点信息 */}
      {d && (
        <div className="rounded-md border border-border/40 bg-background/30 p-2 text-[11px]">
          <div>
            <span className="text-muted-foreground">
              极点（{stableCount}/{d.poles.length} 个稳定）：
            </span>
            {d.poles.map((p, i) => {
              const stable = p.re < 0;
              return (
                <span key={i} className={cn('font-mono mr-2', stable ? 'text-emerald-400' : 'text-rose-400')}>
                  {p.re.toFixed(3)}
                  {p.im >= 0 ? '+' : ''}
                  {p.im.toFixed(3)}i{stable ? '（稳定）' : '（不稳定）'}
                </span>
              );
            })}
          </div>
          {zeros.length > 0 && (
            <div className="mt-1">
              <span className="text-muted-foreground">零点：</span>
              {zeros.map((z, i) => (
                <span key={i} className="font-mono text-sky-400 mr-2">
                  {z.re.toFixed(3)}
                  {z.im >= 0 ? '+' : ''}
                  {z.im.toFixed(3)}i
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 切换 */}
      <div className="flex flex-wrap gap-1">
        {TABS.map((tb) => (
          <button
            key={tb.id}
            onClick={() => setTab(tb.id)}
            className={cn(
              'h-7 px-3 rounded-md text-[11.5px] border transition-colors',
              tab === tb.id
                ? 'border-primary/50 bg-primary/10 text-primary'
                : 'border-border/50 text-muted-foreground hover:bg-accent/60',
            )}
          >
            {tb.label}
          </button>
        ))}
      </div>

      {/* 图表区 */}
      <div className="space-y-2">
        {tab === 'bode' && (
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            <div>
              <div className="mb-1 flex items-center justify-between text-[10.5px] text-muted-foreground">
                <span>幅值（dB）</span>
                <span className="text-[9.5px] opacity-70">频率 f（Hz，对数刻度）</span>
              </div>
              <StatsChart
                compute={() => bodeData}
                draw={(ctx, view, size, data) => renderBodeMag(ctx, view, size, data, margins ?? undefined)}
                autoView={(pts) =>
                  autoViewOf(pts.map((p) => ({ x: Math.log10(p.f), y: p.db })))
                }
                tooltip={(w) => `f=${Math.pow(10, w.x).toPrecision(3)} Hz  dB=${w.y.toFixed(2)}`}
                minHeight={300}
              />
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between text-[10.5px] text-muted-foreground">
                <span>相位（度）</span>
                <span className="text-[9.5px] opacity-70">频率 f（Hz，对数刻度）</span>
              </div>
              <StatsChart
                compute={() => bodeData}
                draw={(ctx, view, size, data) => renderBodePhase(ctx, view, size, data, margins ?? undefined)}
                autoView={(pts) => autoViewOf(pts.map((p) => ({ x: Math.log10(p.f), y: p.phaseDeg })))}
                tooltip={(w) => `f=${Math.pow(10, w.x).toPrecision(3)} Hz  φ=${w.y.toFixed(1)}°`}
                minHeight={300}
              />
            </div>
          </div>
        )}

        {tab === 'step' && (
          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="text-[10.5px] text-muted-foreground">单位阶跃响应</span>
              <button
                type="button"
                onClick={() => setShowClosedLoop((v) => !v)}
                className={cn(
                  'h-5 px-1.5 rounded text-[10px] border transition-colors',
                  showClosedLoop
                    ? 'border-pink-500/50 bg-pink-500/10 text-pink-500'
                    : 'border-border/50 text-muted-foreground hover:bg-accent/60',
                )}
                title="叠加闭环 T(s)=G/(1+G) 响应对比"
              >
                {showClosedLoop ? '开环 + 闭环' : '仅开环'}
              </button>
            </div>
            {showClosedLoop ? (
              <StatsChart
                compute={() => ({ open: stepData, closed: closedStepData })}
                draw={renderStepBoth}
                autoView={(data) =>
                  autoViewOf([
                    ...data.open.map((p) => ({ x: p.t, y: p.y })),
                    ...data.closed.map((p) => ({ x: p.t, y: p.y })),
                  ])
                }
                tooltip={(w) => `t=${w.x.toFixed(2)}  y=${w.y.toFixed(3)}`}
                minHeight={300}
              />
            ) : (
              <StatsChart
                compute={() => stepData}
                draw={renderStep}
                autoView={(pts) => autoViewOf(pts.map((p) => ({ x: p.t, y: p.y })))}
                tooltip={(w) => `t=${w.x.toFixed(2)}  y=${w.y.toFixed(3)}`}
                minHeight={300}
              />
            )}
            {/* 性能指标条：开环 / 闭环 */}
            <div className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <MetricCard label="超调量" value={closedStep_metrics ? `${closedStep_metrics.overshootPct.toFixed(1)}%` : '—'} tone={closedStep_metrics && closedStep_metrics.overshootPct > 0 ? 'warn' : 'ok'} />
              <MetricCard label="调节时间 (2%)" value={closedStep_metrics ? `${closedStep_metrics.settlingTime.toFixed(2)}s` : '—'} />
              <MetricCard label="上升时间 (10→90%)" value={closedStep_metrics ? `${closedStep_metrics.riseTime.toFixed(2)}s` : '—'} />
              <MetricCard label="闭环稳态值" value={closedStep_metrics ? `${closedStep_metrics.finalValue.toFixed(3)}` : '—'} />
            </div>
          </div>
        )}

        {tab === 'rlocus' && (
          <div>
            <div className="mb-1 flex items-center justify-between text-[10.5px] text-muted-foreground">
              <span>根轨迹（K∈[0.01,100]）</span>
              <span className="text-[9.5px] opacity-70">Re — 实部 / Im — 虚部</span>
            </div>
            <StatsChart
              compute={() => rlocusData}
              draw={(ctx, view, size, pts) => renderRlocus(ctx, view, size, pts, d?.poles, zeros)}
              autoView={(pts: RlocusPoint[]) => {
                const all: { x: number; y: number }[] = [];
                for (const p of pts) for (const z of p.roots) all.push({ x: z.re, y: z.im });
                return autoViewOf(all, 0.15);
              }}
              tooltip={(w) => `Re=${w.x.toFixed(3)}  Im=${w.y.toFixed(3)}`}
              minHeight={320}
            />
          </div>
        )}

        {tab === 'nyquist' && (
          <div>
            <div className="mb-1 flex items-center justify-between text-[10.5px] text-muted-foreground">
              <span>奈奎斯特曲线（ω 从 0→∞）</span>
              <span className="text-[9.5px] opacity-70">-1 点为稳定性判据参考</span>
            </div>
            <StatsChart
              compute={() => nyquistData}
              draw={renderNyquist}
              autoView={(pts: NyquistPoint[]) =>
                autoViewOf(pts.map((p) => ({ x: p.re, y: p.im })), 0.15)
              }
              tooltip={(w) => `Re=${w.x.toFixed(3)}  Im=${w.y.toFixed(3)}`}
              minHeight={320}
            />
          </div>
        )}

        {tab === 'pid' && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] text-muted-foreground">整定方法</span>
              {(['p', 'pi', 'pid'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setPidMethod(m)}
                  className={cn(
                    'h-6 px-2.5 rounded text-[10.5px] border transition-colors',
                    pidMethod === m
                      ? 'border-primary/50 bg-primary/10 text-primary'
                      : 'border-border/50 text-muted-foreground hover:bg-accent/60',
                  )}
                >
                  {m.toUpperCase()}
                </button>
              ))}
            </div>
            {('error' in pidResult) ? (
              <div className="rounded-md border border-rose-500/40 bg-rose-500/10 p-2.5 text-[11.5px] text-rose-600 dark:text-rose-300">
                {pidResult.error}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    ['Kp', pidResult.gains.Kp],
                    ['Ki', pidResult.gains.Ki],
                    ['Kd', pidResult.gains.Kd],
                  ].map(([lbl, v]) => (
                    <div key={lbl} className="rounded-md border border-border/40 bg-muted/30 px-2 py-1.5 text-center">
                      <div className="text-[9.5px] text-muted-foreground">{lbl}</div>
                      <div className="font-mono text-[12px] text-primary tabular-nums">{Number(v).toPrecision(4)}</div>
                    </div>
                  ))}
                </div>
                <div>
                  <div className="mb-1 text-[10.5px] text-muted-foreground">闭环阶跃响应（{pidMethod.toUpperCase()} 整定后）</div>
                  <StatsChart
                    compute={() => pidResult.step}
                    draw={renderStep}
                    autoView={(pts) => autoViewOf(pts.map((p) => ({ x: p.t, y: p.y })))}
                    tooltip={(w) => `t=${w.x.toFixed(2)}  y=${w.y.toFixed(3)}`}
                    minHeight={280}
                  />
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}