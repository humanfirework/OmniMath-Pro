import { describe, expect, it } from 'vitest';
import {
  contourEndpoints,
  parseBlueprint,
  pointToBBoxDistance,
} from './blueprint';
import type { Point, Polyline } from './types';

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
