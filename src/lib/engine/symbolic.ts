/**
 * OmniMath Pro — Symbolic computation via Algebrite
 *
 * Wraps Algebrite (a pure-JS Computer Algebra System) to provide:
 *   • Symbolic indefinite integration  ( ∫ x^2 dx → x^3/3 + C )
 *   • Symbolic limits                  ( lim_{x→0} sin(x)/x → 1 )
 *   • Taylor series expansion          ( taylor(e^x, x, 5, 0) → ... )
 *
 * Algebrite is loaded via dynamic import() so its ~1MB bundle stays out
 * of the initial page load. Callers must await these functions.
 *
 * All functions return { latex, steps, expression } where:
 *   - latex:      LaTeX string ready for KaTeX rendering
 *   - steps:      human-readable derivation steps (LaTeX strings)
 *   - expression: the raw Algebrite output (plain math notation)
 */

import { math } from './mathInstance';

export interface SymbolicResult {
  /** LaTeX-formatted result, suitable for KaTeX rendering. */
  latex: string;
  /** Human-readable derivation steps (each a LaTeX string). */
  steps: string[];
  /** Raw Algebrite output (plain math notation, no LaTeX). */
  expression: string;
  /** Whether the computation succeeded. */
  success: boolean;
  /** Error message if success === false. */
  error?: string;
}

/* ------------------------------------------------------------------ */
/*  Algebrite loader (singleton, dynamic import)                       */
/* ------------------------------------------------------------------ */

let algebritePromise: Promise<typeof import('algebrite')['default']> | null = null;

