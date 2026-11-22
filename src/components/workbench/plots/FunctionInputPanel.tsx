'use client';

/**
 * OmniMath Pro — 函数输入器
 *
 * 左侧函数列表 + 右侧实时绘图。每行就是一个可编辑的函数：
 *   - 直接输入表达式，停顿约 0.8 秒自动出图；
 *   - 编辑已有行会原地更新曲线，而不是新增一条；
 *   - 支持笛卡尔 / 极坐标 / 参数曲线 / 3D 曲面；
 *   - 表达式中的自由参数自动生成可调滑块。
 *
 * 内部仍沿用 demos* store 字段（demosExpr / demosPlotIds / demosExtraVars），
 * 这样旧版本保存的数据可以直接继续使用。UI 上不再出现 “Demos”。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  Eye,
  EyeOff,
  FileCode2,
  FunctionSquare,
  Loader2,
  Plus,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useWorkbenchStore } from '@/lib/store/workbench';
import { evaluateExpressionAsync, inputToLatex, type PlotType } from '@/lib/engine';
import { extractFreeParameters } from '@/lib/engine/variableScanner';
import { setScopeVar, getScope } from '@/lib/engine/mathInstance';
import { useScopeVersion } from '@/lib/hooks/useScopeVersion';
import { FormulaRenderer } from '@/components/workbench/FormulaRenderer';
import { ParameterSliders } from './ParameterSliders';
import { cn } from '@/lib/utils';

const PLOT_COLORS = ['#2dd4bf', '#fbbf24', '#fb7185', '#34d399', '#a78bfa', '#fb923c'];
const EXAMPLES = [
  { label: 'sin(x)', expr: 'sin(x)' },
  { label: 'x² - 3x', expr: 'x^2 - 3x' },
  { label: 'r = sin(6θ)', expr: 'r = sin(6*theta)' },
  { label: 'z = x² - y²', expr: 'z = x^2 - y^2' },
];

interface Analysis {
  text: string;
  plotType?: PlotType;
  plotExpression?: string;
  plotRange?: [number, number];
  params: string[];
  latex: string;
  error?: string;
}

const EMPTY_ANALYSIS: Analysis = { text: '', params: [], latex: '' };

/** 坐标系的友好名称（用于识别提示）。 */
function coordLabel(plotType?: PlotType): string {
  switch (plotType) {
    case 'polar':
      return '极坐标 r = f(θ)';
    case 'parametric':
      return '参数曲线 (x(t), y(t))';
    case 'surface3d':
      return '3D 曲面';
    case 'cartesian':
      return '笛卡尔 y = f(x)';
    default:
      return '未识别';
  }
}

