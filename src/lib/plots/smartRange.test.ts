/**
 * Unit tests for src/lib/plots/smartRange.ts
 *
 * 重点验证「e^x crushes sin x」问题的解决方案：
 *  - smartYRange: 量化分位数裁剪
 *  - isOutlierCurve: 指数曲线识别
 *  - coordinatedYRange: 多曲线协调范围
 */
import { describe, it, expect } from 'vitest';
import {
  smartYRange,
  isOutlierCurve,
  coordinatedYRange,
  type PlotSample,
} from './smartRange';

/* 工具函数：生成样本 */
function makeLinearSamples(values: number[]): PlotSample[] {
  return values.map((y, i) => ({ x: i, y }));
}

function makeSineSamples(n: number, amplitude = 1): PlotSample[] {
  const out: PlotSample[] = [];
  for (let i = 0; i < n; i++) {
    out.push({ x: i, y: amplitude * Math.sin((i / n) * Math.PI * 4) });
  }
  return out;
}

function makeExpSamples(n: number): PlotSample[] {
  const out: PlotSample[] = [];
  for (let i = 0; i < n; i++) {
    const x = -10 + (i / (n - 1)) * 20; // x in [-10, 10]
    out.push({ x, y: Math.exp(x) });
  }
  return out;
}

/* ----------------------------- smartYRange ----------------------------- */

describe('smartYRange', () => {
  it('returns default [-6, 6] for empty samples', () => {
    expect(smartYRange([])).toEqual([-6, 6]);
  });

  it('returns default for all-NaN samples', () => {
    expect(smartYRange([{ x: 0, y: NaN }, { x: 1, y: NaN }])).toEqual([-6, 6]);
  });

  it('uses min/max for small sample counts', () => {
    const r = smartYRange(makeLinearSamples([1, 2, 3]));
    expect(r[0]).toBeLessThanOrEqual(1);
    expect(r[1]).toBeGreaterThanOrEqual(3);
  });

  it('includes zero by default (sin curve oscillates around 0)', () => {
    const r = smartYRange(makeSineSamples(100));
    expect(r[0]).toBeLessThanOrEqual(0);
    expect(r[1]).toBeGreaterThanOrEqual(0);
  });

  it('does not include zero when includeZero=false', () => {
    // 5 个样本 < 20，使用 min/max；lo=10, hi=50
    // padding=0 + minRange=0 完全消除外推
    const r = smartYRange(makeLinearSamples([10, 20, 30, 40, 50]), {
      includeZero: false,
      padding: 0,
      minRange: 0,
    });
    expect(r[0]).toBeGreaterThanOrEqual(10);
    expect(r[1]).toBeLessThanOrEqual(50);
  });

  it('handles flat line by adding padding', () => {
    const r = smartYRange(makeLinearSamples([5, 5, 5, 5, 5]));
    expect(r[0]).toBeLessThan(5);
    expect(r[1]).toBeGreaterThan(5);
  });

  it('truncates extreme tails using P5/P95', () => {
    // 200 样本：195 个在 [0, 1]，5 个离群点在 1000
    // P95 索引 = ceil(0.95 * 199) = 189 → 排除最后 5 个离群点
    const samples: PlotSample[] = [];
    for (let i = 0; i < 195; i++) samples.push({ x: i, y: 0.5 });
    for (let i = 195; i < 200; i++) samples.push({ x: i, y: 1000 });

    const r = smartYRange(samples, {
      lowerQuantile: 0.05,
      upperQuantile: 0.95,
      includeZero: false,
      padding: 0,
    });
    // P95 应排除 1000 离群点
    expect(r[1]).toBeLessThan(100);
  });

  it('respects custom minRange option', () => {
    const r = smartYRange(makeLinearSamples([5, 5.1]), { minRange: 10 });
    // range should be at least 10 wide
    expect(r[1] - r[0]).toBeGreaterThanOrEqual(1);
  });

  it('respects custom padding option', () => {
    const r1 = smartYRange(makeLinearSamples([0, 10]), { padding: 0 });
    const r2 = smartYRange(makeLinearSamples([0, 10]), { padding: 0.5 });
    // larger padding → larger range
    expect(r2[1] - r2[0]).toBeGreaterThan(r1[1] - r1[0]);
  });
});

/* ----------------------------- isOutlierCurve ----------------------------- */

