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
 */

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { create, all, type MathJsInstance } from 'mathjs';
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
import { FormulaRenderer } from '@/components/workbench/FormulaRenderer';
import { evaluateExpression } from '@/lib/engine';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

/* ------------------------------------------------------------------ *
 * mathjs instance for direct algebraic manipulation
 * ------------------------------------------------------------------ */
const math: MathJsInstance = create(all);

/* ------------------------------------------------------------------ *
 * Types
 * ------------------------------------------------------------------ */

interface ComplexRoot {
  re: number;
  im: number;
}

interface EqResult {
  latex: string;
  roots: ComplexRoot[];
  kind: 'polynomial' | 'transcendental' | 'none' | 'symbolic';
  info?: string;
  symbolicLatex?: string;
  symbolicExpression?: string;
  symbolicFallback?: boolean;
}

interface SystemResult {
  latex: string;
  vector: number[];
  variables: string[];
  kind: 'unique' | 'none' | 'infinite';
  steps?: string[];
  error?: string;
}

interface CalcResult {
  latex: string;
  steps?: string[];
  error?: string;
}

interface NumericResult {
  latex: string;
  iterations: { x: number; fx: number; step: string }[];
  root: number | null;
  error?: string;
}

/* ------------------------------------------------------------------ *
 * Number formatting helpers
 * ------------------------------------------------------------------ */

function fmtNum(n: number, digits = 6): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  if (Math.abs(n) < 1e-12) return '0';
  const rounded = Math.round(n);
  if (Math.abs(n - rounded) < 1e-10) return String(rounded);
  return parseFloat(n.toPrecision(digits)).toString();
}

function fmtComplex(c: ComplexRoot): string {
  const re = Math.abs(c.re) < 1e-10 ? 0 : c.re;
  const im = Math.abs(c.im) < 1e-10 ? 0 : c.im;
  if (im === 0) return fmtNum(re);
  if (re === 0) {
    if (im === 1) return 'i';
    if (im === -1) return '-i';
    return `${fmtNum(im)}i`;
  }
  const sign = im < 0 ? '-' : '+';
  const imAbs = Math.abs(im);
  const imPart = imAbs === 1 ? 'i' : `${fmtNum(imAbs)}i`;
  return `${fmtNum(re)} ${sign} ${imPart}`;
}

function fmtComplexLatex(c: ComplexRoot): string {
  const text = fmtComplex(c);
  if (text === 'i') return 'i';
  if (text === '-i') return '-i';
  if (text.includes('i')) {
    // mixed or pure imaginary
    if (text.includes(' + ')) {
      const [re, im] = text.split(' + ');
      return `${re} + ${im}`;
    }
    if (text.includes(' - ')) {
      const idx = text.indexOf(' - ');
      const re = text.slice(0, idx);
      const im = text.slice(idx + 3);
      return `${re} - ${im}`;
    }
    return text; // pure imaginary like "2i"
  }
  return text;
}

/* ------------------------------------------------------------------ *
 * Equation solving
 * ------------------------------------------------------------------ */

/** Try to parse the equation as a polynomial; if successful, return coefficients
 *  in ascending order (a0 + a1 x + a2 x^2 + ...). Returns null if not polynomial. */
function tryGetPolyCoeffs(equation: string, varName: string): number[] | null {
  try {
    // Move lhs - rhs
    let expr = equation;
    if (equation.includes('=')) {
      const eqIdx = equation.indexOf('=');
      const lhs = equation.slice(0, eqIdx).trim();
      const rhs = equation.slice(eqIdx + 1).trim();
      expr = `(${lhs}) - (${rhs})`;
    }
    const r = math.rationalize(expr, {}, true) as {
      coefficients?: number[];
      variables?: string[];
    };
    if (r.coefficients && r.variables && r.variables.length === 1 && r.variables[0] === varName) {
      return r.coefficients;
    }
    return null;
  } catch {
    return null;
  }
}

