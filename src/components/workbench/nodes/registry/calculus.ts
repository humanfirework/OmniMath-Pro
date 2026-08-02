/**
 * Calculus category node definitions.
 * 从 pipelineEngine.ts 拆分而来，行为保持完全一致。
 */

import type { MathNode } from 'mathjs';
import { math, getEvalScope } from '@/lib/engine/mathInstance';
import type { NodeTypeDef } from '../pipelineEngine';
import { formatNumTex, toNumber, toExprString } from './helpers';

// 打包器（webpack/Turbopack）在客户端 bundle 中支持 CommonJS require；
// 这里仅补充类型声明，不改变运行时行为。
declare const require: (id: string) => unknown;

export const calculusNodes = {
  derivative: {
    type: 'derivative',
    category: 'calculus',
    labelKey: 'npDerivative',
    icon: 'Sigma',
    color: 'orange',
    inputs: [{ id: 'expr', labelKey: 'npPortExpr', type: 'expression' }],
    outputs: [{ id: 'result', labelKey: 'npPortResult', type: 'expression' }],
    defaultConfig: { variable: 'x', showSteps: false },
    execute: (inputs, config) => {
      const expr = toExprString(inputs.expr) || 'x';
      const variable = String(config.variable ?? 'x');
      const d = math.derivative(expr, variable) as MathNode;
      // Build a LaTeX representation so the node footer can render the
      // result as a proper formula instead of a raw mathjs node string.
      let latex = '';
      try {
        const exprTex = math.parse(expr).toTex({ implicit: 'hide' });
        const derivTex = d.toTex({ implicit: 'hide' });
        latex = `\\frac{d}{d${variable}}\\left[${exprTex}\\right] = ${derivTex}`;
      } catch {
        latex = '';
      }
      // When showSteps is true, also attach the original expression so
      // downstream display nodes can show "f(x) → f'(x)".
      return config.showSteps
        ? { result: d, latex, original: expr }
        : { result: d, latex };
    },
  },

  integrate: {
    type: 'integrate',
    category: 'calculus',
    labelKey: 'npIntegrate',
    icon: 'Activity',
    color: 'orange',
    inputs: [{ id: 'expr', labelKey: 'npPortExpr', type: 'expression' }],
    outputs: [{ id: 'result', labelKey: 'npPortResult', type: 'number' }],
    defaultConfig: { a: -1, b: 1 },
    execute: (inputs, config) => {
      const expr = toExprString(inputs.expr) || 'x';
      const a = Number(config.a ?? -1);
      const b = Number(config.b ?? 1);
      // Simpson's 1/3 rule with N=200 intervals.
      const N = 200;
      const h = (b - a) / N;
      let sum = 0;
      let numerical = NaN;
      try {
        const fa = Number(math.evaluate(expr, getEvalScope({ x: a })));
        const fb = Number(math.evaluate(expr, getEvalScope({ x: b })));
        sum = fa + fb;
        for (let i = 1; i < N; i++) {
          const xv = a + i * h;
          const yv = Number(math.evaluate(expr, getEvalScope({ x: xv })));
          sum += (i % 2 === 0 ? 2 : 4) * yv;
        }
        numerical = (sum * h) / 3;
      } catch {
        numerical = NaN;
      }
      // Build LaTeX: ∫_a^b expr dx ≈ numerical
      let latex = '';
      try {
        const exprTex = math.parse(expr).toTex({ implicit: 'hide' });
        const aTex = formatNumTex(a);
        const bTex = formatNumTex(b);
        const valTex = formatNumTex(numerical);
        latex = `\\int_{${aTex}}^{${bTex}} ${exprTex} \\, d${String(config.variable ?? 'x')} \\approx ${valTex}`;
      } catch {
        latex = '';
      }
      return { result: numerical, latex };
    },
  },

  'symbolic-integrate': {
    type: 'symbolic-integrate',
    category: 'calculus',
    labelKey: 'npSymbolicIntegrate',
    icon: 'Activity',
    color: 'orange',
    inputs: [{ id: 'expr', labelKey: 'npPortExpr', type: 'expression' }],
    outputs: [{ id: 'result', labelKey: 'npPortResult', type: 'expression' }],
    defaultConfig: { variable: 'x' },
    execute: (inputs, config) => {
      const expr = toExprString(inputs.expr) || 'x';
      const variable = String(config.variable ?? 'x');
      // Use algebrite for symbolic integration (already a dependency).
      // algebrite.integral returns the antiderivative as a string.
      let integralStr = '';
      let latex = '';
      try {
        // Lazy import to avoid loading algebrite until first use.
        // algebrite 运行时通过动态循环导出 integral，allowJs 推断不出该属性，断言补充。
        const algebrite = require('algebrite') as typeof import('algebrite') & {
          integral: (expr: string, variable: string) => unknown;
        };
        integralStr = String(algebrite.integral(expr, variable));
        // Convert to LaTeX via mathjs parse (algebrite's toLatex can be flaky).
        try {
          const tex = math.parse(integralStr).toTex({ implicit: 'hide' });
          const exprTex = math.parse(expr).toTex({ implicit: 'hide' });
          latex = `\\int ${exprTex} \\, d${variable} = ${tex} + C`;
        } catch {
          latex = `\\int ${expr} \\, d${variable} = ${integralStr} + C`;
        }
      } catch (err) {
        return { result: 'integral failed', latex: '' , error: (err as Error).message };
      }
      return { result: integralStr, latex };
    },
  },

  simplify: {
    type: 'simplify',
    category: 'calculus',
    labelKey: 'npSimplify',
    icon: 'Sigma',
    color: 'orange',
    inputs: [{ id: 'expr', labelKey: 'npPortExpr', type: 'expression' }],
    outputs: [{ id: 'result', labelKey: 'npPortResult', type: 'expression' }],
    defaultConfig: {},
    execute: (inputs) => {
      const expr = toExprString(inputs.expr) || 'x';
      try {
        const node = math.simplify(expr);
        const latex = node.toTex({ implicit: 'hide' });
        return { result: node, latex };
      } catch (err) {
        return { result: expr, latex: '', error: (err as Error).message };
      }
    },
  },

  'solve-equation': {
    type: 'solve-equation',
    category: 'calculus',
    labelKey: 'npSolveEquation',
    icon: 'Equal',
    color: 'orange',
    inputs: [
      { id: 'expr', labelKey: 'npPortExpr', type: 'expression' },
    ],
    outputs: [{ id: 'result', labelKey: 'npPortResult', type: 'any' }],
    defaultConfig: { variable: 'x' },
    execute: (inputs, config) => {
      const expr = toExprString(inputs.expr) || 'x';
      const variable = String(config.variable ?? 'x');
      try {
        let fExpr: string;
        if (expr.includes('=')) {
          const parts = expr.split('=');
          const lhs = (parts[0] ?? '').trim();
          const rhs = (parts[1] ?? '0').trim();
          if (lhs && parts.length === 2) {
            fExpr = `(${lhs}) - (${rhs})`;
          } else {
            fExpr = lhs || expr;
          }
        } else {
          fExpr = expr;
        }
        const f = (xv: number) => Number(math.evaluate(fExpr, getEvalScope({ [variable]: xv })));
        const roots: number[] = [];
        const pushUnique = (r: number) => {
          if (!Number.isFinite(r)) return;
          if (!roots.some((rr) => Math.abs(rr - r) < 1e-6)) roots.push(parseFloat(r.toPrecision(8)));
        };
        const N = 200;
        const lo = -20;
        const hi = 20;
        const step = (hi - lo) / N;
        let prev = f(lo);
        if (Number.isFinite(prev) && Math.abs(prev) < 1e-9) pushUnique(lo);
        for (let i = 1; i <= N; i++) {
          const xv = lo + i * step;
          const cur = f(xv);
          const isZero = Number.isFinite(cur) && Math.abs(cur) < 1e-9;
          const signChange = Number.isFinite(prev) && Number.isFinite(cur) && prev * cur < 0;
          if (isZero) {
            pushUnique(xv);
          } else if (signChange) {
            let a2 = xv - step;
            let b2 = xv;
            for (let k = 0; k < 60; k++) {
              const m = (a2 + b2) / 2;
              const fm = f(m);
              if (Math.abs(fm) < 1e-12) { a2 = m; b2 = m; break; }
              if (Number.isFinite(fm) && f(a2) * fm < 0) b2 = m; else a2 = m;
            }
            pushUnique((a2 + b2) / 2);
          }
          prev = cur;
        }
        const sorted = [...roots].sort((a, b) => a - b);
        const rootLatex = sorted.map((r) => math.format(r)).join(', ');
        const latex = `${variable} \\in \\{ ${sorted
          .map((r) => formatNumTex(r))
          .join(', ')} \\}`;
        return { result: sorted.length > 0 ? rootLatex : 'no real roots', latex, roots: sorted };
      } catch (err) {
        return { result: 'solve failed', latex: '', error: (err as Error).message };
      }
    },
  },

  evaluate: {
    type: 'evaluate',
    category: 'calculus',
    labelKey: 'npEvaluate',
    icon: 'Equal',
    color: 'orange',
    inputs: [
      { id: 'expr', labelKey: 'npPortExpr', type: 'expression' },
      { id: 'x', labelKey: 'npPortX', type: 'number' },
    ],
    outputs: [{ id: 'result', labelKey: 'npPortResult', type: 'number' }],
    defaultConfig: {},
    execute: (inputs) => {
      const expr = toExprString(inputs.expr) || 'x';
      const x = toNumber(inputs.x);
      try {
        const r = Number(math.evaluate(expr, getEvalScope({ x })));
        return { result: r };
      } catch {
        return { result: NaN };
      }
    },
  },

  'taylor-series': {
    type: 'taylor-series',
    category: 'calculus',
    labelKey: 'npTaylorSeries',
    icon: 'Sigma',
    color: 'orange',
    inputs: [{ id: 'expr', labelKey: 'npPortExpr', type: 'expression' }],
    outputs: [{ id: 'result', labelKey: 'npPortResult', type: 'expression' }],
    defaultConfig: { variable: 'x', order: 5, center: 0, point: 0 },
    execute: (inputs, config) => {
      const expr = toExprString(inputs.expr) || 'x';
      const variable = String(config.variable ?? 'x');
      const order = Math.max(0, Math.floor(Number(config.order ?? 5)));
      const center = Number(config.center ?? 0);
      const point = Number(config.point ?? 0);

      // 阶乘表（order 一般 ≤ 20，预先计算）。
      const factorial = (n: number): number => {
        let f = 1;
        for (let i = 2; i <= n; i++) f *= i;
        return f;
      };

      // 逐阶符号求导，求 f^(n)(center) / n!。
      const coeffs: number[] = [];
      let currentExpr = expr;
      for (let n = 0; n <= order; n++) {
        let val = NaN;
        try {
          val = Number(math.evaluate(currentExpr, getEvalScope({ [variable]: center })));
        } catch {
          val = NaN;
        }
        coeffs.push(Number.isFinite(val) ? val / factorial(n) : 0);
        if (n < order) {
          try {
            const d = math.derivative(currentExpr, variable) as MathNode;
            currentExpr = d.toString();
          } catch {
            // 无法继续求导：剩余高阶系数置 0。
            for (let k = n + 1; k <= order; k++) coeffs.push(0);
            break;
          }
        }
      }

      // 在 point 处求值：Σ coeffs[n] * (point - center)^n
      let value = 0;
      for (let n = 0; n <= order; n++) {
        value += coeffs[n] * Math.pow(point - center, n);
      }

      // 构造多项式表达式字符串（围绕 center 展开）。
      const offset = center === 0 ? variable : `(${variable} - ${formatNumTex(center)})`;
      const terms: string[] = [];
      for (let n = 0; n <= order; n++) {
        if (coeffs[n] === 0) continue;
        const c = formatNumTex(coeffs[n]);
        if (n === 0) terms.push(c);
        else if (n === 1) terms.push(`${c}*${offset}`);
        else terms.push(`${c}*${offset}^${n}`);
      }
      const polyStr = terms.length > 0 ? terms.join(' + ') : '0';

      let latex = '';
      try {
        const exprTex = math.parse(expr).toTex({ implicit: 'hide' });
        const polyTex = math.parse(polyStr).toTex({ implicit: 'hide' });
        latex = `${exprTex} \\approx ${polyTex}`;
      } catch {
        latex = '';
      }
      return { result: polyStr, value, latex };
    },
  },

  'ode-solve': {
    type: 'ode-solve',
    category: 'calculus',
    labelKey: 'npOdeSolve',
    icon: 'TrendingUp',
    color: 'orange',
    inputs: [
      { id: 'expr', labelKey: 'npPortExpr', type: 'expression' },
      { id: 'x0', labelKey: 'npPortX0', type: 'number' },
      { id: 'y0', labelKey: 'npPortY0', type: 'number' },
      { id: 'xEnd', labelKey: 'npPortXEnd', type: 'number' },
    ],
    outputs: [{ id: 'curve', labelKey: 'npPortCurve', type: 'curve' }],
    defaultConfig: { method: 'rk4', stepSize: 0.1 },
    execute: (inputs, config) => {
      const expr = toExprString(inputs.expr) || '0';
      const x0 = toNumber(inputs.x0);
      const y0 = toNumber(inputs.y0);
      const xEnd = toNumber(inputs.xEnd);
      const method = String(config.method ?? 'rk4');
      const h = Number(config.stepSize ?? 0.1);

      // f(x, y) = 右端函数（expr 表示 y'）。
      const f = (x: number, y: number): number => {
        try {
          const v = Number(math.evaluate(expr, getEvalScope({ x, y })));
          return Number.isFinite(v) ? v : 0;
        } catch {
          return 0;
        }
      };

      const points: Array<{ x: number; y: number }> = [{ x: x0, y: y0 }];
      let x = x0;
      let y = y0;
      const direction = xEnd >= x0 ? 1 : -1;
      const absStep = Math.abs(h) || 0.1;
      const sign = h === 0 ? direction : Math.sign(h);
      // 逐步积分到 xEnd（最后一步可能缩短以恰好到达 xEnd）。
      const maxSteps = 100000;
      for (let i = 0; i < maxSteps; i++) {
        if ((direction > 0 && x >= xEnd) || (direction < 0 && x <= xEnd)) break;
        let step = sign * absStep;
        // 防止越过 xEnd。
        const nextX = x + step;
        if ((direction > 0 && nextX > xEnd) || (direction < 0 && nextX < xEnd)) {
          step = xEnd - x;
        }
        if (method === 'euler') {
          y = y + step * f(x, y);
        } else {
          // RK4。
          const k1 = f(x, y);
          const k2 = f(x + step / 2, y + (step * k1) / 2);
          const k3 = f(x + step / 2, y + (step * k2) / 2);
          const k4 = f(x + step, y + step * k3);
          y = y + (step / 6) * (k1 + 2 * k2 + 2 * k3 + k4);
        }
        x = x + step;
        points.push({ x, y });
      }
      return { curve: { points, closed: false } };
    },
  },

  limit: {
    type: 'limit',
    category: 'calculus',
    labelKey: 'npLimit',
    icon: 'Infinity',
    color: 'orange',
    inputs: [{ id: 'expr', labelKey: 'npPortExpr', type: 'expression' }],
    outputs: [{ id: 'result', labelKey: 'npPortResult', type: 'number' }],
    defaultConfig: { variable: 'x', point: 0 },
    execute: (inputs, config) => {
      const expr = toExprString(inputs.expr) || 'x';
      const variable = String(config.variable ?? 'x');
      const point = Number(config.point ?? 0);
      // 数值极限：从两侧以几何递减步长逼近，检查收敛。
      const epsList = [1e-3, 1e-5, 1e-7, 1e-9];
      const sample = (eps: number): number => {
        try {
          return Number(math.evaluate(expr, getEvalScope({ [variable]: point + eps })));
        } catch {
          return NaN;
        }
      };
      const rightVals = epsList.map((e) => sample(e));
      const leftVals = epsList.map((e) => sample(-e));
      const lastRight = rightVals[rightVals.length - 1];
      const lastLeft = leftVals[leftVals.length - 1];
      if (Number.isFinite(lastRight) && Number.isFinite(lastLeft)) {
        // 两侧收敛到同值 → 双侧极限存在。
        if (Math.abs(lastRight - lastLeft) < 1e-4) {
          return { result: (lastRight + lastLeft) / 2 };
        }
      }
      // 否则返回右侧极限（若有限），否则左侧，否则 NaN。
      if (Number.isFinite(lastRight)) return { result: lastRight };
      if (Number.isFinite(lastLeft)) return { result: lastLeft };
      return { result: NaN };
    },
  },
} satisfies Record<string, NodeTypeDef>;
