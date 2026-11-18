import { describe, expect, it } from 'vitest';
import {
  annotateContours,
  classifyWithFourier,
  fourierMagnitudes,
  resampleContour,
  type ContourPoint,
} from './shapeFourier';

function circle(n = 48, r = 1): ContourPoint[] {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return { x: Math.cos(a) * r, y: Math.sin(a) * r };
  });
}

function square(n = 16): ContourPoint[] {
  const vertices: ContourPoint[] = [
    { x: -1, y: -1 },
    { x: 1, y: -1 },
    { x: 1, y: 1 },
    { x: -1, y: 1 },
  ];
  const out: ContourPoint[] = [];
  for (let i = 0; i < 4; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % 4];
    for (let s = 0; s < n; s++) {
      const t = s / n;
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return out;
}

function triangle(n = 16): ContourPoint[] {
  const vertices: ContourPoint[] = [
    { x: 0, y: -1 },
    { x: 1, y: 1 },
    { x: -1, y: 1 },
  ];
  const out: ContourPoint[] = [];
  for (let i = 0; i < 3; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % 3];
    for (let s = 0; s < n; s++) {
      const t = s / n;
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return out;
}

describe('resampleContour', () => {
  it('returns the requested number of points', () => {
    expect(resampleContour(circle(), 32)).toHaveLength(32);
    expect(resampleContour([], 10)).toHaveLength(0);
  });
});

describe('fourierMagnitudes', () => {
  it('is invariant to translation and scale', () => {
    const a = fourierMagnitudes(circle(48, 1));
    const b = fourierMagnitudes(circle(48, 7).map((p) => ({ x: p.x + 100, y: p.y - 40 })));
    for (let i = 0; i < a.length; i++) {
      expect(b[i]).toBeCloseTo(a[i], 5);
    }
  });
});

describe('classifyWithFourier', () => {
  it('recognizes a circle, square and triangle', () => {
    expect(classifyWithFourier(circle()).shape).toBe('circle');
    expect(classifyWithFourier(square()).shape).toBe('rectangle');
    expect(classifyWithFourier(triangle()).shape).toBe('triangle');
  });

  it('is rotation invariant', () => {
    const rotated = square().map((p) => ({
      x: p.x * Math.cos(0.5) - p.y * Math.sin(0.5),
      y: p.x * Math.sin(0.5) + p.y * Math.cos(0.5),
    }));
    expect(classifyWithFourier(rotated).shape).toBe('rectangle');
  });

  it('reports open strokes as lines', () => {
    const line: ContourPoint[] = Array.from({ length: 20 }, (_, i) => ({ x: i, y: i * 0.5 }));
    const result = classifyWithFourier(line);
    expect(result.shape).toBe('line');
    expect(result.confidence).toBeGreaterThan(0.5);
  });
});

describe('annotateContours', () => {
  const scaled = (pts: ContourPoint[], r: number): ContourPoint[] =>
    pts.map((p) => ({ x: p.x * r + 200, y: p.y * r + 120 }));

  it('labels closed contours with their shape and pixel geometry', () => {
    const annotations = annotateContours(
      [
        { points: scaled(square(), 80), closed: true },
        { points: scaled(circle(), 80), closed: true },
      ],
      { minPerimeter: 40 },
    );
    expect(annotations).toHaveLength(2);
    expect(annotations.map((a) => a.shape).sort()).toEqual(['circle', 'rectangle']);
    for (const a of annotations) {
      expect(a.closed).toBe(true);
      expect(a.perimeter).toBeGreaterThan(300);
      expect(a.center.x).toBeGreaterThan(190);
      expect(a.center.x).toBeLessThan(210);
      expect(a.center.y).toBeGreaterThan(110);
      expect(a.center.y).toBeLessThan(130);
    }
  });

  it('drops small noise contours below minPerimeter', () => {
    const annotations = annotateContours(
      [
        { points: scaled(square(), 80), closed: true },
        { points: scaled(square(), 2), closed: true },
      ],
      { minPerimeter: 120 },
    );
    expect(annotations).toHaveLength(1);
    expect(annotations[0].perimeter).toBeGreaterThan(500);
  });

  it('ignores open strokes unless includeOpen is set', () => {
    const open: ContourPoint[] = Array.from({ length: 40 }, (_, i) => ({ x: i * 10, y: 20 }));
    expect(annotateContours([{ points: open, closed: false }], { minPerimeter: 40 })).toHaveLength(0);
    const withOpen = annotateContours(
      [{ points: open, closed: false }],
      { minPerimeter: 40, includeOpen: true },
    );
    expect(withOpen).toHaveLength(1);
    expect(withOpen[0].shape).toBe('line');
  });

  it('sorts largest first and caps the number of labels', () => {
    const annotations = annotateContours(
      [
        { points: scaled(square(), 20), closed: true },
        { points: scaled(square(), 90), closed: true },
        { points: scaled(square(), 50), closed: true },
      ],
      { minPerimeter: 40, maxLabels: 2 },
    );
    expect(annotations).toHaveLength(2);
    expect(annotations[0].extent).toBeGreaterThan(annotations[1].extent);
  });
});
