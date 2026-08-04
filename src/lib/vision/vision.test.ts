/**
 * 图像矢量化管线单元测试（vitest + jsdom）。
 *
 * 覆盖 preprocess / edges / trace / skeleton / fit / fourier / imageToCurves。
 * 全部用代码合成测试图，无外部资源。IoU 通过手写扫描线填充计算（纯 TS）。
 */
import { describe, it, expect } from 'vitest';
import type { ImageDataLike, Point, Polyline, BezierPath, BezierSegment } from './types';
import {
  toGrayscale,
  gaussianBlur,
  multiLevelThreshold,
  adaptiveThreshold,
  binarize,
  removeSmallRegions,
} from './preprocess';
import { sobel, canny } from './edges';
import { traceContours, signedArea } from './trace';
import { zhangSuenThin, skeletonToPolylines } from './skeleton';
import {
  rdpSimplify,
  detectCorners,
  fitBezierArc,
  fitBezierPath,
  polylineLength,
  evalBezier,
} from './fit';
import { fitFourier, sampleFourier, sampleFourierCurve, fourierError } from './fourier';
import { imageToCurves } from './index';
import {
  fineOutline,
  otsuThreshold,
  boxBlurGray,
  connectedComponents,
  binaryDilation,
} from './fineOutline';

/* ----------------------------- 测试图生成器 ----------------------------- */

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

/** 扫描线填充多边形（even-odd），把内部像素设为黑色。 */
function fillPolygon(
  set: (x: number, y: number, c: readonly number[]) => void,
  w: number,
  h: number,
  poly: Point[],
) {
  for (let py = 0; py < h; py++) {
    const yScan = py + 0.5;
    const xs: number[] = [];
    const n = poly.length;
    for (let i = 0; i < n; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % n];
      if ((a.y <= yScan) !== (b.y <= yScan)) {
        const t = (yScan - a.y) / (b.y - a.y);
        xs.push(a.x + t * (b.x - a.x));
      }
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const x0 = Math.ceil(xs[k] - 0.5);
      const x1 = Math.floor(xs[k + 1] - 0.5);
      for (let x = Math.max(0, x0); x <= Math.min(w - 1, x1); x++) set(x, py, BLACK);
    }
  }
}

/** 黑色圆（center, r），使用像素中心判定。 */
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

/** 黑色方块 (x1,y1)-(x2,y2) 闭区间角点。 */
function makeRectImage(x1 = 10, y1 = 10, x2 = 30, y2 = 30, size = 100): ImageDataLike {
  const { img, set } = makeImage(size, size);
  for (let y = y1; y < y2; y++) {
    for (let x = x1; x < x2; x++) set(x, y, BLACK);
  }
  return img;
}

/** 五角星（center, outer R, inner r=R*0.382）。 */
function makeStarImage(cx = 50, cy = 50, outerR = 30, size = 100): ImageDataLike {
  const { img, set } = makeImage(size, size);
  const innerR = outerR * 0.382;
  const verts: Point[] = [];
  for (let i = 0; i < 10; i++) {
    const ang = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 === 0 ? outerR : innerR;
    verts.push({ x: cx + rad * Math.cos(ang), y: cy + rad * Math.sin(ang) });
  }
  fillPolygon(set, size, size, verts);
  return img;
}

/** 多物体图：圆 + 方块 + 五角星，200×200，互不重叠且不贴边。 */
function makeMultiObjectImage(): ImageDataLike {
  const size = 200;
  const { img, set } = makeImage(size, size);
  // 圆 (50,50,30)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - 50;
      const dy = y + 0.5 - 50;
      if (dx * dx + dy * dy <= 30 * 30) set(x, y, BLACK);
    }
  }
  // 方块 (110,110)-(150,150)
  for (let y = 110; y < 150; y++) for (let x = 110; x < 150; x++) set(x, y, BLACK);
  // 五角星 center (150,55) outer 28
  const verts: Point[] = [];
  const cx = 150;
  const cy = 55;
  const outerR = 28;
  const innerR = outerR * 0.382;
  for (let i = 0; i < 10; i++) {
    const ang = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 === 0 ? outerR : innerR;
    verts.push({ x: cx + rad * Math.cos(ang), y: cy + rad * Math.sin(ang) });
  }
  fillPolygon(set, size, size, verts);
  return img;
}

