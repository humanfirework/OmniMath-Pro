/**
 * Mapping category node definitions — 标量数学映射变换。
 *
 * 取负 / 倒数 / 钳制 / 区间映射 / 线性插值 / 最值 / 比较。
 * 全部为纯函数节点，输入输出均为 number（compare 输出 0/1）。
 */

import type { NodeTypeDef } from '../pipelineEngine';
import { toNumber } from './helpers';

export const mappingNodes = {
  negate: {
    type: 'negate',
    category: 'mapping',
    labelKey: 'npNegate',
    icon: 'Minus',
    color: 'amber',
    inputs: [{ id: 'x', labelKey: 'npPortX', type: 'number' }],
    outputs: [{ id: 'result', labelKey: 'npPortResult', type: 'number' }],
    defaultConfig: {},
    execute: (inputs) => {
      const x = toNumber(inputs.x);
      return { result: -x };
    },
  },

  reciprocal: {
    type: 'reciprocal',
    category: 'mapping',
    labelKey: 'npReciprocal',
    icon: 'Divide',
    color: 'amber',
    inputs: [{ id: 'x', labelKey: 'npPortX', type: 'number' }],
    outputs: [{ id: 'result', labelKey: 'npPortResult', type: 'number' }],
    defaultConfig: {},
    execute: (inputs) => {
      const x = toNumber(inputs.x);
      return { result: x === 0 ? NaN : 1 / x };
    },
  },

  clamp: {
    type: 'clamp',
    category: 'mapping',
    labelKey: 'npClamp',
    icon: 'Shrink',
    color: 'amber',
    inputs: [{ id: 'x', labelKey: 'npPortX', type: 'number' }],
    outputs: [{ id: 'result', labelKey: 'npPortResult', type: 'number' }],
    defaultConfig: { min: 0, max: 1 },
    execute: (inputs, config) => {
      const x = toNumber(inputs.x);
      const min = Number(config.min ?? 0);
      const max = Number(config.max ?? 1);
      return { result: Math.min(Math.max(x, min), max) };
    },
  },

  'map-range': {
    type: 'map-range',
    category: 'mapping',
    labelKey: 'npMapRange',
    icon: 'ArrowRightLeft',
    color: 'amber',
    inputs: [{ id: 'x', labelKey: 'npPortX', type: 'number' }],
    outputs: [{ id: 'result', labelKey: 'npPortResult', type: 'number' }],
    defaultConfig: { inMin: 0, inMax: 100, outMin: 0, outMax: 1 },
    execute: (inputs, config) => {
      const x = toNumber(inputs.x);
      const inMin = Number(config.inMin ?? 0);
      const inMax = Number(config.inMax ?? 100);
      const outMin = Number(config.outMin ?? 0);
      const outMax = Number(config.outMax ?? 1);
      const span = inMax - inMin;
      // 防止 inMin==inMax 时除零；退化到 outMin。
      const t = span === 0 ? 0 : (x - inMin) / span;
      return { result: outMin + t * (outMax - outMin) };
    },
  },

  lerp: {
    type: 'lerp',
    category: 'mapping',
    labelKey: 'npLerp',
    icon: 'Blend',
    color: 'amber',
    inputs: [
      { id: 'a', labelKey: 'npPortA', type: 'number' },
      { id: 'b', labelKey: 'npPortB', type: 'number' },
      { id: 't', labelKey: 'npPortT', type: 'number' },
    ],
    outputs: [{ id: 'result', labelKey: 'npPortResult', type: 'number' }],
    defaultConfig: {},
    execute: (inputs) => {
      const a = toNumber(inputs.a);
      const b = toNumber(inputs.b);
      const t = toNumber(inputs.t);
      return { result: a + (b - a) * t };
    },
  },

  'min-max': {
    type: 'min-max',
    category: 'mapping',
    labelKey: 'npMinMax',
    icon: 'ChevronsUpDown',
    color: 'amber',
    inputs: [
      { id: 'a', labelKey: 'npPortA', type: 'number' },
      { id: 'b', labelKey: 'npPortB', type: 'number' },
    ],
    outputs: [{ id: 'result', labelKey: 'npPortResult', type: 'number' }],
    defaultConfig: { op: 'min' },
    execute: (inputs, config) => {
      const a = toNumber(inputs.a);
      const b = toNumber(inputs.b);
      const op = String(config.op ?? 'min');
      return { result: op === 'max' ? Math.max(a, b) : Math.min(a, b) };
    },
  },

  compare: {
    type: 'compare',
    category: 'mapping',
    labelKey: 'npCompare',
    icon: 'GitCompare',
    color: 'amber',
    inputs: [
      { id: 'a', labelKey: 'npPortA', type: 'number' },
      { id: 'b', labelKey: 'npPortB', type: 'number' },
    ],
    outputs: [{ id: 'result', labelKey: 'npPortResult', type: 'number' }],
    defaultConfig: { op: '<' },
    execute: (inputs, config) => {
      const a = toNumber(inputs.a);
      const b = toNumber(inputs.b);
      const op = String(config.op ?? '<');
      let r: boolean;
      switch (op) {
        case '<': r = a < b; break;
        case '>': r = a > b; break;
        case '<=': r = a <= b; break;
        case '>=': r = a >= b; break;
        case '==': r = a === b; break;
        case '!=': r = a !== b; break;
        default: r = a < b;
      }
      return { result: r ? 1 : 0 };
    },
  },
} satisfies Record<string, NodeTypeDef>;