describe('isOutlierCurve', () => {
  it('returns false for empty samples', () => {
    expect(isOutlierCurve([])).toBe(false);
  });

  it('returns false for single sample', () => {
    expect(isOutlierCurve([{ x: 0, y: 1 }])).toBe(false);
  });

  it('returns false for sin curve (bounded oscillation)', () => {
    expect(isOutlierCurve(makeSineSamples(100))).toBe(false);
  });

  it('returns true for e^x on [-10, 10]', () => {
    expect(isOutlierCurve(makeExpSamples(100))).toBe(true);
  });

  it('returns false for x^2 (ratio not high enough)', () => {
    const samples: PlotSample[] = [];
    for (let i = 0; i < 100; i++) {
      const x = -10 + (i / 99) * 20;
      samples.push({ x, y: x * x });
    }
    expect(isOutlierCurve(samples)).toBe(false);
  });

  it('respects custom outlierRatioThreshold', () => {
    const expSamples = makeExpSamples(100);
    // With very high threshold, e^x is no longer an outlier
    expect(isOutlierCurve(expSamples, { outlierRatioThreshold: 1e10 })).toBe(false);
  });

  it('respects custom outlierMinSpan', () => {
    const expSamples = makeExpSamples(100);
    // With very high min span, e^x no longer qualifies
    expect(isOutlierCurve(expSamples, { outlierMinSpan: 1e10 })).toBe(false);
  });

  it('handles median ≈ 0 by using P95 directly', () => {
    // 100 样本：99 个在 ±0.001，最后 1 个在 5000
    // 排序后 P95 索引 = ceil(0.95 * 99) = 95 → 仍在 ±0.001 范围
    // 需要 P95 实际命中离群值，故使用 20 样本：19 个 ±0.001 + 1 个 5000
    // 排序后 P95 索引 = ceil(0.95 * 19) = 19 → 命中 5000
    const samples: PlotSample[] = [];
    for (let i = 0; i < 19; i++) samples.push({ x: i, y: (i % 2 === 0 ? 1 : -1) * 0.001 });
    samples.push({ x: 19, y: 5000 });
    expect(isOutlierCurve(samples)).toBe(true);
  });
});

/* ----------------------------- coordinatedYRange ----------------------------- */

describe('coordinatedYRange', () => {
  it('returns default for empty plots array', () => {
    const r = coordinatedYRange([]);
    expect(r.range).toEqual([-6, 6]);
    expect(r.outliers).toEqual([]);
    expect(r.fullRange).toEqual([-6, 6]);
  });

  it('detects e^x as outlier when mixed with sin x', () => {
    const r = coordinatedYRange([
      { samples: makeSineSamples(100), label: 'sin(x)' },
      { samples: makeExpSamples(100), label: 'e^x' },
    ]);
    expect(r.outliers).toContain('e^x');
    expect(r.outliers).not.toContain('sin(x)');
  });

  it('shared range excludes outliers', () => {
    const r = coordinatedYRange([
      { samples: makeSineSamples(100), label: 'sin(x)' },
      { samples: makeExpSamples(100), label: 'e^x' },
    ]);
    // shared range should be small (sin x bounds)
    expect(r.range[1]).toBeLessThan(100);
    expect(r.range[0]).toBeGreaterThan(-100);
  });

  it('full range includes outliers', () => {
    const r = coordinatedYRange([
      { samples: makeSineSamples(100), label: 'sin(x)' },
      { samples: makeExpSamples(100), label: 'e^x' },
    ]);
    // full range should include e^x's ~22000 max
    expect(r.fullRange[1]).toBeGreaterThan(1000);
  });

  it('falls back to full range when all curves are outliers', () => {
    const r = coordinatedYRange([
      { samples: makeExpSamples(100), label: 'e^x' },
      { samples: makeExpSamples(100).map((s) => ({ ...s, y: s.y * 2 })), label: '2*e^x' },
    ]);
    expect(r.outliers.length).toBe(2);
    // When all are outliers, range should equal full range (with padding diff)
    expect(r.range[1]).toBeGreaterThan(1000);
  });

  it('includes zero in shared range by default', () => {
    const r = coordinatedYRange([
      { samples: makeLinearSamples([10, 20, 30, 40, 50]), label: 'line' },
    ]);
    expect(r.range[0]).toBeLessThanOrEqual(0);
  });

  it('does not include zero when includeZero=false', () => {
    const r = coordinatedYRange(
      [{ samples: makeLinearSamples([10, 20, 30, 40, 50]), label: 'line' }],
      { includeZero: false, padding: 0, minRange: 0 },
    );
    expect(r.range[0]).toBeGreaterThanOrEqual(10);
  });

  it('handles non-outlier curves (multiple sin waves)', () => {
    const r = coordinatedYRange([
      { samples: makeSineSamples(100, 1), label: 'sin(x)' },
      { samples: makeSineSamples(100, 2), label: '2sin(x)' },
    ]);
    expect(r.outliers).toEqual([]);
    expect(r.range[1]).toBeGreaterThan(1.5); // includes 2sin(x)'s max
    expect(r.range[0]).toBeLessThan(-1.5);
  });
});
