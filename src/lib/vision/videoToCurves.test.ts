/**
 * P1-1：视频 → 曲线 核心逻辑单元测试。
 * 覆盖：Savitzky-Golay 平滑、帧间关联、轨迹平滑、主管线 videoToCurves。
 */
import { describe, it, expect } from 'vitest';
import type { BezierPath, ImageDataLike } from './types';
import type { FrameSequence } from './video';
import {
  savitzkyGolay,
  savgolKernel,
  associateTracks,
  smoothTrack,
  videoToCurves,
  samplePath,
} from './index';

/** 构造一条直线 BezierPath（从 (x0,y0) 到 (x1,y1)）。 */
function linePath(x0: number, y0: number, x1: number, y1: number): BezierPath {
  return {
    segments: [
      {
        p0: { x: x0, y: y0 },
        c1: { x: x0 + (x1 - x0) / 3, y: y0 },
        c2: { x: x1 - (x1 - x0) / 3, y: y1 },
        p1: { x: x1, y: y1 },
      },
    ],
    closed: false,
  };
}

/** 构造一个 N×N 灰阶图（可含简单形状）。 */
function solidImage(v: number, size = 8): ImageDataLike {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    data[i * 4] = v;
    data[i * 4 + 1] = v;
    data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  return { data, width: size, height: size };
}

describe('savitzkyGolay', () => {
  it('核和为 1（保常数信号）', () => {
    const k = savgolKernel(5, 2);
    const sum = k.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 6);
  });

  it('平滑剥掉高频抖动，保留趋势', () => {
    const data = [0, 0, 10, 10, 20, 20, 30, 30];
    const out = savitzkyGolay(data, 5, 2);
    // 单调趋势应保留（尾部值接近 30，且整体不减）
    expect(out[out.length - 1]).toBeGreaterThan(29);
    expect(out[out.length - 1]).toBeLessThan(32);
    for (let i = 1; i < out.length; i++) {
      expect(out[i]).toBeGreaterThanOrEqual(out[i - 1] - 1e-6);
    }
  });

  it('常数序列平滑后仍近似常数', () => {
    const data = [5, 5, 5, 5, 5, 5];
    const out = savitzkyGolay(data, 5, 2);
    for (const v of out) expect(v).toBeCloseTo(5, 6);
  });

  it('长度不足时原样返回', () => {
    expect(savitzkyGolay([1, 2], 5, 2)).toEqual([1, 2]);
  });
});

describe('associateTracks', () => {
  it('静止物体跨帧关联为单一轨迹', () => {
    const path = linePath(10, 10, 20, 10);
    const frames = [ [path], [path], [path] ];
    const tracks = associateTracks(frames, 32);
    expect(tracks).toHaveLength(1);
    expect(tracks[0].curves).toHaveLength(3);
    expect(tracks[0].curves.every((c) => c !== null)).toBe(true);
  });

  it('移动物体（< 关联距离）仍续接同一轨迹', () => {
    const f0 = [linePath(0, 0, 5, 0)];
    const f1 = [linePath(3, 0, 8, 0)];
    const f2 = [linePath(6, 0, 11, 0)];
    const tracks = associateTracks([f0, f1, f2], 10);
    expect(tracks).toHaveLength(1);
    expect(tracks[0].curves.filter(Boolean)).toHaveLength(3);
  });

  it('距离超过阈值则起始新轨迹', () => {
    const f0 = [linePath(0, 0, 5, 0)];
    const f1 = [linePath(100, 0, 105, 0)];
    const tracks = associateTracks([f0, f1], 10);
    expect(tracks).toHaveLength(2);
  });

  it('轨迹缺失帧补 null', () => {
    const f0 = [linePath(0, 0, 5, 0)];
    const f1: BezierPath[] = [];
    const f2 = [linePath(0, 0, 5, 0)];
    const tracks = associateTracks([f0, f1, f2], 10);
    expect(tracks).toHaveLength(1);
    expect(tracks[0].curves.map((c) => c !== null)).toEqual([true, false, true]);
  });
});

describe('smoothTrack', () => {
  it('平滑后每帧仍有曲线且首帧质心接近', () => {
    const track = {
      curves: [linePath(0, 0, 5, 0), linePath(1, 0, 6, 0), linePath(2, 0, 7, 0)],
    };
    const out = smoothTrack(track, { window: 3, order: 2, sampleN: 16 });
    expect(out).toHaveLength(3);
    expect(out.every((c) => c !== null)).toBe(true);
    // 首帧 p0.x 应接近 0
    expect(out[0]!.segments[0].p0.x).toBeCloseTo(0, 1);
  });

  it('缺失帧保持 null', () => {
    const track = {
      curves: [linePath(0, 0, 5, 0), null, linePath(4, 0, 9, 0)],
    };
    const out = smoothTrack(track, { window: 3, order: 2, sampleN: 16 });
    expect(out.map((c) => c !== null)).toEqual([true, false, true]);
  });
});

describe('samplePath', () => {
  it('返回指定数量采样点且首末接近', () => {
    const pts = samplePath(linePath(0, 0, 10, 0), 16);
    expect(pts).toHaveLength(16);
    expect(pts[0][0]).toBeCloseTo(0);
    // 末点应在最后一个采样步内逼近终点 10
    expect(pts[pts.length - 1][0]).toBeGreaterThan(9);
    expect(pts[pts.length - 1][0]).toBeLessThanOrEqual(10.001);
  });
});

describe('videoToCurves', () => {
  it('逐帧产出对齐的动画曲线集', () => {
    const seq: FrameSequence = {
      frames: [
        { imageData: solidImage(200), timestamp: 0, index: 0 },
        { imageData: solidImage(200), timestamp: 33, index: 1 },
        { imageData: solidImage(200), timestamp: 66, index: 2 },
      ],
      fps: 30,
      width: 8,
      height: 8,
    };
    const res = videoToCurves(seq, { stride: 1, maxFrames: 3 });
    expect(res.frameCount).toBe(3);
    expect(res.frames).toHaveLength(3);
    expect(res.fps).toBe(30);
    expect(res.trackCount).toBeGreaterThanOrEqual(0);
    // 每帧都是 BezierPath 数组
    for (const f of res.frames) expect(Array.isArray(f)).toBe(true);
  });

  it('stride 采样减少帧数', () => {
    const seq: FrameSequence = {
      frames: [
        { imageData: solidImage(200), timestamp: 0, index: 0 },
        { imageData: solidImage(200), timestamp: 1, index: 1 },
        { imageData: solidImage(200), timestamp: 2, index: 2 },
        { imageData: solidImage(200), timestamp: 3, index: 3 },
      ],
      fps: 10,
      width: 8,
      height: 8,
    };
    const res = videoToCurves(seq, { stride: 2, maxFrames: 10 });
    expect(res.frameCount).toBe(2);
  });

  it('空帧序列返回空结果', () => {
    const seq: FrameSequence = { frames: [], fps: 30, width: 8, height: 8 };
    const res = videoToCurves(seq);
    expect(res.frameCount).toBe(0);
    expect(res.frames).toHaveLength(0);
  });
});