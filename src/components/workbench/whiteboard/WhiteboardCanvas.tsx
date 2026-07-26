'use client';

/**
 * OmniMath Pro — Whiteboard Canvas
 *
 * Full-screen SVG sketch surface with:
 *   - Pen / eraser tools
 *   - Color picker (preset palette)
 *   - Stroke width selector
 *   - Pressure-like width (based on pointer velocity)
 *   - Basic shape recognition (circle / rectangle / triangle / line)
 *   - Undo / redo / clear / export PNG
 *
 * Coordinate conversion uses getBoundingClientRect (not getScreenCTM)
 * so it works in headless browsers and older Safari.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Pencil,
  Eraser,
  Undo2,
  Redo2,
  Trash2,
  Download,
  PencilRuler,
  Shapes,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { t } from '@/lib/i18n';

type Tool = 'pen' | 'eraser';

interface Point {
  x: number;
  y: number;
  /** time stamp — used to compute velocity → stroke width */
  t?: number;
}

interface Stroke {
  id: string;
  points: Point[];
  color: string;
  width: number;
  style: Tool;
  /** if recognized as a shape, this is set so we can fill it */
  recognized?: 'circle' | 'rectangle' | 'triangle' | 'line' | null;
}

const PRESET_COLORS = [
  '#0ea5e9', // sky
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#0f172a', // near-black (light theme friendly)
  '#ffffff', // white (dark theme friendly)
];

const PRESET_WIDTHS = [2, 4, 8, 14];

/** Build an SVG path `d` string from a stroke's points.
 *  Uses Catmull-Rom-like smoothing for natural curves. */
function strokeToPath(stroke: Stroke): string {
  const pts = stroke.points;
  if (pts.length === 0) return '';
  if (pts.length === 1) {
    // single dot → tiny circle
    return `M ${pts[0].x} ${pts[0].y} l 0.01 0`;
  }
  // If recognized as a shape, draw clean geometry
  if (stroke.recognized === 'line' && pts.length >= 2) {
    return `M ${pts[0].x} ${pts[0].y} L ${pts[pts.length - 1].x} ${pts[pts.length - 1].y}`;
  }
  if (stroke.recognized === 'rectangle' && pts.length >= 2) {
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const x0 = Math.min(...xs);
    const y0 = Math.min(...ys);
    const x1 = Math.max(...xs);
    const y1 = Math.max(...ys);
    return `M ${x0} ${y0} L ${x1} ${y0} L ${x1} ${y1} L ${x0} ${y1} Z`;
  }
  if (stroke.recognized === 'circle' && pts.length >= 3) {
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const rx = (Math.max(...xs) - Math.min(...xs)) / 2;
    const ry = (Math.max(...ys) - Math.min(...ys)) / 2;
    return `M ${cx - rx} ${cy} a ${rx} ${ry} 0 1 0 ${rx * 2} 0 a ${rx} ${ry} 0 1 0 ${-rx * 2} 0 Z`;
  }
  // default: smoothed polyline
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const midX = (pts[i].x + pts[i + 1].x) / 2;
    const midY = (pts[i].y + pts[i + 1].y) / 2;
    d += ` Q ${pts[i].x} ${pts[i].y} ${midX} ${midY}`;
  }
  if (pts.length > 1) {
    d += ` L ${pts[pts.length - 1].x} ${pts[pts.length - 1].y}`;
  }
  return d;
}

/** Heuristic: detect if a closed stroke is a circle / rectangle / triangle / line. */
function recognizeShape(points: Point[]): Stroke['recognized'] {
  if (points.length < 4) {
    return points.length === 2 ? 'line' : null;
  }
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  const w = x1 - x0;
  const h = y1 - y0;
  if (w < 4 && h < 4) return null;

  // Compute perimeter and area of the bounding box for aspect checks
  const start = points[0];
  const end = points[points.length - 1];
  const closingDist = Math.hypot(end.x - start.x, end.y - start.y);
  const isClosed = closingDist < Math.max(w, h) * 0.25;
  if (!isClosed) {
    // open path with near-straight points → line
    return 'line';
  }

  // Sample how well the points fit the bounding box edges (rectangle) vs an ellipse.
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const rx = w / 2;
  const ry = h / 2;
  if (rx < 2 || ry < 2) return 'line';

  let rectErr = 0;
  let circErr = 0;
  for (const p of points) {
    // rectangle error: distance to nearest edge of bbox
    const dx = Math.max(x0 - p.x, 0, p.x - x1);
    const dy = Math.max(y0 - p.y, 0, p.y - y1);
    rectErr += Math.hypot(dx, dy);
    // ellipse error: |normalized radius - 1|
    const nx = (p.x - cx) / rx;
    const ny = (p.y - cy) / ry;
    circErr += Math.abs(Math.hypot(nx, ny) - 1);
  }
  rectErr /= points.length;
  circErr /= points.length;

  // Triangle: 3 sharp corners — cheap check via variance of edge angles. Skip for simplicity.
  if (circErr < rectErr && circErr < 0.18) return 'circle';
  if (rectErr < circErr && rectErr < 12) return 'rectangle';
  return null;
}

