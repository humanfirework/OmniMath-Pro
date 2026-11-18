/**
 * OmniMath — Canvas 墨迹渲染内核。
 *
 *  - 每条笔画只构建一次 Path2D 并缓存；缩放/平移只改变换矩阵。
 *  - 墨迹用「变宽轮廓多边形」一次 fill，而不是逐段 line。
 *  - 背景网格按可视范围裁剪，缩得太小时自动增大间距。
 */

import {
  PIXEL_CELL,
  type InkBackground,
  type InkBounds,
  type InkPoint,
  type InkStroke,
  type InkView,
} from './types';

export const INK_COLORS = {
  dot: 'rgba(120, 120, 120, 0.28)',
  grid: 'rgba(120, 120, 120, 0.16)',
  ruled: 'rgba(120, 120, 120, 0.18)',
};

export interface CachedInkStroke {
  source: InkStroke;
  bounds: InkBounds;
  draw: (ctx: CanvasRenderingContext2D) => void;
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

function strokeBounds(points: InkPoint[], pad: number): InkBounds {
  const [x0, x1] = minMax(points.map((p) => p.x));
  const [y0, y1] = minMax(points.map((p) => p.y));
  if (!Number.isFinite(x0)) return { x1: 0, y1: 0, x2: 0, y2: 0 };
  return { x1: x0 - pad, y1: y0 - pad, x2: x1 + pad, y2: y1 + pad };
}

/**
 * Ramer–Douglas–Peucker：只在渲染时简化，不丢原始点。
 */
export function simplifyInkPoints(points: InkPoint[], epsilon: number): InkPoint[] {
  if (points.length <= 2) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  const eps2 = epsilon * epsilon;

  while (stack.length > 0) {
    const [start, end] = stack.pop() as [number, number];
    const ax = points[start].x;
    const ay = points[start].y;
    const bx = points[end].x;
    const by = points[end].y;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let maxDist = 0;
    let index = -1;

    for (let i = start + 1; i < end; i++) {
      const px = points[i].x;
      const py = points[i].y;
      let d2: number;
      if (len2 === 0) {
        d2 = (px - ax) * (px - ax) + (py - ay) * (py - ay);
      } else {
        let t = ((px - ax) * dx + (py - ay) * dy) / len2;
        t = Math.max(0, Math.min(1, t));
        const qx = ax + t * dx;
        const qy = ay + t * dy;
        d2 = (px - qx) * (px - qx) + (py - qy) * (py - qy);
      }
      if (d2 > maxDist) {
        maxDist = d2;
        index = i;
      }
    }

    if (index >= 0 && maxDist > eps2) {
      keep[index] = 1;
      stack.push([start, index], [index, end]);
    }
  }

  const out: InkPoint[] = [];
  for (let i = 0; i < points.length; i++) {
    if (keep[i]) out.push(points[i]);
  }
  return out;
}

/** 变宽墨迹轮廓：沿中心线左右偏移，一次 fill。 */
export function buildInkOutline(points: InkPoint[], baseWidth: number): Path2D {
  const path = new Path2D();
  if (points.length === 0) return path;

  if (points.length > 64) {
    points = simplifyInkPoints(points, Math.max(0.3, baseWidth * 0.12));
  }

  if (points.length === 1) {
    const r = Math.max(0.35, (points[0].w ?? baseWidth) / 2);
    path.moveTo(points[0].x + r, points[0].y);
    path.arc(points[0].x, points[0].y, r, 0, Math.PI * 2);
    return path;
  }

  const n = points.length;
  const left: InkPoint[] = new Array(n);
  const right: InkPoint[] = new Array(n);

  for (let i = 0; i < n; i++) {
    const prev = points[i === 0 ? 0 : i - 1];
    const next = points[i === n - 1 ? n - 1 : i + 1];
    let tx = next.x - prev.x;
    let ty = next.y - prev.y;
    const len = Math.hypot(tx, ty);
    if (len < 1e-6) {
      tx = 1;
      ty = 0;
    } else {
      tx /= len;
      ty /= len;
    }
    const nx = -ty;
    const ny = tx;
    const half = Math.max(0.35, (points[i].w ?? baseWidth) / 2);
    left[i] = { x: points[i].x + nx * half, y: points[i].y + ny * half };
    right[i] = { x: points[i].x - nx * half, y: points[i].y - ny * half };
  }

  path.moveTo(left[0].x, left[0].y);
  for (let i = 1; i < n; i++) path.lineTo(left[i].x, left[i].y);
  for (let i = n - 1; i >= 0; i--) path.lineTo(right[i].x, right[i].y);
  path.closePath();

  const r0 = Math.max(0.35, (points[0].w ?? baseWidth) / 2);
  path.moveTo(points[0].x + r0, points[0].y);
  path.arc(points[0].x, points[0].y, r0, 0, Math.PI * 2);
  const r1 = Math.max(0.35, (points[n - 1].w ?? baseWidth) / 2);
  path.moveTo(points[n - 1].x + r1, points[n - 1].y);
  path.arc(points[n - 1].x, points[n - 1].y, r1, 0, Math.PI * 2);

  return path;
}

function bboxPath(points: InkPoint[]) {
  const [x0, x1] = minMax(points.map((p) => p.x));
  const [y0, y1] = minMax(points.map((p) => p.y));
  return {
    x0,
    x1,
    y0,
    y1,
    cx: (x0 + x1) / 2,
    cy: (y0 + y1) / 2,
    w: x1 - x0,
    h: y1 - y0,
  };
}

function buildRecognizedPath(stroke: InkStroke): Path2D {
  const path = new Path2D();
  const pts = stroke.points;
  if (pts.length < 2) return path;

  if (stroke.recognized === 'line') {
    path.moveTo(pts[0].x, pts[0].y);
    path.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
    return path;
  }

  const b = bboxPath(pts);
  switch (stroke.recognized) {
    case 'rectangle':
      path.rect(b.x0, b.y0, b.w, b.h);
      break;
    case 'circle':
      path.ellipse(b.cx, b.cy, Math.max(0.5, b.w / 2), Math.max(0.5, b.h / 2), 0, 0, Math.PI * 2);
      break;
    case 'triangle':
      path.moveTo(b.cx, b.y0);
      path.lineTo(b.x1, b.y1);
      path.lineTo(b.x0, b.y1);
      path.closePath();
      break;
    default:
      break;
  }
  return path;
}

function buildShapePath(stroke: InkStroke): Path2D {
  const path = new Path2D();
  const pts = stroke.points;
  if (pts.length < 2) return path;
  const a = pts[0];
  const z = pts[pts.length - 1];
  const b = bboxPath([a, z]);

  switch (stroke.shape) {
    case 'line':
      path.moveTo(a.x, a.y);
      path.lineTo(z.x, z.y);
      break;
    case 'rect':
      path.rect(b.x0, b.y0, b.w, b.h);
      break;
    case 'triangle':
      path.moveTo(b.cx, b.y0);
      path.lineTo(b.x1, b.y1);
      path.lineTo(b.x0, b.y1);
      path.closePath();
      break;
    case 'circle':
      path.ellipse(b.cx, b.cy, Math.max(0.5, b.w / 2), Math.max(0.5, b.h / 2), 0, 0, Math.PI * 2);
      break;
    default:
      break;
  }
  return path;
}

function buildPixelPath(stroke: InkStroke): Path2D {
  const path = new Path2D();
  for (const p of stroke.points) {
    path.rect(p.x, p.y, PIXEL_CELL, PIXEL_CELL);
  }
  return path;
}

function drawAxes(ctx: CanvasRenderingContext2D, stroke: InkStroke, color: string) {
  const pts = stroke.points;
  if (pts.length < 2) return;
  const a = pts[0];
  const z = pts[pts.length - 1];
  const { x0, x1, y0, y1, cx, cy, w, h } = bboxPath([a, z]);
  const tick = 6;
  const ticks = [-0.5, -0.25, 0, 0.25, 0.5];

  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(0.5, stroke.width);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.beginPath();
  ctx.moveTo(x0, cy);
  ctx.lineTo(x1, cy);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x1, cy);
  ctx.lineTo(x1 - 8, cy - 4);
  ctx.lineTo(x1 - 8, cy + 4);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(cx, y1);
  ctx.lineTo(cx, y0);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx, y0);
  ctx.lineTo(cx - 4, y0 + 8);
  ctx.lineTo(cx + 4, y0 + 8);
  ctx.closePath();
  ctx.fill();

  for (const u of ticks) {
    ctx.beginPath();
    ctx.moveTo(cx + u * w, cy - tick);
    ctx.lineTo(cx + u * w, cy + tick);
    ctx.moveTo(cx - tick, cy - u * h);
    ctx.lineTo(cx + tick, cy - u * h);
    ctx.stroke();
  }
}

