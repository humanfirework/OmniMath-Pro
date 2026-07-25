'use client';

/**
 * OmniMath Pro — EigenVisualizer: 特征值分析与 SVD 分解可视化
 *
 * 两种模式：
 *   1. 特征值分析 — 用 mathjs 的 eigs() 计算特征值/特征向量，
 *      在 2D SVG 上叠加特征向量方向（紫色虚线箭头），支持实数/复数特征值。
 *   2. SVD 分解   — A = UΣV^T 分步展示：原始矩阵 A → V^T 旋转 → Σ 缩放 → U 旋转，
 *      通过 ZoomLens 实现 4 步分步动画，每步显示中间矩阵与 2D 变换效果。
 *
 * 谱定理说明：对称矩阵的特征值均为实数，且特征向量相互正交。
 *
 * 注：mathjs v15 未内置 svd 函数，此处采用 one-sided Jacobi 算法实现本地 svd()，
 *     返回 { u, v, s } 接口与文档约定一致（A = u · diag(s) · v^T）。
 */

import { useState, useMemo, useEffect, type ReactElement } from 'react';
import { Button } from '@/components/ui/button';
import { FormulaRenderer } from '@/components/workbench/FormulaRenderer';
import { ZoomLens, type ZoomStep } from '@/components/workbench/controls/ZoomLens';
import { eigs, matrix, complex, type MathNode } from 'mathjs';
import { AlertTriangle, Lightbulb } from 'lucide-react';

/* ------------------------------------------------------------------ *
 * 视图常量
 * ------------------------------------------------------------------ */
const VIEW = 3;
const SCALE = 56;
const SIZE = VIEW * 2 * SCALE;
const EIGEN_COLOR = 'oklch(0.6 0.2 280)';

/* ------------------------------------------------------------------ *
 * 类型
 * ------------------------------------------------------------------ */
interface Cplx {
  re: number;
  im: number;
}
type EV = number | Cplx;

interface EigenPair {
  value: EV;
  vector: EV[];
}

interface EigenVisualizerProps {
  /** 矩阵扁平数组。2×2: 4 元素 [a,b,c,d]=[[a,b],[c,d]]；3×3: 9 元素 */
  matrix: number[];
  onMatrixChange?: (m: number[]) => void;
  dimension?: 2 | 3;
}

type Mode = 'eigen' | 'svd';

/* ------------------------------------------------------------------ *
 * 坐标 / 矩阵辅助
 * ------------------------------------------------------------------ */
function worldToSvg(x: number, y: number): [number, number] {
  return [VIEW * SCALE + x * SCALE, VIEW * SCALE - y * SCALE];
}

function apply2(m: number[], x: number, y: number): [number, number] {
  return [m[0] * x + m[1] * y, m[2] * x + m[3] * y];
}

function matMul2(A: number[][], B: number[][]): number[][] {
  const [a, b] = A[0];
  const [c, d] = A[1];
  const [e, f] = B[0];
  const [g, h] = B[1];
  return [
    [a * e + b * g, a * f + b * h],
    [c * e + d * g, c * f + d * h],
  ];
}

function transpose2(A: number[][]): number[][] {
  return [
    [A[0][0], A[1][0]],
    [A[0][1], A[1][1]],
  ];
}

function flat2(A: number[][]): number[] {
  return [A[0][0], A[0][1], A[1][0], A[1][1]];
}

function toMatrix2D(flat: number[], dim: 2 | 3): number[][] {
  if (dim === 2) {
    return [
      [flat[0] ?? 0, flat[1] ?? 0],
      [flat[2] ?? 0, flat[3] ?? 0],
    ];
  }
  return [
    [flat[0] ?? 0, flat[1] ?? 0, flat[2] ?? 0],
    [flat[3] ?? 0, flat[4] ?? 0, flat[5] ?? 0],
    [flat[6] ?? 0, flat[7] ?? 0, flat[8] ?? 0],
  ];
}

/** 取前 2×2 主子矩阵（用于 2D 可视化） */
function leading2(flat: number[], dim: 2 | 3): number[] {
  if (dim === 2) return [flat[0] ?? 0, flat[1] ?? 0, flat[2] ?? 0, flat[3] ?? 0];
  return [flat[0] ?? 0, flat[1] ?? 0, flat[3] ?? 0, flat[4] ?? 0];
}

