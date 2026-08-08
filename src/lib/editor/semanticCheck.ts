/**
 * OmniMath Pro — 语义检查（Semantic Check）
 *
 * 在 `syntaxCheck`（mathjs 语法）之上，进一步做「符号级」纠错，捕获
 * mathjs 语法解析无法发现的问题：
 *   - 未定义函数调用：如 `sinn(x)`（拼错 `sin`）、`foo(x)`（乱写的函数）。
 *   - 未定义变量引用：如用了一个从未赋值、也不属于内置常量的名字。
 *
 * 与 `syntaxCheck` 的分工：
 *   - syntaxCheck 管「语法能不能解析」；
 *   - checkSemantics 管「用到的名字认不认识」——这才是用户日常最容易犯的
 *     拼写 / 大小写 / 未赋值错误，是最有价值的“AI 纠错”提示。
 *
 * 本模块不依赖 DOM / EditorView，核心 `analyzeSemantics(source, known)`
 * 是纯函数，可直接在 vitest 中单测。
 */

import { Diagnostic } from '@codemirror/lint';
import { EditorView } from '@codemirror/view';
import { FUNCTIONS, KEYWORDS } from './mathLanguage';

/** 内置常量（mathjs 直接可用的符号，不视为未定义变量）。 */
const BUILTIN_CONSTANTS = new Set([
  'pi', 'e', 'i', 'j', 'Inf', 'Infinity', 'NaN', 'true', 'false',
  'tau', 'phi', 'goldenRatio', 'Euler',
  'null', 'undefined',
  'LN2', 'LN10', 'LOG2E', 'LOG10E', 'SQRT2', 'SQRT1_2',
]);

/** 控制流 / 命令关键字 —— 这些行不做「未定义变量」判定（避免把 if/for 误报）。 */
const CONTROL_KEYWORDS = new Set([
  'if', 'else', 'elseif', 'for', 'while', 'switch', 'case', 'otherwise',
  'end', 'return', 'break', 'continue', 'function', 'try', 'catch',
  'plot', 'plot2d', 'plot3d', 'surface', 'surf', 'polarplot', 'polar',
  'mesh', 'contour', 'scatter', 'bar', 'stem',
  'solve', 'derivative', 'integrate',
  'limit', 'taylor', 'eigenvectors', 'global', 'persistent',
  'fplot', 'syms', 'disp', 'hold', 'grid', 'xlabel', 'ylabel', 'title',
  'legend', 'axis', 'clc', 'clear', 'whos', 'pause', 'fprintf', 'figure',
]);

/** 已知函数全集（内置 + 用户自定义）。 */
const BUILTIN_FUNCTIONS = new Set([...FUNCTIONS, ...KEYWORDS]);

/**
 * 引擎在绘图上下文中「隐式定义」的自变量 —— 不视为未定义变量，与引擎行为一致：
 *  - `x`：直角坐标自动绘图。simple 模式下任何含自由 `x` 的表达式都会走
 *    auto-plot（见 evaluator.hasFreeVariableX），因此 `sin(x)*cos(x)` 里的
 *    `x` 是绘图自变量，而非未定义变量。
 *  - `theta`（大小写不敏感，含 `θ`）：极坐标自变量。`r = f(θ)` 会被引擎识别为
 *    极坐标绘图（见 evaluator 的 polar 检测），`theta` 由引擎隐式定义。
 * 语义检查器必须与引擎保持一致，否则 `r = 4*sin(6*theta)`、`sin(x)*cos(x)`
 * 会被误报成「未定义变量」。
 */
const IMPLICIT_PLOT_VARS = new Set(['x', 'theta']);

/**
 * 语义检查的行数上限 —— 与 syntaxCheck 的 MAX_LINES_CHECKED 保持一致，
 * 避免超大文档让每次 lint（默认 750ms 防抖）在主线程上扫描全部行导致卡顿。
 * 超过上限时只检查前 N 行（用户通常在文件开头附近编辑）。
 */
const MAX_LINES_CHECKED = 500;

/** 外部注入的已知符号（工作台变量、用户自定义函数）。 */
export interface SemanticKnownSymbols {
  /** 已定义 / 在作用域内的变量名。 */
  variables?: ReadonlySet<string> | string[];
  /** 已定义 / 用户自定义的函数名。 */
  functions?: ReadonlySet<string> | string[];
}

/** 一条语义问题（不依赖 CodeMirror，便于单测 / 供 AI 使用）。 */
export interface SemanticIssue {
  /** 1-based 行号。 */
  line: number;
  /** 绝对字符偏移（从文档起点）。 */
  from: number;
  /** 结束偏移。 */
  to: number;
  /** 人类可读提示（中文）。 */
  message: string;
  severity: 'warning' | 'error';
  kind: 'undefined-function' | 'undefined-variable';
}