/** 还处在半截输入状态时不要自动提交，避免把 sin / x^ 当成完整函数。 */
function looksIncomplete(expr: string): boolean {
  const trimmed = expr.trim();
  if (!trimmed) return true;
  if (/^[a-zA-Z]+$/.test(trimmed)) return true;
  return /[+\-*/^(,=.]$/.test(trimmed);
}

export function FunctionInputPanel() {
  const plots = useWorkbenchStore((s) => s.plots);
  const addPlot = useWorkbenchStore((s) => s.addPlot);
  const updatePlot = useWorkbenchStore((s) => s.updatePlot);
  const removePlot = useWorkbenchStore((s) => s.removePlot);
  const togglePlotVisibility = useWorkbenchStore((s) => s.togglePlotVisibility);
  const setPreviewVisible = useWorkbenchStore((s) => s.setPreviewVisible);
  const setActivePreviewTab = useWorkbenchStore((s) => s.setActivePreviewTab);
  const setInputView = useWorkbenchStore((s) => s.setInputView);
  const variables = useWorkbenchStore((s) => s.variables);
  const scopeVersion = useScopeVersion();

  // ── 继续沿用旧 store 字段，避免迁移已保存的数据 ──────────────────
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

  const [analysis, setAnalysis] = useState<Analysis>(EMPTY_ANALYSIS);
  const [rowDrafts, setRowDrafts] = useState<Record<string, string>>({});
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [newVarName, setNewVarName] = useState('');
  const [varsOpen, setVarsOpen] = useState(true);
  const [isCommitting, setIsCommitting] = useState(false);
  const typedRef = useRef(false);
  const rowTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const demosPlots = useMemo(
    () => plots.filter((p) => demosPlotIds.includes(p.id)),
    [plots, demosPlotIds],
  );

  /** 实时分析输入框里的表达式（只做提示，不提交）。 */
  useEffect(() => {
    const trimmed = demosExpr.trim();
    if (!trimmed) {
      setAnalysis(EMPTY_ANALYSIS);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await evaluateExpressionAsync(trimmed, 'simple');
        if (!res.success || !res.plotType) {
          setAnalysis({
            text: trimmed,
            params: [],
            latex: inputToLatex(trimmed, 'simple'),
            error: res.error || '无法识别为绘图表达式',
          });
          return;
        }
        const params = extractFreeParameters(
          [res.plotExpression ?? trimmed],
          Object.keys(variables),
        );
        setAnalysis({
          text: trimmed,
          plotType: res.plotType,
          plotExpression: res.plotExpression ?? trimmed,
          plotRange: res.plotRange,
          params,
          latex: res.latex || inputToLatex(trimmed, 'simple'),
        });
      } catch {
        setAnalysis({ text: trimmed, params: [], latex: inputToLatex(trimmed, 'simple') });
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [demosExpr, variables, scopeVersion]);

  /** 提交当前输入框到曲线列表：显式 Enter 或停顿后自动提交。 */
  const commitDraft = useCallback(async () => {
    const trimmed = demosExpr.trim();
    if (!trimmed || isCommitting) return;
    setIsCommitting(true);
    try {
      const res = await evaluateExpressionAsync(trimmed, 'simple');
      if (!res.success || !res.plotType) return;
      const color = PLOT_COLORS[demosPlotIds.length % PLOT_COLORS.length] ?? PLOT_COLORS[0];
      const domain = res.plotRange ?? [-10, 10];
      addPlot({
        expression: res.plotExpression ?? trimmed,
        xRange: domain,
        // 3D 的 yRange 是第二个自变量的定义域；2D 里是屏幕纵向范围。
        yRange: res.plotType === 'surface3d' ? domain : [-50, 50],
        color,
        plotType: res.plotType,
        surfaceMode: res.surfaceMode,
        visible: true,
      });
      const latest = useWorkbenchStore.getState().plots;
      const id = latest[latest.length - 1].id;
      addDemosPlotId(id);
      setPreviewVisible(true);
      // 3D 曲面自动切到 3D 预览，普通函数切回 2D。
      setActivePreviewTab(res.plotType === 'surface3d' ? 'plot3d' : 'plot2d');
      setDemosExpr('');
      setAnalysis(EMPTY_ANALYSIS);
      typedRef.current = false;
    } finally {
      setIsCommitting(false);
    }
  }, [
    demosExpr,
    isCommitting,
    demosPlotIds.length,
    addPlot,
    addDemosPlotId,
    setPreviewVisible,
    setActivePreviewTab,
    setDemosExpr,
  ]);

  // 停顿 850ms 后自动把完整表达式加入曲线列表。只对用户真正输入过的内容
  // 生效，避免刷新后把上次未提交的草稿自动变成一条曲线。
  useEffect(() => {
    if (!typedRef.current) return;
    const trimmed = demosExpr.trim();
    if (!trimmed || analysis.text !== trimmed || analysis.error || !analysis.plotType) return;
    if (looksIncomplete(trimmed)) return;
    const timer = setTimeout(() => void commitDraft(), 850);
    return () => clearTimeout(timer);
  }, [analysis, demosExpr, commitDraft]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void commitDraft();
      }
    },
    [commitDraft],
  );

  /** 编辑已有函数行：350ms 防抖后原地更新曲线。 */
  const updateRow = useCallback(
    (id: string, text: string) => {
      setRowDrafts((prev) => ({ ...prev, [id]: text }));
      const timers = rowTimersRef.current;
      const prevTimer = timers.get(id);
      if (prevTimer) clearTimeout(prevTimer);
      timers.set(
        id,
        setTimeout(async () => {
          const trimmed = text.trim();
          if (!trimmed) return;
          try {
            const res = await evaluateExpressionAsync(trimmed, 'simple');
            if (!res.success || !res.plotType) {
              setRowErrors((prev) => ({
                ...prev,
                [id]: res.error || '无法识别为绘图表达式',
              }));
              return;
            }
            setRowErrors((prev) => {
              if (!(id in prev)) return prev;
              const next = { ...prev };
              delete next[id];
              return next;
            });
            updatePlot(id, {
              expression: res.plotExpression ?? trimmed,
              plotType: res.plotType,
              surfaceMode: res.surfaceMode,
              xRange: res.plotRange ?? [-10, 10],
              yRange: res.plotType === 'surface3d'
                ? (res.plotRange ?? [-10, 10])
                : [-50, 50],
            });
            setActivePreviewTab(res.plotType === 'surface3d' ? 'plot3d' : 'plot2d');
          } catch {
            setRowErrors((prev) => ({ ...prev, [id]: '表达式无法解析' }));
          }
        }, 350),
      );
    },
    [updatePlot, setActivePreviewTab],
  );

  useEffect(() => {
    const timers = rowTimersRef.current;
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    };
  }, []);

  const addVar = useCallback(() => {
    const name = newVarName.trim().replace(/\s+/g, '');
    if (!name) return;
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

  const removeVar = useCallback(
    (name: string) => {
      removeDemosExtraVar(name);
    },
    [removeDemosExtraVar],
  );

  const clearAll = useCallback(() => {
    for (const id of demosPlotIds) {
      if (useWorkbenchStore.getState().plots.some((p) => p.id === id)) {
        removePlot(id);
      }
    }
    clearDemosPlotIds();
    for (const name of demosExtraVars) removeDemosExtraVar(name);
    setDemosExpr('');
    setAnalysis(EMPTY_ANALYSIS);
    setRowDrafts({});
    setRowErrors({});
    typedRef.current = false;
  }, [demosPlotIds, demosExtraVars, removePlot, clearDemosPlotIds, removeDemosExtraVar, setDemosExpr]);

  /** 曼陀罗示例：极坐标玫瑰曲线双层叠加。 */
  const loadMandala = useCallback(() => {
    const outerExpr = 'A*abs(cos(n*theta))^(1/s)';
    const innerExpr = 'B*abs(cos(n*(theta - pi/(2*n))))^(1/s)';
    const defs = [
      { expression: outerExpr, color: '#f9a8d4' },
      { expression: innerExpr, color: '#be185d' },
    ];
    setScopeVar('A', 2.4);
    setPlotParam('A', { value: 2.4, min: 0, max: 4, step: 0.02 });
    setScopeVar('B', 1.4);
    setPlotParam('B', { value: 1.4, min: 0, max: 3, step: 0.02 });
    setScopeVar('n', 4);
    setPlotParam('n', { value: 4, min: 1, max: 10, step: 1 });
    setScopeVar('s', 2);
    setPlotParam('s', { value: 2, min: 1, max: 6, step: 0.05 });
    const fullTheta = 2 * Math.PI;
    setScopeVar('theta', fullTheta);
    setPlotParam('theta', {
      value: fullTheta,
      min: 0,
      max: fullTheta,
      step: 0.02,
      playMode: 'bounce',
      speed: 1,
    });
    addDemosExtraVar('theta');
    setScopeVar('t', fullTheta);
    setPlotParam('t', { value: fullTheta, min: Math.PI / 2, max: 2 * Math.PI, step: 0.02 });
    addDemosExtraVar('t');
    for (const d of defs) {
      addPlot({
        expression: d.expression,
        xRange: [-4, 4],
        yRange: [-4, 4],
        color: d.color,
        plotType: 'polar',
        visible: true,
        polarMaxExpr: 'theta',
      });
      const latest = useWorkbenchStore.getState().plots;
      const id = latest[latest.length - 1].id;
      addDemosPlotId(id);
    }
    setPreviewVisible(true);
    setActivePreviewTab('plot2d');
  }, [addPlot, addDemosPlotId, setPlotParam, addDemosExtraVar, setPreviewVisible, setActivePreviewTab]);

  const applyExample = useCallback(
    (expr: string) => {
      typedRef.current = true;
      setDemosExpr(expr);
    },
    [setDemosExpr],
  );

  // theta 滑块上限跟随变量 t。
  useEffect(() => {
    const tVal = Number(getScope().t);
    if (!Number.isFinite(tVal)) return;
    const state = useWorkbenchStore.getState();
    const thetaCfg = state.plotParams.theta;
    if (!thetaCfg) return;
    const max = tVal;
    const value = Math.min(thetaCfg.value, max);
    if (thetaCfg.max !== max || thetaCfg.value !== value) {
      state.setPlotParam('theta', { ...thetaCfg, max, value });
    }
  }, [scopeVersion]);

  const freeParamCount = useMemo(() => {
    const exprs = demosPlots
      .filter((p) => p.visible && p.plotType !== 'surface3d')
      .map((p) => p.expression);
    const free = extractFreeParameters(exprs, Object.keys(variables));
    return free.filter((n) => !demosExtraVars.includes(n)).length;
  }, [demosPlots, variables, demosExtraVars]);

  return (
    <div className="flex h-full flex-col bg-background/40">
      {/* 头部 */}
      <div className="shrink-0 border-b border-border/60 px-3 py-2.5">
        <div className="flex items-start gap-2">
          <div className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl border border-primary/20 bg-primary/10">
            <FunctionSquare className="size-4 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-[13px] font-semibold tracking-tight text-foreground">
              函数输入器
            </h2>
            <p className="mt-0.5 text-[10.5px] leading-relaxed text-muted-foreground">
              输入即绘制 · 支持 2D / 3D · 参数自动生成滑块
            </p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex h-7 shrink-0 items-center gap-1 rounded-lg border border-border/60 bg-background/60 px-2 text-[10.5px] text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
              >
                <Sparkles className="size-3" />
                <span className="hidden sm:inline">示例</span>
                <ChevronDown className="size-3 opacity-60" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {EXAMPLES.map((item) => (
                <DropdownMenuItem
                  key={item.expr}
                  onClick={() => applyExample(item.expr)}
                  className="gap-2 font-mono text-[11.5px]"
                >
                  {item.label}
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem onClick={loadMandala} className="gap-2 text-[11.5px]">
                曼陀罗动画（极坐标）
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {/* 函数输入器里始终提供回到代码编辑器的入口（桌面顶栏也有）。 */}
          <button
            type="button"
            onClick={() => setInputView('code')}
            className="inline-flex h-7 shrink-0 items-center gap-1 rounded-lg border border-border/60 px-2 text-[10.5px] text-muted-foreground hover:bg-accent/60 hover:text-foreground"
          >
            <FileCode2 className="size-3" />
            代码
          </button>
          <button
            type="button"
            onClick={clearAll}
            disabled={demosPlots.length === 0 && !demosExpr}
            className="grid size-7 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
            aria-label="清空函数"
            title="清空所有函数"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>

      {/* 函数列表 */}
      <div className="min-h-0 flex-1 overflow-y-auto px-2.5 py-2">
        {demosPlots.length === 0 && !demosExpr && (
          <div className="mb-2 flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border/60 bg-muted/10 px-4 py-7 text-center">
            <div className="grid size-11 place-items-center rounded-2xl border border-primary/20 bg-primary/8">
              <FunctionSquare className="size-5 text-primary/70" />
            </div>
            <p className="text-[12.5px] font-medium text-foreground/80">
              在左边输入一个函数，右边立即出图
            </p>
            <p className="max-w-[280px] text-[10.5px] leading-relaxed text-muted-foreground">
              例如 sin(x)、x^2 - 3x，或 z = x^2 - y^2。含字母参数会自动生成滑块。
            </p>
            <div className="mt-1 flex flex-wrap justify-center gap-1.5">
              {EXAMPLES.map((item) => (
                <button
                  key={item.expr}
                  type="button"
                  onClick={() => applyExample(item.expr)}
                  className="rounded-full border border-border/60 bg-background/60 px-2 py-1 font-mono text-[10px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          {demosPlots.map((p) => {
            const draft = rowDrafts[p.id] ?? p.expression;
            const error = rowErrors[p.id];
            return (
              <div
                key={p.id}
                className="rounded-xl border border-border/60 bg-card/50 px-2 py-1.5 transition-colors focus-within:border-primary/50"
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className="size-3 shrink-0 rounded-full border border-border"
                    style={{ backgroundColor: p.color }}
                  />
                  <input
                    value={draft}
                    onChange={(e) => updateRow(p.id, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        (e.target as HTMLInputElement).blur();
                      }
                    }}
                    spellCheck={false}
                    aria-label="函数表达式"
                    className="h-7 min-w-0 flex-1 bg-transparent font-mono text-[12.5px] text-foreground outline-none placeholder:text-muted-foreground/50"
                  />
                  <button
                    type="button"
                    onClick={() => togglePlotVisibility(p.id)}
                    title={p.visible ? '隐藏曲线' : '显示曲线'}
                    className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    {p.visible ? <Eye className="size-3" /> : <EyeOff className="size-3 opacity-60" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      removeDemosPlotId(p.id);
                      removePlot(p.id);
                      setRowDrafts((prev) => {
                        const next = { ...prev };
                        delete next[p.id];
                        return next;
                      });
                    }}
                    title="删除此函数"
                    className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
                {error && <p className="mt-0.5 pl-[18px] text-[9.5px] text-rose-500">{error}</p>}
              </div>
            );
          })}

          {/* 新函数输入行 */}
          <div className="rounded-xl border border-primary/30 bg-primary/[0.04] px-2 py-1.5 shadow-sm transition-colors focus-within:border-primary/60">
            <div className="flex items-center gap-1.5">
              <span className="grid size-3 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
                <Plus className="size-2.5" />
              </span>
              <input
                autoFocus
                value={demosExpr}
                onChange={(e) => {
                  typedRef.current = true;
                  setDemosExpr(e.target.value);
                }}
                onKeyDown={handleKeyDown}
                spellCheck={false}
                aria-label="输入新函数"
                placeholder="输入函数，例如 sin(x) 或 x^2 - 3x"
                className="h-7 min-w-0 flex-1 bg-transparent font-mono text-[12.5px] text-foreground outline-none placeholder:text-muted-foreground/50"
              />
              {isCommitting ? (
                <Loader2 className="size-3.5 animate-spin text-primary" />
              ) : (
                <kbd className="hidden shrink-0 rounded border border-border/60 px-1 text-[9px] text-muted-foreground/70 sm:inline">
                  Enter
                </kbd>
              )}
            </div>
          </div>
        </div>

        {/* 当前输入识别提示 */}
        {analysis.latex && demosExpr.trim() && (
          <div className="mt-2 rounded-xl border border-border/60 bg-muted/20 px-2.5 py-1.5">
            <div className="flex items-center gap-1.5 text-[9.5px] text-muted-foreground">
              <span
                className={cn(
                  'rounded px-1.5 py-0.5 font-medium',
                  analysis.plotType
                    ? 'bg-primary/10 text-primary'
                    : 'bg-rose-500/10 text-rose-500',
                )}
              >
                {analysis.plotType ? coordLabel(analysis.plotType) : analysis.error ?? '…'}
              </span>
              {analysis.params.length > 0 && (
                <span className="ml-auto truncate">
                  参数 <span className="font-mono text-primary">{analysis.params.join(', ')}</span>
                </span>
              )}
            </div>
            <FormulaRenderer latex={analysis.latex} displayMode className="mt-1 min-w-0 text-[12px]" />
          </div>
        )}
      </div>

      {/* 参数区 */}
      {demosPlots.length > 0 && (
        <div className="shrink-0 border-t border-border/60 px-2.5 py-1.5">
          <button
            type="button"
            onClick={() => setVarsOpen((v) => !v)}
            className="flex w-full items-center gap-1.5 rounded-md px-1 py-0.5 text-[10px] font-medium text-muted-foreground hover:text-foreground"
          >
            <SlidersHorizontal className="size-3 text-primary" />
            参数与变量
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px]">
              {demosExtraVars.length + freeParamCount}
            </span>
            <ChevronDown
              className={cn('ml-auto size-3 transition-transform', !varsOpen && '-rotate-90')}
            />
          </button>
          {varsOpen && (
            <div className="mt-1 flex max-h-[34vh] flex-col gap-1 overflow-y-auto">
              <div className="flex items-center justify-end gap-1">
                <input
                  value={newVarName}
                  onChange={(e) => setNewVarName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addVar();
                    }
                  }}
                  placeholder="添加变量"
                  spellCheck={false}
                  className="h-6 w-24 rounded border border-border/60 bg-background/40 px-1.5 font-mono text-[10.5px] outline-none focus:border-primary/60"
                />
                <button
                  type="button"
                  onClick={addVar}
                  disabled={!newVarName.trim()}
                  className="grid size-6 place-items-center rounded border border-border/60 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
                  aria-label="添加变量"
                >
                  <Plus className="size-3.5" />
                </button>
              </div>
              {demosExtraVars.length > 0 && (
                <div className="flex flex-wrap gap-1">
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
              <ParameterSliders
                plots={plots.filter((p) => p.plotType !== 'surface3d')}
                extraParams={demosExtraVars}
                className="!rounded-md !border-t-0"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
