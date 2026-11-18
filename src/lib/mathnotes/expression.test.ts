import { describe, expect, it } from 'vitest';
import {
  evaluateMathNote,
  formatMathNumber,
  normalizeMathExpression,
  parseMathNote,
  validateMathExpression,
} from './expression';

describe('normalizeMathExpression', () => {
  it('maps handwriting/unicode operators to ascii', () => {
    expect(normalizeMathExpression('2.5×365÷2')).toBe('2.5*365/2');
    expect(normalizeMathExpression('−3 + 4')).toBe('-3+4');
    expect(normalizeMathExpression('πr²')).toBe('pi*r^2');
    expect(normalizeMathExpression('√(x+1)')).toBe('sqrt(x+1)');
  });

  it('inserts implicit multiplication', () => {
    expect(normalizeMathExpression('2x')).toBe('2*x');
    expect(normalizeMathExpression('2(x+1)')).toBe('2*(x+1)');
    expect(normalizeMathExpression('(x+1)(x-1)')).toBe('(x+1)*(x-1)');
    expect(normalizeMathExpression('2sin(x)')).toBe('2*sin(x)');
    expect(normalizeMathExpression('sin(x)cos(x)')).toBe('sin(x)*cos(x)');
  });

  it('keeps function names intact', () => {
    expect(normalizeMathExpression('sin(x)')).toBe('sin(x)');
    expect(normalizeMathExpression('log10(100)')).toBe('log10(100)');
  });

  it('drops a trailing equals sign', () => {
    expect(normalizeMathExpression('2+2=')).toBe('2+2');
  });
});

describe('parseMathNote', () => {
  it('detects explicit y = f(x)', () => {
    const parsed = parseMathNote('y = x³');
    expect(parsed.isEquation).toBe(true);
    expect(parsed.plotExpression).toBe('x^3');
  });

  it('treats a bare expression containing x as a graph', () => {
    const parsed = parseMathNote('sin(x)');
    expect(parsed.isEquation).toBe(false);
    expect(parsed.plotExpression).toBe('sin(x)');
  });

  it('treats arithmetic as a scalar', () => {
    const parsed = parseMathNote('2.5×365×24×60');
    expect(parsed.plotExpression).toBeNull();
  });
});

describe('evaluateMathNote', () => {
  it('computes the reference video expression', () => {
    const result = evaluateMathNote('2.5 × 365 × 24 × 60');
    expect(result.ok).toBe(true);
    expect(result.kind).toBe('number');
    expect(result.value).toBe(1314000);
    expect(result.valueText).toBe('1314000');
  });

  it('samples y = x^3 as a vector graph', () => {
    const result = evaluateMathNote('y = x^3');
    expect(result.ok).toBe(true);
    expect(result.kind).toBe('plot');
    expect(result.plot?.range).toEqual([-10, 10]);
    const atTwo = result.plot?.samples.find((s) => Math.abs(s.x - 2) < 0.02);
    expect(atTwo?.y).toBeCloseTo(8, 1);
  });

  it('reports a friendly error for unknown symbols', () => {
    const result = evaluateMathNote('foo(2)');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('foo');
  });

  it('rejects unsupported characters instead of evaluating them', () => {
    expect(validateMathExpression('alert(1)')).toContain('alert');
    expect(validateMathExpression('a[0]')).toContain('暂不支持');
  });

  it('reports unmatched parentheses', () => {
    const result = evaluateMathNote('(2+3');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('括号');
  });
});

describe('formatMathNumber', () => {
  it('keeps integers plain and trims float noise', () => {
    expect(formatMathNumber(1314000)).toBe('1314000');
    expect(formatMathNumber(1.2300000000004)).toBe('1.23');
    expect(formatMathNumber(1e-9)).toContain('e');
  });
});
