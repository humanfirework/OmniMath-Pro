/**
 * Vision category node definitions — 蓝图视觉节点（静态图像工作流）。
 *
 * 工作流：image-input → grayscale-threshold / edge-detect → contour-trace
 *         → curve-fit → plot-curves
 *
 * 数据格式约定：
 *   - image 端口：ImageValue（RGBA / 灰度 / 二值），由 channels + binary 标记区分
 *   - curves 端口（contour-trace 输出）：{ polylines: Polyline[], width, height }
 *   - curves 端口（curve-fit / plot-curves 输出）：{ curves: BezierPath[], width, height }
 *
 * 异步执行：所有视觉节点的 execute 均为 async。重计算（灰度化 / 阈值 /
 * 边缘检测 / 轮廓追踪 / 贝塞尔拟合 / GIF 解码）经 `visionWorkerClient`
 * 派发到专用 Web Worker 执行，主线程仅负责轻量的数据封装与端口构造。
 * Worker 不可用时（SSR / jsdom / CSP 阻断）client 自动降级到同线程调用，
 * 节点行为完全等价。
 *
 * 短路透传：`curve-fit` 在 bezier 模式且输入已是 BezierPath[] 时不调用
 * worker，直接原引用透传（保留引用相等性，方便测试断言）。
 */

import type { NodeTypeDef } from '../pipelineEngine';
import {
  toGrayscale,
  visionWorkerClient,
  fineOutline,
  generateCurveFitCandidates,
  applyCurveTransforms,
  type ImageDataLike,
  type Polyline,
  type Point,
  type BezierPath,
  type FineOutlineResult,
  type CurveCandidate,
} from '@/lib/vision';
import {
  extractVideoFrames,
  type FrameSequence,
  type VideoFrame,
} from '@/lib/vision/video';
import { detectPoses, poseSequenceToAnimation } from '@/lib/vision/pose';
import { smoothPoseSequence, smoothCurveAnimation } from '@/lib/vision/smooth';

/* ------------------------------------------------------------------ *
 * 数据类型
 * ------------------------------------------------------------------ */

/** image 端口传输的图像值。 */
export interface ImageValue {
  /** 像素数据：RGBA（len=w*h*4）或 灰度/二值（len=w*h）。 */
  data: Uint8ClampedArray | Uint8Array;
  width: number;
  height: number;
  /** 通道数：4=RGBA，1=灰度或二值。 */
  channels: 1 | 4;
  /** 是否为二值图（0/1）。 */
  binary: boolean;
  /** 原始 data URL（仅 image-input 输出携带，供 UI 预览）。 */
  src?: string;
}

/** contours 值（contour-trace 输出，curve-fit 输入）。 */
export interface ContoursValue {
  polylines: Polyline[];
  width: number;
  height: number;
}

/** curves 值（curve-fit / plot-curves 输出）。 */
export interface CurvesValue {
  curves: BezierPath[];
  width: number;
  height: number;
  meta?: {
    imageHeight?: number;
    flippedY?: boolean;
    [key: string]: unknown;
  };
  /**
   * 拟合前的原始折线（供 2D 绘图「人工修正 → 调整参数重新拟合」使用）。
   * 仅 curve-fit 在输入为 Polyline[] 时附带。
   */
  originalPolylines?: Polyline[];
  /**
   * 多档拟合候选（粗略 / 均衡 / 精细）。仅 curve-fit 在输入为 Polyline[]
   * 时附带；供 2D 绘图「切换候选结果」使用。坐标为像素→数学坐标变换后。
   */
  candidates?: CurveCandidate[];
}

/** video 端口值：视频源引用（data URL / blob URL / http URL）。 */
export interface VideoValue {
  /** 视频/GIF 的 URL（通常是 data URL）。 */
  src: string;
  /** 来源文件名（可选，用于 UI 显示）。 */
  name?: string;
}

/** frames 端口值：frame-extract 输出的帧序列。 */
export type FramesValue = FrameSequence;

/** animation 端口值：逐帧贝塞尔曲线动画（pose-track / curve-animate 输出）。 */
export interface AnimationValue {
  /** 逐帧曲线集：frames[i] = 第 i 帧的 BezierPath[]。 */
  frames: BezierPath[][];
  /** 帧率（fps）。 */
  fps: number;
  /** 总帧数。 */
  frameCount: number;
  /** 帧像素宽（用于绘图面板坐标映射）。 */
  width: number;
  /** 帧像素高。 */
  height: number;
  /** 渲染颜色（由 curve-animate 注入；plot 时使用）。 */
  color?: string;
  /** 渲染线宽（由 curve-animate 注入）。 */
  strokeWidth?: number;
}

/* ------------------------------------------------------------------ *
 * 辅助构造器（保持 channels 的字面量类型 1 | 4）
 * ------------------------------------------------------------------ */

function rgbaImage(data: Uint8ClampedArray, w: number, h: number, src?: string): ImageValue {
  return { data, width: w, height: h, channels: 4, binary: false, src };
}

function binaryImage(data: Uint8Array, w: number, h: number): ImageValue {
  return { data, width: w, height: h, channels: 1, binary: true };
}

/** 从任意输入解析为 ImageValue；容错处理缺省字段。 */
function toImageValue(v: unknown): ImageValue {
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const data = o.data;
    const width = Number(o.width ?? 0);
    const height = Number(o.height ?? 0);
    const channels = (o.channels === 1 ? 1 : 4) as 1 | 4;
    const binary = Boolean(o.binary);
    const src = typeof o.src === 'string' ? o.src : undefined;
    if (data instanceof Uint8ClampedArray || data instanceof Uint8Array) {
      return { data, width, height, channels, binary, src };
    }
  }
  return { data: new Uint8ClampedArray(0), width: 0, height: 0, channels: 4, binary: false };
}

/**
 * 把任意 ImageValue 转为灰度 Uint8ClampedArray（长度 w*h）。
 * - RGBA → toGrayscale
 * - 灰度/二值 → 直接返回（已是单通道）
 */
function toGray(img: ImageValue): Uint8ClampedArray {
  if (img.channels === 4) {
    return toGrayscale(img as ImageDataLike);
  }
  // 已是单通道：Uint8Array 或 Uint8ClampedArray，直接当灰度用
  return img.data as Uint8ClampedArray;
}

/**
 * 把任意 ImageValue 转为二值 Uint8Array（0/1，前景=1）。
 * - 已是 binary → 直接返回
 * - 灰度 → 用 threshold 二值化（经 Worker）
 * - RGBA → toGrayscale 后二值化（经 Worker）
 *
 * 异步：binarize 是逐像素重计算，对大图会阻塞主线程，因此通过
 * visionWorkerClient 派发到 Worker。Worker 不可用时 client 自动降级。
 */
