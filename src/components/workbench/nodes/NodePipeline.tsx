'use client';

/**
 * OmniMath Pro — Node Pipeline (ComfyUI / blueprint style)
 *
 * A full-canvas visual programming surface where users build math
 * computations as a graph of connected nodes. Drag nodes, wire ports,
 * watch results propagate live. The "wow" feature of OmniMath Pro.
 *
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │ PipelineToolbar  [back] [run] [clear] [export] [zoom] …     │
 *   ├─────────────────────────────────────────────────────────────┤
 *   │                                                               │
 *   │   .grid-bg canvas — pan (drag bg) / zoom (wheel)             │
 *   │                                                               │
 *   │     [Node]──edge──>[Node]──edge──>[Display]                  │
 *   │                                                               │
 *   │   Double-click → palette at cursor                            │
 *   └─────────────────────────────────────────────────────────────┘
 *
 * State lives here (React useState + localStorage). The pure execution
 * engine is in `./pipelineEngine`.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Play,
  Square,
  Trash2,
  FileCode2,
  Plus,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Scan,
  ScanLine,
  LayoutTemplate,
  LayoutGrid,
  Workflow,
  X,
  Settings,
  Hash,
  Info,
  Type,
  Variable,
  FunctionSquare,
  LineChart,
  Grid3x3,
  Calculator,
  Sigma,
  Activity,
  Equal,
  Monitor,
  AlertCircle,
  Split,
  Wand2,
  ArrowRightLeft,
  BarChart2,
  BarChart3,
  Blend,
  Brackets,
  ChevronsUpDown,
  Combine,
  Contrast,
  Dices,
  Divide,
  Dot,
  FileImage,
  Film,
  Filter,
  GitCompare,
  Image,
  Infinity as InfinityIcon,
  LogIn,
  Merge,
  Minus,
  Move,
  PenLine,
  PenTool,
  PersonStanding,
  RefreshCw,
  RotateCw,
  Ruler,
  Scale,
  Shrink,
  Spline,
  ToggleLeft,
  TrendingUp,
  Triangle,
  Video,
  Waves,
  Timer,
  TimerReset,
  ArrowUpRight,
  Star,
  Clock3,
  FastForward,
  Bug,
  ChevronDown,
  ChevronRight,
  Loader2,
  Volume2,
  VolumeX,
  Boxes,
  Ungroup,
  Map as MapIcon,
  CircleDot,
  GitBranch,
  GitFork,
  Crosshair,
  Zap,
  SquareRadical,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { t, useLocale } from '@/lib/i18n';
import type { TranslationDict } from '@/lib/i18n';
import { toast } from 'sonner';
import { useWorkbenchStore, type PreviewTab } from '@/lib/store/workbench';
import { useRunResultsStore, type RunCurve } from '@/lib/store/runResultsStore';
import { useAIContextStore } from '@/lib/store/aiContextStore';
import { AiPromptInput } from '@/components/workbench/ai/AiPromptInput';
import { RunResultsHost } from '../runresults/RunResultsHost';
import type { BezierPathData, BezierSegmentData } from '../plots/Plot2DCanvas';
import {
  NODE_TYPES,
  NODE_WIDTH,
  NODE_HEADER_H,
  PORT_ROW_H,
  PORTS_PAD_TOP,
  portsSectionHeight,
  getPortPosition,
  canConnect,
  executePipeline,
  PipelineCancelledError,
  exportPipelineToScript,
  getNodeVariableDeps,
  traceErrorChain,
  type PipelineNode,
  type PipelineEdge,
  type NodeType,
  type NodeCategory,
  type PortDef,
  type PortDataType,
  type NodeConfigField,
  type NodeTypeDef,
} from './pipelineEngine';
import { runSimulation, isSimulationNode, type SimSeries } from './simulationEngine';
import { PIPELINE_TEMPLATES, loadTemplate } from './pipelineTemplates';
import { PALETTE_GROUPS, DEFAULT_EXPANDED_CATEGORIES } from './paletteGroups';
import { normalizeRect, selectNodesInBox } from './nodeSelection';
import { Minimap } from './Minimap';
import { GroupFrameLayer } from './GroupFrameLayer';
import {
  PortPositionsProvider,
  usePortPositions,
  usePortReporter,
  portKey,
} from './DomMeasuredNode';
import { EdgeRenderer } from './EdgeRenderer';
import { MathRender } from './MathRender';

/* ------------------------------------------------------------------ *
 * 动画帧归一化：把 curve-animate 输出的逐帧 BezierPath[] 拍平成
 * [x, y] 折线（像素坐标，应用 Y 翻转以便数学坐标显示）。
 * ------------------------------------------------------------------ */
function normalizeFramePoints(frame: unknown, height: number): Array<[number, number]> {
  if (!Array.isArray(frame)) return [];
  const out: Array<[number, number]> = [];
  for (const item of frame) {
    if (!item || typeof item !== 'object') continue;
    const p = item as { segments?: BezierSegmentData[] };
    if (Array.isArray(p.segments)) {
      for (const pt of flattenSegmentsSafe(p.segments)) {
        out.push([pt[0], height > 0 ? height - pt[1] : pt[1]]);
      }
    }
  }
  return out;
}

function flattenSegmentsSafe(segments: BezierSegmentData[]): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let last: [number, number] | null = null;
  for (const seg of segments) {
    if ('cmd' in seg) {
      if (seg.cmd === 'moveTo') { if (seg.pts[0]) { out.push(seg.pts[0]); last = seg.pts[0]; } }
      else if (seg.cmd === 'lineTo') { for (const p of seg.pts) { out.push(p); last = p; } }
      else if (seg.cmd === 'quadTo' && seg.pts.length >= 2) {
        const [c, end] = seg.pts;
        if (last) out.push(...sampleQuadPts(last, c, end));
        last = end;
      } else if (seg.cmd === 'cubicTo' && seg.pts.length >= 3) {
        const [c1, c2, end] = seg.pts;
        if (last) out.push(...sampleCubicPts(last, c1, c2, end));
        last = end;
      }
    } else {
      const p0 = toXY2(seg.p0), c1 = toXY2(seg.c1), c2 = toXY2(seg.c2), p1 = toXY2(seg.p1);
      out.push(...sampleCubicPts(p0, c1, c2, p1));
      last = p1;
    }
  }
  return out;
}

function toXY2(p: { x: number; y: number } | [number, number]): [number, number] {
  return Array.isArray(p) ? [p[0], p[1]] : [p.x, p.y];
}
function sampleQuadPts(p0: [number, number], c: [number, number], p1: [number, number], steps = 8): Array<[number, number]> {
  const o: Array<[number, number]> = [];
  for (let i = 1; i <= steps; i++) { const t = i / steps, mt = 1 - t; o.push([mt * mt * p0[0] + 2 * mt * t * c[0] + t * t * p1[0], mt * mt * p0[1] + 2 * mt * t * c[1] + t * t * p1[1]]); }
  return o;
}
function sampleCubicPts(p0: [number, number], c1: [number, number], c2: [number, number], p1: [number, number], steps = 12): Array<[number, number]> {
  const o: Array<[number, number]> = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps, mt = 1 - t;
    const a = mt * mt * mt, b = 3 * mt * mt * t, c = 3 * mt * t * t, d = t * t * t;
    o.push([a * p0[0] + b * c1[0] + c * c2[0] + d * p1[0], a * p0[1] + b * c1[1] + c * c2[1] + d * p1[1]]);
  }
  return o;
}

/** 节点显示名（取自节点类型注册表的多语言 label）。 */
function nodeTitle(n: PipelineNode): string {
  const def = NODE_TYPES[n.type];
  return def?.labelKey ? t(def.labelKey) : n.type;
}

/**
 * 把「传递函数分析」节点（sim-transfer-fn）的分析结果推送到独立结果面板：
 *  - 阶跃响应 → 一个 plot 面板（y(t) vs t）
 *  - 伯德图   → 一个 plot 面板（幅值 dB + 相位°，频率轴为对数刻度值）
 * `add` 是 runResultsStore 的 addRunResult。
 */
function pushTransferResults(
  nodes: PipelineNode[],
  add: (panel: Omit<import('@/lib/store/runResultsStore').RunResultPanel, 'id' | 'createdAt'>) => unknown,
): void {
  for (const n of nodes) {
    if (n.type !== 'sim-transfer-fn') continue;
    const analysis = n.outputs?.analysis as
      | { step?: { t: number; y: number }[]; bode?: { f: number; db: number; phaseDeg: number }[] }
      | undefined;
    if (!analysis) continue;
    const title = nodeTitle(n);

    if (Array.isArray(analysis.step) && analysis.step.length >= 2) {
      add({
        title: `${title} · 阶跃响应`,
        kind: 'plot',
        curves: [{
          id: `${n.id}_step`,
          label: 'y(t)',
          color: '#4ade80',
          width: 2,
          points: analysis.step.map((p) => [p.t, p.y] as [number, number]),
        }],
        axisX: '时间 t (s)',
        axisY: '响应 y(t)',
      });
    }

    if (Array.isArray(analysis.bode) && analysis.bode.length >= 2) {
      add({
        title: `${title} · 伯德图`,
        kind: 'plot',
        curves: [
          {
            id: `${n.id}_mag`,
            label: '幅值 (dB)',
            color: '#a78bfa',
            width: 2,
            points: analysis.bode.map((p) => [p.f, p.db] as [number, number]),
          },
          {
            id: `${n.id}_phase`,
            label: '相位 (°)',
            color: '#f59e0b',
            width: 2,
            points: analysis.bode.map((p) => [p.f, p.phaseDeg] as [number, number]),
          },
        ],
        axisX: '频率 f (Hz)',
        axisY: '幅值 (dB) / 相位 (°)',
      });
    }
  }
}

/* ------------------------------------------------------------------ *
 * Icon map — node type → lucide component
 * ------------------------------------------------------------------ */
const ICONS: Record<string, LucideIcon> = {
  Hash, Type, Variable, Plus, FunctionSquare, LineChart,
  Grid3x3, Calculator, Sigma, Activity, Equal, Monitor,
  Split, Wand2, X, Play,
  ArrowRightLeft, BarChart2, BarChart3, Blend, Brackets,
  ChevronsUpDown, Combine, Contrast, Dices, Divide, Dot,
  FileImage, Film, Filter, GitCompare, Image,
  Infinity: InfinityIcon,
  LogIn, Merge, Minus, Move, PenLine, PenTool,
  PersonStanding, PlusMinus: Scale,
  RefreshCw, RotateCw, Ruler,
  Scale, ScanLine, Shrink, Spline, ToggleLeft, TrendingUp,
  Triangle, Video, Waves,
  Timer, TimerReset, ArrowUpRight,
  CircleDot, GitBranch, GitFork, Crosshair, Zap, SquareRadical,
};

/* ------------------------------------------------------------------ *
 * Category colors — drives the left stripe + icon tint
 * ------------------------------------------------------------------ */
const CATEGORY_COLOR: Record<NodeCategory, { stripe: string; text: string; bg: string }> = {
  input:      { stripe: 'bg-teal-500',     text: 'text-teal-500',     bg: 'bg-teal-500/10' },
  operation:  { stripe: 'bg-amber-500',    text: 'text-amber-500',    bg: 'bg-amber-500/10' },
  function:   { stripe: 'bg-rose-500',     text: 'text-rose-500',     bg: 'bg-rose-500/10' },
  plot:       { stripe: 'bg-violet-500',   text: 'text-violet-500',   bg: 'bg-violet-500/10' },
  matrix:     { stripe: 'bg-emerald-500',  text: 'text-emerald-500',  bg: 'bg-emerald-500/10' },
  calculus:   { stripe: 'bg-orange-500',   text: 'text-orange-500',   bg: 'bg-orange-500/10' },
  output:     { stripe: 'bg-cyan-500',     text: 'text-cyan-500',     bg: 'bg-cyan-500/10' },
  mapping:    { stripe: 'bg-sky-500',      text: 'text-sky-500',      bg: 'bg-sky-500/10' },
  vector:     { stripe: 'bg-indigo-500',   text: 'text-indigo-500',   bg: 'bg-indigo-500/10' },
  curve:      { stripe: 'bg-pink-500',     text: 'text-pink-500',     bg: 'bg-pink-500/10' },
  statistics: { stripe: 'bg-lime-600',     text: 'text-lime-600',     bg: 'bg-lime-600/10' },
  logic:      { stripe: 'bg-slate-500',    text: 'text-slate-500',    bg: 'bg-slate-500/10' },
  vision:     { stripe: 'bg-fuchsia-600',  text: 'text-fuchsia-600',  bg: 'bg-fuchsia-600/10' },
  simulation: { stripe: 'bg-violet-600',   text: 'text-violet-600',   bg: 'bg-violet-600/10' },
  control:    { stripe: 'bg-rose-600',     text: 'text-rose-600',     bg: 'bg-rose-600/10' },
};

const CATEGORY_LABEL_KEY: Record<NodeCategory, keyof TranslationDict> = {
  input:      'npCategoryInput',
  operation:  'npCategoryOp',
  function:   'npCategoryFunction',
  plot:       'npCategoryPlot',
  matrix:     'npCategoryMatrix',
  calculus:   'npCategoryCalculus',
  output:     'npCategoryOutput',
  mapping:    'npCategoryMapping',
  vector:     'npCategoryVector',
  curve:      'npCategoryCurve',
  statistics: 'npCategoryStatistics',
  logic:      'npCategoryLogic',
  vision:     'npCategoryVision',
  simulation: 'npCategorySimulation',
  control:    'npCategoryControl',
};

/* ------------------------------------------------------------------ *
 * 端口类型颜色编码（类 Unreal Blueprint）
 * ------------------------------------------------------------------ */
// 端口颜色随数据类型编码，让「连得对（P2）」成为视觉直觉：
//   number 绿 / expression 蓝 / matrix 紫 / curve·curves 橙 /
//   image 红 / animation 青 / plot 天蓝 / any 灰。
// 与 config-schema.test.ts 的 PORT_TYPE_COLORS 保持一致。
const PORT_TYPE_STYLE: Record<PortDataType, { border: string; bg: string }> = {
  number:     { border: 'oklch(0.72 0.16 155)', bg: 'oklch(0.72 0.16 155 / 0.35)' },
  expression: { border: 'oklch(0.62 0.19 250)', bg: 'oklch(0.62 0.19 250 / 0.35)' },
  matrix:     { border: 'oklch(0.6 0.2 310)',   bg: 'oklch(0.6 0.2 310 / 0.35)' },
  curve:      { border: 'oklch(0.75 0.16 60)',  bg: 'oklch(0.75 0.16 60 / 0.35)' },
  curves:     { border: 'oklch(0.75 0.16 60)',  bg: 'oklch(0.75 0.16 60 / 0.35)' },
  image:      { border: 'oklch(0.62 0.21 25)',  bg: 'oklch(0.62 0.21 25 / 0.35)' },
  animation:  { border: 'oklch(0.72 0.13 195)', bg: 'oklch(0.72 0.13 195 / 0.35)' },
  plot:       { border: 'oklch(0.7 0.15 220)',  bg: 'oklch(0.7 0.15 220 / 0.35)' },
  any:        { border: 'oklch(0.65 0 0)',      bg: 'oklch(0.65 0 0 / 0.35)' },
};

// 端口类型图标 —— 让「数据是什么」不只靠颜色，还靠形状（类 Unreal 数据线/执行线）。
// 与 PORT_TYPE_STYLE 一一对应。
const PORT_TYPE_ICON: Record<PortDataType, LucideIcon> = {
  number:     Hash,
  expression: FunctionSquare,
  matrix:     Grid3x3,
  curve:      Spline,
  curves:     Spline,
  image:      Image,
  animation:  Film,
  plot:       LineChart,
  any:        Dot,
};

/* ------------------------------------------------------------------ *
 * Persistence
 * ------------------------------------------------------------------ */
// P8: schemaVersion 用于未来 schema 变更时的迁移/拒绝。当前为 2。
//   v1 → v2: 新增 schemaVersion 字段 + 环预防（连接时阻止）。
// 加载时若版本缺失或更高，回退到空状态而非冒险加载不兼容数据。
const STORAGE_KEY = 'omnimath-pipeline-v1';
const SCHEMA_VERSION = 2;

interface PersistedState {
  nodes: PipelineNode[];
  edges: PipelineEdge[];
}

function loadState(): PersistedState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;

    // P8: 版本检查 — 缺失版本（v1 旧数据）或版本不匹配时，直接放弃
    // 加载，避免旧 schema 字段污染新代码。用户会看到空画布而非崩溃。
    if (typeof data.schemaVersion !== 'number' || data.schemaVersion > SCHEMA_VERSION) {
      console.warn(
        `[NodePipeline] storage schema version ${data.schemaVersion} (expected <= ${SCHEMA_VERSION}), discarding`,
      );
      return null;
    }

    // ── Schema 验证：过滤掉无效/损坏的 node 和 edge ──────────────
    // 防止 localStorage 中的旧版本数据（node.type 已删除/重命名）或
    // 损坏数据进入渲染流程，导致 NodeCard 解引用 undefined 而白屏崩溃。
    const validNodes: PipelineNode[] = [];
    if (Array.isArray(data.nodes)) {
      for (const n of data.nodes) {
        if (!n || typeof n !== 'object') continue;
        // node.type 必须存在于 NODE_TYPES 注册表中
        if (typeof n.type !== 'string' || !(n.type in NODE_TYPES)) continue;
        // 必须有 id 和 position
        if (typeof n.id !== 'string') continue;
        if (!n.position || typeof n.position.x !== 'number' || typeof n.position.y !== 'number') continue;
        // config 必须是对象（可为空）
        const config = (n.config && typeof n.config === 'object') ? n.config : {};
        validNodes.push({
          id: n.id,
          type: n.type as NodeType,
          position: { x: n.position.x, y: n.position.y },
          config,
        });
      }
    }

    // 收集有效 node id 集合，用于过滤悬空 edge
    const validIds = new Set(validNodes.map((n) => n.id));
    const validEdges: PipelineEdge[] = [];
    if (Array.isArray(data.edges)) {
      for (const e of data.edges) {
        if (!e || typeof e !== 'object') continue;
        if (typeof e.id !== 'string') continue;
        if (typeof e.from !== 'string' || typeof e.to !== 'string') continue;
        if (!validIds.has(e.from) || !validIds.has(e.to)) continue;
        if (typeof e.fromPort !== 'string' || typeof e.toPort !== 'string') continue;
        validEdges.push({
          id: e.id,
          from: e.from,
          fromPort: e.fromPort,
          to: e.to,
          toPort: e.toPort,
        });
      }
    }

    return { nodes: validNodes, edges: validEdges };
  } catch {
    return null;
  }
}

function saveState(nodes: PipelineNode[], edges: PipelineEdge[]) {
  if (typeof window === 'undefined') return;
  try {
    // Only persist serialisable node fields (position + config). Outputs /
    // results may contain mathjs matrices / complex objects and must not be
    // JSON-stringified — doing so can blow up localStorage or throw.
    const serialisableNodes = nodes.map(({ id, type, position, config }) => ({
      id,
      type,
      position,
      config,
    }));
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        schemaVersion: SCHEMA_VERSION,
        nodes: serialisableNodes,
        edges,
      }),
    );
  } catch {
    // ignore quota / serialisation errors
  }
}

/* ------------------------------------------------------------------ *
 * ID + node factory
 * ------------------------------------------------------------------ */
function makeId(): string {
  return `n_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function makeEdgeId(): string {
  return `e_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function createNode(type: NodeType, x: number, y: number): PipelineNode {
  const def = NODE_TYPES[type];
  if (!def) {
    // 防御：type 无效时不应发生（palette 只传已知类型），
    // 但作为兜底，创建一个 number-input 节点而非崩溃。
    console.error(`[NodePipeline] createNode: unknown node type "${type}", falling back to number-input`);
    const fallback = NODE_TYPES['number-input'];
    return {
      id: makeId(),
      type: 'number-input',
      position: { x, y },
      config: { ...fallback.defaultConfig },
    };
  }
  return {
    id: makeId(),
    type,
    position: { x, y },
    config: { ...def.defaultConfig },
  };
}

/**
 * Approximate node height used for bounding-box calculations (minimap,
 * fit-view). The real height varies by node type/config, but this is a
 * safe upper-ish estimate for overview geometry.
 */
const APPROX_NODE_H = 130;

/** 模板分组顺序与标签（category 缺省视为 math）。 */
const TEMPLATE_GROUPS: { key: string; label: string }[] = [
  { key: 'math', label: '数学 / 计算' },
  { key: 'vision', label: '视觉 / 曲线' },
  { key: 'simulation', label: '仿真 / 控制' },
];

/**
 * Compute a viewport transform that fits all given nodes inside the
 * canvas (with padding). Returns null if there are no nodes.
 */
function fitViewFor(
  nodes: PipelineNode[],
  canvasSize: { w: number; h: number },
): { x: number; y: number; scale: number } | null {
  if (nodes.length === 0) return null;
  const minX = Math.min(...nodes.map((n) => n.position.x));
  const minY = Math.min(...nodes.map((n) => n.position.y));
  const maxX = Math.max(...nodes.map((n) => n.position.x + NODE_WIDTH));
  const maxY = Math.max(...nodes.map((n) => n.position.y + APPROX_NODE_H));
  const bboxW = Math.max(maxX - minX, 1);
  const bboxH = Math.max(maxY - minY, 1);
  const pad = 64;
  const availW = Math.max(canvasSize.w - pad * 2, 100);
  const availH = Math.max(canvasSize.h - pad * 2, 100);
  const scale = Math.min(2, Math.max(0.4, Math.min(availW / bboxW, availH / bboxH)));
  // Center the bbox in the canvas.
  const x = (canvasSize.w - bboxW * scale) / 2 - minX * scale;
  const y = (canvasSize.h - bboxH * scale) / 2 - minY * scale;
  return { x, y, scale };
}

/**
 * 节点去重叠：把发生重叠（矩形相交）的节点依次横向推开，直到互不重叠。
 * 解决「节点挤在一块看不清」的问题。返回新的位置映射；无重叠时不改动任何节点。
 * 迭代有限次（最多 8 轮），保证 O(n²) 内收敛，绝不死循环。
 */
function spreadOverlappingNodes(
  nodes: PipelineNode[],
  opts?: { gap?: number },
): Record<string, { x: number; y: number }> {
  const gap = opts?.gap ?? 24;
  const positions: Record<string, { x: number; y: number }> = {};
  for (const n of nodes) positions[n.id] = { x: n.position.x, y: n.position.y };

  const rect = (p: { x: number; y: number }) => ({
    left: p.x,
    top: p.y,
    right: p.x + NODE_WIDTH,
    bottom: p.y + APPROX_NODE_H,
  });
  const overlaps = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const ra = rect(a);
    const rb = rect(b);
    return ra.left < rb.right + gap && rb.left < ra.right + gap && ra.top < rb.bottom + gap && rb.top < ra.bottom + gap;
  };

  for (let round = 0; round < 8; round++) {
    let moved = false;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = positions[nodes[i].id];
        const b = positions[nodes[j].id];
        if (!overlaps(a, b)) continue;
        // 把靠右的节点往右推，给左侧节点留出空间。
        const pushRight = a.x <= b.x ? b : a;
        const other = a.x <= b.x ? a : b;
        pushRight.x = other.x + NODE_WIDTH + gap;
        moved = true;
      }
    }
    if (!moved) break;
  }
  return positions;
}

