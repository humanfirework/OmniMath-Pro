import { PIXEL_CELL, type InkBounds, type InkPoint, type InkStroke } from './types';

function boundsOf(stroke: InkStroke): InkBounds {
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  for (const p of stroke.points) {
    if (p.x < x1) x1 = p.x;
    if (p.y < y1) y1 = p.y;
    if (p.x > x2) x2 = p.x;
    if (p.y > y2) y2 = p.y;
  }
  if (!Number.isFinite(x1)) return { x1: 0, y1: 0, x2: 0, y2: 0 };
  const pad = stroke.pixel ? PIXEL_CELL : stroke.width / 2;
  return { x1: x1 - pad, y1: y1 - pad, x2: x2 + pad, y2: y2 + pad };
}

function pointToSegmentDist(p: InkPoint, a: InkPoint, b: InkPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function hitOne(stroke: InkStroke, p: InkPoint, tol: number): boolean {
  const b = boundsOf(stroke);
  if (p.x < b.x1 - tol || p.x > b.x2 + tol || p.y < b.y1 - tol || p.y > b.y2 + tol) return false;
  if (stroke.pixel || stroke.shape || stroke.recognized) return true;
  const grab = tol + stroke.width / 2;
  for (let i = 1; i < stroke.points.length; i++) {
    if (pointToSegmentDist(p, stroke.points[i - 1], stroke.points[i]) <= grab) return true;
  }
  return (
    stroke.points.length === 1 &&
    Math.hypot(p.x - stroke.points[0].x, p.y - stroke.points[0].y) <= grab
  );
}

/** 取最上层命中对象 id（数组末尾 = 后画的）。 */
export function hitTestInk(
  strokes: InkStroke[],
  p: InkPoint,
  screenTol: number,
  k: number,
): string | null {
  const tol = screenTol / Math.max(0.05, k);
  for (let i = strokes.length - 1; i >= 0; i--) {
    if (hitOne(strokes[i], p, tol)) return strokes[i].id;
  }
  return null;
}

/** 平移一条笔画（拖动/多选）。 */
export function translateInk(stroke: InkStroke, dx: number, dy: number): InkStroke {
  return {
    ...stroke,
    points: stroke.points.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy })),
  };
}
