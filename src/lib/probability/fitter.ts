/**
 * OmniMath Pro — 分布拟合（Distribution Fitter）纯逻辑层
 *
 * 把一组样本拟合到若干候选分布（极大似然 MLE），返回每个分布的最优参数、
 * 对数似然、AIC / BIC，用于「拟合优度」对比与「多分布 PDF 叠加」。
 *
 * 设计：
 *   - 全部为纯函数、无副作用、可在 node 环境单测。
 *   - 拟合算法优先用闭式解（normal/lognormal/exponential/uniform）；
 *     Gamma/Weibull 用 Newton–Raphson 迭代 MLE（依赖 digamma/trigamma）；
 *     beta 用矩估计（teaching 足够）。
 *   - 统一返回 `FitResult`，含 `logLik / aic / bic`，供 UI 排序。
 *
 * 约定：AIC = 2k − 2·L，BIC = k·ln(n) − 2·L，其中 k=参数个数、L=对数似然。
 */

import { makeDist, logGamma, type DistKind } from './distributions';
import { mean, stdDev } from './stats';

/* ================================================================== *
 * 特殊函数：digamma ψ(x) 与 trigamma ψ₁(x)
 * ================================================================== */

/** digamma ψ(x)，x>0。小 x 用递推推到 ≥6 后取渐近级数。 */
export function digamma(x: number): number {
  let result = 0;
  while (x < 6) {
    result -= 1 / x;
    x += 1;
  }
  const inv = 1 / (x * x);
  // ψ(x) = ln x − 1/(2x) − [1/(12x²) − 1/(120x⁴) + 1/(252x⁶) − 1/(240x⁸) + 5/(660x¹⁰) − 691/(32760x¹²)]
  const S =
    inv * (1 / 12 + inv * (-(1 / 120) + inv * (1 / 252 + inv * (-(1 / 240) + inv * (5 / 660 + inv * (-(691 / 32760)))))));
  return result + Math.log(x) - 1 / (2 * x) - S;
}

/** trigamma ψ₁(x)（digamma 的导数），x>0。 */
export function trigamma(x: number): number {
  let result = 0;
  while (x < 6) {
    result += 1 / (x * x);
    x += 1;
  }
  const inv = 1 / (x * x);
  // ψ₁(x) = 1/x + 1/(2x²) + 1/(6x³) − 1/(30x⁵) + 1/(42x⁷) − 1/(30x⁹) + 5/(66x¹¹) − 691/(2730x¹³)
  const series =
    (1 / x) * inv * (1 / 6 + inv * (-(1 / 30) + inv * (1 / 42 + inv * (-(1 / 30) + inv * (5 / 66)))));
  return result + 1 / x + 1 / (2 * x * x) + series;
}

/* ================================================================== *
 * 类型
 * ================================================================== */

export interface FitParams {
  /** 分布类型。 */
  kind: DistKind;
  /** 拟合参数（key 与 `makeDist` 一致）。 */
  params: Record<string, number>;
  /** 参数个数（用于 AIC/BIC）。 */
  k: number;
  /** 对数似然。 */
  logLik: number;
  /** AIC = 2k − 2L。 */
  aic: number;
  /** BIC = k·ln(n) − 2L。 */
  bic: number;
  /** 样本数。 */
  n: number;
}

/** 拟合候选分布白名单（按 UI 展示顺序）。 */
export const FITTABLE_DISTS: DistKind[] = [
  'normal',
  'lognormal',
  'exponential',
  'weibull',
  'gamma',
  'beta',
  'uniform',
  'chisquare',
];

/** 每个分布的中文名（供 UI）。 */
export const DIST_LABEL: Record<DistKind, string> = {
  normal: '正态分布',
  uniform: '均匀分布',
  exponential: '指数分布',
  gamma: 'Gamma 分布',
  beta: 'Beta 分布',
  chisquare: '卡方分布',
  studentt: 't 分布',
  fdist: 'F 分布',
  lognormal: '对数正态分布',
  weibull: 'Weibull 分布',
  binomial: '二项分布',
  poisson: '泊松分布',
  geometric: '几何分布',
  negbinomial: '负二项分布',
};

