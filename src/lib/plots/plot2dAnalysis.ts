/**
 * OmniMath Pro — 2D plot advanced analysis
 *
 * Pure-math helpers for the "advanced features" collapsible panel:
 *   - findIntersections: locate where two curves cross
 *   - tangentLine: slope + sample points of the tangent at x0
 *   - numericDerivative: numerical n-th derivative samples for plotting
 *   - symbolicDerivative: LaTeX form of the symbolic derivative (algebrite)
 *
 * Used by Plot2DAdvancedPanel to render intersections / tangents /
 * derivative overlays on top of the base 2D canvas.
 *
 * No React, no DOM. Safe to unit-test in isolation.
 */

import { math, getEvalScope } from '@/lib/engine/mathInstance';
import type { PlotSample } from './plot2d';
import { sampleFunction } from './plot2d';

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export interface IntersectionPoint {
  x: number;
  y: number;
  /** 所属曲线对标签（如 "sin(x) ∩ cos(x)"），由"全部交点"自动模式填充，
   *  用于交点列表中注明该点来自哪两条曲线。可选，不影响旧调用方。 */
  pairLabel?: string;
}

export interface TangentResult {
  /** Slope (derivative) at x0. */
  slope: number;
  /** y-intercept so that y = slope * x + intercept passes through (x0, f(x0)). */
  intercept: number;
  /** Two endpoints spanning the X range for drawing the tangent line. */
  points: [number, number][];
  /** The point of tangency. */
  at: { x: number; y: number };
}

/* ------------------------------------------------------------------ */
/*  Intersections                                                     */
/* ------------------------------------------------------------------ */

/**
 * Find x values where fn1(x) === fn2(x) within `xRange`.
 *
 * Strategy: sample both functions on a fine grid, detect sign changes of
 * (f1 - f2), then refine by bisection. Returns at most `maxResults`
 * intersections sorted by x.
 */
export function findIntersections(
  fn1: string,
  fn2: string,
  xRange: [number, number],
  steps = 800,
  maxResults = 50,
): IntersectionPoint[] {
  if (!fn1 || !fn2) return [];
  let c1: { evaluate: (s?: Record<string, unknown>) => unknown };
  let c2: { evaluate: (s?: Record<string, unknown>) => unknown };
  try {
    c1 = math.compile(fn1) as unknown as { evaluate: (s?: Record<string, unknown>) => unknown };
    c2 = math.compile(fn2) as unknown as { evaluate: (s?: Record<string, unknown>) => unknown };
  } catch {
    return [];
  }

  const [lo, hi] = xRange;
  const n = Math.max(50, Math.min(4000, steps));
  const dx = (hi - lo) / (n - 1);

  const evalAt = (x: number): [number, number] => {
    try {
      const y1 = toNum(c1.evaluate(getEvalScope({ x })));
      const y2 = toNum(c2.evaluate(getEvalScope({ x })));
      return [y1, y2];
    } catch {
      return [NaN, NaN];
    }
  };

  const results: IntersectionPoint[] = [];
  let prev = evalAt(lo);
  for (let i = 1; i < n; i++) {
    const x = lo + dx * i;
    const cur = evalAt(x);
    const dPrev = prev[0] - prev[1];
    const dCur = cur[0] - cur[1];
    if (Number.isFinite(dPrev) && Number.isFinite(dCur) && dPrev * dCur < 0) {
      // Sign change → bisection refine.
      let a = x - dx;
      let b = x;
      let fa = dPrev;
      for (let iter = 0; iter < 30; iter++) {
        const mid = (a + b) / 2;
        const [y1m, y2m] = evalAt(mid);
        const fm = y1m - y2m;
        if (!Number.isFinite(fm)) break;
        if (Math.abs(fm) < 1e-9) {
          results.push({ x: mid, y: y1m });
          break;
        }
        if (fa * fm < 0) {
          b = mid;
        } else {
          a = mid;
          fa = fm;
        }
      }
      if (results.length === 0 || Math.abs(results[results.length - 1].x - (a + b) / 2) > 1e-6) {
        const mid = (a + b) / 2;
        const [y1m] = evalAt(mid);
        if (Number.isFinite(y1m)) results.push({ x: mid, y: y1m });
      }
      if (results.length >= maxResults) break;
    }
    prev = cur;
  }
  return results.sort((a, b) => a.x - b.x);
}

/* ------------------------------------------------------------------ */
/*  Tangent line                                                      */
/* ------------------------------------------------------------------ */

/**
 * Compute the tangent line of `fn` at x = x0.
 *
 * Slope is computed via central difference (h = 1e-5). The returned
 * `points` span the given `xRange` so the caller can draw the line
 * directly.
 */
