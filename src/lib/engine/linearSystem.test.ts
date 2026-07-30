import { describe, it, expect } from 'vitest';
import {
  parseLinearCoeffs,
  parseLinearSystem,
  solveLinearSystemWithSteps,
  nonlinearSystemSteps,
  type LinearSystemParse,
} from './linearSystem';

/** 类型守卫：断言解析结果为线性系统（非 error 且 linear=true） */
function asLinear(r: LinearSystemParse | { error: string }): LinearSystemParse {
  if ('error' in r) throw new Error(`预期解析成功，实际得到错误: ${r.error}`);
  return r;
}

describe('linearSystem', () => {
  describe('parseLinearCoeffs', () => {
    it('解析多元线性表达式', () => {
      expect(parseLinearCoeffs('2x + 3y')).toEqual({ x: 2, y: 3 });
    });

    it('隐式系数 ±1', () => {
      expect(parseLinearCoeffs('x - y')).toEqual({ x: 1, y: -1 });
    });

    it('常数项记入 __const', () => {
      expect(parseLinearCoeffs('2x + 3')).toEqual({ x: 2, __const: 3 });
    });

    it('常数分母除法仍是线性', () => {
      expect(parseLinearCoeffs('x/2')).toEqual({ x: 0.5 });
    });

    it('常数幂折叠为常数项', () => {
      expect(parseLinearCoeffs('2^3')).toEqual({ __const: 8 });
    });

    it('变量相乘 → 非线性返回 null', () => {
      expect(parseLinearCoeffs('x*y')).toBeNull();
    });

    it('变量二次幂 → 非线性返回 null', () => {
      expect(parseLinearCoeffs('x^2')).toBeNull();
    });

    it('含函数调用 → 非线性返回 null', () => {
      expect(parseLinearCoeffs('sin(x)')).toBeNull();
    });

    it('无法解析的输入返回 null', () => {
      expect(parseLinearCoeffs('x +* 2')).toBeNull();
    });

    it('空字符串返回 { __const: NaN }（当前行为，疑似边界缺陷）', () => {
      // math.parse('') 产生 value 为 undefined 的 ConstantNode，
      // Number(undefined) = NaN，因此空输入未被识别为非法。
      // 调用方 parseLinearSystem 会先行过滤空行，故实际不触发。
      const r = parseLinearCoeffs('');
      expect(r).not.toBeNull();
      expect(Number.isNaN(r!.__const)).toBe(true);
    });
  });

  describe('parseLinearSystem', () => {
    it('解析标准二元方程组', () => {
      const r = asLinear(parseLinearSystem('2x + y = 5\nx - y = 1'));
      expect(r.linear).toBe(true);
      expect(r.varList).toEqual(['x', 'y']);
      expect(r.A).toEqual([[2, 1], [1, -1]]);
      expect(r.b).toEqual([5, 1]);
    });

    it('变量名按字母序排列', () => {
      const r = asLinear(parseLinearSystem('2b + a = 1\na - b = 2'));
      expect(r.varList).toEqual(['a', 'b']);
      expect(r.A).toEqual([[1, 2], [1, -1]]);
      expect(r.b).toEqual([1, 2]);
    });

    it('左端常数项折算到右端（Ax + C = b → Ax = b - C）', () => {
      const r = asLinear(parseLinearSystem('2x + 3 = 7'));
      expect(r.A).toEqual([[2]]);
      expect(r.b).toEqual([4]);
    });

    it('右端支持算术表达式', () => {
      const r = asLinear(parseLinearSystem('x = 2+3'));
      expect(r.b).toEqual([5]);
    });

    it('缺失变量按 0 填充系数', () => {
      const r = asLinear(parseLinearSystem('x + y = 3\nx = 1'));
      expect(r.A).toEqual([[1, 1], [1, 0]]);
    });

    it('空输入返回错误对象', () => {
      expect(parseLinearSystem('')).toEqual({ error: '请输入方程组（每行一个方程）' });
      expect(parseLinearSystem('  \n\n')).toEqual({ error: '请输入方程组（每行一个方程）' });
    });

    it('缺少 = 号返回错误对象', () => {
      expect(parseLinearSystem('x + y')).toEqual({ error: '无法解析方程（缺少 = 号）: x + y' });
    });

    it('右端无法求值返回错误对象', () => {
      expect(parseLinearSystem('x + y = abc')).toEqual({ error: '无法解析右端常数: x + y = abc' });
    });

    it('非线性方程标记 linear=false 并记录出错行', () => {
      const r = parseLinearSystem('x*y = 5');
      expect('error' in r).toBe(false);
      if ('error' in r) return;
      expect(r.linear).toBe(false);
      expect(r.errorLine).toBe('x*y = 5');
      expect(r.A).toEqual([]);
      expect(r.b).toEqual([]);
    });

    it('混合输入中任一方程非线性则整体 linear=false', () => {
      const r = parseLinearSystem('x + y = 5\nx*y = 3');
      if ('error' in r) throw new Error('不应返回 error');
      expect(r.linear).toBe(false);
      expect(r.errorLine).toBe('x*y = 3');
    });
  });

  describe('solveLinearSystemWithSteps', () => {
    it('唯一解：2x+y=5, x-y=1 → x=2, y=1', () => {
      const r = solveLinearSystemWithSteps([[2, 1], [1, -1]], [5, 1]);
      expect(r.kind).toBe('unique');
      expect(r.vector).toEqual([2, 1]);
      expect(r.rankA).toBe(2);
      expect(r.rankAug).toBe(2);
      expect(r.nUnknowns).toBe(2);
      expect(r.latex).toBe('x = \\begin{bmatrix} 2 \\\\ 1 \\end{bmatrix}');
    });

    it('唯一解的步骤以增广矩阵开头、回代结尾', () => {
      const r = solveLinearSystemWithSteps([[2, 1], [1, -1]], [5, 1]);
      expect(r.steps.length).toBeGreaterThan(1);
      expect(r.steps[0]).toContain('\\text{增广矩阵 } [A|b]');
      expect(r.steps[0]).toContain('\\begin{array}{cc|c}');
      expect(r.steps[r.steps.length - 1]).toContain('回代得唯一解');
    });

    it('需要换行时记录行交换步骤', () => {
      const r = solveLinearSystemWithSteps([[0, 1], [1, 0]], [3, 4]);
      expect(r.kind).toBe('unique');
      expect(r.vector).toEqual([4, 3]);
      expect(r.steps.some((s) => s.includes('R_2 \\leftrightarrow R_1'))).toBe(true);
    });

    it('无解（rank A < rank [A|b]）', () => {
      const r = solveLinearSystemWithSteps([[1, 1], [1, 1]], [1, 2]);
      expect(r.kind).toBe('none');
      expect(r.vector).toBeUndefined();
      expect(r.rankA).toBe(1);
      expect(r.rankAug).toBe(2);
      expect(r.latex).toContain('方程组无解');
      expect(r.steps[r.steps.length - 1]).toContain('无解');
    });

    it('无穷多解（rank A = rank [A|b] < n）', () => {
      const r = solveLinearSystemWithSteps([[1, 1]], [2]);
      expect(r.kind).toBe('infinite');
      expect(r.vector).toBeUndefined();
      expect(r.rankA).toBe(1);
      expect(r.rankAug).toBe(1);
      expect(r.nUnknowns).toBe(2);
      expect(r.latex).toContain('t_{1}');
      expect(r.steps[r.steps.length - 1]).toContain('自由变量');
    });

    it('奇异矩阵（全零）→ 无穷多解', () => {
      const r = solveLinearSystemWithSteps([[0, 0], [0, 0]], [0, 0]);
      expect(r.kind).toBe('infinite');
      expect(r.rankA).toBe(0);
      expect(r.rankAug).toBe(0);
    });

    it('非整数解的数值正确性', () => {
      // x + 2y = 1, 3x + y = 2 → x = 3/5, y = 1/5
      const r = solveLinearSystemWithSteps([[1, 2], [3, 1]], [1, 2]);
      expect(r.kind).toBe('unique');
      expect(r.vector![0]).toBeCloseTo(0.6, 10);
      expect(r.vector![1]).toBeCloseTo(0.2, 10);
    });
  });

  describe('nonlinearSystemSteps', () => {
    it('返回四条数值方法说明步骤', () => {
      const steps = nonlinearSystemSteps('x*y = 5');
      expect(steps).toHaveLength(4);
      expect(steps[0]).toContain('x*y = 5');
      expect(steps[1]).toContain('非线性方程组');
      expect(steps[2]).toContain('牛顿迭代');
      expect(steps[3]).toContain('数值求根');
    });

    it('出错行中的 LaTeX 特殊字符被剔除', () => {
      // 清洗只作用于 errorLine 本身（正则 [&%$#_{}]），
      // 外层包装 \text{...} 的花括号是模板的一部分，保留。
      const steps = nonlinearSystemSteps('x^2_{1} & y = 5');
      expect(steps[0]).toContain('x^21  y = 5');
      expect(steps[0]).not.toContain('_');
      expect(steps[0]).not.toContain('&');
    });
  });
});
