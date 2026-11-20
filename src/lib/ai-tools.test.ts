/**
 * ai-tools 单测 — 上下文组装 + 工具分发（纯逻辑，依赖注入 mock）。
 * 工具调用循环（fetch 层）的测试见 ai-client.test.ts。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildContextMessage,
  collectWorkspaceSnapshot,
  dispatchTool,
  stringifyValue,
  WORKBENCH_TOOLS,
  CONTEXT_LIMITS,
  type WorkspaceSnapshot,
  type WorkbenchToolDeps,
} from './ai-tools';
import { useWorkbenchStore } from './store/workbench';
import { useFileSystemStore } from './store/fileSystemStore';
import { useAIContextStore } from './store/aiContextStore';
import type { EvalResult } from './engine';
import type { EquationSolveOutput } from './engine';

/* ------------------------------------------------------------------ */
/* 上下文组装                                                          */
/* ------------------------------------------------------------------ */

const EMPTY_SNAPSHOT: WorkspaceSnapshot = {
  activeFile: null,
  plots: [],
  variables: [],
  recentError: null,
};

const FULL_SNAPSHOT: WorkspaceSnapshot = {
  activeFile: {
    path: '/示例/入门.omni',
    language: 'simple',
    content: 'a = 5\nplot(sin(x))',
  },
  plots: [
    { expression: 'sin(x)', plotType: 'cartesian', visible: true, xRange: [-10, 10] },
    { expression: 'x^2', plotType: 'cartesian', visible: false, xRange: [-5, 5] },
  ],
  variables: [
    { name: 'a', type: 'number', value: '5' },
    { name: 'M', type: 'matrix', value: '[[1,2],[3,4]]' },
  ],
  recentError: 'plot(sin(: 括号不匹配',
};

