/**
 * OmniMath Pro — 线性方程组求解引擎（纯逻辑，无 React）
 *
 * 从 SolverPanel（线性解析）与 LinearAlgebraPanel（带步骤的 Gauss-Jordan
 * 消元）提取的共享逻辑，供 SolverPanel 与 SolverWorkbench 复用：
 *
 *   1. parseLinearSystem — 多行文本（每行一个方程）→ 系数矩阵 A 与常向量 b；
 *      任一方程为非线性时返回 linear: false，由 UI 给出数值方法说明。
 *   2. solveLinearSystemWithSteps — Gauss-Jordan 消元，逐步记录中间矩阵
 *      （步骤字符串格式与 GaussianEliminationView 的解析器一致）。
 *
 * 步骤字符串格式（GaussianEliminationView 可解析）：
 *   - 初始：'\text{增广矩阵 } [A|b] = <matrix_latex>'
 *   - 交换：'R_i \leftrightarrow R_j: <matrix_latex>'
 *   - 缩放：'R_i \div k: <matrix_latex>'
 *   - 消元：'R_i - k R_j: <matrix_latex>'
 */

import { math } from './mathInstance';

/* ------------------------------------------------------------------ *
 * Types
 * ------------------------------------------------------------------ */

export type Matrix = number[][];

export interface LinearSystemParse {
  /** 是否全部为线性方程 */
  linear: boolean;
  /** 排序后的变量名列表 */
  varList: string[];
  A: Matrix;
  b: number[];
  /** 解析失败/非线性的首个方程行 */
  errorLine?: string;
}

export interface LinearSystemSolution {
  kind: 'unique' | 'none' | 'infinite';
  latex: string;
  /** 逐步消元中间状态（GaussianEliminationView 可直接渲染） */
  steps: string[];
  /** 唯一解时的解向量（顺序与 varList 一致） */
  vector?: number[];
  rankA: number;
  rankAug: number;
  nUnknowns: number;
}

/* ------------------------------------------------------------------ *
 * Number / matrix LaTeX helpers
 * ------------------------------------------------------------------ */

function numToLatex(v: number): string {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    return Number.isNaN(v) ? '\\text{NaN}' : String(v);
  }
  const rounded = Math.round(v);
  if (Math.abs(v - rounded) < 1e-10) return String(rounded);
  return parseFloat(v.toPrecision(8)).toString();
}

function vectorToLatex(v: number[]): string {
  return `\\begin{bmatrix} ${v.map(numToLatex).join(' \\\\ ')} \\end{bmatrix}`;
}

/** 增广矩阵 [A|b] 的 LaTeX（竖线分隔最后一列） */
function augmentedMatrixLatex(aug: Matrix, cols: number): string {
  const rows = aug.map((r) => {
    const left = r.slice(0, cols).map(numToLatex).join(' & ');
    const right = numToLatex(r[cols]);
    return `${left} & \\big| & ${right}`;
  });
  return `\\left[\\begin{array}{${'c'.repeat(cols)}|c} ${rows.join(' \\\\ ')} \\end{array}\\right]`;
}

function matrixRank(m: Matrix): number {
  if (m.length === 0) return 0;
  const rows = m.length;
  const cols = m[0].length;
  const a = m.map((r) => r.map((v) => v));
  let rank = 0;
  const eps = 1e-10;
  for (let c = 0; c < cols && rank < rows; c++) {
    let pivot = -1;
    let maxAbs = eps;
    for (let r = rank; r < rows; r++) {
      if (Math.abs(a[r][c]) > maxAbs) {
        maxAbs = Math.abs(a[r][c]);
        pivot = r;
      }
    }
    if (pivot === -1) continue;
    if (pivot !== rank) [a[rank], a[pivot]] = [a[pivot], a[rank]];
    const pv = a[rank][c];
    for (let r = rank + 1; r < rows; r++) {
      const factor = a[r][c] / pv;
      for (let k = c; k < cols; k++) a[r][k] -= factor * a[rank][k];
    }
    rank++;
  }
  return rank;
}

/* ------------------------------------------------------------------ *
 * Linear parsing — 多行文本 → A / b
 * ------------------------------------------------------------------ */

