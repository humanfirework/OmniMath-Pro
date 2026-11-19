import { describe, expect, it } from 'vitest';
import { StrokeStabilizer, stabilizerAlpha } from './stabilizer';

describe('stabilizerAlpha', () => {
  it('maps the three levels to follow factors', () => {
    expect(stabilizerAlpha('off')).toBe(1);
    expect(stabilizerAlpha('soft')).toBeCloseTo(0.72);
    expect(stabilizerAlpha('strong')).toBeCloseTo(0.45);
  });
});

describe('StrokeStabilizer', () => {
  it('returns the raw point when disabled', () => {
    const s = new StrokeStabilizer();
    s.reset({ x: 0, y: 0 });
    expect(s.push({ x: 10, y: 20 }, stabilizerAlpha('off'))).toEqual({ x: 10, y: 20 });
  });

  it('eases toward raw points with the soft factor', () => {
    const s = new StrokeStabilizer();
    s.reset({ x: 0, y: 0 });
    const first = s.push({ x: 10, y: 10 }, stabilizerAlpha('soft'));
    expect(first.x).toBeCloseTo(7.2);
    expect(first.y).toBeCloseTo(7.2);
    expect(s.push({ x: 10, y: 10 }, stabilizerAlpha('soft')).x).toBeCloseTo(9.216);
  });

  it('starts from the new pen-down point after reset', () => {
    const s = new StrokeStabilizer();
    s.reset({ x: 100, y: 100 });
    s.push({ x: 0, y: 0 }, 0.5);
    s.reset({ x: 50, y: 50 });
    expect(s.push({ x: 60, y: 60 }, 0.5)).toEqual({ x: 55, y: 55 });
  });
});
