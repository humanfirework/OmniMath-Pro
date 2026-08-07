/**
 * lib/control/transferFunction — 自动控制纯函数测试。
 *
 * 覆盖：传递函数求值、多项式求根（实根/复根）、Bode 幅相、阶跃响应的
 * 解析解对照（一阶 1-e^-t、二阶稳态、RK4 数值精度）。
 */

import { describe, it, expect } from 'vitest';
import {
  evalTF,
  roots,
  bode,
  stepResponse,
  poles,
  logFreqs,
  parsePolynomial,
  transferAnalysis,
  rlocus,
  rlocusKlist,
  nyquist,
  findUltimateGain,
  pidGains,
  closedLoopTransfer,
  pidTune,
  stabilityMargins,
  impulseResponse,
  routhStability,
  masonGain,
  masonFromGraph,
  leadCompensator,
  lagCompensator,
  type Complex,
} from './transferFunction';

function near(a: number, b: number, tol = 1e-4): boolean {
  return Math.abs(a - b) < tol;
}

function cNear(a: Complex, re: number, im: number, tol = 1e-4): boolean {
  return near(a.re, re, tol) && near(a.im, im, tol);
}

describe('evalTF 传递函数求值', () => {
  it('H(s)=1/(s+1) 在 s=j 处幅值 √2/2、相位 -45°', () => {
    const h = evalTF([1], [1, 1], { re: 0, im: 1 });
    const mag = Math.hypot(h.re, h.im);
    expect(near(mag, Math.SQRT1_2, 1e-6)).toBe(true);
    expect(near(Math.atan2(h.im, h.re) * 180 / Math.PI, -45, 1e-6)).toBe(true);
  });

  it('H(s)=1 恒等于 1', () => {
    const h = evalTF([1], [1], { re: 3, im: -2 });
    expect(near(h.re, 1, 1e-9)).toBe(true);
    expect(near(h.im, 0, 1e-9)).toBe(true);
  });
});

describe('roots 多项式求根', () => {
  it('s²+3s+2 = (s+1)(s+2) → 实根 -1, -2', () => {
    const r = roots([1, 3, 2]);
    expect(r.length).toBe(2);
    const reals = r.map((z) => z.re).sort((a, b) => a - b);
    expect(near(reals[0], -2, 1e-3)).toBe(true);
    expect(near(reals[1], -1, 1e-3)).toBe(true);
    expect(r.every((z) => near(z.im, 0, 1e-3))).toBe(true);
  });

  it('s²+1 → 共轭复根 ±i', () => {
    const r = roots([1, 0, 1]);
    expect(r.length).toBe(2);
    const ims = r.map((z) => z.im).sort((a, b) => a - b);
    expect(near(ims[0], -1, 1e-3)).toBe(true);
    expect(near(ims[1], 1, 1e-3)).toBe(true);
    expect(r.every((z) => near(z.re, 0, 1e-3))).toBe(true);
  });

  it('三次多项式 s³ - 6s² + 11s - 6 = (s-1)(s-2)(s-3) → 根 1,2,3', () => {
    const r = roots([1, -6, 11, -6]);
    expect(r.length).toBe(3);
    const reals = r.map((z) => z.re).sort((a, b) => a - b);
    expect(near(reals[0], 1, 1e-3)).toBe(true);
    expect(near(reals[1], 2, 1e-3)).toBe(true);
    expect(near(reals[2], 3, 1e-3)).toBe(true);
  });
});

describe('bode 幅相曲线', () => {
  it('H(s)=1 → 全频段 0 dB、0°', () => {
    const pts = bode([1], [1], 0.1, 10, 20);
    expect(pts.length).toBe(20);
    for (const p of pts) {
      expect(near(p.db, 0, 1e-6)).toBe(true);
      expect(near(p.phaseDeg, -0, 1e-6) || near(p.phaseDeg, 0, 1e-6)).toBe(true);
    }
  });

  it('H(s)=1/(s+1) 低频增益 0dB、高频 -20dB/dec 趋势', () => {
    const pts = bode([1], [1, 1], 0.01, 100, 100);
    const lo = pts[0];
    expect(near(lo.db, 0, 0.5)).toBe(true);
    // 高频端（f=100，w≈628 >> 1）增益 ≈ 1/w → -20log10(w) dB
    const hi = pts[pts.length - 1];
    const w = hi.w;
    expect(hi.db < -30).toBe(true);
    expect(near(hi.db, -20 * Math.log10(w), 2)).toBe(true);
  });

  it('阶数≥2 时 roots/poles 可用', () => {
    const p = poles([1, 3, 2]);
    expect(p.length).toBe(2);
  });
});

