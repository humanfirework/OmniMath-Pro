import { describe, expect, it } from 'vitest';
import { selectRecentLine, type ScopedStroke } from './recognizeScope';

const s = (x0: number, y0: number, x1: number, y1: number): ScopedStroke => ({
  box: { x0, y0, x1, y1 },
});

describe('selectRecentLine', () => {
  it('returns nothing for an empty input', () => {
    expect(selectRecentLine([])).toEqual([]);
  });

  it('keeps only the newest line when two formulas are written on separate lines', () => {
    const strokes = [
      s(0, 0, 30, 30), // 上一行 2
      s(40, 0, 60, 30), // 上一行 +
      s(70, 0, 100, 30), // 上一行 3
      s(0, 100, 30, 130), // 新一行 x
      s(40, 100, 60, 130), // 新一行 +
      s(70, 100, 100, 130), // 新一行 1
    ];
    expect(selectRecentLine(strokes)).toEqual(strokes.slice(3));
  });

  it('stops at a large horizontal gap on the same line', () => {
    const strokes = [
      s(0, 0, 30, 30),
      s(40, 0, 70, 30),
      s(400, 0, 430, 30),
      s(440, 0, 470, 30),
    ];
    expect(selectRecentLine(strokes)).toEqual(strokes.slice(2));
  });

  it('includes superscripts that sit above the baseline', () => {
    const base = s(0, 0, 30, 30);
    const sup = s(34, -18, 46, 4);
    expect(selectRecentLine([base, sup])).toEqual([base, sup]);
  });

  it('limits how far back it looks', () => {
    const strokes = Array.from({ length: 40 }, (_, i) => s(i * 40, 0, i * 40 + 30, 30));
    const picked = selectRecentLine(strokes);
    expect(picked.length).toBeLessThanOrEqual(25);
    expect(picked[picked.length - 1]).toEqual(strokes[39]);
  });
});
