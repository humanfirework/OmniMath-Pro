/**
 * OmniMath Pro — Variable Scanner (N1)
 *
 * 用 mathjs 解析器把表达式变成 AST，遍历出所有"自由变量"引用。
 *
 * 用途：
 *   - 蓝图：知道某个节点依赖哪些变量 → 变量变化时只重算受影响子图。
 *   - 变量面板：删除变量前警告"该变量被 N 处引用"。
 *   - UI：在表达式输入框下方显示 "依赖: a, b"。
 *
 * 设计要点：
 *   - mathjs 的 AST 里，`sin(x)` 是 FunctionNode，其 `fn` 是字符串
 *     'sin'（不是 SymbolNode）。所以遍历 SymbolNode 就能拿到变量引用，
 *     不会把内置函数误判成变量。
 *   - 但 `f(x)`（f 是用户定义的函数变量）的 `fn` 是 SymbolNode，
 *     此时 f 也应算作变量引用 —— 我们也收集它。
 *   - 常量 pi / e / phi 等是 SymbolNode，但属于 mathjs 内置常量。
 *     提供 `filterBuiltins` 选项可剔除它们。
 */

import { math } from './mathInstance';

/** mathjs 内置常量名（不应算作用户变量）。 */
const BUILTIN_CONSTANTS = new Set([
  'pi', 'e', 'E', 'phi', 'tau', 'i',
  'Infinity', 'NaN', 'true', 'false', 'null', 'undefined',
]);

/**
 * 遍历 mathjs AST 节点，对每个 SymbolNode 调用 visitor。
 *
 * **关键：FunctionNode 的 `fn` 子节点也是 SymbolNode（函数名本身），
 * 但它不是变量引用** —— `sin(x)` 中的 `sin` 是内置函数，不是变量。
 * mathjs 的 `forEach` 会把 `fn` 当作第一个子节点遍历，所以我们必须
 * 特判 FunctionNode：只遍历它的 `args`，不遍历 `fn`。
 *
 * 这样 `sin(x)` 只产出 `x`，不会把 `sin` 当作符号。
 * 但 `f(x)`（f 是用户定义的函数变量）的 `f` 也会被跳过 —— 这是一个
 * 已知取舍：如果未来需要区分"用户函数变量"，应在这里对 `fn.name`
 * 做额外检查（例如：若 fn.name 不在内置函数表中，则把它当变量收集）。
 */
function walk(node: math.MathNode, visitor: (n: math.SymbolNode) => void): void {
  if (!node) return;
  // SymbolNode：变量引用
  if (node.type === 'SymbolNode') {
    visitor(node as unknown as math.SymbolNode);
    // SymbolNode 是叶子节点，没有子节点需要遍历。
    return;
  }
  // FunctionNode：跳过 fn，只遍历 args。
  // mathjs FunctionNode 的结构：{ fn: SymbolNode, args: MathNode[] }
  if (node.type === 'FunctionNode') {
    const fnNode = node as unknown as { args?: math.MathNode[] };
    if (Array.isArray(fnNode.args)) {
      for (const arg of fnNode.args) {
        walk(arg, visitor);
      }
    }
    return;
  }
  // 其他节点（OperatorNode, ParenthesisNode, ConditionalNode, ...）
  // 的子节点都是真正的"操作数"，正常遍历即可。
  if (typeof (node as any).forEach === 'function') {
    (node as any).forEach((child: math.MathNode) => walk(child, visitor));
  }
}

/**
 * 提取表达式中所有符号（变量/常量）名。
 *
 * @param expr       数学表达式字符串
 * @param options    filterBuiltins=true 时剔除 pi/e/phi 等内置常量
 * @returns          符号名集合（去重，保持首次出现顺序）
 */
export function extractSymbols(
  expr: string,
  options: { filterBuiltins?: boolean } = {},
): string[] {
  const { filterBuiltins = true } = options;
  if (!expr || typeof expr !== 'string') return [];

  let parsed: math.MathNode;
  try {
    parsed = math.parse(expr);
  } catch {
    // 解析失败（语法错误）→ 返回空，不抛异常。调用方通常在
    // 输入过程中调用此函数，部分输入必然不合法。
    return [];
  }

  const seen = new Set<string>();
  const result: string[] = [];
  walk(parsed, (sym) => {
    const name = sym.name;
    if (!name) return;
    if (filterBuiltins && BUILTIN_CONSTANTS.has(name)) return;
    if (!seen.has(name)) {
      seen.add(name);
      result.push(name);
    }
  });
  return result;
}