async function toBinary(img: ImageValue, threshold = 128): Promise<Uint8Array> {
  if (img.binary) {
    return img.data as Uint8Array;
  }
  const gray = toGray(img);
  return visionWorkerClient.binarize(gray, img.width, img.height, threshold);
}

/* ------------------------------------------------------------------ *
 * curve-fit 输入归一化
 * ------------------------------------------------------------------ */
interface CurveInput {
  polylines: Polyline[];
  width: number;
  height: number;
  /** 若输入已是 BezierPath[]（来自上游 curve-fit），则直接携带。 */
  existingCurves?: BezierPath[];
}

/** 从 curves 端口的任意输入归一化为 { polylines | existingCurves, width, height }。 */
function normalizeCurveInput(v: unknown): CurveInput {
  if (!v) return { polylines: [], width: 0, height: 0 };
  // 裸数组：检测首元素形状判断是 Polyline[] 还是 BezierPath[]
  if (Array.isArray(v)) {
    const arr = v as unknown[];
    if (arr.length > 0 && arr[0] && typeof arr[0] === 'object' && 'segments' in (arr[0] as object)) {
      return { polylines: [], width: 0, height: 0, existingCurves: arr as BezierPath[] };
    }
    return { polylines: arr as Polyline[], width: 0, height: 0 };
  }
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const width = Number(o.width ?? 0);
    const height = Number(o.height ?? 0);
    if (Array.isArray(o.polylines)) {
      return { polylines: o.polylines as Polyline[], width, height };
    }
    if (Array.isArray(o.curves)) {
      return { polylines: [], width, height, existingCurves: o.curves as BezierPath[] };
    }
  }
  return { polylines: [], width: 0, height: 0 };
}

/** 把一条折线拟合为 BezierPath（fourier 模式仅对闭合折线生效）。
 *  拟合是 CPU 密集型（Schneider 最小二乘 + 递归分裂），经 Worker 执行。 */
async function fitPolyline(
  poly: Polyline,
  mode: 'bezier' | 'fourier',
  errorThreshold: number,
  cornerThreshold: number,
  fourierOrder: number,
  quality?: 'precise' | 'balanced' | 'smooth',
): Promise<BezierPath> {
  if (mode === 'fourier' && poly.closed && poly.points.length >= 4) {
    const fc = await visionWorkerClient.fitFourier(poly, fourierOrder);
    const numSamples = Math.max(200, 4 * fourierOrder);
    const sampled = await visionWorkerClient.sampleFourierCurve(fc, numSamples);
    const sampledPoly: Polyline = { points: sampled, closed: true, area: poly.area };
    return visionWorkerClient.fitBezierPath(sampledPoly, errorThreshold, cornerThreshold);
  }
  return visionWorkerClient.fitBezierPath(poly, errorThreshold, cornerThreshold);
}

/* ------------------------------------------------------------------ *
 * 节点定义
 * ------------------------------------------------------------------ */
