/**
 * OmniMath Pro — 2D plot sampling & helpers
 *
 * Pure math utilities consumed by the 2D plot components
 * (Plot2DCanvas / Plot2DPanel / PlotExpandDialog). No React, no DOM —
 * safe to call from any context.
 *
 * Public surface:
 *   - PlotSample            — a single sampled point { x, y } (NaN = gap)
 *   - niceNumber(range, n)  — "nice" tick step + tick values for a range
 *   - formatCoord(x, y)     — human-readable "(x, y)" coordinate string
 *   - autoYRange(samples)   — auto-computed Y range with padding (legacy)
 *   - smartYRange(...)      — quantile-based smart Y range (P5/P95)
 *   - coordinatedYRange(..) — multi-curve coordinated Y range w/ outlier detection
 *   - sampleFunction(...)   — sample y = f(x) (cartesian / polar / parametric)
 *   - samplePolar(...)      — sample r = f(θ) over an explicit θ range
 *   - sampleParametric(...) — sample x = f(t), y = g(t) over a t range
 *   - sampleCurve(...)      — dispatch on a Curve2DSpec (mode + exprs + range)
 *   - findExtrema(samples)  — local maxima, minima, and zero crossings
 *
 * Evaluation uses the shared configured mathjs instance and merges the
 * live user scope, so plots see console variables (`a = 3` →
 * `plot(sin(a*x))` works) and the log/ln semantics match the console.
 */

import { getEvalScope } from '@/lib/engine/mathInstance';
import { compileCached } from '@/lib/engine/compileCache';

// Re-export the smart-range algorithm so callers can import everything
// from a single module (`@/lib/plots/plot2d`).
export {
  smartYRange,
  coordinatedYRange,
  isOutlierCurve,
  type SmartRangeOptions,
  type CoordinatedRangeResult,
} from './smartRange';

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

/**
 * A single sampled point on a curve.
 *
 * `x` is the parameter value (cartesian x, polar θ, or parametric t),
 * `y` is the plotted ordinate. When either coordinate is `NaN` the
 * renderer treats it as a discontinuity (pen-up / gap) — used for
 * asymptotes (tan x) and evaluation failures.
 */
export interface PlotSample {
  x: number;
  y: number;
}

/** Supported 2D plot modes. */
export type Plot2DType = 'cartesian' | 'polar' | 'parametric';

/** Default θ range for polar plots (one full revolution). */
export const DEFAULT_POLAR_THETA_RANGE: [number, number] = [0, Math.PI * 2];

/** Default t range for parametric plots. */
export const DEFAULT_PARAMETRIC_T_RANGE: [number, number] = [-10, 10];

/**
 * Module-level default sample count for 2D curve sampling.
 *
 * Pure library file (no React) so it cannot read the settingsStore directly.
 * Workbench mounts a `useEffect` that calls `setDefaultSampleCount(...)` with
 * the value of `advancedPlotSamples` whenever that setting changes, keeping
 * the sampling density in sync with the user's "高级 → 2D 曲线采样点数".
 */
let defaultSampleCount = 800;

/** Update the module-level default sample count used by `sampleFunction` /
 * `samplePolar` / `sampleParametric` / `sampleCurve` when no explicit count
 * is passed. Called from a React effect in Workbench. */
export function setDefaultSampleCount(n: number): void {
  if (!Number.isFinite(n)) return;
  defaultSampleCount = Math.max(2, Math.min(2000, Math.round(n)));
}

/**
 * Canvas padding (screen pixels) shared between Plot2DCanvas and RegionZoom
 * so the screen→world coordinate transform is identical in both. Previously
 * each file hard-coded its own copy, which silently drifted.
 */
export const PLOT_PADDING = { left: 48, right: 16, top: 16, bottom: 32 } as const;

/**
 * Canvas 文字统一 UI 字体栈，与 globals.css 的 --font-sans 保持一致。
 * 中文回退紧跟 Inter，避免界面文字与刻度标注之间出现字体 fallback 抖动。
 * 所有 canvas 刻度、交点标签、坐标标注、轴标签均通过该常量组合 ctx.font。
 * 导出供 Plot2DCanvas / FacetGrid 等共享，避免切换模式时刻度字体跳变。
 */
export const PLOT_FONT_FAMILY =
  'Inter, "Noto Sans SC", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", ui-sans-serif, system-ui, sans-serif';

/**
 * 数据读出（tooltip）用的等宽字体栈，与 globals.css 的 --font-mono 一致，
 * 保证悬浮读数中的坐标数字按列对齐。
 */
export const PLOT_MONO_FAMILY =
  '"JetBrains Mono", "SF Mono", "Fira Code", "Cascadia Code", "Roboto Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

