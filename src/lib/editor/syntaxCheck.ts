/**
 * OmniMath Pro — Syntax Checker for CodeMirror 6
 *
 * Uses mathjs.parse() to validate each line of the editor and reports
 * syntax errors as CodeMirror Diagnostic objects.
 *
 * Behavior:
 *  - For 'simple' and 'matlab' modes: parse each non-comment, non-empty line.
 *  - For 'python' mode: skip mathjs parsing (only basic bracket matching).
 *  - Ignores assignment LHS (e.g. `a = ` — only the RHS is parsed).
 *  - Errors are reported with line/column positioning.
 *
 * Performance: This runs synchronously on every lint tick (debounced by
 * CodeMirror's linter() — default 750ms). For very large documents we
 * cap the number of lines checked to 500 to avoid blocking.
 */

import { Diagnostic } from '@codemirror/lint';
import { EditorView } from '@codemirror/view';

export type SupportedLanguage = 'simple' | 'python' | 'matlab';

const MAX_LINES_CHECKED = 500;

/**
 * Obvious line-level mistakes. Deliberately conservative — the goal is to
 * catch typos without rejecting the lenient syntax the engine accepts
 * (`2x`, `ax + b`, `plot sin(x)` …).
 */
export interface LineIssue {
  message: string;
  /** 0-based column inside the checked expression. */
  col: number;
  /** Highlights this many characters (defaults to 1). */
  length?: number;
}

export function findLineIssue(expr: string): LineIssue | null {
  const s = expr.trimEnd();
  if (!s) return null;

  // 结尾是二元运算符：`x^`、`2 *`、`y =`。
  if (/[+\-*/^=,]$/.test(s)) {
    return { message: '表达式以运算符结尾', col: Math.max(0, s.length - 1) };
  }

  // 连续两个「不可能连用」的运算符（`* /`、`= *` …）。允许 `*-3`、`^-2`
  // 这类合法的「运算符 + 负号」。
  if (/[+\-*/^=]\s*[+*/^=]/.test(s)) {
    const match = s.match(/[+\-*/^=]\s*[+*/^=]/);
    return {
      message: '这里缺少一个操作数',
      col: match?.index ?? 0,
      length: match?.[0].length ?? 1,
    };
  }

  // 字符串未闭合
  const quotes = (s.match(/"/g) ?? []).length;
  if (quotes % 2 === 1) {
    return { message: '字符串引号没有闭合', col: Math.max(0, s.lastIndexOf('"')) };
  }

  return null;
}

/**
 * Build a list of syntax diagnostics for the given editor view.
 *
 * This used to call `mathjs.parse` per line, which meant opening the editor
 * pulled the whole mathjs runtime (~1.5 MB) just to underline typos. The
 * checks below are local and instant; the real parser still runs when the
 * user executes the script.
 */
export function checkSyntax(
  view: EditorView,
  language: SupportedLanguage,
): Diagnostic[] {
  // 括号 / 引号配对在所有模式下都有意义。
  const diagnostics = checkBracketBalance(view);
  if (language === 'python') return diagnostics;

  const doc = view.state.doc;
  const limit = Math.min(doc.lines, MAX_LINES_CHECKED);

  for (let lineNum = 1; lineNum <= limit; lineNum++) {
    const line = doc.line(lineNum);
    const raw = line.text;
    const trimmed = raw.trim();

    if (!trimmed) continue;
    if (
      trimmed.startsWith('#') ||
      trimmed.startsWith('//') ||
      trimmed.startsWith('%')
    ) {
      continue;
    }
    if (trimmed === '---' || trimmed === '%%%') continue;
    if (isControlFlow(trimmed)) continue;

    const rhs = extractRhs(trimmed);
    if (!rhs) continue;

    const issue = findLineIssue(rhs);
    if (!issue) continue;

    const rhsOffset = raw.indexOf(rhs);
    const from = line.from + Math.max(0, (rhsOffset >= 0 ? rhsOffset : 0) + issue.col);
    diagnostics.push({
      from,
      to: Math.min(line.to, from + (issue.length ?? 1)),
      severity: 'error',
      message: issue.message,
      source: 'omnimath',
    });
  }

  return diagnostics;
}

/* ─── Helpers ──────────────────────────────────────────────────── */

/**
 * Extract the RHS of an assignment statement.
 * Returns the expression to parse, or null if nothing should be checked.
 */
function extractRhs(line: string): string | null {
  // Match `name = ...`, `name(args) = ...`, `name := ...`
  // We look for the first `=` that is not `==`, `<=`, `>=`, `!=`, `:=`
  const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*(\([^)]*\))?)\s*:?=\s*(.+)$/);
  if (match) {
    return match[3].trim();
  }
  return line;
}

/**
 * Detect control-flow keywords that mathjs cannot parse.
 * These lines are skipped (a real parser would handle them).
 */
function isControlFlow(line: string): boolean {
  const kw = line.split(/[ (]/)[0].toLowerCase();
  return ['if', 'else', 'elif', 'for', 'while', 'function', 'return', 'break', 'continue', 'end', 'switch', 'case', 'otherwise'].includes(kw);
}

/**
 * Basic bracket balance check for Python mode.
 * Reports unbalanced () [] {} as warnings.
 */
function checkBracketBalance(view: EditorView): Diagnostic[] {
  const doc = view.state.doc;
  const diagnostics: Diagnostic[] = [];
  const pairs: Record<string, string> = { ')': '(', ']': '[', '}': '{' };
  const openers = new Set(['(', '[', '{']);
  const closers = new Set([')', ']', '}']);

  for (let lineNum = 1; lineNum <= doc.lines; lineNum++) {
    const line = doc.line(lineNum);
    const text = line.text;
    // Skip comment portion
    const commentIdx = findCommentStart(text);
    const code = commentIdx >= 0 ? text.slice(0, commentIdx) : text;

    const stack: Array<{ ch: string; pos: number }> = [];
    let inString: string | null = null;

    for (let i = 0; i < code.length; i++) {
      const ch = code[i];

      // Handle strings (skip brackets inside strings)
      if (inString) {
        if (ch === inString && code[i - 1] !== '\\') inString = null;
        continue;
      }
      if (ch === '"' || ch === "'") {
        inString = ch;
        continue;
      }

      if (openers.has(ch)) {
        stack.push({ ch, pos: i });
      } else if (closers.has(ch)) {
        const opener = pairs[ch];
        const top = stack[stack.length - 1];
        if (!top || top.ch !== opener) {
          // Mismatched or extra closer
          diagnostics.push({
            from: line.from + i,
            to: line.from + i + 1,
            severity: 'warning',
            message: `Unmatched '${ch}'`,
            source: 'syntax',
          });
        } else {
          stack.pop();
        }
      }
    }

    // Unclosed brackets on this line
    for (const { pos } of stack) {
      diagnostics.push({
        from: line.from + pos,
        to: line.from + pos + 1,
        severity: 'warning',
        message: 'Unclosed bracket',
        source: 'syntax',
      });
    }
  }

  return diagnostics;
}

/**
 * Find the index where a comment starts in a Python line.
 * Returns -1 if no comment is present.
 */
function findCommentStart(text: string): number {
  let inString: string | null = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === inString && text[i - 1] !== '\\') inString = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = ch;
      continue;
    }
    if (ch === '#') return i;
  }
  return -1;
}
