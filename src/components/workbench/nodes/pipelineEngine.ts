/**
 * OmniMath Pro — Node Pipeline Engine (pure logic, no React)
 *
 * ComfyUI / blueprint-style node graph. Each node is an operation; edges
 * flow data between output ports → input ports. `executePipeline` does a
 * topological sort and evaluates each node in order, propagating outputs.
 *
 * Uses a SEPARATE mathjs instance so pipeline evaluations never pollute
 * the main workbench engine scope (and vice versa).
 */

import { create, all, type MathNode } from 'mathjs';

const math = create(all);

/* ------------------------------------------------------------------ *
 * Types
 * ------------------------------------------------------------------ */

export type PortDataType = 'number' | 'expression' | 'matrix' | 'any' | 'plot';

export type NodeCategory =
  | 'input'
  | 'operation'
  | 'function'
  | 'plot'
  | 'matrix'
  | 'calculus'
  | 'output';

export type NodeType =
  | 'number-input'
  | 'expression-input'
  | 'variable'
  | 'constant'
  | 'arithmetic'
  | 'function-apply'
  | 'plot-output'
  | 'matrix-input'
  | 'matrix-op'
  | 'matrix-multiply'
  | 'derivative'
  | 'integrate'
  | 'evaluate'
  | 'display';

export interface PortDef {
  id: string;
  /** i18n key — resolved by the UI. */
  labelKey: string;
  type: PortDataType;
}

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
}

export interface NodeTypeDef {
  type: NodeType;
  category: NodeCategory;
  /** i18n key for the node title. */
  labelKey: string;
  /** Lucide icon name (string — UI maps to component). */
  icon: string;
  color: 'teal' | 'amber' | 'rose' | 'violet' | 'emerald' | 'orange' | 'cyan';
  inputs: PortDef[];
  outputs: PortDef[];
  defaultConfig: Record<string, unknown>;
  execute: (
    inputs: Record<string, unknown>,
    config: Record<string, unknown>,
    ctx: PipelineContext,
  ) => Record<string, unknown>;
}

