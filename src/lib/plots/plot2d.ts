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
 *   - autoYRange(samples)   — auto-computed Y range with padding
 *   - sampleFunction(...)   — sample y = f(x) (cartesian / polar / parametric)
 *   - findExtrema(samples)  — local maxima, minima, and zero crossings
 *
 * Evaluation is done with mathjs (same instance style as the engine).
 */

import { create, all, type MathJsInstance } from 'mathjs';

const math: MathJsInstance = create(all);

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
 */
export function niceNumber(
  range: [number, number],
  tickCount: number,
): { tickStep: number; ticks: number[] } {
  const [lo, hi] = range;
  const span = hi - lo;
  if (!Number.isFinite(span) || span <= 0) {
    return { tickStep: 1, ticks: [0] };
  }
  const rawStep = span / Math.max(1, Math.floor(tickCount));
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / mag;
  let step: number;
  if (norm < 1.5) step = 1;
  else if (norm < 3) step = 2;
  else if (norm < 7) step = 5;
  else step = 10;
  step *= mag;

  const ticks: number[] = [];
  // Start at the first multiple of `step` >= lo.
  const start = Math.ceil(lo / step) * step;
  // +step*1e-6 guard against floating-point drift at the upper bound.
  for (let v = start; v <= hi + step * 1e-6; v += step) {
    // Snap to the nearest multiple of step to avoid drift accumulation.
    ticks.push(Math.round(v / step) * step);
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
  let compiled: { evaluate: (scope?: Record<string, unknown>) => unknown };
  try {
    compiled = math.compile(expr) as unknown as { evaluate: (scope?: Record<string, unknown>) => unknown };
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
        const r = toNumber(compiled.evaluate({ x: t, t }));
        xVal = r * Math.cos(t);
        yVal = r * Math.sin(t);
      } else if (plotType === 'parametric') {
        // Expression should evaluate to [x(t), y(t)].
        const v = compiled.evaluate({ t, x: t });
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
        yVal = toNumber(compiled.evaluate({ x: t }));
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
