/**
 * OmniMath Pro — 3D surface sampling & helpers
 *
 * Builds triangle-mesh data for `z = f(x, y)` surfaces that
 * `Plot3DScene` renders via three.js BufferGeometry. Pure math — no
 * React, no three.js imports (the Float32Arrays / Uint32Arrays are
 * handed off to the renderer).
 *
 * Public surface:
 *   - Surface3DData            — mesh + metadata consumed by Plot3DScene
 *   - solidColorArray(n, hex)  — flat RGB Float32Array for solid mode
 *   - sampleSurface(...)       — sample z = f(x, y) into a mesh (throws)
 *   - trySampleSurface(...)    — safe wrapper → { data: Surface3DData | null; error: string | null }
 *
 * Evaluation uses the shared configured mathjs instance and merges the
 * live user scope, so surfaces see console variables and slider changes
 * (e.g. `plot3d(sin(a*x)*cos(y))` follows the `a` slider).
 */

import { getEvalScope } from '@/lib/engine/mathInstance';
import { compileCached } from '@/lib/engine/compileCache';

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

/**
 * A sampled triangle mesh for a 3D surface, ready to feed into a
 * three.js `BufferGeometry`.
 *
 * Field layout (verified against Plot3DScene usage):
 *   - `vertices`  — Float32Array, length N*3: [x0,y0,z0, x1,y1,z1, …]
 *                   (used as the `position` attribute, itemSize 3)
 *   - `normals`   — Float32Array, length N*3: per-vertex unit normals
 *                   (`normal` attribute, itemSize 3)
 *   - `colors`    — Float32Array, length N*3: per-vertex RGB in [0,1]
 *                   (`color` attribute, itemSize 3, height gradient)
 *   - `indices`   — Uint32Array of triangle indices (only valid
 *                   triangles — cells with a non-finite corner are
 *                   skipped, so the mesh has gaps over asymptotes)
 *   - `color`     — hex color string (e.g. '#2dd4bf') used for solid mode
 *   - `xRange`    — domain X bounds [xMin, xMax]
 *   - `yRange`    — domain Y bounds [yMin, yMax]
 *   - `expression`— the source expression (used as a React key)
 *   - `validTriangleCount` — number of rendered triangles
 *                   (indices.length / 3); 0 means the expression
 *                   produced no plottable geometry.
 */
export interface Surface3DData {
  vertices: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
  color: string;
  xRange: [number, number];
  yRange: [number, number];
  /** T5: 实际采样到的 z 值范围 [zMin, zMax]（仅含有限值）。
   * 用于让 3D 场景的 Z 轴范围贴合数据，而非机械地用 x/y 范围替代。
   * 当 validTriangleCount === 0 时为 [0, 0]。 */
  zRange: [number, number];
  expression: string;
  validTriangleCount: number;
}

/* ------------------------------------------------------------------ */
/*  Color helpers                                                     */
/* ------------------------------------------------------------------ */

/**
 * Parse a hex color string into normalized [r, g, b] in [0, 1].
 * Supports `#rgb`, `#rrggbb`. Falls back to teal on parse failure.
 */
function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '').trim();
  if (h.length === 3) {
    h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  }
  const num = parseInt(h, 16);
  if (!Number.isFinite(num)) return [0.176, 0.831, 0.749]; // teal fallback
  return [((num >> 16) & 255) / 255, ((num >> 8) & 255) / 255, (num & 255) / 255];
}

/**
 * Map a height ratio `t` ∈ [0, 1] to an RGB triple using a professional
 * color map similar to GeoGebra/Matplotlib — subtle blue-to-yellow gradient.
 */
function heightColor(t: number): [number, number, number] {
  const clamped = Math.max(0, Math.min(1, t));
  // Professional math software colormap: cool blue → teal → green → yellow
  const stops: Array<[number, [number, number, number]]> = [
    [0.0, [0.20, 0.35, 0.65]],   // deep blue
    [0.25, [0.25, 0.55, 0.70]],  // blue-teal
    [0.5, [0.30, 0.65, 0.55]],   // teal-green
    [0.75, [0.55, 0.70, 0.35]],  // green-yellow
    [1.0, [0.85, 0.75, 0.25]],   // warm yellow
  ];
  for (let i = 1; i < stops.length; i++) {
    if (clamped <= stops[i][0]) {
      const [t0, c0] = stops[i - 1];
      const [t1, c1] = stops[i];
      const f = t1 === t0 ? 0 : (clamped - t0) / (t1 - t0);
      return [
        c0[0] + (c1[0] - c0[0]) * f,
        c0[1] + (c1[1] - c0[1]) * f,
        c0[2] + (c1[2] - c0[2]) * f,
      ];
    }
  }
  return stops[stops.length - 1][1];
}