/** 构建一条笔画的缓存绘制器。 */
export function buildCachedStroke(stroke: InkStroke, background: string): CachedInkStroke {
  const color = stroke.style === 'eraser' ? background : stroke.color;
  const pts = stroke.points;

  if (stroke.pixel) {
    const path = buildPixelPath(stroke);
    return {
      source: stroke,
      bounds: strokeBounds(pts, PIXEL_CELL),
      draw(ctx) {
        ctx.fillStyle = color;
        ctx.fill(path);
      },
    };
  }

  if (stroke.shape) {
    if (stroke.shape === 'axes') {
      return {
        source: stroke,
        bounds: strokeBounds(pts, 12),
        draw(ctx) {
          drawAxes(ctx, stroke, color);
        },
      };
    }
    const path = buildShapePath(stroke);
    return {
      source: stroke,
      bounds: strokeBounds(pts, Math.max(2, stroke.width)),
      draw(ctx) {
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.13;
        ctx.fill(path);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(0.5, stroke.width);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke(path);
      },
    };
  }

  if (stroke.recognized) {
    const path = buildRecognizedPath(stroke);
    const isLine = stroke.recognized === 'line';
    return {
      source: stroke,
      bounds: strokeBounds(pts, Math.max(2, stroke.width)),
      draw(ctx) {
        if (!isLine) {
          ctx.fillStyle = color;
          ctx.globalAlpha = 0.13;
          ctx.fill(path);
          ctx.globalAlpha = 1;
        }
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(0.5, stroke.width);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke(path);
      },
    };
  }

  const maxWidth = pts.reduce((m, p) => Math.max(m, p.w ?? stroke.width), stroke.width);
  const path = buildInkOutline(pts, stroke.width);
  return {
    source: stroke,
    bounds: strokeBounds(pts, maxWidth / 2 + 1),
    draw(ctx) {
      ctx.fillStyle = color;
      ctx.fill(path);
    },
  };
}

