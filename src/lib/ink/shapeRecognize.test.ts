import { describe, expect, it } from 'vitest';
import {
  pointToRectBorderDist,
  recognizeShape,
  type Point2D,
} from './shapeRecognize';

/** 采样椭圆（闭合，首尾同点）。 */
function ellipse(rx: number, ry: number, n = 64, cx = 100, cy = 100): Point2D[] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return { x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry };
  });
}

/** 采样矩形边框（每边 16 个点，闭合）。 */
function rect(w: number, h: number, x0 = 0, y0 = 0, perSide = 16): Point2D[] {
  const pts: Point2D[] = [];
  const x1 = x0 + w;
  const y1 = y0 + h;
  for (let i = 0; i <= perSide; i++) pts.push({ x: x0 + (w * i) / perSide, y: y0 });
  for (let i = 1; i <= perSide; i++) pts.push({ x: x1, y: y0 + (h * i) / perSide });
  for (let i = 1; i <= perSide; i++) pts.push({ x: x1 - (w * i) / perSide, y: y1 });
  for (let i = 1; i <= perSide; i++) pts.push({ x: x0, y: y1 - (h * i) / perSide });
  return pts;
}

/** 采样 (cx,y0)-(x1,y1)-(x0,y1) 三角形边框。 */
function triangle(size = 100): Point2D[] {
  const a = { x: size / 2, y: 0 };
  const b = { x: size, y: size };
  const c = { x: 0, y: size };
  const pts: Point2D[] = [];
  const edge = (p: Point2D, q: Point2D) => {
    for (let i = 0; i < 16; i++) {
      pts.push({ x: p.x + ((q.x - p.x) * i) / 16, y: p.y + ((q.y - p.y) * i) / 16 });
    }
  };
  edge(a, b);
  edge(b, c);
  edge(c, a);
  pts.push({ ...a });
  return pts;
}

describe('recognizeShape', () => {
  it('classifies a hand-drawn ellipse as a circle', () => {
    expect(recognizeShape(ellipse(80, 72))).toBe('circle');
    expect(recognizeShape(ellipse(60, 60))).toBe('circle');
  });

  it('classifies a square as a rectangle (not a circle)', () => {
    // 回归：旧实现把「到外接框的距离」当矩形误差，框内点贡献 0，
    // 导致正方形/圆都被判成 rectangle。
    expect(recognizeShape(rect(120, 120))).toBe('rectangle');
  });

  it('classifies wide rectangles as rectangles', () => {
    expect(recognizeShape(rect(160, 60))).toBe('rectangle');
  });

  it('classifies a triangle as a triangle', () => {
    expect(recognizeShape(triangle(100))).toBe('triangle');
  });

  it('treats an open stroke as a line', () => {
    const pts: Point2D[] = Array.from({ length: 12 }, (_, i) => ({ x: i * 10, y: i * 2 }));
    expect(recognizeShape(pts)).toBe('line');
  });

  it('keeps a curved open stroke as freehand instead of flattening it', () => {
    // 回归：任何不闭合的笔迹都曾被判成 line，白板上写字母 / 画正弦曲线
    // 会整条被拉直。明显的弯曲必须返回 null（保留原始笔迹）。
    const sine: Point2D[] = Array.from({ length: 80 }, (_, i) => ({
      x: i * 4,
      y: Math.sin(i / 8) * 60,
    }));
    expect(recognizeShape(sine)).toBeNull();

    const arc: Point2D[] = Array.from({ length: 40 }, (_, i) => {
      const a = (i / 39) * Math.PI;
      return { x: Math.cos(a) * 80, y: Math.sin(a) * 80 };
    });
    expect(recognizeShape(arc)).toBeNull();
  });

  it('returns null for too-small or too-few points', () => {
    expect(recognizeShape([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBe('line');
    expect(recognizeShape([{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 0 }])).toBeNull();
    expect(
      recognizeShape([
        { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }, { x: 0, y: 0 },
      ]),
    ).toBeNull();
  });
});

describe('pointToRectBorderDist', () => {
  it('measures distance to the nearest edge for interior points', () => {
    expect(pointToRectBorderDist({ x: 50, y: 10 }, 0, 0, 100, 100)).toBe(10);
    expect(pointToRectBorderDist({ x: 50, y: 50 }, 0, 0, 100, 100)).toBe(50);
  });

  it('measures euclidean distance for exterior points', () => {
    expect(pointToRectBorderDist({ x: 110, y: 50 }, 0, 0, 100, 100)).toBe(10);
    expect(pointToRectBorderDist({ x: 103, y: 104 }, 0, 0, 100, 100)).toBeCloseTo(5);
  });
});
