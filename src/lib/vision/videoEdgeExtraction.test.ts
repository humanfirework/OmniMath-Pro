import { describe, it, expect } from 'vitest';
import { imageToCurves } from './index';
import type { ImageDataLike } from './types';
import { binaryMorphology } from './preprocess';

/** 合成一张「主体圆 + 浅背景」图，模拟视频帧（如动画角色 GIF）。 */
function makeSubjectImage(w = 200, h = 200): ImageDataLike {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x - w / 2;
      const dy = y - h / 2;
      const inCircle = dx * dx + dy * dy < (w / 4) * (w / 4);
      const v = inCircle ? 200 : 60; // 亮主体 / 暗背景
      const p = (y * w + x) * 4;
      data[p] = v; data[p + 1] = v; data[p + 2] = v; data[p + 3] = 255;
    }
  }
  return { data, width: w, height: h };
}

/** 复刻 vectorizeFrames 传给 imageToCurves 的视频配置。 */
function videoVisionConfig(opts: Record<string, unknown>) {
  return {
    useEdgeDetection: true,
    edgeMethod: 'canny' as const,
    useForegroundMask: true,
    fgMaskDilation: 2,
    cannyLow: 55,
    cannyHigh: 160,
    denoiseRadius: 1,
    turdsize: 4,
    errorThreshold: 1.8,
    cornerThreshold: 1.0,
    maxCurves: 24,
    ...opts,
  };
}

describe('video edge extraction regression', () => {
  it('边缘检测分支不再做 opening：denoiseRadius 不再摧毁 1px Canny 边缘，曲线必 > 0', () => {
    // 1) Canny 输出 1px 厚边缘
    const img = makeSubjectImage();
    // 2) 修复前：边缘分支会对 1px 边缘做 open(r=1)，把线整条腐蚀掉 → 0 曲线。
    //    修复后：边缘分支彻底移除 binaryMorphology，denoiseRadius 无论取值都能出曲线。
    const denoise1 = imageToCurves(img, videoVisionConfig({ denoiseRadius: 1 }));
    console.log('[denoise=1] curveCount =', denoise1.curves.length, '(修复后必 > 0)');
    // 3) denoiseRadius=0 同样出曲线
    const denoise0 = imageToCurves(img, videoVisionConfig({ denoiseRadius: 0 }));
    console.log('[denoise=0] curveCount =', denoise0.curves.length);
    expect(denoise1.curves.length).toBeGreaterThan(0);
    expect(denoise0.curves.length).toBeGreaterThan(0);
  });

  it('erode 对 1px 线的破坏性：open(r=1) 应保留线，但全方形成结构元会删掉', () => {
    // 单像素厚的水平线
    const w = 32, h = 8;
    const line = new Uint8Array(w * h);
    for (let x = 0; x < w; x++) line[3 * w + x] = 1;
    const opened = binaryMorphology(line, w, h, 'open', 1);
    const kept = opened.reduce((a, b) => a + b, 0);
    console.log('[line] open(r=1) 保留像素数 =', kept, '(应为 0 = 全被删除)');
    expect(kept).toBe(0);
  });
});