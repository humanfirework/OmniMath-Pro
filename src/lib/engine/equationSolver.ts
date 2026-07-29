/**
 * OmniMath Pro — 方程求解引擎（纯逻辑，无 React）
 *
 * 从 SolverPanel 提取的方程求解核心逻辑，供以下两处共享：
 *   - 侧边栏 SolverPanel（方程 Tab）
 *   - 全屏 SolverWorkbench（方程页）
 *
 * 功能：
 *   1. 多项式方程 — mathjs rationalize 提取系数，Durand-Kerner 求全部复根，
 *      可选 Algebrite 符号解（dynamic import，不增加首屏体积）。
 *   2. 超越方程   — 区间扫描符号变化 + 二分逼近求实根。
 *   3. 分步说明   — 每个结果附带 steps（LaTeX 字符串，法则/方法名内联）。
 */

import { math } from './mathInstance';

/* ------------------------------------------------------------------ *
 * Types
 * ------------------------------------------------------------------ */

export interface ComplexRoot {
  re: number;
  im: number;
}

export interface EquationSolveResult {
  latex: string;
  roots: ComplexRoot[];
  kind: 'polynomial' | 'transcendental' | 'none' | 'symbolic';
  info?: string;
  /** 分步求解说明（LaTeX 字符串数组，供 SolverStepsView 渲染） */
  steps?: string[];
  symbolicLatex?: string;
  symbolicExpression?: string;
  symbolicFallback?: boolean;
}

export interface EquationSolveOptions {
  /** 数值解 / 符号解（符号解仅支持多项式，失败自动回退数值） */
  mode: 'numeric' | 'symbolic';
  /** 超越方程数值搜索区间 */
  rangeA: number;
  rangeB: number;
}

export interface EquationSolveOutput {
  result?: EquationSolveResult;
  error?: string;
  /** 非致命提示（如符号解失败回退数值解），由 UI 层 toast 展示 */
  warnings: string[];
}

/* ------------------------------------------------------------------ *
 * Number formatting helpers
 * ------------------------------------------------------------------ */

export function fmtNum(n: number, digits = 6): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  if (Math.abs(n) < 1e-12) return '0';
  const rounded = Math.round(n);
  if (Math.abs(n - rounded) < 1e-10) return String(rounded);
  return parseFloat(n.toPrecision(digits)).toString();
}

export function fmtComplex(c: ComplexRoot): string {
  const re = Math.abs(c.re) < 1e-10 ? 0 : c.re;
  const im = Math.abs(c.im) < 1e-10 ? 0 : c.im;
  if (im === 0) return fmtNum(re);
  if (re === 0) {
    if (im === 1) return 'i';
    if (im === -1) return '-i';
    return `${fmtNum(im)}i`;
  }
  const sign = im < 0 ? '-' : '+';
  const imAbs = Math.abs(im);
  const imPart = imAbs === 1 ? 'i' : `${fmtNum(imAbs)}i`;
  return `${fmtNum(re)} ${sign} ${imPart}`;
}

export function fmtComplexLatex(c: ComplexRoot): string {
  const text = fmtComplex(c);
  if (text === 'i') return 'i';
  if (text === '-i') return '-i';
  if (text.includes('i')) {
    // mixed or pure imaginary
    if (text.includes(' + ')) {
      const [re, im] = text.split(' + ');
      return `${re} + ${im}`;
    }
    if (text.includes(' - ')) {
      const idx = text.indexOf(' - ');
      const re = text.slice(0, idx);
      const im = text.slice(idx + 3);
      return `${re} - ${im}`;
    }
    return text; // pure imaginary like "2i"
  }
  return text;
}

/* ------------------------------------------------------------------ *
 * Polynomial helpers
 * ------------------------------------------------------------------ */

/** Try to parse the equation as a polynomial; if successful, return coefficients
 *  in ascending order (a0 + a1 x + a2 x^2 + ...). Returns null if not polynomial. */
