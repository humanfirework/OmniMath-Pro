/**
 * Vision nodes — 蓝图视觉节点（静态图像工作流）行为测试。
 *
 * 覆盖 6 个视觉节点的 execute 返回值与边界条件：
 *   - image-input（async）
 *   - grayscale-threshold
 *   - edge-detect
 *   - contour-trace
 *   - curve-fit
 *   - plot-curves
 *
 * 合成图像直接以 ImageValue 形状构造（绕过 image-input 的浏览器解码），
 * 喂给下游节点的 image / contours / curves 端口。
 */

import { describe, it, expect } from 'vitest';
import { NODE_TYPES, type NodeType, type PipelineContext } from '../pipelineEngine';
import type { ImageValue } from './vision';
import { flipYBezierPaths } from './vision';

const CTX: PipelineContext = { variables: {} };

/** 调用节点 execute，自动 await 异步结果。 */
async function run(
  type: NodeType,
  inputs: Record<string, unknown> = {},
  config: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const def = NODE_TYPES[type];
  if (!def) throw new Error(`unknown node type: ${type}`);
  return await def.execute(inputs, config, CTX);
}

/* ------------------------------------------------------------------ *
 * 合成图像构造器
 * ------------------------------------------------------------------ */

/** 构造 RGBA 图像：pixels 为 [r,g,b,a, r,g,b,a, ...]，长度 = w*h*4。 */
function rgbaImage(
  pixels: number[],
  w: number,
  h: number,
  src?: string,
): ImageValue {
  return {
    data: new Uint8ClampedArray(pixels),
    width: w,
    height: h,
    channels: 4,
    binary: false,
    src,
  };
}

/** 构造二值图像：fg 为 0/1 数组，长度 = w*h。 */
function binaryImage(fg: number[], w: number, h: number): ImageValue {
  return {
    data: new Uint8Array(fg),
    width: w,
    height: h,
    channels: 1,
    binary: true,
  };
}

/** 黑色像素 RGBA。 */
const BLACK = [0, 0, 0, 255];
/** 白色像素 RGBA。 */
const WHITE = [255, 255, 255, 255];

/* ------------------------------------------------------------------ *
 * image-input
 * ------------------------------------------------------------------ */
describe('vision: image-input', () => {
  it('空 src → 返回空图像（width=0, height=0）', async () => {
    const out = await run('image-input', {}, { src: '' });
    const img = out.image as ImageValue;
    expect(img.width).toBe(0);
    expect(img.height).toBe(0);
    expect(img.channels).toBe(4);
  });

  it('无 src 配置 → 同样返回空图像', async () => {
    const out = await run('image-input', {}, {});
    const img = out.image as ImageValue;
    expect(img.width).toBe(0);
    expect(img.height).toBe(0);
  });

  it('jsdom 无 OffscreenCanvas → 非 data URL src 返回空数据但保留 src 引用', async () => {
    // jsdom 环境通常没有 OffscreenCanvas / createImageBitmap，
    // image-input 会走 fallback 分支：返回空数据 + 保留 src。
    const src = 'data:image/png;base64,invalid';
    const hasOffscreen = typeof OffscreenCanvas !== 'undefined';
    const out = await run('image-input', {}, { src });
    const img = out.image as ImageValue;
    if (!hasOffscreen) {
      expect(img.width).toBe(0);
      expect(img.height).toBe(0);
      expect(img.src).toBe(src);
    } else {
      // 真实浏览器环境：解码失败会抛错（invalid data URL）
      // 此分支在 jsdom 下不会命中。
    }
  });
});

/* ------------------------------------------------------------------ *
 * grayscale-threshold
 * ------------------------------------------------------------------ */