interface Monomial {
  coef: number;
  vars: string[];
}

/** Expand a mathjs node to a list of monomials. Returns null if non-polynomial. */
function expandToMonomials(node: unknown): Monomial[] | null {
  const n = node as {
    type?: string;
    isOperatorNode?: boolean;
    op?: string;
    args?: unknown[];
    isConstantNode?: boolean;
    value?: unknown;
    isSymbolNode?: boolean;
    name?: string;
    content?: unknown;
  };
  if (!n) return null;

  // Constant
  if (n.isConstantNode || n.type === 'ConstantNode') {
    return [{ coef: Number(n.value), vars: [] }];
  }

  // Symbol
  if (n.isSymbolNode || n.type === 'SymbolNode') {
    return [{ coef: 1, vars: [n.name as string] }];
  }

  // Parentheses
  if (n.type === 'ParenthesisNode') {
    return expandToMonomials(n.content);
  }

  // Operator
  if (n.isOperatorNode || n.type === 'OperatorNode') {
    const args = n.args ?? [];
    if (n.op === '+') {
      const a = expandToMonomials(args[0]);
      const b = expandToMonomials(args[1]);
      if (!a || !b) return null;
      return [...a, ...b];
    }
    if (n.op === '-') {
      if (args.length === 1) {
        const a = expandToMonomials(args[0]);
        if (!a) return null;
        return a.map((m) => ({ ...m, coef: -m.coef }));
      }
      const a = expandToMonomials(args[0]);
      const b = expandToMonomials(args[1]);
      if (!a || !b) return null;
      return [...a, ...b.map((m) => ({ ...m, coef: -m.coef }))];
    }
    if (n.op === '*') {
      const a = expandToMonomials(args[0]);
      const b = expandToMonomials(args[1]);
      if (!a || !b) return null;
      const out: Monomial[] = [];
      for (const ma of a) {
        for (const mb of b) {
          out.push({
            coef: ma.coef * mb.coef,
            vars: [...ma.vars, ...mb.vars].sort(),
          });
        }
      }
      return out;
    }
    if (n.op === '/') {
      // Only constant denominator allowed
      const a = expandToMonomials(args[0]);
      const b = expandToMonomials(args[1]);
      if (!a || !b) return null;
      if (b.length !== 1 || b[0].vars.length > 0) return null;
      const denom = b[0].coef;
      if (Math.abs(denom) < 1e-14) return null;
      return a.map((m) => ({ ...m, coef: m.coef / denom }));
    }
    if (n.op === '^') {
      // Only allow integer powers
      const a = expandToMonomials(args[0]);
      const b = expandToMonomials(args[1]);
      if (!a || !b) return null;
      if (a.length !== 1 || b.length !== 1 || b[0].vars.length > 0) return null;
      const base = a[0];
      const exp = b[0].coef;
      if (!Number.isInteger(exp) || exp < 0 || exp > 10) return null;
      if (base.vars.length === 0) {
        return [{ coef: Math.pow(base.coef, exp), vars: [] }];
      }
      // (k*v)^n — 线性方程只允许一次幂
      if (exp !== 1) return null;
      return [base];
    }
    return null;
  }

  // Unary minus node (sometimes wrapped)
  if (n.type === 'UnaryNode') {
    const a = expandToMonomials(n.args?.[0]);
    if (!a) return null;
    return a.map((m) => ({ ...m, coef: -m.coef }));
  }

  // Function node — non-polynomial
  return null;
}

/** Parse a linear LHS like "2x + 3y - z" into { x: 2, y: 3, z: -1 }.
 * Returns null if non-linear (contains x*y, x^2, sin(x), etc). */
export function parseLinearCoeffs(lhs: string): Record<string, number> | null {
  try {
    const node = math.parse(lhs);
    const coeffs: Record<string, number> = {};

    // 展开为单项式之和，检查每一项都是常数或 k*var
    const terms = expandToMonomials(node);
    if (!terms) return null;

    for (const term of terms) {
      if (term.vars.length > 1) return null; // non-linear
      if (term.vars.length === 0) {
        // 常数项 — 记入 __const，求解时折算到右端
        coeffs['__const'] = (coeffs['__const'] ?? 0) + term.coef;
      } else {
        const v = term.vars[0];
        coeffs[v] = (coeffs[v] ?? 0) + term.coef;
      }
    }
    return coeffs;
  } catch {
    return null;
  }
}