/**
 * A fully-resolved 2D curve description: which mode to sample in, the
 * expression(s), and the parameter range for non-cartesian modes.
 *
 * `xRange` (the view window) is NOT part of the spec — cartesian curves
 * re-sample over whatever window is visible, while polar / parametric
 * curves are fully determined by their own parameter range and stay
 * stable under pan & zoom.
 */
export interface Curve2DSpec {
  mode: Plot2DType;
  /** Cartesian y = f(x), polar r = f(θ), or parametric x = f(t). */
  exprX: string;
  /** Parametric y = g(t). Only used when `mode === 'parametric'`. */
  exprY: string;
  /** θ range (polar) / t range (parametric). Ignored for cartesian. */
  paramRange: [number, number];
  /** 可选：用表达式（可含变量，如 `t`、`2*pi`）覆盖 paramRange 的端点。
   *  采样时对实时 scope 求值，变量变化（如滑块调 t）会自动重新采样。
   *  为空 / 非法时回退到 paramRange 的对应数字。 */
  paramMinExpr?: string;
  paramMaxExpr?: string;
}

/**
 * 解析曲线参数范围的端点，支持表达式覆盖。
 * 每个端点：若提供了 `param*Expr` 且能对实时 scope 求值得到有限数，则用之；
 * 否则回退到 `paramRange` 里对应的数字。
 */
export function resolveParamRange(spec: Curve2DSpec): [number, number] {
  const [a, b] = spec.paramRange;
  const evalEndpoint = (expr: string | undefined, fallback: number): number => {
    if (!expr || !expr.trim()) return fallback;
    const compiled = safeCompile(expr);
    if (!compiled) return fallback;
    // 用「实时作用域 + 仅在未定义时补默认」求值：若用户通过滑块把 t 设为某值
    // （如 θ 上限 = t），这里应取真实的 t，而不是被 0 覆盖。x/θ 同理。
    const base = getEvalScope();
    const scope = {
      ...base,
      t: base.t ?? 0,
      x: base.x ?? 0,
      theta: base.theta ?? 0,
      θ: base.θ ?? 0,
    };
    const v = evalNum(compiled, scope);
    return Number.isFinite(v) ? v : fallback;
  };
  return [evalEndpoint(spec.paramMinExpr, a), evalEndpoint(spec.paramMaxExpr, b)];
}

/* ------------------------------------------------------------------ */
/*  Numeric helpers                                                   */
/* ------------------------------------------------------------------ */

/**
 * Compute a "nice" tick step (1 / 2 / 5 × 10^n) for the given range and
 * approximate tick count, plus the list of tick values that fall inside
 * the range (inclusive).
 *
 * Used by the grid + axis renderer: `niceNumber(vx, 10)` returns the
 * major tick step and tick positions for the X axis.
 *
 * The step is chosen so that the number of ticks is close to
 * `targetTickCount` but never exceeds ~10, preventing overly dense grids
 * (e.g. 0.1-unit ticks) that make the graph look blurry.
 */
export function niceNumber(
  range: [number, number],
  targetTickCount: number,
): { tickStep: number; ticks: number[] } {
  const [lo, hi] = range;
  const span = hi - lo;
  if (!Number.isFinite(span) || span <= 0) {
    return { tickStep: 1, ticks: [0] };
  }

  const target = Math.max(2, Math.floor(targetTickCount));
  const roughStep = span / target;
  const exponent = Math.floor(Math.log10(roughStep));
  const fraction = roughStep / Math.pow(10, exponent);

  let normalizedStep: number;
  if (fraction <= 1) normalizedStep = 1;
  else if (fraction <= 2) normalizedStep = 2;
  else if (fraction <= 5) normalizedStep = 5;
  else normalizedStep = 10;

  let step = normalizedStep * Math.pow(10, exponent);

  // Hard cap to avoid dense/blurry ticks (e.g. 0.1-unit grids).
  while (span / step > 10) {
    if (normalizedStep === 1) normalizedStep = 2;
    else if (normalizedStep === 2) normalizedStep = 5;
    else normalizedStep = 10;
    step = normalizedStep * Math.pow(10, exponent);
  }

  const ticks: number[] = [];
  const start = Math.ceil((lo - 1e-12) / step) * step;
  for (let v = start; v <= hi + step * 1e-12; v += step) {
    const snapped = Math.round(v / step) * step;
    if (snapped >= lo - 1e-12 && snapped <= hi + 1e-12) {
      ticks.push(snapped);
    }
  }
  return { tickStep: step, ticks };
}

/**
 * Format a coordinate pair for display in tooltips / readouts.
 *
 * Handles very small / large numbers (scientific notation), trims
 * trailing zeros, and returns "—" for non-finite values.
 */
export function formatCoord(x: number, y: number): string {
  return `(${fmt(x)}, ${fmt(y)})`;
}

