/**
 * Input category node definitions.
 * 从 pipelineEngine.ts 拆分而来，行为保持完全一致。
 */

import type { NodeTypeDef } from '../pipelineEngine';

export const inputNodes = {
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
} satisfies Record<string, NodeTypeDef>;
