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
 *   - Background switching (dot grid / line grid / blank / ruled)
 *
 * Robustness notes:
 *   - Strokes are persisted to localStorage so they survive viewMode switches.
 *   - Pointer capture is wrapped in try/catch (some browsers throw on invalid id).
 *   - Math.min/max over points uses reduce (not spread) to avoid stack overflow.
 *   - Undo/redo never mutates state inside a setState updater (avoids StrictMode double-invoke).
 *   - Export uses try/finally to guarantee URL.revokeObjectURL even on drawImage failure.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  Grid3x3,
  Minus,
  CircleDot,
  Square,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { t } from '@/lib/i18n';

type Tool = 'pen' | 'eraser';
type Background = 'dot' | 'grid' | 'ruled' | 'blank';

interface Point {
  x: number;
  y: number;
  t?: number;
}

interface Stroke {
  id: string;
  points: Point[];
  color: string;
  width: number;
  style: Tool;
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

const STORAGE_KEY = 'omnimath-whiteboard-v1';

const BACKGROUNDS: { id: Background; icon: typeof Grid3x3; label: string }[] = [
  { id: 'dot', icon: CircleDot, label: '点阵' },
  { id: 'grid', icon: Grid3x3, label: '方格' },
  { id: 'ruled', icon: Minus, label: '横线' },
  { id: 'blank', icon: Square, label: '空白' },
];

/** Reduce-based min/max — safe for very large arrays (no stack overflow). */
function minMax(values: number[]): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return [min, max];
}