/** Format a single number compactly for coordinate display. */
function fmt(v: number): string {
  if (!Number.isFinite(v)) return '—';
  if (v === 0) return '0';
  const abs = Math.abs(v);
  if (abs >= 1e5 || abs < 1e-3) {
    return v.toExponential(2).replace('e+', 'e').replace('e-0', 'e-');
  }
  const s = v.toFixed(3);
  return parseFloat(s).toString();
}

/**
 * Auto-compute a Y range from sampled points with 10% padding on each
 * side. Returns a sensible default `[-6, 6]` when no finite samples
 * exist, and gives a flat line some breathing room.
 */
export function autoYRange(samples: PlotSample[]): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (const s of samples) {
    if (Number.isFinite(s.y)) {
      if (s.y < min) min = s.y;
      if (s.y > max) max = s.y;
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return [-6, 6];
  }
  if (min === max) {
    const pad = Math.max(1, Math.abs(min) * 0.1);
    return [min - pad, max + pad];
  }
  const pad = (max - min) * 0.1;
  return [min - pad, max + pad];
}

/* ------------------------------------------------------------------ */
/*  Sampling                                                          */
/* ------------------------------------------------------------------ */

/**
 * Sample a math expression across a range.
 *
 * @param expr     Math expression (mathjs syntax). `x` is the variable
 *                 for cartesian & polar; `t` (or `x`) for parametric.
 * @param xRange   The parameter range `[lo, hi]`.
 * @param plotType `'cartesian'` (y = f(x)), `'polar'` (r = f(θ), θ = x,
 *                 plotted as (r·cos θ, r·sin θ)), or `'parametric'`
 *                 (expression evaluates to `[x, y]` for each t).
 * @param count    Number of sample points (clamped to [2, 2000]).
 * @returns        Array of `{ x, y }` samples. Points where evaluation
 *                 fails or yields a non-real value get `NaN` (rendered
 *                 as gaps). Returns `[]` if the expression won't compile.
 */
export function sampleFunction(
  expr: string,
  xRange: [number, number],
  plotType: Plot2DType = 'cartesian',
  count = defaultSampleCount,
): PlotSample[] {
  if (!expr || !expr.trim()) return [];
  // Defensive: reject malformed ranges so downstream code never hits a
  // TypeError by destructuring null/undefined or looping NaN spans.
  if (
    !Array.isArray(xRange) || xRange.length !== 2 ||
    !Number.isFinite(xRange[0]) || !Number.isFinite(xRange[1]) ||
    xRange[0] === xRange[1]
  ) {
    return [];
  }
  // Compile via the LRU cache: re-sampling the same expression (slider
  // drags, scope changes) reuses the parsed expression instead of
  // re-parsing on every call.
  let compiled: { evaluate: (scope?: Record<string, unknown>) => unknown };
  try {
    compiled = compileCached(expr);
  } catch {
    return [];
  }

  const [lo, hi] = xRange;
  const n = Math.max(2, Math.min(2000, Math.floor(count)));
  const samples: PlotSample[] = new Array(n);

  // 复用同一个求值作用域（而不是每个采样点都 getEvalScope 复制整个 scope）。
  // scope 的复制是采样阶段的最大 CPU 开销（拖动滑块时每帧 800~2000 次），
  // 改为一次复制 + 原位改写参数，动画可逼近 Desmos 的流畅度。
  const scope = getEvalScope();

  for (let i = 0; i < n; i++) {
    const t = lo + ((hi - lo) * i) / (n - 1);
    let xVal: number;
    let yVal: number;
    try {
      if (plotType === 'polar') {
        // r = f(θ), θ = x. Convert to cartesian for rendering.
        scope.x = t; scope.t = t;
        const r = toNumber(compiled.evaluate(scope));
        xVal = r * Math.cos(t);
        yVal = r * Math.sin(t);
      } else if (plotType === 'parametric') {
        // Expression should evaluate to [x(t), y(t)].
        scope.t = t; scope.x = t;
        const v = compiled.evaluate(scope);
        if (Array.isArray(v) && v.length >= 2) {
          xVal = toNumber(v[0]);
          yVal = toNumber(v[1]);
        } else {
          xVal = NaN;
          yVal = NaN;
        }
      } else {
        // cartesian: y = f(x)
        xVal = t;
        scope.x = t;
        yVal = toNumber(compiled.evaluate(scope));
      }
    } catch {
      xVal = NaN;
      yVal = NaN;
    }
    samples[i] = { x: xVal, y: yVal };
  }

  // Post-process: detect asymptote-like discontinuities (e.g. tan x near
  // π/2) where a finite-but-huge value sits between two opposite-sign
  // neighbors, and convert them to NaN gaps so the polyline lifts the pen.
  if (plotType === 'cartesian') {
    for (let i = 1; i < n - 1; i++) {
      const prev = samples[i - 1].y;
      const cur = samples[i].y;
      const next = samples[i + 1].y;
      if (!Number.isFinite(prev) || !Number.isFinite(cur) || !Number.isFinite(next)) continue;
      const signFlip = Math.sign(prev) !== Math.sign(next) && prev !== 0 && next !== 0;
      const hugeCur = Math.abs(cur) > Math.abs(prev) * 5 && Math.abs(cur) > Math.abs(next) * 5;
      if (signFlip && hugeCur) {
        samples[i].y = NaN;
      }
    }
  }

  return samples;
}

