/**
 * Statistics category node definitions — 统计采样与分析。
 *
 * 数据通过 'any' 端口以 number[] 传输。包含随机采样 / 均值方差 /
 * 直方图 / JSON 数据输入。
 */

import type { NodeTypeDef } from '../pipelineEngine';

/** 从任意输入解析为 number[]；容错处理嵌套与非数值。 */
function toNumberArray(v: unknown): number[] {
  if (Array.isArray(v)) {
    return v
      .map((x) => (typeof x === 'number' ? x : Number(x)))
      .filter((n) => Number.isFinite(n));
  }
  return [];
}

/** Box-Muller 变换生成标准正态分布样本。 */
function gaussian(): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
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
    defaultConfig: { distribution: 'uniform', count: 10, min: 0, max: 1 },
    execute: (_inputs, config) => {
      const distribution = String(config.distribution ?? 'uniform');
      const count = Math.max(0, Math.floor(Number(config.count ?? 10)));
      const min = Number(config.min ?? 0);
      const max = Number(config.max ?? 1);
      const data: number[] = [];
      for (let i = 0; i < count; i++) {
        if (distribution === 'normal') {
          // 标准正态缩放到 [min, max] 的均值/标准差区间。
          const mean = (min + max) / 2;
          const sd = (max - min) / 4 || 1;
          data.push(mean + gaussian() * sd);
        } else {
          data.push(min + Math.random() * (max - min));
        }
      }
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
    ],
    defaultConfig: {},
    execute: (inputs) => {
      const data = toNumberArray(inputs.data);
      const n = data.length;
      if (n === 0) {
        return { mean: NaN, variance: NaN };
      }
      const mean = data.reduce((s, x) => s + x, 0) / n;
      const variance =
        n > 1
          ? data.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1)
          : 0;
      return { mean, variance };
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
