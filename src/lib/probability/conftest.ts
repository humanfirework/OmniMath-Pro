/**
 * OmniMath Pro — 假设检验计算层（纯函数，无 React / 无 canvas）。
 *
 * 与 `distributions.ts`（各分布 pdf/cdf/inv/sample）互补：本模块专注「一组样本
 * 数据」的正态性/拟合检验与自助法区间，供 StatisticsPanel 的「假设检验」Tab、
 * 独立运行结果面板与蓝图 statistics 节点共用，避免重复实现导致行为漂移。
 *
 * 校验目标（对标 MATLAB: swtest / adtest / lillietest / kstest / bootci）：
 *   - shapiroWilk      — Shapiro–Wilk 正态性检验（Royston 1992，3 ≤ n ≤ 5000）
 *   - andersonDarling  — Anderson–Darling 正态性检验（Stephens 1986 p 值近似）
 *   - lilliefors       — Lilliefors 检验（含估计参数的 KS，D'Agostino–Stephens p 值）
 *   - kolmogorovSmirnov— 单样本 KS 检验（对已知 cdf）
 *   - bootstrapCI      — 百分位自助法置信区间（可种子化，可复现）
 */

import { mean, stdDev, sortedCopy } from './stats';
import { normInv, normCdf } from './distributions';
import { mulberry32 } from './rng';

/** 把 p 值裁剪到 [0,1]，避免数值外溢。 */
function clampP(p: number): number {
  if (!Number.isFinite(p)) return 0;
  return Math.min(1, Math.max(0, p));
}

/* ================================================================== *
 * 工具：标准正态随机数（Box–Muller）
 * ================================================================== */