/**
 * Sample a polar curve r = f(θ) over an explicit θ range.
 *
 * The expression may reference `x`, `t`, or `theta` — all three are bound
 * to the current θ, matching the engine's `polar(...)` / `polarplot(...)`
 * conventions. Each sample is converted to cartesian
 * `(r·cos θ, r·sin θ)` for rendering.
 *
 * Samples are returned in PARAMETER ORDER (θ ascending) and never
 * re-sorted by x — the renderer connects them as a polyline, so sorting
 * would scramble closed curves (e.g. a circle). Points where evaluation
 * fails or yields a non-real / non-finite value become `{ NaN, NaN }`,
 * which the renderer draws as a pen-up gap (same convention as
 * `sampleFunction`).
 *
 * @param expr     r(θ) expression (mathjs syntax).
 * @param thetaMin θ range lower bound.
 * @param thetaMax θ range upper bound.
 * @param count    Number of sample points (clamped to [2, 2000]).
 * @returns        Array of `{ x, y }` samples, or `[]` when the range is
 *                 malformed or the expression won't compile.
 */
export function samplePolar(
  expr: string,
  thetaMin: number,
  thetaMax: number,
  count = defaultSampleCount,
): PlotSample[] {
  if (!expr || !expr.trim()) return [];
  if (
    !Number.isFinite(thetaMin) || !Number.isFinite(thetaMax) ||
    thetaMin === thetaMax
  ) {
    return [];
  }
  let compiled: { evaluate: (scope?: Record<string, unknown>) => unknown };
  try {
    compiled = compileCached(expr);
  } catch {
    return [];
  }

  const n = Math.max(2, Math.min(2000, Math.floor(count)));
  const samples: PlotSample[] = new Array(n);
  const scope = getEvalScope();
  for (let i = 0; i < n; i++) {
    const theta = thetaMin + ((thetaMax - thetaMin) * i) / (n - 1);
    let xVal: number;
    let yVal: number;
    try {
      // Bind both `theta` and the unicode `θ` (normalizeSymbols turns the
      // latin `theta` into `θ` for display, so the stored expression may
      // reference either spelling).
      scope.x = theta; scope.t = theta; scope.theta = theta; scope.θ = theta;
      const r = toNumber(compiled.evaluate(scope));
      xVal = r * Math.cos(theta);
      yVal = r * Math.sin(theta);
    } catch {
      xVal = NaN;
      yVal = NaN;
    }
    samples[i] = { x: xVal, y: yVal };
  }
  return samples;
}

/**
 * Sample a parametric curve x = f(t), y = g(t) over an explicit t range.
 *
 * Both expressions may reference `t` (and `x`, bound to t, for parity
 * with the engine's simple-mode conventions). Unlike the legacy
 * `'parametric'` branch of `sampleFunction` (which expects ONE expression
 * evaluating to a `[x, y]` vector), this takes the two component
 * expressions separately — sidestepping the mathjs Matrix-vs-Array
 * pitfall entirely.
 *
 * Samples are returned in PARAMETER ORDER (t ascending) and never
 * re-sorted by x, so closed / self-intersecting curves (circles,
 * Lissajous figures) render correctly. A point becomes `{ NaN, NaN }`
 * (pen-up gap) when either component fails to evaluate or yields a
 * non-real value — e.g. the t = 0 sample of `x = 1/t`.
 *
 * @param exprX x(t) expression (mathjs syntax).
 * @param exprY y(t) expression (mathjs syntax).
 * @param tMin  t range lower bound.
 * @param tMax  t range upper bound.
 * @param count Number of sample points (clamped to [2, 2000]).
 * @returns     Array of `{ x, y }` samples, or `[]` when the range is
 *              malformed or either expression won't compile.
 */
export function sampleParametric(
  exprX: string,
  exprY: string,
  tMin: number,
  tMax: number,
  count = defaultSampleCount,
): PlotSample[] {
  if (!exprX || !exprX.trim() || !exprY || !exprY.trim()) return [];
  if (
    !Number.isFinite(tMin) || !Number.isFinite(tMax) ||
    tMin === tMax
  ) {
    return [];
  }
  let compiledX: { evaluate: (scope?: Record<string, unknown>) => unknown };
  let compiledY: { evaluate: (scope?: Record<string, unknown>) => unknown };
  try {
    compiledX = compileCached(exprX);
    compiledY = compileCached(exprY);
  } catch {
    return [];
  }

  const n = Math.max(2, Math.min(2000, Math.floor(count)));
  const samples: PlotSample[] = new Array(n);
  const scope = getEvalScope();
  for (let i = 0; i < n; i++) {
    const t = tMin + ((tMax - tMin) * i) / (n - 1);
    let xVal: number;
    let yVal: number;
    try {
      scope.t = t; scope.x = t;
      xVal = toNumber(compiledX.evaluate(scope));
      yVal = toNumber(compiledY.evaluate(scope));
    } catch {
      xVal = NaN;
      yVal = NaN;
    }
    samples[i] = { x: xVal, y: yVal };
  }
  return samples;
}

