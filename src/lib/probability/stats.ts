/**
 * OmniMath Pro — 概率统计计算层（纯函数，无 React / 无 canvas）。
 *
 * 与 `distributions.ts`（各分布 pdf/cdf/inv/sample）互补：本模块专注
 * 「一组样本数据」的描述统计与统计图表所需的计算，供独立运行结果面板、
 * StatisticsPanel 与蓝图 statistics 节点共用，避免三处重复实现导致行为漂移。
 */

/* ================================================================== *
 * 分箱
 * ================================================================== */

export type BinRule = 'sturges' | 'sqrt' | 'fd' | number;

/** 计算分箱数 k。FD 规则（Freedman–Diaconis）对数据自适应，最稳。 */
export function binCountFor(data: ArrayLike<number>, rule: BinRule): number {
  const n = data.length;
  if (n === 0) return 1;
  if (typeof rule === 'number') return Math.max(1, Math.round(rule));
  if (rule === 'sqrt') return Math.max(1, Math.ceil(Math.sqrt(n)));
  if (rule === 'fd') {
    const q = quantiles(data, [0.25, 0.75]);
    const iqr = q[1] - q[0];
    const h = iqr > 0 ? (2 * iqr) / Math.cbrt(n) : 0;
    if (h <= 0) return binCountFor(data, 'sturges');
    const span = range(data);
    return Math.max(1, Math.ceil(span / h));
  }
  // sturges
  return Math.max(1, Math.ceil(Math.log2(n)) + 1);
}

export interface HistBin {
  start: number;
  end: number;
  count: number;
  /** 密度 = count / (n * width)。 */
  density: number;
}

/** 对数据分箱，返回左闭右开区间 [start, end)。 */
export function histogramBins(data: ArrayLike<number>, rule: BinRule = 'sturges'): HistBin[] {
  const n = data.length;
  if (n === 0) return [];
  const { min, max } = sampleRange(data);
  if (min === max) {
    const pad = Math.max(1, Math.abs(min) * 0.1);
    return [{ start: min - pad, end: min + pad, count: n, density: 1 / (2 * pad) }];
  }
  const k = binCountFor(data, rule);
  const width = (max - min) / k;
  const bins: HistBin[] = [];
  for (let i = 0; i < k; i++) {
    const start = min + i * width;
    const end = i === k - 1 ? max + 1e-9 : start + width;
    bins.push({ start, end, count: 0, density: 0 });
  }
  for (let i = 0; i < n; i++) {
    const v = data[i];
    if (!Number.isFinite(v)) continue;
    let idx = Math.floor((v - min) / width);
    if (idx < 0) idx = 0;
    if (idx >= k) idx = k - 1;
    bins[idx].count++;
  }
  for (const b of bins) b.density = b.count / (n * (b.end - b.start));
  return bins;
}

/* ================================================================== *
 * 分组直方图（多序列共享同一分箱轴）
 * ================================================================== */

export interface GroupedSeries {
  name: string;
  data: number[];
}

export interface GroupedSeriesBin {
  start: number;
  end: number;
  /** 该序列在此区间内的计数。 */
  count: number;
  /** 密度 = count / (n * width)，n 为该序列样本数。 */
  density: number;
}

export interface GroupedHistogram {
  /** 共享分箱轴（左闭右开）。 */
  edges: { start: number; end: number }[];
  /** 每个序列在共享轴上的计数。 */
  series: { name: string; bins: GroupedSeriesBin[] }[];
}

/**
 * 对多序列数据做「分组直方图」：所有序列共用同一组分箱边界，
 * 以便逐 bin 并排比较分布。分箱数取各序列 Sturges 的平均（≥2）。
 */