describe('buildContextMessage', () => {
  it('空快照：各段落显示占位', () => {
    const text = buildContextMessage(EMPTY_SNAPSHOT);
    expect(text).toContain('[工作台上下文]');
    expect(text).toContain('未打开任何文件');
    expect(text).toContain('绘图表达式: 无');
    expect(text).toContain('已定义变量: 无');
    expect(text).not.toContain('最近的错误');
  });

  it('完整快照：包含文件路径/内容、绘图、变量与最近错误', () => {
    const text = buildContextMessage(FULL_SNAPSHOT);
    expect(text).toContain('/示例/入门.omni');
    expect(text).toContain('a = 5');
    expect(text).toContain('sin(x)');
    expect(text).toContain('已隐藏'); // 第二条 plot visible=false
    expect(text).toContain('a = 5（number）');
    expect(text).toContain('M = [[1,2],[3,4]]（matrix）');
    expect(text).toContain('最近的错误: plot(sin(: 括号不匹配');
  });

  it('超长文件内容按预算截断并标注', () => {
    const snap: WorkspaceSnapshot = {
      ...EMPTY_SNAPSHOT,
      activeFile: {
        path: '/big.omni',
        language: 'simple',
        content: 'x'.repeat(CONTEXT_LIMITS.fileContentChars + 500),
      },
    };
    const text = buildContextMessage(snap);
    expect(text).toContain('文件过长');
    // 截断后正文不应包含完整长度
    expect(text).not.toContain('x'.repeat(CONTEXT_LIMITS.fileContentChars + 500));
  });

  it('空文件标注"文件为空"', () => {
    const snap: WorkspaceSnapshot = {
      ...EMPTY_SNAPSHOT,
      activeFile: { path: '/e.omni', language: 'simple', content: '   ' },
    };
    expect(buildContextMessage(snap)).toContain('（文件为空）');
  });

  it('绘图与变量超过上限时截断并提示剩余条数', () => {
    const plots = Array.from({ length: CONTEXT_LIMITS.plotCount + 3 }, (_, i) => ({
      expression: `f${i}(x)`,
      plotType: 'cartesian',
      visible: true,
      xRange: [-10, 10] as [number, number],
    }));
    const variables = Array.from({ length: CONTEXT_LIMITS.variableCount + 2 }, (_, i) => ({
      name: `v${i}`,
      type: 'number',
      value: String(i),
    }));
    const text = buildContextMessage({ ...EMPTY_SNAPSHOT, plots, variables });
    expect(text).toContain(`共 ${CONTEXT_LIMITS.plotCount + 3} 条`);
    expect(text).toContain('另有 3 条未列出');
    expect(text).toContain(`共 ${CONTEXT_LIMITS.variableCount + 2} 个`);
    expect(text).toContain('另有 2 个未列出');
  });

  it('模块摘要（pipeline/solver/linalg/control）序列化并注入上下文', () => {
    const snap: WorkspaceSnapshot = {
      ...EMPTY_SNAPSHOT,
      solver: { tab: 'equation', equation: 'x^2-1=0' },
      pipeline: { nodes: [{ id: 'n1', type: 'edge-detect', config: { lowThreshold: 30 } }], edgeCount: 1 },
      linalg: { matrices: [{ name: 'A', data: [[1, 0], [0, 1]] }], selectedName: 'A' },
      control: { pid: { kp: 1, ki: 0, kd: 0 } },
    };
    const text = buildContextMessage(snap);
    expect(text).toContain('求解器');
    expect(text).toContain('x^2-1=0');
    expect(text).toContain('蓝图节点图');
    expect(text).toContain('edge-detect');
    expect(text).toContain('线性代数矩阵');
    expect(text).toContain('selectedName');
    expect(text).toContain('控制理论');
  });

  it('超长模块摘要按预算截断并标注', () => {
    const snap: WorkspaceSnapshot = {
      ...EMPTY_SNAPSHOT,
      solver: { equation: 'x'.repeat(CONTEXT_LIMITS.moduleSummaryChars + 200) },
    };
    const text = buildContextMessage(snap);
    expect(text).toContain('已截断');
    expect(text).not.toContain('x'.repeat(CONTEXT_LIMITS.moduleSummaryChars + 200));
  });

  it('缺失模块摘要时上下文不报错', () => {
    const text = buildContextMessage(EMPTY_SNAPSHOT);
    expect(text).not.toContain('求解器（当前状态');
  });
});

describe('stringifyValue', () => {
  it('基础类型直接转字符串', () => {
    expect(stringifyValue(5)).toBe('5');
    expect(stringifyValue('abc')).toBe('abc');
    expect(stringifyValue(true)).toBe('true');
    expect(stringifyValue(null)).toBe('null');
  });

  it('对象/矩阵走 JSON', () => {
    expect(stringifyValue([[1, 2], [3, 4]])).toBe('[[1,2],[3,4]]');
  });

  it('超长值截断', () => {
    const long = 'y'.repeat(200);
    expect(stringifyValue(long, 50)).toHaveLength(51); // 50 + …
  });
});

/* ------------------------------------------------------------------ */
/* 工具分发                                                            */
/* ------------------------------------------------------------------ */

function makeDeps(overrides: Partial<WorkbenchToolDeps> = {}): WorkbenchToolDeps {
  return {
    evaluate: (): EvalResult => ({
      success: true,
      result: '42',
      latex: '42',
      type: 'number',
    }),
    solve: async (): Promise<EquationSolveOutput> => ({
      warnings: [],
      result: {
        latex: 'x_1 = 2',
        roots: [
          { re: 2, im: 0 },
          { re: 3, im: 0 },
        ],
        kind: 'polynomial',
        info: '2 实根, 0 复根, 次数 2',
        steps: ['步骤一', '步骤二'],
      },
    }),
    addPlot: vi.fn(),
    getPlotCount: () => 0,
    getSnapshot: () => FULL_SNAPSHOT,
    ...overrides,
  };
}

