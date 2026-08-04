/**
 * 曲线拟合：RDP 简化、角点检测、Schneider 最小二乘三次贝塞尔拟合。
 * 纯 TypeScript，无 DOM 依赖。
 */
import type { Point, Polyline, BezierSegment, BezierPath } from './types';

/** 折线总长（相邻点欧氏距离之和）。 */
export function polylineLength(points: Point[]): number {
  if (points.length < 2) return 0;
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    len += Math.sqrt(dx * dx + dy * dy);
  }
  return len;
}

function dist2(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

/** 点 P 到线段 AB 的垂直距离（非负）。 */
function pointSegDist(p: Point, a: Point, b: Point): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const apx = p.x - a.x;
  const apy = p.y - a.y;
  const ab2 = abx * abx + aby * aby;
  if (ab2 < 1e-12) return Math.sqrt(apx * apx + apy * apy);
  let t = (apx * abx + apy * aby) / ab2;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const cx = a.x + t * abx;
  const cy = a.y + t * aby;
  const dx = p.x - cx;
  const dy = p.y - cy;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Ramer-Douglas-Peucker 简化（开折线）。
 * 返回保留的子集（顺序不变）。epsilon 越大越简。
 */
export function rdpSimplify(points: Point[], epsilon: number): Point[] {
  const n = points.length;
  if (n < 3) return points.slice();
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const stack: [number, number][] = [[0, n - 1]];
  while (stack.length > 0) {
    const [s, e] = stack.pop() as [number, number];
    let maxD = -1;
    let maxI = -1;
    for (let i = s + 1; i < e; i++) {
      const d = pointSegDist(points[i], points[s], points[e]);
      if (d > maxD) {
        maxD = d;
        maxI = i;
      }
    }
    if (maxD > epsilon && maxI > 0) {
      keep[maxI] = 1;
      stack.push([s, maxI]);
      stack.push([maxI, e]);
    }
  }
  const out: Point[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(points[i]);
  return out;
}

/**
 * 闭合多边形 RDP：先找离 points[0] 最远的点把环拆成两段开折线，
 * 分别 RDP，再合并（去重衔接点）。
 */
export function rdpSimplifyClosed(points: Point[], epsilon: number): Point[] {
  const n = points.length;
  if (n < 4) return points.slice();
  let farI = 1;
  let farD = -1;
  for (let i = 1; i < n; i++) {
    const d = dist2(points[i], points[0]);
    if (d > farD) {
      farD = d;
      farI = i;
    }
  }
  const a = points.slice(0, farI + 1);
  const b = points.slice(farI).concat([points[0]]);
  const sa = rdpSimplify(a, epsilon);
  const sb = rdpSimplify(b, epsilon);
  // 合并：sa 末点 == sb 首点；sb 末点 == points[0] == sa 首点
  const out = sa.slice(0, -1).concat(sb.slice(0, -1));
  return out;
}

/**
 * 角点检测：相邻边方向变化角度的绝对值超过 threshold（rad）即为角点。
 * 开折线：首尾始终算角点。闭合折线：仅返回转折角点。
 */
export function detectCorners(points: Point[], threshold: number): number[] {
  const n = points.length;
  if (n === 0) return [];
  if (n < 3) return n === 1 ? [0] : [0, n - 1];
  const corners: number[] = [];
  // 是否闭合：首尾点重合
  const closed =
    Math.abs(points[0].x - points[n - 1].x) < 1e-9 &&
    Math.abs(points[0].y - points[n - 1].y) < 1e-9;
  const start = closed ? 0 : 1;
  const end = closed ? n : n - 1;
  for (let i = start; i < end; i++) {
    const prev = points[(i - 1 + n) % n];
    const cur = points[i];
    const next = points[(i + 1) % n];
    const ux = cur.x - prev.x;
    const uy = cur.y - prev.y;
    const vx = next.x - cur.x;
    const vy = next.y - cur.y;
    const ul = Math.sqrt(ux * ux + uy * uy);
    const vl = Math.sqrt(vx * vx + vy * vy);
    if (ul < 1e-9 || vl < 1e-9) {
      corners.push(i);
      continue;
    }
    const cross = (ux * vy - uy * vx) / (ul * vl);
    const dot = (ux * vx + uy * vy) / (ul * vl);
    const ang = Math.atan2(Math.max(-1, Math.min(1, cross)), Math.max(-1, Math.min(1, dot)));
    if (Math.abs(ang) > threshold) corners.push(i);
  }
  if (!closed) {
    if (corners.length === 0 || corners[0] !== 0) corners.unshift(0);
    if (corners[corners.length - 1] !== n - 1) corners.push(n - 1);
  }
  return corners;
}

/** 三次贝塞尔在 t 处求值。 */
export function evalBezier(seg: BezierSegment, t: number): Point {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return {
    x: a * seg.p0.x + b * seg.c1.x + c * seg.c2.x + d * seg.p1.x,
    y: a * seg.p0.y + b * seg.c1.y + c * seg.c2.y + d * seg.p1.y,
  };
}

/**
 * Schneider 最小二乘法拟合一段三次贝塞尔：
 * 按弦长参数化，端点固定，控制点 C1=P0+α1·T1，C2=P3+α2·T2，
 * 解 2×2 法方程得 α1、α2。
 */
export function fitBezierArc(points: Point[], startIdx: number, endIdx: number): BezierSegment {
  const P0 = points[startIdx];
  const P3 = points[endIdx];
  // 退化：仅两端点 → 直线
  if (endIdx - startIdx < 2) {
    const c1 = { x: P0.x + (P3.x - P0.x) / 3, y: P0.y + (P3.y - P0.y) / 3 };
    const c2 = { x: P3.x - (P3.x - P0.x) / 3, y: P3.y - (P3.y - P0.y) / 3 };
    return { p0: P0, c1, c2, p1: P3 };
  }

  // 弦长参数 t_i
  const count = endIdx - startIdx + 1;
  const t = new Float64Array(count);
  const cum = new Float64Array(count);
  let total = 0;
  for (let i = 1; i < count; i++) {
    const dx = points[startIdx + i].x - points[startIdx + i - 1].x;
    const dy = points[startIdx + i].y - points[startIdx + i - 1].y;
    total += Math.sqrt(dx * dx + dy * dy);
    cum[i] = total;
  }
  if (total < 1e-9) {
    const c1 = { x: P0.x + (P3.x - P0.x) / 3, y: P0.y + (P3.y - P0.y) / 3 };
    const c2 = { x: P3.x - (P3.x - P0.x) / 3, y: P3.y - (P3.y - P0.y) / 3 };
    return { p0: P0, c1, c2, p1: P3 };
  }
  for (let i = 0; i < count; i++) t[i] = cum[i] / total;

  // 端点切向
  let t1x = points[startIdx + 1].x - P0.x;
  let t1y = points[startIdx + 1].y - P0.y;
  let l1 = Math.sqrt(t1x * t1x + t1y * t1y);
  if (l1 < 1e-9) {
    t1x = P3.x - P0.x;
    t1y = P3.y - P0.y;
    l1 = Math.sqrt(t1x * t1x + t1y * t1y);
  }
  t1x /= l1;
  t1y /= l1;

  let t2x = P3.x - points[endIdx - 1].x;
  let t2y = P3.y - points[endIdx - 1].y;
  let l2 = Math.sqrt(t2x * t2x + t2y * t2y);
  if (l2 < 1e-9) {
    t2x = P3.x - P0.x;
    t2y = P3.y - P0.y;
    l2 = Math.sqrt(t2x * t2x + t2y * t2y);
  }
  t2x /= l2;
  t2y /= l2;

  // 法方程 A·[α1,α2]^T = b
  let a11 = 0;
  let a12 = 0;
  let a22 = 0;
  let b1 = 0;
  let b2 = 0;
  const t1dot2 = t1x * t2x + t1y * t2y;
  for (let i = 0; i < count; i++) {
    const ti = t[i];
    const u = 1 - ti;
    const c1 = 3 * u * u * ti;
    const c2 = 3 * u * ti * ti;
    const A0 = u * u * u + 3 * u * u * ti;
    const A3 = 3 * u * ti * ti + ti * ti * ti;
    const P = points[startIdx + i];
    const qx = P.x - A0 * P0.x - A3 * P3.x;
    const qy = P.y - A0 * P0.y - A3 * P3.y;
    a11 += c1 * c1;
    a22 += c2 * c2;
    a12 += c1 * c2 * t1dot2;
    b1 += c1 * (t1x * qx + t1y * qy);
    b2 += c2 * (t2x * qx + t2y * qy);
  }

  let alpha1: number;
  let alpha2: number;
  const det = a11 * a22 - a12 * a12;
  if (Math.abs(det) < 1e-12) {
    const chord = Math.sqrt((P3.x - P0.x) ** 2 + (P3.y - P0.y) ** 2);
    alpha1 = chord / 3;
    alpha2 = chord / 3;
  } else {
    alpha1 = (a22 * b1 - a12 * b2) / det;
    alpha2 = (a11 * b2 - a12 * b1) / det;
    if (alpha1 < 0) alpha1 = 0;
    if (alpha2 < 0) alpha2 = 0;
  }

  const c1 = { x: P0.x + alpha1 * t1x, y: P0.y + alpha1 * t1y };
  const c2 = { x: P3.x + alpha2 * t2x, y: P3.y + alpha2 * t2y };
  return { p0: P0, c1, c2, p1: P3 };
}

/** 一段贝塞尔相对点序列 [startIdx..endIdx] 的最大偏差及索引。 */
function arcMaxError(points: Point[], startIdx: number, endIdx: number, seg: BezierSegment): {
  maxErr: number;
  maxIdx: number;
} {
  let maxErr = 0;
  let maxIdx = startIdx;
  const count = endIdx - startIdx + 1;
  // 复用弦长参数
  const cum = new Float64Array(count);
  let total = 0;
  for (let i = 1; i < count; i++) {
    const dx = points[startIdx + i].x - points[startIdx + i - 1].x;
    const dy = points[startIdx + i].y - points[startIdx + i - 1].y;
    total += Math.sqrt(dx * dx + dy * dy);
    cum[i] = total;
  }
  for (let i = 1; i < count - 1; i++) {
    const ti = total > 1e-9 ? cum[i] / total : i / (count - 1);
    const bp = evalBezier(seg, ti);
    const dx = points[startIdx + i].x - bp.x;
    const dy = points[startIdx + i].y - bp.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > maxErr) {
      maxErr = d;
      maxIdx = startIdx + i;
    }
  }
  return { maxErr, maxIdx };
}

/** 递归拟合一段 [start,end]，超误差则在中点分裂。 */
function fitArcRecursive(
  points: Point[],
  startIdx: number,
  endIdx: number,
  errorThreshold: number,
  depth: number,
): BezierSegment[] {
  if (depth > 24 || endIdx - startIdx < 2) {
    return [fitBezierArc(points, startIdx, endIdx)];
  }
  const seg = fitBezierArc(points, startIdx, endIdx);
  const { maxErr, maxIdx } = arcMaxError(points, startIdx, endIdx, seg);
  if (maxErr <= errorThreshold) return [seg];

  if (depth > 3) {
    const nearEdge = maxIdx - startIdx < 3 || endIdx - maxIdx < 3;
    if (nearEdge && endIdx - startIdx > 4) {
      const sub = points.slice(startIdx, endIdx + 1);
      const eps = Math.max(0.5, errorThreshold);
      const rdpPts = rdpSimplify(sub, eps);
      if (rdpPts.length >= 3) {
        const target = rdpPts[1];
        let splitIdx = -1;
        const searchStart = startIdx + 1;
        const searchEnd = endIdx - 1;
        for (let k = searchStart; k <= searchEnd; k++) {
          if (points[k].x === target.x && points[k].y === target.y) { splitIdx = k; break; }
        }
        if (splitIdx < 0) {
          let bestD = Infinity;
          for (let k = searchStart; k <= searchEnd; k++) {
            const d = (points[k].x-target.x)**2 + (points[k].y-target.y)**2;
            if (d < bestD) { bestD = d; splitIdx = k; }
          }
        }
        if (splitIdx > startIdx && splitIdx < endIdx) {
          const left = fitArcRecursive(points, startIdx, splitIdx, errorThreshold, depth + 1);
          const right = fitArcRecursive(points, splitIdx, endIdx, errorThreshold, depth + 1);
          return left.concat(right);
        }
      }
    }
  }
  const left = fitArcRecursive(points, startIdx, maxIdx, errorThreshold, depth + 1);
  const right = fitArcRecursive(points, maxIdx, endIdx, errorThreshold, depth + 1);
  return left.concat(right);
}

/**
 * 完整拟合一条折线为 BezierPath：
 *  检测角点 → 在角点间分段 → 每段 Schneider 拟合 → 误差超限递归分裂。
 *  闭合曲线首尾点连续（segments[last].p1 === segments[0].p0）。
 */
export function fitBezierPath(
  polyline: Polyline,
  errorThreshold: number,
  cornerThreshold: number,
): BezierPath {
  const pts = polyline.points;
  const n = pts.length;
  if (n < 2) return { segments: [], closed: polyline.closed };
  if (n === 2) {
    const seg = fitBezierArc(pts, 0, 1);
    return { segments: [seg], closed: polyline.closed };
  }

  const closed = polyline.closed;
  // 构造工作序列：闭合时追加首点构成开链 ext[0..n]，ext[0]==ext[n]
  const ext: Point[] = closed ? pts.concat([pts[0]]) : pts;
  const N = ext.length;

  // 角点（基于原 pts，闭合时无首尾概念）
  const corners = detectCorners(pts, cornerThreshold);
  const anchorSet = new Set<number>();
  if (closed) {
    anchorSet.add(0);
    anchorSet.add(N - 1);
    for (const c of corners) anchorSet.add(c);
    // 若无角点，补一个离 pts[0] 最远的点，保证至少 2 段
    if (corners.length === 0) {
      let farI = 1;
      let farD = -1;
      for (let i = 1; i < n; i++) {
        const d = (pts[i].x - pts[0].x) ** 2 + (pts[i].y - pts[0].y) ** 2;
        if (d > farD) {
          farD = d;
          farI = i;
        }
      }
      anchorSet.add(farI);
    }
  } else {
    anchorSet.add(0);
    anchorSet.add(N - 1);
    for (const c of corners) if (c > 0 && c < N - 1) anchorSet.add(c);
  }
  const anchors = Array.from(anchorSet).sort((a, b) => a - b);

  const segments: BezierSegment[] = [];
  for (let i = 0; i < anchors.length - 1; i++) {
    const a = anchors[i];
    const b = anchors[i + 1];
    if (b - a < 1) continue;
    const segs = fitArcRecursive(ext, a, b, errorThreshold, 0);
    for (const s of segs) segments.push(s);
  }

  return { segments, closed };
}

/**
 * 批量把多条折线拟合为 BezierPath[]：
 *   对每条 polyline 调用 fitBezierPath，保留原始面积 / isHole 等附加字段。
 */
export function fitBezierPaths(
  polylines: Polyline[],
  errorThreshold: number,
  cornerThreshold: number,
): BezierPath[] {
  const out: BezierPath[] = [];
  for (const poly of polylines) {
    const bp = fitBezierPath(poly, errorThreshold, cornerThreshold);
    if (poly.area !== undefined) (bp as BezierPath & { area?: number }).area = poly.area;
    out.push(bp);
  }
  return out;
}

/**
 * 翻转 BezierPath[] 的 Y 坐标：
 *   image-height 为图像高。把 (x, y) → (x, height - y)，
 *   用于把图像坐标（上=0，下=height-1）转换为标准数学坐标（下=0，上=height-1）。
 */
export function flipYBezierPaths(paths: BezierPath[], height: number): BezierPath[] {
  const flipPoint = (p: Point): Point => ({ x: p.x, y: height - p.y });
  return paths.map((path) => ({
    segments: path.segments.map((seg) => ({
      p0: flipPoint(seg.p0),
      c1: flipPoint(seg.c1),
      c2: flipPoint(seg.c2),
      p1: flipPoint(seg.p1),
    })),
    closed: path.closed,
    area: path.area,
  }));
}