export const visionNodes = {
  /* ── image-input ─────────────────────────────────────────────── */
  'image-input': {
    type: 'image-input',
    category: 'vision',
    labelKey: 'npImageInput',
    icon: 'Image',
    color: 'cyan',
    inputs: [],
    outputs: [{ id: 'image', labelKey: 'npPortImage', type: 'image' }],
    defaultConfig: { src: '' },
    configSchema: [
      { key: 'src', label: '选择图片 Image', type: 'file', accept: 'image/*', hint: '选择图片' },
    ],
    execute: async (_inputs, config) => {
      const src = String(config.src ?? '');
      if (!src) {
        return { image: rgbaImage(new Uint8ClampedArray(0), 0, 0) };
      }
      // 优先用 createImageBitmap + OffscreenCanvas（更快，可在 Worker 中使用）
      const hasBitmap = typeof createImageBitmap !== 'undefined';
      const hasOffscreen = typeof OffscreenCanvas !== 'undefined';
      if (hasBitmap && hasOffscreen) {
        try {
          const blob = await (await fetch(src)).blob();
          const bitmap = await createImageBitmap(blob);
          const w = bitmap.width;
          const h = bitmap.height;
          const canvas = new OffscreenCanvas(w, h);
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('OffscreenCanvas 2D context unavailable');
          ctx.drawImage(bitmap, 0, 0);
          const imageData = ctx.getImageData(0, 0, w, h);
          bitmap.close?.();
          return { image: rgbaImage(imageData.data, w, h, src) };
        } catch (e) {
          // createImageBitmap 失败（部分无头浏览器/旧环境），fall through 到 <img> 回退
          console.warn('createImageBitmap 解码失败，回退到 <img>+<canvas>:', (e as Error).message);
        }
      }
      // Fallback: 用 <img> + <canvas> 解码（兼容性最好，覆盖所有浏览器）
      if (typeof document !== 'undefined') {
        let img: HTMLImageElement | null = null;
        let canvas: HTMLCanvasElement | null = null;
        let timer: ReturnType<typeof setTimeout> | null = null;
        const cleanup = () => {
          if (timer) { clearTimeout(timer); timer = null; }
          if (img) {
            img.onload = null;
            img.onerror = null;
            img.removeAttribute('src');
            img.remove();
            img = null;
          }
          if (canvas) {
            const c = canvas.getContext('2d');
            if (c) c.clearRect(0, 0, canvas.width, canvas.height);
            canvas.width = 0;
            canvas.height = 0;
            canvas.remove();
            canvas = null;
          }
        };
        try {
          img = new Image();
          img.crossOrigin = 'anonymous';
          // 3 秒超时：jsdom 等无真实图片加载能力的环境会超时而非永远挂起
          await new Promise<void>((resolve, reject) => {
            timer = setTimeout(() => reject(new Error('图片加载超时')), 3000);
            img!.onload = () => {
              if (timer) { clearTimeout(timer); timer = null; }
              resolve();
            };
            img!.onerror = () => {
              if (timer) { clearTimeout(timer); timer = null; }
              reject(new Error('图片加载失败'));
            };
            img!.src = src;
          });
          const w = img.naturalWidth;
          const h = img.naturalHeight;
          if (w === 0 || h === 0) throw new Error('图片尺寸为 0');
          canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('Canvas 2D context unavailable');
          ctx.drawImage(img, 0, 0);
          const imageData = ctx.getImageData(0, 0, w, h);
          cleanup();
          return { image: rgbaImage(imageData.data, w, h, src) };
        } catch (e) {
          cleanup();
          // <img> 回退也失败（jsdom 等）：fall through 到空数据返回
          console.warn('图片解码全部失败，返回空数据:', (e as Error).message);
        }
      }
      // 无 DOM 环境（测试/SSR）：返回 src 引用 + 空数据
      return { image: rgbaImage(new Uint8ClampedArray(0), 0, 0, src) };
    },
  },

  /* ── grayscale-threshold ─────────────────────────────────────── */
  'grayscale-threshold': {
    type: 'grayscale-threshold',
    category: 'vision',
    labelKey: 'npGrayscaleThreshold',
    icon: 'Contrast',
    color: 'cyan',
    inputs: [{ id: 'image', labelKey: 'npPortImage', type: 'image' }],
    outputs: [{ id: 'binary', labelKey: 'npPortBinary', type: 'image' }],
    defaultConfig: { threshold: 128, levels: 4, method: 'multi' as const },
    configSchema: [
      {
        key: 'method', label: '阈值方法 Method', type: 'select', default: 'multi',
        options: [
          { value: 'multi', label: '多阈值 Multi' },
          { value: 'simple', label: '单阈值 Simple' },
          { value: 'adaptive', label: '自适应 Adaptive' },
        ],
      },
      { key: 'threshold', label: '阈值 Threshold', type: 'number', min: 0, max: 255, step: 1, default: 128 },
      { key: 'levels', label: '层级 Levels', type: 'number', min: 2, max: 8, step: 1, default: 4 },
    ],
    execute: async (inputs, config) => {
      const img = toImageValue(inputs.image);
      if (img.width === 0 || img.height === 0) {
        throw new Error('输入图像为空（请在 image-input 节点选择图片，或环境不支持图像解码）');
      }
      const method = String(config.method ?? 'multi') as 'simple' | 'multi' | 'adaptive';
      const threshold = Number(config.threshold ?? 128);
      const levels = Math.max(2, Math.floor(Number(config.levels ?? 4)));

      // 已是二值图：直接返回
      if (img.binary) {
        return { binary: img };
      }

      const gray = toGray(img);
      const w = img.width;
      const h = img.height;

      if (method === 'simple') {
        const bin = await visionWorkerClient.binarize(gray, w, h, threshold);
        return { binary: binaryImage(bin, w, h) };
      }
      if (method === 'adaptive') {
        const bin = await visionWorkerClient.adaptiveThreshold(gray, w, h);
        return { binary: binaryImage(bin, w, h) };
      }
      // 'multi'：多阈值分层后，把除最亮层外的所有层视为前景。
      // 这样能捕获所有非纯白区域，适合线稿 / 多色调图像。
      const labels = await visionWorkerClient.multiLevelThreshold(gray, w, h, levels);
      const bin = new Uint8Array(w * h);
      for (let i = 0; i < bin.length; i++) {
        bin[i] = labels[i] < levels - 1 ? 1 : 0;
      }
      return { binary: binaryImage(bin, w, h) };
    },
  },

  /* ── edge-detect ─────────────────────────────────────────────── */
  'edge-detect': {
    type: 'edge-detect',
    category: 'vision',
    labelKey: 'npEdgeDetect',
    icon: 'ScanLine',
    color: 'cyan',
    inputs: [{ id: 'image', labelKey: 'npPortImage', type: 'image' }],
    outputs: [{ id: 'edges', labelKey: 'npPortEdges', type: 'image' }],
    defaultConfig: { method: 'sobel' as const, lowThreshold: 30, highThreshold: 80 },
    configSchema: [
      {
        key: 'method', label: '边缘方法 Method', type: 'select', default: 'sobel',
        options: [
          { value: 'sobel', label: 'Sobel' },
          { value: 'canny', label: 'Canny' },
        ],
      },
      { key: 'lowThreshold', label: '低阈值 Low', type: 'number', min: 0, max: 255, step: 1, default: 30 },
      { key: 'highThreshold', label: '高阈值 High', type: 'number', min: 0, max: 255, step: 1, default: 80 },
    ],
    execute: async (inputs, config) => {
      const img = toImageValue(inputs.image);
      if (img.width === 0 || img.height === 0) {
        throw new Error('输入图像为空（请在 image-input 节点选择图片，或环境不支持图像解码）');
      }
      const method = String(config.method ?? 'sobel') as 'sobel' | 'canny';
      const lowThreshold = Number(config.lowThreshold ?? 30);
      const highThreshold = Number(config.highThreshold ?? 80);
      const w = img.width;
      const h = img.height;
      const gray = toGray(img);

      if (method === 'canny') {
        const edges = await visionWorkerClient.canny(gray, w, h, lowThreshold, highThreshold);
        return { edges: binaryImage(edges, w, h) };
      }
      // 'sobel'：梯度幅值 → 用 lowThreshold 作为幅值阈值二值化
      const mag = await visionWorkerClient.sobel(gray, w, h);
      const edges = new Uint8Array(w * h);
      for (let i = 0; i < edges.length; i++) {
        edges[i] = mag[i] >= lowThreshold ? 1 : 0;
      }
      return { edges: binaryImage(edges, w, h) };
    },
  },

  /* ── contour-trace ───────────────────────────────────────────── */
  'contour-trace': {
    type: 'contour-trace',
    category: 'vision',
    labelKey: 'npContourTrace',
    icon: 'PenTool',
    color: 'cyan',
    inputs: [{ id: 'image', labelKey: 'npPortImage', type: 'image' }],
    outputs: [{ id: 'contours', labelKey: 'npPortContours', type: 'curves' }],
    defaultConfig: { turdsize: 2, skeletonize: false },
    configSchema: [
      { key: 'turdsize', label: '降噪像素 Turd Size', type: 'number', min: 0, max: 20, step: 1, default: 2 },
      { key: 'skeletonize', label: '骨架化 (Skeletonize)', type: 'boolean', default: false },
    ],
    execute: async (inputs, config) => {
      const img = toImageValue(inputs.image);
      if (img.width === 0 || img.height === 0) {
        throw new Error('输入图像为空（请在 image-input 节点选择图片，或环境不支持图像解码）');
      }
      const turdsize = Math.max(0, Math.floor(Number(config.turdsize ?? 2)));
      const skeletonize = Boolean(config.skeletonize);
      const w = img.width;
      const h = img.height;

      // 非 binary 输入先二值化（用默认阈值 128，经 Worker）
      const bin = await toBinary(img, 128);
      // 移除小区域（降噪，经 Worker）
      const cleaned = await visionWorkerClient.removeSmallRegions(bin, w, h, turdsize);
      // skeletonize=true：Zhang-Suen 细化 → 骨架折线（中心线提取，适合线稿）；
      // skeletonize=false：常规轮廓追踪。两条路径输出同一 ContoursValue 结构。
      const polylines = skeletonize
        ? await visionWorkerClient.skeletonToPolylines(
            await visionWorkerClient.zhangSuenThin(cleaned, w, h),
            w,
            h,
          )
        : await visionWorkerClient.traceContours(cleaned, w, h);

      const contours: ContoursValue = { polylines, width: w, height: h };
      return { contours };
    },
  },

  /* ── curve-fit ───────────────────────────────────────────────── */
  'curve-fit': {
    type: 'curve-fit',
    category: 'vision',
    labelKey: 'npCurveFit',
    icon: 'Spline',
    color: 'cyan',
    inputs: [{ id: 'contours', labelKey: 'npPortContours', type: 'curves' }],
    outputs: [{ id: 'curves', labelKey: 'npPortCurves', type: 'curves' }],
    defaultConfig: {
      fitMode: 'bezier' as const,
      errorThreshold: 1.0,
      fourierOrder: 50,
      cornerThreshold: 1.0,
      quality: 'balanced' as const,
      flipY: true,
      flipX: false,
      scale: 1.0,
    },
    configSchema: [
      {
        key: 'fitMode', label: '拟合模式 Fit', type: 'select', default: 'bezier',
        options: [
          { value: 'bezier', label: '贝塞尔 Bezier' },
          { value: 'fourier', label: '傅里叶 Fourier' },
        ],
      },
      {
        key: 'quality', label: '质量 Quality', type: 'select', default: 'balanced',
        options: [
          { value: 'precise', label: '精细 Precise' },
          { value: 'balanced', label: '均衡 Balanced' },
          { value: 'smooth', label: '平滑 Smooth' },
        ],
      },
      { key: 'errorThreshold', label: '误差阈值 Error', type: 'number', min: 0.1, max: 5, step: 0.1, default: 1.5 },
      { key: 'cornerThreshold', label: '角点阈值 Corner', type: 'number', min: 0.05, max: 1.5, step: 0.05, default: 0.7 },
      { key: 'fourierOrder', label: '傅里叶阶数 Fourier Order', type: 'number', min: 4, max: 200, step: 1, default: 50 },
      { key: 'flipY', label: '翻转 Y 轴', type: 'boolean', default: true },
      { key: 'flipX', label: '翻转 X 轴', type: 'boolean', default: false },
      { key: 'scale', label: '缩放 Scale', type: 'number', min: 0.1, max: 4, step: 0.05, default: 1 },
    ],
    execute: async (inputs, config) => {
      const input = normalizeCurveInput(inputs.contours);
      const fitMode = String(config.fitMode ?? 'bezier') as 'bezier' | 'fourier';
      const quality = String(config.quality ?? 'balanced') as 'precise' | 'balanced' | 'smooth';
      const flipX = Boolean(config.flipX ?? false);
      const flipY = Boolean(config.flipY ?? true);
      const scale = Number(config.scale ?? 1.0);

      const qualityPresets = {
        precise:  { errorThreshold: 0.2, cornerThreshold: 8 * Math.PI / 180 },
        balanced: { errorThreshold: 1.5, cornerThreshold: 40 * Math.PI / 180 },
        smooth:   { errorThreshold: 2.5, cornerThreshold: 60 * Math.PI / 180 },
      };

      const baseError = Number(config.errorThreshold ?? qualityPresets[quality].errorThreshold);
      const baseCorner = Number(config.cornerThreshold ?? qualityPresets[quality].cornerThreshold);
      const fourierOrder = Math.max(1, Math.floor(Number(config.fourierOrder ?? 50)));

      const sourceWidth = input.width;
      const sourceHeight = input.height;

      const applyTransforms = (curves: BezierPath[]): BezierPath[] => {
        let result = curves;
        if (flipX) result = flipXBezierPaths(result, sourceWidth);
        if (flipY) result = flipYBezierPaths(result, sourceHeight);
        if (scale !== 1.0) result = scaleBezierPaths(result, scale);
        return result;
      };

      // 输入已是 BezierPath[]：bezier 模式直接透传（保留引用相等性）；
      // fourier 模式把每条闭合 BezierPath 重采样为折线后再做傅里叶拟合。
      if (input.existingCurves && input.polylines.length === 0) {
        if (fitMode === 'bezier') {
          const transformed = applyTransforms(input.existingCurves);
          return {
            curves: {
              curves: transformed,
              width: sourceWidth,
              height: sourceHeight,
              meta: { imageHeight: sourceHeight, flippedY: flipY },
              originalPolylines: input.polylines ?? [],
            } satisfies CurvesValue & { originalPolylines?: Polyline[] },
          };
        }
        // fourier 模式：把 BezierPath 采样为折线后重新拟合
        const polys: Polyline[] = input.existingCurves.map((bp) => ({
          points: sampleBezierPath(bp),
          closed: bp.closed,
          area: bp.area,
        }));
        const fitted = await Promise.all(
          polys.map((p) => fitPolyline(p, fitMode, baseError, baseCorner, fourierOrder, quality)),
        );
        const curves = fitted.filter((bp) => bp.segments.length > 0);
        const transformed = applyTransforms(curves);
        return {
          curves: {
            curves: transformed,
            width: sourceWidth,
            height: sourceHeight,
            meta: { imageHeight: sourceHeight, flippedY: flipY },
            originalPolylines: input.polylines ?? [],
          } satisfies CurvesValue & { originalPolylines?: Polyline[] },
        };
      }

      // 输入是 Polyline[]：逐条拟合（并行 await，每条经 Worker）
      const fitted = await Promise.all(
        input.polylines.map((p) => fitPolyline(p, fitMode, baseError, baseCorner, fourierOrder, quality)),
      );
      const curves = fitted.filter((bp) => bp.segments.length > 0);
      const transformed = applyTransforms(curves);

      // 容错增强：对同一组折线一次性生成多档候选拟合（粗略/均衡/精细），
      // 供 2D 绘图「切换候选结果」挑选。候选坐标应用与主结果一致的
      // 像素→数学坐标变换。仅当存在原始折线时可生成。
      let candidates: CurveCandidate[] | undefined;
      if (input.polylines.length > 0 && fitMode === 'bezier') {
        candidates = generateCurveFitCandidates(input.polylines).map((c) => ({
          ...c,
          curves: applyCurveTransforms(c.curves, {
            width: sourceWidth,
            height: sourceHeight,
            flipX,
            flipY,
            scale,
          }),
        }));
      }

      return {
        curves: {
          curves: transformed,
          width: sourceWidth,
          height: sourceHeight,
          meta: { imageHeight: sourceHeight, flippedY: flipY },
          originalPolylines: input.polylines,
          candidates,
        } satisfies CurvesValue & { originalPolylines?: Polyline[]; candidates?: CurveCandidate[] },
      };
    },
  },

  /* ── plot-curves ─────────────────────────────────────────────── */
  'plot-curves': {
    type: 'plot-curves',
    category: 'vision',
    labelKey: 'npPlotCurves',
    icon: 'LineChart',
    color: 'cyan',
    inputs: [{ id: 'curves', labelKey: 'npPortCurves', type: 'curves' }],
    outputs: [],
    defaultConfig: { color: '#a78bfa', width: 2 },
    configSchema: [
      { key: 'color', label: '颜色 Color', type: 'text', default: '#a78bfa', placeholder: '#a78bfa' },
      { key: 'width', label: '线宽 Width', type: 'number', min: 0.5, max: 6, step: 0.5, default: 2 },
    ],
    execute: (inputs, config) => {
      // 透传曲线集；实际 addCurveSet 副作用在 NodePipeline.runPipeline 中处理
      // （类似 plot-output 的 pushPlotsToWorkbench 逻辑）。
      const input = normalizeCurveInput(inputs.curves);
      const curves = input.existingCurves ?? [];
      const color = String(config.color ?? '#a78bfa');
      const width = Number(config.width ?? 2);
      // 尝试取出上游（curve-fit）带过来的 originalPolylines / candidates
      const withMeta = inputs.curves as unknown as {
        originalPolylines?: Polyline[];
        candidates?: CurveCandidate[];
      };
      const candidates = Array.isArray(withMeta.candidates) ? withMeta.candidates : undefined;
      return {
        curves: {
          curves,
          width: input.width,
          height: input.height,
          color,
          strokeWidth: width,
          originalPolylines: withMeta.originalPolylines ?? [],
          candidates,
        } satisfies CurvesValue & {
          color: string;
          strokeWidth: number;
          originalPolylines?: Polyline[];
          candidates?: CurveCandidate[];
        },
      };
    },
  },

  /* ── fine-outline ───────────────────────────────────────────────
   * CAD 级精细描边（用户要的「把角色轮廓、发丝细节精细描出来」功能）。
   *   - 输入：任意 image（彩色动漫/照片/灰度都行）
   *   - 算法：RGBA → Gray / R / G / B / Lab a 通道 / Lab b 通道 共 6 通道 Sobel 梯度融合
   *           → Canny 双阈值 → 8 邻域连通链 → 丢弃 < minStrand 的短噪点
   *           → 最近邻排序列 → RDP 0.9 简化 → 得到 CAD 感折线集合
   *   - 输出：
   *       overlay (image) — 原图叠高饱和亮绿描边（Footer 预览一眼看效果）
   *       edges   (image) — 纯二值边缘图
   *       contours(curves)— 折线集（下游 curve-fit 可直接接，继续转贝塞尔）
   * ───────────────────────────────────────────────────────────── */
  'fine-outline': {
    type: 'fine-outline',
    category: 'vision',
    labelKey: 'npFineOutline',
    icon: 'PenLine',
    color: 'cyan',
    inputs: [{ id: 'image', labelKey: 'npPortImage', type: 'image' }],
    outputs: [
      { id: 'overlay',  labelKey: 'npPortOverlay',  type: 'image' },
      { id: 'edges',    labelKey: 'npPortEdges',    type: 'image' },
      { id: 'contours', labelKey: 'npPortContours', type: 'curves' },
    ],
    defaultConfig: {
      imageType: 'auto' as 'auto' | 'standard' | 'highContrast',
      threshold: 128,
      low: 55,
      high: 130,
      minStrand: 40,
      eps: 0.9,
      maxPaths: 200,
      strokeWidth: 1.6,
      preset: 'balanced' as 'precise' | 'balanced' | 'rough',
      enableForegroundMask: false,
      fgMaskDilation: 2,
      fgMaskMinAreaRatio: 0.01,
    },
    configSchema: [
      {
        key: 'imageType', label: '图像类型 Type', type: 'select', default: 'auto',
        options: [
          { value: 'auto', label: '自动 Auto' },
          { value: 'standard', label: '标准 Standard' },
          { value: 'highContrast', label: '高对比 High Contrast' },
        ],
      },
      {
        key: 'preset', label: '预设 Preset', type: 'select', default: 'balanced',
        options: [
          { value: 'precise', label: '精细 Precise' },
          { value: 'balanced', label: '均衡 Balanced' },
          { value: 'rough', label: '粗略 Rough' },
        ],
      },
      { key: 'threshold', label: '阈值 Threshold', type: 'number', min: 0, max: 255, step: 1, default: 128 },
      { key: 'low', label: '低阈值 Low', type: 'number', min: 0, max: 255, step: 1, default: 55 },
      { key: 'high', label: '高阈值 High', type: 'number', min: 0, max: 255, step: 1, default: 130 },
      { key: 'minStrand', label: '最短链长 Min Strand', type: 'number', min: 4, max: 200, step: 1, default: 40 },
      { key: 'eps', label: '简化阈值 Eps', type: 'number', min: 0.1, max: 3, step: 0.05, default: 0.9 },
      { key: 'maxPaths', label: '最大路径 Max Paths', type: 'number', min: 10, max: 2000, step: 10, default: 200 },
      { key: 'strokeWidth', label: '描边宽度 Stroke', type: 'number', min: 0.8, max: 4, step: 0.1, default: 1.6 },
      { key: 'enableForegroundMask', label: '前景遮罩增强', type: 'boolean', default: false },
    ],
    execute: async (inputs, config) => {
      const img = toImageValue(inputs.image);
      if (img.width === 0 || img.height === 0) {
        throw new Error('输入图像为空（请在 image-input 节点选择图片，或环境不支持图像解码）');
      }
      // 质量预设：优先覆盖数值（standard / highContrast 两套不同默认值）
      const imageType = String(config.imageType ?? 'auto') as 'auto' | 'standard' | 'highContrast';
      const preset = String(config.preset ?? 'balanced') as 'precise' | 'balanced' | 'rough';
      // standard 预设：6通道+Canny
      const stdPresets = {
        precise: { low: 45, high: 115, minStrand: 28, eps: 0.55, maxPaths: 400, strokeWidth: 1.4 },
        balanced:{ low: 55, high: 130, minStrand: 40, eps: 0.9,  maxPaths: 200, strokeWidth: 1.6 },
        rough:   { low: 70, high: 160, minStrand: 80, eps: 1.6,  maxPaths: 80,  strokeWidth: 2.0 },
      } as const;
      // highContrast 预设：二值化+Moore（更高精度的 RDP + 更短的 minStrand）
      const hcPresets = {
        precise: { threshold: 128, minStrand: 6,  eps: 0.4, maxPaths: 2000, strokeWidth: 1.2 },
        balanced:{ threshold: 128, minStrand: 10, eps: 0.6, maxPaths: 1000, strokeWidth: 1.4 },
        rough:   { threshold: 140, minStrand: 20, eps: 1.0, maxPaths: 400,  strokeWidth: 1.8 },
      } as const;
      const sp = stdPresets[preset];
      const hp = hcPresets[preset];

      const low        = Number(config.low ?? sp.low);
      const high       = Number(config.high ?? sp.high);
      const threshold  = Number(config.threshold ?? hp.threshold);
      // minStrand / eps / maxPaths / strokeWidth：根据 auto 判断后，选对应预设
      // 这里先做"粗覆盖"：如果用户手动覆盖了 config 值，则以用户值为准
      const userMinStrand = config.minStrand !== undefined ? Number(config.minStrand) : undefined;
      const userEps       = config.eps       !== undefined ? Number(config.eps)       : undefined;
      const userMaxPaths  = config.maxPaths  !== undefined ? Number(config.maxPaths)  : undefined;
      const userStroke    = config.strokeWidth !== undefined ? Number(config.strokeWidth) : undefined;
      // 对于 imageType=auto 情况下，两种预设先取"中间路线"（后续 fineOutline 内部会再做直方图判断）
      const minStrand  = Math.max(4, Math.floor(userMinStrand ?? Math.min(sp.minStrand, hp.minStrand)));
      const eps        = Math.max(0.1, userEps ?? Math.min(sp.eps, hp.eps));
      const maxPaths   = Math.max(10, Math.floor(userMaxPaths ?? Math.max(sp.maxPaths, hp.maxPaths)));
      const strokeWidth = Math.max(0.8, userStroke ?? Math.min(sp.strokeWidth, hp.strokeWidth));

      // 计算（纯 TS 函数；无 DOM 依赖，Worker/主线程皆可运行）
      const result = fineOutline(img.data, img.width, img.height, img.channels, {
        imageType,
        low,
        high,
        threshold,
        minStrand,
        eps,
        maxPaths,
        enableForegroundMask: Boolean(config.enableForegroundMask),
        fgMaskDilation: Math.max(0, Math.floor(Number(config.fgMaskDilation ?? 2))),
        fgMaskMinAreaRatio: Math.max(0, Math.min(0.5, Number(config.fgMaskMinAreaRatio ?? 0.01))),
      });

      // 输出 1: edges（二值边缘图 → ImageValue）
      const edgesVal = binaryImage(result.edgeBinary, result.width, result.height);

      // 输出 2: contours（直接给下游 curve-fit 用）
      const contours: ContoursValue & { totalEdgePixels?: number; pipeline?: string } = {
        polylines: result.polylines,
        width: result.width,
        height: result.height,
        totalEdgePixels: result.totalEdgePixels,
      };

      // 输出 3: overlay（绿线叠原图，Footer 预览）—— 同时携带 pipeline，Footer 可显示 badge
      const overlay = buildOverlay(img, result, strokeWidth);
      (overlay as ImageValue & { pipeline?: string }).pipeline = result.pipeline;

      return { overlay, edges: edgesVal, contours };
    },
  },

  /* ── video-input ────────────────────────────────────────────── *
   * 视频/GIF 文件输入节点。选择文件后用 FileReader 读取为 data URL
   * 存入 config.src。下游 frame-extract 节点根据 MIME 类型选择
   * GIF 解码（纯 TS）或 HTMLVideoElement 抽帧（浏览器）。
   * ───────────────────────────────────────────────────────────── */
  'video-input': {
    type: 'video-input',
    category: 'vision',
    labelKey: 'npVideoInput',
    icon: 'Video',
    color: 'cyan',
    inputs: [],
    outputs: [{ id: 'video', labelKey: 'npPortVideo', type: 'animation' }],
    defaultConfig: { src: '', name: '' },
    configSchema: [
      { key: 'src', label: '选择视频/GIF Video', type: 'file', accept: 'video/*,image/gif', hint: '选择视频/GIF' },
    ],
    execute: async (_inputs, config) => {
      const src = String(config.src ?? '');
      const name = String(config.name ?? '');
      return { video: { src, name } satisfies VideoValue };
    },
  },

  /* ── frame-extract ──────────────────────────────────────────── *
   * 把 video-input 的 src 解码为 FrameSequence。
   *   - data:image/gif* → decodeGif（纯 TS，jsdom 可用）
   *   - 其他（mp4/webm/data URL）→ extractVideoFrames（需浏览器）
   * 输出 frames 端口（type: animation）携带 FrameSequence。
   * ───────────────────────────────────────────────────────────── */
  'frame-extract': {
    type: 'frame-extract',
    category: 'vision',
    labelKey: 'npFrameExtract',
    icon: 'Film',
    color: 'cyan',
    inputs: [{ id: 'video', labelKey: 'npPortVideo', type: 'animation' }],
    outputs: [{ id: 'frames', labelKey: 'npPortFrames', type: 'animation' }],
    defaultConfig: { maxFrames: 300, fps: 30 },
    configSchema: [
      { key: 'maxFrames', label: '最大帧数 Max Frames', type: 'number', min: 10, max: 600, step: 10, default: 300 },
      { key: 'fps', label: '采样帧率 FPS', type: 'number', min: 1, max: 60, step: 1, default: 30 },
    ],
    execute: async (inputs, config) => {
      const video = inputs.video as VideoValue | undefined;
      const src = String(video?.src ?? '');
      if (!src) {
        throw new Error('输入视频为空（请在 video-input 节点选择视频/GIF 文件）');
      }
      const maxFrames = Math.max(1, Math.floor(Number(config.maxFrames ?? 300)));
      const targetFps = Math.max(1, Math.floor(Number(config.fps ?? 30)));

      // GIF：data URL 或裸 GIF 字节流。用纯 TS 解码器（jsdom 也能跑）。
      // LZW 解码是 CPU 密集型，经 Worker 执行避免阻塞主线程动画播放。
      const isGif =
        src.startsWith('data:image/gif') || /\.gif(\?|$)/i.test(src);
      let seq: FrameSequence;
      if (isGif) {
        const bytes = await (await fetch(src)).arrayBuffer();
        seq = await visionWorkerClient.decodeGif(bytes);
      } else {
        // MP4 / WebM：浏览器 HTMLVideoElement seek 抽帧
        seq = await extractVideoFrames(src, { maxFrames, fps: targetFps });
      }

      // 限制最大帧数（防止超长 GIF / 视频导致内存爆炸）
      if (seq.frames.length > maxFrames) {
        const stride = seq.frames.length / maxFrames;
        const picked: VideoFrame[] = [];
        for (let i = 0; i < maxFrames; i++) {
          picked.push(seq.frames[Math.floor(i * stride)]);
        }
        seq = { ...seq, frames: picked.map((f, i) => ({ ...f, index: i })) };
      }

      return { frames: seq satisfies FramesValue };
    },
  },

  /* ── pose-track ─────────────────────────────────────────────── *
   * 对 FrameSequence 逐帧做 MediaPipe Pose 检测 → PoseSequence
   * → poseSequenceToAnimation → 逐帧 BezierPath[][] 动画。
   *
   * 失败处理：getPoseLandmarker 在模型加载失败时抛错；本节点 re-throw
   * 一个友好错误，调用方在 UI 显示。MediaPipe 不可用时整条流水线
   * 仍可运行其他节点（错误仅局限在此节点）。
   * ───────────────────────────────────────────────────────────── */
  'pose-track': {
    type: 'pose-track',
    category: 'vision',
    labelKey: 'npPoseTrack',
    icon: 'PersonStanding',
    color: 'cyan',
    inputs: [{ id: 'frames', labelKey: 'npPortFrames', type: 'animation' }],
    outputs: [{ id: 'animation', labelKey: 'npPortAnimation', type: 'animation' }],
    defaultConfig: {
      smooth: true,
      minCutoff: 1.0,
      beta: 0.007,
    },
    configSchema: [
      { key: 'smooth', label: '关键点平滑 (One Euro)', type: 'boolean', default: true },
      { key: 'minCutoff', label: '平滑截止频率 Min Cutoff', type: 'number', min: 0.1, max: 5, step: 0.1, default: 1.0 },
      { key: 'beta', label: '速度系数 Beta', type: 'number', min: 0.001, max: 0.05, step: 0.001, default: 0.007 },
    ],
    execute: async (inputs, config) => {
      const framesValue = inputs.frames as FramesValue | undefined;
      if (!framesValue || !framesValue.frames || framesValue.frames.length === 0) {
        throw new Error('输入帧序列为空（请检查 frame-extract 节点是否成功解码）');
      }
      const doSmooth = Boolean(config.smooth);
      const minCutoff = Number(config.minCutoff ?? 1.0);
      const beta = Number(config.beta ?? 0.007);

      // 1. 帧序列 → 姿态序列（可能抛「pose model unavailable」）
      let poseSeq;
      try {
        poseSeq = await detectPoses(framesValue);
      } catch (e) {
        throw new Error(`姿态检测失败: ${(e as Error).message}`);
      }

      // 2. 可选：One Euro Filter 平滑关键点
      if (doSmooth) {
        poseSeq = smoothPoseSequence(poseSeq, { freq: poseSeq.fps, minCutoff, beta });
      }

      // 3. 姿态序列 → 逐帧曲线动画
      const anim = poseSequenceToAnimation(poseSeq);
      return {
        animation: {
          frames: anim.frames,
          fps: anim.fps,
          frameCount: anim.frameCount,
          width: poseSeq.width,
          height: poseSeq.height,
        } satisfies AnimationValue,
      };
    },
  },

  /* ── curve-animate ──────────────────────────────────────────── *
   * 动画终端节点：接收逐帧曲线动画，可选 One Euro Filter 平滑控制点，
   * 注入渲染样式（color / strokeWidth），输出 animation 端口。
   *
   * 实际 addCurveSet 副作用（带 isAnimation=true）在
   * NodePipeline.runPipeline 的 pushAnimationsToWorkbench 中处理。
   * ───────────────────────────────────────────────────────────── */
  'curve-animate': {
    type: 'curve-animate',
    category: 'vision',
    labelKey: 'npCurveAnimate',
    icon: 'Play',
    color: 'cyan',
    inputs: [{ id: 'animation', labelKey: 'npPortAnimation', type: 'animation' }],
    outputs: [],
    defaultConfig: {
      color: '#a78bfa',
      width: 2,
      smooth: false,
      minCutoff: 1.0,
      beta: 0.007,
    },
    configSchema: [
      { key: 'color', label: '颜色 Color', type: 'text', default: '#a78bfa', placeholder: '#a78bfa' },
      { key: 'width', label: '线宽 Width', type: 'number', min: 0.5, max: 6, step: 0.5, default: 2 },
      { key: 'smooth', label: '控制点平滑 (One Euro)', type: 'boolean', default: false },
      { key: 'minCutoff', label: '平滑截止频率 Min Cutoff', type: 'number', min: 0.1, max: 5, step: 0.1, default: 1.0 },
      { key: 'beta', label: '速度系数 Beta', type: 'number', min: 0.001, max: 0.05, step: 0.001, default: 0.007 },
    ],
    execute: (inputs, config) => {
      const anim = inputs.animation as AnimationValue | undefined;
      if (!anim || !Array.isArray(anim.frames) || anim.frames.length === 0) {
        throw new Error('输入动画为空（请检查 pose-track 节点是否成功检测）');
      }
      const doSmooth = Boolean(config.smooth);
      const minCutoff = Number(config.minCutoff ?? 1.0);
      const beta = Number(config.beta ?? 0.007);
      const color = String(config.color ?? '#a78bfa');
      const strokeWidth = Number(config.width ?? 2);

      const frames = doSmooth
        ? smoothCurveAnimation(anim.frames, { freq: anim.fps, minCutoff, beta })
        : anim.frames;

      return {
        animation: {
          frames,
          fps: anim.fps,
          frameCount: anim.frameCount,
          width: anim.width,
          height: anim.height,
          color,
          strokeWidth,
        } satisfies AnimationValue,
      };
    },
  },
} satisfies Record<string, NodeTypeDef>;

