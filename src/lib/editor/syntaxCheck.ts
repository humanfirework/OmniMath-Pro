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
import { parse } from 'mathjs';

export type SupportedLanguage = 'simple' | 'python' | 'matlab';

const MAX_LINES_CHECKED = 500;

/**
 * Build a list of syntax diagnostics for the given editor view.
 */
export function checkSyntax(
  view: EditorView,
  language: SupportedLanguage,
): Diagnostic[] {
  const doc = view.state.doc;
  const lineCount = doc.lines;

  if (language === 'python') {
    // Python mode: only do basic bracket matching, mathjs cannot parse Python.
    return checkBracketBalance(view);
  }

  const diagnostics: Diagnostic[] = [];
  const limit = Math.min(lineCount, MAX_LINES_CHECKED);

  for (let lineNum = 1; lineNum <= limit; lineNum++) {
    const line = doc.line(lineNum);
    const raw = line.text;
    const trimmed = raw.trim();

    // Skip empty and comment lines
    if (!trimmed) continue;
    if (
      trimmed.startsWith('#') ||
      trimmed.startsWith('//') ||
      trimmed.startsWith('%')
    ) {
      continue;
    }

    // Extract RHS of assignment if present.
    // Supports: `a = ...`, `A = [...]`, `f(x) = ...`, `a := ...`
    const rhs = extractRhs(trimmed);
    if (!rhs) continue;

    // Skip control-flow keywords that mathjs can't parse.
    if (isControlFlow(trimmed)) continue;

    try {
      parse(rhs);
    } catch (err) {
      const diag = buildDiagnostic(err, line.from, raw, rhs);
      if (diag) diagnostics.push(diag);
    }
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
 * Convert a mathjs error into a Diagnostic with proper positioning.
 */
function buildDiagnostic(
  err: unknown,
  lineStart: number,
  rawLine: string,
  rhs: string,
): Diagnostic | null {
  const e = err as { message?: string; char?: number; index?: number; data?: unknown };
  const message = e.message || 'Syntax error';

  // mathjs errors usually include `char` (column in the parsed string, 1-based)
  // or `index` (0-based offset). We need to map back to the original line.
  let col = -1;
  if (typeof e.char === 'number' && e.char > 0) {
    col = e.char - 1;
  } else if (typeof e.index === 'number' && e.index >= 0) {
    col = e.index;
  }

  // Map RHS column back to raw line column.
  // If rhs is a substring of rawLine, offset by the position of rhs in rawLine.
  const rhsOffset = rawLine.indexOf(rhs);
  let absCol = col;
  if (rhsOffset >= 0 && col >= 0) {
    absCol = rhsOffset + col;
  } else if (col < 0) {
    // Fallback: highlight the whole line
    absCol = 0;
  }

  // Clamp to line length
  absCol = Math.max(0, Math.min(absCol, rawLine.length));

  // Determine the span of the error marker.
  // If we have a precise column, highlight a small token; otherwise the whole line.
  let from = lineStart + absCol;
  let to: number;
  if (col >= 0 && absCol < rawLine.length) {
    // Highlight a single character or a small token at the error position.
    const remaining = rawLine.slice(absCol);
    const tokenMatch = remaining.match(/^([A-Za-z_][A-Za-z0-9_]*|[0-9]+\.?[0-9]*|[(){}\[\];,:.+\-*/^%=<>!&|~])/);
    to = from + (tokenMatch ? tokenMatch[0].length : 1);
  } else {
    to = lineStart + rawLine.length;
  }

  // Clean up the message — strip leading "Error:" or similar.
  const cleanMessage = message.replace(/^(Error:\s*)/i, '');

  return {
    from,
    to,
    severity: 'error',
    message: cleanMessage,
    source: 'mathjs',
  };
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
