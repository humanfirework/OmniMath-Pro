/**
 * Fourier shape descriptors for hand-drawn contours.
 *
 * A closed contour is resampled to N points, treated as complex numbers and
 * transformed with a DFT. The magnitudes of the low-frequency coefficients
 * (normalized by the first harmonic) are translation-, scale-, rotation- and
 * start-point-invariant — a compact shape signature.
 *
 * This is deliberately a *shape feature*, not a semantic image recognizer:
 * it tells rectangle from ellipse from triangle. It does not claim to
 * understand what the drawing means.
 *
 * Note: `fourier.ts` in this folder fits Fourier *curves* (epicycles) for the
 * vision pipeline. Keep the two concerns separate.
 */

export interface ContourPoint {
  x: number;
  y: number;
}

export type FourierShape = 'circle' | 'ellipse' | 'rectangle' | 'triangle' | 'line';

export interface ShapeMatch {
  shape: FourierShape;
  confidence: number;
  distances: Record<FourierShape, number>;
}

const DEFAULT_SAMPLES = 64;
const DEFAULT_HARMONICS = 8;

/** Resample a closed contour to `n` equidistant points by arc length. */
export function resampleContour(points: ContourPoint[], n = DEFAULT_SAMPLES): ContourPoint[] {
  if (points.length === 0) return [];
  if (points.length === 1) return Array.from({ length: n }, () => ({ ...points[0] }));

  const closed = [...points];
  const first = closed[0];
  const last = closed[closed.length - 1];
  if (Math.hypot(last.x - first.x, last.y - first.y) > 1e-6) closed.push(first);

  const cumulative: number[] = [0];
  let total = 0;
  for (let i = 1; i < closed.length; i++) {
    total += Math.hypot(closed[i].x - closed[i - 1].x, closed[i].y - closed[i - 1].y);
    cumulative.push(total);
  }
  if (total === 0) return Array.from({ length: n }, () => ({ ...points[0] }));

  const out: ContourPoint[] = [];
  let segment = 1;
  for (let i = 0; i < n; i++) {
    const target = (total * i) / n;
    while (segment < cumulative.length - 1 && cumulative[segment] < target) segment++;
    const t0 = cumulative[segment - 1];
    const t1 = cumulative[segment];
    const ratio = t1 === t0 ? 0 : (target - t0) / (t1 - t0);
    const a = closed[segment - 1];
    const b = closed[segment];
    out.push({ x: a.x + (b.x - a.x) * ratio, y: a.y + (b.y - a.y) * ratio });
  }
  return out;
}

/** Normalized Fourier magnitude signature. */
export function fourierMagnitudes(
  points: ContourPoint[],
  harmonics = DEFAULT_HARMONICS,
): number[] {
  const samples = resampleContour(points, DEFAULT_SAMPLES);
  const n = samples.length;
  if (n === 0) return new Array(harmonics).fill(0);

  const magnitudes: number[] = [];
  for (let k = 1; k <= harmonics; k++) {
    let re = 0;
    let im = 0;
    for (let i = 0; i < n; i++) {
      const angle = (-2 * Math.PI * k * i) / n;
      re += samples[i].x * Math.cos(angle) - samples[i].y * Math.sin(angle);
      im += samples[i].x * Math.sin(angle) + samples[i].y * Math.cos(angle);
    }
    magnitudes.push(Math.hypot(re, im) / n);
  }
  const norm = magnitudes[0] || 1;
  return magnitudes.map((m) => m / norm);
}

function distance(a: number[], b: number[]): number {
  let sum = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum / Math.max(1, n));
}

/* ── Synthetic templates ─────────────────────────────────────────── */

function circleTemplate(): ContourPoint[] {
  return Array.from({ length: 48 }, (_, i) => {
    const a = (i / 48) * Math.PI * 2;
    return { x: Math.cos(a), y: Math.sin(a) };
  });
}

function ellipseTemplate(aspect = 0.62): ContourPoint[] {
  return Array.from({ length: 48 }, (_, i) => {
    const a = (i / 48) * Math.PI * 2;
    return { x: Math.cos(a), y: Math.sin(a) * aspect };
  });
}

function polygonTemplate(vertices: ContourPoint[]): ContourPoint[] {
  const out: ContourPoint[] = [];
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % vertices.length];
    const steps = 16;
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return out;
}

const squareTemplate = () =>
  polygonTemplate([
    { x: -1, y: -1 },
    { x: 1, y: -1 },
    { x: 1, y: 1 },
    { x: -1, y: 1 },
  ]);

const triangleTemplate = () =>
  polygonTemplate([
    { x: 0, y: -1 },
    { x: 1, y: 1 },
    { x: -1, y: 1 },
  ]);

let cachedTemplates: Record<Exclude<FourierShape, 'line'>, number[]> | null = null;

function getTemplates() {
  if (!cachedTemplates) {
    cachedTemplates = {
      circle: fourierMagnitudes(circleTemplate()),
      ellipse: fourierMagnitudes(ellipseTemplate()),
      rectangle: fourierMagnitudes(squareTemplate()),
      triangle: fourierMagnitudes(triangleTemplate()),
    };
  }
  return cachedTemplates;
}

/**
 * Classify a hand-drawn contour. Open strokes (endpoints far apart) are
 * reported as `line` without running the descriptor comparison.
 */
export function classifyWithFourier(points: ContourPoint[]): ShapeMatch {
  const distances: Record<FourierShape, number> = {
    circle: Infinity,
    ellipse: Infinity,
    rectangle: Infinity,
    triangle: Infinity,
    line: Infinity,
  };

  if (points.length < 6) {
    distances.line = 0;
    return { shape: 'line', confidence: 0.6, distances };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const diag = Math.hypot(maxX - minX, maxY - minY) || 1;
  const closing = Math.hypot(
    points[points.length - 1].x - points[0].x,
    points[points.length - 1].y - points[0].y,
  );
  if (closing / diag > 0.35) {
    distances.line = 0;
    return { shape: 'line', confidence: 0.7, distances };
  }

  const signature = fourierMagnitudes(points);
  const templates = getTemplates();
  let best: Exclude<FourierShape, 'line'> = 'circle';
  let bestD = Infinity;
  let secondD = Infinity;
  for (const key of Object.keys(templates) as Array<keyof typeof templates>) {
    const d = distance(signature, templates[key]);
    distances[key] = d;
    if (d < bestD) {
      secondD = bestD;
      bestD = d;
      best = key;
    } else if (d < secondD) {
      secondD = d;
    }
  }

  const separation = secondD === Infinity ? 1 : 1 - bestD / (bestD + secondD);
  return {
    shape: best,
    confidence: Math.max(0, Math.min(1, separation)),
    distances,
  };
}
