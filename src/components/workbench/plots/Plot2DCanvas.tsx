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
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  sampleFunction,
  sampleCurve,
  findExtrema,
  formatCoord,
  niceNumber,
  PLOT_PADDING as PADDING,
  PLOT_FONT_FAMILY,
  PLOT_MONO_FAMILY,
  type Curve2DSpec,
  type PlotSample,
} from '@/lib/plots/plot2d';
import type { IntersectionPoint, TangentResult } from '@/lib/plots/plot2dAnalysis';
import { AlertTriangle, RotateCcw, Maximize, Play, Pause } from 'lucide-react';
import type { PlotConfig } from '@/lib/store/workbench';
import { useScopeVersion } from '@/lib/hooks/useScopeVersion';
import { useAnimVersion } from '@/lib/hooks/useAnimVersion';
import { useSettingsStore } from '@/lib/store/settingsStore';

/* ----------------------------- Props ----------------------------- */

/** Advanced overlays computed by Plot2DAdvancedPanel. */
export interface PlotOverlay {
  derivativeSamples: PlotSample[];
  derivativeOrder: 1 | 2 | 3;
  tangent: TangentResult | null;
  intersections: IntersectionPoint[];
}

/** 2D 点：兼容 [x, y] 元组（画布命令）与 { x, y } 对象（vision 贝塞尔段）。 */
export type Pt2 = { x: number; y: number } | [number, number];

/** 贝塞尔段 — 兼容 vision/types 的序列化结构。 */
export type BezierSegmentData =
  | { cmd: 'moveTo'; pts: Array<[number, number]> }
  | { cmd: 'lineTo'; pts: Array<[number, number]> }
  | { cmd: 'quadTo'; pts: Array<[number, number]> }   // [c, end]
  | { cmd: 'cubicTo'; pts: Array<[number, number]> } // [c1, c2, end]
  // vision 拟合结果（Schneider 三次贝塞尔段）：p0/c1/c2/p1 各为 2D 点。
  | { p0: Pt2; c1: Pt2; c2: Pt2; p1: Pt2 };

/** 一条贝塞尔路径 = 多段组成（通常是一条闭合或开放的轮廓）。 */
export interface BezierPathData {
  segments: BezierSegmentData[];
  closed?: boolean;
}

/** 一档拟合候选（粗略 / 均衡 / 精细 / 自定义），供人工修正面板切换。 */
export interface CurveCorrectionCandidate {
  /** 档位标识：loose | balanced | fine | custom。 */
  id: string;
  labelZh: string;
  labelEn: string;
  curves: BezierPathData[];
  errorThreshold: number;
  cornerThreshold: number;
}

/** 蓝图 plot-curves 节点输出的曲线集。 */
export interface CurveSetData {
  id?: string;
  curves: BezierPathData[];
  /** 原始图像的像素宽高（用于像素 → 数学坐标映射）。 */
  width: number;
  height: number;
  color?: string;
  strokeWidth?: number;
  flipY?: boolean;
  flipX?: boolean;
  /**
   * 逐帧动画：`frames[i]` = 第 i 帧的曲线路径数组。存在且非空时，
   * 2D 画布的时间轴会按帧播放，`curves` 仅作为「第 0 帧」的静态回退。
   */
  frames?: BezierPathData[][];
  /** 播放帧率（fps），用于时间轴自动播放速度。 */
  fps?: number;
  /**
   * 多档拟合候选（镜像 vision curve-fit 的 candidates）。
   * 存在时，2D 绘图可让用户「切换候选结果」。
   */
  candidates?: CurveCorrectionCandidate[];
  /**
   * 拟合前的原始折线（像素坐标）。存在时，2D 绘图可让用户
   * 「调整参数（误差阈值/角点阈值）后重新拟合」。
   */
  originalPolylines?: Array<{ points: Pt2[]; closed?: boolean; area?: number }>;
  /** 当前选中的候选档位（默认 'balanced'）。 */
  presetId?: string;
}

export interface HoveredPoint {
  plotId: string;
  x: number;
  y: number;
  slope: number;
}

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
  /** Show axes (x=0, y=0), arrowheads, and tick labels. Independent of showGrid
   *  so the user can hide the grid without losing axis orientation. (D8 fix) */
  showAxes?: boolean;
  /** Show extrema (red) and zeros (blue) markers. */
  showMarkers?: boolean;
  /** Show in-canvas glass legend top-right. */
  showLegend?: boolean;
  /** Advanced overlays: derivatives, tangent line, intersections. */
  overlays?: PlotOverlay;
  /**
   * Per-curve resolved specs (mode + expressions + parameter range) from
   * the panel's curve editor. When a spec exists for a plot id it takes
   * precedence over the legacy `plotType` + view-range sampling path —
   * polar / parametric curves then sample over their own θ / t range and
   * stay stable under pan & zoom.
   */
  curveSpecs?: Record<string, Curve2DSpec>;
  /** 来自 vision/蓝图节点的贝塞尔曲线集叠加层。 */
  curveSets?: CurveSetData[];
}

/* --------------------------- Constants --------------------------- */

const PLOT_COLORS = [
  '#1565c0', // blue (GeoGebra/Desmos style)
  '#c62828', // red
  '#2e7d32', // green
  '#ef6c00', // orange
  '#6a1b9a', // purple
  '#00838f', // cyan
];

/**
 * DPR 上限。高 DPI 屏（2x / 3x Retina）会被裁剪到该值，避免画布 backing store
 * 像素爆炸导致内存/绘制开销失控，同时 ≥1 保证普通屏仍然清晰。2x 足够满足
 * 绝大多数显示器的视觉锐度，是「清晰度 vs 性能」的稳妥折中。
 */
const MAX_DPR = 2;

/** 返回裁剪后的 DPR（1 ~ MAX_DPR），等效于 window.devicePixelRatio 带上限。 */
function getCappedDpr(window: Window): number {
  const dpr = window.devicePixelRatio || 1;
  if (!Number.isFinite(dpr) || dpr <= 0) return 1;
  return Math.min(MAX_DPR, dpr);
}

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

/* ---------------- Curve helpers (Task 5) ---------------- */

/**
 * 对贝塞尔段做固定采样段数的折线化。返回折线点列（含起点）。
 * @param seg 贝塞尔段
 * @param start 当前起点（上一段的结束点），moveTo/lineTo 不需要
 * @param _tol 容差（当前实现未使用，保留接口兼容）
 */
function toXY(p: Pt2): [number, number] {
  return Array.isArray(p) ? [p[0], p[1]] : [p.x, p.y];
}

function bezierFlatten(
  seg: BezierSegmentData,
  start: [number, number] | null = null,
  _tol = 0.5,
): Array<[number, number]> {
  const SAMPLES = 16;
  // vision 拟合结果用的是 Schneider 三次贝塞尔段 { p0, c1, c2, p1 }，无 cmd 字段。
  if (!('cmd' in seg)) {
    const [p0x, p0y] = toXY((seg as { p0: Pt2 }).p0);
    const [c1x, c1y] = toXY((seg as { c1: Pt2 }).c1);
    const [c2x, c2y] = toXY((seg as { c2: Pt2 }).c2);
    const [p1x, p1y] = toXY((seg as { p1: Pt2 }).p1);
    const result: Array<[number, number]> = [];
    for (let i = 0; i <= SAMPLES; i++) {
      const t = i / SAMPLES;
      const mt = 1 - t;
      const x =
        mt * mt * mt * p0x +
        3 * mt * mt * t * c1x +
        3 * mt * t * t * c2x +
        t * t * t * p1x;
      const y =
        mt * mt * mt * p0y +
        3 * mt * mt * t * c1y +
        3 * mt * t * t * c2y +
        t * t * t * p1y;
      result.push([x, y] as [number, number]);
    }
    return result;
  }
  if (!seg.pts || seg.pts.length === 0) return [];
  switch (seg.cmd) {
    case 'moveTo':
    case 'lineTo':
      return seg.pts.map((p) => [p[0], p[1]] as [number, number]);
    case 'quadTo': {
      if (!start) return [];
      const [cp, end] = seg.pts as [[number, number], [number, number]];
      const result: Array<[number, number]> = [];
      for (let i = 0; i <= SAMPLES; i++) {
        const t = i / SAMPLES;
        const mt = 1 - t;
        const x = mt * mt * start[0] + 2 * mt * t * cp[0] + t * t * end[0];
        const y = mt * mt * start[1] + 2 * mt * t * cp[1] + t * t * end[1];
        result.push([x, y] as [number, number]);
      }
      return result;
    }
    case 'cubicTo': {
      if (!start) return [];
      const [c1, c2, end] = seg.pts as [
        [number, number],
        [number, number],
        [number, number],
      ];
      const result: Array<[number, number]> = [];
      for (let i = 0; i <= SAMPLES; i++) {
        const t = i / SAMPLES;
        const mt = 1 - t;
        const x =
          mt * mt * mt * start[0] +
          3 * mt * mt * t * c1[0] +
          3 * mt * t * t * c2[0] +
          t * t * t * end[0];
        const y =
          mt * mt * mt * start[1] +
          3 * mt * mt * t * c1[1] +
          3 * mt * t * t * c2[1] +
          t * t * t * end[1];
        result.push([x, y] as [number, number]);
      }
      return result;
    }
    default:
      return [];
  }
}

