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
 *   2. Evaluate against the shared app-wide scope (variables, matrices,
 *      user functions) from `./mathInstance`.
 *   3. Detect input type and dispatch: assignment / plot / polar /
 *      solve / calculus / matrix / plain scalar / auto-plot.
 *   4. Wrap results in an `EvalResult` envelope with LaTeX for KaTeX.
 *
 * Critical correctness notes:
 *   - Matrix / Array detection runs BEFORE BigNumber / scalar formatting.
 *   - Errors return `{ success: false, type: 'error' }` with a friendly
 *     message + optional hint, never throw to the caller.
 */

import type {
  EvalResult,
  InputMode,
  Scope,
  PlotType,
  CalcType,
} from './types';
import {
  DEFAULT_CARTESIAN_RANGE,
  DEFAULT_POLAR_RANGE,
} from './types';
import { normalizeSymbols } from './symbols';
import { preprocessForMode } from './parser';
import { differentiateWithSteps } from './derivativeSteps';
import {
  inputToLatex,
  resultToLatex,
  formatNumber,
} from './latex';

/* ================================================================== *
 * mathjs instance + user scope — shared across the whole app
 * ================================================================== *
 * The configured instance (log → base-10, ln/lg/inverse-trig aliases)
 * and the user scope live in `./mathInstance` so plots, 3D surfaces,
 * analysis overlays and the blueprint pipeline all see the SAME
 * functions and the SAME variables. `bumpScopeVersion()` notifies
 * subscribers (plot components) after assignments so curves re-sample
 * live when a variable changes.
 */
import {
  math,
  getScope,
  bumpScopeVersion,
} from './mathInstance';

