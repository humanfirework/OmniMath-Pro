/**
 * Unit tests for src/lib/plots/implicit2d.ts
 *
 * 覆盖：圆 / 直线 / 椭圆 / 双曲线 / 空解 / 退化方程 / 非法输入，
 * 以及 marching-squares 输出的「两点线段 + NaN 断点」约定。
 */
import { describe, it, expect } from 'vitest';
import { sampleImplicit2D } from './implicit2d';
import {
  sampleCurve,
  implicitResolutionForCount,
  implicitInteractiveResolutionForCount,
  type Curve2DSpec,
  type PlotSample,
} from './plot2d';

/** 只保留有限（可绘制）的采样点。 */
function finitePoints(samples: PlotSample[]): PlotSample[] {
  return samples.filter((s) => Number.isFinite(s.x) && Number.isFinite(s.y));
}

/** 由 NaN 断点切分的连续线段（每段应恰好两点）。 */
function segments(samples: PlotSample[]): PlotSample[][] {
  const out: PlotSample[][] = [];
  let run: PlotSample[] = [];
  for (const s of samples) {
    if (Number.isFinite(s.x) && Number.isFinite(s.y)) {
      run.push(s);
    } else if (run.length > 0) {
      out.push(run);
      run = [];
    }
  }
  if (run.length > 0) out.push(run);
  return out;
}

describe('sampleImplicit2D — 基本曲线', () => {
  it('x^2 + y^2 = 4 → 半径 2 的圆', () => {
    const samples = sampleImplicit2D('x^2 + y^2 = 4', [-3, 3], [-3, 3], 80);
    const pts = finitePoints(samples);
    expect(pts.length).toBeGreaterThan(32);
    for (const p of pts) {
      expect(Math.abs(Math.hypot(p.x, p.y) - 2)).toBeLessThan(0.15);
    }
  });

  it('x + y = 1 → 直线 x + y ≈ 1', () => {
    const samples = sampleImplicit2D('x + y = 1', [-5, 5], [-5, 5], 64);
    const pts = finitePoints(samples);
    expect(pts.length).toBeGreaterThan(10);
    for (const p of pts) {
      expect(Math.abs(p.x + p.y - 1)).toBeLessThan(1e-6);
    }
  });

  it('x = 3 → 竖直直线', () => {
    const pts = finitePoints(sampleImplicit2D('x = 3', [-5, 5], [-5, 5], 48));
    expect(pts.length).toBeGreaterThan(10);
    for (const p of pts) {
      expect(Math.abs(p.x - 3)).toBeLessThan(1e-6);
    }
  });

  it('x^2/4 + y^2 = 1 → 椭圆', () => {
    const samples = sampleImplicit2D('x^2/4 + y^2 = 1', [-3, 3], [-2, 2], 80);
    const pts = finitePoints(samples);
    expect(pts.length).toBeGreaterThan(32);
    for (const p of pts) {
      const f = (p.x * p.x) / 4 + p.y * p.y;
      expect(Math.abs(f - 1)).toBeLessThan(0.15);
    }
  });

  it('x^2 - y^2 = 1 → 双曲线两支', () => {
    const samples = sampleImplicit2D('x^2 - y^2 = 1', [-4, 4], [-4, 4], 96);
    const pts = finitePoints(samples);
    expect(pts.length).toBeGreaterThan(32);
    for (const p of pts) {
      expect(Math.abs(p.x * p.x - p.y * p.y - 1)).toBeLessThan(0.3);
    }
    // 两支：存在 x > 1 与 x < -1 的点。
    expect(pts.some((p) => p.x > 1)).toBe(true);
    expect(pts.some((p) => p.x < -1)).toBe(true);
  });

  it('保留「两点线段 + NaN 断点」的输出约定', () => {
    const samples = sampleImplicit2D('x^2 + y^2 = 4', [-3, 3], [-3, 3], 48);
    // 末尾不能是 NaN 断点。
    const last = samples[samples.length - 1];
    expect(Number.isFinite(last.x) && Number.isFinite(last.y)).toBe(true);
    // 每段恰好两个点。
    for (const seg of segments(samples)) {
      expect(seg.length).toBe(2);
    }
  });
});

