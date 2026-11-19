import { describe, expect, it } from 'vitest';
import { toLiteLatex } from './liteLatex';

describe('toLiteLatex', () => {
  it('keeps plain arithmetic readable', () => {
    expect(toLiteLatex('1 + 2')).toBe('1 + 2');
  });

  it('renders functions and multiplication', () => {
    expect(toLiteLatex('sin(x) * cos(x)')).toBe('\\sin(x) \\cdot \\cos(x)');
  });

  it('renders greek letters and powers', () => {
    expect(toLiteLatex('pi*r^2')).toBe('\\pi \\cdot r^{2}');
    expect(toLiteLatex('r = 2*(1 + cos(theta))')).toBe('r = 2 \\cdot (1 + \\cos(\\theta))');
  });

  it('renders subscripts, roots and absolute values', () => {
    expect(toLiteLatex('x_1 + x_2')).toBe('x_{1} + x_{2}');
    expect(toLiteLatex('sqrt(x+1)')).toBe('\\sqrt{x+1}');
    expect(toLiteLatex('abs(x)')).toBe('\\left|x\\right|');
  });

  it('unwraps plot / polar / surface calls', () => {
    expect(toLiteLatex('plot(sin(x))')).toBe('y = \\sin(x)');
    expect(toLiteLatex('polar(2*(1+cos(theta)))')).toBe('r = 2 \\cdot (1+\\cos(\\theta))');
    expect(toLiteLatex('surface(x^2 + y^2)')).toBe('z = x^{2} + y^{2}');
  });

  it('handles comparison operators', () => {
    expect(toLiteLatex('a <= b != c')).toBe('a \\le b \\ne c');
  });

  it('skips comments, separators, chinese and raw latex', () => {
    expect(toLiteLatex('')).toBe('');
    expect(toLiteLatex('# 注释')).toBe('');
    expect(toLiteLatex('---')).toBe('');
    expect(toLiteLatex('求 sin(x) 的积分')).toBe('');
    expect(toLiteLatex('\\frac{1}{2}')).toBe('');
  });
});
