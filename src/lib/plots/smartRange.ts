/**
 * OmniMath Pro — Smart Y-axis range algorithm
 *
 * Solves the "e^x crushes sin x" problem: when plotting `e^x` and `sin(x)`
 * together on [-10, 10], the raw min/max of e^x (~22026) inflates the Y
 * range so much that sin x's [-1, 1] oscillation becomes invisible.
 *
 * Strategy (the single, default "free" range behaviour):
 *  1. Quantile-based range: use P5/P95 instead of raw min/max to ignore
 *     extreme tails (e.g. the last sample of e^x near x=10).
 *  2. Outlier detection: if a single curve's P95 / median ratio exceeds a
 *     threshold, that curve is flagged as an "outlier" (exponential /
 *     unbounded) and clipped from the shared Y range so it cannot crush
 *     the other curves.
 *  3. Coordinated multi-curve range: compute each curve's smart range
 *     independently, take the union of the non-outlier curves so every
 *     ordinary curve stays fully visible. If every curve is an outlier,
 *     fall back to the union of all curves so nothing disappears.
 *  4. Always include zero and add a minimum padding so flat lines get
 *     breathing room. The result is deterministic for a given sample set,
 *     which keeps zooming smooth — the derived view never fights the
 *     user's own pan/zoom (a user-set view always wins until reset).
 *
 * Pure math — no React, no DOM. Safe to unit-test in isolation.
 */

import type { PlotSample } from './plot2d';

export type { PlotSample } from './plot2d';

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export interface SmartRangeOptions {
  /** Lower quantile [0,1]. Default 0.05 (P5). */
  lowerQuantile?: number;
  /** Upper quantile [0,1]. Default 0.95 (P95). */
  upperQuantile?: number;
  /**
   * A curve is flagged as an outlier if |P95 / median| ≥ this threshold
   * AND the value range spans more than `outlierSpanThreshold` decades.
   * Default 1e3 — e^x on [-10,10] gives ~22000/1 ≈ 22000, far above 1e3.
   */
  outlierRatioThreshold?: number;
  /** Minimum value-range span (max-min) below which a curve is never an outlier. */
  outlierMinSpan?: number;
  /** Minimum Y range to avoid a flat line collapsing to zero height. */
  minRange?: number;
  /** Force the range to include 0. Default true. */
  includeZero?: boolean;
  /** Padding ratio applied to each side after computing the raw range. */
  padding?: number;
}

export interface CoordinatedRangeResult {
  /**
   * The Y range to use for the shared plot. Computed as the union of every
   * non-outlier curve's quantile-based smart range, so all ordinary curves
   * stay fully visible; extreme outlier curves are clipped instead of
   * crushing the others.
   */
  range: [number, number];
  /** Labels of curves flagged as outliers (e.g. ["e^x"]) — clipped from `range`. */
  outliers: string[];
}

/* ------------------------------------------------------------------ */
/*  Core algorithm                                                    */
/* ------------------------------------------------------------------ */

/**
 * Compute a smart Y range for a single curve using quantiles.
 *
 * - Sorts the finite Y samples.
 * - Picks the lower/upper quantile (default P5/P95) to ignore extreme tails.
 * - Applies padding and optional zero-inclusion.
 *
 * Returns [-6, 6] (the historical default) if no finite samples exist.
 */
export function smartYRange(
  samples: PlotSample[],
  options: SmartRangeOptions = {},
): [number, number] {
  const {
    lowerQuantile = 0.05,
    upperQuantile = 0.95,
    minRange = 2,
    includeZero = true,
    padding = 0.1,
  } = options;

  // Collect finite Y values.
  const ys: number[] = [];
  for (const s of samples) {
    if (Number.isFinite(s.y)) ys.push(s.y);
  }
  if (ys.length === 0) return [-6, 6];

  ys.sort((a, b) => a - b);

  // Quantile indices (clamped). For small sample counts we fall back to
  // min/max so a 2-point curve doesn't degenerate.
  let lo: number;
  let hi: number;
  if (ys.length < 20) {
    lo = ys[0];
    hi = ys[ys.length - 1];
  } else {
    const loIdx = Math.floor(lowerQuantile * (ys.length - 1));
    const hiIdx = Math.ceil(upperQuantile * (ys.length - 1));
    lo = ys[loIdx];
    hi = ys[hiIdx];
  }

  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [-6, 6];
  if (lo === hi) {
    const pad = Math.max(1, Math.abs(lo) * 0.1);
    return [lo - pad, hi + pad];
  }

  // Optionally include zero so a sin curve oscillating around 0 isn't
  // floating in the upper half of the plot.
  if (includeZero) {
    if (lo > 0) lo = 0;
    if (hi < 0) hi = 0;
  }

  const span = hi - lo;
  const pad = Math.max(span * padding, minRange * 0.1);
  return [lo - pad, hi + pad];
}

