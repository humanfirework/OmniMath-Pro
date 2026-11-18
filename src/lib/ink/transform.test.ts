import { describe, expect, it } from 'vitest';
import {
  rotateSelection,
  scaleSelection,
  selectionCenter,
  transformInk,
  type SelectionTransform,
} from './transform';
import type { InkStroke } from './types';

function stroke(id: string, points: Array<[number, number]>): InkStroke {
  return {
    id,
    points: points.map(([x, y]) => ({ x, y, w: 2 })),
    color: '#000',
    width: 4,
    style: 'pen',
  };
}

describe('selectionCenter', () => {
  it('uses the union bounding box', () => {
    const center = selectionCenter([
      stroke('a', [[0, 0], [10, 10]]),
      stroke('b', [[20, 0], [30, 10]]),
    ]);
    expect(center).toEqual({ cx: 15, cy: 5 });
  });
});

describe('transformInk', () => {
  it('rotates 90 degrees around the origin and clears recognition', () => {
    const s = { ...stroke('a', [[1, 0], [2, 0]]), recognized: 'line' as const };
    const t: SelectionTransform = { angle: Math.PI / 2, cx: 0, cy: 0 };
    const out = transformInk(s, t);
    expect(out.points[0].x).toBeCloseTo(0);
    expect(out.points[0].y).toBeCloseTo(1);
    expect(out.points[1].x).toBeCloseTo(0);
    expect(out.points[1].y).toBeCloseTo(2);
    expect(out.width).toBe(4);
    expect(out.recognized).toBeNull();
  });

  it('scales points and width', () => {
    const s = stroke('a', [[1, 1], [3, 3]]);
    const out = transformInk(s, { scale: 2, cx: 2, cy: 2 });
    expect(out.points[0]).toMatchObject({ x: 0, y: 0 });
    expect(out.points[1]).toMatchObject({ x: 4, y: 4 });
    expect(out.width).toBe(8);
    expect(out.points[0].w).toBe(4);
  });

  it('snaps pixel strokes back to the grid', () => {
    const s = { ...stroke('p', [[0, 0], [28, 28]]), pixel: true };
    const out = transformInk(s, { scale: 1.5, cx: 0, cy: 0 });
    expect(out.points[1].x % 28).toBe(0);
    expect(out.points[1].y % 28).toBe(0);
  });
});

describe('selection transforms', () => {
  it('scales only the selected strokes around their centre', () => {
    const a = stroke('a', [[0, 0], [10, 10]]);
    const b = stroke('b', [[100, 100], [110, 110]]);
    const out = scaleSelection([a, b], ['a'], 2);
    expect(out[1]).toBe(b);
    expect(out[0].points[0]).toMatchObject({ x: -5, y: -5 });
    expect(out[0].points[1]).toMatchObject({ x: 15, y: 15 });
  });

  it('rotates only the selected strokes', () => {
    const a = stroke('a', [[1, 0], [2, 0]]);
    const b = stroke('b', [[5, 5]]);
    const out = rotateSelection([a, b], ['a'], 90);
    expect(out[1]).toBe(b);
    expect(out[0].points[0].y).toBeCloseTo(-0.5);
  });

  it('returns the original array for an empty selection', () => {
    const strokes = [stroke('a', [[0, 0]])];
    expect(scaleSelection(strokes, [], 2)).toBe(strokes);
  });
});
