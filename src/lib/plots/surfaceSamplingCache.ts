/**
 * OmniMath Pro — 3D 曲面采样缓存与代际令牌
 *
 * 3D 面板在参数滑块拖动时会对每个曲面重新采样。参数（scope）每变化一步
 * 都会产生一份新的搜索结果，但同一组「图元 id + 表达式 + 定义域 + 采样
 * 模式 + 分辨率 + scope 版本」往往在短时间内被重复请求（快速阶段、细化
 * 阶段、重渲染）。这里用一个小的 LRU 缓存复用已生成的 `Surface3DData`，
 * 避免重复的 mathjs 求值。
 *
 * 同时提供 `SurfaceSamplingGeneration`：每次参数 / 图元 / 分辨率变化都会
 * 领取新的 token，异步细化任务在写回结果前检查 token 是否仍然是最新的，
 * 过期的结果会被直接丢弃（无需 AbortController）。
 *
 * 缓存键 / 归一化 / 代际判断都是纯函数，便于单元测试。
 */

import {
  IMPLICIT_DEFAULT_RESOLUTION,
  IMPLICIT_MAX_RESOLUTION,
  IMPLICIT_MIN_RESOLUTION,
  defaultImplicitZRange,
  trySampleImplicitSurface,
} from './implicit3d';
import { trySampleSurface, type Surface3DData } from './plot3d';

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export type SurfaceSamplingMode = 'explicit' | 'implicit';

export interface SurfaceSampleRequest {
  plotId: string;
  expression: string;
  xRange: [number, number];
  yRange: [number, number];
  surfaceMode: SurfaceSamplingMode;
  /** 每轴网格节点数；参与缓存键前会按模式归一化（见 normalizeSurfaceResolution）。 */
  resolution: number;
  scopeVersion: number;
  /** 单色模式使用的颜色。颜色不参与缓存键（同一图元的颜色稳定）。 */
  color?: string;
}

export interface SurfaceSampleResult {
  data: Surface3DData | null;
  error: string | null;
}

/* ------------------------------------------------------------------ */
/*  Cache key (pure)                                                  */
/* ------------------------------------------------------------------ */

const DEFAULT_EXPLICIT_RESOLUTION = 60;

/**
 * 把分辨率收敛到采样函数实际接受的区间。
 * - implicit：三维网格是 resolution³，限制在 12..44，避免 44³ 以上的爆炸。
 * - explicit：二维网格是 resolution²，限制在 2..200（与 sampleSurface 一致）。
 */
export function normalizeSurfaceResolution(
  mode: SurfaceSamplingMode,
  resolution: number,
): number {
  if (!Number.isFinite(resolution)) {
    return mode === 'implicit'
      ? IMPLICIT_DEFAULT_RESOLUTION
      : DEFAULT_EXPLICIT_RESOLUTION;
  }
  const floored = Math.floor(resolution);
  return mode === 'implicit'
    ? Math.max(IMPLICIT_MIN_RESOLUTION, Math.min(IMPLICIT_MAX_RESOLUTION, floored))
    : Math.max(2, Math.min(200, floored));
}

/** 稳定的数字字符串（把 -0 归一成 0，避免同一范围产生两个缓存键）。 */
function numberKey(value: number): string {
  return Object.is(value, -0) ? '0' : String(value);
}

/** 范围的稳定字符串表示。 */
export function surfaceRangeKey(range: [number, number]): string {
  return `${numberKey(range[0])},${numberKey(range[1])}`;
}

/**
 * 生成缓存键：plotId + 模式 + 表达式 + xRange + yRange + 分辨率 + scope 版本。
 * 分辨率会先归一化，因此 44.9 与 44 命中同一份缓存。
 */
export function buildSurfaceCacheKey(request: SurfaceSampleRequest): string {
  const resolution = normalizeSurfaceResolution(
    request.surfaceMode,
    request.resolution,
  );
  return [
    request.surfaceMode,
    request.plotId,
    request.expression,
    surfaceRangeKey(request.xRange),
    surfaceRangeKey(request.yRange),
    String(resolution),
    String(request.scopeVersion),
  ].join('|');
}

