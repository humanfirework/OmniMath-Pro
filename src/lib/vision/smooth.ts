/**
 * One Euro Filter — 自适应低通滤波器，用于平滑关键点 / 曲线动画。
 *
 * 参考：Casiez et al., "1€ Filter" (CHI 2012)。
 *
 * 核心思想：低频信号用低截止频率（更平滑），高频信号自适应提高截止
 * 频率（减少延迟）。即「慢速移动时滤波强、快速移动时滤波弱」。
 *
 * 数学：
 *   te = 1 / freq                          // 采样间隔（秒）
 *   α = 1 / (1 + τ / cutoff)               // 一阶低通系数，τ = 1 / (2π·cutoff)
 *   x̂  = LowPass(x, α)                    // 当前滤波值 = α·x + (1-α)·x̂_prev
 *   dx̂ = LowPass(∇x, α_d)                 // 速度的低通
 *   cutoff = minCutoff + beta · |dx̂|      // 自适应截止频率
 *   最终 α = 1 / (1 + τ / cutoff)
 *
 * 参数说明：
 *   - freq：采样频率（Hz）。若未知，可用两次 timestamp 差分推算。
 *   - minCutoff：静止时的截止频率（越小越平滑，越大越跟手）。
 *   - beta：速度系数（越大对快速运动响应越好，但噪声也越透）。
 *   - dCutoff：速度低通的截止频率（通常固定为 1.0）。
 */
import type { BezierPath } from './types';
import type { PoseSequence } from './pose';

/* ------------------------------------------------------------------ *
 * One Euro Filter
 * ------------------------------------------------------------------ */

export interface OneEuroFilterConfig {
  /** 采样频率（Hz）。默认 30。 */
  freq: number;
  /** 静止时截止频率（Hz）。默认 1.0。 */
  minCutoff: number;
  /** 速度系数。默认 0.007。 */
  beta: number;
  /** 速度低通截止频率（Hz）。默认 1.0。 */
  dCutoff: number;
}

export const DEFAULT_ONE_EURO_CONFIG: OneEuroFilterConfig = {
  freq: 30,
  minCutoff: 1.0,
  beta: 0.007,
  dCutoff: 1.0,
};

/** 一阶低通系数 α = 1 / (1 + τ / cutoff)，τ = 1 / (2π·cutoff)。 */
function alpha(cutoff: number, te: number): number {
  if (cutoff <= 0 || te <= 0) return 1;
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / te);
}

export class OneEuroFilter {
  private config: OneEuroFilterConfig;
  private hasPrev = false;
  private prevX = 0;
  private prevDxHat = 0;
  /** 上次 filter 调用的 timestamp（用于推算 te）；hasPrev=false 时为 0。 */
  private prevTimestamp = 0;

  constructor(config?: Partial<OneEuroFilterConfig>) {
    this.config = { ...DEFAULT_ONE_EURO_CONFIG, ...config };
  }

