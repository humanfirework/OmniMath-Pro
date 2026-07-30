/**
 * OmniMath Pro — AI 工作台工具（Function Calling）与上下文注入
 *
 * 本模块把 AI 面板从"纯对话"升级为"能操作工作台的助手"：
 *
 *   1. 上下文注入 — `collectWorkspaceSnapshot()` 只读地汇总当前工作台状态
 *      （编辑器激活文件、2D 绘图表达式、变量表、最近的错误），
 *      `buildContextMessage()` 把它组装成一条 system 上下文消息。
 *   2. 工具定义   — `WORKBENCH_TOOLS`（OpenAI tools API 格式）：
 *      evaluate_expression / solve_equation / plot_function / get_workspace_state。
 *   3. 工具分发   — `dispatchTool()` 是纯逻辑核心（依赖注入，可单测），
 *      `executeWorkbenchTool` 是接线到真实引擎 / store 的默认执行器。
 *
 * 约束：fileSystemStore 只读引用（绝不写入）；绘图通过 workbench store
 * 现有的 `addPlot` action 完成。
 */

import {
  evaluateExpression,
  solveEquation,
  fmtComplex,
  DEFAULT_CARTESIAN_RANGE,
  type EvalResult,
  type EquationSolveOutput,
} from '@/lib/engine';
import {
  useWorkbenchStore,
  type PlotConfig,
  type VariableEntry,
} from '@/lib/store/workbench';
import { useFileSystemStore } from '@/lib/store/fileSystemStore';
import type { AIToolDef } from './ai-client';

/* ================================================================== *
 * 上下文注入
 * ================================================================== */

/** 工作台状态快照（全部为基础类型，便于测试与序列化）。 */
export interface WorkspaceSnapshot {
  /** 编辑器当前激活文件；无激活文件时为 null。 */
  activeFile: {
    path: string;
    language: string;
    content: string;
  } | null;
  /** 当前 2D/3D 绘图表达式列表。 */
  plots: Array<{
    expression: string;
    plotType: string;
    visible: boolean;
    xRange: [number, number];
  }>;
  /** 变量表（值已字符串化）。 */
  variables: Array<{ name: string; type: string; value: string }>;
  /** 最近一次计算错误（无则 null）。 */
  recentError: string | null;
}

/** 上下文预算 — 防止超长文件/变量表把请求体撑爆。 */
export const CONTEXT_LIMITS = {
  /** 激活文件内容最多注入的字符数。 */
  fileContentChars: 4000,
  /** 最多列出的绘图表达式条数。 */
  plotCount: 20,
  /** 最多列出的变量条数。 */
  variableCount: 50,
  /** 单个变量值字符串的最大长度。 */
  variableValueChars: 120,
  /** 最近错误信息的最大长度。 */
  errorChars: 500,
} as const;

/** 把任意变量值安全地压缩成一行短字符串（绝不抛出）。 */
export function stringifyValue(value: unknown, maxChars: number = CONTEXT_LIMITS.variableValueChars): string {
  let text: string;
  try {
    text = v2t(value);
  } catch {
    text = String(value);
  }
  return text.length > maxChars ? `${text.slice(0, maxChars)}…` : text;
}

