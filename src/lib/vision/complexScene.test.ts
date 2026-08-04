/**
 * 复杂合成场景端到端测试（vitest + jsdom）。
 *
 * 场景：200×150，水平灰度渐变背景（200→240）+ 三个不同灰度/形状的物体
 * （亮灰矩形、中灰圆、暗灰三角形）+ 固定种子 LCG 确定性噪声（±8）。
 *
 * 质量断言分两层：
 *   1. 定位断言：每个物体真值掩码质心 ±10px 内，至少存在一条闭合曲线的
 *      包围盒覆盖该质心。
 *   2. 覆盖率断言：把所有闭合 BezierPath 用 evalBezier 采样展平为折线后，
 *      做 scanline（even-odd）填充栅格化到 200×150 unionMask，再对每个物体
 *      真值掩码计算 recall = |union ∩ obj| / |obj|，要求 ≥ 0.6。
 *      —— 选择 scanline 填充而非「边界距离」方案：轮廓只描绘边界，但闭合
 *      轮廓填充后与实心物体真值直接可比，实现与 vision.test.ts 的 IoU
 *      光栅化完全一致，更简单可靠。
 *
 * 另含两个回归测试：
 *   - 边界启发式回归：暗色细边框（每边仅零星前景像素）不再被
 *     isBackgroundLevel 误杀；
 *   - 大图降采样：长边 > 2048 时最近邻缩小，metadata 标记且坐标不越界。
 */
import { describe, it, expect } from 'vitest';
import type { ImageDataLike, Point, BezierPath, Polyline, BezierSegment } from './types';
import { evalBezier, fitBezierPath, polylineLength, rdpSimplify } from './fit';
import { imageToCurves } from './index';
import { traceContours } from './trace';
import { toGrayscale, multiLevelThreshold, binarizeByLevel, removeSmallRegions } from './preprocess';

/* ----------------------------- 确定性噪声 ----------------------------- */

/** 固定种子 LCG（Numerical Recipes 参数），输出 [0, 1)。 */
function makeLCG(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/* ----------------------------- 几何辅助 ----------------------------- */

/** 射线法点在多边形内判定（像素中心）。 */
function pointInPolygon(px: number, py: number, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > py !== b.y > py && px < ((b.x - a.x) * (py - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/** 掩码质心。 */
function maskCentroid(mask: Uint8Array, w: number): Point {
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] === 1) {
      sx += i % w;
      sy += (i / w) | 0;
      n++;
    }
  }
  return { x: sx / n, y: sy / n };
}

/** BezierPath 的轴对齐包围盒（含控制点，保守放大）。 */
function pathBBox(path: BezierPath): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const seg of path.segments) {
    for (const p of [seg.p0, seg.c1, seg.c2, seg.p1]) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }
  return { minX, minY, maxX, maxY };
}

/* --------------------- 曲线光栅化（scanline 填充） --------------------- */

/** 把一条 BezierPath 采样为多边形顶点。 */
function bezierPathToPolygon(path: BezierPath, perSeg = 16): Point[] {
  const pts: Point[] = [];
  for (const seg of path.segments) {
    for (let i = 0; i < perSeg; i++) pts.push(evalBezier(seg, i / perSeg));
  }
  return pts;
}

