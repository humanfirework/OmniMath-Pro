/**
 * OmniMath Pro — Node Pipeline Engine (pure logic, no React)
 *
 * ComfyUI / blueprint-style node graph. Each node is an operation; edges
 * flow data between output ports → input ports. `executePipeline` does a
 * topological sort and evaluates each node in order, propagating outputs.
 *
 * Uses the SHARED configured mathjs instance (same log/ln semantics as
 * the console). Pipeline evaluations still cannot pollute the user scope
 * because every `evaluate` call gets an explicit throwaway scope built
 * by `getEvalScope(...)` — a shallow copy layered over the live user
 * scope, so blueprint expressions can reference console variables
 * (e.g. a `sin(a*x)` plot node follows the `a` slider).
 */

import type { MathNode } from 'mathjs';
import { math, symbolicMath, getEvalScope } from '@/lib/engine/mathInstance';
import { scanVariables } from '@/lib/engine/variableScanner';
import type { TranslationDict } from '@/lib/i18n';

// 循环引用防护：pipelineEngine <-> registry/index.ts（registry import NodeTypeDef from here）
// NodeType 在此文件内部放宽为 string，实际强约束由 registry/index.ts 的联合类型提供。
export type NodeType = string;
// 运行时 NODE_TYPES 注册表：从 registry 导入本地后再导出，保证文件内部可用
import { NODE_TYPES as REGISTRY_NODE_TYPES } from './registry';
export const NODE_TYPES: Record<string, NodeTypeDef> = REGISTRY_NODE_TYPES;

// 打包器（webpack/Turbopack）在客户端 bundle 中支持 CommonJS require；
// 这里仅补充类型声明，不改变运行时行为。
declare const require: (id: string) => unknown;

/* ------------------------------------------------------------------ *
 * Types
 * ------------------------------------------------------------------ */

export type PortDataType = 'number' | 'expression' | 'matrix' | 'any' | 'plot' | 'curve' | 'curves' | 'image' | 'animation';

export type NodeCategory =
  | 'input'
  | 'operation'
  | 'function'
  | 'plot'
  | 'matrix'
  | 'calculus'
  | 'output'
  | 'mapping'
  | 'vector'
  | 'curve'
  | 'statistics'
  | 'logic'
  | 'vision'
  | 'simulation'
  | 'control';

export interface PortDef {
  id: string;
  /** i18n key — resolved by the UI (supports dot-separated nested paths). */
  labelKey: string;
  type: PortDataType;
  /**
   * 可选输入端口：为 true 时，即使该端口没有连线/值为 undefined，也不会
   * 阻止节点执行（用于「二选一」或「可省略」输入，如 curve-animate 的
   * animation 与 frames 端口，用户连其中一个即可）。默认 false（必须就绪）。
   */
  optional?: boolean;
}

/**
 * 声明式节点配置字段 —— 让「配置面板」由 schema 自动生成，消灭手写 case。
 *
 * 每个字段描述一个可编辑配置项；UI 侧（NodePipeline 的 SchemaConfig）据此
 * 渲染对应的控件（数字滑块 / 下拉 / 开关 / 文本 / 文件）。新增节点只需声明
 * 字段，无需手写 UI，从根本上消除「节点写了代码但没配 UI」类 bug。
 *
 * `label` 为直接展示文案（与蓝图现有配置面板一致的中文文案）；如需 i18n
 * 可扩展为 labelKey，此处暂用 plain label 以匹配既有 UI 风格。
 */
export type NodeConfigField =
  | { key: string; label: string; type: 'number'; min?: number; max?: number; step?: number; default?: number }
  | { key: string; label: string; type: 'select'; options: { value: string; label: string }[]; default?: string }
  | { key: string; label: string; type: 'boolean'; default?: boolean }
  | { key: string; label: string; type: 'text'; default?: string; placeholder?: string }
  | { key: string; label: string; type: 'file'; accept: string; hint: string };

