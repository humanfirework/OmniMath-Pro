'use client';

/**
 * OmniMath Pro — Solver Panel (Task 5-b, Part 2)
 *
 * A general equation / expression solver with 4 sub-sections:
 *   1. 方程求解   — single equation (polynomial roots + transcendental numeric roots)
 *   2. 方程组     — multi-line linear system → matrix solve
 *   3. 微积分     — derivative / integral / limit / Taylor series
 *   4. 数值求根   — bisection / Newton method with iteration log
 *
 * All results rendered via <FormulaRenderer> (KaTeX) on glass cards.
 * Teal accent, framer-motion staggered entrance, friendly error boxes.
 *
 * 求解逻辑复用 engine 模块（Task 3/4 重构，与 SolverWorkbench 共享）：
 *   - 方程     → engine/equationSolver.solveEquation（含分步说明）
 *   - 方程组   → engine/linearSystem（高斯消元逐步 + 非线性数值说明）
 *   - 求导     → engine/derivativeSteps.differentiateWithSteps（法则标注）
 *   - 积分/极限 → engine/symbolic（中间提示 + Simpson 数值回退）
 * 步骤渲染统一使用 SolverStepsView / GaussianEliminationView。
 */

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FunctionSquare,
  Sigma,
  Equal,
  Calculator,
  Target,
  Play,
  X,
  Sparkles,
  Lightbulb,
  ChevronDown,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
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
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
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
import {
  evaluateExpression,
  solveEquation,
  fmtEquationNum as fmtNum,
  fmtComplex,
  parseLinearSystem,
  solveLinearSystemWithSteps,
  nonlinearSystemSteps,
  differentiateWithSteps,
  type EquationSolveResult,
  type LinearSystemSolution,
} from '@/lib/engine';
import {
  symbolicDefiniteIntegral,
  symbolicLimit,
} from '@/lib/engine/symbolic';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { ZoomLens, type ZoomStep } from '@/components/workbench/controls/ZoomLens';

/* ------------------------------------------------------------------ *
 * mathjs — shared configured instance (same semantics as the console)
 * ------------------------------------------------------------------ */
import { math } from '@/lib/engine/mathInstance';

/* ------------------------------------------------------------------ *
 * Types
 * ------------------------------------------------------------------ */

interface CalcResult {
  latex: string;
  steps?: string[];
  numerical?: number;
  error?: string;
}

interface NumericResult {
  latex: string;
  iterations: { x: number; fx: number; step: string }[];
  root: number | null;
  error?: string;
}

/* ================================================================== *
 * Section 1 — Equation Solving（逻辑复用 engine/equationSolver）
 * ================================================================== */

const EQUATION_EXAMPLE_GROUPS: ExampleGroup[] = [
  {
    title: '多项式方程',
    items: [
      { expr: 'x^2 - 5*x + 6 = 0', label: 'x² − 5x + 6 = 0', hint: '因式分解' },
      { expr: 'x^3 - 6*x^2 + 11*x - 6 = 0', label: 'x³ − 6x² + 11x − 6 = 0', hint: '三次方程' },
      { expr: '2*x + 3 = 7', label: '2x + 3 = 7', hint: '一次方程' },
      { expr: 'x^2 + 1 = 0', label: 'x² + 1 = 0', hint: '复数根' },
    ],
  },
  {
    title: '超越方程',
    items: [
      { expr: 'sin(x) = 0.5', label: 'sin(x) = 0.5', hint: '数值求解' },
      { expr: 'exp(x) = 2', label: 'eˣ = 2', hint: '对数解' },
    ],
  },
];