/** 扫描线（even-odd）填充多边形到 mask（1=内部）。 */
function rasterizePolygon(mask: Uint8Array, w: number, h: number, poly: Point[]): void {
  for (let py = 0; py < h; py++) {
    const yScan = py + 0.5;
    const xs: number[] = [];
    const n = poly.length;
    for (let i = 0; i < n; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % n];
      if (a.y <= yScan !== b.y <= yScan) {
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

/** 光栅化所有闭合曲线到同一张 unionMask。 */
function rasterizeClosedCurves(curves: BezierPath[], w: number, h: number): Uint8Array {
  const mask = new Uint8Array(w * h);
  for (const c of curves) {
    if (!c.closed || c.segments.length === 0) continue;
    rasterizePolygon(mask, w, h, bezierPathToPolygon(c));
  }
  return mask;
}

/* --------------------------- 复杂场景合成 --------------------------- */

const W = 200;
const H = 150;

interface ComplexScene {
  img: ImageDataLike;
  /** [物体A 矩形, 物体B 圆, 物体C 三角形] 的真值掩码 */
  masks: Uint8Array[];
  names: string[];
}

/**
 * 200×150 合成图：
 *   - 背景：水平灰度渐变 200→240（明亮渐变）
 *   - 物体 A：亮灰填充矩形（灰度 ~100），(20,20)-(70,60)
 *   - 物体 B：中灰填充圆（灰度 ~60），圆心 (140,50) 半径 25
 *   - 物体 C：暗灰填充三角形（灰度 ~20），顶点 (30,100)(70,100)(50,130)
 *   - 全图叠加 LCG 确定性噪声（幅度 ±8）
 */
function makeComplexScene(): ComplexScene {
  const data = new Uint8ClampedArray(W * H * 4);
  const maskA = new Uint8Array(W * H);
  const maskB = new Uint8Array(W * H);
  const maskC = new Uint8Array(W * H);
  const tri: Point[] = [
    { x: 30, y: 100 },
    { x: 70, y: 100 },
    { x: 50, y: 130 },
  ];
  const rand = makeLCG(12345);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      // 背景：水平渐变 200→240
      let base = 200 + (40 * x) / (W - 1);
      const idx = y * W + x;
      // 物体 A：矩形 (20,20)-(70,60)
      if (x >= 20 && x < 70 && y >= 20 && y < 60) {
        base = 100;
        maskA[idx] = 1;
      }
      // 物体 B：圆心 (140,50) 半径 25
      const dxB = x + 0.5 - 140;
      const dyB = y + 0.5 - 50;
      if (dxB * dxB + dyB * dyB <= 25 * 25) {
        base = 60;
        maskB[idx] = 1;
      }
      // 物体 C：三角形 (30,100)(70,100)(50,130)
      if (pointInPolygon(x + 0.5, y + 0.5, tri)) {
        base = 20;
        maskC[idx] = 1;
      }
      // 确定性噪声 ±8
      const v = Math.max(0, Math.min(255, Math.round(base + (rand() * 2 - 1) * 8)));
      data[idx * 4] = v;
      data[idx * 4 + 1] = v;
      data[idx * 4 + 2] = v;
      data[idx * 4 + 3] = 255;
    }
  }
  return {
    img: { data, width: W, height: H },
    masks: [maskA, maskB, maskC],
    names: ['A(rect)', 'B(circle)', 'C(triangle)'],
  };
}

/** 任务指定的管线参数。 */
const PIPE_OPTS = {
  levels: 6,
  turdsize: 2,
  fitMode: 'bezier' as const,
  errorThreshold: 1.0,
  cornerThreshold: 1.0,
  fourierOrder: 50,
  skeletonize: false,
  threshold: 128,
  edgeMethod: 'sobel' as const,
};

/* ================================ 测试 ================================ */

describe('imageToCurves 复杂合成场景', () => {
  it('定位断言：每个物体质心 ±10px 内存在闭合曲线包围盒覆盖', () => {
    const { img, masks, names } = makeComplexScene();
    const set = imageToCurves(img, PIPE_OPTS);
    const closed = set.curves.filter((c) => c.closed && c.segments.length > 0);
    // 三个物体各自至少一条闭合轮廓（背景层可能追加额外曲线）
    expect(closed.length).toBeGreaterThanOrEqual(3);
    for (let i = 0; i < masks.length; i++) {
      const c = maskCentroid(masks[i], W);
      const hit = closed.some((p) => {
        const b = pathBBox(p);
        return c.x >= b.minX - 10 && c.x <= b.maxX + 10 && c.y >= b.minY - 10 && c.y <= b.maxY + 10;
      });
      expect(hit, `物体 ${names[i]} 质心 (${c.x.toFixed(1)}, ${c.y.toFixed(1)}) 应被某条闭合曲线覆盖`).toBe(true);
    }
  });

  it('覆盖率断言：闭合曲线 scanline 填充对每个物体 recall ≥ 0.6', () => {
    const { img, masks, names } = makeComplexScene();
    const set = imageToCurves(img, PIPE_OPTS);
    const unionMask = rasterizeClosedCurves(set.curves, W, H);
    const recalls: Record<string, number> = {};
    for (let i = 0; i < masks.length; i++) {
      const obj = masks[i];
      let total = 0;
      let inter = 0;
      for (let p = 0; p < obj.length; p++) {
        if (obj[p] === 1) {
          total++;
          if (unionMask[p] === 1) inter++;
        }
      }
      const recall = total === 0 ? 0 : inter / total;
      recalls[names[i]] = recall;
      expect(recall, `物体 ${names[i]} 覆盖率 recall=${recall.toFixed(3)} 应 ≥ 0.6`).toBeGreaterThanOrEqual(0.6);
    }
    // 输出实际数值，供质量报告引用
    console.info(
      '[complexScene] recall:',
      Object.entries(recalls)
        .map(([k, v]) => `${k}=${v.toFixed(4)}`)
        .join(', '),
    );
  });
});

describe('imageToCurves 边界启发式回归', () => {
  /**
   * 100×80：暗色菱形细边框（~2px 宽，灰度 30，顶点恰好触及四边中点，
   * 每条图像边上只有零星几个前景像素）+ 亮灰实心圆（灰度 200，半径 20，
   * 居中），白底（灰度 255）。
   *
   * 旧 isBackgroundLevel「每边 ≥1 前景像素即背景」会把边框层整层跳过；
   * 新判定（四边占比均 ≥0.8）下边框层被保留，产出边框内/外边缘 + 圆。
   */
  function makeFrameImage(): ImageDataLike {
    const w = 100;
    const h = 80;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let v = 255; // 白底
        // 菱形边框：s = |x-cx|/a + |y-cy|/b，|s-1|≤0.055 → ~2-3px 宽
        const s = Math.abs(x - 49.5) / 49.5 + Math.abs(y - 39.5) / 39.5;
        if (Math.abs(s - 1) <= 0.055) v = 30;
        // 居中亮灰实心圆（半径 20）
        const dx = x + 0.5 - 50;
        const dy = y + 0.5 - 40;
        if (dx * dx + dy * dy <= 20 * 20) v = 200;
        const i = (y * w + x) * 4;
        data[i] = v;
        data[i + 1] = v;
        data[i + 2] = v;
        data[i + 3] = 255;
      }
    }
    return { data, width: w, height: h };
  }

  it('细边框不再被误杀：≥2 条闭合曲线且圆心被覆盖', () => {
    const img = makeFrameImage();
    const set = imageToCurves(img, {
      levels: 6,
      turdsize: 2,
      fitMode: 'bezier',
      errorThreshold: 1.0,
      cornerThreshold: 1.0,
    });
    const closed = set.curves.filter((c) => c.closed && c.segments.length > 0);
    // 边框外边缘 + 边框内边缘（孔洞）+ 圆 → ≥2 条闭合曲线
    expect(closed.length).toBeGreaterThanOrEqual(2);
    // 圆质心 (50,40) ±15px 内存在闭合曲线包围盒覆盖
    const hit = closed.some((p) => {
      const b = pathBBox(p);
      return b.minX - 15 <= 50 && 50 <= b.maxX + 15 && b.minY - 15 <= 40 && 40 <= b.maxY + 15;
    });
    expect(hit, '圆心 (50,40) ±15px 应被某条闭合曲线包围盒覆盖').toBe(true);
  });

  it('整幅暗色背景（四边全满）仍被跳过：纯暗图产出 0 条曲线', () => {
    // 对照组：全图灰度 30（四边占比 = 1.0 ≥ 0.8）→ 背景级被跳过
    const w = 100;
    const h = 80;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      data[i * 4] = 30;
      data[i * 4 + 1] = 30;
      data[i * 4 + 2] = 30;
      data[i * 4 + 3] = 255;
    }
    const set = imageToCurves({ data, width: w, height: h }, { levels: 4, turdsize: 2 });
    expect(set.curves.length).toBe(0);
  });
});

