import type { PipelineNode } from './pipelineEngine';
import { NODE_WIDTH } from './pipelineEngine';

/**
 * 框选命中判定的纯逻辑，抽成独立模块以便单测。
 *
 * 交互约定：在画布空白处「左键拖拽」即框选（无需 Shift），
 * 框内节点被累加选中；Shift 保持追加，否则替换为框内节点。
 */

/** 节点卡片的近似高度（用于 bbox 上界估算）。 */
export const APPROX_NODE_H = 130;

export interface BoxRect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** 把任意两点规范化为矩形（处理从右往左 / 从下往上拖拽）。 */
export function normalizeRect(
  a: { x: number; y: number },
  b: { x: number; y: number },
): BoxRect {
  return {
    x1: Math.min(a.x, b.x),
    y1: Math.min(a.y, b.y),
    x2: Math.max(a.x, b.x),
    y2: Math.max(a.y, b.y),
  };
}

/** 节点 bbox（画布内容坐标）。 */
export function nodeBoundingBox(
  node: PipelineNode,
  nodeW = NODE_WIDTH,
  nodeH = APPROX_NODE_H,
): BoxRect {
  return {
    x1: node.position.x,
    y1: node.position.y,
    x2: node.position.x + nodeW,
    y2: node.position.y + nodeH,
  };
}

/** 两个矩形是否相交（含边界）。 */
export function intersects(a: BoxRect, b: BoxRect): boolean {
  return !(a.x1 > b.x2 || a.x2 < b.x1 || a.y1 > b.y2 || a.y2 < b.y1);
}

/**
 * 计算被框选矩形命中的节点 id 列表。
 * @param nodes 全部节点
 * @param from  拖拽起点（画布内容坐标）
 * @param to    拖拽终点（画布内容坐标）
 */
export function selectNodesInBox(
  nodes: PipelineNode[],
  from: { x: number; y: number },
  to: { x: number; y: number },
): string[] {
  const rect = normalizeRect(from, to);
  return nodes
    .filter((n) => intersects(nodeBoundingBox(n), rect))
    .map((n) => n.id);
}