/**
 * Build a flat per-vertex RGB `Float32Array` of length `vertexCount * 3`
 * filled with the color parsed from `hexColor`. Used by Plot3DScene when
 * `colorMode === 'solid'`.
 */
export function solidColorArray(vertexCount: number, hexColor: string): Float32Array {
  const [r, g, b] = hexToRgb(hexColor);
  const arr = new Float32Array(vertexCount * 3);
  for (let i = 0; i < vertexCount; i++) {
    arr[i * 3] = r;
    arr[i * 3 + 1] = g;
    arr[i * 3 + 2] = b;
  }
  return arr;
}

/* ------------------------------------------------------------------ */
/*  Sampling                                                          */
/* ------------------------------------------------------------------ */

/**
 * Sample a surface `z = f(x, y)` over a regular grid and build a
 * triangle mesh.
 *
 * @param expr       Math expression with variables `x` and `y`.
 * @param xRange     Domain X bounds.
 * @param yRange     Domain Y bounds.
 * @param resolution Grid resolution per axis (clamped to [2, 200]);
 *                    total vertices = resolution².
 * @param color      Hex color for solid mode + used as `data.color`.
 * @returns          A populated `Surface3DData`.
 * @throws           If the expression cannot be compiled by mathjs.
 */
export function sampleSurface(
  expr: string,
  xRange: [number, number],
  yRange: [number, number],
  resolution = 60,
  color = '#2dd4bf',
): Surface3DData {
  // Defensive: reject malformed ranges so we never produce NaN vertices
  // that would later blow up WebGL (GL_INVALID_OPERATION) in three.js.
  if (
    !Array.isArray(xRange) || xRange.length !== 2 ||
    !Number.isFinite(xRange[0]) || !Number.isFinite(xRange[1]) ||
    xRange[0] === xRange[1] ||
    !Array.isArray(yRange) || yRange.length !== 2 ||
    !Number.isFinite(yRange[0]) || !Number.isFinite(yRange[1]) ||
    yRange[0] === yRange[1]
  ) {
    throw new Error('Invalid sampling range');
  }

  // Compile via the LRU cache so re-sampling the same surface (slider
  // drags, resolution changes) reuses the parsed expression.
  // Throws on a parse error — let trySampleSurface catch it.
  const compiled = compileCached(expr);

  const N = Math.max(2, Math.min(200, Math.floor(resolution)));
  const [xMin, xMax] = xRange;
  const [yMin, yMax] = yRange;
  const dx = (xMax - xMin) / (N - 1);
  const dy = (yMax - yMin) / (N - 1);
  const vertexCount = N * N;

  const vertices = new Float32Array(vertexCount * 3);
  const zValues = new Float32Array(vertexCount); // raw z (NaN = eval failure)
  const valid = new Uint8Array(vertexCount); // 1 if z is finite

  /* ---------- Pass 1: evaluate z = f(x, y) over the grid ---------- */
  let zMin = Infinity;
  let zMax = -Infinity;
  for (let i = 0; i < N; i++) {
    const x = xMin + i * dx;
    for (let j = 0; j < N; j++) {
      const y = yMin + j * dy;
      const idx = i * N + j;
      let z: number;
      try {
        z = toNumber(compiled.evaluate(getEvalScope({ x, y })));
      } catch {
        z = NaN;
      }
      vertices[idx * 3] = x;
      vertices[idx * 3 + 1] = y;
      if (Number.isFinite(z)) {
        zValues[idx] = z;
        vertices[idx * 3 + 2] = z;
        valid[idx] = 1;
        if (z < zMin) zMin = z;
        if (z > zMax) zMax = z;
      } else {
        // Sanitize to 0 so computeBoundingSphere doesn't hit NaN.
        // The vertex won't be referenced by any index (see Pass 2).
        vertices[idx * 3 + 2] = 0;
        valid[idx] = 0;
      }
    }
  }

  /* ---------- Pass 2: build triangle indices (valid cells only) --- */
  const indexList: number[] = [];
  for (let i = 0; i < N - 1; i++) {
    for (let j = 0; j < N - 1; j++) {
      const v00 = i * N + j;
      const v10 = (i + 1) * N + j;
      const v01 = i * N + (j + 1);
      const v11 = (i + 1) * N + (j + 1);
      if (valid[v00] && valid[v10] && valid[v01] && valid[v11]) {
        // Two triangles per cell. Winding chosen so face normals point
        // in +z (cross product of edges yields upward normals).
        indexList.push(v00, v10, v11, v00, v11, v01);
      }
    }
  }
  const indices = new Uint32Array(indexList);
  const validTriangleCount = Math.floor(indexList.length / 3);

  /* ---------- Pass 3: per-vertex normals (smooth, face-averaged) -- */
  const normals = new Float32Array(vertexCount * 3);
  for (let k = 0; k < indexList.length; k += 3) {
    const a = indexList[k];
    const b = indexList[k + 1];
    const c = indexList[k + 2];
    const ax = vertices[a * 3], ay = vertices[a * 3 + 1], az = vertices[a * 3 + 2];
    const bx = vertices[b * 3], by = vertices[b * 3 + 1], bz = vertices[b * 3 + 2];
    const cx = vertices[c * 3], cy = vertices[c * 3 + 1], cz = vertices[c * 3 + 2];
    // edge1 = b - a, edge2 = c - a; normal ∝ edge1 × edge2
    const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
    const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;
    normals[a * 3] += nx; normals[a * 3 + 1] += ny; normals[a * 3 + 2] += nz;
    normals[b * 3] += nx; normals[b * 3 + 1] += ny; normals[b * 3 + 2] += nz;
    normals[c * 3] += nx; normals[c * 3 + 1] += ny; normals[c * 3 + 2] += nz;
  }
  for (let i = 0; i < vertexCount; i++) {
    const nx = normals[i * 3];
    const ny = normals[i * 3 + 1];
    const nz = normals[i * 3 + 2];
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (len > 1e-12) {
      normals[i * 3] = nx / len;
      normals[i * 3 + 1] = ny / len;
      normals[i * 3 + 2] = nz / len;
    } else {
      // Degenerate (e.g. unreferenced vertex) — point up.
      normals[i * 3] = 0;
      normals[i * 3 + 1] = 0;
      normals[i * 3 + 2] = 1;
    }
  }

  /* ---------- Pass 4: height-based vertex colors ----------------- */
  const colors = new Float32Array(vertexCount * 3);
  const zSpan = zMax - zMin;
  for (let i = 0; i < vertexCount; i++) {
    const t = valid[i] && zSpan > 1e-12 ? (zValues[i] - zMin) / zSpan : 0;
    const [r, g, b] = heightColor(t);
    colors[i * 3] = r;
    colors[i * 3 + 1] = g;
    colors[i * 3 + 2] = b;
  }

  // T5: 若没有任何有效 z 值（表达式全部求值失败），归一化为 [0, 0]，
  // 避免 Infinity 进入后续的 axisSize 计算。
  const finalZRange: [number, number] =
    Number.isFinite(zMin) && Number.isFinite(zMax) ? [zMin, zMax] : [0, 0];

  return {
    vertices,
    normals,
    colors,
    indices,
    color,
    xRange,
    yRange,
    zRange: finalZRange,
    expression: expr,
    validTriangleCount,
  };
}

