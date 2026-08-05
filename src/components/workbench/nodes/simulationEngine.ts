/**
 * OmniMath Pro — Simulink-style simulation engine (pure logic)
 *
 * The main node pipeline is a *single-pass* dataflow graph (topological sort,
 * each node evaluated once). Simulation needs time-stepping + state + feedback
 * loops — which a plain DAG cannot express. This module adds a lightweight
 * "Simulink-ish" solver on top of the same node graph:
 *
 *   • Continuous states (integrator / first-order) are integrated by a chosen
 *     RK method. `sim-first-order` is treated as a continuous state too, so it
 *     gets the same RK accuracy as the integrator (previously it used only
 *     first-order Euler accumulation).
 *   • Methods:
 *       - `euler`   : forward Euler (ode1) — classic, fast, mildly unstable.
 *       - `rk4`     : classic 4th-order Runge–Kutta (ode4).
 *       - `rkf45`   : adaptive 5(4) Runge–Kutta–Fehlberg (ode45) with
 *                     step-size control and error estimate.
 *   • Algebraic loops (cycles without a stateful block) are detected and
 *     solved with fixed-point iteration instead of silently deadlocking.
 *   • Zero-crossing events on recorded signals are reported (for step-driven
 *     discontinuities), enabling exact event times.
 *   • `sim-scope` blocks accumulate the signal into a time series for plotting.
 */

import type { PipelineNode, PipelineEdge } from './pipelineEngine';
import { NODE_TYPES } from './registry';

export interface SimConfig {
  t0: number;
  tEnd: number;
  /** Base step size (sec). Defaults to (tEnd−t0)/300 if 0. For rkf45 this is the initial step. */
  dt: number;
  /** Integration method: euler (ode1), rk4 (ode4) or rkf45 (ode45). */
  method: 'euler' | 'rk4' | 'rkf45';
  /** Relative tolerance for rkf45 step-size control. */
  relTol: number;
  /** Absolute tolerance for rkf45. */
  absTol: number;
  /** Max number of fixed-point iterations for an algebraic loop. */
  maxAlgebraicIter: number;
}

export interface SimSeries {
  /** One entry per scope node: nodeId → signal samples over time. */
  series: Record<string, number[]>;
  /** Shared time axis. */
  t: number[];
  /** Zero-crossing events: { nodeId, t, direction } (recorded when detected). */
  events: Array<{ nodeId: string; t: number; direction: 1 | -1 }>;
}

type SimNodeHandler = (args: {
  node: PipelineNode;
  inputs: Record<string, number>;
  t: number;
  dt: number;
  state: Record<string, number>;
  prev: Record<string, number>;
}) => { out: number; next?: number };

/** Blocks that hold cross-step state — their outputs are available before
 *  their (possibly feedback) inputs are computed, so they break cycles. */
const STATEFUL_TYPES = new Set(['sim-integrator', 'sim-delay', 'sim-derivative', 'sim-first-order']);

/** Continuous states — integrated with RK methods (integrator + first-order). */
const CONTINUOUS_TYPES = new Set(['sim-integrator', 'sim-first-order']);

