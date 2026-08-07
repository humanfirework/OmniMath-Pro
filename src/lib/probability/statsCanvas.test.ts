import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  renderHistogram,
  renderLine,
  renderScatter,
  renderBoxPlot,
  renderArea,
  drawAxisGrid,
} from './statsCanvas';
import { histogramBins, boxplotStats, linearRegression } from './stats';
import type { ResultView } from '@/components/workbench/runresults/runResultRender';

const view: ResultView = { xMin: -2, xMax: 2, yMin: -1, yMax: 3 };
const size = { w: 400, h: 300 };

function makeCtx() {
  const ctx = {
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    arc: vi.fn(),
    closePath: vi.fn(),
    clearRect: vi.fn(),
    setLineDash: vi.fn(),
    fillText: vi.fn(),
    setTransform: vi.fn(),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    lineJoin: '',
    lineCap: '',
    font: '',
    textBaseline: '',
  } as unknown as CanvasRenderingContext2D;
  return ctx;
}

describe('statsCanvas 渲染（不抛错 + 产生绘制调用）', () => {
  let ctx: CanvasRenderingContext2D;
  beforeEach(() => {
    ctx = makeCtx();
  });

  it('drawAxisGrid 画网格与坐标轴', () => {
    drawAxisGrid(ctx, view, size);
    expect(ctx.stroke).toHaveBeenCalled();
  });

  it('renderHistogram 画条形', () => {
    const bins = histogramBins([1, 2, 2, 3, 4, 5], 4);
    renderHistogram(ctx, view, size, bins, { density: true });
    expect(ctx.fillRect).toHaveBeenCalled();
    expect(ctx.strokeRect).toHaveBeenCalled();
  });

  it('renderLine 画折线', () => {
    const pts = [
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 2 },
    ];
    renderLine(ctx, view, size, pts);
    expect(ctx.moveTo).toHaveBeenCalled();
    expect(ctx.lineTo).toHaveBeenCalled();
  });

  it('renderScatter 画点与回归线', () => {
    const pts = Array.from({ length: 10 }, (_, i) => ({ x: i, y: 2 * i + 1 }));
    const reg = linearRegression(pts);
    renderScatter(ctx, view, size, pts, { reg });
    expect(ctx.arc).toHaveBeenCalled();
    expect(ctx.stroke).toHaveBeenCalled();
  });

  it('renderBoxPlot 画箱体与须线', () => {
    const b = boxplotStats([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 100]);
    renderBoxPlot(ctx, view, size, b);
    expect(ctx.fillRect).toHaveBeenCalled();
    expect(ctx.strokeRect).toHaveBeenCalled();
  });

  it('renderArea 画 KDE 填充面积', () => {
    const pts = [
      { x: -1, y: 0.1 },
      { x: 0, y: 0.5 },
      { x: 1, y: 0.2 },
    ];
    renderArea(ctx, view, size, pts);
    expect(ctx.fill).toHaveBeenCalled();
    expect(ctx.stroke).toHaveBeenCalled();
  });
});