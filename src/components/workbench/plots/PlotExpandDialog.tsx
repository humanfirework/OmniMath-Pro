'use client';

/**
 * OmniMath Pro — Plot Expand Dialog
 *
 * A full-screen modal that shows the 2D plot at a large size for detailed
 * observation. Users can still zoom/pan/crosshair inside the dialog.
 * Triggered by the "放大" (Expand) button in PlotToolbar.
 */

import { useState, useMemo, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { X, Download, Copy, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { useWorkbenchStore } from '@/lib/store/workbench';
import { Plot2DCanvas, type Plot2DCanvasProps } from './Plot2DCanvas';
import { inputToLatex } from '@/lib/engine';
import { autoYRange, sampleFunction } from '@/lib/plots/plot2d';
import { useScopeVersion } from '@/lib/hooks/useScopeVersion';
import { toast } from 'sonner';

const DEFAULT_X: [number, number] = [-10, 10];
const DEFAULT_Y: [number, number] = [-6, 6];

interface ViewBox {
  x: [number, number];
  y: [number, number];
}

function deriveDefaultY(
  plots: ReturnType<typeof useWorkbenchStore.getState>['plots'],
): [number, number] {
  if (plots.length === 0) return DEFAULT_Y;
  const ranges: [number, number][] = [];
  for (const p of plots) {
    const plotType2d = (p.plotType === 'surface3d'
      ? 'cartesian'
      : p.plotType ?? 'cartesian') as 'cartesian' | 'polar' | 'parametric';
    const samples = sampleFunction(p.expression, p.xRange ?? DEFAULT_X, plotType2d, 300);
    ranges.push(autoYRange(samples));
  }
  const mins = ranges.map((r) => r[0]).sort((a, b) => a - b);
  const maxs = ranges.map((r) => r[1]).sort((a, b) => a - b);
  const med = (arr: number[]) => {
    const n = arr.length;
    return n % 2 === 0 ? (arr[n / 2 - 1] + arr[n / 2]) / 2 : arr[Math.floor(n / 2)];
  };
  return [med(mins), med(maxs)];
}

function zoomAroundCenter(range: [number, number], factor: number): [number, number] {
  const c = (range[0] + range[1]) / 2;
  const half = ((range[1] - range[0]) / 2) * factor;
  if (half < 1e-9) return [c - 1e-9, c + 1e-9];
  return [c - half, c + half];
}

export interface PlotExpandDialogProps {
  open: boolean;
  onClose: () => void;
}

export function PlotExpandDialog({ open, onClose }: PlotExpandDialogProps) {
  const plots = useWorkbenchStore((s) => s.plots);
  const theme = useWorkbenchStore((s) => s.theme);
  const [userView, setUserView] = useState<ViewBox | null>(null);

  const scopeVersion = useScopeVersion();
  const defaultView = useMemo<ViewBox>(() => {
    void scopeVersion;
    if (plots.length === 0) return { x: DEFAULT_X, y: DEFAULT_Y };
    const hasPolar = plots.some((p) => p.plotType === 'polar');
    if (hasPolar) {
      const r = 4;
      return { x: [-r, r], y: [-r, r] };
    }
    const latest = plots[plots.length - 1];
    return {
      x: (latest?.xRange ?? DEFAULT_X) as [number, number],
      y: deriveDefaultY(plots),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plots, scopeVersion]);

  const effectiveX = userView?.x ?? defaultView.x;
  const effectiveY = userView?.y ?? defaultView.y;

  const handleZoomIn = useCallback(() => {
    setUserView((prev) => ({
      x: zoomAroundCenter(prev?.x ?? defaultView.x, 1 / 1.3),
      y: zoomAroundCenter(prev?.y ?? defaultView.y, 1 / 1.3),
    }));
  }, [defaultView]);

  const handleZoomOut = useCallback(() => {
    setUserView((prev) => ({
      x: zoomAroundCenter(prev?.x ?? defaultView.x, 1.3),
      y: zoomAroundCenter(prev?.y ?? defaultView.y, 1.3),
    }));
  }, [defaultView]);

  const handleReset = useCallback(() => setUserView(null), []);

  const handleViewChange = useCallback((x: [number, number], y: [number, number]) => {
    setUserView({ x, y });
  }, []);

  const canvasWrapperRef = useRef<HTMLDivElement>(null);

  const handleExportPNG = useCallback(() => {
    const canvas = canvasWrapperRef.current?.querySelector('canvas');
    if (!canvas) {
      toast.error('画布未就绪');
      return;
    }
    try {
      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = `omnimath-plot-large-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast.success('已导出高清 PNG');
    } catch {
      toast.error('导出失败');
    }
  }, []);

  const handleCopyLatex = useCallback(() => {
    if (plots.length === 0) return;
    const lines = plots.map((p) => {
      try {
        const latex = inputToLatex(p.expression, 'simple');
        const prefix =
          p.plotType === 'polar' ? 'r = ' : p.plotType === 'parametric' ? '(t) = ' : 'y = ';
        return `${prefix}${latex}`;
      } catch {
        return `y = ${p.expression}`;
      }
    });
    navigator.clipboard
      .writeText(lines.join('\n'))
      .then(() => toast.success('已复制 LaTeX'))
      .catch(() => toast.error('复制失败'));
  }, [plots]);

  const canvasProps: Plot2DCanvasProps = useMemo(
    () => ({
      plots,
      theme,
      xRange: effectiveX,
      yRange: effectiveY,
      onViewChange: handleViewChange,
      onResetView: handleReset,
      onInsertExample: () => {},
      showGrid: true,
      showMarkers: true,
    }),
    [plots, theme, effectiveX, effectiveY, handleViewChange, handleReset],
  );

  if (!open) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[200] flex flex-col bg-background/95 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label="放大查看绘图"
    >
      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-border/60 bg-background/80 px-4 py-2.5 backdrop-blur">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-foreground">绘图大图查看</h2>
          <span className="text-xs text-muted-foreground">
            {plots.length} 条曲线 · 滚轮缩放 · 拖拽平移 · 双击重置
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleZoomIn}
            className="grid place-items-center size-8 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label="放大"
          >
            <ZoomIn className="size-4" />
          </button>
          <button
            onClick={handleZoomOut}
            className="grid place-items-center size-8 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label="缩小"
          >
            <ZoomOut className="size-4" />
          </button>
          <button
            onClick={handleReset}
            className="grid place-items-center size-8 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label="重置视图"
          >
            <RotateCcw className="size-4" />
          </button>
          <div className="mx-1 h-5 w-px bg-border/60" />
          <button
            onClick={handleExportPNG}
            className="flex items-center gap-1.5 h-8 px-2.5 rounded-md text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <Download className="size-3.5" />
            <span className="hidden sm:inline">导出 PNG</span>
          </button>
          <button
            onClick={handleCopyLatex}
            className="flex items-center gap-1.5 h-8 px-2.5 rounded-md text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <Copy className="size-3.5" />
            <span className="hidden sm:inline">复制 LaTeX</span>
          </button>
          <div className="mx-1 h-5 w-px bg-border/60" />
          <button
            onClick={onClose}
            className="grid place-items-center size-8 rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
            aria-label="关闭"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      {/* Plot canvas — takes all remaining space */}
      <div ref={canvasWrapperRef} className="relative flex-1 min-h-0">
        <Plot2DCanvas {...canvasProps} />
      </div>

      {/* Footer: plot list */}
      {plots.length > 0 && (
        <div className="border-t border-border/60 bg-background/80 px-4 py-2 backdrop-blur">
          <div className="flex flex-wrap items-center gap-2">
            {plots.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-1.5 rounded-md border border-border/60 bg-muted/40 px-2 py-1"
              >
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: p.color, boxShadow: `0 0 6px ${p.color}80` }}
                />
                <span className="max-w-[260px] truncate font-mono text-xs text-foreground/90">
                  {p.plotType === 'polar' ? 'r = ' : p.plotType === 'parametric' ? '(t) = ' : 'y = '}
                  {p.expression}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}
