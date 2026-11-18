/**
 * OmniMath Pro — Math Notes expression engine
 *
 * The "math notes" feature (Apple Math Notes style) needs three things:
 *   1. Normalize messy handwritten/typed input into a mathjs expression.
 *   2. Decide whether it is a scalar calculation or a function of x.
 *   3. Evaluate safely, or sample the function for plotting.
 *
 * Everything here is pure (no DOM, no React) so it can be unit-tested and
 * reused by the whiteboard, the command palette and the future mobile shell.
 */

import { math } from '@/lib/engine/mathInstance';

export interface PlotSample {
  x: number;
  /** null marks a gap (non-finite value) so renderers can break the line. */
  y: number | null;
}

export interface PlotData {
  expression: string;
  range: [number, number];
  samples: PlotSample[];
}

export interface MathNoteEvaluation {
  ok: boolean;
  kind: 'number' | 'plot' | 'error';
  /** Raw user input, kept for display. */
  input: string;
  /** Normalized mathjs expression. */
  expression: string;
  /** KaTeX source when the expression can be parsed. */
  latex: string;
  /** Formatted scalar result (kind === 'number'). */
  valueText?: string;
  /** Numeric scalar result (kind === 'number'). */
  value?: number;
  /** Sampled curve (kind === 'plot'). */
  plot?: PlotData;
  error?: string;
}

const FUNCTIONS = new Set([
  'sin', 'cos', 'tan', 'cot', 'sec', 'csc',
  'asin', 'acos', 'atan', 'atan2', 'acot',
  'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh',
  'sqrt', 'cbrt', 'nthRoot', 'abs', 'exp', 'log', 'ln', 'lg', 'log10', 'log2',
  'floor', 'ceil', 'round', 'fix', 'sign', 'min', 'max', 'mod', 'pow',
  'gamma', 'factorial', 'ncr', 'npr',
  're', 'im', 'arg', 'conj',
]);

const CONSTANTS = new Set(['pi', 'e', 'tau', 'phi']);

const SUPERSCRIPTS: Record<string, string> = {
  '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4',
  '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9',
  '⁺': '+', '⁻': '-', '⁽': '(', '⁾': ')',
};

/**
 * Normalize handwritten / unicode math into a mathjs-friendly expression.
 *
 * - unicode operators (`×`, `÷`, `−`, `π`, `√`) → ascii
 * - superscripts (`x²`) → `x^2`
 * - implicit multiplication (`2x`, `2(x+1)`, `(a)(b)`) → explicit `*`
 */
export function normalizeMathExpression(raw: string): string {
  let s = raw.trim();
  if (!s) return '';

  s = s
    .replace(/[−–—]/g, '-')
    .replace(/[×·∙⋅]/g, '*')
    .replace(/÷/g, '/')
    .replace(/π/g, 'pi')
    .replace(/√/g, 'sqrt')
    .replace(/∞/g, 'Infinity');

  // Consecutive superscript characters become one exponent group.
  s = s.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁽⁾]+/g, (m) => {
    const mapped = m
      .split('')
      .map((c) => SUPERSCRIPTS[c] ?? '')
      .join('');
    return mapped ? `^${mapped}` : '';
  });

  // A trailing "=" is what people write before expecting a result.
  s = s.replace(/=+\s*$/g, '');
  s = s.replace(/\s+/g, '');
  return insertImplicitMultiplication(s);
}

const PROTECT_OPEN = '\u0001';
const PROTECT_CLOSE = '\u0002';

/**
 * Known function/constant names are masked while implicit multiplication is
 * inserted, otherwise `log10(100)` would become `log10*(100)` and `pi r`
 * would stay `pir`. Masked tokens are restored at the end.
 */
