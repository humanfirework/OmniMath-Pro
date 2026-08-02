/**
 * Curve 分类节点 smoke 测试 — 5 个节点全量可执行性验证。
 *
 * parametric-curve / curve-resample / curve-transform / curve-merge / curve-length
 *
 * 曲线端口的合法数据形式为
 *   { points: Array<{ x: number, y: number }>, closed?: boolean }
 * （见 curve-nodes.ts 的 toCurve）。断言返回值是对象且每个声明的输出
 * 端口均有定义。
 */

import { describe, it, expect } from 'vitest';
import { NODE_TYPES, type NodeType, type PipelineContext } from '../pipelineEngine';

const CTX: PipelineContext = { variables: {} };

/** 合法的最小曲线输入：单位线段 (0,0)→(1,0)。 */
const LINE_CURVE = {
  points: [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
  ],
  closed: false,
};

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

describe('curve smoke — 5 个曲线节点', () => {
  it('parametric-curve: x=t, y=t², t∈[0,1] → curve 端口输出 100 个点（默认 samples）', async () => {
    const out = await run('parametric-curve', {
      xExpr: 't',
      yExpr: 't^2',
      tMin: 0,
      tMax: 1,
    });
    expectSmoke('parametric-curve', out);
    const curve = out.curve as { points: Array<{ x: number; y: number }>; closed: boolean };
    expect(Array.isArray(curve.points)).toBe(true);
    expect(curve.points.length).toBe(100);
    expect(curve.points[0].x).toBeCloseTo(0, 10);
    expect(curve.points[99].y).toBeCloseTo(1, 10);
  });

  it('curve-resample: 单位线段 → curve 端口输出等弧长重采样点列', async () => {
    const out = await run('curve-resample', { curve: LINE_CURVE });
    expectSmoke('curve-resample', out);
    const curve = out.curve as { points: Array<{ x: number; y: number }> };
    expect(curve.points.length).toBe(100);
    expect(curve.points[0].x).toBeCloseTo(0, 6);
    expect(curve.points[99].x).toBeCloseTo(1, 6);
  });

  it('curve-transform: 默认恒等变换 → curve 端口输出与原曲线一致', async () => {
    const out = await run('curve-transform', { curve: LINE_CURVE });
    expectSmoke('curve-transform', out);
    const curve = out.curve as { points: Array<{ x: number; y: number }> };
    expect(curve.points.length).toBe(2);
    expect(curve.points[1].x).toBeCloseTo(1, 10);
    expect(curve.points[1].y).toBeCloseTo(0, 10);
  });

  it('curve-merge: 两条曲线 → curves 端口输出长度 2 的曲线集', async () => {
    const out = await run('curve-merge', { a: LINE_CURVE, b: LINE_CURVE });
    expectSmoke('curve-merge', out);
    const curves = out.curves as unknown[];
    expect(Array.isArray(curves)).toBe(true);
    expect(curves.length).toBe(2);
  });

  it('curve-length: 单位线段 → result=1', async () => {
    const out = await run('curve-length', { curve: LINE_CURVE });
    expectSmoke('curve-length', out);
    expect(out.result).toBe(1);
  });
});

describe('curve smoke — 业务边界', () => {
  it('curve-resample: 空点列曲线不抛 TypeError，原样返回', async () => {
    let out: Record<string, unknown> | null = null;
    let thrown: unknown = null;
    try {
      out = await run('curve-resample', { curve: { points: [], closed: false } });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).not.toBeInstanceOf(TypeError);
    expect(thrown).toBeNull();
    const curve = out!.curve as { points: unknown[] };
    expect(curve.points.length).toBe(0);
  });
});