describe('vision: grayscale-threshold', () => {
  it('simple 阈值：2×2 黑块 + 白底 → 4 个前景像素', async () => {
    // 4x4 RGBA：左上 2x2 黑，其余白
    const px: number[] = [];
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        px.push(...(r < 2 && c < 2 ? BLACK : WHITE));
      }
    }
    const out = await run(
      'grayscale-threshold',
      { image: rgbaImage(px, 4, 4) },
      { method: 'simple', threshold: 128 },
    );
    const bin = out.binary as ImageValue;
    expect(bin.width).toBe(4);
    expect(bin.height).toBe(4);
    expect(bin.binary).toBe(true);
    expect(bin.channels).toBe(1);
    const data = bin.data as Uint8Array;
    // 黑像素 (gray=0 < 128) → 1；白像素 (gray=255 >= 128) → 0
    let fg = 0;
    for (let i = 0; i < data.length; i++) if (data[i] === 1) fg++;
    expect(fg).toBe(4);
  });

  it('已是二值图 → 直接透传（数据不变）', async () => {
    const binIn = binaryImage([1, 0, 1, 0], 2, 2);
    const out = await run('grayscale-threshold', { image: binIn }, { method: 'simple' });
    const bin = out.binary as ImageValue;
    // toImageValue 会重建对象（补 src:undefined），但二值数据与尺寸应原样透传
    expect(bin.binary).toBe(true);
    expect(bin.channels).toBe(1);
    expect(bin.width).toBe(2);
    expect(bin.height).toBe(2);
    expect(Array.from(bin.data as Uint8Array)).toEqual([1, 0, 1, 0]);
  });

  it('空图像 → 抛错', async () => {
    const empty = rgbaImage([], 0, 0);
    await expect(
      run('grayscale-threshold', { image: empty }, { method: 'simple' }),
    ).rejects.toThrow();
  });

  it('multi 多阈值分层：黑块仍为前景', async () => {
    const px: number[] = [];
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        px.push(...(r < 2 && c < 2 ? BLACK : WHITE));
      }
    }
    const out = await run(
      'grayscale-threshold',
      { image: rgbaImage(px, 4, 4) },
      { method: 'multi', levels: 4 },
    );
    const bin = out.binary as ImageValue;
    expect(bin.binary).toBe(true);
    const data = bin.data as Uint8Array;
    let fg = 0;
    for (let i = 0; i < data.length; i++) if (data[i] === 1) fg++;
    // 黑块 4 像素为前景；白块为最亮层（背景）
    expect(fg).toBe(4);
  });
});

/* ------------------------------------------------------------------ *
 * edge-detect
 * ------------------------------------------------------------------ */
describe('vision: edge-detect', () => {
  it('sobel：左黑右白的竖直边 → 至少 1 个边缘像素', async () => {
    // 4x4：左两列黑，右两列白 → 第 1/2 列交界处有强梯度
    const px: number[] = [];
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        px.push(...(c < 2 ? BLACK : WHITE));
      }
    }
    const out = await run(
      'edge-detect',
      { image: rgbaImage(px, 4, 4) },
      { method: 'sobel', lowThreshold: 30 },
    );
    const edges = out.edges as ImageValue;
    expect(edges.binary).toBe(true);
    expect(edges.width).toBe(4);
    const data = edges.data as Uint8Array;
    let edgeCount = 0;
    for (let i = 0; i < data.length; i++) if (data[i] === 1) edgeCount++;
    expect(edgeCount).toBeGreaterThan(0);
  });

  it('canny：左黑右白 → 产出二值边缘图', async () => {
    const px: number[] = [];
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        px.push(...(c < 2 ? BLACK : WHITE));
      }
    }
    const out = await run(
      'edge-detect',
      { image: rgbaImage(px, 4, 4) },
      { method: 'canny', lowThreshold: 30, highThreshold: 80 },
    );
    const edges = out.edges as ImageValue;
    expect(edges.binary).toBe(true);
    expect(edges.channels).toBe(1);
  });

  it('空图像 → 抛错', async () => {
    await expect(
      run('edge-detect', { image: rgbaImage([], 0, 0) }, { method: 'sobel' }),
    ).rejects.toThrow();
  });
});