/**
 * Sample a fully-resolved curve spec.
 *
 * - cartesian  → adaptive recursive sampling (`sampleAdaptive`) over the
 *                 view-following window, then universal break detection;
 * - polar      → adaptive parametric sampling (`sampleParametricAdaptive`)
 *                 with r = f(θ) → (r·cos θ, r·sin θ), stable under pan/zoom;
 * - parametric → adaptive parametric sampling (`sampleParametricAdaptive`)
 *                 over x = f(t), y = g(t).
 *
 * All branches keep their natural order (x ascending for cartesian, t/θ
 * ascending for polar/parametric) so closed / self-intersecting curves
 * render correctly.
 */
export function sampleCurve(
  spec: Curve2DSpec,
  xRange: [number, number],
  count = defaultSampleCount,
): PlotSample[] {
  const opts: AdaptiveOptions = {
    // Map the user-facing sample count onto the adaptive budget: the coarse
    // grid is a fraction of `count`, and the recursion is capped so the total
    // never explodes on high-frequency curves.
    initSegments: Math.max(16, Math.min(256, Math.round(count / 8))),
    maxPoints: Math.max(1024, Math.min(4000, count * 4)),
  };
  if (spec.mode === 'polar') {
    const compiledX = safeCompile(spec.exprX);
    if (!compiledX) return [];
    const range = resolveParamRange(spec);
    const scope = getEvalScope();
    const bind = (t: number): void => {
      scope.x = t; scope.t = t; scope.theta = t; scope.θ = t;
    };
    const px = (t: number): number => {
      bind(t);
      const r = evalNum(compiledX, scope);
      return r * Math.cos(t);
    };
    const py = (t: number): number => {
      bind(t);
      const r = evalNum(compiledX, scope);
      return r * Math.sin(t);
    };
    return sampleParametricAdaptive(px, py, range, opts);
  }
  if (spec.mode === 'parametric') {
    const compiledX = safeCompile(spec.exprX);
    const compiledY = safeCompile(spec.exprY);
    if (!compiledX || !compiledY) return [];
    const range = resolveParamRange(spec);
    const scope = getEvalScope();
    const px = (t: number): number => { scope.t = t; scope.x = t; return evalNum(compiledX, scope); };
    const py = (t: number): number => { scope.t = t; scope.x = t; return evalNum(compiledY, scope); };
    return sampleParametricAdaptive(px, py, range, opts);
  }
  // cartesian
  const samples = sampleAdaptive(spec.exprX, xRange, opts);
  return detectBreaks(samples);
}