describe('stepResponse 阶跃响应', () => {
  it('H(s)=1/(s+1) → y(t)=1-e^-t，t=1 处 ≈0.632，稳态 ≈1', () => {
    const r = stepResponse([1], [1, 1], 10, 500);
    expect(r[0].t).toBe(0);
    expect(near(r[0].y, 0, 1e-3)).toBe(true);
    const at1 = r.find((p) => near(p.t, 1, 0.02));
    expect(at1).toBeDefined();
    expect(near(at1!.y, 1 - Math.exp(-1), 0.02)).toBe(true);
    const last = r[r.length - 1];
    expect(near(last.y, 1, 0.01)).toBe(true);
  });

  it('H(s)=1/(s²+2s+2)（欠阻尼，稳态=1/2）', () => {
    const r = stepResponse([1], [1, 2, 2], 12, 600);
    const last = r[r.length - 1];
    expect(near(last.y, 0.5, 0.02)).toBe(true);
    // 存在超调（ζ≈0.707，峰值 > 稳态）
    const pk = Math.max(...r.map((p) => p.y));
    expect(pk > 0.5 + 0.02).toBe(true);
  });

  it('零阶 H(s)=k → 阶跃 = k', () => {
    const r = stepResponse([2], [1], 5, 100);
    expect(r.every((p) => near(p.y, 2, 1e-6))).toBe(true);
  });
});

describe('logFreqs 对数频率轴', () => {
  it('首尾贴合、对数均匀', () => {
    const fs = logFreqs(0.1, 100, 5);
    expect(fs[0]).toBeCloseTo(0.1, 6);
    expect(fs[fs.length - 1]).toBeCloseTo(100, 6);
    const r0 = Math.log10(fs[1] / fs[0]);
    const r1 = Math.log10(fs[2] / fs[1]);
    expect(near(r0, r1, 1e-9)).toBe(true);
  });
});

describe('parsePolynomial 多项式字符串解析', () => {
  it('"s^2+3s+2" → [1,3,2]（最高次在前）', () => {
    expect(parsePolynomial('s^2+3s+2')).toEqual([1, 3, 2]);
  });

  it('"2s^3 - 4s + 5" → [2,0,-4,5]', () => {
    expect(parsePolynomial('2s^3 - 4s + 5')).toEqual([2, 0, -4, 5]);
  });

  it('"5"（常数） → [5]', () => {
    expect(parsePolynomial('5')).toEqual([5]);
  });

  it('"s+2" → [1,2]；"1" → [1]', () => {
    expect(parsePolynomial('s+2')).toEqual([1, 2]);
    expect(parsePolynomial('1')).toEqual([1]);
  });

  it('支持 "*" 与空白："2*s^2 + 3s" → [2,3,0]', () => {
    expect(parsePolynomial('2*s^2 + 3s')).toEqual([2, 3, 0]);
  });

  it('非法/空串 → [0]', () => {
    expect(parsePolynomial('')).toEqual([0]);
    expect(parsePolynomial('   ')).toEqual([0]);
  });
});

describe('transferAnalysis 一键分析', () => {
  it('H(s)=1/(s^2+3s+2) 生成极点/伯德/阶跃', () => {
    const a = transferAnalysis({ num: '1', den: 's^2+3s+2', fMin: 0.01, fMax: 10, tEnd: 8 });
    // 极点：s²+3s+2 → -1, -2
    expect(a.poles.length).toBe(2);
    const reals = a.poles.map((z) => z.re).sort((x, y) => x - y);
    expect(near(reals[0], -2, 1e-3)).toBe(true);
    expect(near(reals[1], -1, 1e-3)).toBe(true);
    // Bode 为低通：低频 ≈ 直流增益 H(0)=1/2 → -6.02dB；高频严重衰减
    expect(near(a.bode[0].db, -6.02, 1.5)).toBe(true);
    expect(a.bode[a.bode.length - 1].db).toBeLessThan(-20);
    // 阶跃稳态 = H(0) = 1/2
    const last = a.step[a.step.length - 1];
    expect(near(last.y, 0.5, 0.02)).toBe(true);
  });
});