function isSymmetric(M: number[][], tol = 1e-9): boolean {
  const n = M.length;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (Math.abs(M[i][j] - M[j][i]) > tol) return false;
    }
  }
  return true;
}

function identityFlat(dim: 2 | 3): number[] {
  const n = dim;
  const arr = new Array(n * n).fill(0);
  for (let i = 0; i < n; i++) arr[i * n + i] = 1;
  return arr;
}

function normalizeMatrix(m: number[], dim: 2 | 3): number[] {
  const need = dim * dim;
  if (m.length === need) return m.slice();
  const out = identityFlat(dim);
  for (let i = 0; i < Math.min(m.length, need); i++) out[i] = m[i];
  return out;
}

/* ------------------------------------------------------------------ *
 * mathjs 结果适配
 * ------------------------------------------------------------------ */
function asEV(v: unknown): EV {
  if (typeof v === 'number') return v;
  if (v && typeof v === 'object' && 're' in v && 'im' in v) {
    try {
      // mathjs 类型定义不含 complex({re,im}) 重载；complex(re, im) 生成相同的 Complex 值。
      const vv = v as { re: number; im: number };
      const c = complex(vv.re, vv.im);
      return { re: c.re, im: c.im };
    } catch {
      return 0;
    }
  }
  return 0;
}

function toArray(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  if (v && typeof v === 'object' && 'toArray' in v && typeof (v as { toArray: unknown }).toArray === 'function') {
    return (v as { toArray: () => unknown[] }).toArray();
  }
  return [v];
}

function isComplex(v: unknown): v is Cplx {
  return typeof v === 'object' && v !== null;
}

function isRealEV(v: EV): boolean {
  if (typeof v === 'number') return true;
  return Math.abs(v.im) < 1e-9;
}

/* ------------------------------------------------------------------ *
 * 格式化
 * ------------------------------------------------------------------ */
type Latexable = MathNode | EV | string;

function fmtNum(n: number, d = 3): string {
  if (!Number.isFinite(n)) return n > 0 ? '∞' : '-∞';
  if (Math.abs(n) < 1e-10) return '0';
  return Number(n.toFixed(d)).toString();
}

function fmtEV(v: EV, d = 3): string {
  if (typeof v === 'number') return fmtNum(v, d);
  if (Math.abs(v.im) < 1e-10) return fmtNum(v.re, d);
  const re = fmtNum(v.re, d);
  const im = fmtNum(Math.abs(v.im), d);
  if (Math.abs(v.re) < 1e-10) return `${v.im >= 0 ? '' : '-'}${im}i`;
  return `${re}${v.im >= 0 ? '+' : '-'}${im}i`;
}

function evToLatex(v: EV, d = 3): string {
  if (typeof v === 'number') return fmtNum(v, d);
  if (Math.abs(v.im) < 1e-10) return fmtNum(v.re, d);
  const re = fmtNum(v.re, d);
  const im = fmtNum(Math.abs(v.im), d);
  const sign = v.im >= 0 ? '+' : '-';
  if (Math.abs(v.re) < 1e-10) return `${sign} ${im}i`;
  return `${re} ${sign} ${im}i`;
}

function toLatex(v: Latexable, d = 3): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return fmtNum(v, d);
  if (isComplex(v)) return evToLatex(v, d);
  return String(v);
}

function matrixToLatex(M: (number | EV)[][], d = 3): string {
  const rows = M.map((row) => row.map((c) => toLatex(c, d)).join(' & ')).join(' \\\\ ');
  return `\\begin{bmatrix} ${rows} \\end{bmatrix}`;
}

function vecToLatex(v: EV[], d = 3): string {
  return `\\begin{bmatrix} ${v.map((x) => evToLatex(x, d)).join(' \\\\ ')} \\end{bmatrix}`;
}

/* ------------------------------------------------------------------ *
 * 本地 SVD（one-sided Jacobi）
 * mathjs v15 未提供 svd；返回 { u, v, s }，满足 A = u · diag(s) · v^T
 * ------------------------------------------------------------------ */