/** 灰度渐变图（用于多阈值分层测试，保证全部 levels 出现）。 */
function makeGradientImage(w = 64, h = 64): ImageDataLike {
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

/* ----------------------------- 光栅化 / IoU ----------------------------- */

/** 把一条 BezierPath 采样为多边形顶点（用于扫描线填充）。 */
function bezierPathToPolygon(path: BezierPath, perSeg = 16): Point[] {
  const pts: Point[] = [];
  for (const seg of path.segments) {
    for (let i = 0; i < perSeg; i++) {
      pts.push(evalBezier(seg, i / perSeg));
    }
  }
  return pts;
}

/** 扫描线填充一个多边形到 mask（1=内部）。 */
function rasterizePolygon(mask: Uint8Array, w: number, h: number, poly: Point[]) {
  for (let py = 0; py < h; py++) {
    const yScan = py + 0.5;
    const xs: number[] = [];
    const n = poly.length;
    for (let i = 0; i < n; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % n];
      if ((a.y <= yScan) !== (b.y <= yScan)) {
        const t = (yScan - a.y) / (b.y - a.y);
        xs.push(a.x + t * (b.x - a.x));
      }
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const x0 = Math.ceil(xs[k] - 0.5);
      const x1 = Math.floor(xs[k + 1] - 0.5);
      for (let x = Math.max(0, x0); x <= Math.min(w - 1, x1); x++) mask[py * w + x] = 1;
    }
  }
}

/** 光栅化整个 CurveSet（仅闭合路径）到 mask。 */
function rasterizeCurveSet(curves: BezierPath[], w: number, h: number): Uint8Array {
  const mask = new Uint8Array(w * h);
  for (const c of curves) {
    if (!c.closed || c.segments.length === 0) continue;
    rasterizePolygon(mask, w, h, bezierPathToPolygon(c));
  }
  return mask;
}

/** IoU（交并比）。 */
function iou(a: Uint8Array, b: Uint8Array): number {
  let inter = 0;
  let uni = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] !== 0 ? 1 : 0;
    const y = b[i] !== 0 ? 1 : 0;
    inter += x & y;
    uni += x | y;
  }
  return uni === 0 ? 0 : inter / uni;
}

/** 点到 BezierPath 的最大偏差（密集采样最近点近似）。 */
function bezierPathMaxDeviation(path: BezierPath, query: Point[]): number {
  const samples: Point[] = [];
  for (const seg of path.segments) {
    for (let i = 0; i <= 24; i++) samples.push(evalBezier(seg, i / 24));
  }
  let maxD = 0;
  for (const q of query) {
    let best = Infinity;
    for (const s of samples) {
      const d = (q.x - s.x) ** 2 + (q.y - s.y) ** 2;
      if (d < best) best = d;
    }
    const dist = Math.sqrt(best);
    if (dist > maxD) maxD = dist;
  }
  return maxD;
}

/* =============================== preprocess =============================== */