export interface PipelineNode {
  id: string;
  type: NodeType;
  position: { x: number; y: number };
  config: Record<string, unknown>;
  /** Last computed primary output (for display in the node footer). */
  result?: unknown;
  /** Last computed all-outputs map. */
  outputs?: Record<string, unknown>;
  error?: string;
  /** 静音：跳过执行，把首个输入透传到输出（Blender 式 Mute）。 */
  muted?: boolean;
  /** 分组：拥有相同 `group.id` 的节点归属同一 Frame（可命名/折叠）。 */
  group?: { id: string; title: string };
}

export interface PipelineEdge {
  id: string;
  from: string;
  fromPort: string;
  to: string;
  toPort: string;
}

export interface PipelineContext {
  /** Variables from the workbench store (for the Variable node). */
  variables: Record<string, unknown>;
  /**
   * 节点内长任务的进度回报（如视频→曲线逐帧处理）。
   * `fraction` ∈ [0,1]；`label` 为可选描述（如「处理第 x/y 帧」），UI 可展示。
   * 节点 render 期间可多次调用；未提供时保持屏静。
   */
  onProgress?: (fraction: number, label?: string) => void;
  /**
   * 供长任务节点（如视频→曲线）在逐帧之间检查用户是否手动终止。
   * 返回 true 时节点应尽快抛出 PipelineCancelledError，让流水线立刻停下。
   */
  shouldCancel?: () => boolean;
}

export interface NodeTypeDef {
  type: NodeType;
  category: NodeCategory;
  /** i18n key for the node title (supports dot-separated nested paths). */
  labelKey: string;
  /** Lucide icon name (string — UI maps to component). */
  icon: string;
  color: 'teal' | 'amber' | 'rose' | 'violet' | 'emerald' | 'orange' | 'cyan';
  inputs: PortDef[];
  outputs: PortDef[];
  defaultConfig: Record<string, unknown>;
  /**
   * 可选声明式配置 schema。存在时，NodePipeline 的配置面板由它自动生成，
   * 无需手写 UI case；缺省时回退到手写 switch（迁移期兜底）。
   */
  configSchema?: NodeConfigField[];
  execute: (
    inputs: Record<string, unknown>,
    config: Record<string, unknown>,
    ctx: PipelineContext,
  ) => Record<string, unknown> | Promise<Record<string, unknown>>;
}

/* ------------------------------------------------------------------ *
 * Layout constants — used as initial estimates before DOM measurement
 * runs. The `getPortPosition` function prefers DOM-measured offsets
 * (from DomMeasuredNode.tsx's PortPositionsProvider) when available,
 * and falls back to these constants for the first render.
 * ------------------------------------------------------------------ */
export const NODE_WIDTH = 248;
export const NODE_HEADER_H = 34;
export const PORT_ROW_H = 22;
export const PORTS_PAD_TOP = 8;
export const RESULT_FOOTER_H = 58;

// Port dots are inset 12px from the left/right card edges and are 10px wide,
// so their center is 12 + 10/2 = 17px from the edge.
const PORT_INSET_X = 17;

/** Vertical center of port `i` (0-indexed) relative to the node's top-left. */
export function portCenterY(index: number): number {
  return NODE_HEADER_H + PORTS_PAD_TOP + PORT_ROW_H / 2 + index * PORT_ROW_H;
}

/**
 * Port offset relative to a node card's top-left, keyed by
 * `${nodeId}:${portId}:${'in'|'out'}`. Populated by DomMeasuredNode's
 * PortPositionsProvider at runtime.
 */
export type PortOffsetsMap = Map<string, { x: number; y: number }>;