export function tangentLine(
  fn: string,
  x0: number,
  xRange: [number, number],
): TangentResult | null {
  let compiled: { evaluate: (s?: Record<string, unknown>) => unknown };
  try {
    compiled = math.compile(fn) as unknown as { evaluate: (s?: Record<string, unknown>) => unknown };
  } catch {
    return null;
  }

  const f = (x: number): number => {
    try {
      return toNum(compiled.evaluate(getEvalScope({ x })));
    } catch {
      return NaN;
    }
  };

  const h = 1e-5;
  const f0 = f(x0);
  const fPlus = f(x0 + h);
  const fMinus = f(x0 - h);
  if (!Number.isFinite(f0) || !Number.isFinite(fPlus) || !Number.isFinite(fMinus)) {
    return null;
  }
  const slope = (fPlus - fMinus) / (2 * h);
  const intercept = f0 - slope * x0;

  const [lo, hi] = xRange;
  return {
    slope,
    intercept,
    at: { x: x0, y: f0 },
    points: [
      [lo, slope * lo + intercept],
      [hi, slope * hi + intercept],
    ],
  };
}

/* ------------------------------------------------------------------ */
/*  Numeric derivative (for plotting d^n f / dx^n)                    */
/* ------------------------------------------------------------------ */

/**
 * Sample the n-th numerical derivative of `fn` across `xRange`.
 *
 * Uses central differences with Richardson extrapolation for the first
 * two orders; higher orders fall back to repeated central difference.
 */
export function numericDerivative(
  fn: string,
  xRange: [number, number],
  order: 1 | 2 | 3 = 1,
  count = 600,
): PlotSample[] {
  let compiled: { evaluate: (s?: Record<string, unknown>) => unknown };
  try {
    compiled = math.compile(fn) as unknown as { evaluate: (s?: Record<string, unknown>) => unknown };
  } catch {
    return [];
  }

  const f = (x: number): number => {
    try {
      return toNum(compiled.evaluate(getEvalScope({ x })));
    } catch {
      return NaN;
    }
  };

  const h = 1e-4;
  // d1 f = (f(x+h) - f(x-h)) / 2h
  const d1 = (x: number): number => (f(x + h) - f(x - h)) / (2 * h);
  // d2 f = (f(x+h) - 2f(x) + f(x-h)) / h^2
  const d2 = (x: number): number => (f(x + h) - 2 * f(x) + f(x - h)) / (h * h);
  // d3 f = (f(x+2h) - 2f(x+h) + 2f(x-h) - f(x-2h)) / 2h^3
  const d3 = (x: number): number =>
    (f(x + 2 * h) - 2 * f(x + h) + 2 * f(x - h) - f(x - 2 * h)) / (2 * h * h * h);

  const deriv = order === 1 ? d1 : order === 2 ? d2 : d3;

  const [lo, hi] = xRange;
  const n = Math.max(2, Math.min(2000, count));
  const out: PlotSample[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const x = lo + ((hi - lo) * i) / (n - 1);
    out[i] = { x, y: deriv(x) };
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  Symbolic derivative (LaTeX via algebrite)                         */
/* ------------------------------------------------------------------ */

let algebritePromise: Promise<typeof import('algebrite')['default']> | null = null;
async function loadAlgebrite(): Promise<typeof import('algebrite')['default']> {
  if (!algebritePromise) {
    algebritePromise = import('algebrite').then((m) => m.default);
  }
  return algebritePromise;
}

/**
 * Compute the symbolic derivative of `expr` w.r.t. `varName`.
 * Returns a LaTeX string suitable for KaTeX.
 *
 * Dynamic-imports algebrite so the ~1MB CAS stays out of the initial
 * bundle.
 */
export async function symbolicDerivative(
  expr: string,
  varName: string = 'x',
): Promise<{ latex: string; expression: string; success: boolean; error?: string }> {
  try {
    const Algebrite = await loadAlgebrite();
    const normalized = expr.replace(/\^/g, '**');
    const expression = Algebrite.run(`d(${normalized}, ${varName})`);
    const latex = Algebrite.run(`printlatex(d(${normalized}, ${varName}))`);
    return { latex: latex || expression, expression, success: true };
  } catch (err) {
    return {
      latex: '',
      expression: '',
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

/** Coerce a mathjs result to a plain number (handles complex/boolean). */
function toNum(v: unknown): number {
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

/** Sample a function safely — thin wrapper around sampleFunction that
 *  never throws. */
export function safeSample(
  expr: string,
  xRange: [number, number],
  count = 600,
): PlotSample[] {
  try {
    return sampleFunction(expr, xRange, 'cartesian', count);
  } catch {
    return [];
  }
}
