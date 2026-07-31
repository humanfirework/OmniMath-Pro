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
  count = 600,
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

  for (let i = 0; i < n; i++) {
    const t = lo + ((hi - lo) * i) / (n - 1);
    let xVal: number;
    let yVal: number;
    try {
      if (plotType === 'polar') {
        // r = f(θ), θ = x. Convert to cartesian for rendering.
        const r = toNumber(compiled.evaluate(getEvalScope({ x: t, t })));
        xVal = r * Math.cos(t);
        yVal = r * Math.sin(t);
      } else if (plotType === 'parametric') {
        // Expression should evaluate to [x(t), y(t)].
        const v = compiled.evaluate(getEvalScope({ t, x: t }));
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
        yVal = toNumber(compiled.evaluate(getEvalScope({ x: t })));
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
  count = 600,
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
  for (let i = 0; i < n; i++) {
    const theta = thetaMin + ((thetaMax - thetaMin) * i) / (n - 1);
    let xVal: number;
    let yVal: number;
    try {
      const r = toNumber(compiled.evaluate(getEvalScope({ x: theta, t: theta, theta })));
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
  count = 600,
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
  for (let i = 0; i < n; i++) {
    const t = tMin + ((tMax - tMin) * i) / (n - 1);
    let xVal: number;
    let yVal: number;
    try {
      xVal = toNumber(compiledX.evaluate(getEvalScope({ t, x: t })));
      yVal = toNumber(compiledY.evaluate(getEvalScope({ t, x: t })));
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
 * - cartesian  → `sampleFunction(exprX, xRange)` (view-following window),
 * - polar      → `samplePolar(exprX, paramRange…)` (stable under pan/zoom),
 * - parametric → `sampleParametric(exprX, exprY, paramRange…)`.
 */
export function sampleCurve(
  spec: Curve2DSpec,
  xRange: [number, number],
  count = 600,
): PlotSample[] {
  if (spec.mode === 'polar') {
    return samplePolar(spec.exprX, spec.paramRange[0], spec.paramRange[1], count);
  }
  if (spec.mode === 'parametric') {
    return sampleParametric(spec.exprX, spec.exprY, spec.paramRange[0], spec.paramRange[1], count);
  }
  return sampleFunction(spec.exprX, xRange, 'cartesian', count);
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
