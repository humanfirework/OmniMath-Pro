'use client';

/**
 * OmniMath Pro — Solver Workbench (Task 3)
 *
 * 独立的全屏求解器视图（viewMode === 'solver'），布局对标
 * LinearAlgebraWorkbench：
 *
 *   ┌────────────┬──────────────────────────────────────────────┐
 *   │ 求解类型    │  输入区 + 求解按钮                            │
 *   │  w-64      │  KaTeX 结果区 + 分步展示区 + 发送到 2D 绘图   │
 *   │  方程       │                                                │
 *   │  方程组     │                                                │
 *   │  求导/积分  │                                                │
 *   │  极限       │                                                │
 *   └────────────┴──────────────────────────────────────────────┘
 *
 * 求解逻辑全部复用 engine 模块（不复制粘贴）：
 *   - 方程     → engine/equationSolver.solveEquation
 *   - 方程组   → engine/linearSystem（高斯消元逐步，复用 GaussianEliminationView）
 *   - 求导     → engine/derivativeSteps.differentiateWithSteps（法则标注）
 *   - 积分     → engine/symbolic（中间提示 + Simpson 数值回退）
 *   - 极限     → engine/symbolic.symbolicLimit
 *
 * 步骤渲染复用 SolverStepsView（法则标签 + 步骤编号）。
 */

import { useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FunctionSquare,
  Sigma,
  Equal,
  Play,
  X,
  LineChart,
  Target,
  ChevronDown,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  ToggleGroup,
  ToggleGroupItem,
} from '@/components/ui/toggle-group';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { FormulaRenderer } from '@/components/workbench/FormulaRenderer';
import { SolverStepsView } from '@/components/workbench/panels/SolverStepsView';
import { GaussianEliminationView } from '@/components/workbench/panels/GaussianEliminationView';
import { useWorkbenchStore } from '@/lib/store/workbench';
import {
  solveEquation,
  fmtComplex,
  type EquationSolveResult,
} from '@/lib/engine';
import {
  parseLinearSystem,
  solveLinearSystemWithSteps,
  nonlinearSystemSteps,
  type LinearSystemSolution,
} from '@/lib/engine';
import { differentiateWithSteps } from '@/lib/engine';
import {
  symbolicIntegrate,
  symbolicDefiniteIntegral,
  symbolicLimit,
  type SymbolicResult,
} from '@/lib/engine/symbolic';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

/* ------------------------------------------------------------------ *
 * Types & constants
 * ------------------------------------------------------------------ */

type SolverKind = 'equation' | 'system' | 'derivative' | 'integral' | 'limit';

interface SolverNavItem {
  id: SolverKind;
  icon: LucideIcon;
  label: string;
  desc: string;
}

const NAV_ITEMS: SolverNavItem[] = [
  { id: 'equation', icon: Sigma, label: '方程', desc: '多项式 / 超越方程求根' },
  { id: 'system', icon: Equal, label: '方程组', desc: '线性方程组逐步消元' },
  { id: 'derivative', icon: FunctionSquare, label: '求导', desc: '分步求导 · 法则标注' },
  { id: 'integral', icon: LineChart, label: '积分', desc: '不定 / 定积分 · 数值回退' },
  { id: 'limit', icon: Target, label: '极限', desc: '符号极限 · 数值回退' },
];

interface ExampleGroup {
  title: string;
  items: Array<{ expr: string; label: string; hint?: string }>;
}

const PLOT_COLORS = ['#2dd4bf', '#fbbf24', '#fb7185', '#34d399', '#a78bfa', '#fb923c'];

/** 将表达式/方程送入 2D 绘图并跳转回 workbench 视图 */
function useSendToPlot() {
  const addPlot = useWorkbenchStore((s) => s.addPlot);
  const plots = useWorkbenchStore((s) => s.plots);
  const setViewMode = useWorkbenchStore((s) => s.setViewMode);
  const setActivePreviewTab = useWorkbenchStore((s) => s.setActivePreviewTab);

  return (expressions: string[]) => {
    let added = 0;
    expressions.forEach((expression, i) => {
      if (!expression.trim()) return;
      addPlot({
        expression,
        xRange: [-10, 10],
        yRange: [-10, 10],
        color: PLOT_COLORS[(plots.length + i) % PLOT_COLORS.length],
        plotType: 'cartesian',
        visible: true,
        width: 2,
      });
      added++;
    });
    if (added === 0) return;
    toast.success('已发送到 2D 绘图');
    // 联动：切回 workbench 并聚焦 2D 绘图预览
    setViewMode('workbench');
    setActivePreviewTab('plot2d');
  };
}

