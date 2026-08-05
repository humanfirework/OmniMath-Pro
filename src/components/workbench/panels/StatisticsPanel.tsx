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

import { useState, useMemo, useCallback, useEffect, useRef, type ChangeEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BarChart3,
  Box,
  Calculator,
  ChartScatter,
  Check,
  ChevronDown,
  ClipboardList,
  Copy,
  Dices,
  Download,
  FlaskConical,
  Save,
  Send,
  Sigma,
  Sparkles,
  Table2,
  Trash2,
  TrendingUp,
  Upload,
  X,
  ZoomIn,
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { parseNumericInput } from '@/lib/engine/dataInputParser';
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

/**
 * 双侧 t 临界值：找到 t 使 P(|T| > t) = alpha，即 P(-t < T < t) = 1 - alpha。
 * 用于计算均值置信区间与回归预测置信带。
 */
function tCritical(alpha: number, df: number): number {
  if (df <= 0 || !Number.isFinite(alpha)) return NaN;
  let lo = 0;
  let hi = 100;
  let guard = 0;
  while (tPValueTwoTailed(hi, df) > alpha && guard++ < 60) hi *= 2;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (tPValueTwoTailed(mid, df) > alpha) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
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
 * Task 10a/10b — Preset dataset generators
 * ================================================================== */

/** Box-Muller 标准正态 N(0,1) 采样 */
function boxMuller(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function normalSample(n: number, mu = 0, sigma = 1): number[] {
  const arr: number[] = [];
  for (let i = 0; i < n; i++) arr.push(mu + sigma * boxMuller());
  return arr;
}

function trimodalSample(nPerMode = 20): number[] {
  const arr: number[] = [];
  for (let i = 0; i < nPerMode; i++) arr.push(60 + boxMuller() * 2.5);
  for (let i = 0; i < nPerMode; i++) arr.push(75 + boxMuller() * 2.5);
  for (let i = 0; i < nPerMode; i++) arr.push(90 + boxMuller() * 2.5);
  return arr;
}

function diceSample(n = 200): number[] {
  const arr: number[] = [];
  for (let i = 0; i < n; i++) arr.push(1 + Math.floor(Math.random() * 6));
  return arr;
}

type PresetKey = 'height' | 'exam' | 'dice' | 'normal';

function generatePreset(key: PresetKey): number[] {
  switch (key) {
    case 'height': return normalSample(100, 170, 7);
    case 'exam': return trimodalSample(20);
    case 'dice': return diceSample(200);
    case 'normal': return normalSample(200, 0, 1);
  }
}

const PRESET_LABELS: Record<PresetKey, string> = {
  height: '身高数据 (N(170,7²), 100)',
  exam: '考试成绩 (trimodal 60/75/90, 60)',
  dice: '掷骰子模拟 (1-6 均匀, 200)',
  normal: '正态分布样本 (N(0,1), 200)',
};

/* ================================================================== *
 * Dataset storage utilities (Task 10)
 * ================================================================== */
const DATASET_STORAGE_KEY = 'omnimath-stat-datasets';

interface SavedDataset {
  name: string;
  data: number[];
  createdAt: number;
}

function saveDataset(name: string, data: number[]): void {
  try {
    const all = loadDatasets().filter((d) => d.name !== name);
    all.push({ name, data, createdAt: Date.now() });
    localStorage.setItem(DATASET_STORAGE_KEY, JSON.stringify(all));
  } catch {
    /* ignore storage errors */
  }
}

function loadDatasets(): SavedDataset[] {
  try {
    const raw = localStorage.getItem(DATASET_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as SavedDataset[];
  } catch {
    return [];
  }
}

function deleteDataset(name: string): void {
  try {
    const all = loadDatasets().filter((d) => d.name !== name);
    localStorage.setItem(DATASET_STORAGE_KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}

function exportDatasetCSV(name: string, data: number[]): void {
  const csv = 'value\n' + data.map((v) => String(v)).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Parse CSV text (single or multi-column) into a flat number[]. */
function parseCSVNumbers(text: string): number[] {
  const lines = text.split(/[\r\n]+/).map((l) => l.trim()).filter((l) => l.length > 0);
  const nums: number[] = [];
  let startRow = 0;
  // Skip a header row if the first cell is non-numeric.
  if (lines.length > 0) {
    const firstCells = lines[0].split(/[,\t;]+/);
    if (firstCells.every((c) => !Number.isFinite(parseFloat(c.trim())))) {
      startRow = 1;
    }
  }
  for (let i = startRow; i < lines.length; i++) {
    const cells = lines[i].split(/[,\t;]+/);
    for (const cell of cells) {
      const n = parseFloat(cell.trim());
      if (Number.isFinite(n)) nums.push(n);
    }
  }
  return nums;
}

/* ================================================================== *
 * StatChart — SVG-based mini charts (Task 9)
 * ================================================================== */
type ChartType = 'histogram' | 'boxplot' | 'scatter' | 'qq';

interface StatChartProps {
  type: ChartType;
  data?: number[];
  points?: Array<{ x: number; y: number }>;
  regressionLine?: { slope: number; intercept: number };
  vertical?: boolean;
  showPoints?: boolean;
  residuals?: boolean;
  band?: boolean;
}

const CHART_W = 280;
const CHART_H = 200;
const CHART_PAD = { l: 34, r: 12, t: 12, b: 26 };

function ChartEmpty({ label }: { label: string }) {
  return (
    <div className="flex h-[200px] items-center justify-center rounded-md border border-border/40 bg-muted/20 text-[11px] text-muted-foreground">
      {label}
    </div>
  );
}

interface HistogramChartProps {
  data: number[];
  zoomed?: boolean;
  binRule?: BinRule;
  density?: boolean;
  cumulative?: boolean;
  showPoints?: boolean;
}

const MIN_BAR_WIDTH = 28;

/** 箱数规则：Sturges / 平方根 / Freedman-Diaconis / 自定义整数。 */
type BinRule = 'sturges' | 'sqrt' | 'fd' | number;

function binCountFor(data: number[], rule: BinRule): number {
  const n = data.length;
  if (typeof rule === 'number') return Math.max(1, Math.round(rule));
  if (rule === 'sqrt') return Math.max(1, Math.ceil(Math.sqrt(n)));
  if (rule === 'fd') {
    const sorted = [...data].sort((a, b) => a - b);
    const q1 = quantileSorted(sorted, 0.25);
    const q3 = quantileSorted(sorted, 0.75);
    const iqr = q3 - q1;
    const h = iqr > 0 ? (2 * iqr) / Math.cbrt(n) : 0;
    const span = Math.max(...data) - Math.min(...data);
    if (h > 0 && span > 0) return Math.max(1, Math.ceil(span / h));
  }
  // Sturges 默认
  return Math.max(1, Math.ceil(Math.log2(n) + 1));
}

/** 测量容器宽度，让图表随容器自适应（替代固定 280px 宽度）。 */
function useMeasureWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setWidth(Math.max(0, Math.floor(el.getBoundingClientRect().width)));
    update();
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(update);
      ro.observe(el);
    }
    return () => ro?.disconnect();
  }, []);
  return { ref, width };
}

/** 紧凑统计摘要条：均值 / 中位数 / 标准差 / 最小 / 最大 / n */
function StatStrip({ data }: { data: number[] }) {
  const sorted = useMemo(() => [...data].sort((a, b) => a - b), [data]);
  const n = data.length;
  if (n < 1) return null;
  const mean = data.reduce((a, b) => a + b, 0) / n;
  const median =
    sorted.length % 2
      ? sorted[(sorted.length - 1) / 2]
      : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
  const variance = data.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const std = Math.sqrt(variance);
  const items: Array<[string, string]> = [
    ['样本数 n', String(n)],
    ['均值', fmt(mean, 4)],
    ['中位数', fmt(median, 4)],
    ['标准差', fmt(std, 4)],
    ['最小', fmt(sorted[0], 4)],
    ['最大', fmt(sorted[sorted.length - 1], 4)],
  ];
  return (
    <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
      {items.map(([lbl, v]) => (
        <div
          key={lbl}
          className="rounded-md border border-border/40 bg-muted/30 px-1.5 py-1 text-center"
        >
          <div className="text-[9px] text-muted-foreground">{lbl}</div>
          <div className="text-[11px] font-mono font-semibold tabular-nums text-primary">{v}</div>
        </div>
      ))}
    </div>
  );
}

function HistogramChart({ data, zoomed = false, binRule = 'sturges', density = false, cumulative = false, showPoints = false }: HistogramChartProps) {
  const [hover, setHover] = useState<number | null>(null);
  const { ref, width } = useMeasureWidth<HTMLDivElement>();
  const n = data.length;

  // Memoize the expensive binning. Previously every hover (setHover) re-rendered
  // the whole chart and recomputed Math.min/max + all bins for the full dataset,
  // which caused visible lag on large inputs. The statistical model only depends
  // on `data`, so it is computed once and reused across hover re-renders.
  const model = useMemo(() => {
    if (n < 2) return null;
    let min = Math.min(...data);
    let max = Math.max(...data);
    // 所有值相同（min === max）时无法按正常区间分箱，人为扩展一个区间，
    // 用单个柱展示全部数据，避免出现"无法分箱"的错误提示。
    if (min === max) {
      const pad = Math.abs(min) * 0.5 || 1;
      min -= pad;
      max += pad;
    }
    const k = binCountFor(data, binRule);
    const binWidth = (max - min) / k;
    const bins = new Array(k).fill(0);
    for (const v of data) {
      let idx = Math.floor((v - min) / binWidth);
      if (idx >= k) idx = k - 1;
      if (idx < 0) idx = 0;
      bins[idx]++;
    }
    // 累计频数（用于 ECDF 叠加）
    const cum = new Array(k).fill(0);
    let acc = 0;
    for (let i = 0; i < k; i++) {
      acc += bins[i];
      cum[i] = acc;
    }
    return { min, max, k, binWidth, bins, cum, maxFreq: Math.max(...bins, 1) };
  }, [data, n, binRule]);

  // 均值 / 中位数标记（用于观察分布位置）— 必须在条件返回前调用 Hook
  const sorted = useMemo(() => [...data].sort((a, b) => a - b), [data]);
  const median =
    sorted.length % 2
      ? sorted[(sorted.length - 1) / 2]
      : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;

  if (!model) return <ChartEmpty label="需要至少 2 个数据点" />;

  const { min, max, k, binWidth, bins, cum, maxFreq } = model;
  const mean = data.reduce((a, b) => a + b, 0) / n;
  // y 轴单位：density 模式用 概率密度（频数 / (n·binWidth)），否则用频数
  const barValue = (f: number) => (density ? f / (n * binWidth) : f);
  const maxBar = Math.max(...bins.map(barValue), 1);
  const yCeil = zoomed ? maxBar * 1.15 : maxBar;
  const sigma = Math.sqrt(data.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
  const normalDensity = (x: number) =>
    (1 / (sigma * Math.sqrt(2 * Math.PI))) * Math.exp(-((x - mean) ** 2) / (2 * sigma * sigma));
  const ch = zoomed ? 280 : 200;
  // 自适应：优先容器宽度，池化最小宽度（避免 null 时跳动）。
  const baseW = Math.max(width, CHART_W);
  const contentW = Math.max(baseW, k * MIN_BAR_WIDTH + CHART_PAD.l + CHART_PAD.r);
  const plotW = contentW - CHART_PAD.l - CHART_PAD.r;
  const plotH = ch - CHART_PAD.t - CHART_PAD.b;
  const barW = plotW / k;
  const yScale = (f: number) => CHART_PAD.t + plotH - (f / yCeil) * plotH;
  const showTopLabels = k <= 15;
  const dataSpan = max - min || 1;
  const sx = (v: number) => CHART_PAD.l + ((v - min) / dataSpan) * plotW;

  const marker = (v: number, label: string, color: string) => {
    const x = sx(v);
    return (
      <g key={label}>
        <line
          x1={x}
          x2={x}
          y1={CHART_PAD.t}
          y2={CHART_PAD.t + plotH}
          stroke={color}
          strokeWidth={1.5}
          strokeDasharray="4 3"
          opacity={0.9}
        />
        <text x={x} y={CHART_PAD.t - 3} textAnchor="middle" fontSize={8} fontWeight={600} fill={color}>
          {label}
        </text>
      </g>
    );
  };

  // 正态密度叠加（density 模式为主）
  const normCurve = density
    ? new Array(80).fill(0).map((_, i) => {
        const x = min + ((max - min) * i) / 79;
        return { x: sx(x), y: yScale(normalDensity(x)) };
      })
    : [];

  // ECDF 步进线（右轴 0–1）
  const ecdfPoints = cumulative
    ? Array.from({ length: k + 1 }, (_, i) => {
        const x = i === k ? max : min + i * binWidth;
        const frac = i === 0 ? 0 : cum[i - 1] / n;
        return { x: sx(x), y: CHART_PAD.t + plotH - frac * plotH };
      })
    : [];

  return (
    <div
      ref={ref}
      className="relative w-full"
      style={{
        overflowX: k * MIN_BAR_WIDTH > CHART_W - CHART_PAD.l - CHART_PAD.r ? 'auto' : 'visible',
        paddingBottom: 2,
      }}
    >
      <svg
        viewBox={`0 0 ${contentW} ${ch}`}
        className="relative"
        style={{ width: contentW, height: ch, minWidth: '100%' }}
      >
        {[0, 0.5, 1].map((t) => {
          const y = CHART_PAD.t + plotH - t * plotH;
          const yVal = density ? parseFloat((t * yCeil).toPrecision(3)) : Math.round(t * yCeil);
          return (
            <g key={t}>
              <line x1={CHART_PAD.l} y1={y} x2={contentW - CHART_PAD.r} y2={y} stroke="currentColor" strokeOpacity={0.08} />
              <text x={CHART_PAD.l - 4} y={y + 3} textAnchor="end" fontSize={8} fill="currentColor" opacity={0.55}>
                {yVal}
              </text>
              {cumulative && (
                <text x={contentW - CHART_PAD.r + 4} y={y + 3} textAnchor="start" fontSize={8} fill="#8b5cf6" opacity={0.8}>
                  {t === 0 ? 0 : t === 1 ? 1 : 0.5}
                </text>
              )}
            </g>
          );
        })}
        {bins.map((f, i) => {
          const x = CHART_PAD.l + i * barW;
          const y = yScale(barValue(f));
          const h = CHART_PAD.t + plotH - y;
          const lo = min + i * binWidth;
          const hi = i === k - 1 ? max : min + (i + 1) * binWidth;
          const pct = ((f / n) * 100).toFixed(1);
          const tip = `[${fmt(lo, 2)}, ${fmt(hi, 2)}): ${f} (${pct}%)`;
          return (
            <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <title>{tip}</title>
              <rect
                x={x + 1}
                y={y}
                width={Math.max(1, barW - 2)}
                height={Math.max(0, h)}
                fill="#2dd4bf"
                fillOpacity={hover === i ? 0.95 : 0.65}
                rx={1}
              />
              {showTopLabels && f > 0 && (
                <text
                  x={x + barW / 2}
                  y={y - 3}
                  textAnchor="middle"
                  fontSize={7.5}
                  fill="currentColor"
                  opacity={0.85}
                >
                  {`${f} (${pct}%)`}
                </text>
              )}
              {i % Math.ceil(k / 6) === 0 && (
                <text x={x + barW / 2} y={ch - CHART_PAD.b + 12} textAnchor="middle" fontSize={8} fill="currentColor" opacity={0.55}>
                  {fmt(lo, 3)}
                </text>
              )}
              {hover === i && !showTopLabels && (
                <g>
                  <rect x={x + barW / 2 - 48} y={y - 28} width={96} height={22} rx={3} fill="#0f172a" opacity={0.92} />
                  <text x={x + barW / 2} y={y - 13} textAnchor="middle" fontSize={8.5} fill="#fff">
                    {`[${fmt(lo, 2)}, ${fmt(hi, 2)}): ${f} (${pct}%)`}
                  </text>
                </g>
              )}
            </g>
          );
        })}
        {/* 正态密度叠加线 */}
        {density && normCurve.length > 1 && (
          <polyline
            points={normCurve.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
            fill="none"
            stroke="#f59e0b"
            strokeWidth={1.8}
            strokeDasharray="5 3"
          />
        )}
        {/* ECDF 累计步进线 */}
        {cumulative && ecdfPoints.length > 1 && (
          <polyline
            points={ecdfPoints.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
            fill="none"
            stroke="#8b5cf6"
            strokeWidth={2}
            strokeLinejoin="round"
          />
        )}
        {/* 均值 / 中位数标记线 */}
        {marker(mean, `均值 ${fmt(mean, 3)}`, '#f59e0b')}
        {marker(median, `中位 ${fmt(median, 3)}`, '#0ea5e9')}
        {/* 数据点 rug 条带：在底部绘制每个观测值，便于观察个体分布与稀疏区 */}
        {showPoints && (
          <g>
            {data.map((v, i) => {
              const x = sx(v);
              const y = CHART_PAD.t + plotH - 4 - ((i * 7919) % 11) * 1.5;
              return (
                <circle key={i} cx={x} cy={y} r={1.4} fill="#34d399" fillOpacity={0.75}>
                  <title>{`第 ${i + 1} 个观测: ${fmt(v, 4)}`}</title>
                </circle>
              );
            })}
          </g>
        )}
        <line x1={CHART_PAD.l} y1={CHART_PAD.t} x2={CHART_PAD.l} y2={CHART_PAD.t + plotH} stroke="currentColor" strokeOpacity={0.3} />
        <line x1={CHART_PAD.l} y1={CHART_PAD.t + plotH} x2={contentW - CHART_PAD.r} y2={CHART_PAD.t + plotH} stroke="currentColor" strokeOpacity={0.3} />
      </svg>
      {k * MIN_BAR_WIDTH > CHART_W - CHART_PAD.l - CHART_PAD.r && (
        <div
          aria-hidden
          className="pointer-events-none absolute top-0 right-0 h-full"
          style={{
            width: 24,
            background:
              'linear-gradient(to right, rgba(255,255,255,0) 0%, var(--background, #fff) 100%)',
            opacity: 0.85,
          }}
        />
      )}
      {/* 图例 */}
      <div className="mt-1 flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-3 h-0.5 bg-amber-500" /> 均值
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-3 h-0.5 bg-sky-500" /> 中位数
        </span>
        {density && (
          <span className="inline-flex items-center gap-1">
            <span className="inline-block w-3 border-t border-dashed border-amber-500" /> 正态密度
          </span>
        )}
        {cumulative && (
          <span className="inline-flex items-center gap-1">
            <span className="inline-block w-3 h-0.5 bg-violet-500" /> 累计 (ECDF)
          </span>
        )}
        {showPoints && (
          <span className="inline-flex items-center gap-1">
            <span className="inline-block size-1.5 rounded-full bg-emerald-400" /> 数据点
          </span>
        )}
      </div>
    </div>
  );
}

function quantileSorted(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  }
  return sorted[base];
}

function BoxPlotChart({ data, vertical = false, showPoints = false }: { data: number[]; vertical?: boolean; showPoints?: boolean }) {
  const { ref, width } = useMeasureWidth<HTMLDivElement>();
  if (data.length < 2) return <ChartEmpty label="需要至少 2 个数据点" />;
  const sorted = [...data].sort((a, b) => a - b);
  const q1 = quantileSorted(sorted, 0.25);
  const median = quantileSorted(sorted, 0.5);
  const q3 = quantileSorted(sorted, 0.75);
  const iqr = q3 - q1;
  const loFence = q1 - 1.5 * iqr;
  const hiFence = q3 + 1.5 * iqr;
  const inliers = sorted.filter((v) => v >= loFence && v <= hiFence);
  const whiskerLo = inliers.length > 0 ? Math.min(...inliers) : q1;
  const whiskerHi = inliers.length > 0 ? Math.max(...inliers) : q3;
  const outliers = sorted.filter((v) => v < loFence || v > hiFence);
  const mean = data.reduce((a, b) => a + b, 0) / data.length;

  const dMin = Math.min(...sorted, whiskerLo);
  const dMax = Math.max(...sorted, whiskerHi);
  const span = dMax - dMin || 1;
  const pad = span * 0.08;
  const vMin = dMin - pad;
  const vMax = dMax + pad;
  const range = vMax - vMin || 1;

  const W = Math.max(width, CHART_W);
  const H = CHART_H;
  const plotW = W - CHART_PAD.l - CHART_PAD.r;
  const plotH = H - CHART_PAD.t - CHART_PAD.b;
  const cMid = CHART_PAD.t + plotH / 2;
  const boxH = Math.min(plotH * 0.5, 40);
  // 值轴坐标：水平 → 横向 px(v)；垂直 → 纵向 py(v)
  const sx = (v: number) => CHART_PAD.l + ((v - vMin) / range) * plotW;
  const sy = (v: number) => CHART_PAD.t + plotH - ((v - vMin) / range) * plotH;

  // 坐标(px, py)与两个方向的画线/画框辅助
  const hLine = (v: number, y1: number, y2: number, stroke: string, w = 1.5) => (
    <line x1={sx(v)} y1={y1} x2={sx(v)} y2={y2} stroke={stroke} strokeWidth={w} />
  );
  const vLine = (v: number, x1: number, x2: number, stroke: string, w = 1.5) => (
    <line x1={x1} y1={sy(v)} x2={x2} y2={sy(v)} stroke={stroke} strokeWidth={w} />
  );

  // 数值标注（避开箱体，放在两端外侧）
  const valLabel = (v: number, label: string, color: string) =>
    vertical ? (
      <text x={CHART_PAD.t + 10} y={sy(v) + 3} fontSize={8} fill={color} fontWeight={600}>
        {label} {fmt(v, 3)}
      </text>
    ) : (
      <text x={sx(v)} y={cMid + boxH / 2 + 12} textAnchor="middle" fontSize={8} fill={color} fontWeight={600}>
        {label} {fmt(v, 3)}
      </text>
    );

  return (
    <div ref={ref} className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 200 }}>
        {/* 值轴刻度 */}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const vv = vMin + t * range;
          return vertical ? (
            <g key={t}>
              <line x1={CHART_PAD.l} y1={sy(vv)} x2={W - CHART_PAD.r} y2={sy(vv)} stroke="currentColor" strokeOpacity={0.06} />
              <text x={CHART_PAD.l - 4} y={sy(vv) + 3} textAnchor="end" fontSize={8} fill="currentColor" opacity={0.55}>
                {fmt(vv, 3)}
              </text>
            </g>
          ) : (
            <g key={t}>
              <line x1={sx(vv)} y1={CHART_PAD.t} x2={sx(vv)} y2={CHART_PAD.t + plotH} stroke="currentColor" strokeOpacity={0.06} />
              <text x={sx(vv)} y={H - CHART_PAD.b + 12} textAnchor="middle" fontSize={8} fill="currentColor" opacity={0.55}>
                {fmt(vv, 3)}
              </text>
            </g>
          );
        })}

        {vertical ? (
          <>
            {/* whiskers */}
            {vLine(whiskerLo, cMid, cMid - boxH / 2, '#2dd4bf')}
            {vLine(whiskerHi, cMid, cMid + boxH / 2, '#2dd4bf')}
            {vLine(whiskerLo, CHART_PAD.l + plotW / 2 - 4, CHART_PAD.l + plotW / 2 + 4, '#2dd4bf')}
            {vLine(whiskerHi, CHART_PAD.l + plotW / 2 - 4, CHART_PAD.l + plotW / 2 + 4, '#2dd4bf')}
            {/* box */}
            <rect x={cMid - boxH / 2} y={sy(q3)} width={boxH} height={Math.max(1, sy(q1) - sy(q3))} fill="#2dd4bf" fillOpacity={0.25} stroke="#2dd4bf" strokeWidth={1.5} rx={2} />
            {/* median */}
            <line x1={cMid - boxH / 2} y1={sy(median)} x2={cMid + boxH / 2} y2={sy(median)} stroke="#0f766e" strokeWidth={2} />
            {/* outliers */}
            {outliers.map((o, i) => (
              <circle key={i} cx={cMid} cy={sy(o)} r={2.5} fill="none" stroke="#f43f5e" strokeWidth={1.2} />
            ))}
            {/* mean diamond */}
            <rect x={cMid - 3.5} y={sy(mean) - 3.5} width={7} height={7} transform={`rotate(45 ${cMid} ${sy(mean)})`} fill="#f59e0b" stroke="#fff" strokeWidth={0.8} />
            {/* 数值标注 */}
            {valLabel(whiskerLo, '下须', '#2dd4bf')}
            {valLabel(q1, 'Q1', '#94a3b8')}
            {valLabel(median, '中位', '#94a3b8')}
            {valLabel(q3, 'Q3', '#94a3b8')}
            {valLabel(whiskerHi, '上须', '#2dd4bf')}
            {valLabel(mean, '均值', '#f59e0b')}
          </>
        ) : (
          <>
            {/* whiskers */}
            {hLine(whiskerLo, cMid, cMid - boxH / 2, '#2dd4bf')}
            {hLine(whiskerHi, cMid, cMid + boxH / 2, '#2dd4bf')}
            {hLine(whiskerLo, cMid - boxH / 3, cMid + boxH / 3, '#2dd4bf')}
            {hLine(whiskerHi, cMid - boxH / 3, cMid + boxH / 3, '#2dd4bf')}
            {/* box */}
            <rect x={sx(q1)} y={cMid - boxH / 2} width={Math.max(1, sx(q3) - sx(q1))} height={boxH} fill="#2dd4bf" fillOpacity={0.25} stroke="#2dd4bf" strokeWidth={1.5} rx={2} />
            {/* median */}
            <line x1={sx(median)} y1={cMid - boxH / 2} x2={sx(median)} y2={cMid + boxH / 2} stroke="#0f766e" strokeWidth={2} />
            {/* outliers */}
            {outliers.map((o, i) => (
              <circle key={i} cx={sx(o)} cy={cMid} r={2.5} fill="none" stroke="#f43f5e" strokeWidth={1.2} />
            ))}
            {/* mean diamond */}
            <rect x={sx(mean) - 3.5} y={cMid - 3.5} width={7} height={7} transform={`rotate(45 ${sx(mean)} ${cMid})`} fill="#f59e0b" stroke="#fff" strokeWidth={0.8} />
            {/* 数值标注 */}
            {valLabel(whiskerLo, '下须', '#2dd4bf')}
            {valLabel(q1, 'Q1', '#94a3b8')}
            {valLabel(median, '中位', '#94a3b8')}
            {valLabel(q3, 'Q3', '#94a3b8')}
            {valLabel(whiskerHi, '上须', '#2dd4bf')}
            {valLabel(mean, '均值', '#f59e0b')}
          </>
        )}
        {/* 抖动数据点：叠加在箱体上，展示每个观测的实际位置 */}
        {showPoints && (
          <g>
            {data.map((v, i) => {
              const jitter = ((i * 2654435761) % 100) / 100 - 0.5;
              const jx = jitter * boxH * 0.9;
              const jy = jitter * boxH * 0.9;
              return vertical ? (
                <circle key={i} cx={cMid + jx} cy={sy(v)} r={1.6} fill="#34d399" fillOpacity={0.7}>
                  <title>{`第 ${i + 1} 个观测: ${fmt(v, 4)}`}</title>
                </circle>
              ) : (
                <circle key={i} cx={sx(v)} cy={cMid + jy} r={1.6} fill="#34d399" fillOpacity={0.7}>
                  <title>{`第 ${i + 1} 个观测: ${fmt(v, 4)}`}</title>
                </circle>
              );
            })}
          </g>
        )}
        {/* 值轴 */}
        {vertical ? (
          <line x1={CHART_PAD.l} y1={CHART_PAD.t} x2={CHART_PAD.l} y2={CHART_PAD.t + plotH} stroke="currentColor" strokeOpacity={0.3} />
        ) : (
          <line x1={CHART_PAD.l} y1={CHART_PAD.t + plotH} x2={W - CHART_PAD.r} y2={CHART_PAD.t + plotH} stroke="currentColor" strokeOpacity={0.3} />
        )}
      </svg>
      {/* 图例与说明 */}
      <div className="mt-1 flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-3 h-1.5 bg-teal-600/40 border border-teal-600" /> IQR (Q1–Q3)
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-3 h-0.5 bg-teal-700" /> 中位数
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block size-1.5 bg-amber-500 rotate-45" /> 均值
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block size-2 rounded-full border border-rose-500" /> 离群点
        </span>
        {showPoints && (
          <span className="inline-flex items-center gap-1">
            <span className="inline-block size-1.5 rounded-full bg-emerald-400" /> 数据点
          </span>
        )}
        <span className="text-muted-foreground/70">IQR = {fmt(iqr, 3)}</span>
      </div>
    </div>
  );
}

