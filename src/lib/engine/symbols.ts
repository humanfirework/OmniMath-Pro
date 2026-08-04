/**
 * OmniMath Pro — Symbol / alias registry
 *
 * The user complaint that motivated this module:
 *   "普通计算器计算过于麻烦且不支持直接输入识别符号，比如arctan，pi可以直接理解并转换为数学符号"
 *   "符号显示不好观察，要转换为正常的书写形式"
 *
 * This module is a pure string transformer — no mathjs, no React, no DOM.
 * It maps the many aliases a user might type (atan, tg^-1, π, arctg, …)
 * down to the canonical mathjs names so the evaluator only has to know one
 * spelling per concept. It also exposes the alias table for the symbol
 * palette UI.
 */

/* ------------------------------------------------------------------ *
 * Function-name aliases  (alias → canonical mathjs function name)
 * ------------------------------------------------------------------ *
 * mathjs already ships sin/cos/tan/asin/acos/atan/sinh/cosh/tanh/sqrt/
 * cbrt/log/exp/abs/sign/floor/ceil/round/re/im/conj/arg. The aliases
 * below add the friendly spellings (arctan, ln, lg, …) and surface the
 * existing ones for the UI.
 */
export const functionAliases: Record<string, string> = {
  // ── inverse trig ──────────────────────────────────────────────
  arctan: 'atan',
  arctg: 'atan',
  atan: 'atan',
  'tg^-1': 'atan',
  'tan^-1': 'atan',
  arcsin: 'asin',
  asin: 'asin',
  'sin^-1': 'asin',
  arccos: 'acos',
  acos: 'acos',
  'cos^-1': 'acos',
  // ── trig aliases (rare but harmless) ─────────────────────────
  tg: 'tan',
  ctg: 'cot',
  sec: 'sec',
  csc: 'csc',
  // ── logs ─────────────────────────────────────────────────────
  // ln = natural log (mathjs has `log(x, base)`, our engine adds `ln`)
  ln: 'ln',
  // lg = base-10 (user-friendly) — mathjs doesn't have `lg`; the engine adds it
  lg: 'lg',
  // log: default base 10 (engine override) — left as `log` so users get the
  // intuitive behaviour without changing what they typed.
  log: 'log',
  log10: 'log10',
  log2: 'log2',
  // ── powers / roots ───────────────────────────────────────────
  sqrt: 'sqrt',
  cbrt: 'cbrt',
  abs: 'abs',
  modulus: 'abs',
  sgn: 'sign',
  sign: 'sign',
  // ── rounding ─────────────────────────────────────────────────
  floor: 'floor',
  ceil: 'ceil',
  ceiling: 'ceil',
  round: 'round',
  // ── complex helpers ──────────────────────────────────────────
  re: 're',
  real: 're',
  im: 'im',
  imag: 'im',
  conj: 'conj',
  arg: 'arg',
  // ── calculus verbs (canonicalise verb spellings) ─────────────
  differentiate: 'derivative',
  diff: 'derivative',
  derivative: 'derivative',
  integrate: 'integrate',
  integral: 'integrate',
  // `∫` (Unicode integral sign) is handled by calculusSymbols below
  // because it isn't a word-boundary token.
};

/* ------------------------------------------------------------------ *
 * Constant aliases  (alias → canonical mathjs name OR numeric value)
 * ------------------------------------------------------------------ *
 * mathjs already exposes `pi`, `e`, `i`, `Infinity`, `NaN`, `tau`, `phi`.
 * We still keep the table so the symbol palette can advertise the
 * spellings and so unicode literals like π/τ/φ/∞ resolve correctly.
 */
export const constantAliases: Record<string, string> = {
  pi: 'pi',
  'π': 'pi',
  e: 'e', // Euler's number — note: also a common variable name; left alone
  tau: 'tau',
  'τ': 'tau',
  phi: 'phi',
  'φ': 'phi',
  infinity: 'Infinity',
  '∞': 'Infinity',
  inf: 'Infinity',
};

/* ------------------------------------------------------------------ *
 * Calculus / operator symbols (non-word tokens)
 * ------------------------------------------------------------------ */
export const calculusSymbols: Record<string, string> = {
  '∫': 'integrate',
  '∂': 'derivative',
  'Σ': 'sum',
  '∏': 'prod',
  '√': 'sqrt',
  '∛': 'cbrt',
  '×': '*',
  '·': '*',
  '÷': '/',
  '−': '-', // U+2212 minus → ASCII hyphen-minus
  '–': '-',
  '—': '-',
  '≠': '!=',
  '≤': '<=',
  '≥': '>=',
  '→': '->',
  '←': '<-',
  '↔': '<->',
};

