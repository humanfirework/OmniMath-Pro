/**
 * OmniMath Pro — 2D implicit curve sampling
 *
 * Turns a top-level equation `lhs = rhs` into the scalar field
 * `F(x, y) = lhs - rhs` and extracts the zero set `F(x, y) = 0` with
 * marching squares over the visible `[xMin, xMax] × [yMin, yMax]` window.
 *
 * Output convention matches the rest of the 2D renderer: a flat
 * `PlotSample[]` where every contour segment is two consecutive finite
 * points and `{ x: NaN, y: NaN }` separates disconnected segments (the
 * canvas treats NaN as a pen-up / moveTo).
 *
 * Pure module (no React / DOM). Evaluation goes through the shared mathjs
 * instance + the compiled-expression LRU so slider drags don't re-parse the
 * equation on every frame.
 */

import { math, getEvalScope } from '@/lib/engine/mathInstance';
import { compileCached } from '@/lib/engine/compileCache';
import type { PlotSample } from './plot2d';

/**
 * Default Y window for implicit 2D sampling when the caller only knows the
 * X view range (smart-Y / facet / CSV derivation). Matches the panel's
 * standard viewport so circles, ellipses, etc. are fully covered.
 */
export const DEFAULT_IMPLICIT_Y_RANGE: [number, number] = [-10, 10];

/** A 2D point in world coordinates (marching-squares intermediate form). */
type Pt = [number, number];

/**
 * Split a top-level `lhs = rhs` equation.
 *
 * Ignores `==`, `<=`, `>=`, `!=` and any `=` nested inside parentheses,
 * brackets, braces, or string literals. Returns `null` when the input has
 * no usable top-level equality (e.g. a plain expression or a malformed
 * equation).
 */
function splitImplicitEquation(input: string): { lhs: string; rhs: string } | null {
  const s = input.trim();
  if (!s) return null;

  let depth = 0;
  let quote: string | null = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quote) {
      if (c === quote && s[i - 1] !== '\\') quote = null;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      continue;
    }
    if (c === '(' || c === '[' || c === '{') {
      depth++;
      continue;
    }
    if (c === ')' || c === ']' || c === '}') {
      if (depth > 0) depth--;
      continue;
    }
    if (c !== '=' || depth !== 0) continue;
    const prev = s[i - 1];
    const next = s[i + 1];
    if (next === '=') continue; // ==
    if (prev === '=' || prev === '<' || prev === '>' || prev === '!') continue;
    const lhs = s.slice(0, i).trim();
    const rhs = s.slice(i + 1).trim();
    if (!lhs || !rhs) return null;
    return { lhs, rhs };
  }
  return null;
}

/** A valid, non-degenerate numeric range. */
function isValidRange(range: unknown): range is [number, number] {
  if (!Array.isArray(range) || range.length !== 2) return false;
  const [a, b] = range as [number, number];
  return Number.isFinite(a) && Number.isFinite(b) && a !== b;
}

/** Coerce a mathjs result to a plain number (complex → NaN, bool → 0/1). */
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

/**
 * Linear interpolation along an edge from `(ax, ay)` (field value `va`) to
 * `(bx, by)` (field value `vb`), locating the point where the field is 0.
 */
function edgePoint(
  va: number,
  vb: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): Pt {
  const denom = va - vb;
  let t = Math.abs(denom) > 1e-12 ? va / denom : 0.5;
  if (!Number.isFinite(t)) t = 0.5;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  return [ax + (bx - ax) * t, ay + (by - ay) * t];
}

/**
 * Sample the implicit curve `expr` (`lhs = rhs`) over the given window.
 *
 * @param expr       Full equation, e.g. `"x^2 + y^2 = 4"`.
 * @param xRange     `[xMin, xMax]` sampling window.
 * @param yRange     `[yMin, yMax]` sampling window (defaults to `[-10, 10]`).
 * @param resolution Cells per axis (clamped to [16, 160], default 80).
 * @returns          A flat sample list; each contour segment is two finite
 *                   points, disconnected segments separated by a NaN gap.
 *                   Returns `[]` for malformed equations, invalid ranges,
 *                   and fields without any zero crossing.
 */
