/**
 * Control category node definitions — MATLAB 风格自动控制节点。
 *
 * 提供与 MATLAB Control System Toolbox 高度对应的蓝图节点，让用户
 * 用连线代替命令脚本完成经典控制分析：
 *   - control-tf         : tf(num,den)         构造传递函数
 *   - control-serial     : G1*G2               串联（级联）
 *   - control-feedback   : feedback(G,1)       单位/一般负反馈闭环
 *   - control-step       : step(G)             阶跃响应曲线
 *   - control-impulse    : impulse(G)          冲激响应曲线
 *   - control-bode       : bode(G)             伯德图（幅值 dB + 相位°）
 *   - control-pole       : pole(G) / roots(den)极点（含 s 平面分布图）
 *   - control-zero       : tzero(G)            零点
 *   - control-roots      : roots(poly)         多项式求根
 *   - control-rlocus     : rlocus(G)           根轨迹
 *   - control-nyquist    : nyquist(G)          奈奎斯特图
 *
 * 传递函数对象统一表示为 { num: number[], den: number[] }（高次在前），
 * 通过 'any' 端口在节点间传递；响应类节点输出 'curve' / 'curves' 曲线，
 * 可直接接入 plot-output 或曲线处理链。
 */

import type { NodeTypeDef } from '../pipelineEngine';
import {
  parsePolynomial,
  stepResponse,
  impulseResponse,
  bode,
  roots,
  closedLoopTransfer,
  rlocus,
  rlocusKlist,
  nyquist,
} from '@/lib/control/transferFunction';

/** 多项式乘法（高次在前）。 */
function polyMul(a: number[], b: number[]): number[] {
  const out = new Array(Math.max(0, a.length + b.length - 1)).fill(0);
  for (let i = 0; i < a.length; i++)
    for (let j = 0; j < b.length; j++) out[i + j] += a[i] * b[j];
  return out;
}

/** 把系数串（如 "[2 3]" / "2,3" / "s^2+3s+2"）解析为高次前系数数组。 */
function parseCoeffs(s: string): number[] {
  const str = String(s ?? '').trim();
  if (!str) return [1];
  // 含 s 或 ^ → 按多项式解析
  if (/[s^]/i.test(str)) return parsePolynomial(str);
  // 否则按系数数组解析（去除方括号，按逗号/空格/分号/制表符切分）
  const parts = str.replace(/[\[\]()]/g, '').split(/[,;\s]+/).filter((x) => x.length > 0);
  const vals = parts.map((p) => Number(p));
  if (vals.length === 0 || vals.some((v) => !Number.isFinite(v))) return [1];
  return vals;
}

/** 从任意输入解析为传递函数 {num,den}；缺省返回单位传递函数。 */
function toTF(v: unknown): { num: number[]; den: number[] } {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    const num = Array.isArray(o.num) ? (o.num as number[]).map(Number) : [];
    const den = Array.isArray(o.den) ? (o.den as number[]).map(Number) : [];
    if (num.length > 0 && den.length > 0 && num.every((x) => Number.isFinite(x)) && den.every((x) => Number.isFinite(x))) {
      return { num, den };
    }
  }
  return { num: [1], den: [1] };
}

/** 一阶低通/因式分解容错：去除前导零后的有效系数。 */
function trimZeros(a: number[]): number[] {
  let lead = 0;
  while (lead < a.length - 1 && Math.abs(a[lead]) < 1e-12) lead++;
  return a.slice(lead);
}

/** 通用闭环：T = G/(1+GH)。unit 反馈时 H=1。 */
function generalFeedback(
  G: { num: number[]; den: number[] },
  H?: { num: number[]; den: number[] },
): { num: number[]; den: number[] } {
  const h = H && H.num.length && H.den.length ? H : { num: [1], den: [1] };
  const Tnum = trimZeros(polyMul(G.num, h.den));
  const Tden = trimZeros(
    polyMul(G.den, h.den).map((c, i) => c + (polyMul(G.num, h.num)[i] ?? 0)),
  );
  return { num: Tnum, den: Tden };
}

