/**
 * OmniMath Pro — 自动控制原理（Control Theory）纯函数库
 *
 * 提供传递函数的常见分析工具，全部为纯函数、无副作用、可单测：
 *   - `evalTF`        ：在复频点 s 求传递函数 H(s) = N(s)/D(s)
 *   - `roots`         ：多项式求根（Abernethy 复根迭代，系数为实）
 *   - `bode`          ：幅值/相位随频率扫描（频率轴取对数）
 *   - `stepResponse`  ：阶跃响应（可控标准型状态空间 + RK4 数值积分）
 *
 * 约定：多项式系数按「最高次 → 常数项」排列，如
 *   H(s) = (s + 2) / (s^2 + 3s + 2)  →  num=[1,2], den=[1,3,2]
 */

export interface Complex {
  re: number;
  im: number;
}

export interface BodePoint {
  f: number; // 频率 Hz
  w: number; // 角频率 rad/s
  mag: number; // 幅值（线性）
  db: number; // 幅值 dB
  phaseDeg: number; // 相位（度，-180..180）
}

export interface StepPoint {
  t: number;
  y: number;
}

/* ------------------------------------------------------------------ *
 * 复运算（自实现，避免依赖 mathjs 的复数 API 差异）
 * ------------------------------------------------------------------ */
function cMul(a: Complex, b: Complex): Complex {
  return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re };
}
function cAdd(a: Complex, b: Complex): Complex {
  return { re: a.re + b.re, im: a.im + b.im };
}
function cSub(a: Complex, b: Complex): Complex {
  return { re: a.re - b.re, im: a.im - b.im };
}
function cDiv(a: Complex, b: Complex): Complex {
  const den = b.re * b.re + b.im * b.im;
  if (den === 0) return { re: Number.NaN, im: Number.NaN };
  return { re: (a.re * b.re + a.im * b.im) / den, im: (a.im * b.re - a.re * b.im) / den };
}
function cAbs(a: Complex): number {
  return Math.hypot(a.re, a.im);
}

/** 多项式求值 P(s) = c[0]*s^n + c[1]*s^(n-1) + ... + c[n]（系数高次在前）。 */
function polyEval(coeffs: number[], s: Complex): Complex {
  let acc: Complex = { re: 0, im: 0 };
  for (const c of coeffs) {
    acc = cMul(acc, s);
    acc = cAdd(acc, { re: c, im: 0 });
  }
  return acc;
}

/** 在复频点 s 求传递函数 H(s) = N(s)/D(s)。 */
export function evalTF(num: number[], den: number[], s: Complex): Complex {
  return cDiv(polyEval(num, s), polyEval(den, s));
}

/* ------------------------------------------------------------------ *
 * 多项式求根（Abernethy：Bairstow 式，针对实系数，返回复根）
 * ------------------------------------------------------------------ */
/** 解一元二次 A·x² + B·x + C = 0，返回复根。 */
function solveQuadratic(A: number, B: number, C: number): Complex[] {
  const disc = B * B - 4 * A * C;
  if (disc >= 0) {
    const s = Math.sqrt(disc);
    return [
      { re: (-B + s) / (2 * A), im: 0 },
      { re: (-B - s) / (2 * A), im: 0 },
    ];
  }
  const im = Math.sqrt(-disc) / (2 * A);
  return [
    { re: -B / (2 * A), im },
    { re: -B / (2 * A), im: -im },
  ];
}

/**
 * 求实系数多项式 p(x) = c[0]*x^n + ... + c[n] 的全部根（含复根）。
 * 一次/二次直接解；三次及以上用 Durand-Kerner（Weierstrass）并行迭代，
 * 对实系数多项式稳健收敛。
 */
export function roots(coeffs: number[]): Complex[] {
  // 去掉前导零，得到有效最高次
  let lead = 0;
  while (lead < coeffs.length - 1 && Math.abs(coeffs[lead]) < 1e-12) lead++;
  const a = coeffs.slice(lead);
  const n = a.length - 1;
  if (n < 1) return [];
  if (n === 1) {
    return [{ re: -a[1] / a[0], im: 0 }];
  }
  if (n === 2) {
    return solveQuadratic(a[0], a[1], a[2]);
  }

  // Durand-Kerner：并行逼近全部根
  const c = a.map((x) => x / a[0]); // 首一
  const R = 1 + Math.max(...c.slice(1).map(Math.abs));
  const rootsArr: Complex[] = [];
  for (let i = 0; i < n; i++) {
    const theta = (2 * Math.PI * i) / n + 0.4;
    rootsArr.push({ re: R * 0.4 * Math.cos(theta), im: R * 0.4 * Math.sin(theta) });
  }
  for (let iter = 0; iter < 3000; iter++) {
    let maxDelta = 0;
    for (let j = 0; j < n; j++) {
      const pj = polyEval(c, rootsArr[j]);
      let den: Complex = { re: 1, im: 0 };
      for (let k = 0; k < n; k++) {
        if (k === j) continue;
        den = cMul(den, cSub(rootsArr[j], rootsArr[k]));
      }
      const q = cDiv(pj, den);
      rootsArr[j] = cSub(rootsArr[j], q);
      maxDelta = Math.max(maxDelta, cAbs(q));
    }
    if (maxDelta < 1e-12) break;
  }
  return rootsArr;
}

/* ------------------------------------------------------------------ *
 * Bode 图
 * ------------------------------------------------------------------ */
/** 对数均匀扫描频率（fMin..fMax Hz，points 个点）。 */
export function logFreqs(fMin: number, fMax: number, points: number): number[] {
  const fs: number[] = [];
  const lo = Math.log10(fMin);
  const hi = Math.log10(fMax);
  for (let i = 0; i < points; i++) fs.push(Math.pow(10, lo + ((hi - lo) * i) / (points - 1)));
  return fs;
}

