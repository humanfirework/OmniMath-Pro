/**
 * Unified probability distribution module tests.
 *
 * 验证 distributions.ts 的 pdf/cdf/inv/sample 正确性、中文别名解析、
 * 以及 rng.ts 的可种子化可复现性。
 */

import { describe, it, expect } from 'vitest';
import { makeDist, makeDistNamed, resolveDist } from '@/lib/probability/distributions';
import { mulberry32, toSeed } from '@/lib/probability/rng';

describe('rng (mulberry32)', () => {
  it('相同 seed → 相同序列', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const seqA = Array.from({ length: 10 }, () => a());
    const seqB = Array.from({ length: 10 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it('不同 seed → 不同序列', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    const seqA = Array.from({ length: 10 }, () => a());
    const seqB = Array.from({ length: 10 }, () => b());
    expect(seqA).not.toEqual(seqB);
  });

  it('输出范围在 [0, 1)', () => {
    const rng = mulberry32(123);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('toSeed：数值与字符串稳定映射', () => {
    expect(toSeed(42)).toBe(42);
    expect(toSeed('abc')).toBe(toSeed('abc'));
    expect(toSeed(undefined)).toBe(toSeed(undefined));
  });
});

describe('distributions — 正态分布', () => {
  const d = makeDist('normal', { mu: 0, sigma: 1 });

  it('pdf(0) ≈ 0.3989', () => {
    expect(d.pdf(0)).toBeCloseTo(0.39894228, 6);
  });

  it('cdf(0) = 0.5，cdf(1.96) ≈ 0.975', () => {
    expect(d.cdf(0)).toBeCloseTo(0.5, 6);
    expect(d.cdf(1.96)).toBeCloseTo(0.975, 3);
  });

  it('inv 是 cdf 的反函数：inv(cdf(x)) ≈ x', () => {
    expect(d.inv(0.5)).toBeCloseTo(0, 6);
    expect(d.inv(0.975)).toBeCloseTo(1.96, 2);
  });

  it('sample 带种子可复现', () => {
    const rng = mulberry32(7);
    const s1 = Array.from({ length: 20 }, () => d.sample(rng));
    const rng2 = mulberry32(7);
    const s2 = Array.from({ length: 20 }, () => d.sample(rng2));
    expect(s1).toEqual(s2);
  });
});

describe('distributions — 均匀分布', () => {
  it('pdf/cdf/inv 一致', () => {
    const d = makeDist('uniform', { a: 0, b: 10 });
    expect(d.pdf(5)).toBeCloseTo(0.1, 10);
    expect(d.cdf(5)).toBeCloseTo(0.5, 10);
    expect(d.inv(0.5)).toBeCloseTo(5, 10);
  });
});

describe('distributions — 离散分布', () => {
  it('二项分布 pmf 求和 = 1', () => {
    const g = makeDist('binomial', { n: 10, p: 0.5 });
    let sum = 0;
    for (let k = 0; k <= 10; k++) sum += g.pdf(k);
    expect(sum).toBeCloseTo(1, 6);
  });

  it('泊松 cdf 单调非降', () => {
    const p = makeDist('poisson', { lambda: 3 });
    let prev = -Infinity;
    for (let k = 0; k < 20; k++) {
      const c = p.cdf(k);
      expect(c).toBeGreaterThanOrEqual(prev);
      prev = c;
    }
  });
});

describe('resolveDist — 中文别名', () => {
  it('英文与中文别名均能解析', () => {
    expect(resolveDist('normal')).toBe('normal');
    expect(resolveDist('正态')).toBe('normal');
    expect(resolveDist('均匀')).toBe('uniform');
    expect(resolveDist('卡方')).toBe('chisquare');
    expect(resolveDist('t分布')).toBe('studentt');
    expect(resolveDist('泊松')).toBe('poisson');
  });

  it('未知名称回退到 normal', () => {
    const d = makeDistNamed('not-a-real-dist', {});
    expect(d.kind).toBe('normal');
  });
});