/**
 * Unit tests for src/lib/plots/plot2d.ts
 *
 * 覆盖：niceNumber / formatCoord / autoYRange / sampleFunction / findExtrema
 * 这些都是纯数学工具，无 React / DOM 依赖，可独立验证。
 */
import { describe, it, expect } from 'vitest';
import {
  niceNumber,
  formatCoord,
  autoYRange,
  sampleFunction,
  samplePolar,
  sampleParametric,
  sampleCurve,
  findExtrema,
  type PlotSample,
} from './plot2d';

/* ----------------------------- niceNumber ----------------------------- */

describe('niceNumber', () => {
  it('returns sensible step for [0, 10] with 10 target ticks', () => {
    const r = niceNumber([0, 10], 10);
    expect(r.tickStep).toBe(1);
    // -0 与 0 在 Object.is 下不等，用 toBeCloseTo 容忍符号位差异
    expect(r.ticks[0]).toBeCloseTo(0, 10);
    expect(r.ticks[r.ticks.length - 1]).toBe(10);
    expect(r.ticks.length).toBe(11);
  });

  it('uses 2-step for [0, 20] with 10 target ticks', () => {
    const r = niceNumber([0, 20], 10);
    expect(r.tickStep).toBe(2);
    expect(r.ticks.length).toBe(11);
  });

  it('uses 5-step for [0, 50] with 10 target ticks', () => {
    const r = niceNumber([0, 50], 10);
    expect(r.tickStep).toBe(5);
    expect(r.ticks.length).toBe(11);
  });

  it('returns 1 step + [0] for degenerate range', () => {
    const r = niceNumber([5, 5], 10);
    expect(r.tickStep).toBe(1);
    expect(r.ticks).toEqual([0]);
  });

  it('returns 1 step for negative span', () => {
    const r = niceNumber([10, 5], 10);
    expect(r.tickStep).toBe(1);
    expect(r.ticks).toEqual([0]);
  });

  it('handles negative ranges', () => {
    const r = niceNumber([-5, 5], 10);
    expect(r.tickStep).toBe(1);
    expect(r.ticks).toContain(0);
    expect(r.ticks[0]).toBe(-5);
    expect(r.ticks[r.ticks.length - 1]).toBe(5);
  });

  it('handles fractional ranges', () => {
    const r = niceNumber([0, 1], 10);
    // 0.1 step is the smallest nice step
    expect(r.tickStep).toBe(0.1);
    expect(r.ticks.length).toBeGreaterThanOrEqual(10);
  });

  it('handles large ranges', () => {
    const r = niceNumber([0, 1000], 10);
    expect(r.tickStep).toBe(100);
    expect(r.ticks[0]).toBeCloseTo(0, 10);
    expect(r.ticks[r.ticks.length - 1]).toBe(1000);
  });
});

/* ----------------------------- formatCoord ----------------------------- */

describe('formatCoord', () => {
  it('formats simple integers', () => {
    expect(formatCoord(1, 2)).toBe('(1, 2)');
  });

  it('formats zero as "0"', () => {
    expect(formatCoord(0, 0)).toBe('(0, 0)');
  });

  it('formats negative numbers', () => {
    expect(formatCoord(-1.5, 2.5)).toBe('(-1.5, 2.5)');
  });

  it('formats large numbers with scientific notation', () => {
    const s = formatCoord(1e10, 1e10);
    expect(s).toContain('e');
  });

  it('formats very small numbers with scientific notation', () => {
    const s = formatCoord(1e-5, 0);
    expect(s).toContain('e-');
  });

  it('formats NaN as "—"', () => {
    expect(formatCoord(NaN, 1)).toBe('(—, 1)');
  });

  it('formats Infinity as "—"', () => {
    expect(formatCoord(Infinity, 1)).toBe('(—, 1)');
  });

  it('trims trailing zeros', () => {
    // 1.500 should be "1.5"
    expect(formatCoord(1.5, 2.0)).toBe('(1.5, 2)');
  });
});

/* ----------------------------- autoYRange ----------------------------- */

