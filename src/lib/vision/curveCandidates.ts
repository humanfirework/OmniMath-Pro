/**
 * 曲线拟合「候选项」生成 —— 图像转曲线的容错增强。
 *
 * 识别经常不准：同一输入用不同拟合参数（误差阈值 / 角点阈值）会得到
 * 差异较大的结果。此模块针对同一组折线（polylines）一次性生成多组
 * 候选贝塞尔曲线（粗略 / 均衡 / 精细），供用户在 2D 绘图中挑选；
 * 也提供「自定义参数重新拟合」的纯函数，供人工修正面板调用。
 *
 * 全部为纯 TypeScript，无 DOM 依赖，可在主线程 / Web Worker / 单测中运行。
 */

import { fitBezierPaths } from './fit';
import type { Polyline, BezierPath, Point } from './types';

/** 候选档位标识。 */
export type CurveFitPresetId = 'loose' | 'balanced' | 'fine';

/** 候选档位定义（误差阈值越小越贴近原始折线，产生的段数也越多）。 */
export interface CurveFitPreset {
  id: CurveFitPresetId;
  labelZh: string;
  labelEn: string;
  /** 贝塞尔拟合误差阈值（px）。 */
  errorThreshold: number;
  /** 角点检测阈值（rad）。 */
  cornerThreshold: number;
}

export const CURVE_FIT_PRESETS: readonly CurveFitPreset[] = [
  { id: 'loose',    labelZh: '粗略', labelEn: 'Loose',    errorThreshold: 2.5, cornerThreshold: (60 * Math.PI) / 180 },
  { id: 'balanced', labelZh: '均衡', labelEn: 'Balanced', errorThreshold: 1.5, cornerThreshold: (40 * Math.PI) / 180 },
  { id: 'fine',     labelZh: '精细', labelEn: 'Fine',     errorThreshold: 0.5, cornerThreshold: (15 * Math.PI) / 180 },
];

export const CURVE_FIT_PRESET_MAP: Record<CurveFitPresetId, CurveFitPreset> = Object.fromEntries(
  CURVE_FIT_PRESETS.map((p) => [p.id, p]),
) as Record<CurveFitPresetId, CurveFitPreset>;

/** 默认候选档位。 */
export const DEFAULT_CURVE_PRESET: CurveFitPresetId = 'balanced';

/** 一组候选结果。 */
export interface CurveCandidate {
  id: CurveFitPresetId;
  labelZh: string;
  labelEn: string;
  curves: BezierPath[];
  errorThreshold: number;
  cornerThreshold: number;
}

/** 像素 → 数学坐标变换参数（与 curve-fit 节点 config 对应）。 */
export interface CurveTransformParams {
  width: number;
  height: number;
  flipX?: boolean;
  flipY?: boolean;
  scale?: number;
}

/**
 * 对 BezierPath[] 应用 flipX / flipY / scale 变换。
 * 纯函数：返回新数组，不修改输入。公式与 curve-fit 节点一致。
 */
export function applyCurveTransforms(
  curves: BezierPath[],
  params: CurveTransformParams,
): BezierPath[] {
  let result = curves;
  if (params.flipX) result = flipXPaths(result, params.width);
  if (params.flipY) result = flipYPaths(result, params.height);
  const scale = params.scale ?? 1;
  if (Number.isFinite(scale) && scale !== 1) result = scalePaths(result, scale);
  return result;
}

/**
 * 针对同一组折线生成多档候选拟合结果（默认粗略 / 均衡 / 精细）。
 * 拟合后只保留至少含一段贝塞尔的曲线。
 */
export function generateCurveFitCandidates(
  polylines: Polyline[],
  presetIds: readonly CurveFitPresetId[] = ['loose', 'balanced', 'fine'],
): CurveCandidate[] {
  const out: CurveCandidate[] = [];
  for (const id of presetIds) {
    const preset = CURVE_FIT_PRESET_MAP[id];
    if (!preset) continue;
    const curves = fitBezierPaths(polylines, preset.errorThreshold, preset.cornerThreshold).filter(
      (bp) => bp.segments.length > 0,
    );
    // 无曲线的档位没有意义，跳过（如空折线输入时不再产出空候选）。
    if (curves.length === 0) continue;
    out.push({
      id: preset.id,
      labelZh: preset.labelZh,
      labelEn: preset.labelEn,
      curves,
      errorThreshold: preset.errorThreshold,
      cornerThreshold: preset.cornerThreshold,
    });
  }
  return out;
}

/** 重新拟合所需参数：自定义误差阈值 / 角点阈值 + 像素→数学坐标变换。 */
export interface CurveRefitParams extends CurveTransformParams {
  errorThreshold: number;
  cornerThreshold: number;
}

/**
 * 用自定义参数重新拟合折线，并在返回前应用像素→数学坐标变换。
 * 用于「人工修正 → 调节参数重新拟合」，产出与候选同构的结果。
 */
export function refitCurveCandidate(
  polylines: Polyline[],
  params: CurveRefitParams,
): CurveCandidate {
  const curves = fitBezierPaths(polylines, params.errorThreshold, params.cornerThreshold).filter(
    (bp) => bp.segments.length > 0,
  );
  return {
    id: 'balanced',
    labelZh: '自定义',
    labelEn: 'Custom',
    curves: applyCurveTransforms(curves, params),
    errorThreshold: params.errorThreshold,
    cornerThreshold: params.cornerThreshold,
  };
}

/* ------------------------------------------------------------------ *
 * 像素 → 数学坐标变换纯函数（与 vision.ts 中同名工具保持一致）
 * ------------------------------------------------------------------ */

function flipYPaths(curves: BezierPath[], H: number): BezierPath[] {
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

function flipXPaths(curves: BezierPath[], W: number): BezierPath[] {
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

function scalePaths(curves: BezierPath[], scale: number): BezierPath[] {
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