import { describe, expect, it } from 'vitest';
import { panRange, zoomRangeAt } from './plotRange';

describe('panRange', () => {
  it('moves the window left when dragging content to the right', () => {
    expect(panRange([-10, 10], 0.25)).toEqual([-15, 5]);
  });

  it('keeps the span unchanged', () => {
    const [a, b] = panRange([0, 4], -0.5);
    expect(b - a).toBeCloseTo(4, 12);
    expect(a).toBeCloseTo(2, 12);
  });

  it('ignores zero / non-finite deltas and invalid ranges', () => {
    expect(panRange([-1, 1], 0)).toEqual([-1, 1]);
    expect(panRange([-1, 1], Number.NaN)).toEqual([-1, 1]);
    expect(panRange([1, 1], 0.2)).toEqual([1, 1]);
  });
});

describe('zoomRangeAt', () => {
  it('keeps the cursor anchor fixed while zooming in', () => {
    // 光标在 25% 处：锚点 x = -10 + 0.25*20 = -5，必须保持在 25% 位置。
    const [a, b] = zoomRangeAt([-10, 10], 0.25, 0.5);
    expect(a).toBeCloseTo(-7.5, 10);
    expect(b).toBeCloseTo(2.5, 10);
    // 锚点 -5 仍落在新范围 25% 处。
    expect(a + (b - a) * 0.25).toBeCloseTo(-5, 10);
  });

  it('zooms out around the center', () => {
    const [a, b] = zoomRangeAt([-10, 10], 0.5, 2);
    expect(a).toBeCloseTo(-20, 10);
    expect(b).toBeCloseTo(20, 10);
  });

  it('clamps the span so it never collapses or explodes', () => {
    let r = zoomRangeAt([0, 1], 0.5, 1e-9) as [number, number];
    expect(r[1] - r[0]).toBeCloseTo(0.05, 10);
    r = zoomRangeAt([0, 1], 0.5, 1e12);
    expect(r[1] - r[0]).toBeCloseTo(1e6, 5);
  });

  it('ignores invalid input', () => {
    expect(zoomRangeAt([0, 2], 0.5, Number.NaN)).toEqual([0, 2]);
    expect(zoomRangeAt([0, 0], 0.5, 2)).toEqual([0, 0]);
  });
});