/* ------------------------------------------------------------------ *
 * 工具：Y 轴翻转纯函数（图像坐标系 → 数学坐标系）
 * ------------------------------------------------------------------ */

/**
 * 把 BezierPath 数组的所有控制点的 y 坐标从图像坐标系（y=0 在上，向下增大）
 * 翻转为数学坐标系（y=0 在下，向上增大）。翻转公式：y' = H - 1 - y。
 *
 * 纯函数：返回新数组（深拷贝），不修改输入。segments 为空的 path 原样跳过。
 */
export function flipYBezierPaths(curves: BezierPath[], H: number): BezierPath[] {
  if (!Array.isArray(curves) || curves.length === 0) return [];
  if (!Number.isFinite(H) || H <= 0) return curves.slice();
  const h = H - 1;
  return curves.map((path) => {
    if (!path.segments || path.segments.length === 0) return path;
    const newSegments = path.segments.map((seg) => ({
      p0: { x: seg.p0.x, y: h - seg.p0.y },
      c1: { x: seg.c1.x, y: h - seg.c1.y },
      c2: { x: seg.c2.x, y: h - seg.c2.y },
      p1: { x: seg.p1.x, y: h - seg.p1.y },
    }));
    return { ...path, segments: newSegments };
  });
}

/**
 * X 轴翻转纯函数：把所有控制点的 x 翻转为 W - 1 - x。
 * 纯函数：返回新数组（深拷贝），不修改输入。
 */
