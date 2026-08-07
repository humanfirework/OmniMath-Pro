/**
 * lib/probability/stats — 描述统计纯函数测试。
 *
 * 覆盖：boxplotStats 置信凹口、ppPoints 经验/理论 CDF 关系。
 */

import { describe, it, expect } from 'vitest';
import { boxplotStats, ppPoints, qqPoints, groupedHistogramBins } from './stats';

function near(a: number, b: number, tol = 1e-6): boolean {
  return Math.abs(a - b) < tol;
}

describe('boxplotStats 置信凹口', () => {
  it('n>5 时生成关于中位数对称的凹口', () => {
    const data = [1, 2, 3, 5, 5, 6, 7, 8, 9, 10];
    const b = boxplotStats(data);
    expect(Number.isFinite(b.notchLow)).toBe(true);
    expect(Number.isFinite(b.notchHigh)).toBe(true);
    // 凹口关于中位数对称
    expect(near(b.notchLow + b.notchHigh, 2 * b.median)).toBe(true);
    // 凹口宽度随 n 增大而收窄（n=10 → 1.57·IQR/√10）
    expect(b.notchHigh - b.notchLow).toBeLessThan(b.q3 - b.q1);
  });

  it('n≤5 时凹口为 NaN（无统计意义）', () => {
    const b = boxplotStats([1, 2, 3, 4, 5]);
    expect(Number.isNaN(b.notchLow)).toBe(true);
    expect(Number.isNaN(b.notchHigh)).toBe(true);
  });

  it('维持原有 Tukey 统计量不变', () => {
    const b = boxplotStats([1, 2, 2, 3, 4, 5, 100]);
    expect(near(b.q1, 2)).toBe(true);
    expect(near(b.median, 3)).toBe(true);
    expect(near(b.q3, 4.5)).toBe(true);
    expect(b.outliers).toContain(100);
  });
});

describe('ppPoints P-P 图', () => {
  it('点落在 [0,1]²，且经验 CDF 单调不降', () => {
    const data = [1, 2, 3, 4, 5];
    const pts = ppPoints(data, (x) => Math.max(0, Math.min(1, x / 10)));
    expect(pts.length).toBe(data.length);
    for (const p of pts) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(1);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(1);
    }
    for (let i = 1; i < pts.length; i++) {
      expect(pts[i].y).toBeGreaterThanOrEqual(pts[i - 1].y);
    }
  });

  it('经验 CDF 恒等时 P-P 落在对角线附近', () => {
    const data = [1, 2, 3, 4, 5];
    const pts = ppPoints(data, (x) => x / 6);
    // y = (i+1)/n 递增
    expect(near(pts[0].y, 0.2)).toBe(true);
    expect(near(pts[pts.length - 1].y, 1)).toBe(true);
  });
});

describe('qqPoints 可切换分布', () => {
  it('自定义理论分位函数生效', () => {
    const data = [1, 2, 3];
    const pts = qqPoints(data, (p) => p * 10);
    expect(near(pts[0].x, 0.5 * (1 / 3) * 10)).toBe(true);
  });
});

describe('groupedHistogramBins 分组直方图', () => {
  it('多序列共用同一分箱轴', () => {
    const { edges, series } = groupedHistogramBins([
      { name: 'A', data: [1, 2, 3, 4, 5] },
      { name: 'B', data: [2, 3, 4, 5, 6] },
    ]);
    expect(edges.length).toBeGreaterThan(0);
    expect(series).toHaveLength(2);
    // 所有序列的 bin 边界与共享轴一致
    for (const s of series) {
      expect(s.bins).toHaveLength(edges.length);
      for (let i = 0; i < edges.length; i++) {
        expect(s.bins[i].start).toBe(edges[i].start);
        expect(s.bins[i].end).toBe(edges[i].end);
      }
    }
  });

  it('每个序列在原数据范围内的计数之和等于样本数', () => {
    const dataA = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const dataB = [2, 4, 6, 8, 10, 12];
    const { series } = groupedHistogramBins([
      { name: 'A', data: dataA },
      { name: 'B', data: dataB },
    ]);
    const sumA = series[0].bins.reduce((acc, b) => acc + b.count, 0);
    const sumB = series[1].bins.reduce((acc, b) => acc + b.count, 0);
    expect(sumA).toBe(dataA.length);
    expect(sumB).toBe(dataB.length);
  });

  it('空 / 单点序列退化为单 bin 且不崩溃', () => {
    const g1 = groupedHistogramBins([]);
    expect(g1.edges).toHaveLength(0);
    expect(g1.series).toHaveLength(0);

    const g2 = groupedHistogramBins([{ name: 'X', data: [5] }]);
    expect(g2.edges).toHaveLength(1);
    expect(g2.series[0].bins[0].count).toBe(1);
  });
});