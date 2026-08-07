/**
 * 独立运行结果面板的 canvas 渲染核心（纯函数，可单测）。
 *
 * 采用「世界视口（xRange/yRange）→ 屏幕」的等距映射，配合 devicePixelRatio
 * 上限裁剪，流畅承载大量曲线点。支持：
 *  - 采样折线（plot-output / sim-scope 波形）
 *  - 贝塞尔路径段（图像/视频转曲线，自像素空间映射）
 *  - 逐帧动画（curve-animate）
 */

import type { BezierSegmentData } from '@/components/workbench/plots/Plot2DCanvas';
import type { RunCurve, RunResultImage, RunResultPanel } from '@/lib/store/runResultsStore';
import { flattenPixels as flattenPixelsToPts, mapPixelPoint } from '@/lib/vision/coords';

export interface ResultView {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

/** css 像素 → world 坐标。 */
export function screenToWorld(cssX: number, cssY: number, size: { w: number; h: number }, view: ResultView) {
  const x = view.xMin + (cssX / size.w) * (view.xMax - view.xMin);
  const y = view.yMax - (cssY / size.h) * (view.yMax - view.yMin);
  return { x, y };
}

/** world 坐标 → css 像素。 */
export function worldToScreen(x: number, y: number, size: { w: number; h: number }, view: ResultView) {
  const sx = ((x - view.xMin) / (view.xMax - view.xMin)) * size.w;
  const sy = size.h - ((y - view.yMin) / (view.yMax - view.yMin)) * size.h;
  return { x: sx, y: sy };
}

/** 把一条 RunCurve 归一化成 world 坐标折线点集。 */
export function curveToWorldPoints(curve: RunCurve): Array<[number, number]> {
  if (curve.points) return curve.points;
  if (curve.segments) {
    const w = curve.imageW ?? 0;
    const h = curve.imageH ?? 0;
    const pts = flattenPixelsToPts(curve.segments);
    if (w <= 0 || h <= 0) return pts;
    // P0-3：统一像素→数学翻转（y' = H-1-y）。curve-fit 已翻转为数学坐标的数据
    // 应传 flipX/flipY=false，避免二次翻转；仍处像素空间的数据才传 true。
    return pts.map(([px, py]) => mapPixelPoint(px, py, w, h, curve.flipX, curve.flipY));
  }
  return [];
}

/** 从 RunResultPanel 推导自动视口（考虑边距）。 */
export function autoFitView(panel: RunResultPanel, padRatio = 0.08): ResultView | null {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  let n = 0;
  for (const curve of panel.curves) {
    for (const [x, y] of curveToWorldPoints(curve)) {
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      n++;
    }
  }
  if (n === 0) return null;
  if (minX === maxX) { const p = Math.max(1, Math.abs(minX) * 0.1); minX -= p; maxX += p; }
  if (minY === maxY) { const p = Math.max(1, Math.abs(minY) * 0.1); minY -= p; maxY += p; }
  const padX = (maxX - minX) * padRatio;
  const padY = (maxY - minY) * padRatio;
  return { xMin: minX - padX, xMax: maxX + padX, yMin: minY - padY, yMax: maxY + padY };
}

/** 平移视口（按屏幕像素拖拽量）。 */
export function panView(view: ResultView, dxPx: number, dyPx: number, size: { w: number; h: number }): ResultView {
  const spanX = view.xMax - view.xMin;
  const spanY = view.yMax - view.yMin;
  const dxWorld = (-dxPx / size.w) * spanX;
  const dyWorld = (dyPx / size.h) * spanY;
  return { ...view, xMin: view.xMin + dxWorld, xMax: view.xMax + dxWorld, yMin: view.yMin + dyWorld, yMax: view.yMax + dyWorld };
}

/** 以某点为锚点缩放视口（factor > 1 放大）。 */
export function zoomView(view: ResultView, factor: number, anchorPx: { x: number; y: number }, size: { w: number; h: number }): ResultView {
  const anchor = screenToWorld(anchorPx.x, anchorPx.y, size, view);
  const nx = (view.xMax - view.xMin) / factor;
  const ny = (view.yMax - view.yMin) / factor;
  const xMin = anchor.x - anchorPx.x * (nx / size.w);
  const xMax = xMin + nx;
  const yMax = anchor.y + anchorPx.y * (ny / size.h);
  const yMin = yMax - ny;
  return { xMin, xMax, yMin, yMax };
}

/** 绘制面板全部内容（ctx 已按 DPR 缩放，size 为 css 尺寸）。 */
export function renderPanel(
  ctx: CanvasRenderingContext2D,
  panel: RunResultPanel,
  view: ResultView,
  size: { w: number; h: number },
  opts?: { grid?: boolean; axes?: boolean; frame?: number; image?: HTMLImageElement | null },
) {
  const { w, h } = size;
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  // 背景
  ctx.fillStyle = 'rgba(0,0,0,0)';
  ctx.fillRect(0, 0, w, h);

  // P0-4：若面板携带原图叠加层，先绘制图像背景（双线性高清），曲线再矢量叠加其上。
  // 图像在 world 坐标中铺满 [0,width]×[0,height]（Y 向上，与已翻转曲线一致）。
  if (opts?.image && panel.image && opts.image.complete && opts.image.naturalWidth > 0) {
    drawImageLayer(ctx, opts.image, panel.image, view, size);
  }

  const grid = opts?.grid ?? true;
  if (grid) drawGrid(ctx, view, size);
  if (opts?.axes ?? true) drawAxes(ctx, view, size);

  // 曲线
  const frame = opts?.frame ?? -1;
  const curvesToDraw = frame >= 0 && panel.animation?.frames
    ? [{ color: '#4ade80', width: 2, points: panel.animation.frames[frame] ?? [] } as RunCurve]
    : panel.curves;

  for (const curve of curvesToDraw) {
    if (curve.visible === false) continue;
    const pts = curveToWorldPoints(curve);
    if (pts.length === 0) continue;
    drawPolyline(ctx, pts, view, size, curve.color || '#4ade80', curve.width || 2);
  }
  ctx.restore();
}

/**
 * P0-4：把原图作为背景绘制到 world 坐标系。
 * 图像左上角像素 (0,0) ↔ world (0, height)，右下角像素 (width,height) ↔ world (width, 0)，
 * 与 `mapPixelPoint` 翻转后的曲线坐标严格对齐。
 */
function drawImageLayer(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  meta: RunResultImage,
  view: ResultView,
  size: { w: number; h: number },
) {
  const { width, height } = meta;
  if (width <= 0 || height <= 0) return;
  const tl = worldToScreen(0, height, size, view); // 图像左上角（像素 y=0 → world y=height）
  const br = worldToScreen(width, 0, size, view); // 图像右下角（像素 y=height → world y=0）
  const rectW = br.x - tl.x;
  const rectH = br.y - tl.y;
  if (!Number.isFinite(rectW) || !Number.isFinite(rectH) || rectW <= 0 || rectH <= 0) return;
  // 双线性/高质量插值（默认即平滑，显式开启以抵抗缩放时最近邻锯齿）。
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.globalAlpha = 0.85;
  ctx.drawImage(img, tl.x, tl.y, rectW, rectH);
  ctx.globalAlpha = 1;
}

/** 单条曲线渲染的最大点数；超出时按等距抽稀以控制绘制开销（视觉基本无损）。 */
const MAX_DRAW_POINTS = 20000;

function drawPolyline(
  ctx: CanvasRenderingContext2D,
  pts: Array<[number, number]>,
  view: ResultView,
  size: { w: number; h: number },
  color: string,
  width: number,
) {
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  // 点过多时抽稀：stride 保证覆盖曲线两端，避免海量点循环拖慢每帧绘制。
  const n = pts.length;
  const stride = n > MAX_DRAW_POINTS ? Math.ceil(n / MAX_DRAW_POINTS) : 1;
  let started = false;
  for (let i = 0; i < n; i += stride) {
    const x = pts[i][0];
    const y = pts[i][1];
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      started = false;
      continue;
    }
    const s = worldToScreen(x, y, size, view);
    if (!started) {
      ctx.moveTo(s.x, s.y);
      started = true;
    } else {
      ctx.lineTo(s.x, s.y);
    }
  }
  ctx.stroke();
}

