/**
 * Simulation engine tests — 连续状态（integrator / first-order）、RK4、RKF45、
 * 代数环不动点求解、过零事件。
 */

import { describe, it, expect } from 'vitest';
import { runSimulation, type SimConfig } from './simulationEngine';
import type { PipelineNode, PipelineEdge } from './pipelineEngine';

function node(id: string, type: string, config: Record<string, unknown> = {}): PipelineNode {
  return { id, type, position: { x: 0, y: 0 }, config };
}

function edge(id: string, from: string, fromPort: string, to: string, toPort: string): PipelineEdge {
  return { id, from, fromPort, to, toPort };
}

const last = (arr: number[]): number => arr[arr.length - 1];

describe('simulation — integrator 连续状态', () => {
  it('euler：常输入 1 的积分器在 t=1 时 ≈ 1', () => {
    const nodes = [
      node('c', 'sim-constant', { value: 1 }),
      node('int', 'sim-integrator', { initialCondition: 0 }),
      node('s', 'sim-scope'),
    ];
    const edges = [
      edge('e1', 'c', 'out', 'int', 'u'),
      edge('e2', 'int', 'out', 's', 'u'),
    ];
    const r = runSimulation(nodes, edges, { t0: 0, tEnd: 1, method: 'euler', dt: 0.01 });
    expect(r.series['s'].length).toBeGreaterThan(2);
    expect(last(r.series['s'])).toBeCloseTo(1, 1);
  });

  it('rk4：常输入 1 的积分器在 t=1 时精确 ≈ 1', () => {
    const nodes = [
      node('c', 'sim-constant', { value: 1 }),
      node('int', 'sim-integrator', { initialCondition: 0 }),
      node('s', 'sim-scope'),
    ];
    const edges = [
      edge('e1', 'c', 'out', 'int', 'u'),
      edge('e2', 'int', 'out', 's', 'u'),
    ];
    const r = runSimulation(nodes, edges, { t0: 0, tEnd: 1, method: 'rk4', dt: 0.01 });
    expect(last(r.series['s'])).toBeCloseTo(1, 4);
  });
});

describe('simulation — first-order 连续状态（RK 精度）', () => {
  const nodes = [
    node('step', 'sim-step', { stepTime: 0, initialValue: 0, finalValue: 1 }),
    node('fo', 'sim-first-order', { timeConstant: 1, initialOutput: 0 }),
    node('s', 'sim-scope'),
  ];
  const edges = [
    edge('e1', 'step', 'out', 'fo', 'u'),
    edge('e2', 'fo', 'out', 's', 'u'),
  ];
  // 解析解 y(t) = 1 − e^(−t/T)，T=1, t=1 ⇒ 0.63212
  const ANALYTIC = 1 - Math.exp(-1);

  it('rk4 比 euler 更接近解析解', () => {
    const euler = runSimulation(nodes, edges, { t0: 0, tEnd: 1, method: 'euler', dt: 0.05 });
    const rk4 = runSimulation(nodes, edges, { t0: 0, tEnd: 1, method: 'rk4', dt: 0.05 });
    const eErr = Math.abs(last(euler.series['s']) - ANALYTIC);
    const rErr = Math.abs(last(rk4.series['s']) - ANALYTIC);
    expect(rErr).toBeLessThan(eErr);
    expect(rErr).toBeLessThan(1e-3);
  });

  it('rkf45 自适应：误差很小', () => {
    const r = runSimulation(nodes, edges, { t0: 0, tEnd: 1, method: 'rkf45', dt: 0.1 });
    expect(Math.abs(last(r.series['s']) - ANALYTIC)).toBeLessThan(1e-3);
  });
});

describe('simulation — 代数环不动点求解', () => {
  it('环路 sum = 2 + 0.5·sum → sum=4', () => {
    const nodes = [
      node('c', 'sim-constant', { value: 2 }),
      node('sum', 'sim-sum', { signs: '++' }),
      node('g', 'sim-gain', { gain: 0.5 }),
      node('s', 'sim-scope'),
    ];
    const edges = [
      edge('e1', 'c', 'out', 'sum', 'in1'),
      edge('e2', 'sum', 'out', 'g', 'u'),
      edge('e3', 'g', 'out', 'sum', 'in2'),
      edge('e4', 'sum', 'out', 's', 'u'),
    ];
    const r = runSimulation(nodes, edges, { t0: 0, tEnd: 1, method: 'euler', dt: 0.1 });
    expect(last(r.series['s'])).toBeCloseTo(4, 6);
  });
});

describe('simulation — 过零事件', () => {
  it('正弦信号跨零产生事件', () => {
    const nodes = [
      node('sine', 'sim-sine', { amplitude: 1, frequency: 0.5, phase: 0, bias: 0 }),
      node('s', 'sim-scope'),
    ];
    const edges = [edge('e1', 'sine', 'out', 's', 'u')];
    const r = runSimulation(nodes, edges, { t0: 0, tEnd: 2, method: 'euler', dt: 0.01 });
    expect(r.events.length).toBeGreaterThan(0);
  });
});