export {
  getScope,
  setScopeVar,
  deleteScopeVar,
  resetScope,
  syncScope,
  getScopeVersion,
  subscribeScope,
  getEvalScope,
  bumpScopeVersion,
} from './mathInstance';

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
    // `z = z + x = 1` 是手写时常见的重复 z；右侧本身已是完整隐式方程。
    normalized = stripRedundantZPrefix(normalized);
  } catch (err) {
    return fail(`Failed to parse input: ${(err as Error).message}`);
  }

  /* 3. Dispatch on detected intent. */
  try {
    // ── Polar implicit assignment: `r = f(θ)` → auto polar plot ──
    // `r = sin(6θ)` is a polar curve, NOT an assignment (despite the `=`).
    // Detect the Desmos-style implicit form and route it to the polar
    // plot handler. Only when the RHS references θ (the polar independent
    // variable) — `r = 5` stays a plain variable assignment.
    const polarEq = /^\s*r\s*=\s*(.+)$/i.exec(normalized);
    if (polarEq && polarEq[1] && /[θϑΘ]|\btheta\b/i.test(polarEq[1])) {
      return handlePlot(polarEq[1], mode, 'polar', /* auto */ true);
    }

    // ── 3D surface equations: `z = f(x, y)` / implicit `x + z = 1` ──
    // `z = x^2 - y^2` 不是赋值（右侧含自由的 x/y），`x + z = 1` 也不是合法
    // 赋值目标；两者都直接生成 3D 曲面。
    const surfaceEq = detectSurfaceEquation(normalized, mode);
    if (surfaceEq) return handleSurfaceEquation(surfaceEq, mode);

    // ── 2D standard equation `y = f(x)` ─────────────────────────
    // 仅 simple 模式（函数输入器 / 简单控制台）：`y = x^2` 是笛卡尔曲线，
    // 不是变量赋值。`a = 5` / `f(x) = x^2` 仍走赋值语义。
    if (mode === 'simple') {
      const yExpr = detectYEqualsFunction(normalized);
      if (yExpr) return handleCartesianEquation(yExpr, mode);
    }

    // ── 2D implicit equation `x^2 + y^2 = 4` / `x + y = 1` / `x = 3` ──
    // 不含自由 z 且不是普通赋值的方程进入 2D 隐式管线；含 z 的已在上面
    // 由 3D 曲面检测接管。
    if (mode === 'simple') {
      const implicitEq = detectImplicit2DEquation(normalized);
      if (implicitEq) return handleImplicit2DEquation(implicitEq, mode);
    }

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

    // ── 3D surface plot: plot3d(...) / surface(...) / surf(...) ──
    if (/^\s*(?:plot3d|surface|surf)\s*\(/.test(normalized)) {
      return handlePlot(normalized, mode, 'surface3d');
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
    if (mode === 'simple' && hasFreeVariableX(normalized, getScope())) {
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

/** Does the expression contain `name` as a free (undefined) variable? */
function hasFreeVariable(expr: string, name: string, scope: Scope): boolean {
  try {
    let found = false;
    math.parse(expr).traverse((n: any) => {
      if (n.isSymbolNode && n.name === name && !(n.name in scope)) {
        found = true;
      }
    });
    return found;
  } catch {
    return false;
  }
}

function hasFreeVariableX(expr: string, scope: Scope): boolean {
  return hasFreeVariable(expr, 'x', scope);
}

/* ================================================================== *
 * 3D surface equation detection
 * ================================================================== *
 * Two accepted forms:
 *   z = f(x, y)   → explicit surface (rhs sampled over x/y)
 *   F(x, y, z) = 0 → implicit surface (surface nets on lhs - rhs)
 *
 * Deliberately conservative:
 *   - `a = …` / `f(x) = …` remain assignments (lhs is a plain identifier or
 *     function signature);
 *   - `z = 5` remains an assignment (rhs has no free x/y);
 *   - `x = 1` remains an assignment (no z, and not both x and y);
 *   - `y = x^2` remains an assignment (2D input is not hijacked).
 */
interface DetectedSurfaceEquation {
  kind: 'explicit' | 'implicit';
  lhs: string;
  rhs: string;
  /** Expression stored on the plot (explicit: rhs; implicit: full equation). */
  expression: string;
}

function detectSurfaceEquation(
  normalized: string,
  mode: InputMode = 'simple'
): DetectedSurfaceEquation | null {
  const eqIdx = findAssignmentEq(normalized);
  if (eqIdx === -1) return null;
  const lhs = normalized.slice(0, eqIdx).trim();
  const rhs = normalized.slice(eqIdx + 1).trim();
  if (!lhs || !rhs) return null;

  const scope = getScope();

  // `z = f(x, y)` → explicit surface. `z = 5` stays an assignment.
  if (/^z$/i.test(lhs)) {
    if (hasFreeVariable(rhs, 'x', scope) || hasFreeVariable(rhs, 'y', scope)) {
      return { kind: 'explicit', lhs, rhs, expression: rhs };
    }
    return null;
  }

  // Plain identifier / function definition → ordinary assignment.
  if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(lhs)) return null;
  if (/^[a-zA-Z_][a-zA-Z0-9_]*\s*\([^)]*\)$/.test(lhs)) return null;

  const hasX =
    hasFreeVariable(lhs, 'x', scope) || hasFreeVariable(rhs, 'x', scope);
  const hasY =
    hasFreeVariable(lhs, 'y', scope) || hasFreeVariable(rhs, 'y', scope);
  const hasZ =
    hasFreeVariable(lhs, 'z', scope) || hasFreeVariable(rhs, 'z', scope);

  // Implicit surface needs a free z. In simple mode, purely x/y equations
  // (e.g. `x + y = 1`) belong to the 2D implicit pipeline instead.
  // Other input modes keep the legacy "free x and y" fallback so their
  // semantics do not change.
  if (!hasZ && !(mode !== 'simple' && hasX && hasY)) return null;

  return {
    kind: 'implicit',
    lhs,
    rhs,
    expression: `${lhs} = ${rhs}`,
  };
}

function handleSurfaceEquation(
  eq: DetectedSurfaceEquation,
  mode: InputMode
): EvalResult {
  if (eq.kind === 'explicit') {
    return handlePlot(eq.rhs, mode, 'surface3d', /* auto */ true);
  }

  return ok({
    result: eq.expression,
    latex: `${inputToLatex(eq.lhs, mode)} = ${inputToLatex(eq.rhs, mode)}`,
    type: 'surface3d' as CalcType,
    plotExpression: eq.expression,
    plotRange: [...DEFAULT_CARTESIAN_RANGE],
    plotType: 'surface3d',
    surfaceMode: 'implicit',
  });
}

/* ================================================================== *
 * 2D equation detection — `y = f(x)` / implicit `F(x, y) = 0`
 * ================================================================== *
 * Only reached in simple mode (function input panel / simple console),
 * after the 3D detector has had a chance to claim equations containing a
 * free `z`.
 *
 *   y = x^2        → cartesian, plotExpression = `x^2`
 *   x^2 + y^2 = 4  → implicit2d, plotExpression = full equation
 *   x + y = 1      → implicit2d
 *   x = 3          → implicit2d
 *   a = 5          → still a plain assignment (handled downstream)
 *   f(x) = x^2     → still a function definition
 *   z = 5          → still an assignment
 */
interface DetectedImplicit2DEquation {
  lhs: string;
  rhs: string;
  /** Canonical full equation stored on the plot (`lhs = rhs`). */
  expression: string;
}

/** Find the first `=` at bracket depth 0 that is not part of `==`/`<=`/… */
function findTopLevelEq(s: string): number {
  let depth = 0;
  let inStr: string | null = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (c === inStr && s[i - 1] !== '\\') inStr = null;
      continue;
    }
    if (c === '"' || c === "'") {
      inStr = c;
      continue;
    }
    if (c === '(' || c === '[' || c === '{') {
      depth++;
      continue;
    }
    if (c === ')' || c === ']' || c === '}') {
      if (depth > 0) depth--;
      continue;
    }
    if (c !== '=' || depth !== 0) continue;
    const prev = s[i - 1];
    const next = s[i + 1];
    if (next === '=') continue;
    if (prev === '=' || prev === '<' || prev === '>' || prev === '!') continue;
    return i;
  }
  return -1;
}

