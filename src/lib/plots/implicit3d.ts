/**
 * OmniMath Pro — 3D implicit equation sampling (surface nets)
 *
 * Supports equations that cannot be written as `z = f(x, y)`:
 *
 *   x + z = 1                 （平面）
 *   x^2 + y^2 + z^2 = 4       （球面）
 *   z^2 = x^2 + y^2           （圆锥）
 *
 * 做法：把方程整理成 `F(x, y, z) = lhs - rhs`，在给定的三维包围盒内
 * 采样标量场，再用 naive surface nets（对偶等值面）提取 F = 0 的三角网格。
 * 输出与 `sampleSurface` 完全一致的 `Surface3DData`，因此 3D 场景无需改动。
 *
 * Surface nets 相比 marching cubes：
 *   - 实现简单、无 256 项查表；
 *   - 每个立方体最多一个顶点，网格天然闭合、无裂缝；
 *   - 法线取 F 的梯度，曲面看起来是光滑的。
 */

import { getEvalScope } from '@/lib/engine/mathInstance';
import { compileCached } from '@/lib/engine/compileCache';
import {
  heightColor,
  toNumber,
  type Surface3DData,
} from './plot3d';

/* ------------------------------------------------------------------ */
/*  Equation parsing                                                  */
/* ------------------------------------------------------------------ */

export interface Equation3DParts {
  /** 左侧表达式。 */
  lhs: string;
  /** 右侧表达式。 */
  rhs: string;
}

export interface Parsed3DEquation {
  /** `explicit` → `z = f(x, y)`；`implicit` → `F(x, y, z) = 0`。 */
  kind: 'explicit' | 'implicit';
  /** 用于绘图 / 列表展示的表达式（implicit 时保留完整方程）。 */
  expression: string;
  /** explicit 时的右端表达式。 */
  rhs?: string;
  /** implicit 时的标量场 `lhs - rhs`。 */
  scalarField?: string;
}

/**
 * 在顶层（忽略括号 / 字符串内部）寻找第一个真正的赋值等号，
 * 排除 `==`、`<=`、`>=`、`!=`。
 */
export function splitTopLevelEquation(input: string): Equation3DParts | null {
  let depth = 0;
  let quote: string | null = null;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (quote) {
      if (c === quote && input[i - 1] !== '\\') quote = null;
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
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (depth !== 0 || c !== '=') continue;

    const prev = input[i - 1];
    const next = input[i + 1];
    if (
      next === '=' ||
      prev === '=' ||
      prev === '<' ||
      prev === '>' ||
      prev === '!' ||
      prev === '≤' ||
      prev === '≥' ||
      prev === '≠'
    ) {
      continue;
    }
    const lhs = input.slice(0, i).trim();
    const rhs = input.slice(i + 1).trim();
    if (!lhs || !rhs) return null;
    return { lhs, rhs };
  }
  return null;
}

/** 判断表达式中是否出现了 x / y / z 变量（词边界匹配）。 */
export function containsSurfaceVariable(expr: string): boolean {
  return /(^|[^A-Za-z0-9_])[xyzXYZ]([^A-Za-z0-9_]|$)/.test(expr);
}

/**
 * 去掉多余的 `z =` 前缀：仅当右侧本身还含顶层等号且提到 z 时。
 * `z = z + x = 1` → `z + x = 1`；`z = x^2 - y^2` 保持不变。
 */
function stripRedundantZPrefix(equation: string): string {
  const m = /^\s*z\s*=\s*(.+)$/i.exec(equation);
  if (!m) return equation;
  const rest = m[1].trim();
  if (!splitTopLevelEquation(rest)) return equation;
  if (!/(^|[^A-Za-z0-9_])z([^A-Za-z0-9_]|$)/i.test(rest)) return equation;
  return rest;
}

