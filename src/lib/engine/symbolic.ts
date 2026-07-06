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

    if (!expression || expression.trim() === '' || expression === 'nil') {
      return fail('Algebrite returned empty result — integral may not be expressible in closed form.');
    }

    return {
      latex: latex || expression,
      expression,
      steps: [
        `\\int ${latexExpr(normalized)} \\, d${varName}`,
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
        `= ${latex || latexExpr(expression)}`,
        ...(numerical !== undefined ? [`\\approx ${numerical}`] : []),
      ],
      success: true,
    };
  } catch (err) {
    return fail(`符号定积分失败：${(err as Error).message}`);
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

    if (!expression || expression.trim() === '' || expression === 'nil') {
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

    if (!expression || expression.trim() === '' || expression === 'nil') {
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