/**
 * 解析多行方程组文本（每行一个方程，形如 "2x + y = 5"）。
 * 全部线性 → linear: true + A/b；任一行非线性或无法解析 → linear: false。
 */
export function parseLinearSystem(text: string): LinearSystemParse | { error: string } {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) {
    return { error: '请输入方程组（每行一个方程）' };
  }

  const allVars = new Set<string>();
  const rows: { coeffs: Record<string, number>; rhs: number }[] = [];
  let nonlinearLine: string | null = null;

  for (const line of lines) {
    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) {
      return { error: `无法解析方程（缺少 = 号）: ${line}` };
    }
    const lhs = line.slice(0, eqIdx).trim();
    const rhsStr = line.slice(eqIdx + 1).trim();
    let rhs: number;
    try {
      rhs = Number(math.evaluate(rhsStr, {}));
    } catch {
      return { error: `无法解析右端常数: ${line}` };
    }
    const coeffs = parseLinearCoeffs(lhs);
    if (!coeffs) {
      // 非线性 — 标记但仍继续解析其余行，便于统计变量
      nonlinearLine = line;
      continue;
    }
    for (const v of Object.keys(coeffs)) {
      if (v !== '__const') allVars.add(v);
    }
    rows.push({ coeffs, rhs });
  }

  if (nonlinearLine !== null) {
    return { linear: false, varList: [], A: [], b: [], errorLine: nonlinearLine };
  }

  const varList = Array.from(allVars).sort();
  const A: Matrix = rows.map((r) => varList.map((v) => r.coeffs[v] ?? 0));
  // 左端常数项折算：Ax + C = b → Ax = b - C
  const b: number[] = rows.map((r) => r.rhs - (r.coeffs['__const'] ?? 0));

  return { linear: true, varList, A, b };
}

/* ------------------------------------------------------------------ *
 * Solve — Gauss-Jordan with per-step intermediate states
 * ------------------------------------------------------------------ */

/**
 * Gauss-Jordan 消元解 Ax = b，逐步记录中间矩阵状态。
 * 解的分类（秩在原始矩阵上计算，避免被消元污染）：
 *   rank(A) < rank([A|b])  → 无解
 *   rank(A) = rank([A|b]) = n  → 唯一解
 *   rank(A) = rank([A|b]) < n  → 无穷多解
 */