function svd(A: number[][]): { u: number[][]; v: number[][]; s: number[] } {
  const m = A.length;
  const n = A[0].length;
  const B = A.map((r) => [...r]);
  let V: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
  );

  const maxSweeps = 60;
  for (let sweep = 0; sweep < maxSweeps; sweep++) {
    let off = 0;
    for (let i = 0; i < n - 1; i++) {
      for (let j = i + 1; j < n; j++) {
        let alpha = 0;
        let beta = 0;
        let gamma = 0;
        for (let k = 0; k < m; k++) {
          alpha += B[k][i] * B[k][i];
          beta += B[k][j] * B[k][j];
          gamma += B[k][i] * B[k][j];
        }
        off += gamma * gamma;
        if (Math.abs(gamma) < 1e-14) continue;
        const zeta = (beta - alpha) / (2 * gamma);
        const t = Math.sign(zeta) / (Math.abs(zeta) + Math.sqrt(1 + zeta * zeta));
        const c = 1 / Math.sqrt(1 + t * t);
        const s = c * t;
        for (let k = 0; k < m; k++) {
          const bi = B[k][i];
          const bj = B[k][j];
          B[k][i] = c * bi - s * bj;
          B[k][j] = s * bi + c * bj;
        }
        for (let k = 0; k < n; k++) {
          const vi = V[k][i];
          const vj = V[k][j];
          V[k][i] = c * vi - s * vj;
          V[k][j] = s * vi + c * vj;
        }
      }
    }
    if (off < 1e-24) break;
  }

  // 计算每列奇异值、对应 u 列与 v 列，再按奇异值降序排列
  const entries: { sigma: number; ucol: number[]; vcol: number[] }[] = [];
  for (let j = 0; j < n; j++) {
    let norm = 0;
    for (let k = 0; k < m; k++) norm += B[k][j] * B[k][j];
    norm = Math.sqrt(norm);
    const ucol: number[] = [];
    for (let k = 0; k < m; k++) ucol.push(norm > 1e-12 ? B[k][j] / norm : 0);
    const vcol: number[] = V.map((row) => row[j]);
    entries.push({ sigma: norm, ucol, vcol });
  }
  entries.sort((a, b) => b.sigma - a.sigma);

  const s = entries.map((e) => parseFloat(e.sigma.toPrecision(8)));
  const u: number[][] = Array.from({ length: m }, () => Array(n).fill(0));
  for (let j = 0; j < n; j++) for (let k = 0; k < m; k++) u[k][j] = entries[j].ucol[k];
  const v: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  for (let j = 0; j < n; j++) for (let k = 0; k < n; k++) v[k][j] = entries[j].vcol[k];
  return { u, v, s };
}

/* ------------------------------------------------------------------ *
 * 特征值计算
 * ------------------------------------------------------------------ */
function computeEigen(flat: number[], dim: 2 | 3): EigenPair[] {
  const M = toMatrix2D(flat, dim);
  const result = eigs(matrix(M)) as {
    values: { toArray?: () => unknown[] } | unknown[];
    eigenvectors: { value: unknown; vector: unknown }[];
  };
  const valuesRaw = result.values && typeof (result.values as { toArray?: () => unknown[] }).toArray === 'function'
    ? (result.values as { toArray: () => unknown[] }).toArray()
    : (result.values as unknown[]);
  const evList = result.eigenvectors ?? [];
  return evList.map((ev, i) => ({
    value: asEV(ev.value ?? valuesRaw[i]),
    vector: toArray(ev.vector).map((x) => asEV(x)),
  }));
}

/* ------------------------------------------------------------------ *
 * 2D 变换 SVG（网格 + 单位圆 + 单位方块 + 特征向量叠加）
 * ------------------------------------------------------------------ */
interface EigenDir {
  dir: [number, number];
  lambda: EV;
  label: string;
}

