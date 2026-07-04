/**
 * OmniMath Pro — Main calculation engine
 *
 * Public surface (see index.ts):
 *   - evaluateExpression(input, mode)   — the entry point used by the UI
 *   - getScope(), resetScope(), setScopeVar(name, value)
 *   - (re-exports the LaTeX / parser / symbol helpers)
 *
 * Responsibilities:
 *   1. Configure a single mathjs instance (override log → base-10 default,
 *      add ln / lg / arctan / arcsin / arccos / taylor / limit / integrate /
 *      solve aliases).
 *   2. Maintain a module-level scope (variables, matrices, user functions).
 *   3. Detect input type and dispatch: assignment / plot / polar /
 *      solve / calculus / matrix / plain scalar / auto-plot.
 *   4. Wrap results in an `EvalResult` envelope with LaTeX for KaTeX.
 *
 * Critical correctness notes:
 *   - Matrix / Array detection runs BEFORE BigNumber / scalar formatting.
 *   - Errors return `{ success: false, type: 'error' }` with a friendly
 *     message + optional hint, never throw to the caller.
 */

import { create, all, type MathJsInstance } from 'mathjs';
import type {
  EvalResult,
  InputMode,
  Scope,
  PlotType,
} from './types';
import {
  DEFAULT_CARTESIAN_RANGE,
  DEFAULT_POLAR_RANGE,
} from './types';
import { normalizeSymbols } from './symbols';
import { preprocessForMode } from './parser';
import {
  inputToLatex,
  resultToLatex,
  formatNumber,
} from './latex';

/* ================================================================== *
 * mathjs instance — configured once
 * ================================================================== */
const math: MathJsInstance = create(all);

/* Save a reference to the ORIGINAL `log` before we override it, so the
 * override can delegate without infinite recursion (the previous engine
 * had `math.log` calling itself → stack overflow on `log(100)`). */
const originalLog = (math as any).log.bind(math);

/* Override `log` so `log(100)` returns 2 (base-10) instead of 4.605
 * (natural). Users can still call `log(8, 2)` for an explicit base.
 * `ln` is added as the natural-log alias for users coming from math
 * textbooks. */
math.import(
  {
    log: function (x: any, base?: any) {
      if (base === undefined) return originalLog(x, 10);
      return originalLog(x, base);
    },
    ln: function (x: any) {
      return originalLog(x, Math.E);
    },
    lg: function (x: any) {
      return originalLog(x, 10);
    },
    // Friendly inverse-trig aliases that the symbol palette advertises.
    arctan: function (x: any) {
      return math.atan(x);
    },
    arcsin: function (x: any) {
      return math.asin(x);
    },
    arccos: function (x: any) {
      return math.acos(x);
    },
  },
  { override: true }
);

/* ================================================================== *
 * Module-level scope
 * ================================================================== *
 * Plain object so mathjs can read/write user variables. Functions
 * stored as `mathjs FunctionNode`-evaluable objects work too — mathjs
 * treats any callable value in scope as a function.
 */
let scope: Scope = {};

export function getScope(): Scope {
  return scope;
}

export function resetScope(): void {
  scope = {};
}

export function setScopeVar(name: string, value: any): void {
  scope[name] = value;
}

/* ================================================================== *
 * Main entry — evaluateExpression
 * ================================================================== */