/** Port center in canvas-content coordinates. */
export function getPortPosition(
  node: PipelineNode,
  portId: string,
  isOutput: boolean,
  portOffsets?: PortOffsetsMap,
): { x: number; y: number } | null {
  const def = NODE_TYPES[node.type];
  if (!def) return null;
  const ports = isOutput ? def.outputs : def.inputs;
  const idx = ports.findIndex((p) => p.id === portId);
  if (idx < 0) return null;

  // Prefer DOM-measured offset (accurate even when content overflows the
  // fixed NODE_WIDTH estimate or when the config UI grows the card).
  if (portOffsets) {
    const key = `${node.id}:${portId}:${isOutput ? 'out' : 'in'}`;
    const measured = portOffsets.get(key);
    if (measured) {
      return {
        x: node.position.x + measured.x,
        y: node.position.y + measured.y,
      };
    }
  }

  // Fallback: estimate from fixed constants.
  return {
    x: node.position.x + (isOutput ? NODE_WIDTH - PORT_INSET_X : PORT_INSET_X),
    y: node.position.y + portCenterY(idx),
  };
}

/** Body height required for the ports section (drives node card sizing). */
export function portsSectionHeight(node: PipelineNode): number {
  const def = NODE_TYPES[node.type];
  if (!def) return 0;
  return Math.max(def.inputs.length, def.outputs.length) * PORT_ROW_H + 12;
}

/* ------------------------------------------------------------------ *
 * Math helpers
 * ------------------------------------------------------------------ */

/** Format a number as a LaTeX-safe string (for building integral/derivative LaTeX). */
function formatNumTex(v: number): string {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    return Number.isNaN(v) ? '\\text{NaN}' : String(v);
  }
  const rounded = Math.round(v);
  if (Math.abs(v - rounded) < 1e-9) return String(rounded);
  return parseFloat(v.toPrecision(8)).toString();
}

function toNumber(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = Number(v);
    if (!Number.isNaN(n)) return n;
  }
  if (v && typeof v === 'object' && 're' in (v as object)) {
    return (v as { re: number }).re;
  }
  return 0;
}

function toExprString(v: unknown): string {
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object' && 'toString' in (v as object)) {
    return String((v as { toString: () => string }).toString());
  }
  return String(v ?? '');
}

function toMatrix(v: unknown): any {
  if (v == null) return math.matrix([[0]]);
  if (math.isMatrix(v)) return v;
  if (Array.isArray(v)) return math.matrix(v);
  return math.matrix([[Number(v) || 0]]);
}

/** Parse a 2D string grid (from the matrix-input editor) into a mathjs matrix. */
export function parseMatrixGrid(cells: { value: string }[][]): any {
  const rows = cells.length || 1;
  const cols = cells[0]?.length || 1;
  const data: number[][] = [];
  for (let i = 0; i < rows; i++) {
    const row: number[] = [];
    for (let j = 0; j < cols; j++) {
      const raw = cells[i]?.[j]?.value ?? '0';
      const n = Number(raw);
      row.push(Number.isNaN(n) ? 0 : n);
    }
    data.push(row);
  }
  return math.matrix(data);
}

/* ------------------------------------------------------------------ *
 * Node type registry — LEGACY MONOLITHIC REMOVED
 * Original inline NODE_TYPES object (approx. lines 231-770) removed
 * and replaced by registry-based import at the top of this file:
 *   export type { NodeType } from "./registry";
 *   export { NODE_TYPES } from "./registry";
 * ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ *
 * Compatibility check — can `from` port connect to `to` port?
 * ------------------------------------------------------------------ */
export function canConnect(
  fromType: PortDataType,
  toType: PortDataType,
): boolean {
  if (toType === 'any' || fromType === 'any') return true;
  return fromType === toType;
}

