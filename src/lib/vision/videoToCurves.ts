/**
 * 视频 → 曲线（P1-1）。
 *
 * 把 `video.ts` 产出的 `FrameSequence`（GIF/MP4/WebM 逐帧图像）串成可交互的
 * 动画曲线集：
 *
 *   1. 帧采样（stride / maxFrames 控制计算量）
 *   2. 逐帧 `imageToCurves` → 每帧 BezierPath[]
 *   3. 帧间曲线关联（按质心最近邻，贪心匹配，超距起始新轨迹）
 *   4. 轨迹时域平滑（Savitzky-Golay，对每条轨迹的采样点 X/Y 分量分别平滑）
 *   5. 输出逐帧对齐的动画曲线集（`frames[i] = 第 i 帧的 BezierPath[]`）
 *
 * 全部为纯函数 / 无 DOM 依赖，可在主线程或 Web Worker / vitest 中运行。
 */

import { imageToCurves } from './imageToCurves';
import { fitBezierPath } from './fit';
import type { BezierPath, BezierSegment, VisionOptions } from './types';
import type { FrameSequence } from './video';

/**
 * 帧数列节流：把 frames 均匀抽取为至多 maxFrames 帧（等间距）。
 *
 * 当帧数 ≤ maxFrames 时原样返回（不改变默认行为）；仅在帧数过多时
 * 抽取 maxFrames 帧，避免动画持有成千上万帧 BezierPath 造成内存/渲染爆炸。
 */
export function throttleFrames<T>(frames: readonly T[], maxFrames: number): T[] {
  if (maxFrames <= 0 || frames.length <= maxFrames) return frames.slice();
  const stride = frames.length / maxFrames;
  const out: T[] = [];
  for (let i = 0; i < maxFrames; i++) {
    out.push(frames[Math.min(frames.length - 1, Math.floor(i * stride))]);
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Savitzky-Golay 平滑
 * ------------------------------------------------------------------ */

/**
 * 计算 Savitzky-Golay 中心点卷积核。
 * 对窗口内样本做 k 阶多项式最小二乘拟合，取中心点值，得到长度为 window 的系数。
 * 系数满足：smoothed[center] = Σ c[i]·data[i]。
 *
 * 推导：c = A·(AᵀA)⁻¹·e₀，其中 A[i][j] = tᵢʲ，tᵢ = i - half，e₀ 取常数项。
 */
export function savgolKernel(window: number, order: number): number[] {
  const w = window % 2 === 0 ? window + 1 : window; // 强制奇数
  if (w < 3) return [1];
  const half = Math.floor(w / 2);
  const k = Math.min(order, w - 1);
  if (k < 0) return [1];

  // 设计矩阵 A（w × (k+1)），A[i][j] = (i - half)^j
  const A: number[][] = [];
  for (let i = 0; i < w; i++) {
    const t = i - half;
    const row: number[] = [];
    let p = 1;
    for (let j = 0; j <= k; j++) {
      row.push(p);
      p *= t;
    }
    A.push(row);
  }

  // M = AᵀA（(k+1) × (k+1)）
  const n = k + 1;
  const M: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let a = 0; a < n; a++) {
    for (let b = 0; b < n; b++) {
      let s = 0;
      for (let i = 0; i < w; i++) s += A[i][a] * A[i][b];
      M[a][b] = s;
    }
  }

  // 解 M·u = e₀（e₀ = [1,0,...,0]）
  const u = solveLinear(M, 0);
  if (!u) return [1];

  // c = A·u
  const c: number[] = [];
  for (let i = 0; i < w; i++) {
    let s = 0;
    for (let j = 0; j < n; j++) s += A[i][j] * u[j];
    c.push(s);
  }
  return c;
}

/** 用高斯消元解 M·x = e_idx（e_idx 为单位向量第 idx 位），返回 x 或 null（奇异）。 */
function solveLinear(M: number[][], eIdx: number): number[] | null {
  const n = M.length;
  const aug = M.map((row, i) => [...row, i === eIdx ? 1 : 0]);
  // 部分主元消去
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(aug[r][col]) > Math.abs(aug[piv][col])) piv = r;
    }
    if (Math.abs(aug[piv][col]) < 1e-12) return null;
    [aug[col], aug[piv]] = [aug[piv], aug[col]];
    const diag = aug[col][col];
    for (let j = col; j <= n; j++) aug[col][j] /= diag;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = aug[r][col];
      if (Math.abs(f) < 1e-12) continue;
      for (let j = col; j <= n; j++) aug[r][j] -= f * aug[col][j];
    }
  }
  return aug.map((row) => row[n]);
}