export function evaluateExpression(
  rawInput: string,
  mode: InputMode = 'simple'
): EvalResult {
  /* 0. Empty / whitespace guard. */
  if (!rawInput || !rawInput.trim()) {
    return fail('Expression is empty.', 'Type something to evaluate, e.g. `2 + 2`.');
  }

  /* 1. Strip line comments (`#…` or `//…`) so multi-line scripts work. */
  const input = stripComments(rawInput).trim();
  if (!input) {
    return fail('Expression is empty.', 'Type something to evaluate, e.g. `2 + 2`.');
  }

  /* 2. Normalize symbols + run mode-specific lenient preprocessing.
   *    We keep both the normalized text (for evaluation) and the
   *    LaTeX preview (uses the normalized form too). */
  let normalized: string;
  try {
    normalized = preprocessForMode(normalizeSymbols(input), mode);
  } catch (err) {
    return fail(`Failed to parse input: ${(err as Error).message}`);
  }

  /* 3. Dispatch on detected intent. */
  try {
    // ── Assignment: `a = …`, `M = […]`, `f(x) = …` ───────────────
    if (isAssignment(input)) {
      return handleAssignment(normalized, input, mode);
    }

    // ── Polar plot ──────────────────────────────────────────────
    if (/^\s*polar(?:plot)?\s*\(/.test(normalized)) {
      return handlePlot(normalized, mode, 'polar');
    }

    // ── Cartesian plot ──────────────────────────────────────────
    if (/^\s*plot\s*\(/.test(normalized)) {
      return handlePlot(normalized, mode, 'cartesian');
    }

    // ── Equation solve ──────────────────────────────────────────
    if (/^\s*solve\s*\(/.test(normalized)) {
      return handleSolve(normalized, mode);
    }

    // ── Calculus verbs ──────────────────────────────────────────
    if (/^\s*(?:derivative|diff)\s*\(/.test(normalized)) {
      return handleDerivative(normalized, mode);
    }
    if (/^\s*integrate\s*\(/.test(normalized)) {
      return handleIntegrate(normalized, mode);
    }
    if (/^\s*limit\s*\(/.test(normalized)) {
      return handleLimit(normalized, mode);
    }
    if (/^\s*taylor\s*\(/.test(normalized)) {
      return handleTaylor(normalized, mode);
    }

    // ── Linear-algebra helpers (verbs that aren't mathjs built-ins) ──
    if (/^\s*eigenvectors?\s*\(/.test(normalized)) {
      return handleEigenvectors(normalized);
    }

    // ── Auto-plot in simple mode (free `x` variable, no assignment) ──
    if (mode === 'simple' && hasFreeVariableX(normalized, scope)) {
      return handlePlot(normalized, mode, 'cartesian', /* auto */ true);
    }

    // ── Default: plain scalar / matrix / symbolic evaluation ─────
    return handlePlain(normalized, input, mode);
  } catch (err) {
    return failWithHint(err as Error, input);
  }
}

/* ================================================================== *
 * Helpers — input classification
 * ================================================================== */

function stripComments(input: string): string {
  // Remove `#…` and `//…` line comments. Skip inside strings — too edge-case
  // for a math REPL, accept the small risk.
  return input
    .split('\n')
    .map((line) => {
      const hashIdx = line.indexOf('#');
      const slashIdx = line.indexOf('//');
      const idxs = [hashIdx, slashIdx].filter((i) => i >= 0);
      if (idxs.length === 0) return line;
      const cut = Math.min(...idxs);
      return line.slice(0, cut);
    })
    .join('\n');
}

/** `a = 5`, `M = [...]`, `f(x) = x^2` — but NOT `a == b` (comparison). */
function isAssignment(input: string): boolean {
  // Reject `==`, `===`, `<=`, `>=`, `!=`.
  if (/===|==|<=|>=|!=/.test(input)) return false;
  // Match `IDENT =` or `IDENT(...) =` (function def).
  return /^\s*[a-zA-Z_][a-zA-Z0-9_]*(?:\s*\([^)]*\))?\s*=/.test(input);
}

/** Does the expression contain `x` as a free (undefined) variable? */
function hasFreeVariableX(expr: string, scope: Scope): boolean {
  try {
    const node = math.parse(expr);
    let found = false;
    node.traverse((n: any) => {
      if (n.isSymbolNode && n.name === 'x' && !(n.name in scope)) {
        found = true;
      }
    });
    return found;
  } catch {
    return false;
  }
}

/** Extract balanced parenthesised arguments from `name(arg1, arg2, …)`. */
function extractArgs(input: string, fnName: string): string[] | null {
  const re = new RegExp(`^\\s*${fnName}\\s*\\(`);
  const m = re.exec(input);
  if (!m) return null;
  const start = m[0].length - 1; // index of `(`
  // Walk to matching close paren.
  let depth = 0;
  let end = -1;
  let inStr: string | null = null;
  for (let i = start; i < input.length; i++) {
    const c = input[i];
    if (inStr) {
      if (c === inStr && input[i - 1] !== '\\') inStr = null;
      continue;
    }
    if (c === '"' || c === "'") {
      inStr = c;
      continue;
    }
    if (c === '(') depth++;
    else if (c === ')') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) return null;
  const inner = input.slice(start + 1, end);
  // Split on top-level commas.
  return splitTopLevelCommas(inner);
}

function splitTopLevelCommas(s: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let inStr: string | null = null;
  let buf = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      buf += c;
      if (c === inStr && s[i - 1] !== '\\') inStr = null;
      continue;
    }
    if (c === '"' || c === "'") {
      inStr = c;
      buf += c;
      continue;
    }
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth--;
    if (c === ',' && depth === 0) {
      parts.push(buf.trim());
      buf = '';
    } else {
      buf += c;
    }
  }
  if (buf.trim()) parts.push(buf.trim());
  return parts;
}

/* ================================================================== *
 * Handler — assignment
 * ================================================================== */
function handleAssignment(
  normalized: string,
  original: string,
  mode: InputMode
): EvalResult {
  // Match `name = rhs` or `name(args) = rhs` (function def).
  // We split on the FIRST `=` that is not `==`/`<=`/`>=`/`!=`.
  const eqIdx = findAssignmentEq(normalized);
  if (eqIdx === -1) {
    return fail('Could not parse assignment.');
  }
  const lhs = normalized.slice(0, eqIdx).trim();
  const rhs = normalized.slice(eqIdx + 1).trim();

  // Function definition: `f(x) = x^2`
  const fnMatch = /^([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^)]*)\)$/.exec(lhs);
  if (fnMatch) {
    const fname = fnMatch[1];
    const params = fnMatch[2]
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    try {
      // Build a JS function that evaluates the body with the params in scope.
      const bodyNode = math.parse(rhs);
      const fn = (...args: any[]) => {
        const localScope: Scope = { ...scope };
        params.forEach((p, i) => (localScope[p] = args[i]));
        return bodyNode.evaluate(localScope);
      };
      scope[fname] = fn;
      const latex = `${fname}(${params.join(', ')}) = ${inputToLatex(rhs, mode)}`;
      return ok({
        result: `${fname}(${params.join(', ')}) = ${rhs}`,
        latex,
        type: 'assignment',
        variables: snapshotScope(),
      });
    } catch (err) {
      return fail(`Failed to define function: ${(err as Error).message}`);
    }
  }

  // Plain variable assignment.
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(lhs)) {
    return fail(`Invalid variable name: "${lhs}".`, 'Use letters, digits and underscores only.');
  }

  try {
    const value = math.evaluate(rhs, scope);
    scope[lhs] = value;

    // Compose a friendly result string + LaTeX.
    let resultStr: string;
    let latexStr: string;
    if (math.isMatrix(value) || Array.isArray(value)) {
      resultStr = `${lhs} = ${math.format(value, { precision: 6 })}`;
      latexStr = `${lhs} = ${resultToLatex(value)}`;
    } else if (math.typeOf && math.typeOf(value) === 'Complex') {
      resultStr = `${lhs} = ${math.format(value, { precision: 6 })}`;
      latexStr = `${lhs} = ${resultToLatex(value)}`;
    } else {
      resultStr = `${lhs} = ${math.format(value, { precision: 6 })}`;
      latexStr = `${lhs} = ${resultToLatex(value)}`;
    }

    return ok({
      result: resultStr,
      latex: latexStr,
      type: 'assignment',
      variables: snapshotScope(),
    });
  } catch (err) {
    return fail(`Failed to evaluate "${rhs}": ${(err as Error).message}`);
  }
}

/** Find the index of the first `=` that is a real assignment (not `==`,
 *  `<=`, `>=`, `!=`, `===`). Returns -1 if none. */
function findAssignmentEq(s: string): number {
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== '=') continue;
    const prev = s[i - 1];
    const next = s[i + 1];
    if (next === '=') continue; // ==
    if (prev === '=' || prev === '<' || prev === '>' || prev === '!' || prev === '=') continue;
    return i;
  }
  return -1;
}