/** 计算 Bode 幅值/相位曲线。 */
export function bode(num: number[], den: number[], fMin = 0.01, fMax = 1000, points = 200): BodePoint[] {
  const out: BodePoint[] = [];
  for (const f of logFreqs(fMin, fMax, points)) {
    const w = 2 * Math.PI * f;
    const h = evalTF(num, den, { re: 0, im: w });
    const mag = cAbs(h);
    out.push({
      f,
      w,
      mag,
      db: 20 * Math.log10(mag || 1e-12),
      phaseDeg: (Math.atan2(h.im, h.re) * 180) / Math.PI,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * 稳定性裕度（Gain / Phase Margin）
 * ------------------------------------------------------------------ */
export interface StabilityMargins {
  /** 幅值裕度 GM（dB）：相位 =-180° 处 |G| 的 dB 取负。有限值即稳定裕度，∞ 表示相位未达 -180°。 */
  gm: number | null;
  /** 相位裕度 PM（度）：幅值穿越 0dB 处相位与 -180° 之差。有限值即稳定裕度，∞ 表示幅值未穿越 0dB。 */
  pm: number | null;
  /** 增益穿越频率 ωc（rad/s，|G|=0dB 处）。 */
  wgc: number | null;
  /** 相位穿越频率 ωp（rad/s，相位=-180° 处）。 */
  wpc: number | null;
}

/** 在点列中线性插值求「穿越 target 值」的横轴坐标（返回 null 表示未穿越）。 */
function crossingX(px: number[], py: number[], target: number): { x: number; y: number } | null {
  for (let i = 1; i < px.length; i++) {
    const y0 = py[i - 1];
    const y1 = py[i];
    if (!Number.isFinite(y0) || !Number.isFinite(y1)) continue;
    if ((y0 - target) * (y1 - target) > 0) continue; // 未经过 target
    const t = (target - y0) / (y1 - y0);
    const x = px[i - 1] + t * (px[i] - px[i - 1]);
    return { x, y: target };
  }
  return null;
}

/**
 * 从 Bode 数据计算增益/相位裕度：
 *   - PM：找幅值穿越 0dB 的频率 ωc，PM = 180° + phase(ωc)。
 *   - GM：找相位穿越 -180° 的频率 ωp，GM = -db(ωp)（dB）。
 * 返回 null 表示对应裕度不存在（此时系统对单回路增益有任意裕度，通常视为稳定但需注意）。
 */
export function stabilityMargins(bodePts: BodePoint[]): StabilityMargins {
  const fsLog = bodePts.map((p) => Math.log10(p.f));
  const dbArr = bodePts.map((p) => p.db);
  // 相位需先「解卷绕」成连续曲线（原始 phaseDeg 被 atan2 限制在 (-180,180]，
  // 跨 -180° 时会从 +180 跳到 -180）。解卷绕后相位单调变化，才能正确找 -180° 穿越。
  const phArr: number[] = [];
  for (const p of bodePts) {
    let ph = p.phaseDeg;
    if (phArr.length > 0) {
      let d = ph - phArr[phArr.length - 1];
      while (d > 180) { ph -= 360; d -= 360; }
      while (d < -180) { ph += 360; d += 360; }
    }
    phArr.push(ph);
  }

  // 增益穿越（|G|=0dB）→ ωc，线性插值相位
  const gc = crossingX(fsLog, dbArr, 0);
  let pm: number | null = null;
  let wgc: number | null = null;
  if (gc) {
    const gcIdx = gc.x;
    let phaseAtGc = phArr[phArr.length - 1];
    for (let i = 1; i < fsLog.length; i++) {
      if (fsLog[i] >= gcIdx) {
        const t = fsLog[i - 1] === fsLog[i] ? 0 : (gcIdx - fsLog[i - 1]) / (fsLog[i] - fsLog[i - 1]);
        phaseAtGc = phArr[i - 1] + t * (phArr[i] - phArr[i - 1]);
        break;
      }
    }
    pm = 180 + phaseAtGc;
    wgc = Math.pow(10, gcIdx) * (2 * Math.PI);
  }

  // 相位穿越（-180°）→ ωp，线性插值幅值
  const pc = crossingX(fsLog, phArr, -180);
  let gm: number | null = null;
  let wpc: number | null = null;
  if (pc) {
    const pcIdx = pc.x;
    let dbAtPc = dbArr[dbArr.length - 1];
    for (let i = 1; i < fsLog.length; i++) {
      if (fsLog[i] >= pcIdx) {
        const t = fsLog[i - 1] === fsLog[i] ? 0 : (pcIdx - fsLog[i - 1]) / (fsLog[i] - fsLog[i - 1]);
        dbAtPc = dbArr[i - 1] + t * (dbArr[i] - dbArr[i - 1]);
        break;
      }
    }
    gm = -dbAtPc;
    wpc = Math.pow(10, pcIdx) * (2 * Math.PI);
  }

  return { gm, pm, wgc, wpc };
}

/* ------------------------------------------------------------------ *
 * 阶跃响应（可控标准型状态空间 + RK4）
 * ------------------------------------------------------------------ */
/**
 * 一阶等效：把 H(s)=(b_n s^m+...+b_0)/(a_n s^n+...+a_0) 归一化为
 * 严格正则状态空间，用 RK4 求解零初始状态下的单位阶跃响应。
 * 返回 [{t, y}]，t 从 0 到 tEnd，共 steps 个采样点。
 */
export function stepResponse(num: number[], den: number[], tEnd = 10, steps = 400): StepPoint[] {
  // 归一化分母为首一
  const aLead = den[0];
  if (Math.abs(aLead) < 1e-12) return [];
  const A = den.map((x) => x / aLead); // 首一：A[0]=1，A[k] = s^(n-k) 的系数
  const n = A.length - 1; // 阶次
  const m = num.length - 1; // 分子阶次
  // 分子系数 b[j] = s^j 的系数（j = 0..n）。num[0] 是 s^m 的系数。
  const b: number[] = new Array(n + 1).fill(0);
  for (let j = 0; j <= n; j++) b[j] = j <= m ? num[m - j] / aLead : 0;
  // 直通项 D = b[n]（仅当分子分母同次才有非零）。
  const dFeed = b[n];
  // 输出反馈矩阵 c（可控标准型）：y = Σ c[i]·x_i + D·u，c[i] = b_i - a_i·b_n
  // 其中 b_i = s^i 的分子系数，a_i = s^i 的分母系数 = A[n-i]。
  const c: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    c[i] = b[i] - b[n] * A[n - i];
  }

  const dt = tEnd / steps;
  const x = new Array(n).fill(0);
  const out: StepPoint[] = [];

  const deriv = (state: number[], u: number): number[] => {
    const dx = new Array(n).fill(0);
    for (let i = 0; i < n - 1; i++) dx[i] = state[i + 1];
    let acc = 0;
    for (let k = 0; k < n; k++) acc += A[n - k] * state[k];
    dx[n - 1] = -acc + u;
    return dx;
  };
  const outputOf = (state: number[]): number => {
    let y = 0;
    for (let k = 0; k < n; k++) y += c[k] * state[k];
    return y + dFeed;
  };

  out.push({ t: 0, y: outputOf(x) });
  for (let i = 1; i <= steps; i++) {
    const u = 1; // 单位阶跃
    const k1 = deriv(x, u);
    const x2 = x.map((v, j) => v + (dt / 2) * k1[j]);
    const k2 = deriv(x2, u);
    const x3 = x.map((v, j) => v + (dt / 2) * k2[j]);
    const k3 = deriv(x3, u);
    const x4 = x.map((v, j) => v + dt * k3[j]);
    const k4 = deriv(x4, u);
    for (let j = 0; j < n; j++) x[j] += (dt / 6) * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j]);
    out.push({ t: i * dt, y: outputOf(x) });
  }
  return out;
}

/** 便捷：极点（分母根）。 */
export function poles(den: number[]): Complex[] {
  return roots(den);
}

/* ------------------------------------------------------------------ *
 * 多项式字符串解析 + 一键分析
 * ------------------------------------------------------------------ */
/**
 * 解析多项式字符串，返回系数数组（按「最高次 → 常数项」排列，与
 * `roots`/`bode`/`stepResponse` 的约定一致）。支持：
 *   - 代数多项式："s^2 + 3s + 2" / "2s^3 - 4s" / "*" 与空白 / 科学计数法 / 系数缺省=1
 *   - MATLAB 向量："[2 3]" / "[1,6,7,5]" / "2,3" / "1 6 7 5"（仅数字，按系数数组解析）
 * 非法输入返回 [0]。
 */
export function parsePolynomial(expr: string): number[] {
  const trimmed = String(expr ?? '').trim();
  if (!trimmed) return [0];

  // MATLAB 向量/系数数组形式（不含 s 或 ^，仅为数字）："2 3" / "[1 6 7 5]" / "1,2,3"
  if (!/[s^]/i.test(trimmed)) {
    const parts = trimmed.replace(/[\[\]()]/g, '').split(/[,;\s]+/).filter((x) => x.length > 0);
    const vals = parts.map((p) => Number(p));
    if (vals.length > 0 && vals.every((v) => Number.isFinite(v))) return vals;
  }

  let s = trimmed.replace(/\s+/g, '').replace(/\*/g, '').toLowerCase();
  if (!s) return [0];

  const map = new Map<number, number>();
  const terms = s.split(/(?=[+-])/).filter((x) => x.length > 0);
  for (let raw of terms) {
    let sign = 1;
    if (raw.startsWith('+')) raw = raw.slice(1);
    else if (raw.startsWith('-')) {
      sign = -1;
      raw = raw.slice(1);
    }
    if (!raw) continue;

    let power = 0;
    let coeffStr = raw;
    const caret = raw.indexOf('^');
    if (caret >= 0) {
      const p = parseInt(raw.slice(caret + 1), 10);
      if (Number.isFinite(p)) power = p;
      coeffStr = raw.slice(0, caret);
    } else if (raw.includes('s')) {
      power = 1;
      coeffStr = raw.slice(0, raw.indexOf('s'));
    }

    let coeff = 1;
    const c = coeffStr.length ? parseFloat(coeffStr) : NaN;
    if (Number.isFinite(c)) coeff = c;
    map.set(power, (map.get(power) ?? 0) + sign * coeff);
  }

  if (map.size === 0) return [0];
  const maxDeg = Math.max(...map.keys());
  const out: number[] = new Array(maxDeg + 1).fill(0);
  for (const [p, c] of map) out[maxDeg - p] = c;
  return out;
}

export interface TransferAnalysis {
  /** 分子系数（高次在前）。 */
  num: number[];
  /** 分母系数（高次在前）。 */
  den: number[];
  /** 极点（分母根）。 */
  poles: Complex[];
  /** Bode 曲线。 */
  bode: BodePoint[];
  /** 阶跃响应。 */
  step: StepPoint[];
}

/** 由分子/分母多项式字符串一键生成完整自控分析（极点 + 伯德图 + 阶跃响应）。 */
export function transferAnalysis(cfg: {
  num?: string;
  den?: string;
  fMin?: number;
  fMax?: number;
  tEnd?: number;
}): TransferAnalysis {
  const num = parsePolynomial(String(cfg.num ?? '1'));
  const den = parsePolynomial(String(cfg.den ?? 's^2+3s+2'));
  const fMin = Number(cfg.fMin ?? 0.01) || 0.01;
  const fMax = Number(cfg.fMax ?? 1000) || 1000;
  const tEnd = Math.max(0.1, Number(cfg.tEnd ?? 10) || 10);
  return {
    num,
    den,
    poles: roots(den),
    bode: bode(num, den, fMin, fMax),
    step: stepResponse(num, den, tEnd),
  };
}

/* ------------------------------------------------------------------ *
 * 根轨迹（Root Locus）：闭环极点随增益 K 的轨迹
 * ------------------------------------------------------------------ */
export interface RlocusPoint {
  K: number;
  /** 闭环特征方程 D(s)+K·N(s)=0 的根（闭环极点）。 */
  roots: Complex[];
}

/** 把高次在前系数数组「右对齐」扩展到指定长度（高位补 0）。 */
function padZeros(arr: number[], len: number): number[] {
  const out = new Array(len).fill(0);
  for (let i = 0; i < arr.length; i++) out[len - arr.length + i] = arr[i];
  return out;
}

/** 闭环特征方程系数：D(s) + K·N(s)。 */
function closedLoopCharPoly(num: number[], den: number[], K: number): number[] {
  const len = Math.max(den.length, num.length);
  const d = padZeros(den, len);
  const n = padZeros(num, len);
  return d.map((c, i) => c + K * n[i]);
}

/** 根轨迹：对每个增益 K 求闭环极点。K 列表由调用方提供（通常对数均匀）。 */
export function rlocus(num: number[], den: number[], Klist: number[]): RlocusPoint[] {
  return Klist.map((K) => ({ K, roots: roots(closedLoopCharPoly(num, den, K)) }));
}

/** 生成 K∈[kMin,kMax] 的对数均匀增益列表（根轨迹横轴）。 */
export function rlocusKlist(kMin: number, kMax: number, points = 200): number[] {
  const out: number[] = [];
  const lo = Math.log10(kMin);
  const hi = Math.log10(kMax);
  for (let i = 0; i < points; i++) out.push(Math.pow(10, lo + ((hi - lo) * i) / (points - 1)));
  return out;
}

/* ------------------------------------------------------------------ *
 * 奈奎斯特（Nyquist）：G(jω) 频率特性曲线
 * ------------------------------------------------------------------ */
export interface NyquistPoint {
  /** 角频率 rad/s。 */
  w: number;
  re: number;
  im: number;
}

/** 对数均匀数组 lo..hi。 */
function logSpace(lo: number, hi: number, points: number): number[] {
  const out: number[] = [];
  const llo = Math.log10(lo);
  const lhi = Math.log10(hi);
  for (let i = 0; i < points; i++) out.push(Math.pow(10, llo + ((lhi - llo) * i) / (points - 1)));
  return out;
}

/**
 * Nyquist 曲线：ω ∈ (0, wMax] 的 G(jω)（实部 re、虚部 im）。
 * 因 G 为实系数，负频率支路是正频率支路的共轭镜像，消费方可自行镜像。
 * 若开环在原点有极点（积分环节），ω→0 时 re/im 发散，属正常物理结果。
 */
export function nyquist(num: number[], den: number[], wMax = 1000, points = 400): NyquistPoint[] {
  const out: NyquistPoint[] = [];
  for (const w of logSpace(1e-3, wMax, points)) {
    const h = evalTF(num, den, { re: 0, im: w });
    out.push({ w, re: h.re, im: h.im });
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * PID 整定（Ziegler-Nichols 闭环临界比例度法）
 * ------------------------------------------------------------------ */
export type PidMethod = 'p' | 'pi' | 'pid';

export interface PidGains {
  Kp: number;
  /** 积分时间（P 时为 0）。 */
  Ti: number;
  /** 微分时间（P/PI 时为 0）。 */
  Td: number;
  /** 积分增益 = Kp/Ti。 */
  Ki: number;
  /** 微分增益 = Kp*Td。 */
  Kd: number;
}

export interface UltimatePoint {
  /** 幅值穿越频率（角频率 rad/s）。 */
  wu: number;
  /** 对应周期 Tu = 2π/wu。 */
  Tu: number;
  /** 临界增益 Ku = 1/|G(jωu)|。 */
  Ku: number;
}

/** 去掉系数数组的前导零（把多项式化为有效最高次）。 */
function trimLeadingZeros(arr: number[]): number[] {
  let lead = 0;
  while (lead < arr.length - 1 && Math.abs(arr[lead]) < 1e-12) lead++;
  return arr.slice(lead);
}

/**
 * 在 Bode 相位曲线上找首次穿越 -180° 的频率点，返回临界增益 Ku 与周期 Tu。
 * 相位以主值（±180° 回绕）返回，故先把相位「解卷绕」成连续曲线再找下降穿越。
 * 若系统相位不穿越 -180°（如最小相位一/二阶），返回 null（无法用本方法整定）。
 */
export function findUltimateGain(
  num: number[],
  den: number[],
  fMin = 0.01,
  fMax = 1000,
  points = 2000,
): UltimatePoint | null {
  const pts = bode(num, den, fMin, fMax, points);
  // 解卷绕相位：主值在 ±180 处回绕，需累加 ±360 使其连续
  let prev = pts[0].phaseDeg;
  let crossed: BodePoint | null = null;
  for (let i = 1; i < pts.length; i++) {
    let ph = pts[i].phaseDeg;
    while (ph - prev > 180) ph -= 360;
    while (ph - prev < -180) ph += 360;
    // 下降穿越 -180°
    if (prev > -180 && ph <= -180) {
      crossed = pts[i];
      break;
    }
    prev = ph;
  }
  if (!crossed) return null;
  const wu = crossed.w;
  const Ku = 1 / (crossed.mag || 1e-12);
  return { wu, Tu: (2 * Math.PI) / wu, Ku };
}

/** Ziegler-Nichols 由 Ku/Tu 计算 PID 增益。 */
export function pidGains(Ku: number, Tu: number, method: PidMethod = 'pid'): PidGains {
  let Kp: number;
  let Ti: number;
  let Td: number;
  switch (method) {
    case 'p':
      Kp = 0.5 * Ku;
      Ti = 0;
      Td = 0;
      break;
    case 'pi':
      Kp = 0.45 * Ku;
      Ti = Tu / 1.2;
      Td = 0;
      break;
    case 'pid':
    default:
      Kp = 0.6 * Ku;
      Ti = Tu / 2;
      Td = Tu / 8;
      break;
  }
  const Ki = Ti > 0 ? Kp / Ti : 0;
  const Kd = Kp * Td;
  return { Kp, Ti, Td, Ki, Kd };
}

/** 多项式乘法（高次在前）。 */
function polyMul(a: number[], b: number[]): number[] {
  const out = new Array(a.length + b.length - 1).fill(0);
  for (let i = 0; i < a.length; i++)
    for (let j = 0; j < b.length; j++) out[i + j] += a[i] * b[j];
  return out;
}

/** 多项式加法（高次在前，同长度逐项相加）。 */
function polyAdd(a: number[], b: number[]): number[] {
  const len = Math.max(a.length, b.length);
  const out = new Array(len).fill(0);
  for (let i = 0; i < a.length; i++) out[len - a.length + i] += a[i];
  for (let i = 0; i < b.length; i++) out[len - b.length + i] += b[i];
  return out;
}

/** 闭环传递函数：开环 L = Lnum/Lden → T = L/(1+L) = Lnum/(Lnum+Lden)。 */
export function closedLoopTransfer(Lnum: number[], Lden: number[]): { num: number[]; den: number[] } {
  const len = Math.max(Lnum.length, Lden.length);
  const n = padZeros(Lnum, len);
  const d = padZeros(Lden, len);
  return { num: trimLeadingZeros(n), den: trimLeadingZeros(d.map((c, i) => c + n[i])) };
}

export interface PidTuneResult {
  gains: PidGains;
  /** 闭环阶跃响应（验证整定稳定性）。 */
  step: StepPoint[];
}

/**
 * 由开环对象 G(s)=num/den 用 Ziegler-Nichols 整定 PID。
 * 控制器 C(s)=(Kd·s²+Kp·s+Ki)/s，闭环 T=CG/(1+CG)，返回增益与闭环阶跃。
 * 若找不到 -180° 穿越（无法整定），返回 { error }。
 */
export function pidTune(
  num: number[],
  den: number[],
  opts?: { method?: PidMethod; fMin?: number; fMax?: number; tEnd?: number; steps?: number },
): PidTuneResult | { error: string } {
  const method = opts?.method ?? 'pid';
  const fMin = opts?.fMin ?? 0.001;
  const fMax = opts?.fMax ?? 1000;
  const tEnd = opts?.tEnd ?? Math.max(5, 8 * (den.length - 1));
  const steps = opts?.steps ?? 400;
  const ult = findUltimateGain(num, den, fMin, fMax);
  if (!ult || !Number.isFinite(ult.Ku)) {
    return { error: '未找到相位穿越 -180° 的频率点，无法用 Ziegler-Nichols 整定（可能为最小相位一/二阶系统）。' };
  }
  const gains = pidGains(ult.Ku, ult.Tu, method);
  // 控制器 C(s) = (Kd s² + Kp s + Ki)/s
  const cNum = [gains.Kd, gains.Kp, gains.Ki];
  const cDen = [1, 0];
  // 开环 L = C·G
  const Lnum = polyMul(cNum, num);
  const Lden = polyMul(cDen, den);
  const { num: Tnum, den: Tden } = closedLoopTransfer(Lnum, Lden);
  return { gains, step: stepResponse(Tnum, Tden, tEnd, steps) };
}

/* ------------------------------------------------------------------ *
 * 冲激响应（Impulse Response，MATLAB impulse(num,den) 等价）
 * ------------------------------------------------------------------ *
 * 严格正则系统：impulse 响应 = C·e^{A·t}·B（零输入、初态=B）。
 * 复用可控标准型状态空间（与 stepResponse 同一套 A/C），用 RK4 积分初态问题。
 * 若分子分母同次（直通项 D≠0），冲激响应中会出现 D·δ(t)，只在 t=0 处计入。
 */
export function impulseResponse(num: number[], den: number[], tEnd = 10, steps = 400): StepPoint[] {
  const aLead = den[0];
  if (Math.abs(aLead) < 1e-12) return [];
  const A = den.map((x) => x / aLead);
  const n = A.length - 1;
  const m = num.length - 1;
  const b: number[] = new Array(n + 1).fill(0);
  for (let j = 0; j <= n; j++) b[j] = j <= m ? num[m - j] / aLead : 0;
  const dFeed = b[n];
  const c: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i++) c[i] = b[i] - b[n] * A[n - i];

  const dt = tEnd / steps;
  // 冲激：初态 x(0) = B = [0,...,0,1]^T（可控标准型输入矩阵），之后 u=0。
  const x = new Array(n).fill(0);
  if (n >= 1) x[n - 1] = 1;
  const deriv = (state: number[]): number[] => {
    const dx = new Array(n).fill(0);
    for (let i = 0; i < n - 1; i++) dx[i] = state[i + 1];
    let acc = 0;
    for (let k = 0; k < n; k++) acc += A[n - k] * state[k];
    dx[n - 1] = -acc;
    return dx;
  };
  const outputOf = (state: number[]): number => {
    let y = 0;
    for (let k = 0; k < n; k++) y += c[k] * state[k];
    return y;
  };

  const out: StepPoint[] = [];
  out.push({ t: 0, y: outputOf(x) + dFeed });
  for (let i = 1; i <= steps; i++) {
    const k1 = deriv(x);
    const x2 = x.map((v, j) => v + (dt / 2) * k1[j]);
    const k2 = deriv(x2);
    const x3 = x.map((v, j) => v + (dt / 2) * k2[j]);
    const k3 = deriv(x3);
    const x4 = x.map((v, j) => v + dt * k3[j]);
    const k4 = deriv(x4);
    for (let j = 0; j < n; j++) x[j] += (dt / 6) * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j]);
    out.push({ t: i * dt, y: outputOf(x) });
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * 劳斯判据（Routh-Hurwitz Stability Criterion）
 * ------------------------------------------------------------------ */
export interface RouthRow {
  /** 行标签，如 s^3、s^2、s^1、s^0。 */
  label: string;
  cols: number[];
}

export interface RouthResult {
  table: RouthRow[];
  /** 首列符号变号次数 = 右半平面（不稳定）根的个数。 */
  changes: number;
  /** 首列全部同号即稳定（允许临界为零边界的按 marginal 标注）。 */
  stable: boolean;
  /** 出现全零行（存在共轭虚轴根）或首列出现零 → 需辅助方程进一步判断，标注为临界/需注意。 */
  marginal: boolean;
  /** 说明文字。 */
  note: string;
}

/**
 * 劳斯判据：由特征方程系数（高次在前）构造劳斯表，判定稳定性。
 * 处理规则：
 *   - 首列出现 0：用极小正数 ε 代替，并标记 marginal。
 *   - 出现全零行：用上一行的辅助多项式求导系数填充，标记 marginal（存在共轭虚根）。
 * 返回首列变号次数 changes（=不稳定根数）与结论。
 */
export function routhStability(coeffs: number[]): RouthResult | { error: string } {
  let lead = 0;
  while (lead < coeffs.length - 1 && Math.abs(coeffs[lead]) < 1e-12) lead++;
  const a = coeffs.slice(lead);
  const n = a.length - 1;
  if (n < 1) return { error: '特征方程至少 1 阶' };
  if (a.some((x) => !Number.isFinite(x))) return { error: '存在非法系数' };

  // 劳斯表：rows[i][j] = 第 i 行第 j 列；共 n+1 行。
  // 标准构造：s^n 行取 a[0],a[2],…；s^(n-1) 行取 a[1],a[3],…；后续行按行列式递推。
  const rows: number[][] = [];
  const EPS = 1e-12;
  let marginal = false;

  const row0: number[] = [];
  const row1: number[] = [];
  for (let i = 0; i < a.length; i++) {
    if (i % 2 === 0) row0.push(a[i]);
    else row1.push(a[i]);
  }
  rows.push(row0, row1);

  for (let r = 2; r <= n; r++) {
    const prev = rows[r - 1];
    const prev2 = rows[r - 2];
    // 全零行处理：用上一行构造辅助多项式 p(x)，用其导数系数作为新行（临界/虚轴根）。
    if (prev.length > 0 && prev.every((x) => Math.abs(x) < 1e-12)) {
      marginal = true;
      const p = prev2;
      const m = p.length - 1;
      const derived: number[] = [];
      for (let i = 0; i < m; i++) derived.push((m - i) * p[i]);
      rows.push(derived);
      continue;
    }
    // 新行长度 = 上一行长度 - 1（不足的长度按 0 补齐）。
    const row: number[] = [];
    for (let j = 0; j < prev2.length - 1; j++) {
      const p1 = prev[j + 1] ?? 0;
      const p2 = prev2[j + 1] ?? 0;
      let v = (prev[0] * p2 - prev2[0] * p1) / prev[0];
      if (!Number.isFinite(v)) v = 0;
      if (Math.abs(v) < EPS) v = 0;
      row.push(v);
    }
    // 首列出现 0（且非全零行）→ 用 ε 代替
    if (row.length > 0 && Math.abs(row[0]) < 1e-12) {
      row[0] = EPS;
      marginal = true;
    }
    rows.push(row);
  }

  // 构建表（每行补 label）
  const table: RouthRow[] = rows.map((row, i) => ({
    label: `s^${n - i}`,
    cols: row,
  }));

  // 首列变号次数
  const firstCol = rows.map((r) => r[0]);
  let changes = 0;
  for (let i = 1; i < firstCol.length; i++) {
    if (firstCol[i] * firstCol[i - 1] < 0) changes++;
  }
  const stable = changes === 0 && !marginal;
  const note = marginal
    ? '出现零（全零行/首列零），系统存在临界根（虚轴或原点），需用辅助方程进一步判断，不能仅凭劳斯表判定稳定。'
    : changes === 0
      ? '首列全部同号，系统稳定（全部特征根在左半平面）。'
      : `首列符号变化 ${changes} 次，系统不稳定（有 ${changes} 个特征根在右半平面）。`;

  return { table, changes, stable, marginal, note };
}

/* ------------------------------------------------------------------ *
 * 梅逊增益公式（Mason's Gain Formula）
 * ------------------------------------------------------------------ */
export interface MasonPath {
  /** 前向通路增益 P_k。 */
  gain: number;
  /** 该前向通路所接触（touched）的回路序号（0-based，对应 loopGains 的下标）。 */
  touchedLoops: number[];
}

export interface MasonResult {
  /** 特征式 Δ = 1 - ΣL + Σ(两两不相交 L_i L_j) - ... */
  delta: number;
  /** 分子 Σ P_k·Δ_k。 */
  numerator: number;
  /** 总增益 T = numerator / Δ。 */
  gain: number;
  /** 各前向通路的 Δ_k。 */
  pathDeltas: number[];
}

/**
 * 梅逊公式：
 *   T = Σ_k (P_k · Δ_k) / Δ
 *   Δ = 1 - ΣL_i + Σ(L_i·L_j 不相交) - Σ(L_i·L_j·L_l 不相交) + ...
 * 需要：
 *   - loopGains：各回路增益 L_i
 *   - nonTouchingPairs / nonTouchingTriples：互不相交回路的组合（下标对/三元组）
 *   - paths：前向通路 {gain, touchedLoops}
 * 每个 P_k 的 Δ_k = 把「与 P_k 相交的回路」从 Δ 中剔除后的特征式。
 */
export function masonGain(params: {
  loopGains: number[];
  paths: MasonPath[];
  nonTouchingPairs?: [number, number][];
  nonTouchingTriples?: [number, number, number][];
}): MasonResult {
  const L = params.loopGains;
  const pairs = params.nonTouchingPairs ?? [];
  const triples = params.nonTouchingTriples ?? [];

  const deltaOf = (touched: Set<number>): number => {
    // 仅在 touched 之外的回路间考虑不相交组合。
    const lo = L.map((g, i) => (touched.has(i) ? 0 : g));
    // -ΣL
    let d = 1 - lo.reduce((s, g) => s + g, 0);
    // +Σ pairs（两回路均在集合内且互不相交）
    let pairSum = 0;
    for (const [i, j] of pairs) {
      if (touched.has(i) || touched.has(j)) continue;
      pairSum += lo[i] * lo[j];
    }
    d += pairSum;
    // -Σ triples
    let tripleSum = 0;
    for (const [i, j, k] of triples) {
      if (touched.has(i) || touched.has(j) || touched.has(k)) continue;
      tripleSum += lo[i] * lo[j] * lo[k];
    }
    d -= tripleSum;
    return d;
  };

  const delta = deltaOf(new Set());
  const pathDeltas: number[] = [];
  let numerator = 0;
  for (const p of params.paths) {
    const dk = deltaOf(new Set(p.touchedLoops));
    pathDeltas.push(dk);
    numerator += p.gain * dk;
  }
  const gain = delta !== 0 ? numerator / delta : Number.NaN;
  return { delta, numerator, gain, pathDeltas };
}

/* ------------------------------------------------------------------ *
 * 信号流图 → 梅逊公式（可视化建模）
 * ------------------------------------------------------------------ *
 * 用户「画」一张信号流图（节点 + 有向边），这里自动枚举前向通路与回路，
 * 计算梅逊增益，并以「有理分式（多项式分子/分母）」输出传递函数 T(s)，
 * 从而能进一步求闭环、极点判稳、阶跃响应。
 *
 * 边增益允许是 s 的有理分式（num/den），例如常数 1、-2，或传递函数 1/(s+1)，
 * 这样画出的反馈结构能直接得到 T(s) = ΣPₖΔₖ/Δ。
 */
export interface MasonGraphEdge {
  /** 起点节点下标。 */
  from: number;
  /** 终点节点下标。 */
  to: number;
  /** 边增益分子多项式（高次在前），如 [1] 表示 1、[1,1] 表示 s+1。 */
  num: number[];
  /** 边增益分母多项式（高次在前），如 [1] 表示 1。 */
  den: number[];
}

export interface MasonGraphPath {
  /** 途经节点下标序列（含 source 与 sink）。 */
  nodes: number[];
  /** 该前向通路的增益 Pₖ（有理分式）。 */
  num: number[];
  den: number[];
}

export interface MasonGraphLoop {
  /** 回路节点序列。 */
  nodes: number[];
  /** 回路增益 Lᵢ（有理分式）。 */
  num: number[];
  den: number[];
}

export interface MasonGraphResult {
  forwardPaths: MasonGraphPath[];
  loops: MasonGraphLoop[];
  nonTouchingPairs: [number, number][];
  nonTouchingTriples: [number, number, number][];
  /** 特征式 Δ（有理分式）。 */
  deltaNum: number[];
  deltaDen: number[];
  /** 分子 ΣPₖΔₖ（有理分式）。 */
  numeratorNum: number[];
  numeratorDen: number[];
  /** 总传递函数 T(s) = 分子/Δ。 */
  num: number[];
  den: number[];
  /** 各前向通路的 Δₖ（有理分式）。 */
  pathDeltas: { num: number[]; den: number[] }[];
  /** T(s) 分母（特征多项式）的极点。 */
  poles: Complex[];
  /** 全部极点实部 < 0 即稳定。 */
  stable: boolean;
}

interface Rat {
  num: number[];
  den: number[];
}

/** 去前导零（保持高次在前）。 */
function trimZeros(a: number[]): number[] {
  let i = 0;
  while (i < a.length - 1 && a[i] === 0) i++;
  return a.slice(i);
}

const RAT_ONE: Rat = { num: [1], den: [1] };
const RAT_ZERO: Rat = { num: [0], den: [1] };

function ratMul(a: Rat, b: Rat): Rat {
  return { num: trimZeros(polyMul(a.num, b.num)), den: trimZeros(polyMul(a.den, b.den)) };
}

function ratAdd(a: Rat, b: Rat): Rat {
  const den = trimZeros(polyMul(a.den, b.den));
  const t1 = polyMul(a.num, b.den);
  const t2 = polyMul(b.num, a.den);
  return { num: trimZeros(polyAdd(t1, t2)), den };
}

function ratNeg(a: Rat): Rat {
  return { num: a.num.map((c) => -c), den: a.den };
}

function ratInv(a: Rat): Rat {
  return { num: a.den, den: a.num };
}

/* —— 有理分式约分（多项式欧几里得 GCD） —— */

/** 多项式次数（高次在前，首项非零）；零多项式返回 -1。 */
function polyDeg(p: number[]): number {
  for (let i = 0; i < p.length; i++) {
    if (Math.abs(p[i]) > 1e-12) return p.length - 1 - i;
  }
  return -1; // 零多项式
}

/** 首一化（除以首项系数）。 */
function polyMonic(p: number[]): number[] {
  const lead = p[0];
  if (Math.abs(lead) < 1e-12) return p;
  return p.map((c) => c / lead);
}

/** 多项式余式 a mod b（b 非零）。 */
function polyRem(a0: number[], b0: number[]): number[] {
  let a = a0.slice();
  const b = polyMonic(trimZeros(b0));
  let da = polyDeg(a);
  const db = polyDeg(b);
  while (da >= db && da >= 0) {
    const coef = a[0] / b[0];
    // b·x^shift 与 a 的 0 位对齐：a[j] -= coef·b[j]（j 从 0 到 b 长度）
    for (let j = 0; j < b.length; j++) a[j] -= coef * b[j];
    let k = 0;
    while (k < a.length - 1 && Math.abs(a[k]) < 1e-12) k++;
    a = a.slice(k);
    da = polyDeg(a);
  }
  return trimZeros(a);
}

/** 多项式首一 GCD（欧几里得）。 */
function polyGcd(a0: number[], b0: number[]): number[] {
  let a = trimZeros(a0);
  let b = trimZeros(b0);
  while (b.length > 0 && Math.abs(b[0]) > 1e-12) {
    const r = polyRem(a, b);
    a = b;
    b = r;
  }
  return polyMonic(a);
}

/** 多项式精确整除 a/b，返回商。 */
function polyDivExact(a0: number[], b0: number[]): number[] {
  let tmp = a0.slice();
  const b = polyMonic(trimZeros(b0));
  const qlen = Math.max(0, a0.length - b.length + 1);
  const q = new Array(qlen).fill(0);
  let da = polyDeg(tmp);
  const db = polyDeg(b);
  let qi = 0;
  while (da >= db && db >= 0) {
    const coef = tmp[0] / b[0];
    // 每轮消去被除数一个最高次项，商按降幂依次写入 q[0], q[1], …
    q[qi++] = coef;
    for (let j = 0; j < b.length; j++) tmp[j] -= coef * b[j];
    let k = 0;
    while (k < tmp.length - 1 && Math.abs(tmp[k]) < 1e-12) k++;
    tmp = tmp.slice(k);
    da = polyDeg(tmp);
  }
  return trimZeros(q);
}

/** 数值最大公约数。 */
function intGcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b > 1e-12) {
    const r = a % b;
    a = b;
    b = r;
  }
  return a;
}

