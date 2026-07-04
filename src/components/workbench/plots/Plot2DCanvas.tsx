'use client';

/**
 * OmniMath Pro — Interactive 2D Plot Canvas
 *
 * Full interactivity:
 *   • Mouse wheel: zoom toward cursor (Shift = horizontal-only)
 *   • Mouse drag: pan both axes
 *   • Mouse move: crosshair + tooltip with precise (x, y), plus a "snap ring"
 *     on the nearest visible curve point
 *   • Double click: reset view to default range
 *   • Touch: one-finger pan, two-finger pinch zoom
 *
 * Rendering:
 *   • DPI-aware crisp canvas (devicePixelRatio)
 *   • Major + minor grid, axes with arrowheads, "nice" tick labels
 *   • Polylines per plot with NaN gap handling, 2px anti-aliased strokes
 *   • Auto-detected extrema (red dots) and zeros (blue dots)
 *   • Glass legend top-right; crosshair coordinate readout near cursor
 *   • ResizeObserver for container resize
 *   • requestAnimationFrame-batched redraws
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react';
import {
  sampleFunction,
  findExtrema,
  formatCoord,
  niceNumber,
  autoYRange,
  type PlotSample,
} from '@/lib/plots/plot2d';
import { AlertTriangle, RotateCcw, Maximize } from 'lucide-react';
import type { PlotConfig } from '@/lib/store/workbench';

/* ----------------------------- Props ----------------------------- */

export interface Plot2DCanvasProps {
  plots: PlotConfig[];
  theme: 'dark' | 'light';
  /** Current X view range. Controlled by the parent panel. */
  xRange: [number, number];
  /** Current Y view range. Controlled by the parent panel. */
  yRange: [number, number];
  /** Called whenever the user pans / zooms (debounced via rAF). */
  onViewChange?: (xRange: [number, number], yRange: [number, number]) => void;
  /** Called when user double-clicks (reset). */
  onResetView?: () => void;
  /** Called when the user clicks an example chip (empty state). */
  onInsertExample?: (expr: string) => void;
  /** Show grid + ticks + axis labels. */
  showGrid?: boolean;
  /** Show extrema (red) and zeros (blue) markers. */
  showMarkers?: boolean;
}

/* --------------------------- Constants --------------------------- */

const PLOT_COLORS = [
  '#2dd4bf', // teal
  '#fbbf24', // amber
  '#fb7185', // rose
  '#34d399', // emerald
  '#a78bfa', // violet
  '#fb923c', // orange
];

const EXAMPLES = [
  { expr: 'sin x', label: 'sin x' },
  { expr: 'x^2', label: 'x²' },
  { expr: 'tan x', label: 'tan x' },
  { expr: 'e^x', label: 'eˣ' },
  { expr: 'polarplot(cos(2x))', label: 'polarplot(cos 2x)' },
];

/* ------------------------- Helper types ------------------------- */

interface ComputedPlot {
  config: PlotConfig;
  samples: PlotSample[];
  extrema: ReturnType<typeof findExtrema>;
  visible: boolean;
}

interface HoverState {
  /** screen-space pixel position of cursor (CSS pixels) */
  sx: number;
  sy: number;
  /** world (data) coordinates at cursor */
  wx: number;
  wy: number;
  /** snapped (nearest curve) sample point, if any */
  snap?: PlotSample;
  snapColor?: string;
}

/* =================================================================== */
/*  Component                                                          */
/* =================================================================== */

