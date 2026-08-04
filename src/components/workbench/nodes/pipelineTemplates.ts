/**
 * OmniMath Pro — Pipeline templates
 *
 * Self-contained, working example pipelines that demonstrate the
 * different capabilities of the node graph. Loaded from the "模板"
 * dropdown in the pipeline toolbar; replaces the current canvas state.
 *
 * Each template ships with cascade-laid-out nodes (~280px apart
 * horizontally) and correct port-to-port edges so `executePipeline`
 * runs them without further wiring.
 */

import type { PipelineNode, PipelineEdge } from './pipelineEngine';

export interface TemplateOnLoad {
  viewMode?: string;
  activePreviewTab?: string;
}

export interface PipelineTemplate {
  /** Stable identifier (used as a React key in the dropdown). */
  id: string;
  /** Chinese display name shown in the dropdown. */
  name: string;
  /** Short Chinese description shown under the name. */
  description: string;
  /** i18n key for name (preferred over raw name when available). */
  nameKey?: string;
  /** i18n key for description (preferred over raw description when available). */
  descriptionKey?: string;
  /** Template category tag (e.g. 'vision', 'matrix'). */
  category?: string;
  /** Thumbnail accent color (hex). */
  thumbnailColor?: string;
  nodes: PipelineNode[];
  edges: PipelineEdge[];
  /** Optional auto-actions to trigger after template is loaded. */
  onLoad?: TemplateOnLoad;
}

/* ------------------------------------------------------------------ *
 * Edge helper — keeps edge IDs unique within a template and makes
 * the wiring declarative/readable.
 * ------------------------------------------------------------------ */
function edge(
  id: string,
  from: string,
  fromPort: string,
  to: string,
  toPort: string,
): PipelineEdge {
  return { id, from, fromPort, to, toPort };
}

/* ------------------------------------------------------------------ *
 * Template 1 — 基础运算: a + b × c
 *
 *   3 number inputs → multiply(b,c) → add(a, b*c) → display
 *   Shows operation chaining + operator precedence in a graph.
 * ------------------------------------------------------------------ */
const templateBasicArithmetic: PipelineTemplate = {
  id: 'basic-arithmetic',
  name: '基础运算: a + b × c',
  description: '三个数字 → 乘法 → 加法 → 显示，演示运算链',
  nodes: [
    { id: 't1_a', type: 'number-input', position: { x: 80, y: 100 }, config: { value: 3, min: -10, max: 10, step: 0.1 } },
    { id: 't1_b', type: 'number-input', position: { x: 80, y: 280 }, config: { value: 4, min: -10, max: 10, step: 0.1 } },
    { id: 't1_c', type: 'number-input', position: { x: 80, y: 460 }, config: { value: 5, min: -10, max: 10, step: 0.1 } },
    { id: 't1_mul', type: 'arithmetic', position: { x: 380, y: 280 }, config: { op: '*' } },
    { id: 't1_add', type: 'arithmetic', position: { x: 680, y: 190 }, config: { op: '+' } },
    { id: 't1_disp', type: 'display', position: { x: 980, y: 190 }, config: {} },
  ],
  edges: [
    edge('t1_e1', 't1_a', 'value', 't1_add', 'a'),
    edge('t1_e2', 't1_b', 'value', 't1_mul', 'a'),
    edge('t1_e3', 't1_c', 'value', 't1_mul', 'b'),
    edge('t1_e4', 't1_mul', 'result', 't1_add', 'b'),
    edge('t1_e5', 't1_add', 'result', 't1_disp', 'value'),
  ],
};

/* ------------------------------------------------------------------ *
 * Template 2 — 三角函数可视化
 *
 *   expression("sin(x)") → plot-output
 *   Shows live function plotting.
 * ------------------------------------------------------------------ */
const templateTrigPlot: PipelineTemplate = {
  id: 'trig-plot',
  name: '三角函数可视化',
  description: 'sin(x) 表达式 → 绘图节点，演示函数绘图',
  nodes: [
    { id: 't2_expr', type: 'expression-input', position: { x: 80, y: 200 }, config: { expr: 'sin(x)' } },
    { id: 't2_plot', type: 'plot-output', position: { x: 380, y: 200 }, config: { xMin: -100, xMax: 100 } },
  ],
  edges: [
    edge('t2_e1', 't2_expr', 'value', 't2_plot', 'expr'),
  ],
};

/* ------------------------------------------------------------------ *
 * Template 3 — 矩阵求逆
 *
 *   matrix-input(3×3, invertible) → matrix-op(inv) → display
 *   Shows linear algebra.
 * ------------------------------------------------------------------ */
const templateMatrixInverse: PipelineTemplate = {
  id: 'matrix-inverse',
  name: '矩阵求逆',
  description: '3×3 矩阵 → 求逆 → 显示，演示线性代数',
  nodes: [
    {
      id: 't3_m',
      type: 'matrix-input',
      position: { x: 80, y: 200 },
      config: {
        cells: [
          [{ value: '1' }, { value: '2' }, { value: '3' }],
          [{ value: '0' }, { value: '1' }, { value: '4' }],
          [{ value: '5' }, { value: '6' }, { value: '0' }],
        ],
        rows: 3,
        cols: 3,
      },
    },
    { id: 't3_inv', type: 'matrix-op', position: { x: 380, y: 200 }, config: { op: 'inv' } },
    { id: 't3_disp', type: 'display', position: { x: 680, y: 200 }, config: {} },
  ],
  edges: [
    edge('t3_e1', 't3_m', 'matrix', 't3_inv', 'matrix'),
    edge('t3_e2', 't3_inv', 'result', 't3_disp', 'value'),
  ],
};