function normSample(rng: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/* ================================================================== *
 * Shapiro–Wilk 正态性检验（Royston 1992, AS R94）
 * ================================================================== */

/**
 * Shapiro–Wilk 正态性检验。
 * 有效样本量 3 ≤ n ≤ 5000。返回统计量 W（接近 1 越正态）与 p 值。
 * H₀：样本来自正态总体。p < α 拒绝 H₀。
 */
export function shapiroWilk(data: ArrayLike<number>): { W: number; p: number } {
  const n = data.length;
  if (n < 3 || n > 5000) {
    throw new Error(`Shapiro–Wilk 需要 3 ≤ n ≤ 5000，当前 n=${n}`);
  }
  const xs = sortedCopy(data);

  // 1. 正态次序统计量期望值 m_i = Φ⁻¹((i-0.375)/(n+0.25))
  const m: number[] = new Array(n);
  let mNormSq = 0;
  for (let i = 0; i < n; i++) {
    m[i] = normInv((i + 1 - 0.375) / (n + 0.25));
    mNormSq += m[i] * m[i];
  }
  const mNorm = Math.sqrt(mNormSq);

  // 2. 系数向量 a（a'a = 1，反对称：a_i = -a_{n+1-i}）
  const a = shapiroWilkCoeffs(n, m, mNorm);

  // 3. W 统计量
  const xbar = mean(xs);
  let num = 0;
  let denom = 0;
  for (let i = 0; i < n; i++) {
    num += a[i] * xs[i];
    const d = xs[i] - xbar;
    denom += d * d;
  }
  const W = denom > 0 ? (num * num) / denom : 0;

  // 4. p 值（Royston 1992 正态变换）
  const p = shapiroWilkP(n, W);
  return { W, p };
}

function shapiroWilkCoeffs(n: number, m: number[], mNorm: number): number[] {
  const a: number[] = new Array(n).fill(0);

  if (n === 3) {
    a[0] = Math.SQRT1_2;
    a[1] = 0;
    a[2] = -Math.SQRT1_2;
    return a;
  }
  if (n === 4) {
    return [0.6872, 0.1677, -0.1677, -0.6872];
  }
  if (n === 5) {
    return [0.6646, 0.2413, 0, -0.2413, -0.6646];
  }

  // n ≥ 6：a_n 用 Royston 五次多项式；a_1 = -a_n（反对称）；内部 ≈ m_i/mNorm。
  const u = 1 / Math.sqrt(n);
  // 多项式系数（降幂）：-2.706056u⁵ + 4.434685u⁴ - 2.071190u³ - 0.147981u² + 0.221157u
  const an =
    -2.706056 * Math.pow(u, 5) +
    4.434685 * Math.pow(u, 4) -
    2.07119 * Math.pow(u, 3) -
    0.147981 * Math.pow(u, 2) +
    0.221157 * u +
    m[n - 1] / mNorm;

  a[0] = -an;
  a[n - 1] = an;
  for (let i = 1; i < n - 1; i++) a[i] = m[i] / mNorm;

  // 归一化到单位长度（a'a = 1）
  let s = 0;
  for (const v of a) s += v * v;
  const norm = Math.sqrt(s);
  if (norm > 0) for (let i = 0; i < n; i++) a[i] /= norm;
  return a;
}

function shapiroWilkP(n: number, W: number): number {
  let z: number;
  if (W <= 0) {
    // W 过小（极端非正态），p 取极小值
    return 0;
  }
  if (n <= 11) {
    // 小样本（Royston 1992）：x = -log(gamma - log(1-W))，μ/σ 为关于 n 的三次多项式
    const gamma = 0.459 * n - 2.273;
    const L = Math.log(1 - W);
    const x = -Math.log(gamma - L); // gamma - log(1-W) > 0（数值上由测试保证）
    const mu = 0.544 - 0.39978 * n + 0.025054 * n * n - 0.0006714 * n * n * n;
    const sigma = Math.exp(1.3822 - 0.77857 * n + 0.062767 * n * n - 0.0020322 * n * n * n);
    z = (x - mu) / (sigma || 1e-12);
  } else {
    // 大样本（12 ≤ n ≤ 5000）：x = log(1-W)，μ/σ 为关于 y=log(n) 的多项式
    const x = Math.log(1 - W);
    const y = Math.log(n);
    const mu = -1.5861 - 0.31082 * y - 0.083751 * y * y + 0.0038915 * y * y * y;
    const sigma = Math.exp(-0.4803 - 0.082676 * y + 0.0030302 * y * y);
    z = (x - mu) / (sigma || 1e-12);
  }
  // p = P(W < observed) = 1 - Φ(z)
  return clampP(1 - normCdf(z));
}

/* ================================================================== *
 * Anderson–Darling 正态性检验（Stephens 1986 p 值）
 * ================================================================== */

/**
 * Anderson–Darling 正态性检验（估计 μ、σ）。
 * H₀：样本来自正态总体。p < α 拒绝 H₀。
 */
export function andersonDarling(data: ArrayLike<number>): { A2: number; p: number } {
  const n = data.length;
  if (n < 2) throw new Error('Anderson–Darling 需要至少 2 个数据点');
  const xs = sortedCopy(data);
  const mu = mean(xs);
  const sd = stdDev(xs);
  if (!(sd > 0)) throw new Error('标准差为 0，无法进行检验');

  let s = 0;
  for (let i = 0; i < n; i++) {
    const z = (xs[i] - mu) / sd;
    const zr = (xs[n - 1 - i] - mu) / sd;
    const F = normCdf(z);
    const Fr = normCdf(zr);
    if (F <= 0 || F >= 1 || Fr <= 0 || Fr >= 1) continue;
    s += (2 * (i + 1) - 1) * (Math.log(F) + Math.log(1 - Fr));
  }
  const A2 = -n - s / n;
  // 小样本修正
  const A2star = A2 * (1 + 0.75 / n + 2.25 / (n * n));
  const p = adPValue(A2star);
  return { A2, p };
}

function adPValue(A2s: number): number {
  let p: number;
  if (A2s >= 0.6) p = Math.exp(1.2937 - 5.709 * A2s + 0.0186 * A2s * A2s);
  else if (A2s >= 0.34) p = Math.exp(0.9177 - 4.279 * A2s - 1.38 * A2s * A2s);
  else if (A2s >= 0.2) p = 1 - Math.exp(-8.318 + 42.796 * A2s - 59.938 * A2s * A2s);
  else p = 1 - Math.exp(-13.436 + 101.14 * A2s - 223.73 * A2s * A2s);
  return clampP(p);
}

/* ================================================================== *
 * Lilliefors 检验（含估计参数的正态性 KS）—— D'Agostino & Stephens (1986)
 * ================================================================== */

/**
 * Lilliefors 检验：用估计的 μ、σ 标准化后做 KS。
 * H₀：样本来自某个正态总体。p < α 拒绝 H₀。
 */
export function lilliefors(data: ArrayLike<number>): { D: number; p: number } {
  const n = data.length;
  if (n < 4) throw new Error('Lilliefors 需要至少 4 个数据点');
  const xs = sortedCopy(data);
  const mu = mean(xs);
  const sd = stdDev(xs);
  if (!(sd > 0)) throw new Error('标准差为 0，无法进行检验');

  let D = 0;
  for (let i = 0; i < n; i++) {
    const z = (xs[i] - mu) / sd;
    const F = normCdf(z);
    const lo = i / n;
    const hi = (i + 1) / n;
    D = Math.max(D, Math.abs(hi - F), Math.abs(F - lo));
  }
  // D'Agostino & Stephens (1986) Lilliefors p 值近似
  const p = Math.exp(
    -7.01256 * D * D * (n + 2.78019) +
      2.99587 * D * Math.sqrt(n) -
      0.122119 +
      0.974598 / Math.sqrt(n) +
      1.67997 / n,
  );
  return { D, p: clampP(p) };
}

/* ================================================================== *
 * 单样本 Kolmogorov–Smirnov 检验（对已知 cdf）
 * ================================================================== */

/**
 * 单样本 KS 检验：H₀ 为样本来自 cdf 指定的分布。
 * cdf 接收一个数值、返回累积概率。p < α 拒绝 H₀。
 */
export function kolmogorovSmirnov(
  data: ArrayLike<number>,
  cdf: (x: number) => number,
): { D: number; p: number } {
  const n = data.length;
  if (n < 1) throw new Error('KS 需要至少 1 个数据点');
  const xs = sortedCopy(data);

  let D = 0;
  for (let i = 0; i < n; i++) {
    const F0 = cdf(xs[i]);
    const lo = i / n;
    const hi = (i + 1) / n;
    D = Math.max(D, Math.abs(hi - F0), Math.abs(F0 - lo));
  }
  // 有限样本校正 λ，用 Smirnov 尾概率
  const lambda = (Math.sqrt(n) + 0.12 + 0.11 / Math.sqrt(n)) * D;
  const p = smirnovTail(lambda);
  return { D, p };
}

/** Smirnov 尾概率：2 Σ_{k=1}^∞ (-1)^{k-1} exp(-2 k² λ²)。 */
function smirnovTail(lambda: number): number {
  if (lambda <= 0) return 1;
  let sum = 0;
  for (let k = 1; k <= 100; k++) {
    const term = 2 * (k % 2 === 1 ? 1 : -1) * Math.exp(-2 * k * k * lambda * lambda);
    sum += term;
    if (Math.abs(term) < 1e-14) break;
  }
  return clampP(sum);
}

/* ================================================================== *
 * 百分位自助法置信区间（可种子化）
 * ================================================================== */

export interface BootstrapCIResult {
  /** 点估计（原始样本统计量）。 */
  point: number;
  /** 自助分布均值。 */
  mean: number;
  /** 自助分布标准误。 */
  se: number;
  /** 置信下限。 */
  lo: number;
  /** 置信上限。 */
  hi: number;
  /** 置信水平 1-α。 */
  level: number;
  /** 重采样次数。 */
  iterations: number;
}

/**
 * 百分位自助法置信区间。
 * @param data 原始样本
 * @param statFn 作用于样本上的统计量（如 d => mean(d)）
 * @param opts.iterations 重采样次数（默认 1000）
 * @param opts.alpha 显著性水平（默认 0.05 → 95% 区间）
 * @param opts.seed 随机种子（默认 1，保证可复现）
 */
export function bootstrapCI(
  data: ArrayLike<number>,
  statFn: (sample: number[]) => number,
  opts?: { iterations?: number; alpha?: number; seed?: number },
): BootstrapCIResult {
  const iterations = opts?.iterations ?? 1000;
  const alpha = opts?.alpha ?? 0.05;
  const seed = opts?.seed ?? 1;
  const n = data.length;
  if (n < 2) throw new Error('Bootstrap 需要至少 2 个数据点');
  if (iterations < 20) throw new Error('Bootstrap 重采样次数不能少于 20');

  const rng = mulberry32(seed);
  const values: number[] = new Array(iterations);
  for (let b = 0; b < iterations; b++) {
    const sample = new Array(n);
    for (let i = 0; i < n; i++) sample[i] = data[Math.floor(rng() * n)];
    values[b] = statFn(sample);
  }
  const sorted = sortedCopy(values);
  const loIdx = Math.floor((alpha / 2) * iterations);
  const hiIdx = Math.ceil((1 - alpha / 2) * iterations) - 1;
  const lo = sorted[Math.max(0, loIdx)];
  const hi = sorted[Math.min(iterations - 1, hiIdx)];

  const m = mean(values);
  const se = stdDev(values);
  return {
    point: statFn(Array.from(data)),
    mean: m,
    se: Number.isFinite(se) ? se : NaN,
    lo,
    hi,
    level: 1 - alpha,
    iterations,
  };
}

/** 便捷：服从标准正态的校验样本（测试用）。 */
export function normalSample(count: number, seed = 42): number[] {
  const rng = mulberry32(seed);
  return Array.from({ length: count }, () => normSample(rng));
}