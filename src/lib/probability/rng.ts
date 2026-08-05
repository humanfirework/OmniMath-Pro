/**
 * OmniMath Pro — Reproducible pseudo-random number generation (pure logic).
 *
 * 提供可种子化的 PRNG 接口 `Rng`（返回 [0,1)），默认 `mulberry32`（极小、
 * 质量足够教学/统计模拟）。所有分布采样统一接收 `Rng`，保证「同种子两次运行
 * 结果完全一致」，供蒙特卡洛与教学复现使用。
 */

export type Rng = () => number;

/** mulberry32 —— 极小的可种子 PRNG，返回 [0,1)。 */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 默认随机数生成器（非种子，等价于 Math.random 的语义包装）。 */
export const defaultRng: Rng = () => Math.random();

/** 从字符串/数字派生一个稳定的种子（用于蓝图节点 seed 输入）。 */
export function toSeed(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v >>> 0;
  let hash = 2166136261;
  const s = String(v ?? '');
  for (let i = 0; i < s.length; i++) {
    hash ^= s.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}