export function flipXBezierPaths(curves: BezierPath[], W: number): BezierPath[] {
  if (!Array.isArray(curves) || curves.length === 0) return [];
  if (!Number.isFinite(W) || W <= 0) return curves.slice();
  const w = W - 1;
  return curves.map((path) => {
    if (!path.segments || path.segments.length === 0) return path;
    const newSegments = path.segments.map((seg) => ({
      p0: { x: w - seg.p0.x, y: seg.p0.y },
      c1: { x: w - seg.c1.x, y: seg.c1.y },
      c2: { x: w - seg.c2.x, y: seg.c2.y },
      p1: { x: w - seg.p1.x, y: seg.p1.y },
    }));
    return { ...path, segments: newSegments };
  });
}

/**
 * 缩放纯函数：把所有控制点按 scale 等比缩放（围绕原点）。
 * 纯函数：返回新数组（深拷贝），不修改输入。
 */
export function scaleBezierPaths(curves: BezierPath[], scale: number): BezierPath[] {
  if (!Array.isArray(curves) || curves.length === 0) return [];
  if (!Number.isFinite(scale) || scale === 1.0) return curves.slice();
  return curves.map((path) => {
    if (!path.segments || path.segments.length === 0) return path;
    const newSegments = path.segments.map((seg) => ({
      p0: { x: seg.p0.x * scale, y: seg.p0.y * scale },
      c1: { x: seg.c1.x * scale, y: seg.c1.y * scale },
      c2: { x: seg.c2.x * scale, y: seg.c2.y * scale },
      p1: { x: seg.p1.x * scale, y: seg.p1.y * scale },
    }));
    return { ...path, segments: newSegments };
  });
}

