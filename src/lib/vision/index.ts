/**
 * 图像→曲线主管线编排。
 *
 *   imageToCurves(imageData, options)
 *
 * 流程：
 *   1. 灰度化
 *   2. skeletonize=true：二值化→Zhang-Suen 细化→骨架折线→RDP→BezierPath（开放）
 *   3. 否则：多阈值分层→逐层二值化→移除小区域→轮廓追踪→
 *      （fourier 模式：傅里叶拟合后采样转 BezierPath；否则 RDP+贝塞尔拟合）
 *   4. 合并所有层级曲线
 *   5. 返回 CurveSet
 *
 * 关键：对每个层级完整扫描，跳过「跨越整张图像四条边」的背景级，
 * 确保不遗漏任何对象轮廓。
 */
import type {
  ImageDataLike,
  VisionOptions,
  CurveSet,
  BezierPath,
  Polyline,
  Point,
  FitMode,
} from './types';
import {
  toGrayscale,
  binarize,
  multiLevelThreshold,
  binarizeByLevel,
  removeSmallRegions,
  binaryMorphology,
} from './preprocess';
import { sobel, canny } from './edges';
import { traceContours } from './trace';
import { marchingSquaresGray } from './marchingSquare';
import { zhangSuenThin, skeletonToPolylines } from './skeleton';
import { rdpSimplify, fitBezierPath } from './fit';
import { fitFourier, sampleFourierCurve } from './fourier';

const DEFAULTS = {
  threshold: 128,
  levels: 4,
  turdsize: 2,
  fitMode: 'bezier' as const,
  fourierOrder: 50,
  cornerThreshold: 1.0,
  errorThreshold: 1.0,
  skeletonize: false,
  edgeMethod: 'sobel' as const,
  cannyLow: 40,
  cannyHigh: 100,
  denoiseRadius: 0,
  useEdgeDetection: false,
  useMarchingSquares: false,
  marchLevels: 4,
  marchSmoothRadius: 1,
  marchMinPerimeter: 0,
};

/**
 * 判断某层二值图是否为「背景级」：四条图像边的前景占比都 ≥ 0.8。
 *
 * 旧判定是「每条边至少 1 个前景像素」，会把细边框（每边仅零星几个像素）
 * 误判为背景整层跳过。改为统计各边前景像素占比：整幅暗色背景（四边几乎
 * 全满）仍被跳过；细边框 / 跨边小物体（占比极低）则保留下来继续追踪。
 */
function isBackgroundLevel(bin: Uint8Array, w: number, h: number): boolean {
  if (w < 1 || h < 1) return false;
  const EDGE_RATIO = 0.8;
  let top = 0;
  let bottom = 0;
  for (let x = 0; x < w; x++) {
    if (bin[0 * w + x] === 1) top++;
    if (bin[(h - 1) * w + x] === 1) bottom++;
  }
  let left = 0;
  let right = 0;
  for (let y = 0; y < h; y++) {
    if (bin[y * w + 0] === 1) left++;
    if (bin[y * w + (w - 1)] === 1) right++;
  }
  return (
    top / w >= EDGE_RATIO &&
    bottom / w >= EDGE_RATIO &&
    left / h >= EDGE_RATIO &&
    right / h >= EDGE_RATIO
  );
}

/** 把一条折线（开放或闭合）拟合为 BezierPath。 */
function polylineToBezierPath(
  poly: Polyline,
  mode: 'bezier' | 'fourier',
  errorThreshold: number,
  cornerThreshold: number,
  fourierOrder: number,
): BezierPath {
  const pts = poly.points;
  let L = 0;
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x - pts[i-1].x;
    const dy = pts[i].y - pts[i-1].y;
    L += Math.sqrt(dx*dx + dy*dy);
  }
  const scale = L < 80 ? 0.8 : Math.min(2.5, Math.max(1.0, 1.0 + (L - 200) / 1200));
  const effectiveErr = errorThreshold * scale;

  if (mode === 'fourier' && poly.closed && pts.length >= 4) {
    const approxClosed = Math.hypot(pts[0].x - pts[pts.length-1].x, pts[0].y - pts[pts.length-1].y) < 2;
    let polyIn = poly;
    if (approxClosed) {
      const N = Math.max(2, Math.min(8, Math.floor(fourierOrder / 4)));
      const smoothed = pts.map((p) => ({ x: p.x, y: p.y }));
      const n = smoothed.length;
      for (let i = 0; i < N; i++) {
        const prev = smoothed[(i - 1 + n) % n];
        const next = smoothed[(i + 1) % n];
        smoothed[i] = {
          x: 0.25 * prev.x + 0.5 * smoothed[i].x + 0.25 * next.x,
          y: 0.25 * prev.y + 0.5 * smoothed[i].y + 0.25 * next.y,
        };
        const j = n - 1 - i;
        const pprev = smoothed[(j - 1 + n) % n];
        const nnext = smoothed[(j + 1) % n];
        smoothed[j] = {
          x: 0.25 * pprev.x + 0.5 * smoothed[j].x + 0.25 * nnext.x,
          y: 0.25 * pprev.y + 0.5 * smoothed[j].y + 0.25 * nnext.y,
        };
      }
      polyIn = { points: smoothed, closed: true };
    }
    const fc = fitFourier(polyIn, fourierOrder);
    const numSamples = Math.max(200, 4 * fourierOrder);
    const sampled = sampleFourierCurve(fc, numSamples);
    const sampledPoly: Polyline = { points: sampled, closed: true };
    return fitBezierPath(sampledPoly, effectiveErr, cornerThreshold);
  }
  return fitBezierPath(poly, effectiveErr, cornerThreshold);
}