function plotPolyline(
  ctx: CanvasRenderingContext2D,
  pts: Array<[number, number]>,
  color: string,
  width: number,
) {
  if (pts.length < 2) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.stroke();
  ctx.restore();
}

/* =================================================================== */
/*  Rendering budget helpers（性能：限制过度绘制导致的卡顿）                    */
/* =================================================================== */

/**
 * 视觉模板（边缘检测 / 姿态追踪 / 视频转曲线）可能生成上千条贝塞尔曲线，
 * 而动画逐帧播放时每条都要 flatten + stroke。全量绘制在主线程上会造成
 * 明显卡顿。这里用「曲线条数上限 + 单条路径点数上限」两道预算：
 *   - 曲线数量超过上限时**均匀抽稀**（保留首尾，整体形状仍可辨）；
 *   - 单条路径 flatten 后点数超过上限时**等距抽稀**，降低 stroke 点开销。
 * 纯几何抽稀，不改变曲线形状的视觉主体，代价可忽略。
 */
const MAX_RENDER_CURVES = 1500;
const MAX_FLATTEN_POINTS = 500;

/** 从数组中等距抽取至多 n 个元素（保留首尾）。 */
function pickDistributed<T>(arr: readonly T[], n: number): T[] {
  if (n <= 0 || arr.length <= n) return arr.slice();
  if (n === 1) return [arr[0]];
  const out: T[] = [];
  const step = (arr.length - 1) / (n - 1);
  for (let i = 0; i < n; i++) {
    out.push(arr[Math.round(i * step)]);
  }
  return out;
}

/* =================================================================== */
/*  Component                                                          */
/* =================================================================== */

/**
 * Resolve which curve paths to draw for a curve set at the current playhead.
 *
 * Animated sets carry `frames`; the active frame's paths are returned. Static
 * sets fall back to `curves`. The index is clamped to a valid range so a stale
 * playhead (after the set is replaced with fewer frames) never overflows.
 */
function resolveCurveSetCurves(cs: CurveSetData, playhead: number): BezierPathData[] {
  if (cs.frames && cs.frames.length > 0) {
    const idx = Math.max(0, Math.min(cs.frames.length - 1, Math.floor(playhead) || 0));
    const frame = cs.frames[idx];
    if (Array.isArray(frame)) return frame;
  }
  return cs.curves;
}

