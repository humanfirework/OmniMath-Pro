/**
 * Statistics category node definitions — 统计采样、汇总、分布与相关分析。
 *
 * 数据通过 'any' 端口以 number[] 传输。随机采样统一走 rng.ts 的可种子化
 * 生成器，分布计算统一走 distributions.ts 的 makeDistNamed，保证与面板、
 * 引擎表达式作用域三处行为一致且可复现。
 */

import type { NodeTypeDef } from '../pipelineEngine';
import { makeDistNamed, resolveDist } from '@/lib/probability/distributions';
import { mulberry32, toSeed } from '@/lib/probability/rng';

/** 从任意输入解析为 number[]；容错处理嵌套与非数值。 */
function toNumberArray(v: unknown): number[] {
  if (Array.isArray(v)) {
    return v
      .map((x) => (typeof x === 'number' ? x : Number(x)))
      .filter((n) => Number.isFinite(n));
  }
  return [];
}

/** Pearson 相关系数（两序列长度一致时）。 */
function pearson(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return NaN;
  const ma = a.reduce((s, x) => s + x, 0) / n;
  const mb = b.reduce((s, x) => s + x, 0) / n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    const xa = a[i] - ma;
    const xb = b[i] - mb;
    num += xa * xb;
    da += xa * xa;
    db += xb * xb;
  }
  const den = Math.sqrt(da * db);
  return den === 0 ? (da === 0 && db === 0 ? 1 : NaN) : num / den;
}