/**
 * 解析用户输入的 3D 方程。
 *
 * - `z = f(x, y)`      → explicit
 * - 其他含 x/y/z 的方程 → implicit（保留原始方程用于展示）
 * - 不含 `=` 或缺少一侧 → null（调用方按普通函数处理）
 */
export function parse3DEquation(input: string): Parsed3DEquation | null {
  const equation = stripRedundantZPrefix(input.trim());
  if (!equation) return null;
  const parts = splitTopLevelEquation(equation);
  if (!parts) return null;
  const { lhs, rhs } = parts;

  if (/^z$/i.test(lhs)) {
    return { kind: 'explicit', expression: rhs, rhs };
  }

  return {
    kind: 'implicit',
    expression: `${lhs} = ${rhs}`,
    scalarField: `(${lhs}) - (${rhs})`,
  };
}

/* ------------------------------------------------------------------ */
/*  Sampling                                                          */
/* ------------------------------------------------------------------ */

/**
 * implicit 采样的分辨率上限。三维网格的节点数是 resolution³，48³ ≈ 11 万，
 * 单次采样约几十毫秒；继续提高收益很小，却会在拖动参数滑块时明显卡顿。
 */
export const IMPLICIT_MAX_RESOLUTION = 44;

interface Bounds {
  min: number;
  max: number;
}

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

const CORNERS: ReadonlyArray<readonly [number, number, number]> = [
  [0, 0, 0],
  [1, 0, 0],
  [1, 1, 0],
  [0, 1, 0],
  [0, 0, 1],
  [1, 0, 1],
  [1, 1, 1],
  [0, 1, 1],
];

/** 立方体 12 条棱（角点索引对）。 */
const EDGES: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 0],
  [4, 5], [5, 6], [6, 7], [7, 4],
  [0, 4], [1, 5], [2, 6], [3, 7],
];

function assertRange(range: [number, number], label: string): void {
  if (
    !Array.isArray(range) ||
    range.length !== 2 ||
    !Number.isFinite(range[0]) ||
    !Number.isFinite(range[1]) ||
    range[0] === range[1]
  ) {
    throw new Error(`Invalid ${label} range`);
  }
}

function emptySurface(
  equation: string,
  xRange: [number, number],
  yRange: [number, number],
  color: string,
): Surface3DData {
  return {
    vertices: new Float32Array(0),
    normals: new Float32Array(0),
    colors: new Float32Array(0),
    indices: new Uint32Array(0),
    color,
    xRange,
    yRange,
    zRange: [0, 0],
    expression: equation,
    validTriangleCount: 0,
  };
}

/**
 * 采样隐式方程 `F(x, y, z) = 0`，用 surface nets 生成三角网格。
 *
 * @param equation 用户输入的完整方程（如 `x + z = 1`）。
 * @param xRange   X 包围盒。
 * @param yRange   Y 包围盒（同时用于推导 Z 包围盒）。
 * @param zRange   Z 包围盒；不传时用 x/y 范围的并集，保证平面 / 球面完整。
 * @param resolution 每轴网格节点数（自动限制在 12..44）。
 * @param color    单色模式使用的颜色。
 */