/** 最小公倍数（整数）。 */
function lcm(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return Math.abs(a * b) / intGcd(a, b);
}

/** 把小数 x 近似为「分母」（x ≈ n/d，d 取归一化后的值）。 */
function denomOfRational(x: number): number {
  if (!Number.isFinite(x) || x === 0) return 1;
  const r = Math.round(x * 1e6) / 1e6; // 先消除浮点噪声
  const n = Math.round(Math.abs(r) * 1e6);
  const d = 1e6;
  const g = intGcd(n, d);
  return d / g;
}

/** 整数多项式的 content（各系数 |值| 的最大公约数）。 */
function intContent(p: number[]): number {
  let g = 0;
  for (const c of p) {
    const v = Math.round(Math.abs(c));
    if (v === 0) continue;
    g = g === 0 ? v : intGcd(g, v);
  }
  return g || 1;
}

/**
 * 约分有理分式到最简形式：
 *   1. 约多项式 GCD；
 *   2. 通分消除小数系数（乘各系数分母的 LCM，如 0.56/0.56 → 14/14）；
 *   3. 提取整数 content（如 14/14 → 1/1）；
 *   4. 令分母首项为正。
 */
function normalizeRat(r: Rat): Rat {
  if (r.num.length === 0 || Math.abs(r.num[0]) < 1e-12) return { num: [0], den: [1] };
  const g = polyGcd(r.num, r.den);
  let num = trimZeros(polyDivExact(r.num, g));
  let den = trimZeros(polyDivExact(r.den, g));
  // 通分消小数：乘 LCM(各系数分母)。限制规模，避免超大分母膨胀。
  const scale = [...num, ...den].reduce((acc, c) => lcm(acc, denomOfRational(c)), 1);
  if (scale > 1 && scale <= 1e6) {
    num = num.map((x) => x * scale);
    den = den.map((x) => x * scale);
  }
  // 提取整数 content（如 14/14 → 1/1）
  const c = intGcd(intContent(num), intContent(den));
  if (c > 1) {
    num = num.map((x) => x / c);
    den = den.map((x) => x / c);
  }
  if (den[0] < 0) {
    num = num.map((x) => -x);
    den = den.map((x) => -x);
  }
  // 消除浮点噪声：四舍五入到 1e-9，并把接近整数的系数吸附为整数。
  num = num.map(snapCoeff);
  den = den.map(snapCoeff);
  return { num: trimZeros(num), den: trimZeros(den) };
}

