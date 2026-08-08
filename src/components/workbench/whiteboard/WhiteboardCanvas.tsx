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
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { t, useLocale } from '@/lib/i18n';

type Tool = 'pen' | 'eraser';
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
  style: Tool;
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
  return d;
}

/**
 * 判断一点是否落在橡皮「扫过区域」半径 r 内。
 * 同时检查橡皮的每个点以及相邻点之间的线段（橡皮移动快、事件稀疏时，
 * 相邻橡皮点之间可能隔很远，若只查点会漏掉中间细线，导致「擦不干净」）。
 */
function pointHit(p: Point, eraser: Stroke, r: number): boolean {
  const pts = eraser.points;
  for (let i = 0; i < pts.length; i++) {
    if (Math.hypot(pts[i].x - p.x, pts[i].y - p.y) <= r) return true;
  }
  for (let i = 0; i < pts.length - 1; i++) {
    if (pointToSegmentDist(p, pts[i], pts[i + 1]) <= r) return true;
  }
  return false;
}

/**
 * 应用橡皮效果：
 *  - 像素画笔画 → 擦除被橡皮覆盖的像素格。
 *  - 已识别/图形（rect/circle/triangle 等整体线条）→ 整体擦除（防止拆散标准形）。
 *  - 自由笔迹 → 沿橡皮路径切断，实现「部分擦除」。
 *
 * 返回 { next, changed }：changed 表示是否真的删除了内容。
 * 早期实现仅靠「笔画数量是否变化」判断，导致只擦掉笔画末端时
 * （仍为一段、数量不变）不提交，出现「擦不掉」的 bug，现改为按点数比较。
 */
function applyEraser(strokes: Stroke[], eraser: Stroke): { next: Stroke[]; changed: boolean } {
  const r = eraser.width / 2;
  const result: Stroke[] = [];
  let changed = false;
  for (const s of strokes) {
    if (s.style === 'eraser' || s.points.length === 0) continue;
    // 像素画：移除被覆盖的格子。
    if (s.pixel) {
      const kept = s.points.filter((p) => !pointHit({ x: p.x + PIXEL_CELL / 2, y: p.y + PIXEL_CELL / 2 }, eraser, r));
      if (kept.length !== s.points.length) changed = true;
      if (kept.length) result.push({ ...s, points: kept });
      continue;
    }
    // 标准形 / 图形工具：整体擦除。
    if (s.recognized || s.shape) {
      if (s.points.some((p) => pointHit(p, eraser, r))) {
        changed = true;
      } else {
        result.push(s);
      }
      continue;
    }
    // 自由笔迹：切断成若干不相交片段。
    const pts = s.points;
    const segments: Point[][] = [];
    let seg: Point[] = [];
    let removed = 0;
    for (const p of pts) {
      if (pointHit(p, eraser, r)) {
        removed++;
        if (seg.length) {
          segments.push(seg);
          seg = [];
        }
      } else {
        seg.push(p);
      }
    }
    if (seg.length) segments.push(seg);
    if (removed > 0) changed = true;
    for (const pseg of segments) {
      if (pseg.length === 0) continue;
      result.push({ ...s, id: makeId(), points: pseg });
    }
  }
  return { next: result, changed };
}

/** 像素画笔画：每个 point 占据一个 PIXEL_CELL 大小的实心方块。 */
function renderPixelCells(stroke: Stroke, color: string) {
  return (
    <g>
      {stroke.points.map((p, i) => (
        <rect key={i} x={p.x} y={p.y} width={PIXEL_CELL} height={PIXEL_CELL} fill={color} />
      ))}
    </g>
  );
}

