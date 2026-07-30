'use client';

/**
 * OmniMath Pro — Statistics Panel (Task 2 — P3)
 *
 * 概率统计模块，3 个子 Tab：
 *   1. 描述统计  — mean/median/std/var/min/max/quantile/skewness/kurtosis
 *   2. 概率分布  — 正态/泊松/二项/指数/均匀 的 PDF/CDF/分位数/随机数
 *   3. 假设检验  — 单样本 t 检验 / 卡方拟合优度检验
 *
 * 概率密度曲线可一键发送到 2D 绘图（调用 workbench store 的 addPlot）。
 * 暗色玻璃质感 + teal 主色调。
 */

import { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BarChart3,
  Sigma,
  FlaskConical,
  Send,
  X,
  Calculator,
  Dices,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { FormulaRenderer } from '@/components/workbench/FormulaRenderer';
import { useWorkbenchStore } from '@/lib/store/workbench';
import { math } from '@/lib/engine/mathInstance';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

/* ================================================================== *
 * Statistical helper functions
 * ================================================================== */

/** Lanczos approximation for log-gamma. */
function logGamma(x: number): number {
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (x < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  }
  x -= 1;
  let a = c[0];
  const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) {
    a += c[i] / (x + i);
  }
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/** Continued fraction for incomplete beta. */
function betacf(a: number, b: number, x: number): number {
  const MAXIT = 200;
  const EPS = 3e-12;
  const FPMIN = 1e-30;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let cv = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    cv = 1 + aa / cv;
    if (Math.abs(cv) < FPMIN) cv = FPMIN;
    d = 1 / d;
    h *= d * cv;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    cv = 1 + aa / cv;
    if (Math.abs(cv) < FPMIN) cv = FPMIN;
    d = 1 / d;
    const del = d * cv;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

/** Regularized incomplete beta function I_x(a, b). */
function incompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const lbeta = logGamma(a + b) - logGamma(a) - logGamma(b);
  const bt = Math.exp(lbeta + a * Math.log(x) + b * Math.log(1 - x));
  if (x < (a + 1) / (a + b + 2)) {
    return (bt * betacf(a, b, x)) / a;
  }
  return 1 - (bt * betacf(b, a, 1 - x)) / b;
}

/** Series expansion for lower incomplete gamma P(a, x). */
function gammp(a: number, x: number): number {
  if (x < 0 || a <= 0) return 0;
  if (x < a + 1) {
    // Series
    const gln = logGamma(a);
    let ap = a;
    let sum = 1 / a;
    const del = sum;
    let s = del;
    for (let n = 0; n < 200; n++) {
      ap += 1;
      const d = (sum * x) / ap;
      s += d;
      if (Math.abs(d) < Math.abs(s) * 3e-12) break;
      sum = d;
    }
    return s * Math.exp(-x + a * Math.log(x) - gln);
  }
  // Continued fraction
  const gln = logGamma(a);
  let b = x + 1 - a;
  let c = 1 / 1e-30;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i <= 200; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = b + an / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 3e-12) break;
  }
  return 1 - Math.exp(-x + a * Math.log(x) - gln) * h;
}

/** t-distribution two-tailed p-value. */
function tPValueTwoTailed(t: number, df: number): number {
  if (df <= 0) return NaN;
  const x = df / (df + t * t);
  const ib = incompleteBeta(x, df / 2, 0.5);
  return Math.min(1, Math.max(0, ib));
}

/** Chi-square upper-tail p-value (1 - CDF). */
function chiSquarePValue(chi2: number, df: number): number {
  if (df <= 0 || chi2 < 0) return NaN;
  return 1 - gammp(df / 2, chi2 / 2);
}