/* ------------------------------------------------------------------ *
 * contour-trace
 * ------------------------------------------------------------------ */
describe('vision: contour-trace', () => {
  it('5×5 二值图含 3×3 实心块 → 至少 1 条轮廓', async () => {
    // 5x5 全 0，中心 3x3 为 1
    const fg = new Array(25).fill(0);
    for (let r = 1; r <= 3; r++) {
      for (let c = 1; c <= 3; c++) {
        fg[r * 5 + c] = 1;
      }
    }
    const out = await run(
      'contour-trace',
      { image: binaryImage(fg, 5, 5) },
      { turdsize: 0 },
    );
    const contours = out.contours as { polylines: unknown[]; width: number; height: number };
    expect(contours.width).toBe(5);
    expect(contours.height).toBe(5);
    expect(contours.polylines.length).toBeGreaterThanOrEqual(1);
  });

  it('全背景（全 0）→ 0 条轮廓', async () => {
    const fg = new Array(25).fill(0);
    const out = await run(
      'contour-trace',
      { image: binaryImage(fg, 5, 5) },
      { turdsize: 0 },
    );
    const contours = out.contours as { polylines: unknown[] };
    expect(contours.polylines.length).toBe(0);
  });

  it('空图像 → 抛错', async () => {
    await expect(
      run('contour-trace', { image: binaryImage([], 0, 0) }, { turdsize: 2 }),
    ).rejects.toThrow();
  });

  it('skeletonize=true：3px 宽横线 → 骨架折线路径产出非空 polylines', async () => {
    // 40×20 二值图：y∈[9,12) × x∈[5,35) 的 3px 宽横线。
    // skeletonize=true 应走 zhangSuenThin → skeletonToPolylines（中心线提取），
    // 与 traceContours 路径输出同一 ContoursValue 结构 { polylines, width, height }。
    const w = 40;
    const h = 20;
    const fg = new Array(w * h).fill(0);
    for (let y = 9; y < 12; y++) {
      for (let x = 5; x < 35; x++) fg[y * w + x] = 1;
    }
    const out = await run(
      'contour-trace',
      { image: binaryImage(fg, w, h) },
      { turdsize: 2, skeletonize: true },
    );
    const contours = out.contours as {
      polylines: { points: { x: number; y: number }[]; closed: boolean }[];
      width: number;
      height: number;
    };
    expect(contours.width).toBe(w);
    expect(contours.height).toBe(h);
    // 骨架折线非空
    expect(contours.polylines.length).toBeGreaterThanOrEqual(1);
    expect(contours.polylines[0].points.length).toBeGreaterThanOrEqual(2);
    // 骨架点是中心线而非轮廓环：所有骨架点 y 坐标应落在横线带内（9~11）
    for (const poly of contours.polylines) {
      for (const p of poly.points) {
        expect(p.y).toBeGreaterThanOrEqual(8);
        expect(p.y).toBeLessThanOrEqual(12);
      }
    }
  });

  it('skeletonize=false（默认）：实心块走轮廓追踪路径', async () => {
    // 对照：同一输入在 skeletonize=false 时走 traceContours，产出闭合轮廓
    const fg = new Array(25).fill(0);
    for (let r = 1; r <= 3; r++) {
      for (let c = 1; c <= 3; c++) {
        fg[r * 5 + c] = 1;
      }
    }
    const out = await run(
      'contour-trace',
      { image: binaryImage(fg, 5, 5) },
      { turdsize: 0, skeletonize: false },
    );
    const contours = out.contours as { polylines: { closed: boolean }[] };
    expect(contours.polylines.length).toBeGreaterThanOrEqual(1);
    expect(contours.polylines.some((p) => p.closed)).toBe(true);
  });
});

/* ------------------------------------------------------------------ *
 * curve-fit
 * ------------------------------------------------------------------ */
