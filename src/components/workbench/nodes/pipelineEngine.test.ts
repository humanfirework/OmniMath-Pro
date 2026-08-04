import { describe, it, expect } from 'vitest';
import {
  executePipeline,
  exportPipelineToScript,
  canConnect,
  parseMatrixGrid,
  portCenterY,
  getPortPosition,
  portsSectionHeight,
  getNodeExpression,
  getNodeVariableDeps,
  findVariableDependents,
  buildPipelineDependencyIndex,
  NODE_TYPES,
  NODE_WIDTH,
  NODE_HEADER_H,
  PORT_ROW_H,
  PORTS_PAD_TOP,
  type PipelineNode,
  type PipelineEdge,
  type PipelineContext,
  type NodeType,
} from './pipelineEngine';
import { math } from '@/lib/engine/mathInstance';

// Helper: execute 签名已扩展为支持异步（Task 2 type change only）。
// 由于这些测试覆盖的都是同步节点，这里把结果断言为同步类型。
// Task 3 将把 executePipeline 升级为真正的异步执行器，处理 Promise。
const execSync = (
  r: Record<string, unknown> | Promise<Record<string, unknown>>,
): Record<string, unknown> => r as Record<string, unknown>;
// Task 2: execute 签名改为支持异步，但当前测试全部针对同步节点
// 在这里声明一个仅用于测试的 SYNC 视图，避免在每处调用写 as 断言
// Task 3 将把 executePipeline 升级为真正的异步执行器
type _SyncNodeDef = Omit<import('./pipelineEngine').NodeTypeDef, 'execute'> & {
  execute: (
    inputs: Record<string, unknown>,
    config: Record<string, unknown>,
    ctx: import('./pipelineEngine').PipelineContext,
  ) => Record<string, unknown>;
};
const NODE_TYPES_SYNC = NODE_TYPES as Record<string, _SyncNodeDef>;



const ctx: PipelineContext = { variables: { a: 5 } };
const emptyCtx: PipelineContext = { variables: {} };

function makeNode(
  id: string,
  type: NodeType,
  config: Record<string, unknown> = {},
): PipelineNode {
  return { id, type, position: { x: 0, y: 0 }, config };
}

function makeEdge(from: string, fromPort: string, to: string, toPort: string): PipelineEdge {
  return { id: `${from}-${fromPort}-${to}-${toPort}`, from, fromPort, to, toPort };
}