function TransformSVG({
  m,
  eigenDirs,
}: {
  m: number[]; // 2×2 扁平
  eigenDirs?: EigenDir[];
}) {
  const [a, b, c, d] = m;

  // 网格（含坐标轴）
  const gridLines: ReactElement[] = [];
  for (let i = -VIEW; i <= VIEW; i += 0.5) {
    const isHAxis = Math.abs(i) < 0.01;
    const hp1 = worldToSvg(-VIEW, i);
    const hp2 = worldToSvg(VIEW, i);
    gridLines.push(
      <line key={`h-${i}`} x1={hp1[0]} y1={hp1[1]} x2={hp2[0]} y2={hp2[1]}
        stroke={isHAxis ? 'oklch(0.7 0.15 165 / 0.5)' : 'currentColor'}
        strokeWidth={isHAxis ? 1.2 : 0.4}
        className={isHAxis ? '' : 'text-muted-foreground/20'} />,
    );
    const isVAxis = Math.abs(i) < 0.01;
    const vp1 = worldToSvg(i, -VIEW);
    const vp2 = worldToSvg(i, VIEW);
    gridLines.push(
      <line key={`v-${i}`} x1={vp1[0]} y1={vp1[1]} x2={vp2[0]} y2={vp2[1]}
        stroke={isVAxis ? 'oklch(0.78 0.15 75 / 0.5)' : 'currentColor'}
        strokeWidth={isVAxis ? 1.2 : 0.4}
        className={isVAxis ? '' : 'text-muted-foreground/20'} />,
    );
  }

  // 变换后的单位正方形
  const sqCorners: [number, number][] = [
    [0, 0], [1, 0], [1, 1], [0, 1],
  ].map(([x, y]) => apply2(m, x, y));
  const sqPath = sqCorners.map(([x, y], i) => {
    const [sx, sy] = worldToSvg(x, y);
    return `${i === 0 ? 'M' : 'L'}${sx},${sy}`;
  }).join(' ') + ' Z';

  // 变换后的单位圆
  const circlePts: [number, number][] = [];
  for (let i = 0; i <= 48; i++) {
    const ang = (i / 48) * Math.PI * 2;
    circlePts.push(apply2(m, Math.cos(ang), Math.sin(ang)));
  }
  const circlePath = circlePts.map(([x, y], i) => {
    const [sx, sy] = worldToSvg(x, y);
    return `${i === 0 ? 'M' : 'L'}${sx},${sy}`;
  }).join(' ') + ' Z';

  // 基向量
  const [ox, oy] = worldToSvg(0, 0);
  const [ix, iy] = worldToSvg(a, c);
  const [jx, jy] = worldToSvg(b, d);

  // 特征向量方向（实数特征值才绘制）
  const eigenArrows = eigenDirs?.map((e, i) => {
    const lam = typeof e.lambda === 'number' ? e.lambda : e.lambda.re;
    const mag = Math.max(1e-6, Math.abs(lam));
    const len = Math.min(2.8, Math.max(0.4, mag)) * Math.sign(lam || 1);
    const [ex, ey] = apply2(m, e.dir[0] * len, e.dir[1] * len);
    const [sx, sy] = worldToSvg(ex, ey);
    return (
      <g key={`eig-${i}`}>
        <line x1={ox} y1={oy} x2={sx} y2={sy}
          stroke={EIGEN_COLOR} strokeWidth={1.7} strokeDasharray="5 3" opacity={0.85}
          markerEnd="url(#eig-arrow-ev)" />
        <text x={sx + 4} y={sy - 2} fontSize="9.5" fontFamily="ui-monospace" className="fill-foreground/70">
          {e.label}
        </text>
      </g>
    );
  });

  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="max-w-full max-h-full">
      <defs>
        <marker id="eig-arrow-i" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 Z" fill="oklch(0.65 0.2 25)" />
        </marker>
        <marker id="eig-arrow-j" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 Z" fill="oklch(0.7 0.18 95)" />
        </marker>
        <marker id="eig-arrow-ev" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 Z" fill={EIGEN_COLOR} />
        </marker>
      </defs>
      {gridLines}
      <circle cx={ox} cy={oy} r={2} fill="currentColor" className="text-foreground/60" />
      <path d={sqPath} fill="oklch(0.7 0.15 165 / 0.12)" stroke="oklch(0.7 0.15 165)" strokeWidth={1.4} />
      <path d={circlePath} fill="oklch(0.78 0.15 75 / 0.08)" stroke="oklch(0.78 0.15 75)" strokeWidth={1.4} />
      <line x1={ox} y1={oy} x2={ix} y2={iy} stroke="oklch(0.65 0.2 25)" strokeWidth={2} markerEnd="url(#eig-arrow-i)" />
      <line x1={ox} y1={oy} x2={jx} y2={jy} stroke="oklch(0.7 0.18 95)" strokeWidth={2} markerEnd="url(#eig-arrow-j)" />
      <text x={ix + 5} y={iy} fontSize="10" fontFamily="ui-monospace" className="fill-foreground/80">
        î({fmtNum(a, 2)},{fmtNum(c, 2)})
      </text>
      <text x={jx + 5} y={jy} fontSize="10" fontFamily="ui-monospace" className="fill-foreground/80">
        ĵ({fmtNum(b, 2)},{fmtNum(d, 2)})
      </text>
      {eigenArrows}
    </svg>
  );
}