export function tryGetPolyCoeffs(equation: string, varName: string): number[] | null {
  try {
    // Move lhs - rhs
    let expr = equation;
    if (equation.includes('=')) {
      const eqIdx = equation.indexOf('=');
      const lhs = equation.slice(0, eqIdx).trim();
      const rhs = equation.slice(eqIdx + 1).trim();
      expr = `(${lhs}) - (${rhs})`;
    }
    const r = math.rationalize(expr, {}, true) as {
      coefficients?: number[];
      variables?: string[];
    };
    if (r.coefficients && r.variables && r.variables.length === 1 && r.variables[0] === varName) {
      return r.coefficients;
    }
    return null;
  } catch {
    return null;
  }
}

/** Normalize a mathjs-style equation string for Algebrite consumption.
 *  Handles `=` sign (lhs - rhs) and Algebrite syntax differences:
 *    - `e^x` → `exp(x)` (Algebrite's exp function)
 *    - `ln(x)` → `log(x)` (Algebrite's natural log is `log`) */
export function normalizeForAlgebrite(equation: string): string {
  let expr = equation.trim();
  if (expr.includes('=')) {
    const eqIdx = expr.indexOf('=');
    const lhs = expr.slice(0, eqIdx).trim();
    const rhs = expr.slice(eqIdx + 1).trim();
    expr = `(${lhs}) - (${rhs})`;
  }
  // Convert e^x → exp(x) when e is used as base
  expr = expr.replace(/\be\^(\([^)]+\)|[a-zA-Z0-9_]+)/g, 'exp($1)');
  // Convert ln( → log(
  expr = expr.replace(/\bln\(/g, 'log(');
  return expr;
}

/** 升幂系数数组 → LaTeX 多项式（a0 + a1 x + a2 x^2 + …） */
export function coeffsToLatex(coeffs: number[], varName: string): string {
  const terms: string[] = [];
  for (let i = coeffs.length - 1; i >= 0; i--) {
    const c = coeffs[i];
    if (Math.abs(c) < 1e-14) continue;
    const absC = Math.abs(c);
    const sign = c < 0 ? '-' : '+';
    let term = '';
    if (i === 0) term = fmtNum(absC);
    else if (i === 1) term = absC === 1 ? `${varName}` : `${fmtNum(absC)} ${varName}`;
    else term = absC === 1 ? `${varName}^{${i}}` : `${fmtNum(absC)} ${varName}^{${i}}`;
    if (terms.length === 0) {
      terms.push(c < 0 ? `-${term}` : term);
    } else {
      terms.push(`${sign} ${term}`);
    }
  }
  return terms.length === 0 ? '0' : terms.join(' ');
}