/* ------------------------------------------------------------------ *
 * Variable dependency tracking (N1 integration)
 * ------------------------------------------------------------------ *
 * 下列函数把 variableScanner 接入蓝图：
 *   - `getNodeExpression`       抽取节点 config 中的表达式串
 *   - `getNodeVariableDeps`     扫描单个节点依赖哪些用户变量
 *   - `findVariableDependents`  反向查询：某变量被哪些节点引用
 *
 * 用途：
 *   - Inspector 中显示 "依赖: a, b"
 *   - 删除变量前弹警告 "被 N 个节点引用"
 *   - （未来）变量变化时只重算受影响子图（当前 auto-execute 已全量重算）
 *
 * 注意：只扫描节点自身 config 中的表达式，不递归上游节点 ——
 * 上游节点的输出已经通过 edge 传播，不需要重复扫描。
 */

/**
 * 抽取节点 config 中的表达式串（用于变量扫描）。
 * 没有表达式的节点类型返回空串。
 */
export function getNodeExpression(node: PipelineNode): string {
  const cfg = node.config;
  switch (node.type) {
    case 'expression-input':
      return String(cfg.expr ?? '');
    case 'function-apply':
      // 自定义函数表达式才扫描；预设函数 (sin/cos/...) 不含用户变量
      if (String(cfg.fn ?? '') === 'custom') {
        return String(cfg.customExpr ?? '');
      }
      return '';
    case 'plot-output':
      // plot-output 的 expr 来自上游 expression-input，
      // 但 config 中也可能有 xMin/xMax 表达式（罕见，先不扫）
      return '';
    case 'derivative':
    case 'integrate':
    case 'symbolic-integrate':
    case 'solve-equation':
      // 这些节点的 expr 来自上游，自身 config 仅有 variable 名（不算依赖）
      return '';
    case 'evaluate':
      // 同上，expr 来自上游
      return '';
    case 'variable':
      // variable 节点的 config.name 就是它引用的变量名 —— 这是最直接的依赖
      return String(cfg.name ?? '');
    case 'simplify':
      return '';
    default:
      return '';
  }
}

/**
 * 扫描单个节点依赖 `knownVars` 中的哪些变量。
 * 返回的变量名顺序与 knownVars 一致。
 */
export function getNodeVariableDeps(
  node: PipelineNode,
  knownVars: string[],
): string[] {
  const expr = getNodeExpression(node);
  if (!expr) return [];
  return scanVariables(expr, knownVars);
}

/**
 * 反向索引：给定变量名，返回引用它的节点 id 列表。
 * 用于"删除变量前警告影响范围"。
 */
export function findVariableDependents(
  nodes: PipelineNode[],
  varName: string,
  knownVars: string[],
): string[] {
  if (!knownVars.includes(varName)) return [];
  const out: string[] = [];
  for (const n of nodes) {
    const deps = getNodeVariableDeps(n, knownVars);
    if (deps.includes(varName)) out.push(n.id);
  }
  return out;
}

/**
 * 构建全图变量依赖索引：nodeId → 依赖的变量名列表。
 * 用于 Inspector 批量显示 + 未来按需重算。
 */
export function buildPipelineDependencyIndex(
  nodes: PipelineNode[],
  knownVars: string[],
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const n of nodes) {
    out.set(n.id, getNodeVariableDeps(n, knownVars));
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * choleskyDecompose — mathjs v15 没有 cholesky，本地实现
 * A = L · Lᵀ（L 为下三角矩阵，A 要求对称正定）；
 * 非方阵 / 非对称 / 非正定时抛出明确错误，由节点 catch 转为 error 字段。
 * ------------------------------------------------------------------ */
function choleskyDecompose(m: any): any {
  const A = (math.isMatrix(m) ? m.toArray() : m) as number[][];
  const n = Array.isArray(A) ? A.length : 0;
  if (n === 0 || A.some((row) => !Array.isArray(row) || row.length !== n)) {
    throw new Error('Cholesky decomposition requires a square matrix');
  }
  // Symmetry check
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (Math.abs(Number(A[i][j]) - Number(A[j][i])) > 1e-9) {
        throw new Error('Cholesky decomposition requires a symmetric matrix');
      }
    }
  }
  const L: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = Number(A[i][j]) || 0;
      for (let k = 0; k < j; k++) sum -= L[i][k] * L[j][k];
      if (i === j) {
        if (sum <= 0) throw new Error('Matrix is not positive definite');
        L[i][j] = Math.sqrt(sum);
      } else {
        L[i][j] = sum / L[j][j];
      }
    }
  }
  return math.matrix(L);
}

