/**
 * OmniMath Pro — Node registry shared helpers (pure logic, no React)
 *
 * 从 pipelineEngine.ts 抽出的公共工具函数，供 registry 下各分类节点
 * 模块复用。独立成文件是为了避免 registry 模块与 pipelineEngine 之间
 * 产生运行时循环依赖（pipelineEngine → registry → 各分类模块）。
 */

import { math } from '@/lib/engine/mathInstance';

/** Format a number as a LaTeX-safe string (for building integral/derivative LaTeX). */
export function formatNumTex(v: number): string {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    return Number.isNaN(v) ? '\\text{NaN}' : String(v);
  }
  const rounded = Math.round(v);
  if (Math.abs(v - rounded) < 1e-9) return String(rounded);
  return parseFloat(v.toPrecision(8)).toString();
}

export function toNumber(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = Number(v);
    if (!Number.isNaN(n)) return n;
  }
  if (v && typeof v === 'object' && 're' in (v as object)) {
    return (v as { re: number }).re;
  }
  return 0;
}

export function toExprString(v: unknown): string {
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object' && 'toString' in (v as object)) {
    return String((v as { toString: () => string }).toString());
  }
  return String(v ?? '');
}

export function toMatrix(v: unknown): any {
  if (v == null) return math.matrix([[0]]);
  if (math.isMatrix(v)) return v;
  if (Array.isArray(v)) return math.matrix(v);
  return math.matrix([[Number(v) || 0]]);
}

/** Parse a 2D string grid (from the matrix-input editor) into a mathjs matrix. */
export function parseMatrixGrid(cells: { value: string }[][]): any {
  const rows = cells.length || 1;
  const cols = cells[0]?.length || 1;
  const data: number[][] = [];
  for (let i = 0; i < rows; i++) {
    const row: number[] = [];
    for (let j = 0; j < cols; j++) {
      const raw = cells[i]?.[j]?.value ?? '0';
      const n = Number(raw);
      row.push(Number.isNaN(n) ? 0 : n);
    }
    data.push(row);
  }
  return math.matrix(data);
}

/* ------------------------------------------------------------------ *
 * matrixRank — mathjs doesn't expose rank directly
 * ------------------------------------------------------------------ */
export function matrixRank(m: any): number {
  const arr = math.isMatrix(m) ? m.toArray() : m;
  if (!Array.isArray(arr) || arr.length === 0) return 0;
  const rows = arr as number[][];
  const r = rows.length;
  const c = (rows[0] as unknown[]).length || 0;
  if (r === 0 || c === 0) return 0;
  // Gaussian elimination with partial pivoting.
  const A: number[][] = rows.map((row) =>
    (Array.isArray(row) ? row : [row]).map((v) => Number(v) || 0),
  );
  let rank = 0;
  for (let col = 0; col < c && rank < r; col++) {
    let pivot = rank;
    for (let i = rank + 1; i < r; i++) {
      if (Math.abs(A[i][col]) > Math.abs(A[pivot][col])) pivot = i;
    }
    if (Math.abs(A[pivot][col]) < 1e-10) continue;
    [A[rank], A[pivot]] = [A[pivot], A[rank]];
    const pv = A[rank][col];
    for (let j = col; j < c; j++) A[rank][j] /= pv;
    for (let i = 0; i < r; i++) {
      if (i === rank) continue;
      const f = A[i][col];
      for (let j = col; j < c; j++) A[i][j] -= f * A[rank][j];
    }
    rank++;
  }
  return rank;
}