/* ================================================================== *
 * Handler — plots (cartesian + polar, with optional range)
 * ================================================================== */
function handlePlot(
  normalized: string,
  mode: InputMode,
  plotType: PlotType,
  auto = false
): EvalResult {
  let expr: string;
  let range: [number, number] =
    plotType === 'polar'
      ? [...DEFAULT_POLAR_RANGE]
      : [...DEFAULT_CARTESIAN_RANGE];

  if (auto) {
    // Auto-plot: the whole `normalized` string IS the expression
    // (e.g. `sin(x)`), there's no `plot(...)` wrapper.
    expr = normalized;
  } else {
    const fnName = plotType === 'polar' ? 'polar(?:plot)?' : 'plot';
    const args = extractArgs(normalized, fnName);
    if (!args || args.length === 0) {
      return fail(`Invalid plot syntax. Try: plot(sin(x))`);
    }
    expr = args[0];
    if (args.length >= 3) {
      try {
        const lo = math.evaluate(args[1], scope);
        const hi = math.evaluate(args[2], scope);
        if (typeof lo === 'number' && typeof hi === 'number') {
          range = [lo, hi];
        }
      } catch {
        // Ignore bad range args; fall back to defaults.
      }
    }
  }

  const latexExpr = inputToLatex(expr, mode);
  // Explicit `plot(...)` keeps the equation label; auto-plot in simple mode
  // is intentionally minimal so the output doesn't feel like it has a prefix.
  const label = auto
    ? latexExpr
    : plotType === 'polar'
      ? `r = ${latexExpr}`
      : `y = ${latexExpr}`;
  const resultStr = auto
    ? expr
    : plotType === 'polar'
      ? `r = ${expr}`
      : `y = ${expr}`;

  return ok({
    result: resultStr,
    latex: label,
    type: plotType === 'polar' ? 'polar' : 'plot',
    plotExpression: expr,
    plotRange: range,
    plotType,
  });
}

