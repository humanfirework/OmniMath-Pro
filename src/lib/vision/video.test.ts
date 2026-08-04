/**
 * 视频帧提取 / 姿态追踪 / One Euro Filter 单元测试。
 *
 * 测试重点（依赖浏览器 API 的部分跳过，仅测纯 TS 逻辑）：
 *   - One Euro Filter：正弦波 + 噪声 → stddev 下降，与原始正弦波相关性 > 0.8
 *   - smoothPoseSequence：合成 PoseSequence（33 关键点，正弦运动 + 噪声）→ 平滑后相邻帧位移 stddev 下降
 *   - poseToCurves：单帧 PoseFrame（33 关键点）→ BezierPath[] 数量 ≤ POSE_CONNECTIONS 数量（visibility 全 1 时 = 连接数）
 *   - GIF 解析器：手写最小 1x1 红色 GIF → 解码 1 帧、宽高 1×1、像素 RGBA = [255,0,0,255]
 *   - POSE_CONNECTIONS：长度合理（~35 条）
 */
import { describe, it, expect } from 'vitest';
import { decodeGif } from './video';
import {
  POSE_CONNECTIONS,
  poseToCurves,
  poseSequenceToAnimation,
  type PoseFrame,
  type PoseSequence,
  type PoseLandmark,
} from './pose';
import {
  OneEuroFilter,
  smoothPoseSequence,
  smoothCurveAnimation,
} from './smooth';
import type { BezierPath } from './types';

/* ------------------------------------------------------------------ *
 * 工具：统计量
 * ------------------------------------------------------------------ */

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

function stddev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const variance = xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(variance);
}

/** Pearson 相关系数。 */
function correlation(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  const ma = mean(a.slice(0, n));
  const mb = mean(b.slice(0, n));
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    const xa = a[i] - ma;
    const xb = b[i] - mb;
    num += xa * xb;
    da += xa * xa;
    db += xb * xb;
  }
  if (da === 0 || db === 0) return 0;
  return num / Math.sqrt(da * db);
}

/** 简单确定性 PRNG（避免 vitest 随机性导致测试不稳定）。 */
function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/* ------------------------------------------------------------------ *
 * One Euro Filter
 * ------------------------------------------------------------------ */
describe('One Euro Filter', () => {
  it('首帧 filter 返回原值（无历史可参考）', () => {
    const f = new OneEuroFilter({ freq: 30, minCutoff: 1.0, beta: 0.007 });
    expect(f.filter(42, 0)).toBe(42);
  });

  it('常量信号 → 滤波后收敛到常量', () => {
    const f = new OneEuroFilter({ freq: 30, minCutoff: 1.0, beta: 0.0 });
    const dt = 1 / 30;
    let v = 0;
    for (let i = 0; i < 100; i++) v = f.filter(5, i * dt);
    expect(v).toBeCloseTo(5, 3);
  });

  it('正弦波 + 噪声 → stddev 下降，与干净正弦波相关性 > 0.8', () => {
    // 干净正弦波：x(t) = sin(2π·f·t)，f = 0.1 Hz（慢信号，避免滤波器
    // 相位滞后主导残差），采样 30 Hz，5 秒共 150 帧。
    const freq = 0.1;
    const sampleRate = 30;
    const duration = 5;
    const n = sampleRate * duration;
    const dt = 1 / sampleRate;

    const rng = makeRng(42);
    const clean: number[] = [];
    const noisy: number[] = [];
    for (let i = 0; i < n; i++) {
      const t = i * dt;
      const c = Math.sin(2 * Math.PI * freq * t);
      clean.push(c);
      // 噪声幅度 0.8（相对于信号幅度 1.0；range ±0.4，stddev ≈ 0.231）
      noisy.push(c + (rng() - 0.5) * 0.8);
    }

    // 滤波
    const f = new OneEuroFilter({
      freq: sampleRate,
      minCutoff: 1.0,
      beta: 0.007,
      dCutoff: 1.0,
    });
    const filtered = noisy.map((v, i) => f.filter(v, i * dt));

    // 1. 噪声 stddev 应显著下降
    const noiseStd = stddev(noisy.map((v, i) => v - clean[i]));
    const residStd = stddev(filtered.map((v, i) => v - clean[i]));
    expect(residStd).toBeLessThan(noiseStd);
    // 至少下降 30%
    expect(residStd).toBeLessThan(noiseStd * 0.7);

    // 2. 与干净正弦波相关性 > 0.8（不引入过大延迟/失真）
    const corr = correlation(clean, filtered);
    expect(corr).toBeGreaterThan(0.8);
  });

  it('reset 后下一次 filter 视为首帧', () => {
    const f = new OneEuroFilter({ freq: 30, minCutoff: 1.0 });
    f.filter(10, 0);
    f.filter(20, 1 / 30);
    f.reset();
    expect(f.filter(99, 0)).toBe(99);
  });
});