/** Structural variable reference (ignores the scope, unlike `hasFreeVariable`). */
function mentionsVariable(expr: string, name: string): boolean {
  try {
    let found = false;
    math.parse(expr).traverse((n: any) => {
      if (n.isSymbolNode && n.name === name) found = true;
    });
    return found;
  } catch {
    return false;
  }
}

/** `y = f(x)` where the RHS references a free `x` → cartesian RHS. */
function detectYEqualsFunction(normalized: string): string | null {
  const eqIdx = findTopLevelEq(normalized);
  if (eqIdx === -1) return null;
  const lhs = normalized.slice(0, eqIdx).trim();
  const rhs = normalized.slice(eqIdx + 1).trim();
  if (!/^y$/i.test(lhs) || !rhs) return null;

  const scope = getScope();
  if (!hasFreeVariable(rhs, 'x', scope)) return null;
  // `y = y + 1` / `y = z` are not functions of x.
  if (hasFreeVariable(rhs, 'y', scope) || hasFreeVariable(rhs, 'z', scope)) {
    return null;
  }
  try {
    math.parse(rhs);
  } catch {
    return null;
  }
  return rhs;
}

function detectImplicit2DEquation(
  normalized: string
): DetectedImplicit2DEquation | null {
  const eqIdx = findTopLevelEq(normalized);
  if (eqIdx === -1) return null;
  const lhs = normalized.slice(0, eqIdx).trim();
  const rhs = normalized.slice(eqIdx + 1).trim();
  if (!lhs || !rhs) return null;

  // `f(x) = …` is a function definition.
  if (/^[a-zA-Z_][a-zA-Z0-9_]*\s*\([^)]*\)$/.test(lhs)) return null;

  // A bare identifier that is not a plotting coordinate stays an
  // assignment: `a = 5`, `z = 5`. `x` / `y` are the 2D plane variables.
  if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(lhs) && !/^[xy]$/i.test(lhs)) {
    return null;
  }

  // Any reference to `z` means 3D — the surface detector handled it above.
  if (mentionsVariable(lhs, 'z') || mentionsVariable(rhs, 'z')) return null;

  // Must involve the 2D plane variables.
  const usesPlaneVar =
    mentionsVariable(lhs, 'x') ||
    mentionsVariable(rhs, 'x') ||
    mentionsVariable(lhs, 'y') ||
    mentionsVariable(rhs, 'y');
  if (!usesPlaneVar) return null;

  // Reject malformed input (e.g. `x = sin(`) so the assignment / plain
  // evaluator can surface the original, more useful error.
  try {
    math.parse(`(${lhs}) - (${rhs})`);
  } catch {
    return null;
  }

  return { lhs, rhs, expression: `${lhs} = ${rhs}` };
}

