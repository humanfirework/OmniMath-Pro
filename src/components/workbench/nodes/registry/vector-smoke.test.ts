/**
 * Vector 分类节点 smoke 测试 — 7 个节点全量可执行性验证。
 *
 * vec2-compose / vec2-decompose / dot-product / cross-product /
 * vec-magnitude / vec-normalize / vec-rotate
 *
 * 向量端口的合法数据形式为 { x: number, y: number }（见 vector.ts 的
 * toVec）。断言返回值是对象且每个声明的输出端口均有定义。
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

describe('vector smoke — 7 个向量节点', () => {
  it('vec2-compose: x=3, y=4 → vec={x:3,y:4}', async () => {
    const out = await run('vec2-compose', { x: 3, y: 4 });
    expectSmoke('vec2-compose', out);
    expect(out.vec).toEqual({ x: 3, y: 4 });
  });

  it('vec2-decompose: vec={x:3,y:4} → x/y 两个端口均有定义', async () => {
    const out = await run('vec2-decompose', { vec: { x: 3, y: 4 } });
    expectSmoke('vec2-decompose', out);
    expect(out.x).toBe(3);
    expect(out.y).toBe(4);
  });

  it('dot-product: {1,2}·{3,4} → result=11', async () => {
    const out = await run('dot-product', { a: { x: 1, y: 2 }, b: { x: 3, y: 4 } });
    expectSmoke('dot-product', out);
    expect(out.result).toBe(11);
  });

  it('cross-product: {1,0}×{0,1} → result=1（2D 标量）', async () => {
    const out = await run('cross-product', { a: { x: 1, y: 0 }, b: { x: 0, y: 1 } });
    expectSmoke('cross-product', out);
    expect(out.result).toBe(1);
  });

  it('vec-magnitude: {3,4} → result=5', async () => {
    const out = await run('vec-magnitude', { vec: { x: 3, y: 4 } });
    expectSmoke('vec-magnitude', out);
    expect(out.result).toBe(5);
  });

  it('vec-normalize: {3,4} → vec≈{0.6,0.8}', async () => {
    const out = await run('vec-normalize', { vec: { x: 3, y: 4 } });
    expectSmoke('vec-normalize', out);
    const vec = out.vec as { x: number; y: number };
    expect(vec.x).toBeCloseTo(0.6, 10);
    expect(vec.y).toBeCloseTo(0.8, 10);
  });

  it('vec-rotate: {1,0} 旋转 π/2 → vec≈{0,1}', async () => {
    const out = await run('vec-rotate', { vec: { x: 1, y: 0 }, angle: Math.PI / 2 });
    expectSmoke('vec-rotate', out);
    const vec = out.vec as { x: number; y: number };
    expect(vec.x).toBeCloseTo(0, 10);
    expect(vec.y).toBeCloseTo(1, 10);
  });
});

describe('vector smoke — 业务边界', () => {
  it('vec-normalize: 零向量不抛 TypeError，返回 {x:0,y:0}', async () => {
    let out: Record<string, unknown> | null = null;
    let thrown: unknown = null;
    try {
      out = await run('vec-normalize', { vec: { x: 0, y: 0 } });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).not.toBeInstanceOf(TypeError);
    expect(thrown).toBeNull();
    expect(out!.vec).toEqual({ x: 0, y: 0 });
  });
});