/** Compile via the LRU cache, returning null on parse failure. */
function safeCompile(
  expr: string,
): { evaluate: (scope?: Record<string, unknown>) => unknown } | null {
  if (!expr || !expr.trim()) return null;
  try {
    return compileCached(expr);
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Adaptive sampling & break detection                               */
/* ------------------------------------------------------------------ */

/** Options for adaptive sampling (`sampleAdaptive` / `sampleParametricAdaptive`). */
export interface AdaptiveOptions {
  /** Maximum recursion depth per initial segment. Default 14. */
  maxDepth?: number;
  /** Number of initial coarse segments. Default 64. */
  initSegments?: number;
  /**
   * Deviation tolerance, in the curve's own units:
   *  - cartesian: midpoint-to-chord |y| deviation on y = f(x);
   *  - parametric/polar: midpoint-to-chord euclidean distance.
   * A segment is split while its sampled midpoint deviates more than this.
   * Default 1e-3.
   */
  tol?: number;
  /** Hard cap on output points. Default 4000. */
  maxPoints?: number;
  /** Screen-space scale (world units per pixel) for tol interpretation. */
  screenspaceScaler?: number;
}

/** Evaluate a cartesian expression to a number, or NaN on any failure. */
function evalNum(compiled: { evaluate: (scope?: Record<string, unknown>) => unknown }, scope: Record<string, unknown>): number {
  try {
    return toNumber(compiled.evaluate(scope));
  } catch {
    return NaN;
  }
}

/**
 * Adaptive (recursive subdivison) sampling for a cartesian curve y = f(x).
 *
 * Replaces blind uniform sampling: starts from a sparse grid and bisects
 * any segment whose midpoint deviates from the chord by more than `tol`,
 * down to `maxDepth`. This concentrates points where the curve is curvy
 * (`sin(1/x)`, steep `1/x`) and thins out where it is flat — without
 * wasting points or dropping peaks.
 *
 * **Inline asymptote detection** — a robust, budget-independent break:
 * once the global |y| scale is known (from a coarse pre-scan), a segment
 * whose endpoints have *opposite signs and both exceed half the global
 * maximum magnitude* is treated as a vertical wall (e.g. `tan` at π/2,
 * `1/x` at 0). The pen is lifted there (a `NaN` gap) instead of spending
 * budget subdividing the unbounded approach. This distinguishes a genuine
 * asymptote from a legitimate zero crossing (small-magnitude sign flip)
 * and from a steep-but-smooth line (`y = 1000x` — sign flip only at the
 * origin, where both values are small).
 *
 * Non-finite values (NaN / ±Infinity) also break the pen. `maxDepth` +
 * `maxPoints` double-guard against pathological inputs.
 */
export function sampleAdaptive(
  expr: string,
  xRange: [number, number],
  opts: AdaptiveOptions = {},
): PlotSample[] {
  if (!expr || !expr.trim()) return [];
  if (
    !Array.isArray(xRange) || xRange.length !== 2 ||
    !Number.isFinite(xRange[0]) || !Number.isFinite(xRange[1]) ||
    xRange[0] === xRange[1]
  ) {
    return [];
  }

  let compiled: { evaluate: (scope?: Record<string, unknown>) => unknown };
  try {
    compiled = compileCached(expr);
  } catch {
    return [];
  }

  const { maxDepth = 14, initSegments = 64, tol = 1e-3, maxPoints = 4000 } = opts;
  const [lo, hi] = xRange;
  const segs = Math.max(1, Math.min(initSegments, 4096));
  const dx = (hi - lo) / segs;

  const scope = getEvalScope();
  const f = (x: number): number => {
    scope.x = x;
    return evalNum(compiled, scope);
  };
  // Cached f values so we don't re-evaluate segment endpoints.
  const cache = new Map<number, number>();
  const ev = (x: number): number => {
    if (!cache.has(x)) cache.set(x, f(x));
    return cache.get(x)!;
  };

  // Coarse pre-scan to establish the function's typical |y| scale. This is
  // the reference for the inline asymptote test below and for the relative
  // subdivision tolerance (an absolute 1e-3 over a wide-y-range function such
  // as `tan` would exhaust the point budget on smooth regions before ever
  // reaching the asymptote wall).
  let maxAbs = 1;
  for (let i = 0; i <= segs; i++) {
    const y = ev(lo + i * dx);
    if (Number.isFinite(y)) maxAbs = Math.max(maxAbs, Math.abs(y));
  }
  const scale = Math.max(1, maxAbs);
  const effectiveTol = tol * scale;
  const wallThreshold = 0.5 * maxAbs;

  const out: PlotSample[] = [];
  const result = new Set<number>();

  // `push` records a real (finite) point; `pushGap` records a pen-up marker
  // that is exempt from the x-dedup set so it always survives to the output.
  const push = (x: number): void => {
    if (result.has(x) || out.length >= maxPoints) return;
    result.add(x);
    out.push({ x, y: ev(x) });
  };
  const pushGap = (x: number): void => {
    if (out.length >= maxPoints) return;
    out.push({ x, y: NaN });
  };

  const stack: Array<{ a: number; b: number; depth: number }> = [];
  for (let i = 0; i < segs; i++) stack.push({ a: lo + i * dx, b: lo + (i + 1) * dx, depth: 0 });

  while (stack.length) {
    const { a, b, depth } = stack.pop()!;
    const mid = (a + b) / 2;
    const fa = ev(a);
    const fb = ev(b);
    const fm = ev(mid);

    // Break detection: any non-finite value → lift the pen across this gap.
    if (!Number.isFinite(fa) || !Number.isFinite(fb) || !Number.isFinite(fm)) {
      push(a);
      push(b);
      continue;
    }

    // Inline asymptote detection: opposite-signed endpoints that are BOTH
    // large relative to the global scale → vertical wall. Lift the pen and
    // stop subdividing so the budget isn't wasted on the unbounded approach.
    if (fa * fb < 0 && Math.abs(fa) > wallThreshold && Math.abs(fb) > wallThreshold) {
      push(a);
      pushGap(b);
      continue;
    }

    // Midpoint-to-chord deviation (relative tolerance).
    const deviation = Math.abs(fm - (fa + fb) / 2);
    if (deviation > effectiveTol && depth < maxDepth && out.length < maxPoints) {
      stack.push({ a, b: mid, depth: depth + 1 });
      stack.push({ a: mid, b, depth: depth + 1 });
    } else {
      push(a);
      push(mid);
      push(b);
    }
  }

  // Cartesian: sort by x (NaN gap markers carry a finite x and sort with
  // the rest), then collapse consecutive real points that share an x. A NaN
  // gap is always kept even when it shares an x with a real point (pen-up),
  // and a real point following a gap is kept too (pen-down).
  out.sort((p, q) => p.x - q.x);
  if (out.length > 1) {
    const deduped: PlotSample[] = [out[0]];
    for (let i = 1; i < out.length; i++) {
      const prev = deduped[deduped.length - 1];
      const sameX = out[i].x === prev.x;
      if (!sameX || !Number.isFinite(out[i].y) || !Number.isFinite(prev.y)) {
        deduped.push(out[i]);
      }
    }
    return deduped;
  }
  return out;
}

/**
 * Adaptive sampling for a parametric curve x = f(t), y = g(t) or a polar
 * curve r = f(θ) (pass `toXY` to build the cartesian point from the param).
 *
 * Unlike the cartesian version, the parameter `t`/`θ` need not be monotone
 * in x, so subdivision is driven by the euclidean distance from the midpoint
 * point to the chord between the two endpoints. Points are returned in
 * parameter order (never re-sorted), preserving closed curves.
 *
 * @param px  x (or r·cos θ) component evaluator.
 * @param py  y (or r·sin θ) component evaluator.
 */
export function sampleParametricAdaptive(
  px: (t: number) => number,
  py: (t: number) => number,
  tRange: [number, number],
  opts: AdaptiveOptions = {},
): PlotSample[] {
  if (
    !Array.isArray(tRange) || tRange.length !== 2 ||
    !Number.isFinite(tRange[0]) || !Number.isFinite(tRange[1]) ||
    tRange[0] === tRange[1]
  ) {
    return [];
  }
  const { maxDepth = 14, initSegments = 96, tol = 1e-3, maxPoints = 4000, screenspaceScaler = 1 } = opts;
  const effTol = tol / Math.max(1e-12, screenspaceScaler);
  const [lo, hi] = tRange;
  const segs = Math.max(1, Math.min(initSegments, 4096));
  const dt = (hi - lo) / segs;

  const pt = (t: number): { x: number; y: number } => {
    const x = px(t);
    const y = py(t);
    return { x: Number.isFinite(x) ? x : NaN, y: Number.isFinite(y) ? y : NaN };
  };
  const cache = new Map<number, { x: number; y: number }>();
  const P = (t: number): { x: number; y: number } => {
    if (!cache.has(t)) cache.set(t, pt(t));
    return cache.get(t)!;
  };

  const out: PlotSample[] = [];
  const seen = new Set<number>();
  const push = (t: number): void => {
    if (seen.has(t) || out.length >= maxPoints) return;
    seen.add(t);
    const p = P(t);
    out.push(Number.isFinite(p.x) && Number.isFinite(p.y) ? p : { x: NaN, y: NaN });
  };

  const stack: Array<{ a: number; b: number; depth: number }> = [];
  for (let i = 0; i < segs; i++) stack.push({ a: lo + i * dt, b: lo + (i + 1) * dt, depth: 0 });

  while (stack.length) {
    const { a, b, depth } = stack.pop()!;
    const mid = (a + b) / 2;
    const pa = P(a);
    const pb = P(b);
    const pm = P(mid);

    if (!Number.isFinite(pa.x) || !Number.isFinite(pb.x) || !Number.isFinite(pm.x)) {
      push(a);
      push(b);
      continue;
    }
    // Midpoint-to-chord euclidean distance.
    const chordLen = Math.hypot(pb.x - pa.x, pb.y - pa.y);
    const u = chordLen > 1e-12 ? ((pm.x - pa.x) * (pb.x - pa.x) + (pm.y - pa.y) * (pb.y - pa.y)) / (chordLen * chordLen) : 0.5;
    const projX = pa.x + u * (pb.x - pa.x);
    const projY = pa.y + u * (pb.y - pa.y);
    const deviation = Math.hypot(pm.x - projX, pm.y - projY);

    if (deviation > effTol && depth < maxDepth && out.length < maxPoints) {
      stack.push({ a, b: mid, depth: depth + 1 });
      stack.push({ a: mid, b, depth: depth + 1 });
    } else {
      push(a);
      push(mid);
      push(b);
    }
  }

  return out;
}

/**
 * Universal break / discontinuity detection for a sampled polyline.
 *
 * Replaces the `tan`-only heuristic with two complementary, scale-aware
 * tests that run on consecutive finite samples:
 *
 *  1. **Vertical-asymptote (slope) test** — the most robust discriminator.
 *     A genuinely steep-but-smooth curve (e.g. `y = 1000x`) has a finite,
 *     bounded slope no matter how it is sampled, whereas a discontinuity
 *     (`tan` at π/2, `1/x` at 0, `sqrt` domain edges) produces a near-vertical
 *     jump: a huge |Δy| over a tiny |Δx|. If `|Δy / Δx|` exceeds `maxSlope`
 *     the pen is lifted. Because adaptive sampling subdivides curvy regions,
 *     the gap around an asymptote yields a vanishingly small `Δx`, so the
 *     slope explodes far beyond `maxSlope` — without falsely breaking
 *     legitimate steep lines (whose slope is constant and bounded).
 *  2. **Jump / ratio test** — a secondary check for step discontinuities
 *     (`sign`, `floor`) where the value jumps enormously between adjacent
 *     samples even when `Δx` is not tiny.
 *
 * Any resulting sample is turned into a `NaN` gap (pen-up) so the renderer
 * never bridges the discontinuity with a spurious vertical line.
 *
 * @param samples Sampled points (in screen/plot order).
 * @returns       A new array with NaN gaps inserted at discontinuities.
 */
export function detectBreaks(
  samples: PlotSample[],
  opts: { maxJump?: number; maxRatio?: number; maxSlope?: number } = {},
): PlotSample[] {
  const { maxJump = 50, maxRatio = 1e3, maxSlope = 1e5 } = opts;
  const out: PlotSample[] = [];
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    if (!Number.isFinite(s.y)) {
      out.push({ x: s.x, y: NaN });
      continue;
    }
    const prev = out.length ? out[out.length - 1] : null;
    if (prev && Number.isFinite(prev.y)) {
      const dx = Math.abs(s.x - prev.x);
      const dy = Math.abs(s.y - prev.y);
      const absY = Math.abs(s.y);
      const absPrev = Math.abs(prev.y);
      const ratio = absY / Math.max(absPrev, 1e-12);
      // Vertical-asymptote test: tiny horizontal step + unbounded slope.
      const tooVertical = dx > 0 && dy / dx > maxSlope;
      // Jump test: huge absolute jump with a huge magnitude ratio.
      const tooJump = dy > maxJump && ratio > maxRatio;
      if (tooVertical || tooJump) {
        out.push({ x: s.x, y: NaN });
        continue;
      }
    }
    out.push(s);
  }
  return out;
}

/**
 * Coerce a mathjs evaluation result to a plain number.
 *
 * - numbers pass through (Infinity / NaN preserved),
 * - complex numbers with a non-zero imaginary part → NaN (not plottable),
 * - booleans → 0 / 1,
 * - anything else → NaN.
 */
function toNumber(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v && typeof v === 'object') {
    const obj = v as { re?: unknown; im?: unknown };
    if (typeof obj.re === 'number' && typeof obj.im === 'number') {
      return obj.im === 0 ? obj.re : NaN;
    }
  }
  return NaN;
}

