/**
 * Statistics 分类节点 smoke 测试 — 4 个节点全量可执行性验证。
 *
 * random-sample / mean-variance / histogram / data-input
 *
 * 数据端口的合法形式为 number[]（经 'any' 端口传输）。断言返回值是
 * 对象且每个声明的输出端口均有定义。
 */

import { describe, it, expect } from 'vitest';
import { NODE_TYPES, type NodeType, type PipelineContext } from '../pipelineEngine';

const CTX: PipelineContext = { variables: {} };

/** 以节点自身 defaultConfig 调用 execute，自动 await 异步结果。 */
async function run(
  type: NodeType,
  inputs: Record<string, unknown> = {},
  config?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const def = NODE_TYPES[type];
  if (!def) throw new Error(`unknown node type: ${type}`);
  return await Promise.resolve(def.execute(inputs, config ?? def.defaultConfig, CTX));
}

/** smoke 断言：返回对象且每个声明的输出端口均有定义。 */
function expectSmoke(type: NodeType, out: Record<string, unknown>): void {
  expect(typeof out).toBe('object');
  expect(out).not.toBeNull();
  for (const port of NODE_TYPES[type].outputs) {
    expect(out[port.id], `${type} 输出端口 "${port.id}" 为 undefined`).toBeDefined();
  }
}

describe('statistics smoke — 统计节点', () => {
  it('random-sample: 默认配置（normal×100）→ data 为 100 个样本', async () => {
    const out = await run('random-sample');
    expectSmoke('random-sample', out);
    const data = out.data as number[];
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(100);
  });

  it('random-sample: uniform×10, [0,1) → data 为 10 个样本，全部落在 [0,1]', async () => {
    const out = await run('random-sample', {}, {
      distribution: 'uniform', count: 10, min: 0, max: 1,
    });
    expectSmoke('random-sample', out);
    const data = out.data as number[];
    expect(data.length).toBe(10);
    for (const v of data) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('random-sample: 相同 seed → 完全可复现', async () => {
    const cfg = { distribution: 'normal', count: 50, mu: 0, sigma: 1, seed: 42 };
    const a = (await run('random-sample', {}, cfg)).data as number[];
    const b = (await run('random-sample', {}, cfg)).data as number[];
    expect(a).toEqual(b);
  });

  it('mean-variance: [1..5] → mean/variance/stddev 三端口均有定义', async () => {
    const out = await run('mean-variance', { data: [1, 2, 3, 4, 5] });
    expectSmoke('mean-variance', out);
    expect(out.mean).toBe(3);
    expect(out.variance).toBeCloseTo(2.5, 10);
    expect(out.stddev).toBeCloseTo(Math.sqrt(2.5), 10);
  });

  it('summary: [0..9] → mean=4.5, median=4.5, result 含 n/min/max', async () => {
    const out = await run('summary', { data: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] });
    expectSmoke('summary', out);
    expect(out.mean).toBe(4.5);
    expect(out.median).toBe(4.5);
    const r = out.result as { n: number; min: number; max: number };
    expect(r.n).toBe(10);
    expect(r.min).toBe(0);
    expect(r.max).toBe(9);
  });

  it('distribution: 标准正态 x=0 → pdf≈0.3989, cdf=0.5', async () => {
    const out = await run('distribution', { x: 0 }, { distribution: 'normal', mu: 0, sigma: 1, p: 0.5 });
    expectSmoke('distribution', out);
    expect(out.pdf as number).toBeCloseTo(0.39894228, 6);
    expect(out.cdf as number).toBeCloseTo(0.5, 6);
    expect(out.inv as number).toBeCloseTo(0, 6);
  });

  it('correlation: 完全正相关 [1..5] vs [2,4,6,8,10] → corr 接近 1', async () => {
    const out = await run('correlation', { a: [1, 2, 3, 4, 5], b: [2, 4, 6, 8, 10] });
    expectSmoke('correlation', out);
    expect(out.corr as number).toBeGreaterThan(0.999);
  });

  it('histogram: 10 个数（默认 10 桶）→ result 含 bins/counts', async () => {
    const out = await run('histogram', { data: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] });
    expectSmoke('histogram', out);
    const result = out.result as { bins: number[]; counts: number[] };
    expect(result.bins.length).toBe(10);
    expect(result.counts.length).toBe(10);
    expect(result.counts.reduce((s, c) => s + c, 0)).toBe(10);
  });

  it('data-input: 默认配置 "[1,2,3,4,5]" → data=[1,2,3,4,5]', async () => {
    const out = await run('data-input');
    expectSmoke('data-input', out);
    expect(out.data).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('statistics smoke — 业务边界', () => {
  it('data-input: 非法 JSON 按分隔符容错解析，不抛 TypeError', async () => {
    let out: Record<string, unknown> | null = null;
    let thrown: unknown = null;
    try {
      out = await run('data-input', {}, { data: '1, 2, 3' });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).not.toBeInstanceOf(TypeError);
    expect(thrown).toBeNull();
    expect(out!.data).toEqual([1, 2, 3]);
  });

  it('mean-variance: 空数组 → mean/variance 为 NaN（不抛错）', async () => {
    const out = await run('mean-variance', { data: [] });
    expectSmoke('mean-variance', out);
    expect(Number.isNaN(out.mean as number)).toBe(true);
    expect(Number.isNaN(out.variance as number)).toBe(true);
  });
});
