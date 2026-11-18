import { describe, expect, it } from 'vitest';
import {
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
