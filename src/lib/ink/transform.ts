import { PIXEL_CELL, type InkStroke } from './types';

export interface SelectionTransform {
  scale?: number;
  /** Rotation in radians. */
  angle?: number;
  /** Transform origin in world coordinates. */
  cx: number;
  cy: number;
}

/** Bounding-box centre of a set of strokes (selection pivot). */
export function selectionCenter(strokes: InkStroke[]): { cx: number; cy: number } {
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  for (const s of strokes) {
    for (const p of s.points) {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
      x1 = Math.min(x1, p.x);
      y1 = Math.min(y1, p.y);
      x2 = Math.max(x2, p.x);
      y2 = Math.max(y2, p.y);
    }
  }
  if (!Number.isFinite(x1)) return { cx: 0, cy: 0 };
  return { cx: (x1 + x2) / 2, cy: (y1 + y2) / 2 };
}

/**
 * Scale/rotate one stroke around a pivot.
 *
 * Uniform scaling also scales the pen width; rotation does not. Recognized
 * axis-aligned shapes (rectangle/circle) cannot represent a rotated shape, so
 * their recognition flag is cleared on rotation — they fall back to the raw
 * ink, which is the honest result.
 */
export function transformInk(stroke: InkStroke, t: SelectionTransform): InkStroke {
  const scale = t.scale ?? 1;
  const angle = t.angle ?? 0;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  const points = stroke.points.map((p) => {
    const dx = p.x - t.cx;
    const dy = p.y - t.cy;
    let x = t.cx + (dx * cos - dy * sin) * scale;
    let y = t.cy + (dx * sin + dy * cos) * scale;
    if (stroke.pixel) {
      x = Math.round(x / PIXEL_CELL) * PIXEL_CELL;
      y = Math.round(y / PIXEL_CELL) * PIXEL_CELL;
    }
    return {
      ...p,
      x,
      y,
      w: p.w === undefined ? undefined : Math.max(0.5, p.w * scale),
    };
  });

  return {
    ...stroke,
    points,
    width: Math.max(0.5, Math.min(64, stroke.width * scale)),
    recognized: angle !== 0 ? null : stroke.recognized,
  };
}

export function transformSelection(
  strokes: InkStroke[],
  ids: string[],
  t: SelectionTransform,
): InkStroke[] {
  if (ids.length === 0) return strokes;
  const idSet = new Set(ids);
  return strokes.map((s) => (idSet.has(s.id) ? transformInk(s, t) : s));
}

export function scaleSelection(
  strokes: InkStroke[],
  ids: string[],
  factor: number,
): InkStroke[] {
  if (ids.length === 0) return strokes;
  const selected = new Set(ids);
  const center = selectionCenter(strokes.filter((s) => selected.has(s.id)));
  return transformSelection(strokes, ids, {
    scale: Math.max(0.1, Math.min(10, factor)),
    cx: center.cx,
    cy: center.cy,
  });
}

export function rotateSelection(
  strokes: InkStroke[],
  ids: string[],
  degrees: number,
): InkStroke[] {
  if (ids.length === 0) return strokes;
  const selected = new Set(ids);
  const center = selectionCenter(strokes.filter((s) => selected.has(s.id)));
  return transformSelection(strokes, ids, {
    angle: (degrees * Math.PI) / 180,
    cx: center.cx,
    cy: center.cy,
  });
}
