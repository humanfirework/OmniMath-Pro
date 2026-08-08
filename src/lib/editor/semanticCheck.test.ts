import { describe, it, expect } from 'vitest';
import { analyzeSemantics } from './semanticCheck';

describe('analyzeSemantics', () => {
  it('检测拼错的函数：sinn(x) 提示用 sin', () => {
    const issues = analyzeSemantics('y = sinn(3.14)\n');
    expect(issues).toHaveLength(1);
    expect(issues[0].kind).toBe('undefined-function');
    expect(issues[0].message).toContain('sin');
  });

  it('正常的内置函数不误报', () => {
    const issues = analyzeSemantics('y = sin(x) + cos(x)\n');
    // x 未定义会被报为变量；sin/cos 不应报函数
    const fnIssues = issues.filter((i) => i.kind === 'undefined-function');
    expect(fnIssues).toHaveLength(0);
  });

  it('未定义变量被报错，已赋值变量不报', () => {
    const issues = analyzeSemantics('a = 1\nb = a + 2\nc = d + 3\n');
    // d 未定义
    const varIssues = issues.filter((i) => i.kind === 'undefined-variable');
    expect(varIssues.map((i) => i.line)).toEqual([3]);
    expect(varIssues[0].message).toContain('d');
  });

  it('内置常量与 for 循环变量不误报', () => {
    const issues = analyzeSemantics('s = pi * r^2\nfor i = 1:10\n  s2 = s + i\nend\n');
    const vars = issues.filter((i) => i.kind === 'undefined-variable').map((i) => i.line);
    // pi 是常量；r 未定义（第1行）；i 是循环变量（第2、3行）不报；end 跳过
    expect(vars).toEqual([1]);
  });

  it('工作台已知变量作为上下文传入时不误报', () => {
    const issues = analyzeSemantics('y = k * x\n', { variables: ['k', 'x'] });
    expect(issues).toHaveLength(0);
  });

  it('用户自定义函数 f(x) 定义后调用不误报', () => {
    const issues = analyzeSemantics('f(x) = x^2\ny = f(3)\n');
    expect(issues.filter((i) => i.kind === 'undefined-function')).toHaveLength(0);
  });

  it('注释内的标识符不误报', () => {
    const issues = analyzeSemantics('y = 1  # foo(bar) 和 baz\n');
    expect(issues).toHaveLength(0);
  });

  it('det 与 plot3D（大小写混合）不误报为未定义函数', () => {
    const issues = analyzeSemantics('d = det([1,2;3,4])\nplot3D(sin(x)*cos(y))\n');
    expect(issues.filter((i) => i.kind === 'undefined-function')).toHaveLength(0);
  });

  it('函数名不会被拆成前缀当作未定义变量（det→de、plot3d→plot3）', () => {
    // 之前 varRe 的 `\w*` 会回溯，把 `det(` 误报成变量 de、`plot3d(` 误报成 plot3。
    const issues = analyzeSemantics('det(A)\nplot3d(sin(x)*cos(y))\n');
    // 不应出现任何以 de / plot3 / det / plot3d 为名的变量或函数
    for (const it of issues) {
      expect(it.message).not.toMatch(/「de」|「plot3」|「det」|「plot3d」/);
    }
    // plot3d 属绘图命令（自变量 x/y 由引擎隐式定义），整行跳过未定义判定；
    // det 行的自由变量 A 仍会被正确指出。
    const vars = issues.filter((i) => i.kind === 'undefined-variable').map((i) => i.line);
    expect(vars).toEqual([1]);
  });

  it('极坐标自变量 theta 不误报（r = f(θ) 由引擎识别为极坐标绘图）', () => {
    const issues = analyzeSemantics('r = 4*sin(6*theta)\nr = 2*(1 + cos(theta))\n');
    // theta 是引擎隐式定义的极坐标自变量，不应被报为未定义变量。
    const vars = issues.filter((i) => i.message.includes('theta'));
    expect(vars).toHaveLength(0);
  });

  it('直角坐标自动绘图的自变量 x 不误报，其余未定义变量仍报', () => {
    const issues = analyzeSemantics('sin(x) * cos(x)\ny = k * x + z\n');
    // sin(x)*cos(x) 含自由 x → 引擎 auto-plot，x 不误报；
    // y 已赋值；k、z 未定义且非绘图自变量 → 仍应被报。
    const vars = issues.filter((i) => i.kind === 'undefined-variable').map((i) => i.message);
    expect(vars.some((m) => m.includes('k'))).toBe(true);
    expect(vars.some((m) => m.includes('z'))).toBe(true);
    expect(vars.some((m) => m.includes('x'))).toBe(false);
  });

  it('大写的 X（非绘图自变量）仍会被报为未定义变量', () => {
    const issues = analyzeSemantics('y = X + 1\n');
    // 引擎 auto-plot 只认小写 x；大写 X 属于普通未定义变量，仍应报。
    const vars = issues.filter((i) => i.message.includes('X'));
    expect(vars.length).toBeGreaterThan(0);
  });
});