export function groupedHistogramBins(series: GroupedSeries[]): GroupedHistogram {
  const valid = series.filter((s) => s.data.length > 0);
  if (valid.length === 0) return { edges: [], series: [] };

  let min = Infinity;
  let max = -Infinity;
  for (const s of valid) {
    const r = sampleRange(s.data);
    if (r.min < min) min = r.min;
    if (r.max > max) max = r.max;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
    const pad = Math.max(1, Math.abs(min || 0) * 0.1);
    return {
      edges: [{ start: min - pad, end: min + pad }],
      series: valid.map((s) => ({
        name: s.name,
        bins: [{ start: min - pad, end: min + pad, count: s.data.length, density: s.data.length / (s.data.length * 2 * pad) }],
      })),
    };
  }

  const k = Math.max(2, Math.round(valid.reduce((acc, s) => acc + binCountFor(s.data, 'sturges'), 0) / valid.length));
  const width = (max - min) / k;
  const edges: { start: number; end: number }[] = [];
  for (let i = 0; i < k; i++) {
    edges.push({ start: min + i * width, end: i === k - 1 ? max + 1e-9 : min + (i + 1) * width });
  }

  const out = valid.map((s) => {
    const n = s.data.length;
    const bins: GroupedSeriesBin[] = edges.map((e) => ({ ...e, count: 0, density: 0 }));
    for (let i = 0; i < n; i++) {
      const v = s.data[i];
      if (!Number.isFinite(v)) continue;
      let idx = Math.floor((v - min) / width);
      if (idx < 0) idx = 0;
      if (idx >= k) idx = k - 1;
      bins[idx].count++;
    }
    for (const b of bins) b.density = b.count / (n * (b.end - b.start));
    return { name: s.name, bins };
  });

  return { edges, series: out };
}

/* ================================================================== *
 * 描述统计
 * ================================================================== */

export interface SampleRange {
  min: number;
  max: number;
}

