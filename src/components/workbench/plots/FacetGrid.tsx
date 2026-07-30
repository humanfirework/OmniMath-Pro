'use client';

/**
 * OmniMath Pro — FacetGrid (multi-function comparison view)
 *
 * Renders each plot in its own mini-canvas with an independent Y axis so
 * functions with wildly different magnitudes (x², sin x, eˣ) can be
 * compared clearly. The X axis range is shared across all facets.
 *
 * Layout: CSS Grid, 2 columns, rows auto-calculated.
 *
 * Each FacetPlot is a lightweight canvas renderer — it draws grid, axes,
 * the curve, and a hover tooltip, but does NOT support drag-pan or
 * pinch-zoom (those interactions belong to the overlay mode). This keeps
 * the facet view fast and focused on shape comparison.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  sampleFunction,
  sampleCurve,
  niceNumber,
  type Curve2DSpec,
  type PlotSample,
} from '@/lib/plots/plot2d';
import type { PlotConfig } from '@/lib/store/workbench';
import { useScopeVersion } from '@/lib/hooks/useScopeVersion';

/* ----------------------------- Constants ----------------------------- */

const PLOT_COLORS = [
  '#2dd4bf', // teal
  '#fbbf24', // amber
  '#fb7185', // rose
  '#34d399', // emerald
  '#a78bfa', // violet
  '#fb923c', // orange
];

const PADDING = { left: 40, right: 10, top: 22, bottom: 22 };

/* ----------------------------- Props ----------------------------- */

export interface FacetGridProps {
  plots: PlotConfig[];
  xRange: [number, number];
  /** Independent Y range per plot (same length & order as `plots`). */
  facetYRanges: [number, number][];
  theme: 'dark' | 'light';
  /** Resolved per-curve specs from the panel's curve editor (optional). */
  curveSpecs?: Record<string, Curve2DSpec>;
}

/* =================================================================== */
/*  FacetGrid                                                          */
/* =================================================================== */

export function FacetGrid({ plots, xRange, facetYRanges, theme, curveSpecs }: FacetGridProps) {
  // 2 columns; rows auto-flow. For 1-2 plots → 1 row; 3-4 → 2 rows; etc.
  return (
    <div
      className="grid h-full w-full gap-2 p-2 overflow-auto"
      style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}
    >
      {plots.map((plot, idx) => (
        <FacetPlot
          key={plot.id}
          plot={plot}
          color={plot.color || PLOT_COLORS[idx % PLOT_COLORS.length]}
          xRange={xRange}
          yRange={facetYRanges[idx] ?? [-6, 6]}
          theme={theme}
          spec={curveSpecs?.[plot.id]}
        />
      ))}
    </div>
  );
}

/* =================================================================== */
/*  FacetPlot — single mini-canvas                                     */
/* =================================================================== */

interface FacetPlotProps {
  plot: PlotConfig;
  color: string;
  xRange: [number, number];
  yRange: [number, number];
  theme: 'dark' | 'light';
  /** Resolved curve spec (mode + exprs + parameter range), if provided. */
  spec?: Curve2DSpec;
}

interface HoverState {
  sx: number;
  sy: number;
  wx: number;
  wy: number;
  snap?: PlotSample;
}