/** Normalize a mathjs-style equation string for Algebrite consumption.
 *  Handles `=` sign (lhs - rhs) and Algebrite syntax differences:
 *    - `e^x` → `exp(x)` (Algebrite's exp function)
 *    - `ln(x)` → `log(x)` (Algebrite's natural log is `log`) */
function normalizeForAlgebrite(equation: string): string {
  let expr = equation.trim();
  if (expr.includes('=')) {
    const eqIdx = expr.indexOf('=');
    const lhs = expr.slice(0, eqIdx).trim();
    const rhs = expr.slice(eqIdx + 1).trim();
    expr = `(${lhs}) - (${rhs})`;
  }
  // Convert e^x → exp(x) when e is used as base
  expr = expr.replace(/\be\^(\([^)]+\)|[a-zA-Z0-9_]+)/g, 'exp($1)');
  // Convert ln( → log(
  expr = expr.replace(/\bln\(/g, 'log(');
  return expr;
}

/** Find all roots (real + complex) of a polynomial via Durand-Kerner method. */
function polyRoots(coeffs: number[]): ComplexRoot[] {
  // Strip leading zeros (high-order)
  let c = [...coeffs];
  while (c.length > 1 && Math.abs(c[c.length - 1]) < 1e-14) c.pop();
  const n = c.length - 1;
  if (n <= 0) return [];

  if (n === 1) {
    return [{ re: -c[0] / c[1], im: 0 }];
  }

  if (n === 2) {
    const [a0, a1, a2] = c;
    const disc = a1 * a1 - 4 * a2 * a0;
    if (disc >= 0) {
      const s = Math.sqrt(disc);
      return [
        { re: (-a1 + s) / (2 * a2), im: 0 },
        { re: (-a1 - s) / (2 * a2), im: 0 },
      ];
    }
    const s = Math.sqrt(-disc);
    return [
      { re: -a1 / (2 * a2), im: s / (2 * a2) },
      { re: -a1 / (2 * a2), im: -s / (2 * a2) },
    ];
  }

  // Durand-Kerner: roots = initial guesses on a circle, iterate.
  // Normalize so leading coefficient = 1.
  const lead = c[n];
  const a = c.map((v) => v / lead);
  // Initial guesses: complex circle
  const r0 = Math.pow(Math.abs(a[0]) + 1, 1 / n);

  // Build initial guesses, optionally with random perturbation to escape
  // divergence or stagnation when the default seed happens to be unlucky.
  const initGuesses = (perturb: boolean): ComplexRoot[] => {
    const guesses: ComplexRoot[] = [];
    for (let k = 0; k < n; k++) {
      const baseAngle = (2 * Math.PI * k) / n + 0.4;
      const angle = perturb ? baseAngle + (Math.random() - 0.5) * 0.5 : baseAngle;
      const radius = perturb ? r0 * (0.8 + Math.random() * 0.4) : r0;
      guesses.push({ re: radius * Math.cos(angle), im: radius * Math.sin(angle) });
    }
    return guesses;
  };

  let roots: ComplexRoot[] = initGuesses(false);
  const polyEval = (z: ComplexRoot): ComplexRoot => {
    // Horner's method with complex arithmetic
    let acc: ComplexRoot = { re: 0, im: 0 };
    for (let i = a.length - 1; i >= 0; i--) {
      // acc = acc * z + a[i]
      const re = acc.re * z.re - acc.im * z.im + a[i];
      const im = acc.re * z.im + acc.im * z.re;
      acc = { re, im };
    }
    return acc;
  };
  const complexSub = (x: ComplexRoot, y: ComplexRoot): ComplexRoot => ({
    re: x.re - y.re,
    im: x.im - y.im,
  });
  const complexMul = (x: ComplexRoot, y: ComplexRoot): ComplexRoot => ({
    re: x.re * y.re - x.im * y.im,
    im: x.re * y.im + x.im * y.re,
  });
  const complexDiv = (x: ComplexRoot, y: ComplexRoot): ComplexRoot => {
    const d = y.re * y.re + y.im * y.im;
    if (d < 1e-30) return { re: 0, im: 0 };
    return { re: (x.re * y.re + x.im * y.im) / d, im: (x.im * y.re - x.re * y.im) / d };
  };
  const complexAbs = (z: ComplexRoot): number => Math.sqrt(z.re * z.re + z.im * z.im);

  // Iteration loop: max 500 iterations (>= 200 requirement).
  // Re-initialize guesses with perturbation every 100 iterations if not
  // converged, and also whenever divergence is detected (roots blowing up).
  const MAX_ITER = 500;
  for (let iter = 0; iter < MAX_ITER; iter++) {
    // Re-initialize with perturbed guesses after every 100 stagnant iterations
    if (iter > 0 && iter % 100 === 0) {
      roots = initGuesses(true);
    }
    let maxChange = 0;
    let diverging = false;
    const newRoots: ComplexRoot[] = [];
    for (let i = 0; i < n; i++) {
      const num = polyEval(roots[i]);
      let den: ComplexRoot = { re: 1, im: 0 };
      for (let j = 0; j < n; j++) {
        if (j !== i) den = complexMul(den, complexSub(roots[i], roots[j]));
      }
      const delta = complexDiv(num, den);
      const newR = complexSub(roots[i], delta);
      newRoots.push(newR);
      const change = complexAbs(delta);
      if (!Number.isFinite(change) || change > 1e15) {
        diverging = true;
      }
      maxChange = Math.max(maxChange, change);
    }
    roots = newRoots;
    // Divergence detected: re-seed with perturbed guesses and continue
    if (diverging) {
      roots = initGuesses(true);
      continue;
    }
    // Convergence: stop when root differences fall below 1e-10
    if (maxChange < 1e-10) break;
  }

  // Clean up: snap near-real roots to real
  return roots.map((r) => ({
    re: Math.abs(r.im) < 1e-9 * (1 + Math.abs(r.re)) ? r.re : r.re,
    im: Math.abs(r.im) < 1e-9 * (1 + Math.abs(r.re)) ? 0 : r.im,
  }));
}