/* ------------------------------------------------------------------ *
 * 工具：把 BezierPath 采样为折线（用于 fourier 重拟合）
 * ------------------------------------------------------------------ */
function sampleBezierPath(bp: BezierPath, samplesPerSeg = 16): Point[] {
  const pts: Point[] = [];
  for (const seg of bp.segments) {
    for (let i = 0; i < samplesPerSeg; i++) {
      const t = i / samplesPerSeg;
      const u = 1 - t;
      pts.push({
        x: u * u * u * seg.p0.x + 3 * u * u * t * seg.c1.x + 3 * u * t * t * seg.c2.x + t * t * t * seg.p1.x,
        y: u * u * u * seg.p0.y + 3 * u * u * t * seg.c1.y + 3 * u * t * t * seg.c2.y + t * t * t * seg.p1.y,
      });
    }
  }
  // 末点
  const last = bp.segments[bp.segments.length - 1];
  if (last) pts.push({ x: last.p1.x, y: last.p1.y });
  return pts;
}

/* ------------------------------------------------------------------ *
 * 工具：纯 TS 画「填充厚度的线段」，用于画绿描边叠图（无 DOM 依赖）。
 * 厚度 thickness=stroke 以半径 r = floor(thickness/2) 为中心圆填充，
 * 非抗锯齿，保证 jsdom / SSR 都能生成有效像素。
 * ------------------------------------------------------------------ */
