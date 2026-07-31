'use client';

/**
 * OmniMath Pro — 区域缩放覆盖层
 *
 * 在 2D 绘图画布上叠加一个可选的"框选缩放"模式：
 *   1. 点击工具栏按钮激活区域缩放模式
 *   2. 在画布上拖拽选择矩形区域
 *   3. 松开鼠标后，视图自动缩放到所选区域
 *
 * 坐标变换基于 Plot2DCanvas 共享的 PLOT_PADDING 常量
 * ({ left:48, right:16, top:16, bottom:32 })，将屏幕像素映射回世界坐标。
 *
 * 使用方式（在 Plot2DPanel 的 canvasWrapperRef 内渲染）：
 *   <RegionZoom
 *     wrapperRef={canvasWrapperRef}
 *     xRange={xRange}
 *     yRange={yRange}
 *     onViewChange={handleViewChange}
 *   />
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ZoomIn, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PLOT_PADDING as PADDING } from '@/lib/plots/plot2d';

export interface RegionZoomProps {
  wrapperRef: React.RefObject<HTMLElement | null>;
  xRange: [number, number];
  yRange: [number, number];
  onViewChange: (x: [number, number], y: [number, number]) => void;
}

interface SelectionRect {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

export function RegionZoom({
  wrapperRef,
  xRange,
  yRange,
  onViewChange,
}: RegionZoomProps) {
  const [active, setActive] = useState(false);
  const [selection, setSelection] = useState<SelectionRect | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // 退出区域缩放模式时清理选择框
  useEffect(() => {
    if (!active) setSelection(null);
  }, [active]);

  /** 将屏幕像素坐标转换为世界坐标 */
  const toWorld = useCallback(
    (px: number, py: number, w: number, h: number) => {
      const plotW = w - PADDING.left - PADDING.right;
      const plotH = h - PADDING.top - PADDING.bottom;
      const wx = xRange[0] + ((px - PADDING.left) / plotW) * (xRange[1] - xRange[0]);
      // Y 轴翻转：屏幕 y=0 在顶部，世界 y=max 在顶部
      const wy = yRange[1] - ((py - PADDING.top) / plotH) * (yRange[1] - yRange[0]);
      return { wx, wy };
    },
    [xRange, yRange],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!active || !overlayRef.current) return;
      const rect = overlayRef.current.getBoundingClientRect();
      setSelection({
        startX: e.clientX - rect.left,
        startY: e.clientY - rect.top,
        endX: e.clientX - rect.left,
        endY: e.clientY - rect.top,
      });
      e.preventDefault();
    },
    [active],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!active || !selection || !overlayRef.current) return;
      const rect = overlayRef.current.getBoundingClientRect();
      setSelection((prev) =>
        prev
          ? { ...prev, endX: e.clientX - rect.left, endY: e.clientY - rect.top }
          : null,
      );
    },
    [active, selection],
  );

  const handleMouseUp = useCallback(() => {
    if (!active || !selection || !overlayRef.current) return;
    const w = overlayRef.current.clientWidth;
    const h = overlayRef.current.clientHeight;

    const x1 = Math.min(selection.startX, selection.endX);
    const x2 = Math.max(selection.startX, selection.endX);
    const y1 = Math.min(selection.startY, selection.endY);
    const y2 = Math.max(selection.startY, selection.endY);

    // 太小的选择框忽略（避免误触）
    if (x2 - x1 < 8 || y2 - y1 < 8) {
      setSelection(null);
      return;
    }

    const tl = toWorld(x1, y1, w, h);
    const br = toWorld(x2, y2, w, h);

    onViewChange([tl.wx, br.wx], [br.wy, tl.wy]);
    setSelection(null);
    setActive(false);
  }, [active, selection, toWorld, onViewChange]);

  // 选择框样式
  const selStyle = selection
    ? {
        left: Math.min(selection.startX, selection.endX),
        top: Math.min(selection.startY, selection.endY),
        width: Math.abs(selection.endX - selection.startX),
        height: Math.abs(selection.endY - selection.startY),
      }
    : null;

  return (
    <>
      {/* 工具栏按钮 */}
      <button
        type="button"
        onClick={() => setActive((v) => !v)}
        className={cn(
          'absolute top-2 right-2 z-10 grid place-items-center size-7 rounded-md border transition-colors',
          active
            ? 'bg-primary text-primary-foreground border-primary shadow-sm'
            : 'bg-background/80 text-muted-foreground border-border/60 hover:text-foreground hover:bg-accent',
        )}
        aria-label={active ? '退出区域缩放' : '区域缩放'}
        title={active ? '退出区域缩放' : '区域缩放'}
      >
        {active ? <X className="size-3.5" /> : <ZoomIn className="size-3.5" />}
      </button>

      {/* 拖拽覆盖层 — 仅在激活时拦截鼠标事件 */}
      {active && (
        <div
          ref={overlayRef}
          className="absolute inset-0 z-20 cursor-crosshair"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {/* 提示文字 */}
          {!selection && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 px-3 py-1.5 rounded-md bg-primary/10 border border-primary/30 text-[11px] text-primary pointer-events-none">
              拖拽选择缩放区域
            </div>
          )}
          {/* 选择框 */}
          {selStyle && (
            <div
              className="absolute border border-primary bg-primary/15 pointer-events-none"
              style={selStyle}
            />
          )}
        </div>
      )}
    </>
  );
}
