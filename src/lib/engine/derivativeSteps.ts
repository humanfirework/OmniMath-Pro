/**
 * OmniMath Pro — 求导法则标注引擎（纯逻辑，无 React）
 *
 * 对 mathjs AST 做结构化遍历，为符号求导生成分步说明，每一步标注
 * 所用的求导法则（Task 4.1）：
 *
 *   幂法则 / 乘积法则 / 商法则 / 链式法则 / 和差法则 / 常数法则 /
 *   指数法则 / 对数法则 / 基本初等函数
 *
 * 实际导数计算仍交给 mathjs `math.derivative`（保证代数正确性），
 * 本模块只负责"解释"——在含自变量的每个结构节点上记录一条法则步骤。
 *
 * 输出 steps 为 LaTeX 字符串数组（法则名内联），与既有
 * `EvalResult.steps` / `SymbolicResult.steps` 结构向后兼容。
 */

import { symbolicMath } from './mathInstance';

export interface DerivativeStepsResult {
  /** 化简后的导数 LaTeX */
  resultLatex: string;
  /** 化简后的导数纯文本（mathjs 语法，可直接送入绘图） */
  resultString: string;
  /** 分步说明（LaTeX 字符串，法则名内联） */
  steps: string[];
}

type MathNode = {
  type?: string;
  isOperatorNode?: boolean;
  op?: string;
  fn?: string;
  args?: MathNode[];
  isConstantNode?: boolean;
  value?: unknown;
  isSymbolNode?: boolean;
  name?: string;
  content?: MathNode;
  toTex?: (opts?: unknown) => string;
};

/** 基本初等函数求导表（LaTeX 形式，u 为内层） */
const ELEMENTARY_RULES: Record<string, { deriv: string; name: string }> = {
  sin: { deriv: '\\cos(u)', name: '基本初等函数' },
  cos: { deriv: '-\\sin(u)', name: '基本初等函数' },
  tan: { deriv: '\\sec^2(u)', name: '基本初等函数' },
  exp: { deriv: 'e^{u}', name: '指数法则' },
  log: { deriv: '\\frac{1}{u}', name: '对数法则' },
  ln: { deriv: '\\frac{1}{u}', name: '对数法则' },
  sqrt: { deriv: '\\frac{1}{2\\sqrt{u}}', name: '幂法则（n = 1/2）' },
  asin: { deriv: '\\frac{1}{\\sqrt{1-u^2}}', name: '基本初等函数' },
  acos: { deriv: '-\\frac{1}{\\sqrt{1-u^2}}', name: '基本初等函数' },
  atan: { deriv: '\\frac{1}{1+u^2}', name: '基本初等函数' },
  sinh: { deriv: '\\cosh(u)', name: '基本初等函数' },
  cosh: { deriv: '\\sinh(u)', name: '基本初等函数' },
  tanh: { deriv: '\\operatorname{sech}^2(u)', name: '基本初等函数' },
  abs: { deriv: '\\operatorname{sgn}(u)', name: '基本初等函数' },
};

/** 节点是否含有自变量 varName */
function containsVar(node: MathNode, varName: string): boolean {
  let found = false;
  try {
    (node as unknown as { traverse: (cb: (n: MathNode) => void) => void }).traverse(
      (n) => {
        if ((n.isSymbolNode || n.type === 'SymbolNode') && n.name === varName) {
          found = true;
        }
      },
    );
  } catch {
    // traverse 不可用时按包含处理（保守）
    return true;
  }
  return found;
}

function tex(node: MathNode): string {
  try {
    return node.toTex ? node.toTex({ implicit: 'hide' }) : String(node);
  } catch {
    return String(node);
  }
}

/**
 * 把引擎自定义的 ln 规范化为 mathjs 内置的 log，供求导路径使用：
 * mathjs 的求导函数表只认识内置函数，引擎覆盖加入的 ln 不在其中，
 * 直接求导会抛 "Cannot process function"。
 */
