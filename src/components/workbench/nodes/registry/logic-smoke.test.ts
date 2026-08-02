/**
 * Logic 分类节点 smoke 测试 — 2 个节点全量可执行性验证。
 *
 * switch / threshold-gate
 *
 * switch 的 a/b 为 'any' 端口，可传任意类型；threshold-gate 的 x 为
 * number 端口。断言返回值是对象且每个声明的输出端口均有定义。
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

describe('logic smoke — 2 个逻辑节点', () => {
  it('switch: condition=1 → result=a；condition=0 → result=b', async () => {
    const outA = await run('switch', { condition: 1, a: 'yes', b: 'no' });
    expectSmoke('switch', outA);
    expect(outA.result).toBe('yes');

    const outB = await run('switch', { condition: 0, a: 'yes', b: 'no' });
    expectSmoke('switch', outB);
    expect(outB.result).toBe('no');
  });

  it('threshold-gate: 默认 threshold=0.5，x=0.7 → 1；x=0.3 → 0', async () => {
    const high = await run('threshold-gate', { x: 0.7 });
    expectSmoke('threshold-gate', high);
    expect(high.result).toBe(1);

    const low = await run('threshold-gate', { x: 0.3 });
    expectSmoke('threshold-gate', low);
    expect(low.result).toBe(0);
  });
});

describe('logic smoke — 业务边界', () => {
  it('threshold-gate: x 恰等于阈值 → 1（>= 语义，不抛错）', async () => {
    let out: Record<string, unknown> | null = null;
    let thrown: unknown = null;
    try {
      out = await run('threshold-gate', { x: 0.5 });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).not.toBeInstanceOf(TypeError);
    expect(thrown).toBeNull();
    expect(out!.result).toBe(1);
  });
});