export function solveLinearSystemWithSteps(A: Matrix, b: number[]): LinearSystemSolution {
  const rows = A.length;
  const cols = A[0]?.length ?? 0;

  // Build augmented matrix
  const aug: number[][] = A.map((row, i) => [...row, b[i] ?? 0]);

  const steps: string[] = [];
  steps.push('\\text{增广矩阵 } [A|b] = ' + augmentedMatrixLatex(aug, cols));

  // Forward elimination with partial pivoting
  let pivotRow = 0;
  const eps = 1e-10;
  for (let c = 0; c < cols && pivotRow < rows; c++) {
    // Find pivot
    let maxIdx = -1;
    let maxAbs = eps;
    for (let r = pivotRow; r < rows; r++) {
      if (Math.abs(aug[r][c]) > maxAbs) {
        maxAbs = Math.abs(aug[r][c]);
        maxIdx = r;
      }
    }
    if (maxIdx === -1) continue; // free column

    if (maxIdx !== pivotRow) {
      [aug[maxIdx], aug[pivotRow]] = [aug[pivotRow], aug[maxIdx]];
      steps.push(`R_${maxIdx + 1} \\leftrightarrow R_${pivotRow + 1}: ` + augmentedMatrixLatex(aug, cols));
    }

    // Normalize pivot row
    const pv = aug[pivotRow][c];
    if (Math.abs(pv) > eps) {
      for (let k = c; k <= cols; k++) aug[pivotRow][k] /= pv;
      steps.push(`R_${pivotRow + 1} \\div ${numToLatex(pv)}: ` + augmentedMatrixLatex(aug, cols));
    }

    // Eliminate other rows
    for (let r = 0; r < rows; r++) {
      if (r === pivotRow) continue;
      const factor = aug[r][c];
      if (Math.abs(factor) > eps) {
        for (let k = c; k <= cols; k++) aug[r][k] -= factor * aug[pivotRow][k];
        steps.push(
          `R_${r + 1} - ${numToLatex(factor)} R_${pivotRow + 1}: ` + augmentedMatrixLatex(aug, cols),
        );
      }
    }
    pivotRow++;
  }

  const rankA = matrixRank(A);
  const augMat: Matrix = A.map((row, i) => [...row, b[i] ?? 0]);
  const rankAug = matrixRank(augMat);

  if (rankA < rankAug) {
    steps.push(
      `\\text{回代检查：} \\operatorname{rank}(A) = ${rankA} < \\operatorname{rank}([A|b]) = ${rankAug} \\Rightarrow \\text{无解}`,
    );
    return {
      kind: 'none',
      latex:
        '\\text{方程组无解 } (\\operatorname{rank}(A) = ' +
        rankA +
        ' < \\operatorname{rank}([A|b]) = ' +
        rankAug +
        ')',
      steps,
      rankA,
      rankAug,
      nUnknowns: cols,
    };
  }

  // Identify pivot columns
  const pivotCols: number[] = [];
  {
    let r = 0;
    for (let c = 0; c < cols && r < rows; c++) {
      if (Math.abs(aug[r][c]) > eps) {
        pivotCols.push(c);
        r++;
      }
    }
  }
  const freeCols: number[] = [];
  for (let c = 0; c < cols; c++) {
    if (!pivotCols.includes(c)) freeCols.push(c);
  }

  if (freeCols.length === 0 && pivotCols.length === cols) {
    // Unique solution
    const x = Array(cols).fill(0);
    for (let r = 0; r < rows; r++) {
      let pc = -1;
      for (let c = 0; c < cols; c++) {
        if (Math.abs(aug[r][c]) > eps) {
          pc = c;
          break;
        }
      }
      if (pc !== -1) x[pc] = aug[r][cols];
    }
    steps.push(`\\text{回代得唯一解：} x = ` + vectorToLatex(x));
    return {
      kind: 'unique',
      latex: 'x = ' + vectorToLatex(x),
      steps,
      vector: x,
      rankA,
      rankAug,
      nUnknowns: cols,
    };
  }

  // Infinite solutions: particular solution + null space basis
  const particular = Array(cols).fill(0);
  for (let i = 0; i < pivotCols.length; i++) {
    particular[pivotCols[i]] = aug[i][cols];
  }
  const nullBasis: number[][] = [];
  for (const fc of freeCols) {
    const v = Array(cols).fill(0);
    v[fc] = 1;
    for (let i = 0; i < pivotCols.length; i++) {
      v[pivotCols[i]] = -aug[i][fc];
    }
    nullBasis.push(v);
  }
  const terms: string[] = [vectorToLatex(particular)];
  for (let i = 0; i < nullBasis.length; i++) {
    terms.push(`+ t_{${i + 1}} ` + vectorToLatex(nullBasis[i]));
  }
  steps.push(
    `\\text{自由变量 } ${freeCols.length} \\text{ 个，通解 = 特解 + 零空间基的组合}`,
  );
  return {
    kind: 'infinite',
    latex: 'x = ' + terms.join(' '),
    steps,
    rankA,
    rankAug,
    nUnknowns: cols,
  };
}

/** 非线性方程组的数值方法说明步骤（Task 4.2） */
export function nonlinearSystemSteps(errorLine: string): string[] {
  return [
    `\\text{检测到非线性方程：} \\text{${errorLine.replace(/[&%$#_{}]/g, '')}}`,
    `\\text{非线性方程组无一般消元法，可用数值迭代：}`,
    `\\text{牛顿迭代：} x_{k+1} = x_k - J(x_k)^{-1} F(x_k) \\text{（} J \\text{ 为 Jacobi 矩阵）}`,
    `\\text{单方程情形可在 "数值求根" 中用二分法 / 牛顿法逐方程求解}`,
  ];
}