function FacetPlot({ plot, color, xRange, yRange, theme, spec }: FacetPlotProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const sizeRef = useRef<{ w: number; h: number; dpr: number }>({ w: 0, h: 0, dpr: 1 });
  const hoverRef = useRef<HoverState | null>(null);
  const redrawScheduledRef = useRef(false);
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });

  const visible = plot.visible !== false;

  // Sample the curve over the shared X range. `scopeVersion` re-samples
  // when a slider / variable changes so facets stay in sync with the
  // overlay canvas and the Variables panel.
  const scopeVersion = useScopeVersion();
  const samples = useMemo<PlotSample[]>(() => {
    void scopeVersion;
    if (!visible) return [];
    if (spec) {
      return sampleCurve(spec, xRange, 400);
    }
    const plotType2d = (plot.plotType === 'surface3d' ? 'cartesian' : plot.plotType ?? 'cartesian') as
      | 'cartesian' | 'polar' | 'parametric';
    return sampleFunction(plot.expression, xRange, plotType2d, 400);
     
  }, [plot.expression, plot.plotType, xRange, visible, scopeVersion, spec]);

  // Coordinate mapping.
  const dataToScreen = useCallback(
    (wx: number, wy: number): [number, number] => {
      const { w, h } = sizeRef.current;
      const xSpan = xRange[1] - xRange[0];
      const ySpan = yRange[1] - yRange[0];
      if (!Number.isFinite(xSpan) || xSpan === 0 || !Number.isFinite(ySpan) || ySpan === 0) {
        return [NaN, NaN];
      }
      const plotW = Math.max(1, w - PADDING.left - PADDING.right);
      const plotH = Math.max(1, h - PADDING.top - PADDING.bottom);
      const sx = PADDING.left + ((wx - xRange[0]) / xSpan) * plotW;
      const sy = PADDING.top + (1 - (wy - yRange[0]) / ySpan) * plotH;
      return [sx, sy];
    },
    [xRange, yRange],
  );

  const screenToData = useCallback((sx: number, sy: number): [number, number] => {
    const { w, h } = sizeRef.current;
    const xSpan = xRange[1] - xRange[0];
    const ySpan = yRange[1] - yRange[0];
    if (!Number.isFinite(xSpan) || xSpan === 0 || !Number.isFinite(ySpan) || ySpan === 0) {
      return [NaN, NaN];
    }
    const plotW = Math.max(1, w - PADDING.left - PADDING.right);
    const plotH = Math.max(1, h - PADDING.top - PADDING.bottom);
    const wx = xRange[0] + ((sx - PADDING.left) / plotW) * xSpan;
    const wy = yRange[0] + (1 - (sy - PADDING.top) / plotH) * ySpan;
    return [wx, wy];
  }, [xRange, yRange]);

  // Draw.
  const drawNow = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { w, h, dpr } = sizeRef.current;
    if (w === 0 || h === 0) return;
    if (!Number.isFinite(dpr) || dpr <= 0) return;

    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const dark = theme === 'dark';
    const bg = getCssVar('--background', dark ? '#2e2e32' : '#ffffff');
    const fg = getCssVar('--foreground', dark ? '#f0f2f5' : '#1f1f1f');
    const gridMajor = dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.07)';
    const gridMinor = dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.035)';
    const tickLabelColor = getCssVar('--muted-foreground', dark ? '#b0b5bf' : '#4a4a52');
    const tooltipBg = getCssVar('--popover', dark ? '#18181b' : '#ffffff');
    const tooltipFg = getCssVar('--popover-foreground', dark ? '#fafafa' : '#171717');
    const tooltipBorder = getCssVar('--border', dark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.10)');

    // Background.
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Grid.
    const xNice = niceNumber(xRange, 6);
    const yNice = niceNumber(yRange, 5);
    ctx.lineWidth = 1;

    // Minor grid.
    ctx.strokeStyle = gridMinor;
    ctx.beginPath();
    const minorX = xNice.tickStep / 2;
    const minorY = yNice.tickStep / 2;
    for (let xv = Math.floor(xRange[0] / minorX) * minorX; xv <= xRange[1] + minorX * 0.5; xv += minorX) {
      const [sx] = dataToScreen(xv, 0);
      ctx.moveTo(sx, PADDING.top);
      ctx.lineTo(sx, h - PADDING.bottom);
    }
    for (let yv = Math.floor(yRange[0] / minorY) * minorY; yv <= yRange[1] + minorY * 0.5; yv += minorY) {
      const [, sy] = dataToScreen(0, yv);
      ctx.moveTo(PADDING.left, sy);
      ctx.lineTo(w - PADDING.right, sy);
    }
    ctx.stroke();

    // Major grid.
    ctx.strokeStyle = gridMajor;
    ctx.beginPath();
    for (const xv of xNice.ticks) {
      const [sx] = dataToScreen(xv, 0);
      ctx.moveTo(sx, PADDING.top);
      ctx.lineTo(sx, h - PADDING.bottom);
    }
    for (const yv of yNice.ticks) {
      const [, sy] = dataToScreen(0, yv);
      ctx.moveTo(PADDING.left, sy);
      ctx.lineTo(w - PADDING.right, sy);
    }
    ctx.stroke();

    // Axes (x=0, y=0).
    ctx.strokeStyle = fg;
    ctx.lineWidth = 1.5;
    let [, axisYScreen] = dataToScreen(0, 0);
    if (axisYScreen < PADDING.top) axisYScreen = PADDING.top;
    if (axisYScreen > h - PADDING.bottom) axisYScreen = h - PADDING.bottom;
    let [axisXScreen] = dataToScreen(0, 0);
    if (axisXScreen < PADDING.left) axisXScreen = PADDING.left;
    if (axisXScreen > w - PADDING.right) axisXScreen = w - PADDING.right;
    ctx.beginPath();
    ctx.moveTo(PADDING.left, axisYScreen);
    ctx.lineTo(w - PADDING.right, axisYScreen);
    ctx.moveTo(axisXScreen, PADDING.top);
    ctx.lineTo(axisXScreen, h - PADDING.bottom);
    ctx.stroke();

    // Tick labels.
    ctx.font = '10px ui-monospace, "Geist Mono", monospace';
    ctx.fillStyle = tickLabelColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (const xv of xNice.ticks) {
      if (Math.abs(xv) < xNice.tickStep * 0.01) continue;
      const [sx] = dataToScreen(xv, 0);
      const ty = Math.min(Math.max(axisYScreen + 3, PADDING.top), h - PADDING.bottom - 12);
      ctx.fillText(formatTickLabel(xv), sx, ty);
    }
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (const yv of yNice.ticks) {
      if (Math.abs(yv) < yNice.tickStep * 0.01) continue;
      const [, sy] = dataToScreen(0, yv);
      const tx = Math.min(Math.max(axisXScreen - 4, PADDING.left + 10), w - PADDING.right);
      ctx.fillText(formatTickLabel(yv), tx, sy);
    }

    // Curve.
    if (samples.length >= 2) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = dark ? 6 : 4;
      ctx.beginPath();
      let penDown = false;
      for (const s of samples) {
        if (!Number.isFinite(s.x) || !Number.isFinite(s.y)) {
          penDown = false;
          continue;
        }
        const [sx, sy] = dataToScreen(s.x, s.y);
        if (!penDown) {
          ctx.moveTo(sx, sy);
          penDown = true;
        } else {
          ctx.lineTo(sx, sy);
        }
      }
      ctx.stroke();
      ctx.restore();
    }

    // Hover tooltip.
    const hover = hoverRef.current;
    if (hover) {
      // Crosshair.
      ctx.save();
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(hover.sx, PADDING.top);
      ctx.lineTo(hover.sx, h - PADDING.bottom);
      ctx.moveTo(PADDING.left, hover.sy);
      ctx.lineTo(w - PADDING.right, hover.sy);
      ctx.stroke();
      ctx.restore();

      // Snap ring.
      if (hover.snap) {
        const [ssx, ssy] = dataToScreen(hover.snap.x, hover.snap.y);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(ssx, ssy, 4, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Tooltip box.
      const lines = [
        `x = ${formatNum(hover.wx)}`,
        `y = ${formatNum(hover.wy)}`,
      ];
      ctx.font = '10px ui-monospace, "Geist Mono", monospace';
      const pad = 5;
      const lh = 13;
      let boxW = 0;
      for (const ln of lines) boxW = Math.max(boxW, ctx.measureText(ln).width);
      boxW += pad * 2;
      const boxH = lines.length * lh + pad * 2;
      let bx = hover.sx + 10;
      let by = hover.sy + 10;
      if (bx + boxW > w - PADDING.right) bx = hover.sx - boxW - 10;
      if (by + boxH > h - PADDING.bottom) by = hover.sy - boxH - 10;
      if (bx < PADDING.left) bx = PADDING.left;
      if (by < PADDING.top) by = PADDING.top;
      ctx.fillStyle = tooltipBg;
      ctx.strokeStyle = tooltipBorder;
      ctx.lineWidth = 1;
      ctx.fillRect(bx, by, boxW, boxH);
      ctx.strokeRect(bx, by, boxW, boxH);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillStyle = tooltipFg;
      for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], bx + pad, by + pad + i * lh);
      }
    }
  }, [samples, color, theme, dataToScreen, xRange, yRange]);

  // rAF scheduler.
  const drawNowRef = useRef(drawNow);
  useEffect(() => { drawNowRef.current = drawNow; }, [drawNow]);
  const scheduleRedraw = useCallback(() => {
    if (redrawScheduledRef.current) return;
    redrawScheduledRef.current = true;
    rafRef.current = requestAnimationFrame(() => {
      redrawScheduledRef.current = false;
      drawNowRef.current();
    });
  }, []);

  // Resize observer.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const update = () => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      if (!Number.isFinite(rect.width) || !Number.isFinite(rect.height)) return;
      sizeRef.current = { w: rect.width, h: rect.height, dpr };
      setCanvasSize({ w: rect.width, h: rect.height });
      scheduleRedraw();
    };
    const ro = new ResizeObserver(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(update, 60);
    });
    ro.observe(container);
    update();
    return () => {
      ro.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, [scheduleRedraw]);

  // Redraw on deps change.
  useEffect(() => { scheduleRedraw(); }, [theme, samples, xRange, yRange, scheduleRedraw]);

  // Hover handler.
  const handlePointerMove = useCallback((e: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const [wx, wy] = screenToData(sx, sy);
    // Snap to nearest sample.
    let snap: PlotSample | undefined;
    let bestDist = Infinity;
    for (const s of samples) {
      if (!Number.isFinite(s.x) || !Number.isFinite(s.y)) continue;
      const [ssx, ssy] = dataToScreen(s.x, s.y);
      const d = Math.hypot(ssx - sx, ssy - sy);
      if (d < bestDist) { bestDist = d; snap = s; }
    }
    if (bestDist > 25) snap = undefined;
    hoverRef.current = { sx, sy, wx, wy, snap };
    scheduleRedraw();
  }, [samples, screenToData, dataToScreen, scheduleRedraw]);

  const handlePointerLeave = useCallback(() => {
    hoverRef.current = null;
    scheduleRedraw();
  }, [scheduleRedraw]);

  // Cleanup.
  useEffect(() => {
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative min-h-[140px] overflow-hidden rounded-md border border-border/50 bg-background"
    >
      {/* Title bar — expression label + Y range badge */}
      <div className="absolute left-1.5 top-1 z-10 flex items-center gap-1.5 rounded bg-muted/50 px-1.5 py-0.5 backdrop-blur-sm">
        <span
          className="inline-block size-2 rounded-full"
          style={{ backgroundColor: color }}
        />
        <span className="max-w-[180px] truncate font-mono text-[10px] text-foreground/80">
          {plot.expression}
        </span>
      </div>
      <div className="absolute right-1.5 top-1 z-10 rounded bg-muted/50 px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground backdrop-blur-sm">
        y ∈ [{formatNum(yRange[0])}, {formatNum(yRange[1])}]
      </div>
      <canvas
        ref={canvasRef}
        className="block h-full w-full touch-none select-none"
        style={{ cursor: 'crosshair' }}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
      />
    </div>
  );
}

/* ----------------------- Local helpers ---------------------------- */

function getCssVar(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function formatTickLabel(v: number): string {
  if (!Number.isFinite(v)) return '';
  if (v === 0) return '0';
  const abs = Math.abs(v);
  if (abs >= 1e4 || abs < 1e-3) {
    return v.toExponential(1).replace('e+', 'e').replace('e-0', 'e-');
  }
  const s = v.toPrecision(3);
  return parseFloat(s).toString();
}

function formatNum(v: number): string {
  if (!Number.isFinite(v)) return '—';
  if (v === 0) return '0';
  const abs = Math.abs(v);
  if (abs >= 1e5 || abs < 1e-3) {
    return v.toExponential(2).replace('e+', 'e').replace('e-0', 'e-');
  }
  const s = v.toFixed(3);
  return parseFloat(s).toString();
}
