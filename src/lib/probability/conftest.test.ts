/**
 * OmniMath Pro — 假设检验模块单测。
 *
 * 验证策略：给定「已知为正态 / 已知为非正态（指数、卡方）」的样本，
 * 检验应正确地不拒绝 / 拒绝正态性 H₀，且统计量落在合理区间。
 * Bootstrap 区间应包含真值且同种子可复现。
 */

import { describe, it, expect } from 'vitest';
import {
  shapiroWilk,
  andersonDarling,
  lilliefors,
  kolmogorovSmirnov,
  bootstrapCI,
  normalSample,
} from './conftest';
import { normCdf } from './distributions';
import { mean, stdDev } from './stats';

/** 已知偏态/重尾样本（显著非正态）：对数正态尾部扩散。 */
function skewedSample(n = 200): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    // x = e^z, z ~ N(0, 1) → 右偏重尾
    const z = normalSample(1, i + 1)[0];
    out.push(Math.exp(z));
  }
  return out;
}

describe('Shapiro–Wilk 正态性检验', () => {
  it('对标准正态样本高 p 值（不拒绝 H₀）', () => {
    const data = normalSample(200, 7);
    const r = shapiroWilk(data);
    expect(r.W).toBeGreaterThan(0.95);
    expect(r.p).toBeGreaterThan(0.05);
  });

  it('对偏态样本低 p 值（拒绝 H₀）', () => {
    const data = skewedSample(200);
    const r = shapiroWilk(data);
    expect(r.p).toBeLessThan(0.05);
  });

  it('n=3 时 W 恒为 1', () => {
    const r = shapiroWilk([1, 2, 3]);
    expect(r.W).toBeCloseTo(1, 5);
  });

  it('样本量超出范围抛错', () => {
    expect(() => shapiroWilk([1, 2])).toThrow();
  });
});

describe('Anderson–Darling 正态性检验', () => {
  it('对正态样本不拒绝 H₀', () => {
    const r = andersonDarling(normalSample(300, 11));
    expect(r.p).toBeGreaterThan(0.05);
  });

  it('对偏态样本拒绝 H₀', () => {
    const r = andersonDarling(skewedSample(300));
    expect(r.p).toBeLessThan(0.05);
  });

  it('标准差为 0 抛错', () => {
    expect(() => andersonDarling([5, 5, 5])).toThrow();
  });
});

describe('Lilliefors 正态性检验', () => {
  it('对正态样本不拒绝 H₀', () => {
    const r = lilliefors(normalSample(250, 13));
    expect(r.D).toBeGreaterThan(0);
    expect(r.p).toBeGreaterThan(0.05);
  });

  it('对偏态样本拒绝 H₀', () => {
    const r = lilliefors(skewedSample(250));
    expect(r.p).toBeLessThan(0.05);
  });
});

describe('单样本 Kolmogorov–Smirnov 检验', () => {
  it('来自标准正态的样本 vs 标准正态 cdf → 不拒绝', () => {
    const data = normalSample(400, 17);
    const r = kolmogorovSmirnov(data, normCdf);
    expect(r.D).toBeGreaterThan(0);
    expect(r.p).toBeGreaterThan(0.05);
  });

  it('来自指数分布的样本 vs 标准正态 cdf → 拒绝', () => {
    const data = skewedSample(400);
    const r = kolmogorovSmirnov(data, normCdf);
    expect(r.p).toBeLessThan(0.05);
  });
});

describe('百分位 Bootstrap 置信区间', () => {
  it('均值区间包含总体均值，且 lo < point < hi', () => {
    // 用正态样本，总体均值应接近样本点估计
    const data = normalSample(200, 23);
    const r = bootstrapCI(data, (d) => mean(d), { iterations: 2000, seed: 5 });
    expect(r.lo).toBeLessThan(r.point);
    expect(r.point).toBeLessThan(r.hi);
    expect(r.lo).toBeLessThan(r.hi);
    expect(r.se).toBeGreaterThan(0);
    // 点估计 = 样本均值
    expect(r.point).toBeCloseTo(mean(data), 6);
  });

  it('同种子结果可复现', () => {
    const data = normalSample(150, 29);
    const a = bootstrapCI(data, (d) => mean(d), { iterations: 500, seed: 9 });
    const b = bootstrapCI(data, (d) => mean(d), { iterations: 500, seed: 9 });
    expect(a.lo).toBe(b.lo);
    expect(a.hi).toBe(b.hi);
    expect(a.mean).toBe(b.mean);
  });

  it('区间宽度随置信水平提高而变宽', () => {
    const data = normalSample(120, 31);
    const wide = bootstrapCI(data, (d) => mean(d), { iterations: 1000, seed: 3, alpha: 0.01 });
    const narrow = bootstrapCI(data, (d) => mean(d), { iterations: 1000, seed: 3, alpha: 0.1 });
    expect(wide.hi - wide.lo).toBeGreaterThan(narrow.hi - narrow.lo);
  });
});

describe('normalSample 辅助', () => {
  it('均值≈0、标准差≈1', () => {
    const data = normalSample(5000, 99);
    expect(mean(data)).toBeCloseTo(0, 1);
    expect(stdDev(data)).toBeCloseTo(1, 1);
  });
});