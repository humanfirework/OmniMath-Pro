import { beforeEach, describe, expect, it } from 'vitest';
import {
  SURFACE_SAMPLING_CACHE_CAPACITY,
  SurfaceSamplingGeneration,
  buildSurfaceCacheKey,
  clearSurfaceSamplingCache,
  getCachedSurfaceSample,
  normalizeSurfaceResolution,
  putCachedSurfaceSample,
  surfaceRangeKey,
  surfaceSamplingCacheSize,
  type SurfaceSampleRequest,
} from './surfaceSamplingCache';

function makeRequest(
  overrides: Partial<SurfaceSampleRequest> = {},
): SurfaceSampleRequest {
  return {
    plotId: 'plot-1',
    expression: 'x^2 - y^2',
    xRange: [-5, 5],
    yRange: [-5, 5],
    surfaceMode: 'explicit',
    resolution: 60,
    scopeVersion: 3,
    ...overrides,
  };
}

describe('surfaceRangeKey', () => {
  it('formats ranges stably and normalizes -0', () => {
    expect(surfaceRangeKey([-5, 5])).toBe('-5,5');
    expect(surfaceRangeKey([-0, 0])).toBe('0,0');
  });
});

describe('normalizeSurfaceResolution', () => {
  it('clamps implicit resolution into 12..44', () => {
    expect(normalizeSurfaceResolution('implicit', 5)).toBe(12);
    expect(normalizeSurfaceResolution('implicit', 34)).toBe(34);
    expect(normalizeSurfaceResolution('implicit', 100)).toBe(44);
  });

  it('clamps explicit resolution into 2..200', () => {
    expect(normalizeSurfaceResolution('explicit', 0)).toBe(2);
    expect(normalizeSurfaceResolution('explicit', 60)).toBe(60);
    expect(normalizeSurfaceResolution('explicit', 999)).toBe(200);
  });

  it('falls back to sensible defaults for non-finite values', () => {
    expect(normalizeSurfaceResolution('implicit', NaN)).toBe(34);
    expect(normalizeSurfaceResolution('explicit', Infinity)).toBe(60);
  });

  it('floors fractional resolutions', () => {
    expect(normalizeSurfaceResolution('implicit', 24.9)).toBe(24);
  });
});

describe('buildSurfaceCacheKey', () => {
  it('is stable for identical requests', () => {
    expect(buildSurfaceCacheKey(makeRequest())).toBe(
      buildSurfaceCacheKey(makeRequest()),
    );
  });

  it('normalizes resolution before building the key', () => {
    expect(buildSurfaceCacheKey(makeRequest({ resolution: 44.9 }))).toBe(
      buildSurfaceCacheKey(makeRequest({ resolution: 44 })),
    );
  });

  it('changes when any keyed field changes', () => {
    const base = buildSurfaceCacheKey(makeRequest());
    const variants: Array<Partial<SurfaceSampleRequest>> = [
      { plotId: 'plot-2' },
      { expression: 'sin(x)*cos(y)' },
      { xRange: [-4, 4] },
      { yRange: [-4, 4] },
      { surfaceMode: 'implicit' },
      { resolution: 80 },
      { scopeVersion: 4 },
    ];
    for (const variant of variants) {
      expect(buildSurfaceCacheKey(makeRequest(variant))).not.toBe(base);
    }
  });

  it('distinguishes swapped x / y ranges', () => {
    const a = buildSurfaceCacheKey(
      makeRequest({ xRange: [1, 2], yRange: [3, 4] }),
    );
    const b = buildSurfaceCacheKey(
      makeRequest({ xRange: [3, 4], yRange: [1, 2] }),
    );
    expect(a).not.toBe(b);
  });
});

describe('surface sampling cache', () => {
  beforeEach(() => {
    clearSurfaceSamplingCache();
  });

  it('returns undefined on a miss and the stored value on a hit', () => {
    const key = buildSurfaceCacheKey(makeRequest());
    expect(getCachedSurfaceSample(key)).toBeUndefined();

    const result = { data: null, error: 'boom' };
    putCachedSurfaceSample(key, result);
    expect(getCachedSurfaceSample(key)).toBe(result);
    expect(surfaceSamplingCacheSize()).toBe(1);
  });

  it('evicts the least-recently-used entry when full', () => {
    for (let i = 0; i < SURFACE_SAMPLING_CACHE_CAPACITY; i++) {
      putCachedSurfaceSample(`k${i}`, { data: null, error: null });
    }
    expect(surfaceSamplingCacheSize()).toBe(SURFACE_SAMPLING_CACHE_CAPACITY);

    // Touch k0 so k1 becomes the oldest entry.
    expect(getCachedSurfaceSample('k0')).toBeDefined();
    putCachedSurfaceSample('fresh', { data: null, error: null });

    expect(surfaceSamplingCacheSize()).toBe(SURFACE_SAMPLING_CACHE_CAPACITY);
    expect(getCachedSurfaceSample('k0')).toBeDefined();
    expect(getCachedSurfaceSample('k1')).toBeUndefined();
    expect(getCachedSurfaceSample('fresh')).toBeDefined();
  });

  it('clears every entry', () => {
    putCachedSurfaceSample('a', { data: null, error: null });
    putCachedSurfaceSample('b', { data: null, error: null });
    clearSurfaceSamplingCache();
    expect(surfaceSamplingCacheSize()).toBe(0);
  });
});

describe('SurfaceSamplingGeneration', () => {
  it('treats only the newest token as current', () => {
    const guard = new SurfaceSamplingGeneration();
    const first = guard.next();
    expect(guard.isCurrent(first)).toBe(true);

    const second = guard.next();
    expect(guard.isCurrent(second)).toBe(true);
    expect(guard.isCurrent(first)).toBe(false);
  });

  it('invalidates outstanding tokens without resurrecting them', () => {
    const guard = new SurfaceSamplingGeneration();
    const token = guard.next();
    guard.invalidate();
    expect(guard.isCurrent(token)).toBe(false);

    const next = guard.next();
    expect(guard.isCurrent(next)).toBe(true);
    expect(guard.isCurrent(token)).toBe(false);
  });

  it('never accepts the initial zero token', () => {
    const guard = new SurfaceSamplingGeneration();
    expect(guard.isCurrent(0)).toBe(false);
  });
});