/** 图形工具笔画：用起点/终点渲染直线/矩形/三角/圆/坐标轴。 */
function renderShapeElement(stroke: Stroke, color: string) {
  const pts = stroke.points;
  if (pts.length < 2) return null;
  const a = pts[0];
  const b = pts[pts.length - 1];
  const x0 = Math.min(a.x, b.x);
  const x1 = Math.max(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  const y1 = Math.max(a.y, b.y);
  const w = x1 - x0;
  const h = y1 - y0;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const sw = stroke.width;

  switch (stroke.shape) {
    case 'line':
      return (
        <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeWidth={sw} strokeLinecap="round" />
      );
    case 'rect':
      return <rect x={x0} y={y0} width={w} height={h} fill={`${color}22`} stroke={color} strokeWidth={sw} />;
    case 'triangle':
      return (
        <polygon points={`${cx},${y0} ${x1},${y1} ${x0},${y1}`} fill={`${color}22`} stroke={color} strokeWidth={sw} />
      );
    case 'circle':
      return (
        <ellipse cx={cx} cy={cy} rx={w / 2} ry={h / 2} fill={`${color}22`} stroke={color} strokeWidth={sw} />
      );
    case 'axes': {
      // 坐标轴：以拖拽框中心为原点，向四边画出带箭头与刻度的 X/Y 轴。
      const tick = 6;
      const ticks = [...Array(5)].map((_, i) => (i - 2) * 0.25);
      return (
        <g stroke={color} strokeWidth={sw} strokeLinecap="round">
          {/* X 轴 */}
          <line x1={x0} y1={cy} x2={x1} y2={cy} />
          <polygon points={`${x1},${cy} ${x1 - 8},${cy - 4} ${x1 - 8},${cy + 4}`} fill={color} stroke="none" />
          {/* Y 轴 */}
          <line x1={cx} y1={y1} x2={cx} y2={y0} />
          <polygon points={`${cx},${y0} ${cx - 4},${y0 + 8} ${cx + 4},${y0 + 8}`} fill={color} stroke="none" />
          {/* 刻度 */}
          {ticks.map((u, i) => (
            <g key={i}>
              <line x1={cx + u * w} y1={cy - tick} x2={cx + u * w} y2={cy + tick} />
              <line x1={cx - tick} y1={cy - u * h} x2={cx + tick} y2={cy - u * h} />
            </g>
          ))}
        </g>
      );
    }
    default:
      return null;
  }
}

/**
 * 把一条笔画渲染成 SVG 元素：
 *  - 像素画 → 方块网格。
 *  - 图形工具 → 直线/矩形/三角/圆/坐标轴。
 *  - 已识别的标准形（圆/矩形/三角形/直线）→ 单条 path（带填充）。
 *  - 自由笔迹 → 逐点变宽的 line 段（速度压感真实可见）。
 *  - 历史数据里的旧「橡皮笔画」用背景色渲染（兼容旧持久化数据）。
 */
function strokeElements(stroke: Stroke) {
  const pts = stroke.points;
  const color = stroke.style === 'eraser' ? 'var(--background, #fff)' : stroke.color;
  if (stroke.pixel) return renderPixelCells(stroke, color);
  if (stroke.shape) return renderShapeElement(stroke, color);
  if (pts.length < 2) {
    return (
      <path
        d={strokeToPath(stroke)}
        stroke={color}
        strokeWidth={stroke.width}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    );
  }
  if (stroke.recognized) {
    return (
      <path
        d={strokeToPath(stroke)}
        stroke={color}
        strokeWidth={stroke.width}
        fill={stroke.style === 'eraser' ? 'transparent' : `${stroke.color}22`}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    );
  }
  return (
    <g>
      {pts.slice(0, -1).map((a, i) => {
        const b = pts[i + 1];
        const w = ((a.w ?? stroke.width) + (b.w ?? stroke.width)) / 2;
        return (
          <line
            key={i}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            stroke={color}
            strokeWidth={w}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
    </g>
  );
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
  const [undoStack, setUndoStack] = useState<Stroke[][]>([]);
  // 当前正在绘制的笔画：独立于已提交的 strokes，避免绘制过程中污染 undo 快照。
  const [liveStroke, setLiveStroke] = useState<Stroke | null>(null);
  // 撤销/重做栈的引用镜像，供事件回调在不重建闭包的情况下读取最新值。
  const undoStackRef = useRef<Stroke[][]>(undoStack);
  const redoStackRef = useRef<Stroke[][]>(redoStack);
  undoStackRef.current = undoStack;
  redoStackRef.current = redoStack;
  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState<string>(PRESET_COLORS[0]);
  const [width, setWidth] = useState<number>(PRESET_WIDTHS[1]);
  const [recognize, setRecognize] = useState<boolean>(false);
  // 像素画模式：开启后把笔迹吸附到固定网格，绘制像素点。
  const [pixelMode, setPixelMode] = useState<boolean>(false);
  // 橡皮擦尺寸（直径），独立于笔宽，可调。
  const [eraserSize, setEraserSize] = useState<number>(ERASER_SIZES[1]);
  // 图形工具：直线/矩形/三角/圆/坐标轴（null 表示自由绘制）。
  const [shapeTool, setShapeTool] = useState<ShapeId | null>(null);
  // 橡皮擦范围指示器的光标位置（rAF 批处理更新）。
  const [eraserCursor, setEraserCursor] = useState<{ x: number; y: number } | null>(null);
  const eraserCursorRef = useRef<{ x: number; y: number } | null>(null);
  const eraserCursorRaf = useRef(false);
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
  // 缩放/平移：{ k: scale, x: translateX, y: translateY }，内容组 transform = translate(x,y) scale(k)。
  const [view, setView] = useState({ k: 1, x: 0, y: 0 });
  const viewRef = useRef(view);
  viewRef.current = view;
  // 中键拖拽平移状态。
  const panningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0, vx: 0, vy: 0 });
  const MIN_K = 0.25;
  const MAX_K = 8;

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
    const v = viewRef.current;
    // 内容组 transform = translate(v.x, v.y) scale(v.k)，做逆变换回到用户坐标。
    return {
      x: (clientX - rect.left - v.x) / v.k,
      y: (clientY - rect.top - v.y) / v.k,
      t: Date.now(),
    };
  }, []);

  /**
   * 提交一次「动作」：把当前笔画列表压入撤销栈，更新为 next，并清空重做栈。
   * 所有会改变笔画数据的操作（绘制完成 / 擦除 / 清空）都经由它，保证撤销/重做一致。
   */
  const commitStrokes = useCallback((next: Stroke[]) => {
    setUndoStack((u) => [...u, strokesRef.current]);
    setStrokes(next);
    setRedoStack([]);
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      // 中键拖拽 = 平移画布（缩放/平移导航，不影响画笔）。
      if (e.button === 1) {
        panningRef.current = true;
        panStartRef.current = { x: e.clientX, y: e.clientY, vx: viewRef.current.x, vy: viewRef.current.y };
        try {
          svgRef.current?.setPointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
        e.preventDefault();
        return;
      }
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
      // 激活工具：图形工具优先于笔/橡皮；否则按 tool。
      const activeTool: Tool = shapeTool ? 'pen' : tool;
      const strokeWidth = activeTool === 'eraser' ? eraserSize : width;
      const isPixel = pixelMode && activeTool === 'pen' && !shapeTool;
      const point: Point =
        isPixel && p.x >= 0 && p.y >= 0
          ? {
              x: Math.floor(p.x / PIXEL_CELL) * PIXEL_CELL,
              y: Math.floor(p.y / PIXEL_CELL) * PIXEL_CELL,
              w: PIXEL_CELL,
            }
          : { ...p, w: strokeWidth };
      const stroke: Stroke = {
        id: makeId(),
        points: [point],
        color,
        width: strokeWidth,
        style: activeTool,
        recognized: null,
        pixel: isPixel,
        shape: shapeTool ?? undefined,
      };
      currentStrokeRef.current = stroke;
      // 橡皮不用实时预览（擦除在 pointerup 一次性结算），避免临时用背景色
      // 覆盖网格/像素格，造成「擦了网格」的错觉。橡皮范围由光标圆环指示。
      if (activeTool !== 'eraser') {
        setLiveStroke({ ...stroke, points: stroke.points });
      }
    },
    [color, width, tool, eraserSize, pixelMode, shapeTool, getSvgPoint],
  );

  // rAF batching: avoid creating new arrays on every pointermove event
  const rafPendingRef = useRef(false);
  const handlePointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      // 平移模式：更新 view 的 translate。
      if (panningRef.current) {
        const s = panStartRef.current;
        setView((v) => ({
          ...v,
          x: s.vx + (e.clientX - s.x),
          y: s.vy + (e.clientY - s.y),
        }));
        return;
      }
      const p = getSvgPoint(e.clientX, e.clientY);
      // 橡皮范围指示：仅橡皮工具时跟踪光标（rAF 批处理，避免每帧重渲染）。
      if (tool === 'eraser' && !shapeTool) {
        eraserCursorRef.current = { x: p.x, y: p.y };
        if (!eraserCursorRaf.current) {
          eraserCursorRaf.current = true;
          requestAnimationFrame(() => {
            eraserCursorRaf.current = false;
            setEraserCursor(eraserCursorRef.current);
          });
        }
      }
      if (!drawingRef.current || !currentStrokeRef.current) return;
      const stroke = currentStrokeRef.current;
      // 图形工具：保留起点，仅更新终点（拖拽实时预览）。
      if (stroke.shape) {
        const pts = stroke.points;
        if (pts.length === 0) return;
        stroke.points = [pts[0], { x: p.x, y: p.y, t: p.t }];
        setLiveStroke({ ...stroke, points: stroke.points });
        return;
      }
      // 像素画：吸附到网格，进入新格子时才记录，避免重复格子导致卡顿。
      if (stroke.pixel) {
        const cellX = Math.floor(p.x / PIXEL_CELL) * PIXEL_CELL;
        const cellY = Math.floor(p.y / PIXEL_CELL) * PIXEL_CELL;
        const last = stroke.points[stroke.points.length - 1];
        if (last.x === cellX && last.y === cellY) return;
        // 两点跨度超过一格时用 Bresenham 补全中间格子，避免快速拖动「断触」。
        const lastCellX = Math.floor(last.x / PIXEL_CELL);
        const lastCellY = Math.floor(last.y / PIXEL_CELL);
        const curCellX = Math.floor(p.x / PIXEL_CELL);
        const curCellY = Math.floor(p.y / PIXEL_CELL);
        if (Math.abs(curCellX - lastCellX) > 1 || Math.abs(curCellY - lastCellY) > 1) {
          const bridge = bresenhamCells(lastCellX, lastCellY, curCellX, curCellY);
          for (const c of bridge.slice(1)) {
            stroke.points.push({ x: c.x * PIXEL_CELL, y: c.y * PIXEL_CELL, w: PIXEL_CELL });
          }
        } else {
          stroke.points.push({ x: cellX, y: cellY, w: PIXEL_CELL });
        }
        setLiveStroke({ ...stroke, points: stroke.points });
        return;
      }
      const last = stroke.points[stroke.points.length - 1];
      if (Math.hypot(p.x - last.x, p.y - last.y) < 1.5) return;
      // 速度 → 逐点压感宽度：写快时变细、写慢时变粗（限制在半个基础宽度范围内）。
      if (p.t && last.t) {
        const dt = Math.max(8, p.t - last.t);
        const dist = Math.hypot(p.x - last.x, p.y - last.y);
        const velocity = dist / dt;
        const dynamicW = Math.max(1, stroke.width * (1 - Math.min(0.5, velocity * 0.04)));
        p.w = (last.w ?? stroke.width) * 0.5 + dynamicW * 0.5;
      } else {
        p.w = last.w ?? stroke.width;
      }
      // Mutate ref directly (no React re-render per point)
      stroke.points.push(p);

      // Batch React state update via rAF — one re-render per frame max.
      // liveStroke 与 currentStrokeRef 共享同一个 points 数组，只替换对象引用即可触发重绘。
      if (!rafPendingRef.current) {
        rafPendingRef.current = true;
        requestAnimationFrame(() => {
          rafPendingRef.current = false;
          const s = currentStrokeRef.current;
          if (!s) return;
          setLiveStroke({ ...s, points: s.points });
        });
      }
    },
    [getSvgPoint, tool, shapeTool],
  );

  const handlePointerUp = useCallback(() => {
    if (panningRef.current) {
      panningRef.current = false;
      return;
    }
    if (!drawingRef.current || !currentStrokeRef.current) return;
    drawingRef.current = false;
    const stroke = currentStrokeRef.current;
    currentStrokeRef.current = null;
    setLiveStroke(null);

    if (stroke.style === 'eraser') {
      // 真正的橡皮：沿橡皮路径切断/擦除被触达的笔画（支持部分擦除）。
      // 只要删除了任何点（changed=true）就提交，避免只擦末端却因数量不变而不提交。
      const current = strokesRef.current;
      const { next, changed } = applyEraser(current, stroke);
      if (changed) commitStrokes(next);
      return;
    }

    // 图形工具：起点与终点过于接近视为误触，忽略。
    if (stroke.shape) {
      const a = stroke.points[0];
      const b = stroke.points[stroke.points.length - 1];
      if (stroke.points.length >= 2 && Math.hypot(b.x - a.x, b.y - a.y) > 2) {
        commitStrokes([...strokesRef.current, { ...stroke, points: [...stroke.points] }]);
      }
      return;
    }

    if (recognize && stroke.points.length >= 2 && !stroke.pixel) {
      stroke.recognized = recognizeShape(stroke.points);
    }
    // 提交：把这条笔画加入列表，并把此前状态压入撤销栈。
    commitStrokes([...strokesRef.current, { ...stroke, points: [...stroke.points] }]);
  }, [recognize, commitStrokes]);

  // 快照式撤销：从撤销栈顶恢复，同时把当前状态压入重做栈（不嵌套 setState）。
  const handleUndo = useCallback(() => {
    const u = undoStackRef.current;
    if (u.length === 0) return;
    const prev = u[u.length - 1];
    setUndoStack(u.slice(0, -1));
    setRedoStack([...redoStackRef.current, strokesRef.current]);
    setStrokes(prev);
  }, []);

  const handleRedo = useCallback(() => {
    const r = redoStackRef.current;
    if (r.length === 0) return;
    const next = r[r.length - 1];
    setRedoStack(r.slice(0, -1));
    setUndoStack([...undoStackRef.current, strokesRef.current]);
    setStrokes(next);
  }, []);

  const handleClear = useCallback(() => {
    if (strokesRef.current.length === 0) return;
    commitStrokes([]);
  }, [commitStrokes]);

  /** 以屏幕坐标 (clientX, clientY) 为锚点缩放，保持光标下的内容位置不变。 */
  const zoomAt = useCallback((factor: number, clientX?: number, clientY?: number) => {
    const svg = svgRef.current;
    const rect = svg?.getBoundingClientRect();
    const px = clientX !== undefined && rect ? clientX - rect.left : rect ? rect.width / 2 : 0;
    const py = clientY !== undefined && rect ? clientY - rect.top : rect ? rect.height / 2 : 0;
    const v = viewRef.current;
    const nextK = Math.min(MAX_K, Math.max(MIN_K, v.k * factor));
    if (nextK === v.k) return;
    // 保持锚点的用户坐标不变：screen = x + k*user  ⇒  newX = px - (nextK/k)*(px - x)
    const ratio = nextK / v.k;
    setView({
      k: nextK,
      x: px - (px - v.x) * ratio,
      y: py - (py - v.y) * ratio,
    });
  }, []);

  const handleWheel = useCallback(
    (e: React.WheelEvent<SVGSVGElement>) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      zoomAt(factor, e.clientX, e.clientY);
    },
    [zoomAt],
  );

  const handleZoomReset = useCallback(() => setView({ k: 1, x: 0, y: 0 }), []);

  const handleExport = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    const w = svg.clientWidth || 1200;
    const h = svg.clientHeight || 800;
    clone.setAttribute('width', String(w));
    clone.setAttribute('height', String(h));
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    // 背景现在是 SVG pattern rect（随内容缩放）；导出时只需把根底色内联进 style，
    // 让空白/像素模式也有底色，同时保留点阵/方格/横线 pattern。
    const computedBg = getComputedStyle(document.documentElement).getPropertyValue('--background')?.trim() || '#ffffff';
    clone.style.backgroundColor = computedBg;
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

  const empty = strokes.length === 0 && !liveStroke;

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
          <span className="rounded border border-amber-500/40 bg-amber-500/10 px-1 text-[9px] font-semibold leading-4 text-amber-600 dark:text-amber-400">
            BETA
          </span>
        </div>
        <div className="w-px h-5 bg-border/60" />
        {/* Tool toggle */}
        <button
          type="button"
          onClick={() => {
            setShapeTool(null);
            setTool('pen');
          }}
          className={cn(
            'grid place-items-center size-7 rounded-md transition-colors',
            toolBtn.pen && !shapeTool
              ? 'bg-primary/15 text-primary'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent/60',
          )}
          aria-label="pen"
        >
          <Pencil className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={() => {
            setShapeTool(null);
            setTool('eraser');
          }}
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
              onClick={() => {
                setShapeTool(shapeTool === id ? null : id);
                setTool('pen');
              }}
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
            setPixelMode((m) => !m);
            setShapeTool(null);
            setTool('pen');
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

        {/* Width / Eraser size */}
        {tool === 'eraser' && !shapeTool ? (
          <div className="flex items-center gap-1">
            {ERASER_SIZES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setEraserSize(s)}
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
            // 只保留主题底色；点阵/方格/横线背景改为 SVG pattern，随缩放/平移一起变换。
            backgroundColor: 'var(--background, #fff)',
          }}
          onWheel={handleWheel}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        >
          <defs>
            {/* 背景图案：放在用户坐标系内，随内容一起缩放/平移，避免「背景不缩放」的错位感。 */}
            <pattern id="bg-dot" width="20" height="20" patternUnits="userSpaceOnUse">
              <circle cx="10" cy="10" r="1.5" fill="oklch(0.55 0 0 / 0.28)" />
            </pattern>
            <pattern id="bg-grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="oklch(0.55 0 0 / 0.16)" strokeWidth="1" />
            </pattern>
            <pattern id="bg-ruled" width="20" height="24" patternUnits="userSpaceOnUse">
              <path d="M 0 24 L 20 24" fill="none" stroke="oklch(0.55 0 0 / 0.18)" strokeWidth="1" />
            </pattern>
            {/* 像素画网格：开启像素模式时显示网格线，便于对齐像素点。 */}
            <pattern id="pixelGrid" width={PIXEL_CELL} height={PIXEL_CELL} patternUnits="userSpaceOnUse">
              <path
                d={`M ${PIXEL_CELL} 0 L 0 0 0 ${PIXEL_CELL}`}
                fill="none"
                stroke="oklch(0.55 0 0 / 0.16)"
                strokeWidth="1"
              />
            </pattern>
          </defs>

          {/* 可缩放/平移的内容组：transform = translate(x,y) scale(k)。 */}
          <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
            {/* 背景层：非像素模式且非空白时绘制 CSS 同款 pattern（覆盖足够大的范围）。 */}
            {!pixelMode && background !== 'blank' && (
              <rect
                x="-10000"
                y="-10000"
                width="20000"
                height="20000"
                fill={`url(#bg-${background})`}
                pointerEvents="none"
              />
            )}
            {/* 像素网格：开启像素模式时叠加（此时已强制隐藏上面的 pattern，不重叠）。 */}
            {pixelMode && (
              <rect x="-10000" y="-10000" width="20000" height="20000" fill="url(#pixelGrid)" pointerEvents="none" />
            )}
            {strokes.map((stroke) => (
              <g key={stroke.id}>{strokeElements(stroke)}</g>
            ))}
            {liveStroke && <g>{strokeElements(liveStroke)}</g>}
            {/* 橡皮擦范围指示器：显示当前橡皮的擦除直径（用户坐标，随缩放缩放）。
                仅用虚线描边，不加半透明填充，避免看起来像「把网格擦淡/擦掉」。 */}
            {eraserCursor && tool === 'eraser' && !shapeTool && (
              <circle
                cx={eraserCursor.x}
                cy={eraserCursor.y}
                r={eraserSize / 2}
                fill="none"
                stroke="var(--primary, #0ea5e9)"
                strokeWidth="1.5"
                strokeDasharray="4 3"
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
              />
            )}
          </g>
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
