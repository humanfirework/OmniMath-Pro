import { PIXEL_CELL, newInkId, type InkPoint, type InkStroke } from './types';

export type EraserMode = 'partial' | 'stroke';

function pointToSegmentDist(p: InkPoint, a: InkPoint, b: InkPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** 点/线段是否落在橡皮扫过区域半径 r 内。 */
function pointHit(p: InkPoint, eraser: InkStroke, r: number): boolean {
  const pts = eraser.points;
  for (let i = 0; i < pts.length; i++) {
    if (Math.hypot(pts[i].x - p.x, pts[i].y - p.y) <= r) return true;
  }
  for (let i = 0; i < pts.length - 1; i++) {
    if (pointToSegmentDist(p, pts[i], pts[i + 1]) <= r) return true;
  }
  return false;
}

function hitStroke(stroke: InkStroke, eraser: InkStroke, r: number): boolean {
  if (stroke.pixel) {
    return stroke.points.some((p) =>
      pointHit({ x: p.x + PIXEL_CELL / 2, y: p.y + PIXEL_CELL / 2 }, eraser, r),
    );
  }
  if (stroke.shape || stroke.recognized) {
    return stroke.points.some((p) => pointHit(p, eraser, r));
  }
  return stroke.points.some((p) => pointHit(p, eraser, r));
}

/** 橡皮触点之间的最大跨度：小于该值视为「轻点」而不是拖动。 */
const TAP_SPAN = 4;

function eraserSpan(eraser: InkStroke): number {
  if (eraser.points.length <= 1) return 0;
  const first = eraser.points[0];
  let span = 0;
  for (const p of eraser.points) {
    span = Math.max(span, Math.hypot(p.x - first.x, p.y - first.y));
  }
  return span;
}

/**
 * 应用橡皮效果：
 *  - partial：沿橡皮路径切断自由笔迹；像素格逐格删除；图形整体删除。
 *  - stroke：碰到任意对象就整条删除。
 *
 * 轻点（笔尖几乎没移动）在 partial 模式下也按整笔删除处理：以前点一下
 * 只切掉半径内的几个采样点，看起来像「橡皮点不动」。
 */
export function applyEraser(
  strokes: InkStroke[],
  eraser: InkStroke,
  mode: EraserMode = 'partial',
): { next: InkStroke[]; changed: boolean } {
  const r = eraser.width / 2;
  const result: InkStroke[] = [];
  let changed = false;
  const tap = eraserSpan(eraser) < TAP_SPAN;

  for (const s of strokes) {
    if (s.style === 'eraser' || s.points.length === 0) continue;

    if (mode === 'stroke' || (tap && !s.pixel)) {
      if (hitStroke(s, eraser, r)) changed = true;
      else result.push(s);
      continue;
    }

    if (s.pixel) {
      const kept = s.points.filter(
        (p) => !pointHit({ x: p.x + PIXEL_CELL / 2, y: p.y + PIXEL_CELL / 2 }, eraser, r),
      );
      if (kept.length !== s.points.length) changed = true;
      if (kept.length) result.push({ ...s, points: kept });
      continue;
    }

    if (s.shape || s.recognized) {
      if (s.points.some((p) => pointHit(p, eraser, r))) {
        changed = true;
      } else {
        result.push(s);
      }
      continue;
    }

    const segments: InkPoint[][] = [];
    let seg: InkPoint[] = [];
    let removed = 0;
    for (const p of s.points) {
      if (pointHit(p, eraser, r)) {
        removed++;
        if (seg.length) {
          segments.push(seg);
          seg = [];
        }
      } else {
        seg.push(p);
      }
    }
    if (seg.length) segments.push(seg);
    if (removed > 0) changed = true;
    for (const pseg of segments) {
      if (pseg.length === 0) continue;
      result.push({ ...s, id: newInkId(), points: pseg });
    }
  }

  return { next: result, changed };
}