/** 消除浮点噪声：保留 9 位小数，接近整数的系数吸附为整数。 */
function snapCoeff(x: number): number {
  if (!Number.isFinite(x)) return x;
  const v = Math.round(x * 1e9) / 1e9;
  const r = Math.round(v);
  return Math.abs(v - r) < 1e-6 ? r : v;
}

/** 枚举 source → sink 的所有简单前向通路（不重复经过节点），带累积增益。 */
function findForwardPaths(
  adj: { to: number; rat: Rat }[][],
  source: number,
  sink: number,
): { nodes: number[]; gain: Rat }[] {
  const res: { nodes: number[]; gain: Rat }[] = [];
  const visited = new Set<number>([source]);
  const nodes: number[] = [source];
  const rec = (u: number, gain: Rat) => {
    if (u === sink) {
      res.push({ nodes: nodes.slice(), gain });
      return;
    }
    for (const e of adj[u] ?? []) {
      if (visited.has(e.to)) continue;
      visited.add(e.to);
      nodes.push(e.to);
      rec(e.to, ratMul(gain, e.rat));
      nodes.pop();
      visited.delete(e.to);
    }
  };
  rec(source, RAT_ONE);
  return res;
}

/** 枚举所有简单回路（简单环，首尾同点、其余节点不重复），按节点集去重。 */
function findLoops(adj: { to: number; rat: Rat }[][], nodeCount: number): { nodes: number[]; gain: Rat }[] {
  const loops: { nodes: number[]; gain: Rat }[] = [];
  const seen = new Set<string>();
  const rec = (start: number, u: number, visited: Set<number>, nodes: number[], gain: Rat) => {
    for (const e of adj[u] ?? []) {
      if (e.to === start) {
        const key = [...nodes].sort((a, b) => a - b).join(',');
        if (!seen.has(key)) {
          seen.add(key);
          loops.push({ nodes: nodes.slice(), gain: ratMul(gain, e.rat) });
        }
      } else if (!visited.has(e.to) && nodes.length < nodeCount) {
        visited.add(e.to);
        nodes.push(e.to);
        rec(start, e.to, visited, nodes, ratMul(gain, e.rat));
        nodes.pop();
        visited.delete(e.to);
      }
    }
  };
  for (let s = 0; s < nodeCount; s++) {
    rec(s, s, new Set([s]), [s], RAT_ONE);
  }
  return loops;
}