/* ------------------------------------------------------------------ *
 * Greek letter display map (Latin spelling → unicode glyph)
 * ------------------------------------------------------------------ *
 * Useful for the symbol palette and for replacing `theta` with `θ`
 * in normalizeSymbols so mathjs `toTex()` renders `\theta` instead of
 * `\mathrm{theta}`.
 */
export const greekLetters: Record<string, string> = {
  alpha: 'α',
  beta: 'β',
  gamma: 'γ',
  delta: 'δ',
  epsilon: 'ε',
  varepsilon: 'ε',
  zeta: 'ζ',
  eta: 'η',
  theta: 'θ',
  vartheta: 'ϑ',
  iota: 'ι',
  kappa: 'κ',
  lambda: 'λ',
  mu: 'μ',
  nu: 'ν',
  xi: 'ξ',
  pi: 'π',
  rho: 'ρ',
  sigma: 'σ',
  varsigma: 'ς',
  tau: 'τ',
  upsilon: 'υ',
  phi: 'φ',
  varphi: 'φ',
  chi: 'χ',
  psi: 'ψ',
  omega: 'ω',
  Alpha: 'Α',
  Beta: 'Β',
  Gamma: 'Γ',
  Delta: 'Δ',
  Theta: 'Θ',
  Lambda: 'Λ',
  Xi: 'Ξ',
  Pi: 'Π',
  Sigma: 'Σ',
  Phi: 'Φ',
  Psi: 'Ψ',
  Omega: 'Ω',
};

/* ------------------------------------------------------------------ *
 * Flattened, UI-friendly alias table for the symbol palette
 * ------------------------------------------------------------------ *
 * Each entry: [alias, canonical, category, latex]. The UI can render
 * this directly into a clickable grid.
 */
export interface SymbolAliasEntry {
  alias: string;
  canonical: string;
  category:
    | 'trig'
    | 'inverse-trig'
    | 'log'
    | 'power'
    | 'rounding'
    | 'complex'
    | 'constant'
    | 'greek'
    | 'calculus';
  latex: string;
  /** Short human description (shown as a tooltip). */
  description: string;
}

export const symbolAliases: SymbolAliasEntry[] = [
  // inverse trig
  { alias: 'arctan', canonical: 'atan', category: 'inverse-trig', latex: '\\arctan', description: 'Inverse tangent (arctan, atan, tg⁻¹)' },
  { alias: 'atan', canonical: 'atan', category: 'inverse-trig', latex: '\\arctan', description: 'Inverse tangent' },
  { alias: 'arcsin', canonical: 'asin', category: 'inverse-trig', latex: '\\arcsin', description: 'Inverse sine (arcsin, asin)' },
  { alias: 'arccos', canonical: 'acos', category: 'inverse-trig', latex: '\\arccos', description: 'Inverse cosine (arccos, acos)' },
  // logs
  { alias: 'ln', canonical: 'ln', category: 'log', latex: '\\ln', description: 'Natural logarithm' },
  { alias: 'lg', canonical: 'lg', category: 'log', latex: '\\lg', description: 'Base-10 logarithm' },
  { alias: 'log', canonical: 'log', category: 'log', latex: '\\log_{10}', description: 'Logarithm (base 10 by default)' },
  { alias: 'log2', canonical: 'log2', category: 'log', latex: '\\log_2', description: 'Base-2 logarithm' },
  // powers
  { alias: 'sqrt', canonical: 'sqrt', category: 'power', latex: '\\sqrt', description: 'Square root' },
  { alias: 'cbrt', canonical: 'cbrt', category: 'power', latex: '\\sqrt[3]', description: 'Cube root' },
  { alias: 'abs', canonical: 'abs', category: 'power', latex: '\\left|\\cdot\\right|', description: 'Absolute value' },
  { alias: 'sgn', canonical: 'sign', category: 'power', latex: '\\operatorname{sgn}', description: 'Signum function' },
  // rounding
  { alias: 'floor', canonical: 'floor', category: 'rounding', latex: '\\lfloor\\cdot\\rfloor', description: 'Floor' },
  { alias: 'ceil', canonical: 'ceil', category: 'rounding', latex: '\\lceil\\cdot\\rceil', description: 'Ceiling' },
  // complex
  { alias: 're', canonical: 're', category: 'complex', latex: '\\operatorname{Re}', description: 'Real part' },
  { alias: 'im', canonical: 'im', category: 'complex', latex: '\\operatorname{Im}', description: 'Imaginary part' },
  { alias: 'conj', canonical: 'conj', category: 'complex', latex: '\\overline{\\cdot}', description: 'Complex conjugate' },
  { alias: 'arg', canonical: 'arg', category: 'complex', latex: '\\arg', description: 'Argument (phase)' },
  // constants
  { alias: 'pi', canonical: 'pi', category: 'constant', latex: '\\pi', description: 'π ≈ 3.14159' },
  { alias: 'e', canonical: 'e', category: 'constant', latex: 'e', description: "Euler's number ≈ 2.71828" },
  { alias: 'tau', canonical: 'tau', category: 'constant', latex: '\\tau', description: 'τ = 2π' },
  { alias: 'phi', canonical: 'phi', category: 'constant', latex: '\\varphi', description: 'Golden ratio φ ≈ 1.618' },
  { alias: 'infinity', canonical: 'Infinity', category: 'constant', latex: '\\infty', description: '∞' },
  // calculus
  { alias: 'diff', canonical: 'derivative', category: 'calculus', latex: '\\frac{d}{dx}', description: 'Symbolic derivative' },
  { alias: 'integrate', canonical: 'integrate', category: 'calculus', latex: '\\int', description: 'Definite integral (Simpson)' },
  { alias: 'taylor', canonical: 'taylor', category: 'calculus', latex: '\\sum', description: 'Taylor / Maclaurin series' },
  { alias: 'limit', canonical: 'limit', category: 'calculus', latex: '\\lim', description: 'Numerical limit' },
  // a few greek letters for the palette
  { alias: 'theta', canonical: 'θ', category: 'greek', latex: '\\theta', description: 'Greek theta (angle variable)' },
  { alias: 'alpha', canonical: 'α', category: 'greek', latex: '\\alpha', description: 'Greek alpha' },
  { alias: 'beta', canonical: 'β', category: 'greek', latex: '\\beta', description: 'Greek beta' },
  { alias: 'lambda', canonical: 'λ', category: 'greek', latex: '\\lambda', description: 'Greek lambda' },
];