/**
 * Detect whether a curve is an "outlier" — i.e. its value range is so
 * large that including it would crush every other curve.
 *
 * Heuristic: the |P95 / median| ratio exceeds `outlierRatioThreshold`
 * (default 1e3) AND the span exceeds `outlierMinSpan` (default 100).
 *
 * This catches `e^x` on [-10,10] (median ≈ 1, P95 ≈ 2200, ratio ≈ 2200)
 * but leaves `x^2` (median ≈ 25, P95 ≈ 90, ratio ≈ 3.6) alone.
 */
export function isOutlierCurve(
  samples: PlotSample[],
  options: SmartRangeOptions = {},
): boolean {
  const {
    outlierRatioThreshold = 1e3,
    outlierMinSpan = 100,
    lowerQuantile = 0.05,
    upperQuantile = 0.95,
  } = options;

  const ys: number[] = [];
  for (const s of samples) {
    if (Number.isFinite(s.y)) ys.push(s.y);
  }
  if (ys.length < 2) return false;

  ys.sort((a, b) => a - b);
  const median = ys[Math.floor(ys.length / 2)];
  const p95 = ys[Math.min(ys.length - 1, Math.ceil(upperQuantile * (ys.length - 1)))];
  const p5 = ys[Math.floor(lowerQuantile * (ys.length - 1))];
  const span = Math.abs(p95 - p5);

  if (span < outlierMinSpan) return false;
  if (Math.abs(median) < 1e-9) {
    // median ≈ 0 — use P95 directly as the ratio numerator.
    return Math.abs(p95) >= outlierRatioThreshold;
  }
  return Math.abs(p95 / median) >= outlierRatioThreshold;
}

/**
 * Compute a coordinated Y range across multiple curves.
 *
 * - Each curve gets a smart range via `smartYRange`.
 * - Outlier curves (e.g. e^x) are excluded from the shared range and
 *   returned in `outliers` so the UI can show a "this curve is clipped"
 *   hint.
 * - The shared range is the union of every non-outlier curve's smart
 *   range, so all ordinary curves stay fully visible no matter how many
 *   are plotted.
 * - If every curve is an outlier, the union of ALL curves is used as a
 *   fallback so the plot never shows an empty / degenerate view.
 */
export function coordinatedYRange(
  plots: { samples: PlotSample[]; label: string }[],
  options: SmartRangeOptions = {},
): CoordinatedRangeResult {
  if (plots.length === 0) {
    return { range: [-6, 6], outliers: [] };
  }

  const outliers: string[] = [];
  let sharedMin = Infinity;
  let sharedMax = -Infinity;

  for (const { samples, label } of plots) {
    const [lo, hi] = smartYRange(samples, options);

    if (isOutlierCurve(samples, options)) {
      outliers.push(label);
      continue;
    }
    if (Number.isFinite(lo)) sharedMin = Math.min(sharedMin, lo);
    if (Number.isFinite(hi)) sharedMax = Math.max(sharedMax, hi);
  }

  // Fallback: if every curve was an outlier (e.g. `e^x` + `e^(2x)` on the
  // same plot), the per-curve smart ranges would still let the most extreme
  // curve dominate and squeeze the others. Instead, pool every curve's
  // finite samples and take the P5/P95 quantiles across the combined set —
  // symmetric with the single-curve `smartYRange` behaviour and keeps the
  // shared Y range readable instead of snapping to the raw extremes.
  if (!Number.isFinite(sharedMin) || !Number.isFinite(sharedMax)) {
    const {
      lowerQuantile: loQ = 0.05,
      upperQuantile: hiQ = 0.95,
    } = options;
    const ys: number[] = [];
    for (const { samples } of plots) {
      for (const s of samples) {
        if (Number.isFinite(s.y)) ys.push(s.y);
      }
    }
    if (ys.length > 0) {
      ys.sort((a, b) => a - b);
      // For very small combined sets fall back to the actual min/max so a
      // 2-point plot doesn't degenerate (mirrors `smartYRange`).
      if (ys.length < 20) {
        sharedMin = ys[0];
        sharedMax = ys[ys.length - 1];
      } else {
        const loIdx = Math.floor(loQ * (ys.length - 1));
        const hiIdx = Math.ceil(hiQ * (ys.length - 1));
        sharedMin = ys[loIdx];
        sharedMax = ys[hiIdx];
      }
    }
  }

  if (!Number.isFinite(sharedMin) || !Number.isFinite(sharedMax)) {
    return { range: [-6, 6], outliers };
  }

  const {
    minRange = 2,
    includeZero = true,
    padding = 0.1,
  } = options;

  if (includeZero) {
    if (sharedMin > 0) sharedMin = 0;
    if (sharedMax < 0) sharedMax = 0;
  }

  const span = sharedMax - sharedMin;
  const pad = Math.max(span * padding, minRange * 0.1);
  const range: [number, number] = [sharedMin - pad, sharedMax + pad];

  return { range, outliers };
}
