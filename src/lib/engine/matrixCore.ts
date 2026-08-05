/**
 * OmniMath Pro — 线性代数组件核心（纯逻辑，无 React）
 *
 * 统一矩阵分解 / 秩 / 条件数 / 最小二乘实现，供蓝图层、线性代数面板、
 * 求解器共用。mathjs 15.2 未内置 SVD，这里提供单边 Jacobi 矩形 SVD：
 *
 *   - svdRect(A)            矩形 SVD → { U, s, V }，A = U·diag(s)·Vᵀ
 *   - matrixRank(A)         高斯消元求秩（统一实现）
 *   - estimateConditionNumber(A)  2-范数条件数 = σ_max / σ_min
 *   - leastSquares(A, b)    min ‖Ax − b‖₂（QR → 截断 SVD 回退）
 *   - residualNorm(A, x, b) 残差范数 ‖Ax − b‖₂
 */

import { math } from './mathInstance';

/** 矩阵类型：number[][]
 * 到处用双层数组，mathjs Matrix 在进入本模块前先转成数组。 */
export type Matrix = number[][];

/* ------------------------------------------------------------------ *
 * 工具：数组 / mathjs 互转
 * ------------------------------------------------------------------ */

function toArray(v: unknown): Matrix {
  if (math.isMatrix(v)) return (v as any).toArray();
  if (Array.isArray(v) && Array.isArray(v[0])) return v as Matrix;
  if (Array.isArray(v)) return v.map((x) => [Number(x) || 0]);
  return [[Number(v) || 0]];
}

function matmul(A: Matrix, B: Matrix): Matrix {
  const m = A.length;
  const n = B[0].length;
  const k = B.length;
  const out: Matrix = Array.from({ length: m }, () => new Array(n).fill(0));
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      let s = 0;
      for (let t = 0; t < k; t++) s += A[i][t] * B[t][j];
      out[i][j] = s;
    }
  }
  return out;
}

function matVec(A: Matrix, x: number[]): number[] {
  return A.map((row) => row.reduce((s, v, j) => s + v * x[j], 0));
}

function vecNorm(v: number[]): number {
  return Math.sqrt(v.reduce((s, x) => s + x * x, 0));
}

/* ------------------------------------------------------------------ *
 * matrixRank — 高斯消元（统一实现，消除 helpers / linearSystem 重复）
 * ------------------------------------------------------------------ */
export function matrixRank(m: unknown): number {
  const arr = toArray(m);
  if (arr.length === 0) return 0;
  const rows = arr.length;
  const cols = arr[0].length;
  const A = arr.map((r) => [...r]);
  let rank = 0;
  const eps = 1e-10;
  for (let c = 0; c < cols && rank < rows; c++) {
    let pivot = -1;
    let maxAbs = eps;
    for (let r = rank; r < rows; r++) {
      if (Math.abs(A[r][c]) > maxAbs) {
        maxAbs = Math.abs(A[r][c]);
        pivot = r;
      }
    }
    if (pivot === -1) continue;
    if (pivot !== rank) [A[rank], A[pivot]] = [A[pivot], A[rank]];
    const pv = A[rank][c];
    for (let r = rank + 1; r < rows; r++) {
      const factor = A[r][c] / pv;
      for (let k = c; k < cols; k++) A[r][k] -= factor * A[rank][k];
    }
    rank++;
  }
  return rank;
}

/* ------------------------------------------------------------------ *
 * svdRect — 单边 Jacobi 矩形 SVD
 * ------------------------------------------------------------------ *
 * 对 m×n 矩阵 A：
 *   - m ≥ n：直接对 A 做单边 Jacobi，返回 U(m×n)、s(n)、V(n×n)。
 *   - m < n：对 Aᵀ 求 SVD 后交换 U/V。
 * 收敛后 A = U·diag(s)·Vᵀ。
 */
export interface SVDResult {
  U: Matrix; // m×n
  s: number[]; // 奇异值（降序）
  V: Matrix; // n×n
}

function svdRectTall(A: Matrix): { U: Matrix; s: number[]; V: Matrix } {
  const m = A.length;
  const n = A[0].length;
  if (n === 0) return { U: [], s: [], V: [] };

  // 工作副本 A（将逐步被旋转为列正交）
  const AV: Matrix = A.map((r) => [...r]);
  // 右奇异向量累积 V（n×n 单位阵）
  const V: Matrix = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
  );

  const EPS = 1e-15;
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    for (let p = 0; p < n - 1; p++) {
      for (let q = p + 1; q < n; q++) {
        let alpha = 0;
        let betap = 0;
        let betaq = 0;
        for (let i = 0; i < m; i++) {
          alpha += AV[i][p] * AV[i][q];
          betap += AV[i][p] * AV[i][p];
          betaq += AV[i][q] * AV[i][q];
        }
        off += Math.abs(alpha);
        if (Math.abs(alpha) <= EPS * Math.sqrt(betap * betaq)) continue;
        const zeta = (betaq - betap) / (2 * alpha);
        const t = zeta === 0 ? 1 : Math.sign(zeta) / (Math.abs(zeta) + Math.sqrt(1 + zeta * zeta));
        const c = 1 / Math.sqrt(1 + t * t);
        const s = c * t;
        for (let i = 0; i < m; i++) {
          const aip = AV[i][p];
          const aiq = AV[i][q];
          AV[i][p] = c * aip - s * aiq;
          AV[i][q] = s * aip + c * aiq;
        }
        for (let i = 0; i < n; i++) {
          const vip = V[i][p];
          const viq = V[i][q];
          V[i][p] = c * vip - s * viq;
          V[i][q] = s * vip + c * viq;
        }
      }
    }
    if (off < 1e-16) break;
  }

  const s: number[] = [];
  for (let j = 0; j < n; j++) {
    let norm = 0;
    for (let i = 0; i < m; i++) norm += AV[i][j] * AV[i][j];
    s.push(Math.sqrt(norm));
  }

  // U：归一化 A 的列（零奇异值列置 0）
  const U: Matrix = Array.from({ length: m }, (_, i) => {
    const row: number[] = new Array(n).fill(0);
    for (let j = 0; j < n; j++) {
      row[j] = s[j] > 1e-14 ? AV[i][j] / s[j] : 0;
    }
    return row;
  });

  // 奇异值降序排列，同步重排 U / V 的列
  const order = s.map((_, j) => j).sort((a, b) => s[b] - s[a]);
  const sSorted = order.map((j) => s[j]);
  const Us: Matrix = Array.from({ length: m }, (_, i) => order.map((j) => U[i][j]));
  const Vs: Matrix = Array.from({ length: n }, (_, i) => order.map((j) => V[i][j]));

  return { U: Us, s: sSorted, V: Vs };
}

