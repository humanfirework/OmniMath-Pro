/**
 * Function category node definitions.
 * 从 pipelineEngine.ts 拆分而来，行为保持完全一致。
 */

import { math, getEvalScope } from '@/lib/engine/mathInstance';
import type { NodeTypeDef } from '../pipelineEngine';
import { toNumber } from './helpers';

export const functionNodes = {
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
        r = Number(math.evaluate(expr, getEvalScope({ x })));
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

  'log-base': {
    type: 'log-base',
    category: 'function',
    labelKey: 'npLogBase',
    icon: 'LogIn',
    color: 'rose',
    inputs: [
      { id: 'x', labelKey: 'npPortX', type: 'number' },
      { id: 'base', labelKey: 'npPortBase', type: 'number' },
    ],
    outputs: [{ id: 'result', labelKey: 'npPortResult', type: 'number' }],
    defaultConfig: { base: 2 },
    execute: (inputs, config) => {
      const x = toNumber(inputs.x);
      // base 优先取输入端口，回退到 config.base（默认 2）。
      const baseRaw = inputs.base;
      const base = baseRaw !== undefined ? toNumber(baseRaw) : Number(config.base ?? 2);
      if (x <= 0 || base <= 0 || base === 1) return { result: NaN };
      return { result: Math.log(x) / Math.log(base) };
    },
  },

  hypotenuse: {
    type: 'hypotenuse',
    category: 'function',
    labelKey: 'npHypotenuse',
    icon: 'Triangle',
    color: 'rose',
    inputs: [
      { id: 'a', labelKey: 'npPortA', type: 'number' },
      { id: 'b', labelKey: 'npPortB', type: 'number' },
    ],
    outputs: [{ id: 'result', labelKey: 'npPortResult', type: 'number' }],
    defaultConfig: {},
    execute: (inputs) => {
      const a = toNumber(inputs.a);
      const b = toNumber(inputs.b);
      return { result: Math.hypot(a, b) };
    },
  },

  sign: {
    type: 'sign',
    category: 'function',
    labelKey: 'npSign',
    icon: 'PlusMinus',
    color: 'rose',
    inputs: [{ id: 'x', labelKey: 'npPortX', type: 'number' }],
    outputs: [{ id: 'result', labelKey: 'npPortResult', type: 'number' }],
    defaultConfig: {},
    execute: (inputs) => {
      const x = toNumber(inputs.x);
      return { result: Math.sign(x) };
    },
  },

  'degrees-radians': {
    type: 'degrees-radians',
    category: 'function',
    labelKey: 'npDegreesRadians',
    icon: 'RefreshCw',
    color: 'rose',
    inputs: [{ id: 'x', labelKey: 'npPortX', type: 'number' }],
    outputs: [{ id: 'result', labelKey: 'npPortResult', type: 'number' }],
    defaultConfig: { direction: 'to-rad' },
    execute: (inputs, config) => {
      const x = toNumber(inputs.x);
      const direction = String(config.direction ?? 'to-rad');
      if (direction === 'to-deg') {
        return { result: (x * 180) / Math.PI };
      }
      return { result: (x * Math.PI) / 180 };
    },
  },
} satisfies Record<string, NodeTypeDef>;