describe('rlocus 根轨迹', () => {
  it('K=0 时闭环极点 = 开环极点（分母根）', () => {
    // G(s)=1/(s²+3s+2)，开环极点 -1,-2
    const pts = rlocus([1], [1, 3, 2], [0]);
    expect(pts.length).toBe(1);
    const reals = pts[0].roots.map((z) => z.re).sort((a, b) => a - b);
    expect(near(reals[0], -2, 1e-3)).toBe(true);
    expect(near(reals[1], -1, 1e-3)).toBe(true);
  });

  it('K 递增时轨迹点数与 K 一一对应，且 K 值正确', () => {
    const Klist = [0, 1, 10, 100];
    const pts = rlocus([1], [1, 3, 2], Klist);
    expect(pts.map((p) => p.K)).toEqual(Klist);
    expect(pts.every((p) => p.roots.length === 2)).toBe(true);
  });

  it('rlocusKlist 生成对数均匀且首尾贴合', () => {
    const ks = rlocusKlist(0.01, 100, 5);
    expect(near(ks[0], 0.01, 1e-9)).toBe(true);
    expect(near(ks[ks.length - 1], 100, 1e-9)).toBe(true);
    const r0 = Math.log10(ks[1] / ks[0]);
    const r1 = Math.log10(ks[2] / ks[1]);
    expect(near(r0, r1, 1e-9)).toBe(true);
  });
});

describe('nyquist 奈奎斯特曲线', () => {
  it('G(s)=1/(s+1)：ω=0 时 (re,im)=(1,0)，ω→∞ 时 →0', () => {
    const pts = nyquist([1], [1, 1], 1000, 200);
    // 首点 ω 最小 → 接近 (1,0)
    const first = pts[0];
    expect(near(first.re, 1, 0.05)).toBe(true);
    expect(near(first.im, 0, 0.05)).toBe(true);
    // 末点 ω 最大 → 接近原点
    const last = pts[pts.length - 1];
    expect(Math.hypot(last.re, last.im)).toBeLessThan(0.05);
  });

  it('G(s)=1/(s+1) 曲线在复平面左半（re>0）', () => {
    const pts = nyquist([1], [1, 1]);
    expect(pts.every((p) => p.re > 0)).toBe(true);
  });
});

describe('PID 整定（Ziegler-Nichols）', () => {
  it('三阶对象 1/[(s+1)(s+2)(s+3)] 能找到 -180° 穿越', () => {
    const ult = findUltimateGain([1], [1, 6, 11, 6]);
    expect(ult).not.toBeNull();
    expect(ult!.Ku).toBeGreaterThan(0);
    expect(ult!.Tu).toBeGreaterThan(0);
  });

  it('一阶对象 1/(s+1) 相位不穿 -180° → 返回 null', () => {
    const ult = findUltimateGain([1], [1, 1]);
    expect(ult).toBeNull();
  });

  it('pidGains 比例系数符合 ZN 公式：Kp=0.6·Ku', () => {
    const g = pidGains(10, 2, 'pid');
    expect(near(g.Kp, 6, 1e-9)).toBe(true);
    expect(g.Ki > 0).toBe(true);
    expect(g.Kd > 0).toBe(true);
  });

  it('pidTune 三阶对象返回正增益且闭环阶跃收敛到 1', () => {
    const r = pidTune([1], [1, 6, 11, 6], { tEnd: 30, steps: 600 });
    expect(!('error' in r)).toBe(true);
    if ('error' in r) return;
    expect(r.gains.Kp).toBeGreaterThan(0);
    expect(r.gains.Ki).toBeGreaterThan(0);
    // 闭环阶跃最终应稳定在 1（PID 含积分 → 无稳态误差）
    const last = r.step[r.step.length - 1];
    expect(near(last.y, 1, 0.1)).toBe(true);
    // 响应不发散（有界）
    const mx = Math.max(...r.step.map((p) => p.y));
    expect(mx).toBeLessThan(3);
  });
});

describe('closedLoopTransfer 闭环传递函数', () => {
  it('L=1/(s+1) → T=1/(s+2)（单位反馈）', () => {
    const t = closedLoopTransfer([1], [1, 1]);
    // T = Lnum/(Lnum+Lden) = 1/(1 + s+1) = 1/(s+2)
    expect(t.num).toEqual([1]);
    expect(t.den).toEqual([1, 2]);
  });
});

