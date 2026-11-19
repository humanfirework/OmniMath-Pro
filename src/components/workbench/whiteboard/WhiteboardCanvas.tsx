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

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Trash2,
  PencilRuler,
  Grid3x3,
  Minus,
  CircleDot,
  Square,
  Triangle,
  Circle,
  Crosshair,
  ZoomIn,
  ZoomOut,
  Sigma,
  RotateCcw,
  RotateCw,
  Timer,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { t, useLocale } from '@/lib/i18n';
import { useSettingsStore } from '@/lib/store/settingsStore';
import { InkCanvas, type InkCanvasHandle } from './InkCanvas';
import { PenDock } from './PenDock';
import { WhiteboardToolDock } from './WhiteboardToolDock';
import { WhiteboardActionBar } from './WhiteboardActionBar';
import { useCoarsePointer } from '@/hooks/use-coarse-pointer';
import { PEN_ERASER_SIZES } from '@/lib/ink/presets';
import { hitTestInk, translateInk } from '@/lib/ink/hitTest';
import { applyEraser, type EraserMode } from '@/lib/ink/eraser';
import { rotateSelection, scaleSelection } from '@/lib/ink/transform';
import { summarizeLatency, type LatencyStats } from '@/lib/ink/latency';
import type { InkBrush, InkPoint, InkStroke, InkView } from '@/lib/ink/types';
import {
  getGlyphTemplates,
  recognizeMathInk,
  addUserGlyphSamples,
  buildRecognizedText,
  buildRecognizedDisplay,
  type RecognizedGlyph,
} from '@/lib/mathnotes/recognize';
import { selectRecentLine } from '@/lib/ink/recognizeScope';
import type { MathCard } from './math/MathCardView';
import type { MathNoteDraft } from './math/MathNotePanel';

// 数学卡片 / 识别面板静态依赖 mathjs（约 1.5 MB）。白板首屏只需要墨迹引擎，
// 这里改为按需加载：只有真的出现数学卡片或识别草稿时才拉取解题引擎。
const MathCardView = lazy(() =>
  import('./math/MathCardView').then((m) => ({ default: m.MathCardView })),
);
const MathNotePanel = lazy(() =>
  import('./math/MathNotePanel').then((m) => ({ default: m.MathNotePanel })),
);

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
const MATH_CARDS_KEY = 'omnimath-math-cards-v1';