function ScatterChart({ points, regressionLine, residuals = false, band = false }: { points: Array<{ x: number; y: number }>; regressionLine?: { slope: number; intercept: number }; residuals?: boolean; band?: boolean }) {
  const { ref, width } = useMeasureWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  if (points.length < 1) return <ChartEmpty label="需要 (x, y) 数据对" />;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);
  const xSpan = xMax - xMin || 1;
  const ySpan = yMax - yMin || 1;
  const xPad = xSpan * 0.08;
  const yPad = ySpan * 0.08;
  const loX = xMin - xPad;
  const hiX = xMax + xPad;
  const loY = yMin - yPad;
  const hiY = yMax + yPad;
  const xRange = hiX - loX || 1;
  const yRange = hiY - loY || 1;

  const W = Math.max(width, CHART_W);
  const H = CHART_H;
  const plotW = W - CHART_PAD.l - CHART_PAD.r;
  const plotH = H - CHART_PAD.t - CHART_PAD.b;
  const sx = (v: number) => CHART_PAD.l + ((v - loX) / xRange) * plotW;
  const sy = (v: number) => CHART_PAD.t + plotH - ((v - loY) / yRange) * plotH;

  // 皮尔逊相关系数 r
  const n = points.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let cxx = 0, cyy = 0, cxy = 0;
  for (const p of points) {
    cxx += (p.x - mx) ** 2;
    cyy += (p.y - my) ** 2;
    cxy += (p.x - mx) * (p.y - my);
  }
  const r = Math.sqrt(cxx * cyy) > 0 ? cxy / Math.sqrt(cxx * cyy) : NaN;

  const hoverPt = hover !== null ? points[hover] : null;

  // 回归置信带（95% 预测均值区间）与残差条数据。
  // yhat ± t_{0.025, n-2} * s * sqrt(1/n + (x-x̄)²/Sxx)，s = sqrt(SSres/(n-2)).
  let bandLower: Array<{ x: number; y: number }> | null = null;
  let bandUpper: Array<{ x: number; y: number }> | null = null;
  const residualsList: Array<{ x: number; y: number; yhat: number }> = [];
  if (regressionLine && n >= 3) {
    const xbar = mx;
    let sxxAcc = 0;
    let ssresAcc = 0;
    for (const p of points) {
      sxxAcc += (p.x - xbar) ** 2;
      const yhat = regressionLine.slope * p.x + regressionLine.intercept;
      ssresAcc += (p.y - yhat) ** 2;
      residualsList.push({ x: p.x, y: p.y, yhat });
    }
    const s = Math.sqrt(ssresAcc / (n - 2));
    const tc = tCritical(0.05, n - 2);
    if (Number.isFinite(tc) && sxxAcc > 0) {
      const N = 40;
      const lo: Array<{ x: number; y: number }> = [];
      const up: Array<{ x: number; y: number }> = [];
      bandLower = lo;
      bandUpper = up;
      for (let i = 0; i <= N; i++) {
        const x = loX + (xRange * i) / N;
        const yhat = regressionLine.slope * x + regressionLine.intercept;
        const se = s * Math.sqrt(1 / n + ((x - xbar) ** 2) / sxxAcc);
        const w = tc * se;
        lo.push({ x, y: yhat - w });
        up.push({ x, y: yhat + w });
      }
    }
  }

  return (
    <div ref={ref} className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 200 }}>
        {/* grid + ticks */}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const xv = loX + t * xRange;
          const yv = loY + t * yRange;
          const gx = sx(xv);
          const gy = sy(yv);
          return (
            <g key={t}>
              <line x1={gx} y1={CHART_PAD.t} x2={gx} y2={CHART_PAD.t + plotH} stroke="currentColor" strokeOpacity={0.06} />
              <line x1={CHART_PAD.l} y1={gy} x2={W - CHART_PAD.r} y2={gy} stroke="currentColor" strokeOpacity={0.06} />
              <text x={gx} y={H - CHART_PAD.b + 12} textAnchor="middle" fontSize={8} fill="currentColor" opacity={0.55}>{fmt(xv, 3)}</text>
              <text x={CHART_PAD.l - 4} y={gy + 3} textAnchor="end" fontSize={8} fill="currentColor" opacity={0.55}>{fmt(yv, 3)}</text>
            </g>
          );
        })}
        {/* regression line */}
        {regressionLine && (
          <line
            x1={sx(loX)}
            y1={sy(regressionLine.slope * loX + regressionLine.intercept)}
            x2={sx(hiX)}
            y2={sy(regressionLine.slope * hiX + regressionLine.intercept)}
            stroke="#f59e0b"
            strokeWidth={1.8}
          />
        )}
        {/* 95% 置信带 */}
        {band && bandLower && bandUpper && regressionLine && (
          <g>
            <polygon
              points={[
                ...bandLower.map((p) => `${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`),
                ...[...bandUpper].reverse().map((p) => `${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`),
              ].join(' ')}
              fill="#f59e0b"
              fillOpacity={0.12}
              stroke="none"
            />
          </g>
        )}
        {/* 残差竖线：每个点到回归线的垂直距离 */}
        {residuals && regressionLine && (
          <g>
            {residualsList.map((p, i) => (
              <line
                key={i}
                x1={sx(p.x)}
                y1={sy(p.y)}
                x2={sx(p.x)}
                y2={sy(p.yhat)}
                stroke="#f43f5e"
                strokeOpacity={0.5}
                strokeWidth={1}
                strokeDasharray="2 2"
              />
            ))}
          </g>
        )}
        {/* points */}
        {points.map((p, i) => (
          <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <title>{`第 ${i + 1} 个点: x=${fmt(p.x, 4)}, y=${fmt(p.y, 4)}`}</title>
            <circle
              cx={sx(p.x)}
              cy={sy(p.y)}
              r={hover === i ? 4 : 2.6}
              fill="#2dd4bf"
              fillOpacity={hover === i ? 1 : 0.8}
              stroke="#0f766e"
              strokeWidth={0.6}
            />
          </g>
        ))}
        {/* 悬浮提示框 */}
        {hoverPt && (
          <g pointerEvents="none">
            <rect x={sx(hoverPt.x) + 6} y={Math.max(CHART_PAD.t, sy(hoverPt.y) - 22)} width={110} height={20} rx={3} fill="#0f172a" opacity={0.92} />
            <text x={sx(hoverPt.x) + 12} y={Math.max(CHART_PAD.t, sy(hoverPt.y) - 22) + 14} fontSize={8.5} fill="#fff">
              x={fmt(hoverPt.x, 4)}, y={fmt(hoverPt.y, 4)}
            </text>
          </g>
        )}
        {/* axes */}
        <line x1={CHART_PAD.l} y1={CHART_PAD.t} x2={CHART_PAD.l} y2={CHART_PAD.t + plotH} stroke="currentColor" strokeOpacity={0.3} />
        <line x1={CHART_PAD.l} y1={CHART_PAD.t + plotH} x2={W - CHART_PAD.r} y2={CHART_PAD.t + plotH} stroke="currentColor" strokeOpacity={0.3} />
      </svg>
      {/* 说明：相关系数 / 点数量 */}
      <div className="mt-1 flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
        <span>共 {n} 个点</span>
        {Number.isFinite(r) && (
          <span className="inline-flex items-center gap-1">
            相关系数 r =
            <span className="font-mono font-semibold tabular-nums text-primary">{fmt(r, 4)}</span>
            <span className="text-muted-foreground/70">（{r > 0.5 ? '强正相关' : r < -0.5 ? '强负相关' : Math.abs(r) < 0.3 ? '弱相关' : '中等相关'}）</span>
          </span>
        )}
        {regressionLine && (
          <span className="font-mono">
            y = {fmt(regressionLine.slope, 4)}x {regressionLine.intercept >= 0 ? '+' : '−'} {fmt(Math.abs(regressionLine.intercept), 4)}
          </span>
        )}
      </div>
    </div>
  );
}