describe('stabilityMargins 稳定性裕度', () => {
  it('一阶系统 10/(s+1)：有 PM、无 GM（相位未达 -180°）', () => {
    // |G| 在 f≈1.58Hz 穿越 0dB，相位 -84.3° → PM≈95.7°>0；
    // 一阶相位只到 -90°，-180° 未穿越 → GM=null。
    const pts = bode([10], [1, 1], 0.01, 1000, 400);
    const m = stabilityMargins(pts);
    expect(m.pm).not.toBeNull();
    expect(m.pm!).toBeGreaterThan(0);
    expect(m.gm).toBeNull();
  });

  it('带积分环节典型系统 G=1/[s(s+1)]：有 PM 且 ωc≈1 rad/s', () => {
    const pts = bode([1], [1, 1, 0], 0.01, 1000, 400);
    const m = stabilityMargins(pts);
    expect(m.pm).not.toBeNull();
    expect(m.pm!).toBeGreaterThan(0);
    expect(m.wgc).not.toBeNull();
    // ωc 在 1 rad/s 附近（容差放宽，因频率采样离散）。
    expect(m.wgc!).toBeGreaterThan(0.5);
    expect(m.wgc!).toBeLessThan(2);
  });

  it('三阶开环 G=30/[s(s+1)(s+2)]：PM<0、GM<0（闭环临界/不稳定）', () => {
    const pts = bode([30], [1, 3, 2, 0], 0.01, 1000, 400);
    const m = stabilityMargins(pts);
    expect(m.pm).not.toBeNull();
    expect(m.pm!).toBeLessThan(0);
    expect(m.gm).not.toBeNull();
    expect(m.gm!).toBeLessThan(0);
  });
});

describe('impulseResponse 冲激响应', () => {
  it('一阶 1/(s+1) 冲激响应从 1 指数衰减到 0', () => {
    const pts = impulseResponse([1], [1, 1], 5, 200);
    expect(pts.length).toBeGreaterThan(100);
    expect(near(pts[0].y, 1, 1e-2)).toBe(true); // h(0)=1
    expect(Math.abs(pts[pts.length - 1].y)).toBeLessThan(0.05); // 衰减到 0
  });

  it('欠阻尼二阶 1/(s²+0.8s+4) 冲激响应有振荡且初值≈0', () => {
    const pts = impulseResponse([1], [1, 0.8, 4], 8, 400);
    expect(near(pts[0].y, 0, 1e-3)).toBe(true); // 严格正则 h(0)=0
    // 存在振荡：有正有负
    const hasNeg = pts.some((p) => p.y < -0.05);
    expect(hasNeg).toBe(true);
  });
});

describe('routhStability 劳斯判据', () => {
  it('稳定三阶 s³+6s²+11s+6（极点 -1/-2/-3）→ 首列全同号、无变号', () => {
    const r = routhStability([1, 6, 11, 6]);
    if ('error' in r) throw new Error(r.error);
    expect(r.stable).toBe(true);
    expect(r.changes).toBe(0);
  });

  it('不稳定三阶 s³+2s²+3s+10（存在右半平面根）→ 变号次数>0', () => {
    const r = routhStability([1, 2, 3, 10]);
    if ('error' in r) throw new Error(r.error);
    expect(r.stable).toBe(false);
    expect(r.changes).toBeGreaterThan(0);
  });

  it('含虚轴根（临界）系统 s³+s²+4s+4 → marginal', () => {
    const r = routhStability([1, 1, 4, 4]);
    if ('error' in r) throw new Error(r.error);
    // 存在 ±2i 共轭虚根，劳斯表出现全零行 → marginal=true
    expect(r.marginal).toBe(true);
  });
});

describe('masonGain 梅逊增益公式', () => {
  it('单前向通路 + 单回路：T = P/(1-L)', () => {
    const r = masonGain({
      loopGains: [0.5],
      paths: [{ gain: 2, touchedLoops: [0] }],
    });
    expect(near(r.delta, 0.5, 1e-6)).toBe(true); // 1 - 0.5
    expect(near(r.numerator, 2, 1e-6)).toBe(true); // P·Δ_k=2·1
    expect(near(r.gain, 4, 1e-6)).toBe(true);
  });

  it('两不相交回路，前向通路不接触两者', () => {
    // Δ = 1 - (0.2+0.3) + 0.06 = 0.56
    const r = masonGain({
      loopGains: [0.2, 0.3],
      paths: [{ gain: 1, touchedLoops: [] }],
      nonTouchingPairs: [[0, 1]],
    });
    expect(near(r.delta, 0.56, 1e-6)).toBe(true);
    // Δ_k = Δ（通路不接触任何回路）
    expect(near(r.numerator, 0.56, 1e-6)).toBe(true);
    expect(near(r.gain, 1, 1e-6)).toBe(true);
  });
});