/**
 * 对一维序列做 Savitzky-Golay 平滑。
 * 边界采用「边缘值复制」填充（稳健、无振荡）。
 * 参数不足（length < window）或 window/order 非法时原样返回。
 */
export function savitzkyGolay(data: number[], window: number, order: number): number[] {
  const n = data.length;
  if (n === 0) return [];
  const w = window % 2 === 0 ? window + 1 : window;
  if (w < 3 || n < 3) return data.slice();
  const half = Math.floor(w / 2);
  const kernel = savgolKernel(w, order);
  if (kernel.length !== w) return data.slice();

  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = -half; j <= half; j++) {
      const idx = Math.max(0, Math.min(n - 1, i + j));
      s += kernel[j + half] * data[idx];
    }
    out[i] = s;
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * 轨迹（帧间关联）
 * ------------------------------------------------------------------ */

/** 一条跨帧轨迹：curves[i] = 第 i 帧对应的曲线（缺失为 null）。 */
export interface VideoTrack {
  /** 长度 = 帧数；缺失帧为 null。 */
  curves: (BezierPath | null)[];
}

/** 曲线质心（所有控制点的均值）。 */
function centroid(path: BezierPath): { x: number; y: number } {
  let x = 0;
  let y = 0;
  let c = 0;
  for (const seg of path.segments) {
    for (const p of [seg.p0, seg.c1, seg.c2, seg.p1]) {
      x += p.x;
      y += p.y;
      c++;
    }
  }
  if (c === 0) return { x: 0, y: 0 };
  return { x: x / c, y: y / c };
}

/**
 * 帧间曲线关联：逐帧贪心最近邻匹配。
 * 每帧优先把已有轨迹续接到「质心最近且距离 ≤ maxDistance」的曲线；
 * 未匹配的曲线起始新轨迹。返回轨迹列表（每条长度 = 帧数）。
 */
export function associateTracks(framePaths: BezierPath[][], maxDistance: number): VideoTrack[] {
  const frameCount = framePaths.length;
  const tracks: VideoTrack[] = [];
  for (let fi = 0; fi < frameCount; fi++) {
    const curves = framePaths[fi];
    const used = new Set<number>();

    for (const t of tracks) {
      // 找该轨迹最近的非空曲线质心
      let lastCurve: BezierPath | null = null;
      for (let k = t.curves.length - 1; k >= 0; k--) {
        if (t.curves[k]) {
          lastCurve = t.curves[k] as BezierPath;
          break;
        }
      }
      if (!lastCurve) {
        t.curves.push(null);
        continue;
      }
      const lc = centroid(lastCurve);
      let best = -1;
      let bestD = Infinity;
      for (let ci = 0; ci < curves.length; ci++) {
        if (used.has(ci)) continue;
        const c = centroid(curves[ci]);
        const d = Math.hypot(c.x - lc.x, c.y - lc.y);
        if (d < bestD) {
          bestD = d;
          best = ci;
        }
      }
      if (best >= 0 && bestD <= maxDistance) {
        used.add(best);
        t.curves.push(curves[best]);
      } else {
        t.curves.push(null);
      }
    }

    // 未匹配曲线 → 新轨迹
    const newTrack: VideoTrack = { curves: new Array(fi).fill(null) };
    for (let ci = 0; ci < curves.length; ci++) {
      if (used.has(ci)) continue;
      newTrack.curves.push(curves[ci]);
    }
    if (newTrack.curves.length > fi) tracks.push(newTrack);
  }

  // 补齐所有轨迹到 frameCount
  for (const t of tracks) {
    while (t.curves.length < frameCount) t.curves.push(null);
  }
  return tracks;
}

/* ------------------------------------------------------------------ *
 * 采样 + 平滑 + 重建
 * ------------------------------------------------------------------ */

/** 三次贝塞尔段在 t 处求值。 */
function evalSeg(seg: BezierSegment, t: number): { x: number; y: number } {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return {
    x: a * seg.p0.x + b * seg.c1.x + c * seg.c2.x + d * seg.p1.x,
    y: a * seg.p0.y + b * seg.c1.y + c * seg.c2.y + d * seg.p1.y,
  };
}