function drawThickLine(
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  thickness: number,
  color: [number, number, number, number],
): void {
  // Bresenham + 填充半径 r 的方形邻域（r 越大线越粗）
  const r = Math.max(0, Math.floor((thickness - 1) / 2));
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  let sx = x0 < x1 ? 1 : -1;
  let sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let cx = x0;
  let cy = y0;
  const [cr, cg, cb, ca] = color;
  while (true) {
    // 方形填充邻域
    for (let oy = -r; oy <= r; oy++) {
      for (let ox = -r; ox <= r; ox++) {
        const px = cx + ox;
        const py = cy + oy;
        if (px < 0 || py < 0 || px >= w || py >= h) continue;
        const idx = (py * w + px) * 4;
        // Alpha 混合
        const a = ca / 255;
        const ba = 1 - a;
        rgba[idx]     = (rgba[idx] * ba + cr * a) | 0;
        rgba[idx + 1] = (rgba[idx + 1] * ba + cg * a) | 0;
        rgba[idx + 2] = (rgba[idx + 2] * ba + cb * a) | 0;
        rgba[idx + 3] = Math.max(rgba[idx + 3], ca);
      }
    }
    if (cx === x1 && cy === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      cx += sx;
    }
    if (e2 <= dx) {
      err += dx;
      cy += sy;
    }
  }
}