const NUMBER = (v: unknown, fallback = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const HANDLERS: Record<string, SimNodeHandler> = {
  'sim-clock': ({ t }) => ({ out: t }),

  'sim-constant': ({ node }) => ({ out: NUMBER(node.config.value, 1) }),

  'sim-sine': ({ node, t }) => {
    const amp = NUMBER(node.config.amplitude, 1);
    const freq = NUMBER(node.config.frequency, 1);
    const phase = NUMBER(node.config.phase, 0);
    const bias = NUMBER(node.config.bias, 0);
    return { out: bias + amp * Math.sin(2 * Math.PI * freq * t + phase) };
  },

  'sim-step': ({ node, t }) => {
    const stepTime = NUMBER(node.config.stepTime, 1);
    const initialValue = NUMBER(node.config.initialValue, 0);
    const finalValue = NUMBER(node.config.finalValue, 1);
    return { out: t < stepTime ? initialValue : finalValue };
  },

  'sim-ramp': ({ node, t }) => {
    const slope = NUMBER(node.config.slope, 1);
    const offset = NUMBER(node.config.offset, 0);
    const startTime = NUMBER(node.config.startTime, 0);
    return { out: t < startTime ? offset : offset + slope * (t - startTime) };
  },

  'sim-pulse': ({ node, t }) => {
    // 周期矩形脉冲（Pulse Generator）：占空比 = pulseWidth / period。
    const amp = NUMBER(node.config.amplitude, 1);
    const period = Math.max(Number.EPSILON, NUMBER(node.config.period, 1));
    const pulseWidth = NUMBER(node.config.pulseWidth, 0.5);
    const phaseDelay = NUMBER(node.config.phaseDelay, 0);
    const phase = ((t - phaseDelay) % period + period) % period;
    return { out: phase < pulseWidth ? amp : 0 };
  },

  'sim-noise': ({ node }) => {
    // 均匀白噪声（Uniform Random Number）：范围 [min, max]。
    const min = NUMBER(node.config.min, -1);
    const max = NUMBER(node.config.max, 1);
    return { out: min + (max - min) * Math.random() };
  },

  'sim-gain': ({ node, inputs }) => {
    const gain = NUMBER(node.config.gain, 1);
    return { out: gain * (inputs.u ?? 0) };
  },

  'sim-sum': ({ node, inputs }) => {
    const signs = String(node.config.signs ?? '++');
    let out = 0;
    (NODE_TYPES[node.type].inputs ?? []).forEach((port, i) => {
      const v = inputs[port.id] ?? 0;
      const sign = signs[i] === '-' ? -1 : 1;
      out += sign * v;
    });
    return { out };
  },

  'sim-product': ({ node, inputs }) => {
    let out = 1;
    (NODE_TYPES[node.type].inputs ?? []).forEach((port) => {
      out *= inputs[port.id] ?? 0;
    });
    return { out };
  },

  'sim-saturation': ({ node, inputs }) => {
    const lo = NUMBER(node.config.lowerLimit, -1);
    const hi = NUMBER(node.config.upperLimit, 1);
    const u = inputs.u ?? 0;
    return { out: Math.max(lo, Math.min(hi, u)) };
  },

  'sim-first-order': ({ node, inputs, state }) => {
    const T = NUMBER(node.config.timeConstant, 1);
    const prev = state[node.id] ?? NUMBER(node.config.initialOutput, 0);
    const u = inputs.u ?? 0;
    // 输出 = 当前状态；导数由连续求解器处理。
    return { out: prev, next: T > 0 ? prev + ((u - prev) / T) : u };
  },

  'sim-integrator': ({ node, inputs, state }) => {
    const prev = state[node.id] ?? NUMBER(node.config.initialCondition, 0);
    return { out: prev, next: prev + (inputs.u ?? 0) };
  },

  'sim-delay': ({ node, inputs, state }) => {
    const prev = state[node.id] ?? NUMBER(node.config.initialOutput, 0);
    return { out: prev, next: inputs.u ?? prev };
  },

  'sim-derivative': ({ node, inputs, state, dt }) => {
    const prev = state[node.id] ?? NUMBER(node.config.initialCondition, 0);
    const u = inputs.u ?? 0;
    return { out: (u - prev) / dt, next: u };
  },

  'sim-scope': ({ inputs, state, node }) => {
    return { out: inputs.u ?? 0, next: state[node.id] ?? 0 };
  },
};

/** Is this node handled by the simulation engine? */
export function isSimulationNode(node: PipelineNode): boolean {
  return node.type in HANDLERS;
}

interface GraphResult {
  /** Output value of every ordered node. */
  values: Record<string, number>;
  /** Input seen at the `u` port of every stateful node (for derivative). */
  stateInputs: Record<string, number>;
  /** `next` requested by non-integrator discrete blocks (delay / derivative). */
  discreteNext: Record<string, number>;
  /** Derivative for continuous nodes (integrator / first-order). */
  deriv: Record<string, number>;
}

/** Derivative of a continuous node given its state and input. */
function continuousDerivative(type: string, y: number, u: number, node: PipelineNode): number {
  if (type === 'sim-integrator') return u;
  if (type === 'sim-first-order') {
    const T = NUMBER(node.config.timeConstant, 1);
    return T > 0 ? (u - y) / T : u;
  }
  return 0;
}

/**
 * Evaluate the (sub)graph once, given a set of "stateful output" overrides.
 *
 * Stateful blocks output the value provided in `statefulOut` (RK4 stages set
 * these to intermediate states). Non-stateful blocks are computed in
 * dependency order. Feedback edges are resolved: a stateful block's output is
 * always available (it breaks loops), so a cycle through a stateful block is
 * schedulable.
 *
 * If `algebraic` (nodes that formal an algebraic loop) is non-empty, the whole
 * evaluation is repeated with fixed-point iteration so the loop converges.
 */
function evaluateGraphAt(
  order: string[],
  byId: Map<string, PipelineNode>,
  inMap: Map<string, PipelineEdge[]>,
  statefulOut: Record<string, number>,
  prev: Record<string, number>,
  t: number,
  dt: number,
  algebraic?: string[],
  maxIter = 200,
): GraphResult {
  const values: Record<string, number> = {};
  const stateInputs: Record<string, number> = {};
  const discreteNext: Record<string, number> = {};
  const deriv: Record<string, number> = {};

  const pass = () => {
    const current: Record<string, number> = {};
    for (const id of order) {
      const node = byId.get(id) as PipelineNode;
      const inputs: Record<string, number> = {};
      for (const e of inMap.get(id) ?? []) {
        let v: number;
        if (e.from in current) v = current[e.from];
        else if (e.from in values) v = values[e.from];
        else if (e.from in statefulOut) v = statefulOut[e.from];
        else v = prev[e.from] ?? 0;
        inputs[e.toPort] = v;
      }
      current[id] = statefulOut[id] ?? 0;

      if (!STATEFUL_TYPES.has(node.type)) {
        const res = HANDLERS[node.type]({ node, inputs, t, dt, state: {}, prev });
        current[id] = res.out;
      } else if (node.type === 'sim-delay' || node.type === 'sim-derivative') {
        const res = HANDLERS[node.type]({
          node,
          inputs,
          t,
          dt,
          state: { [node.id]: statefulOut[id] ?? 0 },
          prev: { [id]: statefulOut[id] ?? 0 },
        });
        if (res.next !== undefined) discreteNext[id] = res.next;
      } else if (CONTINUOUS_TYPES.has(node.type)) {
        const y = statefulOut[id] ?? 0;
        deriv[id] = continuousDerivative(node.type, y, inputs.u ?? 0, node);
      }
      stateInputs[id] = inputs.u ?? 0;
    }
    return current;
  };

  // 第一次求值
  Object.assign(values, pass());

  // 存在代数环时，用不动点迭代收敛
  if (algebraic && algebraic.length > 0) {
    for (let iter = 0; iter < maxIter; iter++) {
      const before = algebraic.map((id) => values[id] ?? 0);
      Object.assign(values, pass());
      let maxDelta = 0;
      for (let i = 0; i < algebraic.length; i++) {
        maxDelta = Math.max(maxDelta, Math.abs(values[algebraic[i]] - before[i]));
      }
      if (maxDelta < 1e-9) break;
    }
  }

  return { values, stateInputs, discreteNext, deriv };
}

/** Compute a stage intermediate state: x = x0 + c·k (element-wise). */
function stageState(
  continuousIds: string[],
  x0: Record<string, number>,
  k: Record<string, number>,
  c: number,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of continuousIds) out[id] = x0[id] + c * (k[id] ?? 0);
  return out;
}

