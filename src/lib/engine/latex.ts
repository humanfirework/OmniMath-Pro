/**
 * OmniMath Pro — LaTeX conversion utilities
 *
 * The user complaint motivating this module:
 *   "符号显示不好观察，要转换为正常的书写形式"
 *   ("Symbol display is hard to read; convert to normal written form.")
 *
 * Three public functions:
 *   - inputToLatex(input, mode)   → display LaTeX for a *raw user expression*
 *   - resultToLatex(value)        → display LaTeX for a *computed result*
 *   - formatNumber(n)             → smart number formatting (no float noise)
 *
 * All three are pure (no React, no DOM) so they can run server-side or
 * inside a Web Worker. KaTeX itself is rendered in the UI layer.
 */

import type { MathNode } from 'mathjs';
import type { InputMode } from './types';
import { normalizeSymbols } from './symbols';
import { preprocessForMode } from './parser';
import { math } from './mathInstance';

/* LaTeX conversion only ever PARSES expressions (`math.parse(...).toTex`)
 * and formats values (`math.format`) — it never evaluates with a scope,
 * so sharing the app-wide configured instance is safe and keeps parse
 * semantics (e.g. the log/ln overrides) identical to the evaluator. */

/* ------------------------------------------------------------------ *
 * formatNumber — smart scalar formatter
 * ------------------------------------------------------------------ *
 * Goals:
 *   - Integers render without decimals (5, not 5.0000).
 *   - Floating-point noise is rounded away (0.1 + 0.2 → 0.3 not 0.30000004).
 *   - Very large / very small numbers use scientific notation.
 *   - Negative zero collapses to 0.
 */
export function formatNumber(n: number): string {
  if (typeof n !== 'number' || Number.isNaN(n)) return 'NaN';
  if (n === 0) return '0'; // also covers -0 → "0"
  if (!Number.isFinite(n)) return n > 0 ? '\\infty' : '-\\infty';

  // Round away float noise: anything within 1e-10 of an integer is an integer.
  const rounded = Math.round(n);
  if (Math.abs(n - rounded) < 1e-10) return String(rounded);

  // Very large / very small → scientific.
  const abs = Math.abs(n);
  if (abs !== 0 && (abs < 1e-4 || abs >= 1e15)) {
    // toExponential then prettify: 1.2300e+5 → 1.23 \times 10^{5}
    const exp = n.toExponential(6).replace(/\.?0+e/, 'e');
    const [mant, pow] = exp.split('e');
    const powInt = parseInt(pow, 10);
    return `${mant} \\times 10^{${powInt}}`;
  }

  // Default: round to 10 significant digits, strip trailing zeros.
  const fixed = parseFloat(n.toPrecision(10)).toString();
  return fixed;
}

/* ------------------------------------------------------------------ *
 * inputToLatex — raw user expression → display LaTeX
 * ------------------------------------------------------------------ *
 * Pipeline:
 *   1. normalizeSymbols   (arctan → atan, π → pi, ∫ → integrate, theta → θ)
 *   2. preprocessForMode  (2x → 2*x, A' → ctranspose(A), np.sin → sin)
 *   3. math.parse(...).toTex({implicit: 'hide'}) — hide implicit `*` so
 *      the display looks like hand-written math.
 *
 * On any failure, return the original input wrapped in \texttt so the
 * UI still shows *something* reasonable.
 */
export function inputToLatex(input: string, mode: InputMode = 'simple'): string {
  if (!input || !input.trim()) return '';
  try {
    const normalized = normalizeSymbols(input);

    // ── 检测 plot()/polar()/plot3d() 等绘图语法 ──────────────────
    // 提取内部表达式，渲染为 y = ... / r = ... / z = ... 而非
    // \mathrm{plot}(\sin(x)) 这样的函数调用形式。
    const plotMatch = normalized.match(
      /^\s*(?:plot|polar(?:plot)?|plot3d|surface|surf)\s*\(([\s\S]+)\)\s*$/,
    );
    if (plotMatch) {
      const inner = plotMatch[1].trim();
      // 取第一个参数（逗号前），忽略范围参数
      const expr = inner.split(',')[0].trim();
      const prefix = /polar/i.test(normalized)
        ? 'r = '
        : /(?:plot3d|surface|surf)/i.test(normalized)
          ? 'z = '
          : 'y = ';
      try {
        const preprocessed = preprocessForMode(expr, mode);
        const node = math.parse(preprocessed);
        return `${prefix}${node.toTex({ implicit: 'hide', parenthesis: 'keep' })}`;
      } catch {
        return `${prefix}\\texttt{${escapeLatex(expr)}}`;
      }
    }

    const preprocessed = preprocessForMode(normalized, mode);
    const node = math.parse(preprocessed);
    // `implicit: 'hide'` so `2*x` renders as `2 x` (hand-written form).
    // `parenthesis: 'auto'` keeps parens to a minimum.
    return node.toTex({ implicit: 'hide', parenthesis: 'keep' });
  } catch {
    // Fall back to a verbatim render so the user sees their input.
    return `\\texttt{${escapeLatex(input)}}`;
  }
}