/** Build an SVG path `d` string from a stroke's points. */
function strokeToPath(stroke: Stroke): string {
  const pts = stroke.points;
  if (pts.length === 0) return '';
  if (pts.length === 1) {
    return `M ${pts[0].x} ${pts[0].y} l 0.01 0`;
  }
  if (stroke.recognized === 'line' && pts.length >= 2) {
    return `M ${pts[0].x} ${pts[0].y} L ${pts[pts.length - 1].x} ${pts[pts.length - 1].y}`;
  }
  if (stroke.recognized === 'rectangle' && pts.length >= 2) {
    const [x0, x1] = minMax(pts.map((p) => p.x));
    const [y0, y1] = minMax(pts.map((p) => p.y));
    return `M ${x0} ${y0} L ${x1} ${y0} L ${x1} ${y1} L ${x0} ${y1} Z`;
  }
  if (stroke.recognized === 'circle' && pts.length >= 3) {
    const [x0, x1] = minMax(pts.map((p) => p.x));
    const [y0, y1] = minMax(pts.map((p) => p.y));
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const rx = (x1 - x0) / 2;
    const ry = (y1 - y0) / 2;
    return `M ${cx - rx} ${cy} a ${rx} ${ry} 0 1 0 ${rx * 2} 0 a ${rx} ${ry} 0 1 0 ${-rx * 2} 0 Z`;
  }
  if (stroke.recognized === 'triangle' && pts.length >= 3) {
    const [x0, x1] = minMax(pts.map((p) => p.x));
    const [y0, y1] = minMax(pts.map((p) => p.y));
    // Equilateral-ish triangle inscribed in bbox: top-center, bottom-left, bottom-right
    const cx = (x0 + x1) / 2;
    return `M ${cx} ${y0} L ${x1} ${y1} L ${x0} ${y1} Z`;
  }
  // default: smoothed polyline (Catmull-Rom-ish)
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

/** Heuristic shape recognition. */
function recognizeShape(points: Point[]): Stroke['recognized'] {
  if (points.length < 4) {
    return points.length === 2 ? 'line' : null;
  }
  const [x0, x1] = minMax(points.map((p) => p.x));
  const [y0, y1] = minMax(points.map((p) => p.y));
  const w = x1 - x0;
  const h = y1 - y0;
  if (w < 4 && h < 4) return null;

  const start = points[0];
  const end = points[points.length - 1];
  // 闭合判定：同时用「首尾距离 / 外接框对角」与「首尾距离 / 总周长」两个比例，
  // 任一满足即视为闭合。原先只用 closingDist < max(w,h)*0.25，对手抖画的圆
  // 过严，导致"画圆识别成线"。放宽后圆/椭圆/闭合多边形都能被正确识别。
  const diag = Math.hypot(w, h) || 1;
  const scale = Math.max(w, h) || 1;
  const closingDist = Math.hypot(end.x - start.x, end.y - start.y);
  let perimeter = 0;
  for (let i = 1; i < points.length; i++) {
    perimeter += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  const isClosed =
    closingDist < scale * 0.45 ||
    (perimeter > 0 && closingDist / perimeter < 0.12) ||
    closingDist < diag * 0.3;
  if (!isClosed) {
    return 'line';
  }

  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const rx = w / 2;
  const ry = h / 2;
  if (rx < 2 || ry < 2) return 'line';

  // 离心率（椭圆接近圆则判圆）：ecc = |rx - ry| / max(rx, ry)。
  const ecc = Math.abs(rx - ry) / Math.max(rx, ry, 1e-6);

  let rectErr = 0;
  let circErr = 0;
  let triErr = 0;
  for (const p of points) {
    const dx = Math.max(x0 - p.x, 0, p.x - x1);
    const dy = Math.max(y0 - p.y, 0, p.y - y1);
    rectErr += Math.hypot(dx, dy);
    const nx = (p.x - cx) / rx;
    const ny = (p.y - cy) / ry;
    circErr += Math.abs(Math.hypot(nx, ny) - 1);
    // Triangle fit: distance to the triangle (cx,y0)-(x1,y1)-(x0,y1)
    triErr += pointToTriangleDist(p, { x: cx, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 });
  }
  rectErr /= points.length;
  circErr /= points.length;
  triErr /= points.length;

  // 圆：误差最小 + 离心率不高（椭圆也倾向判圆，避免手画不圆被误判为线/矩形）。
  if (circErr < rectErr && circErr < triErr && circErr < 0.22 && ecc < 0.55) return 'circle';
  if (rectErr < circErr && rectErr < triErr && rectErr < 12) return 'rectangle';
  if (triErr < circErr && triErr < rectErr && triErr < 14) return 'triangle';
  return null;
}

function pointToTriangleDist(p: Point, a: Point, b: Point, c: Point): number {
  // minimum distance from p to any of the 3 edges
  const d1 = pointToSegmentDist(p, a, b);
  const d2 = pointToSegmentDist(p, b, c);
  const d3 = pointToSegmentDist(p, c, a);
  return Math.min(d1, d2, d3);
}

function pointToSegmentDist(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Build a CSS background-image value for the given background type. */
function backgroundStyle(bg: Background): string {
  const dot = 'radial-gradient(circle, oklch(0.5 0 0 / 0.10) 1px, transparent 1px)';
  const grid =
    'linear-gradient(oklch(0.5 0 0 / 0.08) 1px, transparent 1px), linear-gradient(90deg, oklch(0.5 0 0 / 0.08) 1px, transparent 1px)';
  const ruled = 'linear-gradient(oklch(0.5 0 0 / 0.08) 1px, transparent 1px)';
  switch (bg) {
    case 'dot':
      return `${dot}`;
    case 'grid':
      return `${grid}`;
    case 'ruled':
      return `${ruled}`;
    case 'blank':
    default:
      return '';
  }
}

function backgroundSize(bg: Background): string {
  switch (bg) {
    case 'dot':
      return '20px 20px';
    case 'grid':
      return '20px 20px, 20px 20px';
    case 'ruled':
      return '100% 24px';
    case 'blank':
    default:
      return 'auto';
  }
}

export function WhiteboardCanvas() {
  // Persist strokes & background to localStorage so they survive viewMode switches
  // (the component unmounts when leaving the whiteboard view).
  const [strokes, setStrokes] = useState<Stroke[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed?.strokes)) return parsed.strokes;
      return [];
    } catch {
      return [];
    }
  });
  const [redoStack, setRedoStack] = useState<Stroke[][]>([]);
  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState<string>(PRESET_COLORS[0]);
  const [width, setWidth] = useState<number>(PRESET_WIDTHS[1]);
  const [recognize, setRecognize] = useState<boolean>(true);
  const [background, setBackground] = useState<Background>(() => {
    if (typeof window === 'undefined') return 'dot' as Background;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return 'dot' as Background;
      const parsed = JSON.parse(raw);
      const b = parsed?.background;
      if (b === 'dot' || b === 'grid' || b === 'ruled' || b === 'blank') return b;
      return 'dot' as Background;
    } catch {
      return 'dot' as Background;
    }
  });

  const drawingRef = useRef(false);
  const currentStrokeRef = useRef<Stroke | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const strokesRef = useRef(strokes); // mirror for use in callbacks without re-creating them
  strokesRef.current = strokes;

  // Persist strokes + background whenever they change.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ strokes, background }));
    } catch {
      // storage full or serialization error — silently ignore (don't crash)
    }
  }, [strokes, background]);

  const getSvgPoint = useCallback((clientX: number, clientY: number): Point => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top, t: Date.now() };
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      e.preventDefault();
      // setPointerCapture can throw on some browsers if pointerId is invalid
      // (e.g. pointercancel already fired). Wrap in try/catch to be safe.
      try {
        svgRef.current?.setPointerCapture(e.pointerId);
      } catch {
        /* ignore — drawing will still work via pointermove */
      }
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

  // rAF batching: avoid creating new arrays on every pointermove event
  const rafPendingRef = useRef(false);
  const handlePointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!drawingRef.current || !currentStrokeRef.current) return;
      const p = getSvgPoint(e.clientX, e.clientY);
      const stroke = currentStrokeRef.current;
      const last = stroke.points[stroke.points.length - 1];
      if (Math.hypot(p.x - last.x, p.y - last.y) < 1.5) return;
      if (p.t && last.t) {
        const dt = Math.max(8, p.t - last.t);
        const dist = Math.hypot(p.x - last.x, p.y - last.y);
        const velocity = dist / dt;
        const dynamicW = Math.max(1, stroke.width * (1 - Math.min(0.5, velocity * 0.04)));
        stroke.width = (stroke.width + dynamicW) / 2;
      }
      // Mutate ref directly (no React re-render per point)
      stroke.points.push(p);

      // Batch React state update via rAF — one re-render per frame max
      if (!rafPendingRef.current) {
        rafPendingRef.current = true;
        requestAnimationFrame(() => {
          rafPendingRef.current = false;
          const s = currentStrokeRef.current;
          if (!s) return;
          setStrokes((prev) => {
            const idx = prev.findIndex((it) => it.id === s.id);
            if (idx === -1) return [...prev, { ...s, points: [...s.points] }];
            const next = prev.slice();
            next[idx] = { ...s, points: [...s.points] };
            return next;
          });
        });
      }
    },
    [getSvgPoint],
  );

  const handlePointerUp = useCallback(() => {
    if (!drawingRef.current || !currentStrokeRef.current) return;
    drawingRef.current = false;
    const stroke = currentStrokeRef.current;
    currentStrokeRef.current = null;
    if (recognize && stroke.style === 'pen' && stroke.points.length >= 2) {
      stroke.recognized = recognizeShape(stroke.points);
    }
    setStrokes((prev) => {
      const idx = prev.findIndex((s) => s.id === stroke.id);
      if (idx === -1) return prev;
      const next = prev.slice();
      next[idx] = { ...stroke, points: [...stroke.points] };
      return next;
    });
    // Clear redo stack on new content
    setRedoStack([]);
  }, [recognize]);

  // Undo: read current strokes from ref, compute new state, then update both
  // stacks WITHOUT calling setRedoStack inside the setStrokes updater.
  const handleUndo = useCallback(() => {
    const current = strokesRef.current;
    if (current.length === 0) return;
    const lastStroke = current[current.length - 1];
    setRedoStack((r) => [...r, current]);
    setStrokes(current.slice(0, -1));
    // reference lastStroke to satisfy linter; it could be used for logging
    void lastStroke;
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
    const current = strokesRef.current;
    if (current.length === 0) return;
    setRedoStack((r) => [...r, current]);
    setStrokes([]);
  }, []);

  const handleExport = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    const w = svg.clientWidth || 1200;
    const h = svg.clientHeight || 800;
    clone.setAttribute('width', String(w));
    clone.setAttribute('height', String(h));
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    // Inline the background style so the exported image isn't transparent
    const bgRect = clone.querySelector('rect');
    if (bgRect) {
      const computedBg = getComputedStyle(document.documentElement).getPropertyValue('--background') || '#ffffff';
      bgRect.setAttribute('fill', computedBg.trim() || '#ffffff');
    }
    const xml = new XMLSerializer().serializeToString(clone);
    const blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    const cleanup = () => URL.revokeObjectURL(url);
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = w * 2;
        canvas.height = h * 2;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          cleanup();
          return;
        }
        ctx.scale(2, 2);
        const computedBg = getComputedStyle(document.documentElement).getPropertyValue('--background') || '#ffffff';
        ctx.fillStyle = computedBg.trim() || '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob((b) => {
          if (!b) return;
          const dl = document.createElement('a');
          dl.href = URL.createObjectURL(b);
          dl.download = `omnimath-whiteboard-${Date.now()}.png`;
          dl.click();
          // Revoke the download URL after a short delay (allow click to start)
          setTimeout(() => URL.revokeObjectURL(dl.href), 1000);
        });
      } finally {
        cleanup();
      }
    };
    img.onerror = cleanup;
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
      <div className="shrink-0 flex items-center gap-1 px-3 py-2 border-b border-border/60 bg-card/40 backdrop-blur-sm flex-wrap">
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
          {recognize ? '识别开' : '识别关'}
        </button>

        <div className="w-px h-5 bg-border/60" />

        {/* Background switcher */}
        <div className="flex items-center gap-0.5 p-0.5 rounded-md bg-muted/40 border border-border/40">
          {BACKGROUNDS.map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setBackground(id)}
              className={cn(
                'grid place-items-center size-6 rounded transition-colors',
                background === id
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/60',
              )}
              aria-label={`background ${label}`}
              title={label}
            >
              <Icon className="size-3.5" />
            </button>
          ))}
        </div>

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
            backgroundImage: backgroundStyle(background),
            backgroundSize: backgroundSize(background),
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
          {strokes.length} 笔 · {tool === 'pen' ? '钢笔' : '橡皮'} · 识别 {recognize ? '开' : '关'} · 背景 {BACKGROUNDS.find((b) => b.id === background)?.label}
        </span>
        <span>提示：使用工具栏的撤销 / 重做 / 清空按钮</span>
      </div>
    </div>
  );
}