/** Find numeric real roots of f(varName) in [a, b] via sign-change + bisection. */
function findRealRoots(
  fn: (x: number) => number,
  a: number,
  b: number,
  step = 0.05,
): number[] {
  const roots: number[] = [];
  let prev = fn(a);
  for (let x = a + step; x <= b; x += step) {
    const cur = fn(x);
    if (Number.isFinite(prev) && Number.isFinite(cur)) {
      if ((prev < 0 && cur > 0) || (prev > 0 && cur < 0)) {
        // Bisect
        let lo = x - step;
        let hi = x;
        for (let i = 0; i < 80; i++) {
          const mid = (lo + hi) / 2;
          const fm = fn(mid);
          if (!Number.isFinite(fm)) break;
          if (Math.abs(fm) < 1e-12) {
            lo = mid;
            hi = mid;
            break;
          }
          if (Math.sign(fm) === Math.sign(fn(lo))) lo = mid;
          else hi = mid;
        }
        const r = (lo + hi) / 2;
        if (!roots.some((q) => Math.abs(q - r) < 1e-5)) roots.push(r);
      }
    }
    prev = cur;
  }
  return roots;
}

/* ================================================================== *
 * Section 1 — Equation Solving
 * ================================================================== */

const EQUATION_EXAMPLES = [
  { label: 'x² − 5x + 6 = 0', expr: 'x^2 - 5*x + 6 = 0' },
  { label: 'x³ − 6x² + 11x − 6 = 0', expr: 'x^3 - 6*x^2 + 11*x - 6 = 0' },
  { label: '2x + 3 = 7', expr: '2*x + 3 = 7' },
  { label: 'sin(x) = 0.5', expr: 'sin(x) = 0.5' },
  { label: 'x² + 1 = 0', expr: 'x^2 + 1 = 0' },
  { label: 'e^x = 2', expr: 'exp(x) = 2' },
];

