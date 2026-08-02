import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { render, act, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Plot2DPanel } from '../Plot2DPanel';
import { useWorkbenchStore } from '@/lib/store/workbench';

beforeEach(() => {
  useWorkbenchStore.setState({
    plots: [], curveSets: [],
    viewMode: 'workbench', activePreviewTab: 'plot2d',
    editorVisible: true, previewVisible: true,
  });

  global.ResizeObserver = vi.fn(function () {
    return {
      observe: vi.fn(),
      unobserve: vi.fn(),
      disconnect: vi.fn(),
    };
  }) as any;

  global.requestAnimationFrame = vi.fn((cb: FrameRequestCallback) => {
    setTimeout(() => cb(Date.now()), 0);
    return 0;
  }) as any;
  global.cancelAnimationFrame = vi.fn() as any;

  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });

  Element.prototype.getBoundingClientRect = vi.fn(() => ({
    x: 0, y: 0, width: 800, height: 600, top: 0, right: 800, bottom: 600, left: 0,
    toJSON: () => ({}),
  })) as any;

  const mockCtx: any = {
    save: vi.fn(),
    restore: vi.fn(),
    scale: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    bezierCurveTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    closePath: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    strokeStyle: undefined,
    lineWidth: undefined,
    fillStyle: undefined,
    setLineDash: vi.fn(),
    getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(100), width: 5, height: 5 })),
    putImageData: vi.fn(),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    measureText: vi.fn(() => ({ width: 10 })),
    fillText: vi.fn(),
    strokeText: vi.fn(),
    arc: vi.fn(),
    rect: vi.fn(),
    setTransform: vi.fn(),
    getTransform: vi.fn(() => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 })),
    transform: vi.fn(),
    drawImage: vi.fn(),
    clip: vi.fn(),
    lineCap: undefined,
    lineJoin: undefined,
    miterLimit: undefined,
    font: undefined,
    textAlign: undefined,
    textBaseline: undefined,
    globalAlpha: undefined,
    globalCompositeOperation: undefined,
    shadowColor: undefined,
    shadowBlur: undefined,
    shadowOffsetX: undefined,
    shadowOffsetY: undefined,
    createPattern: vi.fn(() => null),
    ellipse: vi.fn(),
    roundRect: vi.fn(),
  };
  HTMLCanvasElement.prototype.getContext = vi.fn(() => mockCtx) as any;
});

describe('Plot2DPanel curveSets render (Task 5 + 9)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('添加 curveSets 后，Plot2DPanel 会渲染 canvas，且其 2D context 调用过 moveTo/lineTo/bezierCurveTo', async () => {
    const W = 1000, H = 1000;
    const toPx = (x: number, y: number) => [
      Math.round((x + 1) * 0.5 * (W - 1)),
      Math.round((1 - y) * 0.5 * (H - 1)),
    ] as [number, number];

    const k = 0.5522847498;
    const cubicCircle = (cx: number, cy: number, r: number) => [
      { cmd: 'moveTo' as const, pts: [toPx(cx + r, cy)] },
      { cmd: 'cubicTo' as const, pts: [toPx(cx+r,cy+k*r), toPx(cx+k*r,cy+r), toPx(cx,cy+r)] },
      { cmd: 'cubicTo' as const, pts: [toPx(cx-k*r,cy+r), toPx(cx-r,cy+k*r), toPx(cx-r,cy)] },
      { cmd: 'cubicTo' as const, pts: [toPx(cx-r,cy-k*r), toPx(cx-k*r,cy-r), toPx(cx,cy-r)] },
      { cmd: 'cubicTo' as const, pts: [toPx(cx+k*r,cy-r), toPx(cx+r,cy-k*r), toPx(cx+r,cy)] },
    ];
    const starPath = (cx: number, cy: number, ro: number, ri: number, n = 5) => {
      const segs: any[] = [];
      for (let i = 0; i < 2 * n; i++) {
        const a = -Math.PI / 2 + i * Math.PI / n;
        const r = i % 2 === 0 ? ro : ri;
        const p = toPx(cx + r * Math.cos(a), cy + r * Math.sin(a));
        segs.push(i === 0 ? { cmd: 'moveTo' as const, pts: [p] } : { cmd: 'lineTo' as const, pts: [p] });
      }
      return segs;
    };
    const curves = [
      { segments: cubicCircle(0, 0.8, 0.25), closed: true },
      { segments: starPath(0, 0.3, 0.3, 0.13, 5), closed: true },
    ];

    act(() => {
      const s = useWorkbenchStore.getState();
      s.clearCurveSets();
      s.clearPlots();
      s.addCurveSet({ curves, width: W, height: H, color: '#f472b6', strokeWidth: 3, flipY: true, flipX: false });
      s.addCurveSet({ curves: [curves[1]], width: W, height: H, color: '#22d3ee', strokeWidth: 2, flipY: false, flipX: false });
      s.addPlot({ type: 'function' as any, expr: 'sin(pi*x)' as any, expression: 'sin(pi*x)', domain: [-1, 1] as any, plotType: 'cartesian', xRange: [-1, 1], yRange: [-1, 1], color: '#94a3b8', visible: true });
    });

    let container: HTMLElement;
    await act(async () => {
      const rendered = render(<Plot2DPanel />);
      container = rendered.container;
    });

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    const canvases = container!.querySelectorAll('canvas');
    expect(canvases.length).toBeGreaterThanOrEqual(1);

    expect(HTMLCanvasElement.prototype.getContext).toHaveBeenCalled();
    const anyGetContext = HTMLCanvasElement.prototype.getContext as any;
    const ctx = anyGetContext.mock.results[0]?.value;
    expect(ctx).toBeDefined();

    const moveToCalls = ctx.moveTo.mock?.calls?.length || 0;
    const lineToCalls = ctx.lineTo.mock?.calls?.length || 0;
    const bezierCalls = ctx.bezierCurveTo.mock?.calls?.length || 0;
    expect(moveToCalls + lineToCalls + bezierCalls).toBeGreaterThan(10);
  });

  it('workbench store.addCurveSet 正确添加 curveSets', () => {
    const s = useWorkbenchStore.getState();
    s.clearCurveSets();
    s.addCurveSet({
      curves: [{ segments: [{ cmd: 'moveTo', pts: [[10, 10]] }], closed: false }],
      width: 100, height: 100, color: '#a78bfa', strokeWidth: 2, flipY: true, flipX: false,
    });
    const s2 = useWorkbenchStore.getState();
    expect(s2.curveSets.length).toBe(1);
    expect(s2.curveSets[0].color).toBe('#a78bfa');
  });
});
