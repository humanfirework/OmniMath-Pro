/**
 * matrixCore tests — 矩形 SVD 重建、条件数、最小二乘、统一 matrixRank。
 */

import { describe, it, expect } from 'vitest';
import {
  svdRect,
  matrixRank,
  estimateConditionNumber,
  leastSquares,
  residualNorm,
} from './matrixCore';

type Mat = number[][];

function matmul(A: Mat, B: Mat): Mat {
  const m = A.length;
  const n = B[0].length;
  const k = B.length;
  const out: Mat = Array.from({ length: m }, () => new Array(n).fill(0));
  for (let i = 0; i < m; i++)
    for (let j = 0; j < n; j++) {
      let s = 0;
      for (let t = 0; t < k; t++) s += A[i][t] * B[t][j];
      out[i][j] = s;
    }
  return out;
}

function transpose(A: Mat): Mat {
  return A[0].map((_, j) => A.map((row) => row[j]));
}

/** A ≈ U·diag(s)·Vᵀ 重建误差。 */
function reconstructionError(A: Mat): number {
  const { U, s, V } = svdRect(A);
  const m = U.length;
  const k = s.length;
  const n = V.length;
  // U(m×k), diag(s)(k×k), V(n×k)
  const Sv = Array.from({ length: k }, (_, i) =>
    Array.from({ length: k }, (_, j) => (i === j ? s[i] : 0)),
  );
  const rec = matmul(matmul(U, Sv), transpose(V));
  let e = 0;
  for (let i = 0; i < m; i++)
    for (let j = 0; j < n; j++) e = Math.max(e, Math.abs(rec[i][j] - A[i][j]));
  return e;
}

describe('svdRect — 矩形 SVD 重建', () => {
  it('方阵 A = [[4,0],[3,-5]] 重建误差近零', () => {
    expect(reconstructionError([[4, 0], [3, -5]])).toBeLessThan(1e-10);
  });

  it('超定矩阵 3×2（m>n）重建误差近零', () => {
    expect(reconstructionError([[1, 2], [3, 4], [5, 6]])).toBeLessThan(1e-10);
  });

  it('矮宽矩阵 2×3（m<n）重建误差近零', () => {
    expect(reconstructionError([[1, 2, 3], [4, 5, 6]])).toBeLessThan(1e-10);
  });

  it('奇异值降序排列', () => {
    const { s } = svdRect([[1, 2], [3, 4], [5, 6]]);
    for (let i = 1; i < s.length; i++) expect(s[i]).toBeLessThanOrEqual(s[i - 1] + 1e-12);
  });
});

describe('matrixRank — 统一实现', () => {
  it('满秩方阵 rank=2', () => {
    expect(matrixRank([[1, 2], [3, 4]])).toBe(2);
  });
  it('秩亏矩阵 rank=1', () => {
    expect(matrixRank([[1, 2], [2, 4]])).toBe(1);
  });
  it('矩形超定矩阵 rank=2', () => {
    expect(matrixRank([[1, 2], [2, 4], [3, 6]])).toBe(1);
  });
  it('零矩阵 rank=0', () => {
    expect(matrixRank([[0, 0], [0, 0]])).toBe(0);
  });
});

describe('estimateConditionNumber', () => {
  it('良态矩阵条件数较小', () => {
    expect(estimateConditionNumber([[1, 0], [0, 2]])).toBeCloseTo(2, 6);
  });
  it('奇异矩阵条件数极大（>1e12）', () => {
    expect(estimateConditionNumber([[1, 2], [2, 4]])).toBeGreaterThan(1e12);
  });
});

describe('leastSquares', () => {
  it('超定线性拟合：A=[1,1],[1,2],[1,3], b=[3,5,7] → x≈[1,2]', () => {
    // 数据精确落在直线 y = 1 + 2t 上
    const A: Mat = [[1, 1], [1, 2], [1, 3]];
    const b = [3, 5, 7];
    const r = leastSquares(A, b);
    expect(r.x[0]).toBeCloseTo(1.0, 8);
    expect(r.x[1]).toBeCloseTo(2.0, 8);
    expect(r.residual).toBeLessThan(1e-8);
  });

  it('秩亏系统返回伪逆解且残差小', () => {
    // A 秩 1，x 有无穷多解，伪逆给出最小范数解
    const A: Mat = [[1, 1], [2, 2]];
    const b = [2, 4];
    const r = leastSquares(A, b);
    expect(r.rank).toBe(1);
    expect(r.residual).toBeLessThan(1e-8);
  });

  it('残差范数与 leastSquares 返回值一致', () => {
    const A: Mat = [[1, 2], [3, 4]];
    const b = [5, 6];
    const r = leastSquares(A, b);
    expect(residualNorm(A, r.x, b)).toBeCloseTo(r.residual, 8);
  });
});