function EquationSolverSection() {
  const [equation, setEquation] = useState('x^2 - 5*x + 6 = 0');
  const [varName, setVarName] = useState('x');
  const [rangeA, setRangeA] = useState(-10);
  const [rangeB, setRangeB] = useState(10);
  const [result, setResult] = useState<EqResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [solveMode, setSolveMode] = useState<'numeric' | 'symbolic'>('numeric');

  const handleSolve = async () => {
    setWorking(true);
    setError(null);
    setResult(null);
    try {
      if (!equation.trim()) {
        setError(t('solverEnterEquation'));
        return;
      }

      // Try polynomial first
      const coeffs = tryGetPolyCoeffs(equation, varName);
      const isPoly = coeffs && coeffs.length > 1;

      // Symbolic mode: try Algebrite for polynomial equations.
      // Algebrite's `roots` only handles polynomials; for transcendental
      // equations we skip symbolic and fall straight through to numeric.
      if (solveMode === 'symbolic' && isPoly) {
        try {
          const Algebrite = (await import('algebrite')).default;
          const polyExpr = normalizeForAlgebrite(equation);
          const symbolicExpression = Algebrite.run(`roots(${polyExpr}, ${varName})`);
          const symbolicLatex = Algebrite.run(`printlatex(roots(${polyExpr}, ${varName}))`);

          if (symbolicExpression && symbolicExpression.trim() !== '' && symbolicExpression !== 'nil') {
            // Also compute numeric roots for side-by-side comparison
            const roots = polyRoots(coeffs);
            const realRoots = roots.filter((r) => Math.abs(r.im) < 1e-9);
            const complexRoots = roots.filter((r) => Math.abs(r.im) >= 1e-9);

            const polyLatex = coeffsToLatex(coeffs, varName);
            setResult({
              latex: `${polyLatex} = 0`,
              roots,
              kind: 'symbolic',
              info: `符号解 · ${realRoots.length} 实根, ${complexRoots.length} 复根, 次数 ${coeffs.length - 1}`,
              symbolicLatex: symbolicLatex || symbolicExpression,
              symbolicExpression,
            });
            return;
          }
          // Algebrite returned nil/empty → fall back to numeric
          toast.warning('Algebrite 未返回有效符号解，已回退到数值解');
        } catch {
          // Algebrite threw → fall back to numeric
          toast.warning('符号解失败，已回退到数值解');
        }
      } else if (solveMode === 'symbolic' && !isPoly) {
        toast.warning('符号解仅支持多项式方程，已回退到数值解');
      }

      // Numeric mode (or symbolic fallback)
      if (isPoly) {
        const roots = polyRoots(coeffs);
        const realRoots = roots.filter((r) => Math.abs(r.im) < 1e-9);
        const complexRoots = roots.filter((r) => Math.abs(r.im) >= 1e-9);

        const parts: string[] = [];
        const rootLatex = roots
          .map((r, i) => `${varName}_{${i + 1}} = ${fmtComplexLatex(r)}`)
          .join(', \\quad ');

        const polyLatex = coeffsToLatex(coeffs, varName);
        parts.push(`\\text{多项式: } ${polyLatex} = 0`);
        parts.push(`\\text{次数: } ${coeffs.length - 1}`);
        if (realRoots.length > 0) {
          parts.push(`\\text{实根 (${realRoots.length}): } ${realRoots.map((r) => fmtComplexLatex(r)).join(', ')}`);
        }
        if (complexRoots.length > 0) {
          parts.push(`\\text{复根 (${complexRoots.length}): } ${complexRoots.map((r) => fmtComplexLatex(r)).join(', ')}`);
        }
        const latex = `${rootLatex} \\\\[8pt] \\text{次数: } ${coeffs.length - 1}`;
        setResult({
          latex,
          roots,
          kind: 'polynomial',
          info: `${realRoots.length} 实根, ${complexRoots.length} 复根, 次数 ${coeffs.length - 1}`,
          symbolicFallback: solveMode === 'symbolic',
        });
        return;
      }

      // Transcendental: numeric root finding in the specified range
      let expr = equation;
      if (equation.includes('=')) {
        const eqIdx = equation.indexOf('=');
        const lhs = equation.slice(0, eqIdx).trim();
        const rhs = equation.slice(eqIdx + 1).trim();
        expr = `(${lhs}) - (${rhs})`;
      }
      const node = math.parse(expr);
      const fn = (x: number) => {
        try {
          const v = node.evaluate({ [varName]: x });
          return typeof v === 'number' ? v : NaN;
        } catch {
          return NaN;
        }
      };
      const realRoots = findRealRoots(fn, rangeA, rangeB, (rangeB - rangeA) / 400);

      if (realRoots.length === 0) {
        setResult({
          latex: `\\text{在 } [${fmtNum(rangeA)}, ${fmtNum(rangeB)}] \\text{ 内未找到实根}`,
          roots: [],
          kind: 'none',
          info: `范围 [${rangeA}, ${rangeB}]`,
          symbolicFallback: solveMode === 'symbolic',
        });
        return;
      }

      const rootLatex = realRoots
        .map((r, i) => `${varName}_{${i + 1}} = ${fmtNum(r)}`)
        .join(', \\quad ');
      setResult({
        latex: rootLatex,
        roots: realRoots.map((r) => ({ re: r, im: 0 })),
        kind: 'transcendental',
        info: `数值解 (在 [${fmtNum(rangeA)}, ${fmtNum(rangeB)}] 内找到 ${realRoots.length} 个根)`,
        symbolicFallback: solveMode === 'symbolic',
      });
    } catch (err) {
      setError((err as Error).message || t('solverError'));
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

      {/* Examples */}
      <div>
        <div className="text-[10.5px] text-muted-foreground mb-1">{t('solverExamples')}</div>
        <div className="flex flex-wrap gap-1">
          {EQUATION_EXAMPLES.map((ex) => (
            <button
              key={ex.expr}
              type="button"
              onClick={() => setEquation(ex.expr)}
              className="h-5 px-2 text-[10px] font-mono rounded-full border border-border/60 bg-muted/30 hover:border-primary/40 hover:text-primary hover:bg-primary/5 transition-colors"
            >
              {ex.label}
            </button>
          ))}
        </div>
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
        </>
      ) : null} />
    </div>
  );
}

