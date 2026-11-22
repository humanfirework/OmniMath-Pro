import { describe, expect, it } from 'vitest';
import {
  BLUEPRINT_CONFIDENCE_LOW,
  classifyBlueprintConfidence,
  contourEndpoints,
  formatBlueprintConfidence,
  parseBlueprint,
  pointToBBoxDistance,
  summarizeBlueprintConfidence,
  summarizeBlueprintGraph,
  type BlueprintLinkInfo,
  type BlueprintNodeInfo,
} from './blueprint';
import type { Point, Polyline } from './types';

function node(id: string): BlueprintNodeInfo {
  return {
    id,
    shape: 'rectangle',
    bbox: { minX: 0, minY: 0, maxX: 10, maxY: 10 },
    center: { x: 5, y: 5 },
    confidence: 0.9,
  };
}

function edge(from: string, to: string): BlueprintLinkInfo {
  return { id: `${from}-${to}`, from, to, confidence: 0.9 };
}

function rect(x0: number, y0: number, x1: number, y1: number): Polyline {
  return {
    points: [
      { x: x0, y: y0 },
      { x: x1, y: y0 },
      { x: x1, y: y1 },
      { x: x0, y: y1 },
    ],
    closed: true,
  };
}

function ribbon(x0: number, x1: number, y: number, half = 1): Polyline {
  return {
    points: [
      { x: x0, y: y - half },
      { x: x1, y: y - half },
      { x: x1, y: y + half },
      { x: x0, y: y + half },
    ],
    closed: true,
  };
}

describe('contourEndpoints', () => {
  it('uses first/last for open strokes', () => {
    const line: Polyline = { points: [{ x: 1, y: 2 }, { x: 5, y: 6 }, { x: 9, y: 10 }], closed: false };
    expect(contourEndpoints(line)).toEqual([{ x: 1, y: 2 }, { x: 9, y: 10 }]);
  });

  it('recovers the two ends of a closed thin ribbon', () => {
    const ends = contourEndpoints(ribbon(10, 60, 20));
    expect(ends).not.toBeNull();
    const xs = ends!.map((p: Point) => p.x).sort((a, b) => a - b);
    expect(xs).toEqual([10, 60]);
  });
});

describe('pointToBBoxDistance', () => {
  it('is zero inside and grows outside', () => {
    const b = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
    expect(pointToBBoxDistance({ x: 5, y: 5 }, b)).toBe(0);
    expect(pointToBBoxDistance({ x: 13, y: 5 }, b)).toBe(3);
    expect(pointToBBoxDistance({ x: 13, y: 14 }, b)).toBe(5);
  });
});

describe('parseBlueprint', () => {
  const left = rect(20, 20, 100, 80);
  const right = rect(240, 20, 320, 80);
  const connector = ribbon(100, 240, 50);

  it('extracts two nodes and the connector between them', () => {
    const graph = parseBlueprint([left, right, connector], {
      minNodeSize: 24,
      snapDistance: 20,
    });
    expect(graph.nodes).toHaveLength(2);
    expect(graph.nodes.map((n) => n.id)).toEqual(['N1', 'N2']);
    expect(graph.links).toHaveLength(1);
    expect(graph.links[0]).toMatchObject({ from: 'N1', to: 'N2' });
    expect(graph.nodeIndices.map((n) => n.index).sort()).toEqual([0, 1]);
    expect(graph.linkIndices).toEqual([2]);
  });

  it('snaps a connector with a typical hand-drawn gap using the default tolerance', () => {
    // 两端各留 33px 空隙：默认 snap（minNodeSize 24 → 36）应当能连上。
    // 之前默认 snap 只有 minNodeSize，轮廓内缩后刚好漏判成孤立节点。
    const graph = parseBlueprint([left, right, ribbon(133, 207, 50)], { minNodeSize: 24 });
    expect(graph.nodes).toHaveLength(2);
    expect(graph.links).toHaveLength(1);
    expect(graph.links[0]).toMatchObject({ from: 'N1', to: 'N2' });
  });

  it('treats the inner hole as the node and skips the outer border ring', () => {
    const graph = parseBlueprint([rect(20, 20, 120, 120), rect(40, 40, 100, 100)], {
      minNodeSize: 20,
    });
    expect(graph.nodes).toHaveLength(1);
    expect(graph.nodes[0].bbox.maxX - graph.nodes[0].bbox.minX).toBe(60);
  });

  it('ignores a line that is not anchored to two nodes', () => {
    const dangling = ribbon(140, 200, 50);
    const graph = parseBlueprint([left, right, dangling], {
      minNodeSize: 24,
      snapDistance: 10,
    });
    expect(graph.nodes).toHaveLength(2);
    expect(graph.links).toHaveLength(0);
  });

  it('returns an empty graph for empty input', () => {
    const graph = parseBlueprint([]);
    expect(graph.nodes).toHaveLength(0);
    expect(graph.links).toHaveLength(0);
  });
});

