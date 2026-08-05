/**
 * OmniMath Pro — Simulink-style discrete-time simulation engine (pure logic)
 *
 * The main node pipeline is a *single-pass* dataflow graph (topological sort,
 * each node evaluated once). Simulation needs time-stepping + state + feedback
 * loops — which a plain DAG cannot express. This module adds a lightweight
 * "Simulink-ish" solver on top of the same node graph:
 *
 *   • A fixed-step solver advances time t from t0 → tEnd in steps of dt.
 *   • At each step it evaluates the simulation nodes in dependency order.
 *   • Stateful blocks (integrator / unit-delay / derivative) hold internal
 *     state across steps and their outputs are *pre-step* values, which is
 *     exactly how Simulink breaks algebraic loops.
 *   • Two integration methods are supported:
 *       - `euler`: forward Euler (ode1) — classic, fast, mildly unstable.
 *       - `rk4`:   classic 4th-order Runge–Kutta (ode4) — accurate for ODEs.
 *   • `sim-scope` blocks accumulate the signal into a time series for plotting.
 *
 * Backbone: `sim-integrator` implements dx/dt = u(t) via numeric integration,
 * mirroring the continuous-time Integrator block in Simulink. Combined with
 * sources + gain + sum you can model classic ODEs (e.g. ẋ = 2sin(3t) − 4x).
 */

import type { PipelineNode, PipelineEdge } from './pipelineEngine';
import { NODE_TYPES } from './registry';

export interface SimConfig {
  t0: number;
  tEnd: number;
  /** Fixed step size (sec). Defaults to (tEnd−t0)/300 if 0. */
  dt: number;
  /** Integration method: euler (ode1) or rk4 (ode4). */
  method: 'euler' | 'rk4';
}

