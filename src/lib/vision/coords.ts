/**
 * 像素 → 数学坐标 变换的唯一入口（P0-3：Y 翻转收敛）。
 *
 * 统一约定：图像像素坐标 y ∈ [0, H-1]（y=0 在顶），转换为标准数学坐标
 * y' ∈ [0, H-1]（y'=0 在底，向上增大）。翻转公式： y' = H - 1 - y。
 *
 * 全链路（curve-fit 数据层 / runResult 渲染层 / Plot2D 画布）必须共用本文件，
 * 避免「数据层翻一次、渲染层又翻一次」导致的点颠倒（double flip）。
 */

import type { BezierSegmentData } from '@/components/workbench/plots/Plot2DCanvas';

/** 像素 y → 数学 y。flipY 为 false 时原样返回。 */
export function mapPixelY(py: number, H: number, flipY?: boolean): number {
  return flipY ? H - 1 - py : py;
}

/** 像素 x → 数学 x。flipX 为 false 时原样返回。 */
export function mapPixelX(px: number, W: number, flipX?: boolean): number {
  return flipX ? W - 1 - px : px;
}

/** 单个像素点 → 数学点。 */
export function mapPixelPoint(
  px: number,
  py: number,
  W: number,
  H: number,
  flipX?: boolean,
  flipY?: boolean,
): [number, number] {
  return [mapPixelX(px, W, flipX), mapPixelY(py, H, flipY)];
}

interface Xy { x: number; y: number }

/**
 * 把贝塞尔段集合展开为像素折线，再映射为数学坐标点集。
 * 这是「渲染层 / 自动视口」共用的单一入口：curve-fit 之后的数据已是数学坐标，
 * 应传 flipX/flipY=false；只有还处于像素空间的数据才传 true。
 */
export function segmentsToMathPoints(
  segments: BezierSegmentData[],
  W: number,
  H: number,
  flipX?: boolean,
  flipY?: boolean,
): Array<[number, number]> {
  const px = flattenPixels(segments);
  return px.map(([x, y]) => mapPixelPoint(x, y, W, H, flipX, flipY));
}

/** 把贝塞尔段展开为像素折线点集（与 runResultsStore/runResultRender 一致）。 */
export function flattenPixels(segments: BezierSegmentData[]): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let last: [number, number] | null = null;
  for (const seg of segments) {
    if ('cmd' in seg) {
      if (seg.cmd === 'moveTo' && seg.pts.length > 0) {
        out.push(seg.pts[0]);
        last = seg.pts[0];
      } else if (seg.cmd === 'lineTo') {
        for (const p of seg.pts) { out.push(p); last = p; }
      } else if (seg.cmd === 'quadTo' && seg.pts.length >= 2) {
        const [c, end] = seg.pts;
        if (last) out.push(...sampleQuad(last, c, end));
        else out.push(end);
        last = end;
      } else if (seg.cmd === 'cubicTo' && seg.pts.length >= 3) {
        const [c1, c2, end] = seg.pts;
        if (last) out.push(...sampleCubic(last, c1, c2, end));
        else out.push(end);
        last = end;
      }
    } else {
      // Schneider 三次贝塞尔段 { p0, c1, c2, p1 }：自带起点，始终完整采样。
      const p0 = toXY(seg.p0);
      const c1 = toXY(seg.c1);
      const c2 = toXY(seg.c2);
      const p1 = toXY(seg.p1);
      out.push(p0);
      out.push(...sampleCubic(p0, c1, c2, p1));
      last = p1;
    }
  }
  return out;
}

function toXY(p: Xy | [number, number]): [number, number] {
  return Array.isArray(p) ? [p[0], p[1]] : [p.x, p.y];
}

function sampleQuad(p0: [number, number], c: [number, number], p1: [number, number], steps = 8): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const mt = 1 - t;
    out.push([
      mt * mt * p0[0] + 2 * mt * t * c[0] + t * t * p1[0],
      mt * mt * p0[1] + 2 * mt * t * c[1] + t * t * p1[1],
    ]);
  }
  return out;
}

function sampleCubic(p0: [number, number], c1: [number, number], c2: [number, number], p1: [number, number], steps = 12): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const mt = 1 - t;
    const a = mt * mt * mt;
    const b = 3 * mt * mt * t;
    const c = 3 * mt * t * t;
    const d = t * t * t;
    out.push([
      a * p0[0] + b * c1[0] + c * c2[0] + d * p1[0],
      a * p0[1] + b * c1[1] + c * c2[1] + d * p1[1],
    ]);
  }
  return out;
}