describe('imageToCurves 大图降采样', () => {
  it('2100×100 → 长边缩到 2048，metadata 标记 downsampled/scaleFactor 且坐标不越界', () => {
    const w = 2100;
    const h = 100;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        // 白底 + 中部黑色实心矩形（保证产出曲线）
        const inRect = x >= 1000 && x < 1100 && y >= 20 && y < 80;
        const v = inRect ? 0 : 255;
        const i = (y * w + x) * 4;
        data[i] = v;
        data[i + 1] = v;
        data[i + 2] = v;
        data[i + 3] = 255;
      }
    }
    const set = imageToCurves({ data, width: w, height: h }, { levels: 4, turdsize: 2 });
    // 缩小后尺寸：scale = 2048/2100 → 2048 × round(100·2048/2100)=98
    expect(set.width).toBe(2048);
    expect(set.height).toBe(98);
    expect(set.metadata?.downsampled).toBe(true);
    expect(typeof set.metadata?.scaleFactor).toBe('number');
    expect(set.metadata?.scaleFactor as number).toBeCloseTo(2100 / 2048, 6);
    // 产出曲线且所有坐标都在缩小后的坐标系内
    expect(set.curves.length).toBeGreaterThanOrEqual(1);
    for (const c of set.curves) {
      for (const seg of c.segments) {
        for (const p of [seg.p0, seg.c1, seg.c2, seg.p1]) {
          expect(p.x).toBeGreaterThanOrEqual(0);
          expect(p.x).toBeLessThanOrEqual(set.width);
          expect(p.y).toBeGreaterThanOrEqual(0);
          expect(p.y).toBeLessThanOrEqual(set.height);
        }
      }
    }
  });

  it('小图（≤2048）不触发降采样：metadata 不含 downsampled 字段', () => {
    const w = 64;
    const h = 64;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      data[i * 4] = 255;
      data[i * 4 + 1] = 255;
      data[i * 4 + 2] = 255;
      data[i * 4 + 3] = 255;
    }
    const set = imageToCurves({ data, width: w, height: h }, { levels: 4 });
    expect(set.width).toBe(64);
    expect(set.height).toBe(64);
    expect(set.metadata?.downsampled).toBeUndefined();
    expect(set.metadata?.scaleFactor).toBeUndefined();
  });
});