export interface SimSeries {
  /** One entry per scope node: nodeId → signal samples over time. */
  series: Record<string, number[]>;
  /** Shared time axis. */
  t: number[];
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
const STATEFUL_TYPES = new Set(['sim-integrator', 'sim-delay', 'sim-derivative']);

/** Continuous states (RK4 applies RK4 to these). */
const CONTINUOUS_TYPES = new Set(['sim-integrator']);

const NUMBER = (v: unknown, fallback = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const HANDLERS: Record<string, SimNodeHandler> = {
  'sim-clock': () => ({ out: 0 }),

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

  'sim-first-order': ({ node, inputs, state, dt }) => {
    // 一阶惯性环节（传递函数 1/(Ts+1)）：T·ẏ + y = u → ẏ = (u − y)/T
    const T = NUMBER(node.config.timeConstant, 1);
    const prev = state[node.id] ?? NUMBER(node.config.initialOutput, 0);
    const u = inputs.u ?? 0;
    const k = T > 0 ? (u - prev) / T : u;
    return { out: prev, next: prev + k * dt };
  },

  'sim-integrator': ({ node, inputs, state, dt }) => {
    // Output = current (pre-update) state; then accumulate input.
    const prev = state[node.id] ?? NUMBER(node.config.initialCondition, 0);
    const u = inputs.u ?? 0;
    return { out: prev, next: prev + u * dt };
  },

  'sim-delay': ({ node, inputs, state }) => {
    // Unit delay z⁻¹: output the input from the previous step.
    const prev = state[node.id] ?? NUMBER(node.config.initialOutput, 0);
    return { out: prev, next: inputs.u ?? prev };
  },

  'sim-derivative': ({ node, inputs, state, dt }) => {
    const prev = state[node.id] ?? NUMBER(node.config.initialCondition, 0);
    const u = inputs.u ?? 0;
    return { out: (u - prev) / dt, next: u };
  },

  'sim-scope': ({ inputs, state, node }) => {
    // Pass-through; the engine records the value into the series.
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
}

/**
 * Evaluate the (sub)graph once, given a set of "stateful output" overrides.
 *
 * Stateful blocks output the value provided in `statefulOut` (RK4 stages set
 * these to intermediate states). Non-stateful blocks are computed in
 * dependency order. Feedback edges are resolved: a stateful block's output is
 * always available (it breaks loops), so a cycle through a stateful block is
 * schedulable.
 */
function evaluateGraphAt(
  order: string[],
  byId: Map<string, PipelineNode>,
  inMap: Map<string, PipelineEdge[]>,
  statefulOut: Record<string, number>,
  prev: Record<string, number>,
  t: number,
  dt: number,
): GraphResult {
  const values: Record<string, number> = {};
  const stateInputs: Record<string, number> = {};
  const discreteNext: Record<string, number> = {};

  for (const id of order) {
    const node = byId.get(id) as PipelineNode;
    const inputs: Record<string, number> = {};
    for (const e of inMap.get(id) ?? []) {
      let v: number;
      if (e.from in values) v = values[e.from];
      else if (e.from in statefulOut) v = statefulOut[e.from];
      else v = prev[e.from] ?? 0;
      inputs[e.toPort] = v;
    }
    values[id] = statefulOut[id] ?? 0;

    if (!STATEFUL_TYPES.has(node.type)) {
      const res = HANDLERS[node.type]({ node, inputs, t, dt, state: {}, prev });
      values[id] = res.out;
    } else if (node.type === 'sim-delay' || node.type === 'sim-derivative') {
      // Discrete blocks: their `next` is computed from the current inputs.
      const res = HANDLERS[node.type]({
        node,
        inputs,
        t,
        dt,
        state: { [node.id]: statefulOut[id] ?? 0 },
        prev: { [id]: statefulOut[id] ?? 0 },
      });
      if (res.next !== undefined) discreteNext[id] = res.next;
    }
    stateInputs[id] = inputs.u ?? 0;
  }
  return { values, stateInputs, discreteNext };
}

function stageState(
  integratorIds: string[],
  x0: Record<string, number>,
  deriv: Record<string, number>,
  stageDt: number,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of integratorIds) out[id] = x0[id] + stageDt * deriv[id];
  return out;
}

/**
 * Run a fixed-step simulation over the given (sub)graph of simulation nodes.
 * Only nodes with simulation handlers are evaluated; other nodes are ignored.
 */
export function runSimulation(
  nodes: PipelineNode[],
  edges: PipelineEdge[],
  config: Partial<SimConfig> = {},
): SimSeries {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const simNodes = nodes.filter(isSimulationNode);
  if (simNodes.length === 0) return { series: {}, t: [] };

  const t0 = NUMBER(config.t0, 0);
  const tEnd = NUMBER(config.tEnd, 10);
  const steps = Math.max(1, Math.ceil((tEnd - t0) / (NUMBER(config.dt, 0) || 0.1)));
  const dt = (tEnd - t0) / steps;
  const method = config.method === 'rk4' ? 'rk4' : 'euler';

  // Edge maps (only among sim nodes).
  const outMap = new Map<string, PipelineEdge[]>(); // kept for symmetry
  const inMap = new Map<string, PipelineEdge[]>(); // toNode → edges
  for (const sim of simNodes) {
    outMap.set(sim.id, []);
    inMap.set(sim.id, []);
  }
  for (const e of edges) {
    if (byId.has(e.from) && byId.has(e.to) && isSimulationNode(byId.get(e.from)!) && isSimulationNode(byId.get(e.to)!)) {
      outMap.get(e.from)!.push(e);
      inMap.get(e.to)!.push(e);
    }
  }

  // Compute a static evaluation order. Stateful blocks are always schedulable
  // (their output uses pre-step state), so a cycle through a stateful block is
  // breakable. Pure sources (no inputs) are always ready.
  const order: string[] = [];
  const scheduled = new Set<string>();
  let progress = true;
  while (progress) {
    progress = false;
    for (const sim of simNodes) {
      if (scheduled.has(sim.id)) continue;
      const ins = inMap.get(sim.id) ?? [];
      const ready = ins.every((e) => scheduled.has(e.from) || STATEFUL_TYPES.has((byId.get(e.from) as PipelineNode).type));
      const noInputs = ins.length === 0;
      if (ready && (noInputs || STATEFUL_TYPES.has(sim.type))) {
        // Sources first, or stateful blocks (feedback breakers).
        scheduled.add(sim.id);
        order.push(sim.id);
        progress = true;
      }
    }
    // Second pass: everything whose inputs are now satisfied.
    for (const sim of simNodes) {
      if (scheduled.has(sim.id)) continue;
      const ins = inMap.get(sim.id) ?? [];
      if (ins.every((e) => scheduled.has(e.from))) {
        scheduled.add(sim.id);
        order.push(sim.id);
        progress = true;
      }
    }
  }

  // Run.
  const state: Record<string, number> = {};
  for (const sim of simNodes) {
    if (STATEFUL_TYPES.has(sim.type)) state[sim.id] = NUMBER(sim.config.initialCondition ?? sim.config.initialOutput, 0);
  }
  const series: Record<string, number[]> = {};
  const tAxis: number[] = [];
  const prev: Record<string, number> = { ...state };

  const integratorIds = simNodes.filter((n) => n.type === 'sim-integrator').map((n) => n.id);

  for (let k = 0; k <= steps; k++) {
    const t = t0 + k * dt;
    tAxis.push(t);

    if (method === 'rk4' && integratorIds.length > 0) {
      // ── RK4 over continuous (integrator) states ─────────────────
      const x0: Record<string, number> = {};
      for (const id of integratorIds) x0[id] = state[id] ?? 0;

      const stageDt = dt / 2;
      const k1 = evaluateGraphAt(order, byId, inMap, statefulOutFor(state), prev, t, dt);
      const k2 = evaluateGraphAt(order, byId, inMap, statefulOutFor(stageState(integratorIds, x0, k1.stateInputs, stageDt)), prev, t + stageDt, dt);
      const k3 = evaluateGraphAt(order, byId, inMap, statefulOutFor(stageState(integratorIds, x0, k2.stateInputs, stageDt)), prev, t + stageDt, dt);
      const k4 = evaluateGraphAt(order, byId, inMap, statefulOutFor(stageState(integratorIds, x0, k3.stateInputs, dt)), prev, t + dt, dt);

      const nextState: Record<string, number> = {};
      for (const id of integratorIds) {
        nextState[id] = x0[id] + (dt / 6) * (k1.stateInputs[id] + 2 * k2.stateInputs[id] + 2 * k3.stateInputs[id] + k4.stateInputs[id]);
        state[id] = nextState[id];
      }
      // Discrete blocks (delay/derivative) take their `next` from the final stage.
      for (const [id, v] of Object.entries(k4.discreteNext)) state[id] = v;

      // Scope outputs come from the final stage's values.
      const finalValues = k4.values;
      const lastValues: Record<string, number> = {};
      for (const sim of simNodes) {
        lastValues[sim.id] = finalValues[sim.id] ?? prev[sim.id] ?? 0;
      }
      for (const sim of simNodes) {
        if (sim.type === 'sim-scope') (series[sim.id] ??= []).push(lastValues[sim.id]);
        else if (sim.config?.record === true) (series[sim.id] ??= []).push(lastValues[sim.id]);
      }
      Object.assign(prev, lastValues);
      continue;
    }

    // ── Euler (ode1) ─────────────────────────────────────────────
    const values: Record<string, number> = {};
    const pending: Record<string, number> = {};

    for (const id of order) {
      const node = byId.get(id) as PipelineNode;
      const inputs: Record<string, number> = {};
      for (const e of inMap.get(id) ?? []) {
        inputs[e.toPort] = values[e.from] ?? prev[e.from] ?? 0;
      }
      const handler = HANDLERS[node.type];
      const res = handler({ node, inputs, t, dt, state, prev });
      values[id] = res.out;
      if (res.next !== undefined) pending[id] = res.next;
      if (node.type === 'sim-scope') {
        (series[id] ??= []).push(values[id]);
      } else if (byId.get(id)?.config?.record === true) {
        (series[id] ??= []).push(values[id]);
      }
    }

    // Commit stateful updates (Euler accumulation).
    for (const [id, v] of Object.entries(pending)) state[id] = v;
    Object.assign(prev, values);
  }

  return { series, t: tAxis };
}

/** Build a `statefulOut` override map: stateful blocks output `state`, rest absent. */
function statefulOutFor(state: Record<string, number>): Record<string, number> {
  return { ...state };
}