/** 标准正态分位数（probit）— Acklam 算法。 */
function normsinv(p: number): number {
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const pLow = 0.02425;
  const pHigh = 1 - pLow;
  let q: number, r: number;
  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p <= pHigh) {
    q = p - 0.5;
    r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
}

/**
 * Q-Q 正态概率图：把排序后的数据值 vs 理论标准正态分位数绘图。
 * 若数据近似正态，点会落在一条直线附近；参考线过 Q1/Q3 两点。
 */
function QQPlotChart({ data }: { data: number[] }) {
  const { ref, width } = useMeasureWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  if (data.length < 2) return <ChartEmpty label="需要至少 2 个数据点" />;
  const sorted = [...data].sort((a, b) => a - b);
  const n = sorted.length;
  const pts = sorted.map((v, i) => ({ q: normsinv((i + 0.5) / n), v }));
  const q1 = quantileSorted(sorted, 0.25);
  const q3 = quantileSorted(sorted, 0.75);
  const zq1 = normsinv(0.25);
  const zq3 = normsinv(0.75);
  const slope = zq3 - zq1 !== 0 ? (q3 - q1) / (zq3 - zq1) : 1;
  const intercept = q1 - slope * zq1;

  // 皮尔逊相关系数（Q-Q 线性度，近似正态性指标）
  const mq = pts.reduce((s, p) => s + p.q, 0) / n;
  const mv = pts.reduce((s, p) => s + p.v, 0) / n;
  let cqq = 0, cvv = 0, cqv = 0;
  for (const p of pts) {
    cqq += (p.q - mq) ** 2;
    cvv += (p.v - mv) ** 2;
    cqv += (p.q - mq) * (p.v - mv);
  }
  const r = Math.sqrt(cqq * cvv) > 0 ? cqv / Math.sqrt(cqq * cvv) : NaN;

  const qMin = Math.min(...pts.map((p) => p.q));
  const qMax = Math.max(...pts.map((p) => p.q));
  const vMin = Math.min(...pts.map((p) => p.v));
  const vMax = Math.max(...pts.map((p) => p.v));
  const qPad = (qMax - qMin || 1) * 0.08;
  const vPad = (vMax - vMin || 1) * 0.08;
  const loQ = qMin - qPad;
  const hiQ = qMax + qPad;
  const loV = vMin - vPad;
  const hiV = vMax + vPad;
  const qRange = hiQ - loQ || 1;
  const vRange = hiV - loV || 1;

  const W = Math.max(width, CHART_W);
  const H = CHART_H;
  const plotW = W - CHART_PAD.l - CHART_PAD.r;
  const plotH = H - CHART_PAD.t - CHART_PAD.b;
  const sx = (v: number) => CHART_PAD.l + ((v - loQ) / qRange) * plotW;
  const sy = (v: number) => CHART_PAD.t + plotH - ((v - loV) / vRange) * plotH;
  const normText = Number.isFinite(r)
    ? r >= 0.99 ? '近似正态（r 接近 1）' : r >= 0.95 ? '接近正态' : '偏离正态，需谨慎'
    : '';

  return (
    <div ref={ref} className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 200 }}>
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const qv = loQ + t * qRange;
          const vv = loV + t * vRange;
          return (
            <g key={t}>
              <line x1={sx(qv)} y1={CHART_PAD.t} x2={sx(qv)} y2={CHART_PAD.t + plotH} stroke="currentColor" strokeOpacity={0.06} />
              <line x1={CHART_PAD.l} y1={sy(vv)} x2={W - CHART_PAD.r} y2={sy(vv)} stroke="currentColor" strokeOpacity={0.06} />
              <text x={sx(qv)} y={H - CHART_PAD.b + 12} textAnchor="middle" fontSize={8} fill="currentColor" opacity={0.55}>{fmt(qv, 2)}</text>
              <text x={CHART_PAD.l - 4} y={sy(vv) + 3} textAnchor="end" fontSize={8} fill="currentColor" opacity={0.55}>{fmt(vv, 2)}</text>
            </g>
          );
        })}
        {/* 参考直线（过 Q1/Q3） */}
        <line
          x1={sx(loQ)} y1={sy(slope * loQ + intercept)}
          x2={sx(hiQ)} y2={sy(slope * hiQ + intercept)}
          stroke="#f59e0b" strokeWidth={1.6} strokeDasharray="5 3"
        />
        {/* 数据点 */}
        {pts.map((p, i) => (
          <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <title>{`第 ${i + 1} 个: 值=${fmt(p.v, 4)}, 理论分位 z=${fmt(p.q, 3)}`}</title>
            <circle cx={sx(p.q)} cy={sy(p.v)} r={hover === i ? 4 : 2.6} fill="#2dd4bf" fillOpacity={hover === i ? 1 : 0.8} stroke="#0f766e" strokeWidth={0.6} />
          </g>
        ))}
        <line x1={CHART_PAD.l} y1={CHART_PAD.t} x2={CHART_PAD.l} y2={CHART_PAD.t + plotH} stroke="currentColor" strokeOpacity={0.3} />
        <line x1={CHART_PAD.l} y1={CHART_PAD.t + plotH} x2={W - CHART_PAD.r} y2={CHART_PAD.t + plotH} stroke="currentColor" strokeOpacity={0.3} />
      </svg>
      <div className="mt-1 flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
        <span>共 {n} 个点</span>
        {Number.isFinite(r) && (
          <span className="inline-flex items-center gap-1">
            线性度 r =
            <span className="font-mono font-semibold tabular-nums text-primary">{fmt(r, 4)}</span>
            <span className="text-muted-foreground/70">（{normText}）</span>
          </span>
        )}
      </div>
    </div>
  );
}

