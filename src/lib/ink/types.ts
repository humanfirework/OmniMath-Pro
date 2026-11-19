/**
 * OmniMath — Canvas 墨迹引擎的类型定义。
 *
 * 白板、批注、蓝图画布、移动端手写共用同一套
 * 「采集 → 简化 → 渲染 → 命中」能力。
 * 这一层不依赖 React，指针热路径不会触发组件重渲染。
 */

import type { InkStabilizer } from './stabilizer';

export interface InkPoint {
  x: number;
  y: number;
  t?: number;
  /** 逐点笔宽（压感或速度推导）。 */
  w?: number;
}

export type InkRecognized = 'circle' | 'rectangle' | 'triangle' | 'line' | null;

export type InkShapeId = 'line' | 'rect' | 'triangle' | 'circle' | 'axes';

export type InkBrush = 'pen' | 'marker' | 'highlighter';

/** 与旧白板 Stroke 字段一一对应，方便直接投影。 */
export interface InkStroke {
  id: string;
  points: InkPoint[];
  color: string;
  width: number;
  style: 'pen' | 'eraser';
  /** 笔刷类型：钢笔 / 马克笔 / 荧光笔。旧数据没有该字段时按 pen 处理。 */
  brush?: InkBrush;
  recognized?: InkRecognized;
  pixel?: boolean;
  shape?: InkShapeId;
}

export type InkTool = 'pen' | 'eraser' | 'select' | 'lasso';

export type InkBackground = 'dot' | 'grid' | 'ruled' | 'blank';

export interface InkView {
  k: number;
  x: number;
  y: number;
}

export interface InkBounds {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** 像素画网格单元尺寸（px，世界坐标）。 */
export const PIXEL_CELL = 28;

export const MIN_VIEW_K = 0.25;
export const MAX_VIEW_K = 8;

export interface InkStyle {
  tool: InkTool;
  shapeTool: InkShapeId | null;
  brush: InkBrush;
  color: string;
  width: number;
  eraserSize: number;
  pixelMode: boolean;
  background: InkBackground;
  /** 手写稳定器：off / soft / strong。默认 soft。 */
  stabilizer: InkStabilizer;
}

export interface InkEngineCallbacks {
  /** 一笔画完。返回 true 表示宿主已提交（引擎可乐观保留）。 */
  onStrokeEnd: (stroke: InkStroke) => boolean;
  /** 橡皮路径画完。返回 true 表示宿主已提交。 */
  onEraseEnd: (stroke: InkStroke) => boolean;
  /** 选择工具点中/点空，或套圈选中多个对象。 */
  onSelect: (ids: string[]) => void;
  /** 拖动结束，宿主负责把偏移写进文档（ids 是本次拖动的对象）。 */
  onMoveEnd: (dx: number, dy: number, ids: string[]) => void;
  /** 视口变化（缩放/手势结束）。 */
  onViewChange: (view: InkView) => void;
  /** 命中测试：返回最上层对象 id。 */
  hitTest: (point: { x: number; y: number }, k: number) => string | null;
  /** 笔迹延迟采样：输入事件时间戳 → 下一帧开始（毫秒）。 */
  onLatency?: (ms: number) => void;
}

let idSeq = 0;

/** 稳定的笔画 id。 */
export function newInkId(): string {
  idSeq = (idSeq + 1) % 100000;
  return `ink-${Date.now().toString(36)}-${idSeq.toString(36)}`;
}