/* ================================================================== *
 * Handler — equation solving
 * ================================================================== *
 * Two forms supported:
 *   solve(equation, var)                  → 1D root finding (numerical scan)
 *   solve(A, b)                           → linear system Ax = b
 *
 * `equation` may contain `=` (e.g. `x^2 - 5*x + 6 = 0`); we move
 * everything to one side automatically.
 */
function handleSolve(normalized: string, _mode: InputMode): EvalResult {
  const args = extractArgs(normalized, 'solve');
  if (!args || args.length < 1) {
    return fail('solve() needs at least one argument.');
  }

  // ── Linear system form: solve(A, b) ─────────────────────────
  if (args.length === 2) {
    const first = args[0].trim();
    const second = args[1].trim();
    if (first.startsWith('[') || first.startsWith('matrix(')) {
      try {
        const A = math.evaluate(first, scope);
        const b = math.evaluate(second, scope);
        const x = math.lusolve(A, b);
        return ok({
          result: `x = ${math.format(x, { precision: 6 })}`,
          latex: `x = ${resultToLatex(x)}`,
          type: 'equation',
          isMatrix: true,
          matrix: toMatrixArray(x),
        });
      } catch (err) {
        return fail(`Linear solve failed: ${(err as Error).message}`);
      }
    }
  }

  // ── 1D root finding: solve(equation, var) ───────────────────
  const eqRaw = args[0];
  const varName = args.length > 1 ? args[1].trim() : 'x';

  // Move `lhs = rhs` → `lhs - rhs`.
  let exprStr = eqRaw;
  if (eqRaw.includes('=')) {
    const eqIdx = findAssignmentEq(eqRaw);
    if (eqIdx !== -1) {
      const lhs = eqRaw.slice(0, eqIdx).trim();
      const rhs = eqRaw.slice(eqIdx + 1).trim();
      exprStr = `(${lhs}) - (${rhs})`;
    }
  }

  try {
    const node = math.parse(exprStr);
    const roots = findRootsNumerically(node, varName, scope);
    if (roots.length === 0) {
      return ok({
        result: `No real roots found for ${varName} in [-100, 100].`,
        latex: `\\text{No real roots found for } ${varName}`,
        type: 'equation',
      });
    }
    const cleaned = roots.map(cleanRoot);
    const steps = [
      `\\text{Equation: } ${inputToLatex(eqRaw, 'simple')}`,
      `\\text{Variable: } ${varName}`,
      `\\text{Found } ${cleaned.length} \\text{ real root(s):}`,
      ...cleaned.map((r, i) => `${varName}_{${i + 1}} = ${formatNumber(r)}`),
    ];
    return ok({
      result: `${varName} = ${cleaned.map((r) => formatNumber(r)).join(', ')}`,
      latex: cleaned
        .map((r, i) => `${varName}_{${i + 1}} = ${formatNumber(r)}`)
        .join(', \\quad '),
      type: 'equation',
      steps,
    });
  } catch (err) {
    return fail(`solve() failed: ${(err as Error).message}`);
  }
}

/** Scan [-100, 100] in 0.1 steps for sign changes; refine each by bisection. */
function findRootsNumerically(
  node: any,
  varName: string,
  scope: Scope
): number[] {
  const f = (x: number) => {
    try {
      const v = node.evaluate({ ...scope, [varName]: x });
      return typeof v === 'number' ? v : NaN;
    } catch {
      return NaN;
    }
  };

  const roots: number[] = [];
  const lo = -100;
  const hi = 100;
  const step = 0.1;
  let prev = f(lo);
  for (let x = lo + step; x <= hi; x += step) {
    const cur = f(x);
    if (Number.isFinite(prev) && Number.isFinite(cur)) {
      if ((prev < 0 && cur > 0) || (prev > 0 && cur < 0)) {
        const r = bisect(f, x - step, x, 200);
        if (r !== null && !roots.some((q) => Math.abs(q - r) < 1e-4)) {
          roots.push(r);
        }
      } else if (cur === 0) {
        if (!roots.some((q) => Math.abs(q - x) < 1e-4)) roots.push(x);
      }
    }
    prev = cur;
  }
  return roots;
}