/* ------------------------------------------------------------------ *
 * smoothPoseSequence
 * ------------------------------------------------------------------ */
describe('smoothPoseSequence', () => {
  /** 构造合成 PoseSequence：33 关键点做正弦运动 + 噪声。 */
  function makeSyntheticPoseSeq(frameCount: number, noiseAmp: number): PoseSequence {
    const numLandmarks = 33;
    const fps = 30;
    const rng = makeRng(7);
    const frames: PoseFrame[] = [];
    for (let i = 0; i < frameCount; i++) {
      const t = i / fps;
      const landmarks: PoseLandmark[] = [];
      for (let k = 0; k < numLandmarks; k++) {
        // 每个关键点走自己的正弦轨迹 + 噪声
        const phase = (k / numLandmarks) * Math.PI * 2;
        const x = 0.5 + 0.3 * Math.sin(2 * Math.PI * 0.5 * t + phase) + (rng() - 0.5) * noiseAmp;
        const y = 0.5 + 0.3 * Math.cos(2 * Math.PI * 0.5 * t + phase) + (rng() - 0.5) * noiseAmp;
        landmarks.push({ x, y, z: 0, visibility: 1 });
      }
      frames.push({ landmarks, timestamp: t * 1000, index: i, width: 100, height: 100 });
    }
    return { frames, fps, width: 100, height: 100 };
  }

  /** 计算相邻帧所有关键点位移的 stddev。 */
  function frameToFrameDisplacementStddev(seq: PoseSequence): number {
    const displacements: number[] = [];
    for (let i = 1; i < seq.frames.length; i++) {
      const prev = seq.frames[i - 1].landmarks;
      const curr = seq.frames[i].landmarks;
      for (let k = 0; k < prev.length; k++) {
        const dx = curr[k].x - prev[k].x;
        const dy = curr[k].y - prev[k].y;
        displacements.push(Math.sqrt(dx * dx + dy * dy));
      }
    }
    return stddev(displacements);
  }

  it('平滑后相邻帧位移 stddev 下降', () => {
    const seq = makeSyntheticPoseSeq(60, 0.1);
    const before = frameToFrameDisplacementStddev(seq);
    const smoothed = smoothPoseSequence(seq, {
      freq: 30,
      minCutoff: 1.0,
      beta: 0.0,
      dCutoff: 1.0,
    });
    const after = frameToFrameDisplacementStddev(smoothed);
    expect(after).toBeLessThan(before);
  });

  it('空序列 → 返回原序列（无崩溃）', () => {
    const empty: PoseSequence = { frames: [], fps: 30, width: 0, height: 0 };
    expect(smoothPoseSequence(empty).frames.length).toBe(0);
  });

  it('保留 fps / width / height / 帧数', () => {
    const seq = makeSyntheticPoseSeq(10, 0.05);
    const out = smoothPoseSequence(seq);
    expect(out.frames.length).toBe(seq.frames.length);
    expect(out.fps).toBe(seq.fps);
    expect(out.width).toBe(seq.width);
    expect(out.height).toBe(seq.height);
  });
});

/* ------------------------------------------------------------------ *
 * poseToCurves / POSE_CONNECTIONS
 * ------------------------------------------------------------------ */