export const statisticsNodes = {
  'random-sample': {
    type: 'random-sample',
    category: 'statistics',
    labelKey: 'npRandomSample',
    icon: 'Dices',
    color: 'rose',
    inputs: [],
    outputs: [{ id: 'data', labelKey: 'npPortData', type: 'any' }],
    defaultConfig: {
      distribution: 'normal',
      count: 100,
      mu: 0,
      sigma: 1,
      min: 0,
      max: 1,
      seed: 0,
    },
    execute: (_inputs, config) => {
      const name = String(config.distribution ?? 'normal');
      const count = Math.max(0, Math.floor(Number(config.count ?? 100)));
      const kind = resolveDist(name) ?? 'normal';
      // 统一参数：均匀分布用 a/b(即 min/max)，其余用各自参数。
      const params: Record<string, unknown> = { ...config };
      if (kind === 'uniform') {
        params.a = config.min ?? 0;
        params.b = config.max ?? 1;
      }
      const dist = makeDistNamed(name, params);
      const rng =
        config.seed !== undefined && String(config.seed) !== ''
          ? mulberry32(toSeed(config.seed))
          : undefined;
      const data: number[] = [];
      for (let i = 0; i < count; i++) data.push(dist.sample(rng));
      return { data };
    },
  },

  'mean-variance': {
    type: 'mean-variance',
    category: 'statistics',
    labelKey: 'npMeanVariance',
    icon: 'BarChart3',
    color: 'rose',
    inputs: [{ id: 'data', labelKey: 'npPortData', type: 'any' }],
    outputs: [
      { id: 'mean', labelKey: 'npPortMean', type: 'number' },
      { id: 'variance', labelKey: 'npPortVariance', type: 'number' },
      { id: 'stddev', labelKey: 'npPortStddev', type: 'number' },
    ],
    defaultConfig: {},
    execute: (inputs) => {
      const data = toNumberArray(inputs.data);
      const n = data.length;
      if (n === 0) {
        return { mean: NaN, variance: NaN, stddev: NaN };
      }
      const mean = data.reduce((s, x) => s + x, 0) / n;
      const variance =
        n > 1 ? data.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1) : 0;
      return { mean, variance, stddev: Math.sqrt(variance) };
    },
  },

  /** 综合汇总：均值/方差/标准差/中位数/最小最大/偏度/峰度。 */
  summary: {
    type: 'summary',
    category: 'statistics',
    labelKey: 'npSummary',
    icon: 'Sigma',
    color: 'rose',
    inputs: [{ id: 'data', labelKey: 'npPortData', type: 'any' }],
    outputs: [
      { id: 'mean', labelKey: 'npPortMean', type: 'number' },
      { id: 'median', labelKey: 'npPortMedian', type: 'number' },
      { id: 'stddev', labelKey: 'npPortStddev', type: 'number' },
      { id: 'result', labelKey: 'npPortResult', type: 'any' },
    ],
    defaultConfig: {},
    execute: (inputs) => {
      const data = toNumberArray(inputs.data);
      const n = data.length;
      if (n === 0) {
        return { mean: NaN, median: NaN, stddev: NaN, result: { n: 0 } };
      }
      const mean = data.reduce((s, x) => s + x, 0) / n;
      const sorted = [...data].sort((a, b) => a - b);
      const mid = Math.floor(n / 2);
      const median = n % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
      const variance =
        n > 1 ? data.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1) : 0;
      const stddev = Math.sqrt(variance);
      const min = sorted[0];
      const max = sorted[n - 1];
      // 偏度/峰度（样本矩，n>3 时有效）。
      let skewness = NaN;
      let kurtosis = NaN;
      if (n > 3 && stddev > 0) {
        const m2 = data.reduce((s, x) => s + (x - mean) ** 2, 0) / n;
        const m3 = data.reduce((s, x) => s + (x - mean) ** 3, 0) / n;
        const m4 = data.reduce((s, x) => s + (x - mean) ** 4, 0) / n;
        skewness = m3 / Math.pow(m2, 1.5);
        kurtosis = m4 / (m2 * m2) - 3; // 超额峰度
      }
      return {
        mean,
        median,
        stddev,
        result: { n, min, max, median, mean, stddev, variance, skewness, kurtosis },
      };
    },
  },

  /** 分布计算：给定 kind + 参数 + x，输出 pdf/cdf/inv。 */
  distribution: {
    type: 'distribution',
    category: 'statistics',
    labelKey: 'npDistribution',
    icon: 'Bell',
    color: 'rose',
    inputs: [{ id: 'x', labelKey: 'npPortX', type: 'number' }],
    outputs: [
      { id: 'pdf', labelKey: 'npPortPdf', type: 'number' },
      { id: 'cdf', labelKey: 'npPortCdf', type: 'number' },
      { id: 'inv', labelKey: 'npPortInv', type: 'number' },
    ],
    defaultConfig: {
      distribution: 'normal',
      mu: 0,
      sigma: 1,
      p: 0.5,
    },
    execute: (inputs, config) => {
      const name = String(config.distribution ?? 'normal');
      const kind = resolveDist(name) ?? 'normal';
      const params: Record<string, unknown> = { ...config };
      if (kind === 'uniform') {
        params.a = config.min ?? 0;
        params.b = config.max ?? 1;
      }
      const dist = makeDistNamed(name, params);
      const x = Number(inputs.x ?? config.x ?? 0);
      const p = Number(config.p ?? 0.5);
      return {
        pdf: dist.pdf(x),
        cdf: dist.cdf(x),
        inv: dist.inv(p),
      };
    },
  },

  /** 相关系数：Pearson 相关系数与决定系数。 */
  correlation: {
    type: 'correlation',
    category: 'statistics',
    labelKey: 'npCorrelation',
    icon: 'HeartPulse',
    color: 'rose',
    inputs: [
      { id: 'a', labelKey: 'npPortA', type: 'any' },
      { id: 'b', labelKey: 'npPortB', type: 'any' },
    ],
    outputs: [
      { id: 'corr', labelKey: 'npPortCorr', type: 'number' },
      { id: 'result', labelKey: 'npPortResult', type: 'any' },
    ],
    defaultConfig: {},
    execute: (inputs) => {
      const a = toNumberArray(inputs.a);
      const b = toNumberArray(inputs.b);
      const corr = pearson(a, b);
      const n = Math.min(a.length, b.length);
      return { corr, result: { corr, r2: corr * corr, n } };
    },
  },

  histogram: {
    type: 'histogram',
    category: 'statistics',
    labelKey: 'npHistogram',
    icon: 'BarChart2',
    color: 'rose',
    inputs: [{ id: 'data', labelKey: 'npPortData', type: 'any' }],
    outputs: [{ id: 'result', labelKey: 'npPortResult', type: 'any' }],
    defaultConfig: { binCount: 10 },
    execute: (inputs, config) => {
      const data = toNumberArray(inputs.data);
      const binCount = Math.max(1, Math.floor(Number(config.binCount ?? 10)));
      if (data.length === 0) {
        return { result: { bins: [], counts: [] } };
      }
      const lo = Math.min(...data);
      const hi = Math.max(...data);
      const span = hi - lo;
      const binWidth = span === 0 ? 1 : span / binCount;
      const bins: number[] = [];
      const counts: number[] = new Array(binCount).fill(0);
      for (let i = 0; i < binCount; i++) {
        bins.push(lo + i * binWidth);
      }
      for (const x of data) {
        let idx = span === 0 ? 0 : Math.floor((x - lo) / binWidth);
        if (idx >= binCount) idx = binCount - 1;
        if (idx < 0) idx = 0;
        counts[idx]++;
      }
      return { result: { bins, counts } };
    },
  },

  'data-input': {
    type: 'data-input',
    category: 'statistics',
    labelKey: 'npDataInput',
    icon: 'Brackets',
    color: 'rose',
    inputs: [],
    outputs: [{ id: 'data', labelKey: 'npPortData', type: 'any' }],
    defaultConfig: { data: '[1, 2, 3, 4, 5]' },
    execute: (_inputs, config) => {
      const raw = String(config.data ?? '[]');
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(raw);
      } catch {
        // 非 JSON：尝试按逗号/空白分割。
        parsed = raw
          .split(/[,\s]+/)
          .map((s) => s.trim())
          .filter((s) => s.length > 0)
          .map((s) => Number(s));
      }
      return { data: toNumberArray(parsed) };
    },
  },
} satisfies Record<string, NodeTypeDef>;