describe('pipelineEngine', () => {
  describe('布局辅助函数', () => {
    it('portCenterY 按行高线性增长', () => {
      expect(portCenterY(0)).toBe(NODE_HEADER_H + PORTS_PAD_TOP + PORT_ROW_H / 2);
      expect(portCenterY(2)).toBe(NODE_HEADER_H + PORTS_PAD_TOP + PORT_ROW_H / 2 + 2 * PORT_ROW_H);
    });

    it('getPortPosition 输出端口在右侧', () => {
      const n = makeNode('n1', 'number-input', { value: 1 });
      n.position = { x: 100, y: 50 };
      expect(getPortPosition(n, 'value', true)).toEqual({
        x: 100 + NODE_WIDTH - 17,
        y: 50 + portCenterY(0),
      });
    });

    it('getPortPosition 输入端口按索引定位在左侧', () => {
      const n = makeNode('s', 'arithmetic', { op: '+' });
      n.position = { x: 100, y: 50 };
      // 'b' 是第二个输入端口（index 1）
      expect(getPortPosition(n, 'b', false)).toEqual({
        x: 100 + 17,
        y: 50 + portCenterY(1),
      });
    });

    it('getPortPosition 优先使用 DOM 测量偏移', () => {
      const n = makeNode('n1', 'number-input', { value: 1 });
      n.position = { x: 100, y: 50 };
      const offsets = new Map([['n1:value:out', { x: 5, y: 6 }]]);
      expect(getPortPosition(n, 'value', true, offsets)).toEqual({ x: 105, y: 56 });
    });

    it('getPortPosition 对未知端口 / 无端口方向返回 null', () => {
      const n = makeNode('n1', 'number-input', { value: 1 });
      expect(getPortPosition(n, 'nope', true)).toBeNull();
      // display 节点没有输出端口
      expect(getPortPosition(makeNode('d', 'display'), 'value', true)).toBeNull();
    });

    it('portsSectionHeight 取输入输出端口数较大者', () => {
      expect(portsSectionHeight(makeNode('s', 'arithmetic'))).toBe(2 * PORT_ROW_H + 12);
      expect(portsSectionHeight(makeNode('n', 'number-input'))).toBe(1 * PORT_ROW_H + 12);
    });
  });

  describe('canConnect 端口兼容', () => {
    it('同类型可连接', () => {
      expect(canConnect('number', 'number')).toBe(true);
      expect(canConnect('matrix', 'matrix')).toBe(true);
    });

    it('any 与任意类型互通', () => {
      expect(canConnect('number', 'any')).toBe(true);
      expect(canConnect('any', 'matrix')).toBe(true);
    });

    it('不同类型不可连接', () => {
      expect(canConnect('number', 'matrix')).toBe(false);
      expect(canConnect('expression', 'plot')).toBe(false);
    });
  });

  describe('parseMatrixGrid', () => {
    it('解析字符串网格为矩阵', () => {
      const m = parseMatrixGrid([
        [{ value: '1' }, { value: '2' }],
        [{ value: '3' }, { value: '4' }],
      ]);
      expect(m.toArray()).toEqual([[1, 2], [3, 4]]);
    });

    it('非法数字与空串按 0 处理', () => {
      const m = parseMatrixGrid([
        [{ value: '1' }, { value: 'x' }],
        [{ value: '' }, { value: '2.5' }],
      ]);
      expect(m.toArray()).toEqual([[1, 0], [0, 2.5]]);
    });

    it('空网格退化为 [[0]]', () => {
      expect(parseMatrixGrid([] as { value: string }[][]).toArray()).toEqual([[0]]);
    });
  });

  describe('输入类节点 execute', () => {
    it('number-input 输出数值', () => {
      expect(NODE_TYPES_SYNC['number-input'].execute({}, { value: 3.5 }, ctx)).toEqual({ value: 3.5 });
    });

    it('number-input 非数值输入回退为 0', () => {
      expect(NODE_TYPES_SYNC['number-input'].execute({}, { value: 'abc' }, ctx)).toEqual({ value: 0 });
    });

    it('expression-input 原样输出表达式字符串', () => {
      expect(NODE_TYPES_SYNC['expression-input'].execute({}, { expr: 'sin(x)' }, ctx)).toEqual({ value: 'sin(x)' });
    });

    it('variable 从 ctx.variables 读取', () => {
      expect(execSync(NODE_TYPES_SYNC.variable.execute({}, { name: 'a' }, ctx))).toEqual({ value: 5 });
    });

    it('variable 变量缺失或名为空时回退为 0', () => {
      expect(execSync(NODE_TYPES_SYNC.variable.execute({}, { name: 'missing' }, ctx))).toEqual({ value: 0 });
      expect(execSync(NODE_TYPES_SYNC.variable.execute({}, { name: '' }, ctx))).toEqual({ value: 0 });
    });

    it('constant 输出数学常数', () => {
      expect(execSync(NODE_TYPES_SYNC.constant.execute({}, { name: 'pi' }, ctx)).value).toBeCloseTo(Math.PI);
      expect(execSync(NODE_TYPES_SYNC.constant.execute({}, { name: 'e' }, ctx)).value).toBeCloseTo(Math.E);
    });

    it('constant 未知名称回退为 0', () => {
      expect(execSync(NODE_TYPES_SYNC.constant.execute({}, { name: 'nope' }, ctx))).toEqual({ value: 0 });
    });
  });

  describe('运算与函数节点 execute', () => {
    const arith = (a: unknown, b: unknown, op: string) =>
      execSync(NODE_TYPES_SYNC.arithmetic.execute({ a, b }, { op }, ctx)).result;

    it('arithmetic 四则运算与幂、取模', () => {
      expect(arith(2, 3, '+')).toBe(5);
      expect(arith(2, 3, '-')).toBe(-1);
      expect(arith(2, 3, '*')).toBe(6);
      expect(arith(6, 3, '/')).toBe(2);
      expect(arith(2, 3, '^')).toBe(8);
      expect(arith(7, 3, '%')).toBe(1);
    });

    it('arithmetic 除零返回 NaN（不抛错）', () => {
      expect(arith(1, 0, '/')).toBeNaN();
    });

    it('arithmetic 未知运算符回退为加法（当前行为）', () => {
      expect(arith(2, 3, '??')).toBe(5);
    });

    it('arithmetic 字符串数字可转换', () => {
      expect(arith('2', '3', '+')).toBe(5);
    });

    it('function-apply 预设函数', () => {
      expect(NODE_TYPES_SYNC['function-apply'].execute({ x: 0 }, { fn: 'sin' }, ctx).result).toBe(0);
      // 蓝图内 log 按 10 底（与工作台语义一致）
      expect(NODE_TYPES_SYNC['function-apply'].execute({ x: 100 }, { fn: 'log' }, ctx).result).toBe(2);
    });

    it('function-apply 自定义表达式', () => {
      expect(
        NODE_TYPES_SYNC['function-apply'].execute({ x: 2 }, { fn: 'custom', customExpr: 'x^2' }, ctx).result,
      ).toBe(4);
    });

    it('function-apply 自定义表达式看不到 ctx.variables（当前行为）', () => {
      // 自定义表达式在 mathInstance 用户作用域求值，ctx.variables
      // 只供 variable 节点使用，因此引用蓝图变量名会抛
      // "Undefined symbol"。实际应用中两侧作用域由 store 同步。
      expect(() =>
        NODE_TYPES_SYNC['function-apply'].execute({ x: 2 }, { fn: 'custom', customExpr: 'x^2 + a' }, ctx),
      ).toThrow(/Undefined symbol/);
    });
  });

  describe('矩阵节点 execute', () => {
    const m = math.matrix([[1, 2], [3, 4]]);

    it('matrix-op det / rank / transpose', () => {
      expect(NODE_TYPES_SYNC['matrix-op'].execute({ matrix: m }, { op: 'det' }, ctx).result).toBe(-2);
      expect(
        NODE_TYPES_SYNC['matrix-op'].execute({ matrix: math.matrix([[1, 2], [2, 4]]) }, { op: 'rank' }, ctx).result,
      ).toBe(1);
      const tr = NODE_TYPES_SYNC['matrix-op'].execute({ matrix: m }, { op: 'transpose' }, ctx).result;
      expect((tr as ReturnType<typeof math.matrix>).toArray()).toEqual([[1, 3], [2, 4]]);
    });

    it('matrix-op eigen 失败时回退为 eigs failed', () => {
      // 非方阵触发 math.eigs 异常，节点内部捕获
      expect(
        NODE_TYPES_SYNC['matrix-op'].execute({ matrix: math.matrix([[1, 2, 3], [4, 5, 6]]) }, { op: 'eigen' }, ctx)
          .result,
      ).toBe('eigs failed');
    });

    it('matrix-multiply 正常相乘', () => {
      const r = NODE_TYPES_SYNC['matrix-multiply'].execute({ a: m, b: m }, {}, ctx).result;
      expect((r as ReturnType<typeof math.matrix>).toArray()).toEqual([[7, 10], [15, 22]]);
    });

    it('matrix-decompose LU 分解', () => {
      const r = NODE_TYPES_SYNC['matrix-decompose'].execute({ matrix: m }, { method: 'lu' }, ctx);
      expect(r.latex).toBe('A = L \\cdot U');
      const res = r.result as { L: unknown; U: unknown; P: unknown };
      expect(res.L).toBeDefined();
      expect(res.U).toBeDefined();
    });

    it('matrix-decompose cholesky 正确分解对称正定矩阵 [[4,2],[2,3]]', () => {
      const r = NODE_TYPES_SYNC['matrix-decompose'].execute(
        { matrix: math.matrix([[4, 2], [2, 3]]) },
        { method: 'cholesky' },
        ctx,
      );
      expect(r.latex).toBe('A = L L^{T}');
       
      const L = (r.result as { L: any }).L;
      const arr = L.toArray() as number[][];
      // L = [[2, 0], [1, √2]]
      expect(arr[0][0]).toBeCloseTo(2, 10);
      expect(arr[0][1]).toBe(0);
      expect(arr[1][0]).toBeCloseTo(1, 10);
      expect(arr[1][1]).toBeCloseTo(Math.SQRT2, 10);
      // 验证 L · Lᵀ = A
      const rebuilt = (
        math.multiply(L, math.transpose(L)) as unknown as {
          toArray: () => number[][];
        }
      ).toArray();
      expect(rebuilt[0][0]).toBeCloseTo(4, 10);
      expect(rebuilt[0][1]).toBeCloseTo(2, 10);
      expect(rebuilt[1][0]).toBeCloseTo(2, 10);
      expect(rebuilt[1][1]).toBeCloseTo(3, 10);
    });

    it('matrix-decompose cholesky 对非正定矩阵返回明确错误', () => {
      // [[1,2],[2,1]] 对称但特征值为 -1 与 3 —— 非正定
      const r = NODE_TYPES_SYNC['matrix-decompose'].execute(
        { matrix: math.matrix([[1, 2], [2, 1]]) },
        { method: 'cholesky' },
        ctx,
      ) as { result: string; error?: string };
      expect(r.result).toBe('decompose failed');
      expect(r.error).toContain('positive definite');
    });

    it('matrix-decompose 未知 method 返回占位结果', () => {
      const r = NODE_TYPES_SYNC['matrix-decompose'].execute({ matrix: m }, { method: 'svd' }, ctx);
      expect(r.result).toBe('unknown method');
      expect(r.latex).toBe('');
    });
  });

  describe('微积分节点 execute', () => {
    it('derivative 输出导数节点与 LaTeX', () => {
      const r = NODE_TYPES_SYNC.derivative.execute({ expr: 'x^2' }, { variable: 'x' }, ctx);
      expect(String(r.result)).toBe('2 * x');
      expect(r.latex).toContain('\\frac{d}{dx}');
    });

    it('derivative showSteps 附加原表达式', () => {
      const r = NODE_TYPES_SYNC.derivative.execute({ expr: 'x^2' }, { variable: 'x', showSteps: true }, ctx);
      expect(r.original).toBe('x^2');
    });

    it('integrate Simpson 数值积分 ∫₀¹ x² dx ≈ 1/3', () => {
      const r = NODE_TYPES_SYNC.integrate.execute({ expr: 'x^2' }, { a: 0, b: 1 }, ctx);
      expect(r.result as number).toBeCloseTo(1 / 3, 8);
      expect(r.latex).toContain('\\int_{0}^{1}');
    });

    it('symbolic-integrate ∫x² dx = x³/3', () => {
      const r = NODE_TYPES_SYNC['symbolic-integrate'].execute({ expr: 'x^2' }, { variable: 'x' }, ctx);
      expect(r.result).toBe('1/3*x^3');
      expect(r.latex).toContain('+ C');
    });

    it('simplify 合并同类项', () => {
      const r = NODE_TYPES_SYNC.simplify.execute({ expr: '2x + 3x' }, {}, ctx);
      expect(String(r.result)).toBe('5 * x');
    });

    it('solve-equation 解出 x^2 - 4 = 0 的两实根 ±2', () => {
      // 实现把等式移项为单边表达式 (lhs) - (rhs) 再解析，
      // 然后符号扫描 + 二分逼近求实根。
      const r1 = NODE_TYPES_SYNC['solve-equation'].execute({ expr: 'x^2 - 4' }, { variable: 'x' }, ctx) as {
        result: string;
        roots: number[];
      };
      expect(r1.result).toBe('-2, 2');
      expect(r1.roots).toHaveLength(2);
      expect(r1.roots[0]).toBeCloseTo(-2, 6);
      expect(r1.roots[1]).toBeCloseTo(2, 6);
      const r2 = NODE_TYPES_SYNC['solve-equation'].execute({ expr: 'x^2 - 4 = 0' }, { variable: 'x' }, ctx) as {
        result: string;
        roots: number[];
      };
      expect(r2.result).toBe('-2, 2');
      expect(r2.roots).toHaveLength(2);
    });

    it('solve-equation 无实根时返回提示', () => {
      const r = NODE_TYPES_SYNC['solve-equation'].execute({ expr: 'x^2 + 1' }, { variable: 'x' }, ctx);
      expect(r.result).toBe('no real roots');
    });

    it('evaluate 在给定点求值', () => {
      expect(execSync(NODE_TYPES_SYNC.evaluate.execute({ expr: 'x^2 + 1', x: 3 }, {}, ctx)).result).toBe(10);
    });

    it('evaluate 非法表达式返回 NaN', () => {
      expect(NODE_TYPES_SYNC.evaluate.execute({ expr: 'bad(*', x: 3 }, {}, ctx).result as number).toBeNaN();
    });
  });

  describe('executePipeline 图执行', () => {
    it('数据沿边传递：number → arithmetic → display', async () => {
      const nodes = [
        makeNode('n1', 'number-input', { value: 2 }),
        makeNode('n2', 'number-input', { value: 3 }),
        makeNode('sum', 'arithmetic', { op: '+' }),
        makeNode('disp', 'display'),
      ];
      const edges = [
        makeEdge('n1', 'value', 'sum', 'a'),
        makeEdge('n2', 'value', 'sum', 'b'),
        makeEdge('sum', 'result', 'disp', 'value'),
      ];
      const out = await executePipeline(nodes, edges, emptyCtx);
      const byId = new Map(out.map((n) => [n.id, n]));
      expect(byId.get('sum')!.result).toBe(5);
      expect(byId.get('disp')!.result).toBe(5);
      expect(out.every((n) => n.error === undefined)).toBe(true);
    });

    it('返回新节点数组，不修改入参节点', async () => {
      const nodes = [makeNode('n1', 'number-input', { value: 2 })];
      const out = await executePipeline(nodes, [], emptyCtx);
      expect(nodes[0].result).toBeUndefined();
      expect(out[0].result).toBe(2);
      expect(out[0]).not.toBe(nodes[0]);
    });

    it('拓扑排序：节点数组顺序颠倒仍按依赖顺序执行', async () => {
      const nodes = [
        makeNode('disp', 'display'),
        makeNode('sum', 'arithmetic', { op: '*' }),
        makeNode('n2', 'number-input', { value: 4 }),
        makeNode('n1', 'number-input', { value: 2 }),
      ];
      const edges = [
        makeEdge('n1', 'value', 'sum', 'a'),
        makeEdge('n2', 'value', 'sum', 'b'),
        makeEdge('sum', 'result', 'disp', 'value'),
      ];
      const out = await executePipeline(nodes, edges, emptyCtx);
      expect(out.find((n) => n.id === 'disp')!.result).toBe(8);
    });

    it('环中的节点标记 Cycle detected，环外节点不受影响', async () => {
      const nodes = [
        makeNode('x', 'arithmetic', { op: '+' }),
        makeNode('y', 'arithmetic', { op: '+' }),
        makeNode('ok', 'number-input', { value: 7 }),
      ];
      const edges = [makeEdge('x', 'result', 'y', 'a'), makeEdge('y', 'result', 'x', 'a')];
      const out = await executePipeline(nodes, edges, emptyCtx);
      const byId = new Map(out.map((n) => [n.id, n]));
      expect(byId.get('x')!.error).toBe('Cycle detected');
      expect(byId.get('y')!.error).toBe('Cycle detected');
      expect(byId.get('x')!.result).toBeNull();
      expect(byId.get('ok')!.result).toBe(7);
      expect(byId.get('ok')!.error).toBeUndefined();
    });

    it('未知节点类型标记 Unknown node type', async () => {
      const nodes = [{ id: 'u', type: 'no-such' as NodeType, position: { x: 0, y: 0 }, config: {} }];
      const out = await executePipeline(nodes, [], emptyCtx);
      expect(out[0].error).toBe('Unknown node type');
    });

    it('有输入端口但未连线的节点静默跳过（无错误）', async () => {
      const out = await executePipeline([makeNode('sum', 'arithmetic', { op: '+' })], [], emptyCtx);
      expect(out[0].result).toBeNull();
      expect(out[0].error).toBeUndefined();
    });

    it('部分输入未连接的节点静默跳过', async () => {
      const nodes = [makeNode('n1', 'number-input', { value: 2 }), makeNode('sum', 'arithmetic', { op: '+' })];
      const edges = [makeEdge('n1', 'value', 'sum', 'a')];
      const out = await executePipeline(nodes, edges, emptyCtx);
      const sum = out.find((n) => n.id === 'sum')!;
      expect(sum.result).toBeNull();
      expect(sum.error).toBeUndefined();
    });

    it('执行抛错的节点记录 error，下游节点静默跳过', async () => {
      // 1x2 与 1x2 矩阵相乘 → 维度不匹配，matrix-multiply 抛错
      const nodes = [
        makeNode('m1', 'matrix-input', { cells: [[{ value: '1' }, { value: '2' }]] }),
        makeNode('m2', 'matrix-input', { cells: [[{ value: '1' }, { value: '2' }]] }),
        makeNode('mul', 'matrix-multiply'),
        makeNode('disp', 'display'),
      ];
      const edges = [
        makeEdge('m1', 'matrix', 'mul', 'a'),
        makeEdge('m2', 'matrix', 'mul', 'b'),
        makeEdge('mul', 'result', 'disp', 'value'),
      ];
      const out = await executePipeline(nodes, edges, emptyCtx);
      const byId = new Map(out.map((n) => [n.id, n]));
      expect(byId.get('mul')!.error).toContain('Dimension mismatch');
      expect(byId.get('mul')!.result).toBeNull();
      // 上游失败 → 下游输入为 undefined → 按"未就绪"跳过而非报错
      expect(byId.get('disp')!.result).toBeNull();
      expect(byId.get('disp')!.error).toBeUndefined();
    });

    it('除零产生 NaN 而非错误', async () => {
      const nodes = [
        makeNode('n1', 'number-input', { value: 1 }),
        makeNode('n2', 'number-input', { value: 0 }),
        makeNode('div', 'arithmetic', { op: '/' }),
      ];
      const edges = [makeEdge('n1', 'value', 'div', 'a'), makeEdge('n2', 'value', 'div', 'b')];
      const out = await executePipeline(nodes, edges, emptyCtx);
      const div = out.find((n) => n.id === 'div')!;
      expect(div.result).toBeNaN();
      expect(div.error).toBeUndefined();
    });

    it('指向/来自缺失节点的边被忽略', async () => {
      const nodes = [makeNode('n1', 'number-input', { value: 2 })];
      const edges = [makeEdge('n1', 'value', 'ghost', 'a'), makeEdge('ghost', 'x', 'n1', 'y')];
      const out = await executePipeline(nodes, edges, emptyCtx);
      expect(out[0].result).toBe(2);
      expect(out[0].error).toBeUndefined();
    });
  });

  describe('变量依赖追踪', () => {
    const exprNode = makeNode('e1', 'expression-input', { expr: 'sin(a*x) + b' });
    const varNode = makeNode('v1', 'variable', { name: 'a' });
    const customFn = makeNode('f1', 'function-apply', { fn: 'custom', customExpr: 'a*x' });
    const presetFn = makeNode('f2', 'function-apply', { fn: 'sin' });

    it('getNodeExpression 抽取各类节点的表达式', () => {
      expect(getNodeExpression(exprNode)).toBe('sin(a*x) + b');
      expect(getNodeExpression(varNode)).toBe('a');
      expect(getNodeExpression(customFn)).toBe('a*x');
    });

    it('getNodeExpression 对无表达式节点返回空串', () => {
      expect(getNodeExpression(presetFn)).toBe('');
      expect(getNodeExpression(makeNode('n', 'number-input', { value: 1 }))).toBe('');
      expect(getNodeExpression(makeNode('d', 'derivative', { variable: 'x' }))).toBe('');
    });

    it('getNodeVariableDeps 只返回 knownVars 中的依赖', () => {
      expect(getNodeVariableDeps(exprNode, ['a', 'b', 'c'])).toEqual(['a', 'b']);
      expect(getNodeVariableDeps(varNode, ['a', 'b'])).toEqual(['a']);
      expect(getNodeVariableDeps(presetFn, ['a'])).toEqual([]);
    });

    it('findVariableDependents 反向查找引用节点', () => {
      expect(findVariableDependents([exprNode, varNode, presetFn], 'a', ['a', 'b'])).toEqual(['e1', 'v1']);
      expect(findVariableDependents([exprNode, varNode], 'b', ['a', 'b'])).toEqual(['e1']);
    });

    it('findVariableDependents 对未知变量返回空', () => {
      expect(findVariableDependents([exprNode], 'zzz', ['a', 'b'])).toEqual([]);
    });

    it('buildPipelineDependencyIndex 构建全图索引', () => {
      const idx = buildPipelineDependencyIndex([exprNode, varNode, presetFn], ['a', 'b']);
      expect(idx.get('e1')).toEqual(['a', 'b']);
      expect(idx.get('v1')).toEqual(['a']);
      expect(idx.get('f2')).toEqual([]);
    });
  });

  describe('exportPipelineToScript', () => {
    it('导出 number → arithmetic → display 图', () => {
      const nodes = [
        makeNode('n1', 'number-input', { value: 2 }),
        makeNode('n2', 'number-input', { value: 3 }),
        makeNode('sum', 'arithmetic', { op: '+' }),
        makeNode('disp', 'display'),
      ];
      const edges = [
        makeEdge('n1', 'value', 'sum', 'a'),
        makeEdge('n2', 'value', 'sum', 'b'),
        makeEdge('sum', 'result', 'disp', 'value'),
      ];
      const script = exportPipelineToScript(nodes, edges);
      expect(script.split('\n')).toEqual([
        '# OmniMath Pro — Pipeline Export',
        '#',
        'n_n1_value = 2',
        'n_n2_value = 3',
        'n_sum_result = n_n1_value + n_n2_value',
        'display(n_sum_result)',
      ]);
    });

    it('expression-input 的引号被转义', () => {
      const nodes = [makeNode('e', 'expression-input', { expr: 'sin("x")' })];
      const script = exportPipelineToScript(nodes, []);
      expect(script).toContain('n_e_value = "sin(\\"x\\")"');
    });

    it('空图只导出头部注释', () => {
      expect(exportPipelineToScript([], [])).toBe('# OmniMath Pro — Pipeline Export\n#');
    });
  });
});