describe('poseToCurves', () => {
  function makeFullVisibilityFrame(): PoseFrame {
    // 33 关键点，visibility 全 1
    const landmarks: PoseLandmark[] = Array.from({ length: 33 }, (_, i) => ({
      x: i * 0.01,
      y: i * 0.02,
      z: 0,
      visibility: 1,
    }));
    return { landmarks, timestamp: 0, index: 0, width: 100, height: 100 };
  }

  it('visibility 全 1 → 输出曲线数 = POSE_CONNECTIONS 数量', () => {
    const frame = makeFullVisibilityFrame();
    const curves = poseToCurves(frame);
    expect(curves.length).toBe(POSE_CONNECTIONS.length);
  });

  it('每条曲线 = 1 段三次贝塞尔，closed=false', () => {
    const frame = makeFullVisibilityFrame();
    const curves = poseToCurves(frame);
    for (const c of curves) {
      expect(c.segments.length).toBe(1);
      expect(c.closed).toBe(false);
      const seg = c.segments[0];
      // 控制点应位于 p0 和 p1 之间（退化为直线）
      const minX = Math.min(seg.p0.x, seg.p1.x);
      const maxX = Math.max(seg.p0.x, seg.p1.x);
      expect(seg.c1.x).toBeGreaterThanOrEqual(minX - 1e-9);
      expect(seg.c1.x).toBeLessThanOrEqual(maxX + 1e-9);
      expect(seg.c2.x).toBeGreaterThanOrEqual(minX - 1e-9);
      expect(seg.c2.x).toBeLessThanOrEqual(maxX + 1e-9);
    }
  });

  it('部分关键点 visibility < 0.5 → 对应骨骼被跳过', () => {
    const frame = makeFullVisibilityFrame();
    // 把关键点 11（左肩）visibility 设为 0
    frame.landmarks[11].visibility = 0;
    const curves = poseToCurves(frame);
    // 11 条连接涉及关键点 11（数 POSE_CONNECTIONS 中包含 11 的条目）
    const connectedTo11 = POSE_CONNECTIONS.filter(
      ([a, b]) => a === 11 || b === 11,
    ).length;
    expect(curves.length).toBe(POSE_CONNECTIONS.length - connectedTo11);
  });

  it('坐标按 width/height 缩放', () => {
    const frame = makeFullVisibilityFrame();
    frame.width = 200;
    frame.height = 300;
    const curves = poseToCurves(frame);
    // 关键点 0 → 1 的连接：p0 应为 (0, 0)（lm[0] = (0,0)）
    const first = curves[0].segments[0];
    expect(first.p0.x).toBeCloseTo(0 * 200, 6);
    expect(first.p0.y).toBeCloseTo(0 * 300, 6);
  });
});

describe('POSE_CONNECTIONS', () => {
  it('长度合理（~35 条连接，覆盖头/上肢/躯干/下肢）', () => {
    expect(POSE_CONNECTIONS.length).toBeGreaterThanOrEqual(30);
    expect(POSE_CONNECTIONS.length).toBeLessThanOrEqual(40);
  });

  it('所有索引在 [0, 32] 范围内', () => {
    for (const [a, b] of POSE_CONNECTIONS) {
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThan(33);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThan(33);
      expect(a).not.toBe(b);
    }
  });
});

/* ------------------------------------------------------------------ *
 * poseSequenceToAnimation
 * ------------------------------------------------------------------ */
describe('poseSequenceToAnimation', () => {
  it('返回 frames 数组长度 = PoseSequence.frames.length，frameCount 一致', () => {
    const frames: PoseFrame[] = Array.from({ length: 5 }, (_, i) => ({
      landmarks: Array.from({ length: 33 }, () => ({
        x: 0.5,
        y: 0.5,
        z: 0,
        visibility: 1,
      })),
      timestamp: i * 100,
      index: i,
      width: 100,
      height: 100,
    }));
    const seq: PoseSequence = { frames, fps: 10, width: 100, height: 100 };
    const anim = poseSequenceToAnimation(seq);
    expect(anim.frames.length).toBe(5);
    expect(anim.frameCount).toBe(5);
    expect(anim.fps).toBe(10);
    // 每帧的曲线数 = POSE_CONNECTIONS 数量
    for (const f of anim.frames) {
      expect(f.length).toBe(POSE_CONNECTIONS.length);
    }
  });
});

/* ------------------------------------------------------------------ *
 * smoothCurveAnimation
 * ------------------------------------------------------------------ */
