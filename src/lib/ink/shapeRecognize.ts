/**
 * 手绘图形判定（纯几何，可单测）。
 *
 * 输入一条自由笔迹的采样点，输出它最接近的图形：圆/椭圆、矩形、三角形、
 * 直线，或 null（无法确定）。
 *
 * 误差度量：
 *   - rectErr：点到「矩形边框」的平均距离（框内取到最近边的距离）；
 *   - circErr：归一化到单位椭圆后的半径误差 |‖p̂‖ - 1|；
 *   - triErr ：点到三角形三条边的平均距离。
 * 三者量纲不同（像素 vs 比例），统一除以 `scale` 后再比较。
 *
 * 历史 bug：旧实现把矩形误差算成「到外接框的距离」，框内所有点贡献 0，
 * 于是任何闭合图形都满足 rectErr = 0，圆/椭圆经常被误判成矩形。
 */

import { classifyWithFourier } from '@/lib/vision/shapeFourier';

export type RecognizedShape = 'circle' | 'rectangle' | 'triangle' | 'line' | null;

export interface Point2D {
  x: number;
  y: number;
}

function minMax(values: number[]): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return [min, max];
}

export function pointToSegmentDist(p: Point2D, a: Point2D, b: Point2D): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function pointToTriangleDist(p: Point2D, a: Point2D, b: Point2D, c: Point2D): number {
  return Math.min(
    pointToSegmentDist(p, a, b),
    pointToSegmentDist(p, b, c),
    pointToSegmentDist(p, c, a),
  );
}

/** 到矩形边框的距离：框内→最近一条边；框外→到框的欧氏距离。 */
export function pointToRectBorderDist(
  p: Point2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): number {
  const outsideX = Math.max(x0 - p.x, 0, p.x - x1);
  const outsideY = Math.max(y0 - p.y, 0, p.y - y1);
  if (outsideX > 0 || outsideY > 0) return Math.hypot(outsideX, outsideY);
  return Math.min(p.x - x0, x1 - p.x, p.y - y0, y1 - p.y);
}

/** Heuristic shape recognition. */
export function recognizeShape(points: Point2D[]): RecognizedShape {
  if (points.length < 4) {
    return points.length === 2 ? 'line' : null;
  }
  const [x0, x1] = minMax(points.map((p) => p.x));
  const [y0, y1] = minMax(points.map((p) => p.y));
  const w = x1 - x0;
  const h = y1 - y0;
  if (w < 4 && h < 4) return null;

  const start = points[0];
  const end = points[points.length - 1];
  // 闭合判定：同时用「首尾距离 / 外接框对角」与「首尾距离 / 总周长」两个比例，
  // 任一满足即视为闭合。原先只用 closingDist < max(w,h)*0.25，对手抖画的圆
  // 过严，导致"画圆识别成线"。
  const diag = Math.hypot(w, h) || 1;
  const scale = Math.max(w, h) || 1;
  const closingDist = Math.hypot(end.x - start.x, end.y - start.y);
  let perimeter = 0;
  for (let i = 1; i < points.length; i++) {
    perimeter += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  const isClosed =
    closingDist < scale * 0.45 ||
    (perimeter > 0 && closingDist / perimeter < 0.12) ||
    closingDist < diag * 0.3;
  if (!isClosed) return 'line';

  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const rx = w / 2;
  const ry = h / 2;
  if (rx < 2 || ry < 2) return 'line';

  // 离心率（椭圆接近圆则判圆）：ecc = |rx - ry| / max(rx, ry)。
  const ecc = Math.abs(rx - ry) / Math.max(rx, ry, 1e-6);

  let rectErr = 0;
  let circErr = 0;
  let triErr = 0;
  for (const p of points) {
    rectErr += pointToRectBorderDist(p, x0, y0, x1, y1);
    const nx = (p.x - cx) / rx;
    const ny = (p.y - cy) / ry;
    circErr += Math.abs(Math.hypot(nx, ny) - 1);
    // Triangle fit: distance to the triangle (cx,y0)-(x1,y1)-(x0,y1)
    triErr += pointToTriangleDist(p, { x: cx, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 });
  }
  // 统一量纲：像素误差 / 外接框最长边；圆误差本身已是比例。
  const rectScore = rectErr / points.length / scale;
  const circScore = circErr / points.length;
  const triScore = triErr / points.length / scale;

  // 圆：三项中最小 + 半径误差低 + 离心率不高（椭圆也倾向判圆）。
  if (circScore < rectScore && circScore < triScore && circScore < 0.22 && ecc < 0.55) {
    return 'circle';
  }
  if (rectScore < circScore && rectScore < triScore && rectScore < 0.12) return 'rectangle';
  if (triScore < circScore && triScore < rectScore && triScore < 0.14) return 'triangle';

  // Fallback: Fourier descriptors (rotation/scale invariant) handle the
  // ambiguous cases the distance heuristics above cannot separate.
  const fourier = classifyWithFourier(points);
  if (fourier.confidence >= 0.55) {
    if (fourier.shape === 'ellipse') return 'circle';
    return fourier.shape;
  }
  return null;
}