describe('dispatchTool', () => {
  it('非法 JSON 参数 → 失败结果，不抛出', async () => {
    const r = await dispatchTool('evaluate_expression', '{not json', makeDeps());
    expect(r.ok).toBe(false);
    expect(r.content).toContain('JSON');
  });

  it('未知工具 → 失败结果并列出可用工具', async () => {
    const r = await dispatchTool('delete_everything', '{}', makeDeps());
    expect(r.ok).toBe(false);
    expect(r.content).toContain('未知工具');
    expect(r.content).toContain('evaluate_expression');
  });

  describe('evaluate_expression', () => {
    it('成功：返回 "expr = result"', async () => {
      const evaluate = vi.fn().mockReturnValue({
        success: true,
        result: '42',
        latex: '42',
        type: 'number',
      } satisfies EvalResult);
      const r = await dispatchTool(
        'evaluate_expression',
        JSON.stringify({ expr: '6*7' }),
        makeDeps({ evaluate }),
      );
      expect(evaluate).toHaveBeenCalledWith('6*7');
      expect(r).toEqual({ ok: true, content: '6*7 = 42' });
    });

    it('求值失败：透传 error 与 hint', async () => {
      const evaluate = vi.fn().mockReturnValue({
        success: false,
        result: '',
        latex: '',
        type: 'error',
        error: '未定义符号',
        hint: '检查变量名',
      } satisfies EvalResult);
      const r = await dispatchTool(
        'evaluate_expression',
        JSON.stringify({ expr: 'foo+' }),
        makeDeps({ evaluate }),
      );
      expect(r.ok).toBe(false);
      expect(r.content).toContain('未定义符号');
      expect(r.content).toContain('检查变量名');
    });

    it('缺少 expr 参数 → 失败', async () => {
      const r = await dispatchTool('evaluate_expression', '{}', makeDeps());
      expect(r.ok).toBe(false);
      expect(r.content).toContain('expr');
    });

    it('引擎抛异常 → 编码为失败结果而不抛出', async () => {
      const evaluate = vi.fn(() => {
        throw new Error('boom');
      });
      const r = await dispatchTool(
        'evaluate_expression',
        JSON.stringify({ expr: '1+1' }),
        makeDeps({ evaluate }),
      );
      expect(r.ok).toBe(false);
      expect(r.content).toContain('boom');
    });
  });

  describe('solve_equation', () => {
    it('成功：返回根、说明与分步', async () => {
      const solve = vi.fn().mockResolvedValue({
        warnings: [],
        result: {
          latex: '',
          roots: [
            { re: 2, im: 0 },
            { re: 3, im: 0 },
          ],
          kind: 'polynomial',
          info: '2 实根',
          steps: ['步骤一', '步骤二'],
        },
      } satisfies EquationSolveOutput);
      const r = await dispatchTool(
        'solve_equation',
        JSON.stringify({ expr: 'x^2-5x+6=0' }),
        makeDeps({ solve }),
      );
      expect(solve).toHaveBeenCalledWith('x^2-5x+6=0', 'x');
      expect(r.ok).toBe(true);
      expect(r.content).toContain('x = 2');
      expect(r.content).toContain('x = 3');
      expect(r.content).toContain('2 实根');
      expect(r.content).toContain('步骤一');
    });

    it('自定义变量名透传', async () => {
      const solve = vi.fn().mockResolvedValue({ warnings: [], error: '无解' });
      await dispatchTool(
        'solve_equation',
        JSON.stringify({ expr: 't^2=4', variable: 't' }),
        makeDeps({ solve }),
      );
      expect(solve).toHaveBeenCalledWith('t^2=4', 't');
    });

    it('空 expr 在分发层拦截，不触达引擎', async () => {
      const solve = vi.fn();
      const r = await dispatchTool(
        'solve_equation',
        JSON.stringify({ expr: '  ' }),
        makeDeps({ solve }),
      );
      expect(r.ok).toBe(false);
      expect(r.content).toContain('expr');
      expect(solve).not.toHaveBeenCalled();
    });

    it('引擎 error 字段 → 失败结果', async () => {
      const solve = vi
        .fn()
        .mockResolvedValue({ warnings: [], error: '无法求解' } satisfies EquationSolveOutput);
      const r = await dispatchTool(
        'solve_equation',
        JSON.stringify({ expr: 'x^x=0' }),
        makeDeps({ solve }),
      );
      expect(r.ok).toBe(false);
      expect(r.content).toContain('无法求解');
    });
  });

  describe('plot_function', () => {
    it('调用 addPlot 加入直角坐标曲线，颜色按现有条数轮换', async () => {
      const addPlot = vi.fn();
      const r = await dispatchTool(
        'plot_function',
        JSON.stringify({ expr: 'sin(x)' }),
        makeDeps({ addPlot, getPlotCount: () => 1 }),
      );
      expect(r.ok).toBe(true);
      expect(addPlot).toHaveBeenCalledTimes(1);
      const plot = addPlot.mock.calls[0][0];
      expect(plot.expression).toBe('sin(x)');
      expect(plot.plotType).toBe('cartesian');
      expect(plot.visible).toBe(true);
      expect(plot.xRange).toEqual([-10, 10]);
      expect(plot.color).toBe('#fbbf24'); // 调色板第 2 个（已有 1 条）
      expect(r.content).toContain('sin(x)');
    });

    it('缺少 expr → 失败且不调用 addPlot', async () => {
      const addPlot = vi.fn();
      const r = await dispatchTool('plot_function', '{}', makeDeps({ addPlot }));
      expect(r.ok).toBe(false);
      expect(addPlot).not.toHaveBeenCalled();
    });
  });

  describe('get_workspace_state', () => {
    it('返回快照 JSON（文件内容限长）', async () => {
      const r = await dispatchTool('get_workspace_state', '{}', makeDeps());
      expect(r.ok).toBe(true);
      const parsed = JSON.parse(r.content) as WorkspaceSnapshot;
      expect(parsed.activeFile?.path).toBe('/示例/入门.omni');
      expect(parsed.plots).toHaveLength(2);
      expect(parsed.variables.map((v) => v.name)).toEqual(['a', 'M']);
      expect(parsed.recentError).toContain('括号不匹配');
    });

    it('超长文件内容在工具响应中截断', async () => {
      const snap: WorkspaceSnapshot = {
        ...FULL_SNAPSHOT,
        activeFile: {
          path: '/big.omni',
          language: 'simple',
          content: 'z'.repeat(5000),
        },
      };
      const r = await dispatchTool(
        'get_workspace_state',
        '{}',
        makeDeps({ getSnapshot: () => snap }),
      );
      expect(r.ok).toBe(true);
      expect(r.content).toContain('截断');
      expect(r.content.length).toBeLessThan(5000);
    });
  });

  describe('configure_node', () => {
    it('成功：调用 configureNode 并透传消息', async () => {
      const configureNode = vi.fn().mockReturnValue({ ok: true, message: '已更新节点' });
      const r = await dispatchTool(
        'configure_node',
        JSON.stringify({ nodeId: 'ed-1', configPatch: { lowThreshold: 60, highThreshold: 120 } }),
        makeDeps({ configureNode }),
      );
      expect(configureNode).toHaveBeenCalledWith('ed-1', { lowThreshold: 60, highThreshold: 120 });
      expect(r).toEqual({ ok: true, content: '已更新节点' });
    });

    it('清洗补丁：丢弃 NaN/Infinity 与非基础类型字段', async () => {
      const configureNode = vi.fn().mockReturnValue({ ok: true, message: 'ok' });
      await dispatchTool(
        'configure_node',
        JSON.stringify({
          nodeId: 'ed-1',
          configPatch: { lowThreshold: 60, bad: NaN, arr: [1], obj: { x: 1 } },
        }),
        makeDeps({ configureNode }),
      );
      expect(configureNode).toHaveBeenCalledWith('ed-1', { lowThreshold: 60 });
    });

    it('configPatch 非对象 → 失败', async () => {
      const configureNode = vi.fn();
      const r = await dispatchTool(
        'configure_node',
        JSON.stringify({ nodeId: 'ed-1', configPatch: [1, 2] }),
        makeDeps({ configureNode }),
      );
      expect(r.ok).toBe(false);
      expect(r.content).toContain('configPatch');
      expect(configureNode).not.toHaveBeenCalled();
    });

    it('缺少 nodeId → 失败', async () => {
      const r = await dispatchTool('configure_node', '{}', makeDeps());
      expect(r.ok).toBe(false);
      expect(r.content).toContain('nodeId');
    });

    it('依赖未提供 → 环境不可用', async () => {
      const r = await dispatchTool(
        'configure_node',
        JSON.stringify({ nodeId: 'ed-1', configPatch: { a: 1 } }),
        makeDeps(),
      );
      expect(r.ok).toBe(false);
      expect(r.content).toContain('该操作当前环境不可用');
    });
  });

  describe('apply_matrix', () => {
    it('成功：调用 applyMatrix 并透传消息', async () => {
      const applyMatrix = vi.fn().mockReturnValue({ ok: true, message: '已设置矩阵' });
      const r = await dispatchTool(
        'apply_matrix',
        JSON.stringify({ matrix: [[0, -1], [1, 0]], dim: 2 }),
        makeDeps({ applyMatrix }),
      );
      expect(applyMatrix).toHaveBeenCalledWith([[0, -1], [1, 0]], 2);
      expect(r).toEqual({ ok: true, content: '已设置矩阵' });
    });

    it('清洗矩阵：NaN/Infinity 归零，非数字转数字', async () => {
      const applyMatrix = vi.fn().mockReturnValue({ ok: true, message: 'ok' });
      await dispatchTool(
        'apply_matrix',
        JSON.stringify({ matrix: [[NaN, Infinity], ['2', -3]] }),
        makeDeps({ applyMatrix }),
      );
      expect(applyMatrix).toHaveBeenCalledWith([[0, 0], [2, -3]], 2);
    });

    it('非二维数组 → 失败', async () => {
      const applyMatrix = vi.fn();
      const r = await dispatchTool('apply_matrix', JSON.stringify({ matrix: [1, 2, 3] }), makeDeps({ applyMatrix }));
      expect(r.ok).toBe(false);
      expect(r.content).toContain('matrix');
      expect(applyMatrix).not.toHaveBeenCalled();
    });

    it('依赖未提供 → 环境不可用', async () => {
      const r = await dispatchTool('apply_matrix', JSON.stringify({ matrix: [[1, 0], [0, 1]] }), makeDeps());
      expect(r.ok).toBe(false);
      expect(r.content).toContain('该操作当前环境不可用');
    });
  });

  describe('configure_solver', () => {
    it('成功：调用 configureSolver 并透传消息', async () => {
      const configureSolver = vi.fn().mockReturnValue({ ok: true, message: '已设置求解器' });
      const r = await dispatchTool(
        'configure_solver',
        JSON.stringify({ tab: 'equation', patch: { equation: 'x^2-1=0' } }),
        makeDeps({ configureSolver }),
      );
      expect(configureSolver).toHaveBeenCalledWith('equation', { equation: 'x^2-1=0' });
      expect(r).toEqual({ ok: true, content: '已设置求解器' });
    });

    it('非法 tab → 失败', async () => {
      const configureSolver = vi.fn();
      const r = await dispatchTool(
        'configure_solver',
        JSON.stringify({ tab: 'bogus', patch: {} }),
        makeDeps({ configureSolver }),
      );
      expect(r.ok).toBe(false);
      expect(r.content).toContain('tab');
      expect(configureSolver).not.toHaveBeenCalled();
    });

    it('patch 非对象 → 失败', async () => {
      const configureSolver = vi.fn();
      const r = await dispatchTool(
        'configure_solver',
        JSON.stringify({ tab: 'equation', patch: 'x' }),
        makeDeps({ configureSolver }),
      );
      expect(r.ok).toBe(false);
      expect(r.content).toContain('patch');
    });

    it('依赖未提供 → 环境不可用', async () => {
      const r = await dispatchTool('configure_solver', JSON.stringify({ tab: 'limit', patch: {} }), makeDeps());
      expect(r.ok).toBe(false);
      expect(r.content).toContain('该操作当前环境不可用');
    });
  });

  describe('set_editor_content', () => {
    it('replace 模式：调用 setEditorContent(content, "replace")', async () => {
      const setEditorContent = vi.fn().mockReturnValue({ ok: true, message: '已覆写' });
      const r = await dispatchTool(
        'set_editor_content',
        JSON.stringify({ content: 'a = 1', mode: 'replace' }),
        makeDeps({ setEditorContent }),
      );
      expect(setEditorContent).toHaveBeenCalledWith('a = 1', 'replace');
      expect(r).toEqual({ ok: true, content: '已覆写' });
    });

    it('append 模式：调用 setEditorContent(content, "append")', async () => {
      const setEditorContent = vi.fn().mockReturnValue({ ok: true, message: '已追加' });
      await dispatchTool('set_editor_content', JSON.stringify({ content: 'b = 2', mode: 'append' }), makeDeps({ setEditorContent }));
      expect(setEditorContent).toHaveBeenCalledWith('b = 2', 'append');
    });

    it('缺省 mode 默认 replace', async () => {
      const setEditorContent = vi.fn().mockReturnValue({ ok: true, message: 'ok' });
      await dispatchTool('set_editor_content', JSON.stringify({ content: 'c = 3' }), makeDeps({ setEditorContent }));
      expect(setEditorContent).toHaveBeenCalledWith('c = 3', 'replace');
    });

    it('content 非字符串 → 失败', async () => {
      const setEditorContent = vi.fn();
      const r = await dispatchTool('set_editor_content', JSON.stringify({ content: 42 }), makeDeps({ setEditorContent }));
      expect(r.ok).toBe(false);
      expect(r.content).toContain('content');
      expect(setEditorContent).not.toHaveBeenCalled();
    });

    it('依赖未提供 → 环境不可用', async () => {
      const r = await dispatchTool('set_editor_content', JSON.stringify({ content: 'x' }), makeDeps());
      expect(r.ok).toBe(false);
      expect(r.content).toContain('该操作当前环境不可用');
    });
  });

  describe('build_pipeline', () => {
    it('调用 buildPipeline 并把节点规格透传', async () => {
      const buildPipeline = vi.fn().mockReturnValue({ ok: true, message: '已搭建 3 个节点' });
      const spec = {
        nodes: [{ type: 'image-input' }, { type: 'edge-detect', config: { lowThreshold: 60 } }, { type: 'plot-curves' }],
        edges: [{ from: 0, to: 1 }],
        clearExisting: false,
      };
      const r = await dispatchTool('build_pipeline', JSON.stringify(spec), makeDeps({ buildPipeline }));
      expect(buildPipeline).toHaveBeenCalledTimes(1);
      expect(buildPipeline.mock.calls[0][0]).toEqual(spec);
      expect(r).toEqual({ ok: true, content: '已搭建 3 个节点' });
    });

    it('缺省 clearExisting → true，缺省 edges → undefined', async () => {
      const buildPipeline = vi.fn().mockReturnValue({ ok: true, message: 'ok' });
      await dispatchTool(
        'build_pipeline',
        JSON.stringify({ nodes: [{ type: 'number-input' }] }),
        makeDeps({ buildPipeline }),
      );
      const arg = buildPipeline.mock.calls[0][0];
      expect(arg.clearExisting).toBe(true);
      expect(arg.edges).toBeUndefined();
    });

    it('nodes 为空/缺失 → 失败', async () => {
      const buildPipeline = vi.fn();
      const r = await dispatchTool('build_pipeline', JSON.stringify({ nodes: [] }), makeDeps({ buildPipeline }));
      expect(r.ok).toBe(false);
      expect(r.content).toContain('nodes');
      expect(buildPipeline).not.toHaveBeenCalled();
    });

    it('依赖未提供 → 环境不可用', async () => {
      const r = await dispatchTool('build_pipeline', JSON.stringify({ nodes: [{ type: 'number-input' }] }), makeDeps());
      expect(r.ok).toBe(false);
      expect(r.content).toContain('该操作当前环境不可用');
    });
  });
});