function bisect(f: (x: number) => number, a: number, b: number, maxIters: number): number | null {
  let lo = a;
  let hi = b;
  let flo = f(lo);
  let fhi = f(hi);
  if (!Number.isFinite(flo) || !Number.isFinite(fhi) || Math.sign(flo) === Math.sign(fhi)) {
    return null;
  }
  for (let i = 0; i < maxIters; i++) {
    const mid = (lo + hi) / 2;
    const fmid = f(mid);
    if (!Number.isFinite(fmid)) return null;
    if (Math.abs(fmid) < 1e-12 || (hi - lo) / 2 < 1e-12) return mid;
    if (Math.sign(fmid) === Math.sign(flo)) {
      lo = mid;
      flo = fmid;
    } else {
      hi = mid;
      fhi = fmid;
    }
  }
  return (lo + hi) / 2;
}

/** Snap a numerical root to a clean integer / simple fraction if close. */
function cleanRoot(r: number): number {
  const rounded = Math.round(r);
  if (Math.abs(r - rounded) < 1e-6) return rounded;
  // Try simple fractions p/q with q in [2..12].
  for (let q = 2; q <= 12; q++) {
    const p = Math.round(r * q);
    if (Math.abs(r - p / q) < 1e-6) return p / q;
  }
  return Math.round(r * 1e6) / 1e6;
}

/* ================================================================== *
 * Handler — derivative (symbolic, returns MathNode)
 * ================================================================== */
function handleDerivative(normalized: string, mode: InputMode): EvalResult {
  const args = extractArgs(normalized, '(?:derivative|diff)');
  if (!args || args.length < 2) {
    return fail('derivative() needs (expr, var). Example: diff(x^2, x)');
  }
  const expr = args[0];
  const varName = args[1].trim();
  try {
    const node = math.parse(expr);
    const dNode = math.derivative(node, varName);
    const simplified = safeSimplify(dNode);
    const latex = simplified.toTex({ implicit: 'hide' });
    const steps = [
      `f(${varName}) = ${inputToLatex(expr, mode)}`,
      `\\frac{d}{d${varName}} f = ${inputToLatex(expr, mode)}`,
      `= ${latex}`,
    ];
    return ok({
      result: `d/d${varName} [${expr}] = ${simplified.toString()}`,
      latex,
      type: 'symbolic',
      steps,
    });
  } catch (err) {
    return fail(`derivative() failed: ${(err as Error).message}`);
  }
}

/* ================================================================== *
 * Handler — integral (numerical, Simpson's 1/3 rule)
 * ================================================================== *
 * Forms:
 *   integrate(expr, var)                → error (symbolic not supported)
 *   integrate(expr, var, a, b)          → numerical definite integral
 */
function handleIntegrate(normalized: string, mode: InputMode): EvalResult {
  const args = extractArgs(normalized, 'integrate');
  if (!args || args.length < 2) {
    return fail('integrate() needs (expr, var). For a numeric result add bounds: integrate(expr, var, a, b)');
  }
  const expr = args[0];
  const varName = args[1].trim();

  if (args.length < 4) {
    return fail(
      'Symbolic integration is not supported yet. Use definite bounds: integrate(expr, var, a, b)',
      'Example: integrate(x^2, x, 0, 1)'
    );
  }

  try {
    const a = math.evaluate(args[2], scope);
    const b = math.evaluate(args[3], scope);
    if (typeof a !== 'number' || typeof b !== 'number') {
      return fail('Integration bounds must evaluate to numbers.');
    }
    const node = math.parse(expr);
    const f = (x: number) => {
      try {
        const v = node.evaluate({ ...scope, [varName]: x });
        return typeof v === 'number' ? v : NaN;
      } catch {
        return NaN;
      }
    };
    const n = 1000; // must be even
    const h = (b - a) / n;
    let sum = f(a) + f(b);
    for (let i = 1; i < n; i++) {
      const x = a + i * h;
      const fx = f(x);
      sum += (i % 2 === 0 ? 2 : 4) * fx;
    }
    const result = (h / 3) * sum;
    const latex = `\\int_{${formatNumber(a)}}^{${formatNumber(b)}} ${inputToLatex(
      expr,
      mode
    )} \\, d${varName} = ${formatNumber(result)}`;
    const steps = [
      `\\int_{${formatNumber(a)}}^{${formatNumber(b)}} ${inputToLatex(expr, mode)} \\, d${varName}`,
      `\\text{Simpson's rule, } n = ${n}`,
      `\\approx ${formatNumber(result)}`,
    ];
    return ok({
      result: `∫ from ${a} to ${b} of ${expr} d${varName} ≈ ${formatNumber(result)}`,
      latex,
      type: 'symbolic',
      steps,
    });
  } catch (err) {
    return fail(`integrate() failed: ${(err as Error).message}`);
  }
}