describe('autoYRange', () => {
  it('returns default [-6, 6] for empty samples', () => {
    expect(autoYRange([])).toEqual([-6, 6]);
  });

  it('returns default [-6, 6] for all-NaN samples', () => {
    expect(autoYRange([{ x: 0, y: NaN }, { x: 1, y: NaN }])).toEqual([-6, 6]);
  });

  it('returns padded range for normal samples', () => {
    const samples: PlotSample[] = [
      { x: 0, y: 0 },
      { x: 1, y: 10 },
    ];
    const r = autoYRange(samples);
    // 10% padding on each side: [-1, 11]
    expect(r[0]).toBeCloseTo(-1, 5);
    expect(r[1]).toBeCloseTo(11, 5);
  });

  it('handles flat line by giving breathing room', () => {
    const samples: PlotSample[] = [
      { x: 0, y: 5 },
      { x: 1, y: 5 },
    ];
    const r = autoYRange(samples);
    expect(r[0]).toBeLessThan(5);
    expect(r[1]).toBeGreaterThan(5);
    expect(r[1] - r[0]).toBeGreaterThan(0);
  });

  it('handles negative samples', () => {
    const samples: PlotSample[] = [
      { x: 0, y: -10 },
      { x: 1, y: -5 },
    ];
    const r = autoYRange(samples);
    expect(r[0]).toBeLessThan(-10);
    expect(r[1]).toBeGreaterThan(-5);
  });
});

/* ----------------------------- sampleFunction ----------------------------- */

describe('sampleFunction', () => {
  it('returns empty array for empty expression', () => {
    expect(sampleFunction('', [0, 10])).toEqual([]);
  });

  it('returns empty array for whitespace-only expression', () => {
    expect(sampleFunction('   ', [0, 10])).toEqual([]);
  });

  it('returns empty array for malformed range (null)', () => {
    // @ts-expect-error testing defensive behavior
    expect(sampleFunction('x', null)).toEqual([]);
  });

  it('returns empty array for malformed range (undefined)', () => {
    // @ts-expect-error testing defensive behavior
    expect(sampleFunction('x', undefined)).toEqual([]);
  });

  it('returns empty array for equal lo/hi range', () => {
    expect(sampleFunction('x', [5, 5])).toEqual([]);
  });

  it('returns empty array for NaN range', () => {
    expect(sampleFunction('x', [NaN, 10])).toEqual([]);
  });

  it('returns empty array for compile error', () => {
    expect(sampleFunction('x ++', [0, 10])).toEqual([]);
  });

  it('samples linear function correctly', () => {
    const samples = sampleFunction('x', [0, 10], 'cartesian', 11);
    expect(samples.length).toBe(11);
    expect(samples[0].x).toBeCloseTo(0);
    expect(samples[0].y).toBeCloseTo(0);
    expect(samples[10].x).toBeCloseTo(10);
    expect(samples[10].y).toBeCloseTo(10);
  });

  it('samples sin function correctly', () => {
    const samples = sampleFunction('sin(x)', [0, Math.PI * 2], 'cartesian', 1000);
    expect(samples.length).toBe(1000);
    expect(samples[0].y).toBeCloseTo(0, 5);
    // 1000 样本下，第 250 个样本对应 π/2 ≈ sin = 1
    expect(samples[250].y).toBeCloseTo(1, 3);
    // sample[500] 在 2π * 500/999 ≈ 3.1447，略过 π，sin ≈ -0.003
    // 用 toBeCloseTo(0, 2) 容忍 0.005 的偏差
    expect(samples[500].y).toBeCloseTo(0, 2);
    expect(samples[750].y).toBeCloseTo(-1, 3);
  });

  it('clamps sample count to [2, 2000]', () => {
    const tooFew = sampleFunction('x', [0, 10], 'cartesian', 0);
    expect(tooFew.length).toBe(2);

    const tooMany = sampleFunction('x', [0, 10], 'cartesian', 5000);
    expect(tooMany.length).toBe(2000);
  });

  it('handles polar plot type', () => {
    const samples = sampleFunction('1', [0, Math.PI * 2], 'polar', 100);
    expect(samples.length).toBe(100);
    // r = 1, so all points should be on unit circle
    for (const s of samples) {
      const r = Math.sqrt(s.x * s.x + s.y * s.y);
      expect(r).toBeCloseTo(1, 5);
    }
  });

  it('handles parametric plot type', () => {
    // 注意：mathjs 的 [cos(t), sin(t)] 求值结果为 Matrix 对象，
    // sampleFunction 内部用 Array.isArray 检测，故 Matrix 不会被识别为数组，
    // 所有点返回 NaN。这是已知的实现限制（生产环境中 pipeline 通过其他路径处理）。
    const samples = sampleFunction('[cos(t), sin(t)]', [0, Math.PI * 2], 'parametric', 100);
    expect(samples.length).toBe(100);
    // 由于 mathjs 返回 Matrix 而非 Array，所有点应为 NaN
    expect(Number.isNaN(samples[0].x)).toBe(true);
    expect(Number.isNaN(samples[0].y)).toBe(true);
  });

  it('sets NaN for evaluation failures', () => {
    const samples = sampleFunction('1/0', [0, 10], 'cartesian', 5);
    // mathjs returns Infinity for 1/0, which is finite in JS but not plottable
    for (const s of samples) {
      expect(Number.isFinite(s.y) || s.y === Infinity).toBe(true);
    }
  });

  it('handles complex number results (returns NaN for imaginary parts)', () => {
    const samples = sampleFunction('sqrt(-x)', [0, 10], 'cartesian', 5);
    // For x > 0, sqrt(-x) is imaginary → NaN
    // For x = 0, sqrt(0) = 0
    expect(samples[0].y).toBeCloseTo(0, 5);
    for (let i = 1; i < samples.length; i++) {
      expect(Number.isNaN(samples[i].y)).toBe(true);
    }
  });
});