export function sampleImplicitSurface(
  equation: string,
  xRange: [number, number],
  yRange: [number, number],
  zRange: [number, number] | undefined,
  resolution = IMPLICIT_MAX_RESOLUTION,
  color = '#2dd4bf',
): Surface3DData {
  assertRange(xRange, 'x');
  assertRange(yRange, 'y');

  const parts = splitTopLevelEquation(stripRedundantZPrefix(equation));
  if (!parts) throw new Error('Invalid implicit equation: missing "="');
  const field = `(${parts.lhs}) - (${parts.rhs})`;
  const compiled = compileCached(field);

  const zBox: [number, number] = zRange
    ? (assertRange(zRange, 'z'), zRange)
    : [
        Math.min(xRange[0], yRange[0]),
        Math.max(xRange[1], yRange[1]),
      ];
  assertRange(zBox, 'z');

  const n = Math.max(12, Math.min(IMPLICIT_MAX_RESOLUTION, Math.floor(resolution)));
  const nx = n;
  const ny = n;
  const nz = n;

  const [xMin, xMax] = xRange;
  const [yMin, yMax] = yRange;
  const [zMin, zMax] = zBox;
  const dx = (xMax - xMin) / (nx - 1);
  const dy = (yMax - yMin) / (ny - 1);
  const dz = (zMax - zMin) / (nz - 1);

  /* ---------- Pass 1: 在三维网格节点上求 F ---------- */
  const values = new Float32Array(nx * ny * nz);
  const scope = getEvalScope();
  let finiteCount = 0;
  let firstEvalError: unknown = null;

  for (let k = 0; k < nz; k++) {
    const z = zMin + k * dz;
    for (let j = 0; j < ny; j++) {
      const y = yMin + j * dy;
      const rowBase = (k * ny + j) * nx;
      for (let i = 0; i < nx; i++) {
        const x = xMin + i * dx;
        scope.x = x;
        scope.y = y;
        scope.z = z;
        let v: number;
        try {
          v = toNumber(compiled.evaluate(scope));
        } catch (err) {
          if (firstEvalError === null) firstEvalError = err;
          v = NaN;
        }
        if (!Number.isFinite(v)) v = NaN;
        else finiteCount++;
        values[rowBase + i] = v;
      }
    }
  }

  if (finiteCount === 0) {
    if (firstEvalError) throw firstEvalError;
    return emptySurface(equation, xRange, yRange, color);
  }

  /* ---------- Pass 2: 每个符号变化的立方体生成一个顶点 ---------- */
  const cellCount = (nx - 1) * (ny - 1) * (nz - 1);
  const cellVertex = new Int32Array(cellCount).fill(-1);
  const positions: number[] = [];
  const cellOfVertex: number[] = [];
  const cornerValues = new Float64Array(8);

  const nodeIndex = (i: number, j: number, k: number) => (k * ny + j) * nx + i;

  let cellIdx = 0;
  for (let k = 0; k < nz - 1; k++) {
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++, cellIdx++) {
        let negative = 0;
        let hasNaN = false;
        for (let c = 0; c < 8; c++) {
          const [oi, oj, ok] = CORNERS[c];
          const v = values[nodeIndex(i + oi, j + oj, k + ok)];
          if (Number.isNaN(v)) {
            hasNaN = true;
            break;
          }
          cornerValues[c] = v;
          if (v < 0) negative++;
        }
        if (hasNaN || negative === 0 || negative === 8) continue;

        // 顶点位置 = 所有符号变化棱交点的平均
        let px = 0;
        let py = 0;
        let pz = 0;
        let crossings = 0;
        for (let e = 0; e < EDGES.length; e++) {
          const a = EDGES[e][0];
          const b = EDGES[e][1];
          const va = cornerValues[a];
          const vb = cornerValues[b];
          if ((va < 0) === (vb < 0)) continue;
          const t = va / (va - vb);
          const ax = CORNERS[a][0];
          const ay = CORNERS[a][1];
          const az = CORNERS[a][2];
          const bx = CORNERS[b][0];
          const by = CORNERS[b][1];
          const bz = CORNERS[b][2];
          px += (ax + (bx - ax) * t) * dx;
          py += (ay + (by - ay) * t) * dy;
          pz += (az + (bz - az) * t) * dz;
          crossings++;
        }
        if (crossings === 0) continue;

        positions.push(
          xMin + i * dx + px / crossings,
          yMin + j * dy + py / crossings,
          zMin + k * dz + pz / crossings,
        );
        cellVertex[cellIdx] = cellOfVertex.length;
        cellOfVertex.push(cellIdx);
      }
    }
  }

  if (positions.length === 0) {
    return emptySurface(equation, xRange, yRange, color);
  }

  /* ---------- Pass 3: 沿网格棱生成四边形（对偶网格） ---------- */
  const indexList: number[] = [];
  const cellAt = (i: number, j: number, k: number) =>
    cellVertex[(k * (ny - 1) + j) * (nx - 1) + i];

  const pushQuad = (a: number, b: number, c: number, d: number) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    indexList.push(a, b, c, a, c, d);
  };

  // 沿 X 的棱
  for (let k = 1; k < nz - 1; k++) {
    for (let j = 1; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const v0 = values[nodeIndex(i, j, k)];
        const v1 = values[nodeIndex(i + 1, j, k)];
        if ((v0 < 0) === (v1 < 0)) continue;
        pushQuad(
          cellAt(i, j - 1, k - 1),
          cellAt(i, j, k - 1),
          cellAt(i, j, k),
          cellAt(i, j - 1, k),
        );
      }
    }
  }

  // 沿 Y 的棱
  for (let k = 1; k < nz - 1; k++) {
    for (let i = 1; i < nx - 1; i++) {
      for (let j = 0; j < ny - 1; j++) {
        const v0 = values[nodeIndex(i, j, k)];
        const v1 = values[nodeIndex(i, j + 1, k)];
        if ((v0 < 0) === (v1 < 0)) continue;
        pushQuad(
          cellAt(i - 1, j, k - 1),
          cellAt(i, j, k - 1),
          cellAt(i, j, k),
          cellAt(i - 1, j, k),
        );
      }
    }
  }

  // 沿 Z 的棱
  for (let j = 1; j < ny - 1; j++) {
    for (let i = 1; i < nx - 1; i++) {
      for (let k = 0; k < nz - 1; k++) {
        const v0 = values[nodeIndex(i, j, k)];
        const v1 = values[nodeIndex(i, j, k + 1)];
        if ((v0 < 0) === (v1 < 0)) continue;
        pushQuad(
          cellAt(i - 1, j - 1, k),
          cellAt(i, j - 1, k),
          cellAt(i, j, k),
          cellAt(i - 1, j, k),
        );
      }
    }
  }

  if (indexList.length === 0) {
    return emptySurface(equation, xRange, yRange, color);
  }

  /* ---------- Pass 4: 顶点法线（F 的梯度）+ 高度色 ---------- */
  const vertexCount = cellOfVertex.length;
  const normals = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3);

  let zLo = Infinity;
  let zHi = -Infinity;
  for (let v = 0; v < vertexCount; v++) {
    const z = positions[v * 3 + 2];
    if (z < zLo) zLo = z;
    if (z > zHi) zHi = z;
  }
  const zSpan = zHi - zLo;

  for (let v = 0; v < vertexCount; v++) {
    const c = cellOfVertex[v];
    const ci = c % (nx - 1);
    const rest = (c - ci) / (nx - 1);
    const cj = rest % (ny - 1);
    const ck = (rest - cj) / (ny - 1);

    // 单元中心处梯度的前向差分平均（立方体 12 条棱中的 4+4+4 条）
    const val = (i: number, j: number, k: number) => values[nodeIndex(i, j, k)];
    const gx =
      (val(ci + 1, cj, ck) - val(ci, cj, ck) +
        val(ci + 1, cj + 1, ck) - val(ci, cj + 1, ck) +
        val(ci + 1, cj, ck + 1) - val(ci, cj, ck + 1) +
        val(ci + 1, cj + 1, ck + 1) - val(ci, cj + 1, ck + 1)) /
      (4 * dx);
    const gy =
      (val(ci, cj + 1, ck) - val(ci, cj, ck) +
        val(ci + 1, cj + 1, ck) - val(ci + 1, cj, ck) +
        val(ci, cj + 1, ck + 1) - val(ci, cj, ck + 1) +
        val(ci + 1, cj + 1, ck + 1) - val(ci + 1, cj, ck + 1)) /
      (4 * dy);
    const gz =
      (val(ci, cj, ck + 1) - val(ci, cj, ck) +
        val(ci + 1, cj, ck + 1) - val(ci + 1, cj, ck) +
        val(ci, cj + 1, ck + 1) - val(ci, cj + 1, ck) +
        val(ci + 1, cj + 1, ck + 1) - val(ci + 1, cj + 1, ck)) /
      (4 * dz);

    const len = Math.hypot(gx, gy, gz);
    if (len > 1e-9 && Number.isFinite(len)) {
      normals[v * 3] = gx / len;
      normals[v * 3 + 1] = gy / len;
      normals[v * 3 + 2] = gz / len;
    } else {
      normals[v * 3] = 0;
      normals[v * 3 + 1] = 0;
      normals[v * 3 + 2] = 1;
    }

    const z = positions[v * 3 + 2];
    const t = zSpan > 1e-12 ? (z - zLo) / zSpan : 0.5;
    const [r, g, b] = heightColor(t);
    colors[v * 3] = r;
    colors[v * 3 + 1] = g;
    colors[v * 3 + 2] = b;
  }

  return {
    vertices: new Float32Array(positions),
    normals,
    colors,
    indices: new Uint32Array(indexList),
    color,
    xRange,
    yRange,
    zRange: [zLo, zHi],
    expression: equation,
    validTriangleCount: Math.floor(indexList.length / 3),
  };
}