/* ================================================================== *
 * Handler — limit (numerical, left & right approach)
 * ================================================================== */
function handleLimit(normalized: string, mode: InputMode): EvalResult {
  const args = extractArgs(normalized, 'limit');
  if (!args || args.length < 3) {
    return fail('limit() needs (expr, var, point). Example: limit(sin(x)/x, x, 0)');
  }
  const expr = args[0];
  const varName = args[1].trim();
  const point = math.evaluate(args[2], scope);
  if (typeof point !== 'number') {
    return fail('limit point must be a number.');
  }
  try {
    const node = math.parse(expr);
    const f = (x: number) => {
      try {
        const v = node.evaluate({ ...scope, [varName]: x });
        return typeof v === 'number' ? v : NaN;
      } catch {
        return NaN;
      }
    };
    const epsilons = [1e-3, 1e-5, 1e-7, 1e-9];
    const leftVals = epsilons.map((e) => f(point - e));
    const rightVals = epsilons.map((e) => f(point + e));
    const leftAvg = leftVals.filter(Number.isFinite).at(-1);
    const rightAvg = rightVals.filter(Number.isFinite).at(-1);

    let result: number | null;
    let description: string;
    if (leftAvg === undefined || rightAvg === undefined) {
      // Try direct evaluation (e.g. removable discontinuity).
      const direct = f(point);
      if (Number.isFinite(direct)) {
        result = direct;
        description = `Limit as ${varName} → ${formatNumber(point)} = ${formatNumber(result)} (direct)`;
      } else {
        return ok({
          result: `Limit does not exist (unbounded or undefined).`,
          latex: `\\text{DNE}`,
          type: 'symbolic',
        });
      }
    } else if (Math.abs(leftAvg - rightAvg) < 1e-4) {
      result = (leftAvg + rightAvg) / 2;
      description = `Limit as ${varName} → ${formatNumber(point)} = ${formatNumber(result)}`;
    } else {
      return ok({
        result: `Limit does not exist (left ≈ ${formatNumber(leftAvg)}, right ≈ ${formatNumber(rightAvg)}).`,
        latex: `\\lim_{${varName} \\to ${formatNumber(point)}} ${inputToLatex(
          expr,
          mode
        )} \\text{ DNE}`,
        type: 'symbolic',
        steps: [
          `\\lim_{${varName} \\to ${formatNumber(point)}^-} = ${formatNumber(leftAvg)}`,
          `\\lim_{${varName} \\to ${formatNumber(point)}^+} = ${formatNumber(rightAvg)}`,
          `\\text{Left } \\neq \\text{ right, so DNE}`,
        ],
      });
    }

    const latex = `\\lim_{${varName} \\to ${formatNumber(point)}} ${inputToLatex(
      expr,
      mode
    )} = ${formatNumber(result!)}`;
    return ok({
      result: description,
      latex,
      type: 'symbolic',
      steps: [
        `\\lim_{${varName} \\to ${formatNumber(point)}} ${inputToLatex(expr, mode)}`,
        `\\approx ${formatNumber(result!)}`,
      ],
    });
  } catch (err) {
    return fail(`limit() failed: ${(err as Error).message}`);
  }
}

/* ================================================================== *
 * Handler — Taylor / Maclaurin series
 * ================================================================== *
 * Forms:
 *   taylor(expr, var, order)                 → expand about 0
 *   taylor(expr, var, order, point)          → expand about `point`
 */
