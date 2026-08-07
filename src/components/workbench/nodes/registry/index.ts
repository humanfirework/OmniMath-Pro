/**
 * Node type registry — 按 category 拆分后的合并入口。
 *
 * 各分类模块（input/operation/function/plot/matrix/calculus/output，
 * 以及 mapping/vector/curve-nodes/statistics/logic/output-extra）
 * 持有节点定义；这里合并成完整的 `NODE_TYPES` 注册表。
 */

import type { NodeTypeDef } from '../pipelineEngine';
import { inputNodes } from './input';
import { operationNodes } from './operation';
import { functionNodes } from './function';
import { plotNodes } from './plot';
import { matrixNodes } from './matrix';
import { calculusNodes } from './calculus';
import { outputNodes } from './output';
import { mappingNodes } from './mapping';
import { vectorNodes } from './vector';
import { curveNodes } from './curve-nodes';
import { statisticsNodes } from './statistics';
import { logicNodes } from './logic';
import { outputExtraNodes } from './output-extra';
import { visionNodes } from './vision';
import { simulationNodes } from './simulation';
import { controlNodes } from './control';

export type NodeType =
  /* input */
  | 'number-input'
  | 'expression-input'
  | 'variable'
  | 'constant'
  /* operation */
  | 'arithmetic'
  /* function */
  | 'function-apply'
  | 'log-base'
  | 'hypotenuse'
  | 'sign'
  | 'degrees-radians'
  /* plot */
  | 'plot-output'
  /* matrix */
  | 'matrix-input'
  | 'matrix-op'
  | 'matrix-multiply'
  | 'matrix-decompose'
  /* calculus */
  | 'derivative'
  | 'integrate'
  | 'symbolic-integrate'
  | 'simplify'
  | 'solve-equation'
  | 'evaluate'
  | 'taylor-series'
  | 'ode-solve'
  | 'limit'
  /* output */
  | 'display'
  | 'svg-export'
  /* mapping */
  | 'negate'
  | 'reciprocal'
  | 'clamp'
  | 'map-range'
  | 'lerp'
  | 'min-max'
  | 'compare'
  /* vector */
  | 'vec2-compose'
  | 'vec2-decompose'
  | 'dot-product'
  | 'cross-product'
  | 'vec-magnitude'
  | 'vec-normalize'
  | 'vec-rotate'
  /* curve */
  | 'parametric-curve'
  | 'curve-resample'
  | 'curve-transform'
  | 'curve-merge'
  | 'curve-length'
  /* statistics */
  | 'random-sample'
  | 'mean-variance'
  | 'histogram'
  | 'data-input'
  /* logic */
  | 'switch'
  | 'threshold-gate'
  /* vision */
  | 'image-input'
  | 'grayscale-threshold'
  | 'edge-detect'
  | 'contour-trace'
  | 'curve-fit'
  | 'plot-curves'
  | 'fine-outline'
  /* vision — 视频动捕（视频/GIF → 姿态 → 曲线动画） */
  | 'video-input'
  | 'frame-extract'
  | 'pose-track'
  | 'curve-animate'
  /* simulation — Simulink-style 仿真（信源/运算/连续/显示） */
  | 'sim-clock'
  | 'sim-constant'
  | 'sim-sine'
  | 'sim-step'
  | 'sim-ramp'
  | 'sim-sum'
  | 'sim-gain'
  | 'sim-product'
  | 'sim-saturation'
  | 'sim-first-order'
  | 'sim-integrator'
  | 'sim-derivative'
  | 'sim-delay'
  | 'sim-scope'
  | 'sim-transfer-fn'
  /* control — MATLAB 风格自动控制（tf/feedback/step/impulse/bode/pole/roots/rlocus/nyquist） */
  | 'control-tf'
  | 'control-serial'
  | 'control-feedback'
  | 'control-step'
  | 'control-impulse'
  | 'control-bode'
  | 'control-nyquist'
  | 'control-rlocus'
  | 'control-pole'
  | 'control-zero'
  | 'control-roots'
  | 'control-closed-step';

export const NODE_TYPES: Record<NodeType, NodeTypeDef> = {
  ...inputNodes,
  ...operationNodes,
  ...functionNodes,
  ...plotNodes,
  ...matrixNodes,
  ...calculusNodes,
  ...outputNodes,
  ...mappingNodes,
  ...vectorNodes,
  ...curveNodes,
  ...statisticsNodes,
  ...logicNodes,
  ...outputExtraNodes,
  ...visionNodes,
  ...simulationNodes,
  ...controlNodes,
};
