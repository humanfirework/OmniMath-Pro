/**
 * OmniMath Pro — 统一概率分布模块 (pure logic, no React)
 *
 * 为面板、蓝图节点、引擎表达式作用域三处共用的唯一分布实现。每个分布提供
 * `pdf / cdf / inv / sample` 四件套，共享底层特殊函数（logGamma /
 * incompleteBeta / gammp / erf / normInv），避免三处重复实现导致行为漂移。
 *
 * 所有采样统一接收可种子化 `Rng`（见 rng.ts），保证可复现。
 */

import type { Rng } from './rng';
import { mulberry32 } from './rng';

/* ================================================================== *
 * 特殊函数层（自包含，供各分布复用）
 * ================================================================== */

/** Lanczos approximation for log-gamma. */
export function logGamma(x: number): number {
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
export function incompleteBeta(x: number, a: number, b: number): number {
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
export function gammp(a: number, x: number): number {
  if (x < 0 || a <= 0) return 0;
  if (x < a + 1) {
    const gln = logGamma(a);
    let ap = a;
    let sum = 1 / a;
    let s = sum;
    for (let n = 0; n < 200; n++) {
      ap += 1;
      const d = (sum * x) / ap;
      s += d;
      if (Math.abs(d) < Math.abs(s) * 3e-12) break;
      sum = d;
    }
    return s * Math.exp(-x + a * Math.log(x) - gln);
  }
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

/** 误差函数 erf(x)（Abramowitz–Stegun 7.1.26，|ε|≤1.5e-7）。 */
export function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const a = [0.254829592, -0.284496736, 1.421413741, -1.453152027, 1.061405429];
  const p = 0.3275911;
  const t = 1 / (1 + p * x);
  let y = 0;
  for (let i = a.length - 1; i >= 0; i--) y = y * t + a[i];
  return sign * (1 - y * t * Math.exp(-x * x));
}

/** 标准正态分位数 Φ⁻¹(p)（Acklam 有理逼近 + Halley 校正）。 */
export function normInv(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  // Acklam
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
  // Halley 校正
  const phi = Math.exp((-x * x) / 2) / Math.sqrt(2 * Math.PI);
  const f = 0.5 * (1 + erf(x / Math.SQRT2)) - p;
  const step = f / phi;
  return x - step / (1 + (x * step) / 2);
}

/** 标准正态 CDF Φ(x)。 */
export function normCdf(x: number): number {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}

/** 标准正态 PDF φ(x)。 */
export function normPdf(x: number): number {
  return Math.exp((-x * x) / 2) / Math.sqrt(2 * Math.PI);
}

/** 通用逆 CDF：二分锁定 + 收敛。 */
export function invFromCdf(cdf: (x: number) => number, p: number, lo: number, hi: number, tol = 1e-12): number {
  if (!(p > 0) || !(p < 1)) return NaN;
  let guard = 0;
  while (cdf(lo) > p && guard++ < 200) lo *= 2;
  guard = 0;
  while (cdf(hi) < p && guard++ < 200) hi *= 2;
  for (let i = 0; i < 120; i++) {
    const m = (lo + hi) / 2;
    if (cdf(m) < p) lo = m;
    else hi = m;
    if (hi - lo < tol) return (lo + hi) / 2;
  }
  return (lo + hi) / 2;
}

/* ================================================================== *
 * 分布枚举与工厂
 * ================================================================== */

export type DistKind =
  | 'normal' | 'uniform' | 'exponential' | 'gamma' | 'beta'
  | 'chisquare' | 'studentt' | 'fdist' | 'lognormal' | 'weibull'
  | 'binomial' | 'poisson' | 'geometric' | 'negbinomial';

export interface Dist {
  kind: DistKind;
  params: Record<string, number>;
  pdf(x: number): number;
  cdf(x: number): number;
  inv(p: number): number;
  sample(rng?: Rng): number;
}

/** 标准正态采样（Box-Muller）。 */
export function normalSample(rng: Rng): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Gamma 采样（Marsaglia–Tsang）。 */
function gammaSample(alpha: number, beta: number, rng: Rng): number {
  if (alpha < 1) return gammaSample(alpha + 1, beta, rng) * Math.pow(rng(), 1 / alpha);
  const d = alpha - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x = rng();
    let v = 0;
    do {
      x = rng();
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = rng();
    if (u < 1 - 0.0331 * x * x * x * x) return (d * v) / beta;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return (d * v) / beta;
  }
}

/** 二项采样：n 次独立 Bernoulli。 */
function binomialSample(n: number, p: number, rng: Rng): number {
  let k = 0;
  for (let i = 0; i < n; i++) if (rng() < p) k++;
  return k;
}

/** 泊松采样（Knuth，λ 适中）。 */
function poissonSample(lambda: number, rng: Rng): number {
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng();
  } while (p > L);
  return k - 1;
}

/** 组合数 log：ln C(n,k)。 */
function lnComb(n: number, k: number): number {
  return logGamma(n + 1) - logGamma(k + 1) - logGamma(n - k + 1);
}

/** 由 kind + params 构造分布对象。 */
export function makeDist(kind: DistKind, params: Record<string, number>): Dist {
  switch (kind) {
    case 'normal': {
      const mu = params.mu ?? 0;
      const sigma = params.sigma ?? 1;
      return {
        kind, params: { mu, sigma },
        pdf: (x) => normPdf((x - mu) / sigma) / sigma,
        cdf: (x) => normCdf((x - mu) / sigma),
        inv: (p) => mu + sigma * normInv(p),
        sample: (rng = () => Math.random()) => mu + sigma * normalSample(rng),
      };
    }
    case 'uniform': {
      const a = params.a ?? 0;
      const b = params.b ?? 1;
      const span = b - a;
      return {
        kind, params: { a, b },
        pdf: (x) => (x >= a && x <= b ? 1 / span : 0),
        cdf: (x) => (x < a ? 0 : x > b ? 1 : (x - a) / span),
        inv: (p) => a + p * span,
        sample: (rng = () => Math.random()) => a + rng() * span,
      };
    }
    case 'exponential': {
      const rate = params.rate ?? 1;
      return {
        kind, params: { rate },
        pdf: (x) => (x < 0 ? 0 : rate * Math.exp(-rate * x)),
        cdf: (x) => (x < 0 ? 0 : 1 - Math.exp(-rate * x)),
        inv: (p) => -Math.log(1 - p) / rate,
        sample: (rng = () => Math.random()) => -Math.log(rng()) / rate,
      };
    }
    case 'gamma': {
      const alpha = params.alpha ?? 2;
      const beta = params.beta ?? 1;
      return {
        kind, params: { alpha, beta },
        pdf: (x) => {
          if (x < 0) return 0;
          const log = (alpha - 1) * Math.log(x) - beta * x + alpha * Math.log(beta) - logGamma(alpha);
          return Math.exp(log);
        },
        cdf: (x) => (x <= 0 ? 0 : gammp(alpha, beta * x)),
        inv: (p) => invFromCdf((x) => gammp(alpha, beta * x), p, 0, 1e6),
        sample: (rng = () => Math.random()) => gammaSample(alpha, beta, rng),
      };
    }
    case 'beta': {
      const alpha = params.alpha ?? 2;
      const beta = params.beta ?? 2;
      return {
        kind, params: { alpha, beta },
        pdf: (x) => {
          if (x < 0 || x > 1) return 0;
          const logb = logGamma(alpha + beta) - logGamma(alpha) - logGamma(beta);
          return Math.exp(logb + (alpha - 1) * Math.log(x) + (beta - 1) * Math.log(1 - x));
        },
        cdf: (x) => incompleteBeta(x, alpha, beta),
        inv: (p) => invFromCdf((x) => incompleteBeta(x, alpha, beta), p, 0, 1),
        sample: (rng = () => Math.random()) => {
          const g1 = gammaSample(alpha, 1, rng);
          const g2 = gammaSample(beta, 1, rng);
          return g1 / (g1 + g2);
        },
      };
    }
    case 'chisquare': {
      const df = params.df ?? 1;
      return {
        kind, params: { df },
        pdf: (x) => {
          if (x < 0) return 0;
          const log = (df / 2 - 1) * Math.log(x) - x / 2 - (df / 2) * Math.log(2) - logGamma(df / 2);
          return Math.exp(log);
        },
        cdf: (x) => (x <= 0 ? 0 : gammp(df / 2, x / 2)),
        inv: (p) => invFromCdf((x) => gammp(df / 2, x / 2), p, 0, 1e6),
        sample: (rng = () => Math.random()) => gammaSample(df / 2, 0.5, rng),
      };
    }
    case 'studentt': {
      const df = params.df ?? 5;
      const tCdf = (t: number): number => {
        if (df <= 0) return NaN;
        const x = df / (df + t * t);
        const ib = incompleteBeta(x, df / 2, 0.5);
        return t >= 0 ? 1 - ib / 2 : ib / 2;
      };
      return {
        kind, params: { df },
        pdf: (x) => {
          const log = logGamma((df + 1) / 2) - logGamma(df / 2) - 0.5 * Math.log(df * Math.PI) - ((df + 1) / 2) * Math.log(1 + (x * x) / df);
          return Math.exp(log);
        },
        cdf: tCdf,
        inv: (p) => invFromCdf(tCdf, p, -1e6, 1e6),
        sample: (rng = () => Math.random()) => normalSample(rng) / Math.sqrt(gammaSample(df / 2, 0.5, rng) / (df / 2)),
      };
    }
    case 'fdist': {
      const d1 = params.d1 ?? 5;
      const d2 = params.d2 ?? 5;
      const fCdf = (x: number): number => {
        if (x <= 0) return 0;
        return incompleteBeta((d1 * x) / (d1 * x + d2), d1 / 2, d2 / 2);
      };
      return {
        kind, params: { d1, d2 },
        pdf: (x) => {
          if (x <= 0) return 0;
          const a = d1 / 2;
          const b = d2 / 2;
          const log = a * Math.log(d1) + b * Math.log(d2) + logGamma(a + b) - logGamma(a) - logGamma(b) + (a - 1) * Math.log(x) - (a + b) * Math.log(d1 * x + d2);
          return Math.exp(log);
        },
        cdf: fCdf,
        inv: (p) => invFromCdf(fCdf, p, 0, 1e6),
        sample: (rng = () => Math.random()) => {
          const c1 = gammaSample(d1 / 2, 0.5, rng);
          const c2 = gammaSample(d2 / 2, 0.5, rng);
          return (c1 / d1) / (c2 / d2);
        },
      };
    }
    case 'lognormal': {
      const mu = params.mu ?? 0;
      const sigma = params.sigma ?? 1;
      return {
        kind, params: { mu, sigma },
        pdf: (x) => {
          if (x <= 0) return 0;
          const z = (Math.log(x) - mu) / sigma;
          return Math.exp((-z * z) / 2) / (x * sigma * Math.sqrt(2 * Math.PI));
        },
        cdf: (x) => (x <= 0 ? 0 : normCdf((Math.log(x) - mu) / sigma)),
        inv: (p) => Math.exp(mu + sigma * normInv(p)),
        sample: (rng = () => Math.random()) => Math.exp(mu + sigma * normalSample(rng)),
      };
    }
    case 'weibull': {
      const scale = params.scale ?? 1;
      const shape = params.shape ?? 1;
      return {
        kind, params: { scale, shape },
        pdf: (x) => {
          if (x < 0) return 0;
          const t = x / scale;
          return (shape / scale) * Math.pow(t, shape - 1) * Math.exp(-Math.pow(t, shape));
        },
        cdf: (x) => (x < 0 ? 0 : 1 - Math.exp(-Math.pow(x / scale, shape))),
        inv: (p) => scale * Math.pow(-Math.log(1 - p), 1 / shape),
        sample: (rng = () => Math.random()) => scale * Math.pow(-Math.log(rng()), 1 / shape),
      };
    }
    case 'binomial': {
      const n = Math.round(params.n ?? 10);
      const p = params.p ?? 0.5;
      const pmf = (k: number): number => {
        if (k < 0 || k > n) return 0;
        return Math.exp(lnComb(n, k) + k * Math.log(p) + (n - k) * Math.log(1 - p));
      };
      const cdf = (x: number): number => {
        let s = 0;
        for (let k = 0; k <= Math.floor(x) && k <= n; k++) s += pmf(k);
        return Math.max(0, Math.min(1, s));
      };
      return {
        kind, params: { n, p },
        pdf: pmf,
        cdf,
        inv: (q) => {
          let s = 0;
          for (let k = 0; k <= n; k++) {
            s += pmf(k);
            if (s >= q) return k;
          }
          return n;
        },
        sample: (rng = () => Math.random()) => binomialSample(n, p, rng),
      };
    }
    case 'poisson': {
      const lambda = params.lambda ?? 1;
      const pmf = (k: number): number => {
        if (k < 0 || !Number.isInteger(k)) return 0;
        return Math.exp(-lambda + k * Math.log(lambda) - logGamma(k + 1));
      };
      const cdf = (x: number): number => {
        let s = 0;
        for (let k = 0; k <= Math.floor(x); k++) s += pmf(k);
        return Math.max(0, Math.min(1, s));
      };
      return {
        kind, params: { lambda },
        pdf: pmf,
        cdf,
        inv: (q) => {
          let s = 0;
          for (let k = 0; ; k++) {
            s += pmf(k);
            if (s >= q) return k;
          }
        },
        sample: (rng = () => Math.random()) => poissonSample(lambda, rng),
      };
    }
    case 'geometric': {
      const p = params.p ?? 0.3;
      const pmf = (k: number): number => {
        if (k < 1 || !Number.isInteger(k)) return 0;
        return p * Math.pow(1 - p, k - 1);
      };
      const cdf = (x: number): number => (x < 1 ? 0 : 1 - Math.pow(1 - p, Math.floor(x)));
      return {
        kind, params: { p },
        pdf: pmf,
        cdf,
        inv: (q) => Math.max(1, Math.ceil(Math.log(1 - q) / Math.log(1 - p))),
        sample: (rng = () => Math.random()) => Math.ceil(Math.log(rng()) / Math.log(1 - p)),
      };
    }
    case 'negbinomial': {
      const r = params.r ?? 5;
      const p = params.p ?? 0.5;
      const pmf = (k: number): number => {
        if (k < 0 || !Number.isInteger(k)) return 0;
        return Math.exp(lnComb(k + r - 1, k) + r * Math.log(p) + k * Math.log(1 - p));
      };
      const cdf = (x: number): number => {
        let s = 0;
        for (let k = 0; k <= Math.floor(x); k++) s += pmf(k);
        return Math.max(0, Math.min(1, s));
      };
      return {
        kind, params: { r, p },
        pdf: pmf,
        cdf,
        inv: (q) => {
          let s = 0;
          for (let k = 0; ; k++) {
            s += pmf(k);
            if (s >= q) return k;
          }
        },
        sample: (rng = () => Math.random()) => {
          let failures = 0;
          let successes = 0;
          while (successes < r) {
            if (rng() < p) successes++;
            else failures++;
          }
          return failures;
        },
      };
    }
  }
}

/** 便捷：按名称解析分布（支持中文别名）。 */
export const DIST_ALIASES: Record<string, DistKind> = {
  normal: 'normal', 正态: 'normal',
  uniform: 'uniform', 均匀: 'uniform',
  exponential: 'exponential', 指数: 'exponential',
  gamma: 'gamma', 伽马: 'gamma',
  beta: 'beta',
  chisquare: 'chisquare', 卡方: 'chisquare',
  studentt: 'studentt', t: 'studentt', t分布: 'studentt',
  fdist: 'fdist', f: 'fdist', f分布: 'fdist',
  lognormal: 'lognormal', 对数正态: 'lognormal',
  weibull: 'weibull', 威布尔: 'weibull',
  binomial: 'binomial', 二项: 'binomial',
  poisson: 'poisson', 泊松: 'poisson',
  geometric: 'geometric', 几何: 'geometric',
  negbinomial: 'negbinomial', 负二项: 'negbinomial',
};

export function resolveDist(name: string): DistKind | null {
  return DIST_ALIASES[String(name ?? '').toLowerCase()] ?? DIST_ALIASES[String(name ?? '')] ?? null;
}

/** 从任意参数源构造分布（容错 number/string）。 */
export function makeDistNamed(
  name: string,
  rawParams: Record<string, unknown>,
): Dist {
  const kind = resolveDist(name) ?? 'normal';
  const p: Record<string, number> = {};
  for (const [k, v] of Object.entries(rawParams)) {
    const n = typeof v === 'number' ? v : Number(v);
    p[k] = Number.isFinite(n) ? n : (p[k] ?? 0);
  }
  return makeDist(kind, p);
}

/** 带种子的一次性采样（供表达式/教学）：返回 [seedKey] 派生的可复现样本。 */
export function sampleSeeded(name: string, rawParams: Record<string, unknown>, count: number, seed: number): number[] {
  const dist = makeDistNamed(name, rawParams);
  const rng = mulberry32(seed);
  const out: number[] = [];
  for (let i = 0; i < count; i++) out.push(dist.sample(rng));
  return out;
}