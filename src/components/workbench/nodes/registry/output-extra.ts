/**
 * Output-extra category node definitions — 额外输出节点。
 *
 * svg-export 把曲线集（curves）序列化为 SVG <path> 字符串，
 * 便于导出矢量图。
 */

import type { NodeTypeDef } from '../pipelineEngine';
import { toNumber } from './helpers';

/** 从任意输入解析为曲线集合 Array<{ points: {x,y}[], closed? }>。 */
function toCurves(v: unknown): Array<{ points: Array<{ x: number; y: number }>; closed?: boolean }> {
  if (Array.isArray(v)) {
    return v.map((c) => {
      if (c && typeof c === 'object') {
        const o = c as Record<string, unknown>;
        const raw = o.points;
        if (Array.isArray(raw)) {
          return {
            points: raw.map((p) => {
              if (p && typeof p === 'object') {
                const pt = p as Record<string, unknown>;
                return { x: toNumber(pt.x), y: toNumber(pt.y) };
              }
              return { x: toNumber(p), y: 0 };
            }),
            closed: Boolean(o.closed),
          };
        }
      }
      return { points: [], closed: false };
    });
  }
  // 单条 curve 自动包成集合。
  if (v && typeof v === 'object' && Array.isArray((v as Record<string, unknown>).points)) {
    return toCurves([v]);
  }
  return [];
}

export const outputExtraNodes = {
  'svg-export': {
    type: 'svg-export',
    category: 'output',
    labelKey: 'npSvgExport',
    icon: 'FileImage',
    color: 'cyan',
    inputs: [{ id: 'curves', labelKey: 'npPortCurves', type: 'curves' }],
    outputs: [{ id: 'result', labelKey: 'npPortResult', type: 'any' }],
    defaultConfig: { width: 200, height: 200 },
    execute: (inputs, config) => {
      const curves = toCurves(inputs.curves);
      const width = Number(config.width ?? 200);
      const height = Number(config.height ?? 200);
      if (curves.length === 0) {
        return { result: `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"></svg>` };
      }
      // 计算包围盒以归一化到 viewBox。
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const c of curves) {
        for (const p of c.points) {
          if (p.x < minX) minX = p.x;
          if (p.y < minY) minY = p.y;
          if (p.x > maxX) maxX = p.x;
          if (p.y > maxY) maxY = p.y;
        }
      }
      const bw = maxX - minX || 1;
      const bh = maxY - minY || 1;
      const pad = 4;
      const innerW = width - pad * 2;
      const innerH = height - pad * 2;
      const project = (p: { x: number; y: number }) => {
        const x = pad + ((p.x - minX) / bw) * innerW;
        // SVG y 轴向下，翻转 y。
        const y = pad + ((p.y - minY) / bh) * innerH;
        return `${x.toFixed(2)},${y.toFixed(2)}`;
      };
      const paths = curves
        .map((c) => {
          if (c.points.length === 0) return '';
          const d = c.points
            .map((p, i) => `${i === 0 ? 'M' : 'L'} ${project(p)}`)
            .join(' ');
          return `  <path d="${d}${c.closed ? ' Z' : ''}" fill="none" stroke="currentColor" stroke-width="1.5" />`;
        })
        .filter((s) => s.length > 0);
      const svg =
        `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">\n` +
        paths.join('\n') +
        `\n</svg>`;
      return { result: svg };
    },
  },
} satisfies Record<string, NodeTypeDef>;
