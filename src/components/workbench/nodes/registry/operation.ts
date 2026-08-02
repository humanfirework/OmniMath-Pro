/**
 * Operation category node definitions.
 * 从 pipelineEngine.ts 拆分而来，行为保持完全一致。
 */

import type { NodeTypeDef } from '../pipelineEngine';
import { toNumber } from './helpers';

export const operationNodes = {
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
} satisfies Record<string, NodeTypeDef>;