describe('sampleImplicit2D — 空解 / 退化 / 非法输入', () => {
  it('x^2 + y^2 = -1 → 无有限点', () => {
    const samples = sampleImplicit2D('x^2 + y^2 = -1', [-3, 3], [-3, 3], 64);
    expect(finitePoints(samples)).toHaveLength(0);
  });

  it('x^2 + y^2 = 0 → 退化点不产生伪线段，也不抛错', () => {
    const samples = sampleImplicit2D('x^2 + y^2 = 0', [-3, 3], [-3, 3], 64);
    expect(finitePoints(samples)).toHaveLength(0);
  });

  it('非法表达式返回 [] 且不抛错', () => {
    expect(sampleImplicit2D('x^2 + y^2 =', [-3, 3], [-3, 3])).toEqual([]);
    expect(sampleImplicit2D('sin(', [-3, 3], [-3, 3])).toEqual([]);
    expect(sampleImplicit2D('x +* y = 1', [-3, 3], [-3, 3])).toEqual([]);
    expect(sampleImplicit2D('', [-3, 3], [-3, 3])).toEqual([]);
  });

  it('忽略 ==、非方程输入与非法范围', () => {
    expect(sampleImplicit2D('x^2 + y^2 == 4', [-3, 3], [-3, 3])).toEqual([]);
    expect(sampleImplicit2D('x + y <= 1', [-3, 3], [-3, 3])).toEqual([]);
    expect(sampleImplicit2D('x + y', [-3, 3], [-3, 3])).toEqual([]);
    expect(sampleImplicit2D('x = 1', [2, 2], [-3, 3])).toEqual([]);
    expect(sampleImplicit2D('x = 1', [-3, 3], [NaN, 3])).toEqual([]);
  });
});

describe('sampleImplicit2D — 分辨率', () => {
  it('分辨率越高点数越多，但仍落在同一条曲线上', () => {
    const coarse = finitePoints(sampleImplicit2D('x^2 + y^2 = 4', [-3, 3], [-3, 3], 24));
    const fine = finitePoints(sampleImplicit2D('x^2 + y^2 = 4', [-3, 3], [-3, 3], 96));
    expect(fine.length).toBeGreaterThan(coarse.length);
    for (const p of fine) {
      expect(Math.abs(Math.hypot(p.x, p.y) - 2)).toBeLessThan(0.1);
    }
  });
});

describe('sampleCurve — implicit2d 分发', () => {
  it('使用 xRange 与 yRange 双轴采样', () => {
    const spec: Curve2DSpec = {
      mode: 'implicit2d',
      exprX: 'x^2 + y^2 = 4',
      exprY: '',
      paramRange: [-10, 10],
    };
    const full = finitePoints(sampleCurve(spec, [-3, 3], 800, [-3, 3]));
    expect(full.length).toBeGreaterThan(32);
    for (const p of full) {
      expect(Math.abs(Math.hypot(p.x, p.y) - 2)).toBeLessThan(0.15);
    }

    // 只保留上半平面时，所有采样点都应在 y >= 0。
    const upper = finitePoints(sampleCurve(spec, [-3, 3], 800, [0, 3]));
    expect(upper.length).toBeGreaterThan(0);
    for (const p of upper) {
      expect(p.y).toBeGreaterThanOrEqual(-1e-9);
      expect(Math.abs(Math.hypot(p.x, p.y) - 2)).toBeLessThan(0.15);
    }
  });

  it('交互期显式分辨率覆盖 count 推导值', () => {
    const spec: Curve2DSpec = {
      mode: 'implicit2d',
      exprX: 'x^2 + y^2 = 4',
      exprY: '',
      paramRange: [-10, 10],
    };
    const interactive = finitePoints(sampleCurve(spec, [-3, 3], 800, [-3, 3], 48));
    const full = finitePoints(sampleCurve(spec, [-3, 3], 800, [-3, 3]));
    // 48² 网格点数明显少于 96²，但仍是同一条圆。
    expect(interactive.length).toBeLessThan(full.length);
    expect(interactive.length).toBeGreaterThan(16);
    for (const p of interactive) {
      expect(Math.abs(Math.hypot(p.x, p.y) - 2)).toBeLessThan(0.25);
    }
  });
});

describe('implicitResolutionForCount / implicitInteractiveResolutionForCount', () => {
  it('full resolution follows the historical 96 / 80 / 64 budget', () => {
    expect(implicitResolutionForCount(1600)).toBe(96);
    expect(implicitResolutionForCount(800)).toBe(96);
    expect(implicitResolutionForCount(600)).toBe(80);
    expect(implicitResolutionForCount(400)).toBe(80);
    expect(implicitResolutionForCount(300)).toBe(64);
    expect(implicitResolutionForCount(Number.NaN)).toBe(80);
  });

  it('interactive resolution stays in the 48–64 band and below full', () => {
    for (const count of [1600, 800, 600, 400, 300, Number.NaN]) {
      const full = implicitResolutionForCount(count);
      const interactive = implicitInteractiveResolutionForCount(count);
      expect(interactive).toBeGreaterThanOrEqual(48);
      expect(interactive).toBeLessThanOrEqual(64);
      expect(interactive).toBeLessThan(full);
    }
  });
});