function insertImplicitMultiplication(input: string): string {
  const known = [...FUNCTIONS, ...CONSTANTS];
  const constNames = [...CONSTANTS].sort((a, b) => b.length - a.length);
  const masked: string[] = [];
  const mask = (name: string) => {
    masked.push(name);
    return `${PROTECT_OPEN}${masked.length - 1}${PROTECT_CLOSE}`;
  };
  let s = input.replace(/[a-zA-Z][a-zA-Z0-9]*/g, (id) => {
    if (known.includes(id)) return mask(id);
    // πr typed as "pir" arrives as one identifier — split the constant off.
    const prefix = constNames.find((c) => id.startsWith(c) && id.length > c.length);
    if (prefix) return `${mask(prefix)}${id.slice(prefix.length)}`;
    return id;
  });

  s = s.replace(/\)\s*\(/g, ')*(');
  // 2x, 2(, 2sin(…
  s = s.replace(/(\d)([a-zA-Z(])/g, '$1*$2');
  // )x, )2, )sin(…
  s = s.replace(/\)([a-zA-Z0-9(])/g, ')*$1');
  s = s.replace(/\)(?=\u0001)/g, ')*');
  s = s.replace(/([0-9)])(?=\u0001)/g, '$1*');

  // A masked constant before "(" multiplies; a function call does not.
  s = s.replace(/\u0001(\d+)\u0002\(/g, (_m, idx: string) => {
    const name = masked[Number(idx)];
    return CONSTANTS.has(name) ? `${name}*(` : `${name}(`;
  });

  // Unknown identifiers before "(" are variables: x( → x*(
  s = s.replace(/([a-zA-Z][a-zA-Z0-9]*)\(/g, (m, id: string) =>
    FUNCTIONS.has(id) ? m : `${id}*(`,
  );

  // πr → pi*r, but sin x stays invalid (needs explicit parentheses).
  s = s.replace(/\u0001(\d+)\u0002([a-zA-Z])/g, (_m, idx: string, next: string) => {
    const name = masked[Number(idx)];
    return CONSTANTS.has(name) ? `${name}*${next}` : `${name}${next}`;
  });

  // xy / yx → x*y
  s = s.replace(/([xy])([xy])/g, '$1*$2');

  return s.replace(/\u0001(\d+)\u0002/g, (_m, idx: string) => masked[Number(idx)]);
}

export interface ParsedMathNote {
  /** Expression to evaluate / sample. */
  expression: string;
  /** Non-null when the expression depends on x (i.e. should be plotted). */
  plotExpression: string | null;
  /** True when the user wrote an explicit `y = …` / `f(x) = …`. */
  isEquation: boolean;
}

/**
 * Split `y = f(x)` / `f(x) = …` and decide whether the note is a graph.
 * Bare expressions containing x are treated as graphs too (Desmos style).
 */
export function parseMathNote(raw: string): ParsedMathNote {
  const normalized = normalizeMathExpression(raw);
  const eq = normalized.match(/^([a-zA-Z](?:\(x\))?)=(.+)$/);
  if (eq) {
    const lhs = eq[1];
    const rhs = eq[2];
    const isFunction = lhs === 'y' || lhs === 'f' || lhs === 'f(x)' || lhs === 'g' || lhs === 'h';
    return {
      expression: rhs,
      plotExpression: isFunction || rhs.includes('x') ? rhs : null,
      isEquation: true,
    };
  }
  return {
    expression: normalized,
    plotExpression: includesVariable(normalized, 'x') ? normalized : null,
    isEquation: false,
  };
}

/** Does the expression reference `name` as a standalone identifier? */
function includesVariable(expr: string, name: string): boolean {
  const ids: string[] = expr.match(/[a-zA-Z]+/g) ?? [];
  return ids.includes(name);
}

/** Return an error message when the expression uses unsupported syntax. */
export function validateMathExpression(expr: string): string | null {
  if (!expr) return '表达式为空';
  if (!/^[0-9a-zA-Z+\-*/^().,%\s]*$/.test(expr)) return '包含暂不支持的字符';
  if (expr.includes('=')) return '暂不支持等式求解';

  const ids = expr.match(/[a-zA-Z]+/g) ?? [];
  for (const id of ids) {
    if (id === 'x' || id === 'y') continue;
    if (CONSTANTS.has(id) || FUNCTIONS.has(id)) continue;
    if (id === 'Infinity') continue;
    return `不认识的符号「${id}」`;
  }

  let depth = 0;
  for (const ch of expr) {
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth < 0) return '括号不匹配';
    }
  }
  if (depth !== 0) return '括号不匹配';
  return null;
}