/* ------------------------------------------------------------------ *
 * matrixRank — mathjs doesn't expose rank directly
 * ------------------------------------------------------------------ */
function matrixRank(m: any): number {
  const arr = math.isMatrix(m) ? m.toArray() : m;
  if (!Array.isArray(arr) || arr.length === 0) return 0;
  const rows = arr as number[][];
  const r = rows.length;
  const c = (rows[0] as unknown[]).length || 0;
  if (r === 0 || c === 0) return 0;
  // Gaussian elimination with partial pivoting.
  const A: number[][] = rows.map((row) =>
    (Array.isArray(row) ? row : [row]).map((v) => Number(v) || 0),
  );
  let rank = 0;
  for (let col = 0; col < c && rank < r; col++) {
    let pivot = rank;
    for (let i = rank + 1; i < r; i++) {
      if (Math.abs(A[i][col]) > Math.abs(A[pivot][col])) pivot = i;
    }
    if (Math.abs(A[pivot][col]) < 1e-10) continue;
    [A[rank], A[pivot]] = [A[pivot], A[rank]];
    const pv = A[rank][col];
    for (let j = col; j < c; j++) A[rank][j] /= pv;
    for (let i = 0; i < r; i++) {
      if (i === rank) continue;
      const f = A[i][col];
      for (let j = col; j < c; j++) A[i][j] -= f * A[rank][j];
    }
    rank++;
  }
  return rank;
}

/* ------------------------------------------------------------------ *
 * executePipeline — topological sort + per-node evaluation
 * ------------------------------------------------------------------ *
 * Returns a new array of nodes with `result`, `outputs`, and `error`
 * populated. Nodes involved in cycles are marked with an error and
 * skipped.
 */
/** 用户手动终止流水线时抛出的错误。调用方据此区分「终止」与「失败」。 */
export class PipelineCancelledError extends Error {
  constructor() {
    super('流水线已终止');
    this.name = 'PipelineCancelledError';
  }
}