describe('summarizeBlueprintGraph', () => {
  it('一条链：单连通块、两个叶子、无环', () => {
    const s = summarizeBlueprintGraph({
      nodes: [node('N1'), node('N2'), node('N3')],
      links: [edge('N1', 'N2'), edge('N2', 'N3')],
    });
    expect(s).toMatchObject({
      nodeCount: 3,
      linkCount: 2,
      components: 1,
      isolated: 0,
      hasCycle: false,
      leaves: 2,
    });
  });

  it('两块互不相连的子图 + 一个孤立节点', () => {
    const s = summarizeBlueprintGraph({
      nodes: [node('N1'), node('N2'), node('N3'), node('N4'), node('N5')],
      links: [edge('N1', 'N2'), edge('N3', 'N4')],
    });
    expect(s.components).toBe(3);
    expect(s.isolated).toBe(1);
    expect(s.leaves).toBe(4);
  });

  it('三角形闭环被识别为有环', () => {
    const s = summarizeBlueprintGraph({
      nodes: [node('N1'), node('N2'), node('N3')],
      links: [edge('N1', 'N2'), edge('N2', 'N3'), edge('N3', 'N1')],
    });
    expect(s.hasCycle).toBe(true);
    expect(s.components).toBe(1);
    expect(s.leaves).toBe(0);
  });

  it('忽略指向未知节点的连线', () => {
    const s = summarizeBlueprintGraph({
      nodes: [node('N1')],
      links: [edge('N1', 'N9')],
    });
    expect(s.linkCount).toBe(1);
    expect(s.components).toBe(1);
    expect(s.isolated).toBe(1);
  });

  it('空图返回全零结构', () => {
    expect(summarizeBlueprintGraph({ nodes: [], links: [] })).toMatchObject({
      nodeCount: 0,
      linkCount: 0,
      components: 0,
      isolated: 0,
      hasCycle: false,
      leaves: 0,
    });
  });
});

describe('置信度分档与摘要', () => {
  it('classifyBlueprintConfidence 按阈值分为 high / medium / low', () => {
    expect(classifyBlueprintConfidence(0.95)).toBe('high');
    expect(classifyBlueprintConfidence(0.75)).toBe('high');
    expect(classifyBlueprintConfidence(0.6)).toBe('medium');
    expect(classifyBlueprintConfidence(0.55)).toBe('medium');
    expect(classifyBlueprintConfidence(0.2)).toBe('low');
    expect(classifyBlueprintConfidence(BLUEPRINT_CONFIDENCE_LOW - 0.01)).toBe('low');
    expect(classifyBlueprintConfidence(Number.NaN)).toBe('low');
  });

  it('formatBlueprintConfidence 输出紧凑百分比并夹取 0–1', () => {
    expect(formatBlueprintConfidence(0.824)).toBe('82%');
    expect(formatBlueprintConfidence(1)).toBe('100%');
    expect(formatBlueprintConfidence(1.4)).toBe('100%');
    expect(formatBlueprintConfidence(-0.2)).toBe('0%');
    expect(formatBlueprintConfidence(Number.NaN)).toBe('—');
  });

  it('summarizeBlueprintConfidence 统计平均置信度与低置信数量', () => {
    const s = summarizeBlueprintConfidence({
      nodes: [
        { ...node('N1'), confidence: 0.9 },
        { ...node('N2'), confidence: 0.4 },
        { ...node('N3'), confidence: 0.7 },
      ],
      links: [
        { ...edge('N1', 'N2'), confidence: 0.3 },
        { ...edge('N2', 'N3'), confidence: 0.8 },
      ],
    });
    expect(s.nodeCount).toBe(3);
    expect(s.linkCount).toBe(2);
    expect(s.lowConfidenceNodes).toBe(1);
    expect(s.lowConfidenceLinks).toBe(1);
    expect(s.averageNodeConfidence).toBeCloseTo(2 / 3);
    expect(s.averageLinkConfidence).toBeCloseTo(0.55);
  });

  it('空图平均值返回 null', () => {
    expect(summarizeBlueprintConfidence({ nodes: [], links: [] })).toMatchObject({
      nodeCount: 0,
      linkCount: 0,
      lowConfidenceNodes: 0,
      lowConfidenceLinks: 0,
      averageNodeConfidence: null,
      averageLinkConfidence: null,
    });
  });
});