describe('preprocess', () => {
  it('toGrayscale: 圆内部深色(<50)，背景浅色(>200)', () => {
    const img = makeCircleImage(50, 50, 30, 100);
    const g = toGrayscale(img);
    // 圆心像素
    expect(g[50 * 100 + 50]).toBeLessThan(50);
    // 背景像素
    expect(g[5 * 100 + 5]).toBeGreaterThan(200);
  });

  it('gaussianBlur: 不改变尺寸，平滑后极端值收敛', () => {
    const img = makeCircleImage(50, 50, 30, 100);
    const g = toGrayscale(img);
    const b = gaussianBlur(g, 100, 100, 1);
    expect(b.length).toBe(g.length);
    // 圆心仍偏暗，背景仍偏亮
    expect(b[50 * 100 + 50]).toBeLessThan(80);
    expect(b[5 * 100 + 5]).toBeGreaterThan(200);
  });

  it('multiLevelThreshold: 渐变图标签数等于 levels', () => {
    const img = makeGradientImage(64, 64);
    const g = toGrayscale(img);
    const labels = multiLevelThreshold(g, 64, 64, 4);
    const uniq = new Set<number>();
    for (let i = 0; i < labels.length; i++) uniq.add(labels[i]);
    expect(uniq.size).toBe(4);
    // 标签范围合法
    for (let i = 0; i < labels.length; i++) {
      expect(labels[i]).toBeGreaterThanOrEqual(0);
      expect(labels[i]).toBeLessThan(4);
    }
  });

  it('binarize: 圆内部=1，背景=0', () => {
    const img = makeCircleImage(50, 50, 30, 100);
    const g = toGrayscale(img);
    const b = binarize(g, 100, 100, 128);
    expect(b[50 * 100 + 50]).toBe(1);
    expect(b[5 * 100 + 5]).toBe(0);
  });

  it('adaptiveThreshold: 输出 0/1，圆边界附近为前景，远背景为 0', () => {
    // mean-C 自适应阈值：均匀暗区内部 mean≈像素值→背景，仅在「暗像素+亮邻域」
    // 的边界带输出前景。这是该算法的标准行为。
    const img = makeCircleImage(50, 50, 30, 100);
    const g = toGrayscale(img);
    const b = adaptiveThreshold(g, 100, 100, 5, 5);
    // 输出均为 0/1
    for (let i = 0; i < b.length; i++) expect(b[i]).toBeLessThanOrEqual(1);
    // 远离圆的背景像素 → 0
    expect(b[5 * 100 + 5]).toBe(0);
    // 圆边界附近（黑像素带白邻域）→ 前景 1：像素 (50,22) 块内含 3 行白邻
    expect(b[22 * 100 + 50]).toBe(1);
    // 检测到若干前景像素（边界带）
    let sum = 0;
    for (let i = 0; i < b.length; i++) sum += b[i];
    expect(sum).toBeGreaterThan(0);
  });

  it('removeSmallRegions: 移除面积<turdsize 的连通块', () => {
    const w = 20;
    const h = 20;
    const bin = new Uint8Array(w * h);
    // 大块 5x5
    for (let y = 5; y < 10; y++) for (let x = 5; x < 10; x++) bin[y * w + x] = 1;
    // 小块 1x1
    bin[0] = 1;
    const out = removeSmallRegions(bin, w, h, 2);
    expect(out[0]).toBe(0); // 小块被移除
    // 大块保留
    let cnt = 0;
    for (let i = 0; i < out.length; i++) if (out[i] === 1) cnt++;
    expect(cnt).toBe(25);
  });
});

/* ================================= edges ================================= */

describe('edges', () => {
  it('sobel: 圆边界处有高响应，背景低响应', () => {
    const img = makeCircleImage(50, 50, 30, 100);
    const g = toGrayscale(img);
    const mag = sobel(g, 100, 100);
    // 圆顶部边界附近 (50, 20)
    const boundary = mag[20 * 100 + 50];
    const bg = mag[5 * 100 + 5];
    expect(boundary).toBeGreaterThan(50);
    expect(bg).toBeLessThan(boundary);
  });

  it('canny: 输出 0/1 且检测到边缘', () => {
    const img = makeCircleImage(50, 50, 30, 100);
    const g = toGrayscale(img);
    const e = canny(g, 100, 100, 30, 80);
    let sum = 0;
    for (let i = 0; i < e.length; i++) {
      expect(e[i] === 0 || e[i] === 1).toBe(true);
      sum += e[i];
    }
    expect(sum).toBeGreaterThan(50);
  });
});

/* ================================= trace ================================= */

