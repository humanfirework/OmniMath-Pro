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
 *     "natural" view for the active set of plots: X is the latest plot's
 *     configured xRange, Y is the smart (P5/P95, outlier-clipped) range
 *     sampled over that X. For polar plots the Y range is a fixed `[-4, 4]`
 *     (no aspect-ratio enforcement — the canvas maps world→screen linearly).
 *   - `userView` is set when the user pans / zooms / edits the range inputs.
 *     When plots are added/removed, the override is cleared so the derived
 *     default takes over again — no useEffect cascade needed.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { useWorkbenchStore } from '@/lib/store/workbench';
import { Plot2DCanvas, type Plot2DCanvasProps } from './Plot2DCanvas';
import { PlotToolbar } from './PlotToolbar';
import { PlotExpandDialog } from './PlotExpandDialog';
import { ExportDialog } from './ExportDialog';
import { RegionZoom } from './RegionZoom';
import { ViewControls } from '@/components/workbench/controls/ViewControls';
import {
  Plot2DAdvancedPanel,
  type RangeMode,
  type AdvancedOverlays,
  type CompareMode,
} from './Plot2DAdvancedPanel';
import { FacetGrid } from './FacetGrid';
import { ParameterSliders } from './ParameterSliders';
import { PlotCurveEditor } from './PlotCurveEditor';
import { inputToLatex } from '@/lib/engine';
import { extractFreeParameters } from '@/lib/engine/variableScanner';
import {
  sampleCurve,
  DEFAULT_POLAR_THETA_RANGE,
  DEFAULT_PARAMETRIC_T_RANGE,
  type Curve2DSpec,
} from '@/lib/plots/plot2d';
import { coordinatedYRange, smartYRange, type CoordinatedRangeResult } from '@/lib/plots/smartRange';
import { useScopeVersion } from '@/lib/hooks/useScopeVersion';
import { useSettingsStore } from '@/lib/store/settingsStore';
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

/**
 * Build the default Curve2DSpec for a plot (before any user edits in the
 * curve editor): mode from `plotType`, expression from `expression`, and
 * the mode's default parameter range (θ: 0…2π, t: -10…10).
 */
function defaultSpecForPlot(p: {
  expression: string;
  plotType: 'cartesian' | 'polar' | 'parametric' | 'surface3d';
}): Curve2DSpec {
  const mode = (p.plotType === 'surface3d' ? 'cartesian' : p.plotType ?? 'cartesian') as
    | 'cartesian' | 'polar' | 'parametric';
  return {
    mode,
    exprX: p.expression,
    exprY: '',
    paramRange:
      mode === 'polar'
        ? [...DEFAULT_POLAR_THETA_RANGE]
        : [...DEFAULT_PARAMETRIC_T_RANGE],
  };
}

/**
 * Auto-derive a sensible Y range from the current plots sampled over the
 * given X view range, using the smart coordinated range algorithm.
 *
 * Unlike the legacy `autoYRange` (which took raw min/max and let e^x
 * crush sin x), this uses P5/P95 quantiles and outlier detection so
 * exponential curves don't dominate the shared Y axis.
 *
 * Returns the coordinated result including `outliers` (curve labels that
 * were clipped).
 */
function deriveSmartY(
  plots: ReturnType<typeof useWorkbenchStore.getState>['plots'],
  xRange: [number, number],
  curveSpecs: Record<string, Curve2DSpec>,
): CoordinatedRangeResult {
  if (plots.length === 0) {
    return { range: DEFAULT_Y, outliers: [] };
  }
  const sampled = plots.map((p) => {
    const spec = curveSpecs[p.id] ?? defaultSpecForPlot(p);
    const samples = sampleCurve(spec, xRange, 300);
    return { samples, label: p.expression };
  });
  return coordinatedYRange(sampled, {
    lowerQuantile: 0.05,
    upperQuantile: 0.95,
    includeZero: true,
    padding: 0.1,
  });
}

/* =================================================================== */
/*  Component                                                          */
/* =================================================================== */