/**
 * P4: 环检测 — 判断添加 from→to 这条边后是否会产生回路。
 *
 * 思路：添加边后，若从 `to` 出发能沿现有边（含新边）回到 `from`，
 * 说明成环。等价于：在现有边集上，从 `to` 做 DFS，看能否到达 `from`。
 * 若能到达，再加 to←from 的反向回流就闭合成环。
 *
 * 实际边方向是 from→to（数据流），所以"从 to 能否回到 from"
 * = 在现有边上从 to 反向 DFS（沿 to 的入边往上找）能否到达 from。
 * 但更简单的等价：正向 DFS 从 from 出发（沿出边），若能到达 to，
 * 则再加 from→to 就是环。这里用正向 DFS。
 */
function wouldCreateCycle(
  edges: PipelineEdge[],
  from: string,
  to: string,
): boolean {
  if (from === to) return true;
  // 邻接表：from → [to, to, ...]
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    if (!adj.has(e.from)) adj.set(e.from, []);
    adj.get(e.from)!.push(e.to);
  }
  // BFS/DFS 从 `to` 出发，看能否回到 `from`。
  // （因为新边是 from→to，若 to 已经能到达 from，就成环。）
  const visited = new Set<string>();
  const stack = [to];
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === from) return true;
    if (visited.has(cur)) continue;
    visited.add(cur);
    const next = adj.get(cur);
    if (next) for (const n of next) stack.push(n);
  }
  return false;
}

/* ================================================================== *
 * Main component
 * ================================================================== */
export function NodePipeline() {
  useLocale();
  // PortPositionsProvider lives outside so the inner component can read
  // measured port offsets via usePortPositions() for accurate edge routing.
  return (
    <PortPositionsProvider>
      <NodePipelineInner />
    </PortPositionsProvider>
  );
}

