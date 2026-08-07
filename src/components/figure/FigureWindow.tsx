'use client';

/**
 * OmniMath Pro — FigureWindow 公共底座（G4）
 *
 * MATLAB figure 风格的**独立图形窗口**壳：仿真 / 视觉 / 统计等窗口共用同一套
 * 标题栏 + 工具栏（导出 PNG·SVG·CSV / 缩放 / 实时刷新）+ 内容区。
 *
 * 职责划分：
 *  - 本组件只负责「窗口镀铬」（拖拽 / 缩放 / 置顶 / 关闭）与「通用工具栏」，
 *  - 具体内容由 `children` 渲染；导出素材通过 `getSources()` 回调取用。
 *
 * 使用方式（受控）：宿主自行管理实例数组与生命周期，逐个渲染本组件。
 */

import { useCallback, useRef, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import {
  FileText,
  Image as ImageIcon,
  ListOrdered,
  Maximize2,
  RefreshCw,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { saveCanvasToFile, saveTextToFile } from '@/lib/nativeExport';
import { seriesToCSV, type SeriesData } from '@/lib/plots/csvExport';
import { toCanvas } from 'html-to-image';
import { cn } from '@/lib/utils';

export const FIGURE_MIN_W = 320;
export const FIGURE_MIN_H = 220;

export interface FigureExportSources {
  /** 要捕获为 PNG 的 DOM 节点（缺省则 PNG 导出置灰）。 */
  node?: HTMLElement | null;
  /** 原始 SVG 字符串（可选，支持 SVG 导出）。 */
  svg?: string;
  /** 2D 曲线数据（可选，支持 CSV 导出）。 */
  csv?: SeriesData[];
  defaultName?: string;
}

export interface FigureWindowProps {
  /** 窗口唯一 id（用于日志 / 默认文件名）。 */
  id: string;
  title: string;
  icon?: ReactNode;
  children?: ReactNode;
  /** 返回当前导出素材；缺省时导出项置灰。 */
  getSources?: () => FigureExportSources;
  onClose: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onResetView?: () => void;
  onToggleRefresh?: () => void;
  refreshing?: boolean;
  className?: string;
  /** 初始位置与尺寸（px）。 */
  initial?: { x: number; y: number; w: number; h: number };
}

interface WinState {
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
}

/**
 * 独立 Figure 窗口。内部管理拖拽 / 缩放 / 置顶；关闭与外部生命周期由 props 控制。
 */
export function FigureWindow({
  id,
  title,
  icon,
  children,
  getSources,
  onClose,
  onZoomIn,
  onZoomOut,
  onResetView,
  onToggleRefresh,
  refreshing = false,
  className,
  initial,
}: FigureWindowProps) {
  const [win, setWin] = useState<WinState>(
    initial ? { ...initial, z: 50 } : { x: 40, y: 40, w: 480, h: 380, z: 50 },
  );
  const winRef = useRef(win);
  winRef.current = win;
  const [handling, setHandling] = useState(false);

  const bringToFront = useCallback(() => {
    setWin((prev) => ({ ...prev, z: Math.round(prev.z) + 1 }));
  }, []);

  const startDrag = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startY = e.clientY;
      const start = winRef.current;
      const onMove = (ev: PointerEvent) => {
        setWin((prev) => ({ ...prev, x: start.x + ev.clientX - startX, y: start.y + ev.clientY - startY }));
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [],
  );

  const startResize = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const start = winRef.current;
    const onMove = (ev: PointerEvent) => {
      setWin((prev) => ({
        ...prev,
        w: Math.max(FIGURE_MIN_W, start.w + ev.clientX - startX),
        h: Math.max(FIGURE_MIN_H, start.h + ev.clientY - startY),
      }));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, []);

  const withBusy = useCallback(async (fn: () => Promise<void>) => {
    setHandling(true);
    try {
      await fn();
    } catch (err) {
      console.error('FigureWindow 导出失败', err);
    } finally {
      setHandling(false);
    }
  }, []);

  const exportPNG = useCallback(() => {
    const node = getSources?.()?.node;
    if (!node) return;
    void withBusy(async () => {
      const canvas = await toCanvas(node, { pixelRatio: 2 });
      await saveCanvasToFile(canvas, { defaultName: getSources()?.defaultName ?? id, dpi: 1 });
    });
  }, [getSources, id, withBusy]);

  const exportSVG = useCallback(() => {
    const src = getSources?.();
    if (!src?.svg) return;
    void withBusy(async () => {
      await saveTextToFile(src.svg as string, { defaultName: src.defaultName ?? id, extensions: ['svg'] });
    });
  }, [getSources, id, withBusy]);

  const exportCSV = useCallback(() => {
    const src = getSources?.();
    if (!src?.csv || src.csv.length === 0) return;
    void withBusy(async () => {
      await saveTextToFile(seriesToCSV(src.csv as SeriesData[]), {
        defaultName: src.defaultName ?? id,
        extensions: ['csv'],
      });
    });
  }, [getSources, id, withBusy]);

  const src = getSources?.();
  const canPNG = !!src?.node;
  const canSVG = !!src?.svg;
  const canCSV = !!src?.csv && src.csv.length > 0;

  const toolBtn =
    'size-6 grid place-items-center rounded text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-30 disabled:pointer-events-none';

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.94, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.94 }}
      transition={{ duration: 0.16 }}
      className={cn(
        'pointer-events-auto absolute flex flex-col rounded-xl border border-border/70 shadow-2xl glass-strong overflow-hidden',
        className,
      )}
      style={{ left: win.x, top: win.y, width: win.w, height: win.h, zIndex: win.z }}
      onPointerDownCapture={bringToFront}
    >
      {/* ── 标题栏 ── */}
      <div
        className="flex items-center gap-2 h-8 px-2.5 border-b border-border/60 cursor-move select-none shrink-0"
        onPointerDown={startDrag}
      >
        {icon ?? <span className="size-2 rounded-full bg-primary/70" />}
        <span className="flex-1 truncate text-[12px] font-semibold">{title}</span>
        <button
          onClick={onClose}
          className="size-5 grid place-items-center rounded text-muted-foreground hover:text-foreground hover:bg-accent"
          title="关闭"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {/* ── 通用工具栏（导出 / 缩放 / 实时刷新） ── */}
      <div className="flex items-center gap-1 h-8 px-2 border-b border-border/40 bg-background/30 shrink-0">
        <button onClick={exportPNG} disabled={!canPNG || handling} className={toolBtn} title="导出 PNG">
          <ImageIcon className="size-3.5" />
        </button>
        <button onClick={exportSVG} disabled={!canSVG || handling} className={toolBtn} title="导出 SVG">
          <FileText className="size-3.5" />
        </button>
        <button onClick={exportCSV} disabled={!canCSV || handling} className={toolBtn} title="导出 CSV">
          <ListOrdered className="size-3.5" />
        </button>

        <div className="mx-1 h-4 w-px bg-border/50" />

        <button onClick={onZoomOut} disabled={!onZoomOut} className={toolBtn} title="缩小">
          <ZoomOut className="size-3.5" />
        </button>
        <button onClick={onZoomIn} disabled={!onZoomIn} className={toolBtn} title="放大">
          <ZoomIn className="size-3.5" />
        </button>
        <button onClick={onResetView} disabled={!onResetView} className={toolBtn} title="重置视图">
          <Maximize2 className="size-3.5" />
        </button>

        {onToggleRefresh && (
          <>
            <div className="mx-1 h-4 w-px bg-border/50" />
            <button
              onClick={onToggleRefresh}
              className={cn(
                'flex items-center gap-1 px-1.5 h-6 rounded text-[11px] transition-colors',
                refreshing
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent',
              )}
              title={refreshing ? '已开启实时刷新（点击关闭）' : '开启实时刷新'}
            >
              <RefreshCw className={cn('size-3', refreshing && 'animate-spin')} />
              <span className="hidden sm:inline">{refreshing ? '实时' : '刷新'}</span>
            </button>
          </>
        )}
      </div>

      {/* ── 内容区 ── */}
      <div className="relative flex-1 min-h-0">{children}</div>

      {/* 缩放手柄 */}
      <div className="absolute bottom-0 right-0 size-4 cursor-se-resize z-10" onPointerDown={startResize} />
    </motion.div>
  );
}