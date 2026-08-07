'use client';

/**
 * OmniMath Pro — 通用交互式统计图表 canvas 组件。
 *
 * 复用 runResultRender 的视口（world⇄screen）与 pan/zoom 逻辑，提供：
 *  - 左键拖拽平移、滚轮缩放、双击复位
 *  - 悬停显示 world 坐标 tooltip
 *  - DPR 高清渲染、ResizeObserver 自适应
 * 上层通过 `compute` + `draw` 注入具体的统计图表（直方图/ECDF/QQ/箱线/散点/KDE）。
 */

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  panView,
  zoomView,
  screenToWorld,
  type ResultView,
} from '@/components/workbench/runresults/runResultRender';

export interface StatsChartProps<S> {
  /** 计算图表数据（依赖 input 变化时重算）。 */
  compute: () => S;
  /** 绘制到 canvas（ctx 已按 DPR 缩放，size 为 css 像素）。 */
  draw: (ctx: CanvasRenderingContext2D, view: ResultView, size: { w: number; h: number }, data: S) => void;
  /** 由数据推导初始视口；返回 null 则用默认。 */
  autoView?: (data: S) => ResultView | null;
  /** tooltip 坐标格式化。 */
  tooltip?: (world: { x: number; y: number }) => string;
  className?: string;
  minHeight?: number;
}

const MAX_DPR = 2;

export function StatsChart<S>({ compute, draw, autoView, tooltip, className, minHeight = 220 }: StatsChartProps<S>) {
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<ResultView>({ xMin: -1, xMax: 1, yMin: -1, yMax: 1 });
  const sizeRef = useRef<{ w: number; h: number; dpr: number }>({ w: 0, h: 0, dpr: 1 });
  const dragRef = useRef<{ sx: number; sy: number; orig: ResultView } | null>(null);
  const [tip, setTip] = useState<{ sx: number; sy: number; text: string } | null>(null);

  const data = useMemo(() => compute(), [compute]);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const { w, h, dpr } = sizeRef.current;
    if (!canvas || w === 0 || h === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    draw(ctx, viewRef.current, { w, h }, data);
  }, [draw, data]);

  // 初始视口
  useEffect(() => {
    const av = autoView?.(data);
    if (av) viewRef.current = av;
  }, [data, autoView]);

  // 尺寸 + DPR
  useEffect(() => {
    const el = boxRef.current;
    const canvas = canvasRef.current;
    if (!el || !canvas) return;
    const ro = new ResizeObserver(() => {
      const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
      const w = el.clientWidth;
      const h = Math.max(minHeight, el.clientHeight || minHeight);
      sizeRef.current = { w, h, dpr };
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      redraw();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [minHeight, redraw]);

  useEffect(() => {
    redraw();
  }, [data, draw, redraw]);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const rect = boxRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragRef.current = { sx: e.clientX - rect.left, sy: e.clientY - rect.top, orig: { ...viewRef.current } };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const rect = boxRef.current?.getBoundingClientRect();
    if (!rect) return;
    const { w, h } = sizeRef.current;
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    if (dragRef.current) {
      const dx = sx - dragRef.current.sx;
      const dy = sy - dragRef.current.sy;
      viewRef.current = panView(dragRef.current.orig, dx, dy, { w, h });
      redraw();
    } else if (tooltip) {
      const world = screenToWorld(sx, sy, { w, h }, viewRef.current);
      setTip({ sx, sy, text: tooltip(world) });
    }
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const rect = boxRef.current?.getBoundingClientRect();
    if (!rect) return;
    const { w, h } = sizeRef.current;
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    viewRef.current = zoomView(viewRef.current, factor, { x: e.clientX - rect.left, y: e.clientY - rect.top }, { w, h });
    redraw();
  };

  const onDoubleClick = () => {
    const av = autoView?.(data);
    if (av) viewRef.current = av;
    redraw();
  };

  const onLeave = () => setTip(null);

  return (
    <div
      ref={boxRef}
      className={'relative overflow-hidden rounded-md border border-border/40 bg-black/20 ' + (className ?? '')}
      style={{ minHeight, touchAction: 'none' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onLeave}
      onWheel={onWheel}
      onDoubleClick={onDoubleClick}
    >
      <canvas ref={canvasRef} className="block cursor-grab active:cursor-grabbing" />
      {tip && tooltip && (
        <div
          className="pointer-events-none absolute z-10 rounded border border-border/50 bg-background/90 px-1.5 py-0.5 font-mono text-[10px] shadow-sm"
          style={{ left: Math.min(tip.sx + 12, (sizeRef.current.w || 0) - 120), top: tip.sy - 22 }}
        >
          {tip.text}
        </div>
      )}
    </div>
  );
}