/** Evaluate the graph at a continuous-state override and return deriv + side effects. */
function derivAt(
  order: string[],
  byId: Map<string, PipelineNode>,
  inMap: Map<string, PipelineEdge[]>,
  stateMap: Record<string, number>,
  prev: Record<string, number>,
  t: number,
  dt: number,
  algebraic?: string[],
): GraphResult {
  return evaluateGraphAt(order, byId, inMap, { ...stateMap }, prev, t, dt, algebraic);
}

/** One RK4 step over continuous states. */
function rk4Step(
  order: string[],
  byId: Map<string, PipelineNode>,
  inMap: Map<string, PipelineEdge[]>,
  x0: Record<string, number>,
  prev: Record<string, number>,
  t: number,
  h: number,
  continuousIds: string[],
  algebraic?: string[],
): { x1: Record<string, number>; discreteNext: Record<string, number>; values: Record<string, number> } {
  const k1 = derivAt(order, byId, inMap, x0, prev, t, h, algebraic);
  const k2 = derivAt(order, byId, inMap, stageState(continuousIds, x0, k1.deriv, h * 0.5), prev, t + h / 2, h, algebraic);
  const k3 = derivAt(order, byId, inMap, stageState(continuousIds, x0, k2.deriv, h * 0.5), prev, t + h / 2, h, algebraic);
  const k4 = derivAt(order, byId, inMap, stageState(continuousIds, x0, k3.deriv, h), prev, t + h, h, algebraic);

  const x1: Record<string, number> = {};
  for (const id of continuousIds) {
    x1[id] = x0[id] + (h / 6) * (k1.deriv[id] + 2 * k2.deriv[id] + 2 * k3.deriv[id] + k4.deriv[id]);
  }
  return { x1, discreteNext: k4.discreteNext, values: k4.values };
}