/** 方程 lhs = rhs → 可绘制的 f(x) = (lhs) - (rhs) */
function equationToPlotExpr(equation: string): string {
  const eqIdx = equation.indexOf('=');
  if (eqIdx === -1) return equation.trim();
  const lhs = equation.slice(0, eqIdx).trim();
  const rhs = equation.slice(eqIdx + 1).trim();
  return `(${lhs}) - (${rhs})`;
}

/* ================================================================== *
 * Shared result block（与 SolverPanel 风格一致的玻璃卡片）
 * ================================================================== */
function ResultBlock({
  error,
  result,
}: {
  error: string | null;
  result: ReactNode;
}) {
  return (
    <AnimatePresence mode="wait">
      {error && (
        <motion.div
          key="err"
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="rounded-md border border-rose-500/40 bg-rose-500/10 p-3 text-[12px] text-rose-600 dark:text-rose-300"
        >
          <div className="flex items-start gap-1.5">
            <X className="size-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        </motion.div>
      )}
      {!error && result && (
        <motion.div
          key="res"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="rounded-md border border-primary/30 bg-primary/5 p-4 glow-card-teal"
        >
          {result}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** 结果头部：标题 + 发送到 2D 绘图按钮 */
function ResultHeader({
  label,
  onSendToPlot,
}: {
  label: string;
  onSendToPlot?: () => void;
}) {
  return (
    <div className="flex items-center justify-between mb-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      {onSendToPlot && (
        <Button
          variant="outline"
          size="sm"
          className="h-6 px-2 text-[10.5px] gap-1"
          onClick={onSendToPlot}
        >
          <LineChart className="size-3" />
          发送到 2D 绘图
        </Button>
      )}
    </div>
  );
}

/** 示例下拉（复用 SolverPanel 的折叠菜单模式） */
function ExamplesDropdown({
  groups,
  displayValue,
  onPick,
}: {
  groups: ExampleGroup[];
  displayValue: string;
  onPick: (expr: string) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-2.5 text-[11px] gap-1 justify-between w-full max-w-xs"
        >
          <span className="truncate">{displayValue || '选择示例…'}</span>
          <ChevronDown className="size-3 opacity-60 shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {groups.map((group, gi) => (
          <div key={group.title}>
            {gi > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {group.title}
            </DropdownMenuLabel>
            {group.items.map((item) => (
              <DropdownMenuItem
                key={item.expr}
                onClick={() => onPick(item.expr)}
                className="flex items-center justify-between gap-2 text-[11.5px]"
              >
                <span className="font-mono">{item.label}</span>
                {item.hint && (
                  <span className="text-[9.5px] text-muted-foreground">{item.hint}</span>
                )}
              </DropdownMenuItem>
            ))}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ================================================================== *
 * Section 1 — 方程求解（复用 engine/equationSolver）
 * ================================================================== */

const EQUATION_EXAMPLES: ExampleGroup[] = [
  {
    title: '多项式方程',
    items: [
      { expr: 'x^2 - 5*x + 6 = 0', label: 'x² − 5x + 6 = 0', hint: '因式分解' },
      { expr: 'x^3 - 6*x^2 + 11*x - 6 = 0', label: 'x³ − 6x² + 11x − 6 = 0', hint: '三次方程' },
      { expr: 'x^2 + 1 = 0', label: 'x² + 1 = 0', hint: '复数根' },
    ],
  },
  {
    title: '超越方程',
    items: [
      { expr: 'sin(x) = 0.5', label: 'sin(x) = 0.5', hint: '数值求解' },
      { expr: 'exp(x) = 2', label: 'eˣ = 2', hint: '对数解' },
      { expr: 'cos(x) = x', label: 'cos(x) = x', hint: '数值求解' },
    ],
  },
];

function EquationSection() {
  const sendToPlot = useSendToPlot();
  const [equation, setEquation] = useState('x^2 - 5*x + 6 = 0');
  const [varName, setVarName] = useState('x');
  const [rangeA, setRangeA] = useState(-10);
  const [rangeB, setRangeB] = useState(10);
  const [solveMode, setSolveMode] = useState<'numeric' | 'symbolic'>('numeric');
  const [result, setResult] = useState<EquationSolveResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const handleSolve = async () => {
    setWorking(true);
    setError(null);
    setResult(null);
    try {
      const out = await solveEquation(equation, varName, {
        mode: solveMode,
        rangeA,
        rangeB,
      });
      for (const w of out.warnings) toast.warning(w);
      if (out.error) {
        setError(out.error);
        return;
      }
      setResult(out.result ?? null);
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="grid grid-cols-[minmax(300px,380px)_1fr] gap-5">
      {/* 输入区 */}
      <div className="space-y-3">
        <div>
          <label className="text-[11px] text-muted-foreground">{t('solverEquationForm')}</label>
          <Input
            value={equation}
            onChange={(e) => setEquation(e.target.value)}
            placeholder={t('solverEquationPlaceholder')}
            className="h-9 text-[13px] font-mono mt-1"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSolve();
            }}
          />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="text-[11px] text-muted-foreground">{t('solverCalcVar')}</label>
            <Select value={varName} onValueChange={setVarName}>
              <SelectTrigger className="h-8 text-[12px] mt-1 font-mono">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {['x', 'y', 'z', 't', 'n'].map((v) => (
                  <SelectItem key={v} value={v} className="text-[12px] font-mono">{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground">{t('solverRange')} a</label>
            <Input
              type="number"
              value={rangeA}
              step="any"
              onChange={(e) => setRangeA(parseFloat(e.target.value) || 0)}
              className="h-8 text-[12px] mt-1"
            />
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground">{t('solverRange')} b</label>
            <Input
              type="number"
              value={rangeB}
              step="any"
              onChange={(e) => setRangeB(parseFloat(e.target.value) || 0)}
              className="h-8 text-[12px] mt-1"
            />
          </div>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-muted-foreground">求解模式</span>
          <ToggleGroup
            type="single"
            value={solveMode}
            onValueChange={(v) => {
              if (v === 'numeric' || v === 'symbolic') setSolveMode(v);
            }}
            variant="outline"
            size="sm"
            className="h-7"
          >
            <ToggleGroupItem value="numeric" className="h-7 px-2.5 text-[11px]">数值解</ToggleGroupItem>
            <ToggleGroupItem value="symbolic" className="h-7 px-2.5 text-[11px]">符号解</ToggleGroupItem>
          </ToggleGroup>
        </div>
        <Button onClick={handleSolve} disabled={working} className="w-full h-9 text-[12.5px] gap-1.5" size="sm">
          <Play className="size-4" />
          {t('solverSolve')}
        </Button>
        <div>
          <div className="text-[11px] text-muted-foreground mb-1">{t('solverExamples')}</div>
          <ExamplesDropdown groups={EQUATION_EXAMPLES} displayValue={equation} onPick={setEquation} />
        </div>
      </div>

      {/* 结果区 */}
      <div className="min-w-0">
        <ResultBlock
          error={error}
          result={result ? (
            <>
              <ResultHeader
                label="求解结果"
                onSendToPlot={() => sendToPlot([equationToPlotExpr(equation)])}
              />
              {result.symbolicFallback && (
                <div className="text-[11px] text-amber-600 dark:text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded px-2 py-1 mb-2">
                  ⚠️ 符号解失败，已回退到数值解
                </div>
              )}
              {result.info && (
                <div className="text-[11px] text-primary/80 bg-primary/5 border border-primary/20 rounded px-2 py-1 mb-2">
                  {result.kind === 'polynomial' && '🧮 多项式方程 · '}
                  {result.kind === 'transcendental' && '📈 超越方程 · '}
                  {result.kind === 'symbolic' && '🔤 符号解 · '}
                  {result.info}
                </div>
              )}
              {result.kind === 'symbolic' && result.symbolicLatex && (
                <div className="mb-2 overflow-x-auto">
                  <FormulaRenderer latex={`${varName} \\in ${result.symbolicLatex}`} displayMode />
                </div>
              )}
              <div className="overflow-x-auto">
                <FormulaRenderer latex={result.latex} displayMode />
              </div>
              {result.roots.length > 0 && (
                <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1">
                  {result.roots.map((r, i) => (
                    <div
                      key={i}
                      className={cn(
                        'rounded border px-2 py-1 text-[11.5px] font-mono',
                        Math.abs(r.im) < 1e-9
                          ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300'
                          : 'border-violet-500/30 bg-violet-500/5 text-violet-700 dark:text-violet-300',
                      )}
                    >
                      {varName}_{i + 1} = {fmtComplex(r)}
                    </div>
                  ))}
                </div>
              )}
              {result.steps && result.steps.length > 0 && (
                <SolverStepsView steps={result.steps} defaultExpandedCount={6} className="mt-3" />
              )}
            </>
          ) : (
            <div className="min-h-[220px] grid place-items-center text-[12px] text-muted-foreground">
              输入方程后点击 "求解"
            </div>
          )}
        />
      </div>
    </div>
  );
}

/* ================================================================== *
 * Section 2 — 方程组（复用 engine/linearSystem + GaussianEliminationView）
 * ================================================================== */

const SYSTEM_EXAMPLES: ExampleGroup[] = [
  {
    title: '线性方程组',
    items: [
      { expr: 'x + y = 5\nx - y = 1', label: '2×2 线性', hint: '二元一次' },
      { expr: 'x + y + z = 6\n2y + 5z = -4\n2x + 5y - z = 27', label: '3×3 线性', hint: '三元一次' },
    ],
  },
  {
    title: '非线性（给出数值说明）',
    items: [
      { expr: 'x^2 + y = 5\nx - y = 1', label: '含二次项', hint: '非线性' },
    ],
  },
];

function SystemSection() {
  const [text, setText] = useState('x + y = 5\nx - y = 1');
  const [solution, setSolution] = useState<LinearSystemSolution | null>(null);
  const [varList, setVarList] = useState<string[]>([]);
  const [nonlinearSteps, setNonlinearSteps] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const handleSolve = () => {
    setWorking(true);
    setError(null);
    setSolution(null);
    setNonlinearSteps(null);
    try {
      const parsed = parseLinearSystem(text);
      if ('error' in parsed) {
        setError(parsed.error);
        return;
      }
      if (!parsed.linear) {
        // 非线性方程组 → 数值迭代说明（Task 4.2）
        setNonlinearSteps(nonlinearSystemSteps(parsed.errorLine ?? ''));
        return;
      }
      setVarList(parsed.varList);
      setSolution(solveLinearSystemWithSteps(parsed.A, parsed.b));
    } catch (err) {
      setError((err as Error).message || t('solverError'));
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="grid grid-cols-[minmax(300px,380px)_1fr] gap-5">
      <div className="space-y-3">
        <div>
          <label className="text-[11px] text-muted-foreground">方程组（每行一个方程）</label>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('solverSystemPlaceholder')}
            className="min-h-[120px] text-[13px] font-mono mt-1 bg-muted/30 resize-y"
          />
        </div>
        <Button onClick={handleSolve} disabled={working} className="w-full h-9 text-[12.5px] gap-1.5" size="sm">
          <Play className="size-4" />
          求解方程组
        </Button>
        <div>
          <div className="text-[11px] text-muted-foreground mb-1">{t('solverExamples')}</div>
          <ExamplesDropdown
            groups={SYSTEM_EXAMPLES}
            displayValue={text.split('\n')[0]}
            onPick={setText}
          />
        </div>
      </div>

      <div className="min-w-0">
        <ResultBlock
          error={error}
          result={
            nonlinearSteps ? (
              <>
                <ResultHeader label="非线性方程组" />
                <SolverStepsView steps={nonlinearSteps} title="数值方法说明" />
              </>
            ) : solution ? (
              <>
                <ResultHeader label="求解结果" />
                <div
                  className={cn(
                    'rounded-md border px-3 py-2 text-[12.5px] font-medium mb-2',
                    solution.kind === 'unique' &&
                      'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
                    solution.kind === 'none' &&
                      'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
                    solution.kind === 'infinite' &&
                      'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
                  )}
                >
                  {solution.kind === 'unique' && '唯一解'}
                  {solution.kind === 'none' && t('solverNoSolution')}
                  {solution.kind === 'infinite' && t('solverMultipleSolutions')}
                  <span className="ml-2 text-[10.5px] font-mono opacity-75">
                    rank(A) = {solution.rankA}，rank([A|b]) = {solution.rankAug}，n = {solution.nUnknowns}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <FormulaRenderer latex={solution.latex} displayMode />
                </div>
                {solution.kind === 'unique' && solution.vector && varList.length > 0 && (
                  <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-1">
                    {varList.map((v, i) => (
                      <div
                        key={v}
                        className="rounded border border-emerald-500/30 bg-emerald-500/5 px-2 py-1 text-[11.5px] font-mono text-emerald-700 dark:text-emerald-300"
                      >
                        {v} = {solution.vector![i]}
                      </div>
                    ))}
                  </div>
                )}
                {solution.steps.length > 0 && (
                  <GaussianEliminationView
                    steps={solution.steps}
                    defaultExpandedCount={5}
                    className="mt-3"
                  />
                )}
              </>
            ) : (
              <div className="min-h-[220px] grid place-items-center text-[12px] text-muted-foreground">
                输入方程组后点击 "求解方程组"
              </div>
            )
          }
        />
      </div>
    </div>
  );
}

/* ================================================================== *
 * Section 3 — 求导（复用 engine/derivativeSteps，法则标注）
 * ================================================================== */

const DERIV_EXAMPLES: ExampleGroup[] = [
  {
    title: '乘积 / 商 / 链式',
    items: [
      { expr: 'x^2 * sin(x)', label: 'x²·sin(x)', hint: '乘积法则' },
      { expr: 'sin(x) / x', label: 'sin(x)/x', hint: '商法则' },
      { expr: 'sin(x^2)', label: 'sin(x²)', hint: '链式法则' },
    ],
  },
  {
    title: '多项式 / 复合',
    items: [
      { expr: 'x^3 + 2*x^2', label: 'x³ + 2x²', hint: '幂法则' },
      { expr: 'e^x * ln(x)', label: 'eˣ·ln(x)', hint: '乘积法则' },
      { expr: '1 / (1 + x^2)', label: '1/(1+x²)', hint: '链式法则' },
    ],
  },
];

function DerivativeSection() {
  const sendToPlot = useSendToPlot();
  const [expr, setExpr] = useState('x^2 * sin(x)');
  const [varName, setVarName] = useState('x');
  const [result, setResult] = useState<{
    latex: string;
    resultString: string;
    steps: string[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const handleSolve = () => {
    setWorking(true);
    setError(null);
    setResult(null);
    try {
      if (!expr.trim()) {
        setError(t('solverEnterEquation'));
        return;
      }
      const { resultLatex, resultString, steps } = differentiateWithSteps(expr, varName);
      setResult({
        latex: `\\frac{d}{d${varName}} \\left[ ${expr} \\right] = ${resultLatex}`,
        resultString,
        steps,
      });
    } catch (err) {
      setError((err as Error).message || t('solverError'));
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="grid grid-cols-[minmax(300px,380px)_1fr] gap-5">
      <div className="space-y-3">
        <div>
          <label className="text-[11px] text-muted-foreground">{t('solverCalcInput')}</label>
          <Input
            value={expr}
            onChange={(e) => setExpr(e.target.value)}
            placeholder="f(x) = ..."
            className="h-9 text-[13px] font-mono mt-1"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSolve();
            }}
          />
        </div>
        <div>
          <label className="text-[11px] text-muted-foreground">{t('solverCalcVar')}</label>
          <Select value={varName} onValueChange={setVarName}>
            <SelectTrigger className="h-8 w-28 text-[12px] mt-1 font-mono">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {['x', 'y', 'z', 't', 'n'].map((v) => (
                <SelectItem key={v} value={v} className="text-[12px] font-mono">{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={handleSolve} disabled={working} className="w-full h-9 text-[12.5px] gap-1.5" size="sm">
          <FunctionSquare className="size-4" />
          求导
        </Button>
        <div>
          <div className="text-[11px] text-muted-foreground mb-1">{t('solverExamples')}</div>
          <ExamplesDropdown groups={DERIV_EXAMPLES} displayValue={expr} onPick={setExpr} />
        </div>
      </div>

      <div className="min-w-0">
        <ResultBlock
          error={error}
          result={result ? (
            <>
              <ResultHeader
                label="求导结果"
                onSendToPlot={() => sendToPlot([expr, result.resultString])}
              />
              <div className="overflow-x-auto">
                <FormulaRenderer latex={result.latex} displayMode />
              </div>
              <div className="mt-1 text-[10.5px] font-mono text-muted-foreground break-all">
                <span className="text-foreground/60">f′({varName}) = </span>
                {result.resultString}
              </div>
              {result.steps.length > 0 && (
                <SolverStepsView steps={result.steps} defaultExpandedCount={8} className="mt-3" />
              )}
            </>
          ) : (
            <div className="min-h-[220px] grid place-items-center text-[12px] text-muted-foreground">
              输入表达式后点击 "求导"
            </div>
          )}
        />
      </div>
    </div>
  );
}

/* ================================================================== *
 * Section 4 — 积分（复用 engine/symbolic，含数值回退）
 * ================================================================== */

const INTEGRAL_EXAMPLES: ExampleGroup[] = [
  {
    title: '基本积分',
    items: [
      { expr: 'x^2', label: 'x²', hint: '幂函数' },
      { expr: 'sin(x)', label: 'sin(x)', hint: '三角函数' },
      { expr: 'e^x', label: 'eˣ', hint: '指数函数' },
      { expr: '1 / x', label: '1/x', hint: '对数积分' },
    ],
  },
  {
    title: '进阶',
    items: [
      { expr: 'x * e^x', label: 'x·eˣ', hint: '分部积分' },
      { expr: 'sin(x) * cos(x)', label: 'sin(x)·cos(x)', hint: '换元' },
      { expr: '1 / (1 + x^2)', label: '1/(1+x²)', hint: '反正切' },
    ],
  },
];

function IntegralSection() {
  const sendToPlot = useSendToPlot();
  const [expr, setExpr] = useState('x^2');
  const [varName, setVarName] = useState('x');
  const [definite, setDefinite] = useState(false);
  const [lower, setLower] = useState(0);
  const [upper, setUpper] = useState(1);
  const [result, setResult] = useState<(SymbolicResult & { numerical?: number }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const handleSolve = async () => {
    setWorking(true);
    setError(null);
    setResult(null);
    try {
      if (!expr.trim()) {
        setError(t('solverEnterEquation'));
        return;
      }
      const res = definite
        ? await symbolicDefiniteIntegral(expr, varName, lower, upper)
        : await symbolicIntegrate(expr, varName);
      if (!res.success) {
        setError(res.error || t('solverError'));
        return;
      }
      setResult(res);
    } catch (err) {
      setError((err as Error).message || t('solverError'));
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="grid grid-cols-[minmax(300px,380px)_1fr] gap-5">
      <div className="space-y-3">
        <div>
          <label className="text-[11px] text-muted-foreground">{t('solverCalcInput')}</label>
          <Input
            value={expr}
            onChange={(e) => setExpr(e.target.value)}
            placeholder="f(x) = ..."
            className="h-9 text-[13px] font-mono mt-1"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSolve();
            }}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[11px] text-muted-foreground">{t('solverCalcVar')}</label>
            <Select value={varName} onValueChange={setVarName}>
              <SelectTrigger className="h-8 text-[12px] mt-1 font-mono">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {['x', 'y', 'z', 't', 'n'].map((v) => (
                  <SelectItem key={v} value={v} className="text-[12px] font-mono">{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end justify-between pb-0.5">
            <span className="text-[11px] text-muted-foreground">定积分</span>
            <ToggleGroup
              type="single"
              value={definite ? 'def' : 'indef'}
              onValueChange={(v) => setDefinite(v === 'def')}
              variant="outline"
              size="sm"
              className="h-7"
            >
              <ToggleGroupItem value="indef" className="h-7 px-2 text-[11px]">不定</ToggleGroupItem>
              <ToggleGroupItem value="def" className="h-7 px-2 text-[11px]">定积分</ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>
        {definite && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] text-muted-foreground">{t('solverCalcLower')}</label>
              <Input
                type="number"
                value={lower}
                step="any"
                onChange={(e) => setLower(parseFloat(e.target.value) || 0)}
                className="h-8 text-[12px] mt-1"
              />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground">{t('solverCalcUpper')}</label>
              <Input
                type="number"
                value={upper}
                step="any"
                onChange={(e) => setUpper(parseFloat(e.target.value) || 0)}
                className="h-8 text-[12px] mt-1"
              />
            </div>
          </div>
        )}
        <Button onClick={handleSolve} disabled={working} className="w-full h-9 text-[12.5px] gap-1.5" size="sm">
          <LineChart className="size-4" />
          积分
        </Button>
        <div>
          <div className="text-[11px] text-muted-foreground mb-1">{t('solverExamples')}</div>
          <ExamplesDropdown groups={INTEGRAL_EXAMPLES} displayValue={expr} onPick={setExpr} />
        </div>
      </div>

      <div className="min-w-0">
        <ResultBlock
          error={error}
          result={result ? (
            <>
              <ResultHeader
                label="积分结果"
                onSendToPlot={() => sendToPlot([expr])}
              />
              <div className="overflow-x-auto">
                <FormulaRenderer
                  latex={
                    definite
                      ? `\\int_{${lower}}^{${upper}} ${expr} \\, d${varName} = ${result.latex}`
                      : `\\int ${expr} \\, d${varName} = ${result.latex}`
                  }
                  displayMode
                />
              </div>
              {result.numerical !== undefined && (
                <div className="mt-1.5 text-[11.5px] font-mono text-muted-foreground">
                  数值结果 ≈ {parseFloat(result.numerical.toPrecision(8))}
                </div>
              )}
              {result.steps.length > 0 && (
                <SolverStepsView steps={result.steps} defaultExpandedCount={6} className="mt-3" />
              )}
            </>
          ) : (
            <div className="min-h-[220px] grid place-items-center text-[12px] text-muted-foreground">
              输入表达式后点击 "积分"
            </div>
          )}
        />
      </div>
    </div>
  );
}

/* ================================================================== *
 * Section 5 — 极限（复用 engine/symbolic.symbolicLimit）
 * ================================================================== */

const LIMIT_EXAMPLES: ExampleGroup[] = [
  {
    title: '经典极限',
    items: [
      { expr: 'sin(x)/x', label: 'sin(x)/x', hint: 'x→0' },
      { expr: '(1 + x)^(1/x)', label: '(1+x)^(1/x)', hint: 'e 的定义' },
      { expr: '(e^x - 1) / x', label: '(eˣ−1)/x', hint: 'x→0' },
    ],
  },
  {
    title: '无穷极限',
    items: [
      { expr: '1/x', label: '1/x', hint: 'x→∞' },
      { expr: 'ln(x) / x', label: 'ln(x)/x', hint: 'x→∞' },
    ],
  },
];

function LimitSection() {
  const sendToPlot = useSendToPlot();
  const [expr, setExpr] = useState('sin(x)/x');
  const [varName, setVarName] = useState('x');
  const [pointText, setPointText] = useState('0');
  const [result, setResult] = useState<(SymbolicResult & { numerical?: number }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const handleSolve = async () => {
    setWorking(true);
    setError(null);
    setResult(null);
    try {
      if (!expr.trim()) {
        setError(t('solverEnterEquation'));
        return;
      }
      const trimmed = pointText.trim().toLowerCase();
      const point: number | string =
        trimmed === 'inf' || trimmed === 'infinity' || trimmed === '∞'
          ? 'inf'
          : trimmed === '-inf' || trimmed === '-infinity' || trimmed === '-∞'
            ? '-inf'
            : parseFloat(trimmed);
      if (typeof point === 'number' && Number.isNaN(point)) {
        setError('趋于点需为数字或 inf');
        return;
      }
      const res = await symbolicLimit(expr, varName, point);
      if (!res.success) {
        setError(res.error || t('solverError'));
        return;
      }
      setResult(res);
    } catch (err) {
      setError((err as Error).message || t('solverError'));
    } finally {
      setWorking(false);
    }
  };

  const pointDisplay =
    pointText.trim().toLowerCase() === 'inf' || pointText.trim() === '∞'
      ? '\\infty'
      : pointText.trim().toLowerCase() === '-inf' || pointText.trim() === '-∞'
        ? '-\\infty'
        : pointText.trim() || '0';

  return (
    <div className="grid grid-cols-[minmax(300px,380px)_1fr] gap-5">
      <div className="space-y-3">
        <div>
          <label className="text-[11px] text-muted-foreground">{t('solverCalcInput')}</label>
          <Input
            value={expr}
            onChange={(e) => setExpr(e.target.value)}
            placeholder="f(x) = ..."
            className="h-9 text-[13px] font-mono mt-1"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSolve();
            }}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[11px] text-muted-foreground">{t('solverCalcVar')}</label>
            <Select value={varName} onValueChange={setVarName}>
              <SelectTrigger className="h-8 text-[12px] mt-1 font-mono">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {['x', 'y', 'z', 't', 'n'].map((v) => (
                  <SelectItem key={v} value={v} className="text-[12px] font-mono">{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground">{t('solverCalcPoint')}</label>
            <Input
              value={pointText}
              onChange={(e) => setPointText(e.target.value)}
              placeholder="0 或 inf"
              className="h-8 text-[12px] mt-1 font-mono"
            />
          </div>
        </div>
        <Button onClick={handleSolve} disabled={working} className="w-full h-9 text-[12.5px] gap-1.5" size="sm">
          <Target className="size-4" />
          求极限
        </Button>
        <div>
          <div className="text-[11px] text-muted-foreground mb-1">{t('solverExamples')}</div>
          <ExamplesDropdown groups={LIMIT_EXAMPLES} displayValue={expr} onPick={setExpr} />
        </div>
      </div>

      <div className="min-w-0">
        <ResultBlock
          error={error}
          result={result ? (
            <>
              <ResultHeader
                label="极限结果"
                onSendToPlot={() => sendToPlot([expr])}
              />
              <div className="overflow-x-auto">
                <FormulaRenderer
                  latex={`\\lim_{${varName} \\to ${pointDisplay}} ${expr} = ${result.latex}`}
                  displayMode
                />
              </div>
              {result.numerical !== undefined && (
                <div className="mt-1.5 text-[11.5px] font-mono text-muted-foreground">
                  数值结果 ≈ {parseFloat(result.numerical.toPrecision(8))}
                </div>
              )}
              {result.steps.length > 0 && (
                <SolverStepsView steps={result.steps} defaultExpandedCount={6} className="mt-3" />
              )}
            </>
          ) : (
            <div className="min-h-[220px] grid place-items-center text-[12px] text-muted-foreground">
              输入表达式后点击 "求极限"
            </div>
          )}
        />
      </div>
    </div>
  );
}

/* ================================================================== *
 * MAIN WORKBENCH
 * ================================================================== */
export function SolverWorkbench() {
  const [kind, setKind] = useState<SolverKind>('equation');
  const active = NAV_ITEMS.find((n) => n.id === kind) ?? NAV_ITEMS[0];

  return (
    <div className="h-full w-full flex min-h-0 bg-background/40">
      {/* ─── 左侧求解类型导航 ─────────────────────────────────── */}
      <aside className="w-64 shrink-0 flex flex-col border-r border-border/60 bg-card/30 backdrop-blur-sm">
        <div className="shrink-0 h-10 px-3 flex items-center gap-1.5 border-b border-border/60 bg-background/40">
          <FunctionSquare className="size-3.5 text-primary" />
          <span className="text-[12px] font-semibold tracking-tight">求解器</span>
        </div>
        <ScrollArea className="flex-1 min-h-0">
          <ul className="p-2 space-y-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = item.id === kind;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => setKind(item.id)}
                    className={cn(
                      'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md transition-colors text-left',
                      isActive
                        ? 'bg-primary/12 text-primary'
                        : 'hover:bg-accent/60 text-foreground/85',
                    )}
                  >
                    <span
                      className={cn(
                        'grid place-items-center size-7 rounded-md shrink-0',
                        isActive
                          ? 'bg-primary/20 text-primary border border-primary/40'
                          : 'bg-muted/50 border border-border/60 text-muted-foreground',
                      )}
                    >
                      <Icon className="size-3.5" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-semibold truncate">{item.label}</div>
                      <div className="text-[10px] text-muted-foreground truncate">{item.desc}</div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </ScrollArea>
        <div className="shrink-0 px-3 py-2 border-t border-border/60 text-[10px] text-muted-foreground leading-relaxed">
          分步求解：法则标注 / 逐步消元 / 积分提示
        </div>
      </aside>

      {/* ─── 右侧主区域 ─────────────────────────────────────── */}
      <main className="flex-1 min-w-[600px] min-h-0 flex flex-col">
        {/* 标题条 */}
        <div className="shrink-0 h-11 px-4 flex items-center gap-2 border-b border-border/60 bg-background/30">
          <active.icon className="size-4 text-primary" />
          <span className="text-[13px] font-semibold tracking-tight">{active.label}</span>
          <span className="text-[11px] text-muted-foreground">{active.desc}</span>
        </div>

        <ScrollArea className="flex-1 min-h-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={kind}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="p-4"
            >
              {kind === 'equation' && <EquationSection />}
              {kind === 'system' && <SystemSection />}
              {kind === 'derivative' && <DerivativeSection />}
              {kind === 'integral' && <IntegralSection />}
              {kind === 'limit' && <LimitSection />}
            </motion.div>
          </AnimatePresence>
        </ScrollArea>
      </main>
    </div>
  );
}
