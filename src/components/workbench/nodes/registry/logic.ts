/**
 * Logic / flow category node definitions — 条件与阈值门控。
 *
 * switch 按条件选择输入；threshold-gate 把模拟信号二值化。
 */

import type { NodeTypeDef } from '../pipelineEngine';
import { toNumber } from './helpers';

export const logicNodes = {
  switch: {
    type: 'switch',
    category: 'logic',
    labelKey: 'npSwitch',
    icon: 'ToggleLeft',
    color: 'orange',
    inputs: [
      { id: 'condition', labelKey: 'npPortCondition', type: 'number' },
      { id: 'a', labelKey: 'npPortA', type: 'any' },
      { id: 'b', labelKey: 'npPortB', type: 'any' },
    ],
    outputs: [{ id: 'result', labelKey: 'npPortResult', type: 'any' }],
    defaultConfig: {},
    execute: (inputs) => {
      const cond = toNumber(inputs.condition);
      // condition ≠ 0 → a，否则 b。
      return { result: cond !== 0 ? inputs.a : inputs.b };
    },
  },

  'threshold-gate': {
    type: 'threshold-gate',
    category: 'logic',
    labelKey: 'npThresholdGate',
    icon: 'Filter',
    color: 'orange',
    inputs: [{ id: 'x', labelKey: 'npPortX', type: 'number' }],
    outputs: [{ id: 'result', labelKey: 'npPortResult', type: 'number' }],
    defaultConfig: { threshold: 0.5 },
    execute: (inputs, config) => {
      const x = toNumber(inputs.x);
      const threshold = Number(config.threshold ?? 0.5);
      return { result: x >= threshold ? 1 : 0 };
    },
  },
} satisfies Record<string, NodeTypeDef>;