export function Plot2DCanvas({
  plots,
  theme,
  xRange,
  yRange,
  onViewChange,
  onResetView,
  onInsertExample,
  showGrid = true,
  showAxes = true,
  showMarkers = false,
  showLegend = true,
  overlays,
  curveSpecs,
  curveSets = [],
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
  // D4 layered canvas: L1 grid/axes, L2 curves, L3 annotations/markers.
  // L4 (crosshair + tooltip) is drawn directly on the main canvas every frame.
  const gridLayerRef = useRef<HTMLCanvasElement | null>(null);
  const curveLayerRef = useRef<HTMLCanvasElement | null>(null);
  const annotLayerRef = useRef<HTMLCanvasElement | null>(null);
  // Per-layer dirty tracking. Each layer keeps a signature string for its
  // primitive deps (theme/view/size/flags) plus a reference-snapshot of the
  // heavy data (computed / overlays) so we only re-rasterize when something
  // the layer actually depends on has changed. Hover never touches L1-L3.
  const layerSigRef = useRef<{
    l1Sig: string;
    l2Sig: string;
    l3Sig: string;
    l2Computed: ComputedPlot[] | null;
    l3Computed: ComputedPlot[] | null;
    l3Overlays: PlotOverlay | undefined;
    l2CurveSets: CurveSetData[] | undefined;
  }>({
    l1Sig: '',
    l2Sig: '',
    l3Sig: '',
    l2Computed: null,
    l3Computed: null,
    l3Overlays: undefined,
    l2CurveSets: undefined,
  });
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });
  const [drawError, setDrawError] = useState<string | null>(null);
  // Timeline playhead for animated curveSets (frames[fps]). `playhead` is the
  // current frame index; `isPlaying` drives auto-advance in a rAF loop below.
  const [playhead, setPlayhead] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const playheadRafRef = useRef<number | null>(null);
  // Task 8.A: multi-curve hovered points (within 6px screen distance).
  const [hoveredPoints, setHoveredPoints] = useState<HoveredPoint[]>([]);
  // Task 8.B: DOM tooltip follows mouse — store client-relative CSS pixel pos.
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  /** 连续鼠标世界坐标（用于左下角坐标读出，不依赖吸附）。 */
  const [mouseWorld, setMouseWorld] = useState<{ wx: number; wy: number } | null>(null);
  // rAF-batched hover update to throttle pointer moves to ≤ ~120fps and
  // keep per-frame work < 0.8ms for 3 curves × ~1200 samples each.
  const hoverDirtyRef = useRef(false);
  const hoverRafRef = useRef<number | null>(null);
  const hoverPendingRef = useRef<{
    sx: number;
    sy: number;
    wx: number;
    wy: number;
    clientX: number;
    clientY: number;
  } | null>(null);

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

  // A2: 无条件重建全部离屏层。清空每个图层的脏签名 → 下一次 drawNow 必然
  // 全量重绘 L1/L2/L3，消除「离屏层被清空但脏签名未更新」导致的空白/陈旧。
  // 供可见性自愈（A3/A4）、挂载后确定性重绘（A5）、尺寸重建（A6）调用。
  const forceFullRedraw = useCallback(() => {
    layerSigRef.current = {
      l1Sig: '', l2Sig: '', l3Sig: '',
      l2Computed: null, l3Computed: null,
      l3Overlays: undefined, l2CurveSets: undefined,
    };
    scheduleRedraw();
  }, [scheduleRedraw]);

  // Keep viewRef in sync with props.
  useEffect(() => {
    viewRef.current = { x: xRange, y: yRange };
    scheduleRedraw();
  }, [xRange, yRange, scheduleRedraw]);

  /* ----------------------- Sample computation ----------------------- */
  // Sample over the *visible* X range so panning/zooming feels like an
  // infinite canvas: the curve is re-evaluated for whatever region the
  // user is currently looking at. Sample density scales with canvas width
  // (up to the sampler's own cap) to keep curves smooth.
  //
  // `scopeVersion` re-samples every curve the moment a user variable
  // changes (console assignment, slider drag, variable delete) — this is
  // what makes `a = 3` + `plot(sin(a*x))` + slider work live.
  const scopeVersion = useScopeVersion();
  // 参数播放动画专用版本号（与 scopeVersion 解耦）。动画每帧经
  // setScopeVarSilent 只 bump animVersion，本组件订阅它以便在参数动画
  // 期间实时重采样重绘，而其余组件（DemosPanel / AdvancedPanel / 3D 等）
  // 不会在每帧被无谓地重渲染 —— 这是逼近 Desmos 流畅度的关键。
  const animVersion = useAnimVersion();

  // 坐标轴字号设置（来自 settingsStore，默认 12，范围 8–24）。用于刻度
  // 数字与坐标标注的 ctx.font，让用户在设置面板调节字号时画布实时跟随。
  const axisFontSize = useSettingsStore((s) => s.plotAxisFontSize);

  /* ----------------- T7.1 滑块拖动降采样保帧率 -----------------
   * scopeVersion 在滑块拖动时会每帧 bump（高频变化）。若每次都用全精度
   * 采样（可达 2000 点/曲线）重绘，拖动会卡顿。策略：scopeVersion 一旦
   * 变化就立即进入 lowQuality（采样密度降至约 1/3）保 60fps；停止变化后
   * 退出 lowQuality，本组件的 computed useMemo 会以全密度重采样，已有的
   * scheduleRedraw 机制随即触发一次高精度重绘。
   *
   * 恢复延时为自适应（依据上一帧 drawNow 实际耗时，见 lastDrawMsRef）：
   * 上一帧掉帧（>16ms）则延后到 200ms 恢复，很便宜（<8ms）则 80ms 恢复，
   * 正常情况 120ms。这样在重场景下避免恢复即卡顿，在轻场景下尽快变清晰。 */
  const [lowQuality, setLowQuality] = useState(false);
  const lowQualityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 上一帧 drawNow 的实际耗时（ms）。用作 lowQuality 恢复延时的自适应
  // 依据：全精度绘制越贵，停拖后越晚恢复，避免在用户可能继续拖动时立刻
  // 触发昂贵重绘造成卡顿；绘制很便宜则快速恢复清晰。首帧为 0，走默认档。
  const lastDrawMsRef = useRef<number>(0);
  // 记录上一次见到的 scopeVersion，用于跳过首次挂载（避免初始渲染就被降采样）。
  const scopeVersionPrevRef = useRef<number>(scopeVersion);
  useEffect(() => {
    // 首次挂载：prev === current，直接跳过。
    if (scopeVersionPrevRef.current === scopeVersion) return;
    scopeVersionPrevRef.current = scopeVersion;
    // scopeVersion 变化（滑块拖动 / 控制台赋值 / 变量删除）：立即降采样。
    setLowQuality(true);
    if (lowQualityTimerRef.current) clearTimeout(lowQualityTimerRef.current);
    // 自适应恢复延时（原固定 150ms）：
    //   - 上一帧 > 16ms（掉帧）：200ms，留出更多缓冲，避免恢复全精度后
    //     紧接着的一次拖动又触发昂贵重绘造成二次卡顿；
    //   - 上一帧 < 8ms（很便宜）：80ms，尽快恢复清晰，体感更跟手；
    //   - 其余（正常 60fps 帧预算内）：120ms 折中。
    const last = lastDrawMsRef.current;
    const delay = last > 16 ? 200 : last < 8 ? 80 : 120;
    lowQualityTimerRef.current = setTimeout(() => {
      setLowQuality(false);
      lowQualityTimerRef.current = null;
    }, delay);
  }, [scopeVersion]);
  // 卸载时清理防抖定时器，避免泄漏 / 卸载后 setState。
  useEffect(() => {
    return () => {
      if (lowQualityTimerRef.current) {
        clearTimeout(lowQualityTimerRef.current);
        lowQualityTimerRef.current = null;
      }
    };
  }, []);

  const computed = useMemo<ComputedPlot[]>(() => {
    // scopeVersion is a dependency ONLY (not read inside) — it forces
    // re-sampling when the shared engine scope mutates.
    void scopeVersion;
    // animVersion: 参数播放动画每帧 bump，强制本组件在动画期间重采样重绘。
    // 由于动画帧走独立版本号，不会误触发上面的 lowQuality 降采样逻辑。
    void animVersion;
    const plotW = Math.max(1, canvasSize.w - PADDING.left - PADDING.right);
    const baseCount = Math.min(2000, Math.max(400, Math.floor(plotW * 2)));
    // T7.1: 拖动期间降采样到约 1/3 密度（如 800→266）保帧率；
    // lowQuality 变回 false 时本 useMemo 重算，触发全精度重绘。
    const sampleCount = lowQuality
      ? Math.max(135, Math.floor(baseCount / 3))
      : baseCount;
    const __res = plots.map((p, idx) => {
      // A resolved curve spec (from the panel's curve editor) takes
      // precedence: polar / parametric curves sample over their own
      // parameter range instead of the view window.
      const spec = curveSpecs?.[p.id];
      let samples: PlotSample[];
      if (spec) {
        samples = sampleCurve(spec, xRange, sampleCount);
      } else {
        // surface3d plots can't render in 2D — coerce to cartesian so the
        // sampler still produces something (the engine shouldn't normally
        // send surface3d plots here, but be defensive).
        const plotType2d = (p.plotType === 'surface3d' ? 'cartesian' : p.plotType ?? 'cartesian') as
          | 'cartesian' | 'polar' | 'parametric';
        samples = sampleFunction(
          p.expression,
          xRange,
          plotType2d,
          sampleCount,
        );
      }
      const extrema = findExtrema(samples);
      return {
        config: { ...p, color: p.color || PLOT_COLORS[idx % PLOT_COLORS.length] },
        samples,
        extrema,
        visible: p.visible !== false,
      };
    });
    return __res;
  }, [plots, xRange, canvasSize.w, scopeVersion, animVersion, lowQuality, curveSpecs]);

  /* ----------------------- Coordinate mapping ----------------------- */

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
  // 曲线集 flatten 缓存：把贝塞尔路径折线化（像素空间）是 CPU 大头（上千条
  // 曲线 × 多段 × 16 采样）。该结果只依赖曲线几何，与视图无关；平移/缩放时
  // 若仍重复 flatten 会显著卡顿。这里按 [curveSets, playhead] 缓存，重绘时
  // 仅需重算廉价的「像素→屏幕」线性映射。动画（frames）按帧缓存，帧切换时
  // 才重新 flatten 该帧，静态度量平移缩放则完全复用。
  const flattenedCurveSets = useMemo(() => {
    const map = new Map<number, Array<Array<[number, number]>>>();
    curveSets.forEach((cs, csIdx) => {
      const activeCurves = resolveCurveSetCurves(cs, playhead);
      const csW = Math.max(1, cs.width);
      const csH = Math.max(1, cs.height);
      const capped =
        activeCurves.length > MAX_RENDER_CURVES
          ? pickDistributed(activeCurves, MAX_RENDER_CURVES)
          : activeCurves;
      const polylines: Array<Array<[number, number]>> = [];
      for (const path of capped) {
        let current: [number, number] | null = null;
        const line: Array<[number, number]> = [];
        for (const seg of path.segments) {
          const flatPx = bezierFlatten(seg, current, 0.5);
          if (flatPx.length === 0) continue;
          // 在像素空间应用翻转（flipX/flipY），视图无关，可安全缓存。
          const mapped = flatPx.map(([px, py]) => {
            const lx = cs.flipX ? csW - 1 - px : px;
            const ly = cs.flipY ? csH - 1 - py : py;
            return [lx, ly] as [number, number];
          });
          if (line.length === 0) line.push(...mapped);
          else line.push(...mapped.slice(1));
          current = mapped[mapped.length - 1];
        }
        if (line.length >= 2) polylines.push(pickDistributed(line, MAX_FLATTEN_POINTS));
      }
      map.set(csIdx, polylines);
    });
    return map;
  }, [curveSets, playhead]);

  const drawNow = useCallback(() => {
    const t0 = performance.now();
    try {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const { w, h, dpr } = sizeRef.current;
      if (w === 0 || h === 0) return;
      if (!Number.isFinite(dpr) || dpr <= 0) return;

      // Reset & DPI scale. Only re-allocate backing storage when the target
      // size actually changes — setting canvas.width/height (even to the same
      // value) clears the buffer and resets the transform, which is wasteful
      // when redrawn every frame during hover. (D3 fix)
      const targetW = Math.floor(w * dpr);
      const targetH = Math.floor(h * dpr);
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        // A6: 尺寸确实改变时，离屏层已经被（隐式）清空，必须强制所有层
        // 全量重绘，否则依赖「sizeStr 签名巧合」才重绘会留下空白层。
        layerSigRef.current = {
          l1Sig: '', l2Sig: '', l3Sig: '',
          l2Computed: null, l3Computed: null,
          l3Overlays: undefined, l2CurveSets: undefined,
        };
      }
      // Note: the main canvas is cleared in the composite step below, after
      // the offscreen layers have been rasterized. (D4)

      const dark = theme === 'dark';
      // Themed colors read from CSS variables (cached per theme) so the canvas
      // stays in sync with the app's design tokens instead of hard-coded hex.
      const themed = getThemedColors(theme);
      const bg = themed.bg;
      const fg = themed.fg;
      const axisColor = themed.mutedFg;
      const gridMajor = dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)';
      const gridMinor = dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)';
      const tickLabelColor = themed.mutedFg;
      const axisLabelColor = themed.fg;
      const crosshairColor = dark ? '#64b5f6' : '#1976d2';

      // Semantic marker / overlay colors for high contrast in both themes.
      const markerStroke = dark ? '#212121' : '#ffffff';
      const zeroFill = dark ? '#64b5f6' : '#1976d2';
      const tooltipBg = themed.popover;
      const tooltipFg = themed.popoverFg;
      const tooltipBorder = themed.border;

      const { x: vx, y: vy } = viewRef.current;
      const xNice = niceNumber(vx, 8);
      const yNice = niceNumber(vy, 8);
      // visiblePlots is shared by L2 (curves) and L3 (markers), so compute it
      // once here in the shared scope rather than inside either layer block.
      const visiblePlots = computed.filter((p) => p.visible);

      /* ---------- D4 layered canvas setup ---------- */
      // L1 grid/axes/background, L2 curves, L3 annotations+markers are
      // rasterized to offscreen canvases and only re-drawn when their deps
      // actually change. L4 (crosshair + tooltip) is painted on the main
      // canvas every frame. This keeps hover cheap: moving the mouse never
      // re-rasterizes the grid or the 2000-point polylines.
      const gridLayer = ensureLayerCanvas(gridLayerRef, targetW, targetH);
      const curveLayer = ensureLayerCanvas(curveLayerRef, targetW, targetH);
      const annotLayer = ensureLayerCanvas(annotLayerRef, targetW, targetH);
      if (!gridLayer || !curveLayer || !annotLayer) return;
      const gridCtx = gridLayer.getContext('2d');
      const curveCtx = curveLayer.getContext('2d');
      const annotCtx = annotLayer.getContext('2d');
      if (!gridCtx || !curveCtx || !annotCtx) return;
      const viewStr = `${vx[0]}|${vx[1]}|${vy[0]}|${vy[1]}`;
      const sizeStr = `${targetW}|${targetH}`;
      const l1Sig = `${theme}|${showGrid}|${showAxes}|${viewStr}|${sizeStr}|${axisFontSize}`;
      // 在签名里加入 curveSets 的引用与长度，使新增/替换 curveSets 时重绘 L2；
      // 动画曲线集（frames）还要带上当前 playhead，切换帧时触发 L2 重栅格化。
      const curveSetsSig = curveSets
        .map((cs) => `${cs.id ?? ''}:${cs.curves.length}:${cs.frames?.length ?? 0}:${Number.isFinite(playhead) ? playhead : 0}:${cs.width}x${cs.height}`)
        .join('|');
      const l2Sig = `${theme}|${viewStr}|${sizeStr}|${curveSetsSig}`;
      const l3Sig = `${theme}|${showMarkers}|${viewStr}|${sizeStr}`;
      const sig = layerSigRef.current;
      const l1Dirty = sig.l1Sig !== l1Sig;
      const l2Dirty =
        sig.l2Sig !== l2Sig || sig.l2Computed !== computed || sig.l2CurveSets !== curveSets;
      const l3Dirty =
        sig.l3Sig !== l3Sig || sig.l3Computed !== computed || sig.l3Overlays !== overlays;

      /* ---------- L1: grid + axes + background ---------- */
      if (l1Dirty) {
      // Block-scoped `ctx` shadows the main-canvas ctx so the existing grid
      // and axes drawing code below rasterizes into gridLayer automatically.
      const ctx = gridCtx;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // geometricPrecision improves text crispness for tick labels; ignored
      // by older browsers so it's safe to set unconditionally.
      ctx.textRendering = 'geometricPrecision';
      ctx.clearRect(0, 0, w, h);
      // Background lives on the bottommost layer so it is cached alongside
      // the grid and not repainted every hover frame.
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      /* ---------- Grid ---------- */
      // xNice/yNice are computed unconditionally so the axes block can reuse
      // them even when showGrid is false. (D8 fix: split grid / axes)
      if (showGrid) {
        // 学术风格网格：每个「大方格」（major tick step）被细分为
        // GRID_DIVISIONS 个「小方格」。小方格很淡、很细（0.5px），
        // 大方格略深、略粗（1px），形成坐标纸般的双层网格观感，
        // 类似 Desmos 的 academic style，而不是简单的半格细分。
        const GRID_DIVISIONS = 4;
        const minorX = xNice.tickStep / GRID_DIVISIONS;
        const minorY = yNice.tickStep / GRID_DIVISIONS;
        // 小方格：细 + 淡，作为「格子纸」背景。
        ctx.lineWidth = 0.5;
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

        // 大方格：略粗 + 略深，作为「主网格」。
        ctx.lineWidth = 1;
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
      }

      /* ---------- Axes (x=0, y=0) with arrowheads ---------- */
      // Independent of showGrid so turning off the grid keeps orientation. (D8)
      if (showAxes) {
        ctx.strokeStyle = axisColor;
        ctx.lineWidth = 1.2;
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
        // Arrowhead at right — cleaner, smaller
        ctx.beginPath();
        ctx.moveTo(w - PADDING.right, yAxisScreen);
        ctx.lineTo(w - PADDING.right - 5, yAxisScreen - 3.5);
        ctx.lineTo(w - PADDING.right - 5, yAxisScreen + 3.5);
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
        // Arrowhead at top — cleaner, smaller
        ctx.beginPath();
        ctx.moveTo(xAxisScreen, PADDING.top);
        ctx.lineTo(xAxisScreen - 3.5, PADDING.top + 5);
        ctx.lineTo(xAxisScreen + 3.5, PADDING.top + 5);
        ctx.closePath();
        ctx.fill();

        /* ---------- Tick labels ---------- */
        ctx.font = `${axisFontSize}px ${PLOT_FONT_FAMILY}`;
        ctx.fillStyle = tickLabelColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        for (const xv of xNice.ticks) {
          if (Math.abs(xv) < xNice.tickStep * 0.01) continue; // skip 0 on x
          const [sx] = dataToScreen(xv, 0);
          const label = formatTickLabel(xv);
          // Place below the x-axis (or near the bottom edge).
          const ty = Math.min(Math.max(yAxisScreen + 5, PADDING.top), h - PADDING.bottom - 16);
          ctx.fillText(label, sx, ty);
        }
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        for (const yv of yNice.ticks) {
          if (Math.abs(yv) < yNice.tickStep * 0.01) continue;
          const [, sy] = dataToScreen(0, yv);
          const label = formatTickLabel(yv);
          const tx = Math.min(Math.max(xAxisScreen - 7, PADDING.left + 16), w - PADDING.right);
          ctx.fillText(label, tx, sy);
        }

        // Origin "0" label.
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        ctx.fillText('0', xAxisScreen - 5, yAxisScreen + 5);

        // Axis labels (x, y).
        ctx.fillStyle = axisLabelColor;
        ctx.font = `italic 14px ${PLOT_FONT_FAMILY}`;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.fillText('x', w - PADDING.right - 4, yAxisScreen - 6);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText('y', xAxisScreen + 7, PADDING.top + 3);
      }
      sig.l1Sig = l1Sig;
      } // end L1 grid+axes layer

      /* ---------- L2: plot polylines ---------- */
      if (l2Dirty) {
      const ctx = curveCtx;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      for (const plot of visiblePlots) {
        const samples = plot.samples;
        if (samples.length < 2) continue;
        ctx.strokeStyle = plot.config.color;
        ctx.lineWidth = plot.config.width ?? 2;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        // Clean math software style - no glow/shadow
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

      /* ---------- L2 extra: overlay curveSets (Task 5) ---------- */
      if (curveSets && curveSets.length > 0) {
        const [xMin, xMax] = viewRef.current.x;
        const [yMin, yMax] = viewRef.current.y;
        const plotW = Math.max(1, w - PADDING.left - PADDING.right);
        const plotH = Math.max(1, h - PADDING.top - PADDING.bottom);
        // 性能：优先把所有曲线段累积进「按颜色+线宽分组的单个 Path2D」，
        // 最后一次性 stroke，把成千上万次 beginPath/stroke 降为几次，大幅降低
        // 绘制调用开销（边缘检测/姿态/视频等海量曲线场景收益最明显）。
        const canBatch = typeof Path2D !== 'undefined';
        const batches = new Map<string, { path: Path2D; color: string; sw: number }>();
        const drawPerPath = (pts: Array<[number, number]>, color: string, sw: number, batchColor: string, batchSw: number) => {
          if (canBatch) {
            const key = `${batchColor}|${batchSw}`;
            let batch = batches.get(key);
            if (!batch) {
              batch = { path: new Path2D(), color: batchColor, sw: batchSw };
              batches.set(key, batch);
            }
            batch.path.moveTo(pts[0][0], pts[0][1]);
            for (let i = 1; i < pts.length; i++) batch.path.lineTo(pts[i][0], pts[i][1]);
          } else {
            plotPolyline(ctx, pts, color, sw);
          }
        };
        for (const cs of curveSets) {
          const csW = Math.max(1, cs.width);
          const csH = Math.max(1, cs.height);
          const color = cs.color ?? '#a78bfa';
          const sw = cs.strokeWidth ?? 2;
          // 折线已在 flattenedCurveSets 中按 [curveSets, playhead] 缓存（含预算抽稀
          // 与 flipX/flipY），这里只做廉价的「像素→屏幕」线性映射，避免平移/缩放时
          // 反复 flatten 上千条贝塞尔路径导致卡顿。
          const csIdx = curveSets.indexOf(cs);
          const polylines = flattenedCurveSets.get(csIdx) ?? [];
          for (const line of polylines) {
            // 像素 → 数学坐标 → 屏幕坐标（数学 y 翻转 + PADDING 修正）
            const screenPts: Array<[number, number]> = line.map(([lx, ly]) => {
              const mx = xMin + (lx / (csW - 1 || 1)) * (xMax - xMin);
              const my = yMin + (1 - ly / (csH - 1 || 1)) * (yMax - yMin);
              const sx = PADDING.left + ((mx - xMin) / (xMax - xMin || 1)) * plotW;
              const sy = PADDING.top + (1 - (my - yMin) / (yMax - yMin || 1)) * plotH;
              return [sx, sy] as [number, number];
            });
            if (screenPts.length >= 2) {
              drawPerPath(screenPts, color, sw, color, sw);
            }
          }
        }
        // 一次性批量 stroke：按颜色/线宽分组，各自设置样式后 stroke 一次。
        if (canBatch && batches.size > 0) {
          ctx.save();
          ctx.lineJoin = 'round';
          ctx.lineCap = 'round';
          for (const batch of batches.values()) {
            ctx.strokeStyle = batch.color;
            ctx.lineWidth = batch.sw;
            ctx.stroke(batch.path);
          }
          ctx.restore();
        }
      }

      sig.l2Sig = l2Sig;
      sig.l2Computed = computed;
      sig.l2CurveSets = curveSets;
      } // end L2 curves layer

    /* ---------- L3: advanced overlays + markers ---------- */
    if (l3Dirty) {
    const ctx = annotCtx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.textRendering = 'geometricPrecision';
    ctx.clearRect(0, 0, w, h);
    if (overlays) {
      // Derivative curve — dashed line, math style colors
      if (overlays.derivativeSamples.length > 0) {
        const derivColors: Record<number, string> = {
          1: dark ? '#ffb74d' : '#f57c00', // orange
          2: dark ? '#ba68c8' : '#7b1fa2', // purple
          3: dark ? '#4db6ac' : '#00796b', // teal
        };
        const dColor = derivColors[overlays.derivativeOrder] || (dark ? '#ffb74d' : '#f57c00');
        ctx.strokeStyle = dColor;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 3]);
        ctx.beginPath();
        let dPenDown = false;
        for (const s of overlays.derivativeSamples) {
          if (!Number.isFinite(s.x) || !Number.isFinite(s.y)) {
            dPenDown = false;
            continue;
          }
          const [sx, sy] = dataToScreen(s.x, s.y);
          if (!dPenDown) {
            ctx.moveTo(sx, sy);
            dPenDown = true;
          } else {
            ctx.lineTo(sx, sy);
          }
        }
        ctx.stroke();
        ctx.setLineDash([]);

        // Derivative order label
        const primes = "'".repeat(overlays.derivativeOrder);
        ctx.fillStyle = dColor;
        ctx.font = `italic 12px ${PLOT_FONT_FAMILY}`;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        ctx.fillText(`f${primes}(x)`, w - PADDING.right - 4, PADDING.top + 18);
      }

      // Tangent line — dashed gray
      if (overlays.tangent) {
        const t = overlays.tangent;
        ctx.strokeStyle = dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.35)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        for (let i = 0; i < t.points.length; i++) {
          const [px, py] = t.points[i];
          const [sx, sy] = dataToScreen(px, py);
          if (i === 0) ctx.moveTo(sx, sy);
          else ctx.lineTo(sx, sy);
        }
        ctx.stroke();
        ctx.setLineDash([]);

        // Tangent point — small black/white dot
        const [tsx, tsy] = dataToScreen(t.at.x, t.at.y);
        ctx.fillStyle = dark ? '#ffffff' : '#000000';
        ctx.beginPath();
        ctx.arc(tsx, tsy, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = dark ? '#e0e0e0' : '#424242';
        ctx.font = `bold 12px ${PLOT_FONT_FAMILY}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillText(`k=${t.slope.toFixed(3)}`, tsx + 8, tsy - 4);
      }

      // Intersection points — filled dots + (x, y) coordinate labels.
      // Labels alternate above/below by index as a simple anti-overlap
      // strategy, and get a translucent backdrop so they stay readable
      // on top of grid lines and curves.
      if (overlays.intersections.length > 0) {
        overlays.intersections.forEach((p, idx) => {
          const [sx, sy] = dataToScreen(p.x, p.y);
          if (sx < PADDING.left || sx > w - PADDING.right) return;
          if (sy < PADDING.top || sy > h - PADDING.bottom) return;
          // Marker dot.
          ctx.fillStyle = dark ? '#ce93d8' : '#8e24aa';
          ctx.strokeStyle = markerStroke;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(sx, sy, 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          // Coordinate label: even indices above the dot, odd below.
          const text = `(${p.x.toFixed(3)}, ${p.y.toFixed(3)})`;
          ctx.font = `bold 12px ${PLOT_FONT_FAMILY}`;
          const tw = ctx.measureText(text).width;
          const above = idx % 2 === 0;
          // Horizontal: prefer right of the dot; flip left near the edge.
          let lx = sx + 8;
          if (lx + tw > w - PADDING.right) lx = sx - 8 - tw;
          // Vertical center-line of the label, clamped inside the plot area.
          const lyRaw = above ? sy - 8 : sy + 8;
          const ly = Math.min(Math.max(lyRaw, PADDING.top + 6), h - PADDING.bottom - 6);
          // Translucent backdrop for readability.
          ctx.fillStyle = dark ? 'rgba(26,26,26,0.72)' : 'rgba(255,255,255,0.78)';
          ctx.fillRect(lx - 2, ly - 7, tw + 4, 14);
          ctx.fillStyle = dark ? '#e0e0e0' : '#424242';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(text, lx, ly);
        });
      }
    }

    /* ---------- Extrema + zero markers ---------- */
    if (showMarkers) {
      for (const plot of visiblePlots) {
        // Zeros — blue dots (math software standard)
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
        // Maxima — red dots
        const extremaColor = dark ? '#ef5350' : '#d32f2f';
        for (const e of plot.extrema.maxima) {
          const [sx, sy] = dataToScreen(e.x, e.y);
          if (sx < PADDING.left || sx > w - PADDING.right) continue;
          if (sy < PADDING.top || sy > h - PADDING.bottom) continue;
          ctx.fillStyle = extremaColor;
          ctx.strokeStyle = markerStroke;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(sx, sy, 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          // Label
          ctx.fillStyle = dark ? '#e0e0e0' : '#424242';
          ctx.font = `bold 12px ${PLOT_FONT_FAMILY}`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillText(`max(${e.x.toFixed(3)}, ${e.y.toFixed(3)})`, sx, sy - 8);
        }
        // Minima — red dots
        for (const e of plot.extrema.minima) {
          const [sx, sy] = dataToScreen(e.x, e.y);
          if (sx < PADDING.left || sx > w - PADDING.right) continue;
          if (sy < PADDING.top || sy > h - PADDING.bottom) continue;
          ctx.fillStyle = extremaColor;
          ctx.strokeStyle = markerStroke;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(sx, sy, 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          // Label
          ctx.fillStyle = dark ? '#e0e0e0' : '#424242';
          ctx.font = `bold 12px ${PLOT_FONT_FAMILY}`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillText(`min(${e.x.toFixed(3)}, ${e.y.toFixed(3)})`, sx, sy + 8);
        }
      }
    }
    sig.l3Sig = l3Sig;
    sig.l3Computed = computed;
    sig.l3Overlays = overlays;
    } // end L3 annotations layer

    /* ---------- Composite L1+L2+L3 onto main canvas ---------- */
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(gridLayer, 0, 0, w, h);
    ctx.drawImage(curveLayer, 0, 0, w, h);
    ctx.drawImage(annotLayer, 0, 0, w, h);
    ctx.textRendering = 'geometricPrecision';

    /* ---------- Task 8.F: in-canvas legend (top-right) ---------- */
    if (showLegend && visiblePlots.length > 0) {
      ctx.save();
      ctx.font = `12px ${PLOT_FONT_FAMILY}`;
      ctx.textBaseline = 'middle';
      const lineH = 18;
      const padX = 8;
      const padY = 6;
      const boxW0 = 100;
      let boxW = boxW0;
      for (const p of visiblePlots) {
        const label = p.config.expression.length > 16
          ? p.config.expression.slice(0, 15) + '…'
          : p.config.expression;
        boxW = Math.max(boxW, padX * 2 + 18 + ctx.measureText(label).width);
      }
      const boxH = padY * 2 + visiblePlots.length * lineH;
      let bx = w - PADDING.right - boxW - 4;
      let by = PADDING.top + 4;
      bx = Math.max(PADDING.left + 4, bx);
      by = Math.max(PADDING.top + 4, by);
      ctx.fillStyle = dark ? 'rgba(26,26,26,0.72)' : 'rgba(255,255,255,0.82)';
      ctx.strokeStyle = tooltipBorder;
      ctx.lineWidth = 1;
      drawRoundRect(ctx, bx, by, boxW, boxH, 6);
      ctx.fill();
      ctx.stroke();
      for (let i = 0; i < visiblePlots.length; i++) {
        const p = visiblePlots[i];
        const ly = by + padY + i * lineH + lineH / 2;
        // 6px color square
        ctx.fillStyle = p.config.color;
        ctx.fillRect(bx + padX, ly - 3, 6, 6);
        // Expression label (truncate at 16 chars)
        const label = p.config.expression.length > 16
          ? p.config.expression.slice(0, 15) + '…'
          : p.config.expression;
        ctx.fillStyle = tooltipFg;
        ctx.textAlign = 'left';
        ctx.fillText(label, bx + padX + 12, ly);
      }
      ctx.restore();
    }

    /* ---------- L4: crosshair + snap ring + tooltip (every frame) ---------- */
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

      // Tooltip rendering lives in the DOM (Task 8.B) so it can show the
      // expression name, slope, and per-curve colors without overlapping the
      // curve itself. The previous in-canvas tooltip box (x=, y=, curve) was
      // removed because it stacked on top of the curve at the snap point and
      // made both the tooltip and the curve unreadable.
    }

    } catch (err) {
      console.error('[Plot2DCanvas] draw error:', err);
      setDrawError(err instanceof Error ? err.message : '绘制失败');
    } finally {
      // 记录本帧耗时，供 lowQuality 自适应恢复延时参考（见 lastDrawMsRef）。
      lastDrawMsRef.current = performance.now() - t0;
    }
  }, [computed, theme, dataToScreen, screenToData, showGrid, showAxes, showMarkers, showLegend, overlays, axisFontSize, curveSets, playhead, flattenedCurveSets]);

  // Keep the ref in sync so the rAF callback always uses the latest drawNow.
  // We must do this inside an effect (not during render) per React 19 rules.
  useEffect(() => {
    drawNowRef.current = drawNow;
  }, [drawNow]);

  /* ---------------- Timeline: reset playhead when frames change ------- */
  const maxFrames = useMemo(() => {
    let m = 0;
    for (const cs of curveSets) if (cs.frames && cs.frames.length > m) m = cs.frames.length;
    return m;
  }, [curveSets]);
  // Clamp the playhead into range whenever the available frame count changes.
  useEffect(() => {
    setPlayhead((p) => (maxFrames > 0 ? Math.min(p, maxFrames - 1) : 0));
  }, [maxFrames]);

  /* ---------------- Timeline: auto-play loop (rAF) -------------------- */
  useEffect(() => {
    if (!isPlaying || maxFrames <= 0) return;
    let last = performance.now();
    const fps = Math.max(1, Math.min(60, curveSets[0]?.fps ?? 30));
    const frameMs = 1000 / fps;
    const tick = (now: number) => {
      const dt = now - last;
      if (dt >= frameMs) {
        last = now - (dt % frameMs);
        setPlayhead((p) => (p + 1) % maxFrames);
      }
      playheadRafRef.current = requestAnimationFrame(tick);
    };
    playheadRafRef.current = requestAnimationFrame(tick);
    return () => {
      if (playheadRafRef.current !== null) cancelAnimationFrame(playheadRafRef.current);
    };
  }, [isPlaying, maxFrames, curveSets]);

  // Stop playback and reset to frame 0 when the animated set is replaced.
  useEffect(() => {
    if (maxFrames === 0) {
      setIsPlaying(false);
      setPlayhead(0);
    }
  }, [maxFrames]);

  /* ---------------- Task 8.A: multi-curve hit testing (rAF batched) -- */
  const computeHoveredPoints = useCallback(
    (wx: number, wy: number, sx: number, sy: number): HoveredPoint[] => {
      const result: HoveredPoint[] = [];
      const THRESHOLD_PX = 6;
      for (const p of computed) {
        if (!p.visible) continue;
        const samples = p.samples;
        if (!samples || samples.length < 2) continue;
        let bestIdx = -1;
        let bestDist = Infinity;
        // For cartesian + sorted-by-x samples use binary search, otherwise linear.
        const isCartesian = p.config.plotType === 'cartesian' || !p.config.plotType || p.config.plotType === 'surface3d';
        if (isCartesian && samples.length > 0) {
          let lo = 0;
          let hi = samples.length - 1;
          while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            if (samples[mid].x <= wx) lo = mid + 1;
            else hi = mid - 1;
          }
          const start = Math.max(0, hi - 1);
          const end = Math.min(samples.length - 1, hi + 2);
          for (let i = start; i <= end; i++) {
            const s = samples[i];
            if (!Number.isFinite(s.x) || !Number.isFinite(s.y)) continue;
            const [psx, psy] = dataToScreen(s.x, s.y);
            if (!Number.isFinite(psx) || !Number.isFinite(psy)) continue;
            const d = Math.hypot(psx - sx, psy - sy);
            if (d < bestDist) {
              bestDist = d;
              bestIdx = i;
            }
          }
        } else {
          for (let i = 0; i < samples.length; i++) {
            const s = samples[i];
            if (!Number.isFinite(s.x) || !Number.isFinite(s.y)) continue;
            const [psx, psy] = dataToScreen(s.x, s.y);
            if (!Number.isFinite(psx) || !Number.isFinite(psy)) continue;
            const d = Math.hypot(psx - sx, psy - sy);
            if (d < bestDist) {
              bestDist = d;
              bestIdx = i;
            }
          }
        }
        if (bestIdx < 0 || bestDist > THRESHOLD_PX) continue;
        // Slope via central difference (samples[i+1].y - samples[i-1].y)/(x+1]-x[i-1])
        const iLeft = Math.max(0, bestIdx - 1);
        const iRight = Math.min(samples.length - 1, bestIdx + 1);
        const sL = samples[iLeft];
        const sR = samples[iRight];
        let slope = NaN;
        if (
          Number.isFinite(sL.x) && Number.isFinite(sL.y) &&
          Number.isFinite(sR.x) && Number.isFinite(sR.y)
        ) {
          const dx = sR.x - sL.x;
          if (Math.abs(dx) > 1e-12) slope = (sR.y - sL.y) / dx;
        }
        result.push({
          plotId: p.config.id,
          x: samples[bestIdx].x,
          y: samples[bestIdx].y,
          slope,
        });
      }
      // TODO(Task 8.D): special-point snap (zeros/extrema/intersections/tangentPoints) ≤ 8px
      //   - cursor: crosshair
      //   - Tooltip first line prioritises type: e.g. "零点 X=0.524"
      return result;
    },
    [computed, dataToScreen],
  );

  const flushHoverUpdate = useCallback(() => {
    hoverRafRef.current = null;
    const pen = hoverPendingRef.current;
    hoverDirtyRef.current = false;
    if (!pen) return;
    const pts = computeHoveredPoints(pen.wx, pen.wy, pen.sx, pen.sy);
    setHoveredPoints(pts);
    const rect = containerRef.current?.getBoundingClientRect();
    setMousePos({ x: pen.clientX - (rect?.left ?? 0), y: pen.clientY - (rect?.top ?? 0) });
  }, [computeHoveredPoints]);

  const scheduleHoverUpdate = useCallback(
    (sx: number, sy: number, wx: number, wy: number, clientX: number, clientY: number) => {
      hoverPendingRef.current = { sx, sy, wx, wy, clientX, clientY };
      if (hoverRafRef.current !== null) return;
      hoverDirtyRef.current = true;
      hoverRafRef.current = requestAnimationFrame(flushHoverUpdate);
    },
    [flushHoverUpdate],
  );

  useEffect(() => {
    return () => {
      if (hoverRafRef.current !== null) cancelAnimationFrame(hoverRafRef.current);
    };
  }, []);

  /* ----------------------- Resize handling -------------------------- */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateSize = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const dpr = getCappedDpr(window);
      if (!Number.isFinite(rect.width) || !Number.isFinite(rect.height)) return;
      const next = { w: rect.width, h: rect.height, dpr };
      sizeRef.current = next;
      setCanvasSize(next);
      scheduleRedraw();
    };

    // Use ResizeObserver directly on the container so the backing store tracks
    // the element's laid-out size. Some environments (e.g. dev HMR / StrictMode)
    // can miss the initial RO callback, so we also measure immediately and poll
    // a few times until the size is non-zero.
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (!cr) return;
      const dpr = getCappedDpr(window);
      const next = { w: cr.width, h: cr.height, dpr };
      sizeRef.current = next;
      setCanvasSize(next);
      scheduleRedraw();
    });
    ro.observe(container);

    // A3: 容器可见性自愈。当容器从「不可见」变为「可见」（tab 切回 2D、
    // 面板重新展开、从后台恢复）时，先刷新尺寸再强制全量重绘，把
    // 「离屏层被清空但未重绘」的竞态窗口彻底消除。仅在 false→true 触发。
    let wasIntersecting = true;
    let io: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== 'undefined') {
      io = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          const isNow = entry.isIntersecting;
          if (isNow && !wasIntersecting) {
            updateSize();
            forceFullRedraw();
          }
          wasIntersecting = isNow;
        }
      }, { threshold: 0.01 });
      io.observe(container);
    }

    let detachDpr: (() => void) | null = null;
    const setupDprListener = () => {
      const ratio = getCappedDpr(window);
      const mql = window.matchMedia(`(resolution: ${ratio}dppx)`);
      const handler = () => {
        updateSize();
        mql.removeEventListener('change', handler);
        setupDprListener();
      };
      mql.addEventListener('change', handler);
      detachDpr = () => mql.removeEventListener('change', handler);
    };
    setupDprListener();

    updateSize();

    // A5: 挂载后确定性重绘。不依赖 RO 回调时序，连续调度 2 帧全量重绘，
    // 保证挂载后必然有一次完整绘制（首帧帧率竞争下也可能绘出内容）。
    const mountRafIds: number[] = [];
    let mountRaf = 0;
    const scheduleMountRedraw = () => {
      if (mountRaf >= 2) return;
      mountRaf += 1;
      mountRafIds.push(
        requestAnimationFrame(() => {
          forceFullRedraw();
          scheduleMountRedraw();
        }),
      );
    };
    scheduleMountRedraw();

    // Fallback poll: if the container still has no size after the first paint,
    // keep measuring briefly until layout settles.
    let pollCount = 0;
    const pollId = setInterval(() => {
      updateSize();
      pollCount += 1;
      if ((sizeRef.current.w > 0 && sizeRef.current.h > 0) || pollCount >= 20) {
        clearInterval(pollId);
      }
    }, 50);

    return () => {
      ro.disconnect();
      io?.disconnect();
      mountRafIds.forEach((id) => cancelAnimationFrame(id));
      clearInterval(pollId);
      detachDpr?.();
    };
  }, [scheduleRedraw, forceFullRedraw]);

  /* ----------------------- Redraw on theme / plots change ----------- */
  useEffect(() => {
    scheduleRedraw();
  }, [theme, computed, scheduleRedraw]);

  /* ----------------------- A4: 页面可见性自愈 ----------------------- */
  // 浏览器 tab 从后台切回时，canvas 可能被浏览器吞掉/清空但未触发
  // ResizeObserver。监听 visibilitychange，回到前台时强制全量重绘。
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        forceFullRedraw();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [forceFullRedraw]);

  /* ----------------------- Wheel zoom ------------------------------- */
  // D5 fix: bind via native addEventListener with { passive: false } so
  // preventDefault actually takes effect (React's onWheel is passive).
  const handleWheel = useCallback(
    (e: WheelEvent) => {
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
        const nx: [number, number] = clampRangeWidth([wx + (vx[0] - wx) * factor, wx + (vx[1] - wx) * factor]);
        const ny: [number, number] = horizontalOnly
          ? vy
          : clampRangeWidth([wy + (vy[0] - wy) * factor, wy + (vy[1] - wy) * factor]);
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

  // D5 fix: native wheel listener with passive:false so preventDefault works.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

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
          hoverPendingRef.current = null;
          setHoveredPoints([]);
          setMousePos(null);
          onViewChange?.(nx, ny);
          scheduleRedraw();
          return;
        }

        // Hover + snap.
        const [wx, wy] = screenToData(sx, sy);
        setMouseWorld({ wx, wy });
        // Find nearest visible sample point (snapping).
        let best: PlotSample | undefined;
        let bestColor: string | undefined;
        let bestDist = Infinity;
        const snapPixelRadius = 30;
        for (const p of computed) {
          if (!p.visible) continue;
          if (p.config.plotType === 'cartesian' && p.samples.length > 0) {
            const samples = p.samples;
            let lo = 0;
            let hi = samples.length - 1;
            while (lo <= hi) {
              const mid = (lo + hi) >> 1;
              if (samples[mid].x <= wx) lo = mid + 1;
              else hi = mid - 1;
            }
            let candidate: PlotSample | undefined;
            let candidateScreenDist = Infinity;
            for (let i = Math.max(0, hi); i <= Math.min(samples.length - 1, hi + 1); i++) {
              const s = samples[i];
              if (!Number.isFinite(s.x) || !Number.isFinite(s.y)) continue;
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
        let snapSx = sx;
        let snapSy = sy;
        let snapWx = wx;
        let snapWy = wy;
        if (overlays) {
          const snapPts: Array<{ x: number; y: number }> = [];
          for (const ip of overlays.intersections) {
            if (Number.isFinite(ip.x) && Number.isFinite(ip.y)) snapPts.push({ x: ip.x, y: ip.y });
          }
          if (overlays.tangent) {
            const tp = overlays.tangent.at;
            if (Number.isFinite(tp.x) && Number.isFinite(tp.y)) snapPts.push({ x: tp.x, y: tp.y });
          }
          for (const pt of snapPts) {
            const [psx, psy] = dataToScreen(pt.x, pt.y);
            if (!Number.isFinite(psx) || !Number.isFinite(psy)) continue;
            if (Math.hypot(psx - sx, psy - sy) < 12) {
              snapSx = psx;
              snapSy = psy;
              snapWx = pt.x;
              snapWy = pt.y;
              break;
            }
          }
        }
        hoverRef.current = {
          sx: snapSx,
          sy: snapSy,
          wx: snapWx,
          wy: snapWy,
          snap: best,
          snapColor: bestColor,
        };
        // Task 8.A + 8.B: rAF-batched multi-curve hit test + DOM tooltip pos.
        scheduleHoverUpdate(sx, sy, wx, wy, e.clientX, e.clientY);
        scheduleRedraw();
      } catch (err) {
        console.error('[Plot2DCanvas] pointer move error:', err);
        setDrawError(err instanceof Error ? err.message : '绘制交互失败');
      }
    },
    [screenToData, dataToScreen, computed, onViewChange, scheduleRedraw, overlays, scheduleHoverUpdate],
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
    hoverPendingRef.current = null;
    setHoveredPoints([]);
    setMousePos(null);
    setMouseWorld(null);
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

  /* ---------------- Task 8.B: DOM Tooltip lines ------------------- */
  const tooltipLines = useMemo(() => {
    if (!mousePos || hoveredPoints.length === 0) return [];
    const byId = new Map(plots.map((p) => [p.id, p]));
    return hoveredPoints
      .map((hp) => {
        const p = byId.get(hp.plotId);
        if (!p) return null;
        const label = p.expression;
        const slopeStr = Number.isFinite(hp.slope)
          ? (hp.slope >= 1e5 || Math.abs(hp.slope) < 1e-3
              ? hp.slope.toExponential(2).replace('e+', 'e')
              : hp.slope.toFixed(3))
          : '—';
        const xStr = Number.isFinite(hp.x)
          ? (Math.abs(hp.x) >= 1e5 || Math.abs(hp.x) < 1e-3
              ? hp.x.toExponential(2).replace('e+', 'e')
              : hp.x.toFixed(3))
          : '—';
        const yStr = Number.isFinite(hp.y)
          ? (Math.abs(hp.y) >= 1e5 || Math.abs(hp.y) < 1e-3
              ? hp.y.toExponential(2).replace('e+', 'e')
              : hp.y.toFixed(3))
          : '—';
        return { color: p.color, label, xStr, yStr, slopeStr };
      })
      .filter(Boolean) as Array<{ color: string; label: string; xStr: string; yStr: string; slopeStr: string }>;
  }, [hoveredPoints, mousePos, plots]);

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
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onDoubleClick={handleDoubleClick}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      />
      {/* Task 8.B: Follow-mouse DOM Tooltip */}
      {mousePos && tooltipLines.length > 0 && (
        <div
          className="absolute z-50 pointer-events-none rounded-md border border-border bg-popover/95 px-2 py-1.5 text-xs shadow-lg backdrop-blur-sm"
          style={{ left: mousePos.x + 14, top: mousePos.y + 14, maxWidth: 320 }}
        >
          {tooltipLines.map((line, idx) => (
            <div key={idx} className="flex items-center gap-2 font-mono whitespace-nowrap leading-5">
              <span
                className="inline-block h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: line.color }}
              />
              <span className="text-foreground/90 truncate">{line.label}</span>
              <span className="text-muted-foreground/80">|</span>
              <span className="text-muted-foreground">X={line.xStr}</span>
              <span className="text-muted-foreground/80">|</span>
              <span className="text-muted-foreground">Y={line.yStr}</span>
              <span className="text-muted-foreground/80">|</span>
              <span className="text-muted-foreground">斜率={line.slopeStr}</span>
            </div>
          ))}
        </div>
      )}
      {/* Mouse coordinate readout + range badge bottom-left */}
      <div className="pointer-events-none absolute bottom-1.5 left-2 flex items-center gap-1.5 rounded bg-muted-foreground/20 px-1.5 py-0.5 font-mono text-[10px] text-foreground/80 backdrop-blur-sm">
        <span>{mouseWorld ? `(${mouseWorld.wx.toFixed(3)}, ${mouseWorld.wy.toFixed(3)})` : '(x, y)'}</span>
        <span className="opacity-50">·</span>
        <span className="opacity-70">x ∈ [{xRange[0].toFixed(2)}, {xRange[1].toFixed(2)}] · y ∈ [{yRange[0].toFixed(2)}, {yRange[1].toFixed(2)}]</span>
      </div>

      {/* Task 9: Curve animation timeline — shown only when a curveSet carries frames */}
      {maxFrames > 0 && (
        <div className="pointer-events-auto absolute bottom-2 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-background/85 px-3 py-1.5 shadow-lg backdrop-blur-sm">
          <button
            type="button"
            aria-label={isPlaying ? '暂停' : '播放'}
            onClick={() => setIsPlaying((v) => !v)}
            className="grid size-6 place-items-center rounded-full bg-primary text-primary-foreground transition hover:opacity-90"
          >
            {isPlaying ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
          </button>
          <input
            type="range"
            aria-label="动画帧"
            min={0}
            max={Math.max(0, maxFrames - 1)}
            value={Math.min(playhead, maxFrames - 1)}
            onChange={(e) => {
              setIsPlaying(false);
              setPlayhead(Number(e.target.value));
            }}
            className="h-1.5 w-36 cursor-pointer accent-primary sm:w-48"
          />
          <span className="min-w-10 text-center font-mono text-[10px] text-muted-foreground">
            {Math.min(playhead, maxFrames - 1) + 1}/{maxFrames}
          </span>
        </div>
      )}

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

/**
 * D4 layered canvas: lazily create an offscreen canvas and keep its backing
 * store in sync with the main canvas's device-pixel size. Returns the canvas
 * (or null in SSR). The caller is responsible for fetching a 2D context and
 * re-issuing setTransform / clearRect when it actually redraws the layer.
 */
function ensureLayerCanvas(
  ref: MutableRefObject<HTMLCanvasElement | null>,
  w: number,
  h: number,
): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  if (!ref.current) ref.current = document.createElement('canvas');
  const c = ref.current;
  // Same conditional-resize discipline as D3: only re-allocate when the size
  // truly changes, otherwise we'd wipe the cached layer every frame.
  if (c.width !== w || c.height !== h) {
    c.width = w;
    c.height = h;
  }
  return c;
}

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

/**
 * Per-theme cache of CSS-variable-derived colors. getCssVar reads computed
 * style on every call, which is expensive when done inside the per-frame
 * draw loop. We cache the full set of themed colors keyed by theme string so
 * the computed style is only re-read when the theme actually changes.
 */
interface ThemedColors {
  bg: string;
  fg: string;
  mutedFg: string;
  popover: string;
  popoverFg: string;
  border: string;
}
const themedColorCache = new Map<'dark' | 'light', ThemedColors>();
function getThemedColors(theme: 'dark' | 'light'): ThemedColors {
  const cached = themedColorCache.get(theme);
  if (cached) return cached;
  const dark = theme === 'dark';
  const colors: ThemedColors = {
    bg: getCssVar('--background', dark ? '#1a1a1a' : '#ffffff'),
    fg: getCssVar('--foreground', dark ? '#e0e0e0' : '#212121'),
    mutedFg: getCssVar('--muted-foreground', dark ? '#9e9e9e' : '#616161'),
    popover: getCssVar('--popover', dark ? '#303030' : '#ffffff'),
    popoverFg: getCssVar('--popover-foreground', dark ? '#f5f5f5' : '#212121'),
    border: getCssVar('--border', dark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)'),
  };
  themedColorCache.set(theme, colors);
  return colors;
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