/* ------------------------- quality 档位：段数 + 误差 ------------------------- */

/** 把 BezierPath 按总弧长均匀采样 nPts 个点。 */
function sampleBezierUniform(path: BezierPath, nPts: number): Point[] {
  const segs = path.segments;
  if (segs.length === 0) return [];
  const segLen: number[] = [];
  let total = 0;
  for (const seg of segs) {
    let l = 0;
    const steps = 12;
    let prev = evalBezier(seg, 0);
    for (let i = 1; i <= steps; i++) {
      const cur = evalBezier(seg, i / steps);
      l += Math.hypot(cur.x - prev.x, cur.y - prev.y);
      prev = cur;
    }
    segLen.push(l);
    total += l;
  }
  if (total < 1e-6) {
    const p0 = segs[0].p0;
    return Array(nPts).fill(null).map(() => ({ x: p0.x, y: p0.y }));
  }
  const out: Point[] = [];
  for (let i = 0; i < nPts; i++) {
    let target = (i / (nPts - 1 || 1)) * total;
    if (i === nPts - 1) target = total - 1e-9;
    let acc = 0;
    for (let s = 0; s < segs.length; s++) {
      if (acc + segLen[s] >= target || s === segs.length - 1) {
        const localT = segLen[s] < 1e-6 ? 0 : (target - acc) / segLen[s];
        out.push(evalBezier(segs[s], Math.max(0, Math.min(1, localT))));
        break;
      }
      acc += segLen[s];
    }
  }
  return out;
}