/** Parse comma/space/newline separated numbers. */
function parseData(text: string): number[] {
  return text
    .split(/[\s,;\t\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => parseFloat(s))
    .filter((n) => Number.isFinite(n));
}

function fmt(v: number, digits = 6): string {
  if (!Number.isFinite(v)) return String(v);
  const r = Math.round(v);
  if (Math.abs(v - r) < 1e-10) return String(r);
  return parseFloat(v.toPrecision(digits)).toString();
}

/* ================================================================== *
 * Distribution definitions
 * ================================================================== */
type DistType = 'normal' | 'poisson' | 'binomial' | 'exponential' | 'uniform';

interface DistParam {
  key: string;
  label: string;
  default: number;
  step?: number;
  min?: number;
  max?: number;
}

const DIST_PARAMS: Record<DistType, DistParam[]> = {
  normal: [
    { key: 'mu', label: 'μ (均值)', default: 0 },
    { key: 'sigma', label: 'σ (标准差)', default: 1, min: 0.0001 },
  ],
  poisson: [{ key: 'lambda', label: 'λ (速率)', default: 3, min: 0.0001 }],
  binomial: [
    { key: 'n', label: 'n (试验次数)', default: 10, step: 1, min: 1 },
    { key: 'p', label: 'p (成功概率)', default: 0.5, min: 0, max: 1 },
  ],
  exponential: [{ key: 'lambda', label: 'λ (速率)', default: 1, min: 0.0001 }],
  uniform: [
    { key: 'a', label: 'a (下界)', default: 0 },
    { key: 'b', label: 'b (上界)', default: 1 },
  ],
};

/* ================================================================== *
 * MAIN COMPONENT
 * ================================================================== */
export function StatisticsPanel() {
  return (
    <div className="h-full flex flex-col bg-card/20">
      <Tabs defaultValue="descriptive" className="flex-1 flex flex-col min-h-0 gap-0">
        <div className="shrink-0 px-2 pt-2 pb-1 border-b border-border/40 bg-background/30">
          <TabsList className="grid grid-cols-3 w-full h-8 text-[11px]">
            <TabsTrigger value="descriptive" className="text-[11px] gap-1">
              <Sigma className="size-3.5" />
              描述统计
            </TabsTrigger>
            <TabsTrigger value="distribution" className="text-[11px] gap-1">
              <BarChart3 className="size-3.5" />
              概率分布
            </TabsTrigger>
            <TabsTrigger value="hypothesis" className="text-[11px] gap-1">
              <FlaskConical className="size-3.5" />
              假设检验
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="descriptive" className="flex-1 min-h-0 overflow-auto mt-0">
          <DescriptiveStatsTab />
        </TabsContent>
        <TabsContent value="distribution" className="flex-1 min-h-0 overflow-auto mt-0">
          <DistributionTab />
        </TabsContent>
        <TabsContent value="hypothesis" className="flex-1 min-h-0 overflow-auto mt-0">
          <HypothesisTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ================================================================== *
 * TAB 1 — Descriptive Statistics
 * ================================================================== */
interface DescResult {
  count: number;
  mean: number;
  median: number;
  std: number;
  var: number;
  min: number;
  max: number;
  range: number;
  q1: number;
  q3: number;
  iqr: number;
  skewness: number;
  kurtosis: number;
  sum: number;
}

function computeDescriptive(data: number[]): DescResult | null {
  if (data.length === 0) return null;
  const n = data.length;
  const mean = math.mean(data) as number;
  const median = math.median(data) as number;
  const std = math.std(data) as unknown as number;
  const variance = math.variance(data) as unknown as number;
  const min = math.min(data) as number;
  const max = math.max(data) as number;
  const sum = math.sum(data) as number;
  const q1 = math.quantileSeq(data, 0.25) as number;
  const q3 = math.quantileSeq(data, 0.75) as number;

  // Skewness (Fisher–Pearson): m3 / m2^(3/2)
  // Kurtosis (excess): m4 / m2^2 - 3
  let m2 = 0, m3 = 0, m4 = 0;
  for (const x of data) {
    const d = x - mean;
    const d2 = d * d;
    m2 += d2;
    m3 += d2 * d;
    m4 += d2 * d2;
  }
  m2 /= n;
  m3 /= n;
  m4 /= n;
  const skewness = m2 > 0 ? m3 / Math.pow(m2, 1.5) : 0;
  const kurtosis = m2 > 0 ? m4 / (m2 * m2) - 3 : 0;

  return {
    count: n,
    mean,
    median,
    std,
    var: variance,
    min,
    max,
    range: max - min,
    q1,
    q3,
    iqr: q3 - q1,
    skewness,
    kurtosis,
    sum,
  };
}

function DescriptiveStatsTab() {
  const [input, setInput] = useState('1.2, 2.3, 3.1, 4.5, 2.8, 3.7, 5.1, 2.9, 3.4, 4.0');
  const data = useMemo(() => parseData(input), [input]);
  const result = useMemo(() => computeDescriptive(data), [data]);

  const stats: { label: string; value: number | undefined; latex?: string }[] = result
    ? [
        { label: '样本数 n', value: result.count },
        { label: '均值 x̄', value: result.mean, latex: `\\bar{x} = ${fmt(result.mean)}` },
        { label: '中位数', value: result.median },
        { label: '标准差 s', value: result.std, latex: `s = ${fmt(result.std)}` },
        { label: '方差 s²', value: result.var },
        { label: '最小值', value: result.min },
        { label: '最大值', value: result.max },
        { label: '极差', value: result.range },
        { label: 'Q1 (25%)', value: result.q1 },
        { label: 'Q3 (75%)', value: result.q3 },
        { label: 'IQR', value: result.iqr },
        { label: '偏度', value: result.skewness },
        { label: '峰度 (excess)', value: result.kurtosis },
        { label: '求和 Σx', value: result.sum },
      ]
    : [];

  return (
    <div className="p-3 space-y-3">
      <div>
        <label className="text-[11px] text-muted-foreground mb-1 block">
          数据（逗号/空格/换行分隔）
        </label>
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="例如: 1.2, 2.3, 3.1, 4.5"
          className="min-h-[60px] text-[12px] font-mono resize-y"
        />
      </div>

      <AnimatePresence mode="wait">
        {result ? (
          <motion.div
            key="result"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="rounded-lg border border-primary/30 bg-primary/5 p-3"
          >
            <div className="text-[11px] text-muted-foreground mb-2 flex items-center gap-1.5">
              <Calculator className="size-3" />
              统计结果 ({result.count} 个数据点)
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {stats.map((s) => (
                <div
                  key={s.label}
                  className="flex items-center justify-between rounded-md bg-muted/30 border border-border/40 px-2 py-1.5"
                >
                  <span className="text-[10.5px] text-muted-foreground">{s.label}</span>
                  <span className="text-[11.5px] font-mono font-semibold tabular-nums text-primary">
                    {fmt(s.value ?? 0)}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="rounded-lg border border-border/40 bg-muted/20 p-6 text-center text-[11.5px] text-muted-foreground"
          >
            请输入至少一个有效数字
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ================================================================== *
 * TAB 2 — Probability Distribution
 * ================================================================== */
function DistributionTab() {
  const addPlot = useWorkbenchStore((s) => s.addPlot);
  const [distType, setDistType] = useState<DistType>('normal');
  const params = DIST_PARAMS[distType];
  const [paramValues, setParamValues] = useState<Record<string, number>>(() => ({
    mu: 0,
    sigma: 1,
    lambda: 1,
    n: 10,
    p: 0.5,
    a: 0,
    b: 1,
  }));
  const [xValue, setXValue] = useState(1.96);
  const [pdfResult, setPdfResult] = useState<number | null>(null);
  const [cdfResult, setCdfResult] = useState<number | null>(null);
  const [randomNumbers, setRandomNumbers] = useState<number[]>([]);

  const handleDistChange = (v: string) => {
    setDistType(v as DistType);
    setPdfResult(null);
    setCdfResult(null);
    setRandomNumbers([]);
  };

  const getParam = (key: string) => paramValues[key] ?? 0;
  const setParam = (key: string, val: number) =>
    setParamValues((prev) => ({ ...prev, [key]: val }));

  const isDiscrete = distType === 'poisson' || distType === 'binomial';
  const pdfLabel = isDiscrete ? 'PMF P(X=k)' : 'PDF f(x)';
  const cdfLabel = 'CDF P(X≤x)';

  const computePdf = useCallback((): number => {
    const x = xValue;
    switch (distType) {
      case 'normal': {
        const mu = getParam('mu');
        const sigma = getParam('sigma');
        return (1 / (sigma * Math.sqrt(2 * Math.PI))) * Math.exp(-((x - mu) ** 2) / (2 * sigma ** 2));
      }
      case 'poisson': {
        const lambda = getParam('lambda');
        const k = Math.round(x);
        if (k < 0) return 0;
        return (Math.pow(lambda, k) * Math.exp(-lambda)) / math.factorial(k);
      }
      case 'binomial': {
        const n = Math.round(getParam('n'));
        const p = getParam('p');
        const k = Math.round(x);
        if (k < 0 || k > n) return 0;
        const c = math.combinations(n, k) as number;
        return c * Math.pow(p, k) * Math.pow(1 - p, n - k);
      }
      case 'exponential': {
        const lambda = getParam('lambda');
        return x < 0 ? 0 : lambda * Math.exp(-lambda * x);
      }
      case 'uniform': {
        const a = getParam('a');
        const b = getParam('b');
        return x >= a && x <= b ? 1 / (b - a) : 0;
      }
    }
   
  }, [distType, xValue, paramValues]);

  const computeCdf = useCallback((): number => {
    const x = xValue;
    switch (distType) {
      case 'normal': {
        const mu = getParam('mu');
        const sigma = getParam('sigma');
        const z = (x - mu) / (sigma * Math.SQRT2);
        return 0.5 * (1 + math.erf(z));
      }
      case 'poisson': {
        const lambda = getParam('lambda');
        const k = Math.floor(x);
        if (k < 0) return 0;
        let sum = 0;
        for (let i = 0; i <= k; i++) {
          sum += (Math.pow(lambda, i) * Math.exp(-lambda)) / math.factorial(i);
        }
        return sum;
      }
      case 'binomial': {
        const n = Math.round(getParam('n'));
        const p = getParam('p');
        const k = Math.floor(x);
        if (k < 0) return 0;
        if (k >= n) return 1;
        let sum = 0;
        for (let i = 0; i <= k; i++) {
          const c = math.combinations(n, i) as number;
          sum += c * Math.pow(p, i) * Math.pow(1 - p, n - i);
        }
        return sum;
      }
      case 'exponential': {
        const lambda = getParam('lambda');
        return x < 0 ? 0 : 1 - Math.exp(-lambda * x);
      }
      case 'uniform': {
        const a = getParam('a');
        const b = getParam('b');
        if (x < a) return 0;
        if (x > b) return 1;
        return (x - a) / (b - a);
      }
    }
   
  }, [distType, xValue, paramValues]);

  const handleCompute = () => {
    setPdfResult(computePdf());
    setCdfResult(computeCdf());
  };

  const generateRandom = () => {
    const count = 10;
    const nums: number[] = [];
    for (let i = 0; i < count; i++) {
      switch (distType) {
        case 'normal': {
          // Box-Muller
          const mu = getParam('mu');
          const sigma = getParam('sigma');
          const u1 = Math.random();
          const u2 = Math.random();
          const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
          nums.push(mu + sigma * z);
          break;
        }
        case 'poisson': {
          // Knuth
          const lambda = getParam('lambda');
          const L = Math.exp(-lambda);
          let k = 0;
          let pR = 1;
          do {
            k++;
            pR *= Math.random();
          } while (pR > L);
          nums.push(k - 1);
          break;
        }
        case 'binomial': {
          const n = Math.round(getParam('n'));
          const p = getParam('p');
          let successes = 0;
          for (let j = 0; j < n; j++) {
            if (Math.random() < p) successes++;
          }
          nums.push(successes);
          break;
        }
        case 'exponential': {
          const lambda = getParam('lambda');
          nums.push(-Math.log(Math.random()) / lambda);
          break;
        }
        case 'uniform': {
          const a = getParam('a');
          const b = getParam('b');
          nums.push(a + (b - a) * Math.random());
          break;
        }
      }
    }
    setRandomNumbers(nums);
  };

  const buildPlotExpression = (): string | null => {
    switch (distType) {
      case 'normal': {
        const mu = getParam('mu');
        const sigma = getParam('sigma');
        return `(1/(${fmt(sigma)}*sqrt(2*pi)))*exp(-(x-(${fmt(mu)}))^2/(2*${fmt(sigma)}^2))`;
      }
      case 'exponential': {
        const lambda = getParam('lambda');
        return `${fmt(lambda)}*exp(-${fmt(lambda)}*x)`;
      }
      case 'uniform': {
        const a = getParam('a');
        const b = getParam('b');
        return `(x>=${fmt(a)} and x<=${fmt(b)})*1/(${fmt(b)}-${fmt(a)})`;
      }
      default:
        return null; // discrete — not plottable as continuous curve
    }
  };

  const handleSendToPlot = () => {
    const expr = buildPlotExpression();
    if (!expr) {
      toast.warning('离散分布不支持发送 PDF 曲线');
      return;
    }
    let xMin: number, xMax: number;
    switch (distType) {
      case 'normal': {
        const mu = getParam('mu');
        const sigma = getParam('sigma');
        xMin = mu - 4 * sigma;
        xMax = mu + 4 * sigma;
        break;
      }
      case 'exponential': {
        xMin = 0;
        xMax = 5 / getParam('lambda');
        break;
      }
      case 'uniform': {
        xMin = getParam('a') - 1;
        xMax = getParam('b') + 1;
        break;
      }
      default:
        xMin = -5;
        xMax = 5;
    }
    addPlot({
      expression: expr,
      xRange: [xMin, xMax],
      yRange: [0, 1],
      color: '#2dd4bf',
      plotType: 'cartesian',
      visible: true,
      width: 2,
    });
    toast.success('已发送到 2D 绘图');
  };

  return (
    <div className="p-3 space-y-3">
      {/* Distribution selector */}
      <div>
        <label className="text-[11px] text-muted-foreground mb-1 block">分布类型</label>
        <Select value={distType} onValueChange={handleDistChange}>
          <SelectTrigger className="h-8 text-[12px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="normal" className="text-[12px]">正态分布 N(μ, σ²)</SelectItem>
            <SelectItem value="poisson" className="text-[12px]">泊松分布 Po(λ)</SelectItem>
            <SelectItem value="binomial" className="text-[12px]">二项分布 B(n, p)</SelectItem>
            <SelectItem value="exponential" className="text-[12px]">指数分布 Exp(λ)</SelectItem>
            <SelectItem value="uniform" className="text-[12px]">均匀分布 U(a, b)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Parameters */}
      {params.map((p) => (
        <div key={p.key}>
          <label className="text-[11px] text-muted-foreground mb-1 block">{p.label}</label>
          <Input
            type="number"
            value={getParam(p.key)}
            step={p.step ?? 'any'}
            min={p.min}
            max={p.max}
            onChange={(e) => setParam(p.key, parseFloat(e.target.value) || 0)}
            className="h-8 text-[12px] font-mono"
          />
        </div>
      ))}

      {/* x value */}
      <div>
        <label className="text-[11px] text-muted-foreground mb-1 block">
          x {isDiscrete ? '(取整数 k)' : ''}
        </label>
        <Input
          type="number"
          value={xValue}
          step="any"
          onChange={(e) => setXValue(parseFloat(e.target.value) || 0)}
          className="h-8 text-[12px] font-mono"
        />
      </div>

      <Button onClick={handleCompute} size="sm" className="w-full h-8 text-[12px] gap-1.5">
        <Calculator className="size-3.5" />
        计算
      </Button>

      {/* Results */}
      <AnimatePresence mode="wait">
        {pdfResult !== null && cdfResult !== null && (
          <motion.div
            key="res"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="space-y-2"
          >
            <div className="rounded-md border border-primary/30 bg-primary/5 p-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[10.5px] text-muted-foreground">{pdfLabel}</span>
                <span className="text-[12px] font-mono font-semibold text-primary tabular-nums">
                  {fmt(pdfResult)}
                </span>
              </div>
            </div>
            <div className="rounded-md border border-border/60 bg-muted/30 p-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[10.5px] text-muted-foreground">{cdfLabel}</span>
                <span className="text-[12px] font-mono font-semibold tabular-nums">
                  {fmt(cdfResult)}
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Actions */}
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1 h-8 text-[11px] gap-1.5"
          onClick={generateRandom}
        >
          <Dices className="size-3.5" />
          生成 10 个随机数
        </Button>
        {!isDiscrete && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="flex-1 h-8 text-[11px] gap-1.5"
                onClick={handleSendToPlot}
              >
                <Send className="size-3.5" />
                发送到绘图
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">将概率密度曲线添加到 2D 绘图</TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* Random numbers */}
      <AnimatePresence mode="wait">
        {randomNumbers.length > 0 && (
          <motion.div
            key="rand"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="rounded-md border border-border/60 bg-muted/20 p-2.5"
          >
            <div className="text-[10.5px] text-muted-foreground mb-1.5">随机数</div>
            <div className="flex flex-wrap gap-1">
              {randomNumbers.map((n, i) => (
                <Badge
                  key={i}
                  variant="outline"
                  className="text-[10px] font-mono tabular-nums px-1.5 py-0"
                >
                  {fmt(n, 4)}
                </Badge>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ================================================================== *
 * TAB 3 — Hypothesis Testing
 * ================================================================== */
type TestType = 'ttest' | 'chisquare';

function HypothesisTab() {
  const [testType, setTestType] = useState<TestType>('ttest');

  return (
    <div className="p-3 space-y-3">
      <div>
        <label className="text-[11px] text-muted-foreground mb-1 block">检验类型</label>
        <Select value={testType} onValueChange={(v) => setTestType(v as TestType)}>
          <SelectTrigger className="h-8 text-[12px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ttest" className="text-[12px]">单样本 t 检验</SelectItem>
            <SelectItem value="chisquare" className="text-[12px]">卡方拟合优度检验</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {testType === 'ttest' ? <TTestForm /> : <ChiSquareForm />}
    </div>
  );
}

interface TTestResult {
  t: number;
  df: number;
  pValue: number;
  mean: number;
  std: number;
  n: number;
  reject: boolean;
  alpha: number;
}

function TTestForm() {
  const [dataInput, setDataInput] = useState('5.1, 4.8, 6.2, 5.5, 4.9, 5.3, 6.0, 5.7, 5.2, 5.8');
  const [mu0, setMu0] = useState(5.0);
  const [alpha, setAlpha] = useState(0.05);
  const [result, setResult] = useState<TTestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleTest = () => {
    setError(null);
    setResult(null);
    const data = parseData(dataInput);
    if (data.length < 2) {
      setError('需要至少 2 个数据点');
      return;
    }
    const n = data.length;
    const mean = math.mean(data) as unknown as number;
    const std = math.std(data) as unknown as number;
    if (std === 0) {
      setError('标准差为 0，无法进行 t 检验');
      return;
    }
    const t = (mean - mu0) / (std / Math.sqrt(n));
    const df = n - 1;
    const pValue = tPValueTwoTailed(t, df);
    const reject = pValue < alpha;
    setResult({ t, df, pValue, mean, std, n, reject, alpha });
  };

  return (
    <>
      <div>
        <label className="text-[11px] text-muted-foreground mb-1 block">
          样本数据（逗号/空格分隔）
        </label>
        <Textarea
          value={dataInput}
          onChange={(e) => setDataInput(e.target.value)}
          placeholder="例如: 5.1, 4.8, 6.2, ..."
          className="min-h-[50px] text-[12px] font-mono resize-y"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[11px] text-muted-foreground mb-1 block">μ₀ (假设均值)</label>
          <Input
            type="number"
            value={mu0}
            step="any"
            onChange={(e) => setMu0(parseFloat(e.target.value) || 0)}
            className="h-8 text-[12px] font-mono"
          />
        </div>
        <div>
          <label className="text-[11px] text-muted-foreground mb-1 block">α (显著性水平)</label>
          <Select value={String(alpha)} onValueChange={(v) => setAlpha(parseFloat(v))}>
            <SelectTrigger className="h-8 text-[12px] font-mono">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0.1" className="text-[12px]">0.10</SelectItem>
              <SelectItem value="0.05" className="text-[12px]">0.05</SelectItem>
              <SelectItem value="0.01" className="text-[12px]">0.01</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Button onClick={handleTest} size="sm" className="w-full h-8 text-[12px] gap-1.5">
        <FlaskConical className="size-3.5" />
        检验 H₀: μ = {fmt(mu0)}
      </Button>

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

        {result && !error && (
          <motion.div
            key="res"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="space-y-2"
          >
            <div className="rounded-md border border-border/60 bg-muted/30 p-2.5 space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="text-muted-foreground">样本均值 x̄</span>
                <span className="font-mono font-semibold tabular-nums">{fmt(result.mean)}</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-muted-foreground">样本标准差 s</span>
                <span className="font-mono font-semibold tabular-nums">{fmt(result.std)}</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-muted-foreground">样本数 n</span>
                <span className="font-mono font-semibold tabular-nums">{result.n}</span>
              </div>
            </div>

            <div className="rounded-md border border-primary/30 bg-primary/5 p-2.5">
              <div className="text-[10.5px] text-muted-foreground mb-1.5">检验统计量</div>
              <div className="overflow-x-auto">
                <FormulaRenderer
                  latex={`t = \\frac{\\bar{x} - \\mu_0}{s / \\sqrt{n}} = \\frac{${fmt(result.mean)} - ${fmt(mu0)}}{${fmt(result.std)} / \\sqrt{${result.n}}} = ${fmt(result.t)}`}
                  displayMode
                />
              </div>
              <div className="mt-2 flex justify-between text-[11px]">
                <span className="text-muted-foreground">自由度 df</span>
                <span className="font-mono font-semibold tabular-nums">{result.df}</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-muted-foreground">p 值 (双侧)</span>
                <span className="font-mono font-semibold tabular-nums text-primary">
                  {fmt(result.pValue, 4)}
                </span>
              </div>
            </div>

            <div
              className={cn(
                'rounded-md border px-3 py-2 text-[11.5px] font-medium',
                result.reject
                  ? 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300'
                  : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
              )}
            >
              {result.reject
                ? `拒绝 H₀ (p = ${fmt(result.pValue, 4)} < α = ${result.alpha})`
                : `不能拒绝 H₀ (p = ${fmt(result.pValue, 4)} ≥ α = ${result.alpha})`}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

interface ChiSquareResult {
  chi2: number;
  df: number;
  pValue: number;
  reject: boolean;
  alpha: number;
  categories: { observed: number; expected: number; contribution: number }[];
}

function ChiSquareForm() {
  const [observedInput, setObservedInput] = useState('30, 25, 20, 15, 10');
  const [expectedInput, setExpectedInput] = useState('20, 20, 20, 20, 20');
  const [alpha, setAlpha] = useState(0.05);
  const [result, setResult] = useState<ChiSquareResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleTest = () => {
    setError(null);
    setResult(null);
    const observed = parseData(observedInput);
    let expected = parseData(expectedInput);

    if (observed.length < 2) {
      setError('需要至少 2 个观察值');
      return;
    }
    if (expected.length === 0) {
      // Even distribution
      const total = math.sum(observed) as number;
      expected = observed.map(() => total / observed.length);
    } else if (expected.length !== observed.length) {
      setError(`观察值 (${observed.length}) 和期望值 (${expected.length}) 数量不匹配`);
      return;
    }
    if (expected.some((e) => e <= 0)) {
      setError('期望值必须为正数');
      return;
    }

    let chi2 = 0;
    const categories = observed.map((o, i) => {
      const e = expected[i];
      const contribution = ((o - e) ** 2) / e;
      chi2 += contribution;
      return { observed: o, expected: e, contribution };
    });
    const df = observed.length - 1;
    const pValue = chiSquarePValue(chi2, df);
    const reject = pValue < alpha;
    setResult({ chi2, df, pValue, reject, alpha, categories });
  };

  return (
    <>
      <div>
        <label className="text-[11px] text-muted-foreground mb-1 block">
          观察频数 O（逗号分隔）
        </label>
        <Textarea
          value={observedInput}
          onChange={(e) => setObservedInput(e.target.value)}
          placeholder="例如: 30, 25, 20, 15, 10"
          className="min-h-[40px] text-[12px] font-mono resize-y"
        />
      </div>

      <div>
        <label className="text-[11px] text-muted-foreground mb-1 block">
          期望频数 E（留空则均匀分布）
        </label>
        <Textarea
          value={expectedInput}
          onChange={(e) => setExpectedInput(e.target.value)}
          placeholder="例如: 20, 20, 20, 20, 20"
          className="min-h-[40px] text-[12px] font-mono resize-y"
        />
      </div>

      <div>
        <label className="text-[11px] text-muted-foreground mb-1 block">α (显著性水平)</label>
        <Select value={String(alpha)} onValueChange={(v) => setAlpha(parseFloat(v))}>
          <SelectTrigger className="h-8 text-[12px] font-mono">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="0.1" className="text-[12px]">0.10</SelectItem>
            <SelectItem value="0.05" className="text-[12px]">0.05</SelectItem>
            <SelectItem value="0.01" className="text-[12px]">0.01</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Button onClick={handleTest} size="sm" className="w-full h-8 text-[12px] gap-1.5">
        <FlaskConical className="size-3.5" />
        检验 χ² = Σ (O-E)²/E
      </Button>

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

        {result && !error && (
          <motion.div
            key="res"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="space-y-2"
          >
            {/* Per-category breakdown */}
            <div className="rounded-md border border-border/60 bg-muted/30 p-2.5">
              <div className="text-[10.5px] text-muted-foreground mb-1.5">各类别贡献</div>
              <div className="space-y-1">
                {result.categories.map((c, i) => (
                  <div key={i} className="flex justify-between text-[10.5px] font-mono">
                    <span className="text-muted-foreground">
                      #{i + 1}: O={fmt(c.observed)}, E={fmt(c.expected)}
                    </span>
                    <span className="tabular-nums text-primary">{fmt(c.contribution)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-md border border-primary/30 bg-primary/5 p-2.5">
              <div className="overflow-x-auto mb-2">
                <FormulaRenderer
                  latex={`\\chi^2 = \\sum \\frac{(O - E)^2}{E} = ${fmt(result.chi2)}`}
                  displayMode
                />
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-muted-foreground">自由度 df</span>
                <span className="font-mono font-semibold tabular-nums">{result.df}</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-muted-foreground">p 值</span>
                <span className="font-mono font-semibold tabular-nums text-primary">
                  {fmt(result.pValue, 4)}
                </span>
              </div>
            </div>

            <div
              className={cn(
                'rounded-md border px-3 py-2 text-[11.5px] font-medium',
                result.reject
                  ? 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300'
                  : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
              )}
            >
              {result.reject
                ? `拒绝 H₀ (p = ${fmt(result.pValue, 4)} < α = ${result.alpha})`
                : `不能拒绝 H₀ (p = ${fmt(result.pValue, 4)} ≥ α = ${result.alpha})`}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