/* ------------------------------------------------------------------ *
 * normalizeSymbols — the central pre-processor
 * ------------------------------------------------------------------ *
 * Order matters. We process in layers, longest-first inside each
 * layer, so e.g. `arctan` is matched before `tan`.
 *
 *  1. calculus / operator symbols (single chars, no word boundary)
 *  2. function aliases (longest first, word-bounded)
 *  3. constant aliases (word-bounded)
 *  4. greek letter names → unicode (word-bounded, only when not a
 *     known function/constant — greek letter "pi" already mapped to
 *     constant above so it wins; "phi" likewise; this layer only
 *     rewrites the remaining greek names like theta/alpha/beta).
 */
export function normalizeSymbols(input: string): string {
  if (!input) return '';
  let s = input;

  /* 1. calculus & operator symbols (replace literal substrings) */
  // Sort by descending length so e.g. '↔' (1 char) doesn't shadow a multi-char
  // operator — most calculus symbols here are single chars so order is fine,
  // but we still iterate longest-first for safety.
  const calculusKeys = Object.keys(calculusSymbols).sort((a, b) => b.length - a.length);
  for (const sym of calculusKeys) {
    if (s.includes(sym)) {
      s = s.split(sym).join(calculusSymbols[sym]);
    }
  }

  /* 2. function-name aliases — longest first, with word boundaries.
     We exclude `e`/`i`/`j` (handled as constants / complex units) and
     avoid touching inside identifier-like contexts. */
  const funcKeys = Object.keys(functionAliases).sort((a, b) => b.length - a.length);
  for (const alias of funcKeys) {
    if (alias.length < 2) continue; // skip single-letter aliases here
    // \b works for word chars; aliases like `tg^-1` need a custom pattern.
    if (/^[a-z]/i.test(alias)) {
      const re = new RegExp(`\\b${escapeRegExp(alias)}\\b`, 'g');
      s = s.replace(re, functionAliases[alias]);
    } else {
      // non-word alias (e.g. tg^-1) — plain substring replace
      s = s.split(alias).join(functionAliases[alias]);
    }
  }

  /* 3. constants — word-bounded for letter aliases, plain for unicode. */
  const constKeys = Object.keys(constantAliases).sort((a, b) => b.length - a.length);
  for (const alias of constKeys) {
    if (alias.length < 2) continue; // skip `e` — too aggressive to replace globally
    if (/^[a-z]/i.test(alias)) {
      const re = new RegExp(`\\b${escapeRegExp(alias)}\\b`, 'g');
      s = s.replace(re, constantAliases[alias]);
    } else {
      s = s.split(alias).join(constantAliases[alias]);
    }
  }

  /* 4. greek letter names → unicode (so mathjs.toTex emits \theta etc.) */
  const greekKeys = Object.keys(greekLetters).sort((a, b) => b.length - a.length);
  for (const name of greekKeys) {
    if (name.length < 2) continue;
    // Skip names that are already taken by functions or constants.
    if (functionAliases[name] || constantAliases[name]) continue;
    const re = new RegExp(`\\b${escapeRegExp(name)}\\b`, 'g');
    s = s.replace(re, greekLetters[name]);
  }

  return s;
}

/** Escape a string for safe use inside a RegExp. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