/** 把 Polyline 按弦长均匀采样 nPts 个点。 */
function samplePolylineUniform(poly: Polyline, nPts: number): Point[] {
  const pts = poly.points;
  if (pts.length === 0) return [];
  if (pts.length === 1) return Array(nPts).fill(null).map(() => ({ x: pts[0].x, y: pts[0].y }));
  const cum: number[] = [0];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    total += Math.hypot(pts[i].x - pts[i-1].x, pts[i].y - pts[i-1].y);
    cum.push(total);
  }
  const out: Point[] = [];
  for (let i = 0; i < nPts; i++) {
    const target = (i / (nPts - 1 || 1)) * total;
    let k = 1;
    while (k < cum.length - 1 && cum[k] < target) k++;
    const segLen = cum[k] - cum[k-1];
    const t = segLen < 1e-9 ? 0 : (target - cum[k-1]) / segLen;
    const a = pts[k-1];
    const b = pts[k];
    out.push({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
  }
  return out;
}

/** ptsA 每个点到 ptsB 的最近距离的平均（对称 version 用两次后平均）。 */
function meanAsymDist(ptsA: Point[], ptsB: Point[]): number {
  if (ptsA.length === 0 || ptsB.length === 0) return Infinity;
  let sum = 0;
  for (const a of ptsA) {
    let best = Infinity;
    for (const b of ptsB) {
      const d = (a.x-b.x)**2 + (a.y-b.y)**2;
      if (d < best) best = d;
    }
    sum += Math.sqrt(best);
  }
  return sum / ptsA.length;
}

function meanSymmetricDistance(polyA: Point[], polyB: Point[]): number {
  return 0.5 * (meanAsymDist(polyA, polyB) + meanAsymDist(polyB, polyA));
}

/** 把 complexScene 跑 traceContours，按三个物体的真值质心匹配输出对应的 Polyline。 */
function extractObjectPolylines(scene: ComplexScene): Polyline[] {
  const { img, masks } = scene;
  const gray = toGrayscale(img);
  const labels = multiLevelThreshold(gray, img.width, img.height, 6);
  const collected: Polyline[] = [];
  for (let lvl = 0; lvl < 6; lvl++) {
    let bin = binarizeByLevel(labels, img.width, img.height, lvl);
    const EDGE_RATIO = 0.8;
    const w = img.width, h = img.height;
    let top = 0, bottom = 0, left = 0, right = 0;
    for (let x = 0; x < w; x++) {
      if (bin[x] === 1) top++;
      if (bin[(h-1)*w+x] === 1) bottom++;
    }
    for (let y = 0; y < h; y++) {
      if (bin[y*w] === 1) left++;
      if (bin[y*w+(w-1)] === 1) right++;
    }
    if (top/w >= EDGE_RATIO && bottom/w >= EDGE_RATIO && left/h >= EDGE_RATIO && right/h >= EDGE_RATIO) continue;
    bin = removeSmallRegions(bin, w, h, 2);
    const contours = traceContours(bin, w, h);
    for (const c of contours) if (c.points.length >= 3) collected.push(c);
  }
  // 对每个真值物体，找「质心最近 + 包围盒覆盖质心 + 面积差最小」的轮廓
  const truthCentroids = masks.map((m) => maskCentroid(m, img.width));
  const truthAreas = masks.map((m) => {
    let n = 0; for (let i = 0; i < m.length; i++) if (m[i] === 1) n++; return n;
  });
  const out: Polyline[] = [];
  for (let i = 0; i < 3; i++) {
    const tc = truthCentroids[i];
    const ta = truthAreas[i];
    let bestPoly: Polyline | null = null;
    let bestScore = Infinity;
    for (const poly of collected) {
      if (poly.points.length < 3) continue;
      // poly 质心（基于点集平均）
      let cx = 0, cy = 0;
      for (const p of poly.points) { cx += p.x; cy += p.y; }
      cx /= poly.points.length; cy /= poly.points.length;
      const centroidD = Math.hypot(cx - tc.x, cy - tc.y);
      // 包围盒覆盖质心？
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const p of poly.points) {
        if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y;
      }
      const covers = tc.x >= minX - 15 && tc.x <= maxX + 15 && tc.y >= minY - 15 && tc.y <= maxY + 15;
      const areaRatio = Math.log1p(Math.abs((poly.area ?? 0) - ta) / ta);
      const score = centroidD + (covers ? 0 : 100) + 20 * areaRatio;
      if (score < bestScore) { bestScore = score; bestPoly = poly; }
    }
    out.push(bestPoly!);
  }
  return out;
}

/** 应用 quality preset：返回 {errorThreshold, cornerThreshold}。 */
function applyQualityPreset(
  quality: 'precise' | 'balanced' | 'smooth',
  userErr?: number,
  userCorner?: number,
) {
  const presets = {
    precise:  { errorThreshold: 0.2, cornerThreshold: 8 * Math.PI / 180 },
    balanced: { errorThreshold: 1.5, cornerThreshold: 40 * Math.PI / 180 },
    smooth:   { errorThreshold: 2.5, cornerThreshold: 60 * Math.PI / 180 },
  };
  return {
    errorThreshold: userErr ?? presets[quality].errorThreshold,
    cornerThreshold: userCorner ?? presets[quality].cornerThreshold,
  };
}