/* ------------------------------------------------------------------ *
 * Layout constants — port positions are computed deterministically
 * from these so the SVG edge layer never needs to measure the DOM.
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

/** Port center in canvas-content coordinates. */
export function getPortPosition(
  node: PipelineNode,
  portId: string,
  isOutput: boolean,
): { x: number; y: number } | null {
  const def = NODE_TYPES[node.type];
  if (!def) return null;
  const ports = isOutput ? def.outputs : def.inputs;
  const idx = ports.findIndex((p) => p.id === portId);
  if (idx < 0) return null;
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
 * Node type registry
 * ------------------------------------------------------------------ */

export const NODE_TYPES: Record<NodeType, NodeTypeDef> = {
  /* ── Input category ─────────────────────────────────────────── */
  'number-input': {
    type: 'number-input',
    category: 'input',
    labelKey: 'npNumberInput',
    icon: 'Hash',
    color: 'teal',
    inputs: [],
    outputs: [{ id: 'value', labelKey: 'npPortValue', type: 'number' }],
    defaultConfig: { value: 1, min: -10, max: 10, step: 0.1 },
    execute: (_inputs, config) => {
      const v = Number(config.value);
      return { value: Number.isNaN(v) ? 0 : v };
    },
  },

  'expression-input': {
    type: 'expression-input',
    category: 'input',
    labelKey: 'npExpressionInput',
    icon: 'Type',
    color: 'teal',
    inputs: [],
    outputs: [{ id: 'value', labelKey: 'npPortExpr', type: 'expression' }],
    defaultConfig: { expr: 'sin(x)' },
    execute: (_inputs, config) => ({ value: String(config.expr ?? 'x') }),
  },

  variable: {
    type: 'variable',
    category: 'input',
    labelKey: 'npVariable',
    icon: 'Variable',
    color: 'teal',
    inputs: [],
    outputs: [{ id: 'value', labelKey: 'npPortValue', type: 'any' }],
    defaultConfig: { name: '' },
    execute: (_inputs, config, ctx) => {
      const name = String(config.name ?? '');
      if (!name) return { value: 0 };
      const v = ctx.variables[name];
      return { value: v ?? 0 };
    },
  },

  constant: {
    type: 'constant',
    category: 'input',
    labelKey: 'npConstant',
    icon: 'Hash',
    color: 'teal',
    inputs: [],
    outputs: [{ id: 'value', labelKey: 'npPortValue', type: 'number' }],
    defaultConfig: { name: 'pi' },
    execute: (_inputs, config) => {
      const name = String(config.name ?? 'pi');
      const constants: Record<string, number> = {
        pi: Math.PI,
        e: Math.E,
        tau: 2 * Math.PI,
        phi: (1 + Math.sqrt(5)) / 2,
        sqrt2: Math.SQRT2,
      };
      return { value: constants[name] ?? 0 };
    },
  },

  /* ── Operation category ─────────────────────────────────────── */
  arithmetic: {
    type: 'arithmetic',
    category: 'operation',
    labelKey: 'npArithmetic',
    icon: 'Plus',
    color: 'amber',
    inputs: [
      { id: 'a', labelKey: 'npPortA', type: 'number' },
      { id: 'b', labelKey: 'npPortB', type: 'number' },
    ],
    outputs: [{ id: 'result', labelKey: 'npPortResult', type: 'number' }],
    defaultConfig: { op: '+' },
    execute: (inputs, config) => {
      const a = toNumber(inputs.a);
      const b = toNumber(inputs.b);
      const op = String(config.op ?? '+');
      let r: number;
      switch (op) {
        case '+': r = a + b; break;
        case '-': r = a - b; break;
        case '*': r = a * b; break;
        case '/': r = b === 0 ? NaN : a / b; break;
        case '^': r = Math.pow(a, b); break;
        case '%': r = a % b; break;
        default: r = a + b;
      }
      return { result: r };
    },
  },

  /* ── Function category ──────────────────────────────────────── */
  'function-apply': {
    type: 'function-apply',
    category: 'function',
    labelKey: 'npFunctionApply',
    icon: 'FunctionSquare',
    color: 'rose',
    inputs: [{ id: 'x', labelKey: 'npPortX', type: 'number' }],
    outputs: [{ id: 'result', labelKey: 'npPortResult', type: 'number' }],
    defaultConfig: { fn: 'sin', customExpr: '' },
    execute: (inputs, config) => {
      const x = toNumber(inputs.x);
      const fn = String(config.fn ?? 'sin');
      let r: number;
      if (fn === 'custom') {
        const expr = String(config.customExpr ?? 'x');
        r = Number(math.evaluate(expr, { x }));
      } else {
        const fnMap: Record<string, (v: number) => number> = {
          sin: Math.sin, cos: Math.cos, tan: Math.tan,
          asin: Math.asin, acos: Math.acos, atan: Math.atan,
          exp: Math.exp, log: (v) => Math.log10(v),
          ln: (v) => Math.log(v), sqrt: Math.sqrt,
          abs: Math.abs, cbrt: Math.cbrt, sinh: Math.sinh,
          cosh: Math.cosh, tanh: Math.tanh, floor: Math.floor,
          ceil: Math.ceil, round: Math.round,
        };
        const f = fnMap[fn] ?? Math.sin;
        r = f(x);
      }
      return { result: r };
    },
  },

  /* ── Plot category ──────────────────────────────────────────── */
  'plot-output': {
    type: 'plot-output',
    category: 'plot',
    labelKey: 'npPlotOutput',
    icon: 'LineChart',
    color: 'violet',
    inputs: [{ id: 'expr', labelKey: 'npPortExpr', type: 'expression' }],
    outputs: [{ id: 'plot', labelKey: 'npPortPlot', type: 'plot' }],
    defaultConfig: { xMin: -10, xMax: 10 },
    execute: (inputs, config) => {
      const expr = toExprString(inputs.expr) || 'x';
      const xMin = Number(config.xMin ?? -10);
      const xMax = Number(config.xMax ?? 10);
      // Sample the curve so the node footer can show a sparkline.
      const samples: Array<[number, number]> = [];
      const N = 60;
      for (let i = 0; i <= N; i++) {
        const xv = xMin + ((xMax - xMin) * i) / N;
        try {
          const yv = Number(math.evaluate(expr, { x: xv }));
          samples.push([xv, Number.isFinite(yv) ? yv : NaN]);
        } catch {
          samples.push([xv, NaN]);
        }
      }
      return { plot: { expr, xMin, xMax, samples } };
    },
  },

  /* ── Matrix category ────────────────────────────────────────── */
  'matrix-input': {
    type: 'matrix-input',
    category: 'matrix',
    labelKey: 'npMatrixInput',
    icon: 'Grid3x3',
    color: 'emerald',
    inputs: [],
    outputs: [{ id: 'matrix', labelKey: 'npPortMatrix', type: 'matrix' }],
    defaultConfig: {
      cells: [
        [{ value: '1' }, { value: '2' }],
        [{ value: '3' }, { value: '4' }],
      ],
      rows: 2,
      cols: 2,
    },
    execute: (_inputs, config) => {
      const cells = (config.cells as { value: string }[][]) ?? [[{ value: '0' }]];
      return { matrix: parseMatrixGrid(cells) };
    },
  },

  'matrix-op': {
    type: 'matrix-op',
    category: 'matrix',
    labelKey: 'npMatrixOp',
    icon: 'Calculator',
    color: 'emerald',
    inputs: [{ id: 'matrix', labelKey: 'npPortMatrix', type: 'matrix' }],
    outputs: [{ id: 'result', labelKey: 'npPortResult', type: 'any' }],
    defaultConfig: { op: 'inv' },
    execute: (inputs, config) => {
      const m = toMatrix(inputs.matrix);
      const op = String(config.op ?? 'inv');
      switch (op) {
        case 'inv': return { result: math.inv(m) };
        case 'transpose': return { result: math.transpose(m) };
        case 'det': return { result: math.det(m) };
        case 'trace': return { result: math.trace(m) };
        case 'rank': return { result: matrixRank(m) };
        case 'eigen': {
          try {
            const eigs = math.eigs(m);
            return { result: { values: eigs.values, vectors: eigs.eigenvectors } };
          } catch {
            return { result: 'eigs failed' };
          }
        }
        default: return { result: m };
      }
    },
  },

  'matrix-multiply': {
    type: 'matrix-multiply',
    category: 'matrix',
    labelKey: 'npMatrixMultiply',
    icon: 'Calculator',
    color: 'emerald',
    inputs: [
      { id: 'a', labelKey: 'npPortA', type: 'matrix' },
      { id: 'b', labelKey: 'npPortB', type: 'matrix' },
    ],
    outputs: [{ id: 'result', labelKey: 'npPortResult', type: 'matrix' }],
    defaultConfig: {},
    execute: (inputs) => {
      const a = toMatrix(inputs.a);
      const b = toMatrix(inputs.b);
      return { result: math.multiply(a, b) };
    },
  },

  /* ── Calculus category ──────────────────────────────────────── */
  derivative: {
    type: 'derivative',
    category: 'calculus',
    labelKey: 'npDerivative',
    icon: 'Sigma',
    color: 'orange',
    inputs: [{ id: 'expr', labelKey: 'npPortExpr', type: 'expression' }],
    outputs: [{ id: 'result', labelKey: 'npPortResult', type: 'expression' }],
    defaultConfig: { variable: 'x' },
    execute: (inputs, config) => {
      const expr = toExprString(inputs.expr) || 'x';
      const variable = String(config.variable ?? 'x');
      const d = math.derivative(expr, variable) as MathNode;
      return { result: d };
    },
  },

  integrate: {
    type: 'integrate',
    category: 'calculus',
    labelKey: 'npIntegrate',
    icon: 'Activity',
    color: 'orange',
    inputs: [{ id: 'expr', labelKey: 'npPortExpr', type: 'expression' }],
    outputs: [{ id: 'result', labelKey: 'npPortResult', type: 'number' }],
    defaultConfig: { a: -1, b: 1 },
    execute: (inputs, config) => {
      const expr = toExprString(inputs.expr) || 'x';
      const a = Number(config.a ?? -1);
      const b = Number(config.b ?? 1);
      // Simpson's 1/3 rule with N=200 intervals.
      const N = 200;
      const h = (b - a) / N;
      let sum = 0;
      try {
        const fa = Number(math.evaluate(expr, { x: a }));
        const fb = Number(math.evaluate(expr, { x: b }));
        sum = fa + fb;
        for (let i = 1; i < N; i++) {
          const xv = a + i * h;
          const yv = Number(math.evaluate(expr, { x: xv }));
          sum += (i % 2 === 0 ? 2 : 4) * yv;
        }
      } catch {
        return { result: NaN };
      }
      return { result: (sum * h) / 3 };
    },
  },

  evaluate: {
    type: 'evaluate',
    category: 'calculus',
    labelKey: 'npEvaluate',
    icon: 'Equal',
    color: 'orange',
    inputs: [
      { id: 'expr', labelKey: 'npPortExpr', type: 'expression' },
      { id: 'x', labelKey: 'npPortX', type: 'number' },
    ],
    outputs: [{ id: 'result', labelKey: 'npPortResult', type: 'number' }],
    defaultConfig: {},
    execute: (inputs) => {
      const expr = toExprString(inputs.expr) || 'x';
      const x = toNumber(inputs.x);
      try {
        const r = Number(math.evaluate(expr, { x }));
        return { result: r };
      } catch {
        return { result: NaN };
      }
    },
  },

  /* ── Output category ────────────────────────────────────────── */
  display: {
    type: 'display',
    category: 'output',
    labelKey: 'npDisplay',
    icon: 'Monitor',
    color: 'cyan',
    inputs: [{ id: 'value', labelKey: 'npPortValue', type: 'any' }],
    outputs: [],
    defaultConfig: {},
    execute: (inputs) => ({ value: inputs.value }),
  },
};

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
export function executePipeline(
  nodes: PipelineNode[],
  edges: PipelineEdge[],
  ctx: PipelineContext,
): PipelineNode[] {
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

  // Execute in topo order, propagating outputs.
  const outputs = new Map<string, Record<string, unknown>>();
  for (const id of ordered) {
    const node = byId.get(id)!;
    const def = NODE_TYPES[node.type];
    if (!def) {
      node.error = 'Unknown node type';
      outputs.set(id, {});
      continue;
    }
    // Gather inputs from incoming edges.
    const ins: Record<string, unknown> = {};
    for (const e of edges) {
      if (e.to !== id) continue;
      const fromOut = outputs.get(e.from) ?? {};
      ins[e.toPort] = fromOut[e.fromPort];
    }
    try {
      const out = def.execute(ins, node.config, ctx);
      outputs.set(id, out);
      node.outputs = out;
      node.error = undefined;
      // Primary result = first output value (or for display, the input).
      const firstOutId = def.outputs[0]?.id;
      node.result = firstOutId ? out[firstOutId] : out.value ?? ins.value;
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

  return Array.from(byId.values());
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