/**
 * 绘制背景网格。调用前必须已经设置好世界变换。
 */
export function drawGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  view: InkView,
  background: InkBackground,
  pixelMode: boolean,
): void {
  if (background === 'blank' && !pixelMode) return;

  const x0 = -view.x / view.k;
  const y0 = -view.y / view.k;
  const x1 = (width - view.x) / view.k;
  const y1 = (height - view.y) / view.k;

  const drawPattern = (id: Exclude<InkBackground, 'blank'>, base: number, rowsOnly = false) => {
    let spacing = base;
    while (spacing * view.k < 8) spacing *= 5;
    const cols = Math.ceil((x1 - x0) / spacing) + 2;
    const rows = Math.ceil((y1 - y0) / spacing) + 2;
    if (cols * rows > 40000) return;

    const startX = Math.floor(x0 / spacing) * spacing;
    const startY = Math.floor(y0 / spacing) * spacing;
    ctx.lineWidth = 1 / view.k;
    ctx.strokeStyle = id === 'ruled' ? INK_COLORS.ruled : INK_COLORS.grid;
    ctx.fillStyle = INK_COLORS.dot;

    if (id === 'dot') {
      const r = 1.5 / view.k;
      for (let y = startY; y <= y1; y += spacing) {
        for (let x = startX; x <= x1; x += spacing) {
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      return;
    }

    ctx.beginPath();
    if (!rowsOnly) {
      for (let x = startX; x <= x1; x += spacing) {
        ctx.moveTo(x, y0);
        ctx.lineTo(x, y1);
      }
    }
    for (let y = startY; y <= y1; y += spacing) {
      ctx.moveTo(x0, y);
      ctx.lineTo(x1, y);
    }
    ctx.stroke();
  };

  if (pixelMode) {
    drawPattern('grid', PIXEL_CELL);
  } else if (background !== 'blank') {
    drawPattern(background, background === 'ruled' ? 24 : 20, background === 'ruled');
  }
}

/** 选中框：虚线保持恒定屏幕宽度（1.5px），不随缩放变粗。 */
export function drawSelectionRect(
  ctx: CanvasRenderingContext2D,
  bounds: InkBounds,
  viewK: number,
  color: string,
): void {
  const pad = 4 / viewK;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5 / viewK;
  ctx.setLineDash([5 / viewK, 3 / viewK]);
  ctx.strokeRect(
    bounds.x1 - pad,
    bounds.y1 - pad,
    Math.max(1 / viewK, bounds.x2 - bounds.x1) + pad * 2,
    Math.max(1 / viewK, bounds.y2 - bounds.y1) + pad * 2,
  );
  ctx.restore();
}

/**
 * 射线法判断点是否在多边形内（套圈选择用）。
 */
export function pointInPolygon(
  p: { x: number; y: number },
  polygon: Array<{ x: number; y: number }>,
): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersect =
      yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi || 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}
