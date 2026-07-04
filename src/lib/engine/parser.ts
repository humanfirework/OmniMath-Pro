/**
 * OmniMath Pro — Smart lenient parser
 *
 * Goal (from user complaint):
 *   "2x → 2*x, 2sin(x) → 2*sin(x), (x+1)(x-1) → (x+1)*(x-1)"
 *   i.e. Desmos-like lenient parsing in 'simple' mode, with mode-specific
 *   transformations for 'python' (numpy prefix) and 'matlab' (matrix and
 *   transpose syntax).
 *
 * Critical: previous implementation had a bug where `sin x` became
 * `sin*(x)` because a flawed lookbehind inserted `*` between letter and
 * letter unconditionally. We avoid that here by using a function-name
 * allowlist — implicit multiplication is only inserted at *safe*
 * boundaries (digit→letter, `)`→`(`/letter/digit, identifier→identifier
 * where neither side is a known function name).
 */

import type { InputMode } from './types';
import { functionAliases } from './symbols';

/* ------------------------------------------------------------------ *
 * Function-name allowlist
 * ------------------------------------------------------------------ *
 * mathjs built-ins + every alias's canonical spelling. We use this to
 * decide whether an identifier is a function (and therefore should NOT
 * have an implicit `*` inserted between it and the next token).
 */
const MATHJS_BUILTINS = new Set([
  // trig
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2',
  'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh',
  'sec', 'csc', 'cot', 'asec', 'acsc', 'acot',
  // logs / exp
  'log', 'log10', 'log2', 'ln', 'lg', 'exp',
  // powers / roots
  'sqrt', 'cbrt', 'abs', 'sign', 'norm',
  // rounding
  'floor', 'ceil', 'round', 'fix',
  // complex
  're', 'im', 'conj', 'arg', 'complex',
  // stats / agg
  'mean', 'median', 'std', 'var', 'variance', 'sum', 'prod', 'min', 'max',
  'mode', 'quantileSeq', 'correlation', 'covariance', 'mad',
  // combinatorics / number theory
  'factorial', 'gamma', 'stirlingS2', 'bellNumbers', 'permutations', 'combinations',
  'gcd', 'lcm', 'mod', 'modulus', 'isPrime', 'random', 'randomInt',
  // linalg
  'det', 'inv', 'transpose', 'trace', 'rank', 'diag', 'identity', 'ones', 'zeros',
  'eigenvalues', 'eigenvectors', 'lu', 'qr', 'svd', 'lusolve', 'pinv',
  'sqrtm', 'expm', 'divide', 'dot', 'cross',
  // calculus / symbolic
  'derivative', 'integrate', 'limit', 'taylor', 'simplify', 'rationalize',
  'solve',
  // plot verbs
  'plot', 'polarplot', 'polar',
  // misc
  'map', 'filter', 'forEach', 'format', 'print', 'typeOf', 'typeof', 'clone',
  'index', 'subset', 'matrix', 'sparse', 'unit', 'splitUnit', 'to', 'in',
  'concat', 'flatten', 'resize', 'squeeze', 'ctranspose',
]);

const FUNCTION_NAMES: Set<string> = new Set([
  ...MATHJS_BUILTINS,
  ...Object.values(functionAliases),
  ...Object.keys(functionAliases),
]);

/* ------------------------------------------------------------------ *
 * Public entry point
 * ------------------------------------------------------------------ */
export function preprocessForMode(input: string, mode: InputMode): string {
  if (!input) return '';
  switch (mode) {
    case 'matlab':
      return matlabPreprocess(input);
    case 'python':
      return pythonPreprocess(input);
    case 'simple':
    default:
      return lenientPreprocess(input, mode);
  }
}

/**
 * Desmos-like lenient preprocessor for 'simple' mode.
 * Also re-used as the inner pass for the other modes (after their
 * mode-specific transforms have run) so users always get implicit
 * multiplication. Pass `mode='matlab'`/`'python'` to skip the
 * simple-mode-only rules.
 */