function handleTaylor(normalized: string, mode: InputMode): EvalResult {
  const args = extractArgs(normalized, 'taylor');
  if (!args || args.length < 3) {
    return fail('taylor() needs (expr, var, order). Optional: taylor(expr, var, order, point)');
  }
  const expr = args[0];
  const varName = args[1].trim();
  const order = parseInt(args[2].trim(), 10);
  const point =
    args.length >= 4
      ? math.evaluate(args[3], scope)
      : 0;
  if (!Number.isInteger(order) || order < 0) {
    return fail('Taylor order must be a non-negative integer.');
  }
  try {
    const node = math.parse(expr);
    // Sum_{n=0..order} f^(n)(point) / n! * (x - point)^n
    let derivative: any = node;
    let factorial = 1;
    const terms: any[] = [];
    const stepStrings: string[] = [];
    for (let n = 0; n <= order; n++) {
      if (n > 0) {
        derivative = math.derivative(derivative, varName);
        factorial *= n;
      }
      let coeff: number;
      try {
        const v = derivative.evaluate({ ...scope, [varName]: point });
        coeff = typeof v === 'number' ? v : NaN;
      } catch {
        continue;
      }
      if (!Number.isFinite(coeff) || Math.abs(coeff) < 1e-14) continue;
      const coeffStr = formatNumber(coeff / factorial);
      const termLatex =
        point === 0
          ? `${coeffStr} ${varName}^{${n}}`
          : `${coeffStr} (${varName} - ${formatNumber(point)})^{${n}}`;
      terms.push({ coeff: coeff / factorial, n, latex: termLatex });
      stepStrings.push(`n=${n}: \\frac{f^{(${n})}(${formatNumber(point)})}{${factorial}!} = ${coeffStr}`);
    }
    if (terms.length === 0) {
      return ok({
        result: `Taylor series of ${expr} about ${point} is 0 (all derivatives vanish).`,
        latex: '0',
        type: 'symbolic',
      });
    }
    const latexBody = terms.map((t) => t.latex).join(' + ');
    const latex = `T_{${order}}(${varName}) = ${latexBody}`;
    const result = `T${order}(${varName}) ≈ ${terms
      .map((t) => `(${formatNumber(t.coeff)}) * (${varName}${point === 0 ? '' : ` - ${formatNumber(point)}`})^${t.n}`)
      .join(' + ')}`;
    return ok({
      result,
      latex,
      type: 'symbolic',
      steps: [
        `f(${varName}) = ${inputToLatex(expr, mode)}`,
        `\\text{Expand about } ${varName}_0 = ${formatNumber(point)}`,
        ...stepStrings,
        `T_{${order}}(${varName}) = ${latexBody}`,
      ],
    });
  } catch (err) {
    return fail(`taylor() failed: ${(err as Error).message}`);
  }
}

/* ================================================================== *
 * Handler — eigenvectors (delegating to mathjs)
 * ================================================================== */
function handleEigenvectors(normalized: string): EvalResult {
  const args = extractArgs(normalized, 'eigenvectors?');
  if (!args || args.length < 1) {
    return fail('eigenvectors() needs a matrix argument.');
  }
  try {
    const M = math.evaluate(args[0], scope);
    const eig = math.eigs(M);
    // mathjs returns { values, eigenvectors: [{ value, vector }] }
    const values = (eig as any).values;
    const vectors = (eig as any).eigenvectors;
    const valuesArr = values.toArray ? values.toArray() : values;
    const steps = [
      `\\text{Eigenvalues: } ${valuesArr.map((v: any) => formatNumber(v)).join(', ')}`,
      ...(vectors || []).map((ev: any, i: number) =>
        `\\lambda_{${i + 1}} = ${formatNumber(ev.value)}, \\quad v_{${i + 1}} = ${resultToLatex(ev.vector)}`
      ),
    ];
    return ok({
      result: `Eigenvalues: ${valuesArr.map((v: any) => formatNumber(v)).join(', ')}`,
      latex: steps.join(' \\\\[6pt] '),
      type: 'symbolic',
      steps,
    });
  } catch (err) {
    return fail(`eigenvectors() failed: ${(err as Error).message}`);
  }
}

/* ================================================================== *
 * Handler — plain scalar / matrix / symbolic evaluation
 * ================================================================== */
function handlePlain(
  normalized: string,
  original: string,
  mode: InputMode
): EvalResult {
  let value: any;
  try {
    value = math.evaluate(normalized, scope);
  } catch (err) {
    return failWithHint(err as Error, original);
  }

  // ── CRITICAL ORDER: matrix BEFORE scalar ─────────────────────
  if (math.isMatrix(value) || Array.isArray(value)) {
    const arr = toMatrixArray(value);
    return ok({
      result: math.format(value, { precision: 6 }),
      latex: resultToLatex(value),
      type: 'matrix',
      isMatrix: true,
      matrix: arr,
    });
  }

  // ── Symbolic expression result (MathNode) ───────────────────
  if (value && typeof value === 'object' && 'toTex' in value && typeof value.toTex === 'function') {
    return ok({
      result: value.toString(),
      latex: value.toTex({ implicit: 'hide' }),
      type: 'symbolic',
    });
  }

  // ── Complex ────────────────────────────────────────────────
  if (math.typeOf && math.typeOf(value) === 'Complex') {
    return ok({
      result: math.format(value, { precision: 6 }),
      latex: resultToLatex(value),
      type: 'number',
    });
  }

  // ── Plain number / boolean / string ────────────────────────
  if (typeof value === 'number') {
    return ok({
      result: formatNumber(value),
      latex: formatNumber(value),
      type: 'number',
    });
  }
  if (typeof value === 'boolean') {
    return ok({
      result: String(value),
      latex: value ? '\\text{true}' : '\\text{false}',
      type: 'number',
    });
  }
  if (typeof value === 'string') {
    return ok({
      result: value,
      latex: `\\text{${value}}`,
      type: 'number',
    });
  }

  // Fallback.
  return ok({
    result: math.format(value, { precision: 6 }),
    latex: resultToLatex(value),
    type: 'number',
  });
}

