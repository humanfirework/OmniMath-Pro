import { describe, it, expect, beforeEach } from 'vitest';
import {
  evaluateExpression,
  evaluateExpressionAsync,
  resetScope,
  getScope,
} from './evaluator';

describe('evaluator', () => {
  // evaluator 使用全局共享 scope，每个用例前重置避免相互污染
  beforeEach(() => {
    resetScope();
  });

  describe('基础求值', () => {
    it('计算简单算术表达式', () => {
      const r = evaluateExpression('2+3');
      expect(r.success).toBe(true);
      expect(r.type).toBe('number');
      expect(r.result).toBe('5');
      expect(r.latex).toBe('5');
    });

    it('消除浮点噪声（0.1 + 0.2 → 0.3）', () => {
      const r = evaluateExpression('0.1 + 0.2');
      expect(r.success).toBe(true);
      expect(r.result).toBe('0.3');
    });

    it('复数结果（sqrt(-1) → i）', () => {
      const r = evaluateExpression('sqrt(-1)');
      expect(r.success).toBe(true);
      expect(r.type).toBe('number');
      expect(r.result).toBe('i');
      expect(r.latex).toBe('i');
    });

    it('布尔比较结果（2 == 2 → true）', () => {
      const r = evaluateExpression('2 == 2');
      expect(r.success).toBe(true);
      expect(r.result).toBe('true');
      expect(r.latex).toBe('\\text{true}');
    });

    it('除零返回 ∞ 而非报错（mathjs 语义：1/0 = Infinity）', () => {
      const r = evaluateExpression('1/0');
      expect(r.success).toBe(true);
      expect(r.result).toBe('\\infty');
    });
  });

  describe('空输入与注释', () => {
    it('空字符串返回错误', () => {
      const r = evaluateExpression('');
      expect(r.success).toBe(false);
      expect(r.type).toBe('error');
      expect(r.error).toBe('Expression is empty.');
      expect(r.hint).toContain('2 + 2');
    });

    it('纯空白返回错误', () => {
      const r = evaluateExpression('   \n  ');
      expect(r.success).toBe(false);
      expect(r.error).toBe('Expression is empty.');
    });

    it('纯注释行视为空输入', () => {
      const r = evaluateExpression('# just a comment');
      expect(r.success).toBe(false);
      expect(r.error).toBe('Expression is empty.');
    });

    it('剥离行尾 # 注释', () => {
      const r = evaluateExpression('2 + 3  # trailing');
      expect(r.success).toBe(true);
      expect(r.result).toBe('5');
    });

    it('剥离 // 注释行', () => {
      const r = evaluateExpression('// header\n2+3');
      expect(r.success).toBe(true);
      expect(r.result).toBe('5');
    });
  });

  describe('赋值与作用域', () => {
    it('变量赋值并写入共享 scope', () => {
      const r = evaluateExpression('a = 5');
      expect(r.success).toBe(true);
      expect(r.type).toBe('assignment');
      expect(r.result).toBe('a = 5');
      expect(r.variables).toMatchObject({ a: 5 });
      expect(getScope().a).toBe(5);
    });

    it('赋值后的变量可被后续表达式引用', () => {
      evaluateExpression('a = 5');
      const r = evaluateExpression('a * 2');
      expect(r.success).toBe(true);
      expect(r.result).toBe('10');
    });

    it('函数定义（f(x) = x^2）', () => {
      const r = evaluateExpression('f(x) = x^2');
      expect(r.success).toBe(true);
      expect(r.type).toBe('assignment');
      expect(r.result).toBe('f(x) = x^2');
      // 函数在 variables 快照中被折叠为占位符，避免 UI JSON 序列化
      expect(r.variables).toMatchObject({ f: '<function>' });
    });

    it('用户函数可被调用', () => {
      evaluateExpression('f(x) = x^2');
      const r = evaluateExpression('f(3)');
      expect(r.success).toBe(true);
      expect(r.result).toBe('9');
    });

    it('赋值右端非法时返回错误且不写 scope', () => {
      const r = evaluateExpression('x = sin(');
      expect(r.success).toBe(false);
      expect(r.error).toContain('Failed to evaluate');
      expect(getScope().x).toBeUndefined();
    });

    it('多字母变量名被隐式乘法拆开后按非法变量名拒绝', () => {
      // simple 模式的隐式乘法预处理把 'bad' 拆成 'b*a*d'，
      // 赋值处理器的变量名校验随即拒绝（当前行为：错误信息
      // 不直接指向右端的语法错误，但同样不污染 scope）。
      const r = evaluateExpression('bad = sin(');
      expect(r.success).toBe(false);
      expect(r.error).toBe('Invalid variable name: "b*a*d".');
      expect(getScope().bad).toBeUndefined();
    });

    it('== 不被误判为赋值', () => {
      const r = evaluateExpression('3 == 3');
      expect(r.success).toBe(true);
      expect(r.type).toBe('number');
      expect(r.result).toBe('true');
    });
  });

  describe('矩阵', () => {
    it('矩阵字面量返回 matrix 类型与二维数组', () => {
      const r = evaluateExpression('[1,2;3,4]');
      expect(r.success).toBe(true);
      expect(r.type).toBe('matrix');
      expect(r.isMatrix).toBe(true);
      expect(r.matrix).toEqual([
        [1, 2],
        [3, 4],
      ]);
      expect(r.latex).toContain('bmatrix');
    });

    it('矩阵运算（det）', () => {
      const r = evaluateExpression('det([1,2;3,4])');
      expect(r.success).toBe(true);
      expect(r.type).toBe('number');
      expect(r.result).toBe('-2');
    });
  });

  describe('错误处理与提示', () => {
    it('未定义符号给出 Define it first 提示', () => {
      const r = evaluateExpression('z + 1');
      expect(r.success).toBe(false);
      expect(r.error).toBe('Undefined symbol "z".');
      expect(r.hint).toBe('Define it first: z = ...');
    });

    it('未定义函数返回错误（failWithHint 只匹配 Undefined symbol，函数无 hint）', () => {
      const r = evaluateExpression('qqq(2)');
      expect(r.success).toBe(false);
      expect(r.error).toBe('Undefined function qqq');
      expect(r.hint).toBeUndefined();
    });

    it('括号不闭合给出括号提示', () => {
      const r = evaluateExpression('sin(1');
      expect(r.success).toBe(false);
      expect(r.error).toContain('Parenthesis');
      expect(r.hint).toContain('matching');
    });
  });

  describe('绘图分发', () => {
    it('plot(sin(x)) 使用默认笛卡尔范围', () => {
      const r = evaluateExpression('plot(sin(x))');
      expect(r.success).toBe(true);
      expect(r.type).toBe('plot');
      expect(r.plotExpression).toBe('sin(x)');
      expect(r.plotRange).toEqual([-10, 10]);
      expect(r.plotType).toBe('cartesian');
    });

    it('plot 支持显式范围参数', () => {
      const r = evaluateExpression('plot(sin(x), -3, 3)');
      expect(r.success).toBe(true);
      expect(r.plotRange).toEqual([-3, 3]);
    });

    it('polar(...) 使用极坐标默认范围 [0, 2π]', () => {
      const r = evaluateExpression('polar(1 + cos(t))');
      expect(r.success).toBe(true);
      expect(r.type).toBe('polar');
      expect(r.plotType).toBe('polar');
      expect(r.plotRange?.[0]).toBe(0);
      expect(r.plotRange?.[1]).toBeCloseTo(2 * Math.PI, 10);
    });

    it('plot3d(...) 返回 surface3d 类型', () => {
      const r = evaluateExpression('plot3d(sin(x)*cos(y))');
      expect(r.success).toBe(true);
      // CalcType 联合类型未声明 'surface3d'，但运行时返回该值（源码内有断言注释）
      expect(r.type).toBe('surface3d');
      expect(r.plotType).toBe('surface3d');
    });

    it('simple 模式下含自由变量 x 的表达式自动转绘图', () => {
      const r = evaluateExpression('sin(x)');
      expect(r.success).toBe(true);
      expect(r.type).toBe('plot');
      expect(r.plotExpression).toBe('sin(x)');
    });
  });

  describe('solve 分发', () => {
    it('求解多项式方程 solve(x^2 - 4, x)', () => {
      const r = evaluateExpression('solve(x^2 - 4, x)');
      expect(r.success).toBe(true);
      expect(r.type).toBe('equation');
      expect(r.result).toBe('x = -2, 2');
      expect(r.steps?.join('\n')).toContain('2 \\text{ real root(s)');
    });

    it('支持 lhs = rhs 等式形式', () => {
      const r = evaluateExpression('solve(x^2 = 4, x)');
      expect(r.success).toBe(true);
      expect(r.result).toBe('x = -2, 2');
    });

    it('无实根时返回提示（仍为 success）', () => {
      const r = evaluateExpression('solve(x^2 + 1, x)');
      expect(r.success).toBe(true);
      expect(r.type).toBe('equation');
      expect(r.result).toBe('No real roots found for x in [-100, 100].');
    });

    it('线性方程组形式 solve(A, b)', () => {
      const r = evaluateExpression('solve([2,1;1,3], [5;10])');
      expect(r.success).toBe(true);
      expect(r.type).toBe('equation');
      expect(r.isMatrix).toBe(true);
      expect(r.matrix).toEqual([[1], [3]]);
    });
  });

  describe('微积分分发', () => {
    it('derivative(x^2, x) 返回 2*x 并带法则步骤', () => {
      const r = evaluateExpression('derivative(x^2, x)');
      expect(r.success).toBe(true);
      expect(r.type).toBe('symbolic');
      expect(r.result).toBe('d/dx [x^2] = 2 * x');
      expect(r.steps?.join('\n')).toContain('幂法则');
    });

    it('diff 是 derivative 的别名', () => {
      const r = evaluateExpression('diff(x^2, x)');
      expect(r.success).toBe(true);
      expect(r.result).toBe('d/dx [x^2] = 2 * x');
    });

    it('diff(ln(x), x) 成功：ln 在求导前规范化为 log', () => {
      // 引擎为求值覆盖了 ln，mathjs 求导表不认识它；求导路径
      // 先把 ln 规范化为内置 log，d/dx ln(x) = 1/x。
      const r = evaluateExpression('diff(ln(x), x)');
      expect(r.success).toBe(true);
      expect(r.type).toBe('symbolic');
      expect(r.result).toBe('d/dx [ln(x)] = 1 / x');
    });

    it('diff(2^x, x) 的系数为 ln 2（不受共享实例 log10 覆盖影响）', () => {
      const r = evaluateExpression('diff(2^x, x)');
      expect(r.success).toBe(true);
      expect(r.result).toBe('d/dx [2^x] = 0.6931471805599453 * 2 ^ x');
    });

    it('integrate 四参数走 Simpson 数值积分', () => {
      const r = evaluateExpression('integrate(x^2, x, 0, 1)');
      expect(r.success).toBe(true);
      expect(r.type).toBe('symbolic');
      expect(r.result).toBe('∫ from 0 to 1 of x^2 dx ≈ 0.3333333333');
      expect(r.steps?.join('\n')).toContain("Simpson's rule");
    });

    it('integrate 两参数在同步路径报错并给出提示', () => {
      const r = evaluateExpression('integrate(x^2, x)');
      expect(r.success).toBe(false);
      expect(r.error).toContain('Symbolic integration is not supported yet');
      expect(r.hint).toBe('Example: integrate(x^2, x, 0, 1)');
    });

    it('limit(sin(x)/x, x, 0) = 1', () => {
      const r = evaluateExpression('limit(sin(x)/x, x, 0)');
      expect(r.success).toBe(true);
      expect(r.result).toBe('Limit as x → 0 = 1');
    });

    it('limit(1/x, x, 0) 左右不等判 DNE', () => {
      const r = evaluateExpression('limit(1/x, x, 0)');
      expect(r.success).toBe(true);
      expect(r.result).toContain('Limit does not exist');
      expect(r.latex).toContain('DNE');
    });

    it('taylor(sin(x), x, 3) 展开到三阶', () => {
      const r = evaluateExpression('taylor(sin(x), x, 3)');
      expect(r.success).toBe(true);
      expect(r.result).toBe('T3(x) ≈ (1) * (x)^1 + (-0.1666666667) * (x)^3');
    });

    it('taylor 负阶数报错', () => {
      const r = evaluateExpression('taylor(sin(x), x, -1)');
      expect(r.success).toBe(false);
      expect(r.error).toBe('Taylor order must be a non-negative integer.');
    });

    it('taylor 阶数超过 50 报错（DoS 防护）', () => {
      const r = evaluateExpression('taylor(sin(x), x, 99)');
      expect(r.success).toBe(false);
      expect(r.error).toBe('Taylor order too large (max 50).');
    });

    it('eigenvectors 对角矩阵返回特征值', () => {
      const r = evaluateExpression('eigenvectors([2,0;0,3])');
      expect(r.success).toBe(true);
      expect(r.type).toBe('symbolic');
      expect(r.result).toBe('Eigenvalues: 2, 3');
    });
  });

  describe('概率分布函数（distpdf/distcdf/distinv/distsample）', () => {
    it('distpdf 标准正态在 0 处的密度 ≈ 0.3989', () => {
      const r = evaluateExpression("distpdf('normal', 0, { mu: 0, sigma: 1 })");
      expect(r.success).toBe(true);
      expect(parseFloat(r.result as string)).toBeCloseTo(0.3989, 4);
    });

    it('normcdf 便捷函数：normcdf(0) = 0.5', () => {
      const r = evaluateExpression('normcdf(0)');
      expect(r.success).toBe(true);
      expect(parseFloat(r.result as string)).toBeCloseTo(0.5, 4);
    });

    it('norminv 便捷函数：norminv(0.975) ≈ 1.96', () => {
      const r = evaluateExpression('norminv(0.975)');
      expect(r.success).toBe(true);
      expect(parseFloat(r.result as string)).toBeCloseTo(1.96, 2);
    });

    it('distsample 支持中文分布名 + seed 可复现', () => {
      const expr = "distsample('正态', 5, { mu: 0, sigma: 1 }, 42)";
      const a = evaluateExpression(expr);
      const b = evaluateExpression(expr);
      expect(a.success).toBe(true);
      expect(a.result).toBe(b.result);
      expect((a.result as string).startsWith('[')).toBe(true);
    });
  });

  describe('evaluateExpressionAsync（Algebrite 符号路径）', () => {
    it('空输入返回错误', async () => {
      const r = await evaluateExpressionAsync('   ');
      expect(r.success).toBe(false);
      expect(r.error).toBe('Expression is empty.');
    });

    it('integrate(expr, var) 走符号不定积分', async () => {
      const r = await evaluateExpressionAsync('integrate(x^2, x)');
      expect(r.success).toBe(true);
      expect(r.type).toBe('symbolic');
      expect(r.result).toBe('∫ x^2 dx = 1/3*x^3');
      expect(r.latex).toBe('\\frac{x^3}{3}');
    });

    it('integrate 带数值边界时回退到同步 Simpson 路径', async () => {
      const r = await evaluateExpressionAsync('integrate(x^2, x, 0, 1)');
      expect(r.success).toBe(true);
      expect(r.result).toBe('∫ from 0 to 1 of x^2 dx ≈ 0.3333333333');
    });

    it("integrate(..., 'symbolic') 五参数形式当前仍走数值路径（疑似 bug）", async () => {
      // 疑似 bug：simple 模式的隐式乘法预处理会把字符串字面量
      // 'symbolic' 改写成 's*y*m*b*o*l*i*c'，导致 async 分支里
      // /['"]symbolic['"]/ 永不命中，符号定积分分支无法触发。
      // 测试锁定当前行为：回退到 Simpson 数值结果。
      const r = await evaluateExpressionAsync("integrate(x^2, x, 0, 1, 'symbolic')");
      expect(r.success).toBe(true);
      expect(r.result).toBe('∫ from 0 to 1 of x^2 dx ≈ 0.3333333333');
    });

    it('limit 符号路径当前原样回显未求值表达式（疑似 bug）', async () => {
      // 疑似 bug：Algebrite.run('limit(...)') 在本环境返回未求值的
      // 'limit(sin(x)/x,x,0)' 原样字符串，symbolic.ts 的 algebriteFailed
      // 未识别这种"回显"，导致 success=true 且结果为无意义的调用串，
      // 数值回退（=1）不会发生。测试锁定当前行为。
      const r = await evaluateExpressionAsync('limit(sin(x)/x, x, 0)');
      expect(r.success).toBe(true);
      expect(r.result).toContain('limit(sin(x)/x,x,0)');
    });

    it('taylor 符号路径返回 Algebrite 展开式', async () => {
      const r = await evaluateExpressionAsync('taylor(sin(x), x, 3)');
      expect(r.success).toBe(true);
      expect(r.result).toBe('T3(x) = -1/6*x^3+x');
    });

    it('普通表达式回退到同步求值', async () => {
      const r = await evaluateExpressionAsync('2+3');
      expect(r.success).toBe(true);
      expect(r.type).toBe('number');
      expect(r.result).toBe('5');
    });
  });
});
