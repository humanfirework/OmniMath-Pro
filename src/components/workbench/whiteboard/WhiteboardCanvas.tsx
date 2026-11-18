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
  Grid2x2,
  Triangle,
  Circle,
  Crosshair,
  ZoomIn,
  ZoomOut,
  Maximize2,
  MousePointer2,
  Lasso,
  Highlighter,
  PenLine,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { t, useLocale } from '@/lib/i18n';
import { InkCanvas, type InkCanvasHandle } from './InkCanvas';
import { PenDock } from './PenDock';
import { useCoarsePointer } from '@/hooks/use-coarse-pointer';
import { PEN_COLORS, PEN_ERASER_SIZES, PEN_WIDTHS } from '@/lib/ink/presets';
import { hitTestInk, translateInk } from '@/lib/ink/hitTest';
import { applyEraser, type EraserMode } from '@/lib/ink/eraser';
import type { InkBrush, InkStroke, InkView } from '@/lib/ink/types';

type Tool = 'pen' | 'eraser' | 'select' | 'lasso';
type Background = 'dot' | 'grid' | 'ruled' | 'blank';
type ShapeId = 'line' | 'rect' | 'triangle' | 'circle' | 'axes';

interface Point {
  x: number;
  y: number;
  t?: number;
  /** 该点处的笔迹宽度（由书写速度推导的压感），自由笔迹按逐点宽度渲染。 */
  w?: number;
}

