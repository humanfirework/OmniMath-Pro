import { describe, it, expect } from 'vitest';
import {
  normalizeRect,
  nodeBoundingBox,
  intersects,
  selectNodesInBox,
  APPROX_NODE_H,
} from './nodeSelection';
import { NODE_WIDTH } from './pipelineEngine';
import type { PipelineNode } from './pipelineEngine';

function makeNode(id: string, x: number, y: number): PipelineNode {
  return {
    id,
    type: 'display',
    position: { x, y },
    config: {},
    inputs: {},
    outputs: {},
  } as PipelineNode;
}

describe('nodeSelection — 左键拖拽框选命中判定', () => {
  it('normalizeRect 处理任意方向的拖拽（从右往左 / 从下往上）', () => {
    const r = normalizeRect({ x: 200, y: 300 }, { x: 100, y: 100 });
    expect(r).toEqual({ x1: 100, y1: 100, x2: 200, y2: 300 });
  });

  it('nodeBoundingBox 使用节点位置 + 卡片宽高', () => {
    const n = makeNode('a', 10, 20);
    const box = nodeBoundingBox(n);
    expect(box).toEqual({ x1: 10, y1: 20, x2: 10 + NODE_WIDTH, y2: 20 + APPROX_NODE_H });
  });

  it('intersects 判断相交与不相交', () => {
    expect(intersects({ x1: 0, y1: 0, x2: 10, y2: 10 }, { x1: 5, y1: 5, x2: 20, y2: 20 })).toBe(true);
    expect(intersects({ x1: 0, y1: 0, x2: 10, y2: 10 }, { x1: 100, y1: 100, x2: 200, y2: 200 })).toBe(false);
    // 边界接触也算相交
    expect(intersects({ x1: 0, y1: 0, x2: 10, y2: 10 }, { x1: 10, y1: 0, x2: 20, y2: 10 })).toBe(true);
  });

  it('框选命中框内节点', () => {
    const nodes = [
      makeNode('a', 0, 0),
      makeNode('b', 0, 200),
      makeNode('c', 500, 0),
    ];
    // 框住 a（0,0 ~ NODE_WIDTH,130）与 b（0,200 ~ NODE_WIDTH,330）
    const hit = selectNodesInBox(nodes, { x: -10, y: -10 }, { x: NODE_WIDTH + 10, y: 400 });
    expect(hit).toContain('a');
    expect(hit).toContain('b');
    expect(hit).not.toContain('c');
  });

  it('框选排除框外节点', () => {
    const nodes = [makeNode('a', 0, 0), makeNode('b', 1000, 1000)];
    const hit = selectNodesInBox(nodes, { x: 0, y: 0 }, { x: 50, y: 50 });
    expect(hit).toEqual(['a']);
  });

  it('反向拖拽（从右下往左上）仍能命中', () => {
    const nodes = [makeNode('a', 100, 100)];
    const hit = selectNodesInBox(nodes, { x: 0, y: 0 }, { x: 300, y: 300 });
    expect(hit).toEqual(['a']);
    const hit2 = selectNodesInBox(nodes, { x: 300, y: 300 }, { x: 0, y: 0 });
    expect(hit2).toEqual(['a']);
  });
});