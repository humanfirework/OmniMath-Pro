/**
 * visionWorkerClient tests — verifies the worker facade falls back to the
 * in-thread implementation when `Worker` is unavailable (SSR / jsdom), and
 * that the new `videoToCurves` op returns a well-formed result.
 */
import { describe, it, expect } from 'vitest';
import { visionWorkerClient } from '../visionWorkerClient';
import { videoToCurves } from '../videoToCurves';
import type { FrameSequence } from '../video';

/** 迷你帧序列：2 帧、3×3 二值图案，用于验证矢量化产出一条以上曲线。 */
function makeTinyFrames(): FrameSequence {
  const w = 8;
  const h = 8;
  const mk = () => {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        // 黑色背景，中间一个白色方块（高对比，便于 marching squares 抓到轮廓）
        const on = x >= 2 && x <= 5 && y >= 2 && y <= 5;
        const v = on ? 255 : 0;
        const i = (y * w + x) * 4;
        data[i] = v;
        data[i + 1] = v;
        data[i + 2] = v;
        data[i + 3] = 255;
      }
    }
    return { data, width: w, height: h };
  };
  return { frames: [{ imageData: mk(), timestamp: 0, index: 0 }, { imageData: mk(), timestamp: 100, index: 1 }], fps: 10, width: w, height: h };
}

describe('visionWorkerClient.videoToCurves (in-thread fallback)', () => {
  it('返回结构化的视频→曲线结果（frames/fps/frameCount/trackCount）', async () => {
    const seq = makeTinyFrames();
    const res = await visionWorkerClient.videoToCurves(seq, { maxFrames: 120 });
    expect(res).toBeDefined();
    expect(res.frames).toBeInstanceOf(Array);
    expect(res.frames.length).toBeGreaterThan(0);
    expect(res.frameCount).toBe(res.frames.length);
    expect(res.fps).toBeGreaterThan(0);
    expect(res.width).toBe(seq.width);
    expect(res.height).toBe(seq.height);
    // 高对比方块应至少产出一条闭合轮廓曲线
    const curves = res.frames[0].filter(Boolean);
    expect(curves.length).toBeGreaterThan(0);
  });

  it('与同步 videoToCurves 结果一致（同一输入）', async () => {
    const seq = makeTinyFrames();
    const opts = { maxFrames: 120, smooth: true };
    const viaClient = await visionWorkerClient.videoToCurves(seq, opts);
    const direct = videoToCurves(seq, opts);
    expect(viaClient.frames.length).toBe(direct.frames.length);
    expect(viaClient.trackCount).toBe(direct.trackCount);
  });
});