/** Find all roots (real + complex) of a polynomial via Durand-Kerner method. */
export function polyRoots(coeffs: number[]): ComplexRoot[] {
  // Strip leading zeros (high-order)
  let c = [...coeffs];
  while (c.length > 1 && Math.abs(c[c.length - 1]) < 1e-14) c.pop();
  const n = c.length - 1;
  if (n <= 0) return [];

  if (n === 1) {
    return [{ re: -c[0] / c[1], im: 0 }];
  }

  if (n === 2) {
    const [a0, a1, a2] = c;
    const disc = a1 * a1 - 4 * a2 * a0;
    if (disc >= 0) {
      const s = Math.sqrt(disc);
      return [
        { re: (-a1 + s) / (2 * a2), im: 0 },
        { re: (-a1 - s) / (2 * a2), im: 0 },
      ];
    }
    const s = Math.sqrt(-disc);
    return [
      { re: -a1 / (2 * a2), im: s / (2 * a2) },
      { re: -a1 / (2 * a2), im: -s / (2 * a2) },
    ];
  }

  // Durand-Kerner: roots = initial guesses on a circle, iterate.
  // Normalize so leading coefficient = 1.
  const lead = c[n];
  const a = c.map((v) => v / lead);
  // Initial guesses: complex circle
  const r0 = Math.pow(Math.abs(a[0]) + 1, 1 / n);

  // Build initial guesses, optionally with random perturbation to escape
  // divergence or stagnation when the default seed happens to be unlucky.
  const initGuesses = (perturb: boolean): ComplexRoot[] => {
    const guesses: ComplexRoot[] = [];
    for (let k = 0; k < n; k++) {
      const baseAngle = (2 * Math.PI * k) / n + 0.4;
      const angle = perturb ? baseAngle + (Math.random() - 0.5) * 0.5 : baseAngle;
      const radius = perturb ? r0 * (0.8 + Math.random() * 0.4) : r0;
      guesses.push({ re: radius * Math.cos(angle), im: radius * Math.sin(angle) });
    }
    return guesses;
  };

  let roots: ComplexRoot[] = initGuesses(false);
  const polyEval = (z: ComplexRoot): ComplexRoot => {
    // Horner's method with complex arithmetic
    let acc: ComplexRoot = { re: 0, im: 0 };
    for (let i = a.length - 1; i >= 0; i--) {
      // acc = acc * z + a[i]
      const re = acc.re * z.re - acc.im * z.im + a[i];
      const im = acc.re * z.im + acc.im * z.re;
      acc = { re, im };
    }
    return acc;
  };
  const complexSub = (x: ComplexRoot, y: ComplexRoot): ComplexRoot => ({
    re: x.re - y.re,
    im: x.im - y.im,
  });
  const complexMul = (x: ComplexRoot, y: ComplexRoot): ComplexRoot => ({
    re: x.re * y.re - x.im * y.im,
    im: x.re * y.im + x.im * y.re,
  });
  const complexDiv = (x: ComplexRoot, y: ComplexRoot): ComplexRoot => {
    const d = y.re * y.re + y.im * y.im;
    if (d < 1e-30) return { re: 0, im: 0 };
    return { re: (x.re * y.re + x.im * y.im) / d, im: (x.im * y.re - x.re * y.im) / d };
  };
  const complexAbs = (z: ComplexRoot): number => Math.sqrt(z.re * z.re + z.im * z.im);

  // Iteration loop: max 500 iterations (>= 200 requirement).
  // Re-initialize guesses with perturbation every 100 iterations if not
  // converged, and also whenever divergence is detected (roots blowing up).
  const MAX_ITER = 500;
  for (let iter = 0; iter < MAX_ITER; iter++) {
    // Re-initialize with perturbed guesses after every 100 stagnant iterations
    if (iter > 0 && iter % 100 === 0) {
      roots = initGuesses(true);
    }
    let maxChange = 0;
    let diverging = false;
    const newRoots: ComplexRoot[] = [];
    for (let i = 0; i < n; i++) {
      const num = polyEval(roots[i]);
      let den: ComplexRoot = { re: 1, im: 0 };
      for (let j = 0; j < n; j++) {
        if (j !== i) den = complexMul(den, complexSub(roots[i], roots[j]));
      }
      const delta = complexDiv(num, den);
      const newR = complexSub(roots[i], delta);
      newRoots.push(newR);
      const change = complexAbs(delta);
      if (!Number.isFinite(change) || change > 1e15) {
        diverging = true;
      }
      maxChange = Math.max(maxChange, change);
    }
    roots = newRoots;
    // Divergence detected: re-seed with perturbed guesses and continue
    if (diverging) {
      roots = initGuesses(true);
      continue;
    }
    // Convergence: stop when root differences fall below 1e-10
    if (maxChange < 1e-10) break;
  }

  // Clean up: snap near-real roots to real
  return roots.map((r) => ({
    re: r.re,
    im: Math.abs(r.im) < 1e-9 * (1 + Math.abs(r.re)) ? 0 : r.im,
  }));
}

/** Find numeric real roots of f(varName) in [a, b] via sign-change + bisection. */
export function findRealRoots(
  fn: (x: number) => number,
  a: number,
  b: number,
  step = 0.05,
): number[] {
  const roots: number[] = [];
  let prev = fn(a);
  for (let x = a + step; x <= b; x += step) {
    const cur = fn(x);
    if (Number.isFinite(prev) && Number.isFinite(cur)) {
      if ((prev < 0 && cur > 0) || (prev > 0 && cur < 0)) {
        // Bisect
        let lo = x - step;
        let hi = x;
        for (let i = 0; i < 80; i++) {
          const mid = (lo + hi) / 2;
          const fm = fn(mid);
          if (!Number.isFinite(fm)) break;
          if (Math.abs(fm) < 1e-12) {
            lo = mid;
            hi = mid;
            break;
          }
          if (Math.sign(fm) === Math.sign(fn(lo))) lo = mid;
          else hi = mid;
        }
        const r = (lo + hi) / 2;
        if (!roots.some((q) => Math.abs(q - r) < 1e-5)) roots.push(r);
      }
    }
    prev = cur;
  }
  return roots;
}