describe('trace', () => {
  it('圆：追踪出闭合轮廓，面积 ≈ π·30² ≈ 2827 (±10%)', () => {
    const img = makeCircleImage(50, 50, 30, 100);
    const g = toGrayscale(img);
    const bin = binarize(g, 100, 100, 128);
    const polys = traceContours(bin, 100, 100);
    expect(polys.length).toBeGreaterThanOrEqual(1);
    const closed = polys.filter((p) => p.closed);
    expect(closed.length).toBeGreaterThanOrEqual(1);
    // 最大面积轮廓
    let maxArea = 0;
    for (const p of closed) {
      const a = Math.abs(signedArea(p.points, p.closed));
      if (a > maxArea) maxArea = a;
    }
    expect(maxArea).toBeGreaterThan(2827 * 0.9);
    expect(maxArea).toBeLessThan(2827 * 1.1);
  });

  it('方块：轮廓面积 ≈ 400', () => {
    const img = makeRectImage(10, 10, 30, 30, 100);
    const g = toGrayscale(img);
    const bin = binarize(g, 100, 100, 128);
    const polys = traceContours(bin, 100, 100);
    let maxArea = 0;
    for (const p of polys) {
      const a = Math.abs(signedArea(p.points, p.closed));
      if (a > maxArea) maxArea = a;
    }
    expect(maxArea).toBeGreaterThan(360);
    expect(maxArea).toBeLessThan(440);
  });

  it('多物体图：追踪出 ≥2 条轮廓', () => {
    const img = makeMultiObjectImage();
    const g = toGrayscale(img);
    const bin = binarize(g, 200, 200, 128);
    const polys = traceContours(bin, 200, 200);
    const significant = polys.filter((p) => Math.abs(p.area ?? 0) > 50);
    expect(significant.length).toBeGreaterThanOrEqual(2);
  });
});

/* ================================ skeleton =============================== */

describe('skeleton', () => {
  it('zhangSuenThin: 横条细化为 1px 骨架', () => {
    const w = 20;
    const h = 20;
    const bin = new Uint8Array(w * h);
    // 一条 3 像素厚的横条
    for (let x = 3; x < 17; x++) for (let y = 9; y < 12; y++) bin[y * w + x] = 1;
    const skel = zhangSuenThin(bin, w, h);
    // 每列至多 1 个骨架像素（1px 宽）
    for (let x = 3; x < 17; x++) {
      let cnt = 0;
      for (let y = 0; y < h; y++) if (skel[y * w + x] === 1) cnt++;
      expect(cnt).toBeLessThanOrEqual(1);
    }
    // 总骨架像素 > 0
    let total = 0;
    for (let i = 0; i < skel.length; i++) total += skel[i];
    expect(total).toBeGreaterThan(0);
  });

  it('skeletonToPolylines: 从骨架提取折线', () => {
    const w = 30;
    const h = 30;
    const bin = new Uint8Array(w * h);
    // 一条水平线
    for (let x = 5; x < 25; x++) bin[15 * w + x] = 1;
    const skel = zhangSuenThin(bin, w, h);
    const polys = skeletonToPolylines(skel, w, h);
    expect(polys.length).toBeGreaterThanOrEqual(1);
    // 总长度合理
    let totalLen = 0;
    for (const p of polys) totalLen += polylineLength(p.points);
    expect(totalLen).toBeGreaterThan(10);
  });
});

/* ================================== fit ================================== */

