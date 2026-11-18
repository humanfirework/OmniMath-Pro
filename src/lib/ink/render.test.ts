import { describe, expect, it } from 'vitest';
import { pointInPolygon, simplifyInkPoints } from './render';
import type { InkPoint } from './types';

function line(count: number): InkPoint[] {
  return Array.from({ length: count }, (_, i) => ({ x: i, y: 0, w: 2 }));
}

describe('simplifyInkPoints（渲染前 RDP）', () => {
  it('共线点只保留首尾', () => {
    const out = simplifyInkPoints(line(100), 0.5);
    expect(out).toHaveLength(2);
    expect(out[0].x).toBe(0);
    expect(out[1].x).toBe(99);
  });

  it('超过阈值的拐角会被保留', () => {
    const points: InkPoint[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 20, y: 10 },
    ];
    expect(simplifyInkPoints(points, 0.5).map((p) => [p.x, p.y])).toEqual([
      [0, 0],
      [10, 0],
      [10, 10],
      [20, 10],
    ]);
  });

  it('小于阈值的抖动会被丢掉', () => {
    const points: InkPoint[] = [
      { x: 0, y: 0 },
      { x: 5, y: 0.2 },
      { x: 10, y: 0 },
    ];
    expect(simplifyInkPoints(points, 1)).toHaveLength(2);
  });

  it('0 / 1 / 2 点原样返回', () => {
    expect(simplifyInkPoints([], 0.5)).toEqual([]);
    const one = [{ x: 1, y: 2 }];
    expect(simplifyInkPoints(one, 0.5)).toEqual(one);
    const two = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ];
    expect(simplifyInkPoints(two, 0.5)).toEqual(two);
  });

  it('保留端点的逐点宽度，且不修改输入', () => {
    const points: InkPoint[] = [
      { x: 0, y: 0, w: 1 },
      { x: 1, y: 0.1, w: 2 },
      { x: 2, y: 0, w: 3 },
    ];
    const snapshot = JSON.parse(JSON.stringify(points));
    const out = simplifyInkPoints(points, 0.5);
    expect(out[0].w).toBe(1);
    expect(out[out.length - 1].w).toBe(3);
    expect(points).toEqual(snapshot);
  });
});

describe('pointInPolygon（套圈选择）', () => {
  const square = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ];

  it('方形内/外', () => {
    expect(pointInPolygon({ x: 50, y: 50 }, square)).toBe(true);
    expect(pointInPolygon({ x: 150, y: 50 }, square)).toBe(false);
    expect(pointInPolygon({ x: 50, y: -1 }, square)).toBe(false);
  });

  it('凹多边形：凹口内的点不算选中', () => {
    const uShape = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 70, y: 100 },
      { x: 70, y: 30 },
      { x: 30, y: 30 },
      { x: 30, y: 100 },
      { x: 0, y: 100 },
    ];
    expect(pointInPolygon({ x: 15, y: 50 }, uShape)).toBe(true);
    expect(pointInPolygon({ x: 50, y: 15 }, uShape)).toBe(true);
    expect(pointInPolygon({ x: 50, y: 50 }, uShape)).toBe(false);
    expect(pointInPolygon({ x: 50, y: 120 }, uShape)).toBe(false);
  });

  it('少于 3 个点永远返回 false', () => {
    expect(pointInPolygon({ x: 0, y: 0 }, [])).toBe(false);
    expect(
      pointInPolygon({ x: 0, y: 0 }, [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ]),
    ).toBe(false);
  });
});