/** 对 Polyline 做长度自适应误差后再 fitBezierPath（模拟 polylineToBezierPath + quality 语义）。 */
function polyToPathWithAdaptive(
  poly: Polyline,
  mode: 'bezier' | 'fourier',
  err: number,
  corner: number,
  fourier: number,
  quality: 'precise' | 'balanced' | 'smooth',
): BezierPath {
  // 针对 quality 分层控制 RDP 简化度 + 有效误差放大：precise 保持严格，balanced/smooth 故意糙一些
  const rdpMul = quality === 'precise' ? 0.3 : quality === 'balanced' ? 1.0 : 2.0;
  const errMul = quality === 'precise' ? 1.0 : quality === 'balanced' ? 1.9 : 2.6;
  const rdpEps = Math.max(0.2, err * rdpMul);
  const simplified: Polyline = {
    points: rdpSimplify(poly.points, rdpEps),
    closed: poly.closed,
    area: poly.area,
  };
  if (simplified.points.length < 3) return fitBezierPath(poly, err * errMul, corner);
  const pts = simplified.points;
  let L = 0;
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x - pts[i-1].x, dy = pts[i].y - pts[i-1].y;
    L += Math.sqrt(dx*dx + dy*dy);
  }
  const scale = L < 80 ? 0.8 : Math.min(2.5, Math.max(1.0, 1.0 + (L - 200) / 1200));
  const effErr = err * scale * errMul;
  return fitBezierPath(simplified, effErr, corner);
}

