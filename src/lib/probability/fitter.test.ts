/**
 * lib/probability/fitter — 分布拟合纯逻辑测试。
 *
 * 覆盖：digamma/trigamma 参考值、各分布 MLE 参数还原、AIC 排序把真实分布
 * 排到首位、bestDistribution 选取。
 */

import { describe, it, expect } from 'vitest';
import { mulberry32 } from './rng';
import { makeDist } from './distributions';
import {
  digamma,
  trigamma,
  fitDistribution,
  fitAllDistributions,
  bestDistribution,
} from './fitter';

const GAMMA = 0.5772156649015329; // 欧拉-马歇罗尼常数

function cdfInv(kind: 'normal' | 'weibull' | 'exponential' | 'gamma', params: Record<string, number>, n: number, seed: number): number[] {
  const rng = mulberry32(seed);
  const dist = makeDist(kind, params);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const u = rng();
    out.push(dist.inv(u));
  }
  return out;
}

describe('digamma / trigamma 参考值', () => {
  it('ψ(1) = -γ ≈ -0.5772', () => {
    expect(Math.abs(digamma(1) + GAMMA)).toBeLessThan(1e-6);
  });

  it('ψ(2) = 1 - γ ≈ 0.4228', () => {
    expect(Math.abs(digamma(2) - (1 - GAMMA))).toBeLessThan(1e-6);
  });

  it('ψ(3) = 1.5 - γ ≈ 0.9228', () => {
    expect(Math.abs(digamma(3) - (1.5 - GAMMA))).toBeLessThan(1e-6);
  });

  it('ψ₁(1) = π²/6 ≈ 1.64493', () => {
    expect(Math.abs(trigamma(1) - (Math.PI * Math.PI) / 6)).toBeLessThan(1e-4);
  });
});

describe('fitDistribution 闭式解还原', () => {
  it('正态：还原 mu/sigma', () => {
    const data = cdfInv('normal', { mu: 2, sigma: 3 }, 4000, 1);
    const r = fitDistribution('normal', data);
    expect(Math.abs(r.params.mu - 2)).toBeLessThan(0.15);
    expect(Math.abs(r.params.sigma - 3)).toBeLessThan(0.15);
    expect(r.k).toBe(2);
  });

  it('指数：还原 rate', () => {
    const data = cdfInv('exponential', { rate: 2 }, 4000, 2);
    const r = fitDistribution('exponential', data);
    expect(Math.abs(r.params.rate - 2)).toBeLessThan(0.15);
    expect(r.k).toBe(1);
  });
});

describe('fitDistribution 迭代 MLE 还原', () => {
  it('Gamma：还原 alpha≈3, beta≈2', () => {
    const data = cdfInv('gamma', { alpha: 3, beta: 2 }, 6000, 3);
    const r = fitDistribution('gamma', data);
    expect(Math.abs(r.params.alpha - 3)).toBeLessThan(0.3);
    expect(Math.abs(r.params.beta - 2)).toBeLessThan(0.3);
  });

  it('Weibull：还原 shape≈2, scale≈3', () => {
    const data = cdfInv('weibull', { shape: 2, scale: 3 }, 6000, 4);
    const r = fitDistribution('weibull', data);
    expect(Math.abs(r.params.shape - 2)).toBeLessThan(0.3);
    expect(Math.abs(r.params.scale - 3)).toBeLessThan(0.3);
  });
});

describe('fitAllDistributions / bestDistribution AIC 排序', () => {
  it('正态数据：normal 排到 AIC 首位', () => {
    const data = cdfInv('normal', { mu: 0, sigma: 1 }, 2000, 5);
    const fits = fitAllDistributions(data);
    // 正态数据含负值与 >1 值，仅支撑覆盖全实数/全区间的分布兼容（normal、uniform）
    expect(fits.length).toBeGreaterThan(0);
    expect(fits[0].kind).toBe('normal');
  });

  it('指数数据：exponential 排到 AIC 首位', () => {
    const data = cdfInv('exponential', { rate: 1 }, 2000, 6);
    const fits = fitAllDistributions(data);
    expect(fits[0].kind).toBe('exponential');
  });

  it('bestDistribution 返回 AIC 最低者', () => {
    const data = cdfInv('gamma', { alpha: 4, beta: 1 }, 3000, 7);
    const best = bestDistribution(data);
    expect(best).not.toBeNull();
    expect(best!.kind).toBe('gamma');
    expect(best!.aic).toBeLessThanOrEqual(best!.bic + 4); // AIC ≤ BIC 受 k·ln n 影响
  });

  it('AIC/BIC 齐全且有限', () => {
    const data = cdfInv('normal', { mu: 1, sigma: 1 }, 500, 8);
    for (const f of fitAllDistributions(data)) {
      expect(Number.isFinite(f.logLik)).toBe(true);
      expect(Number.isFinite(f.aic)).toBe(true);
      expect(Number.isFinite(f.bic)).toBe(true);
      expect(f.k).toBeGreaterThan(0);
    }
  });
});