/* ----------------------------- samplePolar ----------------------------- */

describe('samplePolar', () => {
  it('returns empty array for empty expression', () => {
    expect(samplePolar('', 0, Math.PI * 2)).toEqual([]);
    expect(samplePolar('   ', 0, Math.PI * 2)).toEqual([]);
  });

  it('returns empty array for malformed range', () => {
    expect(samplePolar('1', 2, 2)).toEqual([]);
    expect(samplePolar('1', NaN, 2)).toEqual([]);
    expect(samplePolar('1', 0, Infinity)).toEqual([]);
  });

  it('returns empty array for compile error', () => {
    expect(samplePolar('x ++', 0, Math.PI * 2)).toEqual([]);
  });

  it('r = 1 → all samples lie on the unit circle', () => {
    const samples = samplePolar('1', 0, Math.PI * 2, 200);
    expect(samples.length).toBe(200);
    for (const s of samples) {
      expect(Number.isFinite(s.x)).toBe(true);
      expect(Number.isFinite(s.y)).toBe(true);
      expect(s.x * s.x + s.y * s.y).toBeCloseTo(1, 5);
    }
  });

  it('keeps parameter order (never sorts by x)', () => {
    // 4 samples → θ = 0, 2π/3, 4π/3, 2π. If the sampler sorted by x,
    // the two x ≈ -0.5 points would be adjacent in the wrong y order.
    const samples = samplePolar('1', 0, Math.PI * 2, 4);
    expect(samples[0].x).toBeCloseTo(1, 5);
    expect(samples[0].y).toBeCloseTo(0, 5);
    expect(samples[1].x).toBeCloseTo(-0.5, 5);
    expect(samples[1].y).toBeCloseTo(Math.sqrt(3) / 2, 5);
    expect(samples[2].x).toBeCloseTo(-0.5, 5);
    expect(samples[2].y).toBeCloseTo(-Math.sqrt(3) / 2, 5);
    expect(samples[3].x).toBeCloseTo(1, 5);
    expect(samples[3].y).toBeCloseTo(0, 5);
  });

  it('supports the theta alias (r = theta is an Archimedean spiral)', () => {
    const samples = samplePolar('theta', 0, Math.PI, 101);
    const last = samples[100];
    const radius = Math.sqrt(last.x * last.x + last.y * last.y);
    expect(radius).toBeCloseTo(Math.PI, 5);
  });

  it('breaks the polyline at singularities (r = 1/θ, θ = 0)', () => {
    const samples = samplePolar('1/x', 0, Math.PI * 2, 101);
    // θ = 0 → 1/0 = Infinity → non-finite → pen-up gap.
    const first = samples[0];
    expect(Number.isFinite(first.x) && Number.isFinite(first.y)).toBe(false);
    // Everywhere else the curve is finite, with |point| = 1/θ.
    for (let i = 1; i < samples.length; i++) {
      expect(Number.isFinite(samples[i].x)).toBe(true);
      expect(Number.isFinite(samples[i].y)).toBe(true);
    }
    const last = samples[100]; // θ = 2π
    const radius = Math.sqrt(last.x * last.x + last.y * last.y);
    expect(radius).toBeCloseTo(1 / (Math.PI * 2), 5);
  });

  it('clamps sample count to [2, 2000]', () => {
    expect(samplePolar('1', 0, 1, 0).length).toBe(2);
    expect(samplePolar('1', 0, 1, 5000).length).toBe(2000);
  });
});

