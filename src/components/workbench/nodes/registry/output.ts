/**
 * Output category node definitions.
 * 从 pipelineEngine.ts 拆分而来，行为保持完全一致。
 */

import type { NodeTypeDef } from '../pipelineEngine';

export const outputNodes = {
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
} satisfies Record<string, NodeTypeDef>;