/** 把一条 BezierPath 等步采样为 n 个点（闭合路径首尾相接）。 */
export function samplePath(path: BezierPath, n: number): Array<[number, number]> {
  const segs = path.segments;
  if (segs.length === 0) return [];
  const pts: Array<[number, number]> = [];
  const per = Math.max(1, Math.floor(n / segs.length));
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];
    const steps = i < segs.length - 1 ? per : Math.max(1, n - pts.length);
    for (let t = 0; t <= steps; t++) {
      const p = evalSeg(seg, t / steps);
      pts.push([p.x, p.y]);
    }
  }
  if (pts.length > n) pts.length = n;
  return pts;
}

/**
 * 对单条轨迹做时域平滑：
 *   每条非空帧采样为 SAMPLE_N 个点，对每个采样点的 X/Y 分量跨帧做
 *   Savitzky-Golay 平滑，再重建为 BezierPath。缺失帧保持 null。
 */
export function smoothTrack(
  track: VideoTrack,
  options: { window?: number; order?: number; sampleN?: number; errorThreshold?: number; cornerThreshold?: number },
): (BezierPath | null)[] {
  const frameCount = track.curves.length;
  const sampleN = Math.max(8, options.sampleN ?? 32);
  const window = Math.max(3, options.window ?? 5);
  const order = Math.max(0, options.order ?? 2);
  const err = options.errorThreshold ?? 1.0;
  const corner = options.cornerThreshold ?? 1.0;

  // 每帧采样点（null 帧 → null）
  const perFrame: (Array<[number, number]> | null)[] = track.curves.map((c) =>
    c ? samplePath(c, sampleN) : null,
  );

  // 对每个采样点索引，跨帧收集 X/Y 分量并平滑
  for (let s = 0; s < sampleN; s++) {
    const xs: number[] = [];
    const ys: number[] = [];
    const idxs: number[] = [];
    for (let fi = 0; fi < frameCount; fi++) {
      const arr = perFrame[fi];
      if (arr && arr[s]) {
        xs.push(arr[s][0]);
        ys.push(arr[s][1]);
        idxs.push(fi);
      }
    }
    if (xs.length < 3) continue;
    const sx = savitzkyGolay(xs, window, order);
    const sy = savitzkyGolay(ys, window, order);
    for (let k = 0; k < idxs.length; k++) {
      const fi = idxs[k];
      const arr = perFrame[fi] as Array<[number, number]>;
      arr[s] = [sx[k], sy[k]];
    }
  }

  // 重建每帧为 BezierPath
  const out: (BezierPath | null)[] = new Array(frameCount).fill(null);
  for (let fi = 0; fi < frameCount; fi++) {
    const arr = perFrame[fi];
    const src = track.curves[fi];
    if (!arr || !src) continue;
    const rebuilt = fitBezierPath({ points: arr.map(([x, y]) => ({ x, y })), closed: src.closed }, err, corner);
    if (rebuilt.segments.length > 0) out[fi] = rebuilt;
    else out[fi] = src; // 平滑后无法重建时保留原曲线
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * 主管线
 * ------------------------------------------------------------------ */

export interface VideoToCurvesOptions {
  /** 每 N 帧采 1 帧（1=全部）。 */
  stride?: number;
  /** 处理的最大帧数上限。 */
  maxFrames?: number;
  /** 逐帧矢量化参数。 */
  vision?: VisionOptions;
  /** 是否做轨迹时域平滑。 */
  smooth?: boolean;
  /** Savitzky-Golay 窗口（奇数）。 */
  smoothWindow?: number;
  /** Savitzky-Golay 多项式阶。 */
  smoothOrder?: number;
  /** 帧间关联的最大质心距离（像素）。 */
  matchDistance?: number;
}

export interface VideoToCurvesResult {
  /** frames[i] = 第 i 帧的 BezierPath[]（缺失该帧曲线的轨迹为 null）。 */
  frames: (BezierPath | null)[][];
  fps: number;
  width: number;
  height: number;
  frameCount: number;
  /** 关联到的轨迹数。 */
  trackCount: number;
}

/**
 * 视频 → 动画曲线集主管线。
 *
 * @param seq  `frame-extract` / `decodeGif` 产出的帧序列
 * @param options 采样 / 矢量化 / 平滑 / 关联参数
 */
export function videoToCurves(seq: FrameSequence, options?: VideoToCurvesOptions): VideoToCurvesResult {
  const { picked } = sampleFrames(seq, options);
  if (picked.length === 0) {
    return { frames: [], fps: seq.fps, width: seq.width, height: seq.height, frameCount: 0, trackCount: 0 };
  }

  // 2. 逐帧矢量化（同步，无进度）
  const perFrame: BezierPath[][] = picked.map((frame) => imageToCurves(frame.imageData, options?.vision).curves);

  return assembleResult(perFrame, picked, seq, options);
}

/**
 * 带进度的视频 → 曲线（异步）。
 *
 * 与 `videoToCurves` 产出完全一致，但逐帧矢量化之间显式让出事件循环
 * （`await`），并在每一帧完成后回调 `onProgress`。这样 Web Worker 能
 * 把处理进度实时 postMessage 回主线程，用户不会误以为「卡死」。
 *
 * 注意：`onProgress` 存在时才会让出事件循环；若无需进度，请直接用同步
 * `videoToCurves`（性能更快、可用于单测）。
 */
export async function videoToCurvesWithProgress(
  seq: FrameSequence,
  options?: VideoToCurvesOptions,
  onProgress?: (fraction: number, done: number, total: number) => void,
): Promise<VideoToCurvesResult> {
  const { picked } = sampleFrames(seq, options);
  if (picked.length === 0) {
    return { frames: [], fps: seq.fps, width: seq.width, height: seq.height, frameCount: 0, trackCount: 0 };
  }

  // 2. 逐帧矢量化（异步 + 让出事件循环 + 回报进度）
  const perFrame: BezierPath[][] = [];
  for (let i = 0; i < picked.length; i++) {
    const cs = imageToCurves(picked[i].imageData, options?.vision);
    perFrame.push(cs.curves);
    onProgress?.((i + 1) / picked.length, i + 1, picked.length);
    // 让出事件循环，使 Worker 能 postMessage 进度、主线程能重绘
    if (i < picked.length - 1) {
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  return assembleResult(perFrame, picked, seq, options);
}

/** 采样帧（stride + 上限 maxFrames + 兜底节流）。 */
function sampleFrames(
  seq: FrameSequence,
  options?: VideoToCurvesOptions,
): { picked: FrameSequence['frames'] } {
  const stride = Math.max(1, Math.floor(options?.stride ?? 1));
  const maxFrames = Math.max(1, Math.floor(options?.maxFrames ?? 120));
  let picked: FrameSequence['frames'] = [];
  for (let i = 0; i < seq.frames.length; i += stride) {
    picked.push(seq.frames[i]);
    if (picked.length >= maxFrames) break;
  }
  picked = throttleFrames(picked, maxFrames);
  return { picked };
}

/** 逐帧曲线 → 关联 → 平滑 → 逐帧输出（`videoToCurves` 与 `videoToCurvesWithProgress` 共用）。 */
function assembleResult(
  perFrame: BezierPath[][],
  picked: FrameSequence['frames'],
  seq: FrameSequence,
  options?: VideoToCurvesOptions,
): VideoToCurvesResult {
  const matchDistance = Math.max(0, options?.matchDistance ?? 32);
  // 3. 帧间关联
  const tracks = associateTracks(perFrame, matchDistance);

  // 4. 时域平滑（可选）
  const doSmooth = options?.smooth !== false;
  const smoothed = doSmooth
    ? tracks.map((t) => smoothTrack(t, { window: options?.smoothWindow, order: options?.smoothOrder }))
    : tracks.map((t) => t.curves);

  // 5. 转成逐帧输出
  const frames: (BezierPath | null)[][] = new Array(picked.length).fill(null).map(() => []);
  for (let fi = 0; fi < picked.length; fi++) {
    const frameCurves: (BezierPath | null)[] = smoothed.map((trackCurves) => trackCurves[fi] ?? null);
    frames[fi] = frameCurves.filter((c): c is BezierPath => c !== null);
  }

  return {
    frames,
    fps: seq.fps,
    width: seq.width,
    height: seq.height,
    frameCount: frames.length,
    trackCount: tracks.length,
  };
}