describe('smoothCurveAnimation', () => {
  /** 构造合成逐帧曲线动画：3 帧 × 2 条 path × 1 段，控制点带噪声。 */
  function makeSyntheticCurveFrames(): BezierPath[][] {
    const rng = makeRng(99);
    const frames: BezierPath[][] = [];
    for (let fi = 0; fi < 10; fi++) {
      const paths: BezierPath[] = [];
      for (let p = 0; p < 2; p++) {
        const t = fi / 30;
        const baseX = 50 + 20 * Math.sin(2 * Math.PI * 0.5 * t + p);
        const noise = (rng() - 0.5) * 10;
        paths.push({
          segments: [
            {
              p0: { x: baseX + noise, y: 10 },
              c1: { x: baseX + 5 + noise, y: 20 },
              c2: { x: baseX + 10 + noise, y: 30 },
              p1: { x: baseX + 15 + noise, y: 40 },
            },
          ],
          closed: false,
        });
      }
      frames.push(paths);
    }
    return frames;
  }

  it('平滑后帧间控制点位移 stddev 下降', () => {
    const frames = makeSyntheticCurveFrames();
    const before = frameToFrameControlPointDisplacement(frames);
    const smoothed = smoothCurveAnimation(frames, {
      freq: 30,
      minCutoff: 1.0,
      beta: 0.0,
    });
    const after = frameToFrameControlPointDisplacement(smoothed);
    expect(after).toBeLessThan(before);
  });

  it('空数组 → 返回空数组', () => {
    expect(smoothCurveAnimation([])).toEqual([]);
  });

  it('保留帧数与 path 数', () => {
    const frames = makeSyntheticCurveFrames();
    const smoothed = smoothCurveAnimation(frames);
    expect(smoothed.length).toBe(frames.length);
    for (let i = 0; i < frames.length; i++) {
      expect(smoothed[i].length).toBe(frames[i].length);
      expect(smoothed[i][0].segments.length).toBe(frames[i][0].segments.length);
    }
  });
});

function frameToFrameControlPointDisplacement(frames: BezierPath[][]): number {
  const disp: number[] = [];
  for (let fi = 1; fi < frames.length; fi++) {
    const prev = frames[fi - 1];
    const curr = frames[fi];
    const nPaths = Math.min(prev.length, curr.length);
    for (let p = 0; p < nPaths; p++) {
      const nSegs = Math.min(prev[p].segments.length, curr[p].segments.length);
      for (let s = 0; s < nSegs; s++) {
        const a = prev[p].segments[s];
        const b = curr[p].segments[s];
        for (const key of ['p0', 'c1', 'c2', 'p1'] as const) {
          const dx = b[key].x - a[key].x;
          const dy = b[key].y - a[key].y;
          disp.push(Math.sqrt(dx * dx + dy * dy));
        }
      }
    }
  }
  return stddev(disp);
}

/* ------------------------------------------------------------------ *
 * GIF 解析器
 * ------------------------------------------------------------------ */