function EquationSolverSection() {
  const [equation, setEquation] = useState('x^2 - 5*x + 6 = 0');
  const [varName, setVarName] = useState('x');
  const [rangeA, setRangeA] = useState(-10);
  const [rangeB, setRangeB] = useState(10);
  const [result, setResult] = useState<EquationSolveResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [solveMode, setSolveMode] = useState<'numeric' | 'symbolic'>('numeric');

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
    <div className="space-y-2.5">
      {/* Equation input */}
      <div>
        <label className="text-[10.5px] text-muted-foreground">{t('solverEquationForm')}</label>
        <Input
          value={equation}
          onChange={(e) => setEquation(e.target.value)}
          placeholder={t('solverEquationPlaceholder')}
          className="h-8 text-[12px] font-mono mt-0.5"
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSolve();
          }}
        />
      </div>

      {/* Variable + range */}
      <div className="grid grid-cols-3 gap-1.5">
        <div>
          <label className="text-[10.5px] text-muted-foreground">{t('solverCalcVar')}</label>
          <Select value={varName} onValueChange={setVarName}>
            <SelectTrigger className="h-7 text-[11.5px] mt-0.5 font-mono">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {['x', 'y', 'z', 't', 'n'].map((v) => (
                <SelectItem key={v} value={v} className="text-[11.5px] font-mono">{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-[10.5px] text-muted-foreground">{t('solverRange')} a</label>
          <Input
            type="number"
            value={rangeA}
            step="any"
            onChange={(e) => setRangeA(parseFloat(e.target.value) || 0)}
            className="h-7 text-[11.5px] mt-0.5"
          />
        </div>
        <div>
          <label className="text-[10.5px] text-muted-foreground">{t('solverRange')} b</label>
          <Input
            type="number"
            value={rangeB}
            step="any"
            onChange={(e) => setRangeB(parseFloat(e.target.value) || 0)}
            className="h-7 text-[11.5px] mt-0.5"
          />
        </div>
      </div>

      <Button onClick={handleSolve} disabled={working} className="w-full h-8 text-[11.5px] gap-1.5" size="sm">
        <Play className="size-3.5" />
        {t('solverSolve')}
      </Button>

      {/* Solve mode toggle: numeric (default) vs symbolic */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10.5px] text-muted-foreground">求解模式</span>
        <ToggleGroup
          type="single"
          value={solveMode}
          onValueChange={(v) => {
            if (v === 'numeric' || v === 'symbolic') setSolveMode(v);
          }}
          variant="outline"
          size="sm"
          className="h-6"
        >
          <ToggleGroupItem
            value="numeric"
            className="h-6 px-2 text-[11px]"
            aria-label="数值解"
          >
            数值解
          </ToggleGroupItem>
          <ToggleGroupItem
            value="symbolic"
            className="h-6 px-2 text-[11px]"
            aria-label="符号解"
          >
            符号解
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {/* Examples — 折叠下拉菜单 */}
      <div>
        <div className="text-[10.5px] text-muted-foreground mb-1">{t('solverExamples')}</div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-6 px-2 text-[10.5px] gap-1 w-full justify-between">
              <span className="truncate">{equation || '选择示例…'}</span>
              <ChevronDown className="size-3 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            {EQUATION_EXAMPLE_GROUPS.map((group, gi) => (
              <div key={group.title}>
                {gi > 0 && <DropdownMenuSeparator />}
                <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {group.title}
                </DropdownMenuLabel>
                {group.items.map((item) => (
                  <DropdownMenuItem
                    key={item.expr}
                    onClick={() => setEquation(item.expr)}
                    className="flex items-center justify-between gap-2 text-[11px]"
                  >
                    <span className="font-mono">{item.label}</span>
                    {item.hint && (
                      <span className="text-[9px] text-muted-foreground">{item.hint}</span>
                    )}
                  </DropdownMenuItem>
                ))}
              </div>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ResultBlock error={error} result={result ? (
        <>
          {result.symbolicFallback && (
            <div className="text-[10.5px] text-amber-600 dark:text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded px-2 py-1 mb-1.5">
              ⚠️ 符号解失败，已回退到数值解
            </div>
          )}
          {result.info && (
            <div className="text-[10.5px] text-primary/80 bg-primary/5 border border-primary/20 rounded px-2 py-1 mb-1.5">
              {result.kind === 'polynomial' && '🧮 多项式方程 · '}
              {result.kind === 'transcendental' && '📈 超越方程 · '}
              {result.kind === 'symbolic' && '🔤 符号解 · '}
              {result.info}
            </div>
          )}
          {result.kind === 'symbolic' && result.symbolicLatex && (
            <div className="mb-2">
              <div className="text-[10.5px] text-muted-foreground mb-1">符号解:</div>
              <div className="overflow-x-auto">
                <FormulaRenderer latex={`${varName} \\in ${result.symbolicLatex}`} displayMode />
              </div>
              {result.symbolicExpression && result.symbolicExpression !== result.symbolicLatex && (
                <div className="mt-1 text-[10.5px] font-mono text-muted-foreground break-all">
                  <span className="text-foreground/60">表达式: </span>
                  {result.symbolicExpression}
                </div>
              )}
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
                    'rounded border px-2 py-1 text-[11px] font-mono',
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
            <SolverStepsView steps={result.steps} defaultExpandedCount={4} className="mt-2" />
          )}
        </>
      ) : null} />
    </div>
  );
}

/* ================================================================== *
 * Section 2 — System of Equations（逻辑复用 engine/linearSystem）
 * ================================================================== */

const SYSTEM_EXAMPLE_GROUPS: ExampleGroup[] = [
  {
    title: '线性方程组',
    items: [
      { expr: 'x + y = 5\nx - y = 1', label: '2×2 线性', hint: '二元一次' },
      { expr: 'x + y + z = 6\n2y + 5z = -4\n2x + 5y - z = 27', label: '3×3 线性', hint: '三元一次' },
    ],
  },
];

function SystemSolverSection() {
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
    <div className="space-y-2.5">
      <div>
        <label className="text-[10.5px] text-muted-foreground">{t('solverSystemSolution')}</label>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('solverSystemPlaceholder')}
          className="min-h-[80px] text-[12px] font-mono mt-0.5 bg-muted/30 resize-y"
        />
      </div>

      <Button onClick={handleSolve} disabled={working} className="w-full h-8 text-[11.5px] gap-1.5" size="sm">
        <Play className="size-3.5" />
        {t('solverSystemSolve')}
      </Button>

      <div>
        <div className="text-[10.5px] text-muted-foreground mb-1">{t('solverExamples')}</div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-6 px-2 text-[10.5px] gap-1 w-full justify-between">
              <span className="truncate">{text.split('\n')[0] || '选择示例…'}</span>
              <ChevronDown className="size-3 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            {SYSTEM_EXAMPLE_GROUPS.map((group, gi) => (
              <div key={group.title}>
                {gi > 0 && <DropdownMenuSeparator />}
                <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {group.title}
                </DropdownMenuLabel>
                {group.items.map((item) => (
                  <DropdownMenuItem
                    key={item.label}
                    onClick={() => setText(item.expr)}
                    className="flex items-center justify-between gap-2 text-[11px]"
                  >
                    <span className="font-mono">{item.label}</span>
                    {item.hint && (
                      <span className="text-[9px] text-muted-foreground">{item.hint}</span>
                    )}
                  </DropdownMenuItem>
                ))}
              </div>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ResultBlock error={error} result={
        nonlinearSteps ? (
          <SolverStepsView steps={nonlinearSteps} title="数值方法说明" />
        ) : solution ? (
          <>
            {solution.kind === 'unique' && (
              <div className="overflow-x-auto">
                <FormulaRenderer latex={solution.latex} displayMode />
              </div>
            )}
            {solution.kind === 'none' && (
              <div className="text-[11.5px] text-rose-600 dark:text-rose-300">
                {t('solverNoSolution')}
              </div>
            )}
            {solution.kind === 'infinite' && (
              <div className="text-[11.5px] text-amber-600 dark:text-amber-300">
                {t('solverMultipleSolutions')}
                <div className="mt-1 overflow-x-auto">
                  <FormulaRenderer latex={solution.latex} displayMode />
                </div>
              </div>
            )}
            {solution.kind === 'unique' && solution.vector && varList.length > 0 && (
              <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-1">
                {varList.map((v, i) => (
                  <div
                    key={v}
                    className="rounded border border-emerald-500/30 bg-emerald-500/5 px-2 py-1 text-[11px] font-mono text-emerald-700 dark:text-emerald-300"
                  >
                    {v} = {fmtNum(solution.vector![i] ?? 0)}
                  </div>
                ))}
              </div>
            )}
            {/* 逐步消元中间状态（Task 4.2） */}
            {solution.steps.length > 0 && (
              <GaussianEliminationView
                steps={solution.steps}
                defaultExpandedCount={4}
                className="mt-2"
              />
            )}
          </>
        ) : null
      } />
    </div>
  );
}