async function loadAlgebrite(): Promise<typeof import('algebrite')['default']> {
  if (!algebritePromise) {
    algebritePromise = import('algebrite').then((m) => m.default);
  }
  return algebritePromise;
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Compute the indefinite integral (antiderivative) of `expr` w.r.t. `varName`.
 * Example: symbolicIntegrate('x^2', 'x') → { latex: '\\frac{x^{3}}{3}', ... }
 */
export async function symbolicIntegrate(
  expr: string,
  varName: string,
): Promise<SymbolicResult> {
  try {
    const Algebrite = await loadAlgebrite();
    const normalized = normalizeExpression(expr);
    const expression = Algebrite.run(`integral(${normalized}, ${varName})`);
    const latex = Algebrite.run(`printlatex(integral(${normalized}, ${varName}))`);

    if (algebriteFailed(expression)) {
      return fail('该积分可能没有初等函数形式的闭式解（Algebrite 未返回结果）。可尝试定积分获取数值结果。');
    }

    return {
      latex: latex || expression,
      expression,
      steps: [
        `\\int ${latexExpr(normalized)} \\, d${varName}`,
        ...integrationHints(expr, varName),
        `= ${latex || latexExpr(expression)}`,
        `\\text{(常量 } C \\text{ 省略)}`,
      ],
      success: true,
    };
  } catch (err) {
    return fail(`符号积分失败：${(err as Error).message}`);
  }
}

/**
 * Compute the definite integral of `expr` w.r.t. `varName` from `a` to `b`.
 * Returns both the symbolic form and its numerical evaluation.
 */
export async function symbolicDefiniteIntegral(
  expr: string,
  varName: string,
  a: number,
  b: number,
): Promise<SymbolicResult & { numerical?: number }> {
  try {
    const Algebrite = await loadAlgebrite();
    const normalized = normalizeExpression(expr);
    const expression = Algebrite.run(`defint(${normalized}, ${varName}, ${a}, ${b})`);
    const latex = Algebrite.run(`printlatex(defint(${normalized}, ${varName}, ${a}, ${b}))`);

    // Algebrite 未给出闭式结果 → Simpson 数值回退（Task 4.3）
    if (algebriteFailed(expression)) {
      return simpsonFallback(expr, varName, a, b, latexExpr(normalized));
    }

    let numerical: number | undefined;
    try {
      const numStr = Algebrite.run(`float(defint(${normalized}, ${varName}, ${a}, ${b}))`);
      const parsed = parseFloat(numStr);
      if (!Number.isNaN(parsed)) numerical = parsed;
    } catch {
      // ignore numerical evaluation failure
    }

    return {
      latex: latex || expression,
      expression,
      numerical,
      steps: [
        `\\int_{${a}}^{${b}} ${latexExpr(normalized)} \\, d${varName}`,
        ...integrationHints(expr, varName),
        `= ${latex || latexExpr(expression)}`,
        ...(numerical !== undefined ? [`\\approx ${numerical}`] : []),
      ],
      success: true,
    };
  } catch {
    // 符号路径抛错 → Simpson 数值回退
    return simpsonFallback(expr, varName, a, b, undefined);
  }
}

/**
 * Compute the limit of `expr` as `varName` approaches `point`.
 * Falls back to a numeric approximation if the symbolic form is unavailable.
 */
export async function symbolicLimit(
  expr: string,
  varName: string,
  point: number | string,
): Promise<SymbolicResult & { numerical?: number }> {
  try {
    const Algebrite = await loadAlgebrite();
    const normalized = normalizeExpression(expr);
    const pt = typeof point === 'number' ? point.toString() : point;
    const expression = Algebrite.run(`limit(${normalized}, ${varName}, ${pt})`);
    const latex = Algebrite.run(`printlatex(limit(${normalized}, ${varName}, ${pt}))`);

    let numerical: number | undefined;
    try {
      const numStr = Algebrite.run(`float(limit(${normalized}, ${varName}, ${pt}))`);
      const parsed = parseFloat(numStr);
      if (!Number.isNaN(parsed)) numerical = parsed;
    } catch {
      // ignore
    }

    if (algebriteFailed(expression)) {
      // Fallback to numeric limit
      if (numerical !== undefined) {
        return {
          latex: numerical.toString(),
          expression: numerical.toString(),
          numerical,
          steps: [
            `\\lim_{${varName} \\to ${pt}} ${latexExpr(normalized)}`,
            `\\approx ${numerical}`,
          ],
          success: true,
        };
      }
      return fail('Algebrite could not compute this limit.');
    }

    return {
      latex: latex || expression,
      expression,
      numerical,
      steps: [
        `\\lim_{${varName} \\to ${pt}} ${latexExpr(normalized)}`,
        `= ${latex || latexExpr(expression)}`,
      ],
      success: true,
    };
  } catch (err) {
    return fail(`符号极限失败：${(err as Error).message}`);
  }
}

/**
 * Compute the Taylor series expansion of `expr` w.r.t. `varName` around `point`
 * up to order `order`.
 */
export async function symbolicSeries(
  expr: string,
  varName: string,
  order: number,
  point: number = 0,
): Promise<SymbolicResult> {
  try {
    const Algebrite = await loadAlgebrite();
    const normalized = normalizeExpression(expr);
    const expression = Algebrite.run(`taylor(${normalized}, ${varName}, ${order}, ${point})`);
    const latex = Algebrite.run(`printlatex(taylor(${normalized}, ${varName}, ${order}, ${point}))`);

    if (algebriteFailed(expression)) {
      return fail('Algebrite could not compute the Taylor series.');
    }

    return {
      latex: latex || expression,
      expression,
      steps: [
        `\\text{Taylor 级数展开 } ${latexExpr(normalized)} \\text{ 在 } ${varName} = ${point} \\text{ 处，阶数 } ${order}`,
        `= ${latex || latexExpr(expression)}`,
      ],
      success: true,
    };
  } catch (err) {
    return fail(`Taylor 展开失败：${(err as Error).message}`);
  }
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * 积分启发式提示（Task 4.3）：识别常见被积结构，输出对应的积分方法
 * 说明步骤（换元 / 分部 / 幂函数 / 基本公式）。仅作教学提示，不参与
 * 实际计算（计算由 Algebrite 完成）。
 */
function integrationHints(expr: string, varName: string): string[] {
  const hints: string[] = [];
  const e = expr.toLowerCase().replace(/\s+/g, '');
  const v = varName.toLowerCase();

  // 幂函数：x^n
  if (new RegExp(`^${v}\\^-?\\d+$`).test(e) || e === v) {
    hints.push(
      `\\text{幂函数积分：} \\int ${v}^{n} \\, d${v} = \\frac{${v}^{n+1}}{n+1} + C \\; (n \\neq -1)`,
    );
    return hints;
  }
  // 1/x
  if (e === `1/${v}` || e === `(${v})^(-1)` || e === `${v}^(-1)`) {
    hints.push(`\\text{对数积分：} \\int \\frac{1}{${v}} \\, d${v} = \\ln |${v}| + C`);
    return hints;
  }
  // 多项式
  if (/^[0-9a-z+\-*/^()]*$/.test(e) && e.includes(v) && !e.includes('(')) {
    hints.push(`\\text{逐项积分（和差法则）：} \\int (u \\pm v) \\, d${v} = \\int u \\, d${v} \\pm \\int v \\, d${v}`);
    return hints;
  }
  // 分部积分候选：x·(e^x|sin|cos|ln)
  const byPartsPatterns = [
    new RegExp(`${v}\\s*\\*\\s*(?:exp|e\\^|sin|cos|log|ln)\\s*\\(`),
    new RegExp(`(?:exp|e\\^|sin|cos|log|ln)\\s*\\([^)]*\\)\\s*\\*\\s*${v}\\b`),
  ];
  if (byPartsPatterns.some((re) => re.test(e))) {
    hints.push(
      `\\text{分部积分提示：} \\int u \\, dv = u v - \\int v \\, du \\text{（选 } u \\text{ 为易求导因子）}`,
    );
    return hints;
  }
  // 线性内层复合 → 换元：f(ax+b)
  const innerLinear = new RegExp(
    `(?:sin|cos|tan|exp|e\\^|log|ln|sqrt)\\s*\\(\\s*-?\\d*\\.?\\d*\\s*\\*?\\s*${v}\\s*[+\\-)]`,
  ).test(e) || new RegExp(`\\(\\s*-?\\d*\\.?\\d*\\s*\\*?\\s*${v}\\s*[+\\-][^)]*\\)\\s*\\^`).test(e);
  if (innerLinear) {
    hints.push(
      `\\text{换元提示：} u = a${v} + b，\\; \\int f(a${v}+b) \\, d${v} = \\frac{1}{a} F(a${v}+b) + C`,
    );
    return hints;
  }
  // f·f' 结构（如 sin(x)·cos(x)）
  if (/(sin|cos|tan|exp|log|ln)\s*\([^)]*\)\s*\*\s*(sin|cos|tan|exp|log|ln)\s*\(/.test(e)) {
    hints.push(`\\text{换元提示：} \\int f(${v}) \\cdot f'(${v}) \\, d${v} = \\frac{1}{2} f(${v})^2 + C`);
    return hints;
  }
  // 基本初等函数
  const basicMap: [RegExp, string][] = [
    [new RegExp(`^sin\\(${v}\\)$`), `\\text{基本公式：} \\int \\sin ${v} \\, d${v} = -\\cos ${v} + C`],
    [new RegExp(`^cos\\(${v}\\)$`), `\\text{基本公式：} \\int \\cos ${v} \\, d${v} = \\sin ${v} + C`],
    [new RegExp(`^(?:exp\\(${v}\\)|e\\^${v}|e\\^\\(${v}\\))$`), `\\text{基本公式：} \\int e^{${v}} \\, d${v} = e^{${v}} + C`],
    [new RegExp(`^(?:log|ln)\\(${v}\\)$`), `\\text{分部积分：} \\int \\ln ${v} \\, d${v} = ${v} \\ln ${v} - ${v} + C`],
  ];
  for (const [re, hint] of basicMap) {
    if (re.test(e)) {
      hints.push(hint);
      return hints;
    }
  }
  return hints;
}

/**
 * Simpson 1/3 数值积分回退（Task 4.3）：符号积分失败/无闭式解时，
 * 明确提示并给出数值结果。
 */
function simpsonFallback(
  expr: string,
  varName: string,
  a: number,
  b: number,
  normalizedLatex?: string,
): SymbolicResult & { numerical?: number } {
  try {
    const node = math.parse(expr);
    const f = (x: number): number => {
      try {
        const val = node.evaluate({ [varName]: x });
        return typeof val === 'number' ? val : NaN;
      } catch {
        return NaN;
      }
    };
    const n = 1000; // must be even
    const h = (b - a) / n;
    let sum = f(a) + f(b);
    for (let i = 1; i < n; i++) {
      const fx = f(a + i * h);
      if (!Number.isFinite(fx)) {
        return {
          ...fail('数值积分失败：被积函数在积分区间内存在不可求值点'),
        };
      }
      sum += (i % 2 === 0 ? 2 : 4) * fx;
    }
    const numerical = ((h / 3) * sum);
    const display = normalizedLatex ?? latexExpr(expr);
    return {
      latex: `\\approx ${parseFloat(numerical.toPrecision(8))}`,
      expression: String(numerical),
      numerical,
      steps: [
        `\\int_{${a}}^{${b}} ${display} \\, d${varName}`,
        `\\text{无法得到闭式符号解，改用 Simpson 数值积分（} n = ${n} \\text{）}`,
        `\\approx ${parseFloat(numerical.toPrecision(8))}`,
      ],
      success: true,
    };
  } catch (err) {
    return fail(`符号与数值积分均失败：${(err as Error).message}`);
  }
}

/**
 * Normalize a mathjs-style expression for Algebrite consumption.
 * Algebrite syntax is mostly compatible but has some differences:
 *   - `e^x` should be `exp(x)` (Algebrite's exp function)
 *   - `ln(x)` should be `log(x)` (Algebrite's natural log is `log`)
 *   - `pi` is recognized natively
 */
function normalizeExpression(expr: string): string {
  let out = expr.trim();
  // Convert e^x → exp(x) when e is used as base
  out = out.replace(/\be\^(\([^)]+\)|[a-zA-Z0-9_]+)/g, 'exp($1)');
  // Convert ln( → log(
  out = out.replace(/\bln\(/g, 'log(');
  return out;
}

/**
 * Escape an expression string for safe inclusion in a LaTeX context.
 * This is a minimal escape — Algebrite's printlatex already produces
 * valid LaTeX, so this is only used when we fall back to displaying
 * the raw expression.
 */
function latexExpr(expr: string): string {
  // If it already looks like LaTeX (contains backslash), leave it alone.
  if (expr.includes('\\')) return expr;
  // Otherwise, wrap math characters in a math environment.
  return `\\text{${expr.replace(/\\/g, '\\\\').replace(/\{/g, '\\{').replace(/\}/g, '\\}')}}`;
}

function fail(message: string): SymbolicResult {
  return {
    latex: '',
    expression: '',
    steps: [],
    success: false,
    error: message,
  };
}

/**
 * 检测 Algebrite 输出是否表示计算失败。
 * Algebrite 失败时可能返回空串、'nil'，或以 "Stop:" 开头的错误文本
 * （如 "Stop: integral: sorry, could not find a solution"），
 * 不能把这些当作有效结果展示。
 */
function algebriteFailed(s: string | null | undefined): boolean {
  if (!s) return true;
  const t = s.trim();
  if (t === '' || t === 'nil') return true;
  if (/^stop:/i.test(t)) return true;
  if (/could not find a solution/i.test(t)) return true;
  return false;
}
