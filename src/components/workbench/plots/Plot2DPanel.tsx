'use client';

/**
 * OmniMath Pro — Plot 2D Panel (container)
 *
 * Composes PlotToolbar + Plot2DCanvas, wires the workbench store, owns the
 * view (xRange, yRange) state, and implements the export / copy-latex
 * handlers. Also exposes an imperative PNG export via a hidden canvas ref.
 *
 * View model:
 *   - `defaultView` is derived from the current plots (memoized). It is the
 *     "natural" view for the active set of plots (auto-fit Y, square view
 *     for polar, latest xRange otherwise).
 *   - `userView` is set when the user pans / zooms / edits the range inputs.
 *     When plots are added/removed, the override is cleared so the derived
 *     default takes over again — no useEffect cascade needed.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { useWorkbenchStore } from '@/lib/store/workbench';
import { Plot2DCanvas, type Plot2DCanvasProps } from './Plot2DCanvas';
import { PlotToolbar } from './PlotToolbar';
import { PlotExpandDialog } from './PlotExpandDialog';
import { inputToLatex } from '@/lib/engine';
import { autoYRange, sampleFunction } from '@/lib/plots/plot2d';
import { toast } from 'sonner';

/* ----------------------- Defaults ---------------------------- */

/** Default viewport matches a calculator-like "standard" window:
 *  x ∈ [-10, 10], y ∈ [-10, 10]. Wide ranges like [-100, 100] make
 *  periodic functions (sin, cos, tan) look like dense vertical lines. */
const DEFAULT_X: [number, number] = [-10, 10];
const DEFAULT_Y: [number, number] = [-10, 10];

interface ViewBox {
  x: [number, number];
  y: [number, number];
}

/** Auto-derive a sensible Y range from the current plots sampled over the
 *  given X view range. Using the visible X range (instead of each plot's
 *  full stored range) prevents fast-growing functions like `e^x` from
 *  blowing up the Y axis when the user is only looking at a narrow window.
 *  We take the union of all autoYRange results plus a little vertical padding
 *  so the curve never touches the top/bottom edge. */