function v2t(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/**
 * 只读地采集当前工作台快照。
 * 依次读取：fileSystemStore（激活文件）、workbench store（绘图/变量/历史错误）。
 * 绝不调用任何写 action。
 */
export function collectWorkspaceSnapshot(): WorkspaceSnapshot {
  // ── 激活文件（只读）──────────────────────────────────────────
  let activeFile: WorkspaceSnapshot['activeFile'] = null;
  try {
    const fs = useFileSystemStore.getState();
    const node = fs.activeFileId ? fs.nodes[fs.activeFileId] : undefined;
    if (node && node.type === 'file') {
      activeFile = {
        path: fs.getPath(node.id),
        language: node.language ?? 'simple',
        content: node.content ?? '',
      };
    }
  } catch {
    // store 不可用（如测试环境）时静默降级为无文件
  }

  // ── workbench：绘图 / 变量 / 最近错误 ───────────────────────
  let plots: WorkspaceSnapshot['plots'] = [];
  let variables: WorkspaceSnapshot['variables'] = [];
  let recentError: string | null = null;
  try {
    const wb = useWorkbenchStore.getState();
    plots = wb.plots
      .filter((p: PlotConfig) => typeof p.expression === 'string' && p.expression.trim())
      .map((p: PlotConfig) => ({
        expression: p.expression,
        plotType: p.plotType,
        visible: p.visible,
        xRange: p.xRange,
      }));
    variables = Object.entries(wb.variables).map(([name, entry]: [string, VariableEntry]) => ({
      name,
      type: entry.type,
      value: stringifyValue(entry.value),
    }));
    // results 最新在前 — 取第一条带 error 的记录。
    const failed = wb.results.find((r) => !!r.error);
    if (failed) {
      recentError = `${failed.input}: ${failed.error}`;
    }
  } catch {
    // 同上，静默降级
  }

  return { activeFile, plots, variables, recentError };
}

/**
 * 把工作台快照组装成注入对话的 system 上下文消息。
 * 纯函数 — 快照由调用方采集，便于单测。
 */
export function buildContextMessage(snapshot: WorkspaceSnapshot): string {
  const L: string[] = ['[工作台上下文] 以下是用户当前工作台的状态（只读参考，回答时请结合）：'];

  // ── 激活文件 ────────────────────────────────────────────────
  if (snapshot.activeFile) {
    const { path, language, content } = snapshot.activeFile;
    L.push(`\n■ 当前编辑文件: ${path}（语言: ${language}）`);
    if (content.trim()) {
      const truncated = content.length > CONTEXT_LIMITS.fileContentChars;
      const body = truncated ? content.slice(0, CONTEXT_LIMITS.fileContentChars) : content;
      L.push('```', body, '```');
      if (truncated) L.push(`（文件过长，仅展示前 ${CONTEXT_LIMITS.fileContentChars} 字符）`);
    } else {
      L.push('（文件为空）');
    }
  } else {
    L.push('\n■ 当前编辑文件: 无（未打开任何文件）');
  }

  // ── 绘图表达式 ─────────────────────────────────────────────
  if (snapshot.plots.length > 0) {
    const shown = snapshot.plots.slice(0, CONTEXT_LIMITS.plotCount);
    L.push(`\n■ 绘图表达式（共 ${snapshot.plots.length} 条）:`);
    shown.forEach((p, i) => {
      const range = `x∈[${p.xRange[0]}, ${p.xRange[1]}]`;
      L.push(`${i + 1}. ${p.expression}（${p.plotType}, ${range}${p.visible ? '' : ', 已隐藏'}）`);
    });
    if (snapshot.plots.length > shown.length) {
      L.push(`… 另有 ${snapshot.plots.length - shown.length} 条未列出`);
    }
  } else {
    L.push('\n■ 绘图表达式: 无');
  }

  // ── 变量表 ─────────────────────────────────────────────────
  if (snapshot.variables.length > 0) {
    const shown = snapshot.variables.slice(0, CONTEXT_LIMITS.variableCount);
    L.push(`\n■ 已定义变量（共 ${snapshot.variables.length} 个）:`);
    for (const v of shown) {
      L.push(`- ${v.name} = ${v.value}（${v.type}）`);
    }
    if (snapshot.variables.length > shown.length) {
      L.push(`… 另有 ${snapshot.variables.length - shown.length} 个未列出`);
    }
  } else {
    L.push('\n■ 已定义变量: 无');
  }

  // ── 最近的错误 ─────────────────────────────────────────────
  if (snapshot.recentError) {
    const err = snapshot.recentError.length > CONTEXT_LIMITS.errorChars
      ? `${snapshot.recentError.slice(0, CONTEXT_LIMITS.errorChars)}…`
      : snapshot.recentError;
    L.push(`\n■ 最近的错误: ${err}`);
  }

  return L.join('\n');
}

/* ================================================================== *
 * 工具定义（OpenAI tools API）
 * ================================================================== */

export const WORKBENCH_TOOLS: AIToolDef[] = [
  {
    type: 'function',
    function: {
      name: 'evaluate_expression',
      description:
        '用工作台的数学引擎求值一个数学表达式（支持算术、矩阵、微积分、符号运算、单位等，语法类似 mathjs）。返回真实的计算结果或错误信息。需要算数时优先调用本工具，不要口算。',
      parameters: {
        type: 'object',
        properties: {
          expr: {
            type: 'string',
            description: '要求值的表达式，例如 "2+3*4"、"det([1,2;3,4])"、"integrate(x^2, x)"',
          },
        },
        required: ['expr'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'solve_equation',
      description:
        '求解方程（多项式或超越方程），返回全部根与分步求解说明。方程可带等号（如 "x^2-5x+6=0"）或只给左边表达式。',
      parameters: {
        type: 'object',
        properties: {
          expr: { type: 'string', description: '要求解的方程，例如 "x^2 - 5*x + 6 = 0"' },
          variable: { type: 'string', description: '求解变量名，默认 "x"' },
        },
        required: ['expr'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'plot_function',
      description:
        '把一个关于 x 的函数表达式加入工作台的 2D 绘图面板（直角坐标系，默认 x∈[-10,10]）。调用后用户即可在绘图页看到该曲线。',
      parameters: {
        type: 'object',
        properties: {
          expr: { type: 'string', description: '关于 x 的表达式，例如 "sin(x)*cos(x)"' },
        },
        required: ['expr'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_workspace_state',
      description:
        '获取当前工作台状态摘要（JSON）：编辑器激活文件及内容、绘图表达式列表、变量表、最近的错误。',
      parameters: { type: 'object', properties: {} },
    },
  },
];

/* ================================================================== *
 * 工具分发（纯逻辑核心，依赖注入便于单测）
 * ================================================================== */

export interface ToolResult {
  ok: boolean;
  content: string;
}

/** dispatchTool 的外部依赖 — 测试时可全部 mock。 */
export interface WorkbenchToolDeps {
  evaluate: (expr: string) => EvalResult;
  solve: (expr: string, variable: string) => Promise<EquationSolveOutput>;
  addPlot: (plot: Omit<PlotConfig, 'id'>) => void;
  /** 当前绘图条数（用于给新曲线挑颜色）。 */
  getPlotCount: () => number;
  getSnapshot: () => WorkspaceSnapshot;
}

/** 2D 曲线配色（与 EditorPanel / SolverWorkbench 的调色板一致）。 */
const PLOT_COLORS = ['#2dd4bf', '#fbbf24', '#fb7185', '#34d399', '#a78bfa', '#fb923c'];

/**
 * 工具分发器：解析参数 JSON → 调用对应依赖 → 把结果编码为文本。
 * 绝不抛出 — 任何失败都编码进返回的 content，供模型自我纠正。
 */
export async function dispatchTool(
  name: string,
  argsJson: string,
  deps: WorkbenchToolDeps,
): Promise<ToolResult> {
  let args: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(argsJson || '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      args = parsed as Record<string, unknown>;
    }
  } catch {
    return { ok: false, content: `工具参数不是合法的 JSON: ${argsJson.slice(0, 200)}` };
  }

  switch (name) {
    case 'evaluate_expression': {
      const expr = typeof args.expr === 'string' ? args.expr.trim() : '';
      if (!expr) return { ok: false, content: '缺少必需参数 expr（表达式字符串）' };
      try {
        const r = deps.evaluate(expr);
        if (!r.success) {
          return {
            ok: false,
            content: `求值失败: ${r.error ?? '未知错误'}${r.hint ? `（提示: ${r.hint}）` : ''}`,
          };
        }
        return { ok: true, content: `${expr} = ${r.result}` };
      } catch (err) {
        return { ok: false, content: `求值异常: ${errMessage(err)}` };
      }
    }

    case 'solve_equation': {
      const expr = typeof args.expr === 'string' ? args.expr.trim() : '';
      if (!expr) return { ok: false, content: '缺少必需参数 expr（方程）' };
      const variable =
        typeof args.variable === 'string' && args.variable.trim()
          ? args.variable.trim()
          : 'x';
      try {
        const out = await deps.solve(expr, variable);
        if (out.error || !out.result) {
          return { ok: false, content: `求解失败: ${out.error ?? '无解'}` };
        }
        const roots = out.result.roots.map((r) => `${variable} = ${fmtComplex(r)}`);
        const lines = [
          `方程 ${expr} 的解（${out.result.kind}）:`,
          roots.length > 0 ? roots.join(', ') : '（无实根）',
        ];
        if (out.result.info) lines.push(`说明: ${out.result.info}`);
        if (out.result.steps && out.result.steps.length > 0) {
          lines.push('分步说明:');
          out.result.steps.forEach((s, i) => lines.push(`${i + 1}. ${s}`));
        }
        if (out.warnings.length > 0) lines.push(`警告: ${out.warnings.join('；')}`);
        return { ok: true, content: lines.join('\n') };
      } catch (err) {
        return { ok: false, content: `求解异常: ${errMessage(err)}` };
      }
    }

    case 'plot_function': {
      const expr = typeof args.expr === 'string' ? args.expr.trim() : '';
      if (!expr) return { ok: false, content: '缺少必需参数 expr（关于 x 的表达式）' };
      try {
        deps.addPlot({
          expression: expr,
          xRange: [...DEFAULT_CARTESIAN_RANGE] as [number, number],
          yRange: [-50, 50],
          color: PLOT_COLORS[deps.getPlotCount() % PLOT_COLORS.length],
          plotType: 'cartesian',
          visible: true,
        });
        return {
          ok: true,
          content: `已将 ${expr} 加入 2D 绘图面板（x∈[${DEFAULT_CARTESIAN_RANGE[0]}, ${DEFAULT_CARTESIAN_RANGE[1]}]），当前共 ${deps.getPlotCount()} 条曲线。`,
        };
      } catch (err) {
        return { ok: false, content: `添加绘图失败: ${errMessage(err)}` };
      }
    }

    case 'get_workspace_state': {
      try {
        const snap = deps.getSnapshot();
        // 文件内容单独限长，避免超大文件撑爆工具响应。
        const file = snap.activeFile
          ? {
              ...snap.activeFile,
              content:
                snap.activeFile.content.length > 2000
                  ? `${snap.activeFile.content.slice(0, 2000)}…（截断）`
                  : snap.activeFile.content,
            }
          : null;
        return { ok: true, content: JSON.stringify({ ...snap, activeFile: file }, null, 2) };
      } catch (err) {
        return { ok: false, content: `读取工作台状态失败: ${errMessage(err)}` };
      }
    }

    default:
      return {
        ok: false,
        content: `未知工具 "${name}"。可用工具: ${WORKBENCH_TOOLS.map((t) => t.function.name).join(', ')}`,
      };
  }
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/* ================================================================== *
 * 默认执行器（接线到真实引擎与 store）
 * ================================================================== */

/** 构造生产环境的工具依赖。 */
export function createWorkbenchToolDeps(): WorkbenchToolDeps {
  return {
    evaluate: (expr) => evaluateExpression(expr, 'simple'),
    solve: (expr, variable) =>
      solveEquation(expr, variable, { mode: 'numeric', rangeA: -10, rangeB: 10 }),
    addPlot: (plot) => useWorkbenchStore.getState().addPlot(plot),
    getPlotCount: () => useWorkbenchStore.getState().plots.length,
    getSnapshot: () => collectWorkspaceSnapshot(),
  };
}

/**
 * 默认工具执行器 — 直接传给 `chatWithTools` 的 executor 参数。
 * 签名与 `AIToolExecutor` 一致。
 */
export async function executeWorkbenchTool(
  name: string,
  argsJson: string,
): Promise<ToolResult> {
  return dispatchTool(name, argsJson, createWorkbenchToolDeps());
}