/** 互不相交回路对（节点集不相交）。 */
function nonTouchingPairsOf(loops: { nodes: number[] }[]): [number, number][] {
  const pairs: [number, number][] = [];
  for (let i = 0; i < loops.length; i++) {
    const a = new Set(loops[i].nodes);
    for (let j = i + 1; j < loops.length; j++) {
      if (loops[j].nodes.every((n) => !a.has(n))) pairs.push([i, j]);
    }
  }
  return pairs;
}

/** 三三两两不相交的回路三元组。 */
function nonTouchingTriplesOf(loops: { nodes: number[] }[], pairs: [number, number][]): [number, number, number][] {
  const triples: [number, number, number][] = [];
  for (const [i, j] of pairs) {
    const a = new Set(loops[i].nodes);
    const b = new Set(loops[j].nodes);
    for (let k = j + 1; k < loops.length; k++) {
      if (loops[k].nodes.every((n) => !a.has(n) && !b.has(n))) triples.push([i, j, k]);
    }
  }
  return triples;
}

/** 特征式 Δ（或 Δₖ，剔除 touched 回路后）。 */
function loopDelta(
  loops: { gain: Rat }[],
  pairs: [number, number][],
  triples: [number, number, number][],
  touched: Set<number>,
): Rat {
  let d: Rat = RAT_ONE;
  // -ΣL
  let s: Rat = RAT_ZERO;
  for (let i = 0; i < loops.length; i++) if (!touched.has(i)) s = ratAdd(s, loops[i].gain);
  d = ratAdd(d, ratNeg(s));
  // +Σ pairs
  for (const [i, j] of pairs) if (!touched.has(i) && !touched.has(j)) d = ratAdd(d, ratMul(loops[i].gain, loops[j].gain));
  // -Σ triples
  for (const [i, j, k] of triples)
    if (!touched.has(i) && !touched.has(j) && !touched.has(k))
      d = ratAdd(d, ratNeg(ratMul(ratMul(loops[i].gain, loops[j].gain), loops[k].gain)));
  return d;
}