/* ------------------------------------------------------------------ *
 * Template 4 — 导数求解
 *
 *   expression("x^3 + 2*x^2") → derivative → display
 *   Shows symbolic calculus with LaTeX output.
 * ------------------------------------------------------------------ */
const templateDerivative: PipelineTemplate = {
  id: 'derivative',
  name: '导数求解',
  description: 'x³ + 2x² → 求导 → 显示，演示微积分与 LaTeX 输出',
  nodes: [
    { id: 't4_expr', type: 'expression-input', position: { x: 80, y: 200 }, config: { expr: 'x^3 + 2*x^2' } },
    { id: 't4_d', type: 'derivative', position: { x: 380, y: 200 }, config: { variable: 'x' } },
    { id: 't4_disp', type: 'display', position: { x: 680, y: 200 }, config: {} },
  ],
  edges: [
    edge('t4_e1', 't4_expr', 'value', 't4_d', 'expr'),
    edge('t4_e2', 't4_d', 'result', 't4_disp', 'value'),
  ],
};

/* ------------------------------------------------------------------ *
 * Template 5 — 复合函数
 *
 *   number-input → function-apply(sin) → function-apply(abs) → display
 *   Shows function chaining (abs(sin(x))).
 * ------------------------------------------------------------------ */
const templateCompositeFunction: PipelineTemplate = {
  id: 'composite-function',
  name: '复合函数',
  description: '数字 → sin → abs → 显示，演示函数复合',
  nodes: [
    { id: 't5_n', type: 'number-input', position: { x: 80, y: 200 }, config: { value: 1.5, min: -10, max: 10, step: 0.1 } },
    { id: 't5_sin', type: 'function-apply', position: { x: 380, y: 200 }, config: { fn: 'sin', customExpr: '' } },
    { id: 't5_abs', type: 'function-apply', position: { x: 680, y: 200 }, config: { fn: 'abs', customExpr: '' } },
    { id: 't5_disp', type: 'display', position: { x: 980, y: 200 }, config: {} },
  ],
  edges: [
    edge('t5_e1', 't5_n', 'value', 't5_sin', 'x'),
    edge('t5_e2', 't5_sin', 'result', 't5_abs', 'x'),
    edge('t5_e3', 't5_abs', 'result', 't5_disp', 'value'),
  ],
};

const templateImageVectorizationQuickstart: PipelineTemplate = {
  id: 'image-vectorization-quickstart',
  name: '图像矢量化快速入门',
  description: '从图片识别边缘 → 拟合贝塞尔曲线 → 叠加到 2D 画布。上传图片、点击运行，一键生成矢量轮廓。',
  nameKey: 'templates.imageVectorization.name',
  category: 'vision',
  descriptionKey: 'templates.imageVectorization.description',
  thumbnailColor: '#6366f1',
  nodes: [
    { id: 'img-in-1', type: 'image-input', position: { x: 80, y: 220 }, config: {} },
    { id: 'fine-1', type: 'fine-outline', position: { x: 420, y: 220 }, config: { imageType: 'auto', low: 40, high: 120, minStrand: 20, preset: 'balanced', eps: 0.9 } },
    { id: 'cf-1', type: 'curve-fit', position: { x: 760, y: 220 }, config: { maxError: 1.5, maxSegments: 8, smooth: 0.3, flipY: true, flipX: false, scale: 1 } },
    { id: 'pc-1', type: 'plot-curves', position: { x: 1100, y: 220 }, config: { color: '#a78bfa', width: 2, flipX: false, flipY: true } },
  ],
  edges: [
    edge('e1', 'img-in-1', 'image', 'fine-1', 'image'),
    edge('e2', 'fine-1', 'contours', 'cf-1', 'contours'),
    edge('e3', 'cf-1', 'curves', 'pc-1', 'curves'),
  ],
  onLoad: {
    viewMode: 'pipeline',
    activePreviewTab: 'plot2d',
  },
};

export const PIPELINE_TEMPLATES: PipelineTemplate[] = [
  templateBasicArithmetic,
  templateTrigPlot,
  templateMatrixInverse,
  templateDerivative,
  templateCompositeFunction,
  templateImageVectorizationQuickstart,
];

/**
 * Load a template by id, returning a deep-cloned { nodes, edges } so the
 * caller can mutate freely without polluting the shared template objects.
 * Returns null if the id is unknown.
 */
export function loadTemplate(
  id: string,
): { nodes: PipelineNode[]; edges: PipelineEdge[] } | null {
  const tpl = PIPELINE_TEMPLATES.find((t) => t.id === id);
  if (!tpl) return null;
  // Configs only contain JSON-safe primitives + nested arrays of cell
  // objects, so a structured clone keeps the shared template immutable.
  return {
    nodes: tpl.nodes.map((n) => ({
      ...n,
      position: { ...n.position },
      config: structuredClone(n.config) as Record<string, unknown>,
    })),
    edges: tpl.edges.map((e) => ({ ...e })),
  };
}