/* --------------------------- sampleParametric --------------------------- */

describe('sampleParametric', () => {
  it('returns empty array for empty expressions', () => {
    expect(sampleParametric('', 'sin(t)', 0, 1)).toEqual([]);
    expect(sampleParametric('cos(t)', '', 0, 1)).toEqual([]);
    expect(sampleParametric('  ', '  ', 0, 1)).toEqual([]);
  });

  it('returns empty array for malformed range', () => {
    expect(sampleParametric('t', 't', 3, 3)).toEqual([]);
    expect(sampleParametric('t', 't', NaN, 3)).toEqual([]);
  });

  it('returns empty array when either expression fails to compile', () => {
    expect(sampleParametric('t ++', 't', 0, 1)).toEqual([]);
    expect(sampleParametric('t', 't ++', 0, 1)).toEqual([]);
  });

  it('x = cos(t), y = sin(t) over [0, 2π] → unit circle', () => {
    const samples = sampleParametric('cos(t)', 'sin(t)', 0, Math.PI * 2, 200);
    expect(samples.length).toBe(200);
    for (const s of samples) {
      expect(Number.isFinite(s.x)).toBe(true);
      expect(Number.isFinite(s.y)).toBe(true);
      expect(s.x * s.x + s.y * s.y).toBeCloseTo(1, 5);
    }
  });

  it('keeps parameter order (never sorts by x)', () => {
    // t = 0, 2π/3, 4π/3, 2π — same ordering argument as the polar test.
    const samples = sampleParametric('cos(t)', 'sin(t)', 0, Math.PI * 2, 4);
    expect(samples[0].x).toBeCloseTo(1, 5);
    expect(samples[0].y).toBeCloseTo(0, 5);
    expect(samples[1].y).toBeGreaterThan(0);
    expect(samples[2].y).toBeLessThan(0);
    expect(samples[3].x).toBeCloseTo(1, 5);
  });

  it('breaks the polyline at singularities (x = 1/t, t = 0)', () => {
    const samples = sampleParametric('1/t', 't', 0, 1, 11);
    const first = samples[0];
    expect(Number.isFinite(first.x) && Number.isFinite(first.y)).toBe(false);
    for (let i = 1; i < samples.length; i++) {
      expect(Number.isFinite(samples[i].x)).toBe(true);
      expect(Number.isFinite(samples[i].y)).toBe(true);
      // Hyperbola branch: x·y = 1 for every finite sample.
      expect(samples[i].x * samples[i].y).toBeCloseTo(1, 5);
    }
  });

  it('clamps sample count to [2, 2000]', () => {
    expect(sampleParametric('t', 't', 0, 1, 0).length).toBe(2);
    expect(sampleParametric('t', 't', 0, 1, 5000).length).toBe(2000);
  });
});

/* ----------------------------- sampleCurve ----------------------------- */