function coeffsToLatex(coeffs: number[], varName: string): string {
  // ascending: a0 + a1*x + a2*x^2 + ...
  const terms: string[] = [];
  for (let i = coeffs.length - 1; i >= 0; i--) {
    const c = coeffs[i];
    if (Math.abs(c) < 1e-14) continue;
    const absC = Math.abs(c);
    const sign = c < 0 ? '-' : '+';
    let term = '';
    if (i === 0) term = fmtNum(absC);
    else if (i === 1) term = absC === 1 ? `${varName}` : `${fmtNum(absC)} ${varName}`;
    else term = absC === 1 ? `${varName}^{${i}}` : `${fmtNum(absC)} ${varName}^{${i}}`;
    if (terms.length === 0) {
      terms.push(c < 0 ? `-${term}` : term);
    } else {
      terms.push(`${sign} ${term}`);
    }
  }
  return terms.length === 0 ? '0' : terms.join(' ');
}

/* ================================================================== *
 * Section 2 — System of Equations
 * ================================================================== */

const SYSTEM_EXAMPLES = [
  { label: '2×2 线性', text: 'x + y = 5\nx - y = 1' },
  { label: '3×3 线性', text: 'x + y + z = 6\n2y + 5z = -4\n2x + 5y - z = 27' },
];