/** 从信号流图（节点数 + 有向边）计算梅逊传递函数 T(s)。 */
export function masonFromGraph(
  edges: MasonGraphEdge[],
  nodeCount: number,
  source: number,
  sink: number,
): MasonGraphResult | { error: string } {
  if (nodeCount < 2) return { error: '至少需要 2 个节点。' };
  if (source < 0 || source >= nodeCount || sink < 0 || sink >= nodeCount)
    return { error: '输入/输出节点下标越界。' };

  const adj: { to: number; rat: Rat }[][] = Array.from({ length: nodeCount }, () => []);
  for (const e of edges) {
    if (e.from < 0 || e.from >= nodeCount || e.to < 0 || e.to >= nodeCount) continue;
    adj[e.from].push({ to: e.to, rat: { num: e.num, den: e.den } });
  }

  const fwd = findForwardPaths(adj, source, sink);
  if (fwd.length === 0) return { error: '输入节点无法到达输出节点（没有前向通路）。' };
  const loops = findLoops(adj, nodeCount);
  const pairs = nonTouchingPairsOf(loops);
  const triples = nonTouchingTriplesOf(loops, pairs);

  const delta = loopDelta(loops, pairs, triples, new Set());

  const pathDeltas: { num: number[]; den: number[] }[] = [];
  let numerator: Rat = RAT_ZERO;
  for (const p of fwd) {
    // 与该前向通路相交（共享任一节点）的回路
    const pset = new Set(p.nodes);
    const touched = new Set<number>();
    loops.forEach((l, i) => {
      if (l.nodes.some((n) => pset.has(n))) touched.add(i);
    });
    const dk = loopDelta(loops, pairs, triples, touched);
    pathDeltas.push({ num: dk.num, den: dk.den });
    numerator = ratAdd(numerator, ratMul(p.gain, dk));
  }

  // 归一化（约分）：delta / numerator / 各 Δk / 最终 T(s)
  const dNorm = normalizeRat(delta);
  const nNorm = normalizeRat(numerator);
  // T = numerator / delta（分子分母分别约分后）
  const transfer = ratMul(nNorm, ratInv(dNorm));
  const tNorm = normalizeRat(transfer);
  const poles = roots(tNorm.den);
  const stable = poles.length > 0 && poles.every((p) => p.re < 0);

  return {
    forwardPaths: fwd.map((p) => ({ nodes: p.nodes, num: p.gain.num, den: p.gain.den })),
    loops: loops.map((l) => ({ nodes: l.nodes, num: l.gain.num, den: l.gain.den })),
    nonTouchingPairs: pairs,
    nonTouchingTriples: triples,
    deltaNum: dNorm.num,
    deltaDen: dNorm.den,
    numeratorNum: nNorm.num,
    numeratorDen: nNorm.den,
    num: tNorm.num,
    den: tNorm.den,
    pathDeltas: pathDeltas.map((d) => {
      const dn = normalizeRat({ num: d.num, den: d.den });
      return { num: dn.num, den: dn.den };
    }),
    poles,
    stable,
  };
}