/**
 * 绘图自变量保留字：cartesian/polar 用 `x`，parametric 用 `t`（采样时
 * `x` 也会同时传入），`y` 作为惯用因变量名同样排除。极坐标的 `θ`
 * （unicode）及其拉丁拼写 `theta` 也是自变量，不应生成滑块。这些符号在
 * 表达式里出现时不应被当作"自由参数"。
 */
const PLOT_INDEPENDENT_VARS = new Set(['x', 'y', 't', 'θ', 'ϑ', 'Θ', 'theta']);

/**
 * 提取一组（可见 2D）表达式中的"自由参数"名列表。
 *
 * 自由参数 = 表达式里出现的符号，且：
 *   - 不是绘图自变量（x / y / t）
 *   - 不是 mathjs 内置常量（pi / e / phi …，由 extractSymbols 默认剔除）
 *   - 不是内置函数名（sin/cos 等是 FunctionNode，extractSymbols 本就不收集）
 *   - 未在变量作用域（workbench store 的 variables 表）中定义
 *
 * 典型用途：`plot(a*x^2+b)` 后自动为 `a`、`b` 生成 Desmos 式滑块。
 *
 * 注意：滑块值写入的是引擎共享 scope（mathInstance.scope），不写入
 * store 的 variables 表，因此这里以 `definedVars`（store variables 的
 * keys）为排除依据，参数不会因拖动滑块而"被定义"并从列表消失。
 *
 * @param exprs       可见 2D 表达式列表
 * @param definedVars 已在变量作用域中定义的符号名（store variables 的 keys）
 * @returns           自由参数名（跨表达式去重，保持首次出现顺序）
 */
export function extractFreeParameters(
  exprs: string[],
  definedVars: string[] = [],
): string[] {
  if (!Array.isArray(exprs) || exprs.length === 0) return [];
  const defined = new Set(definedVars);
  const seen = new Set<string>();
  const result: string[] = [];
  for (const expr of exprs) {
    for (const sym of extractSymbols(expr)) {
      if (PLOT_INDEPENDENT_VARS.has(sym)) continue;
      if (defined.has(sym)) continue;
      if (!seen.has(sym)) {
        seen.add(sym);
        result.push(sym);
      }
    }
  }
  return result;
}

/**
 * 扫描表达式引用了 `knownVars` 中的哪些变量。
 *
 * 这是蓝图引擎最常用的 API：传入节点的表达式 + 当前所有变量名，
 * 返回该表达式实际依赖的变量子集。
 *
 * 注意：这里用 `filterBuiltins: false` 提取全部符号，再用 knownVars
 * 过滤。因为 `e`/`i` 这类名字既可能是 mathjs 内置常量，也可能是
 * 用户变量 —— 真正的消歧由 knownVars 决定：若 `e` 在 knownVars 里，
 * 就把它当作用户变量；否则忽略。
 *
 * @param expr       数学表达式
 * @param knownVars  已知变量名列表（通常是 workbench.variables 的 keys）
 * @returns          被引用的变量名（按 knownVars 顺序）
 */
export function scanVariables(expr: string, knownVars: string[]): string[] {
  if (!knownVars.length) return [];
  const knownSet = new Set(knownVars);
  const symbols = extractSymbols(expr, { filterBuiltins: false });
  return knownVars.filter((v) => knownSet.has(v) && symbols.includes(v));
}

/**
 * 批量扫描：给一组 (id → expr) 映射，返回每个 id 依赖的变量。
 * 用于蓝图整图扫描，找出哪些节点会受某变量变化影响。
 */
export function scanVariablesBatch(
  entries: Array<{ id: string; expr: string }>,
  knownVars: string[],
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const { id, expr } of entries) {
    out.set(id, scanVariables(expr, knownVars));
  }
  return out;
}

/**
 * 反向索引：给定一组表达式，返回每个变量被哪些 id 引用。
 * 用于变量删除前的"影响范围"提示。
 *
 * @returns Map<varName, Set<id>>
 */
export function buildVariableUsageIndex(
  entries: Array<{ id: string; expr: string }>,
  knownVars: string[],
): Map<string, Set<string>> {
  const index = new Map<string, Set<string>>();
  for (const v of knownVars) index.set(v, new Set());
  for (const { id, expr } of entries) {
    const deps = scanVariables(expr, knownVars);
    for (const dep of deps) {
      index.get(dep)?.add(id);
    }
  }
  return index;
}