function NodePipelineInner() {
  const setEditorContent = useWorkbenchStore((s) => s.setEditorContent);
  const addResult = useWorkbenchStore((s) => s.addResult);
  const variables = useWorkbenchStore((s) => s.variables);
  const setViewMode = useWorkbenchStore((s) => s.setViewMode);
  const setActivePreviewTab = useWorkbenchStore((s) => s.setActivePreviewTab);

  // DOM-measured port offsets (populated by PortLabel via usePortReporter).
  // Falls back to fixed-constant estimates before measurements arrive.
  const portPositions = usePortPositions();

  // Pipeline state — lazy-init from localStorage (safe on client).
  // P9: 用 useMemo 把 loadState() 的结果缓存一次，再交给两个 useState
  // 惰性初始化。否则两个 useState 各自调一次 loadState()，会读两次
  // localStorage + 解析两次 JSON（旧数据量大时有性能开销）。
  const initialState = useMemo(() => loadState(), []);
  const [nodes, setNodes] = useState<PipelineNode[]>(() => initialState?.nodes ?? []);
  const [edges, setEdges] = useState<PipelineEdge[]>(() => initialState?.edges ?? []);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // P6: 选中的边 id（用于高亮 + Delete 键删除）。
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);

  // 拖拽/平移过程中若组件卸载，window 级 pointer 监听器可能残留。
  // 这里在卸载时统一兜底清理，并移除 body 上的拖拽样式类。
  useEffect(() => {
    return () => {
      document.body.classList.remove('dragging');
    };
  }, []);
  // Multi-selection set. `selectedId` is kept in sync as the "anchor" /
  // primary selection for Inspector compatibility and edge highlighting.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Viewport (pan + zoom).
  const [view, setView] = useState<{ x: number; y: number; scale: number }>({
    x: 40,
    y: 40,
    scale: 1,
  });

  // ── 关键修复：对齐「测得的屏幕坐标」与「内容坐标」──────────────
  // usePortReporter 用 getBoundingClientRect() 测量端口相对卡片左上角的偏移，
  // 该偏移是**屏幕像素**（已受 transform 层的 scale(view.scale) 影响）。
  // 而节点卡片用 node.position（内容坐标）定位，边线也画在内容坐标里。
  // 若直接把屏幕像素偏移加进内容坐标，再被 transform 层缩放一次，就会多乘
  // 一个 view.scale —— 当用户缩放（scale≠1）时连线便与端口「断层」错位。
  // 因此这里把屏幕偏移换算回内容坐标（偏移 / view.scale），供边与吸附使用。
  const contentPortPositions = useMemo(() => {
    if (!portPositions || portPositions.size === 0) return portPositions;
    const scale = view.scale;
    if (scale === 1) return portPositions;
    const m = new Map<string, { x: number; y: number }>();
    for (const [k, v] of portPositions) {
      m.set(k, { x: v.x / scale, y: v.y / scale });
    }
    return m;
  }, [portPositions, view.scale]);
  const contentPortPositionsRef = useRef(contentPortPositions);
  useEffect(() => { contentPortPositionsRef.current = contentPortPositions; }, [contentPortPositions]);

  // Connection drag state.
  const [connecting, setConnecting] = useState<{
    fromNode: string;
    fromPort: string;
    cursor: { x: number; y: number };
  } | null>(null);

  // Port snapping — when the cursor is near an input port while dragging a
  // connection, we snap the endpoint to the port center and highlight it.
  const [snapTarget, setSnapTarget] = useState<{ nodeId: string; portId: string } | null>(null);

  // P1-4: 边重连拖拽状态。end='from' 表示正在重连源端，'to' 表示目标端。
  // cursor 为当前拖柄位置（局部坐标），用于绘制 pending 路径。
  const [reconnect, setReconnect] = useState<{
    edgeId: string;
    end: 'from' | 'to';
    cursor: { x: number; y: number };
  } | null>(null);

  // Marquee box selection — Shift+drag on empty canvas draws a rectangle
  // and selects all nodes whose bbox intersects it. Always additive
  // (Shift is the "add to selection" modifier, matching ComfyUI/Blender).
  const [marquee, setMarquee] = useState<{
    start: { x: number; y: number }; // world coords
    current: { x: number; y: number };
  } | null>(null);
  const marqueeRef = useRef(marquee);
  useEffect(() => { marqueeRef.current = marquee; }, [marquee]);

  // Palette (add-node drawer).
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [palettePos, setPalettePos] = useState<{ x: number; y: number } | null>(null);

  // Simulink 仿真求解器配置（时间范围 / 步长 / 求解方法）。
  const [simConfig, setSimConfig] = useState<{ t0: number; tEnd: number; dt: number; method: 'euler' | 'rk4' | 'rkf45' }>({
    t0: 0,
    tEnd: 10,
    dt: 0.05,
    method: 'euler',
  });
  const [simConfigOpen, setSimConfigOpen] = useState(false);

  // P3 诊断面板开合。
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);

  // P3 错误传播链高亮：当前选中/出错节点上游的节点 id 集合。
  const errorChain = useMemo(() => {
    if (!selectedId) return new Set<string>();
    const { chain } = traceErrorChain(nodes, edges, selectedId);
    return new Set(chain);
  }, [selectedId, nodes, edges]);

  // 出错节点列表（供诊断面板与工具栏徽标）。
  const errorNodes = useMemo(
    () => nodes.filter((n) => n.error),
    [nodes],
  );

  // 操作提示折叠状态（默认折叠，仅显示图标，点击展开文字）
  const [hintsOpen, setHintsOpen] = useState(false);

  // 小地图显隐（默认显示）。
  const [minimapOpen, setMinimapOpen] = useState(true);

  // Computing pulse — bumps on every execute to trigger node glow.
  const [computeTick, setComputeTick] = useState(0);

  // P2-5: 流水线「运行中」状态 + 逐节点进度（供浮层进度条显示）。
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [runProgress, setRunProgress] = useState<{ done: number; total: number } | null>(null);
  const runProgressRef = useRef(runProgress);
  useEffect(() => { runProgressRef.current = runProgress; }, [runProgress]);
  // 用户手动终止：ref 跨渲染保持，供 executePipeline 的 shouldCancel 轮询读取。
  const cancelRunRef = useRef(false);
  // 终止当前流水线：置位取消标记，长任务节点与逐节点循环都会尽快退出。
  const stopPipeline = useCallback(() => { cancelRunRef.current = true; }, []);
  // 节点内长任务进度（如视频→曲线逐帧处理）。pipeline 运行期间由 ctx.onProgress 写入。
  const [nodeProgress, setNodeProgress] = useState<{ fraction: number; label?: string } | null>(null);
  const nodeProgressRef = useRef(nodeProgress);
  useEffect(() => { nodeProgressRef.current = nodeProgress; }, [nodeProgress]);
  // 节点内长任务进度回调：写入 state 供浮层展示。
  const handleNodeProgress = useCallback((fraction: number, label?: string) => {
    setNodeProgress({ fraction, label });
  }, []);

  // Refs for canvas + content (transform layer).
  const canvasRef = useRef<HTMLDivElement>(null);

  // Track canvas dimensions (used by palette clamping, fit-view, minimap).
  const [canvasSize, setCanvasSize] = useState({ w: 800, h: 600 });
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const update = () => setCanvasSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Always-current view (for use inside stable callbacks).
  const viewRef = useRef(view);
  useEffect(() => { viewRef.current = view; }, [view]);

  // Mirror `nodes` into a ref so marquee collision detection (which runs
  // inside a global pointerup handler) reads the latest list without
  // re-binding the handler on every nodes change.
  const nodesRef = useRef(nodes);
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);

  // Drag state (node dragging) — kept in ref to avoid re-renders.
  const dragRef = useRef<{
    nodeId: string;
    startX: number;
    startY: number;
    nodeX: number;
    nodeY: number;
  } | null>(null);

  // Pan state — also in ref.
  const panRef = useRef<{
    startX: number;
    startY: number;
    viewX: number;
    viewY: number;
  } | null>(null);

  // Multi-select anchor (for Shift+click range selection) + snap target
  // mirror (so the global pointerup handler can read the latest value
  // without re-subscribing listeners on every state change).
  const lastSelectedId = useRef<string | null>(null);
  const snapTargetRef = useRef<{ nodeId: string; portId: string; type: PortDataType } | null>(null);

  /* ── Persist on change (debounced) ───────────────────────────── */
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveState(nodes, edges), 300);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [nodes, edges]);

  /* ── Convert screen → local (canvas-content) coords ──────────── */
  const screenToLocal = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      const v = viewRef.current;
      return {
        x: (clientX - rect.left - v.x) / v.scale,
        y: (clientY - rect.top - v.y) / v.scale,
      };
    },
    [],
  );

  /* ── 独立运行结果面板：把 plot/curve/animation 输出归一化后送入 runResults store ── */
  const pushRunResults = useCallback((nodes: PipelineNode[], graphEdges: PipelineEdge[] = []) => {
    const add = useRunResultsStore.getState().addRunResult;
    // P0-4 图像+轮廓窗：收集 image-input 节点的原图，供 plot-curves 结果叠加背景。
    const imageInputs = new Map<string, { src: string; width: number; height: number }>();
    for (const n of nodes) {
      if (n.type !== 'image-input') continue;
      const img = n.outputs?.image as { src?: string; width?: number; height?: number } | undefined;
      const src = n.config?.src as string | undefined;
      const finalSrc = typeof img?.src === 'string' && img.src ? img.src : src;
      const width = typeof img?.width === 'number' ? img.width : 0;
      const height = typeof img?.height === 'number' ? img.height : 0;
      if (finalSrc && width > 0 && height > 0) imageInputs.set(n.id, { src: finalSrc, width, height });
    }
    // 反向 BFS：从目标节点沿边向上游找到最近的 image-input 原图。
    const findSourceImage = (nodeId: string): { src: string; width: number; height: number } | undefined => {
      if (imageInputs.has(nodeId)) return imageInputs.get(nodeId);
      const visited = new Set<string>([nodeId]);
      const queue = graphEdges.filter((e) => e.to === nodeId).map((e) => e.from);
      while (queue.length > 0) {
        const cur = queue.shift()!;
        if (visited.has(cur)) continue;
        visited.add(cur);
        if (imageInputs.has(cur)) return imageInputs.get(cur);
        const upstream = graphEdges.filter((e) => e.to === cur).map((e) => e.from);
        queue.push(...upstream);
      }
      return undefined;
    };
    for (const n of nodes) {
      if (n.type === 'plot-output' && n.outputs?.plot) {
        const plot = n.outputs.plot as {
          expr: string;
          xMin: number;
          xMax: number;
          samples: Array<[number, number]>;
        };
        const curves: RunCurve[] = [{
          id: n.id,
          label: plot.expr || nodeTitle(n),
          color: '#a78bfa',
          width: 2,
          points: plot.samples ?? [],
        }];
        add({ title: plot.expr || nodeTitle(n), kind: 'plot', curves });
      } else if (n.type === 'plot-curves' && n.outputs?.curves) {
        const o = n.outputs.curves as Record<string, unknown>;
        const paths = Array.isArray(o.curves) ? (o.curves as BezierPathData[]) : [];
        const width = typeof o.width === 'number' ? o.width : 0;
        const height = typeof o.height === 'number' ? o.height : 0;
        if (paths.length <= 0 || width <= 0 || height <= 0) continue;
        const color = typeof n.config.color === 'string' ? n.config.color : '#a78bfa';
        const strokeWidth = typeof n.config.width === 'number' ? n.config.width : 2;
        const curves: RunCurve[] = paths
          .filter((p) => Array.isArray(p.segments) && p.segments.length > 0)
          .map((p, i) => ({
            id: `${n.id}_${i}`,
            color,
            width: strokeWidth,
            segments: p.segments,
            imageW: width,
            imageH: height,
            // P0-3：curve-fit 已把控制点翻转为数学坐标，RunCurve 不得再翻一次
            // （否则渲染层 curveToWorldPoints 二次翻转 → 点颠倒）。此处理为 false。
            flipX: false,
            flipY: false,
          }));
        if (curves.length > 0) {
          // P0-4 图像+轮廓窗：把上游 image-input 的原图作为背景叠加到曲线结果上。
          const srcImage = findSourceImage(n.id);
          add({
            title: nodeTitle(n),
            kind: 'curves',
            curves,
            ...(srcImage ? { image: { ...srcImage } } : {}),
          });
        }
      } else if (n.type === 'curve-animate' && n.outputs?.animation) {
        const anim = n.outputs.animation as
          | { frames?: unknown[]; width?: number; height?: number; color?: string; strokeWidth?: number; fps?: number }
          | undefined;
        if (!anim || !Array.isArray(anim.frames) || anim.frames.length === 0) continue;
        const frames = anim.frames.filter((f): f is unknown[] => Array.isArray(f));
        if (frames.length === 0) continue;
        const width = typeof anim.width === 'number' ? anim.width : 0;
        const height = typeof anim.height === 'number' ? anim.height : 0;
        const firstFrame = frames[0];
        if (firstFrame.length <= 0 || width <= 0 || height <= 0) continue;
        const curves: RunCurve[] = [{
          id: n.id,
          color: anim.color ?? '#a78bfa',
          width: anim.strokeWidth ?? 2,
          points: normalizeFramePoints(firstFrame, height),
        }];
        const animationFrames = frames.map((f) => normalizeFramePoints(f, height));
        add({
          title: nodeTitle(n),
          kind: 'animation',
          curves,
          animation: { frames: animationFrames, fps: typeof anim.fps === 'number' ? anim.fps : 30 },
        });
      }
    }
    // 自控：把传递函数分析（sim-transfer-fn）结果也送入独立结果面板。
    pushTransferResults(nodes, add);
  }, []);

  const runPipeline = useCallback(async () => {
    if (pipelineRunning) return;
    cancelRunRef.current = false;
    setPipelineRunning(true);
    setRunProgress(null);
    try {
      const ctx = {
        variables: Object.fromEntries(
          Object.entries(variables).map(([k, v]) => [k, v.value]),
        ),
        onProgress: handleNodeProgress,
        shouldCancel: () => cancelRunRef.current,
      };

      // Simulink-style 仿真：若图中存在仿真节点，走定步长求解器，
      // 否则走常规单次数据流 pipeline。
      const hasSim = nodes.some(isSimulationNode);
      let executed: PipelineNode[];
      if (hasSim) {
        executed = runSimulationPipeline(nodes, edges, simConfig);
        setNodes(executed);
        setComputeTick((n) => n + 1);
        // 把 scope 时序发送到「独立运行结果面板」（不再切回 2D 绘图）。
        const scopes = executed.filter((n) => n.type === 'sim-scope' && n.outputs?.series);
        if (scopes.length > 0) {
          scopes.forEach((n) => {
            const series = n.outputs?.series as { t: number[]; y: number[] } | undefined;
            if (!series || series.t.length < 2) return;
            const curves: RunCurve[] = [{
              id: n.id,
              label: nodeTitle(n),
              color: '#4ade80',
              width: 2,
              points: series.t.map((t, i) => [t, series.y[i] ?? 0] as [number, number]),
            }];
            useRunResultsStore.getState().addRunResult({ title: nodeTitle(n), kind: 'plot', curves, axisX: '时间 t (s)', axisY: '输出 y(t)' });
          });
        }
        // 自控：sim-transfer-fn 是批量分析节点（非仿真逐步块），此路径不经过
        // executePipeline，故手动补齐分析输出并推送独立结果面板。
        const tfDef = NODE_TYPES['sim-transfer-fn'];
        const tfNodes: PipelineNode[] = [];
        for (const n of executed) {
          if (n.type !== 'sim-transfer-fn') continue;
          const out = await tfDef.execute({}, n.config, ctx);
          tfNodes.push({ ...n, outputs: out });
        }
        if (tfNodes.length > 0) {
          pushTransferResults(tfNodes, useRunResultsStore.getState().addRunResult);
        }
        return;
      }

      executed = await executePipeline(nodes, edges, ctx, {
        onProgress: (done, total) => setRunProgress({ done, total }),
        shouldCancel: () => cancelRunRef.current,
      });

      // Side-effects: plot / curve / animation 输出统统进入独立运行结果面板，
      // 不再 push 到 2D 绘图工作台 store（彻底解耦）、不再自动切回 plot2d tab。
      pushRunResults(executed, edges);
      // 运行结果提示：告知已生成多少个独立浮窗，避免用户「转完不知道结果在哪」。
      const _count = useRunResultsStore.getState().panels.length;
      if (_count > 0) {
        toast.success('流水线执行完成', {
          description: `已在右侧浮窗生成 ${_count} 个结果面板（可拖拽/缩放，右上角可关闭全部）`,
          duration: 3200,
        });
      }
      for (const n of executed) {
        if (n.type === 'display' && n.result !== undefined && n.result !== null) {
          const r = n.result;
          let output = '';
          let latex = '';
          let type = 'number';
          try {
            if (typeof r === 'number') {
              output = String(r);
              latex = String(r);
            } else if (r && typeof r === 'object' && 'toTex' in (r as object)) {
              output = String(r);
              latex = (r as { toTex: () => string }).toTex();
              type = 'symbolic';
            } else {
              output = String(r);
              latex = `\\text{${String(r)}}`;
            }
          } catch {
            output = String(r);
          }
          addResult({
            id: `np_${n.id}_${Date.now()}`,
            input: `[pipeline] ${n.id.slice(0, 8)}`,
            output,
            latex,
            timestamp: Date.now(),
            type,
          });
        }
      }
    } catch (err) {
      if (err instanceof PipelineCancelledError) {
        // 用户手动终止：不算失败，仅提示。
        toast.info('流水线已终止', { duration: 2000 });
      } else {
        console.error('[NodePipeline] runPipeline error:', err);
        toast.error('流水线执行失败', {
          description: (err as Error).message,
          duration: 4000,
        });
      }
    } finally {
      setPipelineRunning(false);
      setRunProgress(null);
      setNodeProgress(null);
    }
  }, [nodes, edges, variables, simConfig, pushRunResults, addResult, pipelineRunning]);

  /* ── P3 执行到选中节点 ─────────────────────────────────────── */
  const runToSelected = useCallback(async () => {
    if (!selectedId) {
      toast.warning('请先选中一个节点', { duration: 2500 });
      return;
    }
    setPipelineRunning(true);
    setRunProgress(null);
    try {
      const ctx = {
        variables: Object.fromEntries(
          Object.entries(variables).map(([k, v]) => [k, v.value]),
        ),
        onProgress: handleNodeProgress,
      };
      const executed = await executePipeline(nodes, edges, ctx, {
        stopAt: selectedId,
        onProgress: (done, total) => setRunProgress({ done, total }),
      });
      setNodes(executed);
      setComputeTick((n) => n + 1);
      // 独立运行结果面板（与 2D 绘图彻底解耦）。
      pushRunResults(executed, edges);
      toast.success('已执行到选中节点', {
        description: '下游节点已暂停，可继续排查',
        duration: 2500,
      });
    } catch (err) {
      toast.error('执行到节点失败', { description: (err as Error).message, duration: 4000 });
    } finally {
      setPipelineRunning(false);
      setRunProgress(null);
      setNodeProgress(null);
    }
  }, [selectedId, nodes, edges, variables, pushRunResults, pipelineRunning]);

  /* ── Auto-execute on graph / config change (debounced) ───────── */
  useEffect(() => {
    const id = setTimeout(() => {
      (async () => {
        try {
          const ctx = {
            variables: Object.fromEntries(
              Object.entries(variables).map(([k, v]) => [k, v.value]),
            ),
            onProgress: handleNodeProgress,
          };
          // 关键修复：自动执行必须与手动「运行」走同一判别逻辑。
          // 之前这里无条件调用 executePipeline（常规数据流 + Kahn 拓扑排序），
          // 导致一阶反馈仿真等含「故意成环」的模板在加载后被标成 'Cycle detected'，
          // 诊断面板因此一直报错。现在：只要存在仿真节点就走仿真求解器，
          // 仿真求解器通过状态块（积分器）断环 + 代数环不动点迭代，能正确处理反馈环。
          const hasSim = nodes.some(isSimulationNode);
          const executed = hasSim
            ? runSimulationPipeline(nodes, edges, simConfig)
            : await executePipeline(nodes, edges, ctx);
          // Only update if results actually changed — otherwise the
          // feedback loop (setNodes → effect → setNodes …) prevents the
          // debounced localStorage save from ever firing.
          setNodes((prev) => {
            let changed = false;
            const next = prev.map((n) => {
              const updated = executed.find((e) => e.id === n.id);
              if (!updated) return n;
              const oldKey = resultKey(n.result) + '|' + (n.error ?? '');
              const newKey = resultKey(updated.result) + '|' + (updated.error ?? '');
              if (oldKey !== newKey) {
                changed = true;
                return {
                  ...n,
                  result: updated.result,
                  outputs: updated.outputs,
                  error: updated.error,
                };
              }
              return n;
            });
            return changed ? next : prev;
          });
          // 独立运行结果面板（与 2D 绘图彻底解耦），避免蓝图结果污染 2D 绘图。
          pushRunResults(executed, edges);
        } catch (err) {
          // Auto-execute failures should be silent — the user didn't trigger
          // them, and frequent toasts would be annoying. Log for debugging.
          console.warn('[NodePipeline] auto-execute error:', err);
        } finally {
          setNodeProgress(null);
        }
      })().catch((err) => {
        console.warn('[NodePipeline] auto-execute unhandled promise error:', err);
      });
    }, 180);
    return () => clearTimeout(id);
  }, [nodes, edges, variables, simConfig, pushRunResults]);

  /* ── Helper: pan viewport so a node becomes visible ─────────── */
  const ensureNodeVisible = useCallback(
    (node: PipelineNode) => {
      const v = viewRef.current;
      // Guard: if the canvas hasn't been measured yet (panel collapsed or
      // first paint), skip panning — the math below would produce NaN/Infinity
      // and shove the node off-screen.
      if (canvasSize.w < 10 || canvasSize.h < 10) return;
      if (!Number.isFinite(v.scale) || v.scale === 0) return;
      const nodeLeft = node.position.x;
      const nodeTop = node.position.y;
      const nodeRight = node.position.x + NODE_WIDTH;
      const nodeBottom = node.position.y + APPROX_NODE_H;
      // 当前视口在世界坐标的范围
      const viewLeft = -v.x / v.scale;
      const viewTop = -v.y / v.scale;
      const viewRight = viewLeft + canvasSize.w / v.scale;
      const viewBottom = viewTop + canvasSize.h / v.scale;

      let newX = v.x;
      let newY = v.y;
      // 若节点完全在视口外或部分超出，平移使节点居中
      const outX = nodeLeft < viewLeft || nodeRight > viewRight;
      const outY = nodeTop < viewTop || nodeBottom > viewBottom;
      if (outX) {
        newX = canvasSize.w / 2 - (nodeLeft + NODE_WIDTH / 2) * v.scale;
      }
      if (outY) {
        newY = canvasSize.h / 2 - (nodeTop + APPROX_NODE_H / 2) * v.scale;
      }
      // Sanity: don't commit NaN/Infinity view — leave the viewport as-is.
      if (!Number.isFinite(newX) || !Number.isFinite(newY)) return;
      if (newX !== v.x || newY !== v.y) {
        setView({ ...v, x: newX, y: newY });
      }
    },
    [canvasSize],
  );

  /* ── Add a node (optionally at a position) ───────────────────── */
  const addNode = useCallback(
    (type: NodeType, atLocal?: { x: number; y: number }) => {
      let x: number;
      let y: number;
      if (atLocal) {
        // Center the node on the cursor (double-click placement).
        x = atLocal.x - NODE_WIDTH / 2;
        y = atLocal.y - 30;
      } else {
        // Cascade so new nodes don't stack.
        x = 80 + (nodes.length % 5) * 280;
        y = 90 + Math.floor(nodes.length / 5) * 260;
      }
      const node = createNode(type, x, y);
      setNodes((prev) => [...prev, node]);
      setSelectedId(node.id);
      setSelectedIds(new Set([node.id]));
      lastSelectedId.current = node.id;

      // 自动平移使新节点可见（仅在通过工具栏添加、无 atLocal 时）
      if (!atLocal) {
        ensureNodeVisible({ ...node, position: { x, y } } as PipelineNode);
      }

      setPaletteOpen(false);
      setPalettePos(null);
    },
    [nodes.length, canvasSize, ensureNodeVisible],
  );

  /* ── Multi-select aware node selection ───────────────────────── */
  const selectNode = useCallback(
    (nodeId: string, e: React.PointerEvent | React.MouseEvent) => {
      // P6: 选节点时清除边选中，避免两者同时高亮造成歧义。
      setSelectedEdgeId(null);
      if (e.ctrlKey || e.metaKey) {
        // Toggle this node in the selection set.
        setSelectedIds((prev) => {
          const next = new Set(prev);
          if (next.has(nodeId)) next.delete(nodeId);
          else next.add(nodeId);
          return next;
        });
        setSelectedId(nodeId);
        lastSelectedId.current = nodeId;
      } else if (e.shiftKey && lastSelectedId.current && lastSelectedId.current !== nodeId) {
        // Range select: from last selected to current (by node order).
        const ids = nodes.map((n) => n.id);
        const startIdx = ids.indexOf(lastSelectedId.current);
        const endIdx = ids.indexOf(nodeId);
        if (startIdx !== -1 && endIdx !== -1) {
          const [from, to] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
          setSelectedIds(new Set(ids.slice(from, to + 1)));
          setSelectedId(nodeId);
        }
      } else {
        // Plain click — single select.
        setSelectedIds(new Set([nodeId]));
        setSelectedId(nodeId);
        lastSelectedId.current = nodeId;
      }
    },
    [nodes],
  );

  /* ── Delete selected node + its edges ────────────────────────── */
  const deleteNode = useCallback(
    (id: string) => {
      setNodes((prev) => prev.filter((n) => n.id !== id));
      setEdges((prev) => prev.filter((e) => e.from !== id && e.to !== id));
      setSelectedIds((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      if (selectedId === id) setSelectedId(null);
    },
    [selectedId],
  );

  /* ── Clipboard: copy / paste selected nodes (with internal edges) */
  const clipboardRef = useRef<{ nodes: PipelineNode[]; edges: PipelineEdge[] } | null>(null);

  const copySelected = useCallback(() => {
    const ids = selectedIds.size > 0 ? selectedIds : selectedId ? new Set([selectedId]) : new Set<string>();
    if (ids.size === 0) return;
    clipboardRef.current = {
      nodes: nodes.filter((n) => ids.has(n.id)),
      edges: edges.filter((e) => ids.has(e.from) && ids.has(e.to)),
    };
    toast.success(`已复制 ${clipboardRef.current.nodes.length} 个节点`);
  }, [nodes, edges, selectedIds, selectedId]);

  const pasteClipboard = useCallback(() => {
    const clip = clipboardRef.current;
    if (!clip || clip.nodes.length === 0) return;
    const idMap = new Map<string, string>();
    // Compute the clipboard bounding-box top-left as the origin, so pasted
    // nodes land slightly offset from the existing selection / canvas origin.
    const minX = Math.min(...clip.nodes.map((n) => n.position.x));
    const minY = Math.min(...clip.nodes.map((n) => n.position.y));
    const OFFSET = 24;
    const newNodes = clip.nodes.map((n) => {
      const id = makeId();
      idMap.set(n.id, id);
      return {
        ...n,
        id,
        position: { x: n.position.x - minX + OFFSET + 40, y: n.position.y - minY + OFFSET + 40 },
        result: undefined,
        outputs: undefined,
        error: undefined,
      };
    });
    const newEdges = clip.edges
      .map((e) => idMap.get(e.from) && idMap.get(e.to) ? {
        id: makeEdgeId(),
        from: idMap.get(e.from)!,
        fromPort: e.fromPort,
        to: idMap.get(e.to)!,
        toPort: e.toPort,
      } : null)
      .filter((x): x is PipelineEdge => x !== null);
    setNodes((prev) => [...prev, ...newNodes]);
    setEdges((prev) => [...prev, ...newEdges]);
    const newIds = new Set(newNodes.map((n) => n.id));
    setSelectedIds(newIds);
    setSelectedId(newNodes[0]?.id ?? null);
  }, []);

  /** Duplicate the current selection (Ctrl+D) — same as copy+paste in place. */
  const duplicateSelected = useCallback(() => {
    copySelected();
    pasteClipboard();
  }, [copySelected, pasteClipboard]);

  /* ── Align / distribute selected nodes ───────────────────────── */
  const alignSelected = useCallback((mode: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom' | 'hspace' | 'vspace') => {
    const ids = selectedIds.size > 0 ? selectedIds : selectedId ? new Set([selectedId]) : new Set<string>();
    if (ids.size < 2) return;
    const selNodes = nodes.filter((n) => ids.has(n.id));
    const minX = Math.min(...selNodes.map((n) => n.position.x));
    const maxX = Math.max(...selNodes.map((n) => n.position.x + NODE_WIDTH));
    const minY = Math.min(...selNodes.map((n) => n.position.y));
    const maxY = Math.max(...selNodes.map((n) => n.position.y + APPROX_NODE_H));

    const positions: Record<string, { x: number; y: number }> = {};
    if (mode === 'left') for (const n of selNodes) positions[n.id] = { ...n.position, x: minX };
    else if (mode === 'right') for (const n of selNodes) positions[n.id] = { ...n.position, x: maxX - NODE_WIDTH };
    else if (mode === 'center') for (const n of selNodes) positions[n.id] = { ...n.position, x: minX + (maxX - minX - NODE_WIDTH) / 2 };
    else if (mode === 'top') for (const n of selNodes) positions[n.id] = { ...n.position, y: minY };
    else if (mode === 'bottom') for (const n of selNodes) positions[n.id] = { ...n.position, y: maxY - APPROX_NODE_H };
    else if (mode === 'middle') for (const n of selNodes) positions[n.id] = { ...n.position, y: minY + (maxY - minY - APPROX_NODE_H) / 2 };
    else if (mode === 'hspace') {
      // Distribute horizontally by center-x.
      const sorted = [...selNodes].sort((a, b) => a.position.x - b.position.x);
      const span = maxX - minX;
      const gap = (span - NODE_WIDTH) / (sorted.length - 1);
      let x = minX;
      for (const n of sorted) { positions[n.id] = { ...n.position, x }; x += gap; }
    } else if (mode === 'vspace') {
      const sorted = [...selNodes].sort((a, b) => a.position.y - b.position.y);
      const span = maxY - minY;
      const gap = (span - APPROX_NODE_H) / (sorted.length - 1);
      let y = minY;
      for (const n of sorted) { positions[n.id] = { ...n.position, y }; y += gap; }
    }
    setNodes((prev) => prev.map((n) => positions[n.id] ? { ...n, position: positions[n.id] } : n));
  }, [nodes, selectedIds, selectedId]);

  /* ── Delete all nodes in the multi-selection ─────────────────── */
  const deleteSelected = useCallback(() => {
    setSelectedIds((curr) => {
      if (curr.size === 0) {
        // Fall back to single-selected node.
        if (selectedId) deleteNode(selectedId);
        return curr;
      }
      setNodes((prev) => prev.filter((n) => !curr.has(n.id)));
      setEdges((prev) => prev.filter((e) => !curr.has(e.from) && !curr.has(e.to)));
      if (selectedId && curr.has(selectedId)) setSelectedId(null);
      return new Set();
    });
  }, [selectedId, deleteNode]);

  /* ── Clear pipeline ──────────────────────────────────────────── */
  const clearAll = useCallback(() => {
    setNodes([]);
    setEdges([]);
    setSelectedId(null);
    setSelectedIds(new Set());
  }, []);

  /* ── Load a template (replaces current canvas) ───────────────── */
  const loadTemplateById = useCallback((id: string) => {
    const loaded = loadTemplate(id);
    if (!loaded) return;
    // 去重叠：模板节点若发生重叠则先推开，避免「节点挤在一块看不清」。
    const spread = spreadOverlappingNodes(loaded.nodes);
    const laid = loaded.nodes.map((n) => (spread[n.id] ? { ...n, position: spread[n.id] } : n));
    setNodes(laid);
    setEdges(loaded.edges);
    setSelectedId(null);
    setSelectedIds(new Set());
    // Frame the freshly-loaded graph so it lands in view.
    const next = fitViewFor(laid, canvasSize);
    if (next) setView(next);
    // 模板的 onLoad 声明了加载后应切到的预览标签（如 plot2d 曲线集）。
    const tpl = PIPELINE_TEMPLATES.find((t) => t.id === id);
    if (tpl?.onLoad?.activePreviewTab) {
      setActivePreviewTab(tpl.onLoad.activePreviewTab as PreviewTab);
    }
  }, [canvasSize, setActivePreviewTab]);

  /* ── 首次启动引导的一键示例：消费 store 中暂存的模板 id ─────── */
  useEffect(() => {
    const pending = useWorkbenchStore.getState().pendingPipelineTemplate;
    if (pending) {
      useWorkbenchStore.getState().setPendingPipelineTemplate(null);
      loadTemplateById(pending);
    }
    // 仅在挂载时消费一次（懒加载视图切换后 remount 不再重复加载）。
  }, [loadTemplateById]);

  /* ── Fit view to all nodes ───────────────────────────────────── */
  const fitView = useCallback(() => {
    const next = fitViewFor(nodes, canvasSize);
    if (next) setView(next);
  }, [nodes, canvasSize]);

  /* ── Auto-layout: 一键整理节点，按依赖深度分层排列 ─────────── */
  const autoLayoutNodes = useCallback(() => {
    if (nodes.length === 0) return;
    // 计算每个节点的依赖深度（最长路径层号），用于分层排布。
    const inEdges = new Map<string, string[]>();
    for (const n of nodes) inEdges.set(n.id, []);
    for (const e of edges) inEdges.get(e.to)?.push(e.from);
    const depth = new Map<string, number>();
    const order = nodes.map((n) => n.id);
    // 迭代求解最长依赖层（拓扑排序思想，有限次收敛）。
    for (let iter = 0; iter < nodes.length; iter++) {
      let changed = false;
      for (const id of order) {
        const deps = inEdges.get(id) ?? [];
        const depDepth = deps.length === 0 ? -1 : Math.max(...deps.map((d) => depth.get(d) ?? 0));
        const next = depDepth + 1;
        if ((depth.get(id) ?? 0) !== next) { depth.set(id, next); changed = true; }
      }
      if (!changed) break;
    }
    // 按层分组，层内保持原相对顺序。
    const layers = new Map<number, string[]>();
    for (const id of order) {
      const d = depth.get(id) ?? 0;
      if (!layers.has(d)) layers.set(d, []);
      layers.get(d)!.push(id);
    }
    const sortedLayers = [...layers.keys()].sort((a, b) => a - b);

    // 层内排序：Sugiyama 式 barycenter 交叉数削减。
    // 复杂图中同一列常有大量节点，若仅按原始顺序排布会让连线和节点互相缠绕、看不清。
    // 这里交替「左→右 / 右→左」多趟扫描，把每个节点的横向邻居质心作为其在层内的
    // 排序依据，显著减少边交叉（边更直、更清晰）。
    const layerOrder = new Map<number, string[]>();
    for (const l of sortedLayers) layerOrder.set(l, [...(layers.get(l) ?? [])]);
    const outEdges = new Map<string, string[]>();
    for (const n of nodes) outEdges.set(n.id, []);
    for (const e of edges) outEdges.get(e.from)?.push(e.to);
    const barycenter = (id: string, other: string[]): number => {
      if (other.length === 0) return -1;
      let sum = 0;
      for (const o of other) {
        const l = depth.get(o) ?? 0;
        const idx = (layerOrder.get(l) ?? []).indexOf(o);
        if (idx >= 0) sum += idx;
      }
      return sum / other.length;
    };
    for (let pass = 0; pass < 4; pass++) {
      // 左→右：按入边邻居质心排序
      for (const l of sortedLayers) {
        const ids = layerOrder.get(l)!;
        const keyed = ids.map((id, i) => ({
          id,
          orig: i,
          b: barycenter(id, inEdges.get(id) ?? []),
        }));
        keyed.sort((a, b) => (a.b < 0 ? b.b < 0 ? a.orig - b.orig : 1 : b.b < 0 ? -1 : a.b - b.b || a.orig - b.orig));
        layerOrder.set(l, keyed.map((k) => k.id));
      }
      // 右→左：按出边邻居质心排序（反向）
      for (let i = sortedLayers.length - 1; i >= 0; i--) {
        const l = sortedLayers[i];
        const ids = layerOrder.get(l)!;
        const keyed = ids.map((id, j) => ({
          id,
          orig: j,
          b: barycenter(id, outEdges.get(id) ?? []),
        }));
        keyed.sort((a, b) => (a.b < 0 ? b.b < 0 ? a.orig - b.orig : 1 : b.b < 0 ? -1 : a.b - b.b || a.orig - b.orig));
        layerOrder.set(l, keyed.map((k) => k.id));
      }
    }

    const COL_GAP = 48;
    const ROW_GAP = 56;
    const START_X = 40;
    const START_Y = 60;
    const positions: Record<string, { x: number; y: number }> = {};
    sortedLayers.forEach((layer, col) => {
      const ids = layerOrder.get(layer)!;
      const x = START_X + col * (NODE_WIDTH + COL_GAP);
      // 同层节点垂直居中分布。
      const totalH = ids.length * APPROX_NODE_H + (ids.length - 1) * ROW_GAP;
      let y = START_Y;
      ids.forEach((id, i) => {
        positions[id] = { x, y: y };
        y += APPROX_NODE_H + ROW_GAP;
      });
    });
    // 去重叠兜底：极端情况下（如同层节点过多）仍可能重叠，再推开一次。
    const spread = spreadOverlappingNodes(nodes.map((n) => ({ ...n, position: positions[n.id] ?? n.position })));
    for (const id of Object.keys(positions)) {
      if (spread[id]) positions[id] = spread[id];
    }
    setNodes((prev) => prev.map((n) => positions[n.id] ? { ...n, position: positions[n.id] } : n));
    // 排好后自动居中到视野。
    const next = fitViewFor(nodes.map((n) => ({ ...n, position: positions[n.id] ?? n.position })), canvasSize);
    if (next) setView(next);
  }, [nodes, edges, canvasSize]);

  /* ── Export pipeline → script ────────────────────────────────── */
  const exportScript = useCallback(() => {
    const script = exportPipelineToScript(nodes, edges);
    setEditorContent(script);
    setViewMode('workbench');
  }, [nodes, edges, setEditorContent, setViewMode]);

  /* ── Update a node's config ──────────────────────────────────── */
  const updateConfig = useCallback(
    (id: string, patch: Record<string, unknown>) => {
      setNodes((prev) =>
        prev.map((n) =>
          n.id === id ? { ...n, config: { ...n.config, ...patch } } : n,
        ),
      );
    },
    [],
  );

  /* M1 — AI 调节点参数：接收 configure_node 指令，白名单过滤后写回 config。
     只保留该节点 config 已有的键，避免 AI 引入任意字段；随后靠既有 180ms
     自动重算 debounce 触发 recompute。 */
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ nodeId?: unknown; patch?: unknown }>).detail;
      if (!detail || typeof detail.nodeId !== 'string') return;
      const patchRaw = detail.patch;
      if (!patchRaw || typeof patchRaw !== 'object' || Array.isArray(patchRaw)) return;
      const node = nodes.find((n) => n.id === detail.nodeId);
      if (!node) return;
      const patch: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(patchRaw as Record<string, unknown>)) {
        if (!(k in node.config)) continue; // 白名单：仅允许已存在的键
        if (typeof v === 'number' && Number.isFinite(v)) patch[k] = v;
        else if (typeof v === 'string' || typeof v === 'boolean') patch[k] = v;
      }
      if (Object.keys(patch).length === 0) return;
      updateConfig(detail.nodeId, patch);
    };
    window.addEventListener('omnimath:node-config', handler);
    return () => window.removeEventListener('omnimath:node-config', handler);
  }, [nodes, updateConfig]);

  /* M4 — AI 整图搭建：接收 build_pipeline 指令，创建节点 + 连线 + 居中 + 触发重算。
     指令格式 { nodes: [{type, config?}], edges?: [{from,to}], clearExisting? }。
     节点 config 按该类型 defaultConfig 白名单合并；边优先用序号，缺省自动首尾相连。 */
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ nodes?: unknown[]; edges?: unknown[]; clearExisting?: boolean }>).detail;
      if (!detail || !Array.isArray(detail.nodes) || detail.nodes.length === 0) return;

      // 1) 建节点：白名单合并 config；无效 type 跳过。
      const created: PipelineNode[] = [];
      for (const raw of detail.nodes) {
        if (!raw || typeof raw !== 'object') continue;
        const o = raw as Record<string, unknown>;
        const type = typeof o.type === 'string' ? o.type : '';
        const def = NODE_TYPES[type];
        if (!def) continue;
        const node = createNode(type, 0, 0);
        const cfg = o.config;
        if (cfg && typeof cfg === 'object' && !Array.isArray(cfg)) {
          const patch: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(cfg as Record<string, unknown>)) {
            if (!(k in def.defaultConfig)) continue; // 白名单：只写该类型已有字段
            if (typeof v === 'number' && Number.isFinite(v)) patch[k] = v;
            else if (typeof v === 'string' || typeof v === 'boolean') patch[k] = v;
          }
          node.config = { ...def.defaultConfig, ...patch };
        }
        created.push(node);
      }
      if (created.length === 0) return;

      // 2) 连线：优先用 edges（序号），否则按 nodes 顺序自动首尾相连（找兼容端口）。
      const newEdges: PipelineEdge[] = [];
      const tryConnect = (fromIdx: number, toIdx: number) => {
        if (fromIdx < 0 || fromIdx >= created.length || toIdx < 0 || toIdx >= created.length || fromIdx === toIdx) return;
        const fromDef = NODE_TYPES[created[fromIdx].type];
        const toDef = NODE_TYPES[created[toIdx].type];
        if (!fromDef || !toDef) return;
        for (const out of fromDef.outputs) {
          for (const inp of toDef.inputs) {
            if (canConnect(out.type, inp.type)) {
              newEdges.push({
                id: makeEdgeId(),
                from: created[fromIdx].id,
                fromPort: out.id,
                to: created[toIdx].id,
                toPort: inp.id,
              });
              return;
            }
          }
        }
      };
      if (Array.isArray(detail.edges) && detail.edges.length > 0) {
        for (const e of detail.edges) {
          if (!e || typeof e !== 'object') continue;
          const o = e as Record<string, unknown>;
          const f = typeof o.from === 'number' ? Math.round(o.from) : NaN;
          const t = typeof o.to === 'number' ? Math.round(o.to) : NaN;
          if (Number.isFinite(f) && Number.isFinite(t)) tryConnect(f, t);
        }
      } else {
        for (let i = 0; i < created.length - 1; i++) tryConnect(i, i + 1);
      }

      // 3) 位置：先横向错开铺开，再推开重叠，最后 fit view 居中。
      let laid: PipelineNode[] = created.map((n, i) => ({
        ...n,
        position: { x: 60 + (i % 6) * (NODE_WIDTH + 44), y: 80 + Math.floor(i / 6) * 230 },
      }));
      const spread = spreadOverlappingNodes(laid);
      laid = laid.map((n) => (spread[n.id] ? { ...n, position: spread[n.id] } : n));

      if (detail.clearExisting !== false) {
        setNodes(laid);
        setEdges(newEdges);
      } else {
        setNodes((prev) => [...prev, ...laid]);
        setEdges((prev) => [...prev, ...newEdges]);
      }
      setSelectedId(null);
      setSelectedIds(new Set());
      const next = fitViewFor(laid, canvasSize);
      if (next) setView(next);
    };
    window.addEventListener('omnimath:pipeline-build', handler);
    return () => window.removeEventListener('omnimath:pipeline-build', handler);
  }, [canvasSize]);

  /* M1 — 把蓝图节点图摘要同步到 AI 读取上下文 store（只读镜像）。 */
  useEffect(() => {
    useAIContextStore.getState().setPipeline({
      nodes: nodes.map((n) => ({ id: n.id, type: n.type, config: n.config })).slice(0, 40),
      edgeCount: edges.length,
    });
  }, [nodes, edges]);

  /* 节点静音切换：翻转 muted 位，auto-execute 会自动重新计算。 */
  const toggleMute = useCallback((id: string) => {
    setNodes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, muted: !n.muted } : n)),
    );
  }, []);

  /* 小地图：把世界坐标居中到画布中心（保持当前缩放）。 */
  const centerOnWorld = useCallback((world: { x: number; y: number }) => {
    setView((v) => ({
      ...v,
      x: canvasSize.w / 2 - world.x * v.scale,
      y: canvasSize.h / 2 - world.y * v.scale,
    }));
  }, [canvasSize]);

  /* 分组（Blender Group Frame）：把当前选中的节点归入一个新 Frame。 */
  const createGroupFromSelection = useCallback(() => {
    const ids = selectedIds.size > 0 ? selectedIds : selectedId ? new Set([selectedId]) : new Set<string>();
    if (ids.size === 0) return;
    const gid = `grp-${Date.now()}`;
    const title = window.prompt('分组名称', 'Group');
    const finalTitle = title != null && title.trim() ? title.trim() : 'Group';
    setNodes((prev) =>
      prev.map((n) => (ids.has(n.id) ? { ...n, group: { id: gid, title: finalTitle } } : n)),
    );
  }, [selectedIds, selectedId]);

  /* 取消分组：移除选中节点的 group 归属。 */
  const ungroupSelection = useCallback(() => {
    const ids = selectedIds.size > 0 ? selectedIds : selectedId ? new Set([selectedId]) : new Set<string>();
    if (ids.size === 0) return;
    setNodes((prev) =>
      prev.map((n) => {
        if (!ids.has(n.id)) return n;
        const { group: _g, ...rest } = n;
        return rest;
      }),
    );
  }, [selectedIds, selectedId]);

  /* 重命名分组：同步到所有同组节点。 */
  const renameGroup = useCallback((groupId: string, title: string) => {
    setNodes((prev) =>
      prev.map((n) => (n.group && n.group.id === groupId ? { ...n, group: { id: groupId, title } } : n)),
    );
  }, []);

  /* ── Connection drag handlers ────────────────────────────────── */
  const startConnection = useCallback(
    (nodeId: string, portId: string, e: React.PointerEvent) => {
      e.stopPropagation();
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return;
      const pos = getPortPosition(node, portId, true, contentPortPositionsRef.current);
      if (!pos) return;
      setConnecting({ fromNode: nodeId, fromPort: portId, cursor: pos });
    },
    [nodes],
  );

  const completeConnection = useCallback(
    (toNode: string, toPort: string, toType: PortDataType) => {
      if (!connecting) return;
      const fromNode = nodes.find((n) => n.id === connecting.fromNode);
      if (!fromNode) return;
      const fromDef = NODE_TYPES[fromNode.type];
      const fromPortDef = fromDef.outputs.find((p) => p.id === connecting.fromPort);
      if (!fromPortDef) return;
      if (!canConnect(fromPortDef.type, toType)) return;
      // Don't allow self-edges or duplicate edges into the same port.
      if (toNode === connecting.fromNode) return;
      // P4: 环预防 — 若添加 fromNode→toNode 后存在回路（toNode 能沿现有
      // 边回到 fromNode），则拒绝连接。否则环会让 Kahn 拓扑排序把整条
      // 链路上的节点都标成 'Cycle detected'，用户得删边才能恢复。
      if (wouldCreateCycle(edges, connecting.fromNode, toNode)) {
        toast.warning('该连接会形成回路，已阻止', {
          description: '蓝图不支持循环依赖，请调整连接方向',
          duration: 3000,
        });
        setConnecting(null);
        return;
      }
      setEdges((prev) => {
        const filtered = prev.filter((e) => !(e.to === toNode && e.toPort === toPort));
        return [
          ...filtered,
          {
            id: makeEdgeId(),
            from: connecting.fromNode,
            fromPort: connecting.fromPort,
            to: toNode,
            toPort,
          },
        ];
      });
      setConnecting(null);
    },
    [connecting, nodes, edges],
  );

  /* ── Node drag (pointer events) ──────────────────────────────── */
  const startNodeDrag = useCallback(
    (e: React.PointerEvent, nodeId: string) => {
      e.stopPropagation();
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return;
      const startX = e.clientX;
      const startY = e.clientY;
      const nodeX = node.position.x;
      const nodeY = node.position.y;
      dragRef.current = { nodeId, startX, startY, nodeX, nodeY };
      // Multi-select aware selection (Ctrl/Cmd/Shift modifiers honoured).
      selectNode(nodeId, e);
      document.body.classList.add('dragging');

      const onMove = (ev: PointerEvent) => {
        const d = dragRef.current;
        if (!d) return;
        const scale = viewRef.current.scale;
        const dx = (ev.clientX - d.startX) / scale;
        const dy = (ev.clientY - d.startY) / scale;
        setNodes((prev) =>
          prev.map((n) =>
            n.id === d.nodeId ? { ...n, position: { x: d.nodeX + dx, y: d.nodeY + dy } } : n,
          ),
        );
      };
      const onUp = () => {
        dragRef.current = null;
        document.body.classList.remove('dragging');
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [nodes, selectNode],
  );

  /* ── Shared canvas pan helper ────────────────────────────────── */
  const startCanvasPan = useCallback((clientX: number, clientY: number) => {
    const v = viewRef.current;
    panRef.current = {
      startX: clientX,
      startY: clientY,
      viewX: v.x,
      viewY: v.y,
    };
    document.body.classList.add('dragging');

    const onMove = (ev: PointerEvent) => {
      const p = panRef.current;
      if (!p) return;
      setView((vv) => ({
        ...vv,
        x: p.viewX + (ev.clientX - p.startX),
        y: p.viewY + (ev.clientY - p.startY),
      }));
    };
    const onUp = () => {
      panRef.current = null;
      document.body.classList.remove('dragging');
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, []);

  /* ── Canvas pan (pointer on background) ──────────────────────── */
  const onCanvasPointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Only handle clicks on the background (not a node/port).
      if (e.target !== e.currentTarget) return;

      // ── 平移：仅中键拖拽。右键交给 onContextMenu 打开「添加节点」菜单 ──
      // Blender 式：左键框选、右键添加节点、中键平移。
      if (e.button === 1) {
        e.preventDefault();
        startCanvasPan(e.clientX, e.clientY);
        return;
      }

      // ── 左键：框选（marquee），无需 Shift ──────────────────────
      // 空白处左键拖拽即框选（始终追加/累加，符合 Figma/Blender/ComfyUI 习惯）。
      if (e.button === 0 && !connecting) {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        const v = viewRef.current;
        const wx = (e.clientX - rect.left - v.x) / v.scale;
        const wy = (e.clientY - rect.top - v.y) / v.scale;
        setMarquee({ start: { x: wx, y: wy }, current: { x: wx, y: wy } });
        document.body.classList.add('dragging');

        const onMove = (ev: PointerEvent) => {
          const r = canvasRef.current?.getBoundingClientRect();
          if (!r) return;
          const vv = viewRef.current;
          const cx = (ev.clientX - r.left - vv.x) / vv.scale;
          const cy = (ev.clientY - r.top - vv.y) / vv.scale;
          setMarquee((m) => (m ? { ...m, current: { x: cx, y: cy } } : m));
        };
        const onUp = () => {
          document.body.classList.remove('dragging');
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
          const m = marqueeRef.current;
          if (m) {
            const rect = normalizeRect(m.start, m.current);
            const isRealDrag = Math.abs(rect.x2 - rect.x1) > 3 || Math.abs(rect.y2 - rect.y1) > 3;
            if (isRealDrag) {
              // 框选：累加选中（Shift 保持追加；否则替换为框内节点）。
              const hit = selectNodesInBox(nodesRef.current, m.start, m.current);
              setSelectedIds((prev) => {
                const next = new Set(e.shiftKey ? prev : []);
                for (const id of hit) next.add(id);
                return next;
              });
            } else {
              // 纯点击（非拖拽）：取消多选。
              if (!e.shiftKey) {
                setSelectedId(null);
                setSelectedIds(new Set());
                setSelectedEdgeId(null);
              }
            }
          }
          setMarquee(null);
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        return;
      }

      // ── 其余情况（如正在连线时的左键）：取消连线并清空选中 ──────
      setSelectedId(null);
      setSelectedIds(new Set());
      setSelectedEdgeId(null);
      if (connecting) {
        setConnecting(null);
        return;
      }
    },
    [connecting],
  );

  /* ── Wheel zoom + touchpad two-finger pan ────────────────────── */
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      // 若滚轮落在节点内容区内（图片预览 / 配置面板 / 输入框等），交由内部
      // 原生滚动或该元素自身处理，避免「在节点窗口里放大/滚动时，整个蓝图也
      // 跟着缩放/平移」的冲突。node-card 之外的空白画布仍走蓝图缩放/平移。
      const t = e.target as HTMLElement | null;
      if (t && (t.closest('.node-card') || t.closest('.run-results-host') || t.closest('input, textarea, select'))) {
        return;
      }
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;

      // 触控板捏合（ctrlKey）→ 缩放；触摸板/鼠标都支持。
      if (e.ctrlKey) {
        setView((v) => {
          const delta = -e.deltaY * 0.0015;
          const next = Math.min(2, Math.max(0.4, v.scale * (1 + delta)));
          const wx = (cx - v.x) / v.scale;
          const wy = (cy - v.y) / v.scale;
          return { scale: next, x: cx - wx * next, y: cy - wy * next };
        });
        return;
      }

      // 区分「物理鼠标滚轮」与「触控板双指滚动」：
      //   - 鼠标滚轮：line 模式（Firefox）或 大而"顿"的 delta（Chrome/Edge，通常 ≥40/格）→ 缩放
      //   - 触控板双指：pixel 模式 + 平滑小 delta（通常 1–30/帧）→ 平移（Blender 式）
      const smoothPan = e.deltaMode === 0 && Math.abs(e.deltaY) < 40 && !e.shiftKey;

      if (smoothPan) {
        // 触控板双指：平移（跟随双指方向）
        const panFactor = 1;
        setView((v) => ({ ...v, x: v.x - e.deltaX * panFactor, y: v.y - e.deltaY * panFactor }));
        return;
      }

      // 鼠标滚轮（或 Shift+wheel）：缩放
      if (e.shiftKey) {
        const panSpeed = 1.2;
        setView((v) => ({ ...v, y: v.y - e.deltaY * panSpeed }));
        return;
      }
      const delta = -e.deltaY * 0.0015;
      setView((v) => {
        const next = Math.min(2, Math.max(0.4, v.scale * (1 + delta)));
        const wx = (cx - v.x) / v.scale;
        const wy = (cy - v.y) / v.scale;
        return { scale: next, x: cx - wx * next, y: cy - wy * next };
      });
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  /* ── All input port positions (for connection snapping) ──────── */
  const allInputPorts = useMemo(() => {
    if (!connecting) return [];
    const ports: Array<{ nodeId: string; portId: string; x: number; y: number; type: PortDataType }> = [];
    for (const n of nodes) {
      if (n.id === connecting.fromNode) continue;
      const def = NODE_TYPES[n.type];
      for (const port of def.inputs) {
        const pos = getPortPosition(n, port.id, false, contentPortPositions);
        if (pos) ports.push({ nodeId: n.id, portId: port.id, x: pos.x, y: pos.y, type: port.type });
      }
    }
    return ports;
  }, [nodes, connecting, contentPortPositions]);

  const allInputPortsRef = useRef(allInputPorts);
  useEffect(() => { allInputPortsRef.current = allInputPorts; }, [allInputPorts]);

  const completeConnectionRef = useRef(completeConnection);
  useEffect(() => { completeConnectionRef.current = completeConnection; }, [completeConnection]);

  /* ── Connecting: follow cursor + snap to nearby input ports ──── */
  useEffect(() => {
    if (!connecting) return;
    const SNAP_DIST = 20; // local-space px — snaps when cursor within this.
    const moveHandler = (e: PointerEvent) => {
      const local = screenToLocal(e.clientX, e.clientY);
      let nearest: { nodeId: string; portId: string; x: number; y: number; type: PortDataType } | null = null;
      let minDist = SNAP_DIST;
      for (const p of allInputPortsRef.current) {
        const d = Math.hypot(p.x - local.x, p.y - local.y);
        if (d < minDist) {
          minDist = d;
          nearest = p;
        }
      }
      if (nearest) {
        setSnapTarget({ nodeId: nearest.nodeId, portId: nearest.portId });
        snapTargetRef.current = nearest;
        const snap = nearest;
        setConnecting((c) => (c ? { ...c, cursor: { x: snap.x, y: snap.y } } : null));
      } else {
        setSnapTarget(null);
        snapTargetRef.current = null;
        setConnecting((c) => (c ? { ...c, cursor: local } : null));
      }
    };
    // If the user releases over a snapped port, complete the connection
    // there; otherwise cancel. (Releasing directly on a port element
    // calls completeConnection first via the port's onPointerUp, which
    // clears connecting synchronously — this no-ops in that case.)
    const upHandler = () => {
      const snap = snapTargetRef.current;
      if (snap) {
        completeConnectionRef.current(snap.nodeId, snap.portId, snap.type);
      } else {
        setConnecting(null);
      }
      setSnapTarget(null);
      snapTargetRef.current = null;
    };
    window.addEventListener('pointermove', moveHandler);
    window.addEventListener('pointerup', upHandler);
    return () => {
      window.removeEventListener('pointermove', moveHandler);
      window.removeEventListener('pointerup', upHandler);
    };
  }, [connecting, screenToLocal]);

  /* ── Clear snap highlight whenever a connection ends ─────────── */
  useEffect(() => {
    if (!connecting) {
      setSnapTarget(null);
      snapTargetRef.current = null;
    }
  }, [connecting]);

  /* ── P1-4: 边重连（拖柄 → 端口吸附 → 更新边端点）────────────── */
  const startReconnect = useCallback(
    (edgeId: string, end: 'from' | 'to') => {
      const edge = edges.find((e) => e.id === edgeId);
      const from = nodes.find((n) => n.id === edge?.from);
      const to = nodes.find((n) => n.id === edge?.to);
      if (!edge || !from || !to) return;
      // 起始拖柄位置 = 被拖动端当前端口位置（局部坐标）。
      const pos =
        end === 'from'
          ? getPortPosition(from, edge.fromPort, true, contentPortPositionsRef.current)
          : getPortPosition(to, edge.toPort, false, contentPortPositionsRef.current);
      if (!pos) return;
      setSelectedEdgeId(edgeId);
      setReconnect({ edgeId, end, cursor: pos });
    },
    [edges, nodes],
  );

  // 重连拖拽：跟随光标 + 吸附到「另一端类型兼容」的端口，松开更新边。
  useEffect(() => {
    if (!reconnect) return;
    const SNAP_DIST = 20;
    const edge = edges.find((e) => e.id === reconnect.edgeId);
    const fromNode = nodes.find((n) => n.id === edge?.from);
    const toNode = nodes.find((n) => n.id === edge?.to);
    if (!edge || !fromNode || !toNode) {
      setReconnect(null);
      return;
    }
    const fromDef = NODE_TYPES[fromNode.type];
    const toDef = NODE_TYPES[toNode.type];
    const fromPort = fromDef.outputs.find((p) => p.id === edge.fromPort);
    const toPort = toDef.inputs.find((p) => p.id === edge.toPort);
    if (!fromPort || !toPort) {
      setReconnect(null);
      return;
    }

    // 固定端位置 + 需匹配的端口类型。
    //   - 重连源端('from')：固定目标端，需找兼容其输入类型的输出端口。
    //   - 重连目标端('to')：固定源端，需找兼容其输出类型的输入端口。
    const fixedPos =
      reconnect.end === 'from'
        ? getPortPosition(toNode, edge.toPort, false, contentPortPositionsRef.current)
        : getPortPosition(fromNode, edge.fromPort, true, contentPortPositionsRef.current);
    const fixedType = reconnect.end === 'from' ? toPort.type : fromPort.type;
    if (!fixedPos) {
      setReconnect(null);
      return;
    }

    // 候选端口：源端→扫描输出端口；目标端→扫描输入端口。
    const candidates: Array<{ nodeId: string; portId: string; x: number; y: number; type: PortDataType }> = [];
    for (const n of nodes) {
      const def = NODE_TYPES[n.type];
      const ports = reconnect.end === 'from' ? def.outputs : def.inputs;
      for (const port of ports) {
        if (!canConnect(port.type, fixedType)) continue;
        const pos = getPortPosition(n, port.id, reconnect.end === 'from', contentPortPositionsRef.current);
        if (pos) candidates.push({ nodeId: n.id, portId: port.id, x: pos.x, y: pos.y, type: port.type });
      }
    }

    const moveHandler = (e: PointerEvent) => {
      const local = screenToLocal(e.clientX, e.clientY);
      let nearest: { nodeId: string; portId: string; x: number; y: number; type: PortDataType } | null = null;
      let minDist = SNAP_DIST;
      for (const p of candidates) {
        const d = Math.hypot(p.x - local.x, p.y - local.y);
        if (d < minDist) {
          minDist = d;
          nearest = p;
        }
      }
      if (nearest) {
        setSnapTarget({ nodeId: nearest.nodeId, portId: nearest.portId });
        setReconnect((r) => (r ? { ...r, cursor: { x: nearest!.x, y: nearest!.y } } : null));
      } else {
        setSnapTarget(null);
        setReconnect((r) => (r ? { ...r, cursor: local } : null));
      }
    };

    const upHandler = () => {
      const snap = snapTargetRef.current;
      if (snap) {
        const candidate = candidates.find((c) => c.nodeId === snap.nodeId && c.portId === snap.portId);
        if (candidate) {
          // 环预防：新连接不得形成回路。
          const newFrom = reconnect.end === 'from' ? snap.nodeId : edge.from;
          const newTo = reconnect.end === 'to' ? snap.nodeId : edge.to;
          if (newFrom !== newTo && !wouldCreateCycle(edges.filter((ed) => ed.id !== edge.id), newFrom, newTo)) {
            setEdges((prev) =>
              prev.map((ed) =>
                ed.id === edge.id
                  ? reconnect.end === 'from'
                    ? { ...ed, from: snap.nodeId, fromPort: snap.portId }
                    : { ...ed, to: snap.nodeId, toPort: snap.portId }
                  : ed,
              ),
            );
          }
        }
      }
      setSnapTarget(null);
      snapTargetRef.current = null;
      setReconnect(null);
    };

    window.addEventListener('pointermove', moveHandler);
    window.addEventListener('pointerup', upHandler);
    return () => {
      window.removeEventListener('pointermove', moveHandler);
      window.removeEventListener('pointerup', upHandler);
    };
  }, [reconnect, edges, nodes, screenToLocal]);

  /* ── Keyboard: Delete to remove selected ─────────────────────── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't interfere with inputs.
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        // P6: 优先删除选中的边，其次删除选中的节点。
        if (selectedEdgeId) {
          e.preventDefault();
          setEdges((prev) => prev.filter((ed) => ed.id !== selectedEdgeId));
          setSelectedEdgeId(null);
        } else if (selectedIds.size > 0) {
          e.preventDefault();
          deleteSelected();
        } else if (selectedId) {
          e.preventDefault();
          deleteNode(selectedId);
        }
      }
      if (e.key === 'Escape') {
        setSelectedId(null);
        setSelectedIds(new Set());
        setSelectedEdgeId(null);
        setConnecting(null);
        setReconnect(null);
        setSnapTarget(null);
        setPaletteOpen(false);
      }
      // Tab / Shift+Tab 在节点间循环导航
      if (e.key === 'Tab' && nodes.length > 0) {
        e.preventDefault();
        const dir = e.shiftKey ? -1 : 1;
        const currentIdx = selectedId
          ? nodes.findIndex((n) => n.id === selectedId)
          : -1;
        const nextIdx =
          currentIdx === -1 ? 0 : (currentIdx + dir + nodes.length) % nodes.length;
        const nextNode = nodes[nextIdx];
        setSelectedId(nextNode.id);
        setSelectedIds(new Set([nextNode.id]));
        lastSelectedId.current = nextNode.id;
        ensureNodeVisible(nextNode);
      }
      // Arrow keys pan the canvas (up/down/left/right view control).
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        const step = e.shiftKey ? 40 : 12;
        setView((v) => {
          switch (e.key) {
            case 'ArrowUp': return { ...v, y: v.y + step };
            case 'ArrowDown': return { ...v, y: v.y - step };
            case 'ArrowLeft': return { ...v, x: v.x + step };
            case 'ArrowRight': return { ...v, x: v.x - step };
          }
          return v;
        });
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedId, selectedIds, selectedEdgeId, nodes, deleteNode, deleteSelected, ensureNodeVisible, setView, setEdges]);

  /* ── Double-click canvas → open palette at cursor ────────────── */
  const onCanvasDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPalettePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      setPaletteOpen(true);
    },
    [],
  );

  /* ── Right-click canvas → open palette at cursor (ComfyUI-style) */
  const onCanvasContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPalettePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      setPaletteOpen(true);
    },
    [],
  );

  /* ── Derived: edge paths ─────────────────────────────────────── */
  const nodeById = useMemo(() => {
    const m = new Map<string, PipelineNode>();
    for (const n of nodes) m.set(n.id, n);
    return m;
  }, [nodes]);

  // P2: 正在拖线源的端口数据类型。用于拖动时输入端口兼容高亮。
  const connectingFromType = useMemo<PortDataType | null>(() => {
    if (!connecting) return null;
    const from = nodeById.get(connecting.fromNode);
    if (!from) return null;
    const def = NODE_TYPES[from.type];
    const port = def?.outputs.find((p) => p.id === connecting.fromPort);
    return port?.type ?? null;
  }, [connecting, nodeById]);

  const edgePaths = useMemo(() => {
    return edges
      .map((e) => {
        const from = nodeById.get(e.from);
        const to = nodeById.get(e.to);
        if (!from || !to) return null;
        const p1 = getPortPosition(from, e.fromPort, true, contentPortPositions);
        const p2 = getPortPosition(to, e.toPort, false, contentPortPositions);
        if (!p1 || !p2) return null;
        // 边随源端口数据类型着色（类 Unreal Blueprint）。
        const fromDef = NODE_TYPES[from.type];
        const fromPort = fromDef?.outputs.find((p) => p.id === e.fromPort);
        const color = fromPort ? PORT_TYPE_STYLE[fromPort.type]?.border : undefined;
        return { edge: e, from: p1, to: p2, color };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [edges, nodeById, contentPortPositions]);

  const pendingPath = useMemo(() => {
    // 新建连线：从源端口 → 光标
    if (connecting) {
      const from = nodeById.get(connecting.fromNode);
      if (!from) return null;
      const p1 = getPortPosition(from, connecting.fromPort, true, contentPortPositions);
      if (!p1) return null;
      return { from: p1, to: connecting.cursor };
    }
    // P1-4 重连：固定端（另一端）→ 光标
    if (reconnect) {
      const edge = edges.find((e) => e.id === reconnect.edgeId);
      if (!edge) return null;
      const fixedNode = nodeById.get(reconnect.end === 'from' ? edge.to : edge.from);
      if (!fixedNode) return null;
      const fixedPort = reconnect.end === 'from' ? edge.toPort : edge.fromPort;
      // 重连源端→固定目标输入端口；重连目标端→固定源输出端口。
      const fixed = getPortPosition(fixedNode, fixedPort, reconnect.end === 'to', contentPortPositions);
      if (!fixed) return null;
      return { from: fixed, to: reconnect.cursor };
    }
    return null;
  }, [connecting, reconnect, edges, nodeById, contentPortPositions]);

  /* ── Render ──────────────────────────────────────────────────── */
  return (
    <div className="flex flex-col h-full w-full bg-background">
      <PipelineToolbar
        onBack={() => setViewMode('workbench')}
        onRun={runPipeline}
        onStop={stopPipeline}
        onRunToSelected={runToSelected}
        onToggleDiagnostics={() => setDiagnosticsOpen((v) => !v)}
        onClear={clearAll}
        onExport={exportScript}
        onZoomIn={() => setView((v) => ({ ...v, scale: Math.min(2, v.scale * 1.2) }))}
        onZoomOut={() => setView((v) => ({ ...v, scale: Math.max(0.4, v.scale / 1.2) }))}
        onResetView={() => setView({ x: 40, y: 40, scale: 1 })}
        onCenter={fitView}
        onAddNode={() => { setPalettePos(null); setPaletteOpen(true); }}
        onDeleteSelected={deleteSelected}
        onOpenSimConfig={() => setSimConfigOpen(true)}
        onLoadTemplate={loadTemplateById}
        onAutoLayout={autoLayoutNodes}
        nodeCount={nodes.length}
        edgeCount={edges.length}
        selectedCount={selectedIds.size}
        errorCount={errorNodes.length}
        diagnosticsOpen={diagnosticsOpen}
        running={pipelineRunning}
        onGroup={createGroupFromSelection}
        onUngroup={ungroupSelection}
      />

      <div
        ref={canvasRef}
        className="relative flex-1 min-h-0 overflow-hidden pipeline-canvas"
        onPointerDown={onCanvasPointerDown}
        onDoubleClick={onCanvasDoubleClick}
        onContextMenu={onCanvasContextMenu}
      >
        {/* 独立运行结果面板（MATLAB figure 风格浮窗，多开/拖拽/缩放） */}
        <RunResultsHost />

        {/* P2-5: 流水线运行中浮层 + 逐节点进度 */}
        <AnimatePresence>
          {pipelineRunning && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center"
            >
              <div className="flex flex-col items-center gap-3 rounded-xl border border-border/60 bg-background/85 px-6 py-5 shadow-2xl backdrop-blur-md">
                <Loader2 className="size-6 animate-spin text-primary" />
                <div className="flex flex-col items-center gap-1">
                  <span className="text-[12.5px] font-medium text-foreground">
                    流水线运行中…
                  </span>
                  {nodeProgress ? (
                    <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                      {nodeProgress.label ?? `${Math.round(nodeProgress.fraction * 100)}%`}
                    </span>
                  ) : runProgress && runProgress.total > 0 ? (
                    <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                      {runProgress.done} / {runProgress.total} 节点
                    </span>
                  ) : null}
                </div>
                <div className="h-1.5 w-52 overflow-hidden rounded-full bg-muted">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-primary to-primary/70"
                    initial={{ width: 0 }}
                    animate={{
                      width: nodeProgress
                        ? `${Math.round(nodeProgress.fraction * 100)}%`
                        : runProgress && runProgress.total > 0
                          ? `${Math.round((runProgress.done / runProgress.total) * 100)}%`
                          : '30%',
                    }}
                    transition={{ ease: 'easeOut', duration: 0.2 }}
                  />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Transform layer — holds SVG edge layer + nodes */}
        <div
          className="absolute top-0 left-0"
          style={{
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
            transformOrigin: '0 0',
            width: 1,
            height: 1,
          }}
        >
          {/* Edge layer (memoized — see EdgeRenderer.tsx) */}
          <EdgeRenderer
            edges={edgePaths}
            pendingPath={pendingPath}
            selectedNodeId={selectedId}
            selectedEdgeId={selectedEdgeId}
            viewScale={view.scale}
            marquee={marquee}
            onDeleteEdge={(id) => {
              setEdges((prev) => prev.filter((e) => e.id !== id));
              setSelectedEdgeId(null);
            }}
            onSelectEdge={(id) => setSelectedEdgeId(id)}
            reconnectEdgeId={reconnect?.edgeId ?? null}
            onStartReconnect={startReconnect}
          />

          {/* 分组 Frame 叠加层（虚线框 + 标题，位于节点下方） */}
          <svg
            className="absolute top-0 left-0"
            style={{ zIndex: 1, overflow: 'visible' }}
            width="1"
            height="1"
          >
            <GroupFrameLayer nodes={nodes} onRename={renameGroup} />
          </svg>

          {/* Nodes */}
          <div className="absolute top-0 left-0" style={{ zIndex: 2 }}>
            <AnimatePresence>
              {nodes.map((node) => (
                <NodeCard
                  key={node.id}
                  node={node}
                  selected={selectedId === node.id}
                  multiSelected={selectedIds.has(node.id)}
                  computeTick={computeTick}
                  isConnecting={!!connecting}
                  connectingFromType={connectingFromType}
                  inErrorChain={errorChain.has(node.id)}
                  snapPortId={snapTarget?.nodeId === node.id ? snapTarget.portId : null}
                  onPointerDownHeader={(e) => startNodeDrag(e, node.id)}
                  onDelete={() => deleteNode(node.id)}
                  onToggleMute={() => toggleMute(node.id)}
                  onSelect={(e) => selectNode(node.id, e)}
                  onConfigChange={(patch) => updateConfig(node.id, patch)}
                  onStartConnection={(portId, e) => startConnection(node.id, portId, e)}
                  onCompleteConnection={(portId, type) => completeConnection(node.id, portId, type)}
                  variables={Object.keys(variables)}
                  measureScale={view.scale}
                  onPlotOpen={() => {
                    // 打开独立运行结果面板（与 2D 绘图彻底解耦）：
                    // 把该节点的曲线/绘图输出送入 runResults store 浮窗，
                    // 不再写入 2D 绘图 store，也不强制切到 plot2d tab。
                    pushRunResults([node], edges);
                  }}
                />
              ))}
            </AnimatePresence>
          </div>
        </div>

        {/* Empty state */}
        {nodes.length === 0 && (
          <EmptyState onAdd={() => { setPalettePos(null); setPaletteOpen(true); }} />
        )}

        {/* Palette */}
        <AnimatePresence>
          {paletteOpen && (
            <NodePalette
              position={palettePos}
              canvasSize={canvasSize}
              onClose={() => { setPaletteOpen(false); setPalettePos(null); }}
              onPick={(type) => {
                if (palettePos) {
                  const rect = canvasRef.current?.getBoundingClientRect();
                  if (rect) {
                    const local = screenToLocal(palettePos.x + rect.left, palettePos.y + rect.top);
                    addNode(type, local);
                    return;
                  }
                }
                addNode(type);
              }}
            />
          )}
        </AnimatePresence>

        {/* Simulink 仿真配置弹窗 */}
        {simConfigOpen && (
          <div
            className="absolute inset-0 z-30 flex items-center justify-center bg-black/40 backdrop-blur-sm"
            onPointerDown={(e) => { e.stopPropagation(); setSimConfigOpen(false); }}
          >
            <div
              className="w-80 glass-strong border border-border rounded-xl shadow-2xl p-4 space-y-3"
              onPointerDown={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-semibold flex items-center gap-1.5">
                  <Settings className="size-3.5 text-primary" /> 仿真求解器配置
                </span>
                <button
                  type="button"
                  onClick={() => setSimConfigOpen(false)}
                  className="size-5 grid place-items-center rounded text-muted-foreground hover:text-foreground hover:bg-accent"
                >
                  <X className="size-3" />
                </button>
              </div>
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[10px] text-muted-foreground/80 uppercase tracking-wider">起始 t0</label>
                    <Input type="number" className="h-7 text-[12px] font-mono" value={String(simConfig.t0 ?? 0)}
                      onChange={(e) => setSimConfig((c) => ({ ...c, t0: Number(e.target.value) }))} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-muted-foreground/80 uppercase tracking-wider">结束 tEnd</label>
                    <Input type="number" className="h-7 text-[12px] font-mono" value={String(simConfig.tEnd ?? 10)}
                      onChange={(e) => setSimConfig((c) => ({ ...c, tEnd: Number(e.target.value) }))} />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-muted-foreground/80 uppercase tracking-wider">步长 dt</label>
                  <Input type="number" step={0.01} className="h-7 text-[12px] font-mono" value={String(simConfig.dt ?? 0.05)}
                    onChange={(e) => setSimConfig((c) => ({ ...c, dt: Number(e.target.value) }))} />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-muted-foreground/80 uppercase tracking-wider">求解方法</label>
                  <Select
                    value={simConfig.method}
                    onValueChange={(v) => setSimConfig((c) => ({ ...c, method: v as 'euler' | 'rk4' | 'rkf45' }))}>
                    <SelectTrigger className="h-7 text-[12px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="euler">Euler（ode1）</SelectItem>
                      <SelectItem value="rk4">RK4（ode4，更精确）</SelectItem>
                      <SelectItem value="rkf45">RKF45（ode45，自适应）</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" size="sm" className="h-7 text-[12px]" onClick={() => setSimConfigOpen(false)}>
                  关闭
                </Button>
                <Button size="sm" className="h-7 text-[12px]" onClick={() => { setSimConfigOpen(false); runPipeline(); }}>
                  <Play className="size-3 mr-1" /> 运行仿真
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* P3 诊断面板：列出出错节点 + 错误传播链 */}
        {diagnosticsOpen && (
          <div
            className="absolute top-3 right-3 z-30 w-80 max-h-[70%] glass-strong border border-border rounded-xl shadow-2xl flex flex-col pointer-events-auto"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-3 h-9 border-b border-border/60 shrink-0">
              <span className="text-[12px] font-semibold flex items-center gap-1.5">
                <Bug className="size-3.5 text-destructive" /> 诊断
              </span>
              <button
                type="button"
                onClick={() => setDiagnosticsOpen(false)}
                className="size-5 grid place-items-center rounded text-muted-foreground hover:text-foreground hover:bg-accent"
              >
                <X className="size-3" />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-auto p-2.5 space-y-2">
              {errorNodes.length === 0 ? (
                <div className="text-[11px] text-muted-foreground/70 py-6 text-center">
                  没有错误。当前流水线运行正常 ✓
                </div>
              ) : (
                <>
                  <div className="text-[10px] text-muted-foreground/80 uppercase tracking-wider px-1">
                    {errorNodes.length} 个节点出错
                  </div>
                  {errorNodes.map((n) => (
                    <DiagnosticRow
                      key={n.id}
                      node={n}
                      onClick={() => setSelectedId(n.id)}
                    />
                  ))}
                </>
              )}
            </div>
            <div className="px-3 py-2 border-t border-border/60 text-[10px] text-muted-foreground/70 shrink-0">
              点击节点可高亮其上游错误传播链。
            </div>
          </div>
        )}

        {/* Zoom indicator (click to reset) + collapsible control hints */}
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setView({ x: 40, y: 40, scale: 1 })}
          className="absolute bottom-3 right-3 flex items-center gap-1.5 px-2 py-1 rounded-md glass border border-border text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
          title="点击重置视图到 100%"
        >
          <ZoomIn className="size-3" />
          <span className="font-mono">{Math.round(view.scale * 100)}%</span>
        </button>

        {/* 小地图开关（右上角，紧跟缩放指示器） */}
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setMinimapOpen((v) => !v)}
          className="absolute bottom-3 right-[78px] flex items-center gap-1 px-2 py-1 rounded-md glass border border-border text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
          title={minimapOpen ? '隐藏小地图' : '显示小地图'}
        >
          <MapIcon className="size-3" />
        </button>

        {/* 小地图 */}
        {minimapOpen && (
          <Minimap
            nodes={nodes}
            view={view}
            canvasSize={canvasSize}
            onCenter={centerOnWorld}
          />
        )}
        <div className="absolute bottom-3 left-3 hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-md glass border border-border text-[10px] text-muted-foreground/80">
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => setHintsOpen((v) => !v)}
            className="grid place-items-center size-4 rounded hover:bg-accent hover:text-foreground transition-colors"
            title={hintsOpen ? '收起提示' : '展开操作提示'}
          >
            <Info className="size-3" />
          </button>
          {hintsOpen && (
            <span>滚轮缩放 · Shift+滚轮上下平移 · 方向键移动</span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ================================================================== *
 * Toolbar
 * ================================================================== */
interface ToolbarProps {
  onBack: () => void;
  onRun: () => void;
  /** 终止当前运行的流水线。 */
  onStop: () => void;
  onRunToSelected: () => void;
  onToggleDiagnostics: () => void;
  onClear: () => void;
  onExport: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetView: () => void;
  onCenter: () => void;
  onAddNode: () => void;
  onDeleteSelected: () => void;
  onGroup: () => void;
  onUngroup: () => void;
  onOpenSimConfig: () => void;
  onLoadTemplate: (id: string) => void;
  onAutoLayout: () => void;
  nodeCount: number;
  edgeCount: number;
  selectedCount: number;
  errorCount: number;
  diagnosticsOpen: boolean;
  /** P2-5: 流水线运行中（禁用运行按钮 + 显示加载态）。 */
  running?: boolean;
}

function PipelineToolbar({
  onBack, onRun, onStop, onRunToSelected, onToggleDiagnostics, onClear, onExport,
  onZoomIn, onZoomOut, onResetView, onCenter, onOpenSimConfig, onLoadTemplate, onAutoLayout,
  onAddNode, onDeleteSelected, onGroup, onUngroup,
  nodeCount, edgeCount, selectedCount, errorCount, diagnosticsOpen, running,
}: ToolbarProps) {
  return (
    <div className="shrink-0 h-11 flex items-center justify-between px-3 gap-3 glass border-b border-border">
      <div className="flex items-center gap-2 min-w-0">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2 gap-1.5 text-[12px]"
          onClick={onBack}
        >
          <ArrowLeft className="size-3.5" />
          <span className="hidden sm:inline">{t('npBackToWorkbench')}</span>
        </Button>
        <div className="h-5 w-px bg-border/60" />
        <div className="flex items-center gap-1.5 min-w-0">
          <Workflow className="size-4 text-primary shrink-0" />
          <span className="text-[13px] font-semibold text-gradient-teal truncate">
            {t('pipelineTitle')}
          </span>
        </div>
        <div className="hidden md:flex items-center gap-2 ml-2 text-[11px] text-muted-foreground">
          <span className="px-1.5 py-0.5 rounded border border-border/60 bg-muted/40 font-mono">
            {nodeCount} {t('npNodes')}
          </span>
          <span className="px-1.5 py-0.5 rounded border border-border/60 bg-muted/40 font-mono">
            {edgeCount} {t('npEdges')}
          </span>
          {selectedCount > 0 && (
            <span className="px-1.5 py-0.5 rounded border border-blue-500/50 bg-blue-500/10 text-blue-500 font-mono">
              {selectedCount} 选中
            </span>
          )}
        </div>
        {selectedCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-2.5 gap-1.5 text-[12px] border-blue-500/50 text-blue-500 hover:bg-blue-500/10"
            onClick={onDeleteSelected}
          >
            <Trash2 className="size-3.5" />
            <span className="hidden sm:inline">删除选中 ({selectedCount})</span>
          </Button>
        )}
        {selectedCount > 0 && (
          <>
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-2.5 gap-1.5 text-[12px] border-teal-500/50 text-teal-500 hover:bg-teal-500/10"
              onClick={onGroup}
              title="把选中节点归入一个可命名的 Frame"
            >
              <Boxes className="size-3.5" />
              <span className="hidden sm:inline">分组</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-2.5 gap-1.5 text-[12px]"
              onClick={onUngroup}
              title="移除选中节点的分组"
            >
              <Ungroup className="size-3.5" />
              <span className="hidden sm:inline">取消分组</span>
            </Button>
          </>
        )}
      </div>

      <div className="flex items-center gap-1">
        <Button
          variant="default"
          size="sm"
          className="h-8 px-3 gap-1.5 text-[12px] bg-primary/90 hover:bg-primary"
          onClick={onRun}
          disabled={running}
        >
          {running ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Play className="size-3.5" />
          )}
          {running ? t('npRunning') : t('npRunAll')}
        </Button>
        {running && (
          <Button
            variant="destructive"
            size="sm"
            className="h-8 px-3 gap-1.5 text-[12px]"
            onClick={onStop}
            title="终止当前流水线"
          >
            <Square className="size-3.5" />
            停止
          </Button>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-2.5 gap-1.5 text-[12px]"
              onClick={onRunToSelected}
              disabled={selectedCount === 0}
            >
              <FastForward className="size-3.5" />
              <span className="hidden sm:inline">执行到选中</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">从起点执行到当前选中的节点（用于定位问题）</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={diagnosticsOpen ? 'secondary' : 'outline'}
              size="sm"
              className="h-8 px-2.5 gap-1.5 text-[12px] relative"
              onClick={onToggleDiagnostics}
            >
              <Bug className="size-3.5" />
              <span className="hidden sm:inline">诊断</span>
              {errorCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-destructive text-white text-[10px] grid place-items-center">
                  {errorCount}
                </span>
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">打开错误诊断面板（错误传播链）</TooltipContent>
        </Tooltip>
        <Button
          variant="outline"
          size="sm"
          className="h-8 px-2.5 gap-1.5 text-[12px]"
          onClick={onAddNode}
        >
          <Plus className="size-3.5" />
          <span className="hidden sm:inline">{t('npAddNodeTitle')}</span>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 px-2 gap-1.5 text-[12px]">
              <LayoutTemplate className="size-3.5" />
              <span className="hidden sm:inline">模板</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-72">
            <DropdownMenuLabel>示例工作流</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {/* 模板分组：按 category 归类 + 可滚动，避免模板变多后难以浏览。 */}
            <div className="max-h-[60vh] overflow-y-auto pr-1">
              {TEMPLATE_GROUPS.map((group) => {
                const items = PIPELINE_TEMPLATES.filter((t) => (t.category ?? 'math') === group.key);
                if (items.length === 0) return null;
                return (
                  <div key={group.key} className="mb-1">
                    <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">
                      {group.label}
                    </div>
                    {items.map((tpl) => (
                      <DropdownMenuItem
                        key={tpl.id}
                        onSelect={() => onLoadTemplate(tpl.id)}
                        className="flex flex-col items-start gap-0.5 py-2"
                      >
                        <span className="text-[12px] font-medium">{tpl.name}</span>
                        <span className="text-[10px] text-muted-foreground leading-snug">{tpl.description}</span>
                      </DropdownMenuItem>
                    ))}
                  </div>
                );
              })}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={onOpenSimConfig}>
              <Settings className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">仿真配置（时间/步长/求解器）</TooltipContent>
        </Tooltip>
        <Button
          variant="outline"
          size="sm"
          className="h-8 px-2.5 gap-1.5 text-[12px]"
          onClick={onExport}
        >
          <FileCode2 className="size-3.5" />
          <span className="hidden sm:inline">{t('npExportScript')}</span>
        </Button>
        <div className="h-5 w-px bg-border/60 mx-1" />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onZoomOut}>
              <ZoomOut className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{t('npZoomOut')}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onZoomIn}>
              <ZoomIn className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{t('npZoomIn')}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onCenter}>
              <Scan className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">居中所有节点</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onAutoLayout}>
              <LayoutGrid className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">一键整理布局（按依赖自动分层）</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onResetView}>
              <Maximize2 className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{t('npResetView')}</TooltipContent>
        </Tooltip>
        <div className="h-5 w-px bg-border/60 mx-1" />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={onClear}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{t('npClearAll')}</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

/* ================================================================== *
 * Node card
 * ================================================================== */
interface NodeCardProps {
  node: PipelineNode;
  selected: boolean;
  multiSelected: boolean;
  computeTick: number;
  isConnecting: boolean;
  /** P2: 当前正在拖线源的端口数据类型（用于输入端口兼容高亮）。 */
  connectingFromType: PortDataType | null;
  /** P3: 该节点是否位于「选中节点」的错误传播链上（用于路径高亮）。 */
  inErrorChain: boolean;
  snapPortId: string | null;
  onPointerDownHeader: (e: React.PointerEvent) => void;
  onDelete: () => void;
  onToggleMute: () => void;
  onSelect: (e: React.PointerEvent) => void;
  onConfigChange: (patch: Record<string, unknown>) => void;
  onStartConnection: (portId: string, e: React.PointerEvent) => void;
  onCompleteConnection: (portId: string, type: PortDataType) => void;
  variables: string[];
  onPlotOpen?: () => void;
  /** 当前视图缩放（用于端口测量重触发，见 contentPortPositions）。 */
  measureScale?: number;
}

/**
 * 判断节点是否包含「可调参」配置（number / select / boolean / text）。
 * 纯文件/图片/视频输入（type === 'file'）不算调参，不展示就地 AI 输入框，
 * 避免「我只是输入一张图/一段视频，你也让我用 AI」的无意义提示。
 */
function nodeHasTunableParams(def: NodeTypeDef | undefined): boolean {
  if (!def) return false;
  if (def.configSchema && def.configSchema.length > 0) {
    return def.configSchema.some((f) => f.type !== 'file');
  }
  // 未迁移到 configSchema、但本身有数值/表达式可调的手写配置节点。
  return def.type === 'number-input' || def.type === 'expression-input';
}

function NodeCard({
  node, selected, multiSelected, computeTick, isConnecting, connectingFromType, inErrorChain, snapPortId,
  onPointerDownHeader, onDelete, onSelect, onToggleMute,
  onConfigChange, onStartConnection, onCompleteConnection,
  variables, onPlotOpen, measureScale,
}: NodeCardProps) {
  const def = NODE_TYPES[node.type];
  // Hooks must run unconditionally — the defensive early return below
  // (unknown node type) previously skipped them, violating the rules of
  // hooks. cardRef stays unattached for error cards, so the glow effect
  // is a no-op there.
  const cardRef = useRef<HTMLDivElement>(null);
  // P1-3 最小暴露：可折叠配置面板。折叠后仅保留端口与标题，隐藏配置/结果区。
  const [collapsed, setCollapsed] = useState(false);

  // Compute-pulse glow: re-trigger on computeTick bump via direct DOM
  // manipulation (avoids setState-in-effect lint error).
  const lastTick = useRef(0);
  useEffect(() => {
    if (computeTick > 0 && computeTick !== lastTick.current) {
      lastTick.current = computeTick;
      const el = cardRef.current;
      if (el) {
        el.classList.remove('animate-glow-pulse');
        // Force reflow so the animation restarts.
        void el.offsetWidth;
        el.classList.add('animate-glow-pulse');
        const id = setTimeout(() => el.classList.remove('animate-glow-pulse'), 900);
        return () => clearTimeout(id);
      }
    }
    return;
  }, [computeTick]);

  // ── 防御性渲染：如果 node.type 不在注册表中（脏数据/旧版本数据），
  // 显示错误卡片而不是崩溃白屏。用户可看到错误并删除该节点。
  if (!def) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className="absolute node-card border-2 border-destructive/50 rounded-[10px] bg-destructive/5 p-3"
        style={{
          width: NODE_WIDTH,
          left: node.position.x,
          top: node.position.y,
          zIndex: 20,
        }}
        onPointerDown={(e) => { e.stopPropagation(); onSelect(e as unknown as React.PointerEvent); }}
      >
        <div className="flex items-center gap-2 text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          <span className="text-[12px] font-medium">未知节点类型</span>
        </div>
        <div className="mt-1.5 text-[11px] text-muted-foreground font-mono break-all">
          {String(node.type)}
        </div>
        <div className="mt-1.5 text-[10.5px] text-muted-foreground">
          该节点可能来自旧版本数据，请删除后重新添加。
        </div>
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="mt-2 h-6 px-2 rounded text-[11px] bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
        >
          删除此节点
        </button>
      </motion.div>
    );
  }
  const cat = CATEGORY_COLOR[def.category];
  const Icon = ICONS[def.icon] ?? Hash;
  const portsH = portsSectionHeight(node);

  return (
    <motion.div
      ref={cardRef}
      // 避免入场动画的 scale/y 位移变换：usePortReporter 在挂载时用
      // getBoundingClientRect 测量端口位置，若入场动画带 scale/y 变换，
      // 测量得到的偏移会被「缩放+位移」污染，且 ResizeObserver 不监听
      // transform 变化，导致错误偏移残留、连线与端口错位。故仅保留
      // 透明度淡入，不引入任何位置/缩放变换。
      initial={{ opacity: 0 }}
      animate={{ opacity: node.muted ? 0.6 : 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
      className={cn(
        'absolute node-card group overflow-visible',
        selected && 'selected',
        multiSelected && 'ring-2 ring-blue-500 ring-offset-0',
        inErrorChain && !selected && 'with-error-chain',
        node.muted && 'saturate-50',
      )}
      style={{
        width: NODE_WIDTH,
        left: node.position.x,
        top: node.position.y,
        zIndex: selected || multiSelected ? 20 : 10,
      }}
      onPointerDown={(e) => {
        // Click anywhere on the card selects it (multi-select aware).
        e.stopPropagation();
        onSelect(e);
      }}
    >
      {/* Category color stripe (left edge) */}
      <div className={cn('absolute left-0 top-0 bottom-0 w-[3px] rounded-l-[10px]', cat.stripe)} />

      {/* Header */}
      <div
        className="node-header flex items-center justify-between gap-1.5 pl-3.5 pr-2 cursor-grab active:cursor-grabbing"
        style={{ height: NODE_HEADER_H }}
        onPointerDown={onPointerDownHeader}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <Icon className={cn('size-3.5 shrink-0', cat.text)} strokeWidth={2.2} />
          <span className="text-[12px] truncate">{t(def.labelKey)}</span>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          {/* P2-8 节点静音（Blender 式 Mute）：跳过执行，首输入透传首输出 */}
          <button
            type="button"
            title={node.muted ? t('pipelineUnmute') : t('pipelineMute')}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onToggleMute(); }}
            className={cn(
              'size-5 grid place-items-center rounded transition-all',
              node.muted
                ? 'text-amber-500 hover:text-amber-400 hover:bg-amber-500/10'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent',
              selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
            )}
            aria-label={node.muted ? t('pipelineUnmute') : t('pipelineMute')}
          >
            {node.muted ? <VolumeX className="size-3" /> : <Volume2 className="size-3" />}
          </button>
          {/* P1-3 折叠配置面板（最小暴露，Blender 风格） */}
          <button
            type="button"
            title={collapsed ? t('pipelineExpand') : t('pipelineCollapse')}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); setCollapsed((c) => !c); }}
            className={cn(
              'size-5 grid place-items-center rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-all',
              selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
            )}
            aria-label={collapsed ? t('pipelineExpand') : t('pipelineCollapse')}
          >
            {collapsed ? <ChevronRight className="size-3" /> : <ChevronDown className="size-3" />}
          </button>
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className={cn(
              'size-5 grid place-items-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all',
              selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
            )}
            aria-label={t('pipelineDelete')}
          >
            <X className="size-3" />
          </button>
        </div>
      </div>

      {/* Ports section */}
      <div className="relative pl-3.5 pr-3" style={{ height: portsH, paddingTop: PORTS_PAD_TOP }}>
        {def.inputs.map((port, i) => (
          <PortLabel
            key={port.id}
            nodeId={node.id}
            port={port}
            isOutput={false}
            y={i * PORT_ROW_H}
            connected={Boolean(node.outputs && port.id in (node.outputs as object))}
            isConnecting={isConnecting}
            connectingFromType={connectingFromType}
            snapped={snapPortId === port.id}
            onStartConnection={onStartConnection}
            onCompleteConnection={onCompleteConnection}
            measureScale={measureScale}
          />
        ))}
        {def.outputs.map((port, i) => (
          <PortLabel
            key={port.id}
            nodeId={node.id}
            port={port}
            isOutput
            y={i * PORT_ROW_H}
            connected={Boolean(node.outputs && port.id in (node.outputs as object))}
            isConnecting={isConnecting}
            connectingFromType={connectingFromType}
            snapped={false}
            onStartConnection={onStartConnection}
            onCompleteConnection={onCompleteConnection}
            measureScale={measureScale}
          />
        ))}
      </div>

      {/* Config section (P1-3 可折叠：最小暴露) */}
      {!collapsed && (
        <div className="px-3 pb-2 pt-1">
          <NodeConfig node={node} onConfigChange={onConfigChange} variables={variables} />
        </div>
      )}

      {/* M1 — 节点下「✨ AI 需求」就地输入（ComfyUI 风格）：把节点类型 + 当前配置
          打包成上下文发送给 AI，AI 通过 configure_node 回传参数改动。
          仅在含「可调参」配置的节点展示；纯图片/视频输入节点不展示，避免无意义提示。 */}
      {!collapsed && nodeHasTunableParams(def) && (
        <div className="px-3 pb-2">
          <AiPromptInput
            module="pipeline"
            context={`节点 ${node.id}（类型 ${node.type}）\n当前配置:${JSON.stringify(node.config ?? {}).slice(0, 800)}`}
            placeholder="调参或描述需求…"
          />
        </div>
      )}

      {/* Variable dependency badge (N1 integration)
          仅当节点表达式引用了用户变量时才显示。
          例如 expression-input 写了 "a*x+b"，且 a/b 是用户变量，
          这里显示 "依赖: a, b"。让用户直观看到节点和变量的联动关系。 */}
      {!collapsed && <NodeDependencyBadge node={node} variables={variables} />}

      {/* Result footer */}
      {!collapsed && (
        <div
          className={cn(
            'border-t border-border/60 px-3 py-2 grid place-items-center min-h-[58px]',
            node.error ? 'bg-destructive/8' : 'bg-primary/5',
          )}
        >
          <NodeResultFooter node={node} onPlotOpen={onPlotOpen} />
        </div>
      )}
    </motion.div>
  );
}