function StatChart({ type, data, points, regressionLine, vertical = false, showPoints = false, residuals = false, band = false }: StatChartProps) {
  if (type === 'histogram') return <HistogramChart data={data ?? []} />;
  if (type === 'boxplot') return <BoxPlotChart data={data ?? []} vertical={vertical} showPoints={showPoints} />;
  if (type === 'qq') return <QQPlotChart data={data ?? []} />;
  return <ScatterChart points={points ?? []} regressionLine={regressionLine} residuals={residuals} band={band} />;
}

/* ================================================================== *
 * DataPreviewTable — Excel 风格数据预览
 * 把解析后的原始数据按网格排列成单元格，提供行号、排序、极值高亮与
 * 横向/纵向滚动，方便像表格软件一样逐格观察大数据集。
 * ================================================================== */
type SortMode = 'original' | 'asc' | 'desc';

function DataPreviewTable({ data }: { data: number[] }) {
  const [sortMode, setSortMode] = useState<SortMode>('original');
  const [cols, setCols] = useState(10);
  const [open, setOpen] = useState(true);

  const sorted = useMemo(() => {
    if (sortMode === 'asc') return [...data].sort((a, b) => a - b);
    if (sortMode === 'desc') return [...data].sort((a, b) => b - a);
    return data;
  }, [data, sortMode]);

  const min = useMemo(() => (data.length ? Math.min(...data) : NaN), [data]);
  const max = useMemo(() => (data.length ? Math.max(...data) : NaN), [data]);

  const rows = Math.ceil(sorted.length / cols);
  const cells: (number | null)[] = new Array(rows * cols).fill(null);
  sorted.forEach((v, i) => { cells[i] = v; });

  const sortBtn = (mode: SortMode, label: string) => (
    <button
      type="button"
      onClick={() => setSortMode(mode)}
      className={cn(
        'h-5 px-1.5 rounded text-[10px] font-medium transition-colors',
        sortMode === mode
          ? 'bg-primary/15 text-primary'
          : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="rounded-md border border-border/40 bg-muted/20 overflow-hidden">
      <div className="flex items-center gap-1.5 flex-wrap px-2 py-1.5 border-b border-border/40">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1.5 text-[11px] font-medium text-foreground/85 hover:text-foreground"
        >
          <Table2 className="size-3.5 text-primary" />
          数据预览 ({data.length})
          <ChevronDown className={cn('size-3 transition-transform', open && 'rotate-180')} />
        </button>
        <div className="ml-auto flex items-center gap-1">
          <span className="text-[9.5px] text-muted-foreground">排序</span>
          {sortBtn('original', '原序')}
          {sortBtn('asc', '升序')}
          {sortBtn('desc', '降序')}
          <span className="text-[9.5px] text-muted-foreground ml-1">列数</span>
          <select
            value={cols}
            onChange={(e) => setCols(parseInt(e.target.value, 10) || 10)}
            className="h-5 rounded bg-muted/50 border border-border/50 text-[10px] px-1 outline-none"
          >
            {[5, 8, 10, 12, 16, 20].map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      {open && (
        <div className="overflow-auto max-h-[240px]">
          <table className="w-full border-collapse text-[10.5px] font-mono tabular-nums">
            <thead className="sticky top-0 z-10">
              <tr>
                <th className="sticky left-0 z-20 bg-muted px-1.5 py-1 border border-border/40 text-left text-[9.5px] text-muted-foreground font-medium">
                  #
                </th>
                {Array.from({ length: cols }).map((_, c) => (
                  <th
                    key={c}
                    className="bg-muted px-1.5 py-1 border border-border/40 text-center text-[9.5px] text-muted-foreground font-medium"
                  >
                    {c + 1}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: rows }).map((_, r) => (
                <tr key={r}>
                  <td className="sticky left-0 bg-muted px-1.5 py-1 border border-border/40 text-right text-[9.5px] text-muted-foreground">
                    {r * cols + 1}
                  </td>
                  {Array.from({ length: cols }).map((_, c) => {
                    const v = cells[r * cols + c];
                    if (v === null) {
                      return <td key={c} className="px-1.5 py-1 border border-border/40" />;
                    }
                    const isMin = data.length > 1 && v === min;
                    const isMax = data.length > 1 && v === max;
                    return (
                      <td
                        key={c}
                        className={cn(
                          'px-1 py-1 border border-border/30 text-center',
                          isMin && 'bg-emerald-500/25 text-emerald-700 dark:text-emerald-300 font-semibold shadow-[inset_0_0_0_1px_rgba(16,185,129,0.5)]',
                          isMax && 'bg-rose-500/25 text-rose-700 dark:text-rose-300 font-semibold shadow-[inset_0_0_0_1px_rgba(244,63,94,0.5)]',
                        )}
                        title={isMin ? '最小值' : isMax ? '最大值' : undefined}
                      >
                        {fmt(v, 5)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ================================================================== *
 * Distribution definitions
 * ================================================================== */
type DistType =
  | 'normal'
  | 'poisson'
  | 'binomial'
  | 'exponential'
  | 'uniform'
  | 'chisquare'
  | 'tdist'
  | 'fdist'
  | 'geometric'
  | 'negbinomial';

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
  chisquare: [{ key: 'df', label: 'df (自由度)', default: 5, min: 0.0001 }],
  tdist: [{ key: 'df', label: 'df (自由度)', default: 10, min: 0.0001 }],
  fdist: [
    { key: 'd1', label: 'd1 (分子自由度)', default: 5, min: 0.0001 },
    { key: 'd2', label: 'd2 (分母自由度)', default: 10, min: 0.0001 },
  ],
  geometric: [{ key: 'p', label: 'p (成功概率)', default: 0.3, min: 0.0001, max: 1 }],
  negbinomial: [
    { key: 'r', label: 'r (成功次数)', default: 3, step: 1, min: 1 },
    { key: 'p', label: 'p (成功概率)', default: 0.5, min: 0.0001, max: 1 },
  ],
};

/* ================================================================== *
 * MAIN COMPONENT
 * ================================================================== */
export function StatisticsPanel() {
  return (
    <div className="h-full flex flex-col bg-card/30">
      <Tabs defaultValue="descriptive" className="flex-1 flex flex-col min-h-0 gap-0">
        <div className="shrink-0 px-3 pt-2.5 pb-2 border-b border-border/60">
          <TabsList className="grid grid-cols-4 w-full h-7 text-[10.5px]">
            <TabsTrigger value="descriptive" className="text-[10.5px] gap-1">
              <Sigma className="size-3" />
              描述统计
            </TabsTrigger>
            <TabsTrigger value="distribution" className="text-[10.5px] gap-1">
              <BarChart3 className="size-3" />
              概率分布
            </TabsTrigger>
            <TabsTrigger value="hypothesis" className="text-[10.5px] gap-1">
              <FlaskConical className="size-3" />
              假设检验
            </TabsTrigger>
            <TabsTrigger value="regression" className="text-[10.5px] gap-1">
              <TrendingUp className="size-3" />
              回归分析
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
        <TabsContent value="regression" className="flex-1 min-h-0 overflow-auto mt-0">
          <RegressionTab />
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
  se: number;
  ciLo: number;
  ciHi: number;
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

  // 标准误（均值的标准误差）与 95% 置信区间（t 分布，df = n-1）
  const se = n > 1 ? std / Math.sqrt(n) : NaN;
  const tc = n > 1 ? tCritical(0.05, n - 1) : NaN;
  const ciLo = Number.isFinite(tc) ? mean - tc * se : mean;
  const ciHi = Number.isFinite(tc) ? mean + tc * se : mean;

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
    se,
    ciLo,
    ciHi,
  };
}

interface FiveNumSummary {
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
  outliers: number[];
}

function fiveNumSummary(data: number[]): FiveNumSummary | null {
  if (data.length < 2) return null;
  const sorted = [...data].sort((a, b) => a - b);
  const q1 = quantileSorted(sorted, 0.25);
  const median = quantileSorted(sorted, 0.5);
  const q3 = quantileSorted(sorted, 0.75);
  const iqr = q3 - q1;
  const loFence = q1 - 1.5 * iqr;
  const hiFence = q3 + 1.5 * iqr;
  const outliers = sorted.filter((v) => v < loFence || v > hiFence);
  return {
    min: Math.min(...sorted),
    q1,
    median,
    q3,
    max: Math.max(...sorted),
    outliers,
  };
}

interface DistSummary {
  skewLabel: string;
  cvLabel: string;
  jbLabel: string;
}

function computeDistSummary(r: DescResult): DistSummary {
  const skew = (r.mean - r.median) / (r.std || 1);
  let skewLabel = '近似对称';
  if (skew > 0.2) skewLabel = '正偏态 (均值>中位数, 右尾较长)';
  else if (skew < -0.2) skewLabel = '负偏态 (均值<中位数, 左尾较长)';

  let cvLabel = '—';
  if (Math.abs(r.mean) > 1e-12) {
    const cv = r.std / Math.abs(r.mean);
    if (cv < 0.1) cvLabel = '高度集中 (CV < 0.1)';
    else if (cv <= 0.3) cvLabel = `中等变异 (CV=${fmt(cv, 3)})`;
    else cvLabel = `离散度较大 (CV=${fmt(cv, 3)})`;
  }

  const n = r.count;
  const s = r.skewness;
  const k = r.kurtosis; // excess kurtosis
  const jb = n > 0 ? (s * s) / 6 + (k * k) / 24 : 0;
  const jbLabel = jb < 6 ? `近似正态 (JB=${fmt(jb, 3)} < 6)` : `与正态显著偏离 (JB=${fmt(jb, 3)} ≥ 6)`;

  return { skewLabel, cvLabel, jbLabel };
}

export function DescriptiveStatsTab({ fullscreen = false }: { fullscreen?: boolean }) {
  const [input, setInput] = useState('1.2, 2.3, 3.1, 4.5, 2.8, 3.7, 5.1, 2.9, 3.4, 4.0');
  const parsed = useMemo(() => parseNumericInput(input), [input]);
  const data = parsed.numbers;
  const invalidItems = parsed.invalid;
  const result = useMemo(() => computeDescriptive(data), [data]);

  const [chartType, setChartType] = useState<ChartType | null>(fullscreen ? 'histogram' : null);
  const [histZoomed, setHistZoomed] = useState(false);
  const [binRule, setBinRule] = useState<BinRule>('sturges');
  const [density, setDensity] = useState(false);
  const [cumulative, setCumulative] = useState(false);
  const [showHistPoints, setShowHistPoints] = useState(false);
  const [boxVertical, setBoxVertical] = useState(false);
  const [showBoxPoints, setShowBoxPoints] = useState(false);
  const [copied, setCopied] = useState(false);
  const [quantileP, setQuantileP] = useState(50);

  const [datasets, setDatasets] = useState<SavedDataset[]>([]);
  const [showDatasets, setShowDatasets] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refreshDatasets = useCallback(() => {
    setDatasets(loadDatasets());
  }, []);

  useEffect(() => {
    refreshDatasets();
  }, [refreshDatasets]);

  const handleSaveDataset = () => {
    if (data.length === 0) {
      toast.warning('没有数据可保存');
      return;
    }
    const name = window.prompt('请输入数据集名称', `数据集 ${datasets.length + 1}`);
    if (!name || !name.trim()) return;
    saveDataset(name.trim(), data);
    refreshDatasets();
    toast.success('数据集已保存');
  };

  const handleLoadDataset = (ds: SavedDataset) => {
    setInput(ds.data.join(', '));
    toast.success('数据集已载入');
  };

  const handleDeleteDataset = (name: string) => {
    deleteDataset(name);
    refreshDatasets();
    toast.success('数据集已删除');
  };

  const handleExportDataset = (ds: SavedDataset) => {
    exportDatasetCSV(ds.name, ds.data);
  };

  const handleImportCSV = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      const nums = parseCSVNumbers(text);
      if (nums.length === 0) {
        toast.error('CSV 中未找到有效数字');
      } else {
        setInput(nums.join(', '));
        toast.success(`已导入 ${nums.length} 个数据点`);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleParsePaste = () => {
    const r = parseNumericInput(input);
    if (r.invalid.length > 0) {
      toast.warning(`识别 ${r.numbers.length} 个数字，跳过 ${r.invalid.length} 项非法`);
    } else {
      toast.success(`识别 ${r.numbers.length} 个数字`);
    }
    if (r.numbers.length > 0) {
      setInput(r.numbers.join(', '));
    }
  };

  const handlePreset = (key: PresetKey) => {
    const ds = generatePreset(key);
    setInput(ds.join(', '));
    toast.success(`已载入 ${PRESET_LABELS[key]}`);
  };

  const handleClear = () => {
    setInput('');
    setHistZoomed(false);
  };

  const stats = useMemo<{ label: string; value: number | undefined; latex?: string }[]>(
    () =>
      result
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
            { label: '标准误 SE', value: result.se },
            { label: '95% CI 下限', value: result.ciLo },
            { label: '95% CI 上限', value: result.ciHi },
          ]
        : [],
    [result],
  );

  const scatterPoints = useMemo(
    () => data.map((v, i) => ({ x: i + 1, y: v })),
    [data],
  );

  const five = useMemo(() => (result ? fiveNumSummary(data) : null), [data, result]);
  const distSummary = useMemo(() => (result ? computeDistSummary(result) : null), [result]);

  // 分位数查询：输入 0–100 的百分位，返回对应数据值。
  const quantileValue = useMemo(() => {
    if (data.length === 0) return null;
    const p = Math.min(100, Math.max(0, quantileP)) / 100;
    const sortedAsc = [...data].sort((a, b) => a - b);
    return quantileSorted(sortedAsc, p);
  }, [data, quantileP]);

  // 众数：出现次数最多的值（可多个）。
  const mode = useMemo(() => {
    if (data.length === 0) return null;
    const count = new Map<number, number>();
    for (const v of data) count.set(v, (count.get(v) ?? 0) + 1);
    let max = 0;
    for (const c of count.values()) max = Math.max(max, c);
    if (max <= 1) return '无（所有值唯一）';
    const modes = [...count.entries()].filter(([, c]) => c === max).map(([v]) => v);
    return modes.map((v) => fmt(v, 4)).join(', ');
  }, [data]);

  const highlights = useMemo(() => {
    if (!result) return [];
    const list: string[] = [];
    list.push(
      `均值 x̄=${fmt(result.mean)}，中位数=${fmt(result.median)}，标准差 s=${fmt(result.std)}`,
    );
    list.push(`数据范围 [${fmt(result.min)} .. ${fmt(result.max)}]（共 ${result.count} 个观测）`);
    if (Number.isFinite(result.se)) {
      list.push(`均值 95% 置信区间 [${fmt(result.ciLo, 4)} .. ${fmt(result.ciHi, 4)}]（标准误 ${fmt(result.se, 4)}）`);
    }
    if (distSummary) {
      const skewText =
        result.skewness > 0.2 ? '正偏（右尾较长）' : result.skewness < -0.2 ? '负偏（左尾较长）' : '近似对称';
      list.push(`偏度≈${fmt(result.skewness, 3)}，呈${skewText}；峰度≈${fmt(result.kurtosis, 3)}`);
    }
    return list;
  }, [result, distSummary]);

  const handleCopyStats = useCallback(async () => {
    if (!result) return;
    const lines = [
      '统计结果',
      `样本数 n = ${result.count}`,
      ...stats.map((s) => `${s.label}: ${fmt(s.value ?? 0)}`),
    ];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopied(true);
      toast.success('统计结果已复制');
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('复制失败');
    }
  }, [result, stats]);

  const rangeBadge = useMemo(() => {
    if (!result) return null;
    const okMin = Number.isFinite(result.min);
    const okMax = Number.isFinite(result.max);
    if (!okMin || !okMax) return null;
    return `[${fmt(result.min, 3)}..${fmt(result.max, 3)}]`;
  }, [result]);

  // 图表区 — 全屏模式下独立成右侧栏（避免留白），侧边栏模式内嵌在底部。
  const chartSection = result ? (
    <div className="space-y-2">
      <div className="flex gap-1">
        {(
          [
            ['histogram', '直方图', BarChart3],
            ['boxplot', '箱线图', Box],
            ['scatter', '散点图', ChartScatter],
          ] as const
        ).map(([t, label, Icon]) => (
          <Button
            key={t}
            variant={chartType === t ? 'default' : 'outline'}
            size="sm"
            className="flex-1 h-7 text-[10.5px] gap-1"
            onClick={() => setChartType(chartType === t ? null : t)}
          >
            <Icon className="size-3" />
            {label}
          </Button>
        ))}
      </div>
      <AnimatePresence>
        {chartType && (
          <motion.div
            key={chartType}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="rounded-md border border-border/40 bg-background/30 p-1.5 text-foreground space-y-2"
          >
            {chartType === 'histogram' && (
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-2">
                <div className="relative">
                  <div className="flex items-center justify-between mb-1 px-1">
                    <div className="text-[10.5px] text-muted-foreground">
                      {density ? '概率密度直方图' : '频数直方图'}
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                      <select
                        value={binRule === 'sturges' ? 'sturges' : binRule === 'sqrt' ? 'sqrt' : binRule === 'fd' ? 'fd' : 'custom'}
                        onChange={(e) => {
                          const v = e.target.value;
                          setBinRule(v === 'sturges' ? 'sturges' : v === 'sqrt' ? 'sqrt' : v === 'fd' ? 'fd' : 'sturges');
                        }}
                        className="h-5 rounded border border-border/50 bg-muted/40 px-1 text-[10px] outline-none"
                        title="箱数规则"
                      >
                        <option value="sturges">Sturges</option>
                        <option value="sqrt">√n</option>
                        <option value="fd">Freedman-Diaconis</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => setDensity((v) => !v)}
                        className={cn(
                          'h-5 px-1.5 rounded text-[10px] border transition-colors',
                          density ? 'border-primary/50 bg-primary/10 text-primary' : 'border-border/50 text-muted-foreground hover:bg-accent/60',
                        )}
                        title="切换频数 / 概率密度"
                      >
                        密度
                      </button>
                      <button
                        type="button"
                        onClick={() => setCumulative((v) => !v)}
                        className={cn(
                          'h-5 px-1.5 rounded text-[10px] border transition-colors',
                          cumulative ? 'border-violet-500/50 bg-violet-500/10 text-violet-500' : 'border-border/50 text-muted-foreground hover:bg-accent/60',
                        )}
                        title="叠加累计分布 (ECDF)"
                      >
                        累计
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowHistPoints((v) => !v)}
                        className={cn(
                          'h-5 px-1.5 rounded text-[10px] border transition-colors',
                          showHistPoints ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-500' : 'border-border/50 text-muted-foreground hover:bg-accent/60',
                        )}
                        title="在底部叠加每个数据点 (rug)"
                      >
                        数据点
                      </button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 text-[10px] px-1.5 gap-0.5"
                        onClick={() => setHistZoomed((z) => !z)}
                        title="缩放到合适范围 (y 轴 × 1.15)"
                      >
                        <ZoomIn className="size-3" />
                        {histZoomed ? '已缩放' : '↕ Zoom'}
                      </Button>
                    </div>
                  </div>
                  <HistogramChart
                    data={data}
                    zoomed={histZoomed}
                    binRule={binRule}
                    density={density}
                    cumulative={cumulative}
                    showPoints={showHistPoints}
                  />
                </div>
                {distSummary && (
                  <div className="grid grid-cols-1 gap-2 text-xs rounded-md border border-border/40 bg-muted/20 p-2 lg:w-[220px]">
                    <div className="text-[10.5px] font-medium text-muted-foreground">分布摘要</div>
                    <div className="space-y-1">
                      <div className="rounded bg-background/40 px-2 py-1.5">
                        <div className="text-[10px] text-muted-foreground">偏态</div>
                        <div className="text-[11px] font-medium tabular-nums">{distSummary.skewLabel}</div>
                      </div>
                      <div className="rounded bg-background/40 px-2 py-1.5">
                        <div className="text-[10px] text-muted-foreground">离散度 CV</div>
                        <div className="text-[11px] font-medium tabular-nums">{distSummary.cvLabel}</div>
                      </div>
                      <div className="rounded bg-background/40 px-2 py-1.5">
                        <div className="text-[10px] text-muted-foreground">粗略正态性 (JB)</div>
                        <div className="text-[11px] font-medium tabular-nums">{distSummary.jbLabel}</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {chartType === 'boxplot' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <div className="text-[10.5px] text-muted-foreground">箱线图</div>
                  <button
                    type="button"
                    onClick={() => setBoxVertical((v) => !v)}
                    className={cn(
                      'h-5 px-1.5 rounded text-[10px] border transition-colors',
                      boxVertical ? 'border-primary/50 bg-primary/10 text-primary' : 'border-border/50 text-muted-foreground hover:bg-accent/60',
                    )}
                    title="切换水平 / 垂直方向"
                  >
                    {boxVertical ? '垂直' : '水平'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowBoxPoints((v) => !v)}
                    className={cn(
                      'h-5 px-1.5 rounded text-[10px] border transition-colors',
                      showBoxPoints ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-500' : 'border-border/50 text-muted-foreground hover:bg-accent/60',
                    )}
                    title="叠加每个数据点 (strip)"
                  >
                    数据点
                  </button>
                </div>
                <StatChart type="boxplot" data={data} vertical={boxVertical} showPoints={showBoxPoints} />
                {five && (
                  <>
                    <div className="grid grid-cols-5 gap-2 text-center text-xs">
                      {[
                        ['min', five.min],
                        ['Q1', five.q1],
                        ['median', five.median],
                        ['Q3', five.q3],
                        ['max', five.max],
                      ].map(([lbl, v]) => (
                        <div
                          key={lbl}
                          className="rounded-md border border-border/40 bg-muted/30 px-1.5 py-1.5"
                        >
                          <div className="text-[9.5px] text-muted-foreground">{lbl}</div>
                          <div className="text-[11px] font-mono font-semibold tabular-nums text-primary">
                            {fmt(v as number, 4)}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="text-[10.5px] px-1">
                      {five.outliers.length > 0 ? (
                        <div className="text-rose-600 dark:text-rose-400">
                          离群点：
                          {five.outliers.map((o, i) => (
                            <span
                              key={i}
                              className="inline-block font-mono tabular-nums bg-rose-500/10 rounded px-1 mx-0.5"
                            >
                              x={fmt(o, 3)}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <div className="text-muted-foreground">无离群点</div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            {chartType === 'scatter' && (
              <StatChart type="scatter" points={scatterPoints} />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  ) : null;

  return (
    <div className={cn('space-y-3', fullscreen ? 'grid grid-cols-1 xl:grid-cols-[1fr_400px] gap-4 p-3' : 'p-3')}>
      <div className="space-y-3 min-w-0">
      {/* ===== Task 10a: 实时预览徽章 ===== */}
      <div className="flex flex-wrap gap-1.5 items-center">
        <Badge variant="secondary" className="text-[10.5px] gap-1">
          <span className="text-emerald-600 dark:text-emerald-400">●</span>
          已识别 {data.length}
        </Badge>
        {invalidItems.length > 0 ? (
          <Popover>
            <PopoverTrigger asChild>
              <Badge variant="destructive" className="text-[10.5px] cursor-pointer gap-1">
                跳过 {invalidItems.length} 项非法
              </Badge>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-2 text-[11px]">
              <div className="text-[10.5px] text-muted-foreground mb-1">非法项列表：</div>
              <div className="flex flex-wrap gap-1 max-h-[120px] overflow-auto">
                {invalidItems.map((it, i) => (
                  <span
                    key={i}
                    className="bg-rose-500/15 text-rose-600 dark:text-rose-400 rounded px-1.5 py-0.5 text-[10px] font-mono"
                  >
                    {it}
                  </span>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        ) : (
          <Badge variant="outline" className="text-[10.5px] opacity-70">
            跳过 0 非法
          </Badge>
        )}
        {rangeBadge && (
          <Badge variant="outline" className="text-[10.5px] font-mono tabular-nums">
            范围 {rangeBadge}
          </Badge>
        )}
      </div>

      {/* ===== 数据输入区 ===== */}
      <div>
        <label className="text-[11px] text-muted-foreground mb-1 block">
          数据（逗号/空格/换行/分号/Tab 分隔）
        </label>
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="例如: 1.2, 2.3, 3.1, 4.5 或粘贴 Excel 列"
          className="min-h-[80px] text-[12px] font-mono resize-y focus-visible:ring-2 focus-visible:ring-ring"
        />

        {/* ===== Task 10a: 按钮行 ===== */}
        <div className="mt-1.5 flex flex-wrap gap-1 items-center">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-[10.5px] gap-1 px-2"
            onClick={handleParsePaste}
          >
            <ClipboardList className="size-3.5" />
            解析粘贴文本
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-[10.5px] gap-1 px-2"
              >
                <Sparkles className="size-3.5" />
                示例数据
                <ChevronDown className="size-3 opacity-70" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-[260px]">
              {(['height', 'exam', 'dice', 'normal'] as PresetKey[]).map((k) => (
                <DropdownMenuItem
                  key={k}
                  className="text-[11.5px]"
                  onClick={() => handlePreset(k)}
                >
                  {PRESET_LABELS[k]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-[10.5px] gap-1 px-2 text-muted-foreground hover:text-rose-600 dark:hover:text-rose-400"
            onClick={handleClear}
          >
            <Trash2 className="size-3.5" />
            清空
          </Button>
        </div>
      </div>

      {/* Dataset recording section (Task 10) */}
      <div className="rounded-md border border-border/40 bg-muted/20 p-2 space-y-1.5">
        <div className="flex items-center justify-between gap-1">
          <span className="text-[11px] text-muted-foreground flex items-center gap-1.5">
            <Save className="size-3" />
            数据集 ({datasets.length})
          </span>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-[10px] gap-1 px-1.5"
              onClick={handleSaveDataset}
            >
              <Save className="size-3" />
              保存当前数据
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-[10px] gap-1 px-1.5"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="size-3" />
              导入 CSV
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[10px] px-1.5"
              onClick={() => setShowDatasets((s) => !s)}
            >
              {showDatasets ? '收起' : '展开'}
            </Button>
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={handleImportCSV}
        />
        <AnimatePresence>
          {showDatasets && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {datasets.length === 0 ? (
                <div className="text-[10.5px] text-muted-foreground py-2 text-center">
                  暂无保存的数据集
                </div>
              ) : (
                <div className="space-y-1 max-h-[160px] overflow-auto">
                  {datasets.map((ds) => (
                    <div
                      key={ds.name}
                      className="flex items-center justify-between gap-1 rounded bg-background/40 px-1.5 py-1"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-[10.5px] font-medium truncate">{ds.name}</div>
                        <div className="text-[9.5px] text-muted-foreground">
                          {ds.data.length} 个 · {new Date(ds.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                      <div className="flex gap-0.5 shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-1.5 text-[10px]"
                          onClick={() => handleLoadDataset(ds)}
                        >
                          载入
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-1.5 text-[10px]"
                          onClick={() => handleExportDataset(ds)}
                        >
                          <Download className="size-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-1.5 text-[10px] text-rose-500"
                          onClick={() => handleDeleteDataset(ds.name)}
                        >
                          <Trash2 className="size-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ===== Task 10c: Excel 风格数据预览 ===== */}
      {data.length > 0 && <DataPreviewTable data={data} />}

      <AnimatePresence mode="wait">
        {result ? (
          <motion.div
            key="result"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="rounded-md border border-primary/30 bg-primary/5 p-2.5 glow-card-teal"
          >
            <div className="text-[11px] text-muted-foreground mb-2 flex items-center gap-1.5">
              <Calculator className="size-3" />
              统计结果 ({result.count} 个数据点)
              <Button
                variant="outline"
                size="sm"
                className="ml-auto h-5 px-1.5 text-[10px] gap-1"
                onClick={handleCopyStats}
              >
                {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
                {copied ? '已复制' : '复制全部'}
              </Button>
            </div>
            {highlights.length > 0 && (
              <div className="rounded-md border border-border/60 bg-muted/30 p-2 mb-2 space-y-1">
                <div className="text-[10.5px] text-muted-foreground flex items-center gap-1.5">
                  <Sparkles className="size-3" />
                  摘要亮点
                </div>
                <ul className="space-y-0.5 text-[11px] text-foreground/85">
                  {highlights.map((h, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <span className="text-primary mt-0.5 shrink-0">•</span>
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
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
            <div className="rounded-md border border-border/60 bg-muted/30 p-2 mt-2 space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="text-[10.5px] text-muted-foreground shrink-0">众数</span>
                <span className="text-[11px] font-mono tabular-nums text-primary truncate">{mode ?? '—'}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10.5px] text-muted-foreground shrink-0">分位数</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={quantileP}
                  onChange={(e) => setQuantileP(parseFloat(e.target.value) || 0)}
                  className="h-5 w-14 rounded border border-border/50 bg-background/40 px-1 text-[10.5px] font-mono tabular-nums outline-none"
                />
                <span className="text-[10.5px] text-muted-foreground">% →</span>
                <span className="text-[11px] font-mono font-semibold tabular-nums text-primary">
                  {quantileValue === null ? '—' : fmt(quantileValue, 4)}
                </span>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="rounded-md border border-border/40 bg-muted/20 p-6 text-center text-[11.5px] text-muted-foreground"
          >
            请输入至少一个有效数字
          </motion.div>
        )}
      </AnimatePresence>

      {/* 图表区 — 侧边栏模式内嵌在底部 */}
      {!fullscreen && chartSection}
      </div>

      {/* 图表区 — 全屏模式独立右侧栏，填满空白 */}
      {fullscreen && chartSection}
    </div>
  );
}

/* ================================================================== *
 * TAB 2 — Probability Distribution
 * ================================================================== */

// 独立于组件的 PDF 求值函数 — 供实时预览曲线采样使用（与 computePdf 逻辑一致）。
function distPdf(distType: DistType, x: number, p: Record<string, number>): number {
  const get = (k: string) => p[k] ?? 0;
  switch (distType) {
    case 'normal': {
      const mu = get('mu');
      const sigma = get('sigma');
      return (1 / (sigma * Math.sqrt(2 * Math.PI))) * Math.exp(-((x - mu) ** 2) / (2 * sigma ** 2));
    }
    case 'poisson': {
      const l = get('lambda');
      const k = Math.round(x);
      if (k < 0) return 0;
      return (Math.pow(l, k) * Math.exp(-l)) / math.factorial(k);
    }
    case 'binomial': {
      const n = Math.round(get('n'));
      const q = get('p');
      const k = Math.round(x);
      if (k < 0 || k > n) return 0;
      const c = math.combinations(n, k) as number;
      return c * Math.pow(q, k) * Math.pow(1 - q, n - k);
    }
    case 'exponential': {
      const l = get('lambda');
      return x < 0 ? 0 : l * Math.exp(-l * x);
    }
    case 'uniform': {
      const a = get('a');
      const b = get('b');
      return x >= a && x <= b ? 1 / (b - a) : 0;
    }
    case 'chisquare': {
      const df = get('df');
      if (x <= 0 || df <= 0) return 0;
      const a = df / 2;
      return Math.exp((a - 1) * Math.log(x) - x / 2 - a * Math.log(2) - logGamma(a));
    }
    case 'tdist': {
      const df = get('df');
      if (df <= 0) return NaN;
      const a = (df + 1) / 2;
      return Math.exp(logGamma(a) - 0.5 * Math.log(df * Math.PI) - logGamma(df / 2) - a * Math.log(1 + (x * x) / df));
    }
    case 'fdist': {
      const d1 = get('d1');
      const d2 = get('d2');
      if (x <= 0 || d1 <= 0 || d2 <= 0) return 0;
      const logB = logGamma(d1 / 2) + logGamma(d2 / 2) - logGamma((d1 + d2) / 2);
      return Math.exp(
        -logB + (d1 / 2) * Math.log(d1 / d2) + (d1 / 2 - 1) * Math.log(x) - ((d1 + d2) / 2) * Math.log(1 + (d1 * x) / d2),
      );
    }
    case 'geometric': {
      const q = get('p');
      const k = Math.round(x);
      if (k < 1 || q <= 0 || q >= 1) return 0;
      return q * Math.pow(1 - q, k - 1);
    }
    case 'negbinomial': {
      const r = get('r');
      const q = get('p');
      const k = Math.round(x);
      if (k < 0 || r <= 0 || q <= 0 || q >= 1) return 0;
      return Math.exp(logGamma(r + k) - logGamma(k + 1) - logGamma(r) + r * Math.log(q) + k * Math.log(1 - q));
    }
  }
}

// 与 handleSendToPlot 一致的 x 轴自适应范围。
function distXRange(distType: DistType, p: Record<string, number>): [number, number] {
  const get = (k: string) => p[k] ?? 0;
  switch (distType) {
    case 'normal': { const mu = get('mu'); const sigma = get('sigma') || 1; return [mu - 4 * sigma, mu + 4 * sigma]; }
    case 'poisson': { const l = Math.max(1, get('lambda')); return [0, l + 4 * Math.sqrt(l) + 5]; }
    case 'binomial': { return [0, Math.max(1, Math.round(get('n')))]; }
    case 'exponential': { const l = Math.max(0.01, get('lambda')); return [0, 5 / l]; }
    case 'uniform': { return [get('a') - 0.5, get('b') + 0.5]; }
    case 'chisquare': { const df = get('df'); return [0, Math.max(10, df + 4 * Math.sqrt(2 * df))]; }
    case 'tdist': { const df = get('df'); const span = Math.max(4, 2 + 8 / Math.sqrt(df || 1)); return [-span, span]; }
    case 'fdist': { const d1 = get('d1'); return [0, Math.max(8, 3 * d1)]; }
    case 'geometric': { const q = Math.max(0.01, get('p')); return [0, Math.max(10, 5 / q)]; }
    case 'negbinomial': { const r = get('r'); const q = Math.max(0.01, get('p')); return [0, Math.max(10, (r * (1 - q)) / q + 5)]; }
    default: return [-5, 5];
  }
}

// 实时分布曲线预览 — 全屏模式下右侧栏展示，参数变更即时重绘。
function DistributionPreview({ distType, params }: { distType: DistType; params: Record<string, number> }) {
  const isDiscrete =
    distType === 'poisson' || distType === 'binomial' || distType === 'geometric' || distType === 'negbinomial';
  const W = 340;
  const H = 190;
  const PAD = 12;

  const { poly, stems, baseline } = useMemo(() => {
    const [x0, x1] = distXRange(distType, params);
    const span = Math.max(1e-6, x1 - x0);
    let maxY = 0;
    const samples: { x: number; y: number }[] = [];
    if (isDiscrete) {
      const start = Math.ceil(x0);
      const end = Math.floor(x1);
      for (let k = start; k <= end; k++) {
        const y = distPdf(distType, k, params);
        if (isFinite(y)) { samples.push({ x: k, y }); if (y > maxY) maxY = y; }
      }
    } else {
      const N = 240;
      for (let i = 0; i <= N; i++) {
        const x = x0 + (span * i) / N;
        const y = distPdf(distType, x, params);
        if (isFinite(y)) { samples.push({ x, y }); if (y > maxY) maxY = y; }
      }
    }
    const yScale = maxY > 0 ? maxY * 1.08 : 1;
    const px = (x: number) => PAD + ((x - x0) / span) * (W - 2 * PAD);
    const py = (y: number) => H - PAD - (y / yScale) * (H - 2 * PAD);
    const baseline = H - PAD;
    const poly = samples.map((s) => `${px(s.x).toFixed(1)},${py(s.y).toFixed(1)}`).join(' ');
    const stems = isDiscrete
      ? samples.map((s) => ({ x: px(s.x).toFixed(1), y0: baseline, y1: py(s.y).toFixed(1) }))
      : [];
    return { poly, stems, baseline };
  }, [distType, params, isDiscrete]);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="pdf-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="oklch(0.7 0.15 165 / 0.35)" />
          <stop offset="100%" stopColor="oklch(0.7 0.15 165 / 0.02)" />
        </linearGradient>
      </defs>
      <line x1={PAD} y1={baseline} x2={W - PAD} y2={baseline} stroke="currentColor" strokeOpacity="0.15" strokeWidth="1" />
      {isDiscrete ? (
        <>
          {stems.map((s, i) => (
            <line key={i} x1={s.x} y1={s.y0} x2={s.x} y2={s.y1} stroke="oklch(0.7 0.15 165)" strokeWidth="2" strokeLinecap="round" />
          ))}
          {stems.map((s, i) => (
            <circle key={i} cx={s.x} cy={s.y1} r="2.5" fill="oklch(0.7 0.15 165)" />
          ))}
        </>
      ) : (
        <>
          <polygon points={`${PAD},${baseline} ${poly} ${W - PAD},${baseline}`} fill="url(#pdf-fill)" />
          <polyline points={poly} fill="none" stroke="oklch(0.7 0.15 165)" strokeWidth="2" strokeLinejoin="round" />
        </>
      )}
    </svg>
  );
}

export function DistributionTab({ fullscreen = false }: { fullscreen?: boolean }) {
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
    df: 5,
    d1: 5,
    d2: 10,
    r: 3,
  }));
  const [xValue, setXValue] = useState(1.96);
  const [pdfResult, setPdfResult] = useState<number | null>(null);
  const [cdfResult, setCdfResult] = useState<number | null>(null);
  const [randomNumbers, setRandomNumbers] = useState<number[]>([]);
  const [randCopied, setRandCopied] = useState(false);

  const handleDistChange = (v: string) => {
    setDistType(v as DistType);
    setPdfResult(null);
    setCdfResult(null);
    setRandomNumbers([]);
  };

  const getParam = (key: string) => paramValues[key] ?? 0;
  const setParam = (key: string, val: number) =>
    setParamValues((prev) => ({ ...prev, [key]: val }));

  const isDiscrete =
    distType === 'poisson' ||
    distType === 'binomial' ||
    distType === 'geometric' ||
    distType === 'negbinomial';
  const pdfLabel = isDiscrete ? 'PMF P(X=k)' : 'PDF f(x)';
  const cdfLabel = 'CDF P(X≤x)';
  const distTypeLabel: Record<DistType, string> = {
    normal: 'N(μ, σ²)',
    poisson: 'Po(λ)',
    binomial: 'B(n, p)',
    exponential: 'Exp(λ)',
    uniform: 'U(a, b)',
    chisquare: 'χ²(df)',
    tdist: 't(df)',
    fdist: 'F(d₁, d₂)',
    geometric: 'Geo(p)',
    negbinomial: 'NB(r, p)',
  };

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
      case 'chisquare': {
        const df = getParam('df');
        if (x <= 0 || df <= 0) return 0;
        const a = df / 2;
        const logPdf = (a - 1) * Math.log(x) - x / 2 - a * Math.log(2) - logGamma(a);
        return Math.exp(logPdf);
      }
      case 'tdist': {
        const df = getParam('df');
        if (df <= 0) return NaN;
        const a = (df + 1) / 2;
        const logPdf =
          logGamma(a) - 0.5 * Math.log(df * Math.PI) - logGamma(df / 2) - a * Math.log(1 + (x * x) / df);
        return Math.exp(logPdf);
      }
      case 'fdist': {
        const d1 = getParam('d1');
        const d2 = getParam('d2');
        if (x <= 0 || d1 <= 0 || d2 <= 0) return 0;
        const logB = logGamma(d1 / 2) + logGamma(d2 / 2) - logGamma((d1 + d2) / 2);
        const logPdf =
          -logB +
          (d1 / 2) * Math.log(d1 / d2) +
          (d1 / 2 - 1) * Math.log(x) -
          ((d1 + d2) / 2) * Math.log(1 + (d1 * x) / d2);
        return Math.exp(logPdf);
      }
      case 'geometric': {
        const p = getParam('p');
        const k = Math.round(x);
        if (k < 1 || p <= 0 || p >= 1) return 0;
        return p * Math.pow(1 - p, k - 1);
      }
      case 'negbinomial': {
        const r = getParam('r');
        const p = getParam('p');
        const k = Math.round(x);
        if (k < 0 || r <= 0 || p <= 0 || p >= 1) return 0;
        const logPmf =
          logGamma(r + k) - logGamma(k + 1) - logGamma(r) + r * Math.log(p) + k * Math.log(1 - p);
        return Math.exp(logPmf);
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
      case 'chisquare': {
        const df = getParam('df');
        if (df <= 0) return NaN;
        if (x <= 0) return 0;
        return gammp(df / 2, x / 2);
      }
      case 'tdist': {
        const df = getParam('df');
        if (df <= 0) return NaN;
        const xx = df / (df + x * x);
        const ib = incompleteBeta(xx, df / 2, 0.5);
        return x > 0 ? 1 - 0.5 * ib : 0.5 * ib;
      }
      case 'fdist': {
        const d1 = getParam('d1');
        const d2 = getParam('d2');
        if (d1 <= 0 || d2 <= 0) return NaN;
        if (x <= 0) return 0;
        return incompleteBeta((d1 * x) / (d1 * x + d2), d1 / 2, d2 / 2);
      }
      case 'geometric': {
        const p = getParam('p');
        if (p <= 0 || p >= 1) return NaN;
        const k = Math.floor(x);
        if (k < 1) return 0;
        return 1 - Math.pow(1 - p, k);
      }
      case 'negbinomial': {
        const r = getParam('r');
        const p = getParam('p');
        if (r <= 0 || p <= 0 || p >= 1) return NaN;
        const k = Math.floor(x);
        if (k < 0) return 0;
        return incompleteBeta(p, r, k + 1);
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
        case 'chisquare': {
          const df = getParam('df');
          let sum = 0;
          const idf = Math.floor(df);
          for (let j = 0; j < idf; j++) {
            const u1 = Math.random();
            const u2 = Math.random();
            const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
            sum += z * z;
          }
          nums.push(sum);
          break;
        }
        case 'tdist': {
          const df = getParam('df');
          const u1 = Math.random();
          const u2 = Math.random();
          const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
          let v = 0;
          const idf = Math.floor(df);
          for (let j = 0; j < idf; j++) {
            const a = Math.random();
            const b = Math.random();
            const zz = Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * b);
            v += zz * zz;
          }
          nums.push(v > 0 ? z / Math.sqrt(v / df) : 0);
          break;
        }
        case 'fdist': {
          const d1 = getParam('d1');
          const d2 = getParam('d2');
          let v1 = 0;
          let v2 = 0;
          for (let j = 0; j < Math.floor(d1); j++) {
            const a = Math.random();
            const b = Math.random();
            const zz = Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * b);
            v1 += zz * zz;
          }
          for (let j = 0; j < Math.floor(d2); j++) {
            const a = Math.random();
            const b = Math.random();
            const zz = Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * b);
            v2 += zz * zz;
          }
          nums.push(v2 > 0 ? (v1 / d1) / (v2 / d2) : 0);
          break;
        }
        case 'geometric': {
          const p = getParam('p');
          // K = floor(ln(1-U)/ln(1-p)) + 1, K >= 1
          nums.push(Math.floor(Math.log(1 - Math.random()) / Math.log(1 - p)) + 1);
          break;
        }
        case 'negbinomial': {
          const r = Math.round(getParam('r'));
          const p = getParam('p');
          let failures = 0;
          for (let s = 0; s < r; s++) {
            failures += Math.floor(Math.log(1 - Math.random()) / Math.log(1 - p));
          }
          nums.push(failures);
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
      case 'chisquare': {
        const df = getParam('df');
        const a = df / 2;
        // f(x) = exp((a-1)*ln(x) - x/2 - a*ln(2) - loggamma(a)), x > 0
        // (mathjs overrides `log` to base-10, so use `ln` for natural log)
        return `(x>0)*exp((${fmt(a - 1)})*ln(x) - x/2 - ${fmt(a)}*ln(2) - loggamma(${fmt(a)}))`;
      }
      case 'tdist': {
        const df = getParam('df');
        const a = (df + 1) / 2;
        return `exp(loggamma(${fmt(a)}) - 0.5*ln(${fmt(df)}*pi) - loggamma(${fmt(df / 2)}) - ${fmt(a)}*ln(1 + x^2/${fmt(df)}))`;
      }
      case 'fdist': {
        const d1 = getParam('d1');
        const d2 = getParam('d2');
        return `(x>0)*exp(-loggamma(${fmt(d1 / 2)}) - loggamma(${fmt(d2 / 2)}) + loggamma(${fmt((d1 + d2) / 2)}) + ${fmt(d1 / 2)}*ln(${fmt(d1 / d2)}) + ${fmt(d1 / 2 - 1)}*ln(x) - ${fmt((d1 + d2) / 2)}*ln(1 + ${fmt(d1)}*x/${fmt(d2)}))`;
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
      case 'chisquare': {
        const df = getParam('df');
        xMin = 0;
        xMax = Math.max(10, df + 4 * Math.sqrt(2 * df));
        break;
      }
      case 'tdist': {
        const df = getParam('df');
        const span = Math.max(4, 2 + 8 / Math.sqrt(df));
        xMin = -span;
        xMax = span;
        break;
      }
      case 'fdist': {
        const d1 = getParam('d1');
        xMin = 0;
        xMax = Math.max(8, 3 * d1);
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

  const handleCopyRandom = async () => {
    if (randomNumbers.length === 0) return;
    try {
      await navigator.clipboard.writeText(randomNumbers.map((n) => fmt(n, 4)).join(', '));
      setRandCopied(true);
      toast.success('随机数已复制');
      setTimeout(() => setRandCopied(false), 1500);
    } catch {
      toast.error('复制失败');
    }
  };

  return (
    <div className={cn('space-y-3', fullscreen ? 'grid grid-cols-1 xl:grid-cols-[1fr_400px] gap-4 p-3' : 'p-3')}>
      <div className="space-y-3 min-w-0">
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
            <SelectItem value="chisquare" className="text-[12px]">卡方分布 χ²(df)</SelectItem>
            <SelectItem value="tdist" className="text-[12px]">t 分布 t(df)</SelectItem>
            <SelectItem value="fdist" className="text-[12px]">F 分布 F(d1, d2)</SelectItem>
            <SelectItem value="geometric" className="text-[12px]">几何分布 Geo(p)</SelectItem>
            <SelectItem value="negbinomial" className="text-[12px]">负二项分布 NB(r, p)</SelectItem>
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
            <div className="rounded-md border border-primary/30 bg-primary/5 p-2.5 glow-card-teal">
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
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-[10.5px] text-muted-foreground">随机数</div>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 px-1.5 text-[10px] gap-1"
                onClick={handleCopyRandom}
              >
                {randCopied ? <Check className="size-3" /> : <Copy className="size-3" />}
                {randCopied ? '已复制' : '复制'}
              </Button>
            </div>
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

      {/* 全屏模式右侧栏 — 实时分布曲线预览 */}
      {fullscreen && (
        <div className="space-y-3 min-w-0">
          <div className="sticky top-0 rounded-md border border-border/40 bg-background/30 p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10.5px] font-medium text-muted-foreground">分布预览</div>
              <div className="text-[10px] text-primary/70">{distTypeLabel[distType]}</div>
            </div>
            <DistributionPreview distType={distType} params={paramValues} />
          </div>
        </div>
      )}
    </div>
  );
}

/* ================================================================== *
 * TAB 3 — Hypothesis Testing
 * ================================================================== */
type TestType = 'ttest' | 'chisquare';

export function HypothesisTab() {
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

            <div className="rounded-md border border-primary/30 bg-primary/5 p-2.5 formula-card-glow min-w-[260px]">
              <div className="text-[10.5px] text-muted-foreground mb-1.5">检验统计量</div>
              <div className="overflow-x-auto">
                <FormulaRenderer
                  latex={`t = \\frac{\\bar{x} - \\mu_0}{s / \\sqrt{n}} = \\frac{${fmt(result.mean)} - ${fmt(mu0)}}{${fmt(result.std)} / \\sqrt{${result.n}}} = ${fmt(result.t)}`}
                  displayMode
                  fitToContainer={true}
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

            <div className="rounded-md border border-primary/30 bg-primary/5 p-2.5 formula-card-glow min-w-[260px]">
              <div className="overflow-x-auto mb-2">
                <FormulaRenderer
                  latex={`\\chi^2 = \\sum \\frac{(O - E)^2}{E} = ${fmt(result.chi2)}`}
                  displayMode
                  fitToContainer={true}
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

/* ================================================================== *
 * TAB 4 — Regression Analysis
 * ================================================================== */
interface RegressionResult {
  slope: number;
  intercept: number;
  rSquared: number;
  n: number;
  sxy: number;
  sxx: number;
  sstot: number;
  ssres: number;
}

/** Least-squares linear regression: y = a*x + b. */
function computeRegression(pairs: Array<{ x: number; y: number }>): RegressionResult | null {
  const n = pairs.length;
  if (n < 2) return null;
  const xMean = pairs.reduce((s, p) => s + p.x, 0) / n;
  const yMean = pairs.reduce((s, p) => s + p.y, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let sstot = 0;
  for (const p of pairs) {
    sxy += (p.x - xMean) * (p.y - yMean);
    sxx += (p.x - xMean) ** 2;
    sstot += (p.y - yMean) ** 2;
  }
  if (sxx === 0) return null; // x has no variance → vertical line, slope undefined
  const slope = sxy / sxx;
  const intercept = yMean - slope * xMean;
  let ssres = 0;
  for (const p of pairs) {
    const yhat = slope * p.x + intercept;
    ssres += (p.y - yhat) ** 2;
  }
  const rSquared = sstot === 0 ? 1 : 1 - ssres / sstot;
  return { slope, intercept, rSquared, n, sxy, sxx, sstot, ssres };
}

/** Parse two parallel arrays into (x, y) coordinate pairs. */
function parsePairs(xText: string, yText: string): Array<{ x: number; y: number }> {
  const xs = parseData(xText);
  const ys = parseData(yText);
  const n = Math.min(xs.length, ys.length);
  const pairs: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < n; i++) pairs.push({ x: xs[i], y: ys[i] });
  return pairs;
}

export function RegressionTab() {
  const [xInput, setXInput] = useState('1, 2, 3, 4, 5, 6, 7, 8');
  const [yInput, setYInput] = useState('2.1, 3.9, 6.2, 7.8, 10.3, 11.9, 14.1, 16.2');
  const [result, setResult] = useState<RegressionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showResiduals, setShowResiduals] = useState(false);
  const [showBand, setShowBand] = useState(false);

  const pairs = useMemo(() => parsePairs(xInput, yInput), [xInput, yInput]);
  // Live regression for the scatter + line overlay (updates as you type)
  const liveResult = useMemo(() => computeRegression(pairs), [pairs]);
  const regressionLine = liveResult
    ? { slope: liveResult.slope, intercept: liveResult.intercept }
    : undefined;

  const handleCompute = () => {
    setError(null);
    setResult(null);
    if (pairs.length < 2) {
      setError('需要至少 2 组有效 (x, y) 数据');
      return;
    }
    const res = computeRegression(pairs);
    if (!res) {
      setError('x 值无变化，无法拟合 (Sxx = 0)');
      return;
    }
    setResult(res);
  };

  const fitLabel = (r2: number) => {
    if (r2 >= 0.9) return '拟合优度极佳';
    if (r2 >= 0.7) return '拟合优度良好';
    if (r2 >= 0.4) return '拟合优度较弱';
    return '拟合优度很差';
  };
  const fitClass = (r2: number) =>
    r2 >= 0.7
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
      : r2 >= 0.4
        ? 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300'
        : 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300';

  const eqLatex = result
    ? result.intercept >= 0
      ? `y = ${fmt(result.slope)}\\,x + ${fmt(result.intercept)}`
      : `y = ${fmt(result.slope)}\\,x - ${fmt(-result.intercept)}`
    : '';

  return (
    <div className="p-3 space-y-3">
      <div>
        <label className="text-[11px] text-muted-foreground mb-1 block">X 数据（逗号/空格分隔）</label>
        <Textarea
          value={xInput}
          onChange={(e) => setXInput(e.target.value)}
          placeholder="例如: 1, 2, 3, 4, 5"
          className="min-h-[44px] text-[12px] font-mono resize-y"
        />
      </div>
      <div>
        <label className="text-[11px] text-muted-foreground mb-1 block">Y 数据（逗号/空格分隔）</label>
        <Textarea
          value={yInput}
          onChange={(e) => setYInput(e.target.value)}
          placeholder="例如: 2.1, 3.9, 6.2, 7.8, 10.3"
          className="min-h-[44px] text-[12px] font-mono resize-y"
        />
      </div>

      <Button onClick={handleCompute} size="sm" className="w-full h-8 text-[12px] gap-1.5">
        <TrendingUp className="size-3.5" />
        线性回归拟合
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
            <div className="rounded-md border border-primary/30 bg-primary/5 p-2.5 min-w-[260px]">
              <div className="text-[10.5px] text-muted-foreground mb-1.5">回归方程</div>
              <div className="overflow-x-auto">
                <FormulaRenderer latex={eqLatex} displayMode fitToContainer={true} />
              </div>
            </div>

            <div className="rounded-md border border-border/60 bg-muted/30 p-2.5 space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="text-muted-foreground">斜率 a</span>
                <span className="font-mono font-semibold tabular-nums">{fmt(result.slope)}</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-muted-foreground">截距 b</span>
                <span className="font-mono font-semibold tabular-nums">{fmt(result.intercept)}</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-muted-foreground">样本数 n</span>
                <span className="font-mono font-semibold tabular-nums">{result.n}</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-muted-foreground">残差平方和 SSres</span>
                <span className="font-mono font-semibold tabular-nums">{fmt(result.ssres)}</span>
              </div>
            </div>

            <div className="rounded-md border border-primary/30 bg-primary/5 p-2.5 min-w-[260px]">
              <div className="flex justify-between text-[11px]">
                <span className="text-muted-foreground">决定系数 R²</span>
                <span className="font-mono font-semibold tabular-nums text-primary">
                  {fmt(result.rSquared)}
                </span>
              </div>
              <div className="mt-1 overflow-x-auto">
                <FormulaRenderer
                  latex={`R^2 = 1 - \\frac{SS_{res}}{SS_{tot}} = 1 - \\frac{${fmt(result.ssres)}}{${fmt(result.sstot)}} = ${fmt(result.rSquared)}`}
                  displayMode
                  fitToContainer={true}
                />
              </div>
            </div>

            <div
              className={cn(
                'rounded-md border px-3 py-2 text-[11.5px] font-medium',
                fitClass(result.rSquared),
              )}
            >
              {fitLabel(result.rSquared)} (R² = {fmt(result.rSquared)})
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Scatter plot with regression line overlay (reuses StatChart) */}
      {pairs.length >= 2 && (
        <div className="rounded-md border border-border/40 bg-background/30 p-1.5 text-foreground">
          <div className="flex items-center justify-between mb-1 px-1">
            <div className="text-[10.5px] text-muted-foreground">散点图 + 回归直线</div>
            <div className="flex flex-wrap items-center gap-1">
              <button
                type="button"
                onClick={() => setShowResiduals((v) => !v)}
                className={cn(
                  'h-5 px-1.5 rounded text-[10px] border transition-colors',
                  showResiduals ? 'border-rose-500/50 bg-rose-500/10 text-rose-500' : 'border-border/50 text-muted-foreground hover:bg-accent/60',
                )}
                title="显示每个点到回归线的残差"
              >
                残差
              </button>
              <button
                type="button"
                onClick={() => setShowBand((v) => !v)}
                className={cn(
                  'h-5 px-1.5 rounded text-[10px] border transition-colors',
                  showBand ? 'border-amber-500/50 bg-amber-500/10 text-amber-500' : 'border-border/50 text-muted-foreground hover:bg-accent/60',
                )}
                title="显示 95% 置信带"
              >
                置信带
              </button>
            </div>
          </div>
          <StatChart
            type="scatter"
            points={pairs}
            regressionLine={regressionLine}
            residuals={showResiduals}
            band={showBand}
          />
          {liveResult && (
            <div className="mt-1 flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground px-1">
              <span className="font-mono">
                R² = <span className="font-semibold text-primary">{fmt(liveResult.rSquared, 4)}</span>
              </span>
              <span className="font-mono">
                r = <span className="font-semibold text-primary">{fmt(Math.sign(liveResult.slope) * Math.sqrt(Math.max(0, liveResult.rSquared)), 4)}</span>
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