/* ------------------------------------------------------------------ *
 * Steps builders — 分步说明（法则/方法名内联进 LaTeX 字符串）
 * ------------------------------------------------------------------ */

/** 多项式数值求解的分步说明（按次数选择求根方法描述） */
function polySteps(coeffs: number[], varName: string, roots: ComplexRoot[]): string[] {
  const deg = coeffs.length - 1;
  const steps: string[] = [
    `\\text{识别为多项式方程：} ${coeffsToLatex(coeffs, varName)} = 0`,
    `\\text{次数：} ${deg}`,
  ];
  if (deg === 1) {
    steps.push(`\\text{一次方程，移项求解：} ${varName} = -\\frac{a_0}{a_1}`);
  } else if (deg === 2) {
    const [a0, a1, a2] = coeffs;
    const disc = a1 * a1 - 4 * a2 * a0;
    steps.push(
      `\\text{求根公式：} ${varName} = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}`,
      `\\text{判别式：} \\Delta = b^2 - 4ac = ${fmtNum(disc)}` +
        (disc >= 0 ? ' \\ge 0 \\; \\text{（两实根）}' : ' < 0 \\; \\text{（一对共轭复根）}'),
    );
  } else {
    steps.push(`\\text{Durand-Kerner 迭代法求全部 } ${deg} \\text{ 个复根（含实根）}`);
  }
  const realRoots = roots.filter((r) => Math.abs(r.im) < 1e-9);
  const complexRoots = roots.filter((r) => Math.abs(r.im) >= 1e-9);
  if (realRoots.length > 0) {
    steps.push(`\\text{实根：} ${realRoots.map((r) => fmtComplexLatex(r)).join(', ')}`);
  }
  if (complexRoots.length > 0) {
    steps.push(`\\text{复根：} ${complexRoots.map((r) => fmtComplexLatex(r)).join(', ')}`);
  }
  return steps;
}

/* ------------------------------------------------------------------ *
 * Main entry — solveEquation
 * ------------------------------------------------------------------ */

/**
 * 求解单变量方程。逻辑与 UI 解耦：不弹 toast，警告通过返回值交给调用方。
 *
 * 流程：先尝试识别为多项式（rationalize），符号模式下用 Algebrite 求
 * 精确解；否则/回退走数值路径（Durand-Kerner 或区间扫描 + 二分）。
 */
