/**
 * Curve category node definitions — 参数曲线生成与变换。
 *
 * curve 数据格式：{ points: Array<{x: number, y: number}>, closed?: boolean }
 * curves 数据格式：Array<curve>（曲线集合）。
 *
 * 端口类型使用 'curve' / 'curves'（已在 PortDataType 中声明）。
 */

import { math, getEvalScope } from '@/lib/engine/mathInstance';
import type { NodeTypeDef } from '../pipelineEngine';
import { toNumber } from './helpers';

/** 曲线点。 */
interface Point {
  x: number;
  y: number;
}

/** 曲线。 */
interface Curve {
  points: Point[];
  closed?: boolean;
}

/** 从任意输入安全解析为 Curve；容错处理缺省 points。 */
function toCurve(v: unknown): Curve {
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const raw = o.points;
    if (Array.isArray(raw)) {
      const points: Point[] = raw.map((p) => {
        if (p && typeof p === 'object') {
          const pt = p as Record<string, unknown>;
          return { x: toNumber(pt.x), y: toNumber(pt.y) };
        }
        return { x: toNumber(p), y: 0 };
      });
      return { points, closed: Boolean(o.closed) };
    }
  }
  return { points: [], closed: false };
}

/** 计算折线总长（相邻点欧氏距离之和）。 */
function polylineLength(points: Point[]): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    len += Math.hypot(dx, dy);
  }
  return len;
}

export const curveNodes = {
  'parametric-curve': {
    type: 'parametric-curve',
    category: 'curve',
    labelKey: 'npParametricCurve',
    icon: 'Spline',
    color: 'violet',
    inputs: [
      { id: 'xExpr', labelKey: 'npPortXExpr', type: 'expression' },
      { id: 'yExpr', labelKey: 'npPortYExpr', type: 'expression' },
      { id: 'tMin', labelKey: 'npPortTMin', type: 'number' },
      { id: 'tMax', labelKey: 'npPortTMax', type: 'number' },
    ],
    outputs: [{ id: 'curve', labelKey: 'npPortCurve', type: 'curve' }],
    defaultConfig: { samples: 100 },
    execute: (inputs, config) => {
      const xExpr = String(inputs.xExpr ?? 't');
      const yExpr = String(inputs.yExpr ?? 't');
      const tMin = toNumber(inputs.tMin);
      const tMax = toNumber(inputs.tMax);
      const samples = Math.max(2, Math.floor(Number(config.samples ?? 100)));
      const points: Point[] = [];
      for (let i = 0; i < samples; i++) {
        const t = tMin + ((tMax - tMin) * i) / (samples - 1);
        let x = NaN;
        let y = NaN;
        try {
          x = Number(math.evaluate(xExpr, getEvalScope({ t })));
        } catch {
          x = NaN;
        }
        try {
          y = Number(math.evaluate(yExpr, getEvalScope({ t })));
        } catch {
          y = NaN;
        }
        points.push({ x: Number.isFinite(x) ? x : 0, y: Number.isFinite(y) ? y : 0 });
      }
      return { curve: { points, closed: false } };
    },
  },

  'curve-resample': {
    type: 'curve-resample',
    category: 'curve',
    labelKey: 'npCurveResample',
    icon: 'Waves',
    color: 'violet',
    inputs: [{ id: 'curve', labelKey: 'npPortCurve', type: 'curve' }],
    outputs: [{ id: 'curve', labelKey: 'npPortCurve', type: 'curve' }],
    defaultConfig: { samples: 100 },
    execute: (inputs, config) => {
      const curve = toCurve(inputs.curve);
      const pts = curve.points;
      const samples = Math.max(2, Math.floor(Number(config.samples ?? 100)));
      if (pts.length < 2) {
        return { curve: { points: pts, closed: curve.closed } };
      }
      // 等弧长重采样：先算累积弧长，再在等间距处插值。
      const cum: number[] = [0];
      for (let i = 1; i < pts.length; i++) {
        cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
      }
      const total = cum[cum.length - 1];
      const out: Point[] = [];
      if (total === 0) {
        // 退化：所有点重合，直接复制首点。
        for (let i = 0; i < samples; i++) out.push({ ...pts[0] });
        return { curve: { points: out, closed: curve.closed } };
      }
      let seg = 1;
      for (let i = 0; i < samples; i++) {
        const target = (total * i) / (samples - 1);
        while (seg < cum.length - 1 && cum[seg] < target) seg++;
        const segStart = cum[seg - 1];
        const segEnd = cum[seg];
        const segLen = segEnd - segStart;
        const u = segLen === 0 ? 0 : (target - segStart) / segLen;
        out.push({
          x: pts[seg - 1].x + (pts[seg].x - pts[seg - 1].x) * u,
          y: pts[seg - 1].y + (pts[seg].y - pts[seg - 1].y) * u,
        });
      }
      return { curve: { points: out, closed: curve.closed } };
    },
  },

  'curve-transform': {
    type: 'curve-transform',
    category: 'curve',
    labelKey: 'npCurveTransform',
    icon: 'Move',
    color: 'violet',
    inputs: [{ id: 'curve', labelKey: 'npPortCurve', type: 'curve' }],
    outputs: [{ id: 'curve', labelKey: 'npPortCurve', type: 'curve' }],
    defaultConfig: { dx: 0, dy: 0, scale: 1, rotation: 0 },
    execute: (inputs, config) => {
      const curve = toCurve(inputs.curve);
      const dx = Number(config.dx ?? 0);
      const dy = Number(config.dy ?? 0);
      const scale = Number(config.scale ?? 1);
      const rotation = Number(config.rotation ?? 0); // 弧度
      const cos = Math.cos(rotation);
      const sin = Math.sin(rotation);
      const points: Point[] = curve.points.map((p) => {
        const sx = p.x * scale;
        const sy = p.y * scale;
        return {
          x: sx * cos - sy * sin + dx,
          y: sx * sin + sy * cos + dy,
        };
      });
      return { curve: { points, closed: curve.closed } };
    },
  },

  'curve-merge': {
    type: 'curve-merge',
    category: 'curve',
    labelKey: 'npCurveMerge',
    icon: 'Merge',
    color: 'violet',
    inputs: [
      { id: 'a', labelKey: 'npPortA', type: 'curve' },
      { id: 'b', labelKey: 'npPortB', type: 'curve' },
    ],
    outputs: [{ id: 'curves', labelKey: 'npPortCurves', type: 'curves' }],
    defaultConfig: {},
    execute: (inputs) => {
      const a = toCurve(inputs.a);
      const b = toCurve(inputs.b);
      return { curves: [a, b] };
    },
  },

  'curve-length': {
    type: 'curve-length',
    category: 'curve',
    labelKey: 'npCurveLength',
    icon: 'Ruler',
    color: 'violet',
    inputs: [{ id: 'curve', labelKey: 'npPortCurve', type: 'curve' }],
    outputs: [{ id: 'result', labelKey: 'npPortResult', type: 'number' }],
    defaultConfig: {},
    execute: (inputs) => {
      const curve = toCurve(inputs.curve);
      return { result: polylineLength(curve.points) };
    },
  },
} satisfies Record<string, NodeTypeDef>;
