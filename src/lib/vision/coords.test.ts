/**
 * P0-3：像素 → 数学坐标 变换唯一入口的单元测试。
 *
 * 验证统一约定 y' = H - 1 - y，并确认「curve-fit 已翻转为数学坐标后，
 * 渲染层以 flipY=false 透传不会二次翻转」——即不出现点颠倒。
 */
import { describe, it, expect } from 'vitest';
import {
  mapPixelY,
  mapPixelX,
  mapPixelPoint,
  segmentsToMathPoints,
  flattenPixels,
} from './coords';

describe('mapPixelY / mapPixelX', () => {
  it('flipY=true 时 y → H-1-y（像素顶 y=0 → 数学顶 y=H-1）', () => {
    expect(mapPixelY(0, 300, true)).toBe(299);
    expect(mapPixelY(299, 300, true)).toBe(0);
    expect(mapPixelY(150, 300, true)).toBe(149);
  });

  it('flipY=false 时不翻转（数据层已翻转为数学坐标，渲染层透传）', () => {
    expect(mapPixelY(299, 300, false)).toBe(299);
    expect(mapPixelY(0, 300, false)).toBe(0);
  });

  it('flipX=true 时 x → W-1-x', () => {
    expect(mapPixelX(0, 200, true)).toBe(199);
    expect(mapPixelX(199, 200, true)).toBe(0);
  });

  it('mapPixelPoint 组合 x/y', () => {
    expect(mapPixelPoint(10, 20, 100, 50, true, true)).toEqual([89, 29]);
    expect(mapPixelPoint(10, 20, 100, 50, false, false)).toEqual([10, 20]);
  });
});

describe('segmentsToMathPoints / flattenPixels', () => {
  it('lineTo 段：flipY=true 翻转，flipY=false 透传', () => {
    const segs: Parameters<typeof segmentsToMathPoints>[0] = [
      { cmd: 'lineTo', pts: [[0, 0], [10, 10]] },
    ];
    const flipped = segmentsToMathPoints(segs, 10, 10, false, true);
    expect(flipped[0]).toEqual([0, 9]);
    // 输入 y=10 超出像素有效范围 0..9，翻转后为 -1（公式 H-1-y 的数学结果）
    expect(flipped[flipped.length - 1]).toEqual([10, -1]);

    // curve-fit 已翻转为数学坐标，渲染层 flipY=false 透传 → 不出现二次颠倒
    const passthrough = segmentsToMathPoints(segs, 10, 10, false, false);
    expect(passthrough[0]).toEqual([0, 0]);
    expect(passthrough[flipped.length - 1]).toEqual([10, 10]);
  });

  it('Schneider 三次贝塞尔段正常展开', () => {
    const segs: Parameters<typeof flattenPixels>[0] = [
      { p0: { x: 0, y: 0 }, c1: { x: 5, y: 0 }, c2: { x: 5, y: 10 }, p1: { x: 10, y: 10 } },
    ];
    const pts = flattenPixels(segs);
    expect(pts.length).toBeGreaterThan(2);
    expect(pts[0]).toEqual([0, 0]);
    expect(pts[pts.length - 1]).toEqual([10, 10]);
  });

  it('cubicTo 段：起点补齐后展开', () => {
    const segs: Parameters<typeof segmentsToMathPoints>[0] = [
      { cmd: 'moveTo', pts: [[1, 1]] },
      { cmd: 'cubicTo', pts: [[2, 1], [3, 4], [4, 4]] },
    ];
    const pts = segmentsToMathPoints(segs, 5, 5, false, true);
    expect(pts[0]).toEqual([1, 3]);
    expect(pts[pts.length - 1]).toEqual([4, 0]);
  });
});