/**
 * Simulation category node definitions — Simulink-style 仿真节点。
 *
 * 这些节点由 `../simulationEngine` 的定步长求解器驱动（含状态与反馈），
 * 而不是主流程的单次数据流执行。`execute` 仅作占位（返回统一标记），
 * 避免在非仿真计算路径下报错。
 */

import type { NodeTypeDef } from '../pipelineEngine';
import { transferAnalysis } from '@/lib/control/transferFunction';

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

  /* ── 自动控制原理（自控）──────────────────────────────────── */
  /**
   * 传递函数分析节点：由分子/分母多项式一键生成
   * 极点（根轨迹依据）、伯德图（幅值 dB + 相位°）、阶跃响应。
   * 属于批量分析节点（非时域逐步块），结果经 pushRunResults 送入独立结果面板。
   */
  'sim-transfer-fn': {
    type: 'sim-transfer-fn',
    category: 'simulation',
    labelKey: 'npSimTransferFn',
    icon: 'Activity',
    color: 'orange',
    inputs: [],
    outputs: [],
    defaultConfig: {
      num: '1',
      den: 's^2+3s+2',
      fMin: 0.01,
      fMax: 1000,
      tEnd: 10,
    },
    configSchema: [
      { key: 'num', label: '分子 N(s)', type: 'text', default: '1', placeholder: '如 1 或 s+2' },
      { key: 'den', label: '分母 D(s)', type: 'text', default: 's^2+3s+2', placeholder: '如 s^2+3s+2' },
      { key: 'fMin', label: 'Bode 起始频率 (Hz)', type: 'number', min: 1e-6, max: 100, step: 0.01, default: 0.01 },
      { key: 'fMax', label: 'Bode 截止频率 (Hz)', type: 'number', min: 1, max: 1e6, step: 10, default: 1000 },
      { key: 'tEnd', label: '阶跃仿真时长 (s)', type: 'number', min: 0.1, max: 100, step: 0.5, default: 10 },
    ],
    execute: (_inputs, config) => ({
      analysis: transferAnalysis({
        num: String(config.num ?? '1'),
        den: String(config.den ?? 's^2+3s+2'),
        fMin: Number(config.fMin),
        fMax: Number(config.fMax),
        tEnd: Number(config.tEnd),
      }),
    }),
  },
} satisfies Record<string, NodeTypeDef>;