/* ------------------------------------------------------------------ */
/* collectWorkspaceSnapshot（真实 store，只读接线验证）                 */
/* ------------------------------------------------------------------ */

describe('collectWorkspaceSnapshot', () => {
  beforeEach(() => {
    useFileSystemStore.setState({
      nodes: {
        'f-1': {
          id: 'f-1',
          name: '测试.omni',
          type: 'file',
          parentId: null,
          content: 'b = 3',
          language: 'simple',
          createdAt: 0,
          updatedAt: 0,
        },
      },
      activeFileId: 'f-1',
      loaded: true,
    });
    useWorkbenchStore.setState({
      plots: [
        {
          id: 'p1',
          expression: 'cos(x)',
          xRange: [-10, 10],
          yRange: [-50, 50],
          color: '#2dd4bf',
          plotType: 'cartesian',
          visible: true,
        },
      ],
      variables: {
        b: { name: 'b', value: 3, type: 'number' },
      },
      results: [
        {
          id: 'r1',
          input: '1+',
          output: '',
          latex: '',
          timestamp: 1,
          type: 'error',
          error: 'Unexpected end of expression',
        },
      ],
    });
  });

  it('汇总激活文件、绘图、变量与最近错误', () => {
    const snap = collectWorkspaceSnapshot();
    expect(snap.activeFile?.path).toBe('/测试.omni');
    expect(snap.activeFile?.content).toBe('b = 3');
    expect(snap.plots).toHaveLength(1);
    expect(snap.plots[0].expression).toBe('cos(x)');
    expect(snap.variables).toEqual([{ name: 'b', type: 'number', value: '3' }]);
    expect(snap.recentError).toContain('Unexpected end of expression');
  });

  it('无激活文件时 activeFile 为 null', () => {
    useFileSystemStore.setState({ activeFileId: null });
    expect(collectWorkspaceSnapshot().activeFile).toBeNull();
  });

  it('集成 aiContextStore：pipeline/solver/linalg/control 摘要并入快照', () => {
    useAIContextStore.setState({
      solver: { tab: 'equation', equation: 'x^2=4' },
      linalg: { matrices: [{ name: 'A', data: [[1, 0], [0, 1]] }], selectedName: 'A' },
      pipeline: { nodes: [{ id: 'n1', type: 'edge-detect', config: {} }], edgeCount: 0 },
      control: { pid: { kp: 1 } },
    });
    const snap = collectWorkspaceSnapshot();
    expect(snap.solver).toEqual({ tab: 'equation', equation: 'x^2=4' });
    expect((snap.linalg as { matrices?: unknown[] } | undefined)?.matrices).toHaveLength(1);
    expect(snap.pipeline).toHaveProperty('nodes');
    expect(snap.control).toEqual({ pid: { kp: 1 } });
  });

  it('工具清单包含全部工作台工具（4 基础 + 5 深度集成）', () => {
    const names = WORKBENCH_TOOLS.map((t) => t.function.name);
    expect(names).toEqual([
      'evaluate_expression',
      'solve_equation',
      'plot_function',
      'get_workspace_state',
      'configure_node',
      'apply_matrix',
      'configure_solver',
      'set_editor_content',
      'build_pipeline',
    ]);
    for (const tool of WORKBENCH_TOOLS) {
      expect(tool.type).toBe('function');
      expect(tool.function.parameters).toHaveProperty('type', 'object');
    }
  });
});