/* ------------------------------------------------------------------ */
/*  Extrema & zeros                                                   */
/* ------------------------------------------------------------------ */

/** Local extrema + zero-crossing result returned by `findExtrema`. */
export interface ExtremaResult {
  /** Local maxima (red markers). */
  maxima: PlotSample[];
  /** Local minima (red markers). */
  minima: PlotSample[];
  /** Zero crossings (blue markers), y ≈ 0. */
  zeros: PlotSample[];
}

/**
 * Find local maxima, local minima, and x-axis crossings in a sampled
 * curve.
 *
 * - Maxima / minima use a strict 3-point comparison on consecutive
 *   finite samples.
 * - Zeros are detected via sign changes between consecutive samples and
 *   refined by linear interpolation to the crossing point (y = 0).
 *
 * Non-finite (NaN) samples act as barriers — extrema are not detected
 * across gaps.
 */
export function findExtrema(samples: PlotSample[]): ExtremaResult {
  const maxima: PlotSample[] = [];
  const minima: PlotSample[] = [];
  const zeros: PlotSample[] = [];

  for (let i = 1; i < samples.length - 1; i++) {
    const a = samples[i - 1];
    const b = samples[i];
    const c = samples[i + 1];
    if (!Number.isFinite(a.y) || !Number.isFinite(b.y) || !Number.isFinite(c.y)) continue;
    if (b.y > a.y && b.y > c.y) {
      maxima.push({ x: b.x, y: b.y });
    } else if (b.y < a.y && b.y < c.y) {
      minima.push({ x: b.x, y: b.y });
    }
  }

  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1];
    const b = samples[i];
    if (!Number.isFinite(a.y) || !Number.isFinite(b.y)) continue;
    if (a.y === 0) {
      zeros.push({ x: a.x, y: 0 });
      continue;
    }
    // Sign change → linear-interpolate the crossing.
    if (a.y * b.y < 0) {
      const t = a.y / (a.y - b.y);
      zeros.push({ x: a.x + t * (b.x - a.x), y: 0 });
    }
  }

  return { maxima, minima, zeros };
}