/** 从单张二值图提取轮廓并拟合为贝塞尔曲线，追加到 curves。 */
function extractContours(
  bin: Uint8Array,
  w: number,
  h: number,
  curves: BezierPath[],
  opts: {
    fitMode: FitMode;
    errorThreshold: number;
    cornerThreshold: number;
    fourierOrder: number;
  },
): void {
  const contours = traceContours(bin, w, h);
  const rdpEps = Math.max(0.25, opts.errorThreshold * 0.5);
  for (const contour of contours) {
    if (contour.points.length < 3) continue;
    const simplified: Polyline = {
      points: rdpSimplify(contour.points, rdpEps),
      closed: contour.closed,
      area: contour.area,
    };
    if (simplified.points.length < 3) continue;
    const bp = polylineToBezierPath(
      simplified,
      opts.fitMode,
      opts.errorThreshold,
      opts.cornerThreshold,
      opts.fourierOrder,
    );
    if (bp.segments.length > 0) {
      bp.area = contour.area;
      curves.push(bp);
    }
  }
}

/** 长边上限：超过则先亚像素双线性降采样再进管线，防止 4K+ 大图拖垮追踪/拟合。 */
const MAX_DIM = 2048;

/**
 * 亚像素双线性重采样：把 **灰度** 图缩小到 nw×nh。
 *
 * 只用单通道比 RGBA 四通道更准也更省：
 *   - 旧实现「先双线性缩小 RGBA、再算灰度」会引入两次舍入 / 通道间平均模糊，
 *     对细线、发丝这类高精度边缘不利；
 *   - 这里先算灰度、再对灰度做双线性，亮度信息只经历一次插值，边缘保持更锐利。
 */
function downsampleGray(
  gray: Uint8ClampedArray,
  w: number,
  h: number,
  nw: number,
  nh: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(nw * nh);
  const sx = w / nw;
  const sy = h / nh;
  for (let y = 0; y < nh; y++) {
    const srcY = y * sy;
    const y0 = Math.min(h - 1, Math.floor(srcY));
    const y1 = Math.min(h - 1, y0 + 1);
    const fy = srcY - y0;
    for (let x = 0; x < nw; x++) {
      const srcX = x * sx;
      const x0 = Math.min(w - 1, Math.floor(srcX));
      const x1 = Math.min(w - 1, x0 + 1);
      const fx = srcX - x0;
      const i00 = y0 * w + x0;
      const i10 = y0 * w + x1;
      const i01 = y1 * w + x0;
      const i11 = y1 * w + x1;
      const top = gray[i00] * (1 - fx) + gray[i10] * fx;
      const bot = gray[i01] * (1 - fx) + gray[i11] * fx;
      out[y * nw + x] = top * (1 - fy) + bot * fy;
    }
  }
  return out;
}

