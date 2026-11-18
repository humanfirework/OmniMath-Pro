/**
 * Blueprint visual parsing — the *visual* layer, not semantic understanding.
 *
 * From a contour set it extracts:
 *   - node candidates: large closed rectangles / ellipses / circles;
 *   - connectors: thin polylines whose two ends sit near two different nodes.
 *
 * It deliberately does not claim to OCR labels or understand what a diagram
 * means. Rectangles inside rectangles are de-duplicated so a hollow node
 * outline does not produce two nodes. Everything is pure and unit-testable.
 */

import { annotateContours, type FourierShape, type ShapeBBox } from './shapeFourier';
import type { Point, Polyline } from './types';

export interface BlueprintNodeInfo {
  id: string;
  shape: FourierShape;
  bbox: ShapeBBox;
  center: Point;
  confidence: number;
}

export interface BlueprintLinkInfo {
  id: string;
  from: string;
  to: string;
  confidence: number;
}

export interface BlueprintGraph {
  nodes: BlueprintNodeInfo[];
  links: BlueprintLinkInfo[];
}

export interface BlueprintParseOptions {
  /** Minimum node bbox edge length in source pixels. Default 30. */
  minNodeSize?: number;
  /** Endpoint-to-node snap distance in pixels. Default max(14, minNodeSize). */
  snapDistance?: number;
  /** Shapes accepted as nodes. Default rectangle / ellipse / circle. */
  allowShapes?: FourierShape[];
  /** Maximum nodes kept (largest first). Default 24. */
  maxNodes?: number;
  /** Maximum links kept. Default 40. */
  maxLinks?: number;
}

const DEFAULT_NODE_SHAPES: FourierShape[] = ['rectangle', 'ellipse', 'circle'];