/**
 * Safe wrapper around `sampleSurface`. Returns `{ data, error }`:
 *   - on success → `{ data: Surface3DData, error: null }`
 *   - on failure (compile error / sampling throw) → `{ data: null, error: <message> }`
 *
 * Previously this returned `Surface3DData | null` and silently swallowed
 * the thrown error, which made sampling failures look like "no surfaces"
 * and hid the real cause from the UI. The error string is now surfaced
 * so Plot3DPanel can show a concrete message instead of an empty canvas.
 *
 * Callers use `data.validTriangleCount === 0` (on a non-null `data`) to
 * detect expressions that compile but produce no plottable geometry
 * (e.g. wrong variable names).
 */
export function trySampleSurface(
  expr: string,
  xRange: [number, number],
  yRange: [number, number],
  resolution = 60,
  color = '#2dd4bf',
): { data: Surface3DData | null; error: string | null } {
  try {
    const data = sampleSurface(expr, xRange, yRange, resolution, color);
    return { data, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/* ------------------------------------------------------------------ */
/*  Internal helpers                                                  */
/* ------------------------------------------------------------------ */

/**
 * Coerce a mathjs evaluation result to a plain number.
 * - numbers pass through (Infinity / NaN preserved),
 * - complex numbers with a non-zero imaginary part → NaN,
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