/** 主管线：ImageData → CurveSet。 */
export function imageToCurves(
  imageData: ImageDataLike,
  options?: VisionOptions,
): CurveSet {
  const opts = {
    ...DEFAULTS,
    ...options,
    ...(options?.cannyLow != null ? { cannyLow: options.cannyLow } : {}),
    ...(options?.cannyHigh != null ? { cannyHigh: options.cannyHigh } : {}),
    ...(options?.denoiseRadius != null ? { denoiseRadius: options.denoiseRadius } : {}),
    ...(options?.useEdgeDetection != null ? { useEdgeDetection: options.useEdgeDetection } : {}),
  };
  // 大图保护：长边超过 MAX_DIM 时按比例缩小（最近邻），曲线在缩小后的
  // 坐标系产出；调用方可凭 metadata.scaleFactor 自行放大回原图坐标。
  let src = imageData;
  let downsampled = false;
  let scaleFactor = 1;
  if (imageData.width > MAX_DIM || imageData.height > MAX_DIM) {
    const scale = MAX_DIM / Math.max(imageData.width, imageData.height);
    const nw = Math.max(1, Math.round(imageData.width * scale));
    const nh = Math.max(1, Math.round(imageData.height * scale));
    // 先算灰度再对灰度做双线性降采样（保边缘），再重建 4 通道图供下游 unify 处理
    const gray0 = toGrayscale(imageData);
    const downGray = downsampleGray(gray0, imageData.width, imageData.height, nw, nh);
    const rgba = new Uint8ClampedArray(nw * nh * 4);
    for (let i = 0; i < nw * nh; i++) {
      const gv = downGray[i];
      rgba[i * 4] = gv;
      rgba[i * 4 + 1] = gv;
      rgba[i * 4 + 2] = gv;
      rgba[i * 4 + 3] = 255;
    }
    src = { data: rgba, width: nw, height: nh };
    downsampled = true;
    scaleFactor = imageData.width / nw;
  }
  const w = src.width;
  const h = src.height;
  const gray = toGrayscale(src);
  const curves: BezierPath[] = [];

  if (opts.skeletonize) {
    const bin = binarize(gray, w, h, opts.threshold);
    const cleaned = removeSmallRegions(bin, w, h, opts.turdsize);
    const skel = zhangSuenThin(cleaned, w, h);
    const polys = skeletonToPolylines(skel, w, h);
    const rdpEps = Math.max(0.25, opts.errorThreshold * 0.5);
    for (const poly of polys) {
      const simplified: Polyline = {
        points: rdpSimplify(poly.points, rdpEps),
        closed: poly.closed,
        area: poly.area,
      };
      const bp = fitBezierPath(simplified, opts.errorThreshold, opts.cornerThreshold);
      if (bp.segments.length > 0) curves.push(bp);
    }
  } else {
    if (opts.useMarchingSquares) {
      // 灰度亚像素 marching squares 等值线：保留抗锯齿子像素边界
      const polys = marchingSquaresGray(gray, w, h, {
        levels: opts.marchLevels,
        smoothRadius: opts.marchSmoothRadius,
        minPerimeter: opts.marchMinPerimeter,
      });
      const rdpEps = Math.max(0.25, opts.errorThreshold * 0.5);
      for (const poly of polys) {
        const simplified: Polyline = {
          points: rdpSimplify(poly.points, rdpEps),
          closed: poly.closed,
          area: poly.area,
        };
        if (simplified.points.length < 3) continue;
        const bp = polylineToBezierPath(
          simplified,
          opts.fitMode,
          opts.errorThreshold,
          opts.cornerThreshold,
          opts.fourierOrder,
        );
        if (bp.segments.length > 0) {
          bp.area = poly.area;
          curves.push(bp);
        }
      }
    } else if (opts.useEdgeDetection) {
      // 边缘检测作为轮廓来源：sobel 幅值阈值化 或 canny 输出 0/1 边缘图
      let bin: Uint8Array;
      if (opts.edgeMethod === 'canny') {
        bin = canny(gray, w, h, opts.cannyLow, opts.cannyHigh);
      } else {
        const mag = sobel(gray, w, h);
        bin = new Uint8Array(w * h);
        for (let i = 0; i < mag.length; i++) bin[i] = mag[i] > 80 ? 1 : 0;
      }
      if (opts.denoiseRadius > 0) bin = binaryMorphology(bin, w, h, 'open', opts.denoiseRadius);
      bin = removeSmallRegions(bin, w, h, opts.turdsize);
      extractContours(bin, w, h, curves, opts);
    } else {
      const labels = multiLevelThreshold(gray, w, h, opts.levels);
      for (let lvl = 0; lvl < opts.levels; lvl++) {
        let bin = binarizeByLevel(labels, w, h, lvl);
        // 跳过空层
        let any = false;
        for (let i = 0; i < bin.length; i++) {
          if (bin[i] === 1) {
            any = true;
            break;
          }
        }
        if (!any) continue;
        // 跳过跨越四条边的背景级
        if (isBackgroundLevel(bin, w, h)) continue;
        if (opts.denoiseRadius > 0) bin = binaryMorphology(bin, w, h, 'open', opts.denoiseRadius);
        bin = removeSmallRegions(bin, w, h, opts.turdsize);
        extractContours(bin, w, h, curves, opts);
      }
    }
  }

  return {
    curves,
    width: w,
    height: h,
    metadata: {
      fitMode: opts.fitMode,
      levels: opts.levels,
      skeletonize: opts.skeletonize,
      curveCount: curves.length,
      ...(downsampled ? { downsampled: true, scaleFactor } : {}),
    },
  };
}

// 重新导出全部子模块公开 API
export * from './types';
export * from './coords';
export * from './preprocess';
export * from './edges';
export * from './trace';
export * from './marchingSquare';
export * from './skeleton';
export {
  rdpSimplify,
  rdpSimplifyClosed,
  detectCorners,
  fitBezierArc,
  fitBezierPath,
  fitBezierPaths,
  flipYBezierPaths,
  polylineLength,
  evalBezier,
} from './fit';
export {
  fitFourier,
  sampleFourier,
  sampleFourierCurve,
  fourierError,
} from './fourier';
export * from './curveCandidates';
export {
  videoToCurves,
  associateTracks,
  smoothTrack,
  samplePath,
  savitzkyGolay,
  savgolKernel,
  throttleFrames,
  type VideoToCurvesOptions,
  type VideoToCurvesResult,
  type VideoTrack,
} from './videoToCurves';
export { visionWorkerClient, type VisionWorkerClient } from './visionWorkerClient';
export {
  fineOutline,
  splitSixChannels,
  fusedMultiChannelGradient,
  type FineOutlineOptions,
  type FineOutlineResult,
} from './fineOutline';