function handleCartesianEquation(rhs: string, mode: InputMode): EvalResult {
  const latexExpr = inputToLatex(rhs, mode);
  return ok({
    result: `y = ${rhs}`,
    latex: `y = ${latexExpr}`,
    type: 'plot',
    plotExpression: rhs,
    plotRange: [...DEFAULT_CARTESIAN_RANGE],
    plotType: 'cartesian',
  });
}

function handleImplicit2DEquation(
  eq: DetectedImplicit2DEquation,
  mode: InputMode
): EvalResult {
  return ok({
    result: eq.expression,
    latex: `${inputToLatex(eq.lhs, mode)} = ${inputToLatex(eq.rhs, mode)}`,
    type: 'plot',
    plotExpression: eq.expression,
    plotRange: [...DEFAULT_CARTESIAN_RANGE],
    plotType: 'implicit2d',
  });
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
        const localScope: Scope = { ...getScope() };
        params.forEach((p, i) => (localScope[p] = args[i]));
        return bodyNode.evaluate(localScope);
      };
      getScope()[fname] = fn;
      bumpScopeVersion();
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
    const value = math.evaluate(rhs, getScope());
    getScope()[lhs] = value;
    bumpScopeVersion();

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

/**
 * 去掉多余的 `z =` 前缀：仅当右侧本身还含顶层等号且提到 z 时。
 * `z = z + x = 1` → `z + x = 1`；`z = x^2 - y^2` 保持不变。
 */