/**
 * Evaluate a math note.
 *
 * `range` controls the sampling window for graphs (default [-10, 10], which
 * matches the reference video's ±10 axis).
 */
export function evaluateMathNote(
  raw: string,
  options: { range?: [number, number]; samples?: number } = {},
): MathNoteEvaluation {
  const input = raw;
  const parsed = parseMathNote(raw);
  const expression = parsed.expression;
  const invalid = validateMathExpression(expression);

  const base: MathNoteEvaluation = {
    ok: false,
    kind: 'error',
    input,
    expression,
    latex: '',
  };

  if (!expression) return { ...base, error: '没有识别到表达式' };
  if (invalid) return { ...base, error: invalid };

  try {
    base.latex = math.parse(expression).toTex({ parenthesis: 'auto' });
  } catch {
    base.latex = expression;
  }

  // ── Graph: any expression that depends on x ─────────────────────
  if (parsed.plotExpression) {
    const range = options.range ?? [-10, 10];
    try {
      const samples = sampleExpression(parsed.plotExpression, range, options.samples ?? 600);
      const hasPoint = samples.some((s) => s.y !== null);
      if (!hasPoint) {
        return { ...base, error: '这个函数在所选范围内没有可绘制的点' };
      }
      return {
        ...base,
        ok: true,
        kind: 'plot',
        plot: { expression: parsed.plotExpression, range, samples },
      };
    } catch (err) {
      return { ...base, error: (err as Error).message };
    }
  }

  // ── Scalar ──────────────────────────────────────────────────────
  try {
    const value = math.evaluate(expression);
    const numeric =
      typeof value === 'number'
        ? value
        : typeof value?.valueOf?.() === 'number'
          ? value.valueOf()
          : null;
    if (numeric !== null && Number.isFinite(numeric)) {
      return {
        ...base,
        ok: true,
        kind: 'number',
        value: numeric,
        valueText: formatMathNumber(numeric),
      };
    }
    return {
      ...base,
      ok: true,
      kind: 'number',
      valueText: math.format(value, { precision: 12 }),
    };
  } catch (err) {
    return { ...base, error: (err as Error).message };
  }
}

/** Sample `f(x)` over `range`. Non-finite values become gaps. */
export function sampleExpression(
  expression: string,
  range: [number, number],
  count = 600,
): PlotSample[] {
  const compiled = math.compile(expression);
  const [min, max] = range;
  const steps = Math.max(2, Math.min(4000, Math.round(count)));
  const out: PlotSample[] = [];
  for (let i = 0; i <= steps; i++) {
    const x = min + ((max - min) * i) / steps;
    let y: number | null = null;
    try {
      const raw = compiled.evaluate({ x, y: 0 });
      const n = typeof raw === 'number' ? raw : Number(raw);
      if (Number.isFinite(n)) y = n;
    } catch {
      y = null;
    }
    out.push({ x, y });
  }
  return out;
}

/** Human-friendly scalar formatting: 1314000, not 1.314e+6. */
export function formatMathNumber(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  if (Number.isInteger(n) && Math.abs(n) < 1e15) return String(n);
  const abs = Math.abs(n);
  if (abs !== 0 && (abs < 1e-6 || abs >= 1e15)) {
    return n.toExponential(6).replace(/\.?0+e/, 'e');
  }
  return n.toPrecision(12).replace(/\.?0+$/, '');
}