/* ------------------------------------------------------------------ *
 * 主组件
 * ------------------------------------------------------------------ */
export function EigenVisualizer({ matrix: matrixProp, onMatrixChange, dimension = 2 }: EigenVisualizerProps) {
  const [dim, setDim] = useState<2 | 3>(dimension);
  const [mtrx, setMtrx] = useState<number[]>(() => normalizeMatrix(matrixProp, dimension));
  const [mode, setMode] = useState<Mode>('eigen');
  const [svdStep, setSvdStep] = useState(0);

  // 同步外部 matrix prop 变化
  useEffect(() => {
    setMtrx(normalizeMatrix(matrixProp, dim));
    // 仅依赖 matrixProp，避免 dim 切换时被覆盖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matrixProp]);

  // 同步 dimension prop 变化
  useEffect(() => {
    setDim(dimension);
    setMtrx(normalizeMatrix(matrixProp, dimension));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dimension]);

  const updateCell = (idx: number, value: string) => {
    const n = parseFloat(value);
    const next = [...mtrx];
    next[idx] = Number.isNaN(n) ? 0 : n;
    setMtrx(next);
    onMatrixChange?.(next);
  };

  const handleDimChange = (newDim: 2 | 3) => {
    if (newDim === dim) return;
    setDim(newDim);
    const id = identityFlat(newDim);
    setMtrx(id);
    setSvdStep(0);
    onMatrixChange?.(id);
  };

  const fullMatrix = useMemo(() => toMatrix2D(mtrx, dim), [mtrx, dim]);
  const isSym = useMemo(() => isSymmetric(fullMatrix), [fullMatrix]);

  /* ---- 特征值计算（完整矩阵）---- */
  const eigenFull = useMemo<{ pairs: EigenPair[] | null; error: string | null }>(() => {
    try {
      const pairs = computeEigen(mtrx, dim);
      return { pairs, error: null };
    } catch (e) {
      return { pairs: null, error: (e as Error).message || '特征值计算失败' };
    }
  }, [mtrx, dim]);

  /* ---- 2D 可视化用：前 2×2 主子矩阵的特征值（用于 SVG 叠加）---- */
  const eigenViz = useMemo<{ pairs: EigenPair[] | null }>(() => {
    if (dim === 2) return { pairs: eigenFull.pairs };
    try {
      const pairs = computeEigen(leading2(mtrx, dim), 2);
      return { pairs };
    } catch {
      return { pairs: null };
    }
  }, [mtrx, dim, eigenFull.pairs]);

  const vizM = useMemo(() => leading2(mtrx, dim), [mtrx, dim]);

  // 特征向量方向（仅实数特征值，取前 2 维）
  const eigenDirs: EigenDir[] | undefined = useMemo(() => {
    if (!eigenViz.pairs) return undefined;
    const dirs: EigenDir[] = [];
    eigenViz.pairs.forEach((p, i) => {
      if (!isRealEV(p.value)) return;
      const v0 = typeof p.vector[0] === 'number' ? p.vector[0] : (p.vector[0] as Cplx).re;
      const v1 = typeof p.vector[1] === 'number' ? p.vector[1] : (p.vector[1] as Cplx).re;
      const len = Math.hypot(v0, v1) || 1;
      if (!Number.isFinite(len) || len < 1e-9) return;
      dirs.push({
        dir: [v0 / len, v1 / len],
        lambda: p.value,
        label: `λ${i + 1}=${fmtEV(p.value, 2)}`,
      });
    });
    return dirs.length > 0 ? dirs : undefined;
  }, [eigenViz.pairs]);

  const hasComplexEigen = useMemo(
    () => !!eigenFull.pairs && eigenFull.pairs.some((p) => !isRealEV(p.value)),
    [eigenFull.pairs],
  );

  /* ---- SVD 计算（完整 + 2D 可视化）---- */
  const svdFull = useMemo<{ res: { u: number[][]; v: number[][]; s: number[] } | null; error: string | null }>(() => {
    try {
      const res = svd(fullMatrix);
      return { res, error: null };
    } catch (e) {
      return { res: null, error: (e as Error).message || 'SVD 分解失败' };
    }
  }, [fullMatrix]);

  const svdViz = useMemo<{ u: number[][]; v: number[][]; s: number[] } | null>(() => {
    if (dim === 2) return svdFull.res;
    try {
      return svd(toMatrix2D(vizM, 2));
    } catch {
      return null;
    }
  }, [svdFull.res, dim, vizM]);

  // SVD 4 步：A → V^T → Σ·V^T → U·Σ·V^T(=A)
  const svdSteps: ZoomStep[] = useMemo(() => {
    if (!svdViz) return [];
    const A2: number[][] = toMatrix2D(vizM, 2);
    const U = svdViz.u;
    const V = svdViz.v;
    const S = svdViz.s;
    const Vt = transpose2(V);
    const Sigma: number[][] = [
      [S[0] ?? 0, 0],
      [0, S[1] ?? 0],
    ];
    const SVt = matMul2(Sigma, Vt);
    const USVt = matMul2(U, SVt);

    const stepMats = [A2, Vt, SVt, USVt];
    const labels = ['原始矩阵 A', 'V^T 旋转', 'Σ 缩放', 'U 旋转（最终结果）'];
    const descs = [
      '原始矩阵 A 的变换效果（单位圆 → 椭圆）',
      '正交变换，保持形状与长度（旋转/反射）',
      '对角矩阵 Σ 沿坐标轴缩放（圆 → 椭圆）',
      'U 旋转得到最终结果 U·Σ·V^T = A',
    ];
    const matLatex = [
      matrixToLatex(A2),
      matrixToLatex(Vt),
      matrixToLatex(SVt),
      matrixToLatex(USVt),
    ];

    return stepMats.map((M, i) => ({
      label: labels[i],
      description: descs[i],
      fraction: i / 3,
      m: flat2(M),
      matLatex: matLatex[i],
    }));
  }, [svdViz, vizM]);

  // 当前 SVD 步骤的矩阵
  const currentSvdM: number[] = (svdSteps[svdStep]?.m as number[] | undefined) ?? [1, 0, 0, 1];

  /* ---- 渲染 ---- */
  const cellInputs = (
    <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-muted/40 border border-border/60 flex-wrap">
      <span className="text-[10px] text-muted-foreground font-mono">[[</span>
      {mtrx.map((v, i) => (
        <input
          key={i}
          type="number"
          step="0.1"
          value={v}
          onChange={(e) => updateCell(i, e.target.value)}
          className="w-11 h-6 px-1 text-[11px] font-mono text-center bg-transparent border border-border/60 rounded focus:outline-none focus:border-primary"
        />
      ))}
      <span className="text-[10px] text-muted-foreground font-mono">]]</span>
    </div>
  );

  const modeToggle = (
    <div className="flex items-center gap-0.5 p-0.5 rounded-md border border-border/60 bg-muted/30">
      <Button
        size="sm"
        variant={mode === 'eigen' ? 'default' : 'ghost'}
        onClick={() => setMode('eigen')}
        className="h-6 px-2.5 text-[10.5px]"
      >
        特征值分析
      </Button>
      <Button
        size="sm"
        variant={mode === 'svd' ? 'default' : 'ghost'}
        onClick={() => setMode('svd')}
        className="h-6 px-2.5 text-[10.5px]"
      >
        SVD 分解
      </Button>
    </div>
  );

  const dimToggle = (
    <div className="flex items-center gap-0.5 p-0.5 rounded-md border border-border/60 bg-muted/30">
      <Button
        size="sm"
        variant={dim === 2 ? 'default' : 'ghost'}
        onClick={() => handleDimChange(2)}
        className="h-6 px-2.5 text-[10.5px]"
      >
        2×2
      </Button>
      <Button
        size="sm"
        variant={dim === 3 ? 'default' : 'ghost'}
        onClick={() => handleDimChange(3)}
        className="h-6 px-2.5 text-[10.5px]"
      >
        3×3
      </Button>
    </div>
  );

  return (
    <div className="h-full flex flex-col gap-2 overflow-hidden">
      {/* 顶部控制条 */}
      <div className="shrink-0 flex items-center gap-2 px-1 py-1 flex-wrap">
        {modeToggle}
        {dimToggle}
        {cellInputs}
      </div>

      {/* 错误提示 */}
      {eigenFull.error && mode === 'eigen' && (
        <div className="shrink-0 flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-destructive/10 text-destructive text-[10.5px]">
          <AlertTriangle className="size-3.5 shrink-0" />
          <span>特征值计算失败：{eigenFull.error}</span>
        </div>
      )}
      {svdFull.error && mode === 'svd' && (
        <div className="shrink-0 flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-destructive/10 text-destructive text-[10.5px]">
          <AlertTriangle className="size-3.5 shrink-0" />
          <span>SVD 分解失败：{svdFull.error}</span>
        </div>
      )}

      {/* 主区域 */}
      <div className="flex-1 min-h-0 flex gap-2 overflow-hidden">
        {/* SVG 可视化 */}
        <div className="flex-1 min-h-0 flex flex-col gap-1.5 overflow-hidden">
          <div className="flex-1 min-h-0 grid place-items-center overflow-auto bg-muted/20 rounded-md border border-border/40 p-1">
            {mode === 'eigen' ? (
              <TransformSVG m={vizM} eigenDirs={eigenDirs} />
            ) : svdSteps.length > 0 ? (
              <TransformSVG m={currentSvdM} />
            ) : (
              <div className="text-[11px] text-muted-foreground p-4">SVD 不可用</div>
            )}
          </div>
          {dim === 3 && (
            <div className="shrink-0 text-[9.5px] text-muted-foreground px-1">
              * 3×3 矩阵：2D 图展示前 2×2 主子矩阵的投影变换
            </div>
          )}
          {mode === 'eigen' && hasComplexEigen && (
            <div className="shrink-0 text-[9.5px] text-muted-foreground px-1">
              * 含复数特征值：无实特征向量方向，故 SVG 中不绘制紫色虚线箭头
            </div>
          )}
        </div>

        {/* 信息 / 公式面板 */}
        <div className="shrink-0 w-56 flex flex-col gap-1.5 p-2 rounded-md bg-muted/20 border border-border/40 text-[10.5px] overflow-y-auto">
          {mode === 'eigen' ? (
            <EigenInfoPanel
              pairs={eigenFull.pairs}
              fullMatrix={fullMatrix}
              isSymmetric={isSym}
              hasComplex={hasComplexEigen}
            />
          ) : (
            <SvdInfoPanel
              svdFull={svdFull.res}
              dim={dim}
              currentStep={svdStep}
              stepMatLatex={svdSteps[svdStep]?.matLatex as string | undefined}
            />
          )}
        </div>
      </div>

      {/* SVD 分步控制 */}
      {mode === 'svd' && svdSteps.length > 0 && (
        <div className="shrink-0">
          <ZoomLens
            steps={svdSteps}
            currentStep={svdStep}
            onStepChange={setSvdStep}
            defaultCollapsed={false}
          >
            {({ step }) => (
              <div className="px-3 py-2 flex flex-col gap-1.5">
                <div className="text-[10px] text-muted-foreground">{step.description}</div>
                {typeof step.matLatex === 'string' && (
                  <FormulaRenderer latex={step.matLatex} displayMode />
                )}
              </div>
            )}
          </ZoomLens>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * 特征值信息面板
 * ------------------------------------------------------------------ */
function EigenInfoPanel({
  pairs,
  fullMatrix,
  isSymmetric: sym,
  hasComplex,
}: {
  pairs: EigenPair[] | null;
  fullMatrix: number[][];
  isSymmetric: boolean;
  hasComplex: boolean;
}) {
  const dim = fullMatrix.length;
  const aLatex = matrixToLatex(fullMatrix);

  return (
    <>
      <div className="font-medium text-foreground/80">特征值分析</div>
      <div className="text-[9.5px] text-muted-foreground">矩阵 A</div>
      <FormulaRenderer latex={aLatex} displayMode />

      {!pairs && <div className="text-[10px] text-muted-foreground">计算中…</div>}

      {pairs && (
        <div className="mt-1 pt-1 border-t border-border/40 space-y-1.5">
          <div className="font-medium text-muted-foreground">
            特征值 / 特征向量（共 {pairs.length} 个）
          </div>
          {pairs.map((p, i) => (
            <div key={i} className="space-y-0.5">
              <div className="font-mono text-[10px] text-foreground/85">
                λ{i + 1} = {fmtEV(p.value, 4)}
                {isComplex(p.value) && (
                  <span className="text-muted-foreground"> （复数）</span>
                )}
              </div>
              {p.vector.length > 0 && (
                <FormulaRenderer
                  latex={`v_{${i + 1}} = ${vecToLatex(p.vector, 4)}`}
                  displayMode
                />
              )}
              {/* Av = λv 验证 */}
              {isRealEV(p.value) && p.vector.every(isRealEV) && (
                <FormulaRenderer
                  latex={`A v_{${i + 1}} = ${evToLatex(p.value, 4)}\\, v_{${i + 1}}`}
                  displayMode
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* 复数特征值说明 */}
      {hasComplex && (
        <div className="mt-1 px-1.5 py-1 rounded bg-muted/40 text-[9.5px] leading-tight text-muted-foreground">
          复数特征值成共轭对出现（a±bi），对应二维旋转分量。无实特征向量方向。
        </div>
      )}

      {/* 谱定理说明 */}
      <div className="mt-1 pt-1 border-t border-border/40 space-y-1">
        <div className="flex items-center gap-1 font-medium text-foreground/80">
          <Lightbulb className="size-3" />
          谱定理
        </div>
        <div className="text-[9.5px] leading-tight text-muted-foreground">
          {sym ? (
            <>
              当前矩阵 <span className="text-foreground/80">对称</span>：
              <br />· 特征值均为实数
              <br />· 特征向量相互正交
              <br />· A = QΛQᵀ（Q 正交）
            </>
          ) : (
            <>
              当前矩阵 <span className="text-foreground/80">非对称</span>。
              <br />对称矩阵才满足谱定理：特征值全为实数，特征向量正交，可对角化为 A = QΛQᵀ。
              {dim === 2 && ' 2×2 非对称矩阵可能出现复数特征值（旋转分量）。'}
            </>
          )}
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ *
 * SVD 信息面板
 * ------------------------------------------------------------------ */
function SvdInfoPanel({
  svdFull,
  dim,
  currentStep,
  stepMatLatex,
}: {
  svdFull: { u: number[][]; v: number[][]; s: number[] } | null;
  dim: number;
  currentStep: number;
  stepMatLatex?: string;
}) {
  if (!svdFull) {
    return <div className="text-[10px] text-muted-foreground">SVD 计算中…</div>;
  }

  const { u, v, s } = svdFull;
  const n = s.length;
  const Sigma: (number | EV)[][] = Array.from({ length: u.length }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? s[i] ?? 0 : 0)),
  );
  const Vt = v[0].map((_, j) => v.map((row) => row[j]));

  return (
    <>
      <div className="font-medium text-foreground/80">SVD 分解</div>
      <div className="text-[9.5px] text-muted-foreground">A = U · Σ · Vᵀ</div>

      <div className="mt-1 space-y-1">
        <div className="text-[9.5px] text-muted-foreground">U（左奇异向量，{u.length}×{u[0]?.length}）</div>
        <FormulaRenderer latex={matrixToLatex(u)} displayMode />

        <div className="text-[9.5px] text-muted-foreground">Σ（奇异值对角阵）</div>
        <FormulaRenderer latex={matrixToLatex(Sigma)} displayMode />

        <div className="text-[9.5px] text-muted-foreground">Vᵀ（右奇异向量转置）</div>
        <FormulaRenderer latex={matrixToLatex(Vt)} displayMode />
      </div>

      <div className="mt-1 pt-1 border-t border-border/40 space-y-1">
        <div className="font-medium text-muted-foreground">奇异值</div>
        <div className="font-mono text-[10px] text-foreground/85">
          {s.map((sv, i) => `σ${i + 1}=${fmtNum(sv, 4)}`).join('  ')}
        </div>
        {n >= 2 && (
          <div className="text-[9.5px] text-muted-foreground">
            条件数 ≈ {fmtNum(s[0] / Math.max(1e-12, s[n - 1]), 3)}；秩 = {s.filter((x) => Math.abs(x) > 1e-9).length}
          </div>
        )}
      </div>

      <div className="mt-1 pt-1 border-t border-border/40 space-y-1">
        <div className="font-medium text-muted-foreground">当前步骤（{currentStep + 1}/4）</div>
        {stepMatLatex ? (
          <FormulaRenderer latex={stepMatLatex} displayMode />
        ) : (
          <div className="text-[9.5px] text-muted-foreground">—</div>
        )}
        <div className="text-[9px] text-muted-foreground leading-tight">
          {dim === 3 && '2D 图展示前 2×2 主子矩阵的对应变换。'}
        </div>
      </div>

      <div className="mt-1 px-1.5 py-1 rounded bg-muted/40 text-[9px] leading-tight text-muted-foreground">
        几何意义：任意线性变换 = 旋转(Vᵀ) → 沿轴缩放(Σ) → 旋转(U)。Σ 的奇异值即各方向伸缩量。
      </div>
    </>
  );
}