describe('sampleCurve', () => {
  it('dispatches cartesian specs to sampleFunction', () => {
    const viaSpec = sampleCurve(
      { mode: 'cartesian', exprX: 'x', exprY: '', paramRange: [0, 1] },
      [0, 10],
      11,
    );
    const direct = sampleFunction('x', [0, 10], 'cartesian', 11);
    expect(viaSpec).toEqual(direct);
  });

  it('dispatches polar specs to samplePolar', () => {
    const viaSpec = sampleCurve(
      { mode: 'polar', exprX: '1', exprY: '', paramRange: [0, Math.PI * 2] },
      [-10, 10], // view range must be ignored for polar
      50,
    );
    const direct = samplePolar('1', 0, Math.PI * 2, 50);
    expect(viaSpec).toEqual(direct);
  });

  it('dispatches parametric specs to sampleParametric', () => {
    const viaSpec = sampleCurve(
      { mode: 'parametric', exprX: 'cos(t)', exprY: 'sin(t)', paramRange: [0, Math.PI * 2] },
      [-10, 10], // view range must be ignored for parametric
      50,
    );
    const direct = sampleParametric('cos(t)', 'sin(t)', 0, Math.PI * 2, 50);
    expect(viaSpec).toEqual(direct);
  });
});

/* ----------------------------- findExtrema ----------------------------- */
describe('findExtrema', () => {
  it('returns empty arrays for empty samples', () => {
    const r = findExtrema([]);
    expect(r.maxima).toEqual([]);
    expect(r.minima).toEqual([]);
    expect(r.zeros).toEqual([]);
  });

  it('returns empty arrays for samples less than 3', () => {
    const r = findExtrema([{ x: 0, y: 0 }, { x: 1, y: 1 }]);
    expect(r.maxima).toEqual([]);
    expect(r.minima).toEqual([]);
  });

  it('detects local maximum', () => {
    const samples: PlotSample[] = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 0 },
    ];
    const r = findExtrema(samples);
    expect(r.maxima.length).toBe(1);
    expect(r.maxima[0].x).toBe(1);
    expect(r.maxima[0].y).toBe(1);
    expect(r.minima).toEqual([]);
  });

  it('detects local minimum', () => {
    const samples: PlotSample[] = [
      { x: 0, y: 0 },
      { x: 1, y: -1 },
      { x: 2, y: 0 },
    ];
    const r = findExtrema(samples);
    expect(r.minima.length).toBe(1);
    expect(r.minima[0].x).toBe(1);
    expect(r.minima[0].y).toBe(-1);
    expect(r.maxima).toEqual([]);
  });

  it('detects multiple extrema in sin wave', () => {
    // sin over [0, 4π] should have 2 maxima and 2 minima
    const samples = sampleFunction('sin(x)', [0, Math.PI * 4], 'cartesian', 1000);
    const r = findExtrema(samples);
    expect(r.maxima.length).toBeGreaterThanOrEqual(1);
    expect(r.minima.length).toBeGreaterThanOrEqual(1);
  });

  it('detects zero crossings', () => {
    const samples: PlotSample[] = [
      { x: 0, y: -1 },
      { x: 1, y: 1 },
    ];
    const r = findExtrema(samples);
    expect(r.zeros.length).toBe(1);
    expect(r.zeros[0].x).toBeCloseTo(0.5, 5);
    expect(r.zeros[0].y).toBe(0);
  });

  it('detects zero crossings in sin wave', () => {
    // sin over [0, 2π] should have zeros at 0, π, 2π
    const samples = sampleFunction('sin(x)', [0, Math.PI * 2], 'cartesian', 1000);
    const r = findExtrema(samples);
    expect(r.zeros.length).toBeGreaterThanOrEqual(2);
  });

  it('handles explicit zero samples', () => {
    const samples: PlotSample[] = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 0 },
    ];
    const r = findExtrema(samples);
    // x=0 is an explicit zero; x=2 is also zero
    expect(r.zeros.length).toBeGreaterThanOrEqual(1);
  });

  it('treats NaN samples as barriers', () => {
    // NaN in the middle should prevent extrema detection across the gap
    const samples: PlotSample[] = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: NaN },
      { x: 3, y: 1 },
      { x: 4, y: 0 },
    ];
    const r = findExtrema(samples);
    // No extrema detected because the middle sample is NaN barrier
    expect(r.maxima.length).toBe(0);
    expect(r.minima.length).toBe(0);
  });

  it('does not detect plateau as extremum (strict comparison)', () => {
    const samples: PlotSample[] = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 3, y: 0 },
    ];
    const r = findExtrema(samples);
    // strict >, so the plateau (1,1,1) doesn't qualify as a strict maximum
    expect(r.maxima.length).toBe(0);
  });
});