function drawGrid(ctx: CanvasRenderingContext2D, view: ResultView, size: { w: number; h: number }) {
  const spanX = view.xMax - view.xMin;
  const spanY = view.yMax - view.yMin;
  const stepX = niceStep(spanX / 10);
  const stepY = niceStep(spanY / 10);
  ctx.strokeStyle = 'rgba(128,128,128,0.15)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = Math.ceil(view.xMin / stepX) * stepX; x <= view.xMax; x += stepX) {
    const s = worldToScreen(x, 0, size, view);
    ctx.moveTo(s.x, 0);
    ctx.lineTo(s.x, size.h);
  }
  for (let y = Math.ceil(view.yMin / stepY) * stepY; y <= view.yMax; y += stepY) {
    const s = worldToScreen(0, y, size, view);
    ctx.moveTo(0, s.y);
    ctx.lineTo(size.w, s.y);
  }
  ctx.stroke();
}

function drawAxes(ctx: CanvasRenderingContext2D, view: ResultView, size: { w: number; h: number }) {
  ctx.strokeStyle = 'rgba(128,128,128,0.5)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  if (view.yMin <= 0 && view.yMax >= 0) {
    const s = worldToScreen(0, 0, size, view);
    ctx.moveTo(0, s.y);
    ctx.lineTo(size.w, s.y);
  }
  if (view.xMin <= 0 && view.xMax >= 0) {
    const s = worldToScreen(0, 0, size, view);
    ctx.moveTo(s.x, 0);
    ctx.lineTo(s.x, size.h);
  }
  ctx.stroke();
}

/** 取一个「好看」的网格步长（1/2/5 × 10^k）。 */
export function niceStep(rough: number): number {
  if (!Number.isFinite(rough) || rough <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / mag;
  let nice: number;
  if (norm < 1.5) nice = 1;
  else if (norm < 3.5) nice = 2;
  else if (norm < 7.5) nice = 5;
  else nice = 10;
  return nice * mag;
}