export function Plot2DPanel() {
  const allPlots = useWorkbenchStore((s) => s.plots);
  // ── 过滤掉 3D 曲面图 ──────────────────────────────────────────
  // surface3d 类型的图应在 Plot3DPanel 中渲染。之前没有过滤，导致
  // plot3d(sin(x)*cos(y)) 被当作 2D cartesian 图采样，而 sin(x)*cos(y)
  // 中的 y 变量未定义，采样失败，3D 图也无法正确跳转到 3D 面板。
  const plots = useMemo(
    () => allPlots.filter((p) => p.plotType !== 'surface3d'),
    [allPlots],
  );
  const theme = useWorkbenchStore((s) => s.theme);
  const removePlot = useWorkbenchStore((s) => s.removePlot);
  const togglePlotVisibility = useWorkbenchStore((s) => s.togglePlotVisibility);
  const setEditorContent = useWorkbenchStore((s) => s.setEditorContent);
  // 自由参数滑块面板的折叠态持久化在 settingsStore；工具栏徽标和
  // ParameterSliders 共用这一份状态。
  const variables = useWorkbenchStore((s) => s.variables);
  const slidersCollapsed = useSettingsStore((s) => s.slidersCollapsed);
  const setSlidersCollapsed = useSettingsStore((s) => s.setSlidersCollapsed);

  // userView === null means "use the derived default".
  // We store the plots.length at the time the user last set a view, so when
  // plots are added/removed we automatically fall back to the derived
  // default (no ref access during render, no useEffect cascade).
  const [userView, setUserView] = useState<{ view: ViewBox; plotCount: number } | null>(null);

  // Range mode: 'free' (default, quantile-based adaptive w/ outlier
  // clipping) or 'manual' (user-set Y).
  const [rangeMode, setRangeMode] = useState<RangeMode>('free');

  // Compare mode: 'overlay' (default for multi-plot) draws all curves on a
  // single shared-Y axis — same coordinate system, Desmos style.
  // 'facet' renders each curve in its own mini-plot with an independent Y
  // axis so functions with wildly different magnitudes (x², sin x, eˣ) can
  // be compared clearly. Kept as a toggle in the advanced panel.
  // Single-plot mode always falls back to 'overlay' since facetting one curve
  // is pointless.
  const [userCompareMode, setUserCompareMode] = useState<CompareMode>('overlay');
  const compareMode: CompareMode = plots.length > 1 ? userCompareMode : 'overlay';

  // Advanced-feature overlays (intersections / tangent / derivative)
  // computed by the Plot2DAdvancedPanel.
  const [overlays, setOverlays] = useState<AdvancedOverlays>({
    intersections: [],
    tangent: null,
    derivativeSamples: [],
    derivativeOrder: 1,
  });

  // Task 8.E: show/hide in-canvas legend. Default true.
  const [showLegend, setShowLegend] = useState(true);

  // Per-curve spec edits from the PlotCurveEditor (mode / expressions /
  // parameter range). Keyed by plot id; entries without an edit fall back
  // to the default derived from the PlotConfig.
  const [specEdits, setSpecEdits] = useState<Record<string, Curve2DSpec>>({});
  const curveSpecs = useMemo<Record<string, Curve2DSpec>>(() => {
    const out: Record<string, Curve2DSpec> = {};
    for (const p of plots) {
      out[p.id] = specEdits[p.id] ?? defaultSpecForPlot(p);
    }
    return out;
  }, [plots, specEdits]);
  const handleSpecChange = useCallback((id: string, spec: Curve2DSpec) => {
    setSpecEdits((prev) => ({ ...prev, [id]: spec }));
  }, []);

  // `scopeVersion` re-derives when a slider / variable changes the curves.
  const scopeVersion = useScopeVersion();

  // 工具栏参数徽标用的自由参数数量。与 ParameterSliders 的发现逻辑保持
  // 一致（仅可见 2D 表达式、排除已定义变量），scopeVersion 变化时刷新。
  const freeParamCount = useMemo(() => {
    void scopeVersion;
    const exprs = plots
      .filter((p) => p.visible && p.plotType !== 'surface3d')
      .map((p) => p.expression);
    return extractFreeParameters(exprs, Object.keys(variables)).length;
  }, [plots, variables, scopeVersion]);

  // If the plot count has changed since the user set their view, drop the
  // override so the derived default takes over.
  const effectiveUserView =
    userView && userView.plotCount === plots.length ? userView.view : null;

  // The X range used both as the effective viewport X and as the sampling
  // range for `smartY`. It tracks the user's current X (pan / zoom) so the
  // smart Y range is recomputed over whatever is actually visible, instead
  // of always sampling the curve's original configured xRange. Computed
  // BEFORE `smartY` / `defaultView` to avoid a circular dependency:
  // `defaultView.y` depends on `smartY`, so `smartY` cannot depend on
  // `defaultView.x`. The result is referentially stable (a reference taken
  // straight from `userView.view.x` or the store's `xRange`) so adding it
  // to the `smartY` memo deps does not cause spurious re-computation.
  const latestPlot = plots[plots.length - 1];
  const sampleX: [number, number] =
    effectiveUserView?.x ?? ((latestPlot?.xRange ?? DEFAULT_X) as [number, number]);

  // Derived adaptive Y range from the current set of plots (memoized).
  // This is the single "free" behaviour: quantile-based with outlier
  // clipping, union of all ordinary curves so everything stays visible.
  // Sampled over `sampleX` (the current visible X range), so zooming X
  // re-derives Y and adapts to whatever is on screen instead of using the
  // stale curve-config xRange.
  const smartY = useMemo<CoordinatedRangeResult>(() => {
    void scopeVersion;
    if (plots.length === 0) {
      return { range: DEFAULT_Y, outliers: [] };
    }
    const hasPolar = plots.some((p) => curveSpecs[p.id]?.mode === 'polar');
    if (hasPolar) {
      const r = 4;
      return { range: [-r, r], outliers: [] };
    }
    return deriveSmartY(plots, sampleX, curveSpecs);
  }, [plots, scopeVersion, curveSpecs, sampleX]);

  // The default view always uses the adaptive free range. The X is `sampleX`
  // (the latest plot's configured xRange until the user pans/zooms, then
  // their current X) so a fresh load shows the natural domain.
  const defaultView = useMemo<ViewBox>(() => {
    if (plots.length === 0) return { x: DEFAULT_X, y: DEFAULT_Y };
    return { x: sampleX, y: smartY.range };
  }, [sampleX, smartY]);

  // X is always the sampled / current X (symmetric with how pan & zoom write
  // `userView`).
  const effectiveX = sampleX;
  // 'manual' mode respects the user-set Y. In 'free' mode the adaptive smart
  // range is used — BUT once the user has interacted (`effectiveUserView`
  // exists) we must respect their Y too, otherwise the canvas sync effect
  // bounces Y back to the smart range on every pan/zoom (rebound bug). Only
  // the very first render, or after a reset (which clears `userView`), falls
  // back to `defaultView.y`. X and Y are now symmetric.
  const effectiveY =
    rangeMode === 'manual' || (rangeMode === 'free' && effectiveUserView)
      ? effectiveUserView!.y
      : defaultView.y;

  // Per-plot independent Y ranges for facet mode. Each curve gets its own
  // smartYRange (P5/P95 quantile based) so x², sin x, eˣ each get a
  // sensibly-scaled mini-plot instead of being crushed onto a shared axis.
  // NOTE: must be declared after `effectiveX` since it depends on it
  // (Temporal Dead Zone — referencing a `const` before its declaration
  // throws ReferenceError at runtime).
  const facetYRanges = useMemo<[number, number][]>(() => {
    void scopeVersion;
    if (compareMode !== 'facet') return [];
    return plots.map((p) => {
      const spec = curveSpecs[p.id] ?? defaultSpecForPlot(p);
      if (spec.mode === 'polar') return [-4, 4] as [number, number];
      const samples = sampleCurve(spec, effectiveX, 300);
      return smartYRange(samples, {
        lowerQuantile: 0.05,
        upperQuantile: 0.95,
        includeZero: true,
        padding: 0.1,
      });
    });
     
  }, [plots, effectiveX, compareMode, scopeVersion, curveSpecs]);

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
    setRangeMode('free');
  }, []);

  const handleRangeChange = useCallback(
    (which: 'x' | 'y', index: 0 | 1, value: number) => {
      // Manually editing the Y range switches to 'manual' mode so the
      // user's value is respected instead of being overwritten by the
      // adaptive free range.
      if (which === 'y') setRangeMode('manual');
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

  /* ----------------------- Export dialog ---------------------------- */
  const [exportOpen, setExportOpen] = useState(false);

  /* ----------------------- Export handlers -------------------------- */
  const canvasWrapperRef = useRef<HTMLDivElement>(null);

  const handleExportPNG = useCallback(() => {
    // 打开导出对话框（统一走 Tauri 原生保存对话框 + DPI 选项）
    setExportOpen(true);
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
      showLegend,
      overlays,
      curveSpecs,
    }),
    [plots, theme, effectiveX, effectiveY, handleViewChange, handleResetView, handleInsertExample, showLegend, overlays, curveSpecs],
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
        showLegend={showLegend}
        onToggleLegend={() => setShowLegend((v) => !v)}
        freeParamCount={freeParamCount}
        slidersCollapsed={slidersCollapsed}
        onToggleSliders={() => setSlidersCollapsed(!slidersCollapsed)}
      />
      <ParameterSliders
        plots={plots.filter(p => p.plotType !== 'surface3d')}
        className="parameter-sliders-container"
      />
      <PlotCurveEditor plots={plots} specs={curveSpecs} onSpecChange={handleSpecChange} />
      <Plot2DAdvancedPanel
        plots={plots}
        xRange={effectiveX}
        yRange={effectiveY}
        outliers={smartY.outliers}
        rangeMode={rangeMode}
        onRangeModeChange={setRangeMode}
        compareMode={compareMode}
        onCompareModeChange={setUserCompareMode}
        onOverlaysChange={setOverlays}
      />
      <div ref={canvasWrapperRef} className="relative min-h-0 flex-1">
        {compareMode === 'facet' && plots.length > 1 ? (
          <FacetGrid
            plots={plots}
            xRange={effectiveX}
            facetYRanges={facetYRanges}
            theme={theme}
            curveSpecs={curveSpecs}
          />
        ) : (
          <>
            <Plot2DCanvas {...canvasProps} />
            <RegionZoom
              wrapperRef={canvasWrapperRef}
              xRange={effectiveX}
              yRange={effectiveY}
              onViewChange={handleViewChange}
            />
            <ViewControls
              onZoomIn={handleZoomIn}
              onZoomOut={handleZoomOut}
              onReset={handleReset}
              onCenter={handleReset}
              compact
            />
          </>
        )}
      </div>
      <PlotExpandDialog open={expandOpen} onClose={() => setExpandOpen(false)} curveSpecs={curveSpecs} />

      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        canvasRef={canvasWrapperRef}
        defaultName={`omnimath-plot-${Date.now()}`}
        title="导出 2D 图像"
        description="选择分辨率后导出 PNG 图像"
      />
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