function bboxOf(points: Point[]): ShapeBBox | null {
  if (points.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

function bboxArea(b: ShapeBBox): number {
  return Math.max(0, b.maxX - b.minX) * Math.max(0, b.maxY - b.minY);
}

/** Tolerance used when deciding whether one contour encloses another. */
const ENCLOSE_PAD = 2;

function pointInBBox(p: Point, b: ShapeBBox, pad = 0): boolean {
  return p.x >= b.minX - pad && p.x <= b.maxX + pad && p.y >= b.minY - pad && p.y <= b.maxY + pad;
}

/** Distance from a point to the nearest edge/inside of a bbox (0 when inside). */
export function pointToBBoxDistance(p: Point, b: ShapeBBox): number {
  const dx = Math.max(b.minX - p.x, 0, p.x - b.maxX);
  const dy = Math.max(b.minY - p.y, 0, p.y - b.maxY);
  return Math.hypot(dx, dy);
}

/**
 * Two endpoints of a contour. Open strokes use first/last; closed contours
 * (a thin connector traced as a ribbon) use the extremes along the dominant
 * axis, which recovers the two ends of the stroke.
 */
export function contourEndpoints(poly: {
  points: Point[];
  closed?: boolean;
}): [Point, Point] | null {
  const pts = poly.points;
  if (!pts || pts.length < 2) return null;
  if (!poly.closed) return [pts[0], pts[pts.length - 1]];

  const b = bboxOf(pts);
  if (!b) return null;
  if (b.maxX - b.minX >= b.maxY - b.minY) {
    let left = pts[0];
    let right = pts[0];
    for (const p of pts) {
      if (p.x < left.x) left = p;
      if (p.x > right.x) right = p;
    }
    return [left, right];
  }
  let top = pts[0];
  let bottom = pts[0];
  for (const p of pts) {
    if (p.y < top.y) top = p;
    if (p.y > bottom.y) bottom = p;
  }
  return [top, bottom];
}

interface NearestNode {
  node: BlueprintNodeInfo;
  distance: number;
  confidence: number;
}

function nearestNode(p: Point, nodes: BlueprintNodeInfo[], snap: number): NearestNode | null {
  let best: NearestNode | null = null;
  for (const node of nodes) {
    const d = pointToBBoxDistance(p, node.bbox);
    if (d > snap) continue;
    const confidence = 1 - d / snap;
    if (!best || d < best.distance) best = { node, distance: d, confidence };
  }
  return best;
}

/**
 * Parse node boxes + connectors from contour polylines.
 * Node candidates are closed shapes above `minNodeSize`; a polyline becomes a
 * connector when both endpoints snap to two different nodes.
 */
export function parseBlueprint(
  polylines: Polyline[],
  options: BlueprintParseOptions = {},
): BlueprintGraph & {
  nodeIndices: Array<{ index: number; id: string }>;
  /** Indices of polylines accepted as connectors (for clean rendering). */
  linkIndices: number[];
} {
  const minNodeSize = Math.max(6, options.minNodeSize ?? 30);
  const snap = Math.max(8, options.snapDistance ?? Math.max(14, minNodeSize));
  const allowShapes = options.allowShapes ?? DEFAULT_NODE_SHAPES;
  const maxNodes = Math.max(1, Math.floor(options.maxNodes ?? 24));
  const maxLinks = Math.max(0, Math.floor(options.maxLinks ?? 40));

  const annotations = annotateContours(polylines, {
    // Node outlines are at least minNodeSize on a side → perimeter ≥ 3× size.
    minPerimeter: minNodeSize * 3,
    minConfidence: 0.3,
    maxLabels: Math.max(polylines.length, maxNodes * 2),
    includeOpen: false,
  }).filter((a) => allowShapes.includes(a.shape));

  // Hollow outlines produce an outer ring + an inner hole. The outer ring also
  // encloses the hole, so it must not become a second node (and a single outer
  // contour around several connected boxes must not swallow all of them).
  const boxes = polylines.map((p) => bboxOf(p.points));
  const enclosesAny = new Set<number>();
  for (let i = 0; i < boxes.length; i++) {
    const bi = boxes[i];
    if (!bi) continue;
    for (let j = 0; j < boxes.length; j++) {
      if (i === j) continue;
      const bj = boxes[j];
      if (!bj) continue;
      const areaI = bboxArea(bi);
      const areaJ = bboxArea(bj);
      if (areaJ <= 0 || areaJ >= areaI * 0.98) continue;
      if (areaJ < areaI * 0.15) continue;
      const cj = { x: (bj.minX + bj.maxX) / 2, y: (bj.minY + bj.maxY) / 2 };
      if (pointInBBox(cj, bi, ENCLOSE_PAD)) enclosesAny.add(i);
    }
  }

  const nodes: BlueprintNodeInfo[] = [];
  const nodeIndices: Array<{ index: number; id: string }> = [];
  const coveredIndices = new Set<number>();
  for (const a of annotations) {
    if (nodes.length >= maxNodes) break;
    const b = a.bbox;
    const width = b.maxX - b.minX;
    const height = b.maxY - b.minY;
    if (Math.min(width, height) < minNodeSize) continue;
    // Skip border rings: a contour that encloses another contour is the
    // stroke around a node whose hole (or inner shape) is the node itself.
    if (enclosesAny.has(a.index)) continue;
    if (nodes.some((n) => pointInBBox(a.center, n.bbox, 2))) continue;
    const node: BlueprintNodeInfo = {
      id: `N${nodes.length + 1}`,
      shape: a.shape,
      bbox: a.bbox,
      center: a.center,
      confidence: a.confidence,
    };
    nodes.push(node);
    nodeIndices.push({ index: a.index, id: node.id });
    coveredIndices.add(a.index);
  }

  const links: BlueprintLinkInfo[] = [];
  const linkIndices: number[] = [];
  const seenPairs = new Set<string>();
  for (let i = 0; i < polylines.length; i++) {
    if (coveredIndices.has(i)) continue;
    if (links.length >= maxLinks) break;
    const poly = polylines[i];
    const b = bboxOf(poly.points);
    if (!b) continue;
    const w = b.maxX - b.minX;
    const h = b.maxY - b.minY;
    // Skip large blobs — they are shapes, not connectors. Thin ribbons pass.
    const thin = Math.min(w, h) <= Math.max(6, minNodeSize * 0.35);
    if (!thin && Math.min(w, h) > minNodeSize * 0.5) continue;

    const ends = contourEndpoints(poly);
    if (!ends) continue;
    const a = nearestNode(ends[0], nodes, snap);
    const c = nearestNode(ends[1], nodes, snap);
    if (!a || !c || a.node.id === c.node.id) continue;
    const pair = [a.node.id, c.node.id].sort().join('|');
    if (seenPairs.has(pair)) continue;
    seenPairs.add(pair);
    links.push({
      id: `E${links.length + 1}`,
      from: a.node.id,
      to: c.node.id,
      confidence: Math.min(a.confidence, c.confidence),
    });
    linkIndices.push(i);
  }

  return { nodes, links, nodeIndices, linkIndices };
}

/** 蓝图图结构的高层摘要（只做结构规则，不做文字 OCR）。 */
export interface BlueprintGraphSummary {
  nodeCount: number;
  linkCount: number;
  /** 连通块数量（无孤立节点时通常为 1）。 */
  components: number;
  /** 没有任何连线的节点数。 */
  isolated: number;
  /** 是否存在环（闭环回路）。 */
  hasCycle: boolean;
  /** 度为 1 的节点数（流程图的起点/终点候选）。 */
  leaves: number;
}

/**
 * 从视觉层图结构推导高层语义线索：
 *   - 连通块：哪些节点属于同一张子图；
 *   - 孤立节点：可能是没画全的连线，或被误识别的框；
 *   - 环：反馈回路 / 电路闭环的候选；
 *   - 叶子：流程的入口 / 出口候选。
 *
 * 这些规则不依赖文字标签，因此对任意手绘蓝图都适用；
 * 同时保持纯函数，方便单测与下游复用。
 */
export function summarizeBlueprintGraph(graph: BlueprintGraph): BlueprintGraphSummary {
  const ids = graph.nodes.map((n) => n.id);
  const parent = new Map<string, string>(ids.map((id) => [id, id]));
  const degree = new Map<string, number>(ids.map((id) => [id, 0]));

  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) !== root) {
      const next = parent.get(root);
      if (!next) return root;
      root = next;
    }
    // 路径压缩，保持多次查询接近 O(1)。
    let cur = id;
    while (parent.get(cur) !== root) {
      const next = parent.get(cur);
      if (!next) break;
      parent.set(cur, root);
      cur = next;
    }
    return root;
  };

  let hasCycle = false;
  for (const link of graph.links) {
    if (!parent.has(link.from) || !parent.has(link.to)) continue;
    degree.set(link.from, (degree.get(link.from) ?? 0) + 1);
    degree.set(link.to, (degree.get(link.to) ?? 0) + 1);
    const a = find(link.from);
    const b = find(link.to);
    if (a === b) {
      hasCycle = true;
    } else {
      parent.set(a, b);
    }
  }

  const roots = new Set(ids.map((id) => find(id)));
  let isolated = 0;
  let leaves = 0;
  for (const id of ids) {
    const d = degree.get(id) ?? 0;
    if (d === 0) isolated++;
    else if (d === 1) leaves++;
  }

  return {
    nodeCount: ids.length,
    linkCount: graph.links.length,
    components: roots.size,
    isolated,
    hasCycle,
    leaves,
  };
}
