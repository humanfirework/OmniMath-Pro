'use client';

/**
 * OmniMath Pro — Demos 模式输入面板（Desmos 式）
 *
 * 与代码编辑器并列的可选输入方式。用户直接在输入框里书写数学表达式
 * （如 `r = sin(6θ)`、`sin(x)`、`a*x^2 + b`），无需 `plot(...)` 包装：
 *   - 自动识别坐标系（极坐标 `r = f(θ)` / 笛卡尔 `y = f(x)` 等）；
 *   - 自动识别表达式中的自由参数（θ/x/y/t 除外），供下方滑块实时调节；
 *   - 按 Enter 或点击「绘图」后，把曲线送入 workbench store 的 plots，
 *     由 Plot2DPanel + ParameterSliders 完成渲染与参数滑块。
 *
 * 坐标/参数识别复用 evaluateExpressionAsync（与运行脚本同一条管线），
 * 保证 Demos 模式看到的曲线与代码编辑器运行结果完全一致。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FunctionSquare, Play, Trash2, Loader2, Eye, EyeOff, Plus, X, SlidersHorizontal } from 'lucide-react';
import { useWorkbenchStore } from '@/lib/store/workbench';
import { evaluateExpressionAsync, inputToLatex, type PlotType } from '@/lib/engine';
import { extractFreeParameters } from '@/lib/engine/variableScanner';
import { setScopeVar, getScope } from '@/lib/engine/mathInstance';
import { useScopeVersion } from '@/lib/hooks/useScopeVersion';
import { FormulaRenderer } from '@/components/workbench/FormulaRenderer';
import { ParameterSliders } from './ParameterSliders';

const PLOT_COLORS = ['#2dd4bf', '#fbbf24', '#fb7185', '#34d399', '#a78bfa', '#fb923c'];

/** 坐标系的友好名称（用于识别提示）。 */
function coordLabel(plotType: PlotType): string {
  switch (plotType) {
    case 'polar':
      return '极坐标 r = f(θ)';
    case 'parametric':
      return '参数曲线 (x(t), y(t))';
    case 'surface3d':
      return '3D 曲面';
    default:
      return '笛卡尔 y = f(x)';
  }
}