export function Plot2DCanvas({
  plots,
  theme,
  xRange,
  yRange,
  onViewChange,
  onResetView,
  onInsertExample,
  showGrid = true,
  showMarkers = true,
}: Plot2DCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const sizeRef = useRef<{ w: number; h: number; dpr: number }>({ w: 0, h: 0, dpr: 1 });
  const viewRef = useRef<{ x: [number, number]; y: [number, number] }>({
    x: xRange,
    y: yRange,
  });
  const hoverRef = useRef<HoverState | null>(null);
  const dragRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    origX: [number, number];
    origY: [number, number];
    moved: boolean;
  } | null>(null);
  const pinchRef = useRef<{ d: number; cx: number; cy: number } | null>(null);
  const redrawScheduledRef = useRef(false);
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });
  const [drawError, setDrawError] = useState<string | null>(null);

  /* ----------------------- Schedule redraw -------------------------- */
  // We keep a ref to the latest `drawNow` so the rAF callback always invokes
  // the freshest closure (with up-to-date deps) without rescheduling.
  const drawNowRef = useRef<() => void>(() => {});
  const scheduleRedraw = useCallback(() => {
    if (redrawScheduledRef.current) return;
    redrawScheduledRef.current = true;
    rafRef.current = requestAnimationFrame(() => {
      redrawScheduledRef.current = false;
      drawNowRef.current();
    });
  }, []);

  // Keep viewRef in sync with props.
  useEffect(() => {
    viewRef.current = { x: xRange, y: yRange };
    scheduleRedraw();
  }, [xRange, yRange, scheduleRedraw]);

  /* ----------------------- Sample computation ----------------------- */
  // Sample over the *visible* X range so panning/zooming feels like an
  // infinite canvas: the curve is re-evaluated for whatever region the user
  // is currently looking at. Sample density scales with canvas width (up to
  // the sampler's own cap) to keep curves smooth.
  const computed = useMemo<ComputedPlot[]>(() => {
    const plotW = Math.max(1, canvasSize.w - PADDING.left - PADDING.right);
    const sampleCount = Math.min(2000, Math.max(400, Math.floor(plotW * 2)));
    return plots.map((p, idx) => {
      // surface3d plots can't render in 2D — coerce to cartesian so the
      // sampler still produces something (the engine shouldn't normally
      // send surface3d plots here, but be defensive).
      const plotType2d = (p.plotType === 'surface3d' ? 'cartesian' : p.plotType ?? 'cartesian') as
        | 'cartesian' | 'polar' | 'parametric';
      const samples = sampleFunction(
        p.expression,
        xRange,
        plotType2d,
        sampleCount,
      );
      const extrema = findExtrema(samples);
      return {
        config: { ...p, color: p.color || PLOT_COLORS[idx % PLOT_COLORS.length] },
        samples,
        extrema,
        visible: p.visible !== false,
      };
    });
  }, [plots, xRange, canvasSize.w]);

  /* ----------------------- Coordinate mapping ----------------------- */
  const PADDING = { left: 48, right: 16, top: 16, bottom: 32 };

  const dataToScreen = useCallback(
    (wx: number, wy: number): [number, number] => {
      const { w, h } = sizeRef.current;
      const { x: vx, y: vy } = viewRef.current;
      const xSpan = vx[1] - vx[0];
      const ySpan = vy[1] - vy[0];
      if (!Number.isFinite(xSpan) || xSpan === 0 || !Number.isFinite(ySpan) || ySpan === 0) {
        return [NaN, NaN];
      }
      const plotW = Math.max(1, w - PADDING.left - PADDING.right);
      const plotH = Math.max(1, h - PADDING.top - PADDING.bottom);
      const sx = PADDING.left + ((wx - vx[0]) / xSpan) * plotW;
      const sy = PADDING.top + (1 - (wy - vy[0]) / ySpan) * plotH;
      return [sx, sy];
    },
    [],
  );

  const screenToData = useCallback((sx: number, sy: number): [number, number] => {
    const { w, h } = sizeRef.current;
    const { x: vx, y: vy } = viewRef.current;
    const xSpan = vx[1] - vx[0];
    const ySpan = vy[1] - vy[0];
    if (!Number.isFinite(xSpan) || xSpan === 0 || !Number.isFinite(ySpan) || ySpan === 0) {
      return [NaN, NaN];
    }
    const plotW = Math.max(1, w - PADDING.left - PADDING.right);
    const plotH = Math.max(1, h - PADDING.top - PADDING.bottom);
    const wx = vx[0] + ((sx - PADDING.left) / plotW) * xSpan;
    const wy = vy[0] + (1 - (sy - PADDING.top) / plotH) * ySpan;
    return [wx, wy];
  }, []);

  /* ----------------------- Actual draw ------------------------------ */
  const drawNow = useCallback(() => {
    try {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const { w, h, dpr } = sizeRef.current;
      if (w === 0 || h === 0) return;
      if (!Number.isFinite(dpr) || dpr <= 0) return;

    // Reset & DPI scale.
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const dark = theme === 'dark';
    const bg = getCssVar('--background', dark ? '#2e2e32' : '#ffffff');
    const fg = getCssVar('--foreground', dark ? '#f0f2f5' : '#1f1f1f');
    const axisColor = getCssVar('--muted-foreground', dark ? '#c4cad4' : '#555560');
    const gridMajor = dark ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.10)';
    const gridMinor = dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)';
    const tickLabelColor = getCssVar('--muted-foreground', dark ? '#d0d4dc' : '#404048');
    const axisLabelColor = getCssVar('--muted-foreground', dark ? '#c4cad4' : '#606068');
    const crosshairColor = getCssVar('--primary', '#2dd4bf');

    // Semantic marker / overlay colors for high contrast in both themes.
    const markerStroke = getCssVar('--background', dark ? '#18181b' : '#ffffff');
    const zeroFill = dark ? '#93c5fd' : '#2563eb';
    const tooltipBg = dark ? 'rgba(39,39,42,0.92)' : 'rgba(255,255,255,0.92)';
    const tooltipBorder = dark ? 'rgba(255,255,255,0.20)' : 'rgba(0,0,0,0.10)';
    const legendBg = dark ? 'rgba(39,39,42,0.80)' : 'rgba(255,255,255,0.80)';
    const legendBorder = dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)';

    // Background.
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    const { x: vx, y: vy } = viewRef.current;

    /* ---------- Grid ---------- */
    if (showGrid) {
      const xNice = niceNumber(vx, 10);
      const yNice = niceNumber(vy, 8);
      // Minor grid: half-step.
      const minorX = xNice.tickStep / 2;
      const minorY = yNice.tickStep / 2;
      ctx.lineWidth = 1;
      ctx.strokeStyle = gridMinor;
      ctx.beginPath();
      const xMinTick = Math.floor(vx[0] / minorX) * minorX;
      for (let xv = xMinTick; xv <= vx[1] + minorX * 0.5; xv += minorX) {
        const [sx] = dataToScreen(xv, 0);
        ctx.moveTo(sx, PADDING.top);
        ctx.lineTo(sx, h - PADDING.bottom);
      }
      const yMinTick = Math.floor(vy[0] / minorY) * minorY;
      for (let yv = yMinTick; yv <= vy[1] + minorY * 0.5; yv += minorY) {
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

      /* ---------- Axes (x=0, y=0) with arrowheads ---------- */
      ctx.strokeStyle = axisColor;
      ctx.lineWidth = 1.4;
      ctx.fillStyle = axisColor;
      const [, axisYScreen] = dataToScreen(0, 0);
      const [axisXScreen] = dataToScreen(0, 0);

      // X axis (horizontal line at y=0 if visible, else at top/bottom edge).
      let yAxisScreen = axisYScreen;
      if (yAxisScreen < PADDING.top) yAxisScreen = PADDING.top;
      if (yAxisScreen > h - PADDING.bottom) yAxisScreen = h - PADDING.bottom;
      ctx.beginPath();
      ctx.moveTo(PADDING.left, yAxisScreen);
      ctx.lineTo(w - PADDING.right, yAxisScreen);
      ctx.stroke();
      // Arrowhead at right.
      ctx.beginPath();
      ctx.moveTo(w - PADDING.right, yAxisScreen);
      ctx.lineTo(w - PADDING.right - 6, yAxisScreen - 4);
      ctx.lineTo(w - PADDING.right - 6, yAxisScreen + 4);
      ctx.closePath();
      ctx.fill();

      // Y axis (vertical line at x=0 if visible, else at left edge).
      let xAxisScreen = axisXScreen;
      if (xAxisScreen < PADDING.left) xAxisScreen = PADDING.left;
      if (xAxisScreen > w - PADDING.right) xAxisScreen = w - PADDING.right;
      ctx.beginPath();
      ctx.moveTo(xAxisScreen, PADDING.top);
      ctx.lineTo(xAxisScreen, h - PADDING.bottom);
      ctx.stroke();
      // Arrowhead at top.
      ctx.beginPath();
      ctx.moveTo(xAxisScreen, PADDING.top);
      ctx.lineTo(xAxisScreen - 4, PADDING.top + 6);
      ctx.lineTo(xAxisScreen + 4, PADDING.top + 6);
      ctx.closePath();
      ctx.fill();

      /* ---------- Tick labels ---------- */
      ctx.font = '11px ui-monospace, "Geist Mono", monospace';
      ctx.fillStyle = tickLabelColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (const xv of xNice.ticks) {
        if (Math.abs(xv) < xNice.tickStep * 0.01) continue; // skip 0 on x
        const [sx] = dataToScreen(xv, 0);
        const label = formatTickLabel(xv);
        // Place below the x-axis (or near the bottom edge).
        const ty = Math.min(Math.max(yAxisScreen + 4, PADDING.top), h - PADDING.bottom - 14);
        ctx.fillText(label, sx, ty);
      }
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (const yv of yNice.ticks) {
        if (Math.abs(yv) < yNice.tickStep * 0.01) continue;
        const [, sy] = dataToScreen(0, yv);
        const label = formatTickLabel(yv);
        const tx = Math.min(Math.max(xAxisScreen - 6, PADDING.left + 14), w - PADDING.right);
        ctx.fillText(label, tx, sy);
      }

      // Origin "0" label.
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillText('0', xAxisScreen - 4, yAxisScreen + 4);

      // Axis labels (x, y).
      ctx.fillStyle = axisLabelColor;
      ctx.font = 'italic 12px ui-serif, Georgia, serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText('x', w - PADDING.right - 4, yAxisScreen - 4);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('y', xAxisScreen + 6, PADDING.top + 2);
    }

    /* ---------- Plot polylines ---------- */
    const visiblePlots = computed.filter((p) => p.visible);
    for (const plot of visiblePlots) {
      const samples = plot.samples;
      if (samples.length < 2) continue;
      ctx.strokeStyle = plot.config.color;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
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
    }

    /* ---------- Extrema + zero markers ---------- */
    if (showMarkers) {
      for (const plot of visiblePlots) {
        // Zeros — blue dots.
        ctx.fillStyle = zeroFill;
        ctx.strokeStyle = markerStroke;
        ctx.lineWidth = 1.5;
        for (const z of plot.extrema.zeros) {
          const [sx, sy] = dataToScreen(z.x, z.y);
          if (sx < PADDING.left || sx > w - PADDING.right) continue;
          if (sy < PADDING.top || sy > h - PADDING.bottom) continue;
          ctx.beginPath();
          ctx.arc(sx, sy, 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
        // Maxima + minima — red dots with glow.
        const allExtrema = [...plot.extrema.maxima, ...plot.extrema.minima];
        for (const e of allExtrema) {
          const [sx, sy] = dataToScreen(e.x, e.y);
          if (sx < PADDING.left || sx > w - PADDING.right) continue;
          if (sy < PADDING.top || sy > h - PADDING.bottom) continue;
          // Glow.
          ctx.save();
          ctx.shadowColor = 'rgba(244,63,94,0.6)';
          ctx.shadowBlur = 8;
          ctx.fillStyle = '#fb7185';
          ctx.beginPath();
          ctx.arc(sx, sy, 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          ctx.strokeStyle = markerStroke;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(sx, sy, 4, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }

    /* ---------- Crosshair + snap ring + tooltip ---------- */
    const hover = hoverRef.current;
    if (hover && !dragRef.current?.active) {
      // Dashed crosshair lines.
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = crosshairColor;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 1;
      ctx.beginPath();
      // Vertical line at cursor x.
      ctx.moveTo(hover.sx, PADDING.top);
      ctx.lineTo(hover.sx, h - PADDING.bottom);
      // Horizontal line at cursor y.
      ctx.moveTo(PADDING.left, hover.sy);
      ctx.lineTo(w - PADDING.right, hover.sy);
      ctx.stroke();
      ctx.restore();

      // Snap ring.
      if (hover.snap && hover.snapColor) {
        const [ssx, ssy] = dataToScreen(hover.snap.x, hover.snap.y);
        ctx.save();
        ctx.strokeStyle = hover.snapColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(ssx, ssy, 6, 0, Math.PI * 2);
        ctx.stroke();
        // Small filled dot in center.
        ctx.fillStyle = hover.snapColor;
        ctx.beginPath();
        ctx.arc(ssx, ssy, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Tooltip box.
      const lines: string[] = [];
      lines.push(`x = ${formatNumberForTooltip(hover.wx)}`);
      lines.push(`y = ${formatNumberForTooltip(hover.wy)}`);
      if (hover.snap) {
        lines.push(`▸ ${formatCoord(hover.snap.x, hover.snap.y)}`);
      }
      ctx.font = '11px ui-monospace, "Geist Mono", monospace';
      const padding = 6;
      const lineHeight = 14;
      let boxW = 0;
      for (const ln of lines) boxW = Math.max(boxW, ctx.measureText(ln).width);
      boxW += padding * 2;
      const boxH = lines.length * lineHeight + padding * 2;
      // Position: prefer top-right of cursor; flip if near right edge.
      let bx = hover.sx + 12;
      let by = hover.sy + 12;
      if (bx + boxW > w - PADDING.right) bx = hover.sx - boxW - 12;
      if (by + boxH > h - PADDING.bottom) by = hover.sy - boxH - 12;
      if (bx < PADDING.left) bx = PADDING.left;
      if (by < PADDING.top) by = PADDING.top;

      // Glass background.
      ctx.save();
      ctx.fillStyle = tooltipBg;
      ctx.strokeStyle = tooltipBorder;
      ctx.lineWidth = 1;
      drawRoundRect(ctx, bx, by, boxW, boxH, 6);
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      ctx.fillStyle = fg;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      for (let i = 0; i < lines.length; i++) {
        const isSnap = i === 2;
        ctx.fillStyle = isSnap ? crosshairColor : fg;
        ctx.fillText(lines[i], bx + padding, by + padding + i * lineHeight);
      }
    }

    /* ---------- Legend (top-right) ---------- */
    if (visiblePlots.length > 0) {
      const legendPad = 8;
      const lineH = 16;
      ctx.font = '11px ui-monospace, "Geist Mono", monospace';
      const legendItems = visiblePlots.map((p) => {
        const expr = p.config.expression;
        const label =
          p.config.plotType === 'polar' ? `r = ${expr}` :
          p.config.plotType === 'parametric' ? `(t) = ${expr}` :
          `y = ${expr}`;
        return { color: p.config.color, label };
      });
      let legendW = 0;
      for (const it of legendItems) legendW = Math.max(legendW, ctx.measureText(it.label).width);
      legendW += 24 + legendPad * 2; // swatch + padding
      const legendH = legendItems.length * lineH + legendPad * 2;
      const lx = w - PADDING.right - legendW - 4;
      const ly = PADDING.top + 4;
      // Glass bg.
      ctx.save();
      ctx.fillStyle = legendBg;
      ctx.strokeStyle = legendBorder;
      ctx.lineWidth = 1;
      drawRoundRect(ctx, lx, ly, legendW, legendH, 6);
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      for (let i = 0; i < legendItems.length; i++) {
        const it = legendItems[i];
        const iy = ly + legendPad + i * lineH + lineH / 2;
        // Color swatch.
        ctx.fillStyle = it.color;
        drawRoundRect(ctx, lx + legendPad, iy - 5, 12, 10, 2);
        ctx.fill();
        // Label.
        ctx.fillStyle = fg;
        ctx.fillText(it.label, lx + legendPad + 18, iy);
      }
    }
    } catch (err) {
      console.error('[Plot2DCanvas] draw error:', err);
      setDrawError(err instanceof Error ? err.message : '绘制失败');
    }
  }, [computed, theme, dataToScreen, screenToData, showGrid, showMarkers]);

  // Keep the ref in sync so the rAF callback always uses the latest drawNow.
  // We must do this inside an effect (not during render) per React 19 rules.
  useEffect(() => {
    drawNowRef.current = drawNow;
  }, [drawNow]);

  /* ----------------------- Resize handling -------------------------- */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    let rafId: number | null = null;
    const updateSize = () => {
      if (!containerRef.current) return;
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      rafId = requestAnimationFrame(() => {
        const rect = container.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        if (!Number.isFinite(rect.width) || !Number.isFinite(rect.height) || !Number.isFinite(dpr)) return;
        sizeRef.current = {
          w: rect.width,
          h: rect.height,
          dpr,
        };
        setCanvasSize({ w: rect.width, h: rect.height });
        scheduleRedraw();
      });
    };
    const ro = new ResizeObserver(() => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(updateSize, 80);
    });
    ro.observe(container);
    // Initial measurement.
    updateSize();
    return () => {
      ro.disconnect();
      if (resizeTimer) clearTimeout(resizeTimer);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [scheduleRedraw]);

  /* ----------------------- Redraw on theme / plots change ----------- */
  useEffect(() => {
    scheduleRedraw();
  }, [theme, computed, scheduleRedraw]);

  /* ----------------------- Wheel zoom ------------------------------- */
  const handleWheel = useCallback(
    (e: ReactWheelEvent<HTMLCanvasElement>) => {
      try {
        e.preventDefault();
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const [wx, wy] = screenToData(sx, sy);
        const rawFactor = e.deltaY < 0 ? 1 / 1.15 : 1.15; // zoom in / out
        const factor = clamp(rawFactor, 0.5, 2);
        const horizontalOnly = e.shiftKey;
        const { x: vx, y: vy } = viewRef.current;
        let nx: [number, number] = clampRangeWidth([wx + (vx[0] - wx) * factor, wx + (vx[1] - wx) * factor]);
        let ny: [number, number] = vy;
        if (!horizontalOnly) {
          ny = clampRangeWidth([wy + (vy[0] - wy) * factor, wy + (vy[1] - wy) * factor]);
        }
        viewRef.current = { x: nx, y: ny };
        onViewChange?.(nx, ny);
        scheduleRedraw();
      } catch (err) {
        console.error('[Plot2DCanvas] wheel error:', err);
        setDrawError(err instanceof Error ? err.message : '缩放失败');
      }
    },
    [screenToData, onViewChange, scheduleRedraw],
  );

  /* ----------------------- Mouse drag (pan) ------------------------- */
  const handlePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      try {
        if (e.pointerType === 'touch' && pinchRef.current) return;
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        canvasRef.current?.setPointerCapture(e.pointerId);
        if (canvasRef.current) canvasRef.current.style.cursor = 'grabbing';
        dragRef.current = {
          active: true,
          startX: e.clientX,
          startY: e.clientY,
          origX: [...viewRef.current.x] as [number, number],
          origY: [...viewRef.current.y] as [number, number],
          moved: false,
        };
      } catch (err) {
        console.error('[Plot2DCanvas] pointer down error:', err);
      }
    },
    [],
  );

  const handlePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      try {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;

        // Drag-pan.
        if (dragRef.current?.active) {
          const dx = e.clientX - dragRef.current.startX;
          const dy = e.clientY - dragRef.current.startY;
          if (Math.abs(dx) > 2 || Math.abs(dy) > 2) dragRef.current.moved = true;
          const { w, h } = sizeRef.current;
          const plotW = Math.max(1, w - PADDING.left - PADDING.right);
          const plotH = Math.max(1, h - PADDING.top - PADDING.bottom);
          const wxShift = (dx / plotW) * (dragRef.current.origX[1] - dragRef.current.origX[0]);
          const wyShift = (dy / plotH) * (dragRef.current.origY[1] - dragRef.current.origY[0]);
          const nx: [number, number] = [dragRef.current.origX[0] - wxShift, dragRef.current.origX[1] - wxShift];
          const ny: [number, number] = [dragRef.current.origY[0] + wyShift, dragRef.current.origY[1] + wyShift];
          viewRef.current = { x: nx, y: ny };
          hoverRef.current = null;
          onViewChange?.(nx, ny);
          scheduleRedraw();
          return;
        }

        // Hover + snap.
        const [wx, wy] = screenToData(sx, sy);
        // Find nearest visible sample point (snapping).
        let best: PlotSample | undefined;
        let bestColor: string | undefined;
        let bestDist = Infinity;
        const snapPixelRadius = 30;
        for (const p of computed) {
          if (!p.visible) continue;
          // Find the sample whose SCREEN distance to cursor is smallest.
          // For cartesian, we can shortcut: find the sample whose x is nearest
          // to wx, then compare screen y. For polar/parametric, fall back to
          // brute force nearest in screen space (samples are small enough).
          if (p.config.plotType === 'cartesian' && p.samples.length > 0) {
            // Binary-ish search via linear scan (samples are sorted by x).
            let candidate: PlotSample | undefined;
            let candidateScreenDist = Infinity;
            for (const s of p.samples) {
              if (!Number.isFinite(s.x) || !Number.isFinite(s.y)) continue;
              if (s.x > wx + (viewRef.current.x[1] - viewRef.current.x[0])) break;
              const [ssx, ssy] = dataToScreen(s.x, s.y);
              const dist = Math.hypot(ssx - sx, ssy - sy);
              if (dist < candidateScreenDist) {
                candidateScreenDist = dist;
                candidate = s;
              }
            }
            if (candidate && candidateScreenDist < snapPixelRadius && candidateScreenDist < bestDist) {
              best = candidate;
              bestColor = p.config.color;
              bestDist = candidateScreenDist;
            }
          } else {
            for (const s of p.samples) {
              if (!Number.isFinite(s.x) || !Number.isFinite(s.y)) continue;
              const [ssx, ssy] = dataToScreen(s.x, s.y);
              const dist = Math.hypot(ssx - sx, ssy - sy);
              if (dist < bestDist) {
                bestDist = dist;
                best = s;
                bestColor = p.config.color;
              }
            }
            if (best && bestDist > snapPixelRadius) {
              best = undefined;
              bestColor = undefined;
            }
          }
        }
        hoverRef.current = {
          sx,
          sy,
          wx,
          wy,
          snap: best,
          snapColor: bestColor,
        };
        scheduleRedraw();
      } catch (err) {
        console.error('[Plot2DCanvas] pointer move error:', err);
        setDrawError(err instanceof Error ? err.message : '绘制交互失败');
      }
    },
    [screenToData, dataToScreen, computed, onViewChange, scheduleRedraw],
  );

  const handlePointerUp = useCallback((e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (dragRef.current) {
      canvasRef.current?.releasePointerCapture(e.pointerId);
      dragRef.current = null;
      if (canvasRef.current) canvasRef.current.style.cursor = 'crosshair';
    }
  }, []);

  const handlePointerLeave = useCallback(() => {
    hoverRef.current = null;
    scheduleRedraw();
  }, [scheduleRedraw]);

  const handleDoubleClick = useCallback(() => {
    onResetView?.();
  }, [onResetView]);

  /* ----------------------- Touch (pinch) ---------------------------- */
  const touchStateRef = useRef<{ ids: number[]; pts: Array<{ x: number; y: number }> } | null>(null);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent<HTMLCanvasElement>) => {
      try {
        if (e.touches.length === 2) {
          e.preventDefault();
          const t0 = e.touches[0];
          const t1 = e.touches[1];
          const rect = canvasRef.current?.getBoundingClientRect();
          if (!rect) return;
          const d = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
          const cx = (t0.clientX + t1.clientX) / 2 - rect.left;
          const cy = (t0.clientY + t1.clientY) / 2 - rect.top;
          pinchRef.current = { d, cx, cy };
          dragRef.current = null;
          touchStateRef.current = {
            ids: [t0.identifier, t1.identifier],
            pts: [
              { x: t0.clientX - rect.left, y: t0.clientY - rect.top },
              { x: t1.clientX - rect.left, y: t1.clientY - rect.top },
            ],
          };
        }
      } catch (err) {
        console.error('[Plot2DCanvas] touch start error:', err);
      }
    },
    [],
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent<HTMLCanvasElement>) => {
      try {
        if (e.touches.length === 2 && pinchRef.current && touchStateRef.current) {
          e.preventDefault();
          const t0 = e.touches[0];
          const t1 = e.touches[1];
          const rect = canvasRef.current?.getBoundingClientRect();
          if (!rect) return;
          const d = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
          const rawFactor = pinchRef.current.d / d;
          const factor = clamp(rawFactor, 0.5, 2);
          const cx = (t0.clientX + t1.clientX) / 2 - rect.left;
          const cy = (t0.clientY + t1.clientY) / 2 - rect.top;
          const [wx, wy] = screenToData(cx, cy);
          const { x: vx, y: vy } = viewRef.current;
          const nx = clampRangeWidth([wx + (vx[0] - wx) * factor, wx + (vx[1] - wx) * factor]);
          const ny = clampRangeWidth([wy + (vy[0] - wy) * factor, wy + (vy[1] - wy) * factor]);
          viewRef.current = { x: nx, y: ny };
          pinchRef.current = { d, cx, cy };
          onViewChange?.(nx, ny);
          scheduleRedraw();
        }
      } catch (err) {
        console.error('[Plot2DCanvas] touch move error:', err);
        setDrawError(err instanceof Error ? err.message : '触控缩放失败');
      }
    },
    [screenToData, onViewChange, scheduleRedraw],
  );

  const handleTouchEnd = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length < 2) {
      pinchRef.current = null;
      touchStateRef.current = null;
    }
  }, []);

  /* ----------------------- Cleanup rAF ------------------------------ */
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  /* ----------------------- Empty state ------------------------------ */
  if (plots.length === 0) {
    return (
      <div
        ref={containerRef}
        className="relative h-full w-full overflow-hidden bg-background"
        style={{ minHeight: 280 }}
      >
        <div className="grid-bg pointer-events-none absolute inset-0 opacity-50" />
        <div className="relative z-10 flex h-full w-full flex-col items-center justify-center gap-4 px-6 text-center">
          <svg
            viewBox="0 0 240 80"
            className="animate-float h-16 w-48 text-primary"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path
              d="M0 40 Q 30 0 60 40 T 120 40 T 180 40 T 240 40"
              className="animate-pulse-subtle"
            />
          </svg>
          <div className="space-y-1.5">
            <p className="text-base font-medium text-foreground/90">
              输入 <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-primary">plot(sin(x))</code> 或在简单模式输入 <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-primary">sin x</code> 来绘图
            </p>
            <p className="text-sm text-muted-foreground">支持滚轮缩放、拖拽平移、悬停查看精确坐标</p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {EXAMPLES.map((ex) => (
              <button
                key={ex.expr}
                type="button"
                onClick={() => onInsertExample?.(ex.expr)}
                className="interactive-card rounded-full border border-border bg-muted/40 px-3 py-1.5 font-mono text-xs text-foreground/90 transition-theme hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
              >
                {ex.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  /* ----------------------- Render ----------------------------------- */
  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden bg-background"
      style={{ minHeight: 280 }}
    >
      <canvas
        ref={canvasRef}
        className="block h-full w-full touch-none select-none"
        style={{ cursor: 'crosshair' }}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onDoubleClick={handleDoubleClick}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      />
      {/* Tiny range badge bottom-left */}
      <div className="pointer-events-none absolute bottom-1.5 left-2 rounded bg-muted-foreground/20 px-1.5 py-0.5 font-mono text-[10px] text-foreground/80 backdrop-blur-sm">
        x ∈ [{xRange[0].toFixed(2)}, {xRange[1].toFixed(2)}] · y ∈ [{yRange[0].toFixed(2)}, {yRange[1].toFixed(2)}]
      </div>

      {/* Draw error overlay */}
      {drawError && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-background/80 p-6 text-center backdrop-blur-sm">
          <div className="grid size-12 place-items-center rounded-full bg-destructive/10">
            <AlertTriangle className="size-6 text-destructive" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">绘图出错</p>
            <p className="max-w-xs text-xs text-muted-foreground">{drawError}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setDrawError(null);
                scheduleRedraw();
              }}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <RotateCcw className="size-3.5" />
              重绘
            </button>
            <button
              type="button"
              onClick={() => {
                setDrawError(null);
                onResetView?.();
              }}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent transition-colors"
            >
              <Maximize className="size-3.5" />
              重置视图
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ----------------------- Local helpers ---------------------------- */

/** Safe rounded rect that falls back to a plain rect on older canvas impls. */
function drawRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  if (typeof (ctx as any).roundRect === 'function') {
    try {
      (ctx as any).roundRect(x, y, w, h, r);
      return;
    } catch {
      // fall through
    }
  }
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function getCssVar(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** Prevent the view range from collapsing to zero or growing beyond safe bounds. */
function clampRangeWidth(range: [number, number]): [number, number] {
  const MIN_WIDTH = 1e-12;
  const MAX_WIDTH = 1e12;
  let [a, b] = range;
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    return [-10, 10];
  }
  let width = b - a;
  if (width === 0 || Math.abs(width) < MIN_WIDTH) {
    const mid = a;
    a = mid - MIN_WIDTH / 2;
    b = mid + MIN_WIDTH / 2;
    width = b - a;
  }
  if (Math.abs(width) > MAX_WIDTH) {
    const mid = (a + b) / 2;
    a = mid - MAX_WIDTH / 2;
    b = mid + MAX_WIDTH / 2;
  }
  return [a, b];
}

function formatNumberForTooltip(v: number): string {
  if (!Number.isFinite(v)) return '—';
  if (v === 0) return '0';
  const abs = Math.abs(v);
  if (abs >= 1e5 || abs < 1e-3) {
    return v.toExponential(2).replace('e+', 'e').replace('e-0', 'e-');
  }
  // 3 decimals max, trim trailing zeros.
  const s = v.toFixed(3);
  return parseFloat(s).toString();
}

function formatTickLabel(v: number): string {
  if (!Number.isFinite(v)) return '';
  if (v === 0) return '0';
  const abs = Math.abs(v);
  if (abs >= 1e4 || abs < 1e-3) {
    return v.toExponential(1).replace('e+', 'e').replace('e-0', 'e-');
  }
  // Trim trailing zeros — 3 sig figs is enough for axis labels.
  const s = v.toPrecision(3);
  return parseFloat(s).toString();
}

// Expose autoYRange as a re-export for the panel (kept off the default export
// to avoid pulling the math utilities into the bundle twice).
export { autoYRange };
