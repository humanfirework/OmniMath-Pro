/**
 * 亚像素 marching squares 等值线追踪单测。
 */
import { describe, it, expect } from 'vitest';
import type { ImageDataLike, Point } from './types';
import { toGrayscale } from './preprocess';
import { marchingSquaresIsolevel, marchingSquaresGray } from './marchingSquare';
import { signedArea } from './trace';

const BLACK = [0, 0, 0, 255] as const;
const WHITE = [255, 255, 255, 255] as const;

function makeImage(w: number, h: number): { img: ImageDataLike; set: (x: number, y: number, c: readonly number[]) => void } {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = 255;
    data[i * 4 + 1] = 255;
    data[i * 4 + 2] = 255;
    data[i * 4 + 3] = 255;
  }
  const set = (x: number, y: number, c: readonly number[]) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = (y * w + x) * 4;
    data[i] = c[0];
    data[i + 1] = c[1];
    data[i + 2] = c[2];
    data[i + 3] = c[3];
  };
  return { img: { data, width: w, height: h }, set };
}

/** 黑色圆（像素中心判定）。 */
function makeCircleImage(cx = 50, cy = 50, r = 30, size = 100): ImageDataLike {
  const { img, set } = makeImage(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= r * r) set(x, y, BLACK);
    }
  }
  return img;
}

/** 平滑楼体：左→右沿 x 线性从 0 到 255（用于子像素验证）。 */
function makeSmoothRamp(w = 64, h = 64): ImageDataLike {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = Math.floor((x * 255) / (w - 1));
      const i = (y * w + x) * 4;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return { data, width: w, height: h };
}

/** 折线总长。 */
function perimeter(p: Point[]): number {
  let len = 0;
  for (let i = 1; i < p.length; i++) len += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y);
  return len;
}

describe('marchingSquare', () => {
  it('圆：等值线追踪出闭合轮廓，面积 ≈ π·30² (±12%)', () => {
    const g = toGrayscale(makeCircleImage(50, 50, 30, 100));
    const iso = 128; // 黑白图，128 恰在 0/255 之间
    const polys = marchingSquaresIsolevel(g, 100, 100, iso);
    expect(polys.length).toBeGreaterThanOrEqual(1);
    const closed = polys.filter((p) => p.closed);
    expect(closed.length).toBeGreaterThanOrEqual(1);
    let maxArea = 0;
    for (const p of closed) {
      const a = Math.abs(signedArea(p.points, true));
      if (a > maxArea) maxArea = a;
    }
    expect(maxArea).toBeGreaterThan(2827 * 0.88);
    expect(maxArea).toBeLessThan(2827 * 1.12);
  });

  it('平滑楼体：等值线交点坐标携带亚像素（非整数）', () => {
    const g = toGrayscale(makeSmoothRamp(64, 64));
    const iso = 100; // 理论 x = 100/255*63 ≈ 24.7，非整数
    const polys = marchingSquaresIsolevel(g, 64, 64, iso);
    // 必然存在折线
    expect(polys.length).toBeGreaterThanOrEqual(1);
    let sawSubpixel = false;
    for (const p of polys) {
      for (const pt of p.points) {
        if (Math.abs(pt.x - Math.round(pt.x)) > 1e-3) sawSubpixel = true;
      }
    }
    expect(sawSubpixel).toBe(true);
    // 等值线概位于 x≈24.7 附近（垂直方向贯穿）
    const pts = polys.flatMap((p) => p.points);
    const xs = pts.map((p) => p.x);
    const meanX = xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(Math.abs(meanX - 24.7)).toBeLessThan(3);
  });

  it('marchingSquaresGray：多层级追踪，平滑后仍能覆盖对象', () => {
    const img = makeCircleImage(50, 50, 30, 100);
    const g = toGrayscale(img);
    const polys = marchingSquaresGray(g, 100, 100, { levels: 4, smoothRadius: 1 });
    expect(polys.length).toBeGreaterThanOrEqual(1);
    // 至少存在一条闭合、面积接近圆的轮廓
    const closed = polys.filter((p) => p.closed && Math.abs(signedArea(p.points, true)) > 1000);
    expect(closed.length).toBeGreaterThanOrEqual(1);
  });

  it('minPerimeter 过滤掉极短碎轮廓', () => {
    const g = toGrayscale(makeCircleImage(50, 50, 30, 100));
    const all = marchingSquaresGray(g, 100, 100, { levels: 4, smoothRadius: 1 });
    const filtered = marchingSquaresGray(g, 100, 100, {
      levels: 4,
      smoothRadius: 1,
      minPerimeter: 100,
    });
    expect(filtered.length).toBeLessThanOrEqual(all.length);
    for (const p of filtered) expect(perimeter(p.points)).toBeGreaterThanOrEqual(100);
  });
});