export function sampleImplicit2D(
  expr: string,
  xRange: [number, number],
  yRange: [number, number] = DEFAULT_IMPLICIT_Y_RANGE,
  resolution = 80,
): PlotSample[] {
  if (!expr || !expr.trim()) return [];
  if (!isValidRange(xRange) || !isValidRange(yRange)) return [];

  const eq = splitImplicitEquation(expr);
  if (!eq) return [];

  const fieldExpr = `(${eq.lhs}) - (${eq.rhs})`;

  // Validate the implicit field expression up front so malformed input
  // (unbalanced parens, bad operators, …) yields an empty curve instead of
  // throwing out of the sampler.
  try {
    math.parse(fieldExpr);
  } catch {
    return [];
  }

  let compiled: { evaluate: (scope?: Record<string, unknown>) => unknown };
  try {
    compiled = compileCached(fieldExpr);
  } catch {
    return [];
  }

  const n = Number.isFinite(resolution)
    ? Math.max(16, Math.min(160, Math.floor(resolution)))
    : 80;

  const [xMin, xMax] = xRange;
  const [yMin, yMax] = yRange;
  const dx = (xMax - xMin) / n;
  const dy = (yMax - yMin) / n;

  // One shared scope copy per sampling pass, mutated per grid vertex.
  const scope = getEvalScope();
  const values = new Float64Array((n + 1) * (n + 1));
  const stride = n + 1;

  let finiteCount = 0;
  let hasPositive = false;
  let hasNonPositive = false;

  for (let j = 0; j <= n; j++) {
    const y = yMin + j * dy;
    for (let i = 0; i <= n; i++) {
      const x = xMin + i * dx;
      scope.x = x;
      scope.y = y;
      let v: number;
      try {
        v = toNumber(compiled.evaluate(scope));
      } catch {
        v = NaN;
      }
      values[j * stride + i] = v;
      if (Number.isFinite(v)) {
        finiteCount++;
        if (v >= 0) hasPositive = true;
        else hasNonPositive = true;
      }
    }
  }

  // Completely undefined field (e.g. `sqrt(-x^2-y^2) = 0`) or a field with
  // a single sign everywhere (`x^2+y^2 = -1`): no contour exists.
  if (finiteCount === 0) return [];
  if (!hasPositive || !hasNonPositive) return [];

  const out: PlotSample[] = [];
  // Zero-length segments arise when a grid vertex sits exactly on the
  // contour (e.g. the degenerate `x^2 + y^2 = 0`); drop them so the
  // renderer doesn't get dozens of identical points.
  const epsilon = Math.max(Math.abs(dx), Math.abs(dy)) * 1e-9;

  const emit = (p: Pt | null, q: Pt | null): void => {
    if (!p || !q) return;
    if (Math.hypot(p[0] - q[0], p[1] - q[1]) <= epsilon) return;
    out.push({ x: p[0], y: p[1] }, { x: q[0], y: q[1] }, { x: NaN, y: NaN });
  };

  for (let j = 0; j < n; j++) {
    const y0 = yMin + j * dy;
    const y1 = y0 + dy;
    for (let i = 0; i < n; i++) {
      const x0 = xMin + i * dx;
      const x1 = x0 + dx;

      const fa = values[j * stride + i];
      const fb = values[j * stride + i + 1];
      const fc = values[(j + 1) * stride + i + 1];
      const fd = values[(j + 1) * stride + i];

      // Skip cells touching an undefined region — treating NaN as a sign
      // would fabricate contours along the domain boundary.
      if (
        !Number.isFinite(fa) || !Number.isFinite(fb) ||
        !Number.isFinite(fc) || !Number.isFinite(fd)
      ) {
        continue;
      }

      // Corner bits: 1 = bottom-left (a), 2 = bottom-right (b),
      // 4 = top-right (c), 8 = top-left (d). `0` counts as inside so a
      // contour passing exactly through a grid vertex is captured.
      const idx =
        (fa >= 0 ? 1 : 0) |
        (fb >= 0 ? 2 : 0) |
        (fc >= 0 ? 4 : 0) |
        (fd >= 0 ? 8 : 0);
      if (idx === 0 || idx === 15) continue;

      const pB = edgePoint(fa, fb, x0, y0, x1, y0);
      const pR = edgePoint(fb, fc, x1, y0, x1, y1);
      const pT = edgePoint(fd, fc, x0, y1, x1, y1);
      const pL = edgePoint(fa, fd, x0, y0, x0, y1);

      // Saddle ambiguity: use the cell-centre value to decide whether the
      // inside corners connect through the middle. The sum has the same
      // sign as the average, so no division is needed.
      const centre = fa + fb + fc + fd;

      switch (idx) {
        case 1:
          emit(pL, pB);
          break;
        case 2:
          emit(pB, pR);
          break;
        case 3:
          emit(pL, pR);
          break;
        case 4:
          emit(pR, pT);
          break;
        case 5:
          if (centre >= 0) {
            emit(pR, pB);
            emit(pT, pL);
          } else {
            emit(pL, pB);
            emit(pR, pT);
          }
          break;
        case 6:
          emit(pB, pT);
          break;
        case 7:
          emit(pL, pT);
          break;
        case 8:
          emit(pL, pT);
          break;
        case 9:
          emit(pB, pT);
          break;
        case 10:
          if (centre >= 0) {
            emit(pL, pB);
            emit(pR, pT);
          } else {
            emit(pB, pR);
            emit(pT, pL);
          }
          break;
        case 11:
          emit(pR, pT);
          break;
        case 12:
          emit(pL, pR);
          break;
        case 13:
          emit(pB, pR);
          break;
        case 14:
          emit(pL, pB);
          break;
        default:
          break;
      }
    }
  }

  // Drop the trailing pen-up marker: the renderer doesn't need it and it
  // keeps the "last element is finite" invariant for callers.
  while (out.length > 0) {
    const last = out[out.length - 1];
    if (!Number.isFinite(last.x) || !Number.isFinite(last.y)) out.pop();
    else break;
  }

  return out;
}