export async function executePipeline(
  nodes: PipelineNode[],
  edges: PipelineEdge[],
  ctx: PipelineContext,
  opts?: {
    stopAt?: string;
    onProgress?: (done: number, total: number) => void;
    /** 每次执行节点前检查；返回 true 则立即终止并抛 PipelineCancelledError。 */
    shouldCancel?: () => boolean;
  },
): Promise<PipelineNode[]> {
  const byId = new Map<string, PipelineNode>();
  for (const n of nodes) byId.set(n.id, { ...n });

  // Build in-degree map + adjacency (from -> [to, to, ...]).
  const inDeg = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const n of nodes) {
    inDeg.set(n.id, 0);
    adj.set(n.id, []);
  }
  for (const e of edges) {
    if (!byId.has(e.from) || !byId.has(e.to)) continue;
    inDeg.set(e.to, (inDeg.get(e.to) ?? 0) + 1);
    adj.get(e.from)!.push(e.to);
  }

  // Kahn's algorithm.
  const queue: string[] = [];
  for (const [id, deg] of inDeg) if (deg === 0) queue.push(id);
  const ordered: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    ordered.push(id);
    for (const next of adj.get(id) ?? []) {
      inDeg.set(next, (inDeg.get(next) ?? 0) - 1);
      if (inDeg.get(next) === 0) queue.push(next);
    }
  }

  // P3「执行到节点」：若指定了 stopAt，只执行拓扑序中到该节点为止的部分，
  // 后续节点保持未执行（result/outputs 置为 undefined，不报错）。
  const effectiveOrder = opts?.stopAt
    ? ordered.slice(0, ordered.indexOf(opts.stopAt) + 1)
    : ordered;
  const executedSet = new Set(effectiveOrder);

  // Execute in topo order, propagating outputs.
  const outputs = new Map<string, Record<string, unknown>>();
  const total = effectiveOrder.length;
  for (let step = 0; step < effectiveOrder.length; step++) {
    const id = effectiveOrder[step];
    // 用户手动终止：在逐节点之间检查，抛出可识别错误，UI 据此显示「已终止」。
    if (opts?.shouldCancel?.()) {
      throw new PipelineCancelledError();
    }
    // P2-5: 逐节点上报进度（供 UI 显示「运行中」进度条）。
    opts?.onProgress?.(step + 1, total);
    const node = byId.get(id)!;
    const def = NODE_TYPES[node.type];
    if (!def) {
      node.error = 'Unknown node type';
      outputs.set(id, {});
      continue;
    }
    // Gather inputs from incoming edges.
    const ins: Record<string, unknown> = {};
    let hasAnyInput = false;
    for (const e of edges) {
      if (e.to !== id) continue;
      const fromOut = outputs.get(e.from) ?? {};
      ins[e.toPort] = fromOut[e.fromPort];
      hasAnyInput = true;
    }
    // Skip execution for nodes that declare inputs but have no incoming
    // edges (e.g. freshly added, not yet connected). This prevents
    // spurious error messages on the node card before the user has wired
    // anything up — the node simply shows "待连接" instead of an error.
    if (def.inputs.length > 0 && !hasAnyInput) {
      node.result = null;
      node.outputs = {};
      node.error = undefined;
      outputs.set(id, {});
      continue;
    }
    // Muted node：跳过执行，把首个输入透传到首个输出（Blender 式 Mute），
    // 让下游节点仍能拿到数据、且不报错。
    if (node.muted) {
      const firstInId = def.inputs[0]?.id;
      const firstOutId = def.outputs[0]?.id;
      const out: Record<string, unknown> = {};
      if (firstInId && firstOutId) out[firstOutId] = ins[firstInId];
      outputs.set(id, out);
      node.outputs = out;
      node.result = firstOutId ? out[firstOutId] : undefined;
      node.error = undefined;
      continue;
    }
    // Also skip if some inputs are connected but NOT all REQUIRED (non-optional)
    // inputs have values yet (e.g. a node with 2 inputs where only 1 is wired).
    // Optional ports (port.optional === true) never gate execution — this lets
    // nodes with "either/or" inputs (like curve-animate's animation | frames)
    // run even when only one of them is connected.
    if (def.inputs.length > 0 && hasAnyInput) {
      const requiredReady = def.inputs.every((port) => port.optional || ins[port.id] !== undefined);
      if (!requiredReady) {
        node.result = null;
        node.outputs = {};
        node.error = undefined;
        outputs.set(id, {});
        continue;
      }
    }
    try {
      const out = await def.execute(ins, node.config, ctx);
      outputs.set(id, out);
      node.outputs = out;
      node.error = undefined;
      // Primary result = first output value (or for display, the input).
      const firstOutId = def.outputs[0]?.id;
      node.result = firstOutId ? out[firstOutId] : (out as any).value ?? ins.value;
    } catch (err) {
      node.result = null;
      node.outputs = {};
      node.error = (err as Error).message || 'Evaluation failed';
      outputs.set(id, {});
    }
  }

  // Mark nodes in cycles (never reached `ordered`).
  for (const n of nodes) {
    if (!ordered.includes(n.id)) {
      const node = byId.get(n.id)!;
      node.error = 'Cycle detected';
      node.result = null;
      node.outputs = {};
    }
  }

  // P3「执行到节点」：未执行到的节点清除旧结果，避免显示过期值。
  if (opts?.stopAt) {
    for (const n of Array.from(byId.values())) {
      if (!executedSet.has(n.id) && !ordered.includes(n.id)) {
        n.result = undefined;
        n.outputs = {};
        n.error = undefined;
      }
    }
  }

  return Array.from(byId.values());
}