describe('GIF 解析器（decodeGif）', () => {
  /**
   * 手写最小 GIF89a：1×1 红色像素，无 GCE / 无扩展。
   *
   * 字节布局：
   *   "GIF89a"               (6)
   *   Logical Screen Desc    (7)：宽=1, 高=1, flags=0x80 (2 色 GCT), bg=0, aspect=0
   *   Global Color Table     (6)：[red, black]
   *   Image Descriptor       (10)：0x2C, left=0, top=0, w=1, h=1, flags=0
   *   LZW min code size      (1)：0x02
   *   Sub-block              (3)：len=2, data=[0x44, 0x01]
   *   Sub-block terminator   (1)：0x00
   *   Trailer                (1)：0x3B
   *
   * LZW 编码（minCodeSize=2 → clearCode=4, endCode=5, 初始 codeSize=3）：
   *   clearCode(4) + index 0 + endCode(5)
   *   比特序列（LSB-first）：100 000 101
   *   字节 0 = 0b01000100 = 0x44
   *   字节 1 = 0b00000001 = 0x01
   */
  function makeRed1x1Gif(): ArrayBuffer {
    const bytes = [
      // Header
      0x47, 0x49, 0x46, 0x38, 0x39, 0x61, // "GIF89a"
      // Logical Screen Descriptor
      0x01, 0x00, // width = 1
      0x01, 0x00, // height = 1
      0x80, // GCT flag set, size = 2^(0+1) = 2 entries
      0x00, // bg color index
      0x00, // aspect ratio
      // Global Color Table (2 entries × 3 bytes)
      0xFF, 0x00, 0x00, // entry 0 = red
      0x00, 0x00, 0x00, // entry 1 = black
      // Image Descriptor
      0x2C, // image separator
      0x00, 0x00, // left = 0
      0x00, 0x00, // top = 0
      0x01, 0x00, // width = 1
      0x01, 0x00, // height = 1
      0x00, // packed (no LCT, not interlaced)
      // Image Data
      0x02, // LZW minimum code size
      0x02, // sub-block length = 2
      0x44, 0x01, // LZW data (clear + index 0 + end)
      0x00, // sub-block terminator
      // Trailer
      0x3B,
    ];
    return new Uint8Array(bytes).buffer;
  }

  it('1×1 红色 GIF → 1 帧，宽高 1×1，像素 RGBA = [255,0,0,255]', async () => {
    const buf = makeRed1x1Gif();
    const seq = await decodeGif(buf);
    expect(seq.width).toBe(1);
    expect(seq.height).toBe(1);
    expect(seq.frames.length).toBe(1);
    const f0 = seq.frames[0];
    expect(f0.index).toBe(0);
    expect(f0.imageData.width).toBe(1);
    expect(f0.imageData.height).toBe(1);
    const d = f0.imageData.data;
    expect(d.length).toBe(4);
    expect(d[0]).toBe(255); // R
    expect(d[1]).toBe(0); // G
    expect(d[2]).toBe(0); // B
    expect(d[3]).toBe(255); // A
  });

  it('无效签名 → 抛错', async () => {
    const bad = new Uint8Array([0x50, 0x4e, 0x47, 0x0a, 0x00, 0x00]).buffer; // "PNG..."
    await expect(decodeGif(bad)).rejects.toThrow(/invalid GIF signature/);
  });

  it('2×2 GIF（4 像素，混合颜色）→ 1 帧，正确解码全部像素', async () => {
    // 2×2 GIF：
    //   (0,0)=red(idx0)  (1,0)=black(idx1)
    //   (0,1)=black(idx1) (1,1)=red(idx0)
    // 像素序列（行优先）：[0, 1, 1, 0]
    //
    // LZW minCodeSize=2 → clearCode=4, endCode=5，初始 codeSize=3。
    // 编码器逐步构建字典，输出码字序列：
    //   clear(4), 0, 1, 1, 0, end(5)
    //
    // 关键：解码器在读取第 4 个码字（第二个 1）后，向字典添加条目使
    // dictSize 达到 8 = 2³，从而触发 codeSize 从 3 增长到 4。
    // 因此第 5 个码字（0）及之后的码字（end=5）使用 codeSize=4 读取。
    //
    // 比特布局（LSB-first，每码字按当前 codeSize 打包）：
    //   clear=4 (3 bits):  bit0=0, bit1=0, bit2=1
    //   0     (3 bits):  bit3=0, bit4=0, bit5=0
    //   1     (3 bits):  bit6=1, bit7=0, bit8=0
    //   1     (3 bits):  bit9=1, bit10=0, bit11=0   ← 添加后 dictSize=8 → codeSize→4
    //   0     (4 bits):  bit12=0, bit13=0, bit14=0, bit15=0
    //   5=end (4 bits):  bit16=1, bit17=0, bit18=1, bit19=0
    //
    // 打包成字节（每字节 LSB 在前）：
    //   byte0 (bits 0-7):  0,0,1,0,0,0,1,0 = 0b01000100 = 0x44
    //   byte1 (bits 8-15): 0,1,0,0,0,0,0,0 = 0b00000010 = 0x02
    //   byte2 (bits 16-23):1,0,1,0,0,0,0,0 = 0b00000101 = 0x05
    //   sub-block: len=3, data=[0x44, 0x02, 0x05]
    const bytes = [
      0x47, 0x49, 0x46, 0x38, 0x39, 0x61, // "GIF89a"
      0x02, 0x00, 0x02, 0x00, // width=2, height=2
      0x80, 0x00, 0x00, // flags=0x80, bg=0, aspect=0
      0xFF, 0x00, 0x00, // color 0 = red
      0x00, 0x00, 0x00, // color 1 = black
      0x2C, // image separator
      0x00, 0x00, 0x00, 0x00, // left=0, top=0
      0x02, 0x00, 0x02, 0x00, // width=2, height=2
      0x00, // packed
      0x02, // LZW min code size
      0x03, // sub-block len=3
      0x44, 0x02, 0x05, // LZW data (clear, 0, 1, 1, 0, end with codeSize 3→4)
      0x00, // terminator
      0x3B, // trailer
    ];
    const seq = await decodeGif(new Uint8Array(bytes).buffer);
    expect(seq.width).toBe(2);
    expect(seq.height).toBe(2);
    expect(seq.frames.length).toBe(1);
    const d = seq.frames[0].imageData.data;
    // 像素顺序：(0,0)=red, (1,0)=black, (0,1)=black, (1,1)=red
    expect([d[0], d[1], d[2], d[3]]).toEqual([255, 0, 0, 255]); // (0,0) red
    expect([d[4], d[5], d[6], d[7]]).toEqual([0, 0, 0, 255]); // (1,0) black
    expect([d[8], d[9], d[10], d[11]]).toEqual([0, 0, 0, 255]); // (0,1) black
    expect([d[12], d[13], d[14], d[15]]).toEqual([255, 0, 0, 255]); // (1,1) red
  });
});