function normalizeLnForDerivative(expr: string): string {
  return expr.replace(/\bln\s*\(/g, 'log(');
}

/**
 * 结果字符串中的自然对数统一改回 ln 记号：引擎共享实例里 log 是
 * 10 底对数，若把 mathjs 求导产生的 log（自然对数）直接送回引擎
 * 求值/绘图会得到错误数值；ln 才是引擎内自然对数的习惯记号。
 */
function toEngineSyntax(expr: string): string {
  return expr.replace(/\blog\s*\(/g, 'ln(');
}

/** math.derivative 的安全包装（失败返回 null） */
function safeDerivativeTex(node: MathNode, varName: string): string | null {
  try {
    const normalized = symbolicMath.parse(
      normalizeLnForDerivative(String(node)),
    );
    const d = symbolicMath.derivative(normalized as never, varName);
    return (d as unknown as MathNode).toTex
      ? (d as unknown as MathNode).toTex!({ implicit: 'hide' })
      : String(d);
  } catch {
    return null;
  }
}

/**
 * 递归标注：在含自变量的结构节点上记录法则步骤。
 * depth 控制递归深度，防止极端嵌套表达式产生过长步骤列表。
 */
function annotate(node: MathNode, varName: string, steps: string[], depth: number): void {
  if (depth > 8) return;
  if (!node || !containsVar(node, varName)) return;

  // Parenthesis — 透传
  if (node.type === 'ParenthesisNode') {
    annotate(node.content as MathNode, varName, steps, depth);
    return;
  }

  // Symbol — 到达叶子
  if (node.isSymbolNode || node.type === 'SymbolNode') {
    if (node.name === varName) {
      steps.push(`\\text{变量法则：} \\frac{d}{d${varName}} ${varName} = 1`);
    }
    return;
  }

  // Constant — 不含变量时已被 containsVar 排除
  if (node.isConstantNode || node.type === 'ConstantNode') return;

  // Operator nodes
  if (node.isOperatorNode || node.type === 'OperatorNode') {
    const args = node.args ?? [];
    const op = node.op ?? node.fn ?? '';

    if (op === '+' || (op === '-' && args.length === 2)) {
      const u = args[0];
      const v = args[1];
      const sign = op === '+' ? '+' : '-';
      const uHas = containsVar(u, varName);
      const vHas = containsVar(v, varName);
      if (uHas && vHas) {
        steps.push(
          `\\text{和差法则：} (u ${sign} v)' = u' ${sign} v'，\\; u = ${tex(u)}, \\; v = ${tex(v)}`,
        );
      } else if (!uHas) {
        steps.push(`\\text{常数项法则：} \\frac{d}{d${varName}} \\left[ ${tex(u)} \\right] = 0`);
      } else if (!vHas) {
        steps.push(`\\text{常数项法则：} \\frac{d}{d${varName}} \\left[ ${tex(v)} \\right] = 0`);
      }
      annotate(u, varName, steps, depth + 1);
      annotate(v, varName, steps, depth + 1);
      return;
    }

    if (op === '-' && args.length === 1) {
      annotate(args[0], varName, steps, depth + 1);
      return;
    }

    if (op === '*') {
      const u = args[0];
      const v = args[1];
      const uHas = containsVar(u, varName);
      const vHas = containsVar(v, varName);
      if (uHas && vHas) {
        const du = safeDerivativeTex(u, varName) ?? "u'";
        const dv = safeDerivativeTex(v, varName) ?? "v'";
        steps.push(
          `\\text{乘积法则：} (u \\cdot v)' = u' \\cdot v + u \\cdot v'，\\; u = ${tex(u)}, \\; v = ${tex(v)}`,
        );
        steps.push(
          `\\Rightarrow \\frac{d}{d${varName}} \\left[ ${tex(node)} \\right] = (${du}) \\cdot (${tex(v)}) + (${tex(u)}) \\cdot (${dv})`,
        );
      } else if (!uHas) {
        // 常数倍法则
        steps.push(
          `\\text{常数倍法则：} (c \\cdot u)' = c \\cdot u'，\\; c = ${tex(u)}`,
        );
      }
      annotate(u, varName, steps, depth + 1);
      annotate(v, varName, steps, depth + 1);
      return;
    }

    if (op === '/') {
      const u = args[0];
      const v = args[1];
      const uHas = containsVar(u, varName);
      const vHas = containsVar(v, varName);
      if (vHas) {
        steps.push(
          `\\text{商法则：} \\left( \\frac{u}{v} \\right)' = \\frac{u' v - u v'}{v^2}，\\; u = ${tex(u)}, \\; v = ${tex(v)}`,
        );
      } else if (uHas) {
        steps.push(
          `\\text{常数倍法则：} \\frac{d}{d${varName}} \\left[ \\frac{u}{c} \\right] = \\frac{u'}{c}，\\; c = ${tex(v)}`,
        );
      }
      annotate(u, varName, steps, depth + 1);
      annotate(v, varName, steps, depth + 1);
      return;
    }

    if (op === '^') {
      const base = args[0];
      const expo = args[1];
      const baseHas = containsVar(base, varName);
      const expoHas = containsVar(expo, varName);
      if (baseHas && !expoHas) {
        // 幂法则（指数常数）
        const nTex = tex(expo);
        if (base.type === 'SymbolNode' || base.isSymbolNode) {
          steps.push(
            `\\text{幂法则：} \\frac{d}{d${varName}} ${varName}^{${nTex}} = ${nTex} \\, ${varName}^{${nTex} - 1}`,
          );
        } else {
          const du = safeDerivativeTex(base, varName) ?? "u'";
          steps.push(
            `\\text{幂法则 + 链式法则：} (u^{${nTex}})' = ${nTex} \\, u^{${nTex} - 1} \\cdot u'，\\; u = ${tex(base)}`,
          );
          steps.push(
            `\\Rightarrow \\frac{d}{d${varName}} \\left[ ${tex(node)} \\right] = ${nTex} \\left( ${tex(base)} \\right)^{${nTex} - 1} \\cdot (${du})`,
          );
          annotate(base, varName, steps, depth + 1);
        }
      } else if (!baseHas && expoHas) {
        steps.push(
          `\\text{指数法则：} (a^{u})' = a^{u} \\ln a \\cdot u'，\\; a = ${tex(base)}, \\; u = ${tex(expo)}`,
        );
        annotate(expo, varName, steps, depth + 1);
      } else if (baseHas && expoHas) {
        steps.push(
          `\\text{幂指函数：} u^{v} = e^{v \\ln u}，按指数法则与乘积法则求导`,
        );
        annotate(base, varName, steps, depth + 1);
        annotate(expo, varName, steps, depth + 1);
      }
      return;
    }
    return;
  }

  // Function nodes — 链式法则
  if (node.type === 'FunctionNode' || (node as { isFunctionNode?: boolean }).isFunctionNode) {
    const fnName =
      (node as { fn?: { name?: string } }).fn?.name ??
      (typeof node.fn === 'string' ? node.fn : '') ??
      '';
    const arg = node.args?.[0];
    if (arg && fnName) {
      const rule = ELEMENTARY_RULES[fnName];
      const argIsPlainVar =
        (arg.isSymbolNode || arg.type === 'SymbolNode') && arg.name === varName;
      const dArg = argIsPlainVar ? '1' : safeDerivativeTex(arg, varName);
      if (rule) {
        if (argIsPlainVar) {
          steps.push(
            `\\text{${rule.name}：} \\frac{d}{d${varName}} \\${fnName}(${varName}) = ${rule.deriv.replace(/u/g, varName)}`,
          );
        } else {
          steps.push(
            `\\text{链式法则：} \\frac{d}{d${varName}} \\${fnName}(u) = ${rule.deriv} \\cdot u'，\\; u = ${tex(arg)}`,
          );
          if (dArg) {
            steps.push(
              `\\Rightarrow \\frac{d}{d${varName}} \\left[ ${tex(node)} \\right] = ${rule.deriv.replace(/u/g, `(${tex(arg)})`)} \\cdot (${dArg})`,
            );
          }
        }
      } else {
        steps.push(
          `\\text{函数 } \\operatorname{${fnName}} \\text{ 对 } u = ${tex(arg)} \\text{ 求导（链式法则）}`,
        );
      }
      if (!argIsPlainVar) annotate(arg, varName, steps, depth + 1);
    }
  }
}

/**
 * 对 expr 关于 varName 求导，并生成带法则标注的分步说明。
 * 抛出异常时表示无法解析/求导（由调用方捕获）。
 */
export function differentiateWithSteps(
  expr: string,
  varName: string,
  inputLatex?: string,
): DerivativeStepsResult {
  // 显示用 AST 保留用户的原始记号（如 ln(x)）；求导用 AST 把 ln
  // 归一化为 mathjs 求导表认识的 log。两条路径都必须使用未覆盖
  // log 语义的 symbolicMath：共享实例把 log 覆盖成了 10 底对数，
  // 会让 simplify 把 d/dx a^x 产生的 log(a) 折叠成 log10(a)，
  // 造成数值错误（如 d/dx 2^x 的系数 0.301，正确为 ln 2 ≈ 0.693）。
  const node = symbolicMath.parse(expr) as unknown as MathNode;
  const computeNode = symbolicMath.parse(
    normalizeLnForDerivative(expr),
  ) as unknown as MathNode;
  const dNode = symbolicMath.derivative(computeNode as never, varName);

  // 安全化简
  let simplified: MathNode;
  try {
    simplified = symbolicMath.simplify(dNode as never) as unknown as MathNode;
  } catch {
    simplified = dNode as unknown as MathNode;
  }

  const resultLatex = tex(simplified);
  const resultString = toEngineSyntax(
    String((simplified as unknown as { toString: () => string }).toString()),
  );

  const steps: string[] = [];
  steps.push(
    `f(${varName}) = ${inputLatex ?? tex(node)}`,
    `\\frac{d}{d${varName}} f(${varName}) = \\frac{d}{d${varName}} \\left[ ${inputLatex ?? tex(node)} \\right]`,
  );

  if (!containsVar(node, varName)) {
    steps.push(
      `\\text{表达式不含 } ${varName} \\text{，按常数法则导数为 } 0`,
    );
  } else {
    annotate(node, varName, steps, 0);
  }

  steps.push(`= ${resultLatex}`);

  return { resultLatex, resultString, steps };
}