/* ------------------------------------------------------------------ *
 * traceErrorChain — P3 错误传播链
 * ------------------------------------------------------------------ *
 * 给定一个出错节点，沿其直接上游边反向收集出错路径上的节点 id，
 * 用于高亮「首个出错节点」及其上游链，帮助定位根因。
 * 返回 { chain: string[], roots: string[] }：
 *   - chain : 从根因到该出错节点的有序上游节点 id（含出错节点自身）
 *   - roots : 链中真正抛出错误的节点 id（上游执行失败会向下游传播）
 */
export function traceErrorChain(
  nodes: PipelineNode[],
  edges: PipelineEdge[],
  targetId: string,
): { chain: string[]; roots: string[] } {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  // 反向邻接：to -> [from, ...]
  const revAdj = new Map<string, string[]>();
  for (const e of edges) {
    if (!byId.has(e.from) || !byId.has(e.to)) continue;
    if (!revAdj.has(e.to)) revAdj.set(e.to, []);
    revAdj.get(e.to)!.push(e.from);
  }

  const chain: string[] = [];
  const visited = new Set<string>();
  const roots = new Set<string>(); // 直接报错的节点（其自身 error 非空）
  const stack = [targetId];
  while (stack.length) {
    const id = stack.pop()!;
    if (visited.has(id)) continue;
    visited.add(id);
    chain.push(id);
    const node = byId.get(id);
    if (node?.error) roots.add(id);
    for (const from of revAdj.get(id) ?? []) {
      if (!visited.has(from)) stack.push(from);
    }
  }
  return { chain, roots: Array.from(roots) };
}

/* ------------------------------------------------------------------ *
 * Export pipeline → script (for the "导出脚本" button)
 * ------------------------------------------------------------------ *
 * Walks the topo order and emits one line per node, using the
 * workbench's simple-mode syntax so the result can be pasted back
 * into the editor and run.
 */
