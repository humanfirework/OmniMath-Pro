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
  Sigma,
  FlaskConical,
  Send,
  X,
  Calculator,
  Dices,
  TrendingUp,
  Save,
  Download,
  Upload,
  Trash2,
  ClipboardList,
  Sparkles,
  ZoomIn,
  ChevronDown,
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
type ChartType = 'histogram' | 'boxplot' | 'scatter';

interface StatChartProps {
  type: ChartType;
  data?: number[];
  points?: Array<{ x: number; y: number }>;
  regressionLine?: { slope: number; intercept: number };
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
}

const MIN_BAR_WIDTH = 28;

function HistogramChart({ data, zoomed = false }: HistogramChartProps) {
  const [hover, setHover] = useState<number | null>(null);
  const n = data.length;
  const containerRef = useRef<HTMLDivElement>(null);

  if (n < 2) return <ChartEmpty label="需要至少 2 个数据点" />;
  const min = Math.min(...data);
  const max = Math.max(...data);
  if (min === max) return <ChartEmpty label="数据无变化，无法分箱" />;
  const k = Math.max(1, Math.ceil(Math.log2(n) + 1)); // Sturges' rule
  const binWidth = (max - min) / k;
  const bins = new Array(k).fill(0);
  for (const v of data) {
    let idx = Math.floor((v - min) / binWidth);
    if (idx >= k) idx = k - 1;
    if (idx < 0) idx = 0;
    bins[idx]++;
  }
  const maxFreq = Math.max(...bins, 1);
  const yCeil = zoomed ? Math.ceil(maxFreq * 1.15) : maxFreq;
  const ch = zoomed ? 280 : 200;
  const contentW = Math.max(CHART_W, k * MIN_BAR_WIDTH + CHART_PAD.l + CHART_PAD.r);
  const plotW = contentW - CHART_PAD.l - CHART_PAD.r;
  const plotH = ch - CHART_PAD.t - CHART_PAD.b;
  const barW = plotW / k;
  const yScale = (f: number) => CHART_PAD.t + plotH - (f / yCeil) * plotH;
  const showTopLabels = k <= 15;

  return (
    <div
      ref={containerRef}
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
          const yVal = Math.round(t * yCeil);
          return (
            <g key={t}>
              <line x1={CHART_PAD.l} y1={y} x2={contentW - CHART_PAD.r} y2={y} stroke="currentColor" strokeOpacity={0.08} />
              <text x={CHART_PAD.l - 4} y={y + 3} textAnchor="end" fontSize={8} fill="currentColor" opacity={0.55}>
                {yVal}
              </text>
            </g>
          );
        })}
        {bins.map((f, i) => {
          const x = CHART_PAD.l + i * barW;
          const y = yScale(f);
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

function BoxPlotChart({ data }: { data: number[] }) {
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

  const allVals = sorted;
  const dMin = Math.min(...allVals, whiskerLo);
  const dMax = Math.max(...allVals, whiskerHi);
  const span = dMax - dMin || 1;
  const pad = span * 0.08;
  const xMin = dMin - pad;
  const xMax = dMax + pad;
  const range = xMax - xMin || 1;

  const plotW = CHART_W - CHART_PAD.l - CHART_PAD.r;
  const plotH = CHART_H - CHART_PAD.t - CHART_PAD.b;
  const cy = CHART_PAD.t + plotH / 2;
  const boxH = Math.min(plotH * 0.5, 40);
  const sx = (v: number) => CHART_PAD.l + ((v - xMin) / range) * plotW;

  return (
    <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="w-full" style={{ height: 200 }}>
      {/* x-axis ticks */}
      {[0, 0.25, 0.5, 0.75, 1].map((t) => {
        const xv = xMin + t * range;
        const x = sx(xv);
        return (
          <g key={t}>
            <line x1={x} y1={CHART_PAD.t} x2={x} y2={CHART_PAD.t + plotH} stroke="currentColor" strokeOpacity={0.06} />
            <text x={x} y={CHART_H - CHART_PAD.b + 12} textAnchor="middle" fontSize={8} fill="currentColor" opacity={0.55}>
              {fmt(xv, 3)}
            </text>
          </g>
        );
      })}
      {/* whiskers */}
      <line x1={sx(whiskerLo)} y1={cy} x2={sx(q1)} y2={cy} stroke="#2dd4bf" strokeWidth={1.5} />
      <line x1={sx(q3)} y1={cy} x2={sx(whiskerHi)} y2={cy} stroke="#2dd4bf" strokeWidth={1.5} />
      <line x1={sx(whiskerLo)} y1={cy - boxH / 3} x2={sx(whiskerLo)} y2={cy + boxH / 3} stroke="#2dd4bf" strokeWidth={1.5} />
      <line x1={sx(whiskerHi)} y1={cy - boxH / 3} x2={sx(whiskerHi)} y2={cy + boxH / 3} stroke="#2dd4bf" strokeWidth={1.5} />
      {/* box */}
      <rect x={sx(q1)} y={cy - boxH / 2} width={Math.max(1, sx(q3) - sx(q1))} height={boxH} fill="#2dd4bf" fillOpacity={0.25} stroke="#2dd4bf" strokeWidth={1.5} rx={2} />
      {/* median */}
      <line x1={sx(median)} y1={cy - boxH / 2} x2={sx(median)} y2={cy + boxH / 2} stroke="#0f766e" strokeWidth={2} />
      {/* outliers */}
      {outliers.map((o, i) => (
        <circle key={i} cx={sx(o)} cy={cy} r={2.5} fill="none" stroke="#f43f5e" strokeWidth={1.2} />
      ))}
      {/* labels */}
      <text x={sx(q1)} y={cy - boxH / 2 - 4} textAnchor="middle" fontSize={8} fill="currentColor" opacity={0.6}>Q1</text>
      <text x={sx(median)} y={cy - boxH / 2 - 4} textAnchor="middle" fontSize={8} fill="currentColor" opacity={0.6}>中位</text>
      <text x={sx(q3)} y={cy - boxH / 2 - 4} textAnchor="middle" fontSize={8} fill="currentColor" opacity={0.6}>Q3</text>
      {/* x-axis */}
      <line x1={CHART_PAD.l} y1={CHART_PAD.t + plotH} x2={CHART_W - CHART_PAD.r} y2={CHART_PAD.t + plotH} stroke="currentColor" strokeOpacity={0.3} />
    </svg>
  );
}

function ScatterChart({ points, regressionLine }: { points: Array<{ x: number; y: number }>; regressionLine?: { slope: number; intercept: number } }) {
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

  const plotW = CHART_W - CHART_PAD.l - CHART_PAD.r;
  const plotH = CHART_H - CHART_PAD.t - CHART_PAD.b;
  const sx = (v: number) => CHART_PAD.l + ((v - loX) / xRange) * plotW;
  const sy = (v: number) => CHART_PAD.t + plotH - ((v - loY) / yRange) * plotH;

  return (
    <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="w-full" style={{ height: 200 }}>
      {/* grid + ticks */}
      {[0, 0.25, 0.5, 0.75, 1].map((t) => {
        const xv = loX + t * xRange;
        const yv = loY + t * yRange;
        const gx = sx(xv);
        const gy = sy(yv);
        return (
          <g key={t}>
            <line x1={gx} y1={CHART_PAD.t} x2={gx} y2={CHART_PAD.t + plotH} stroke="currentColor" strokeOpacity={0.06} />
            <line x1={CHART_PAD.l} y1={gy} x2={CHART_W - CHART_PAD.r} y2={gy} stroke="currentColor" strokeOpacity={0.06} />
            <text x={gx} y={CHART_H - CHART_PAD.b + 12} textAnchor="middle" fontSize={8} fill="currentColor" opacity={0.55}>{fmt(xv, 3)}</text>
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
      {/* points */}
      {points.map((p, i) => (
        <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r={2.6} fill="#2dd4bf" fillOpacity={0.8} stroke="#0f766e" strokeWidth={0.6} />
      ))}
      {/* axes */}
      <line x1={CHART_PAD.l} y1={CHART_PAD.t} x2={CHART_PAD.l} y2={CHART_PAD.t + plotH} stroke="currentColor" strokeOpacity={0.3} />
      <line x1={CHART_PAD.l} y1={CHART_PAD.t + plotH} x2={CHART_W - CHART_PAD.r} y2={CHART_PAD.t + plotH} stroke="currentColor" strokeOpacity={0.3} />
    </svg>
  );
}

function StatChart({ type, data, points, regressionLine }: StatChartProps) {
  if (type === 'histogram') return <HistogramChart data={data ?? []} />;
  if (type === 'boxplot') return <BoxPlotChart data={data ?? []} />;
  return <ScatterChart points={points ?? []} regressionLine={regressionLine} />;
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
    <div className="h-full flex flex-col bg-card/20">
      <Tabs defaultValue="descriptive" className="flex-1 flex flex-col min-h-0 gap-0">
        <div className="shrink-0 px-2 pt-2 pb-1 border-b border-border/40 bg-background/30">
          <TabsList className="grid grid-cols-4 w-full h-8 text-[11px]">
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
            <TabsTrigger value="regression" className="text-[11px] gap-1">
              <TrendingUp className="size-3.5" />
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

function DescriptiveStatsTab() {
  const [input, setInput] = useState('1.2, 2.3, 3.1, 4.5, 2.8, 3.7, 5.1, 2.9, 3.4, 4.0');
  const parsed = useMemo(() => parseNumericInput(input), [input]);
  const data = parsed.numbers;
  const invalidItems = parsed.invalid;
  const result = useMemo(() => computeDescriptive(data), [data]);

  const [chartType, setChartType] = useState<ChartType | null>(null);
  const [histZoomed, setHistZoomed] = useState(false);

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

  const rangeBadge = useMemo(() => {
    if (!result) return null;
    const okMin = Number.isFinite(result.min);
    const okMax = Number.isFinite(result.max);
    if (!okMin || !okMax) return null;
    return `[${fmt(result.min, 3)}..${fmt(result.max, 3)}]`;
  }, [result]);

  return (
    <div className="p-3 space-y-3">
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

      {/* ===== Task 9/10b: 图表区 ===== */}
      {result && (
        <div className="space-y-2">
          <div className="flex gap-1">
            {(
              [
                ['histogram', '直方图'],
                ['boxplot', '箱线图'],
                ['scatter', '散点图'],
              ] as const
            ).map(([t, label]) => (
              <Button
                key={t}
                variant={chartType === t ? 'default' : 'outline'}
                size="sm"
                className="flex-1 h-7 text-[10.5px]"
                onClick={() => setChartType(chartType === t ? null : t)}
              >
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
                        <div className="text-[10.5px] text-muted-foreground">频数直方图</div>
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
                      <HistogramChart data={data} zoomed={histZoomed} />
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
                    <StatChart type="boxplot" data={data} />
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
      )}
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
    df: 5,
    d1: 5,
    d2: 10,
    r: 3,
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

  const isDiscrete =
    distType === 'poisson' ||
    distType === 'binomial' ||
    distType === 'geometric' ||
    distType === 'negbinomial';
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

function RegressionTab() {
  const [xInput, setXInput] = useState('1, 2, 3, 4, 5, 6, 7, 8');
  const [yInput, setYInput] = useState('2.1, 3.9, 6.2, 7.8, 10.3, 11.9, 14.1, 16.2');
  const [result, setResult] = useState<RegressionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

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
          <div className="text-[10.5px] text-muted-foreground mb-1 px-1">散点图 + 回归直线</div>
          <StatChart type="scatter" points={pairs} regressionLine={regressionLine} />
        </div>
      )}
    </div>
  );
}