/* ================================================================== *
 * Section 3 — Calculus（求导/积分/极限复用 engine 模块，法则与中间步骤标注）
 * ================================================================== */

type CalcMode = 'deriv' | 'integral' | 'limit' | 'taylor';

interface ExampleGroup {
  title: string;
  items: Array<{ expr: string; label: string; hint?: string }>;
}

const CALC_EXAMPLE_GROUPS: Record<CalcMode, ExampleGroup[]> = {
  deriv: [
    {
      title: '多项式',
      items: [
        { expr: 'x^3 + 2*x^2', label: 'x³ + 2x²', hint: '多项式求导' },
        { expr: '1 / (1 + x^2)', label: '1/(1+x²)', hint: '链式法则' },
      ],
    },
    {
      title: '复合函数',
      items: [
        { expr: 'sin(x)*cos(x)', label: 'sin(x)·cos(x)', hint: '乘积法则' },
        { expr: 'e^x * ln(x)', label: 'eˣ·ln(x)', hint: '乘积法则' },
      ],
    },
  ],
  integral: [
    {
      title: '基本积分',
      items: [
        { expr: 'x^2', label: 'x²', hint: '幂函数积分' },
        { expr: 'sin(x)', label: 'sin(x)', hint: '三角函数积分' },
      ],
    },
    {
      title: '特殊积分',
      items: [
        { expr: 'e^x', label: 'eˣ', hint: '指数函数积分' },
        { expr: '1 / x', label: '1/x', hint: '对数积分' },
      ],
    },
  ],
  limit: [
    {
      title: '经典极限',
      items: [
        { expr: 'sin(x)/x', label: 'sin(x)/x', hint: 'x→0 经典极限' },
        { expr: '(1 + x)^(1/x)', label: '(1+x)^(1/x)', hint: 'e 的定义' },
        { expr: '(e^x - 1) / x', label: '(eˣ-1)/x', hint: 'x→0' },
      ],
    },
    {
      title: '无穷极限',
      items: [
        { expr: '1/x', label: '1/x', hint: 'x→∞' },
      ],
    },
  ],
  taylor: [
    {
      title: '三角函数',
      items: [
        { expr: 'sin(x)', label: 'sin(x)', hint: '麦克劳林级数' },
        { expr: 'cos(x)', label: 'cos(x)', hint: '麦克劳林级数' },
      ],
    },
    {
      title: '指数与对数',
      items: [
        { expr: 'e^x', label: 'eˣ', hint: '泰勒展开' },
        { expr: 'ln(1 + x)', label: 'ln(1+x)', hint: '泰勒展开' },
      ],
    },
  ],
};

// 保持向后兼容：switchMode 使用每个模式的第一个示例
const CALC_EXAMPLES: Record<CalcMode, string[]> = {
  deriv: CALC_EXAMPLE_GROUPS.deriv.flatMap((g) => g.items.map((i) => i.expr)),
  integral: CALC_EXAMPLE_GROUPS.integral.flatMap((g) => g.items.map((i) => i.expr)),
  limit: CALC_EXAMPLE_GROUPS.limit.flatMap((g) => g.items.map((i) => i.expr)),
  taylor: CALC_EXAMPLE_GROUPS.taylor.flatMap((g) => g.items.map((i) => i.expr)),
};