/* ================================================================== *
 * Utility — result builders + scope snapshot
 * ================================================================== */
function ok(partial: Omit<EvalResult, 'success'>): EvalResult {
  return { success: true, ...partial };
}

function fail(error: string, hint?: string): EvalResult {
  return {
    success: false,
    result: 'Error',
    latex: `\\textcolor{#ef4444}{\\text{${escapeForLatexText(error)}}}`,
    type: 'error',
    error,
    hint,
  };
}

/** Produce a friendlier error message + suggestion when mathjs rejects
 *  the input. Catches the most common mistakes (unknown function,
 *  missing paren, undefined variable). */
function failWithHint(err: Error, original: string): EvalResult {
  const msg = err.message || 'Unknown error';

  // "Undefined symbol X" → suggest a known alias if close.
  const undefMatch = msg.match(/Undefined symbol ([\w]+)/);
  if (undefMatch) {
    const name = undefMatch[1];
    const suggestion = suggestFunction(name);
    if (suggestion) {
      return fail(
        `Unknown name "${name}".`,
        `Did you mean ${suggestion}? (e.g. ${suggestion}(x))`
      );
    }
    return fail(`Undefined symbol "${name}".`, `Define it first: ${name} = ...`);
  }

  // "Unexpected end of expression" → missing paren.
  if (/end of expression/i.test(msg)) {
    return fail(msg, 'You may be missing a closing parenthesis.');
  }
  if (/parenthes/i.test(msg)) {
    return fail(msg, 'Check that every "(" has a matching ")".');
  }

  return fail(msg);
}

/** Very small Levenshtein-based suggestion engine over the function
 *  allowlist so a user typing "arctn" gets told about "arctan". */
function suggestFunction(typo: string): string | null {
  const candidates = [
    'arctan', 'arcsin', 'arccos', 'atan', 'asin', 'acos',
    'sin', 'cos', 'tan', 'sinh', 'cosh', 'tanh',
    'log', 'log10', 'log2', 'ln', 'lg', 'exp',
    'sqrt', 'cbrt', 'abs', 'sign', 'floor', 'ceil', 'round',
    're', 'im', 'conj', 'arg',
    'det', 'inv', 'transpose', 'trace', 'rank',
    'plot', 'polarplot', 'solve', 'diff', 'integrate', 'limit', 'taylor',
    'factorial', 'gamma', 'mean', 'median', 'std', 'var',
  ];
  let best: string | null = null;
  let bestDist = Infinity;
  for (const c of candidates) {
    const d = levenshtein(typo.toLowerCase(), c.toLowerCase());
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  if (best && bestDist <= Math.max(1, Math.floor(typo.length / 3))) return best;
  return null;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

/** Snapshot the scope for the Variables panel. Strips functions to a
 *  short label so the UI doesn't try to JSON-stringify them. */
function snapshotScope(): Scope {
  const out: Scope = {};
  for (const [k, v] of Object.entries(scope)) {
    if (typeof v === 'function') {
      out[k] = '<function>';
    } else {
      out[k] = v;
    }
  }
  return out;
}

/** Convert any matrix-like value to a plain number[][] for the UI. */
function toMatrixArray(value: any): number[][] {
  let arr: any[];
  if (math.isMatrix(value)) {
    arr = value.toArray();
  } else if (Array.isArray(value)) {
    arr = value;
  } else {
    return [[value]];
  }
  // Ensure 2D shape.
  if (arr.length > 0 && !Array.isArray(arr[0])) {
    return [arr as unknown as number[]];
  }
  return arr as number[][];
}

/** Best-effort simplify that won't throw on unsupported expressions. */
function safeSimplify(node: any): any {
  try {
    return math.simplify(node);
  } catch {
    return node;
  }
}

/** Escape text for use inside \text{…} (LaTeX). */
function escapeForLatexText(s: string): string {
  return s
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/&/g, '\\&')
    .replace(/%/g, '\\%')
    .replace(/\$/g, '\\$')
    .replace(/#/g, '\\#')
    .replace(/_/g, '\\_')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/\^/g, '\\textasciicircum{}');
}
