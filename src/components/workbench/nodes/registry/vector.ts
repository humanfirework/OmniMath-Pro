/**
 * Vector category node definitions — 2D 向量运算。
 *
 * 向量用 { x: number, y: number } 对象表示，通过 'any' 端口传输
 * （不改动 PortDataType 联合）。包含合成/分解/点积/叉积/模长/
 * 归一化/旋转。
 */

import type { NodeTypeDef } from '../pipelineEngine';
import { toNumber } from './helpers';

/** 从任意输入解析为 {x, y} 向量；容错处理缺省字段。 */
function toVec(v: unknown): { x: number; y: number } {
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return { x: toNumber(o.x), y: toNumber(o.y) };
  }
  // 标量退化为 (n, 0)，保证管线健壮性。
  return { x: toNumber(v), y: 0 };
}

export const vectorNodes = {
  'vec2-compose': {
    type: 'vec2-compose',
    category: 'vector',
    labelKey: 'npVec2Compose',
    icon: 'Combine',
    color: 'emerald',
    inputs: [
      { id: 'x', labelKey: 'npPortX', type: 'number' },
      { id: 'y', labelKey: 'npPortY', type: 'number' },
    ],
    outputs: [{ id: 'vec', labelKey: 'npPortVec', type: 'any' }],
    defaultConfig: {},
    execute: (inputs) => {
      const x = toNumber(inputs.x);
      const y = toNumber(inputs.y);
      return { vec: { x, y } };
    },
  },

  'vec2-decompose': {
    type: 'vec2-decompose',
    category: 'vector',
    labelKey: 'npVec2Decompose',
    icon: 'Split',
    color: 'emerald',
    inputs: [{ id: 'vec', labelKey: 'npPortVec', type: 'any' }],
    outputs: [
      { id: 'x', labelKey: 'npPortX', type: 'number' },
      { id: 'y', labelKey: 'npPortY', type: 'number' },
    ],
    defaultConfig: {},
    execute: (inputs) => {
      const v = toVec(inputs.vec);
      return { x: v.x, y: v.y };
    },
  },

  'dot-product': {
    type: 'dot-product',
    category: 'vector',
    labelKey: 'npDotProduct',
    icon: 'Dot',
    color: 'emerald',
    inputs: [
      { id: 'a', labelKey: 'npPortA', type: 'any' },
      { id: 'b', labelKey: 'npPortB', type: 'any' },
    ],
    outputs: [{ id: 'result', labelKey: 'npPortResult', type: 'number' }],
    defaultConfig: {},
    execute: (inputs) => {
      const a = toVec(inputs.a);
      const b = toVec(inputs.b);
      return { result: a.x * b.x + a.y * b.y };
    },
  },

  'cross-product': {
    type: 'cross-product',
    category: 'vector',
    labelKey: 'npCrossProduct',
    icon: 'X',
    color: 'emerald',
    inputs: [
      { id: 'a', labelKey: 'npPortA', type: 'any' },
      { id: 'b', labelKey: 'npPortB', type: 'any' },
    ],
    outputs: [{ id: 'result', labelKey: 'npPortResult', type: 'number' }],
    defaultConfig: {},
    execute: (inputs) => {
      // 2D 叉积返回标量（z 分量）：a.x*b.y - a.y*b.x
      const a = toVec(inputs.a);
      const b = toVec(inputs.b);
      return { result: a.x * b.y - a.y * b.x };
    },
  },

  'vec-magnitude': {
    type: 'vec-magnitude',
    category: 'vector',
    labelKey: 'npVecMagnitude',
    icon: 'Ruler',
    color: 'emerald',
    inputs: [{ id: 'vec', labelKey: 'npPortVec', type: 'any' }],
    outputs: [{ id: 'result', labelKey: 'npPortResult', type: 'number' }],
    defaultConfig: {},
    execute: (inputs) => {
      const v = toVec(inputs.vec);
      return { result: Math.hypot(v.x, v.y) };
    },
  },

  'vec-normalize': {
    type: 'vec-normalize',
    category: 'vector',
    labelKey: 'npVecNormalize',
    icon: 'Scale',
    color: 'emerald',
    inputs: [{ id: 'vec', labelKey: 'npPortVec', type: 'any' }],
    outputs: [{ id: 'vec', labelKey: 'npPortVec', type: 'any' }],
    defaultConfig: {},
    execute: (inputs) => {
      const v = toVec(inputs.vec);
      const mag = Math.hypot(v.x, v.y);
      // 零向量归一化返回原向量（避免 NaN）。
      if (mag === 0) return { vec: { x: 0, y: 0 } };
      return { vec: { x: v.x / mag, y: v.y / mag } };
    },
  },

  'vec-rotate': {
    type: 'vec-rotate',
    category: 'vector',
    labelKey: 'npVecRotate',
    icon: 'RotateCw',
    color: 'emerald',
    inputs: [
      { id: 'vec', labelKey: 'npPortVec', type: 'any' },
      { id: 'angle', labelKey: 'npPortAngle', type: 'number' },
    ],
    outputs: [{ id: 'vec', labelKey: 'npPortVec', type: 'any' }],
    defaultConfig: {},
    execute: (inputs) => {
      const v = toVec(inputs.vec);
      const a = toNumber(inputs.angle); // 弧度
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      return {
        vec: {
          x: v.x * cos - v.y * sin,
          y: v.x * sin + v.y * cos,
        },
      };
    },
  },
} satisfies Record<string, NodeTypeDef>;