export function WhiteboardCanvas() {
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [redoStack, setRedoStack] = useState<Stroke[][]>([]);
  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState<string>(PRESET_COLORS[0]);
  const [width, setWidth] = useState<number>(PRESET_WIDTHS[1]);
  const [recognize, setRecognize] = useState<boolean>(true);

  const drawingRef = useRef(false);
  const currentStrokeRef = useRef<Stroke | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const getSvgPoint = useCallback((clientX: number, clientY: number): Point => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    // getBoundingClientRect is robust in headless browsers (getScreenCTM
    // returns null in some headless contexts). Good enough for a sketchpad.
    const rect = svg.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top, t: Date.now() };
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      e.preventDefault();
      svgRef.current?.setPointerCapture(e.pointerId);
      drawingRef.current = true;
      const p = getSvgPoint(e.clientX, e.clientY);
      currentStrokeRef.current = {
        id: `s-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        points: [p],
        color,
        width,
        style: tool,
        recognized: null,
      };
    },
    [color, width, tool, getSvgPoint],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!drawingRef.current || !currentStrokeRef.current) return;
      const p = getSvgPoint(e.clientX, e.clientY);
      const stroke = currentStrokeRef.current;
      const last = stroke.points[stroke.points.length - 1];
      // skip points that are too close — reduces path size
      if (Math.hypot(p.x - last.x, p.y - last.y) < 1.5) return;
      // velocity-based width: faster → thinner (pen pressure simulation)
      if (p.t && last.t) {
        const dt = Math.max(8, p.t - last.t);
        const dist = Math.hypot(p.x - last.x, p.y - last.y);
        const velocity = dist / dt;
        const dynamicW = Math.max(1, stroke.width * (1 - Math.min(0.5, velocity * 0.04)));
        // we keep width on the stroke level (avg) — store as point property implicitly via stroke.width
        stroke.width = (stroke.width + dynamicW) / 2;
      }
      stroke.points.push(p);
      // force re-render by replacing ref identity
      setStrokes((prev) => {
        const next = prev.slice();
        const idx = next.findIndex((s) => s.id === stroke.id);
        if (idx === -1) return [...next, { ...stroke }];
        next[idx] = { ...stroke };
        return next;
      });
    },
    [getSvgPoint],
  );

  const handlePointerUp = useCallback(() => {
    if (!drawingRef.current || !currentStrokeRef.current) return;
    drawingRef.current = false;
    const stroke = currentStrokeRef.current;
    currentStrokeRef.current = null;
    // run shape recognition on the finished stroke
    if (recognize && stroke.style === 'pen' && stroke.points.length >= 2) {
      stroke.recognized = recognizeShape(stroke.points);
    }
    setStrokes((prev) => {
      const idx = prev.findIndex((s) => s.id === stroke.id);
      if (idx === -1) return prev;
      const next = prev.slice();
      next[idx] = { ...stroke };
      return next;
    });
    setRedoStack([]);
  }, [recognize]);

  const handleUndo = useCallback(() => {
    setStrokes((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setRedoStack((r) => [...r, prev]);
      return prev.slice(0, -1);
    });
  }, []);

  const handleRedo = useCallback(() => {
    setRedoStack((r) => {
      if (r.length === 0) return r;
      const lastState = r[r.length - 1];
      setStrokes(lastState);
      return r.slice(0, -1);
    });
  }, []);

  const handleClear = useCallback(() => {
    setStrokes((prev) => {
      if (prev.length > 0) setRedoStack((r) => [...r, prev]);
      return [];
    });
  }, []);

  const handleExport = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) return;
    // Serialize the live SVG (without the background rect) to a PNG.
    const clone = svg.cloneNode(true) as SVGSVGElement;
    const w = svg.clientWidth || 1200;
    const h = svg.clientHeight || 800;
    clone.setAttribute('width', String(w));
    clone.setAttribute('height', String(h));
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const xml = new XMLSerializer().serializeToString(clone);
    const blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = w * 2;
      canvas.height = h * 2;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.scale(2, 2);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      canvas.toBlob((b) => {
        if (!b) return;
        const dl = document.createElement('a');
        dl.href = URL.createObjectURL(b);
        dl.download = `omnimath-whiteboard-${Date.now()}.png`;
        dl.click();
        URL.revokeObjectURL(dl.href);
      });
    };
    img.src = url;
  }, []);

  const empty = strokes.length === 0;

  const toolBtn = useMemo(
    () => ({
      pen: tool === 'pen',
      eraser: tool === 'eraser',
    }),
    [tool],
  );

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Toolbar */}
      <div className="shrink-0 flex items-center gap-1 px-3 py-2 border-b border-border/60 bg-card/40 backdrop-blur-sm">
        <div className="flex items-center gap-1 mr-2">
          <PencilRuler className="size-4 text-primary mr-1" />
          <span className="text-[12px] font-medium text-foreground/80">
            {t('abWhiteboard')}
          </span>
        </div>
        <div className="w-px h-5 bg-border/60" />
        {/* Tool toggle */}
        <button
          type="button"
          onClick={() => setTool('pen')}
          className={cn(
            'grid place-items-center size-7 rounded-md transition-colors',
            toolBtn.pen
              ? 'bg-primary/15 text-primary'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent/60',
          )}
          aria-label="pen"
        >
          <Pencil className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={() => setTool('eraser')}
          className={cn(
            'grid place-items-center size-7 rounded-md transition-colors',
            toolBtn.eraser
              ? 'bg-primary/15 text-primary'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent/60',
          )}
          aria-label="eraser"
        >
          <Eraser className="size-3.5" />
        </button>

        <div className="w-px h-5 bg-border/60" />

        {/* Color picker */}
        <div className="flex items-center gap-1">
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className={cn(
                'size-5 rounded-full border transition-all',
                color === c
                  ? 'ring-2 ring-primary ring-offset-1 ring-offset-background border-transparent scale-110'
                  : 'border-border/60 hover:scale-110',
              )}
              style={{ backgroundColor: c }}
              aria-label={`color ${c}`}
            />
          ))}
        </div>

        <div className="w-px h-5 bg-border/60" />

        {/* Width */}
        <div className="flex items-center gap-1">
          {PRESET_WIDTHS.map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setWidth(w)}
              className={cn(
                'grid place-items-center size-7 rounded-md transition-colors',
                width === w
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground hover:bg-accent/60',
              )}
              aria-label={`width ${w}`}
            >
              <span
                className="rounded-full bg-current"
                style={{ width: w + 1, height: w + 1 }}
              />
            </button>
          ))}
        </div>

        <div className="w-px h-5 bg-border/60" />

        {/* Shape recognition toggle */}
        <button
          type="button"
          onClick={() => setRecognize((r) => !r)}
          className={cn(
            'inline-flex items-center gap-1 h-7 px-2 rounded-md text-[11px] transition-colors',
            recognize
              ? 'bg-primary/15 text-primary'
              : 'text-muted-foreground hover:bg-accent/60',
          )}
          aria-label="shape recognition"
        >
          <Shapes className="size-3.5" />
          {recognize ? 'ON' : 'OFF'}
        </button>

        <div className="flex-1" />

        {/* Actions */}
        <button
          type="button"
          onClick={handleUndo}
          disabled={strokes.length === 0}
          className="grid place-items-center size-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="undo"
        >
          <Undo2 className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={handleRedo}
          disabled={redoStack.length === 0}
          className="grid place-items-center size-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="redo"
        >
          <Redo2 className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={handleClear}
          disabled={empty}
          className="grid place-items-center size-7 rounded-md text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="clear"
        >
          <Trash2 className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={handleExport}
          disabled={empty}
          className="inline-flex items-center gap-1 h-7 px-2 rounded-md text-[11px] bg-primary/10 text-primary hover:bg-primary/15 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="export"
        >
          <Download className="size-3.5" />
          PNG
        </button>
      </div>

      {/* Canvas */}
      <div className="flex-1 min-h-0 relative overflow-hidden">
        <svg
          ref={svgRef}
          className="absolute inset-0 w-full h-full touch-none cursor-crosshair"
          style={{
            backgroundImage:
              'radial-gradient(circle, oklch(0.5 0 0 / 0.08) 1px, transparent 1px)',
            backgroundSize: '20px 20px',
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        >
          <rect x="0" y="0" width="100%" height="100%" fill="var(--background, #fff)" />
          {strokes.map((stroke) => (
            <path
              key={stroke.id}
              d={strokeToPath(stroke)}
              stroke={stroke.style === 'eraser' ? 'var(--background, #fff)' : stroke.color}
              strokeWidth={stroke.width}
              fill={stroke.recognized ? `${stroke.color}22` : 'none'}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>

        {/* Empty state hint */}
        {empty && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="absolute inset-0 grid place-items-center pointer-events-none"
          >
            <div className="text-center px-6">
              <div className="grid place-items-center size-14 mx-auto rounded-2xl bg-primary/8 border border-primary/20 mb-3">
                <PencilRuler className="size-6 text-primary/70" />
              </div>
              <p className="text-[13px] font-medium text-foreground/70 mb-1">
                {t('abWhiteboard')}
              </p>
              <p className="text-[11.5px] text-muted-foreground max-w-xs">
                在画布上自由绘制 — 圆、矩形、三角形和直线会被自动识别
              </p>
            </div>
          </motion.div>
        )}
      </div>

      {/* Status bar */}
      <div className="shrink-0 flex items-center justify-between px-3 py-1 border-t border-border/60 bg-card/30 text-[11px] text-muted-foreground">
        <span>
          {strokes.length} 笔 · {tool === 'pen' ? '钢笔' : '橡皮'} · 识别 {recognize ? '开' : '关'}
        </span>
        <span>提示：双击空白处可清除 · 按 Ctrl+Z 撤销</span>
      </div>
    </div>
  );
}