/* ================================================================== *
 * Port label + socket
 * ================================================================== */
interface PortLabelProps {
  nodeId: string;
  port: PortDef;
  isOutput: boolean;
  y: number;
  connected: boolean;
  isConnecting: boolean;
  /** P2: 正在拖线源的端口类型。非空时，输入端口按与它的兼容性高亮/置灰。 */
  connectingFromType: PortDataType | null;
  snapped: boolean;
  onStartConnection: (portId: string, e: React.PointerEvent) => void;
  onCompleteConnection: (portId: string, type: PortDataType) => void;
  /** 当前视图缩放（端口测量重触发，保持测得偏移与当前缩放一致）。 */
  measureScale?: number;
}

function PortLabel({
  nodeId, port, isOutput, y, connected, isConnecting, connectingFromType, snapped,
  onStartConnection, onCompleteConnection, measureScale,
}: PortLabelProps) {
  const [hover, setHover] = useState(false);
  // P2: 拖线时，输入端口按源类型兼容性判断是否可连。
  //   兼容 → active 高亮；不兼容 → 置灰（降低透明度）。
  const compatible =
    isConnecting && !isOutput && connectingFromType !== null
      ? canConnect(connectingFromType, port.type)
      : true;
  // Measure this port dot's center offset relative to its ancestor
  // .node-card, and report it to the PortPositionsProvider context so
  // edge routing + snap detection use real DOM positions (not estimates).
  const dotRef = useRef<HTMLDivElement>(null);
  usePortReporter(nodeId, port.id, isOutput, dotRef, measureScale);
  const TypeIcon = PORT_TYPE_ICON[port.type] ?? Dot;
  return (
    <div
      className={cn(
        'absolute flex items-center gap-1.5 text-[11px]',
        isOutput ? 'right-3 flex-row-reverse' : 'left-3',
      )}
      style={{ top: y, height: PORT_ROW_H }}
    >
      <div
        ref={dotRef}
        role="button"
        tabIndex={0}
        aria-label={t(port.labelKey)}
        data-port-id={portKey(nodeId, port.id, isOutput)}
        onPointerDown={(e) => {
          if (isOutput) onStartConnection(port.id, e);
        }}
        onPointerUp={(e) => {
          if (!isOutput) {
            e.stopPropagation();
            onCompleteConnection(port.id, port.type);
          }
        }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        className={cn(
          'node-port',
          connected && 'connected',
          (hover || (isConnecting && !isOutput && compatible)) && 'active',
          isConnecting && !isOutput && !compatible && 'opacity-30',
          snapped && 'ring-2 ring-cyan-400 scale-125',
        )}
        style={{
          borderColor: snapped
            ? 'oklch(0.75 0.18 195)'
            : PORT_TYPE_STYLE[port.type]?.border ?? 'oklch(0.7 0.15 165)',
          background: snapped
            ? 'oklch(0.75 0.18 195 / 0.35)'
            : connected
              ? (PORT_TYPE_STYLE[port.type]?.border ?? 'oklch(0.7 0.15 165)')
              : 'var(--node-bg)',
        }}
      />
      <TypeIcon
        className={cn(
          'size-3 shrink-0',
          isConnecting && !isOutput && !compatible ? 'opacity-30' : 'opacity-60',
        )}
        style={{ color: PORT_TYPE_STYLE[port.type]?.border }}
        strokeWidth={2}
      />
      <span className="text-muted-foreground/80 select-none truncate max-w-[140px]">
        {t(port.labelKey)}
      </span>
    </div>
  );
}

/* ================================================================== *
 * Node-specific config UIs
 * ================================================================== */
interface NodeConfigProps {
  node: PipelineNode;
  onConfigChange: (patch: Record<string, unknown>) => void;
  variables: string[];
}

/**
 * N1 集成：在 NodeCard 底部显示节点依赖的用户变量。
 *
 * - 调用 getNodeVariableDeps 扫描节点表达式中的变量引用。
 * - 仅当 deps 非空时渲染，避免无表达式的节点（如 number-input）显示空徽章。
 * - 点击徽章中的变量名可跳转到 Variables 面板（暂未实现，预留 onClick）。
 */
function NodeDependencyBadge({
  node,
  variables,
}: {
  node: PipelineNode;
  variables: string[];
}) {
  // useMemo 避免每次 NodeCard 重渲染都重扫 —— 只有 node.config 或 variables 变化时才重扫。
  const deps = useMemo(
    () => getNodeVariableDeps(node, variables),
    [node, variables],
  );
  if (deps.length === 0) return null;
  return (
    <div className="px-3 pb-1.5 -mt-0.5 flex items-center gap-1 flex-wrap">
      <span className="text-[10px] text-muted-foreground/70 select-none">
        {t('npDependsOn')}:
      </span>
      {deps.map((v) => (
        <span
          key={v}
          className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-primary/10 text-primary/90 border border-primary/15"
        >
          {v}
        </span>
      ))}
    </div>
  );
}

function NodeConfig({ node, onConfigChange, variables }: NodeConfigProps) {
  // P0 蓝图可用性：若节点声明了 configSchema，则配置面板由 schema 自动生成，
  // 无需手写 case。手写 switch 仅作为未迁移节点的兜底。
  const schema = NODE_TYPES[node.type]?.configSchema;
  if (schema && schema.length > 0) {
    return <SchemaConfig schema={schema} node={node} onConfigChange={onConfigChange} />;
  }
  switch (node.type) {
    case 'number-input':
      return <NumberInputConfig node={node} onConfigChange={onConfigChange} />;
    case 'expression-input':
      return (
        <div className="space-y-1">
          <label className="text-[10px] text-muted-foreground/80 uppercase tracking-wider">
            {t('npExpression')}
          </label>
          <Input
            type="text"
            value={String(node.config.expr ?? '')}
            onChange={(e) => onConfigChange({ expr: e.target.value })}
            placeholder="sin(x)"
            className="h-7 text-[12px] font-mono"
          />
        </div>
      );
    case 'variable':
      return (
        <div className="space-y-1">
          <label className="text-[10px] text-muted-foreground/80 uppercase tracking-wider">
            {t('npVarName')}
          </label>
          <Select
            value={String(node.config.name ?? '')}
            onValueChange={(v) => onConfigChange({ name: v })}
          >
            <SelectTrigger className="h-7 text-[12px]">
              <SelectValue placeholder={t('npNoVariables')} />
            </SelectTrigger>
            <SelectContent>
              {variables.length === 0 ? (
                <SelectItem value="__none" disabled>{t('npNoVariables')}</SelectItem>
              ) : (
                variables.map((v) => (
                  <SelectItem key={v} value={v}>{v}</SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>
      );
    case 'constant':
      return (
        <div className="space-y-1">
          <label className="text-[10px] text-muted-foreground/80 uppercase tracking-wider">
            {t('npConstantName')}
          </label>
          <Select
            value={String(node.config.name ?? 'pi')}
            onValueChange={(v) => onConfigChange({ name: v })}
          >
            <SelectTrigger className="h-7 text-[12px] font-mono">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {['pi', 'e', 'tau', 'phi', 'sqrt2'].map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );
    case 'arithmetic':
      return (
        <div className="space-y-1">
          <label className="text-[10px] text-muted-foreground/80 uppercase tracking-wider">
            {t('npOperator')}
          </label>
          <Select
            value={String(node.config.op ?? '+')}
            onValueChange={(v) => onConfigChange({ op: v })}
          >
            <SelectTrigger className="h-7 text-[12px] font-mono">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {['+', '-', '*', '/', '^', '%'].map((op) => (
                <SelectItem key={op} value={op}>{op}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );
    case 'function-apply':
      return (
        <div className="space-y-1">
          <label className="text-[10px] text-muted-foreground/80 uppercase tracking-wider">
            {t('npFunction')}
          </label>
          <Select
            value={String(node.config.fn ?? 'sin')}
            onValueChange={(v) => onConfigChange({ fn: v })}
          >
            <SelectTrigger className="h-7 text-[12px] font-mono">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'exp', 'log', 'ln', 'sqrt', 'abs', 'cbrt', 'sinh', 'cosh', 'tanh', 'floor', 'ceil', 'round', 'custom'].map((fn) => (
                <SelectItem key={fn} value={fn}>{fn}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {node.config.fn === 'custom' && (
            <Input
              type="text"
              value={String(node.config.customExpr ?? 'x')}
              onChange={(e) => onConfigChange({ customExpr: e.target.value })}
              placeholder="x^2 + 1"
              className="h-7 text-[12px] font-mono"
            />
          )}
        </div>
      );
    case 'plot-output':
      return (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-muted-foreground/80 uppercase tracking-wider">
              {t('npXMin')}
            </label>
            <Input
              type="number"
              value={String(node.config.xMin ?? -10)}
              onChange={(e) => onConfigChange({ xMin: Number(e.target.value) })}
              className="h-7 text-[12px] font-mono"
            />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground/80 uppercase tracking-wider">
              {t('npXMax')}
            </label>
            <Input
              type="number"
              value={String(node.config.xMax ?? 10)}
              onChange={(e) => onConfigChange({ xMax: Number(e.target.value) })}
              className="h-7 text-[12px] font-mono"
            />
          </div>
        </div>
      );
    case 'matrix-input':
      return <MatrixConfig node={node} onConfigChange={onConfigChange} />;
    case 'matrix-op':
      return (
        <div className="space-y-1">
          <label className="text-[10px] text-muted-foreground/80 uppercase tracking-wider">
            {t('npMatrixOp')}
          </label>
          <Select
            value={String(node.config.op ?? 'inv')}
            onValueChange={(v) => onConfigChange({ op: v })}
          >
            <SelectTrigger className="h-7 text-[12px] font-mono">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[
                { v: 'inv', l: 'inv (逆)' },
                { v: 'transpose', l: 'transpose (转置)' },
                { v: 'det', l: 'det (行列式)' },
                { v: 'trace', l: 'trace (迹)' },
                { v: 'rank', l: 'rank (秩)' },
                { v: 'eigen', l: 'eigen (特征)' },
              ].map((op) => (
                <SelectItem key={op.v} value={op.v}>{op.l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );
    case 'derivative':
      return (
        <div className="space-y-1">
          <label className="text-[10px] text-muted-foreground/80 uppercase tracking-wider">
            {t('npVariable_')}
          </label>
          <Input
            type="text"
            value={String(node.config.variable ?? 'x')}
            onChange={(e) => onConfigChange({ variable: e.target.value })}
            className="h-7 text-[12px] font-mono"
          />
        </div>
      );
    case 'integrate':
      return (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-muted-foreground/80 uppercase tracking-wider">
              {t('npLowerBound')}
            </label>
            <Input
              type="number"
              value={String(node.config.a ?? -1)}
              onChange={(e) => onConfigChange({ a: Number(e.target.value) })}
              className="h-7 text-[12px] font-mono"
            />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground/80 uppercase tracking-wider">
              {t('npUpperBound')}
            </label>
            <Input
              type="number"
              value={String(node.config.b ?? 1)}
              onChange={(e) => onConfigChange({ b: Number(e.target.value) })}
              className="h-7 text-[12px] font-mono"
            />
          </div>
        </div>
      );
    case 'matrix-decompose':
      return (
        <div className="space-y-1">
          <label className="text-[10px] text-muted-foreground/80 uppercase tracking-wider">
            {t('npDecompMethod')}
          </label>
          <Select
            value={String(node.config.method ?? 'lu')}
            onValueChange={(v) => onConfigChange({ method: v })}
          >
            <SelectTrigger className="h-7 text-[12px] font-mono"><SelectValue /></SelectTrigger>
            <SelectContent>
              {['lu', 'qr', 'eigen', 'cholesky'].map((m) => (
                <SelectItem key={m} value={m}>{m.toUpperCase()}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );
    case 'symbolic-integrate':
      return (
        <div className="space-y-1">
          <label className="text-[10px] text-muted-foreground/80 uppercase tracking-wider">
            {t('npVariable_')}
          </label>
          <Input
            type="text"
            value={String(node.config.variable ?? 'x')}
            onChange={(e) => onConfigChange({ variable: e.target.value })}
            className="h-7 text-[12px] font-mono"
          />
        </div>
      );
    case 'solve-equation':
      return (
        <div className="space-y-1">
          <label className="text-[10px] text-muted-foreground/80 uppercase tracking-wider">
            {t('npSearchRange')}
          </label>
          <div className="grid grid-cols-2 gap-2">
            <Input
              type="number"
              value={String(node.config.xMin ?? -10)}
              onChange={(e) => onConfigChange({ xMin: Number(e.target.value) })}
              className="h-7 text-[12px] font-mono"
            />
            <Input
              type="number"
              value={String(node.config.xMax ?? 10)}
              onChange={(e) => onConfigChange({ xMax: Number(e.target.value) })}
              className="h-7 text-[12px] font-mono"
            />
          </div>
        </div>
      );
    case 'simplify':
      return null;
    case 'evaluate':
    case 'matrix-multiply':
    case 'display':
      return null;

    /* ── Simulink-style 仿真节点参数面板 ────────────────────── */
    case 'sim-constant':
      return <NumField label="数值 Constant" value={node.config.value} onChange={(v) => onConfigChange({ value: v })} />;
    case 'sim-sine':
      return (
        <div className="space-y-2">
          <NumField label="幅度 Amplitude" value={node.config.amplitude} onChange={(v) => onConfigChange({ amplitude: v })} />
          <NumField label="频率 Frequency (Hz)" value={node.config.frequency} onChange={(v) => onConfigChange({ frequency: v })} />
          <NumField label="相位 Phase (rad)" value={node.config.phase} onChange={(v) => onConfigChange({ phase: v })} />
          <NumField label="偏置 Bias" value={node.config.bias} onChange={(v) => onConfigChange({ bias: v })} />
        </div>
      );
    case 'sim-step':
      return (
        <div className="space-y-2">
          <NumField label="阶跃时刻 Step Time" value={node.config.stepTime} onChange={(v) => onConfigChange({ stepTime: v })} />
          <NumField label="初始值 Initial Value" value={node.config.initialValue} onChange={(v) => onConfigChange({ initialValue: v })} />
          <NumField label="终值 Final Value" value={node.config.finalValue} onChange={(v) => onConfigChange({ finalValue: v })} />
        </div>
      );
    case 'sim-ramp':
      return (
        <div className="space-y-2">
          <NumField label="斜率 Slope" value={node.config.slope} onChange={(v) => onConfigChange({ slope: v })} />
          <NumField label="起始时刻 Start Time" value={node.config.startTime} onChange={(v) => onConfigChange({ startTime: v })} />
        </div>
      );
    case 'sim-pulse':
      return (
        <div className="space-y-2">
          <NumField label="幅度 Amplitude" value={node.config.amplitude} onChange={(v) => onConfigChange({ amplitude: v })} />
          <NumField label="周期 Period" value={node.config.period} onChange={(v) => onConfigChange({ period: v })} />
          <NumField label="脉宽 Pulse Width" value={node.config.pulseWidth} onChange={(v) => onConfigChange({ pulseWidth: v })} />
          <NumField label="相位延迟 Phase Delay" value={node.config.phaseDelay} onChange={(v) => onConfigChange({ phaseDelay: v })} />
        </div>
      );
    case 'sim-noise':
      return (
        <div className="space-y-2">
          <NumField label="下限 Min" value={node.config.min} onChange={(v) => onConfigChange({ min: v })} />
          <NumField label="上限 Max" value={node.config.max} onChange={(v) => onConfigChange({ max: v })} />
        </div>
      );
    case 'sim-gain':
      return <NumField label="增益 Gain" value={node.config.gain} onChange={(v) => onConfigChange({ gain: v })} />;
    case 'sim-sum':
      return (
        <div className="space-y-1">
          <label className="text-[10px] text-muted-foreground/80 uppercase tracking-wider">
            符号 Signs（如 +-）
          </label>
          <Input
            type="text"
            value={String(node.config.signs ?? '++')}
            onChange={(e) => onConfigChange({ signs: e.target.value })}
            className="h-7 text-[12px] font-mono"
          />
        </div>
      );
    case 'sim-integrator':
      return <NumField label="初值 Initial Condition" value={node.config.initialCondition} onChange={(v) => onConfigChange({ initialCondition: v })} />;
    case 'sim-derivative':
      return <NumField label="初值 Initial Condition" value={node.config.initialCondition} onChange={(v) => onConfigChange({ initialCondition: v })} />;
    case 'sim-delay':
      return <NumField label="初始输出 Initial Output" value={node.config.initialOutput} onChange={(v) => onConfigChange({ initialOutput: v })} />;
    case 'sim-saturation':
      return (
        <div className="space-y-2">
          <NumField label="下限 Lower Limit" value={node.config.lowerLimit} onChange={(v) => onConfigChange({ lowerLimit: v })} />
          <NumField label="上限 Upper Limit" value={node.config.upperLimit} onChange={(v) => onConfigChange({ upperLimit: v })} />
        </div>
      );
    case 'sim-first-order':
      return (
        <div className="space-y-2">
          <NumField label="时间常数 T" value={node.config.timeConstant} onChange={(v) => onConfigChange({ timeConstant: v })} />
          <NumField label="初值 Initial Output" value={node.config.initialOutput} onChange={(v) => onConfigChange({ initialOutput: v })} />
        </div>
      );
    case 'sim-clock':
    case 'sim-scope':
      return <p className="text-[11px] text-muted-foreground/70">仿真节点，点击工具栏「▶ 运行仿真」查看结果。</p>;

    /* ── 视觉 Vision 节点参数面板 ───────────────────────────
     * 之前这些节点没有对应的 case，全部落入 default 返回 null，
     * 导致「图像转曲线 / 视频转曲线」在工作流里无法配置输入文件，
     * 节点面板什么都不显示 —— 这就是该功能『存在却用不了』的根因。
     * 现在为每个视觉节点补全配置 UI，让用户可以选图、选视频、调参。 */
    case 'image-input':
      return (
        <VisionFileConfig
          node={node}
          onConfigChange={onConfigChange}
          accept="image/*,.png,.jpg,.jpeg,.webp,.bmp,image/svg+xml"
          label="输入图片"
          hint="选择图片文件"
        />
      );
    case 'video-input':
      return (
        <VisionFileConfig
          node={node}
          onConfigChange={onConfigChange}
          accept="video/*,image/gif,.mp4,.webm,.mov,.avi,.gif"
          label="输入视频 / GIF"
          hint="选择视频或 GIF"
        />
      );
    case 'grayscale-threshold':
      return (
        <div className="space-y-2">
          <ConfigSelect
            label="方法 Method"
            value={String(node.config.method ?? 'multi')}
            onChange={(v) => onConfigChange({ method: v })}
            options={[
              { value: 'multi', label: '多阈值分层 (multi)' },
              { value: 'simple', label: '固定阈值 (simple)' },
              { value: 'adaptive', label: '自适应 (adaptive)' },
            ]}
          />
          <ConfigSlider label="阈值 Threshold" value={Number(node.config.threshold ?? 128)} onChange={(v) => onConfigChange({ threshold: v })} min={0} max={255} step={1} />
          <ConfigSlider label="层级 Levels" value={Number(node.config.levels ?? 4)} onChange={(v) => onConfigChange({ levels: v })} min={2} max={8} step={1} />
        </div>
      );
    case 'edge-detect':
      return (
        <div className="space-y-2">
          <ConfigSelect
            label="方法 Method"
            value={String(node.config.method ?? 'sobel')}
            onChange={(v) => onConfigChange({ method: v })}
            options={[
              { value: 'sobel', label: 'Sobel 梯度' },
              { value: 'canny', label: 'Canny 双阈值' },
            ]}
          />
          <ConfigSlider label="低阈值 Low" value={Number(node.config.lowThreshold ?? 30)} onChange={(v) => onConfigChange({ lowThreshold: v })} min={0} max={255} step={1} />
          <ConfigSlider label="高阈值 High" value={Number(node.config.highThreshold ?? 80)} onChange={(v) => onConfigChange({ highThreshold: v })} min={0} max={255} step={1} />
        </div>
      );
    case 'contour-trace':
      return (
        <div className="space-y-2">
          <ConfigSlider label="降噪像素 Turd Size" value={Number(node.config.turdsize ?? 2)} onChange={(v) => onConfigChange({ turdsize: v })} min={0} max={20} step={1} />
          <ConfigToggle label="骨架化 (Skeletonize)" value={Boolean(node.config.skeletonize)} onChange={(v) => onConfigChange({ skeletonize: v })} />
        </div>
      );
    case 'curve-fit':
      return (
        <div className="space-y-2">
          <ConfigSelect
            label="拟合模式 Fit Mode"
            value={String(node.config.fitMode ?? 'bezier')}
            onChange={(v) => onConfigChange({ fitMode: v })}
            options={[
              { value: 'bezier', label: '贝塞尔 (Bezier)' },
              { value: 'fourier', label: '傅里叶 (Fourier)' },
            ]}
          />
          <ConfigSelect
            label="质量 Quality"
            value={String(node.config.quality ?? 'balanced')}
            onChange={(v) => {
              // 切换质量预设时，同步写入对应的误差/角点阈值，
              // 否则 execute 里 `config.error ?? preset` 会因默认值恒存在而忽略预设。
              const p = (() => {
                switch (v) {
                  case 'precise': return { errorThreshold: 0.2, cornerThreshold: 0.14 };
                  case 'smooth': return { errorThreshold: 2.5, cornerThreshold: 1.05 };
                  default: return { errorThreshold: 1.5, cornerThreshold: 0.7 };
                }
              })();
              onConfigChange({ quality: v, ...p });
            }}
            options={[
              { value: 'precise', label: '精细 Precise' },
              { value: 'balanced', label: '均衡 Balanced' },
              { value: 'smooth', label: '平滑 Smooth' },
            ]}
          />
          <ConfigSlider label="误差阈值 Error" value={Number(node.config.errorThreshold ?? 1.5)} onChange={(v) => onConfigChange({ errorThreshold: v })} min={0.1} max={5} step={0.1} />
          <ConfigSlider label="角点阈值 Corner" value={Number(node.config.cornerThreshold ?? 0.7)} onChange={(v) => onConfigChange({ cornerThreshold: v })} min={0.05} max={1.5} step={0.05} />
          <ConfigToggle label="翻转 Y 轴" value={Boolean(node.config.flipY ?? true)} onChange={(v) => onConfigChange({ flipY: v })} />
          <ConfigToggle label="翻转 X 轴" value={Boolean(node.config.flipX)} onChange={(v) => onConfigChange({ flipX: v })} />
          <ConfigSlider label="缩放 Scale" value={Number(node.config.scale ?? 1)} onChange={(v) => onConfigChange({ scale: v })} min={0.1} max={4} step={0.05} />
        </div>
      );
    case 'fine-outline':
      return (
        <div className="space-y-2">
          <ConfigSelect
            label="图像类型 Image Type"
            value={String(node.config.imageType ?? 'auto')}
            onChange={(v) => onConfigChange({ imageType: v })}
            options={[
              { value: 'auto', label: '自动 Auto' },
              { value: 'standard', label: '标准 (照片/普通)' },
              { value: 'highContrast', label: '高对比 / 线稿' },
            ]}
          />
          <ConfigSelect
            label="精细度预设 Preset"
            value={String(node.config.preset ?? 'balanced')}
            onChange={(v) => {
              // 同步写入当前 imageType 对应的预设数值，让「预设」真正生效。
              const imageType = String(node.config.imageType ?? 'auto');
              const std = {
                precise: { low: 45, high: 115, minStrand: 28, eps: 0.55, maxPaths: 400, strokeWidth: 1.4 },
                balanced: { low: 55, high: 130, minStrand: 40, eps: 0.9, maxPaths: 200, strokeWidth: 1.6 },
                rough: { low: 70, high: 160, minStrand: 80, eps: 1.6, maxPaths: 80, strokeWidth: 2.0 },
              } as const;
              const hc = {
                precise: { threshold: 128, minStrand: 6, eps: 0.4, maxPaths: 2000, strokeWidth: 1.2 },
                balanced: { threshold: 128, minStrand: 10, eps: 0.6, maxPaths: 1000, strokeWidth: 1.4 },
                rough: { threshold: 140, minStrand: 20, eps: 1.0, maxPaths: 400, strokeWidth: 1.8 },
              } as const;
              const p = std[v as keyof typeof std];
              const hp = hc[v as keyof typeof hc];
              const patch: Record<string, unknown> = { preset: v };
              if (imageType === 'highContrast') {
                Object.assign(patch, hp);
              } else {
                // standard / auto 都以标准预设为基准（auto 内部会再自动判断）
                Object.assign(patch, p);
                if (imageType === 'highContrast') patch.threshold = hp.threshold;
              }
              onConfigChange(patch);
            }}
            options={[
              { value: 'precise', label: '精细 Precise' },
              { value: 'balanced', label: '均衡 Balanced' },
              { value: 'rough', label: '粗略 Rough' },
            ]}
          />
          <ConfigSlider label="阈值 Threshold" value={Number(node.config.threshold ?? 128)} onChange={(v) => onConfigChange({ threshold: v })} min={0} max={255} step={1} />
          <ConfigSlider label="低阈值 Low" value={Number(node.config.low ?? 55)} onChange={(v) => onConfigChange({ low: v })} min={0} max={255} step={1} />
          <ConfigSlider label="高阈值 High" value={Number(node.config.high ?? 130)} onChange={(v) => onConfigChange({ high: v })} min={0} max={255} step={1} />
          <ConfigSlider label="最短链长 Min Strand" value={Number(node.config.minStrand ?? 40)} onChange={(v) => onConfigChange({ minStrand: v })} min={4} max={200} step={1} />
          <ConfigSlider label="简化阈值 Eps" value={Number(node.config.eps ?? 0.9)} onChange={(v) => onConfigChange({ eps: v })} min={0.1} max={3} step={0.05} />
          <ConfigSlider label="最大路径 Max Paths" value={Number(node.config.maxPaths ?? 200)} onChange={(v) => onConfigChange({ maxPaths: v })} min={10} max={2000} step={10} />
          <ConfigSlider label="描边宽度 Stroke" value={Number(node.config.strokeWidth ?? 1.6)} onChange={(v) => onConfigChange({ strokeWidth: v })} min={0.8} max={4} step={0.1} />
          <ConfigToggle label="前景遮罩增强" value={Boolean(node.config.enableForegroundMask)} onChange={(v) => onConfigChange({ enableForegroundMask: v })} />
        </div>
      );
    case 'plot-curves':
      return (
        <div className="space-y-2">
          <div className="space-y-1">
            <label className="text-[10px] text-muted-foreground/80 uppercase tracking-wider">描边颜色 Color</label>
            <input
              type="color"
              value={String(node.config.color ?? '#a78bfa')}
              onChange={(e) => onConfigChange({ color: e.target.value })}
              className="h-7 w-full rounded-md border border-border/60 bg-muted/40 cursor-pointer"
            />
          </div>
          <ConfigSlider label="线宽 Width" value={Number(node.config.width ?? 2)} onChange={(v) => onConfigChange({ width: v })} min={0.5} max={6} step={0.5} />
        </div>
      );
    case 'frame-extract':
      return (
        <div className="space-y-2">
          <ConfigSlider label="最大帧数 Max Frames" value={Number(node.config.maxFrames ?? 300)} onChange={(v) => onConfigChange({ maxFrames: v })} min={10} max={600} step={10} />
          <ConfigSlider label="采样帧率 FPS" value={Number(node.config.fps ?? 30)} onChange={(v) => onConfigChange({ fps: v })} min={1} max={60} step={1} />
        </div>
      );
    case 'pose-track':
      return (
        <div className="space-y-2">
          <ConfigToggle label="关键点平滑 (One Euro)" value={Boolean(node.config.smooth ?? true)} onChange={(v) => onConfigChange({ smooth: v })} />
          <ConfigSlider label="平滑截止频率 Min Cutoff" value={Number(node.config.minCutoff ?? 1.0)} onChange={(v) => onConfigChange({ minCutoff: v })} min={0.1} max={5} step={0.1} />
          <ConfigSlider label="速度系数 Beta" value={Number(node.config.beta ?? 0.007)} onChange={(v) => onConfigChange({ beta: v })} min={0.001} max={0.05} step={0.001} />
        </div>
      );
    case 'curve-animate':
      return (
        <div className="space-y-2">
          <div className="space-y-1">
            <label className="text-[10px] text-muted-foreground/80 uppercase tracking-wider">动画颜色 Color</label>
            <input
              type="color"
              value={String(node.config.color ?? '#a78bfa')}
              onChange={(e) => onConfigChange({ color: e.target.value })}
              className="h-7 w-full rounded-md border border-border/60 bg-muted/40 cursor-pointer"
            />
          </div>
          <ConfigSlider label="线宽 Width" value={Number(node.config.width ?? 2)} onChange={(v) => onConfigChange({ width: v })} min={0.5} max={6} step={0.5} />
          <ConfigToggle label="控制点平滑 (One Euro)" value={Boolean(node.config.smooth)} onChange={(v) => onConfigChange({ smooth: v })} />
          <ConfigSlider label="平滑截止频率 Min Cutoff" value={Number(node.config.minCutoff ?? 1.0)} onChange={(v) => onConfigChange({ minCutoff: v })} min={0.1} max={5} step={0.1} />
          <ConfigSlider label="速度系数 Beta" value={Number(node.config.beta ?? 0.007)} onChange={(v) => onConfigChange({ beta: v })} min={0.001} max={0.05} step={0.001} />
        </div>
      );
    default:
      return null;
  }
}

/** 单个数字配置字段（仿真节点参数面板复用）。 */
function NumField({
  label, value, onChange,
}: { label: string; value: unknown; onChange: (v: number) => void }) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] text-muted-foreground/80 uppercase tracking-wider">
        {label}
      </label>
      <Input
        type="number"
        value={String(value ?? 0)}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-7 text-[12px] font-mono"
      />
    </div>
  );
}

/* ── 视觉（Vision）节点配置通用控件 ─────────────────────────── */

/** 带标签的滑块（视觉节点调参复用）。 */
function ConfigSlider({
  label, value, onChange, min, max, step = 1,
}: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; step?: number }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <label className="text-[10px] text-muted-foreground/80 uppercase tracking-wider">{label}</label>
        <span className="text-[10px] font-mono text-primary tabular-nums">{value}</span>
      </div>
      <Slider
        value={[Number.isFinite(value) ? value : min]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange(v[0])}
        className="cursor-pointer"
      />
    </div>
  );
}

/** 带标签的下拉选择（视觉节点调参复用）。 */
function ConfigSelect({
  label, value, onChange, options,
}: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] text-muted-foreground/80 uppercase tracking-wider">{label}</label>
      <Select value={String(value)} onValueChange={onChange}>
        <SelectTrigger className="h-7 text-[12px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** 布尔开关（视觉节点调参复用）。 */
function ConfigToggle({
  label, value, onChange,
}: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-2 text-[11px] text-foreground/80 cursor-pointer py-0.5">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={Boolean(value)}
        onChange={(e) => onChange(e.target.checked)}
        className="size-3.5 rounded accent-primary cursor-pointer"
      />
    </label>
  );
}

/** 图片 / 视频文件选择（image-input / video-input 节点复用）。
 *  隐藏 <input type=file>，读取为 data URL 写入 config.src，并显示预览。 */
function VisionFileConfig({
  node, onConfigChange, accept, label, hint,
}: {
  node: PipelineNode;
  onConfigChange: (p: Record<string, unknown>) => void;
  accept: string;
  label: string;
  hint: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const src = String(node.config.src ?? '');
  const name = String(node.config.name ?? '');
  const isImage = /^data:image\//.test(src);

  const handleFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result ?? '');
      onConfigChange({ src: dataUrl, name: file.name });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }, [onConfigChange]);

  return (
    <div className="space-y-1.5">
      <label className="text-[10px] text-muted-foreground/80 uppercase tracking-wider">{label}</label>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={handleFile}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="w-full h-7 rounded-md bg-accent/60 hover:bg-accent text-[12px] font-medium flex items-center justify-center gap-1.5 transition-colors"
      >
        <FileImage className="size-3.5 shrink-0" />
        <span className="truncate">{name || hint}</span>
      </button>
      {src && (
        <div className="rounded-md border border-border/50 bg-muted/30 overflow-hidden">
          {isImage ? (
            <img src={src} alt="预览" className="h-20 w-full object-contain" />
          ) : (
            <video src={src} className="h-20 w-full object-contain bg-black/60" muted playsInline />
          )}
        </div>
      )}
      {src && (
        <button
          type="button"
          onClick={() => onConfigChange({ src: '', name: '' })}
          className="text-[10px] text-destructive hover:underline"
        >
          清除文件
        </button>
      )}
    </div>
  );
}

/* ── 声明式配置面板（configSchema 自动渲染）────────────────── */

/**
 * 由 `NodeTypeDef.configSchema` 自动生成配置面板的通用渲染器。
 *
 * 它在内部复用 ConfigSlider / ConfigSelect / ConfigToggle / Input /
 * VisionFileConfig 等既有控件，把声明式字段映射为 UI。新增节点只须在
 * 注册表里写 `configSchema`，无需手写 UI case —— 这正是消灭「节点写了
 * 代码却无 UI」类 bug 的机制（P0 蓝图可用性）。
 */
function SchemaConfig({
  schema,
  node,
  onConfigChange,
}: {
  schema: NodeConfigField[];
  node: PipelineNode;
  onConfigChange: (p: Record<string, unknown>) => void;
}) {
  return (
    <div className="space-y-1.5">
      {schema.map((field) => {
        switch (field.type) {
          case 'number':
            return (
              <ConfigSlider
                key={field.key}
                label={field.label}
                value={Number(node.config[field.key] ?? field.default ?? 0)}
                onChange={(v) => onConfigChange({ [field.key]: v })}
                min={field.min ?? 0}
                max={field.max ?? 1}
                step={field.step ?? 1}
              />
            );
          case 'select':
            return (
              <ConfigSelect
                key={field.key}
                label={field.label}
                value={String(node.config[field.key] ?? field.default ?? field.options[0]?.value ?? '')}
                onChange={(v) => onConfigChange({ [field.key]: v })}
                options={field.options}
              />
            );
          case 'boolean':
            return (
              <ConfigToggle
                key={field.key}
                label={field.label}
                value={Boolean(node.config[field.key] ?? field.default)}
                onChange={(v) => onConfigChange({ [field.key]: v })}
              />
            );
          case 'text':
            return (
              <div key={field.key} className="space-y-1">
                <label className="text-[10px] text-muted-foreground/80 uppercase tracking-wider">
                  {field.label}
                </label>
                <Input
                  type="text"
                  value={String(node.config[field.key] ?? field.default ?? '')}
                  onChange={(e) => onConfigChange({ [field.key]: e.target.value })}
                  placeholder={field.placeholder ?? ''}
                  className="h-7 text-[12px] font-mono"
                />
              </div>
            );
          case 'file':
            return (
              <VisionFileConfig
                key={field.key}
                node={node}
                onConfigChange={onConfigChange}
                accept={field.accept}
                label={field.label}
                hint={field.hint}
              />
            );
          default:
            return null;
        }
      })}
    </div>
  );
}

function NumberInputConfig({ node, onConfigChange }: { node: PipelineNode; onConfigChange: (p: Record<string, unknown>) => void }) {
  const value = Number(node.config.value ?? 0);
  const min = Number(node.config.min ?? -10);
  const max = Number(node.config.max ?? 10);
  const step = Number(node.config.step ?? 0.1);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <label className="text-[10px] text-muted-foreground/80 uppercase tracking-wider">
          {t('npValue')}
        </label>
        <Input
          type="number"
          value={String(node.config.value ?? 0)}
          onChange={(e) => onConfigChange({ value: Number(e.target.value) })}
          className="h-6 w-20 text-[12px] font-mono"
          step={step}
        />
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onConfigChange({ value: v[0] })}
        className="cursor-pointer"
      />
    </div>
  );
}

function MatrixConfig({ node, onConfigChange }: { node: PipelineNode; onConfigChange: (p: Record<string, unknown>) => void }) {
  const cells = (node.config.cells as { value: string }[][]) ?? [];
  const rows = cells.length;
  const cols = cells[0]?.length ?? 0;

  const updateCell = (r: number, c: number, v: string) => {
    const next = cells.map((row) => [...row]);
    next[r][c] = { value: v };
    onConfigChange({ cells: next });
  };
  const addRow = () => {
    const next = cells.map((r) => [...r]);
    next.push(Array.from({ length: cols }, () => ({ value: '0' })));
    onConfigChange({ cells: next });
  };
  const addCol = () => {
    const next = cells.map((r) => [...r, { value: '0' }]);
    onConfigChange({ cells: next });
  };
  const delRow = () => {
    if (rows <= 1) return;
    const next = cells.slice(0, -1);
    onConfigChange({ cells: next });
  };
  const delCol = () => {
    if (cols <= 1) return;
    const next = cells.map((r) => r.slice(0, -1));
    onConfigChange({ cells: next });
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[10px] text-muted-foreground/80">
        <span className="uppercase tracking-wider">{t('npMatrixSize')}: {rows}×{cols}</span>
        <div className="flex items-center gap-0.5">
          <button type="button" onClick={addRow} className="size-4 grid place-items-center rounded hover:bg-accent text-[10px]" title={t('npAddRow')}>＋</button>
          <button type="button" onClick={delRow} className="size-4 grid place-items-center rounded hover:bg-accent text-[10px]" title={t('npDelRow')}>－</button>
          <button type="button" onClick={addCol} className="size-4 grid place-items-center rounded hover:bg-accent text-[10px]" title={t('npAddCol')}>＋</button>
          <button type="button" onClick={delCol} className="size-4 grid place-items-center rounded hover:bg-accent text-[10px]" title={t('npDelCol')}>－</button>
        </div>
      </div>
      <div className="grid gap-0.5" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
        {cells.flatMap((row, r) =>
          row.map((cell, c) => (
            <input
              key={`${r}-${c}`}
              type="number"
              value={cell.value}
              onChange={(e) => updateCell(r, c, e.target.value)}
              className="h-6 w-full px-1 text-[11px] font-mono text-center rounded border border-border/60 bg-background/60 focus:border-primary/60 focus:outline-none"
            />
          )),
        )}
      </div>
    </div>
  );
}

/* ================================================================== *
 * P3: 诊断面板行 —— 单个出错节点 + 错误传播链提示
 * ================================================================== */
function DiagnosticRow({
  node,
  onClick,
}: {
  node: PipelineNode;
  onClick: () => void;
}) {
  const def = NODE_TYPES[node.type];
  const label = def ? t(def.labelKey) : String(node.type);
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left rounded-lg border border-destructive/40 bg-destructive/5 hover:bg-destructive/10 px-2.5 py-2 transition-colors"
    >
      <div className="flex items-center gap-1.5">
        <AlertCircle className="size-3 shrink-0 text-destructive" />
        <span className="text-[11px] font-medium text-foreground truncate flex-1">
          {label}
        </span>
        <span className="text-[9px] font-mono text-muted-foreground/60 truncate">
          {node.id.slice(0, 8)}
        </span>
      </div>
      <div className="mt-1 text-[10.5px] text-destructive/90 break-words leading-snug">
        {node.error}
      </div>
    </button>
  );
}

/* ================================================================== *
 * Node result footer — shows computed value
 * ================================================================== */
function NodeResultFooter({
  node,
  onPlotOpen,
}: {
  node: PipelineNode;
  onPlotOpen?: () => void;
}) {
  if (node.error) {
    return (
      <div className="flex items-center gap-1.5 text-[11px] text-destructive w-full">
        <AlertCircle className="size-3 shrink-0" />
        <span className="truncate">{node.error}</span>
      </div>
    );
  }
  // Plot output → mini sparkline (click to open in 2D panel)
  if (node.type === 'plot-output' && node.outputs?.plot) {
    const plot = node.outputs.plot as { samples: Array<[number, number]> };
    return <Sparkline samples={plot.samples} onClick={onPlotOpen} />;
  }
  // Simulink scope → mini time-series sparkline
  if (node.type === 'sim-scope' && node.outputs?.series) {
    const series = node.outputs.series as { t: number[]; y: number[] };
    return <Sparkline samples={series.t.map((t, i): [number, number] => [t, series.y[i] ?? 0])} onClick={onPlotOpen} />;
  }
  // All other results (number / string / MathNode / matrix / {latex}) →
  // unified MathRender (see MathRender.tsx).
  return <MathRender value={node.result} />;
}

/** Stable string key for a node result — used to detect meaningful changes. */
function resultKey(r: unknown): string {
  if (r === undefined || r === null) return '';
  if (typeof r === 'number' || typeof r === 'boolean') return String(r);
  if (typeof r === 'string') return r;
  if (r && typeof r === 'object') {
    if ('toTex' in (r as object)) {
      try { return (r as { toTex: () => string }).toTex(); } catch { /* fall through */ }
    }
    if ('toString' in (r as object)) {
      try { return String(r); } catch { /* fall through */ }
    }
  }
  return String(r);
}

/* ================================================================== *
 * Sparkline — mini curve preview for plot-output nodes
 * ================================================================== */
function Sparkline({
  samples,
  onClick,
}: {
  samples: Array<[number, number]>;
  onClick?: () => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    // Background grid
    ctx.strokeStyle = 'rgba(167, 139, 250, 0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, H / 2);
    ctx.lineTo(W, H / 2);
    ctx.stroke();

    if (samples.length === 0) return;
    const xs = samples.map((s) => s[0]);
    const ys = samples.map((s) => s[1]).filter((y) => Number.isFinite(y));
    if (ys.length === 0) return;
    const xMin = Math.min(...xs);
    const xMax = Math.max(...xs);
    const yMin = Math.min(...ys);
    const yMax = Math.max(...ys);
    const yRange = yMax - yMin || 1;

    // Curve
    ctx.strokeStyle = '#a78bfa';
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    let started = false;
    for (const [x, y] of samples) {
      if (!Number.isFinite(y)) {
        started = false;
        continue;
      }
      const px = ((x - xMin) / (xMax - xMin || 1)) * W;
      const py = H - ((y - yMin) / yRange) * H;
      if (!started) {
        ctx.moveTo(px, py);
        started = true;
      } else {
        ctx.lineTo(px, py);
      }
    }
    ctx.stroke();

    // Glow
    ctx.strokeStyle = 'rgba(167, 139, 250, 0.35)';
    ctx.lineWidth = 3;
    ctx.stroke();
  }, [samples]);

  return (
    <button
      type="button"
      onClick={onClick}
      title="点击在 2D 绘图面板中查看完整图像"
      className="block w-full cursor-pointer transition-opacity hover:opacity-80"
    >
      <canvas
        ref={ref}
        width={200}
        height={42}
        className="w-full h-[42px] rounded border border-violet-500/20 bg-violet-500/5"
      />
    </button>
  );
}

/* ================================================================== *
 * Simulation helpers
 * ================================================================== */
/**
 * 用定步长仿真求解器驱动图中所有仿真节点，并把结果写回节点。
 *  - sim-scope：outputs.series = { t, y }（供节点内迷你图 + 2D 绘图）。
 *  - 其它仿真节点：result 记录一个摘要（如积分器末值）。
 */
function runSimulationPipeline(
  nodes: PipelineNode[],
  edges: PipelineEdge[],
  config: { t0: number; tEnd: number; dt: number; method: 'euler' | 'rk4' | 'rkf45' },
): PipelineNode[] {
  const { series, t } = runSimulation(nodes, edges, config);
  return nodes.map((n) => {
    if (!isSimulationNode(n)) return n;
    const samples = series[n.id];
    if (n.type === 'sim-scope') {
      return {
        ...n,
        error: undefined,
        outputs: { series: { t, y: samples ?? [] } },
        result: { sim: true, samples: (samples ?? []).slice(-1)[0] ?? 0 },
      };
    }
    return {
      ...n,
      error: undefined,
      outputs: { last: (samples ?? []).slice(-1)[0] ?? 0 },
      result: { sim: true, last: (samples ?? []).slice(-1)[0] ?? 0 },
    };
  });
}

/* ================================================================== *
 * Node palette (add-node drawer)
 * ================================================================== */
function NodePalette({
  position, canvasSize, onClose, onPick,
}: {
  position: { x: number; y: number } | null;
  canvasSize: { w: number; h: number };
  onClose: () => void;
  onPick: (type: NodeType) => void;
}) {
  // Position: if `position` is set (from double-click), use it as a
  // floating menu. Otherwise dock to the left side as a drawer.
  const floating = position !== null;
  const PALETTE_W = 256;
  const PALETTE_H = 420;
  const style: React.CSSProperties = floating && position
    ? {
        left: Math.min(position.x, canvasSize.w - PALETTE_W - 8),
        top: Math.min(position.y, canvasSize.h - PALETTE_H - 8),
      }
    : { left: 12, top: 12, bottom: 12 };

  // Search filter — matches node type id or localized label (case-insensitive).
  const [paletteSearch, setPaletteSearch] = useState('');
  const query = paletteSearch.trim().toLowerCase();

  // ── 收藏 & 最近使用（localStorage 持久化，解决"节点太多太难找"）──────
  const FAV_KEY = 'omnimath-palette-favs';
  const RECENT_KEY = 'omnimath-palette-recent';
  const loadList = (key: string): NodeType[] => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string' && x in NODE_TYPES) : [];
    } catch {
      return [];
    }
  };
  const [favs, setFavs] = useState<NodeType[]>(() => loadList(FAV_KEY));
  const [recent, setRecent] = useState<NodeType[]>(() => loadList(RECENT_KEY));

  // ── 分组折叠：默认展开视觉/仿真/曲线等高频分类，其余折叠，避免长列表淹没。
  //    搜索时忽略折叠（下面渲染层判断）。
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const g of PALETTE_GROUPS) init[g.category] = !DEFAULT_EXPANDED_CATEGORIES.has(g.category);
    return init;
  });
  const isCollapsed = (key: string): boolean => (query ? false : !!collapsed[key]);
  const toggleGroup = (key: string) => setCollapsed((c) => ({ ...c, [key]: !c[key] }));
  const persistFavs = (list: NodeType[]) => {
    setFavs(list);
    try { localStorage.setItem(FAV_KEY, JSON.stringify(list)); } catch { /* ignore */ }
  };
  const toggleFav = (type: NodeType) => {
    persistFavs(favs.includes(type) ? favs.filter((x) => x !== type) : [...favs, type]);
  };
  const recordRecent = (type: NodeType) => {
    const next = [type, ...recent.filter((x) => x !== type)].slice(0, 8);
    setRecent(next);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  };

  const matchesQuery = (type: NodeType): boolean => {
    if (!query) return true;
    const def = NODE_TYPES[type];
    const label = t(def.labelKey).toLowerCase();
    return type.toLowerCase().includes(query) || label.includes(query);
  };

  type PaletteGroup = { pinned?: 'fav' | 'recent'; category: NodeCategory; types: NodeType[] };
  const filteredGroups = useMemo<PaletteGroup[]>(() => {
    const base: PaletteGroup[] = !query ? PALETTE_GROUPS as PaletteGroup[] : PALETTE_GROUPS
          .map((group) => ({
            ...group,
            types: group.types.filter((type) => {
              const def = NODE_TYPES[type];
              const label = t(def.labelKey).toLowerCase();
              return type.toLowerCase().includes(query) || label.includes(query);
            }),
          }))
          .filter((g) => g.types.length > 0);
    // 置顶"收藏"与"最近"分组（同样受搜索过滤）。
    const favGroup = favs.filter(matchesQuery);
    const recentGroup = recent.filter(matchesQuery);
    const pinned: PaletteGroup[] = [];
    if (favGroup.length > 0) pinned.push({ pinned: 'fav', category: 'input', types: favGroup });
    if (recentGroup.length > 0) pinned.push({ pinned: 'recent', category: 'output', types: recentGroup });
    return [...pinned, ...base];
  }, [query, favs, recent]);

  return (
    <>
      {/* Backdrop */}
      <div
        className="absolute inset-0 z-30"
        onPointerDown={(e) => { e.stopPropagation(); onClose(); }}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: -8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: -8 }}
        transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
        className={cn(
          'absolute z-40 glass-strong border border-border rounded-xl shadow-2xl',
          'w-64 flex flex-col max-h-[70vh] overflow-hidden',
        )}
        style={style}
        onPointerDown={(e) => e.stopPropagation()}
        onWheel={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-3 h-9 border-b border-border/60">
          <div className="flex items-center gap-1.5">
            <Plus className="size-3.5 text-primary" />
            <span className="text-[12px] font-semibold">{t('npAddNodeTitle')}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="size-5 grid place-items-center rounded text-muted-foreground hover:text-foreground hover:bg-accent"
          >
            <X className="size-3" />
          </button>
        </div>
        {/* Search input */}
        <div className="p-2 border-b border-border/60">
          <Input
            type="text"
            value={paletteSearch}
            onChange={(e) => setPaletteSearch(e.target.value)}
            placeholder="搜索节点..."
            className="h-7 text-[12px]"
            autoFocus
          />
        </div>
        {/* 滚动区：外层容器为 auto 高度（仅 max-h 封顶），flex-1 无法在 auto 高度
            容器内收缩，导致内容超出后被 overflow-hidden 裁剪而无法滚动。改为给滚动区
            自身一个确定的最大高度（70vh − 顶部标题栏/搜索框约 90px），使 overflow-y-auto
            可靠生效，同时保留"节点少时自适应收缩"的行为。
            注：刻意保留可见滚动条（不再用 scrollbar-none），让用户能明确看到并可拖拽，
            滚动查看下方节点，避免"看不到下面的节点"的困惑。 */}
        <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-2.5 max-h-[calc(70vh-90px)]">
          {filteredGroups.length === 0 && (
            <div className="text-center text-[11px] text-muted-foreground/70 py-6">
              无匹配节点
            </div>
          )}
          {filteredGroups.map((group) => {
            const groupKey = group.pinned ?? group.category;
            const _collapsed = isCollapsed(groupKey);
            return (
              <div key={groupKey}>
                <button
                  type="button"
                  onClick={() => toggleGroup(groupKey)}
                  className="w-full flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider mb-1 px-1 py-0.5 rounded hover:bg-accent/60 text-left"
                  style={{ color: CATEGORY_COLOR[group.category].text }}
                >
                  <span className={cn('size-1.5 rounded-full', CATEGORY_COLOR[group.category].stripe)} />
                  {group.pinned === 'fav' ? (
                    <span className="inline-flex items-center gap-1">
                      <Star className="size-2.5" /> 收藏
                    </span>
                  ) : group.pinned === 'recent' ? (
                    <span className="inline-flex items-center gap-1">
                      <Clock3 className="size-2.5" /> 最近使用
                    </span>
                  ) : (
                    t(CATEGORY_LABEL_KEY[group.category])
                  )}
                  <ChevronDown
                    className={cn('size-3 ml-auto transition-transform', _collapsed && 'rotate-180')}
                  />
                </button>
                {!group.pinned && (
                  <span className="text-[9px] text-muted-foreground/60 -mt-1 mb-1 px-1 block">
                    {group.types.length} 项
                  </span>
                )}
                {!_collapsed && (
                  <div className="space-y-0.5">
                    {group.types.map((type) => {
                      const def = NODE_TYPES[type];
                      const Icon = ICONS[def.icon] ?? Hash;
                      const cat = CATEGORY_COLOR[def.category];
                      const isFav = favs.includes(type);
                      return (
                        <button
                          key={type}
                          type="button"
                          onClick={() => { recordRecent(type); onPick(type); }}
                          className="group/row w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[12px] text-left transition-all hover:bg-accent hover:translate-x-0.5 interactive-card"
                        >
                          <div className={cn('size-6 grid place-items-center rounded-md shrink-0', cat.bg)}>
                            <Icon className={cn('size-3.5', cat.text)} />
                          </div>
                          <span className="flex-1 truncate">{t(def.labelKey)}</span>
                          <span
                            role="button"
                            tabIndex={-1}
                            title={isFav ? '取消收藏' : '收藏'}
                            onClick={(e) => { e.stopPropagation(); toggleFav(type); }}
                            onPointerDown={(e) => e.stopPropagation()}
                            className={cn(
                              'size-5 grid place-items-center rounded opacity-0 transition-opacity group-hover/row:opacity-100',
                              isFav ? 'opacity-100 text-amber-400' : 'text-muted-foreground hover:text-amber-400 hover:bg-accent',
                            )}
                          >
                            <Star className={cn('size-3', isFav && 'fill-amber-400')} />
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </motion.div>
    </>
  );
}

/* ================================================================== *
 * Empty state
 * ================================================================== */
function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="absolute inset-0 grid place-items-center pointer-events-none">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="text-center pointer-events-auto"
      >
        <motion.div
          animate={{ y: [0, -8, 0], rotate: [0, 4, -4, 0] }}
          transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
          className="grid place-items-center size-16 rounded-2xl bg-primary/8 border border-primary/20 mb-4 mx-auto"
          style={{ boxShadow: '0 0 32px oklch(0.7 0.15 165 / 18%)' }}
        >
          <Workflow className="size-7 text-primary/70" />
        </motion.div>
        <p className="text-[14px] font-medium text-foreground/80 mb-1">
          {t('pipelineTitle')}
        </p>
        <p className="text-[12px] text-muted-foreground mb-4">
          {t('npDoubleClickHint')}
        </p>
        <Button
          variant="outline"
          size="sm"
          className="h-8 px-3 gap-1.5 text-[12px]"
          onClick={onAdd}
        >
          <Plus className="size-3.5" />
          {t('npAddNodeTitle')}
        </Button>
      </motion.div>
    </div>
  );
}