export function DemosPanel() {
  const plots = useWorkbenchStore((s) => s.plots);
  const addPlot = useWorkbenchStore((s) => s.addPlot);
  const removePlot = useWorkbenchStore((s) => s.removePlot);
  const togglePlotVisibility = useWorkbenchStore((s) => s.togglePlotVisibility);
  const variables = useWorkbenchStore((s) => s.variables);
  const scopeVersion = useScopeVersion();

  // ── Demos 状态持久化到 store：切换视图 / 刷新后不丢失 ──────────
  const demosExpr = useWorkbenchStore((s) => s.demosExpr);
  const setDemosExpr = useWorkbenchStore((s) => s.setDemosExpr);
  const demosExtraVars = useWorkbenchStore((s) => s.demosExtraVars);
  const addDemosExtraVar = useWorkbenchStore((s) => s.addDemosExtraVar);
  const removeDemosExtraVar = useWorkbenchStore((s) => s.removeDemosExtraVar);
  const demosPlotIds = useWorkbenchStore((s) => s.demosPlotIds);
  const addDemosPlotId = useWorkbenchStore((s) => s.addDemosPlotId);
  const removeDemosPlotId = useWorkbenchStore((s) => s.removeDemosPlotId);
  const clearDemosPlotIds = useWorkbenchStore((s) => s.clearDemosPlotIds);
  const setPlotParam = useWorkbenchStore((s) => s.setPlotParam);

  const [isApplying, setIsApplying] = useState(false);

  // 显式添加的变量（Desmos 式「＋ 添加变量」）：即便尚未出现在任何表达式
  // 中也会在变量栏生成可调滑块（如 θ 范围的上限 t），写入引擎作用域供使用。
  const [newVarName, setNewVarName] = useState('');

  /** 添加一个显式变量：写入引擎作用域（默认值 1）并加入变量栏。 */
  const addVar = useCallback(() => {
    const name = newVarName.trim().replace(/\s+/g, '');
    if (!name) return;
    // 拒绝以数字开头或与数学常量冲突的名字，避免覆盖内置符号。
    // x/y 是绘图自变量、pi/e/tau 等是常量 → 不允许；t/θ 正是用户想加的
    // 参数（用于 θ 范围上限等），因此放行。
    if (/^[0-9]/.test(name)) return;
    if (['x', 'y', 'pi', 'e', 'phi', 'tau', 'infinity', 'true', 'false'].includes(name)) return;
    if (demosExtraVars.includes(name)) {
      setNewVarName('');
      return;
    }
    setScopeVar(name, 1);
    addDemosExtraVar(name);
    setNewVarName('');
  }, [newVarName, demosExtraVars, addDemosExtraVar]);

  /** 移除一个显式变量：从变量栏移除（保留引擎作用域里的值，供已用它的表达式继续求值）。 */
  const removeVar = useCallback((name: string) => {
    removeDemosExtraVar(name);
  }, [removeDemosExtraVar]);

  // 实时识别：仅作提示，不真正提交（真正绘图在 Enter / 点击按钮时）。
  const [analysis, setAnalysis] = useState<{
    plotType?: PlotType;
    params: string[];
    latex: string;
    error?: string;
  }>({ params: [], latex: '' });

  /**
   * 曼陀罗 Logo 动画示例：极坐标玫瑰曲线双层叠加。
   *
   *   r(θ) = A·|cos(n·θ)|^(1/s)               外层大花瓣（浅粉）
   *        + B·|cos(n·(θ − π/(2n)))|^(1/s)     内层交错花瓣（深玫）
   *
   * n 为偶数时每个 cos 项产生 2n 个瓣，^（1/s）控制花瓣肥瘦（s 越大瓣越瘦长）；
   * 内层旋转 π/(2n) 正好嵌在外层缝隙中，形成交错的 4n 瓣曼陀罗。
   *
   * 滑块交互：
   *   - A / B / n / s —— 花瓣半径与形态（自动识别为自由参数生成滑块）；
   *   - theta —— θ 扫过范围的上限（0 → t）。把变量 theta 作为极坐标 θ 上限，
   *           拖动 theta 滑块即可看到花朵逐瓣「描画」出来；
   *   - t —— theta 滑块的上限（θ ∈ [0, t]）。调 t 可扩展 theta 可描画的最大范围。
   */
  const loadMandalaLogo = useCallback(() => {
    // 外层花瓣：浅粉
    const outerExpr = 'A*abs(cos(n*theta))^(1/s)';
    // 内层花瓣：深玫（旋转 π/(2n) 交错）
    const innerExpr = 'B*abs(cos(n*(theta - pi/(2*n))))^(1/s)';
    const defs = [
      { expression: outerExpr, color: '#f9a8d4' },
      { expression: innerExpr, color: '#be185d' },
    ];
    // 花瓣半径与形态参数：默认 A=2.4、B=1.4、n=4（各 8 瓣交错）、s=2。
    setScopeVar('A', 2.4);
    setPlotParam('A', { value: 2.4, min: 0, max: 4, step: 0.02 });
    setScopeVar('B', 1.4);
    setPlotParam('B', { value: 1.4, min: 0, max: 3, step: 0.02 });
    setScopeVar('n', 4);
    setPlotParam('n', { value: 4, min: 1, max: 10, step: 1 });
    setScopeVar('s', 2);
    setPlotParam('s', { value: 2, min: 1, max: 6, step: 0.05 });
    // theta —— θ 扫过范围的上限（0 → t）。拖动它即可看到花朵逐瓣「描画」。
    // 默认让 theta = t = 2π，即完整画满整朵花。
    const fullTheta = 2 * Math.PI;
    setScopeVar('theta', fullTheta);
    setPlotParam('theta', { value: fullTheta, min: 0, max: fullTheta, step: 0.02, playMode: 'bounce', speed: 1 });
    addDemosExtraVar('theta');
    // t —— theta 滑块的上限（θ ∈ [0, t]）。调 t 可扩展 theta 可描画的最大范围。
    setScopeVar('t', fullTheta);
    setPlotParam('t', { value: fullTheta, min: Math.PI / 2, max: 2 * Math.PI, step: 0.02 });
    addDemosExtraVar('t');
    for (const d of defs) {
      addPlot({
        expression: d.expression,
        // 视图取对称正方形，避免花朵被压扁/裁切。
        xRange: [-4, 4],
        yRange: [-4, 4],
        color: d.color,
        plotType: 'polar',
        visible: true,
        // 把 θ 上限接到变量 theta（而非固定 t），让滑块/播放实时改变采样范围。
        polarMaxExpr: 'theta',
      });
      const latest = useWorkbenchStore.getState().plots;
      const id = latest[latest.length - 1].id;
      addDemosPlotId(id);
    }
    setAnalysis({
      plotType: 'polar',
      params: ['A', 'B', 'n', 's', 't', 'theta'],
      latex: 'r = A\\left|\\cos(n\\theta)\\right|^{1/s} + B\\left|\\cos\\left(n(\\theta-\\frac{\\pi}{2n})\\right)\\right|^{1/s}',
    });
  }, [addPlot, addDemosPlotId, setPlotParam, addDemosExtraVar, setAnalysis]);

  // theta 滑块上限跟随变量 t（θ ∈ [0, t]）：拖动 t 时，若 theta 当前值超出
  // 新上限则自动夹紧到 t，并同步 theta 滑块的 max。这样「theta 的取值范围是
  // 0 到 t」由 t 滑块实时驱动，而不是一个固定不动的上限。
  useEffect(() => {
    const tVal = Number(getScope().t);
    if (!Number.isFinite(tVal)) return;
    const state = useWorkbenchStore.getState();
    const thetaCfg = state.plotParams.theta;
    if (!thetaCfg) return;
    const max = tVal;
    const value = Math.min(thetaCfg.value, max);
    if (thetaCfg.max !== max || thetaCfg.value !== value) {
      state.setPlotParam('theta', { ...thetaCfg, value, max });
    }
  }, [scopeVersion]);



  // Debounced analysis as the user types.
  useEffect(() => {
    const trimmed = demosExpr.trim();
    if (!trimmed) {
      setAnalysis({ params: [], latex: '' });
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await evaluateExpressionAsync(trimmed, 'simple');
        if (!res.success || !res.plotType) {
          setAnalysis({
            params: [],
            latex: inputToLatex(trimmed, 'simple'),
            error: res.error || '无法识别为绘图表达式',
          });
          return;
        }
        // 提取自由参数（θ/x/y/t 已在 extractFreeParameters 中排除）。
        const params = extractFreeParameters(
          [res.plotExpression ?? trimmed],
          Object.keys(variables),
        );
        setAnalysis({
          plotType: res.plotType,
          params,
          latex: res.latex || inputToLatex(trimmed, 'simple'),
        });
      } catch {
        setAnalysis({ params: [], latex: inputToLatex(trimmed, 'simple') });
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [demosExpr, variables, scopeVersion]);

  /** 提交绘图：复用与脚本运行相同的 evaluateExpressionAsync 管线。
   *  每次提交都会新增一条曲线（支持多图），而非替换单条。 */
  const apply = useCallback(async () => {
    const trimmed = demosExpr.trim();
    if (!trimmed) return;
    setIsApplying(true);
    try {
      const res = await evaluateExpressionAsync(trimmed, 'simple');
      if (!res.success || !res.plotType || res.plotType === 'surface3d') {
        return;
      }
      const color = PLOT_COLORS[demosPlotIds.length % PLOT_COLORS.length] ?? PLOT_COLORS[0];
      addPlot({
        expression: res.plotExpression ?? trimmed,
        xRange: res.plotRange ?? [-10, 10],
        yRange: [-50, 50],
        color,
        plotType: res.plotType,
        visible: true,
      });
      const latest = useWorkbenchStore.getState().plots;
      const id = latest[latest.length - 1].id;
      addDemosPlotId(id);
      // 清空输入，便于连续添加下一张图。
      setDemosExpr('');
      setAnalysis({ params: [], latex: '' });
    } finally {
      setIsApplying(false);
    }
  }, [demosExpr, plots, addPlot, addDemosPlotId, setDemosExpr]);

  const clear = useCallback(() => {
    for (const id of demosPlotIds) {
      if (useWorkbenchStore.getState().plots.some((p) => p.id === id)) {
        removePlot(id);
      }
    }
    clearDemosPlotIds();
    // 一并清掉为 Demos 显式添加的变量（如曼陀罗的 theta/t）：清空后这些变量不再被
    // 任何曲线引用，若不清除会残留「没用的滑块」。用户需要时可在清空后重新「＋ 添加变量」。
    for (const name of demosExtraVars) {
      removeDemosExtraVar(name);
    }
    setDemosExpr('');
    setAnalysis({ params: [], latex: '' });
  }, [removePlot, demosPlotIds, clearDemosPlotIds, removeDemosExtraVar, demosExtraVars, setDemosExpr]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void apply();
      }
    },
    [apply],
  );

  // 本面板添加的曲线（按添加顺序显示）。
  const demosPlots = plots.filter((p) => demosPlotIds.includes(p.id));

  // 自由参数个数（用于变量栏计数，不含显式添加的变量，避免重复计数）。
  const freeParamCount = useMemo(() => {
    const exprs = demosPlots
      .filter((p) => p.visible && p.plotType !== 'surface3d')
      .map((p) => p.expression);
    const free = extractFreeParameters(exprs, Object.keys(variables));
    return free.filter((n) => !demosExtraVars.includes(n)).length;
  }, [demosPlots, variables, demosExtraVars]);

  return (
    <div className="flex flex-col gap-2 p-2.5 h-full overflow-y-auto">
      {/* 标题 */}
      <div className="flex items-center gap-1.5">
        <FunctionSquare className="size-3.5 text-primary" />
        <span className="text-[11.5px] font-semibold tracking-tight">Demos 绘图</span>
        <span className="text-[10px] text-muted-foreground">
          直接输入数学表达式，自动识别坐标系与参数
        </span>
        <button
          type="button"
          onClick={loadMandalaLogo}
          title="载入曼陀罗 Logo：极坐标玫瑰曲线双层叠加（A/B/n/s 可调花瓣），变 θ 上限 t 可看花朵绽放动画"
          className="ml-auto shrink-0 rounded-md border border-primary/30 bg-primary/5 px-2 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/15 transition-colors"
        >
          ✿ 曼陀罗 Logo 动画
        </button>
      </div>

      {/* 输入框 */}
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          value={demosExpr}
          onChange={(e) => setDemosExpr(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="例如：r = sin(6θ) 或 a*x^2 + b 或 sin(x)"
          spellCheck={false}
          className="h-9 min-w-0 flex-1 rounded-md border border-border/60 bg-muted/30 px-2.5 font-mono text-[13px] text-foreground placeholder:text-muted-foreground/60 focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20"
        />
        <button
          type="button"
          onClick={() => void apply()}
          disabled={isApplying || !demosExpr.trim()}
          className="flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-gradient-to-r from-primary to-primary/80 px-3 text-[12px] font-medium text-primary-foreground hover:brightness-110 disabled:opacity-50 transition-all"
        >
          {isApplying ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" fill="currentColor" />}
          绘图
        </button>
        <button
          type="button"
          onClick={clear}
          className="grid size-9 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          aria-label="清空"
          title="清空并移除曲线"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>

      {/* 实时识别提示 */}
      {analysis.latex && (
        <div className="flex flex-col gap-1 rounded-md border border-border/60 bg-muted/20 px-2.5 py-1.5">
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <span className="shrink-0">识别为：</span>
            {analysis.plotType ? (
              <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary font-medium">
                {coordLabel(analysis.plotType)}
              </span>
            ) : (
              <span className="text-destructive/80">{analysis.error ?? '…'}</span>
            )}
            {analysis.params.length > 0 && (
              <span className="ml-auto shrink-0">
                自由参数：
                <span className="font-mono text-primary">
                  {analysis.params.map((p) => ` ${p}`).join(',')}
                </span>
              </span>
            )}
          </div>
          <FormulaRenderer latex={analysis.latex} displayMode className="min-w-0 text-[13px]" />
        </div>
      )}

      {/* 图像列表：多图管理（显隐 / 颜色 / 删除） */}
      {demosPlots.length > 0 && (
        <div className="flex flex-col gap-1 rounded-md border border-border/60 bg-muted/20 p-1.5">
          <div className="flex items-center gap-1.5 px-1 text-[10px] font-medium text-muted-foreground">
            <span>已添加图像</span>
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px]">{demosPlots.length}</span>
            <span className="ml-auto text-[9px] opacity-70">可继续输入新表达式添加更多</span>
          </div>
          {demosPlots.map((p) => (
            <div
              key={p.id}
              className="group flex items-center gap-2 rounded-md border border-border/40 bg-background/40 px-1.5 py-1"
            >
              <span
                className="h-3 w-3 shrink-0 rounded-full border border-border"
                style={{ backgroundColor: p.color }}
              />
              <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground/90">
                {p.expression}
              </span>
              <button
                type="button"
                onClick={() => togglePlotVisibility(p.id)}
                title={p.visible ? '隐藏曲线' : '显示曲线'}
                className="grid size-5 shrink-0 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                {p.visible ? <Eye className="size-3" /> : <EyeOff className="size-3 opacity-60" />}
              </button>
              <button
                type="button"
                onClick={() => {
                  removeDemosPlotId(p.id);
                  removePlot(p.id);
                }}
                title="删除此曲线"
                className="grid size-5 shrink-0 place-items-center rounded text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
              >
                <Trash2 className="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 变量栏（Desmos 式第二栏）：显式「＋ 添加变量」+ 自由参数滑块。
          与图像分区管理，变量多时不挤占绘图区。 */}
      {demosPlots.length > 0 && (
        <div className="flex flex-col gap-1 rounded-md border border-border/60 bg-muted/20 p-1.5">
          <div className="flex items-center gap-1.5 px-1">
            <SlidersHorizontal className="size-3 text-primary" />
            <span className="text-[10px] font-medium text-muted-foreground">变量</span>
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px]">
              {demosExtraVars.length + freeParamCount}
            </span>
            <div className="ml-auto flex items-center gap-1">
              <input
                type="text"
                value={newVarName}
                onChange={(e) => setNewVarName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addVar();
                  }
                }}
                placeholder="添加变量（如 t）"
                spellCheck={false}
                className="h-6 w-24 rounded border border-border/60 bg-background/40 px-1.5 font-mono text-[10.5px] text-foreground placeholder:text-muted-foreground/50 focus:border-primary/60 focus:outline-none"
              />
              <button
                type="button"
                onClick={addVar}
                disabled={!newVarName.trim()}
                className="grid size-6 shrink-0 place-items-center rounded border border-border/60 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
                aria-label="添加变量"
                title="添加变量（可随后在滑块里调范围）"
              >
                <Plus className="size-3.5" />
              </button>
            </div>
          </div>
          {/* 已显式添加的变量名（可单独移除） */}
          {demosExtraVars.length > 0 && (
            <div className="flex flex-wrap items-center gap-1 px-1">
              {demosExtraVars.map((name) => (
                <span
                  key={name}
                  className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] italic text-primary"
                >
                  {name}
                  <button
                    type="button"
                    onClick={() => removeVar(name)}
                    className="grid size-3 place-items-center rounded-full hover:bg-destructive/20 hover:text-destructive"
                    aria-label={`移除变量 ${name}`}
                  >
                    <X className="size-2.5" />
                  </button>
                </span>
              ))}
            </div>
          )}
          {/* 所有滑块（自由参数 + 显式变量）共用一个面板 */}
          <ParameterSliders
            plots={plots.filter((p) => p.plotType !== 'surface3d')}
            extraParams={demosExtraVars}
            className="!border-t-0 !rounded-md"
          />
        </div>
      )}

      {/* 使用提示 */}
      <div className="mt-auto rounded-md border border-border/40 bg-muted/10 px-2.5 py-2 text-[10.5px] leading-relaxed text-muted-foreground">
        <p className="font-medium text-foreground/80">使用提示</p>
        <p className="mt-0.5">· 输入 <code className="font-mono text-primary">r = sin(6θ)</code> 自动识别为极坐标玫瑰曲线</p>
        <p className="mt-0.5">· 含字母参数的表达式（如 <code className="font-mono text-primary">a*sin(x)</code>）自动生成下方参数滑块</p>
        <p className="mt-0.5">· 在滑块设置里可调范围 / 步长，并选择播放模式与速度（均匀变化）</p>
        <p className="mt-0.5">· 按 Enter 或「绘图」**新增**一张图；「清空」移除本面板添加的所有图像</p>
      </div>
    </div>
  );
}