  /** 更新配置（不重置内部状态）。 */
  configure(config: Partial<OneEuroFilterConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 对单个标量值滤波。
   *
   * @param value 当前采样值
   * @param timestamp 当前时间戳（秒；与上次的差分即为 te）
   */
  filter(value: number, timestamp: number): number {
    const cfg = this.config;
    // 采样间隔 te：优先用 timestamp 差分；首帧或时间倒流时回退到 1/freq。
    let te = 1 / cfg.freq;
    if (this.hasPrev && timestamp > this.prevTimestamp) {
      te = timestamp - this.prevTimestamp;
    }
    this.prevTimestamp = timestamp;

    if (!this.hasPrev) {
      this.prevX = value;
      this.prevDxHat = 0;
      this.hasPrev = true;
      return value;
    }

    // 速度估计
    const dx = (value - this.prevX) / te;
    const aD = alpha(cfg.dCutoff, te);
    const dxHat = aD * dx + (1 - aD) * this.prevDxHat;

    // 自适应截止频率
    const cutoff = cfg.minCutoff + cfg.beta * Math.abs(dxHat);
    const a = alpha(cutoff, te);
    const xHat = a * value + (1 - a) * this.prevX;

    this.prevX = xHat;
    this.prevDxHat = dxHat;
    return xHat;
  }

  /** 清空内部状态（下次 filter 视为首帧）。 */
  reset(): void {
    this.hasPrev = false;
    this.prevX = 0;
    this.prevDxHat = 0;
    this.prevTimestamp = 0;
  }
}

/* ------------------------------------------------------------------ *
 * 对 PoseSequence 应用 One Euro Filter
 * ------------------------------------------------------------------ */

/**
 * 对 PoseSequence 的每个关键点（x/y/z 三轴）独立应用 One Euro Filter。
 *
 * 每个关键点维护一个独立的 filter 实例（避免不同关键点的速度互相干扰）。
 * 帧时间戳用 PoseFrame.timestamp（毫秒）→ 转换为秒。
 */
export function smoothPoseSequence(
  seq: PoseSequence,
  config?: Partial<OneEuroFilterConfig>,
): PoseSequence {
  if (seq.frames.length === 0) return seq;
  const numLandmarks = seq.frames[0].landmarks.length;
  // 每个关键点的 3 个轴各一个 filter：filters[i*3 + 0/1/2]
  const filters: OneEuroFilter[] = [];
  for (let i = 0; i < numLandmarks * 3; i++) {
    filters.push(new OneEuroFilter(config));
  }

  const smoothedFrames = seq.frames.map((frame) => {
    const tSec = frame.timestamp / 1000;
    const lms = frame.landmarks.map((lm, i) => {
      const fx = filters[i * 3];
      const fy = filters[i * 3 + 1];
      const fz = filters[i * 3 + 2];
      return {
        x: fx.filter(lm.x, tSec),
        y: fy.filter(lm.y, tSec),
        z: fz.filter(lm.z, tSec),
        visibility: lm.visibility,
      };
    });
    return { ...frame, landmarks: lms };
  });

  return { ...seq, frames: smoothedFrames };
}

/* ------------------------------------------------------------------ *
 * 对逐帧曲线动画应用 One Euro Filter
 * ------------------------------------------------------------------ */

/**
 * 对逐帧 BezierPath[][] 的所有控制点（x/y 两轴）应用 One Euro Filter。
 *
 * 假定：frames[i] 与 frames[i+1] 的曲线结构对齐（同序号 path / segment /
 * 控制点）。若不对齐（如逐帧 contour 数量变化），仅对前 N 条共享 path
 * 做平滑，其余原样保留。
 *
 * 时间戳：用帧索引 * (1/fps) 推算秒。fps 默认 30。
 */
export function smoothCurveAnimation(
  frames: BezierPath[][],
  config?: Partial<OneEuroFilterConfig>,
): BezierPath[][] {
  if (frames.length === 0) return frames;
  const cfg = { ...DEFAULT_ONE_EURO_CONFIG, ...config };
  const fps = cfg.freq > 0 ? cfg.freq : 30;

  // 找出所有帧共享的最大 path / segment 索引范围。
  const maxPaths = Math.min(...frames.map((f) => f.length));
  if (maxPaths === 0) return frames;
  const maxSegsPerPath: number[] = [];
  for (let p = 0; p < maxPaths; p++) {
    const segs = Math.min(...frames.map((f) => f[p]?.segments?.length ?? 0));
    maxSegsPerPath.push(segs);
  }

  // 每个 (path, segment, control-point, axis) 一个 filter。
  // 控制点序号：0=p0, 1=c1, 2=c2, 3=p1（每段 4 个点 × 2 轴 = 8 个 filter）。
  const filterMap = new Map<string, OneEuroFilter>();
  const getFilter = (key: string) => {
    let f = filterMap.get(key);
    if (!f) {
      f = new OneEuroFilter(cfg);
      filterMap.set(key, f);
    }
    return f;
  };

  // 逐帧逐点平滑
  const out: BezierPath[][] = frames.map((framePaths, fi) => {
    const tSec = fi / fps;
    const smoothedPaths: BezierPath[] = framePaths.map((path, p) => {
      if (p >= maxPaths) return path;
      const maxSegs = maxSegsPerPath[p];
      const segs = path.segments.map((seg, s) => {
        if (s >= maxSegs) return seg;
        const filterPoint = (axis: 'x' | 'y', baseKey: string, val: number) => {
          const f = getFilter(`${baseKey}:${axis}`);
          return f.filter(val, tSec);
        };
        const base = `${p}:${s}`;
        return {
          p0: {
            x: filterPoint('x', `${base}:p0`, seg.p0.x),
            y: filterPoint('y', `${base}:p0`, seg.p0.y),
          },
          c1: {
            x: filterPoint('x', `${base}:c1`, seg.c1.x),
            y: filterPoint('y', `${base}:c1`, seg.c1.y),
          },
          c2: {
            x: filterPoint('x', `${base}:c2`, seg.c2.x),
            y: filterPoint('y', `${base}:c2`, seg.c2.y),
          },
          p1: {
            x: filterPoint('x', `${base}:p1`, seg.p1.x),
            y: filterPoint('y', `${base}:p1`, seg.p1.y),
          },
        };
      });
      return { ...path, segments: segs };
    });
    return smoothedPaths;
  });

  return out;
}
