/**
 * Matrix category node definitions.
 * 从 pipelineEngine.ts 拆分而来，行为保持完全一致。
 */

import { math } from '@/lib/engine/mathInstance';
import type { NodeTypeDef } from '../pipelineEngine';
import { toMatrix, parseMatrixGrid, matrixRank } from './helpers';
import { svdRect, estimateConditionNumber, leastSquares } from '@/lib/engine/matrixCore';

export const matrixNodes = {
  'matrix-input': {
    type: 'matrix-input',
    category: 'matrix',
    labelKey: 'npMatrixInput',
    icon: 'Grid3x3',
    color: 'emerald',
    inputs: [],
    outputs: [{ id: 'matrix', labelKey: 'npPortMatrix', type: 'matrix' }],
    defaultConfig: {
      cells: [
        [{ value: '1' }, { value: '2' }],
        [{ value: '3' }, { value: '4' }],
      ],
      rows: 2,
      cols: 2,
    },
    execute: (_inputs, config) => {
      const cells = (config.cells as { value: string }[][]) ?? [[{ value: '0' }]];
      return { matrix: parseMatrixGrid(cells) };
    },
  },

  'matrix-op': {
    type: 'matrix-op',
    category: 'matrix',
    labelKey: 'npMatrixOp',
    icon: 'Calculator',
    color: 'emerald',
    inputs: [{ id: 'matrix', labelKey: 'npPortMatrix', type: 'matrix' }],
    outputs: [{ id: 'result', labelKey: 'npPortResult', type: 'any' }],
    defaultConfig: { op: 'inv' },
    execute: (inputs, config) => {
      const m = toMatrix(inputs.matrix);
      const op = String(config.op ?? 'inv');
      switch (op) {
        case 'inv': return { result: math.inv(m) };
        case 'transpose': return { result: math.transpose(m) };
        case 'det': return { result: math.det(m) };
        case 'trace': return { result: math.trace(m) };
        case 'rank': return { result: matrixRank(m) };
        case 'cond': return { result: estimateConditionNumber(m) };
        case 'svd': {
          const { U, s, V } = svdRect(m);
          return { result: { U, s, V } };
        }
        case 'eigen': {
          try {
            const eigs = math.eigs(m);
            return { result: { values: eigs.values, vectors: eigs.eigenvectors } };
          } catch {
            return { result: 'eigs failed' };
          }
        }
        default: return { result: m };
      }
    },
  },

  'matrix-multiply': {
    type: 'matrix-multiply',
    category: 'matrix',
    labelKey: 'npMatrixMultiply',
    icon: 'Calculator',
    color: 'emerald',
    inputs: [
      { id: 'a', labelKey: 'npPortA', type: 'matrix' },
      { id: 'b', labelKey: 'npPortB', type: 'matrix' },
    ],
    outputs: [{ id: 'result', labelKey: 'npPortResult', type: 'matrix' }],
    defaultConfig: {},
    execute: (inputs) => {
      const a = toMatrix(inputs.a);
      const b = toMatrix(inputs.b);
      return { result: math.multiply(a, b) };
    },
  },

  'matrix-decompose': {
    type: 'matrix-decompose',
    category: 'matrix',
    labelKey: 'npMatrixDecompose',
    icon: 'Split',
    color: 'emerald',
    inputs: [{ id: 'matrix', labelKey: 'npPortMatrix', type: 'matrix' }],
    outputs: [{ id: 'result', labelKey: 'npPortResult', type: 'any' }],
    defaultConfig: { method: 'lu' },
    execute: (inputs, config) => {
      const m = toMatrix(inputs.matrix);
      const method = String(config.method ?? 'lu');
      try {
        if (method === 'lu') {
          // mathjs lu returns { L, U, P }.
          const lu = math.lup(m) as unknown as { L: unknown; U: unknown; P: unknown };
          return {
            result: { L: lu.L, U: lu.U, P: lu.P },
            latex: 'A = L \\cdot U',
          };
        }
        if (method === 'qr') {
          const qr = math.qr(m) as { Q: unknown; R: unknown };
          return {
            result: { Q: qr.Q, R: qr.R },
            latex: 'A = Q \\cdot R',
          };
        }
        if (method === 'eigen') {
          const eigs = math.eigs(m) as { values: unknown; eigenvectors: unknown };
          return {
            result: { values: eigs.values, vectors: eigs.eigenvectors },
            latex: 'A v = \\lambda v',
          };
        }
        if (method === 'cholesky') {
          const arr = math.clone(m).toArray ? math.clone(m).toArray() : JSON.parse(JSON.stringify(m));
          const A = Array.isArray(arr[0]) ? arr : (m as unknown as number[][]).map((r) => Array.isArray(r) ? [...r] : [r]);
          const n = A.length;
          for (let i = 0; i < n; i++) if (A[i].length !== n) throw new Error('matrix must be square for Cholesky');
          const L: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
          for (let i = 0; i < n; i++) {
            for (let j = 0; j <= i; j++) {
              let sum = 0;
              for (let k = 0; k < j; k++) sum += L[i][k] * L[j][k];
              if (i === j) {
                const diag = (A[i][i] as number) - sum;
                if (diag <= 0 || !Number.isFinite(diag)) {
                  throw new Error('matrix is not positive definite — Cholesky requires symmetric positive definite');
                }
                L[i][j] = Math.sqrt(diag);
              } else {
                L[i][j] = ((A[i][j] as number) - sum) / L[j][j];
              }
            }
          }
          const Lmat = math.matrix(L);
          return { result: { L: Lmat }, latex: 'A = L L^{T}' };
        }
        return { result: 'unknown method', latex: '' };
      } catch (err) {
        return { result: 'decompose failed', latex: '', error: (err as Error).message };
      }
    },
  },

  /** 最小二乘：min ||Ax − b||₂（超定/秩亏/欠定均适用）。 */
  'matrix-lstsq': {
    type: 'matrix-lstsq',
    category: 'matrix',
    labelKey: 'npMatrixLstsq',
    icon: 'Minimize2',
    color: 'emerald',
    inputs: [
      { id: 'a', labelKey: 'npPortA', type: 'matrix' },
      { id: 'b', labelKey: 'npPortB', type: 'matrix' },
    ],
    outputs: [{ id: 'result', labelKey: 'npPortResult', type: 'any' }],
    defaultConfig: {},
    execute: (inputs) => {
      const a = toMatrix(inputs.a).toArray ? toMatrix(inputs.a).toArray() : toMatrix(inputs.a);
      const bm = toMatrix(inputs.b);
      const b = bm.toArray ? bm.toArray() : bm;
      const r = leastSquares(a, b);
      return { result: r };
    },
  },
} satisfies Record<string, NodeTypeDef>;