/* ================================================================== *
 * 单分布拟合
 * ================================================================== */

/** 由 params 计算对数似然（用 `makeDist` 的 pdf 求和）。 */
function logLikOf(kind: DistKind, params: Record<string, number>, data: number[]): number {
  const dist = makeDist(kind, params);
  let sum = 0;
  for (const x of data) {
    const p = dist.pdf(x);
    // 数据点落在该分布支撑之外 → 该分布根本无法描述这批数据 → 判为不兼容。
    // 若跳过这些点会人为抬高似然，使窄支撑分布（如 Beta）在 AIC 对比中「作弊」。
    if (!(p > 0)) return -Infinity;
    sum += Math.log(p);
  }
  return sum;
}

function makeResult(
  kind: DistKind,
  params: Record<string, number>,
  k: number,
  data: number[],
): FitParams {
  const n = data.length;
  const logLik = logLikOf(kind, params, data);
  return { kind, params, k, logLik, aic: 2 * k - 2 * logLik, bic: k * Math.log(n) - 2 * logLik, n };
}

/* ---- 闭式解分布 ---- */

function fitNormal(data: number[]): FitParams {
  const mu = mean(data);
  const sigma = stdDev(data); // 样本标准差（n-1）
  // MLE 用总体标准差（除以 n）
  const n = data.length;
  let variance = 0;
  for (const x of data) variance += (x - mu) * (x - mu);
  const sMLE = Math.sqrt(variance / n) || 1e-12;
  return makeResult('normal', { mu, sigma: sMLE }, 2, data);
}

function fitLognormal(data: number[]): FitParams {
  const logx = data.filter((x) => x > 0).map(Math.log);
  if (logx.length < 2) return makeResult('lognormal', { mu: 0, sigma: 1 }, 2, data);
  const mu = mean(logx);
  const n = logx.length;
  let variance = 0;
  for (const y of logx) variance += (y - mu) * (y - mu);
  const s = Math.sqrt(variance / n) || 1e-12;
  return makeResult('lognormal', { mu, sigma: s }, 2, data);
}

function fitExponential(data: number[]): FitParams {
  const positive = data.filter((x) => x >= 0);
  const m = mean(positive);
  const rate = m > 0 ? 1 / m : 1;
  return makeResult('exponential', { rate }, 1, data);
}

function fitUniform(data: number[]): FitParams {
  let lo = Infinity;
  let hi = -Infinity;
  for (const x of data) {
    if (x < lo) lo = x;
    if (x > hi) hi = x;
  }
  return makeResult('uniform', { a: lo, b: hi }, 2, data);
}

/** 卡方：矩估计 df = mean(x)（卡方期望 = df）。 */
function fitChisquare(data: number[]): FitParams {
  const m = mean(data);
  const df = m > 0 ? m : 1;
  return makeResult('chisquare', { df }, 1, data);
}

/** Beta 矩估计：仅对 (0,1) 数据有意义。alpha = m*t, beta=(1-m)*t, t=m(1-m)/var−1。 */
function fitBeta(data: number[]): FitParams {
  const inRange = data.filter((x) => x > 0 && x < 1);
  if (inRange.length < 2) return makeResult('beta', { alpha: 2, beta: 2 }, 2, data);
  const m = mean(inRange);
  const v = varianceOf(inRange);
  const t = v > 0 && m > 0 && m < 1 ? (m * (1 - m)) / v - 1 : 2;
  const tSafe = t > 0 ? t : 1;
  return makeResult('beta', { alpha: m * tSafe, beta: (1 - m) * tSafe }, 2, data);
}

function varianceOf(data: number[]): number {
  const m = mean(data);
  let s = 0;
  for (const x of data) s += (x - m) * (x - m);
  return s / data.length;
}

/* ---- Gamma MLE（Newton–Raphson） ---- */
/**
 * Gamma(alpha, beta_rate)：
 *   log(alpha) − ψ(alpha) = log(mean x) − mean(log x) =: s
 *   迭代 alpha，再 beta = alpha / mean(x)。
 */