/* ------------------------------------------------------------------ *
 * 校正器设计（Lead / Lag Compensator）
 * ------------------------------------------------------------------ */
export interface CompensatorResult {
  /** 校正类型：超前 lead / 滞后 lag。 */
  kind: 'lead' | 'lag';
  /** 校正器 C(s) 分子 / 分母（高次在前）。 */
  cNum: number[];
  cDen: number[];
  /** 相位超前量 φm（度，滞后为负）。 */
  phaseLeadDeg: number;
  /** α（lead: <1；lag: >1）。 */
  alpha: number;
  /** 校正器零点位置（rad/s）。 */
  zero: number;
  /** 校正器极点位置（rad/s）。 */
  pole: number;
  /** 校正后闭环阶跃响应（验证）。 */
  step: StepPoint[];
  /** 校正后 Bode 相位裕度。 */
  pm: number | null;
  note: string;
}

/**
 * 超前校正（Lead Compensator）设计：
 *   C(s) = (1 + α·T·s) / (1 + T·s)，α<1。
 * 流程：
 *   1. 由原 Bode 算当前相位裕度 PM0。
 *   2. 需求相位超前 φm = targetPM - PM0 + 5°（余量）。
 *   3. α = (1 - sinφm) / (1 + sinφm)。
 *   4. 选新穿越频率 ωm 使 |G(jωm)| = -10·log10(α)（dB），T = 1/(ωm·√α)。
 * 返回校正器与校正后闭环响应。若原系统 PM 已达标返回无需校正。
 */
export function leadCompensator(
  num: number[],
  den: number[],
  opts?: { targetPM?: number; fMin?: number; fMax?: number; tEnd?: number },
): CompensatorResult | { error: string } {
  const targetPM = opts?.targetPM ?? 50;
  const fMin = opts?.fMin ?? 0.01;
  const fMax = opts?.fMax ?? 1000;
  const tEnd = opts?.tEnd ?? Math.max(8, 10 * (den.length - 1));

  const bp = bode(num, den, fMin, fMax, 800);
  const margins = stabilityMargins(bp);
  const pm0 = margins.pm;
  if (pm0 === null) {
    return { error: '无法计算当前相位裕度（幅值未穿越 0dB）。' };
  }
  if (pm0 >= targetPM) {
    // 已达标：返回单位校正器
    const Lnum = num.slice();
    const Lden = den.slice();
    const { num: Tnum, den: Tden } = closedLoopTransfer(Lnum, Lden);
    return {
      kind: 'lead',
      cNum: [1],
      cDen: [1],
      phaseLeadDeg: 0,
      alpha: 1,
      zero: Number.NaN,
      pole: Number.NaN,
      step: stepResponse(Tnum, Tden, tEnd, 400),
      pm: pm0,
      note: `原系统相位裕度 ${pm0.toFixed(1)}° 已达目标 ${targetPM}°，无需超前校正。`,
    };
  }

  const phaseLeadDeg = targetPM - pm0 + 5;
  if (phaseLeadDeg > 60) {
    return { error: `所需相位超前 ${phaseLeadDeg.toFixed(1)}° > 60°，单级超前不足，建议两级串联或改用其他校正。` };
  }

  // 找新穿越频率 + 迭代校正：
  // 经典一步法在「选新穿越频率」后，G 在该频率的相位往往比原穿越频率更低，
  // 导致实际 PM 不足。这里改为迭代：每次设计后实测「校正后系统」的真实 PM，
  // 若低于目标则按缺口加大所需超前量，最多迭代 10 次，并始终保留「局部最优」解。
  // 注意：对某些高阶系统，单级超前存在物理上限（加大超前会把穿越频率推向
  // G 相位更负的高频，反而无法继续提升 PM），因此允许「接近但不完全达标」时
  // 返回所能达到的最佳结果，而不是直接报错。
  let cNum: number[] = [1];
  let cDen: number[] = [1];
  let alpha = 1;
  let T = 0;
  let iterLead = phaseLeadDeg;
  let converged = false;
  let best: { cNum: number[]; cDen: number[]; alpha: number; T: number; iterLead: number; pm: number } | null = null;

  for (let iter = 0; iter < 10; iter++) {
    const phi = Math.min(Math.max(iterLead, 1), 60); // 硬性夹在 [1,60]°，不因迭代越界报错
    const phiRad = (phi * Math.PI) / 180;
    alpha = (1 - Math.sin(phiRad)) / (1 + Math.sin(phiRad)); // <1
    // 新穿越频率：|G(jωm)| = 10·log10(α)（负值，dB）
    const targetDb = 10 * Math.log10(alpha);
    let wm: number | null = null;
    for (let i = 1; i < bp.length; i++) {
      const d0 = bp[i - 1].db;
      const d1 = bp[i].db;
      if ((d0 - targetDb) * (d1 - targetDb) <= 0) {
        const w0 = bp[i - 1].w;
        const w1 = bp[i].w;
        const t = d0 === d1 ? 0 : (targetDb - d0) / (d1 - d0);
        wm = w0 + t * (w1 - w0);
        break;
      }
    }
    if (!wm || !Number.isFinite(wm) || wm <= 0) {
      break;
    }
    T = 1 / (wm * Math.sqrt(alpha));
    // 超前校正 C(s) = (1 + T·s) / (1 + α·T·s)，α<1：
    //   零点 s=-1/T（较低频），极点 s=-1/(αT)（较高频）→ 产生相位超前。
    // 注意：必须 零点<极点 才是超前；若写反（αT 在分子）会退化为滞后校正。
    cNum = [T, 1];
    cDen = [alpha * T, 1];

    // 实测校正后系统真实相位裕度（用补偿后的开环做 Bode + 裕度计算）。
    const Lnum = polyMul(cNum, num);
    const Lden = polyMul(cDen, den);
    const actualPM = stabilityMargins(bode(Lnum, Lden, fMin, fMax, 800)).pm;
    if (!best || (actualPM ?? -Infinity) > best.pm) {
      best = { cNum: cNum.slice(), cDen: cDen.slice(), alpha, T, iterLead: phi, pm: actualPM ?? -Infinity };
    }
    if (actualPM !== null && actualPM >= targetPM - 0.5) {
      converged = true;
      break;
    }
    // 加阻尼地按缺口加大需求超前量（避免单级物理上限时无限膨胀）。
    iterLead += Math.max(1, Math.min(8, (targetPM - (actualPM ?? 0)) * 0.5 + 2));
    if (iterLead >= 60) break;
  }

  if (best) {
    cNum = best.cNum;
    cDen = best.cDen;
    alpha = best.alpha;
    T = best.T;
    iterLead = best.iterLead;
  }

  const Lnum = polyMul(cNum, num);
  const Lden = polyMul(cDen, den);
  const { num: Tnum, den: Tden } = closedLoopTransfer(Lnum, Lden);
  const pmAfter = stabilityMargins(bode(Lnum, Lden, fMin, fMax, 800)).pm;
  const zero = 1 / T;
  const pole = 1 / (alpha * T);
  const reached = pmAfter !== null && pmAfter >= targetPM - 0.5;

  return {
    kind: 'lead',
    cNum,
    cDen,
    phaseLeadDeg: iterLead,
    alpha,
    zero,
    pole,
    step: stepResponse(Tnum, Tden, tEnd, 400),
    pm: pmAfter,
    note: `超前校正器 C(s)=(${T.toFixed(4)}s+1)/(${alpha.toFixed(4)}T s+1)，T=${T.toFixed(4)}，相位超前 ${iterLead.toFixed(1)}°，校正后 PM≈${(pmAfter ?? 0).toFixed(1)}°${reached ? '（已达标）' : '（已达单级超前物理上限，建议两级串联进一步提升）'}。`,
  };
}

