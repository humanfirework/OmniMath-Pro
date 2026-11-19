import { describe, expect, it } from 'vitest';
import { predictPenTail } from './predict';
import type { InkPoint } from './types';

const pt = (x: number, y: number, t: number, w = 2): InkPoint => ({ x, y, t, w });

describe('predictPenTail', () => {
  it('returns null for fewer than two points or non-positive inputs', () => {
    expect(predictPenTail([], 12, 8)).toBeNull();
    expect(predictPenTail([pt(0, 0, 0)], 12, 8)).toBeNull();
    expect(predictPenTail([pt(0, 0, 0), pt(1, 0, 10)], 0, 8)).toBeNull();
    expect(predictPenTail([pt(0, 0, 0), pt(1, 0, 10)], 12, 0)).toBeNull();
  });

  it('extrapolates along the last velocity and keeps the width', () => {
    // 10 世界单位 / 10ms = 1 单位/ms，外推 6ms → +6
    const tail = predictPenTail([pt(0, 0, 0), pt(10, 20, 10, 3)], 6, 100);
    expect(tail).not.toBeNull();
    expect(tail!.x).toBeCloseTo(16);
    expect(tail!.y).toBeCloseTo(32);
    expect(tail!.w).toBe(3);
    expect(tail!.t).toBe(16);
  });

  it('caps the predicted distance', () => {
    const tail = predictPenTail([pt(0, 0, 0), pt(100, 0, 10)], 50, 8);
    expect(tail).not.toBeNull();
    expect(tail!.x - 100).toBeCloseTo(8);
    expect(tail!.y).toBeCloseTo(0);
  });

  it('skips long pauses and near-zero speed', () => {
    expect(predictPenTail([pt(0, 0, 0), pt(20, 0, 200)], 12, 8)).toBeNull();
    expect(predictPenTail([pt(0, 0, 0), pt(0, 0, 10)], 12, 8)).toBeNull();
    expect(predictPenTail([pt(5, 5, 100)], 12, 8)).toBeNull();
  });

  it('skips points without timestamps instead of drawing a garbage tail', () => {
    const a: InkPoint = { x: 0, y: 0 };
    const b: InkPoint = { x: 10, y: 0 };
    expect(predictPenTail([a, b], 12, 8)).toBeNull();
  });
});