export function svdRect(A: unknown): SVDResult {
  const arr = toArray(A);
  const m = arr.length;
  const n = arr[0]?.length ?? 0;
  if (m === 0 || n === 0) return { U: [], s: [], V: [] };

  if (m >= n) {
    return svdRectTall(arr);
  }
  // m < n：对 Aᵀ（n×m）求 SVD，再交换 U/V
  const At: Matrix = Array.from({ length: n }, (_, j) => Array.from({ length: m }, (_, i) => arr[i][j]));
  const { U, s, V } = svdRectTall(At);
  // At = U·diag(s)·Vᵀ  ⇒  A = V·diag(s)·Uᵀ
  return { U: V, s, V: U };
}

/* ------------------------------------------------------------------ *
 * estimateConditionNumber — 2-范数条件数 = σ_max / σ_min
 * ------------------------------------------------------------------ */
export function estimateConditionNumber(A: unknown, tol = 1e-14): number {
  const { s } = svdRect(A);
  if (s.length === 0) return NaN;
  const sigmaMax = Math.max(...s);
  if (sigmaMax === 0) return Infinity;
  const sigmaMin = Math.max(Math.min(...s), tol * sigmaMax);
  return sigmaMax / sigmaMin;
}

/* ------------------------------------------------------------------ *
 * leastSquares — min ‖Ax − b‖₂
 * ------------------------------------------------------------------ *
 * 兼容数组或 mathjs Matrix 的 A / b。b 可为列向量（number[]）或 n×1 矩阵。
 * 返回 { x, residual, rank, cond }。x 为 number[]。
 */
export interface LeastSquaresResult {
  x: number[];
  residual: number;
  rank: number;
  cond: number;
}

export function leastSquares(A: unknown, b: unknown): LeastSquaresResult {
  const Am = toArray(A);
  const m = Am.length;
  const n = Am[0]?.length ?? 0;
  // 归一化 b 为 number[]
  const bArrRaw = math.isMatrix(b) ? (b as any).toArray() : b;
  const bv: number[] = Array.isArray(bArrRaw)
    ? (Array.isArray(bArrRaw[0]) ? bArrRaw.map((r) => Number(r[0])) : bArrRaw).map((x) => Number(x) || 0)
    : [Number(bArrRaw) || 0];

  const rank = matrixRank(Am);
  const cond = estimateConditionNumber(Am);

  let x: number[];
  if (m === n && rank === n) {
    // 方阵满秩：直接 solve
    x = math.lusolve(math.matrix(Am), bv).valueOf().map((r) => Number(r[0]));
  } else {
    // 超定（QR）或秩亏/欠定（伪逆）。用 QR 求解满秩超定，否则用伪逆。
    if (m > n && rank === n) {
      const qr = math.qr(math.matrix(Am)) as unknown as { Q: any; R: any };
      const Q = qr.Q;
      const R = qr.R;
      // b' = Qᵀ b（取前 n 行）
      const Qt = math.transpose(Q);
      const qtb = matVec(toArray(Qt).slice(0, n), bv);
      // 解上三角 R(0..n,0..n) x = qtb
      const Rarr = toArray(R);
      x = new Array(n).fill(0);
      for (let i = n - 1; i >= 0; i--) {
        let s = qtb[i];
        for (let j = i + 1; j < n; j++) s -= Rarr[i][j] * x[j];
        x[i] = Rarr[i][i] !== 0 ? s / Rarr[i][i] : 0;
      }
    } else {
      // 秩亏 / 欠定：Moore-Penrose 伪逆（mathjs 内部用截断 SVD）
      const p = math.pinv(math.matrix(Am)) as any;
      x = matVec(toArray(p), bv);
    }
  }

  const residual = vecNorm(matVec(Am, x).map((v, i) => v - bv[i]));
  return { x, residual, rank, cond };
}

/** 残差范数 ‖Ax − b‖₂（供面板展示）。 */
export function residualNorm(A: unknown, x: number[], b: unknown): number {
  const Am = toArray(A);
  const bArrRaw = math.isMatrix(b) ? (b as any).toArray() : b;
  const bv: number[] = Array.isArray(bArrRaw)
    ? (Array.isArray(bArrRaw[0]) ? bArrRaw.map((r) => Number(r[0])) : bArrRaw).map((x) => Number(x) || 0)
    : [Number(bArrRaw) || 0];
  return vecNorm(matVec(Am, x).map((v, i) => v - (bv[i] ?? 0)));
}