export function sampleRange(data: ArrayLike<number>): SampleRange {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < data.length; i++) {
    const v = data[i];
    if (!Number.isFinite(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return { min, max };
}

export function range(data: ArrayLike<number>): number {
  const { min, max } = sampleRange(data);
  return max - min;
}

export function mean(data: ArrayLike<number>): number {
  let s = 0;
  let n = 0;
  for (let i = 0; i < data.length; i++) {
    const v = data[i];
    if (!Number.isFinite(v)) continue;
    s += v;
    n++;
  }
  return n === 0 ? NaN : s / n;
}

/** 样本标准差（n-1）。 */
export function stdDev(data: ArrayLike<number>): number {
  const m = mean(data);
  let s = 0;
  let n = 0;
  for (let i = 0; i < data.length; i++) {
    const v = data[i];
    if (!Number.isFinite(v)) continue;
    const d = v - m;
    s += d * d;
    n++;
  }
  return n < 2 ? NaN : Math.sqrt(s / (n - 1));
}

/** 线性插值分位数（type=7，与 R/MATLAB 默认一致）。 */
export function quantile(sortedData: ArrayLike<number>, q: number): number {
  const n = sortedData.length;
  if (n === 0) return NaN;
  if (q <= 0) return sortedData[0];
  if (q >= 1) return sortedData[n - 1];
  const pos = (n - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const frac = pos - lo;
  const vLo = sortedData[lo];
  const vHi = sortedData[hi];
  return vLo + (vHi - vLo) * frac;
}

/** 对未排序数据取多个分位数，返回与 prob 对应的分位值数组。 */
export function quantiles(data: ArrayLike<number>, probs: number[]): number[] {
  const sorted = sortedCopy(data);
  return probs.map((p) => quantile(sorted, p));
}

export function median(data: ArrayLike<number>): number {
  return quantile(sortedCopy(data), 0.5);
}

export interface BoxStats {
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
  whiskerLow: number;
  whiskerHigh: number;
  outliers: number[];
  /** notch 下界（median − 1.57·IQR/√n），n>5 时有效。 */
  notchLow: number;
  /** notch 上界（median + 1.57·IQR/√n），n>5 时有效。 */
  notchHigh: number;
}

/** 箱线图统计量（Tukey 须 + 1.5×IQR 离群点 + 置信凹口）。 */
export function boxplotStats(data: ArrayLike<number>): BoxStats {
  const sorted = sortedCopy(data);
  const n = sorted.length;
  if (n === 0)
    return {
      min: NaN, q1: NaN, median: NaN, q3: NaN, max: NaN, whiskerLow: NaN, whiskerHigh: NaN,
      outliers: [], notchLow: NaN, notchHigh: NaN,
    };
  const min = sorted[0];
  const max = sorted[n - 1];
  const q1 = quantile(sorted, 0.25);
  const med = quantile(sorted, 0.5);
  const q3 = quantile(sorted, 0.75);
  const iqr = q3 - q1;
  const loFence = q1 - 1.5 * iqr;
  const hiFence = q3 + 1.5 * iqr;
  let whiskerLow = min;
  let whiskerHigh = max;
  const outliers: number[] = [];
  for (const v of sorted) {
    if (v < loFence) outliers.push(v);
    else if (whiskerLow === min) whiskerLow = v;
  }
  for (let i = n - 1; i >= 0; i--) {
    const v = sorted[i];
    if (v > hiFence) outliers.push(v);
    else if (whiskerHigh === max) whiskerHigh = v;
  }
  // McGill 凹口：1.57·IQR/√n（n>5 才有统计意义）
  const notch = n > 5 ? (1.57 * iqr) / Math.sqrt(n) : NaN;
  return {
    min, q1: q1, median: med, q3: q3, max, whiskerLow, whiskerHigh, outliers,
    notchLow: Number.isFinite(notch) ? med - notch : NaN,
    notchHigh: Number.isFinite(notch) ? med + notch : NaN,
  };
}

/* ================================================================== *
 * ECDF / QQ
 * ================================================================== */

export interface XYPoint {
  x: number;
  y: number;
}

/** 经验累积分布，返回阶梯点列（含重复 x 的台阶拐点）。 */
export function ecdfPoints(data: ArrayLike<number>): XYPoint[] {
  const sorted = sortedCopy(data);
  const n = sorted.length;
  const out: XYPoint[] = [];
  for (let i = 0; i < n; i++) {
    const x = sorted[i];
    const y = (i + 1) / n;
    if (i > 0 && x === sorted[i - 1]) {
      out.push({ x, y });
    } else {
      out.push({ x, y: i / n });
      out.push({ x, y });
    }
  }
  return out;
}

/** QQ 图点：x=理论分位（默认标准正态），y=样本分位。 */
export function qqPoints(data: ArrayLike<number>, theoreticalQuantile: (p: number) => number = normQuantile): XYPoint[] {
  const sorted = sortedCopy(data);
  const n = sorted.length;
  const out: XYPoint[] = [];
  for (let i = 0; i < n; i++) {
    const p = (i + 0.5) / n;
    out.push({ x: theoreticalQuantile(p), y: sorted[i] });
  }
  return out;
}

/** P-P 图点：x=理论 CDF(样本值)，y=经验 CDF。用于衡量分布拟合优度。 */
export function ppPoints(data: ArrayLike<number>, theoreticalCdf: (x: number) => number): XYPoint[] {
  const sorted = sortedCopy(data);
  const n = sorted.length;
  const out: XYPoint[] = [];
  for (let i = 0; i < n; i++) {
    const emp = (i + 1) / n;
    out.push({ x: theoreticalCdf(sorted[i]), y: emp });
  }
  return out;
}

/** 标准正态分位数（不做 Halley 校正，够画 QQ 用）。 */
export function normQuantile(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const plow = 0.02425;
  const phigh = 1 - plow;
  let q: number, r: number, x: number;
  if (p < plow) {
    q = Math.sqrt(-2 * Math.log(p));
    x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p <= phigh) {
    q = p - 0.5;
    r = q * q;
    x = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    q = Math.sqrt(-2 * Math.log(1 - p));
    x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  return x;
}

/* ================================================================== *
 * KDE（核密度估计）
 * ================================================================== */

export type Kernel = 'gaussian' | 'epanechnikov' | 'uniform';

/** Silverman 规则带宽（对近似正态数据稳健）。 */
export function silvermanBandwidth(data: ArrayLike<number>): number {
  const n = data.length;
  if (n < 2) return 1;
  const sigma = stdDev(data);
  const s = sigma > 0 ? sigma : 1;
  const q = quantiles(data, [0.25, 0.75]);
  const iqr = q[1] - q[0];
  const sigmaEst = Math.min(s, iqr / 1.349);
  return 0.9 * sigmaEst * Math.pow(n, -1 / 5);
}

function kernelFn(k: Kernel, u: number): number {
  switch (k) {
    case 'gaussian':
      return Math.exp((-u * u) / 2) / Math.sqrt(2 * Math.PI);
    case 'epanechnikov':
      return Math.abs(u) <= 1 ? (3 / 4) * (1 - u * u) : 0;
    case 'uniform':
      return Math.abs(u) <= 1 ? 0.5 : 0;
  }
}

/** 在 [min,max] 上采样 n 点的 KDE 曲线。 */
export function kde(
  data: ArrayLike<number>,
  opts?: { bandwidth?: number; kernel?: Kernel; samples?: number; range?: [number, number] },
): XYPoint[] {
  const n = data.length;
  if (n === 0) return [];
  const bw = opts?.bandwidth ?? silvermanBandwidth(data);
  if (bw <= 0) return [];
  const kernel = opts?.kernel ?? 'gaussian';
  const samples = opts?.samples ?? 128;
  const { min, max } = opts?.range
    ? { min: opts.range[0], max: opts.range[1] }
    : sampleRange(data);
  const pad = (max - min) * 0.1 || 1;
  const lo = min - pad;
  const hi = max + pad;
  const out: XYPoint[] = [];
  for (let i = 0; i < samples; i++) {
    const x = lo + ((hi - lo) * i) / (samples - 1);
    let sum = 0;
    for (let j = 0; j < n; j++) sum += kernelFn(kernel, (x - data[j]) / bw);
    out.push({ x, y: sum / (n * bw) });
  }
  return out;
}

/* ================================================================== *
 * 线性回归
 * ================================================================== */

export interface RegressionResult {
  slope: number;
  intercept: number;
  r2: number;
  n: number;
}

/** 最小二乘线性回归 y = slope*x + intercept，返回 R²。 */
export function linearRegression(points: ArrayLike<XYPoint>): RegressionResult {
  const n = points.length;
  if (n < 2) return { slope: NaN, intercept: NaN, r2: NaN, n };
  let sx = 0, sy = 0, sxx = 0, sxy = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const { x, y } = points[i];
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    sx += x;
    sy += y;
    sxx += x * x;
    sxy += x * y;
    syy += y * y;
  }
  const denom = n * sxx - sx * sx;
  if (denom === 0) return { slope: NaN, intercept: NaN, r2: NaN, n };
  const slope = (n * sxy - sx * sy) / denom;
  const intercept = (sy - slope * sx) / n;
  const ssRes = syy - intercept * sy - slope * sxy;
  const ssTot = syy - (sy * sy) / n;
  const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;
  return { slope, intercept, r2, n };
}

/* ================================================================== *
 * 工具
 * ================================================================== */

export function sortedCopy(data: ArrayLike<number>): number[] {
  const arr: number[] = [];
  for (let i = 0; i < data.length; i++) {
    const v = data[i];
    if (Number.isFinite(v)) arr.push(v);
  }
  arr.sort((a, b) => a - b);
  return arr;
}

/** 简易格式化：控制在 digits 位有效数字内。 */
export function fmt(v: number, digits = 6): string {
  if (!Number.isFinite(v)) return String(v);
  if (v === 0) return '0';
  const abs = Math.abs(v);
  if (abs >= 1e6 || abs < 0.001) return v.toExponential(2);
  return String(Number(v.toPrecision(digits)));
}