interface Stroke {
  id: string;
  points: Point[];
  color: string;
  width: number;
  style: 'pen' | 'eraser';
  recognized?: 'circle' | 'rectangle' | 'triangle' | 'line' | null;
    /** 像素画笔画：每个 point 是一个被吸附到网格的像素格（渲染为实心方块）。 */
  pixel?: boolean;
  /** 图形工具笔画：用起始点/结束点渲染直线/矩形/三角/圆/坐标轴。 */
  shape?: ShapeId;
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

/** 橡皮擦可选尺寸（px，直径）。 */
const ERASER_SIZES = [12, 24, 48, 80];

/** 像素画网格单元尺寸（px）。 */
const PIXEL_CELL = 28;

const STORAGE_KEY = 'omnimath-whiteboard-v1';

const BACKGROUNDS: { id: Background; icon: typeof Grid3x3; label: string }[] = [
  { id: 'dot', icon: CircleDot, label: '点阵' },
  { id: 'grid', icon: Grid3x3, label: '方格' },
  { id: 'ruled', icon: Minus, label: '横线' },
  { id: 'blank', icon: Square, label: '空白' },
];

const SHAPES: { id: ShapeId; icon: typeof Minus; label: string }[] = [
  { id: 'line', icon: Minus, label: '直线' },
  { id: 'rect', icon: Square, label: '矩形' },
  { id: 'triangle', icon: Triangle, label: '三角' },
  { id: 'circle', icon: Circle, label: '圆' },
  { id: 'axes', icon: Crosshair, label: '坐标' },
];

/** 生成唯一笔画 id。 */
function makeId(): string {
  return `s-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * 简化版 Bresenham 直线插值：返回 (x0,y0) 到 (x1,y1) 之间覆盖的整数格坐标。
 * 用于像素画快速拖动时补全中间遗漏的格子，避免「断触」产生断格。
 */
function bresenhamCells(x0: number, y0: number, x1: number, y1: number): { x: number; y: number }[] {
  const cells: { x: number; y: number }[] = [];
  let x = x0;
  let y = y0;
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  // 限制最大步数，防止异常输入导致死循环。
  const maxSteps = (dx + dy + 2) * 2;
  let steps = 0;
  for (;;) {
    cells.push({ x, y });
    if (x === x1 && y === y1) break;
    if (++steps > maxSteps) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }
  return cells;
}

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

export function WhiteboardCanvas() {
  useLocale();
  const coarse = useCoarsePointer();

  // Persist strokes & background to localStorage so they survive viewMode switches.
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
  const [undoStack, setUndoStack] = useState<Stroke[][]>([]);
  const undoStackRef = useRef<Stroke[][]>(undoStack);
  const redoStackRef = useRef<Stroke[][]>(redoStack);
  undoStackRef.current = undoStack;
  redoStackRef.current = redoStack;

  const [tool, setTool] = useState<Tool>('pen');
  const [brush, setBrush] = useState<InkBrush>('pen');
  const [eraserMode, setEraserMode] = useState<EraserMode>('partial');
  const [color, setColor] = useState<string>(PEN_COLORS[0]);
  const [width, setWidth] = useState<number>(PEN_WIDTHS[1]);
  const [recognize, setRecognize] = useState<boolean>(false);
  const [pixelMode, setPixelMode] = useState<boolean>(false);
  const [eraserSize, setEraserSize] = useState<number>(PEN_ERASER_SIZES[1]);
  const [shapeTool, setShapeTool] = useState<ShapeId | null>(null);
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
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const inkRef = useRef<InkCanvasHandle>(null);
  const strokesRef = useRef(strokes);
  strokesRef.current = strokes;
  const [view, setView] = useState<InkView>({ k: 1, x: 0, y: 0 });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ strokes, background }));
    } catch {
      // storage full or serialization error — don't crash the board
    }
  }, [strokes, background]);

  /** 提交一次动作：旧状态压入撤销栈（最多 50 步），清空重做栈。 */
  const commitStrokes = useCallback((next: Stroke[]) => {
    setUndoStack((u) => [...u, strokesRef.current].slice(-50));
    setStrokes(next);
    setRedoStack([]);
  }, []);

  const handleStrokeEnd = useCallback(
    (stroke: InkStroke): boolean => {
      if (stroke.shape) {
        const a = stroke.points[0];
        const b = stroke.points[stroke.points.length - 1];
        if (stroke.points.length < 2 || Math.hypot(b.x - a.x, b.y - a.y) <= 2) return false;
        commitStrokes([...strokesRef.current, { ...stroke, points: [...stroke.points] }]);
        return true;
      }
      if (recognize && stroke.points.length >= 2 && !stroke.pixel) {
        stroke.recognized = recognizeShape(stroke.points);
      }
      commitStrokes([...strokesRef.current, { ...stroke, points: [...stroke.points] }]);
      return true;
    },
    [recognize, commitStrokes],
  );

  const handleEraseEnd = useCallback(
    (stroke: InkStroke): boolean => {
      const { next, changed } = applyEraser(strokesRef.current, stroke, eraserMode);
      if (!changed) return false;
      commitStrokes(next);
      setSelectedIds([]);
      return true;
    },
    [commitStrokes, eraserMode],
  );

  const handleSelect = useCallback((ids: string[]) => {
    setSelectedIds(ids);
  }, []);

  const handleMoveEnd = useCallback(
    (dx: number, dy: number, ids: string[]) => {
      if ((dx === 0 && dy === 0) || ids.length === 0) return;
      const idSet = new Set(ids);
      commitStrokes(
        strokesRef.current.map((s) => (idSet.has(s.id) ? translateInk(s, dx, dy) : s)),
      );
    },
    [commitStrokes],
  );

  const handleViewChange = useCallback((next: InkView) => {
    setView(next);
  }, []);

  const handleHitTest = useCallback(
    (point: { x: number; y: number }, k: number): string | null =>
      hitTestInk(strokesRef.current, point, 6, k),
    [],
  );

  // 工具切换同步下发给引擎，不依赖 React effect 时序。
  const selectTool = useCallback((next: Tool) => {
    setShapeTool(null);
    setTool(next);
    if (next === 'pen') {
      setBrush('pen');
      inkRef.current?.setStyle({ tool: next, shapeTool: null, brush: 'pen' });
    } else {
      inkRef.current?.setStyle({ tool: next, shapeTool: null });
    }
  }, []);

  const selectShape = useCallback((next: ShapeId | null) => {
    setShapeTool(next);
    setTool('pen');
    inkRef.current?.setStyle({ tool: 'pen', shapeTool: next });
  }, []);

  const selectBrush = useCallback((next: InkBrush) => {
    setBrush(next);
    setTool('pen');
    setShapeTool(null);
    inkRef.current?.setStyle({ tool: 'pen', brush: next, shapeTool: null });
  }, []);

  const handleUndo = useCallback(() => {
    const u = undoStackRef.current;
    if (u.length === 0) return;
    const prev = u[u.length - 1];
    setUndoStack(u.slice(0, -1));
    setRedoStack([...redoStackRef.current, strokesRef.current].slice(-50));
    setStrokes(prev);
    setSelectedIds([]);
  }, []);

  const handleRedo = useCallback(() => {
    const r = redoStackRef.current;
    if (r.length === 0) return;
    const next = r[r.length - 1];
    setRedoStack(r.slice(0, -1));
    setUndoStack([...undoStackRef.current, strokesRef.current].slice(-50));
    setStrokes(next);
    setSelectedIds([]);
  }, []);

  const handleClear = useCallback(() => {
    if (strokesRef.current.length === 0) return;
    commitStrokes([]);
    setSelectedIds([]);
  }, [commitStrokes]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) {
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedIds.length === 0) return;
        e.preventDefault();
        const selected = new Set(selectedIds);
        commitStrokes(strokesRef.current.filter((s) => !selected.has(s.id)));
        setSelectedIds([]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedIds, handleUndo, handleRedo, commitStrokes]);

  const zoomAt = useCallback((factor: number, clientX?: number, clientY?: number) => {
    inkRef.current?.zoomAt(factor, clientX, clientY);
  }, []);

  const handleZoomReset = useCallback(() => {
    setView({ k: 1, x: 0, y: 0 });
    inkRef.current?.setView({ k: 1, x: 0, y: 0 });
  }, []);

  const handleExport = useCallback(async () => {
    const blob = await inkRef.current?.exportPNG(2);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const dl = document.createElement('a');
    dl.href = url;
    dl.download = `omnimath-whiteboard-${Date.now()}.png`;
    dl.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
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
      <div
        className={cn(
          'shrink-0 flex items-center gap-1 px-3 py-2 border-b border-border/60 bg-card/40 backdrop-blur-sm',
          coarse ? 'flex-nowrap overflow-x-auto [&>*]:shrink-0' : 'flex-wrap',
        )}
      >
        <div className="flex items-center gap-1 mr-2">
          <PencilRuler className="size-4 text-primary mr-1" />
          <span className="text-[12px] font-medium text-foreground/80">
            {t('abWhiteboard')}
          </span>
          <span className="rounded border border-amber-500/40 bg-amber-500/10 px-1 text-[9px] font-semibold leading-4 text-amber-600 dark:text-amber-400">
            BETA
          </span>
        </div>
        <div className="w-px h-5 bg-border/60" />
        {/* Tool toggle */}
        <button
          type="button"
          onClick={() => selectTool('select')}
          className={cn(
            'grid place-items-center size-7 rounded-md transition-colors',
            tool === 'select'
              ? 'bg-primary/15 text-primary'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent/60',
          )}
          aria-label="选择"
          title="选择 / 拖动"
        >
          <MousePointer2 className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={() => selectTool('lasso')}
          className={cn(
            'grid place-items-center size-7 rounded-md transition-colors',
            tool === 'lasso'
              ? 'bg-primary/15 text-primary'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent/60',
          )}
          aria-label="套圈"
          title="套圈选择（圈住多个对象后可一起拖动或删除）"
        >
          <Lasso className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={() => selectTool('pen')}
          className={cn(
            'grid place-items-center size-7 rounded-md transition-colors',
            toolBtn.pen && !shapeTool && brush === 'pen'
              ? 'bg-primary/15 text-primary'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent/60',
          )}
          aria-label="pen"
        >
          <Pencil className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={() => selectBrush('marker')}
          className={cn(
            'grid place-items-center size-7 rounded-md transition-colors',
            tool === 'pen' && brush === 'marker' && !shapeTool
              ? 'bg-primary/15 text-primary'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent/60',
          )}
          aria-label="marker"
          title="马克笔"
        >
          <PenLine className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={() => selectBrush('highlighter')}
          className={cn(
            'grid place-items-center size-7 rounded-md transition-colors',
            tool === 'pen' && brush === 'highlighter' && !shapeTool
              ? 'bg-primary/15 text-primary'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent/60',
          )}
          aria-label="highlighter"
          title="荧光笔"
        >
          <Highlighter className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={() => selectTool('eraser')}
          className={cn(
            'grid place-items-center size-7 rounded-md transition-colors',
            toolBtn.eraser && !shapeTool
              ? 'bg-primary/15 text-primary'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent/60',
          )}
          aria-label="eraser"
        >
          <Eraser className="size-3.5" />
        </button>

        <div className="w-px h-5 bg-border/60" />

        {/* Shape tools */}
        <div className="flex items-center gap-0.5 p-0.5 rounded-md bg-muted/40 border border-border/40">
          {SHAPES.map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => selectShape(shapeTool === id ? null : id)}
              className={cn(
                'grid place-items-center size-6 rounded transition-colors',
                shapeTool === id
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/60',
              )}
              aria-label={`shape ${label}`}
              title={label}
            >
              <Icon className="size-3.5" />
            </button>
          ))}
        </div>

        <div className="w-px h-5 bg-border/60" />

        {/* Pixel art mode toggle */}
        <button
          type="button"
          onClick={() => {
            const next = !pixelMode;
            setPixelMode(next);
            selectShape(null);
            selectTool('pen');
            inkRef.current?.setStyle({ pixelMode: next });
          }}
          className={cn(
            'inline-flex items-center gap-1 h-7 px-2 rounded-md text-[11px] transition-colors',
            pixelMode
              ? 'bg-primary/15 text-primary'
              : 'text-muted-foreground hover:bg-accent/60',
          )}
          aria-label="pixel mode"
          title={t('abPixelMode')}
        >
          <Grid2x2 className="size-3.5" />
          {pixelMode ? '像素开' : '像素'}
        </button>

        <div className="w-px h-5 bg-border/60" />

        {/* Color picker */}
        <div className="flex items-center gap-1">
          {PEN_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => {
                setColor(c);
                inkRef.current?.setStyle({ color: c });
              }}
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

        {/* Width / Eraser size */}
        {tool === 'eraser' && !shapeTool ? (
          <div className="flex items-center gap-1">
            <div className="flex items-center gap-0.5 p-0.5 rounded-md border border-border/40 bg-muted/30">
              {(
                [
                  ['partial', '点擦'],
                  ['stroke', '划擦'],
                ] as Array<[EraserMode, string]>
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setEraserMode(mode)}
                  className={cn(
                    'h-6 rounded px-1.5 text-[10px] transition-colors',
                    eraserMode === mode
                      ? 'bg-primary/15 text-primary'
                      : 'text-muted-foreground hover:bg-accent/60',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            {PEN_ERASER_SIZES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setEraserSize(s);
                  inkRef.current?.setStyle({ eraserSize: s });
                }}
                className={cn(
                  'grid place-items-center size-7 rounded-md transition-colors',
                  eraserSize === s
                    ? 'bg-primary/15 text-primary'
                    : 'text-muted-foreground hover:bg-accent/60',
                )}
                aria-label={`eraser size ${s}`}
                title={`${s}px`}
              >
                {/* 圆点直径封顶 18px，避免 48/80 号的圆点溢出 28px 按钮 */}
                <span
                  className="rounded-full bg-current"
                  style={{
                    width: Math.min(s * 0.5, 18),
                    height: Math.min(s * 0.5, 18),
                  }}
                />
              </button>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-1">
            {PEN_WIDTHS.map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => {
                  setWidth(w);
                  inkRef.current?.setStyle({ width: w });
                }}
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
        )}

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
              onClick={() => {
                setBackground(id);
                inkRef.current?.setStyle({ background: id });
              }}
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

        {/* Zoom controls */}
        <div className="flex items-center gap-0.5 p-0.5 rounded-md bg-muted/40 border border-border/40">
          <button
            type="button"
            onClick={() => zoomAt(1 / 1.2)}
            className="grid place-items-center size-6 rounded text-muted-foreground hover:text-foreground hover:bg-accent/60"
            aria-label="zoom out"
            title={`缩小 (当前 ${Math.round(view.k * 100)}%)`}
          >
            <ZoomOut className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={handleZoomReset}
            className="min-w-11 h-6 px-1 rounded text-[10.5px] font-medium text-muted-foreground hover:text-foreground hover:bg-accent/60 tabular-nums"
            aria-label="reset zoom"
            title="重置缩放 (100%)"
          >
            {Math.round(view.k * 100)}%
          </button>
          <button
            type="button"
            onClick={() => zoomAt(1.2)}
            className="grid place-items-center size-6 rounded text-muted-foreground hover:text-foreground hover:bg-accent/60"
            aria-label="zoom in"
            title="放大"
          >
            <ZoomIn className="size-3.5" />
          </button>
        </div>

        {/* Actions */}
        <button
          type="button"
          onClick={handleUndo}
          disabled={undoStack.length === 0}
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
        <InkCanvas
          ref={inkRef}
          className="absolute inset-0"
          strokes={strokes}
          tool={tool}
          shapeTool={shapeTool}
          brush={brush}
          color={color}
          width={width}
          eraserSize={eraserSize}
          pixelMode={pixelMode}
          background={background}
          selectedIds={selectedIds}
          onStrokeEnd={handleStrokeEnd}
          onEraseEnd={handleEraseEnd}
          onSelect={handleSelect}
          onMoveEnd={handleMoveEnd}
          onViewChange={handleViewChange}
          hitTest={handleHitTest}
        />

        {coarse && (
          <PenDock
            tool={tool}
            onTool={selectTool}
            brush={brush}
            onBrush={selectBrush}
            eraserMode={eraserMode}
            onEraserMode={setEraserMode}
            color={color}
            onColor={(c) => {
              setColor(c);
              inkRef.current?.setStyle({ color: c });
            }}
            width={width}
            onWidth={(w) => {
              setWidth(w);
              inkRef.current?.setStyle({ width: w });
            }}
            eraserSize={eraserSize}
            onEraserSize={(s) => {
              setEraserSize(s);
              inkRef.current?.setStyle({ eraserSize: s });
            }}
            shapeTool={shapeTool}
            onShapeTool={selectShape}
            pixelMode={pixelMode}
            onPixelMode={(next) => {
              setPixelMode(next);
              selectShape(null);
              selectTool('pen');
              inkRef.current?.setStyle({ pixelMode: next });
            }}
            onUndo={handleUndo}
            onRedo={handleRedo}
            canUndo={undoStack.length > 0}
            canRedo={redoStack.length > 0}
            onClear={handleClear}
            onExport={handleExport}
          />
        )}


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
          {strokes.length} 笔 ·{' '}
          {tool === 'pen'
            ? brush === 'highlighter'
              ? '荧光笔'
              : brush === 'marker'
                ? '马克笔'
                : '钢笔'
            : tool === 'eraser'
              ? `橡皮/${eraserMode === 'stroke' ? '划擦' : '点擦'}`
              : tool === 'lasso'
                ? '套圈'
                : '选择'}
          {selectedIds.length > 0 ? ` · 已选 ${selectedIds.length}` : ''} · 识别{' '}
          {recognize ? '开' : '关'} · 背景 {BACKGROUNDS.find((b) => b.id === background)?.label}
        </span>
        <span>提示：使用工具栏的撤销 / 重做 / 清空按钮</span>
      </div>
    </div>
  );
}