/** StepPoint[] → curve.points。 */
function stepToCurve(pts: { t: number; y: number }[]): { points: { x: number; y: number }[]; closed?: boolean } {
  return { points: pts.map((p) => ({ x: p.t, y: p.y })), closed: false };
}

/** Complex[] → s 平面 curve（极点/零点分布）。 */
function rootsToCurve(rs: { re: number; im: number }[]): { points: { x: number; y: number }[]; closed?: boolean } {
  return {
    points: rs.map((p) => ({ x: p.re, y: p.im })),
    closed: false,
  };
}

export const controlNodes = {
  /* ── 传递函数构造 / 互联 ─────────────────────────────────── */
  'control-tf': {
    type: 'control-tf',
    category: 'control',
    labelKey: 'npControlTf',
    icon: 'FunctionSquare',
    color: 'rose',
    inputs: [],
    outputs: [{ id: 'tf', labelKey: 'npPortTf', type: 'any' }],
    defaultConfig: { num: '[1]', den: 's^2+3s+2' },
    configSchema: [
      { key: 'num', label: '分子 N(s)（系数或多项式）', type: 'text', default: '[1]', placeholder: '如 [2 3] 或 s+2' },
      { key: 'den', label: '分母 D(s)（系数或多项式）', type: 'text', default: 's^2+3s+2', placeholder: '如 [1 6 7 5] 或 s^2+3s+2' },
    ],
    execute: (_inputs, config) => ({
      tf: { num: parseCoeffs(String(config.num ?? '[1]')), den: parseCoeffs(String(config.den ?? 's^2+3s+2')) },
    }),
  },

  'control-serial': {
    type: 'control-serial',
    category: 'control',
    labelKey: 'npControlSerial',
    icon: 'ArrowRightLeft',
    color: 'rose',
    inputs: [
      { id: 'a', labelKey: 'npPortA', type: 'any' },
      { id: 'b', labelKey: 'npPortB', type: 'any' },
    ],
    outputs: [{ id: 'tf', labelKey: 'npPortTf', type: 'any' }],
    defaultConfig: {},
    execute: (inputs) => {
      const a = toTF(inputs.a);
      const b = toTF(inputs.b);
      // 注意串联顺序：T = a·b（分子分母各自相乘，分子可约分不处理）
      return { tf: { num: trimZeros(polyMul(a.num, b.num)), den: trimZeros(polyMul(a.den, b.den)) } };
    },
  },

  'control-feedback': {
    type: 'control-feedback',
    category: 'control',
    labelKey: 'npControlFeedback',
    icon: 'RefreshCcw',
    color: 'rose',
    inputs: [
      { id: 'forward', labelKey: 'npPortForward', type: 'any' },
      { id: 'fb', labelKey: 'npPortFb', type: 'any' },
    ],
    outputs: [{ id: 'tf', labelKey: 'npPortTf', type: 'any' }],
    defaultConfig: { sign: '-1' },
    configSchema: [
      { key: 'sign', label: '反馈符号', type: 'select', options: [{ value: '-1', label: '负反馈 -1' }, { value: '1', label: '正反馈 +1' }], default: '-1' },
    ],
    execute: (inputs, config) => {
      const G = toTF(inputs.forward);
      const H = toTF(inputs.fb);
      const sign = Number(config.sign ?? -1);
      // 正反馈时 H 取负，等价 T = G/(1 - G·H)
      const hEff = sign < 0 ? H : { num: H.num.map((x) => -x), den: H.den.slice() };
      return { tf: generalFeedback(G, hEff) };
    },
  },

  /* ── 时域响应 ───────────────────────────────────────────── */
  'control-step': {
    type: 'control-step',
    category: 'control',
    labelKey: 'npControlStep',
    icon: 'TrendingUp',
    color: 'orange',
    inputs: [{ id: 'tf', labelKey: 'npPortTf', type: 'any' }],
    outputs: [{ id: 'curve', labelKey: 'npPortCurve', type: 'curve' }],
    defaultConfig: { tEnd: 10 },
    configSchema: [{ key: 'tEnd', label: '仿真时长 (s)', type: 'number', min: 0.5, max: 100, step: 0.5, default: 10 }],
    execute: (inputs, config) => {
      const tf = toTF(inputs.tf);
      const tEnd = Math.max(0.5, Number(config.tEnd ?? 10));
      return { curve: stepToCurve(stepResponse(tf.num, tf.den, tEnd, 400)) };
    },
  },

  'control-impulse': {
    type: 'control-impulse',
    category: 'control',
    labelKey: 'npControlImpulse',
    icon: 'Zap',
    color: 'orange',
    inputs: [{ id: 'tf', labelKey: 'npPortTf', type: 'any' }],
    outputs: [{ id: 'curve', labelKey: 'npPortCurve', type: 'curve' }],
    defaultConfig: { tEnd: 10 },
    configSchema: [{ key: 'tEnd', label: '仿真时长 (s)', type: 'number', min: 0.5, max: 100, step: 0.5, default: 10 }],
    execute: (inputs, config) => {
      const tf = toTF(inputs.tf);
      const tEnd = Math.max(0.5, Number(config.tEnd ?? 10));
      return { curve: stepToCurve(impulseResponse(tf.num, tf.den, tEnd, 400)) };
    },
  },

  /* ── 频域分析 ───────────────────────────────────────────── */
  'control-bode': {
    type: 'control-bode',
    category: 'control',
    labelKey: 'npControlBode',
    icon: 'Activity',
    color: 'violet',
    inputs: [{ id: 'tf', labelKey: 'npPortTf', type: 'any' }],
    outputs: [{ id: 'curves', labelKey: 'npPortCurves', type: 'curves' }],
    defaultConfig: { fMin: 0.01, fMax: 1000 },
    configSchema: [
      { key: 'fMin', label: '起始频率 (Hz)', type: 'number', min: 1e-6, max: 100, step: 0.01, default: 0.01 },
      { key: 'fMax', label: '截止频率 (Hz)', type: 'number', min: 1, max: 1e6, step: 10, default: 1000 },
    ],
    execute: (inputs, config) => {
      const tf = toTF(inputs.tf);
      const fMin = Number(config.fMin ?? 0.01);
      const fMax = Number(config.fMax ?? 1000);
      const pts = bode(tf.num, tf.den, fMin, fMax, 200);
      const mag = { points: pts.map((p) => ({ x: p.f, y: p.db })), closed: false };
      const phase = { points: pts.map((p) => ({ x: p.f, y: p.phaseDeg })), closed: false };
      return { curves: [mag, phase] };
    },
  },

  'control-nyquist': {
    type: 'control-nyquist',
    category: 'control',
    labelKey: 'npControlNyquist',
    icon: 'CircleDot',
    color: 'orange',
    inputs: [{ id: 'tf', labelKey: 'npPortTf', type: 'any' }],
    outputs: [{ id: 'curve', labelKey: 'npPortCurve', type: 'curve' }],
    defaultConfig: { wMax: 1000 },
    configSchema: [{ key: 'wMax', label: '最大角频率 (rad/s)', type: 'number', min: 10, max: 1e5, step: 10, default: 1000 }],
    execute: (inputs, config) => {
      const tf = toTF(inputs.tf);
      const wMax = Number(config.wMax ?? 1000);
      const pts = nyquist(tf.num, tf.den, wMax, 400);
      // 正频率支路 + 负频率共轭镜像，构成闭合曲线
      const points = pts.map((p) => ({ x: p.re, y: p.im }));
      for (let i = pts.length - 1; i >= 0; i--) points.push({ x: pts[i].re, y: -pts[i].im });
      return { curve: { points, closed: true } };
    },
  },

  /* ── 根轨迹 / 稳定性 ────────────────────────────────────── */
  'control-rlocus': {
    type: 'control-rlocus',
    category: 'control',
    labelKey: 'npControlRlocus',
    icon: 'GitBranch',
    color: 'violet',
    inputs: [{ id: 'tf', labelKey: 'npPortTf', type: 'any' }],
    outputs: [{ id: 'curves', labelKey: 'npPortCurves', type: 'curves' }],
    defaultConfig: { kMin: 0.01, kMax: 100 },
    configSchema: [
      { key: 'kMin', label: '增益下限 K', type: 'number', min: 1e-4, max: 1, step: 0.01, default: 0.01 },
      { key: 'kMax', label: '增益上限 K', type: 'number', min: 1, max: 1e5, step: 10, default: 100 },
    ],
    execute: (inputs, config) => {
      const tf = toTF(inputs.tf);
      const kMin = Number(config.kMin ?? 0.01);
      const kMax = Number(config.kMax ?? 100);
      const Klist = rlocusKlist(kMin, kMax, 120);
      const locus = rlocus(tf.num, tf.den, Klist);
      const nRoots = Math.max(...locus.map((p) => p.roots.length));
      // 每条根轨迹分支 → 一条 curve
      const curves: { points: { x: number; y: number }[]; closed: boolean }[] = [];
      for (let r = 0; r < nRoots; r++) {
        const points = locus.map((p) => {
          const z = p.roots[r];
          return z ? { x: z.re, y: z.im } : null;
        }).filter((x): x is { x: number; y: number } => x !== null);
        if (points.length > 1) curves.push({ points, closed: false });
      }
      return { curves };
    },
  },

  'control-pole': {
    type: 'control-pole',
    category: 'control',
    labelKey: 'npControlPole',
    icon: 'Crosshair',
    color: 'violet',
    inputs: [{ id: 'tf', labelKey: 'npPortTf', type: 'any' }],
    outputs: [
      { id: 'poles', labelKey: 'npPortPoles', type: 'any' },
      { id: 'curve', labelKey: 'npPortCurve', type: 'curve' },
    ],
    defaultConfig: {},
    execute: (inputs) => {
      const tf = toTF(inputs.tf);
      const p = roots(tf.den);
      return { poles: p, curve: rootsToCurve(p) };
    },
  },

  'control-zero': {
    type: 'control-zero',
    category: 'control',
    labelKey: 'npControlZero',
    icon: 'Circle',
    color: 'violet',
    inputs: [{ id: 'tf', labelKey: 'npPortTf', type: 'any' }],
    outputs: [
      { id: 'zeros', labelKey: 'npPortZeros', type: 'any' },
      { id: 'curve', labelKey: 'npPortCurve', type: 'curve' },
    ],
    defaultConfig: {},
    execute: (inputs) => {
      const tf = toTF(inputs.tf);
      const z = roots(tf.num);
      return { zeros: z, curve: rootsToCurve(z) };
    },
  },

  'control-roots': {
    type: 'control-roots',
    category: 'control',
    labelKey: 'npControlRoots',
    icon: 'Root',
    color: 'violet',
    inputs: [],
    outputs: [{ id: 'roots', labelKey: 'npPortRoots', type: 'any' }],
    defaultConfig: { poly: '1 6 7 5' },
    configSchema: [{ key: 'poly', label: '多项式系数（高次在前）', type: 'text', default: '1 6 7 5', placeholder: '如 1 6 7 5 或 s^3+6s^2+7s+5' }],
    execute: (_inputs, config) => ({
      roots: roots(parseCoeffs(String(config.poly ?? '1 6 7 5'))),
    }),
  },

  /* ── 闭环一步到位（等价 MATLAB 的 step(feedback(G,1))） ─── */
  'control-closed-step': {
    type: 'control-closed-step',
    category: 'control',
    labelKey: 'npControlClosedStep',
    icon: 'GitFork',
    color: 'orange',
    inputs: [{ id: 'tf', labelKey: 'npPortTf', type: 'any' }],
    outputs: [{ id: 'curve', labelKey: 'npPortCurve', type: 'curve' }],
    defaultConfig: { tEnd: 10 },
    configSchema: [{ key: 'tEnd', label: '仿真时长 (s)', type: 'number', min: 0.5, max: 100, step: 0.5, default: 10 }],
    execute: (inputs, config) => {
      const tf = toTF(inputs.tf);
      const cl = closedLoopTransfer(tf.num, tf.den);
      const tEnd = Math.max(0.5, Number(config.tEnd ?? 10));
      return { curve: stepToCurve(stepResponse(cl.num, cl.den, tEnd, 400)) };
    },
  },
} satisfies Record<string, NodeTypeDef>;