/**
 * 滞后校正（Lag Compensator）设计：
 *   C(s) = (1 + T·s) / (1 + β·T·s)，β>1。
 * 目的：提高低频（速度）增益以减小稳态误差，同时尽量不改变穿越频率附近的相位裕度。
 * 设计流程（经典频域法）：
 *   1. 若当前 PM 已达标，仅需按期望误差系数 Kv 提升增益；否则先找相位满足
 *      ∠G(jωc) = -180° + targetPM + 5°（预留滞后校正本身约 -5° 的相位损失）的 ωc。
 *   2. 由 ωc 处 |G(jωc)| 的幅值确定 β = 10^(|G(jωc)|_dB / 20)，使校正后 |L(jωc)|=0dB。
 *   3. 零点置于 ωc 的 1/10 频程（避免影响穿越频率相位），极点 = 零点/β。
 * 返回校正器与校正后闭环响应。若原系统 PM 已达标且无增益需求，返回单位校正器。
 */
export function lagCompensator(
  num: number[],
  den: number[],
  opts?: { targetPM?: number; kv?: number; fMin?: number; fMax?: number; tEnd?: number },
): CompensatorResult | { error: string } {
  const targetPM = opts?.targetPM ?? 45;
  const fMin = opts?.fMin ?? 0.001;
  const fMax = opts?.fMax ?? 1000;
  const tEnd = opts?.tEnd ?? Math.max(8, 10 * (den.length - 1));

  const bp = bode(num, den, fMin, fMax, 800);
  const margins = stabilityMargins(bp);
  const pm0 = margins.pm;
  if (pm0 === null) {
    return { error: '无法计算当前相位裕度（幅值未穿越 0dB）。' };
  }

  // 计算当前速度误差系数 Kv（I 型系统才有意义），用于判断是否满足 Kv 约束。
  let kvNow = 0;
  if (opts?.kv && opts.kv > 0) {
    const sdc = evalTF(num, den, { re: 1e-9, im: 0 }); // s→0 处的 G(s)
    kvNow = Math.abs(sdc.re * 1e-9); // s·G(s) 近似
  }
  const kvNeeded = opts?.kv && opts.kv > 0 && kvNow > 0 && opts.kv > kvNow * 1.05;

  if (pm0 >= targetPM && !kvNeeded) {
    // PM 与 Kv 均已达标：返回单位校正器
    const Lnum = num.slice();
    const Lden = den.slice();
    const { num: Tnum, den: Tden } = closedLoopTransfer(Lnum, Lden);
    return {
      kind: 'lag',
      cNum: [1],
      cDen: [1],
      phaseLeadDeg: 0,
      alpha: 1,
      zero: Number.NaN,
      pole: Number.NaN,
      step: stepResponse(Tnum, Tden, tEnd, 400),
      pm: pm0,
      note: `原系统相位裕度 ${pm0.toFixed(1)}° 已达目标 ${targetPM}°，且速度误差系数已满足，无需滞后校正。`,
    };
  }

  // 1. 找相位 = -180° + targetPM + 5° 的频率 ωc（解卷绕相位后下降穿越）。
  //    若 PM 已达标但需提升 Kv（kvNeeded），则保留相位裕度，仅在当前穿越频率附近配滞后。
  const targetPhase = -180 + targetPM + 5;
  let wc: number | null = null;
  let prev = bp[0].phaseDeg;
  for (let i = 1; i < bp.length; i++) {
    let ph = bp[i].phaseDeg;
    while (ph - prev > 180) ph -= 360;
    while (ph - prev < -180) ph += 360;
    if ((prev - targetPhase) * (ph - targetPhase) <= 0) {
      const w0 = bp[i - 1].w;
      const w1 = bp[i].w;
      const t = ph === prev ? 0 : (targetPhase - prev) / (ph - prev);
      wc = w0 + t * (w1 - w0);
      break;
    }
    prev = ph;
  }
  if (!wc || !Number.isFinite(wc) || wc <= 0) {
    // 若相位从不下降穿越目标（比如 PM 很高），改用当前穿越频率作为 ωc。
    wc = margins.wgc;
    if (!wc || !Number.isFinite(wc) || wc <= 0) {
      return { error: '未找到满足相位条件的校正频率，无法设计滞后校正。' };
    }
  }

  // 2. ωc 处幅值 → β（使校正后该频率幅值降至 0dB）
  const h = evalTF(num, den, { re: 0, im: wc });
  let magDb = 20 * Math.log10(Math.hypot(h.re, h.im) || 1e-12);
  // 支持期望速度误差系数 Kv：滞后校正可提升低频增益来满足 Kv 需求。
  // Kv = lim_{s→0} s·G(s)（对 I 型系统），滞后校正(C→β·C)会把 Kv 放大 β 倍。
  if (opts?.kv && opts.kv > 0) {
    const needKv = Math.max(0, Math.log10(opts.kv / (kvNow || 1e-12)));
    if (needKv > 0) {
      magDb = Math.max(magDb, needKv * 20); // 至少提升到满足 Kv
    }
  }
  if (!Number.isFinite(magDb)) {
    return { error: '无法计算所需增益，无法设计滞后校正。' };
  }
  let beta = Math.pow(10, magDb / 20);
  if (!Number.isFinite(beta) || beta < 1) beta = 1;
  if (beta > 1000) beta = 1000; // 限制过大的 β，避免极点过近原点

  // 3. 零点在 ωc/10，极点 = 零点/β
  const zeroW = wc / 10;
  const T = 1 / zeroW;
  const poleW = zeroW / beta;
  // C(s) = (1 + T·s) / (1 + β·T·s)
  const cNum = [T, 1];
  const cDen = [beta * T, 1];

  // 验证：校正后开环与闭环
  const Lnum = polyMul(cNum, num);
  const Lden = polyMul(cDen, den);
  const pmAfter = stabilityMargins(bode(Lnum, Lden, fMin, fMax, 800)).pm;
  const { num: Tnum, den: Tden } = closedLoopTransfer(Lnum, Lden);

  return {
    kind: 'lag',
    cNum,
    cDen,
    phaseLeadDeg: -(targetPM > 0 ? 5 : 0), // 滞后校正的相位滞后量（约 -5°）
    alpha: beta,
    zero: zeroW,
    pole: poleW,
    step: stepResponse(Tnum, Tden, tEnd, 400),
    pm: pmAfter,
    note: `滞后校正器 C(s)=(${T.toFixed(4)}s+1)/(${beta.toFixed(4)}T s+1)，T=${T.toFixed(4)}，β=${beta.toFixed(2)}，校正后 PM≈${(pmAfter ?? 0).toFixed(1)}°。`,
  };
}