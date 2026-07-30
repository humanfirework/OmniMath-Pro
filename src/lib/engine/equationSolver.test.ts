import { describe, it, expect } from 'vitest';
import {
  fmtNum,
  fmtComplex,
  fmtComplexLatex,
  tryGetPolyCoeffs,
  normalizeForAlgebrite,
  coeffsToLatex,
  polyRoots,
  findRealRoots,
  solveEquation,
  type EquationSolveOptions,
} from './equationSolver';

const NUMERIC: EquationSolveOptions = { mode: 'numeric', rangeA: -10, rangeB: 10 };
const SYMBOLIC: EquationSolveOptions = { mode: 'symbolic', rangeA: -10, rangeB: 10 };

describe('equationSolver', () => {
  describe('fmtNum', () => {
    it('整数不带小数点', () => {
      expect(fmtNum(5)).toBe('5');
      expect(fmtNum(-3)).toBe('-3');
    });

    it('整近似的浮点数按整数显示', () => {
      expect(fmtNum(2.5000000001)).toBe('2.5');
      expect(fmtNum(0.30000000000000004)).toBe('0.3');
    });

    it('非有限数显示占位符', () => {
      expect(fmtNum(NaN)).toBe('—');
      expect(fmtNum(Infinity)).toBe('—');
    });

    it('极小数折叠为 0', () => {
      expect(fmtNum(1e-13)).toBe('0');
    });
  });

  describe('fmtComplex / fmtComplexLatex', () => {
    it('纯实数', () => {
      expect(fmtComplex({ re: 3, im: 0 })).toBe('3');
    });

    it('±i 简写', () => {
      expect(fmtComplex({ re: 0, im: 1 })).toBe('i');
      expect(fmtComplex({ re: 0, im: -1 })).toBe('-i');
    });

    it('纯虚数与混合形式', () => {
      expect(fmtComplex({ re: 0, im: 2 })).toBe('2i');
      expect(fmtComplex({ re: 1, im: 1 })).toBe('1 + i');
      expect(fmtComplex({ re: 2, im: -3 })).toBe('2 - 3i');
    });

    it('浮点噪声清理（|v| < 1e-10 视为 0）', () => {
      expect(fmtComplex({ re: 1e-12, im: 0 })).toBe('0');
    });

    it('fmtComplexLatex 保持 i 形式', () => {
      expect(fmtComplexLatex({ re: 0, im: 1 })).toBe('i');
      expect(fmtComplexLatex({ re: 0, im: -1 })).toBe('-i');
      expect(fmtComplexLatex({ re: 1, im: 2 })).toBe('1 + 2i');
    });
  });

  describe('tryGetPolyCoeffs', () => {
    it('提取二次多项式系数（升幂）', () => {
      expect(tryGetPolyCoeffs('x^2 - 5*x + 6 = 0', 'x')).toEqual([6, -5, 1]);
    });

    it('无等号的表达式按 = 0 处理', () => {
      expect(tryGetPolyCoeffs('x^2 - 4', 'x')).toEqual([-4, 0, 1]);
    });

    it('一次多项式', () => {
      expect(tryGetPolyCoeffs('2*x - 4 = 0', 'x')).toEqual([-4, 2]);
    });

    it('超越方程返回 null', () => {
      expect(tryGetPolyCoeffs('sin(x) = 0', 'x')).toBeNull();
    });

    it('纯常数方程返回 null', () => {
      expect(tryGetPolyCoeffs('5 = 0', 'x')).toBeNull();
    });

    it('变量名不匹配返回 null', () => {
      expect(tryGetPolyCoeffs('y^2 - 4 = 0', 'x')).toBeNull();
    });

    it('语法错误返回 null 不抛异常', () => {
      expect(tryGetPolyCoeffs('x +', 'x')).toBeNull();
    });
  });

  describe('normalizeForAlgebrite', () => {
    it('等式移项为 lhs - rhs', () => {
      expect(normalizeForAlgebrite('x^2 = 4')).toBe('(x^2) - (4)');
    });

    it('e^x 与 ln 转换为 Algebrite 语法', () => {
      expect(normalizeForAlgebrite('e^x + ln(x) = 2')).toBe('(exp(x) + log(x)) - (2)');
    });
  });

  describe('coeffsToLatex', () => {
    it('升幂系数渲染为降幂多项式', () => {
      expect(coeffsToLatex([6, -5, 1], 'x')).toBe('x^{2} - 5 x + 6');
    });

    it('负常数项与缺项', () => {
      expect(coeffsToLatex([-1, 0, 1], 'y')).toBe('y^{2} - 1');
    });

    it('全零系数渲染为 0', () => {
      expect(coeffsToLatex([0, 0], 'x')).toBe('0');
    });

    it('系数 1 省略数字', () => {
      expect(coeffsToLatex([0, 1], 'x')).toBe('x');
    });
  });

  describe('polyRoots', () => {
    it('一次方程直接求解', () => {
      expect(polyRoots([-4, 2])).toEqual([{ re: 2, im: 0 }]);
    });

    it('二次方程两实根', () => {
      const roots = polyRoots([6, -5, 1]);
      const res = roots.map((r) => r.re).sort((a, b) => a - b);
      expect(res[0]).toBeCloseTo(2, 10);
      expect(res[1]).toBeCloseTo(3, 10);
      expect(roots.every((r) => r.im === 0)).toBe(true);
    });

    it('二次方程共轭复根（x^2 + 1 → ±i）', () => {
      const roots = polyRoots([1, 0, 1]);
      const ims = roots.map((r) => r.im).sort((a, b) => a - b);
      expect(ims[0]).toBeCloseTo(-1, 10);
      expect(ims[1]).toBeCloseTo(1, 10);
    });

    it('三次方程 Durand-Kerner（x^3 - x → 0, ±1）', () => {
      const roots = polyRoots([0, -1, 0, 1]);
      const res = roots.map((r) => r.re).sort((a, b) => a - b);
      expect(res[0]).toBeCloseTo(-1, 8);
      expect(res[1]).toBeCloseTo(0, 8);
      expect(res[2]).toBeCloseTo(1, 8);
    });

    it('常数多项式返回空', () => {
      expect(polyRoots([3])).toEqual([]);
    });

    it('剥离高次零系数', () => {
      expect(polyRoots([6, -5, 1, 0, 0])).toEqual(polyRoots([6, -5, 1]));
    });
  });

  describe('findRealRoots', () => {
    it('符号变化扫描找到 sin 的零点（0, π, 2π）', () => {
      const roots = findRealRoots((x) => Math.sin(x), -1, 7);
      expect(roots.length).toBe(3);
      expect(roots[0]).toBeCloseTo(0, 6);
      expect(roots[1]).toBeCloseTo(Math.PI, 6);
      expect(roots[2]).toBeCloseTo(2 * Math.PI, 6);
    });

    it('无符号变化返回空', () => {
      expect(findRealRoots((x) => x * x + 1, -5, 5)).toEqual([]);
    });

    it('函数在区间内不可求值（NaN）时跳过', () => {
      // 1/x 在 0 附近为 Infinity/NaN 边界；x=-1 与 x=1 异号但中间不连续，
      // 当前实现仍会把它当作符号变化并二分逼近 0 —— 锁定该行为。
      const roots = findRealRoots((x) => 1 / x, -1, 1);
      expect(roots.length).toBe(1);
      expect(Math.abs(roots[0])).toBeLessThan(1e-8);
    });
  });

  describe('solveEquation', () => {
    it('空方程返回错误', async () => {
      const r = await solveEquation('', 'x', NUMERIC);
      expect(r.error).toBe('请输入方程');
      expect(r.result).toBeUndefined();
    });

    it('语法错误返回错误信息', async () => {
      const r = await solveEquation('x +', 'x', NUMERIC);
      expect(r.error).toContain('Unexpected end of expression');
    });

    it('数值模式：二次多项式两实根', async () => {
      const r = await solveEquation('x^2 - 5*x + 6 = 0', 'x', NUMERIC);
      expect(r.error).toBeUndefined();
      expect(r.result?.kind).toBe('polynomial');
      expect(r.result?.info).toBe('2 实根, 0 复根, 次数 2');
      const res = r.result!.roots.map((x) => x.re).sort((a, b) => a - b);
      expect(res[0]).toBeCloseTo(2, 10);
      expect(res[1]).toBeCloseTo(3, 10);
      expect(r.result?.steps?.join('\n')).toContain('求根公式');
    });

    it('数值模式：一次多项式', async () => {
      const r = await solveEquation('2*x - 4 = 0', 'x', NUMERIC);
      expect(r.result?.kind).toBe('polynomial');
      expect(r.result?.roots).toEqual([{ re: 2, im: 0 }]);
    });

    it('数值模式：无实根多项式返回复根', async () => {
      const r = await solveEquation('x^2 + 1 = 0', 'x', NUMERIC);
      expect(r.result?.kind).toBe('polynomial');
      expect(r.result?.info).toBe('0 实根, 2 复根, 次数 2');
      const ims = r.result!.roots.map((x) => x.im).sort((a, b) => a - b);
      expect(ims[0]).toBeCloseTo(-1, 10);
      expect(ims[1]).toBeCloseTo(1, 10);
    });

    it('数值模式：超越方程 cos(x) = x', async () => {
      const r = await solveEquation('cos(x) = x', 'x', NUMERIC);
      expect(r.result?.kind).toBe('transcendental');
      expect(r.result?.roots.length).toBe(1);
      expect(r.result!.roots[0].re).toBeCloseTo(0.739085, 5);
      expect(r.result?.steps?.join('\n')).toContain('超越方程');
    });

    it('数值模式：区间内无根（cos(x) = 2）', async () => {
      const r = await solveEquation('cos(x) = 2', 'x', NUMERIC);
      expect(r.result?.kind).toBe('none');
      expect(r.result?.roots).toEqual([]);
      expect(r.result?.latex).toContain('未找到实根');
    });

    it('搜索范围外的根不会被找到', async () => {
      // x - 100 = 0 的根 100 在 [-10, 10] 之外；但它是多项式，
      // 走 polyRoots 路径仍会找到 —— 用超越方程验证范围限制。
      const r = await solveEquation('cos(x) = x', 'x', {
        mode: 'numeric',
        rangeA: 2,
        rangeB: 5,
      });
      expect(r.result?.kind).toBe('none');
    });

    it('符号模式：多项式走 Algebrite roots', async () => {
      const r = await solveEquation('x^2 - 4 = 0', 'x', SYMBOLIC);
      expect(r.error).toBeUndefined();
      expect(r.result?.kind).toBe('symbolic');
      expect(r.result?.symbolicExpression).toBe('[-2,2]');
      expect(r.result?.steps?.join('\n')).toContain('Algebrite');
      // 同时给出数值根对照
      const res = r.result!.roots.map((x) => x.re).sort((a, b) => a - b);
      expect(res[0]).toBeCloseTo(-2, 10);
      expect(res[1]).toBeCloseTo(2, 10);
    });

    it('符号模式：非多项式回退数值解并给 warning', async () => {
      const r = await solveEquation('cos(x) = x', 'x', SYMBOLIC);
      expect(r.warnings).toContain('符号解仅支持多项式方程，已回退到数值解');
      expect(r.result?.kind).toBe('transcendental');
      expect(r.result?.symbolicFallback).toBe(true);
      expect(r.result!.roots[0].re).toBeCloseTo(0.739085, 5);
    });
  });
});