/**
 * 把 fineOutline 产出的 polylines 画成「绿色描边叠图」（RGBA）。
 * - 如果输入源是 4 通道：先 copy 原图再描绿边
 * - 如果输入源是 1 通道：先把灰度扩散为 RGB，再描绿边
 * - 描边颜色：高饱和亮绿 #16e07a (22, 224, 122) + 220 alpha，厚度由 strokeWidth 决定
 */
function buildOverlay(
  input: ImageValue,
  result: FineOutlineResult,
  strokeWidth = 1.6,
): ImageValue {
  const { width: w, height: h } = input;
  const out = new Uint8ClampedArray(w * h * 4);
  if (input.channels === 4) {
    out.set(input.data as Uint8ClampedArray);
  } else {
    // 1-channel → 扩散 RGBA（A=255）
    for (let p = 0; p < w * h; p++) {
      const v = (input.data as Uint8Array | Uint8ClampedArray)[p];
      out[p * 4]     = v;
      out[p * 4 + 1] = v;
      out[p * 4 + 2] = v;
      out[p * 4 + 3] = 255;
    }
  }
  const color: [number, number, number, number] = [22, 224, 122, 220];
  for (const poly of result.polylines) {
    for (let i = 0; i < poly.points.length - 1; i++) {
      const a = poly.points[i];
      const b = poly.points[i + 1];
      drawThickLine(
        out,
        w,
        h,
        Math.round(a.x),
        Math.round(a.y),
        Math.round(b.x),
        Math.round(b.y),
        strokeWidth,
        color,
      );
    }
  }
  return rgbaImage(out, w, h);
}