export async function solveEquation(
  equation: string,
  varName: string,
  opts: EquationSolveOptions,
): Promise<EquationSolveOutput> {
  const warnings: string[] = [];
  try {
    if (!equation.trim()) {
      return { warnings, error: '请输入方程' };
    }

    // Try polynomial first
    const coeffs = tryGetPolyCoeffs(equation, varName);
    const isPoly = coeffs && coeffs.length > 1;

    // Symbolic mode: try Algebrite for polynomial equations.
    if (opts.mode === 'symbolic' && isPoly) {
      try {
        const Algebrite = (await import('algebrite')).default;
        const polyExpr = normalizeForAlgebrite(equation);
        const symbolicExpression = Algebrite.run(`roots(${polyExpr}, ${varName})`);
        const symbolicLatex = Algebrite.run(`printlatex(roots(${polyExpr}, ${varName}))`);

        if (symbolicExpression && symbolicExpression.trim() !== '' && symbolicExpression !== 'nil') {
          // Also compute numeric roots for side-by-side comparison
          const roots = polyRoots(coeffs);
          const realRoots = roots.filter((r) => Math.abs(r.im) < 1e-9);
          const complexRoots = roots.filter((r) => Math.abs(r.im) >= 1e-9);

          const polyLatex = coeffsToLatex(coeffs, varName);
          return {
            warnings,
            result: {
              latex: `${polyLatex} = 0`,
              roots,
              kind: 'symbolic',
              info: `符号解 · ${realRoots.length} 实根, ${complexRoots.length} 复根, 次数 ${coeffs.length - 1}`,
              steps: [
                `\\text{识别为多项式方程：} ${polyLatex} = 0`,
                `\\text{Algebrite 符号求根：} \\operatorname{roots}\\left(${polyLatex}\\right)`,
                `\\text{符号解：} ${varName} \\in ${symbolicLatex || symbolicExpression}`,
                ...polySteps(coeffs, varName, roots).slice(2),
              ],
              symbolicLatex: symbolicLatex || symbolicExpression,
              symbolicExpression,
            },
          };
        }
        // Algebrite returned nil/empty → fall back to numeric
        warnings.push('Algebrite 未返回有效符号解，已回退到数值解');
      } catch {
        // Algebrite threw → fall back to numeric
        warnings.push('符号解失败，已回退到数值解');
      }
    } else if (opts.mode === 'symbolic' && !isPoly) {
      warnings.push('符号解仅支持多项式方程，已回退到数值解');
    }

    // Numeric mode (or symbolic fallback)
    if (isPoly) {
      const roots = polyRoots(coeffs);
      const realRoots = roots.filter((r) => Math.abs(r.im) < 1e-9);
      const complexRoots = roots.filter((r) => Math.abs(r.im) >= 1e-9);

      const rootLatex = roots
        .map((r, i) => `${varName}_{${i + 1}} = ${fmtComplexLatex(r)}`)
        .join(', \\quad ');

      const polyLatex = coeffsToLatex(coeffs, varName);
      const latex = `${rootLatex} \\\\[8pt] \\text{次数: } ${coeffs.length - 1}`;
      return {
        warnings,
        result: {
          latex,
          roots,
          kind: 'polynomial',
          info: `${realRoots.length} 实根, ${complexRoots.length} 复根, 次数 ${coeffs.length - 1}`,
          steps: polySteps(coeffs, varName, roots),
          symbolicFallback: opts.mode === 'symbolic',
        },
      };
    }

    // Transcendental: numeric root finding in the specified range
    let expr = equation;
    if (equation.includes('=')) {
      const eqIdx = equation.indexOf('=');
      const lhs = equation.slice(0, eqIdx).trim();
      const rhs = equation.slice(eqIdx + 1).trim();
      expr = `(${lhs}) - (${rhs})`;
    }
    const node = math.parse(expr);
    const fn = (x: number) => {
      try {
        const v = node.evaluate({ [varName]: x });
        return typeof v === 'number' ? v : NaN;
      } catch {
        return NaN;
      }
    };
    const realRoots = findRealRoots(fn, opts.rangeA, opts.rangeB, (opts.rangeB - opts.rangeA) / 400);

    if (realRoots.length === 0) {
      return {
        warnings,
        result: {
          latex: `\\text{在 } [${fmtNum(opts.rangeA)}, ${fmtNum(opts.rangeB)}] \\text{ 内未找到实根}`,
          roots: [],
          kind: 'none',
          info: `范围 [${opts.rangeA}, ${opts.rangeB}]`,
          steps: [
            `\\text{超越方程，化为 } f(${varName}) = 0 \\text{ 形式}`,
            `\\text{在 } [${fmtNum(opts.rangeA)}, ${fmtNum(opts.rangeB)}] \\text{ 内扫描 } f(${varName}) \\text{ 的符号变化}`,
            `\\text{未检测到符号变化 — 区间内无实根（或仅有偶重根）}`,
          ],
          symbolicFallback: opts.mode === 'symbolic',
        },
      };
    }

    const rootLatex = realRoots
      .map((r, i) => `${varName}_{${i + 1}} = ${fmtNum(r)}`)
      .join(', \\quad ');
    return {
      warnings,
      result: {
        latex: rootLatex,
        roots: realRoots.map((r) => ({ re: r, im: 0 })),
        kind: 'transcendental',
        info: `数值解 (在 [${fmtNum(opts.rangeA)}, ${fmtNum(opts.rangeB)}] 内找到 ${realRoots.length} 个根)`,
        steps: [
          `\\text{超越方程，化为 } f(${varName}) = 0 \\text{ 形式}`,
          `\\text{区间扫描：在 } [${fmtNum(opts.rangeA)}, ${fmtNum(opts.rangeB)}] \\text{ 内检测 } f(${varName}) \\text{ 的符号变化}`,
          `\\text{二分法逼近每个符号变化区间，找到 } ${realRoots.length} \\text{ 个实根}`,
        ],
        symbolicFallback: opts.mode === 'symbolic',
      },
    };
  } catch (err) {
    return { warnings, error: (err as Error).message || '求解失败' };
  }
}