/* ------------------------------------------------------------------ *
 * resultToLatex — computed value → display LaTeX
 * ------------------------------------------------------------------ *
 * Dispatches on the runtime type of `value`:
 *   - mathjs Matrix / 2D array  → \begin{bmatrix}…\end{bmatrix}
 *   - mathjs Complex            → a + bi (with float-noise scrubbing)
 *   - mathjs Unit               → uses mathjs's built-in toTex
 *   - mathjs MathNode           → expression LaTeX
 *   - plain number              → formatNumber
 *   - string                    → \text{…}
 *
 * CRITICAL ORDER: matrix detection runs BEFORE the BigNumber check so
 * a matrix isn't accidentally stringified as `[[7,10],[15,22]]`. This
 * was a recurring bug in the previous implementation.
 */
export function resultToLatex(value: any): string {
  if (value === undefined || value === null) return '\\text{—}';

  try {
    /* 1. Matrix / 2D array → bmatrix */
    if (math.isMatrix(value) || Array.isArray(value)) {
      return matrixToLatex(value);
    }

    /* 2. Complex number → a + bi */
    if (math.typeOf && math.typeOf(value) === 'Complex') {
      return complexToLatex(value);
    }

    /* 3. Unit (e.g. 5 m) */
    if (math.typeOf && math.typeOf(value) === 'Unit') {
      return (value as any).toTex();
    }

    /* 4. MathNode (symbolic expression result) */
    if (value && typeof value === 'object' && 'toTex' in value && typeof value.toTex === 'function') {
      return value.toTex({ implicit: 'hide' });
    }

    /* 5. Plain number */
    if (typeof value === 'number') {
      return formatNumber(value);
    }

    /* 6. Boolean */
    if (typeof value === 'boolean') {
      return value ? '\\text{true}' : '\\text{false}';
    }

    /* 7. String fallback */
    if (typeof value === 'string') {
      return `\\text{${escapeLatex(value)}}`;
    }

    /* 8. Last resort: math.format */
    return escapeLatex(math.format(value, { precision: 6 }));
  } catch {
    return `\\texttt{${escapeLatex(String(value))}}`;
  }
}

/* ------------------------------------------------------------------ *
 * matrixToLatex
 * ------------------------------------------------------------------ *
 * Converts a mathjs Matrix (or nested array) into a LaTeX bmatrix.
 * `\begin{bmatrix} a & b \\ c & d \end{bmatrix}`
 */
function matrixToLatex(value: any): string {
  let arr: any[];
  if (math.isMatrix(value)) {
    // .toArray() unwraps mathjs Matrix into nested JS arrays.
    arr = value.toArray();
  } else {
    arr = value;
  }

  // 1-D vector → single-row bmatrix.
  if (arr.length > 0 && !Array.isArray(arr[0])) {
    return `\\begin{bmatrix} ${arr.map((v) => cellToLatex(v)).join(' & ')} \\end{bmatrix}`;
  }

  // 2-D matrix.
  const rows = arr.map((row: any) =>
    (Array.isArray(row) ? row : [row])
      .map((cell: any) => cellToLatex(cell))
      .join(' & ')
  );
  return `\\begin{bmatrix} ${rows.join(' \\\\ ')} \\end{bmatrix}`;
}

/** Format a single matrix cell — handles nested numbers / complexes. */
function cellToLatex(cell: any): string {
  if (typeof cell === 'number') return formatNumber(cell);
  if (math.typeOf && math.typeOf(cell) === 'Complex') return complexToLatex(cell);
  if (cell && typeof cell === 'object' && 'toTex' in cell) {
    return cell.toTex({ implicit: 'hide' });
  }
  return escapeLatex(String(cell));
}

/* ------------------------------------------------------------------ *
 * complexToLatex
 * ------------------------------------------------------------------ *
 * Scrub float noise: tiny real/imag parts collapse to 0.
 * Examples:
 *   1.22e-16 + 1i  →  "i"
 *   3 + 0i         →  "3"
 *   2 - 3i         →  "2 - 3i"
 *   0 + i          →  "i"
 */
function complexToLatex(c: any): string {
  const re = Math.abs(c.re) < 1e-10 ? 0 : c.re;
  const im = Math.abs(c.im) < 1e-10 ? 0 : c.im;

  // Pure real
  if (im === 0) return formatNumber(re);
  // Pure imaginary
  if (re === 0) {
    if (im === 1) return 'i';
    if (im === -1) return '-i';
    return `${formatNumber(im)}i`;
  }
  // Mixed
  const sign = im < 0 ? '-' : '+';
  const imAbs = Math.abs(im);
  const imPart = imAbs === 1 ? 'i' : `${formatNumber(imAbs)}i`;
  return `${formatNumber(re)} ${sign} ${imPart}`;
}

/* ------------------------------------------------------------------ *
 * escapeLatex — escape characters that would break \text{…}
 * ------------------------------------------------------------------ */
function escapeLatex(s: string): string {
  return s
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/&/g, '\\&')
    .replace(/%/g, '\\%')
    .replace(/\$/g, '\\$')
    .replace(/#/g, '\\#')
    .replace(/_/g, '\\_')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/\^/g, '\\textasciicircum{}')
    .replace(/~/g, '\\textasciitilde{}');
}

/* ------------------------------------------------------------------ *
 * Convenience: turn a list of step strings into a numbered LaTeX list.
 * Used by derivative / integral / taylor / solve results.
 * ------------------------------------------------------------------ */
export function stepsToLatex(steps: string[]): string {
  if (!steps || steps.length === 0) return '';
  return steps
    .map((s, i) => `${i + 1}.\\quad ${s}`)
    .join(' \\\\[6pt] ');
}

/** Re-export the MathNode type so callers can type-check without
 *  pulling mathjs as a direct dependency. */
export type { MathNode };
