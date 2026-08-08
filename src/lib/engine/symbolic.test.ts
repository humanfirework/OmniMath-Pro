import { describe, it, expect } from 'vitest';
import {
  symbolicIntegrate,
  symbolicDefiniteIntegral,
  symbolicLimit,
  symbolicSeries,
} from './symbolic';

describe('symbolic（Algebrite 封装）', () => {
  describe('symbolicIntegrate', () => {
    it('幂函数积分 ∫x^2 dx = x^3/3', async () => {
      const r = await symbolicIntegrate('x^2', 'x');
      expect(r.success).toBe(true);
      expect(r.expression).toBe('1/3*x^3');
      expect(r.latex).toBe('\\frac{x^3}{3}');
    });

    it('步骤包含幂函数法则提示与常量 C 说明', async () => {
      const r = await symbolicIntegrate('x^2', 'x');
      const joined = r.steps.join('\n');
      expect(joined).toContain('幂函数积分');
      expect(joined).toContain('C');
    });

    it('三角函数积分 ∫sin(x) dx = -cos(x)', async () => {
      const r = await symbolicIntegrate('sin(x)', 'x');
      expect(r.success).toBe(true);
      expect(r.expression).toBe('-cos(x)');
    });

    it('高斯积分返回 erf 形式（Algebrite 支持）', async () => {
      const r = await symbolicIntegrate('e^(-x^2)', 'x');
      expect(r.success).toBe(true);
      expect(r.expression).toContain('erf');
    });

    it('语法错误输入当前仍返回 success（疑似 bug）', async () => {
      // 疑似 bug：Algebrite 对非法输入输出多行文本
      //   "integral(x +, ?  x)\nStop: syntax error"
      // algebriteFailed 只用 /^stop:/i 检查首行，第二行起的 "Stop:"
      // 错误漏检，于是错误文本被当作成功结果返回。测试锁定当前行为。
      const r = await symbolicIntegrate('x +', 'x');
      expect(r.success).toBe(true);
      expect(r.expression).toContain('Stop: syntax error');
    });
  });

  describe('symbolicDefiniteIntegral', () => {
    it('闭式解：∫₀¹ x^2 dx = 1/3，附数值结果', async () => {
      const r = await symbolicDefiniteIntegral('x^2', 'x', 0, 1);
      expect(r.success).toBe(true);
      expect(r.expression).toBe('1/3');
      expect(r.latex).toBe('\\frac{1}{3}');
      expect(r.numerical).toBeCloseTo(1 / 3, 5);
      expect(r.steps.join('\n')).toContain('\\int_{0}^{1}');
    });

    it('无闭式解时回退 Simpson 数值积分', async () => {
      // Algebrite 无法给出 sin(x)/x 的闭式 defint → simpsonFallback
      const r = await symbolicDefiniteIntegral('sin(x)/x', 'x', 1, 2);
      expect(r.success).toBe(true);
      expect(r.numerical).toBeCloseTo(0.6593299064355123, 8);
      expect(r.steps.join('\n')).toContain('Simpson');
    });

    it('回退路径不校验区间端点 NaN（疑似 bug）', async () => {
      // 疑似 bug：simpsonFallback 只检查内部采样点 i=1..n-1 的
      // Number.isFinite，端点 f(a)=sin(0)/0=NaN 未检查，导致整个
      // 积分结果为 NaN 却仍以 success=true 返回。测试锁定当前行为。
      const r = await symbolicDefiniteIntegral('sin(x)/x', 'x', 0, 1);
      expect(r.success).toBe(true);
      expect(Number.isNaN(r.numerical)).toBe(true);
    });
  });

  describe('symbolicLimit', () => {
    it('lim sin(x)/x → 0 = 1（Algebrite 不实现 limit，走数值回退）', async () => {
      const r = await symbolicLimit('sin(x)/x', 'x', 0);
      expect(r.success).toBe(true);
      expect(r.numerical).toBeCloseTo(1, 4);
    });

    it('多项式极限 lim x^2 → 2 = 4', async () => {
      const r = await symbolicLimit('x^2', 'x', 2);
      expect(r.success).toBe(true);
      expect(r.numerical).toBeCloseTo(4, 4);
    });

    it('步骤包含极限表达式本身', async () => {
      const r = await symbolicLimit('sin(x)/x', 'x', 0);
      expect(r.steps[0]).toContain('\\lim_{x \\to 0}');
    });
  });

  describe('symbolicSeries', () => {
    it('exp(x) 三阶麦克劳林展开', async () => {
      const r = await symbolicSeries('exp(x)', 'x', 3, 0);
      expect(r.success).toBe(true);
      expect(r.expression).toBe('1/6*x^3+1/2*x^2+x+1');
      expect(r.latex).toBe('1+x+\\frac{x^2}{2}+\\frac{x^3}{6}');
    });

    it('sin(x) 三阶展开', async () => {
      const r = await symbolicSeries('sin(x)', 'x', 3, 0);
      expect(r.success).toBe(true);
      expect(r.expression).toBe('-1/6*x^3+x');
    });

    it('语法错误输入当前仍返回 success（疑似 bug，同积分多行 Stop 漏检）', async () => {
      const r = await symbolicSeries('x +', 'x', 3, 0);
      expect(r.success).toBe(true);
      expect(r.expression).toContain('Stop: syntax error');
    });
  });
});
