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
import { t } from '@/lib/i18n';
import type { TranslationDict } from '@/lib/i18n';
import { toast } from 'sonner';
import { useWorkbenchStore, type PreviewTab } from '@/lib/store/workbench';
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
} from './pipelineEngine';
import { runSimulation, isSimulationNode, type SimSeries } from './simulationEngine';
import { PIPELINE_TEMPLATES, loadTemplate } from './pipelineTemplates';
import {
  PortPositionsProvider,
  usePortPositions,
  usePortReporter,
  portKey,
} from './DomMeasuredNode';
import { EdgeRenderer } from './EdgeRenderer';
import { MathRender } from './MathRender';

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
  const addPlot = useWorkbenchStore((s) => s.addPlot);
  const addResult = useWorkbenchStore((s) => s.addResult);
  const variables = useWorkbenchStore((s) => s.variables);
  const setViewMode = useWorkbenchStore((s) => s.setViewMode);
  const setActivePreviewTab = useWorkbenchStore((s) => s.setActivePreviewTab);

  // DOM-measured port offsets (populated by PortLabel via usePortReporter).
  // Falls back to fixed-constant estimates before measurements arrive.
  const portPositions = usePortPositions();
  // Mirror to a ref so event-handler callbacks (which only need the value
  // at event time, not reactively) don't have to list portPositions in
  // their deps — that would invalidate them on every measurement update.
  const portPositionsRef = useRef(portPositions);
  useEffect(() => { portPositionsRef.current = portPositions; }, [portPositions]);

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

  // Connection drag state.
  const [connecting, setConnecting] = useState<{
    fromNode: string;
    fromPort: string;
    cursor: { x: number; y: number };
  } | null>(null);

  // Port snapping — when the cursor is near an input port while dragging a
  // connection, we snap the endpoint to the port center and highlight it.
  const [snapTarget, setSnapTarget] = useState<{ nodeId: string; portId: string } | null>(null);

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

  // Computing pulse — bumps on every execute to trigger node glow.
  const [computeTick, setComputeTick] = useState(0);

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

  /* ── Execution ───────────────────────────────────────────────── */
  // Compute a sensible y-range from a sampled plot so the 2D panel can
  // show the curve without clipping (previously hard-coded to [-5, 5]).
  const computeYRange = useCallback(
    (samples: Array<[number, number]>): [number, number] => {
      let min = Infinity;
      let max = -Infinity;
      for (const [, y] of samples) {
        if (Number.isFinite(y)) {
          if (y < min) min = y;
          if (y > max) max = y;
        }
      }
      if (!Number.isFinite(min) || !Number.isFinite(max)) return [-5, 5];
      if (min === max) {
        const pad = Math.max(1, Math.abs(min) * 0.1);
        return [min - pad, max + pad];
      }
      const pad = (max - min) * 0.1;
      return [min - pad, max + pad];
    },
    [],
  );

  // Push every plot-output node's curve to the workbench store so the
  // 2D panel renders it. Used both by manual run and auto-execute.
  // Returns the number of plots pushed (P2: 用于判断是否要切到 plot2d tab).
  const pushPlotsToWorkbench = useCallback(
    (executed: PipelineNode[]): number => {
      let pushed = 0;
      for (const n of executed) {
        if (n.type === 'plot-output' && n.outputs?.plot) {
          const plot = n.outputs.plot as {
            expr: string;
            xMin: number;
            xMax: number;
            samples: Array<[number, number]>;
          };
          addPlot({
            expression: plot.expr,
            xRange: [plot.xMin, plot.xMax],
            yRange: computeYRange(plot.samples ?? []),
            color: '#a78bfa',
            plotType: 'cartesian',
            visible: true,
            width: 2,
          });
          pushed++;
        }
      }
      return pushed;
    },
    [addPlot, computeYRange],
  );

  const pushCurvesToWorkbench = useCallback((nodes: PipelineNode[]) => {
    const store = useWorkbenchStore.getState ? useWorkbenchStore.getState() : null;
    if (!store?.clearCurveSets) return;
    store.clearCurveSets();
    for (const node of nodes) {
      if (node.type !== 'plot-curves') continue;
      const out = node.outputs?.curves;
      if (!out || typeof out !== 'object') continue;
      const o = out as Record<string, unknown>;
      const curves = Array.isArray((o as any).curves) ? (o as any).curves : [];
      const width = typeof (o as any).width === 'number' ? (o as any).width : 0;
      const height = typeof (o as any).height === 'number' ? (o as any).height : 0;
      if (curves.length <= 0 || width <= 0 || height <= 0) continue;
      const color = typeof node.config.color === 'string' ? node.config.color : '#a78bfa';
      const strokeWidth = typeof node.config.width === 'number' ? node.config.width : 2;
      // 容错增强：把 curve-fit 产出的候选档位 + 原始折线转发到 2D 画布，
      // 供「人工修正」面板「切换候选结果 / 调整参数重新拟合」使用。
      const candidates = Array.isArray((o as any).candidates) ? (o as any).candidates : undefined;
      const originalPolylines = Array.isArray((o as any).originalPolylines)
        ? (o as any).originalPolylines
        : undefined;
      store.addCurveSet({
        curves,
        width,
        height,
        color,
        strokeWidth,
        flipX: !!node.config.flipX,
        flipY: !!node.config.flipY,
        candidates,
        originalPolylines,
        presetId: 'balanced',
      } as any);
    }
    // 视频/姿态 → 曲线动画：把完整逐帧序列推送到 2D 画布，由画布内置的
    // 时间轴滑块/播放控制逐帧播放（frames + fps）；`curves` 取第 0 帧作为静态回退。
    for (const node of nodes) {
      if (node.type !== 'curve-animate') continue;
      const anim = node.outputs?.animation as
        | { frames?: unknown[]; width?: number; height?: number; color?: string; strokeWidth?: number; fps?: number }
        | undefined;
      if (!anim || !Array.isArray(anim.frames) || anim.frames.length === 0) continue;
      const firstFrame = anim.frames[0];
      if (!Array.isArray(firstFrame)) continue;
      const width = typeof anim.width === 'number' ? anim.width : 0;
      const height = typeof anim.height === 'number' ? anim.height : 0;
      if (firstFrame.length <= 0 || width <= 0 || height <= 0) continue;
      const frames = anim.frames.filter((f): f is unknown[] => Array.isArray(f));
      store.addCurveSet({
        curves: firstFrame,
        frames,
        fps: typeof anim.fps === 'number' ? anim.fps : 30,
        width,
        height,
        color: anim.color ?? '#a78bfa',
        strokeWidth: anim.strokeWidth ?? 2,
        flipY: true,
        flipX: false,
      } as any);
    }
  }, []);

  const runPipeline = useCallback(async () => {
    try {
      const ctx = {
        variables: Object.fromEntries(
          Object.entries(variables).map(([k, v]) => [k, v.value]),
        ),
      };

      // Simulink-style 仿真：若图中存在仿真节点，走定步长求解器，
      // 否则走常规单次数据流 pipeline。
      const hasSim = nodes.some(isSimulationNode);
      let executed: PipelineNode[];
      if (hasSim) {
        executed = runSimulationPipeline(nodes, edges, simConfig);
        setNodes(executed);
        setComputeTick((n) => n + 1);
        // 把 scope 时序以曲线集形式发送到 2D 绘图面板。
        const scopes = executed.filter((n) => n.type === 'sim-scope' && n.outputs?.series);
        if (scopes.length > 0) {
          const store = useWorkbenchStore.getState();
          store.clearCurveSets();
          scopes.forEach((n) => {
            const series = n.outputs?.series as { t: number[]; y: number[] } | undefined;
            if (!series || series.t.length < 2) return;
            const pts = series.t.map((t, i) => ({ x: t, y: series.y[i] ?? 0 }));
            store.addCurveSet({
              curves: [{ segments: [{ points: pts }], color: '#a78bfa', width: 2 }],
              width: 1,
              height: 1,
              color: '#a78bfa',
              strokeWidth: 2,
              flipX: false,
              flipY: false,
            } as any);
          });
          setViewMode('workbench');
          setActivePreviewTab('plot2d');
        }
        return;
      }

      executed = await executePipeline(nodes, edges, ctx);

      // Side-effects: plot-output nodes push plots to the workbench store;
      // display nodes push results to history.
      const plotsPushed = pushPlotsToWorkbench(executed);
      pushCurvesToWorkbench(executed);
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

      // P2: 若有 plot 输出，自动切回 workbench 视图并选中 plot2d tab，
      // 让用户立刻看到结果，而不用手动找预览面板。
      if (plotsPushed > 0) {
        setViewMode('workbench');
        setActivePreviewTab('plot2d');
      }
    } catch (err) {
      console.error('[NodePipeline] runPipeline error:', err);
      toast.error('流水线执行失败', {
        description: (err as Error).message,
        duration: 4000,
      });
    }
  }, [nodes, edges, variables, simConfig, pushPlotsToWorkbench, pushCurvesToWorkbench, addResult, setViewMode, setActivePreviewTab]);

  /* ── P3 执行到选中节点 ─────────────────────────────────────── */
  const runToSelected = useCallback(async () => {
    if (!selectedId) {
      toast.warning('请先选中一个节点', { duration: 2500 });
      return;
    }
    try {
      const ctx = {
        variables: Object.fromEntries(
          Object.entries(variables).map(([k, v]) => [k, v.value]),
        ),
      };
      const executed = await executePipeline(nodes, edges, ctx, { stopAt: selectedId });
      setNodes(executed);
      setComputeTick((n) => n + 1);
      pushCurvesToWorkbench(executed);
      toast.success('已执行到选中节点', {
        description: '下游节点已暂停，可继续排查',
        duration: 2500,
      });
    } catch (err) {
      toast.error('执行到节点失败', { description: (err as Error).message, duration: 4000 });
    }
  }, [selectedId, nodes, edges, variables, pushCurvesToWorkbench]);

  /* ── Auto-execute on graph / config change (debounced) ───────── */
  useEffect(() => {
    const id = setTimeout(() => {
      (async () => {
        try {
          const ctx = {
            variables: Object.fromEntries(
              Object.entries(variables).map(([k, v]) => [k, v.value]),
            ),
          };
          const executed = await executePipeline(nodes, edges, ctx);
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
          pushCurvesToWorkbench(executed);
        } catch (err) {
          // Auto-execute failures should be silent — the user didn't trigger
          // them, and frequent toasts would be annoying. Log for debugging.
          console.warn('[NodePipeline] auto-execute error:', err);
        }
      })().catch((err) => {
        console.warn('[NodePipeline] auto-execute unhandled promise error:', err);
      });
    }, 180);
    return () => clearTimeout(id);
  }, [nodes, edges, variables, pushCurvesToWorkbench]);

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
    setNodes(loaded.nodes);
    setEdges(loaded.edges);
    setSelectedId(null);
    setSelectedIds(new Set());
    // Frame the freshly-loaded graph so it lands in view.
    const next = fitViewFor(loaded.nodes, canvasSize);
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
    const COL_GAP = 56;
    const ROW_GAP = 40;
    const START_X = 40;
    const START_Y = 60;
    const positions: Record<string, { x: number; y: number }> = {};
    const sortedLayers = [...layers.keys()].sort((a, b) => a - b);
    sortedLayers.forEach((layer, col) => {
      const ids = layers.get(layer)!;
      const x = START_X + col * (NODE_WIDTH + COL_GAP);
      // 同层节点垂直居中分布。
      const totalH = ids.length * APPROX_NODE_H + (ids.length - 1) * ROW_GAP;
      let y = START_Y;
      ids.forEach((id, i) => {
        positions[id] = { x, y: y };
        y += APPROX_NODE_H + ROW_GAP;
      });
    });
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

  /* ── Connection drag handlers ────────────────────────────────── */
  const startConnection = useCallback(
    (nodeId: string, portId: string, e: React.PointerEvent) => {
      e.stopPropagation();
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return;
      const pos = getPortPosition(node, portId, true, portPositionsRef.current);
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

      // ── Marquee selection: Shift+drag on empty canvas ──────────
      // Draws a rectangle and selects all nodes whose bbox intersects.
      // Always additive (Shift = "add to selection", ComfyUI/Blender style).
      if (e.shiftKey && !connecting) {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        const v = viewRef.current;
        // Convert screen → world coords (account for pan + zoom).
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
          // Collision detection: select nodes intersecting the marquee rect.
          const m = marqueeRef.current;
          if (m) {
            const x1 = Math.min(m.start.x, m.current.x);
            const y1 = Math.min(m.start.y, m.current.y);
            const x2 = Math.max(m.start.x, m.current.x);
            const y2 = Math.max(m.start.y, m.current.y);
            // Only count as a click (not a drag) if the rect is larger than
            // a few pixels — otherwise it's just a Shift+click on empty.
            const isRealDrag = Math.abs(x2 - x1) > 3 || Math.abs(y2 - y1) > 3;
            if (isRealDrag) {
              setSelectedIds((prev) => {
                const next = new Set(prev);
                for (const n of nodesRef.current) {
                  const nx1 = n.position.x;
                  const ny1 = n.position.y;
                  const nx2 = nx1 + NODE_WIDTH;
                  const ny2 = ny1 + APPROX_NODE_H;
                  // AABB intersection test.
                  if (!(nx1 > x2 || nx2 < x1 || ny1 > y2 || ny2 < y1)) {
                    next.add(n.id);
                  }
                }
                return next;
              });
            }
          }
          setMarquee(null);
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        return;
      }

      // ── Middle mouse button always pans the canvas ──────────────
      if (e.button === 1) {
        startCanvasPan(e.clientX, e.clientY);
        return;
      }

      // ── Default: pan the canvas ─────────────────────────────────
      setSelectedId(null);
      setSelectedIds(new Set());
      setSelectedEdgeId(null);
      if (connecting) {
        setConnecting(null);
        return;
      }
      startCanvasPan(e.clientX, e.clientY);
    },
    [connecting],
  );

  /* ── Wheel zoom + vertical pan ───────────────────────────────── */
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      setView((v) => {
        if (e.shiftKey) {
          // Shift + wheel: pan vertically (up/down view control).
          const panSpeed = 1.2;
          return { ...v, y: v.y - e.deltaY * panSpeed };
        }
        const delta = -e.deltaY * 0.0015;
        const next = Math.min(2, Math.max(0.4, v.scale * (1 + delta)));
        // Zoom toward cursor: adjust translate so the world point under
        // the cursor stays fixed.
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
        const pos = getPortPosition(n, port.id, false, portPositions);
        if (pos) ports.push({ nodeId: n.id, portId: port.id, x: pos.x, y: pos.y, type: port.type });
      }
    }
    return ports;
  }, [nodes, connecting, portPositions]);

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
        const p1 = getPortPosition(from, e.fromPort, true, portPositions);
        const p2 = getPortPosition(to, e.toPort, false, portPositions);
        if (!p1 || !p2) return null;
        // 边随源端口数据类型着色（类 Unreal Blueprint）。
        const fromDef = NODE_TYPES[from.type];
        const fromPort = fromDef?.outputs.find((p) => p.id === e.fromPort);
        const color = fromPort ? PORT_TYPE_STYLE[fromPort.type]?.border : undefined;
        return { edge: e, from: p1, to: p2, color };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [edges, nodeById, portPositions]);

  const pendingPath = useMemo(() => {
    if (!connecting) return null;
    const from = nodeById.get(connecting.fromNode);
    if (!from) return null;
    const p1 = getPortPosition(from, connecting.fromPort, true, portPositions);
    if (!p1) return null;
    return { from: p1, to: connecting.cursor };
  }, [connecting, nodeById, portPositions]);

  /* ── Render ──────────────────────────────────────────────────── */
  return (
    <div className="flex flex-col h-full w-full bg-background">
      <PipelineToolbar
        onBack={() => setViewMode('workbench')}
        onRun={runPipeline}
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
      />

      <div
        ref={canvasRef}
        className="relative flex-1 min-h-0 overflow-hidden grid-bg"
        onPointerDown={onCanvasPointerDown}
        onDoubleClick={onCanvasDoubleClick}
        onContextMenu={onCanvasContextMenu}
      >
        {/* Animated parallax dots overlay */}
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none grid-bg-dots opacity-40"
          style={{ animationDuration: '30s' }}
        />

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
          />

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
                  onSelect={(e) => selectNode(node.id, e)}
                  onConfigChange={(patch) => updateConfig(node.id, patch)}
                  onStartConnection={(portId, e) => startConnection(node.id, portId, e)}
                  onCompleteConnection={(portId, type) => completeConnection(node.id, portId, type)}
                  variables={Object.keys(variables)}
                  onPlotOpen={() => {
                    // Ensure the latest curve is pushed to the 2D panel
                    // (covers the auto-execute path which doesn't push).
                    pushPlotsToWorkbench([node]);
                    setViewMode('workbench');
                    setActivePreviewTab('plot2d');
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
  onOpenSimConfig: () => void;
  onLoadTemplate: (id: string) => void;
  onAutoLayout: () => void;
  nodeCount: number;
  edgeCount: number;
  selectedCount: number;
  errorCount: number;
  diagnosticsOpen: boolean;
}

function PipelineToolbar({
  onBack, onRun, onRunToSelected, onToggleDiagnostics, onClear, onExport,
  onZoomIn, onZoomOut, onResetView, onCenter, onOpenSimConfig, onLoadTemplate, onAutoLayout,
  onAddNode, onDeleteSelected,
  nodeCount, edgeCount, selectedCount, errorCount, diagnosticsOpen,
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
      </div>

      <div className="flex items-center gap-1">
        <Button
          variant="default"
          size="sm"
          className="h-8 px-3 gap-1.5 text-[12px] bg-primary/90 hover:bg-primary"
          onClick={onRun}
        >
          <Play className="size-3.5" />
          {t('npRunAll')}
        </Button>
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
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuLabel>示例工作流</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {PIPELINE_TEMPLATES.map((tpl) => (
              <DropdownMenuItem key={tpl.id} onSelect={() => onLoadTemplate(tpl.id)} className="flex flex-col items-start gap-0.5 py-2">
                <span className="text-[12px] font-medium">{tpl.name}</span>
                <span className="text-[10px] text-muted-foreground leading-snug">{tpl.description}</span>
              </DropdownMenuItem>
            ))}
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
  onSelect: (e: React.PointerEvent) => void;
  onConfigChange: (patch: Record<string, unknown>) => void;
  onStartConnection: (portId: string, e: React.PointerEvent) => void;
  onCompleteConnection: (portId: string, type: PortDataType) => void;
  variables: string[];
  onPlotOpen?: () => void;
}

function NodeCard({
  node, selected, multiSelected, computeTick, isConnecting, connectingFromType, inErrorChain, snapPortId,
  onPointerDownHeader, onDelete, onSelect,
  onConfigChange, onStartConnection, onCompleteConnection,
  variables, onPlotOpen,
}: NodeCardProps) {
  const def = NODE_TYPES[node.type];
  // Hooks must run unconditionally — the defensive early return below
  // (unknown node type) previously skipped them, violating the rules of
  // hooks. cardRef stays unattached for error cards, so the glow effect
  // is a no-op there.
  const cardRef = useRef<HTMLDivElement>(null);

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
      initial={{ opacity: 0, scale: 0.92, y: -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
      className={cn(
        'absolute node-card group overflow-visible',
        selected && 'selected',
        multiSelected && 'ring-2 ring-blue-500 ring-offset-0',
        inErrorChain && !selected && 'with-error-chain',
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
          />
        ))}
      </div>

      {/* Config section */}
      <div className="px-3 pb-2 pt-1">
        <NodeConfig node={node} onConfigChange={onConfigChange} variables={variables} />
      </div>

      {/* Variable dependency badge (N1 integration)
          仅当节点表达式引用了用户变量时才显示。
          例如 expression-input 写了 "a*x+b"，且 a/b 是用户变量，
          这里显示 "依赖: a, b"。让用户直观看到节点和变量的联动关系。 */}
      <NodeDependencyBadge node={node} variables={variables} />

      {/* Result footer */}
      <div
        className={cn(
          'border-t border-border/60 px-3 py-2 grid place-items-center min-h-[58px]',
          node.error ? 'bg-destructive/8' : 'bg-primary/5',
        )}
      >
        <NodeResultFooter node={node} onPlotOpen={onPlotOpen} />
      </div>
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
}

function PortLabel({
  nodeId, port, isOutput, y, connected, isConnecting, connectingFromType, snapped,
  onStartConnection, onCompleteConnection,
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
  usePortReporter(nodeId, port.id, isOutput, dotRef);
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
const PALETTE_GROUPS: Array<{ category: NodeCategory; types: NodeType[] }> = [
  { category: 'input', types: ['number-input', 'expression-input', 'variable', 'constant'] },
  { category: 'operation', types: ['arithmetic'] },
  { category: 'function', types: ['function-apply', 'log-base', 'hypotenuse', 'sign', 'degrees-radians'] },
  { category: 'plot', types: ['plot-output'] },
  { category: 'matrix', types: ['matrix-input', 'matrix-op', 'matrix-multiply', 'matrix-decompose'] },
  { category: 'calculus', types: ['derivative', 'integrate', 'symbolic-integrate', 'simplify', 'solve-equation', 'evaluate', 'taylor-series', 'ode-solve', 'limit'] },
  { category: 'mapping', types: ['negate', 'reciprocal', 'clamp', 'map-range', 'lerp', 'min-max', 'compare'] },
  { category: 'vector', types: ['vec2-compose', 'vec2-decompose', 'dot-product', 'cross-product', 'vec-magnitude', 'vec-normalize', 'vec-rotate'] },
  { category: 'curve', types: ['parametric-curve', 'curve-resample', 'curve-transform', 'curve-merge', 'curve-length'] },
  { category: 'statistics', types: ['random-sample', 'mean-variance', 'histogram', 'data-input'] },
  { category: 'logic', types: ['switch', 'threshold-gate'] },
  { category: 'output', types: ['display', 'svg-export'] },
  { category: 'vision', types: ['image-input', 'grayscale-threshold', 'edge-detect', 'contour-trace', 'fine-outline', 'curve-fit', 'plot-curves', 'video-input', 'frame-extract', 'pose-track', 'curve-animate'] },
  { category: 'simulation', types: ['sim-clock', 'sim-constant', 'sim-sine', 'sim-step', 'sim-ramp', 'sim-pulse', 'sim-noise', 'sim-sum', 'sim-gain', 'sim-product', 'sim-saturation', 'sim-first-order', 'sim-integrator', 'sim-derivative', 'sim-delay', 'sim-scope'] },
];

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
          'w-64',
        )}
        style={style}
        onPointerDown={(e) => e.stopPropagation()}
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
        <div className="overflow-y-auto max-h-[60vh] p-2 space-y-2.5 scrollbar-none">
          {filteredGroups.length === 0 && (
            <div className="text-center text-[11px] text-muted-foreground/70 py-6">
              无匹配节点
            </div>
          )}
          {filteredGroups.map((group) => (
            <div key={group.pinned ?? group.category}>
              <div className={cn(
                'text-[10px] font-semibold uppercase tracking-wider mb-1 px-1 flex items-center gap-1.5',
                CATEGORY_COLOR[group.category].text,
              )}>
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
              </div>
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
            </div>
          ))}
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