function stripRedundantZPrefix(s: string): string {
  const m = /^\s*z\s*=\s*(.+)$/i.exec(s);
  if (!m) return s;
  const rest = m[1].trim();
  if (findAssignmentEq(rest) === -1) return s;
  if (!/(^|[^A-Za-z0-9_])z([^A-Za-z0-9_]|$)/i.test(rest)) return s;
  return rest;
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
    // 函数名提取：plot / polar / plot3d / surface / surf
    const fnName =
      plotType === 'polar'
        ? 'polar(?:plot)?'
        : plotType === 'surface3d'
          ? '(?:plot3d|surface|surf)'
          : 'plot';
    const args = extractArgs(normalized, fnName);
    if (!args || args.length === 0) {
      return fail(
        `Invalid plot syntax. Try: ${
          plotType === 'surface3d' ? 'plot3d(sin(x)*cos(y))' : 'plot(sin(x))'
        }`,
      );
    }
    expr = args[0];
    if (args.length >= 3) {
      try {
        const lo = math.evaluate(args[1], getScope());
        const hi = math.evaluate(args[2], getScope());
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
  // 3D auto-plot（来自 `z = f(x, y)`）仍标注 `z =`，否则结果看起来像 2D 曲线。
  const label = auto
    ? plotType === 'surface3d'
      ? `z = ${latexExpr}`
      : latexExpr
    : plotType === 'polar'
      ? `r = ${latexExpr}`
      : plotType === 'surface3d'
        ? `z = ${latexExpr}`
        : `y = ${latexExpr}`;
  const resultStr = auto
    ? plotType === 'surface3d'
      ? `z = ${expr}`
      : expr
    : plotType === 'polar'
      ? `r = ${expr}`
      : plotType === 'surface3d'
        ? `z = ${expr}`
        : `y = ${expr}`;

  return ok({
    result: resultStr,
    latex: label,
    // CalcType 联合类型未包含 'surface3d'，但运行时一直返回该值；断言仅为对齐类型。
    type: (plotType === 'polar' ? 'polar' : plotType === 'surface3d' ? 'surface3d' : 'plot') as CalcType,
    plotExpression: expr,
    plotRange: range,
    plotType,
    surfaceMode: plotType === 'surface3d' ? 'explicit' : undefined,
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
        const A = math.evaluate(first, getScope());
        const b = math.evaluate(second, getScope());
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
    const roots = findRootsNumerically(node, varName);
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
  varName: string
): number[] {
  const f = (x: number) => {
    try {
      const v = node.evaluate({ ...getScope(), [varName]: x });
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
    // Task 4.1 — 分步求导并标注所用法则（幂/乘积/商/链式/和差…）
    const { resultLatex, resultString, steps } = differentiateWithSteps(
      expr,
      varName,
      inputToLatex(expr, mode),
    );
    return ok({
      result: `d/d${varName} [${expr}] = ${resultString}`,
      latex: resultLatex,
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
    const a = math.evaluate(args[2], getScope());
    const b = math.evaluate(args[3], getScope());
    if (typeof a !== 'number' || typeof b !== 'number') {
      return fail('Integration bounds must evaluate to numbers.');
    }
    const node = math.parse(expr);
    const f = (x: number) => {
      try {
        const v = node.evaluate({ ...getScope(), [varName]: x });
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
  const point = math.evaluate(args[2], getScope());
  if (typeof point !== 'number') {
    return fail('limit point must be a number.');
  }
  try {
    const node = math.parse(expr);
    const f = (x: number) => {
      try {
        const v = node.evaluate({ ...getScope(), [varName]: x });
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
      ? math.evaluate(args[3], getScope())
      : 0;
  if (!Number.isInteger(order) || order < 0) {
    return fail('Taylor order must be a non-negative integer.');
  }
  // 防止 DoS：限制 Taylor 展开的最大阶数（高阶导计算成本随阶数指数增长）
  const MAX_TAYLOR_ORDER = 50;
  if (order > MAX_TAYLOR_ORDER) {
    return fail(`Taylor order too large (max ${MAX_TAYLOR_ORDER}).`);
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
        const v = derivative.evaluate({ ...getScope(), [varName]: point });
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
    const M = math.evaluate(args[0], getScope());
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
    value = math.evaluate(normalized, getScope());
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
      latex: `\\text{${escapeForLatexText(value)}}`,
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
  for (const [k, v] of Object.entries(getScope())) {
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

/* ================================================================== *
 * Async entry — evaluateExpressionAsync
 * ================================================================== *
 * Companion to `evaluateExpression` that handles symbolic operations
 * requiring Algebrite (dynamic-loaded). Falls back to the synchronous
 * path for everything else.
 *
 * Currently handles:
 *   • integrate(expr, var)               — symbolic indefinite integral
 *   • integrate(expr, var, a, b, 'sym')  — symbolic definite integral
 *   • limit(expr, var, point)            — symbolic limit (with numeric fallback)
 *   • taylor(expr, var, order, point?)   — symbolic Taylor series
 *
 * For integrate with numeric bounds, the synchronous Simpson's rule
 * path in `evaluateExpression` is preferred (faster, no Algebrite load).
 */
export async function evaluateExpressionAsync(
  rawInput: string,
  mode: InputMode = 'simple'
): Promise<EvalResult> {
  const input = stripComments(rawInput).trim();
  if (!input) {
    return fail('Expression is empty.');
  }

  let normalized: string;
  try {
    normalized = preprocessForMode(normalizeSymbols(input), mode);
  } catch (err) {
    return fail(`Failed to parse input: ${(err as Error).message}`);
  }

  // ── Symbolic indefinite integral: integrate(expr, var) ─────────
  if (/^\s*integrate\s*\(/.test(normalized)) {
    const args = extractArgs(normalized, 'integrate');
    if (args && args.length === 2) {
      const expr = args[0];
      const varName = args[1].trim();
      const { symbolicIntegrate } = await import('./symbolic');
      const sym = await symbolicIntegrate(expr, varName);
      if (sym.success) {
        return ok({
          result: `∫ ${expr} d${varName} = ${sym.expression}`,
          latex: sym.latex,
          type: 'symbolic',
          steps: sym.steps,
        });
      }
      return fail(sym.error || '符号积分失败');
    }
    // 2-arg form with explicit 'symbolic' flag: integrate(expr, var, a, b, 'symbolic')
    if (args && args.length === 5 && /['"]symbolic['"]/.test(args[4])) {
      const expr = args[0];
      const varName = args[1].trim();
      const a = math.evaluate(args[2], getScope());
      const b = math.evaluate(args[3], getScope());
      if (typeof a !== 'number' || typeof b !== 'number') {
        return fail('Integration bounds must evaluate to numbers.');
      }
      const { symbolicDefiniteIntegral } = await import('./symbolic');
      const sym = await symbolicDefiniteIntegral(expr, varName, a, b);
      if (sym.success) {
        return ok({
          result: `∫ from ${a} to ${b} of ${expr} d${varName} = ${sym.expression}${sym.numerical !== undefined ? ` ≈ ${sym.numerical}` : ''}`,
          latex: sym.latex,
          type: 'symbolic',
          steps: sym.steps,
        });
      }
      return fail(sym.error || '符号定积分失败');
    }
    // Otherwise fall through to synchronous numeric integration.
  }

  // ── Symbolic limit: limit(expr, var, point) ───────────────────
  if (/^\s*limit\s*\(/.test(normalized)) {
    const args = extractArgs(normalized, 'limit');
    if (args && args.length === 3) {
      const expr = args[0];
      const varName = args[1].trim();
      const pointRaw = args[2].trim();
      // Try symbolic first; if it fails, fall back to numeric.
      const { symbolicLimit } = await import('./symbolic');
      // Accept infinity as a special point.
      const point: number | string = /inf|∞/i.test(pointRaw)
        ? pointRaw
        : (() => {
            try {
              return math.evaluate(pointRaw, getScope()) as number;
            } catch {
              return pointRaw;
            }
          })();
      const sym = await symbolicLimit(expr, varName, point);
      if (sym.success) {
        return ok({
          result: `lim ${varName}→${point} of ${expr} = ${sym.expression}${sym.numerical !== undefined ? ` (≈ ${sym.numerical})` : ''}`,
          latex: sym.latex,
          type: 'symbolic',
          steps: sym.steps,
        });
      }
      // Fall back to the numeric path.
    }
  }

  // ── Symbolic Taylor series: taylor(expr, var, order, point?) ──
  if (/^\s*taylor\s*\(/.test(normalized)) {
    const args = extractArgs(normalized, 'taylor');
    if (args && args.length >= 3) {
      const expr = args[0];
      const varName = args[1].trim();
      const order = parseInt(args[2].trim(), 10);
      const point = args.length >= 4
        ? (math.evaluate(args[3], getScope()) as number)
        : 0;
      if (Number.isInteger(order) && order >= 0) {
        const { symbolicSeries } = await import('./symbolic');
        const sym = await symbolicSeries(expr, varName, order, point);
        if (sym.success) {
          return ok({
            result: `T${order}(${varName}) = ${sym.expression}`,
            latex: sym.latex,
            type: 'symbolic',
            steps: sym.steps,
          });
        }
        // Fall back to the numeric derivative-based path.
      }
    }
  }

  // ── Default: delegate to synchronous evaluator ────────────────
  return evaluateExpression(rawInput, mode);
}