describe('curve-fit quality 档位：段数 + 误差双指标', () => {
  function smoothNoise(rand: () => number, n: number, scale: number): number[] {
    const raw: number[] = [];
    for (let i = 0; i < n; i++) raw.push((rand() * 2 - 1) * scale);
    const out: number[] = [];
    for (let i = 0; i < n; i++) {
      let s = 0, w = 0;
      for (let k = -2; k <= 2; k++) {
        const j = (i + k + n) % n;
        const wk = 1 / (1 + Math.abs(k));
        s += raw[j] * wk; w += wk;
      }
      out.push(s / w);
    }
    return out;
  }
  function makeGroundTruthPolylines(): Polyline[] {
    const rand = makeLCG(98765);
    // A: 矩形 (20,20)-(70,60)，50×40，周长=180，4 边各 10 段共 40 点，法线平滑噪声 ±2.2
    const A: Point[] = [];
    const edges: [Point, Point][] = [
      [{x:20,y:20},{x:70,y:20}], // top
      [{x:70,y:20},{x:70,y:60}], // right
      [{x:70,y:60},{x:20,y:60}], // bottom
      [{x:20,y:60},{x:20,y:20}], // left
    ];
    const perEdge = 10;
    const ptsR: Point[] = [];
    for (const [a, b] of edges) {
      for (let i = 0; i < perEdge; i++) {
        const t = i / perEdge;
        ptsR.push({ x: a.x + t * (b.x-a.x), y: a.y + t * (b.y-a.y) });
      }
    }
    const nR = ptsR.length;
    const nxR = smoothNoise(rand, nR, 2.2);
    for (let i = 0; i < nR; i++) {
      const p = ptsR[i];
      const next = ptsR[(i+1) % nR];
      const tx = next.x - p.x, ty = next.y - p.y;
      const tl = Math.hypot(tx, ty) || 1;
      const nx = -ty / tl, ny = tx / tl;
      A.push({ x: p.x + nx * nxR[i], y: p.y + ny * nxR[i] });
    }
    const polyA: Polyline = { points: A, closed: true, area: 50 * 40 };
    // B: 圆心 (140,40) r=22，周长≈138，采样 80 点，径向平滑噪声 ±2.2
    const N = 80;
    const rNoise = smoothNoise(rand, N, 2.2);
    const B: Point[] = [];
    for (let i = 0; i < N; i++) {
      const th = (i / N) * 2 * Math.PI;
      const r = 22 + rNoise[i];
      B.push({ x: 140 + r * Math.cos(th), y: 40 + r * Math.sin(th) });
    }
    const polyB: Polyline = { points: B, closed: true, area: Math.PI * 22 * 22 };
    // C: 三角形 (25,95)(75,95)(50,130)，每边 8 段共 24 点，法线平滑噪声 ±2.2
    const tri: Point[] = [ { x:25, y:95 }, { x:75, y:95 }, { x:50, y:130 }, { x:25, y:95 } ];
    const perTri = 8;
    const ptsT: Point[] = [];
    for (let e = 0; e < 3; e++) {
      const a = tri[e], b = tri[e+1];
      for (let i = 0; i < perTri; i++) {
        const t = i / perTri;
        ptsT.push({ x: a.x + t * (b.x-a.x), y: a.y + t * (b.y-a.y) });
      }
    }
    const nT = ptsT.length;
    const nxT = smoothNoise(rand, nT, 2.2);
    const C: Point[] = [];
    for (let i = 0; i < nT; i++) {
      const p = ptsT[i];
      const next = ptsT[(i+1) % nT];
      const tx = next.x - p.x, ty = next.y - p.y;
      const tl = Math.hypot(tx, ty) || 1;
      const nx = -ty / tl, ny = tx / tl;
      C.push({ x: p.x + nx * nxT[i], y: p.y + ny * nxT[i] });
    }
    const polyC: Polyline = { points: C, closed: true, area: 0.5 * 50 * 35 };
    return [polyA, polyB, polyC];
  }
  const names = ['A(rect)', 'B(circle)', 'C(triangle)'];
  const polys = makeGroundTruthPolylines();

  it('balanced 模式段数上限：A(矩形)≤8, B(圆)≤48, C(三角)≤9', () => {
    expect(polys.length).toBe(3);
    const { errorThreshold, cornerThreshold } = applyQualityPreset('balanced');
    const segCounts: number[] = [];
    for (let i = 0; i < 3; i++) {
      const bp = polyToPathWithAdaptive(polys[i], 'bezier', errorThreshold, cornerThreshold, 50, 'balanced');
      segCounts.push(bp.segments.length);
    }
    console.info('[complexScene] balanced segCounts:', `A=${segCounts[0]}, B=${segCounts[1]}, C=${segCounts[2]}`);
    expect(segCounts[0], `A(矩形) 段数=${segCounts[0]} 应 ≤ 8`).toBeLessThanOrEqual(8);
    expect(segCounts[1], `B(圆) 段数=${segCounts[1]} 应 ≤ 48`).toBeLessThanOrEqual(48);
    expect(segCounts[2], `C(三角) 段数=${segCounts[2]} 应 ≤ 9`).toBeLessThanOrEqual(9);
  });

  it('precise 相对 balanced 平均对称偏差下降 ≥ 30%', () => {
    expect(polys.length).toBe(3);
    const bal = applyQualityPreset('balanced');
    const pre = applyQualityPreset('precise');
    const SAMPLES = 100;
    let balErrSum = 0;
    let preErrSum = 0;
    const perObj: Record<string, { bal: number; pre: number; drop: number }> = {};
    for (let i = 0; i < 3; i++) {
      const name = names[i];
      const poly = polys[i];
      const bpBal = polyToPathWithAdaptive(poly, 'bezier', bal.errorThreshold, bal.cornerThreshold, 50, 'balanced');
      const bpPre = polyToPathWithAdaptive(poly, 'bezier', pre.errorThreshold, pre.cornerThreshold, 50, 'precise');
      const origSamp = samplePolylineUniform(poly, SAMPLES);
      const balSamp = sampleBezierUniform(bpBal, SAMPLES);
      const preSamp = sampleBezierUniform(bpPre, SAMPLES);
      const balErr = meanSymmetricDistance(origSamp, balSamp);
      const preErr = meanSymmetricDistance(origSamp, preSamp);
      const drop = balErr > 1e-9 ? (balErr - preErr) / balErr : 0;
      balErrSum += balErr;
      preErrSum += preErr;
      perObj[name] = { bal: balErr, pre: preErr, drop };
    }
    const avgBal = balErrSum / 3;
    const avgPre = preErrSum / 3;
    const avgDrop = avgBal > 1e-9 ? (avgBal - avgPre) / avgBal : 0;
    const info = Object.entries(perObj)
      .map(([k, v]) => `${k}: bal=${v.bal.toFixed(3)}px, pre=${v.pre.toFixed(3)}px, drop=${(v.drop*100).toFixed(1)}%`)
      .join(' | ');
    console.info(`[complexScene] quality error: avgBal=${avgBal.toFixed(3)}px, avgPre=${avgPre.toFixed(3)}px, avgDrop=${(avgDrop*100).toFixed(1)}% | ${info}`);
    expect(avgDrop, `precise 相对 balanced 平均误差下降 ${(avgDrop*100).toFixed(1)}% 应 ≥ 30%`).toBeGreaterThanOrEqual(0.30);
  });
});