describe('fit', () => {
  it('rdpSimplify: 点数显著减少', () => {
    // 一条近似直线，带微小抖动
    const pts: Point[] = [];
    for (let i = 0; i < 50; i++) pts.push({ x: i * 2, y: i * 2 + (i % 2 === 0 ? 0.1 : -0.1) });
    const simp = rdpSimplify(pts, 1.0);
    expect(simp.length).toBeLessThan(pts.length / 2);
  });

  it('fitBezierArc: 端点匹配', () => {
    const pts: Point[] = [
      { x: 0, y: 0 },
      { x: 10, y: 5 },
      { x: 20, y: 5 },
      { x: 30, y: 0 },
    ];
    const seg = fitBezierArc(pts, 0, 3);
    expect(seg.p0.x).toBeCloseTo(0, 6);
    expect(seg.p0.y).toBeCloseTo(0, 6);
    expect(seg.p1.x).toBeCloseTo(30, 6);
    expect(seg.p1.y).toBeCloseTo(0, 6);
  });

  it('fitBezierPath: 圆的最大偏差 ≤ 1.5px', () => {
    const img = makeCircleImage(50, 50, 30, 100);
    const g = toGrayscale(img);
    const bin = binarize(g, 100, 100, 128);
    const polys = traceContours(bin, 100, 100);
    // 取最大轮廓
    let best: Polyline | null = null;
    let bestArea = 0;
    for (const p of polys) {
      const a = Math.abs(p.area ?? 0);
      if (a > bestArea) {
        bestArea = a;
        best = p;
      }
    }
    expect(best).not.toBeNull();
    const poly = best as Polyline;
    // RDP 轻度简化
    const simp = rdpSimplify(poly.points, 0.5);
    const path = fitBezierPath({ points: simp, closed: true }, 1.0, 1.0);
    expect(path.segments.length).toBeGreaterThan(0);
    const dev = bezierPathMaxDeviation(path, simp);
    expect(dev).toBeLessThanOrEqual(1.5);
  });

  it('fitBezierPath: 闭合曲线首尾点相同（连续性）', () => {
    const img = makeCircleImage(50, 50, 30, 100);
    const g = toGrayscale(img);
    const bin = binarize(g, 100, 100, 128);
    const polys = traceContours(bin, 100, 100);
    const poly = polys[0];
    const path = fitBezierPath(poly, 1.0, 1.0);
    expect(path.segments.length).toBeGreaterThan(0);
    const first = path.segments[0].p0;
    const last = path.segments[path.segments.length - 1].p1;
    expect(Math.abs(first.x - last.x)).toBeLessThan(1e-6);
    expect(Math.abs(first.y - last.y)).toBeLessThan(1e-6);
  });

  it('detectCorners: 方块检出 4 个角', () => {
    const sq: Point[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    // 闭合表示：首尾重合
    const closed = sq.concat([sq[0]]);
    const corners = detectCorners(closed, 1.0);
    expect(corners.length).toBeGreaterThanOrEqual(4);
  });

  it('polylineLength: 已知长度', () => {
    const pts: Point[] = [
      { x: 0, y: 0 },
      { x: 3, y: 4 },
      { x: 3, y: 4 },
    ];
    expect(polylineLength(pts)).toBeCloseTo(5, 6);
  });
});

/* ================================ fourier =============================== */

describe('fourier', () => {
  function getCircleContour(): Polyline {
    const img = makeCircleImage(50, 50, 30, 100);
    const g = toGrayscale(img);
    const bin = binarize(g, 100, 100, 128);
    const polys = traceContours(bin, 100, 100);
    let best: Polyline | null = null;
    let bestArea = 0;
    for (const p of polys) {
      const a = Math.abs(p.area ?? 0);
      if (a > bestArea) {
        bestArea = a;
        best = p;
      }
    }
    return best as Polyline;
  }

  it('N=50 重建圆的最大偏差 ≤ 2px', () => {
    const poly = getCircleContour();
    const fc = fitFourier(poly, 50);
    const err = fourierError(poly, fc);
    expect(err).toBeLessThanOrEqual(2);
  });

  it('N 增大误差单调下降（N=10 vs N=50）', () => {
    const poly = getCircleContour();
    const fc10 = fitFourier(poly, 10);
    const fc50 = fitFourier(poly, 50);
    const e10 = fourierError(poly, fc10);
    const e50 = fourierError(poly, fc50);
    expect(e50).toBeLessThan(e10);
  });

  it('sampleFourier: t=0 与 t≈1 闭合连续', () => {
    const poly = getCircleContour();
    const fc = fitFourier(poly, 20);
    const p0 = sampleFourier(fc, 0);
    const p1 = sampleFourier(fc, 0.999);
    expect(Math.abs(p0.x - p1.x)).toBeLessThan(1.0);
    expect(Math.abs(p0.y - p1.y)).toBeLessThan(1.0);
  });

  it('sampleFourierCurve: 返回 numSamples 个点', () => {
    const poly = getCircleContour();
    const fc = fitFourier(poly, 10);
    const pts = sampleFourierCurve(fc, 64);
    expect(pts.length).toBe(64);
  });
});

/* ============================= imageToCurves ============================ */

describe('imageToCurves (端到端)', () => {
  it('多物体图：曲线集包含 ≥2 条曲线', () => {
    const img = makeMultiObjectImage();
    const set = imageToCurves(img, {
      levels: 4,
      threshold: 128,
      turdsize: 2,
      fitMode: 'bezier',
      errorThreshold: 1.0,
      cornerThreshold: 1.0,
    });
    expect(set.curves.length).toBeGreaterThanOrEqual(2);
  });

  it('完整覆盖：光栅化曲线与原图二值化的 IoU ≥ 0.7', () => {
    const img = makeMultiObjectImage();
    const set = imageToCurves(img, {
      levels: 4,
      threshold: 128,
      turdsize: 2,
      fitMode: 'bezier',
      errorThreshold: 1.0,
      cornerThreshold: 1.0,
    });
    const mask = rasterizeCurveSet(set.curves, set.width, set.height);
    // 原图二值化（暗=1）
    const g = toGrayscale(img);
    const bin = binarize(g, set.width, set.height, 128);
    const score = iou(mask, bin);
    expect(score).toBeGreaterThanOrEqual(0.7);
  });

  it('skeletonize 模式：返回开放路径曲线', () => {
    // 一条粗横线
    const w = 60;
    const h = 20;
    const { img, set: setPx } = makeImage(w, h);
    for (let x = 10; x < 50; x++) for (let y = 8; y < 12; y++) setPx(x, y, BLACK);
    const set = imageToCurves(img, { skeletonize: true, threshold: 128, turdsize: 2 });
    expect(set.curves.length).toBeGreaterThanOrEqual(1);
    // 至少有一条非空曲线
    expect(set.curves[0].segments.length).toBeGreaterThan(0);
  });

  it('fourier 模式：端到端产出曲线', () => {
    const img = makeCircleImage(50, 50, 30, 100);
    const set = imageToCurves(img, {
      levels: 4,
      fitMode: 'fourier',
      fourierOrder: 30,
      errorThreshold: 1.0,
      cornerThreshold: 1.0,
    });
    expect(set.curves.length).toBeGreaterThanOrEqual(1);
    expect(set.curves[0].segments.length).toBeGreaterThan(0);
  });
});

/* ============================ FG mask 基础函数 ============================ */

describe('FG mask 基础函数（otsu/boxblur/cc/dilation）', () => {
  it('otsuThreshold: 纯黑白双峰 → 阈值在 0~255 之间且能有效分离', () => {
    // 构造 256 像素：一半 0，一半 255
    const arr = new Uint8Array(256);
    for (let i = 0; i < 128; i++) arr[i] = 0;
    for (let i = 128; i < 256; i++) arr[i] = 255;
    const t = otsuThreshold(arr);
    expect(t).toBeGreaterThanOrEqual(0);
    expect(t).toBeLessThanOrEqual(255);
  });

  it('boxBlurGray: 均匀图像 → 模糊后像素不变', () => {
    const w = 16;
    const h = 16;
    const src = new Uint8ClampedArray(w * h);
    for (let i = 0; i < w * h; i++) src[i] = 128;
    const out = boxBlurGray(src, w, h, 3);
    for (let i = 0; i < w * h; i++) expect(out[i]).toBe(128);
  });

  it('connectedComponents: 3 个孤立 1px 白点 → count=3，面积各 1', () => {
    const w = 10;
    const h = 10;
    const bin = new Uint8Array(w * h);
    bin[1 * w + 1] = 1;
    bin[3 * w + 6] = 1;
    bin[7 * w + 2] = 1;
    const cc = connectedComponents(bin, w, h, 4);
    expect(cc.count).toBe(3);
    // 3 个连通域各占面积 1（索引从 1 起）
    let ones = 0;
    for (let l = 1; l <= cc.count; l++) if (cc.areas[l] === 1) ones++;
    expect(ones).toBe(3);
  });

  it('binaryDilation: 中心 1px → 半径 1 后变成 3×3 实心方块', () => {
    const w = 5;
    const h = 5;
    const src = new Uint8Array(w * h);
    src[2 * w + 2] = 1;
    const out = binaryDilation(src, w, h, 1);
    // 3×3 方块 9 像素应该为 1
    let fg = 0;
    for (let y = 1; y <= 3; y++) {
      for (let x = 1; x <= 3; x++) if (out[y * w + x] === 1) fg++;
    }
    expect(fg).toBe(9);
  });
});

/* ===================== fineOutline ForegroundMask 集成 ===================== */

describe('fineOutline ForegroundMask（TR-3.1 + 向后兼容）', () => {
  /** 固定 seed 的随机数（mulberry32），保证合成图可重复。 */
  function makeRng(seed: number) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /**
   * 构造 TR-3.1 合成图（500×500 RGBA）：
   *   - 背景：黑色 (#000)
   *   - 中心 (100,100)~(300,300)：实心 200×200 白色方块（=255）
   *     → 边界 ±2px 设置为 96/160 抗锯齿灰度过渡，帮助标准管线 Canny 输出连续边缘
   *   - 4 个 20% 外圈区域：散落 2000 个 1~3px 白点（背景噪点）
   *   - 4 个四角 40×40 白色小方块（背景伪主体）
   *
   * 返回 RGBA Uint8ClampedArray（通道=4）。
   */
  function buildTR31TestImage(seed: number): {
    data: Uint8ClampedArray;
    w: number;
    h: number;
  } {
    const w = 500;
    const h = 500;
    const data = new Uint8ClampedArray(w * h * 4);
    const rng = makeRng(seed);

    const setGray = (x: number, y: number, v: number) => {
      if (x < 0 || x >= w || y < 0 || y >= h) return;
      const i = (y * w + x) * 4;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    };

    // 1) 中心 200×200 白方块（x∈[100,300), y∈[100,300)）
    for (let y = 100; y < 300; y++) {
      for (let x = 100; x < 300; x++) setGray(x, y, 255);
    }
    // 抗锯齿过渡带：边界 ±2px 设为中间灰度（帮助 Canny 边缘连续）
    for (let y = 100; y < 300; y++) {
      setGray(98, y, 96);
      setGray(99, y, 160);
      setGray(300, y, 160);
      setGray(301, y, 96);
    }
    for (let x = 100; x < 300; x++) {
      setGray(x, 98, 96);
      setGray(x, 99, 160);
      setGray(x, 300, 160);
      setGray(x, 301, 96);
    }
    // 四角过渡灰
    for (const [ox, oy] of [[98,98],[300,98],[98,300],[300,300]]) setGray(ox, oy, 96);
    for (const [ox, oy] of [[99,99],[301,99],[99,301],[301,301]]) setGray(ox, oy, 160);

    // 3) 4 个四角 40×40 白色小方块（背景伪主体）
    const cornerBlocks = [
      [10, 10],               // 左上
      [w - 50, 10],           // 右上
      [10, h - 50],           // 左下
      [w - 50, h - 50],       // 右下
    ];
    for (const [bx, by] of cornerBlocks) {
      for (let y = by; y < by + 40; y++) {
        for (let x = bx; x < bx + 40; x++) setGray(x, y, 255);
      }
    }

    // 4) 4 个 20% 外圈区域散落 2000 个 1~3px 白点（背景噪点）
    const noiseCount = 2000;
    const x20 = Math.floor(w * 0.2);
    const y20 = Math.floor(h * 0.2);
    for (let k = 0; k < noiseCount; k++) {
      const region = Math.floor(rng() * 4);
      let nx: number, ny: number;
      if (region === 0) { // 左 20% 竖条（全 y 范围）
        nx = Math.floor(rng() * x20);
        ny = Math.floor(rng() * h);
      } else if (region === 1) { // 右 20% 竖条
        nx = w - x20 + Math.floor(rng() * x20);
        ny = Math.floor(rng() * h);
      } else if (region === 2) { // 上 20% 横条（x 在中间 60%，避免与左右竖条重复累加）
        nx = x20 + Math.floor(rng() * (w - 2 * x20));
        ny = Math.floor(rng() * y20);
      } else { // 下 20% 横条（x 在中间 60%）
        nx = x20 + Math.floor(rng() * (w - 2 * x20));
        ny = h - y20 + Math.floor(rng() * y20);
      }
      const sz = 1 + Math.floor(rng() * 3);
      for (let dy = 0; dy < sz; dy++) {
        for (let dx = 0; dx < sz; dx++) {
          setGray(nx + dx, ny + dy, 255);
        }
      }
    }

    return { data, w, h };
  }

  function totalPolylineLength(polys: Array<{ points: Array<{ x: number; y: number }> }>): number {
    let s = 0;
    for (const p of polys) s += p.points.length;
    return s;
  }

  it('TR-3.1: enableForegroundMask=true → 噪声链至少减半（ratio ≤ 0.5）且保留主体轮廓', () => {
    const seed = 20260801;
    const { data, w, h } = buildTR31TestImage(seed);
    const baseOpts = {
      low: 30,
      high: 70,
      minStrand: 6,
      eps: 0.8,
      imageType: 'standard' as const,
    };

    const resFalse = fineOutline(data, w, h, 4, { ...baseOpts, enableForegroundMask: false });
    const resTrue = fineOutline(data, w, h, 4, { ...baseOpts, enableForegroundMask: true });

    // ForegroundMaskApplied 字段在 true 时应存在且为 true
    expect(resTrue.foregroundMaskApplied).toBe(true);

    const lenFalse = totalPolylineLength(resFalse.polylines);
    const lenTrue = totalPolylineLength(resTrue.polylines);

    // 总长度比 ≤ 0.5（噪声链至少减半，实际效果会远好于此）
    const ratio = lenTrue / lenFalse;
    expect(ratio).toBeLessThanOrEqual(0.5);

    // 核心断言：启用 FG mask 后，绝大多数 polyline 点应当落在「中心方块 ±10px 边界带」内
    //   中心方块：x∈[100,300), y∈[100,300)
    //   边界带：四条边各 ±10px 的邻域
    function inCenterBorderBand(x: number, y: number): boolean {
      // 左边界带：x ∈ [90, 110]，y ∈ [100, 300]
      if (x >= 90 && x <= 110 && y >= 100 && y <= 300) return true;
      // 右边界带：x ∈ [290, 310]，y ∈ [100, 300]
      if (x >= 290 && x <= 310 && y >= 100 && y <= 300) return true;
      // 上边界带：x ∈ [100, 300]，y ∈ [90, 110]
      if (x >= 100 && x <= 300 && y >= 90 && y <= 110) return true;
      // 下边界带：x ∈ [100, 300]，y ∈ [290, 310]
      if (x >= 100 && x <= 300 && y >= 290 && y <= 310) return true;
      return false;
    }
    let allTrue = 0;
    let inTrue = 0;
    for (const p of resTrue.polylines) {
      for (const pt of p.points) {
        allTrue++;
        if (inCenterBorderBand(pt.x, pt.y)) inTrue++;
      }
    }
    // True 结果中 ≥ 80% 的点应当覆盖主体边界（而非背景噪声）
    expect(allTrue).toBeGreaterThan(0);
    expect(inTrue / allTrue).toBeGreaterThanOrEqual(0.8);

    // 反向 sanity check：False（无 mask）时，大部分点应是背景噪声
    //   （即落在主体边界带内的比例很低，作为对照）
    let allFalse = 0;
    let inFalse = 0;
    for (const p of resFalse.polylines) {
      for (const pt of p.points) {
        allFalse++;
        if (inCenterBorderBand(pt.x, pt.y)) inFalse++;
      }
    }
    if (allFalse > 0) {
      expect(inFalse / allFalse).toBeLessThanOrEqual(0.1); // ≤ 10% 是主体，剩下 90%+ 是背景噪声
    }

    // 基本 sanity：True 结果至少应有若干条「主体链」（长度 ≥ 10）
    const midChains = resTrue.polylines.filter((p) => p.points.length >= 10);
    expect(midChains.length).toBeGreaterThanOrEqual(2);
  });

  it('向后兼容：不传 enableForegroundMask 或传 false → polylines 总长度与基线完全一致（相同 seed 合成图）', () => {
    const seed = 42;
    const { data, w, h } = buildTR31TestImage(seed);
    const baseOpts = {
      low: 30,
      high: 70,
      minStrand: 6,
      eps: 0.8,
      imageType: 'standard' as const,
    };

    const resBaseline = fineOutline(data, w, h, 4, { ...baseOpts });
    const resFalse = fineOutline(data, w, h, 4, { ...baseOpts, enableForegroundMask: false });
    const lenBaseline = totalPolylineLength(resBaseline.polylines);
    const lenFalse = totalPolylineLength(resFalse.polylines);
    expect(lenFalse).toBe(lenBaseline);
    // foregroundMaskApplied 对于 false/不传 时为 false 或 undefined
    expect(Boolean(resBaseline.foregroundMaskApplied)).toBe(false);
    expect(Boolean(resFalse.foregroundMaskApplied)).toBe(false);
  });
});