describe('masonFromGraph 信号流图 → 梅逊传递函数', () => {
  it('单位反馈：前向 1/(s+1)、反馈 -1 → T=1/(s+2)', () => {
    // 节点 0→1→2→3，边 2→1 反馈增益 -1
    const r = masonFromGraph(
      [
        { from: 0, to: 1, num: [1], den: [1] },
        { from: 1, to: 2, num: [1], den: [1, 1] }, // 1/(s+1)
        { from: 2, to: 3, num: [1], den: [1] },
        { from: 2, to: 1, num: [-1], den: [1] },
      ],
      4,
      0,
      3,
    );
    expect('error' in r).toBe(false);
    if ('error' in r) return;
    expect(r.forwardPaths.length).toBe(1);
    expect(r.loops.length).toBe(1);
    // T = 1/(s+2) → num=[1], den=[1,2]
    expect(r.num).toEqual([1]);
    expect(r.den[0]).toBeCloseTo(1, 6);
    expect(r.den[1]).toBeCloseTo(2, 6);
    expect(r.stable).toBe(true);
    expect(r.poles.length).toBe(1);
    expect(r.poles[0].re).toBeCloseTo(-2, 6);
  });

  it('前向通路不接触回路时 Δk=Δ，T=P', () => {
    // 两不相交回路 0.2、0.3；前向通路不经过它们 → T = P·Δ/Δ = P
    // 节点：0(src)→1(sink)；回路各在一对节点上：2→3→2 (-0.2 忽略符号用正)，4→5→4
    const r = masonFromGraph(
      [
        { from: 0, to: 1, num: [1], den: [1] }, // 前向 P=1
        { from: 2, to: 3, num: [0.2], den: [1] },
        { from: 3, to: 2, num: [1], den: [1] },
        { from: 4, to: 5, num: [0.3], den: [1] },
        { from: 5, to: 4, num: [1], den: [1] },
      ],
      6,
      0,
      1,
    );
    expect('error' in r).toBe(false);
    if ('error' in r) return;
    expect(r.loops.length).toBe(2);
    expect(r.nonTouchingPairs.length).toBe(1);
    // 前向 P=1，T = 1·Δ/Δ = 1
    expect(r.num).toEqual([1]);
    expect(r.den).toEqual([1]);
  });

  it('输入无法到达输出时返回错误', () => {
    const r = masonFromGraph([{ from: 0, to: 1, num: [1], den: [1] }], 3, 0, 2);
    expect('error' in r).toBe(true);
  });
});

describe('leadCompensator 超前校正', () => {
  it('低相位裕度系统校正后 PM 提升到目标附近', () => {
    // G=5/[s(s+1)(s+2)] 原 PM 很小（≈4°），单级超前可补 40° 目标。
    const res = leadCompensator([5], [1, 3, 2, 0], { targetPM: 40, tEnd: 10 });
    if ('error' in res) throw new Error(res.error);
    expect(res.pm).not.toBeNull();
    expect(res.pm!).toBeGreaterThanOrEqual(30);
  });

  it('已达标系统返回单位校正器（无需校正）', () => {
    const res = leadCompensator([10], [1, 1], { targetPM: 50 });
    if ('error' in res) throw new Error(res.error);
    expect(res.cNum).toEqual([1]);
    expect(res.cDen).toEqual([1]);
  });
});

describe('lagCompensator 滞后校正', () => {
  it('通过 Kv 约束触发设计路径，返回 β>1 且保持 PM', () => {
    // G=1/[s(s+1)] 的 PM≈51.8° 已达标，但给定更高的目标速度误差系数 Kv，
    // 滞后校正应提升低频增益（β>1）来满足 Kv，同时不显著损失 PM。
    const res = lagCompensator([1], [1, 1, 0], { targetPM: 40, kv: 50, tEnd: 12 });
    if ('error' in res) throw new Error(res.error);
    expect(res.kind).toBe('lag');
    expect(res.alpha).toBeGreaterThan(1);
    expect(res.zero).toBeGreaterThan(0);
    expect(res.pole).toBeGreaterThan(0);
    expect(res.zero).toBeGreaterThan(res.pole); // 零点在高频、极点在低频
    expect(res.pm).not.toBeNull();
    // 大幅提升 Kv（β≈50）会带来一定相位损失，但校正后系统应仍保持正相位裕度（稳定）
    expect(res.pm!).toBeGreaterThan(10);
  });

  it('已达标系统返回单位校正器', () => {
    const res = lagCompensator([10], [1, 1], { targetPM: 50 });
    if ('error' in res) throw new Error(res.error);
    expect(res.cNum).toEqual([1]);
    expect(res.cDen).toEqual([1]);
  });
});