function deriveDefaultY(
  plots: ReturnType<typeof useWorkbenchStore.getState>['plots'],
  xRange: [number, number],
): [number, number] {
  if (plots.length === 0) return DEFAULT_Y;
  const ranges: [number, number][] = [];
  for (const p of plots) {
    const plotType2d = (p.plotType === 'surface3d' ? 'cartesian' : p.plotType ?? 'cartesian') as
      | 'cartesian' | 'polar' | 'parametric';
    // Sample over the requested X view range so the Y scale matches what is
    // actually on screen. For polar/parametric this still gives a reasonable
    // bounding estimate because the parameter range maps to the same window.
    const samples = sampleFunction(
      p.expression,
      xRange,
      plotType2d,
      300,
    );
    ranges.push(autoYRange(samples));
  }
  let min = Infinity;
  let max = -Infinity;
  for (const [lo, hi] of ranges) {
    if (Number.isFinite(lo) && lo < min) min = lo;
    if (Number.isFinite(hi) && hi > max) max = hi;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return DEFAULT_Y;
  const pad = Math.max(0.5, (max - min) * 0.12);
  return [min - pad, max + pad];
}

/* =================================================================== */
/*  Component                                                          */
/* =================================================================== */

export function Plot2DPanel() {
  const plots = useWorkbenchStore((s) => s.plots);
  const theme = useWorkbenchStore((s) => s.theme);
  const removePlot = useWorkbenchStore((s) => s.removePlot);
  const togglePlotVisibility = useWorkbenchStore((s) => s.togglePlotVisibility);
  const setEditorContent = useWorkbenchStore((s) => s.setEditorContent);

  // userView === null means "use the derived default".
  // We store the plots.length at the time the user last set a view, so when
  // plots are added/removed we automatically fall back to the derived
  // default (no ref access during render, no useEffect cascade).
  const [userView, setUserView] = useState<{ view: ViewBox; plotCount: number } | null>(null);

  // Derived default view from the current set of plots (memoized).
  const defaultView = useMemo<ViewBox>(() => {
    if (plots.length === 0) return { x: DEFAULT_X, y: DEFAULT_Y };
    const hasPolar = plots.some((p) => p.plotType === 'polar');
    if (hasPolar) {
      const r = 4;
      return { x: [-r, r], y: [-r, r] };
    }
    const latest = plots[plots.length - 1];
    const x = (latest?.xRange ?? DEFAULT_X) as [number, number];
    return {
      x,
      y: deriveDefaultY(plots, x),
    };
  }, [plots]);

  // If the plot count has changed since the user set their view, drop the
  // override so the derived default takes over.
  const effectiveUserView =
    userView && userView.plotCount === plots.length ? userView.view : null;

  const effectiveX = effectiveUserView?.x ?? defaultView.x;
  const effectiveY = effectiveUserView?.y ?? defaultView.y;

  /* ----------------------- View controls ---------------------------- */
  // All view mutations write to `userView` so the derived default is preserved
  // until the user actually pans / zooms.
  const handleZoomIn = useCallback(() => {
    setUserView((prev) => {
      const baseX = prev?.view.x ?? defaultView.x;
      const baseY = prev?.view.y ?? defaultView.y;
      return { view: { x: zoomAroundCenter(baseX, 1 / 1.3), y: zoomAroundCenter(baseY, 1 / 1.3) }, plotCount: plots.length };
    });
  }, [defaultView, plots.length]);
  const handleZoomOut = useCallback(() => {
    setUserView((prev) => {
      const baseX = prev?.view.x ?? defaultView.x;
      const baseY = prev?.view.y ?? defaultView.y;
      return { view: { x: zoomAroundCenter(baseX, 1.3), y: zoomAroundCenter(baseY, 1.3) }, plotCount: plots.length };
    });
  }, [defaultView, plots.length]);
  const handleReset = useCallback(() => {
    setUserView(null);
  }, []);

  const handleRangeChange = useCallback(
    (which: 'x' | 'y', index: 0 | 1, value: number) => {
      setUserView((prev) => {
        const baseX = prev?.view.x ?? defaultView.x;
        const baseY = prev?.view.y ?? defaultView.y;
        if (which === 'x') {
          const next: [number, number] = [baseX[0], baseX[1]];
          next[index] = value;
          if (next[1] <= next[0]) next[1] = next[0] + 1;
          return { view: { x: next, y: baseY }, plotCount: plots.length };
        }
        const next: [number, number] = [baseY[0], baseY[1]];
        next[index] = value;
        if (next[1] <= next[0]) next[1] = next[0] + 1;
        return { view: { x: baseX, y: next }, plotCount: plots.length };
      });
    },
    [defaultView, plots.length],
  );

  /* ----------------------- Insert example --------------------------- */
  const handleInsertExample = useCallback(
    (expr: string) => {
      setEditorContent(expr);
    },
    [setEditorContent],
  );

  /* ----------------------- Expand dialog ---------------------------- */
  const [expandOpen, setExpandOpen] = useState(false);

  /* ----------------------- Export handlers -------------------------- */
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
      a.download = `omnimath-plot-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast.success('已导出 PNG 图片');
    } catch (err) {
      console.error(err);
      toast.error('导出失败');
    }
  }, []);

  const handleCopyLatex = useCallback(() => {
    if (plots.length === 0) {
      toast.error('暂无图像');
      return;
    }
    const lines = plots.map((p) => {
      try {
        const latex = inputToLatex(p.expression, 'simple');
        const prefix =
          p.plotType === 'polar' ? 'r = ' :
          p.plotType === 'parametric' ? '(t) = ' :
          'y = ';
        return `${prefix}${latex}`;
      } catch {
        return `y = ${p.expression}`;
      }
    });
    const text = lines.join('\n');
    navigator.clipboard
      .writeText(text)
      .then(() => toast.success('已复制 LaTeX 表达式'))
      .catch(() => toast.error('复制失败'));
  }, [plots]);

  /* ----------------------- Canvas callbacks ------------------------- */
  const handleViewChange = useCallback((x: [number, number], y: [number, number]) => {
    setUserView({ view: { x, y }, plotCount: plots.length });
  }, [plots.length]);

  const handleResetView = useCallback(() => {
    handleReset();
  }, [handleReset]);

  /* ----------------------- Memoize props ---------------------------- */
  const canvasProps: Plot2DCanvasProps = useMemo(
    () => ({
      plots,
      theme,
      xRange: effectiveX,
      yRange: effectiveY,
      onViewChange: handleViewChange,
      onResetView: handleResetView,
      onInsertExample: handleInsertExample,
      showGrid: true,
      showMarkers: true,
    }),
    [plots, theme, effectiveX, effectiveY, handleViewChange, handleResetView, handleInsertExample],
  );

  /* ----------------------- Render ----------------------------------- */
  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <PlotToolbar
        plots={plots}
        xRange={effectiveX}
        yRange={effectiveY}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onReset={handleReset}
        onRangeChange={handleRangeChange}
        onToggleVisibility={togglePlotVisibility}
        onRemovePlot={removePlot}
        onExportPNG={handleExportPNG}
        onCopyLatex={handleCopyLatex}
        onExpand={() => setExpandOpen(true)}
      />
      <div ref={canvasWrapperRef} className="relative min-h-0 flex-1">
        <Plot2DCanvas {...canvasProps} />
      </div>
      <PlotExpandDialog open={expandOpen} onClose={() => setExpandOpen(false)} />
    </div>
  );
}

/* ----------------------- Helpers ------------------------------ */

function zoomAroundCenter(range: [number, number], factor: number): [number, number] {
  const c = (range[0] + range[1]) / 2;
  const half = ((range[1] - range[0]) / 2) * factor;
  if (half < 1e-9) return [c - 1e-9, c + 1e-9];
  return [c - half, c + half];
}