/** One forward-Euler step over continuous states. */
function eulerStep(
  order: string[],
  byId: Map<string, PipelineNode>,
  inMap: Map<string, PipelineEdge[]>,
  x0: Record<string, number>,
  prev: Record<string, number>,
  t: number,
  h: number,
  continuousIds: string[],
  algebraic?: string[],
): { x1: Record<string, number>; discreteNext: Record<string, number>; values: Record<string, number> } {
  const k1 = derivAt(order, byId, inMap, x0, prev, t, h, algebraic);
  const x1: Record<string, number> = {};
  for (const id of continuousIds) x1[id] = x0[id] + h * (k1.deriv[id] ?? 0);
  return { x1, discreteNext: k1.discreteNext, values: k1.values };
}

/* RKF45 (5,4) Fehlberg tableau. */
const RKF45_A = [0, 1 / 4, 3 / 8, 12 / 13, 1, 1 / 2];
const RKF45_B = [
  [1 / 4],
  [3 / 32, 9 / 32],
  [1932 / 2197, -7200 / 2197, 7296 / 2197],
  [439 / 216, -8, 3680 / 513, -845 / 4104],
  [-8 / 27, 2, -3544 / 2565, 1859 / 4104, -11 / 40],
];
const RKF45_C4 = [25 / 216, 0, 1408 / 2565, 2197 / 4104, -1 / 5, 0];
const RKF45_C5 = [16 / 135, 0, 6656 / 12825, 28561 / 56430, -9 / 50, 2 / 55];

/**
 * One adaptive RKF45 step. Returns the 5th-order solution, an error estimate,
 * and side effects from the final stage.
 */
function rkf45Step(
  order: string[],
  byId: Map<string, PipelineNode>,
  inMap: Map<string, PipelineEdge[]>,
  x0: Record<string, number>,
  prev: Record<string, number>,
  t: number,
  h: number,
  continuousIds: string[],
  algebraic?: string[],
): {
  x4: Record<string, number>;
  x5: Record<string, number>;
  err: number;
  discreteNext: Record<string, number>;
  values: Record<string, number>;
} {
  const ks: Array<Record<string, number>> = [];
  let finalG: GraphResult | null = null;
  for (let s = 0; s < 6; s++) {
    // 构造此子步的状态：x0 + h·Σ_j b_{s,j}·k_j
    const sb: Record<string, number> = {};
    for (const id of continuousIds) {
      let sum = 0;
      for (let j = 0; j < ks.length; j++) sum += (RKF45_B[s - 1]?.[j] ?? 0) * ks[j][id];
      sb[id] = sum;
    }
    const state = stageState(continuousIds, x0, sb, h);
    const g = derivAt(order, byId, inMap, state, prev, t + RKF45_A[s] * h, h, algebraic);
    ks.push(g.deriv);
    finalG = g;
  }

  const x4: Record<string, number> = {};
  const x5: Record<string, number> = {};
  let maxErr = 0;
  for (const id of continuousIds) {
    let s4 = 0;
    let s5 = 0;
    for (let j = 0; j < 6; j++) {
      s4 += RKF45_C4[j] * ks[j][id];
      s5 += RKF45_C5[j] * ks[j][id];
    }
    x4[id] = x0[id] + h * s4;
    x5[id] = x0[id] + h * s5;
    maxErr = Math.max(maxErr, Math.abs(x5[id] - x4[id]));
  }
  return { x4, x5, err: maxErr, discreteNext: finalG?.discreteNext ?? {}, values: finalG?.values ?? {} };
}