function SystemSolverSection() {
  const [text, setText] = useState('x + y = 5\nx - y = 1');
  const [result, setResult] = useState<SystemResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const handleSolve = () => {
    setWorking(true);
    setError(null);
    setResult(null);
    try {
      const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
      if (lines.length === 0) {
        setError(t('solverEnterEquation'));
        return;
      }

      // Parse each equation: collect variable names and coefficients
      const allVars = new Set<string>();
      const rows: { coeffs: Record<string, number>; rhs: number }[] = [];
      for (const line of lines) {
        const eqIdx = line.indexOf('=');
        if (eqIdx === -1) {
          setError(t('solverSystemParseFail') + `: ${line}`);
          return;
        }
        const lhs = line.slice(0, eqIdx).trim();
        const rhsStr = line.slice(eqIdx + 1).trim();
        let rhs: number;
        try {
          rhs = Number(math.evaluate(rhsStr, {}));
        } catch {
          setError(t('solverSystemParseFail') + `: ${line}`);
          return;
        }
        const coeffs = parseLinearCoeffs(lhs);
        if (!coeffs) {
          setError(t('solverSystemParseFail') + `: ${line}`);
          return;
        }
        for (const v of Object.keys(coeffs)) allVars.add(v);
        rows.push({ coeffs, rhs });
      }

      const varList = Array.from(allVars).sort();
      const A: number[][] = rows.map((r) => varList.map((v) => r.coeffs[v] ?? 0));
      const b: number[] = rows.map((r) => r.rhs);

      // Solve
      try {
        const x = math.lusolve(math.matrix(A), b);
        const arr = (x as unknown as { toArray: () => unknown[] }).toArray() as number[][];
        const flat: number[] = arr.map((row) => (Array.isArray(row) ? Number(row[0]) : Number(row)));

        // Check residual to determine if there's a unique solution
        const residual = A.reduce((sum, row, i) => {
          let val = -b[i];
          for (let j = 0; j < row.length; j++) val += row[j] * flat[j];
          return sum + Math.abs(val);
        }, 0);

        if (!Number.isFinite(residual) || residual > 1e-6) {
          setResult({
            latex: '\\text{方程组可能无解或有无穷多解}',
            vector: [],
            variables: varList,
            kind: 'none',
            error: 'singular or inconsistent',
          });
          return;
        }

        const parts = flat.map((v, i) => `${varList[i]} = ${fmtNum(v)}`);
        const latex = parts.join(', \\quad ');
        setResult({
          latex,
          vector: flat,
          variables: varList,
          kind: 'unique',
        });
      } catch (err) {
        // lusolve throws on singular
        const msg = (err as Error).message || '';
        if (msg.toLowerCase().includes('singular') || msg.toLowerCase().includes('rank')) {
          setResult({
            latex: '\\text{方程组无解或有无穷多解 (系数矩阵奇异)}',
            vector: [],
            variables: varList,
            kind: 'infinite',
            error: msg,
          });
        } else {
          setError(msg);
        }
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
        <div className="flex flex-wrap gap-1">
          {SYSTEM_EXAMPLES.map((ex) => (
            <button
              key={ex.label}
              type="button"
              onClick={() => setText(ex.text)}
              className="h-5 px-2 text-[10px] rounded-full border border-border/60 bg-muted/30 hover:border-primary/40 hover:text-primary hover:bg-primary/5 transition-colors"
            >
              {ex.label}
            </button>
          ))}
        </div>
      </div>

      <ResultBlock error={error} result={result ? (
        <>
          {result.kind === 'unique' && (
            <div className="overflow-x-auto">
              <FormulaRenderer latex={result.latex} displayMode />
            </div>
          )}
          {result.kind === 'none' && (
            <div className="text-[11.5px] text-rose-600 dark:text-rose-300">
              {t('solverNoSolution')}
            </div>
          )}
          {result.kind === 'infinite' && (
            <div className="text-[11.5px] text-amber-600 dark:text-amber-300">
              {t('solverMultipleSolutions')}
              <div className="mt-1 overflow-x-auto">
                <FormulaRenderer latex={result.latex} displayMode />
              </div>
            </div>
          )}
          {result.variables.length > 0 && result.kind === 'unique' && (
            <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-1">
              {result.variables.map((v, i) => (
                <div
                  key={v}
                  className="rounded border border-emerald-500/30 bg-emerald-500/5 px-2 py-1 text-[11px] font-mono text-emerald-700 dark:text-emerald-300"
                >
                  {v} = {fmtNum(result.vector[i] ?? 0)}
                </div>
              ))}
            </div>
          )}
        </>
      ) : null} />
    </div>
  );
}

/** Parse a linear LHS like "2x + 3y - z" into { x: 2, y: 3, z: -1 }.
 * Returns null if non-linear (contains x*y, x^2, sin(x), etc). */
function parseLinearCoeffs(lhs: string): Record<string, number> | null {
  // Try mathjs: parse, walk for symbol nodes — each term must be linear.
  try {
    const node = math.parse(lhs);
    const coeffs: Record<string, number> = {};

    // We expand to a sum of monomials and check each is a constant or k*var.
    const terms = expandToMonomials(node);
    if (!terms) return null;

    for (const term of terms) {
      // term: { coef: number, vars: string[] }
      if (term.vars.length > 1) return null; // non-linear
      if (term.vars.length === 0) {
        // constant term — but linear equations shouldn't have constants on LHS
        // (they should be on RHS); however, mathematically we can fold into rhs=0 effect
        // We'll treat the LHS as Ax + By + C = rhs → C subtracted from rhs.
        // For simplicity, store as __const
        coeffs['__const'] = (coeffs['__const'] ?? 0) + term.coef;
      } else {
        const v = term.vars[0];
        coeffs[v] = (coeffs[v] ?? 0) + term.coef;
      }
    }
    return coeffs;
  } catch {
    return null;
  }
}

interface Monomial {
  coef: number;
  vars: string[];
}

/** Expand a mathjs node to a list of monomials. Returns null if non-polynomial. */
function expandToMonomials(node: unknown): Monomial[] | null {
  const n = node as {
    type?: string;
    isOperatorNode?: boolean;
    op?: string;
    args?: unknown[];
    isConstantNode?: boolean;
    value?: unknown;
    isSymbolNode?: boolean;
    name?: string;
    isFunctionNode?: boolean;
    fn?: { name?: string };
    content?: unknown;
  };
  if (!n) return null;

  // Constant
  if (n.isConstantNode || n.type === 'ConstantNode') {
    return [{ coef: Number(n.value), vars: [] }];
  }

  // Symbol
  if (n.isSymbolNode || n.type === 'SymbolNode') {
    return [{ coef: 1, vars: [n.name as string] }];
  }

  // Parentheses
  if (n.type === 'ParenthesisNode') {
    return expandToMonomials(n.content);
  }

  // Operator
  if (n.isOperatorNode || n.type === 'OperatorNode') {
    const args = n.args ?? [];
    if (n.op === '+') {
      const a = expandToMonomials(args[0]);
      const b = expandToMonomials(args[1]);
      if (!a || !b) return null;
      return [...a, ...b];
    }
    if (n.op === '-') {
      if (args.length === 1) {
        const a = expandToMonomials(args[0]);
        if (!a) return null;
        return a.map((m) => ({ ...m, coef: -m.coef }));
      }
      const a = expandToMonomials(args[0]);
      const b = expandToMonomials(args[1]);
      if (!a || !b) return null;
      return [...a, ...b.map((m) => ({ ...m, coef: -m.coef }))];
    }
    if (n.op === '*') {
      const a = expandToMonomials(args[0]);
      const b = expandToMonomials(args[1]);
      if (!a || !b) return null;
      const out: Monomial[] = [];
      for (const ma of a) {
        for (const mb of b) {
          out.push({
            coef: ma.coef * mb.coef,
            vars: [...ma.vars, ...mb.vars].sort(),
          });
        }
      }
      return out;
    }
    if (n.op === '/') {
      // Only constant denominator allowed
      const a = expandToMonomials(args[0]);
      const b = expandToMonomials(args[1]);
      if (!a || !b) return null;
      if (b.length !== 1 || b[0].vars.length > 0) return null;
      const denom = b[0].coef;
      if (Math.abs(denom) < 1e-14) return null;
      return a.map((m) => ({ ...m, coef: m.coef / denom }));
    }
    if (n.op === '^') {
      // Only allow integer powers
      const a = expandToMonomials(args[0]);
      const b = expandToMonomials(args[1]);
      if (!a || !b) return null;
      if (a.length !== 1 || b.length !== 1 || b[0].vars.length > 0) return null;
      const base = a[0];
      const exp = b[0].coef;
      if (!Number.isInteger(exp) || exp < 0 || exp > 10) return null;
      if (base.vars.length === 0) {
        return [{ coef: Math.pow(base.coef, exp), vars: [] }];
      }
      // (k*v)^n = k^n * v^n — but for linear we only allow n=1
      if (exp !== 1) return null;
      return [base];
    }
    return null;
  }

  // Unary minus node (sometimes wrapped)
  if (n.type === 'UnaryNode') {
    const a = expandToMonomials(n.args?.[0]);
    if (!a) return null;
    return a.map((m) => ({ ...m, coef: -m.coef }));
  }

  // Function node — non-polynomial
  return null;
}

/* ================================================================== *
 * Section 3 — Calculus
 * ================================================================== */

const CALC_EXAMPLES = {
  deriv: ['x^3 + 2*x^2', 'sin(x)*cos(x)', 'e^x * ln(x)', '1 / (1 + x^2)'],
  integral: ['x^2', 'sin(x)', 'e^x', '1 / x'],
  limit: ['sin(x)/x', '(1 + x)^(1/x)', '(e^x - 1) / x', '1/x'],
  taylor: ['sin(x)', 'cos(x)', 'e^x', 'ln(1 + x)'],
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

  const handleCompute = () => {
    setWorking(true);
    setError(null);
    setResult(null);
    try {
      // Use the engine's evaluateExpression for proper integration with engine scope
      const engineResult = computeCalculus(mode, expr, varName, { lower, upper, point, order });
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

      {/* Examples */}
      <div>
        <div className="text-[10.5px] text-muted-foreground mb-1">{t('solverExamples')}</div>
        <div className="flex flex-wrap gap-1">
          {CALC_EXAMPLES[mode].map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => setExpr(ex)}
              className="h-5 px-2 text-[10px] font-mono rounded-full border border-border/60 bg-muted/30 hover:border-primary/40 hover:text-primary hover:bg-primary/5 transition-colors"
            >
              {ex}
            </button>
          ))}
        </div>
      </div>

      <ResultBlock error={error} result={result ? (
        <div className="space-y-2">
          <div className="overflow-x-auto">
            <FormulaRenderer latex={result.latex} displayMode />
          </div>
          {result.steps && result.steps.length > 0 && (
            <details className="group">
              <summary className="cursor-pointer text-[10.5px] text-muted-foreground hover:text-foreground select-none">
                {t('solverSteps')} ({result.steps.length})
              </summary>
              <div className="mt-1.5 space-y-1 overflow-x-auto">
                {result.steps.map((s, i) => (
                  <div key={i} className="text-[11px] text-foreground/80">
                    <FormulaRenderer latex={s} displayMode />
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      ) : null} />
    </div>
  );
}

function computeCalculus(
  mode: 'deriv' | 'integral' | 'limit' | 'taylor',
  expr: string,
  varName: string,
  opts: { lower: number; upper: number; point: number; order: number },
): CalcResult {
  try {
    if (mode === 'deriv') {
      const res = evaluateExpression(`derivative(${expr}, ${varName})`, 'matlab');
      if (!res.success) return { latex: '', error: res.error };
      return {
        latex: `\\frac{d}{d${varName}} \\left[ ${expr} \\right] = ${res.latex}`,
        steps: res.steps,
      };
    }
    if (mode === 'integral') {
      const res = evaluateExpression(
        `integrate(${expr}, ${varName}, ${opts.lower}, ${opts.upper})`,
        'matlab',
      );
      if (!res.success) return { latex: '', error: res.error };
      return {
        latex: `\\int_{${opts.lower}}^{${opts.upper}} ${expr} \\, d${varName} = ${res.latex}`,
        steps: res.steps,
      };
    }
    if (mode === 'limit') {
      const res = evaluateExpression(`limit(${expr}, ${varName}, ${opts.point})`, 'matlab');
      if (!res.success) return { latex: '', error: res.error };
      const ptStr = Number.isFinite(opts.point) ? String(opts.point) : '\\infty';
      return {
        latex: `\\lim_{${varName} \\to ${ptStr}} ${expr} = ${res.latex}`,
        steps: res.steps,
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