describe('vision: curve-fit', () => {
  it('闭合正方形折线 → bezier 模式产出 BezierPath（segments 非空）', async () => {
    // 单位正方形轮廓（闭合）
    const square = {
      polylines: [
        {
          points: [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 10, y: 10 },
            { x: 0, y: 10 },
          ],
          closed: true,
        },
      ],
      width: 10,
      height: 10,
    };
    const out = await run(
      'curve-fit',
      { contours: square },
      { fitMode: 'bezier', errorThreshold: 1.0, cornerThreshold: 1.0, fourierOrder: 50 },
    );
    const curves = out.curves as { curves: Array<{ segments: unknown[] }>; width: number; height: number };
    expect(curves.curves.length).toBeGreaterThanOrEqual(1);
    expect(curves.curves[0].segments.length).toBeGreaterThan(0);
  });

  it('输入已是 BezierPath[]（bezier 模式）→ 执行 Y 翻转并附带 meta 标记', async () => {
    const existing = [
      {
        segments: [
          {
            p0: { x: 0, y: 0 },
            c1: { x: 1, y: 0 },
            c2: { x: 1, y: 1 },
            p1: { x: 1, y: 1 },
          },
        ],
        closed: false,
      },
    ];
    const W = 2;
    const H = 2;
    const out = await run(
      'curve-fit',
      { contours: { curves: existing, width: W, height: H } },
      { fitMode: 'bezier', errorThreshold: 1.0, cornerThreshold: 1.0, fourierOrder: 50 },
    );
    const curves = out.curves as {
      curves: Array<{ segments: Array<{ p0: { x: number; y: number }; c1: { x: number; y: number }; c2: { x: number; y: number }; p1: { x: number; y: number } }> }>;
      width: number;
      height: number;
      meta?: { imageHeight?: number; flippedY?: boolean };
    };
    // 不再是引用透传（Y 翻转会深拷贝）
    expect(curves.curves).not.toBe(existing);
    expect(curves.curves.length).toBe(1);
    expect(curves.width).toBe(W);
    expect(curves.height).toBe(H);
    expect(curves.meta?.flippedY).toBe(true);
    expect(curves.meta?.imageHeight).toBe(H);
    // H=2 → y' = (H-1) - y = 1 - y
    const seg = curves.curves[0].segments[0];
    expect(seg.p0.y).toBeCloseTo(1 - 0, 9);
    expect(seg.c1.y).toBeCloseTo(1 - 0, 9);
    expect(seg.c2.y).toBeCloseTo(1 - 1, 9);
    expect(seg.p1.y).toBeCloseTo(1 - 1, 9);
    // X 坐标不变
    expect(seg.p0.x).toBe(0);
    expect(seg.c1.x).toBe(1);
    expect(seg.c2.x).toBe(1);
    expect(seg.p1.x).toBe(1);
  });

  it('fourier 模式对闭合折线产出曲线', async () => {
    const circle: { x: number; y: number }[] = [];
    const N = 32;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      circle.push({ x: 5 + 3 * Math.cos(a), y: 5 + 3 * Math.sin(a) });
    }
    const out = await run(
      'curve-fit',
      { contours: { polylines: [{ points: circle, closed: true }], width: 10, height: 10 } },
      { fitMode: 'fourier', errorThreshold: 1.0, cornerThreshold: 1.0, fourierOrder: 8 },
    );
    const curves = out.curves as { curves: Array<{ segments: unknown[] }> };
    expect(curves.curves.length).toBeGreaterThanOrEqual(1);
    expect(curves.curves[0].segments.length).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ *
 * plot-curves
 * ------------------------------------------------------------------ */
describe('vision: plot-curves', () => {
  it('透传曲线集并附带 color / strokeWidth', async () => {
    const existing = [
      {
        segments: [
          {
            p0: { x: 0, y: 0 },
            c1: { x: 1, y: 0 },
            c2: { x: 1, y: 1 },
            p1: { x: 1, y: 1 },
          },
        ],
        closed: false,
      },
    ];
    const out = await run(
      'plot-curves',
      { curves: { curves: existing, width: 2, height: 2 } },
      { color: '#ff0000', width: 3 },
    );
    const result = out.curves as {
      curves: unknown[];
      color: string;
      strokeWidth: number;
      width: number;
      height: number;
    };
    expect(result.curves).toBe(existing);
    expect(result.color).toBe('#ff0000');
    expect(result.strokeWidth).toBe(3);
    expect(result.width).toBe(2);
    expect(result.height).toBe(2);
  });

  it('默认 color / width 兜底', async () => {
    const out = await run(
      'plot-curves',
      { curves: { curves: [], width: 0, height: 0 } },
      {},
    );
    const result = out.curves as { color: string; strokeWidth: number };
    expect(result.color).toBe('#a78bfa');
    expect(result.strokeWidth).toBe(2);
  });
});

/* ------------------------------------------------------------------ *
 * Y flip for vision curves
 * ------------------------------------------------------------------ */
describe('Y flip for vision curves', () => {
  it('TR-1.1: 单段 Bezier 控制点 Y 轴翻转（H=300）', () => {
    const seg = {
      p0: { x: 10, y: 0 },
      c1: { x: 20, y: 100 },
      c2: { x: 30, y: 200 },
      p1: { x: 40, y: 299 },
    };
    const H = 300;
    const input = [{ segments: [seg], closed: false }];
    const flipped = flipYBezierPaths(input, H);

    expect(flipped).toHaveLength(1);
    const fSeg = flipped[0].segments[0];
    const EPS = 1e-9;

    expect(Math.abs(fSeg.p0.y - 299)).toBeLessThanOrEqual(EPS);
    expect(Math.abs(fSeg.c1.y - 199)).toBeLessThanOrEqual(EPS);
    expect(Math.abs(fSeg.c2.y - 99)).toBeLessThanOrEqual(EPS);
    expect(Math.abs(fSeg.p1.y - 0)).toBeLessThanOrEqual(EPS);

    expect(fSeg.p0.x).toBe(10);
    expect(fSeg.c1.x).toBe(20);
    expect(fSeg.c2.x).toBe(30);
    expect(fSeg.p1.x).toBe(40);
  });

  it('空 segments 路径不修改', () => {
    const input = [{ segments: [], closed: true }];
    const flipped = flipYBezierPaths(input, 100);
    expect(flipped[0].segments).toHaveLength(0);
  });

  it('空数组输入返回空数组', () => {
    expect(flipYBezierPaths([], 100)).toEqual([]);
  });

  it('curve-fit bezier 透传路径：输出携带 meta.flippedY=true 且控制点翻转', async () => {
    const existing = [
      {
        segments: [
          {
            p0: { x: 0, y: 0 },
            c1: { x: 1, y: 1 },
            c2: { x: 2, y: 1 },
            p1: { x: 3, y: 0 },
          },
        ],
        closed: false,
      },
    ];
    const W = 4;
    const H = 3;
    const out = await run(
      'curve-fit',
      { contours: { curves: existing, width: W, height: H } },
      { fitMode: 'bezier', errorThreshold: 1.0, cornerThreshold: 1.0, fourierOrder: 50 },
    );
    const curves = out.curves as {
      curves: Array<{ segments: Array<{ p0: { x: number; y: number }; p1: { x: number; y: number } }> }>;
      width: number;
      height: number;
      meta?: { imageHeight?: number; flippedY?: boolean };
    };

    expect(curves.width).toBe(W);
    expect(curves.height).toBe(H);
    expect(curves.meta?.flippedY).toBe(true);
    expect(curves.meta?.imageHeight).toBe(H);

    const seg = curves.curves[0].segments[0];
    const h = H - 1;
    expect(seg.p0.y).toBeCloseTo(h - 0, 9);
    expect(seg.p1.y).toBeCloseTo(h - 0, 9);
  });
});