/* ------------------------------------------------------------------ */
/*  Safe wrapper                                                      */
/* ------------------------------------------------------------------ */

export function trySampleImplicitSurface(
  equation: string,
  xRange: [number, number],
  yRange: [number, number],
  zRange?: [number, number],
  resolution = IMPLICIT_MAX_RESOLUTION,
  color = '#2dd4bf',
): { data: Surface3DData | null; error: string | null } {
  try {
    const data = sampleImplicitSurface(
      equation,
      xRange,
      yRange,
      zRange,
      resolution,
      color,
    );
    if (data.validTriangleCount === 0) {
      return {
        data,
        error:
          '方程未生成可绘制几何：请确认方程包含 x、y、z，且曲面落在当前坐标范围内',
      };
    }
    return { data, error: null };
  } catch (err) {
    const rawMsg = err instanceof Error ? err.message : String(err);

    if (rawMsg.includes('Invalid x range') ||
        rawMsg.includes('Invalid y range') ||
        rawMsg.includes('Invalid z range')) {
      return {
        data: null,
        error: '采样范围错误：请确保 x、y 范围为有效数字且 min < max',
      };
    }
    if (rawMsg.includes('missing "="')) {
      return {
        data: null,
        error: '隐式方程需要等号，例如 x + z = 1',
      };
    }

    const undefinedMatch =
      rawMsg.match(/Undefined symbol\s+['"]?([A-Za-z_]\w*)['"]?/i) ||
      rawMsg.match(/['"]([^'"]+)['"]\s+is\s+not\s+defined/i) ||
      rawMsg.match(/Undefined variable\s+['"]?([A-Za-z_]\w*)['"]?/i);
    if (/Undefined|not defined/i.test(rawMsg)) {
      return {
        data: null,
        error: undefinedMatch
          ? `变量未定义：${undefinedMatch[1]}`
          : '变量未定义：请检查方程中的 x、y、z 或已声明的变量',
      };
    }

    const truncated = rawMsg.length > 60 ? rawMsg.slice(0, 60) + '…' : rawMsg;
    return { data: null, error: `方程解析错误：${truncated}` };
  }
}

/** 供渲染层复用的包围盒推导：implicit 曲面的 z 范围默认跟随 x/y。 */
export function defaultImplicitZRange(
  xRange: [number, number],
  yRange: [number, number],
): [number, number] {
  return [Math.min(xRange[0], yRange[0]), Math.max(xRange[1], yRange[1])];
}