export function exportPipelineToScript(
  nodes: PipelineNode[],
  edges: PipelineEdge[],
): string {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const inDeg = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const n of nodes) {
    inDeg.set(n.id, 0);
    adj.set(n.id, []);
  }
  for (const e of edges) {
    if (!byId.has(e.from) || !byId.has(e.to)) continue;
    inDeg.set(e.to, (inDeg.get(e.to) ?? 0) + 1);
    adj.get(e.from)!.push(e.to);
  }
  const queue: string[] = [];
  for (const [id, deg] of inDeg) if (deg === 0) queue.push(id);
  const ordered: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    ordered.push(id);
    for (const next of adj.get(id) ?? []) {
      inDeg.set(next, (inDeg.get(next) ?? 0) - 1);
      if (inDeg.get(next) === 0) queue.push(next);
    }
  }

  const lines: string[] = ['# OmniMath Pro — Pipeline Export', '#'];
  const varName = (id: string) => `n_${id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6)}`;
  const outRef = (nodeId: string, portId: string) => `${varName(nodeId)}_${portId}`;

  for (const id of ordered) {
    const node = byId.get(id);
    if (!node) continue;
    const def = NODE_TYPES[node.type];
    const incoming: Record<string, { from: string; fromPort: string }> = {};
    for (const e of edges) {
      if (e.to === id) incoming[e.toPort] = { from: e.from, fromPort: e.fromPort };
    }
    const cfg = node.config;
    switch (node.type) {
      case 'number-input':
        lines.push(`${outRef(id, 'value')} = ${cfg.value}`);
        break;
      case 'expression-input':
        lines.push(`${outRef(id, 'value')} = "${String(cfg.expr).replace(/"/g, '\\"')}"`);
        break;
      case 'variable':
        lines.push(`${outRef(id, 'value')} = ${cfg.name || '0'}`);
        break;
      case 'constant': {
        const cname = String(cfg.name ?? 'pi');
        const exprMap: Record<string, string> = {
          pi: 'pi',
          e: 'e',
          tau: '2 * pi',
          phi: '(1 + sqrt(5)) / 2',
          sqrt2: 'sqrt(2)',
        };
        lines.push(`${outRef(id, 'value')} = ${exprMap[cname] ?? 'pi'}`);
        break;
      }
      case 'arithmetic': {
        const a = incoming.a ? outRef(incoming.a.from, incoming.a.fromPort) : '0';
        const b = incoming.b ? outRef(incoming.b.from, incoming.b.fromPort) : '0';
        lines.push(`${outRef(id, 'result')} = ${a} ${cfg.op} ${b}`);
        break;
      }
      case 'function-apply': {
        const x = incoming.x ? outRef(incoming.x.from, incoming.x.fromPort) : '0';
        const fn = cfg.fn === 'custom' ? `(${cfg.customExpr})` : String(cfg.fn);
        lines.push(`${outRef(id, 'result')} = ${fn}(${x})`);
        break;
      }
      case 'plot-output': {
        const e = incoming.expr ? outRef(incoming.expr.from, incoming.expr.fromPort) : `"${cfg.expr ?? 'x'}"`;
        lines.push(`${outRef(id, 'plot')} = plot(${e})`);
        break;
      }
      case 'matrix-input': {
        const cells = (cfg.cells as { value: string }[][]) ?? [];
        const rows = cells.map((r) => r.map((c) => c.value).join(', ')).join('; ');
        lines.push(`${outRef(id, 'matrix')} = [${rows}]`);
        break;
      }
      case 'matrix-op': {
        const m = incoming.matrix ? outRef(incoming.matrix.from, incoming.matrix.fromPort) : '[]';
        const op = String(cfg.op);
        const fn = op === 'det' ? 'det' : op === 'inv' ? 'inv' : op === 'transpose' ? 'transpose' : op === 'trace' ? 'trace' : op;
        lines.push(`${outRef(id, 'result')} = ${fn}(${m})`);
        break;
      }
      case 'matrix-multiply': {
        const a = incoming.a ? outRef(incoming.a.from, incoming.a.fromPort) : '[]';
        const b = incoming.b ? outRef(incoming.b.from, incoming.b.fromPort) : '[]';
        lines.push(`${outRef(id, 'result')} = ${a} * ${b}`);
        break;
      }
      case 'derivative': {
        const e = incoming.expr ? outRef(incoming.expr.from, incoming.expr.fromPort) : `"${cfg.expr ?? 'x'}"`;
        lines.push(`${outRef(id, 'result')} = derivative(${e}, "${cfg.variable ?? 'x'}")`);
        break;
      }
      case 'integrate': {
        const e = incoming.expr ? outRef(incoming.expr.from, incoming.expr.fromPort) : `"x"`;
        lines.push(`# integrate(${e}, ${cfg.a}, ${cfg.b})  — numeric`);
        break;
      }
      case 'evaluate': {
        const e = incoming.expr ? outRef(incoming.expr.from, incoming.expr.fromPort) : '"x"';
        const x = incoming.x ? outRef(incoming.x.from, incoming.x.fromPort) : '0';
        lines.push(`${outRef(id, 'result')} = substitute(${e}, x = ${x})`);
        break;
      }
      case 'display': {
        const v = incoming.value ? outRef(incoming.value.from, incoming.value.fromPort) : '0';
        lines.push(`display(${v})`);
        break;
      }
    }
  }
  return lines.join('\n');
}


/* ------------------------------------------------------------------ *
 * Legacy / unknown node compatibility — discard unknown types
 * ------------------------------------------------------------------ */
export function sanitizeNodeType(type: string): string | null {
  if (type in NODE_TYPES) return type;
  console.warn(`[pipelineEngine] Discarding unknown node type: "${type}"`);
  return null;
}
