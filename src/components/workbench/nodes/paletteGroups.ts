import type { NodeCategory, NodeType } from './pipelineEngine';

/**
 * 节点右键菜单 / 添加面板的分组定义。
 *
 * 抽到独立模块以便单测：确保 vision / simulation / curve 等高频分类
 * 的节点在菜单中「清晰分组可见」，修复「搜索能搜到、菜单却不显示」问题。
 */
export interface PaletteGroup {
  category: NodeCategory;
  types: NodeType[];
}

export const PALETTE_GROUPS: PaletteGroup[] = [
  { category: 'input', types: ['number-input', 'expression-input', 'variable', 'constant'] },
  { category: 'operation', types: ['arithmetic'] },
  { category: 'function', types: ['function-apply', 'log-base', 'hypotenuse', 'sign', 'degrees-radians'] },
  { category: 'plot', types: ['plot-output'] },
  { category: 'matrix', types: ['matrix-input', 'matrix-op', 'matrix-multiply', 'matrix-decompose'] },
  { category: 'calculus', types: ['derivative', 'integrate', 'symbolic-integrate', 'simplify', 'solve-equation', 'evaluate', 'taylor-series', 'ode-solve', 'limit'] },
  { category: 'mapping', types: ['negate', 'reciprocal', 'clamp', 'map-range', 'lerp', 'min-max', 'compare'] },
  { category: 'vector', types: ['vec2-compose', 'vec2-decompose', 'dot-product', 'cross-product', 'vec-magnitude', 'vec-normalize', 'vec-rotate'] },
  { category: 'curve', types: ['parametric-curve', 'curve-resample', 'curve-transform', 'curve-merge', 'curve-length'] },
  { category: 'statistics', types: ['random-sample', 'mean-variance', 'histogram', 'data-input'] },
  { category: 'logic', types: ['switch', 'threshold-gate'] },
  { category: 'output', types: ['display', 'svg-export'] },
  { category: 'vision', types: ['image-input', 'grayscale-threshold', 'edge-detect', 'contour-trace', 'fine-outline', 'curve-fit', 'plot-curves', 'video-input', 'frame-extract', 'pose-track', 'curve-animate'] },
  { category: 'simulation', types: ['sim-clock', 'sim-constant', 'sim-sine', 'sim-step', 'sim-ramp', 'sim-pulse', 'sim-noise', 'sim-sum', 'sim-gain', 'sim-product', 'sim-saturation', 'sim-first-order', 'sim-integrator', 'sim-derivative', 'sim-delay', 'sim-scope', 'sim-transfer-fn'] },
  { category: 'control', types: ['control-tf', 'control-serial', 'control-feedback', 'control-step', 'control-impulse', 'control-bode', 'control-nyquist', 'control-rlocus', 'control-pole', 'control-zero', 'control-roots', 'control-closed-step'] },
];

/**
 * 默认展开的分组分类。按用户偏好，所有分类默认「收起」，只在用户点击展开
 * 或搜索节点时展开（搜索时一律忽略折叠，直接显示匹配结果）。
 */
export const DEFAULT_EXPANDED_CATEGORIES: ReadonlySet<string> = new Set([]);

/** 按分类索引分组，便于测试「某分类下应包含哪些节点」。 */
export function groupByCategory(): Map<NodeCategory, NodeType[]> {
  const map = new Map<NodeCategory, NodeType[]>();
  for (const g of PALETTE_GROUPS) {
    map.set(g.category, g.types);
  }
  return map;
}