function loadMathCards(): MathCard[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(MATH_CARDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (c): c is MathCard =>
        !!c &&
        typeof c.id === 'string' &&
        typeof c.x === 'number' &&
        typeof c.y === 'number' &&
        (c.kind === 'number' || c.kind === 'plot') &&
        typeof c.expression === 'string' &&
        Array.isArray(c.range),
    );
  } catch {
    return [];
  }
}

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
      if (!Array.isArray(parsed?.strokes)) return [];
      // 旧版本会自动把近似方/圆的自由笔迹渲染成规则图形。那个开关已经
      // 移除，这里顺手清掉落盘的 recognized 标记，让历史笔迹恢复原样。
      return parsed.strokes.map((s: Stroke) => (s ? { ...s, recognized: null } : s));
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
  const [eraserMode, setEraserMode] = useState<EraserMode>('partial');
  // 笔刷 / 颜色 / 线宽 / 识别开关 / 数学模式都跨会话保留：
  // 用户挑好的笔不该每次进白板都被重置。
  const brush = useSettingsStore((s) => s.whiteboardBrush);
  const setBrush = useSettingsStore((s) => s.setWhiteboardBrush);
  const color = useSettingsStore((s) => s.whiteboardColor);
  const setColor = useSettingsStore((s) => s.setWhiteboardColor);
  const width = useSettingsStore((s) => s.whiteboardWidth);
  const setWidth = useSettingsStore((s) => s.setWhiteboardWidth);
  const stabilizer = useSettingsStore((s) => s.whiteboardStabilizer);
  const setStabilizer = useSettingsStore((s) => s.setWhiteboardStabilizer);
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
  const mathMode = useSettingsStore((s) => s.whiteboardMathMode);
  const setMathMode = useSettingsStore((s) => s.setWhiteboardMathMode);
  const [mathDraft, setMathDraft] = useState<MathNoteDraft | null>(null);
  const [mathScopeBox, setMathScopeBox] = useState<{
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  } | null>(null);
  const [recognizing, setRecognizing] = useState(false);
  const recognizingRef = useRef(false);
  const [mathCards, setMathCards] = useState<MathCard[]>(loadMathCards);
  const [latencyProbe, setLatencyProbeOn] = useState(false);
  const [latencyStats, setLatencyStats] = useState<LatencyStats>({
    count: 0, avg: 0, p95: 0, max: 0, min: 0,
  });
  const latencySamplesRef = useRef<number[]>([]);
  const latencyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const inkRef = useRef<InkCanvasHandle>(null);
  const strokesRef = useRef(strokes);
  strokesRef.current = strokes;
  const [view, setView] = useState<InkView>({ k: 1, x: 0, y: 0 });

  const mathModeRef = useRef(mathMode);
  mathModeRef.current = mathMode;
  const mathTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastMathIndexRef = useRef(0);
  const mathAnchorRef = useRef({ x: 0, y: 0 });
  const mathScopeBoxRef = useRef<{ x0: number; y0: number; x1: number; y1: number } | null>(null);

  useEffect(() => {
    return () => {
      if (mathTimerRef.current) clearTimeout(mathTimerRef.current);
      if (latencyTimerRef.current) clearTimeout(latencyTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(MATH_CARDS_KEY, JSON.stringify(mathCards));
    } catch {
      // ignore storage errors
    }
  }, [mathCards]);

  // 笔画落盘改为防抖：大画布每落一笔就同步序列化 + 写 localStorage 会占用
  // 主线程；这里合并连续改动，并在卸载 / 页面隐藏前 flush，保证不丢最后一笔。
  const latestBoardRef = useRef({ strokes, background });
  useEffect(() => {
    latestBoardRef.current = { strokes, background };
  }, [strokes, background]);

  const quotaWarnedRef = useRef(false);
  const persistBoard = useCallback(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(latestBoardRef.current));
    } catch (err) {
      if (!quotaWarnedRef.current) {
        quotaWarnedRef.current = true;
        console.warn('[whiteboard] 画布保存失败（可能是存储空间已满）', err);
      }
    }
  }, []);

  // 落盘放到用户停笔之后：1200ms 防抖 + requestIdleCallback。大画布每写一笔
  // 就同步 JSON.stringify 会明显卡顿，这里只在真正空闲时才序列化。
  useEffect(() => {
    let idleHandle: number | null = null;
    const w = window as typeof window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    const timer = setTimeout(() => {
      if (w.requestIdleCallback) {
        idleHandle = w.requestIdleCallback(() => {
          idleHandle = null;
          persistBoard();
        }, { timeout: 2500 });
      } else {
        persistBoard();
      }
    }, 1200);
    return () => {
      clearTimeout(timer);
      if (idleHandle !== null) w.cancelIdleCallback?.(idleHandle);
    };
  }, [strokes, background, persistBoard]);

  useEffect(() => {
    const flush = () => persistBoard();
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [persistBoard]);

  /** 提交一次动作：旧状态压入撤销栈（最多 50 步），清空重做栈。 */
  const commitStrokes = useCallback((next: Stroke[]) => {
    setUndoStack((u) => [...u, strokesRef.current].slice(-50));
    setStrokes(next);
    setRedoStack([]);
  }, []);

  /**
   * Recognize the ink on the line the user just finished writing.
   *
   * We deliberately re-read a short trailing window instead of only the ink
   * added since the last pass: a slow writer frequently pauses for >1s
   * between symbols, and "recognize only new strokes" would then evaluate
   * "3" instead of "2+3".
   */
  /** 把一次识别结果落到草稿面板：识别文本立即显示，mathjs 结果异步补。 */
  const applyMathRecognition = useCallback(
    (
      rec: ReturnType<typeof recognizeMathInk>,
      anchor: { x: number; y: number },
      source?: Array<{ points: InkPoint[] }>,
    ) => {
      mathAnchorRef.current = anchor;
      lastMathIndexRef.current = strokesRef.current.length;
      if (source && source.length > 0) {
        let x0 = Infinity;
        let y0 = Infinity;
        let x1 = -Infinity;
        let y1 = -Infinity;
        for (const stroke of source) {
          for (const p of stroke.points) {
            if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
            if (p.x < x0) x0 = p.x;
            if (p.y < y0) y0 = p.y;
            if (p.x > x1) x1 = p.x;
            if (p.y > y1) y1 = p.y;
          }
        }
        const box = Number.isFinite(x0) ? { x0, y0, x1, y1 } : null;
        mathScopeBoxRef.current = box;
        setMathScopeBox(box);
      } else {
        mathScopeBoxRef.current = null;
        setMathScopeBox(null);
      }
      if (typeof window !== 'undefined') {
        // Lightweight diagnostic hook for bug reports / automated tests.
        (window as unknown as Record<string, unknown>).__omnimathRecognition = {
          text: rec.text,
          display: rec.display,
          confidence: rec.confidence,
          usedStrokes: source?.length ?? 0,
          scopeBox: mathScopeBoxRef.current ? { ...mathScopeBoxRef.current } : null,
          glyphs: rec.glyphs.map((g) => ({
            char: g.char,
            confidence: Number(g.confidence.toFixed(3)),
            alternatives: g.alternatives,
            reason: g.reason,
            superscript: g.superscript,
            bbox: g.bbox,
          })),
        };
      }
      setMathDraft({
        text: rec.text,
        display: rec.display,
        sourceText: rec.text,
        glyphs: rec.glyphs,
        layoutGlyphs: rec.layoutGlyphs,
        confidence: rec.confidence,
        error: rec.text ? undefined : rec.error ?? '没有识别到公式，可重试或直接输入',
        sourcePoints: source?.map((s) => s.points),
      });
      if (rec.text) {
        const recognizedText = rec.text;
        void import('@/lib/mathnotes/expression')
          .then(({ evaluateMathNote }) => {
            const evaluation = evaluateMathNote(recognizedText);
            if (!evaluation.ok) {
              setMathDraft((prev) =>
                prev && prev.sourceText === recognizedText
                  ? { ...prev, error: evaluation.error }
                  : prev,
              );
            }
          })
          .catch(() => {
            // 引擎加载失败：保留识别文本，用户仍可手动修正 / 插入。
          });
      }
    },
    [],
  );

  /**
   * One-click fix for a low-confidence glyph from the recognition panel.
   * Also stores the user's actual strokes under the corrected character,
   * so the on-device template bank learns this handwriting immediately.
   */
  const handleCorrectGlyph = useCallback((index: number, char: string) => {
    setMathDraft((prev) => {
      if (!prev) return prev;
      const base = prev.layoutGlyphs ?? prev.glyphs;
      const target = base[index];
      if (!target) return prev;
      addUserGlyphSamples([{ ...target, char, displayChar: char, confidence: 1 }]);
      const nextGlyphs: RecognizedGlyph[] = base.map((g, i) =>
        i === index
          ? { ...g, char, displayChar: char, confidence: 1, alternatives: [] }
          : g,
      );
      return {
        ...prev,
        layoutGlyphs: nextGlyphs,
        text: buildRecognizedText(nextGlyphs),
        display: buildRecognizedDisplay(nextGlyphs),
        confidence: Math.max(prev.confidence, 0.85),
      };
    });
  }, []);

  const recognizeMathFromInk = useCallback(() => {
    if (!mathModeRef.current || recognizingRef.current) return;
    const all = strokesRef.current.filter((s) => !s.shape && !s.pixel);
    if (all.length === 0) return;

    const bboxOf = (s: Stroke) => {
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (const p of s.points) {
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
        if (p.x < x0) x0 = p.x;
        if (p.y < y0) y0 = p.y;
        if (p.x > x1) x1 = p.x;
        if (p.y > y1) y1 = p.y;
      }
      return Number.isFinite(x0) ? { x0, y0, x1, y1 } : null;
    };

    // 以最后一笔为锚点，只收拢同一行、相邻的笔画。之前用「最近 16 笔的
    // 中位数水平带」：用户在另一行写第二个公式或随手画标注时，两行会被
    // 混成一次识别，结果直接错乱。现在换行/大间隙都会截断作用域。
    const recent = all.slice(-40);
    const scoped = recent
      .map((stroke) => ({ stroke, box: bboxOf(stroke) }))
      .filter((item): item is { stroke: Stroke; box: { x0: number; y0: number; x1: number; y1: number } } => item.box !== null);
    if (scoped.length === 0) return;
    const slice: Stroke[] = selectRecentLine(scoped).map((item) => item.stroke);

    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const s of slice) {
      const b = bboxOf(s);
      if (!b) continue;
      if (b.x0 < x0) x0 = b.x0;
      if (b.y0 < y0) y0 = b.y0;
      if (b.x1 > x1) x1 = b.x1;
      if (b.y1 > y1) y1 = b.y1;
    }
    if (!Number.isFinite(x0)) return;
    recognizingRef.current = true;
    setRecognizing(true);
    // 先让当前这一帧把最新笔画画完，再执行同步识别，避免笔尖刚抬起时掉帧。
    requestAnimationFrame(() => {
      try {
        const rec = recognizeMathInk(slice.map((s) => ({ points: s.points })));
        applyMathRecognition(rec, { x: x1 + 18, y: y0 }, slice);
      } finally {
        recognizingRef.current = false;
        setRecognizing(false);
      }
    });
  }, [applyMathRecognition]);

  /** 手动识别：只识别当前选中的笔画，适合画布上同时有多个公式/标注时。 */
  const recognizeSelected = useCallback(() => {
    const ids = new Set(selectedIds);
    const selected = strokesRef.current.filter(
      (s) => ids.has(s.id) && !s.shape && !s.pixel,
    );
    if (selected.length === 0) {
      toast.error('选中的内容里没有可识别的手写', {
        description: '先用套圈或选择工具圈住一个公式，再点「识别公式」。',
      });
      return;
    }
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    for (const s of selected) {
      for (const p of s.points) {
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
        if (p.x < x0) x0 = p.x;
        if (p.y < y0) y0 = p.y;
        if (p.x > x1) x1 = p.x;
      }
    }
    recognizingRef.current = true;
    setRecognizing(true);
    requestAnimationFrame(() => {
      try {
        const rec = recognizeMathInk(selected.map((s) => ({ points: s.points })));
        applyMathRecognition(
          rec,
          {
            x: Number.isFinite(x1) ? x1 + 18 : 40,
            y: Number.isFinite(y0) ? y0 : 40,
          },
          selected,
        );
      } finally {
        recognizingRef.current = false;
        setRecognizing(false);
      }
    });
  }, [selectedIds, applyMathRecognition]);

  const scheduleMathRecognition = useCallback(
    (delay = 700) => {
      if (!mathModeRef.current) return;
      if (mathTimerRef.current) clearTimeout(mathTimerRef.current);
      mathTimerRef.current = setTimeout(() => {
        mathTimerRef.current = null;
        recognizeMathFromInk();
      }, delay);
    },
    [recognizeMathFromInk],
  );

  const toggleMathMode = useCallback(() => {
    const next = !mathModeRef.current;
    mathModeRef.current = next;
    setMathMode(next);
    lastMathIndexRef.current = strokesRef.current.length;
    if (next) {
      // Warm the font templates while the user is still writing.
      const warm = () => getGlyphTemplates();
      const w = window as typeof window & {
        requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      };
      if (w.requestIdleCallback) w.requestIdleCallback(warm, { timeout: 2000 });
      else setTimeout(warm, 400);
    } else {
      if (mathTimerRef.current) {
        clearTimeout(mathTimerRef.current);
        mathTimerRef.current = null;
      }
      setMathDraft(null);
      setMathScopeBox(null);
    }
  }, []);

  const handleInsertMath = useCallback(
    async (text: string) => {
      const { evaluateMathNote } = await import('@/lib/mathnotes/expression');
      const evaluation = evaluateMathNote(text);
      if (!evaluation.ok) return;
      // Only learn from notes the user accepted without editing: a corrected
      // expression may no longer match the recognized glyphs.
      if (mathDraft && mathDraft.sourceText === text) {
        addUserGlyphSamples(mathDraft.glyphs);
      }
      const anchor = mathAnchorRef.current;
      const card: MathCard = {
        id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        x: anchor.x,
        y: anchor.y,
        kind: evaluation.kind === 'plot' ? 'plot' : 'number',
        expression: evaluation.expression,
        display: text,
        latex: evaluation.latex,
        valueText: evaluation.valueText,
        range: evaluation.plot?.range ?? [-10, 10],
        samples: evaluation.plot?.samples,
        glyphs: mathDraft?.glyphs,
        createdAt: Date.now(),
      };
      setMathCards((prev) => [...prev, card]);
      setMathDraft(null);
      setMathScopeBox(null);
    },
    [mathDraft],
  );

  const updateMathCard = useCallback((next: MathCard) => {
    setMathCards((prev) => prev.map((c) => (c.id === next.id ? next : c)));
  }, []);

  const deleteMathCard = useCallback((id: string) => {
    setMathCards((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const handleMathRetry = useCallback(() => {
    lastMathIndexRef.current = 0;
    recognizeMathFromInk();
  }, [recognizeMathFromInk]);

  const openManualMath = useCallback(() => {
    mathAnchorRef.current = {
      x: (400 - view.x) / Math.max(0.05, view.k),
      y: (260 - view.y) / Math.max(0.05, view.k),
    };
    setMathDraft({
      text: '',
      display: '',
      glyphs: [],
      confidence: 1,
    });
    setMathScopeBox(null);
  }, [view]);

  const handleLatencySample = useCallback((ms: number) => {
    const samples = latencySamplesRef.current;
    samples.push(ms);
    if (samples.length > 240) samples.shift();
    if (!latencyTimerRef.current) {
      latencyTimerRef.current = setTimeout(() => {
        latencyTimerRef.current = null;
        setLatencyStats(summarizeLatency(latencySamplesRef.current));
      }, 250);
    }
  }, []);

  const resetLatency = useCallback(() => {
    latencySamplesRef.current = [];
    setLatencyStats({ count: 0, avg: 0, p95: 0, max: 0, min: 0 });
  }, []);

  const toggleLatencyProbe = useCallback(() => {
    const next = !latencyProbe;
    setLatencyProbeOn(next);
    inkRef.current?.setLatencyProbe(next);
    resetLatency();
  }, [latencyProbe, resetLatency]);

  const handleStrokeEnd = useCallback(
    (stroke: InkStroke): boolean => {
      if (stroke.shape) {
        const a = stroke.points[0];
        const b = stroke.points[stroke.points.length - 1];
        if (stroke.points.length < 2 || Math.hypot(b.x - a.x, b.y - a.y) <= 2) return false;
        commitStrokes([...strokesRef.current, { ...stroke, points: [...stroke.points] }]);
        // 形状工具只生效一次：画完一个图形立刻回到钢笔。否则用户下次随手
        // 写字母时，笔迹会继续被套成矩形 / 三角形，看起来像「被自动纠正」。
        setShapeTool(null);
        setTool('pen');
        inkRef.current?.setStyle({ tool: 'pen', shapeTool: null });
        return true;
      }
      // 自由笔迹永远保持原样。以前这里会把「像方形 / 三角形」的笔画自动
      // 拉直，写 x、写 n 时经常突然变成几何图形；想要规则图形请用形状工具。
      commitStrokes([...strokesRef.current, { ...stroke, points: [...stroke.points] }]);
      if (!stroke.pixel) scheduleMathRecognition();
      return true;
    },
    [commitStrokes, scheduleMathRecognition],
  );

  const handleEraseEnd = useCallback(
    (stroke: InkStroke): boolean => {
      const { next, changed } = applyEraser(strokesRef.current, stroke, eraserMode);
      if (!changed) return false;
      commitStrokes(next);
      lastMathIndexRef.current = 0;
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

  const handleScaleSelection = useCallback(
    (factor: number) => {
      if (selectedIds.length === 0) return;
      commitStrokes(scaleSelection(strokesRef.current, selectedIds, factor));
    },
    [selectedIds, commitStrokes],
  );

  const handleRotateSelection = useCallback(
    (degrees: number) => {
      if (selectedIds.length === 0) return;
      commitStrokes(rotateSelection(strokesRef.current, selectedIds, degrees));
    },
    [selectedIds, commitStrokes],
  );

  const handleDeleteSelected = useCallback(() => {
    if (selectedIds.length === 0) return;
    const selected = new Set(selectedIds);
    commitStrokes(strokesRef.current.filter((s) => !selected.has(s.id)));
    setSelectedIds([]);
  }, [selectedIds, commitStrokes]);

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
    lastMathIndexRef.current = 0;
    setSelectedIds([]);
  }, []);

  const handleRedo = useCallback(() => {
    const r = redoStackRef.current;
    if (r.length === 0) return;
    const next = r[r.length - 1];
    setRedoStack(r.slice(0, -1));
    setUndoStack([...undoStackRef.current, strokesRef.current].slice(-50));
    setStrokes(next);
    lastMathIndexRef.current = 0;
    setSelectedIds([]);
  }, []);

  const handleClear = useCallback(() => {
    if (strokesRef.current.length === 0) return;
    commitStrokes([]);
    lastMathIndexRef.current = 0;
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
        handleDeleteSelected();
        return;
      }
      if (selectedIds.length > 0) {
        if (e.key === '+' || e.key === '=') {
          e.preventDefault();
          handleScaleSelection(1.1);
        } else if (e.key === '-' || e.key === '_') {
          e.preventDefault();
          handleScaleSelection(0.9);
        } else if (e.key === '[') {
          e.preventDefault();
          handleRotateSelection(-15);
        } else if (e.key === ']') {
          e.preventDefault();
          handleRotateSelection(15);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          setSelectedIds([]);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    selectedIds,
    handleUndo,
    handleRedo,
    handleDeleteSelected,
    handleScaleSelection,
    handleRotateSelection,
  ]);

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

  return (
    <div className="flex flex-col h-full bg-background">

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
          stabilizer={stabilizer}
          selectedIds={selectedIds}
          onStrokeEnd={handleStrokeEnd}
          onEraseEnd={handleEraseEnd}
          onSelect={handleSelect}
          onMoveEnd={handleMoveEnd}
          onViewChange={handleViewChange}
          hitTest={handleHitTest}
          onLatency={handleLatencySample}
        />

        {/* 桌面/平板：左侧浮动工具坞 + 底部操作条（触屏小屏仍用 PenDock） */}
        {!coarse && (
          <>
            <WhiteboardToolDock
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
              stabilizer={stabilizer}
              onStabilizer={setStabilizer}
              background={background}
              onBackground={(b) => {
                setBackground(b);
                inkRef.current?.setStyle({ background: b });
              }}
              mathMode={mathMode}
              onToggleMath={toggleMathMode}
              latencyProbe={latencyProbe}
              onLatencyProbe={toggleLatencyProbe}
              onClear={handleClear}
            />
            <WhiteboardActionBar
              zoomPercent={Math.round(view.k * 100)}
              onZoomIn={() => zoomAt(1.2)}
              onZoomOut={() => zoomAt(1 / 1.2)}
              onResetZoom={handleZoomReset}
              canUndo={undoStack.length > 0}
              canRedo={redoStack.length > 0}
              onUndo={handleUndo}
              onRedo={handleRedo}
              onExport={handleExport}
              exportDisabled={empty}
            />
          </>
        )}

        {coarse && (
          <button
            type="button"
            onClick={toggleMathMode}
            aria-pressed={mathMode}
            aria-label="数学模式"
            title="数学模式：停笔 0.7 秒识别手写公式"
            className={cn(
              'absolute bottom-24 right-3 z-30 grid size-10 place-items-center rounded-full border shadow-lg backdrop-blur transition-colors',
              mathMode
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border/70 bg-background/95 text-muted-foreground hover:text-foreground',
            )}
          >
            <Sigma className="size-4" />
          </button>
        )}

        {/* 识别范围框：让用户看到这次识别到底用了哪一段笔迹 */}
        {mathScopeBox && mathDraft && (
          <div
            className="pointer-events-none absolute z-10 rounded-md border-2 border-sky-500/70"
            style={{
              left: mathScopeBox.x0 * view.k + view.x - 6,
              top: mathScopeBox.y0 * view.k + view.y - 6,
              width: Math.max(10, (mathScopeBox.x1 - mathScopeBox.x0) * view.k + 12),
              height: Math.max(10, (mathScopeBox.y1 - mathScopeBox.y0) * view.k + 12),
            }}
          >
            {[
              '-left-1 -top-1',
              '-right-1 -top-1',
              '-left-1 -bottom-1',
              '-right-1 -bottom-1',
            ].map((c) => (
              <span
                key={c}
                className={cn('absolute size-2 rounded-full bg-sky-500 shadow-sm', c)}
              />
            ))}
          </div>
        )}

        {/* Vector math cards (calculations / live graphs) — 引擎按需加载 */}
        <Suspense fallback={null}>
          {mathCards.map((card) => (
            <MathCardView
              key={card.id}
              card={card}
              view={view}
              onChange={updateMathCard}
              onDelete={deleteMathCard}
            />
          ))}

          {mathDraft && (
            <MathNotePanel
              draft={mathDraft}
              raised={coarse}
              anchor={mathAnchorRef.current}
              view={view}
              onCorrectGlyph={handleCorrectGlyph}
              onChange={(text) => setMathDraft((prev) => (prev ? { ...prev, text } : prev))}
              onRetry={handleMathRetry}
              onInsert={handleInsertMath}
              onClose={() => {
                setMathDraft(null);
                setMathScopeBox(null);
              }}
            />
          )}
        </Suspense>

        {mathMode && !mathDraft && (
          <div className="pointer-events-none absolute left-3 top-3 z-20 flex items-center gap-1.5 rounded-full border border-border/60 bg-background/85 px-2.5 py-1 text-[10px] text-muted-foreground shadow-sm backdrop-blur">
            <Sigma className="size-3 text-primary" />
            <span className={cn(recognizing && 'animate-pulse text-primary')}>
              {recognizing ? '识别中…' : '数学模式 · 停笔 0.7 秒识别'}
            </span>
            <button
              type="button"
              onClick={openManualMath}
              onPointerDown={(e) => e.stopPropagation()}
              className="pointer-events-auto rounded-full border border-border/60 px-1.5 py-0.5 text-[9.5px] hover:bg-accent hover:text-foreground"
            >
              手动输入
            </button>
          </div>
        )}

        {latencyProbe && (
          <div className="absolute right-3 top-3 z-20 w-48 rounded-lg border border-border/60 bg-background/90 px-2.5 py-2 text-[10px] shadow-lg backdrop-blur">
            <div className="flex items-center gap-1.5 font-medium text-foreground/85">
              <Timer className="size-3 text-primary" />
              笔迹延迟
              <span className="ml-auto text-[9px] font-normal text-muted-foreground">
                {latencyStats.count} 次
              </span>
            </div>
            <div className="mt-1 font-mono text-foreground/80">
              平均 {latencyStats.avg.toFixed(1)}ms · P95 {latencyStats.p95.toFixed(1)}ms
            </div>
            <div className="font-mono text-muted-foreground">
              最大 {latencyStats.max.toFixed(1)}ms
            </div>
            <div className="mt-1 text-[9px] leading-snug text-muted-foreground">
              输入事件 → 下一帧；请在真实触控笔上书写测试
            </div>
            <button
              type="button"
              onClick={resetLatency}
              className="mt-1.5 rounded border border-border/60 px-1.5 py-0.5 text-[9px] text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              重置
            </button>
          </div>
        )}

        {/* Selection actions: move is direct, scale/rotate/delete live here. */}
        {selectedIds.length > 0 && (
          <div
            className="absolute bottom-16 left-3 z-20 flex items-center gap-0.5 rounded-full border border-border/60 bg-background/95 px-1.5 py-1 shadow-lg backdrop-blur"
            onPointerDown={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
          >
            <span className="px-1 text-[10px] text-muted-foreground">
              已选 {selectedIds.length}
            </span>
            <button
              type="button"
              title="缩小 10%"
              aria-label="缩小选区"
              onClick={() => handleScaleSelection(0.9)}
              className="grid size-6 place-items-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <ZoomOut className="size-3.5" />
            </button>
            <button
              type="button"
              title="放大 10%"
              aria-label="放大选区"
              onClick={() => handleScaleSelection(1.1)}
              className="grid size-6 place-items-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <ZoomIn className="size-3.5" />
            </button>
            <button
              type="button"
              title="逆时针旋转 15°"
              aria-label="逆时针旋转选区"
              onClick={() => handleRotateSelection(-15)}
              className="grid size-6 place-items-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <RotateCcw className="size-3.5" />
            </button>
            <button
              type="button"
              title="顺时针旋转 15°"
              aria-label="顺时针旋转选区"
              onClick={() => handleRotateSelection(15)}
              className="grid size-6 place-items-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <RotateCw className="size-3.5" />
            </button>
            <button
              type="button"
              title="识别选中的手写公式"
              aria-label="识别选中的手写公式"
              onClick={recognizeSelected}
              className="mx-0.5 grid size-6 place-items-center rounded-full text-primary hover:bg-primary/10"
            >
              <Sigma className="size-3.5" />
            </button>
            <button
              type="button"
              title="删除选中对象"
              aria-label="删除选中对象"
              onClick={handleDeleteSelected}
              className="grid size-6 place-items-center rounded-full text-rose-500 hover:bg-rose-500/10"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        )}

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
            stabilizer={stabilizer}
            onStabilizer={setStabilizer}
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
                先点左侧 Σ 开启数学模式，写公式后停 0.7 秒出识别浮卡
              </p>
              <p className="mt-1 text-[10.5px] text-muted-foreground/70 max-w-xs">
                sin x、y=x² 都能识别 · 笔迹不会被自动改成几何图形
              </p>
            </div>
          </motion.div>
        )}
      </div>

      {/* Status bar — 手机端隐藏：底部已有笔工具栏 + 五标签导航，
          再叠一行状态会让小屏只剩很少的绘图高度。桌面 / 平板仍显示。 */}
      <div className="shrink-0 hidden md:flex items-center justify-between gap-2 px-3 py-1 border-t border-border/60 bg-card/30 text-[11px] text-muted-foreground">
        <span className="min-w-0 truncate">
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
          {selectedIds.length > 0 ? ` · 已选 ${selectedIds.length}` : ''} · 背景{' '}
          {BACKGROUNDS.find((b) => b.id === background)?.label}
          {mathMode ? ' · 数学模式（停笔 0.7 秒识别）' : ''}
          {mathCards.length > 0 ? ` · ${mathCards.length} 个结果卡` : ''}
        </span>
        <span className="hidden shrink-0 sm:block">
          选中后 +/− 缩放 · [ ] 旋转 · 数学模式手写 y=x³ 自动出图
        </span>
      </div>
    </div>
  );
}
