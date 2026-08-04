/**
 * Mapping 分类节点 smoke 测试 — 7 个节点全量可执行性验证。
 *
 * negate / reciprocal / clamp / map-range / lerp / min-max / compare
 *
 * 方法：构造类型合法的最小输入，以节点自身 defaultConfig 调用 execute
 * （统一 await Promise.resolve 兼容潜在异步实现），断言：
 *   1. 返回值是对象；
 *   2. 每个声明的输出端口在返回值中均有定义（非 undefined）。
 * 另对业务边界（reciprocal 输入 0）单独验证不抛 TypeError。
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

describe('mapping smoke — 7 个映射节点', () => {
  it('negate: x=5 → result 有定义且为 -5', async () => {
    const out = await run('negate', { x: 5 });
    expectSmoke('negate', out);
    expect(out.result).toBe(-5);
  });

  it('reciprocal: x=4 → result 有定义且为 0.25', async () => {
    const out = await run('reciprocal', { x: 4 });
    expectSmoke('reciprocal', out);
    expect(out.result).toBe(0.25);
  });

  it('clamp: x=5（默认 [0,1]）→ result 有定义且为 1', async () => {
    const out = await run('clamp', { x: 5 });
    expectSmoke('clamp', out);
    expect(out.result).toBe(1);
  });

  it('map-range: x=50（默认 [0,100]→[0,1]）→ result 有定义且为 0.5', async () => {
    const out = await run('map-range', { x: 50 });
    expectSmoke('map-range', out);
    expect(out.result).toBeCloseTo(0.5, 10);
  });

  it('lerp: a=10, b=20, t=0.5 → result 有定义且为 15', async () => {
    const out = await run('lerp', { a: 10, b: 20, t: 0.5 });
    expectSmoke('lerp', out);
    expect(out.result).toBe(15);
  });

  it('min-max: a=3, b=7（默认 op=min）→ result 有定义且为 3', async () => {
    const out = await run('min-max', { a: 3, b: 7 });
    expectSmoke('min-max', out);
    expect(out.result).toBe(3);
  });

  it('compare: a=3, b=7（默认 op=<）→ result 有定义且为 1', async () => {
    const out = await run('compare', { a: 3, b: 7 });
    expectSmoke('compare', out);
    expect(out.result).toBe(1);
  });
});

describe('mapping smoke — 业务边界', () => {
  it('reciprocal: x=0 不抛 TypeError，返回 NaN（可读业务结果）', async () => {
    let out: Record<string, unknown> | null = null;
    let thrown: unknown = null;
    try {
      out = await run('reciprocal', { x: 0 });
    } catch (err) {
      thrown = err;
    }
    // 边界输入不得产生 TypeError（属性访问崩溃）。
    expect(thrown).not.toBeInstanceOf(TypeError);
    expect(thrown).toBeNull();
    expect(out).not.toBeNull();
    expect(Number.isNaN(out!.result as number)).toBe(true);
  });
});
