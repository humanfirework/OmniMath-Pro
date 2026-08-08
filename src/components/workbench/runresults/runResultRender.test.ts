import { describe, it, expect, vi } from 'vitest';
import {
  screenToWorld,
  worldToScreen,
  autoFitView,
  panView,
  zoomView,
  curveToWorldPoints,
  niceStep,
  renderPanel,
} from './runResultRender';
import type { RunResultPanel } from '@/lib/store/runResultsStore';

const size = { w: 200, h: 100 };
const view = { xMin: 0, xMax: 10, yMin: 0, yMax: 5 };

describe('坐标变换', () => {
  it('worldToScreen 与 screenToWorld 互逆', () => {
    const s = worldToScreen(3, 2, size, view);
    expect(s.x).toBeCloseTo(60);
    expect(s.y).toBeCloseTo(60);
    const w = screenToWorld(s.x, s.y, size, view);
    expect(w.x).toBeCloseTo(3);
    expect(w.y).toBeCloseTo(2);
  });
});

describe('autoFitView', () => {
  const panel: RunResultPanel = {
    id: 'p',
    title: 't',
    kind: 'plot',
    curves: [{ id: 'c', color: '#fff', width: 2, points: [[0, 0], [10, 20]] }],
    createdAt: 0,
  };
  it('按数据包围盒 + 8% 边距', () => {
    const v = autoFitView(panel);
    expect(v).not.toBeNull();
    expect(v!.xMin).toBeCloseTo(-0.8);
    expect(v!.xMax).toBeCloseTo(10.8);
    expect(v!.yMin).toBeCloseTo(-1.6);
    expect(v!.yMax).toBeCloseTo(21.6);
  });
  it('空数据返回 null', () => {
    const empty: RunResultPanel = { ...panel, curves: [{ id: 'c', color: '#fff', width: 2 }] };
    expect(autoFitView(empty)).toBeNull();
  });
});

describe('panView / zoomView', () => {
  it('平移保持视口宽度/高度', () => {
    const v2 = panView(view, 50, 25, size);
    expect(v2.xMax - v2.xMin).toBeCloseTo(10);
    expect(v2.yMax - v2.yMin).toBeCloseTo(5);
    // 像素右拖 50px => world x 范围左移 2.5
    expect(v2.xMin).toBeCloseTo(-2.5);
    // 像素下拖 25px => y 增加
    expect(v2.yMin).toBeCloseTo(1.25);
  });
  it('缩放以锚点为不动点', () => {
    const v2 = zoomView(view, 2, { x: 100, y: 50 }, size);
    // 锚点 (100,50) 对应 world (5, 2.5)，缩放后锚点 world 坐标不变
    const anchorBefore = screenToWorld(100, 50, size, view);
    const anchorAfter = screenToWorld(100, 50, size, v2);
    expect(anchorAfter.x).toBeCloseTo(anchorBefore.x);
    expect(anchorAfter.y).toBeCloseTo(anchorBefore.y);
    expect(v2.xMax - v2.xMin).toBeCloseTo(5); // 范围减半（放大）
  });
});

describe('curveToWorldPoints', () => {
  it('像素贝塞尔段按 flipY 映射为数学坐标（y\' = H-1-y）', () => {
    const pts = curveToWorldPoints({
      id: 'c',
      color: '#fff',
      width: 2,
      segments: [{ cmd: 'lineTo', pts: [[0, 0], [10, 10]] }],
      imageW: 10,
      imageH: 10,
      flipY: true,
    });
    expect(pts[0]).toEqual([0, 9]);
    // y=10 超出像素有效范围 0..9，翻转后为 -1（公式 H-1-y 的数学结果）
    expect(pts[pts.length - 1]).toEqual([10, -1]);
  });
  it('curve-fit 已翻转为数学坐标时 flipY=false 透传不二次颠倒', () => {
    const pts = curveToWorldPoints({
      id: 'c',
      color: '#fff',
      width: 2,
      segments: [{ cmd: 'lineTo', pts: [[0, 0], [10, 10]] }],
      imageW: 10,
      imageH: 10,
      flipY: false,
    });
    expect(pts[0]).toEqual([0, 0]);
    expect(pts[pts.length - 1]).toEqual([10, 10]);
  });
  it('直接采样点原样返回', () => {
    const pts = curveToWorldPoints({ id: 'c', color: '#fff', width: 2, points: [[1, 2], [3, 4]] });
    expect(pts).toEqual([[1, 2], [3, 4]]);
  });
});

describe('niceStep', () => {
  it('取 1/2/5 系步长', () => {
    expect(niceStep(0.7)).toBe(0.5);
    expect(niceStep(2.2)).toBe(2);
    expect(niceStep(5.5)).toBe(5);
    expect(niceStep(90)).toBe(100);
  });
});

/** 构造 renderPanel 所需的 2D context 桩（仅记录调用，不实际绘制）。 */
function makeCtx() {
  const calls: string[] = [];
  const ctx = {
    drawImage: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    save: vi.fn(() => { calls.push('save'); }),
    restore: vi.fn(() => { calls.push('restore'); }),
    beginPath: vi.fn(),
    stroke: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    fill: vi.fn(),
    setTransform: vi.fn(),
    // 坐标轴刻度 / 标题渲染所需的标准 canvas 方法
    fillText: vi.fn(),
    measureText: vi.fn(() => ({ width: 10 })),
  } as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}

describe('renderPanel 图像+轮廓叠加（P0-4）', () => {
  const imgMeta = { src: 'data:image/png;base64,x', width: 10, height: 5 };
  const panel: RunResultPanel = {
    id: 'p',
    title: 't',
    kind: 'curves',
    curves: [{ id: 'c', color: '#a78bfa', width: 2, points: [[0, 0], [10, 5]] }],
    image: imgMeta,
    createdAt: 0,
  };
  const fakeImg = { complete: true, naturalWidth: 10, naturalHeight: 5 } as HTMLImageElement;

  it('携带原图时按 world 映射调用 drawImage（双线性背景）', () => {
    const { ctx } = makeCtx();
    renderPanel(ctx, panel, view, size, { image: fakeImg });
    // view=(0..10, 0..5)，size=(200,100)，图像 (0,5)→(0,0)，(10,0)→(200,100)
    expect(ctx.drawImage).toHaveBeenCalledTimes(1);
    expect(ctx.drawImage).toHaveBeenCalledWith(fakeImg, 0, 0, 200, 100);
  });

  it('未加载完成的图像不绘制（避免闪空白）', () => {
    const { ctx } = makeCtx();
    renderPanel(ctx, panel, view, size, { image: { ...fakeImg, complete: false } });
    expect(ctx.drawImage).not.toHaveBeenCalled();
  });

  it('无原图层面板不调用 drawImage', () => {
    const { ctx } = makeCtx();
    const noImg: RunResultPanel = { ...panel, image: undefined };
    renderPanel(ctx, noImg, view, size, { image: fakeImg });
    expect(ctx.drawImage).not.toHaveBeenCalled();
  });
});