/**
 * Simulation category node definitions — Simulink-style 仿真节点。
 *
 * 这些节点由 `../simulationEngine` 的定步长求解器驱动（含状态与反馈），
 * 而不是主流程的单次数据流执行。`execute` 仅作占位（返回统一标记），
 * 避免在非仿真计算路径下报错。
 */

import type { NodeTypeDef } from '../pipelineEngine';

function placeholderExecute(): Record<string, unknown> {
  return { sim: true };
}

export const simulationNodes = {
  /* ── 信源（Sources）────────────────────────────────────────── */
  'sim-clock': {
    type: 'sim-clock',
    category: 'simulation',
    labelKey: 'npSimClock',
    icon: 'Timer',
    color: 'cyan',
    inputs: [],
    outputs: [{ id: 't', labelKey: 'npPortT', type: 'number' }],
    defaultConfig: {},
    execute: () => ({ sim: true, t: 0 }),
  },

  'sim-constant': {
    type: 'sim-constant',
    category: 'simulation',
    labelKey: 'npSimConstant',
    icon: 'Hash',
    color: 'cyan',
    inputs: [],
    outputs: [{ id: 'out', labelKey: 'npSimOut', type: 'number' }],
    defaultConfig: { value: 1 },
    execute: placeholderExecute,
  },

  'sim-sine': {
    type: 'sim-sine',
    category: 'simulation',
    labelKey: 'npSimSine',
    icon: 'Waves',
    color: 'cyan',
    inputs: [],
    outputs: [{ id: 'out', labelKey: 'npSimOut', type: 'number' }],
    defaultConfig: { amplitude: 1, frequency: 1, phase: 0, bias: 0 },
    execute: placeholderExecute,
  },

  'sim-step': {
    type: 'sim-step',
    category: 'simulation',
    labelKey: 'npSimStep',
    icon: 'TrendingUp',
    color: 'cyan',
    inputs: [],
    outputs: [{ id: 'out', labelKey: 'npSimOut', type: 'number' }],
    defaultConfig: { stepTime: 1, initialValue: 0, finalValue: 1 },
    execute: placeholderExecute,
  },

  'sim-ramp': {
    type: 'sim-ramp',
    category: 'simulation',
    labelKey: 'npSimRamp',
    icon: 'ArrowUpRight',
    color: 'cyan',
    inputs: [],
    outputs: [{ id: 'out', labelKey: 'npSimOut', type: 'number' }],
    defaultConfig: { slope: 1, offset: 0, startTime: 0 },
    execute: placeholderExecute,
  },

  'sim-pulse': {
    type: 'sim-pulse',
    category: 'simulation',
    labelKey: 'npSimPulse',
    icon: 'Activity',
    color: 'cyan',
    inputs: [],
    outputs: [{ id: 'out', labelKey: 'npSimOut', type: 'number' }],
    defaultConfig: { amplitude: 1, period: 1, pulseWidth: 0.5, phaseDelay: 0 },
    execute: placeholderExecute,
  },

  'sim-noise': {
    type: 'sim-noise',
    category: 'simulation',
    labelKey: 'npSimNoise',
    icon: 'Waves',
    color: 'cyan',
    inputs: [],
    outputs: [{ id: 'out', labelKey: 'npSimOut', type: 'number' }],
    defaultConfig: { min: -1, max: 1 },
    execute: placeholderExecute,
  },

  /* ── 数学运算（Math）───────────────────────────────────────── */
  'sim-sum': {
    type: 'sim-sum',
    category: 'simulation',
    labelKey: 'npSimSum',
    icon: 'Plus',
    color: 'amber',
    inputs: [
      { id: 'in1', labelKey: 'npSimIn1', type: 'number' },
      { id: 'in2', labelKey: 'npSimIn2', type: 'number' },
    ],
    outputs: [{ id: 'out', labelKey: 'npSimOut', type: 'number' }],
    defaultConfig: { signs: '++' },
    execute: placeholderExecute,
  },

  'sim-gain': {
    type: 'sim-gain',
    category: 'simulation',
    labelKey: 'npSimGain',
    icon: 'Scale',
    color: 'amber',
    inputs: [{ id: 'u', labelKey: 'npSimIn', type: 'number' }],
    outputs: [{ id: 'out', labelKey: 'npSimOut', type: 'number' }],
    defaultConfig: { gain: 1 },
    execute: placeholderExecute,
  },

  'sim-product': {
    type: 'sim-product',
    category: 'simulation',
    labelKey: 'npSimProduct',
    icon: 'X',
    color: 'amber',
    inputs: [
      { id: 'in1', labelKey: 'npSimIn1', type: 'number' },
      { id: 'in2', labelKey: 'npSimIn2', type: 'number' },
    ],
    outputs: [{ id: 'out', labelKey: 'npSimOut', type: 'number' }],
    defaultConfig: {},
    execute: placeholderExecute,
  },

  'sim-saturation': {
    type: 'sim-saturation',
    category: 'simulation',
    labelKey: 'npSimSaturation',
    icon: 'MoveHorizontal',
    color: 'amber',
    inputs: [{ id: 'u', labelKey: 'npSimIn', type: 'number' }],
    outputs: [{ id: 'out', labelKey: 'npSimOut', type: 'number' }],
    defaultConfig: { lowerLimit: -1, upperLimit: 1 },
    execute: placeholderExecute,
  },

  'sim-first-order': {
    type: 'sim-first-order',
    category: 'simulation',
    labelKey: 'npSimFirstOrder',
    icon: 'Gauge',
    color: 'orange',
    inputs: [{ id: 'u', labelKey: 'npSimIn', type: 'number' }],
    outputs: [{ id: 'out', labelKey: 'npSimOut', type: 'number' }],
    defaultConfig: { timeConstant: 1, initialOutput: 0 },
    execute: placeholderExecute,
  },

  /* ── 连续/离散（Continuous / Discrete）────────────────────── */
  'sim-integrator': {
    type: 'sim-integrator',
    category: 'simulation',
    labelKey: 'npSimIntegrator',
    icon: 'Sigma',
    color: 'orange',
    inputs: [{ id: 'u', labelKey: 'npSimIn', type: 'number' }],
    outputs: [{ id: 'out', labelKey: 'npSimOut', type: 'number' }],
    defaultConfig: { initialCondition: 0 },
    execute: placeholderExecute,
  },

  'sim-derivative': {
    type: 'sim-derivative',
    category: 'simulation',
    labelKey: 'npSimDerivative',
    icon: 'Activity',
    color: 'orange',
    inputs: [{ id: 'u', labelKey: 'npSimIn', type: 'number' }],
    outputs: [{ id: 'out', labelKey: 'npSimOut', type: 'number' }],
    defaultConfig: { initialCondition: 0 },
    execute: placeholderExecute,
  },

  'sim-delay': {
    type: 'sim-delay',
    category: 'simulation',
    labelKey: 'npSimDelay',
    icon: 'TimerReset',
    color: 'orange',
    inputs: [{ id: 'u', labelKey: 'npSimIn', type: 'number' }],
    outputs: [{ id: 'out', labelKey: 'npSimOut', type: 'number' }],
    defaultConfig: { initialOutput: 0 },
    execute: placeholderExecute,
  },

  /* ── 显示（Sinks）──────────────────────────────────────────── */
  'sim-scope': {
    type: 'sim-scope',
    category: 'simulation',
    labelKey: 'npSimScope',
    icon: 'LineChart',
    color: 'violet',
    inputs: [{ id: 'u', labelKey: 'npSimIn', type: 'number' }],
    outputs: [],
    defaultConfig: {},
    execute: placeholderExecute,
  },
} satisfies Record<string, NodeTypeDef>;