export function lenientPreprocess(input: string, mode: InputMode = 'simple'): string {
  let s = input;

  /* 1. Number (incl. scientific notation) followed by letter or `(`.
        `2x → 2*x`, `2sin(x) → 2*sin(x)`, `2(...) → 2*(...)`.
        The `(?:[eE][+-]?\d+)?` group greedily absorbs scientific
        notation so `2e5x` correctly becomes `2e5*x`, not `2*e5*x`. */
  s = s.replace(
    /(\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\s*([a-zA-Z_(])/g,
    '$1*$2'
  );

  /* 2. `)` followed by `(`, letter or digit.
        `(x+1)(x-1) → (x+1)*(x-1)`, `(x+1)2 → (x+1)*2`. */
  s = s.replace(/\)\s*([(a-zA-Z0-9])/g, ')*$1');

  /* 3. Identifier-then-identifier implicit multiplication.
        Walks the string, emitting `*` between two identifier sequences
        when the first one is NOT a function name (so `sin(x)` stays
        untouched but `xy → x*y`). */
  if (mode === 'simple') {
    s = insertImplicitMultiplyBetweenIdentifiers(s);
  }

  return s;
}

/* ------------------------------------------------------------------ *
 * Identifier-then-identifier implicit multiply
 * ------------------------------------------------------------------ *
 * We deliberately do NOT insert `*` between an identifier and a
 * following `(` when the identifier is NOT a known function — that
 * case is ambiguous (could be a user-defined function `f(x)` in scope)
 * and the previous `sin x → sin*(x)` bug came from being too
 * aggressive here. We only insert between two *identifier* runs.
 *
 * Algorithm (greedy known-name match):
 *   - Scan char by char.
 *   - When we hit a letter, try to match the longest known
 *     function/constant name (length ≥ 2) starting at this position.
 *       * If matched, emit the whole name and advance past it.
 *       * Otherwise emit ONE letter and advance one char — this is
 *         what makes `xy → x*y` (x is one char, then `*`, then y).
 *   - After consuming a chunk, peek the next char:
 *       * letter  → emit `*` UNLESS the chunk we just emitted was a
 *                   known function name (so `sinx` stays as `sinx`
 *                   rather than becoming `sin*x` — mathjs would
 *                   reject that because `sin` is a function, not a
 *                   value).
 *       * `(`     → leave alone (function-call shape is the
 *                   user's responsibility; inserting `*` would
 *                   break user functions like `f(x)`).
 *       * else    → leave alone.
 *
 * Single-letter known names like `e` and `i` are NOT in KNOWN_NAMES —
 * we treat them as ordinary variables here. mathjs still recognises
 * them as Euler's number / imaginary unit at evaluation time, but
 * splitting `ex → e*x` (instead of leaving `ex` as one token) gives
 * the Desmos-like behaviour the user asked for.
 */
const KNOWN_NAMES: Set<string> = new Set([
  ...FUNCTION_NAMES,
  // Constants whose names should be kept together (length ≥ 2 only —
  // single-letter `e`/`i` are intentionally excluded so they can split).
  'pi', 'phi', 'tau', 'Infinity', 'NaN',
]);

function insertImplicitMultiplyBetweenIdentifiers(s: string): string {
  let out = '';
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (/[a-zA-Z_]/.test(ch)) {
      // Greedy match: longest known name (len ≥ 2) starting at i.
      let matched = '';
      for (const name of KNOWN_NAMES) {
        if (name.length < 2) continue;
        if (s.startsWith(name, i) && name.length > matched.length) {
          matched = name;
        }
      }

      if (matched) {
        out += matched;
        i += matched.length;
      } else {
        // No known name matched. Look at the *whole* identifier run
        // starting at i to decide whether to split it letter-by-letter.
        let end = i;
        while (end < s.length && /[a-zA-Z0-9_]/.test(s[end])) end++;
        const ident = s.slice(i, end);
        const nextNonIdent = s[end];

        if (nextNonIdent === '(') {
          // Looks like a function-call attempt — keep the identifier
          // whole so the mathjs error message stays useful (e.g.
          // `arctn(x)` → "Undefined function arctn", not "Undefined
          // symbol a"). We still emit it; the next iteration will see
          // `(` and (because the chunk isn't a known function) leave
          // the call shape alone.
          out += ident;
          i = end;
        } else {
          // Desmos-style split: each letter becomes its own variable.
          // `xy → x*y`, `euler → e*u*l*e*r` (the latter is a known
          // trade-off documented at the top of this file).
          for (let k = 0; k < ident.length; k++) {
            out += ident[k];
            if (k < ident.length - 1) out += '*';
          }
          i = end;
        }
      }

      // Decide whether to insert `*` before the next token.
      if (i < s.length) {
        const next = s[i];
        if (/[a-zA-Z_]/.test(next)) {
          const isFunc = matched ? FUNCTION_NAMES.has(matched) : false;
          if (!isFunc) out += '*';
        }
        // If next is `(`, leave alone (might be a function call).
      }
    } else {
      out += ch;
      i++;
    }
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * MATLAB mode
 * ------------------------------------------------------------------ *
 * mathjs already understands `[1,2;3,4]` (matrix literal with `;`
 * row separator), `.*`, `./`, `.^` (element-wise), `inv(A)`, `det(A)`,
 * `transpose(A)`. The only thing missing is the postfix `A'`
 * (conjugate-transpose) operator — we rewrite it to `ctranspose(A)`
 * (mathjs's name) ahead of time.
 *
 * We don't pre-process `[1,2;3,4]` because mathjs handles it natively.
 */
export function matlabPreprocess(input: string): string {
  let s = input;

  /* 1. Postfix transpose: `)'` and `IDENT'`.
        Be careful NOT to touch `'` inside strings — but MATLAB-style
        strings in a math REPL are rare; we skip the string guard for
        simplicity. */
  // `)'` → `ctranspose())`
  s = s.replace(/\)'/g, 'ctranspose())');
  // `IDENT'` (only when the apostrophe is the immediate next char, not a
  // power operator like `^`). Use a careful regex: identifier, then `'`,
  // but NOT `''` (string literal in some dialects).
  s = s.replace(/([a-zA-Z_][a-zA-Z0-9_]*)'(?!')/g, 'ctranspose($1)');

  /* 2. Pass through lenient preprocessing (digit-letter multiply etc.)
        but skip the simple-mode-only identifier-identifier rule so we
        don't accidentally split MATLAB cell-array accesses. */
  s = lenientPreprocess(s, 'matlab');

  return s;
}

/* ------------------------------------------------------------------ *
 * Python mode
 * ------------------------------------------------------------------ *
 * Map common `np.` / `math.` / `sympy.` prefixes to mathjs equivalents.
 * Anything we can't map is left as-is and mathjs will attempt to
 * evaluate it (often successfully for plain math expressions).
 *
 * Examples:
 *   np.sin(x)             → sin(x)
 *   np.linalg.inv(A)      → inv(A)
 *   np.linalg.det(A)      → det(A)
 *   np.linalg.eigvals(A)  → eigenvalues(A)
 *   np.linalg.norm(A)     → norm(A)
 *   np.array([1,2,3])     → [1,2,3]
 *   np.transpose(A)       → transpose(A)
 *   math.sqrt(x)          → sqrt(x)
 *   sympy.Symbol('x')     → x       (best-effort: leave as x in scope)
 */
export function pythonPreprocess(input: string): string {
  let s = input;

  // np.linalg.X(A)  →  X(A)
  s = s.replace(/\bnp\.linalg\.(inv|det|eigvals|eig|norm|solve|qr|svd|lu|cholesky|matrix_rank|trace)\b/g, (_m, fn) => {
    const map: Record<string, string> = {
      inv: 'inv',
      det: 'det',
      eigvals: 'eigenvalues',
      eig: 'eigenvalues',
      norm: 'norm',
      solve: 'lusolve',
      qr: 'qr',
      svd: 'svd',
      lu: 'lu',
      cholesky: 'lup',
      matrix_rank: 'rank',
      trace: 'trace',
    };
    return map[fn] ?? fn;
  });

  // np.array( ... )  →  ...   (strip the wrapper, keep the inner literal)
  s = s.replace(/\bnp\.array\s*\(/g, '(');

  // np.transpose  →  transpose
  s = s.replace(/\bnp\.transpose\b/g, 'transpose');

  // np.<mathfn>  →  <mathfn>   (sin, cos, exp, log, sqrt, abs, …)
  s = s.replace(/\bnp\.([a-zA-Z_][a-zA-Z0-9_]*)\b/g, '$1');

  // math.<mathfn>  →  <mathfn>
  s = s.replace(/\bmath\.([a-zA-Z_][a-zA-Z0-9_]*)\b/g, '$1');

  // sympy.Symbol('x') → x
  s = s.replace(/sympy\.Symbol\(\s*['"]([a-zA-Z_][a-zA-Z0-9_]*)['"]\s*\)/g, '$1');

  // numpy.X  →  X  (catch any remaining numpy.*)
  s = s.replace(/\b(?:numpy|np)\.([a-zA-Z_][a-zA-Z0-9_]*)\b/g, '$1');

  // Apply lenient preprocessing but skip the simple-only identifier rule.
  s = lenientPreprocess(s, 'python');

  return s;
}