function fitGamma(data: number[]): FitParams {
  const positive = data.filter((x) => x > 0);
  if (positive.length < 2) return makeResult('gamma', { alpha: 2, beta: 1 }, 2, data);
  const m = mean(positive);
  const lm = mean(positive.map(Math.log));
  const s = Math.log(m) - lm;
  // 初值：矩估计 alpha0 = m²/var
  const v = varianceOf(positive);
  let alpha = v > 0 ? (m * m) / v : 1;
  if (!Number.isFinite(alpha) || alpha <= 0) alpha = 1;
  for (let i = 0; i < 100; i++) {
    const f = Math.log(alpha) - digamma(alpha) - s;
    const df = 1 / alpha - trigamma(alpha);
    if (!Number.isFinite(df) || Math.abs(df) < 1e-12) break;
    const step = f / df;
    alpha -= step;
    if (alpha <= 0) alpha = 1e-6;
    if (Math.abs(step) < 1e-8) break;
  }
  const beta = alpha / m;
  return makeResult('gamma', { alpha, beta }, 2, data);
}

/* ---- Weibull MLE（Newton–Raphson） ---- */
/**
 * 形状 k 满足：Σ(xᵏ ln x)/Σ(xᵏ) − mean(ln x) − 1/k = 0。
 * 标度 λ = (mean(xᵏ))^(1/k)。
 */
function fitWeibull(data: number[]): FitParams {
  const positive = data.filter((x) => x > 0);
  if (positive.length < 2) return makeResult('weibull', { scale: 1, shape: 1 }, 2, data);
  const n = positive.length;
  const meanLog = mean(positive.map(Math.log));
  let k = 1;
  for (let i = 0; i < 100; i++) {
    const sxk = positive.reduce((a, x) => a + Math.pow(x, k), 0);
    const sxkLog = positive.reduce((a, x) => a + Math.pow(x, k) * Math.log(x), 0);
    const f = sxkLog / sxk - meanLog - 1 / k;
    // 数值导数
    const eps = 1e-4;
    const sxk2 = positive.reduce((a, x) => a + Math.pow(x, k + eps), 0);
    const sxkLog2 = positive.reduce((a, x) => a + Math.pow(x, k + eps) * Math.log(x), 0);
    const f2 = sxkLog2 / sxk2 - meanLog - 1 / (k + eps);
    const df = (f2 - f) / eps;
    if (!Number.isFinite(df) || Math.abs(df) < 1e-12) break;
    const step = f / df;
    k -= step;
    if (k <= 0) k = 1e-6;
    if (Math.abs(step) < 1e-8) break;
  }
  const sxk = positive.reduce((a, x) => a + Math.pow(x, k), 0);
  const scale = Math.pow(sxk / n, 1 / k);
  return makeResult('weibull', { scale, shape: k }, 2, data);
}

const FITTERS: Record<string, (data: number[]) => FitParams> = {
  normal: fitNormal,
  lognormal: fitLognormal,
  exponential: fitExponential,
  uniform: fitUniform,
  chisquare: fitChisquare,
  beta: fitBeta,
  gamma: fitGamma,
  weibull: fitWeibull,
};

/** 拟合单个分布。 */
export function fitDistribution(kind: DistKind, data: number[]): FitParams {
  const fn = FITTERS[kind];
  if (!fn) return makeResult(kind, {}, 0, data);
  return fn(data);
}

/** 拟合全部候选分布，按 AIC 升序（越小越好）返回。 */
export function fitAllDistributions(data: number[], kinds: DistKind[] = FITTABLE_DISTS): FitParams[] {
  return kinds
    .map((k) => fitDistribution(k, data))
    .filter((r) => Number.isFinite(r.logLik))
    .sort((a, b) => a.aic - b.aic);
}

/** 便捷：返回信息熵风格的「对数似然占优者」用于排序展示（AIC 最低）。 */
export function bestDistribution(data: number[], kinds: DistKind[] = FITTABLE_DISTS): FitParams | null {
  const fits = fitAllDistributions(data, kinds);
  return fits.length > 0 ? fits[0] : null;
}