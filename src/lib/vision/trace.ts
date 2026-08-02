/**
 * 轮廓追踪（Suzuki-Abe 风格的边界跟踪）。
 *
 * 核心思路：在「半整数网格」上追踪——每个前景像素视为 1×1 方格，
 * 前景与背景之间的每条像素边都是一条有向边界段，方向选取「前景在左」。
 * 把这些有向段缝合起来即得到精确闭合的多边形轮廓：
 *   - 外轮廓 CCW → shoelace 面积 > 0
 *   - 孔洞 CW → 面积 < 0
 *
 * 关键：遍历全图每一个像素的 4 条边以收集全部边界段，再用「最左转」
 * 规则缝合，确保不遗漏任何区域（这是「只有部分曲线」问题的根本解法）。
 */
import type { Polyline, Point } from './types';

/** shoelace 有符号面积（2×）。点序列按闭合多边形处理（首尾自动相连）。 */
export function signedArea2(points: Point[], closed: boolean): number {
  const n = points.length;
  if (n < 3) return 0;
  let s = 0;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    s += a.x * b.y - b.x * a.y;
  }
  return s;
}

/** shoelace 面积（带 0.5 系数，带符号）。 */
export function signedArea(points: Point[], closed: boolean): number {
  return signedArea2(points, closed) * 0.5;
}

interface DirectedEdge {
  from: number; // corner index = y*(w+1)+x
  to: number;
  dx: number;
  dy: number;
}

/**
 * 收集所有有向边界段（前景在左）。
 * corner 坐标系：corner (cx,cy) 对应像素格的左上角，cx∈[0,w], cy∈[0,h]。
 */
function collectEdges(binary: Uint8Array, w: number, h: number): DirectedEdge[] {
  const edges: DirectedEdge[] = [];
  const cw = w + 1; // corner grid width
  const isFg = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return false;
    return binary[y * w + x] !== 0;
  };
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      if (!isFg(px, py)) continue;
      // 上邻 (px,py-1)
      if (!isFg(px, py - 1)) {
        // top: (px,py) -> (px+1,py), dir +x, 左 = +y = fg
        edges.push({ from: py * cw + px, to: py * cw + (px + 1), dx: 1, dy: 0 });
      }
      // 右邻 (px+1,py)
      if (!isFg(px + 1, py)) {
        edges.push({ from: py * cw + (px + 1), to: (py + 1) * cw + (px + 1), dx: 0, dy: 1 });
      }
      // 下邻 (px,py+1)
      if (!isFg(px, py + 1)) {
        edges.push({ from: (py + 1) * cw + (px + 1), to: (py + 1) * cw + px, dx: -1, dy: 0 });
      }
      // 左邻 (px-1,py)
      if (!isFg(px - 1, py)) {
        edges.push({ from: (py + 1) * cw + px, to: py * cw + px, dx: 0, dy: -1 });
      }
    }
  }
  return edges;
}

/** 去除闭合折线中位于共线段中间的点（保持方向转折点）。 */
function compressCollinear(points: Point[]): Point[] {
  const n = points.length;
  if (n < 3) return points.slice();
  const out: Point[] = [];
  for (let i = 0; i < n; i++) {
    const prev = points[(i - 1 + n) % n];
    const cur = points[i];
    const next = points[(i + 1) % n];
    const ux = cur.x - prev.x;
    const uy = cur.y - prev.y;
    const vx = next.x - cur.x;
    const vy = next.y - cur.y;
    const cross = ux * vy - uy * vx;
    // 整数坐标，共线判据严格为 0
    if (cross !== 0) {
      out.push(cur);
    }
  }
  return out;
}

/**
 * 追踪二值图全部轮廓。返回 Polyline[]（每条均为 closed=true）。
 * 外轮廓 area>0，孔洞 area<0。完整扫描全图，不遗漏任何区域。
 */
export function traceContours(binary: Uint8Array, w: number, h: number): Polyline[] {
  const cw = w + 1;
  const edges = collectEdges(binary, w, h);
  if (edges.length === 0) return [];

  // 邻接表：cornerIdx -> 起始于该角的边索引列表
  const adj = new Map<number, number[]>();
  for (let i = 0; i < edges.length; i++) {
    const f = edges[i].from;
    let list = adj.get(f);
    if (!list) {
      list = [];
      adj.set(f, list);
    }
    list.push(i);
  }

  const used = new Uint8Array(edges.length);
  const cornerToPoint = (idx: number): Point => ({ x: idx % cw, y: Math.floor(idx / cw) });

  const polylines: Polyline[] = [];

  for (let startEdgeIdx = 0; startEdgeIdx < edges.length; startEdgeIdx++) {
    if (used[startEdgeIdx]) continue;
    const startEdge = edges[startEdgeIdx];
    const startCorner = startEdge.from;
    const contour: Point[] = [];

    let curEdgeIdx = startEdgeIdx;
    let prevDir = { x: startEdge.dx, y: startEdge.dy };
    used[startEdgeIdx] = 1;
    contour.push(cornerToPoint(startCorner));

    while (true) {
      const curEdge = edges[curEdgeIdx];
      const arrive = curEdge.to;
      if (arrive === startCorner) break; // 闭合
      // 在 arrive 角找下一条未用边（最左转规则）
      const candidates = adj.get(arrive);
      if (!candidates || candidates.length === 0) break;
      let nextIdx = -1;
      let bestAngle = -Infinity;
      for (const ci of candidates) {
        if (used[ci]) continue;
        const ce = edges[ci];
        const cross = prevDir.x * ce.dy - prevDir.y * ce.dx;
        const dot = prevDir.x * ce.dx + prevDir.y * ce.dy;
        const angle = Math.atan2(cross, dot); // (-π, π]，越大越左转（CCW）
        if (angle > bestAngle) {
          bestAngle = angle;
          nextIdx = ci;
        }
      }
      if (nextIdx < 0) break; // 无未用出边（理论上不应发生）
      used[nextIdx] = 1;
      contour.push(cornerToPoint(arrive));
      prevDir = { x: edges[nextIdx].dx, y: edges[nextIdx].dy };
      curEdgeIdx = nextIdx;
    }

    if (contour.length >= 3) {
      const compressed = compressCollinear(contour);
      if (compressed.length >= 3) {
        const area = signedArea(compressed, true);
        polylines.push({ points: compressed, closed: true, area });
      }
    }
  }

  return polylines;
}