function CalculusSection() {
  const [mode, setMode] = useState<'deriv' | 'integral' | 'limit' | 'taylor'>('deriv');
  const [expr, setExpr] = useState('x^3 + 2*x^2');
  const [varName, setVarName] = useState('x');
  const [lower, setLower] = useState(0);
  const [upper, setUpper] = useState(1);
  const [point, setPoint] = useState(0);
  const [order, setOrder] = useState(5);
  const [result, setResult] = useState<CalcResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  // Update example when mode changes
  const switchMode = (m: typeof mode) => {
    setMode(m);
    setError(null);
    setResult(null);
    setExpr(CALC_EXAMPLES[m][0]);
  };

  const handleCompute = async () => {
    setWorking(true);
    setError(null);
    setResult(null);
    try {
      // 复用 engine 模块（求导法则标注 / 积分提示与数值回退 / 符号极限）
      const engineResult = await computeCalculus(mode, expr, varName, { lower, upper, point, order });
      if (engineResult.error) {
        setError(engineResult.error);
        return;
      }
      setResult(engineResult);
    } catch (err) {
      setError((err as Error).message || t('solverError'));
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="space-y-2.5">
      {/* Sub-tabs */}
      <div className="grid grid-cols-4 gap-1">
        {(
          [
            { k: 'deriv', label: t('solverCalcDerivative'), icon: Sigma },
            { k: 'integral', label: t('solverCalcIntegral'), icon: Equal },
            { k: 'limit', label: t('solverCalcLimit'), icon: Target },
            { k: 'taylor', label: t('solverCalcTaylor'), icon: Sparkles },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.k}
              type="button"
              onClick={() => switchMode(tab.k)}
              className={cn(
                'flex flex-col items-center justify-center gap-0.5 h-12 rounded-md border text-[10px] transition-all',
                mode === tab.k
                  ? 'bg-primary/15 text-primary border-primary/40 shadow-sm'
                  : 'bg-muted/30 text-muted-foreground border-border/60 hover:border-primary/30 hover:text-foreground',
              )}
            >
              <Icon className="size-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Expression input */}
      <div>
        <label className="text-[10.5px] text-muted-foreground">{t('solverCalcInput')}</label>
        <Input
          value={expr}
          onChange={(e) => setExpr(e.target.value)}
          placeholder="f(x) = ..."
          className="h-8 text-[12px] font-mono mt-0.5"
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleCompute();
          }}
        />
      </div>

      {/* Variable + mode-specific inputs */}
      <div className="grid grid-cols-2 gap-1.5">
        <div>
          <label className="text-[10.5px] text-muted-foreground">{t('solverCalcVar')}</label>
          <Select value={varName} onValueChange={setVarName}>
            <SelectTrigger className="h-7 text-[11.5px] mt-0.5 font-mono">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {['x', 'y', 'z', 't', 'n'].map((v) => (
                <SelectItem key={v} value={v} className="text-[11.5px] font-mono">{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {mode === 'integral' && (
          <>
            <div>
              <label className="text-[10.5px] text-muted-foreground">{t('solverCalcLower')}</label>
              <Input
                type="number"
                value={lower}
                step="any"
                onChange={(e) => setLower(parseFloat(e.target.value) || 0)}
                className="h-7 text-[11.5px] mt-0.5"
              />
            </div>
            <div>
              <label className="text-[10.5px] text-muted-foreground">{t('solverCalcUpper')}</label>
              <Input
                type="number"
                value={upper}
                step="any"
                onChange={(e) => setUpper(parseFloat(e.target.value) || 0)}
                className="h-7 text-[11.5px] mt-0.5"
              />
            </div>
          </>
        )}

        {mode === 'limit' && (
          <div>
            <label className="text-[10.5px] text-muted-foreground">{t('solverCalcPoint')}</label>
            <Input
              type="text"
              value={String(point)}
              onChange={(e) => {
                const v = e.target.value;
                if (v === 'inf' || v === '-inf') {
                  setPoint(v === 'inf' ? Infinity : -Infinity);
                } else {
                  setPoint(parseFloat(v) || 0);
                }
              }}
              className="h-7 text-[11.5px] mt-0.5"
              placeholder="0 或 inf"
            />
          </div>
        )}

        {mode === 'taylor' && (
          <div>
            <label className="text-[10.5px] text-muted-foreground">{t('solverCalcOrder')}</label>
            <Input
              type="number"
              value={order}
              step="1"
              min="1"
              max="20"
              onChange={(e) => setOrder(Math.max(1, Math.min(20, parseInt(e.target.value, 10) || 5)))}
              className="h-7 text-[11.5px] mt-0.5"
            />
          </div>
        )}
      </div>

      <Button onClick={handleCompute} disabled={working} className="w-full h-8 text-[11.5px] gap-1.5" size="sm">
        <Calculator className="size-3.5" />
        {t('solverCalcCompute')}
      </Button>

      {/* Examples — 折叠下拉菜单 */}
      <div>
        <div className="text-[10.5px] text-muted-foreground mb-1">{t('solverExamples')}</div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-6 px-2 text-[10.5px] gap-1 w-full justify-between">
              <span className="truncate">{expr || '选择示例…'}</span>
              <ChevronDown className="size-3 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            {CALC_EXAMPLE_GROUPS[mode].map((group, gi) => (
              <div key={group.title}>
                {gi > 0 && <DropdownMenuSeparator />}
                <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {group.title}
                </DropdownMenuLabel>
                {group.items.map((item) => (
                  <DropdownMenuItem
                    key={item.expr}
                    onClick={() => setExpr(item.expr)}
                    className="flex items-center justify-between gap-2 text-[11px]"
                  >
                    <span className="font-mono">{item.label}</span>
                    {item.hint && (
                      <span className="text-[9px] text-muted-foreground">{item.hint}</span>
                    )}
                  </DropdownMenuItem>
                ))}
              </div>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ResultBlock error={error} result={result ? (
        <div className="space-y-2">
          <div className="overflow-x-auto">
            <FormulaRenderer latex={result.latex} displayMode />
          </div>
          {result.numerical !== undefined && (
            <div className="text-[11px] font-mono text-muted-foreground">
              数值结果 ≈ {parseFloat(result.numerical.toPrecision(8))}
            </div>
          )}
          {result.steps && result.steps.length > 0 && (
            <SolverStepsView
              steps={result.steps}
              title={t('solverSteps')}
              defaultExpandedCount={5}
            />
          )}
          {mode === 'limit' && !error && (
            <LimitZoomViewer
              expr={expr}
              point={point}
              limitValue={result.latex.split('=').pop()?.trim().replace(/\\/g, '')}
            />
          )}
        </div>
      ) : null} />
    </div>
  );
}

/* ================================================================== *
 * LimitZoomViewer — 极限求解分步放大观察
 * ================================================================== *
 * 在极限模式下，生成 6 个逐步缩小的 x 范围，观察 f(x) 在趋近点的行为。
 * 每步显示当前 x 范围、对应 f(point) 近似值和与极限的差距。
 */
function LimitZoomViewer({
  expr,
  point,
  limitValue,
}: {
  expr: string;
  point: number;
  limitValue?: string;
}) {
  const [step, setStep] = useState(0);

  // 生成 6 个放大步骤：从全局 ±5 到极近 ±0.001
  const steps: ZoomStep[] = useMemo(() => {
    const isInf = !isFinite(point);
    const center = isInf ? 0 : point;
    const deltas = [5, 1, 0.5, 0.1, 0.01, 0.001];
    return deltas.map((delta, i) => {
      const range: [number, number] = [center - delta, center + delta];
      // 计算 f(center + delta/2) 近似值
      let approxVal = '—';
      try {
        const testX = isInf ? 1000 * Math.sign(point || 1) : center + delta / 2;
        const res = evaluateExpression(`${expr}`.replace(/x/g, `(${testX})`), 'matlab') as ReturnType<typeof evaluateExpression> & { value?: unknown };
        if (res.success && res.value !== undefined) {
          const numVal = typeof res.value === 'number' ? res.value : parseFloat(String(res.value));
          if (isFinite(numVal)) {
            approxVal = numVal.toPrecision(6);
          }
        }
      } catch {
        // 评估失败，保持 '—'
      }
      return {
        label: `第 ${i + 1} 步: x ∈ [${range[0]}, ${range[1]}]`,
        description: `δ = ${delta}  ·  f(x) ≈ ${approxVal}`,
        range,
        delta,
        approxVal,
      };
    });
  }, [expr, point]);

  // 在每个步骤范围内采样函数值用于简单可视化
  const currentStepData = steps[step] as (ZoomStep & { range: [number, number]; delta: number }) | undefined;
  const samples = useMemo(() => {
    if (!currentStepData) return [] as Array<{ x: number; y: number }>;
    const [x0, x1] = currentStepData.range;
    const n = 60;
    const out: Array<{ x: number; y: number }> = [];
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n;
      let y = NaN;
      try {
        const res = evaluateExpression(expr.replace(/x/g, `(${x})`), 'matlab') as ReturnType<typeof evaluateExpression> & { value?: unknown };
        if (res.success && res.value !== undefined) {
          const v = typeof res.value === 'number' ? res.value : parseFloat(String(res.value));
          if (isFinite(v)) y = v;
        }
      } catch {
        // skip
      }
      out.push({ x, y });
    }
    return out;
  }, [expr, currentStepData]);

  // 计算采样点的 y 范围
  const validSamples = samples.filter((s) => isFinite(s.y));
  const yMin = validSamples.length ? Math.min(...validSamples.map((s) => s.y)) : -1;
  const yMax = validSamples.length ? Math.max(...validSamples.map((s) => s.y)) : 1;
  const yPad = (yMax - yMin) * 0.15 || 1;
  const yLo = yMin - yPad;
  const yHi = yMax + yPad;

  // SVG 绘图参数
  const W = 280, H = 160, padL = 36, padR = 12, padT = 10, padB = 24;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const [x0, x1] = currentStepData?.range ?? [-1, 1];
  const sx = (x: number) => padL + ((x - x0) / (x1 - x0 || 1)) * plotW;
  const sy = (y: number) => padT + (1 - (y - yLo) / (yHi - yLo || 1)) * plotH;
  const pathD = validSamples
    .map((s, i) => `${i === 0 ? 'M' : 'L'} ${sx(s.x).toFixed(1)} ${sy(s.y).toFixed(1)}`)
    .join(' ');

  // 极限点位置（如果在当前范围内）
  const pointInRange = isFinite(point) && point >= x0 && point <= x1;
  const pointX = pointInRange ? sx(point) : -1;

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-2 mt-2">
      <div className="text-[10.5px] font-medium text-primary mb-1 flex items-center gap-1">
        <Target className="size-3" />
        分步放大观察极限
      </div>
      <ZoomLens
        steps={steps}
        currentStep={step}
        onStepChange={setStep}
        className="bg-transparent border-border/40"
      >
        {() => (
          <div className="p-1">
            <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="bg-background/60 rounded">
              {/* 网格 */}
              <line x1={padL} y1={sy(0)} x2={W - padR} y2={sy(0)} stroke="currentColor" strokeWidth={0.5} className="text-muted-foreground/30" />
              <line x1={sx(0)} y1={padT} x2={sx(0)} y2={H - padB} stroke="currentColor" strokeWidth={0.5} className="text-muted-foreground/30" />
              {/* 极限参考线 */}
              {limitValue && (
                <line
                  x1={padL}
                  y1={sy(parseFloat(limitValue) || 0)}
                  x2={W - padR}
                  y2={sy(parseFloat(limitValue) || 0)}
                  stroke="oklch(0.72 0.19 70)"
                  strokeWidth={1}
                  strokeDasharray="4 2"
                  opacity={0.6}
                />
              )}
              {/* 函数曲线 */}
              {pathD && <path d={pathD} fill="none" stroke="oklch(0.72 0.19 70)" strokeWidth={1.8} />}
              {/* 极限点标记 */}
              {pointInRange && (
                <>
                  <line x1={pointX} y1={padT} x2={pointX} y2={H - padB} stroke="oklch(0.65 0.2 25)" strokeWidth={0.8} strokeDasharray="3 3" />
                  <circle cx={pointX} cy={sy(parseFloat(limitValue || '0') || 0)} r={3} fill="oklch(0.65 0.2 25)" />
                </>
              )}
              {/* 坐标轴标签 */}
              <text x={padL} y={H - 6} fontSize={8} fill="currentColor" className="text-muted-foreground">{x0.toFixed(2)}</text>
              <text x={W - padR - 20} y={H - 6} fontSize={8} fill="currentColor" className="text-muted-foreground">{x1.toFixed(2)}</text>
              <text x={2} y={padT + 6} fontSize={8} fill="currentColor" className="text-muted-foreground">{yHi.toFixed(2)}</text>
              <text x={2} y={H - padB - 2} fontSize={8} fill="currentColor" className="text-muted-foreground">{yLo.toFixed(2)}</text>
            </svg>
            <div className="text-[10px] text-muted-foreground mt-1 text-center">
              {currentStepData?.description}
              {limitValue && `  ·  极限 = ${limitValue}`}
            </div>
          </div>
        )}
      </ZoomLens>
    </div>
  );
}

async function computeCalculus(
  mode: 'deriv' | 'integral' | 'limit' | 'taylor',
  expr: string,
  varName: string,
  opts: { lower: number; upper: number; point: number; order: number },
): Promise<CalcResult> {
  try {
    if (mode === 'deriv') {
      // Task 4.1 — 分步求导并标注所用法则（幂/乘积/商/链式/和差…）
      const { resultLatex, steps } = differentiateWithSteps(expr, varName);
      return {
        latex: `\\frac{d}{d${varName}} \\left[ ${expr} \\right] = ${resultLatex}`,
        steps,
      };
    }
    if (mode === 'integral') {
      // Task 4.3 — 符号定积分 + 方法提示；无闭式解时回退 Simpson 数值积分
      const res = await symbolicDefiniteIntegral(expr, varName, opts.lower, opts.upper);
      if (!res.success) return { latex: '', error: res.error };
      return {
        latex: `\\int_{${opts.lower}}^{${opts.upper}} ${expr} \\, d${varName} = ${res.latex}`,
        steps: res.steps,
        numerical: res.numerical,
      };
    }
    if (mode === 'limit') {
      const pointArg: number | string = Number.isFinite(opts.point)
        ? opts.point
        : opts.point > 0
          ? 'inf'
          : '-inf';
      const res = await symbolicLimit(expr, varName, pointArg);
      if (!res.success) return { latex: '', error: res.error };
      const ptStr = Number.isFinite(opts.point)
        ? String(opts.point)
        : opts.point > 0
          ? '\\infty'
          : '-\\infty';
      return {
        latex: `\\lim_{${varName} \\to ${ptStr}} ${expr} = ${res.latex}`,
        steps: res.steps,
        numerical: res.numerical,
      };
    }
    if (mode === 'taylor') {
      // Compute Taylor series via repeated derivatives at the expansion point
      const order = Math.max(1, Math.min(20, opts.order));
      let node = math.parse(expr);
      let fact = 1;
      const terms: { coef: number; pow: number }[] = [];
      for (let n = 0; n <= order; n++) {
        if (n > 0) fact *= n;
        let val: number;
        try {
          const v = node.evaluate({ [varName]: opts.point });
          val = typeof v === 'number' ? v : NaN;
        } catch {
          val = NaN;
        }
        if (Number.isFinite(val) && Math.abs(val) > 1e-14) {
          terms.push({ coef: val / fact, pow: n });
        }
        try {
          node = math.derivative(node, varName);
        } catch {
          break;
        }
      }
      const latex = taylorToLatex(terms, varName, opts.point, order);
      return { latex };
    }
    return { latex: '', error: t('solverError') };
  } catch (err) {
    return { latex: '', error: (err as Error).message };
  }
}

function taylorToLatex(
  terms: { coef: number; pow: number }[],
  varName: string,
  point: number,
  order: number,
): string {
  const parts: string[] = [];
  for (const term of terms) {
    const c = term.coef;
    const absC = Math.abs(c);
    const sign = c < 0 ? '-' : '+';
    let coefStr: string;
    if (Math.abs(absC - 1) < 1e-10 && term.pow > 0) coefStr = '';
    else coefStr = fmtNum(absC);

    let termStr: string;
    if (term.pow === 0) termStr = fmtNum(absC);
    else if (term.pow === 1) termStr = `${coefStr}${varName}`.trim();
    else termStr = `${coefStr}${varName}^{${term.pow}}`.trim();

    if (parts.length === 0) {
      parts.push(c < 0 ? `-${termStr}` : termStr);
    } else {
      parts.push(`${sign} ${termStr}`);
    }
  }
  if (parts.length === 0) parts.push('0');
  parts.push(`+ O(${varName}^{${order + 1}})`);
  const ptStr = Number.isFinite(point) && point !== 0
    ? ` \\text{ at } ${varName} = ${point}`
    : '';
  return `\\text{Taylor: } ${parts.join(' ')}${ptStr}`;
}

/* ================================================================== *
 * Section 4 — Numeric Root Finding
 * ================================================================== */

function NumericRootSection() {
  const [expr, setExpr] = useState('sin(x) - 0.5');
  const [method, setMethod] = useState<'bisection' | 'newton'>('bisection');
  const [a, setA] = useState(0);
  const [b, setB] = useState(2);
  const [x0, setX0] = useState(1);
  const [tol, setTol] = useState(1e-10);
  const [maxIter, setMaxIter] = useState(100);
  const [result, setResult] = useState<NumericResult | null>(null);
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
      const node = math.parse(expr);
      const f = (x: number) => {
        try {
          const v = node.evaluate({ x });
          return typeof v === 'number' ? v : NaN;
        } catch {
          return NaN;
        }
      };
      const fp = (x: number) => {
        try {
          const dnode = math.derivative(node, 'x');
          const v = dnode.evaluate({ x });
          return typeof v === 'number' ? v : NaN;
        } catch {
          return NaN;
        }
      };

      if (method === 'bisection') {
        const fa = f(a);
        const fb = f(b);
        if (!Number.isFinite(fa) || !Number.isFinite(fb)) {
          setError(t('solverEnterEquation'));
          return;
        }
        if (Math.sign(fa) === Math.sign(fb)) {
          setError(t('solverNumericNoSignChange'));
          return;
        }
        const iters: { x: number; fx: number; step: string }[] = [];
        let lo = a;
        let hi = b;
        let flo = fa;
        let root: number | null = null;
        for (let i = 0; i < maxIter; i++) {
          const mid = (lo + hi) / 2;
          const fm = f(mid);
          iters.push({
            x: mid,
            fx: fm,
            step: `[${fmtNum(lo, 4)}, ${fmtNum(hi, 4)}] → ${fmtNum(mid, 6)}`,
          });
          if (Math.abs(fm) < tol || (hi - lo) / 2 < tol) {
            root = mid;
            break;
          }
          if (Math.sign(fm) === Math.sign(flo)) {
            lo = mid;
            flo = fm;
          } else {
            hi = mid;
          }
        }
        if (root === null) root = (lo + hi) / 2;
        setResult({
          latex: `x \\approx ${fmtNum(root)} \\quad (\\text{二分法, } ${iters.length} \\text{ 次迭代})`,
          iterations: iters,
          root,
        });
      } else {
        // Newton
        const iters: { x: number; fx: number; step: string }[] = [];
        let xn = x0;
        let root: number | null = null;
        for (let i = 0; i < maxIter; i++) {
          const fxn = f(xn);
          const fpxn = fp(xn);
          if (!Number.isFinite(fxn) || !Number.isFinite(fpxn) || Math.abs(fpxn) < 1e-14) {
            setError(`迭代失败: f'(x) = 0 或不可计算 at x = ${fmtNum(xn)}`);
            return;
          }
          const next = xn - fxn / fpxn;
          iters.push({
            x: xn,
            fx: fxn,
            step: `x_{${i}} = ${fmtNum(xn, 6)}, \\ f(x) = ${fmtNum(fxn, 6)} \\to x_{${i + 1}} = ${fmtNum(next, 6)}`,
          });
          if (Math.abs(next - xn) < tol || Math.abs(fxn) < tol) {
            root = next;
            break;
          }
          xn = next;
        }
        if (root === null) root = xn;
        setResult({
          latex: `x \\approx ${fmtNum(root)} \\quad (\\text{牛顿法, } ${iters.length} \\text{ 次迭代})`,
          iterations: iters,
          root,
        });
      }
    } catch (err) {
      setError((err as Error).message || t('solverError'));
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="space-y-2.5">
      <div>
        <label className="text-[10.5px] text-muted-foreground">{t('solverNumericFunction')}</label>
        <Input
          value={expr}
          onChange={(e) => setExpr(e.target.value)}
          placeholder="f(x) = ..."
          className="h-8 text-[12px] font-mono mt-0.5"
        />
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        <div>
          <label className="text-[10.5px] text-muted-foreground">{t('solverNumericMethod')}</label>
          <Select value={method} onValueChange={(v) => setMethod(v as 'bisection' | 'newton')}>
            <SelectTrigger className="h-7 text-[11.5px] mt-0.5">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="bisection" className="text-[11.5px]">{t('solverNumericBisection')}</SelectItem>
              <SelectItem value="newton" className="text-[11.5px]">{t('solverNumericNewton')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-[10.5px] text-muted-foreground">{t('solverNumericTolerance')}</label>
          <Input
            type="number"
            value={tol}
            step="any"
            onChange={(e) => setTol(parseFloat(e.target.value) || 1e-10)}
            className="h-7 text-[11.5px] mt-0.5 font-mono"
          />
        </div>
      </div>

      {method === 'bisection' ? (
        <div className="grid grid-cols-2 gap-1.5">
          <div>
            <label className="text-[10.5px] text-muted-foreground">a (左端点)</label>
            <Input
              type="number"
              value={a}
              step="any"
              onChange={(e) => setA(parseFloat(e.target.value) || 0)}
              className="h-7 text-[11.5px] mt-0.5"
            />
          </div>
          <div>
            <label className="text-[10.5px] text-muted-foreground">b (右端点)</label>
            <Input
              type="number"
              value={b}
              step="any"
              onChange={(e) => setB(parseFloat(e.target.value) || 0)}
              className="h-7 text-[11.5px] mt-0.5"
            />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-1.5">
          <div>
            <label className="text-[10.5px] text-muted-foreground">{t('solverNumericGuess')}</label>
            <Input
              type="number"
              value={x0}
              step="any"
              onChange={(e) => setX0(parseFloat(e.target.value) || 0)}
              className="h-7 text-[11.5px] mt-0.5"
            />
          </div>
          <div>
            <label className="text-[10.5px] text-muted-foreground">{t('solverNumericIter')}</label>
            <Input
              type="number"
              value={maxIter}
              step="1"
              min="1"
              max="500"
              onChange={(e) => setMaxIter(Math.max(1, Math.min(500, parseInt(e.target.value, 10) || 100)))}
              className="h-7 text-[11.5px] mt-0.5"
            />
          </div>
        </div>
      )}

      <Button onClick={handleSolve} disabled={working} className="w-full h-8 text-[11.5px] gap-1.5" size="sm">
        <Target className="size-3.5" />
        {t('solverNumericCompute')}
      </Button>

      <div>
        <div className="text-[10.5px] text-muted-foreground mb-1">{t('solverExamples')}</div>
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            onClick={() => { setExpr('sin(x) - 0.5'); setMethod('bisection'); setA(0); setB(2); setX0(1); }}
            className="h-5 px-2 text-[10px] font-mono rounded-full border border-border/60 bg-muted/30 hover:border-primary/40 hover:text-primary hover:bg-primary/5 transition-colors"
          >
            sin(x) = 0.5
          </button>
          <button
            type="button"
            onClick={() => { setExpr('x^3 - 2*x - 5'); setMethod('newton'); setX0(2); }}
            className="h-5 px-2 text-[10px] font-mono rounded-full border border-border/60 bg-muted/30 hover:border-primary/40 hover:text-primary hover:bg-primary/5 transition-colors"
          >
            x³ − 2x − 5
          </button>
          <button
            type="button"
            onClick={() => { setExpr('exp(x) - 2'); setMethod('bisection'); setA(0); setB(1); }}
            className="h-5 px-2 text-[10px] font-mono rounded-full border border-border/60 bg-muted/30 hover:border-primary/40 hover:text-primary hover:bg-primary/5 transition-colors"
          >
            e^x = 2
          </button>
          <button
            type="button"
            onClick={() => { setExpr('cos(x) - x'); setMethod('newton'); setX0(0.5); }}
            className="h-5 px-2 text-[10px] font-mono rounded-full border border-border/60 bg-muted/30 hover:border-primary/40 hover:text-primary hover:bg-primary/5 transition-colors"
          >
            cos(x) = x
          </button>
        </div>
      </div>

      <ResultBlock
        error={error}
        result={result ? (
          <div className="space-y-2">
            <div className="overflow-x-auto">
              <FormulaRenderer latex={result.latex} displayMode />
            </div>
            {result.root !== null && (
              <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-[12px] font-mono text-emerald-700 dark:text-emerald-300">
                x = {fmtNum(result.root, 12)}
                <span className="ml-2 text-[10px] opacity-70">
                  f(x) = {fmtNum((expr ? (() => {
                    try {
                      const v = math.parse(expr).evaluate({ x: result.root });
                      return typeof v === 'number' ? v : NaN;
                    } catch { return NaN; }
                  })() : 0), 6)}
                </span>
              </div>
            )}
            {result.iterations.length > 0 && (
              <details>
                <summary className="cursor-pointer text-[10.5px] text-muted-foreground hover:text-foreground select-none">
                  {t('solverNumericIter')} ({result.iterations.length})
                </summary>
                <div className="mt-1.5 max-h-48 overflow-y-auto space-y-1 pr-1">
                  {result.iterations.map((it, i) => (
                    <div
                      key={i}
                      className="text-[10.5px] font-mono text-foreground/80 rounded border border-border/40 bg-muted/20 px-1.5 py-1"
                    >
                      <span className="text-primary mr-1">#{i + 1}</span>
                      <FormulaRenderer latex={it.step} displayMode={false} />
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        ) : null}
      />
    </div>
  );
}

/* ================================================================== *
 * Shared result block
 * ================================================================== */
function ResultBlock({
  error,
  result,
}: {
  error: string | null;
  result: React.ReactNode;
}) {
  return (
    <AnimatePresence mode="wait">
      {error && (
        <motion.div
          key="err"
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="rounded-md border border-rose-500/40 bg-rose-500/10 p-2.5 text-[11.5px] text-rose-600 dark:text-rose-300"
        >
          <div className="flex items-start gap-1.5">
            <X className="size-3.5 mt-0.5 shrink-0" />
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
          className="rounded-md border border-primary/30 bg-primary/5 p-2.5 glow-card-teal"
        >
          {result}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ================================================================== *
 * MAIN PANEL
 * ================================================================== */
export function SolverPanel() {
  const [activeTab, setActiveTab] = useState<string>('equation');

  return (
    <div className="flex flex-col h-full bg-card/30">
      {/* Header */}
      <div className="shrink-0 px-3 pt-2.5 pb-2 border-b border-border/60">
        <div className="flex items-center gap-1.5">
          <FunctionSquare className="size-3.5 text-primary" />
          <span className="text-[12.5px] font-semibold tracking-tight">
            {t('solverTitle')}
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="ml-auto">
                <Badge variant="outline" className="h-4 px-1.5 text-[9.5px] gap-0.5">
                  <Lightbulb className="size-2.5 text-amber-500" />
                  AI
                </Badge>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom">智能方程求解</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="flex-1 min-h-0 flex flex-col gap-2 px-2 pt-2"
      >
        <TabsList className="h-7 grid grid-cols-4 w-full">
          <TabsTrigger value="equation" className="text-[10.5px] px-1 py-0.5 gap-1">
            <Sigma className="size-3" />
            <span className="hidden sm:inline">{t('solverTabEquation')}</span>
          </TabsTrigger>
          <TabsTrigger value="system" className="text-[10.5px] px-1 py-0.5 gap-1">
            <Equal className="size-3" />
            <span className="hidden sm:inline">{t('solverTabSystem')}</span>
          </TabsTrigger>
          <TabsTrigger value="calculus" className="text-[10.5px] px-1 py-0.5 gap-1">
            <Calculator className="size-3" />
            <span className="hidden sm:inline">{t('solverTabCalculus')}</span>
          </TabsTrigger>
          <TabsTrigger value="numeric" className="text-[10.5px] px-1 py-0.5 gap-1">
            <Target className="size-3" />
            <span className="hidden sm:inline">{t('solverTabNumeric')}</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="equation" className="flex-1 min-h-0 overflow-hidden">
          <ScrollArea className="h-full">
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className="p-2"
            >
              <EquationSolverSection />
            </motion.div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="system" className="flex-1 min-h-0 overflow-hidden">
          <ScrollArea className="h-full">
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className="p-2"
            >
              <SystemSolverSection />
            </motion.div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="calculus" className="flex-1 min-h-0 overflow-hidden">
          <ScrollArea className="h-full">
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className="p-2"
            >
              <CalculusSection />
            </motion.div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="numeric" className="flex-1 min-h-0 overflow-hidden">
          <ScrollArea className="h-full">
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className="p-2"
            >
              <NumericRootSection />
            </motion.div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}
