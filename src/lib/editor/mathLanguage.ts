/**
 * OmniMath Pro — Math StreamLanguage for CodeMirror
 *
 * A lightweight tokenizer for the "Simple" and "MATLAB" input modes.
 * Recognizes: comments, numbers, strings, function names, keywords,
 * operators, and variables.
 *
 * This is NOT a full parser — it's for syntax highlighting only.
 * Actual evaluation is done by mathjs in the engine.
 */

import { tags as t } from '@lezer/highlight';
import type { StreamParser } from '@codemirror/language';

interface State {
  inString: boolean;
  stringChar: string;
}

export const KEYWORDS = [
  'plot', 'polarplot', 'polar', 'solve', 'derivative', 'integrate',
  'limit', 'taylor', 'eigenvectors', 'if', 'else', 'for', 'while',
  'function', 'return', 'break', 'continue', 'end',
  'elseif', 'switch', 'case', 'otherwise', 'try', 'catch', 'global', 'persistent',
];

const FUNCTIONS = [
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'arcsin', 'arccos', 'arctan',
  'sinh', 'cosh', 'tanh', 'log', 'log10', 'log2', 'ln', 'lg', 'exp',
  'sqrt', 'cbrt', 'abs', 'sign', 'floor', 'ceil', 'round', 'fix',
  'min', 'max', 'gcd', 'lcm', 'mod', 'rem',
  'factorial', 'gamma', 'erf', 'erfc',
  'real', 'imag', 'conj', 'arg', 'angle',
  'det', 'inv', 'transpose', 'ctranspose', 'trace', 'rank',
  'rref', 'lu', 'qr', 'cholesky', 'svd',
  'eye', 'zeros', 'ones', 'rand',
  'sum', 'prod', 'cumsum', 'cumprod', 'diff', 'sort',
  'reshape', 'size', 'length', 'numel',
  'simplify', 'rationalize', 'derivative',
];

export const math: StreamParser<State> = {
  name: 'math',

  startState: () => ({
    inString: false,
    stringChar: '',
  }),

  token: (stream, state) => {
    // Comment (# or //)
    if (stream.sol() && (stream.peek() === '#' || (stream.peek() === '/' && stream.string.slice(stream.pos + 1, stream.pos + 2) === '/'))) {
      stream.skipToEnd();
      return 'comment';
    }
    if (stream.peek() === '#' || (stream.peek() === '/' && stream.string.slice(stream.pos + 1, stream.pos + 2) === '/')) {
      stream.skipToEnd();
      return 'comment';
    }

    // MATLAB % comment
    if (stream.peek() === '%') {
      stream.skipToEnd();
      return 'comment';
    }

    // String
    if (stream.peek() === '"' || stream.peek() === "'") {
      // Distinguish string from MATLAB transpose
      // Heuristic: if preceded by a letter/number/closing bracket, it's transpose, not string
      const current = stream.current().trimEnd();
      const lastChar = current[current.length - 1];
      if (lastChar && /[a-zA-Z0-9\)\]\}]/.test(lastChar)) {
        stream.next();
        return 'operator';
      }
      const quote = stream.next()!;
      while (!stream.eol()) {
        const ch = stream.next()!;
        if (ch === quote) break;
      }
      return 'string';
    }

    // Whitespace
    if (stream.eatSpace()) return null;

    // Number (including decimals, scientific notation, hex)
    if (stream.match(/^0[xX][0-9a-fA-F]+/)) return 'number';
    if (stream.match(/^\d+\.?\d*([eE][+-]?\d+)?/)) {
      // Check for implicit multiplication like "2x" — don't consume the x
      return 'number';
    }
    if (stream.match(/^\.\d+/)) return 'number';

    // Variable/identifier
    if (stream.match(/^[a-zA-Z_][a-zA-Z0-9_]*/)) {
      const word = stream.current();
      if (KEYWORDS.includes(word)) return 'keyword';
      if (FUNCTIONS.includes(word)) return 'function';
      // Constants (pi, e, inf, …) → 'atom'，使其在 VSCode Dark+/Light+ 调色板中
      // 拥有专属的 --syntax-constant 颜色（青色 / 红色），与普通变量区分。
      if (['pi', 'e', 'inf', 'infinity', 'nan'].includes(word)) {
        return 'atom';
      }
      // 布尔 (true / false) → 'bool'，在 VSCode 调色板里以蓝色加粗呈现。
      if (word === 'true' || word === 'false') {
        return 'bool';
      }
      return 'variableName';
    }

    // Operators
    if (stream.match(/^[+\-*/^%=<>!&|~]/)) {
      stream.match(/^[+\-*/^%=<>!&|~]/); // multi-char operators like ==, <=, &&, etc.
      return 'operator';
    }

    // Punctuation
    if (stream.match(/^[(){}\[\];,:.]/)) return 'punctuation';

    // Fallback
    stream.next();
    return null;
  },

  languageData: {
    commentTokens: { line: '#' },
    closeBrackets: ['(', '[', '{', '"', "'"],
  },
};