/* ─────────────────────────────────────────────────────────────── *
 * 纯逻辑：从源码文本中找出语义问题
 * ─────────────────────────────────────────────────────────────── */

/**
 * 从一行源码中剥离注释（尊重字符串内的 `#` / `%` / `//`），返回
 * 不含注释的代码段，以及注释起点的绝对偏移（供定位错误列）。
 */
function stripComment(line: string): { code: string; commentStart: number } {
  let inString: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inString) {
      if (ch === inString && line[i - 1] !== '\\') inString = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = ch;
      continue;
    }
    if (ch === '#' || ch === '%') return { code: line.slice(0, i), commentStart: i };
    if (ch === '/' && line[i + 1] === '/') return { code: line.slice(0, i), commentStart: i };
  }
  return { code: line, commentStart: line.length };
}

/** 检测一行是否为纯控制流 / 命令行（这类行跳过「未定义变量」判定）。 */
function isControlLine(code: string): boolean {
  const first = code.trim().split(/[\s(]/)[0].toLowerCase();
  return CONTROL_KEYWORDS.has(first);
}

/**
 * 分析源码的语义问题。
 *
 * @param source 编辑器全文（或单个文件内容）。
 * @param known  已知符号（工作台变量 + 用户函数）。
 * @returns 排序后的语义问题列表。
 */
export function analyzeSemantics(
  source: string,
  known: SemanticKnownSymbols = {},
): SemanticIssue[] {
  const knownVars = new Set<string>((known.variables as readonly string[] | undefined) ?? []);
  const knownFns = new Set<string>([...BUILTIN_FUNCTIONS, ...(known.functions as readonly string[] | undefined) ?? []]);
  // 已知函数大小写不敏感（引擎 preprocess 对 plot/plot3d/surface 等命令是
  // 大小写均可的，如 `plot3D` 也能执行）。因此 `plot3D`/`PLOT3D` 不应被当作
  // 未定义函数误报。变量名仍是大小写敏感的，故仅对函数做不敏感匹配。
  const knownFnsLower = new Set<string>([...knownFns].map((s) => s.toLowerCase()));

  const issues: SemanticIssue[] = [];

  // 先收集文档内所有赋值/函数定义，让「后面用到的名字」被识别为已定义。
  // 分两遍：第一遍收集定义，第二遍才做未定义判定 —— 避免定义与其使用
  // 在同一遍里互相影响（无论定义在文档前还是后，都能识别）。
  const assignedVars = new Set<string>();
  const definedFns = new Set<string>();
  const perLine = source.split('\n');
  const scanCount = Math.min(perLine.length, MAX_LINES_CHECKED);

  for (let li = 0; li < scanCount; li++) {
    const { code } = stripComment(perLine[li]);
    const trimmed = code.trim();
    if (!trimmed) continue;

    // 函数定义：`f(x) = ...` 或 MATLAB `function y = f(x)`
    const fnDef = trimmed.match(/^\s*function\s+[\w.]*\s*=\s*([A-Za-z_]\w*)\s*\(/);
    const fnDef2 = trimmed.match(/^\s*([A-Za-z_]\w*)\s*\([^)]*\)\s*:?=\s*.+$/);
    if (fnDef) {
      definedFns.add(fnDef[1]);
      continue;
    }
    if (fnDef2) {
      definedFns.add(fnDef2[1]);
      continue;
    }

    // for 循环变量：`for i = 1:n` → i 在循环体内已定义
    const forMatch = trimmed.match(/^\s*for\s+([A-Za-z_]\w*)\s*=/);
    if (forMatch) {
      assignedVars.add(forMatch[1]);
      continue;
    }

    // 普通赋值：`name = ...` / `name := ...` / `name(1) = ...`
    const assign = trimmed.match(/^\s*([A-Za-z_]\w*)\s*(?:\([^)]*\))?\s*:?=\s*.+$/);
    if (assign) {
      assignedVars.add(assign[1]);
    }
  }

  // 第二遍：真正的未定义判定（同样只扫前 scanCount 行，避免超大文档卡顿）
  for (let li = 0; li < scanCount; li++) {
    const line = perLine[li];
    const { code } = stripComment(line);
    const trimmed = code.trim();
    if (!trimmed) continue;
    if (trimmed === '---' || trimmed === '%%%') continue;
    if (isControlLine(code)) continue;

    const lineFrom = offsetOfLine(perLine, li);
    const flaggedFuncs = new Set<string>();
    const flaggedVars = new Set<string>();

    // 1) 未定义函数调用：`name(` 且 name 不是任何已知函数 / 已定义变量
    const callRe = /([A-Za-z_]\w*)\s*\(/g;
    let m: RegExpExecArray | null;
    while ((m = callRe.exec(code)) !== null) {
      const name = m[1];
      // 跳过被定义的函数名（函数定义行会走到 continue，这里主要防误报）
      if (definedFns.has(name)) continue;
      if (knownFnsLower.has(name.toLowerCase())) continue; // 内置函数（大小写不敏感）
      if (assignedVars.has(name) || knownVars.has(name)) continue; // 可能是函数句柄变量
      if (BUILTIN_CONSTANTS.has(name)) continue;
      if (flaggedFuncs.has(name)) continue;
      flaggedFuncs.add(name);

      const col = m.index;
      const from = lineFrom + col;
      const to = from + name.length;
      const suggestion = suggestFunction(name);
      issues.push({
        line: li + 1,
        from,
        to,
        severity: 'warning',
        kind: 'undefined-function',
        message: suggestion
          ? `未定义函数「${name}」，是否想用「${suggestion}」？`
          : `未定义函数「${name}」（若想用自定义函数，请先定义）`,
      });
    }

    // 2) 未定义变量：裸标识符（后不紧跟 `(`），且不是任何已知函数/常量/已定义名。
    // 注意 `(?![\w]|\s*\()`：既不允许后跟 `(`（那是函数调用），也不允许后跟
    // 标识符字符。若只有 `(?!\s*\()`，遇到 `det(` 时正则会把 `\w*` 回溯成
    // 前缀 `de`（后跟 `t`，非 `(`）而误报「未定义变量 de」；`plot3d(` 会误报
    // 前缀 `plot3`。加 `[\w]` 后，任何被更大标识符覆盖的前缀都不会被匹配。
    const codeBody = code;
    const varRe = /(^|[^A-Za-z0-9_.])([A-Za-z_]\w*)(?![\w]|\s*\()/g;
    let vm: RegExpExecArray | null;
    while ((vm = varRe.exec(codeBody)) !== null) {
      const name = vm[2];
      // 跳过已识别为函数调用的（由第 1 步处理，避免重复）
      if (flaggedFuncs.has(name)) continue;
      if (knownFnsLower.has(name.toLowerCase())) continue; // 内置函数（大小写不敏感）
      if (definedFns.has(name)) continue;
      if (BUILTIN_CONSTANTS.has(name)) continue;
      // 引擎隐式定义的绘图自变量（x / theta）—— 由绘图上下文自动定义，不误报。
      if (IMPLICIT_PLOT_VARS.has(name) || (name.toLowerCase() === 'theta')) continue;
      if (assignedVars.has(name) || knownVars.has(name)) continue;
      if (flaggedVars.has(name)) continue;
      // 跳过紧跟在数字后的（如 `2x` 里 x 是变量但属乘法简写，仍可能未定义 → 仍报）
      flaggedVars.add(name);

      const col = vm.index + vm[1].length;
      const from = lineFrom + col;
      const to = from + name.length;
      issues.push({
        line: li + 1,
        from,
        to,
        severity: 'warning',
        kind: 'undefined-variable',
        message: `未定义变量「${name}」（请先赋值，或用等号右侧计算）`,
      });
    }
  }

  issues.sort((a, b) => a.from - b.from);
  return issues;
}

/** 求第 i 行的绝对偏移（0-based，i 为行下标）。 */
function offsetOfLine(lines: string[], i: number): number {
  let off = 0;
  for (let k = 0; k < i; k++) off += lines[k].length + 1; // +1 换行符
  return off;
}

/** 对未定义函数名给一个「最接近的内置函数」建议（编辑距离 ≤ 2）。 */
function suggestFunction(name: string): string | null {
  const lower = name.toLowerCase();
  let best: string | null = null;
  let bestDist = 3; // 阈值：最多错 2 个字符
  for (const fn of FUNCTIONS) {
    if (fn.length < 2) continue;
    const d = levenshtein(lower, fn.toLowerCase());
    if (d < bestDist || (d === bestDist && fn.length < (best?.length ?? Infinity))) {
      best = fn;
      bestDist = d;
    }
  }
  return bestDist <= 2 ? best : null;
}

/** 编辑距离（Levenshtein），用于容错拼写建议。 */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

/* ─────────────────────────────────────────────────────────────── *
 * CodeMirror 集成：EditorView → Diagnostic[]
 * ─────────────────────────────────────────────────────────────── */

/**
 * 把语义问题转换成 CodeMirror Diagnostic，供 linter() 使用。
 * `known` 由调用方注入（工作台变量等）。
 */
export function semanticDiagnostics(
  view: EditorView,
  known: SemanticKnownSymbols = {},
): Diagnostic[] {
  const source = view.state.doc.toString();
  return analyzeSemantics(source, known).map((it) => ({
    from: it.from,
    to: it.to,
    severity: it.severity,
    message: it.message,
    source: 'semantic',
  }));
}