/**
 * Run a simulation over the given (sub)graph of simulation nodes.
 * Only nodes with simulation handlers are evaluated; other nodes are ignored.
 */
export function runSimulation(
  nodes: PipelineNode[],
  edges: PipelineEdge[],
  config: Partial<SimConfig> = {},
): SimSeries {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const simNodes = nodes.filter(isSimulationNode);
  if (simNodes.length === 0) return { series: {}, t: [], events: [] };

  const t0 = NUMBER(config.t0, 0);
  const tEnd = NUMBER(config.tEnd, 10);
  const relTol = NUMBER(config.relTol, 1e-4) || 1e-4;
  const absTol = NUMBER(config.absTol, 1e-6) || 1e-6;
  const maxAlgebraicIter = Math.max(1, Math.floor(NUMBER(config.maxAlgebraicIter, 200)));
  const baseDt = NUMBER(config.dt, 0) || (tEnd - t0) / 300;
  const method = config.method === 'rk4' || config.method === 'rkf45' ? config.method : 'euler';

  // Edge maps (only among sim nodes).
  const inMap = new Map<string, PipelineEdge[]>();
  for (const sim of simNodes) inMap.set(sim.id, []);
  for (const e of edges) {
    if (byId.has(e.from) && byId.has(e.to) && isSimulationNode(byId.get(e.from)!) && isSimulationNode(byId.get(e.to)!)) {
      inMap.get(e.to)!.push(e);
    }
  }

  // Compute a static evaluation order. Stateful blocks are always schedulable
  // (their output uses pre-step state), so a cycle through a stateful block is
  // breakable. Pure sources (no inputs) are always ready.
  const order: string[] = [];
  const scheduled = new Set<string>();
  {
    let progress = true;
    while (progress) {
      progress = false;
      for (const sim of simNodes) {
        if (scheduled.has(sim.id)) continue;
        const ins = inMap.get(sim.id) ?? [];
        const ready = ins.every(
          (e) => scheduled.has(e.from) || STATEFUL_TYPES.has((byId.get(e.from) as PipelineNode).type),
        );
        if (ready) {
          scheduled.add(sim.id);
          order.push(sim.id);
          progress = true;
        }
      }
    }
  }

  // 代数环：未调度的节点形成纯代数环（无状态块可断环）。
  const algebraic = simNodes.filter((n) => !scheduled.has(n.id)).map((n) => n.id);
  if (algebraic.length > 0) {
    // 追加到求值顺序末尾，由不动点迭代收敛。
    for (const id of algebraic) order.push(id);
  }

  // Continuous states.
  const continuousIds = simNodes.filter((n) => CONTINUOUS_TYPES.has(n.type)).map((n) => n.id);

  const state: Record<string, number> = {};
  for (const sim of simNodes) {
    if (STATEFUL_TYPES.has(sim.type)) {
      state[sim.id] = NUMBER(sim.config.initialCondition ?? sim.config.initialOutput, 0);
    }
  }
  const series: Record<string, number[]> = {};
  const tAxis: number[] = [];
  const events: SimSeries['events'] = [];
  const prev: Record<string, number> = { ...state };

  /** 记录一个节点的输出到 series（若它是 scope 或 record=true）。 */
  const record = (id: string, v: number): void => {
    const n = byId.get(id);
    if (!n) return;
    if (n.type === 'sim-scope' || n.config?.record === true) (series[id] ??= []).push(v);
  };

  /** 记录当前时刻所有应记录节点。 */
  const recordAll = (values: Record<string, number>): void => {
    for (const sim of simNodes) record(sim.id, values[sim.id] ?? prev[sim.id] ?? 0);
  };

  /** 过零检测：记录 nodeId 信号在 t_{k-1}→t_k 间的符号翻转。 */
  const zeroCrossing = (values: Record<string, number>): void => {
    for (const sim of simNodes) {
      if (sim.type !== 'sim-scope' && sim.config?.record !== true) continue;
      const cur = values[sim.id] ?? 0;
      const ar = series[sim.id];
      if (!ar || ar.length < 2) continue;
      const prevVal = ar[ar.length - 2];
      if (prevVal === 0 || cur === 0) continue;
      if (Math.sign(prevVal) !== Math.sign(cur)) {
        events.push({ nodeId: sim.id, t: tAxis[tAxis.length - 1], direction: cur > 0 ? 1 : -1 });
      }
    }
  };

  // ── 连续状态求解（euler / RK4 定步长 / RKF45 自适应）──────────
  let t = t0;
  let h = baseDt;
  let guard = 0;
  const MAX_STEPS = Math.max(1e5, Math.ceil((tEnd - t0) / Math.min(baseDt, 1e-9)));
  const eulerDt = (tEnd - t0) / Math.max(1, Math.ceil((tEnd - t0) / baseDt));

  // 初始值写入 series
  recordAll(state);
  tAxis.push(t);

  while (t < tEnd - 1e-12 && guard++ < MAX_STEPS) {
    const x0: Record<string, number> = {};
    for (const id of continuousIds) x0[id] = state[id] ?? 0;

    let accepted = false;
    let lastH = h;

    if (method === 'rk4') {
      // —— RK4 定步长 ——
      lastH = Math.min(baseDt, tEnd - t);
      const { x1, discreteNext } = rk4Step(order, byId, inMap, x0, prev, t, lastH, continuousIds, algebraic);
      for (const id of continuousIds) state[id] = x1[id];
      for (const [id, v] of Object.entries(discreteNext)) state[id] = v;
      t += lastH;
      accepted = true;
    } else if (method === 'rkf45') {
      // —— RKF45 自适应 ——
      h = Math.min(h, tEnd - t);
      const { x4, x5, err, discreteNext } = rkf45Step(order, byId, inMap, x0, prev, t, h, continuousIds, algebraic);
      let scale = 0;
      for (const id of continuousIds) {
        scale = Math.max(scale, absTol + relTol * Math.max(Math.abs(x0[id]), Math.abs(x5[id])));
      }
      const scaledErr = scale > 0 ? err / scale : 0;
      // 接受则推进；拒绝则缩小步长重试（不推进 t）
      if (scaledErr <= 1 || h <= 1e-12) {
        for (const id of continuousIds) state[id] = x5[id];
        for (const [id, v] of Object.entries(discreteNext)) state[id] = v;
        t += h;
        accepted = true;
      }
      // h_new = h · 0.9 · err^(-1/5)，钳制在 [h/10, 10h]
      const factor = scaledErr > 0 ? 0.9 * Math.pow(scaledErr, -0.2) : 5;
      h = Math.max(h / 10, Math.min(h * 10, h * factor));
    } else {
      // —— Euler (ode1) 定步长 ——
      lastH = eulerDt;
      const { x1, discreteNext } = eulerStep(order, byId, inMap, x0, prev, t, lastH, continuousIds, algebraic);
      for (const id of continuousIds) state[id] = x1[id];
      for (const [id, v] of Object.entries(discreteNext)) state[id] = v;
      t += lastH;
      accepted = true;
    }

    if (accepted) {
      // 在新状态上做一次最终求值，从而记录 scope 的真实输出
      // （若直接使用 RK 中间 stage 的 values，会记录到 stage 覆盖值而非集成后的状态）。
      const finalValues = evaluateGraphAt(order, byId, inMap, state, prev, t, lastH > 0 ? lastH : h, algebraic).values;
      tAxis.push(t);
      recordAll(finalValues);
      zeroCrossing(finalValues);
      Object.assign(prev, finalValues);
    }
  }

  return { series, t: tAxis, events };
}