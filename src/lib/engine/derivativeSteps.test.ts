import { describe, it, expect } from 'vitest';
import { differentiateWithSteps } from './derivativeSteps';
import { math } from './mathInstance';

describe('derivativeSteps（differentiateWithSteps）', () => {
  describe('结果结构', () => {
    it('首步为函数定义，次步为求导记号，末步为结果', () => {
      const r = differentiateWithSteps('x^2', 'x');
      expect(r.steps[0]).toMatch(/^f\(x\) = /);
      expect(r.steps[1]).toContain('\\frac{d}{dx} f(x)');
      expect(r.steps[r.steps.length - 1]).toBe(`= ${r.resultLatex}`);
    });

    it('提供 inputLatex 时首两步使用该 LaTeX', () => {
      const r = differentiateWithSteps('x^2', 'x', 'x^{2}');
      expect(r.steps[0]).toBe('f(x) = x^{2}');
      expect(r.steps[1]).toContain('x^{2}');
    });

    it('resultString 为 mathjs 语法的纯文本', () => {
      const r = differentiateWithSteps('x^2', 'x');
      expect(r.resultString).toBe('2 * x');
    });
  });

  describe('求导法则标注', () => {
    it('幂法则：x^3 → 3x^2', () => {
      const r = differentiateWithSteps('x^3', 'x');
      expect(r.resultString).toBe('3 * x ^ 2');
      expect(r.steps.some((s) => s.includes('幂法则'))).toBe(true);
    });

    it('基本初等函数：sin(x) → cos(x)', () => {
      const r = differentiateWithSteps('sin(x)', 'x');
      expect(r.resultString).toBe('cos(x)');
      expect(r.steps.some((s) => s.includes('基本初等函数'))).toBe(true);
    });

    it('链式法则：sin(2x) → 2cos(2x)', () => {
      const r = differentiateWithSteps('sin(2x)', 'x');
      expect(r.resultString).toBe('2 * cos(2 x)');
      expect(r.steps.some((s) => s.includes('链式法则'))).toBe(true);
    });

    it('乘积法则：x·sin(x)', () => {
      const r = differentiateWithSteps('x*sin(x)', 'x');
      expect(r.resultString).toBe('sin(x) + x * cos(x)');
      expect(r.steps.some((s) => s.includes('乘积法则'))).toBe(true);
    });

    it('商法则：sin(x)/x', () => {
      const r = differentiateWithSteps('sin(x)/x', 'x');
      expect(r.steps.some((s) => s.includes('商法则'))).toBe(true);
    });

    it('和差法则：x^2 + sin(x)', () => {
      const r = differentiateWithSteps('x^2 + sin(x)', 'x');
      expect(r.resultString).toBe('2 * x + cos(x)');
      expect(r.steps.some((s) => s.includes('和差法则'))).toBe(true);
    });

    it('常数倍法则：3x^2 → 6x', () => {
      const r = differentiateWithSteps('3*x^2', 'x');
      expect(r.resultString).toBe('6 * x');
      expect(r.steps.some((s) => s.includes('常数倍法则'))).toBe(true);
    });

    it('幂法则 + 链式法则：(2x+1)^3 → 6(2x+1)^2', () => {
      const r = differentiateWithSteps('(2x+1)^3', 'x');
      expect(r.resultString).toBe('6 * (2 x + 1) ^ 2');
      expect(r.steps.some((s) => s.includes('幂法则 + 链式法则'))).toBe(true);
    });

    it('指数法则：exp(x) → exp(x)', () => {
      const r = differentiateWithSteps('exp(x)', 'x');
      expect(r.resultString).toBe('exp(x)');
      expect(r.steps.some((s) => s.includes('指数法则'))).toBe(true);
    });

    it('对数法则：log(x) → 1/x', () => {
      const r = differentiateWithSteps('log(x)', 'x');
      expect(r.resultString).toBe('1 / x');
      expect(r.steps.some((s) => s.includes('对数法则'))).toBe(true);
    });
  });

  describe('边界情况', () => {
    it('常数表达式导数为 0（常数法则说明）', () => {
      const r = differentiateWithSteps('5', 'x');
      expect(r.resultString).toBe('0');
      expect(r.steps.some((s) => s.includes('常数法则'))).toBe(true);
    });

    it('不含自变量的表达式导数为 0', () => {
      const r = differentiateWithSteps('a + 3', 'x');
      expect(r.resultString).toBe('0');
      expect(r.steps.some((s) => s.includes('表达式不含'))).toBe(true);
    });

    it('支持其他变量名', () => {
      const r = differentiateWithSteps('t^2 + 1', 't');
      expect(r.resultString).toBe('2 * t');
      expect(r.steps[0]).toContain('f(t)');
    });

    it('深度嵌套表达式不溢出且步骤数受限', () => {
      const r = differentiateWithSteps('sin(cos(tan(exp(sqrt(log(abs(x)))))))', 'x');
      expect(r.resultString.length).toBeGreaterThan(0);
      // annotate 的 depth > 8 保护生效，步骤数有限
      expect(r.steps.length).toBeLessThan(30);
    });

    it('一元负号：-x^2 → -(2x)', () => {
      // math.simplify 保留外层括号形式 '-(2 * x)' 而非 '-2 * x'
      const r = differentiateWithSteps('-x^2', 'x');
      expect(r.resultString).toBe('-(2 * x)');
    });
  });

  describe('错误处理', () => {
    it('语法错误的表达式抛出异常', () => {
      expect(() => differentiateWithSteps('x +* 2', 'x')).toThrow();
    });

    it('ln(x) 求导成功（内部规范化为 log，显示保留 ln 记号）', () => {
      // 引擎为求值覆盖了 ln，mathjs 求导表不认识它；求导前把 ln
      // 规范化为内置的 log，显示步骤仍按用户输入的 ln 记号呈现。
      const r = differentiateWithSteps('ln(x)', 'x');
      expect(r.resultString).toBe('1 / x');
      expect(r.steps.some((s) => s.includes('对数法则'))).toBe(true);
      expect(r.steps.some((s) => s.includes('\\ln(x)'))).toBe(true);
    });
  });

  describe('数值正确性回归（log 覆盖隔离）', () => {
    it('d/dx 2^x 的系数为 ln(2)≈0.693 而非 log10(2)≈0.301', () => {
      // mathInstance 将共享 mathjs 实例的 log 覆盖为 10 底对数；
      // 求导路径使用未覆盖的 symbolicMath，simplify 常量折叠
      // 才能把 math.derivative 生成的 log(2) 算成 ln(2)。
      const r = differentiateWithSteps('2^x', 'x');
      expect(r.resultString).toBe('0.6931471805599453 * 2 ^ x');
      expect(r.steps.some((s) => s.includes('指数法则'))).toBe(true);
    });

    it('2^x 的导数在 x = 0 处数值等于 ln 2（送回共享引擎验证）', () => {
      const r = differentiateWithSteps('2^x', 'x');
      const compiled = math.compile(r.resultString);
      expect(Number(compiled.evaluate({ x: 0 }))).toBeCloseTo(Math.LN2, 12);
    });

    it('结果中的自然对数以 ln 表示（可直接送回引擎求值）', () => {
      // d/dx x^x = x^x (ln x + 1)；若结果保留 mathjs 的 log 记号，
      // 送回共享实例求值会被误算成 log10。
      const r = differentiateWithSteps('x^x', 'x');
      expect(r.resultString).toBe('x ^ x * (ln(x) + 1)');
      const v = Number(math.compile(r.resultString).evaluate({ x: 2 }));
      expect(v).toBeCloseTo(4 * (Math.LN2 + 1), 10);
    });
  });
});
