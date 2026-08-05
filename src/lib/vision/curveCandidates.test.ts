/**
 * curveCandidates — 曲线拟合「候选项」纯逻辑测试。
 *
 * 覆盖：
 *   - 预设档位定义（粗略/均衡/精细：误差阈值递减）
 *   - generateCurveFitCandidates：多档候选生成、档位顺序、曲线非空
 *   - refitCurveCandidate：自定义参数重拟合 + 像素→数学坐标变换
 *   - applyCurveTransforms：flipY / flipX / scale 纯函数
 */

import { describe, it, expect } from 'vitest';
import {
  CURVE_FIT_PRESETS,
  CURVE_FIT_PRESET_MAP,
  DEFAULT_CURVE_PRESET,
  generateCurveFitCandidates,
  refitCurveCandidate,
  applyCurveTransforms,
} from './curveCandidates';
import type { Polyline } from './types';

/** 一条平滑波折线（非闭合），用于拟合测试。 */
function wavePolyline(): Polyline {
  const pts: Array<{ x: number; y: number }> = [];
  for (let i = 0; i <= 40; i++) {
    const x = i * 0.5;
    pts.push({ x, y: Math.sin(x * 1.2) * 6 + Math.sin(x * 3.1) * 2 });
  }
  return { points: pts, closed: false };
}

describe('curveCandidates — 预设档位', () => {
  it('预设恰好包含 粗略/均衡/精细 三档', () => {
    expect(CURVE_FIT_PRESETS.map((p) => p.id)).toEqual(['loose', 'balanced', 'fine']);
  });

  it('误差阈值严格递减（精确度递增）：loose(2.5) > balanced(1.5) > fine(0.5)', () => {
    const eps = CURVE_FIT_PRESETS.map((p) => p.errorThreshold);
    expect(eps[0]).toBeGreaterThan(eps[1]);
    expect(eps[1]).toBeGreaterThan(eps[2]);
  });

  it('CURVE_FIT_PRESET_MAP 与 DEFAULT_CURVE_PRESET 一致', () => {
    expect(CURVE_FIT_PRESET_MAP.balanced.id).toBe('balanced');
    expect(DEFAULT_CURVE_PRESET).toBe('balanced');
  });
});

describe('generateCurveFitCandidates', () => {
  it('默认生成三档候选，档位顺序为 loose → balanced → fine', () => {
    const cands = generateCurveFitCandidates([wavePolyline()]);
    expect(cands.map((c) => c.id)).toEqual(['loose', 'balanced', 'fine']);
    expect(cands.map((c) => c.errorThreshold)).toEqual([2.5, 1.5, 0.5]);
  });

  it('每档候选都产生至少一条曲线，且曲线段非空', () => {
    const cands = generateCurveFitCandidates([wavePolyline()]);
    for (const c of cands) {
      expect(c.curves.length).toBeGreaterThanOrEqual(1);
      for (const bp of c.curves) {
        expect(bp.segments.length).toBeGreaterThan(0);
      }
    }
  });

  it('越精细的档位产生的曲线细分段数越多', () => {
    const cands = generateCurveFitCandidates([wavePolyline()]);
    const segCounts = cands.map((c) => c.curves[0].segments.length);
    // fine 的误差阈值最小，对同一波折线应产生更多贝塞尔段。
    expect(segCounts[2]).toBeGreaterThanOrEqual(segCounts[0]);
    expect(segCounts[2]).toBeGreaterThanOrEqual(segCounts[1]);
  });

  it('支持传入自定义档位子集', () => {
    const cands = generateCurveFitCandidates([wavePolyline()], ['loose', 'fine']);
    expect(cands.map((c) => c.id)).toEqual(['loose', 'fine']);
  });

  it('空折线数组 → 空候选', () => {
    expect(generateCurveFitCandidates([])).toEqual([]);
  });
});

describe('applyCurveTransforms', () => {
  const line = (): NonNullable<ReturnType<typeof generateCurveFitCandidates>>[number]['curves'] => [
    {
      segments: [
        {
          p0: { x: 0, y: 0 },
          c1: { x: 3, y: 0 },
          c2: { x: 6, y: 0 },
          p1: { x: 10, y: 10 },
        },
      ],
      closed: false,
    },
  ];

  it('flipY：y → (H-1) - y，x 不变', () => {
    const out = applyCurveTransforms(line(), { width: 10, height: 11, flipY: true });
    const seg = out[0].segments[0];
    expect(seg.p0.y).toBeCloseTo(10 - 0, 9);
    expect(seg.p1.y).toBeCloseTo(10 - 10, 9);
    expect(seg.p0.x).toBe(0);
    expect(seg.p1.x).toBe(10);
  });

  it('flipX：x → (W-1) - x，y 不变', () => {
    const out = applyCurveTransforms(line(), { width: 11, height: 10, flipX: true });
    const seg = out[0].segments[0];
    expect(seg.p0.x).toBeCloseTo(10 - 0, 9);
    expect(seg.p1.x).toBeCloseTo(10 - 10, 9);
    expect(seg.p0.y).toBe(0);
    expect(seg.p1.y).toBe(10);
  });

  it('scale：所有控制点等比缩放', () => {
    const out = applyCurveTransforms(line(), { width: 10, height: 10, scale: 2 });
    const seg = out[0].segments[0];
    expect(seg.p1.x).toBeCloseTo(20, 9);
    expect(seg.p1.y).toBeCloseTo(20, 9);
  });

  it('不修改输入（纯函数）', () => {
    const input = line();
    applyCurveTransforms(input, { width: 10, height: 10, flipY: true });
    expect(input[0].segments[0].p0.y).toBe(0);
  });
});

describe('refitCurveCandidate', () => {
  it('自定义参数重拟合折线，并应用 flipY 变换', () => {
    // 两点直线：拟合后 p0=(0,0) → p1=(10,10)，flipY 后 y' = (H-1) - y。
    const poly: Polyline = {
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 10 },
      ],
      closed: false,
    };
    const result = refitCurveCandidate([poly], {
      errorThreshold: 1,
      cornerThreshold: 1,
      width: 10,
      height: 10,
      flipY: true,
    });
    expect(result.id).toBe('balanced');
    expect(result.labelZh).toBe('自定义');
    expect(result.curves.length).toBe(1);
    const seg = result.curves[0].segments[0];
    expect(seg.p0.y).toBeCloseTo(9 - 0, 6);
    expect(seg.p1.y).toBeCloseTo(9 - 10, 6);
  });

  it('误差阈值越小，拟合段数越多', () => {
    const poly = wavePolyline();
    const coarse = refitCurveCandidate([poly], { errorThreshold: 2.5, cornerThreshold: 0.8, width: 20, height: 20 });
    const fine = refitCurveCandidate([poly], { errorThreshold: 0.3, cornerThreshold: 0.2, width: 20, height: 20 });
    expect(fine.curves[0].segments.length).toBeGreaterThanOrEqual(coarse.curves[0].segments.length);
  });
});