/* ------------------------------------------------------------------ */
/*  LRU cache                                                         */
/* ------------------------------------------------------------------ */

/**
 * 单条曲面数据包含 4 个类型化数组（顶点 / 法线 / 颜色 / 索引），显式
 * 60² 约 0.2MB、隐式 34³ 约 0.5MB。32 条上限大致对应 10MB 以内，足够
 * 覆盖「多个曲面 × 首屏 / 细化」两组结果，又不会无限增长。
 */
export const SURFACE_SAMPLING_CACHE_CAPACITY = 32;

const cache = new Map<string, SurfaceSampleResult>();

/** 读取缓存；命中时把条目移到队尾（Map 的插入顺序即 LRU 顺序）。 */
export function getCachedSurfaceSample(
  key: string,
): SurfaceSampleResult | undefined {
  const hit = cache.get(key);
  if (hit === undefined) return undefined;
  cache.delete(key);
  cache.set(key, hit);
  return hit;
}

/** 写入缓存并按容量淘汰最久未使用的条目。 */
export function putCachedSurfaceSample(
  key: string,
  result: SurfaceSampleResult,
): void {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, result);
  while (cache.size > SURFACE_SAMPLING_CACHE_CAPACITY) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

/** 清空缓存（引擎重置 / 卸载面板时调用）。 */
export function clearSurfaceSamplingCache(): void {
  cache.clear();
}

/** 当前缓存条目数（测试 / 调试用）。 */
export function surfaceSamplingCacheSize(): number {
  return cache.size;
}

/* ------------------------------------------------------------------ */
/*  Sampling                                                          */
/* ------------------------------------------------------------------ */

/**
 * 带缓存的单曲面采样。区分显式 / 隐式走各自的采样器，失败信息保持
 * 与 `trySampleSurface` / `trySampleImplicitSurface` 完全一致。
 */
export function sampleSurfaceCached(
  request: SurfaceSampleRequest,
): SurfaceSampleResult {
  const key = buildSurfaceCacheKey(request);
  const hit = getCachedSurfaceSample(key);
  if (hit !== undefined) return hit;

  const resolution = normalizeSurfaceResolution(
    request.surfaceMode,
    request.resolution,
  );
  const color = request.color ?? '#2dd4bf';

  const result: SurfaceSampleResult =
    request.surfaceMode === 'implicit'
      ? trySampleImplicitSurface(
          request.expression,
          request.xRange,
          request.yRange,
          defaultImplicitZRange(request.xRange, request.yRange),
          resolution,
          color,
        )
      : trySampleSurface(
          request.expression,
          request.xRange,
          request.yRange,
          resolution,
          color,
        );

  putCachedSurfaceSample(key, result);
  return result;
}

/* ------------------------------------------------------------------ */
/*  Generation guard                                                  */
/* ------------------------------------------------------------------ */

/**
 * 单调递增的代际令牌。
 *
 *   const guard = new SurfaceSamplingGeneration();
 *   const token = guard.next();
 *   …异步采样…
 *   if (!guard.isCurrent(token)) return; // 结果已过期
 *
 * `invalidate()` 让当前所有 token 失效，但不会发放新 token；下一次
 * `next()` 会继续递增，因此旧的 token 永远不会重新变为有效。
 */
export class SurfaceSamplingGeneration {
  private current = 0;

  /** 领取一个新的代际令牌。 */
  next(): number {
    this.current += 1;
    return this.current;
  }

  /** 令牌是否仍代表最新一次请求。未领取过（0）永远无效。 */
  isCurrent(token: number): boolean {
    return token !== 0 && token === this.current;
  }

  /** 让已发出的令牌全部失效（例如组件卸载 / 防抖被打断）。 */
  invalidate(): void {
    this.current += 1;
  }

  /** 当前代际值（测试用）。 */
  get value(): number {
    return this.current;
  }
}
