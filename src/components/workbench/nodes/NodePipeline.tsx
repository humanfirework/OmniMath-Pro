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
  LayoutTemplate,
  Workflow,
  X,
  Hash,
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
import { useWorkbenchStore } from '@/lib/store/workbench';
import { FormulaRenderer } from '@/components/workbench/FormulaRenderer';
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
  type PipelineNode,
  type PipelineEdge,
  type NodeType,
  type NodeCategory,
  type PortDef,
  type PortDataType,
} from './pipelineEngine';
import { PIPELINE_TEMPLATES, loadTemplate } from './pipelineTemplates';

/* ------------------------------------------------------------------ *
 * Icon map — node type → lucide component
 * ------------------------------------------------------------------ */
const ICONS: Record<string, LucideIcon> = {
  Hash, Type, Variable, Plus, FunctionSquare, LineChart,
  Grid3x3, Calculator, Sigma, Activity, Equal, Monitor,
};

/* ------------------------------------------------------------------ *
 * Category colors — drives the left stripe + icon tint
 * ------------------------------------------------------------------ */
const CATEGORY_COLOR: Record<NodeCategory, { stripe: string; text: string; bg: string }> = {
  input:     { stripe: 'bg-teal-500',    text: 'text-teal-500',    bg: 'bg-teal-500/10' },
  operation: { stripe: 'bg-amber-500',   text: 'text-amber-500',   bg: 'bg-amber-500/10' },
  function:  { stripe: 'bg-rose-500',    text: 'text-rose-500',    bg: 'bg-rose-500/10' },
  plot:      { stripe: 'bg-violet-500',  text: 'text-violet-500',  bg: 'bg-violet-500/10' },
  matrix:    { stripe: 'bg-emerald-500', text: 'text-emerald-500', bg: 'bg-emerald-500/10' },
  calculus:  { stripe: 'bg-orange-500',  text: 'text-orange-500',  bg: 'bg-orange-500/10' },
  output:    { stripe: 'bg-cyan-500',    text: 'text-cyan-500',    bg: 'bg-cyan-500/10' },
};

const CATEGORY_LABEL_KEY: Record<NodeCategory, keyof TranslationDict> = {
  input: 'npCategoryInput',
  operation: 'npCategoryOp',
  function: 'npCategoryFunction',
  plot: 'npCategoryPlot',
  matrix: 'npCategoryMatrix',
  calculus: 'npCategoryCalculus',
  output: 'npCategoryOutput',
};

/* ------------------------------------------------------------------ *
 * Persistence
 * ------------------------------------------------------------------ */
const STORAGE_KEY = 'omnimath-pipeline-v1';

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
    return {
      nodes: Array.isArray(data.nodes) ? data.nodes : [],
      edges: Array.isArray(data.edges) ? data.edges : [],
    };
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
      JSON.stringify({ nodes: serialisableNodes, edges }),
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

/* ================================================================== *
 * Main component
 * ================================================================== */
export function NodePipeline() {
  const setEditorContent = useWorkbenchStore((s) => s.setEditorContent);
  const addPlot = useWorkbenchStore((s) => s.addPlot);
  const addResult = useWorkbenchStore((s) => s.addResult);
  const variables = useWorkbenchStore((s) => s.variables);
  const setViewMode = useWorkbenchStore((s) => s.setViewMode);
  const setActivePreviewTab = useWorkbenchStore((s) => s.setActivePreviewTab);

  // Pipeline state — lazy-init from localStorage (safe on client).
  const [nodes, setNodes] = useState<PipelineNode[]>(() => loadState()?.nodes ?? []);
  const [edges, setEdges] = useState<PipelineEdge[]>(() => loadState()?.edges ?? []);
  const [selectedId, setSelectedId] = useState<string | null>(null);
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
  const pushPlotsToWorkbench = useCallback(
    (executed: PipelineNode[]) => {
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
        }
      }
    },
    [addPlot, computeYRange],
  );

  const runPipeline = useCallback(() => {
    const ctx = {
      variables: Object.fromEntries(
        Object.entries(variables).map(([k, v]) => [k, v.value]),
      ),
    };
    const executed = executePipeline(nodes, edges, ctx);
    setNodes(executed);
    setComputeTick((n) => n + 1);

    // Side-effects: plot-output nodes push plots to the workbench store;
    // display nodes push results to history.
    pushPlotsToWorkbench(executed);
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
  }, [nodes, edges, variables, pushPlotsToWorkbench, addResult]);

  /* ── Auto-execute on graph / config change (debounced) ───────── */
  useEffect(() => {
    const id = setTimeout(() => {
      const ctx = {
        variables: Object.fromEntries(
          Object.entries(variables).map(([k, v]) => [k, v.value]),
        ),
      };
      const executed = executePipeline(nodes, edges, ctx);
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
    }, 120);
    return () => clearTimeout(id);
  }, [nodes, edges, variables]);

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
      setPaletteOpen(false);
      setPalettePos(null);
    },
    [nodes.length],
  );

  /* ── Multi-select aware node selection ───────────────────────── */
  const selectNode = useCallback(
    (nodeId: string, e: React.PointerEvent | React.MouseEvent) => {
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
  }, [canvasSize]);

  /* ── Fit view to all nodes ───────────────────────────────────── */
  const fitView = useCallback(() => {
    const next = fitViewFor(nodes, canvasSize);
    if (next) setView(next);
  }, [nodes, canvasSize]);

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
      const pos = getPortPosition(node, portId, true);
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
    [connecting, nodes],
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
        const pos = getPortPosition(n, port.id, false);
        if (pos) ports.push({ nodeId: n.id, portId: port.id, x: pos.x, y: pos.y, type: port.type });
      }
    }
    return ports;
  }, [nodes, connecting]);

  const allInputPortsRef = useRef(allInputPorts);
  useEffect(() => { allInputPortsRef.current = allInputPorts; }, [allInputPorts]);

  const completeConnectionRef = useRef(completeConnection);
  useEffect(() => { completeConnectionRef.current = completeConnection; }, [completeConnection]);

  /* ── Connecting: follow cursor + snap to nearby input ports ──── */
  useEffect(() => {
    if (!connecting) return;
    const SNAP_DIST = 14; // local-space px — snaps when cursor within this.
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
        if (selectedIds.size > 0) {
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
        setConnecting(null);
        setPaletteOpen(false);
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
  }, [selectedId, selectedIds, deleteNode, deleteSelected, setView]);

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

  const edgePaths = useMemo(() => {
    return edges
      .map((e) => {
        const from = nodeById.get(e.from);
        const to = nodeById.get(e.to);
        if (!from || !to) return null;
        const p1 = getPortPosition(from, e.fromPort, true);
        const p2 = getPortPosition(to, e.toPort, false);
        if (!p1 || !p2) return null;
        return { edge: e, from: p1, to: p2 };
      })
      .filter((x): x is { edge: PipelineEdge; from: { x: number; y: number }; to: { x: number; y: number } } => x !== null);
  }, [edges, nodeById]);

  const pendingPath = useMemo(() => {
    if (!connecting) return null;
    const from = nodeById.get(connecting.fromNode);
    if (!from) return null;
    const p1 = getPortPosition(from, connecting.fromPort, true);
    if (!p1) return null;
    return { from: p1, to: connecting.cursor };
  }, [connecting, nodeById]);

  /* ── Render ──────────────────────────────────────────────────── */
  return (
    <div className="flex flex-col h-full w-full bg-background">
      <PipelineToolbar
        onBack={() => setViewMode('workbench')}
        onRun={runPipeline}
        onClear={clearAll}
        onExport={exportScript}
        onZoomIn={() => setView((v) => ({ ...v, scale: Math.min(2, v.scale * 1.2) }))}
        onZoomOut={() => setView((v) => ({ ...v, scale: Math.max(0.4, v.scale / 1.2) }))}
        onResetView={() => setView({ x: 40, y: 40, scale: 1 })}
        onAddNode={() => { setPalettePos(null); setPaletteOpen(true); }}
        onDeleteSelected={deleteSelected}
        nodeCount={nodes.length}
        edgeCount={edges.length}
        selectedCount={selectedIds.size}
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
          {/* Edge layer */}
          <svg
            className="absolute top-0 left-0 overflow-visible pointer-events-none"
            width={1}
            height={1}
            style={{ zIndex: 1 }}
          >
            <defs>
              <linearGradient id="edge-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="oklch(0.7 0.15 165)" stopOpacity={0.9} />
                <stop offset="100%" stopColor="oklch(0.78 0.15 75)" stopOpacity={0.9} />
              </linearGradient>
              <linearGradient id="edge-gradient-active" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="oklch(0.7 0.15 165)" stopOpacity={1} />
                <stop offset="100%" stopColor="oklch(0.7 0.15 165)" stopOpacity={1} />
              </linearGradient>
            </defs>

            {edgePaths.map(({ edge, from, to }) => (
              <EdgePath
                key={edge.id}
                edge={edge}
                from={from}
                to={to}
                onDelete={() => setEdges((prev) => prev.filter((e) => e.id !== edge.id))}
                selected={selectedId === edge.from || selectedId === edge.to}
              />
            ))}

            {pendingPath && (
              <path
                d={bezierPath(pendingPath.from, pendingPath.to)}
                fill="none"
                stroke="oklch(0.7 0.15 165)"
                strokeWidth={2}
                strokeDasharray="6 4"
                className="animate-pulse-subtle"
                opacity={0.85}
              />
            )}

            {/* Marquee selection rectangle (Shift+drag on empty canvas) */}
            {marquee && (
              <rect
                x={Math.min(marquee.start.x, marquee.current.x)}
                y={Math.min(marquee.start.y, marquee.current.y)}
                width={Math.abs(marquee.current.x - marquee.start.x)}
                height={Math.abs(marquee.current.y - marquee.start.y)}
                fill="oklch(0.7 0.15 165 / 0.08)"
                stroke="oklch(0.7 0.15 165 / 0.7)"
                strokeWidth={1 / view.scale}
                strokeDasharray={`${4 / view.scale} ${2 / view.scale}`}
                className="pointer-events-none"
              />
            )}
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

        {/* Zoom indicator + control hints */}
        <div className="absolute bottom-3 right-3 flex items-center gap-1.5 px-2 py-1 rounded-md glass border border-border text-[11px] text-muted-foreground pointer-events-none">
          <ZoomIn className="size-3" />
          <span className="font-mono">{Math.round(view.scale * 100)}%</span>
        </div>
        <div className="absolute bottom-3 left-3 hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-md glass border border-border text-[10px] text-muted-foreground/80 pointer-events-none">
          <span>滚轮缩放 · Shift+滚轮上下平移 · 方向键移动</span>
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
  onClear: () => void;
  onExport: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetView: () => void;
  onAddNode: () => void;
  onDeleteSelected: () => void;
  nodeCount: number;
  edgeCount: number;
  selectedCount: number;
}

function PipelineToolbar({
  onBack, onRun, onClear, onExport,
  onZoomIn, onZoomOut, onResetView, onAddNode, onDeleteSelected,
  nodeCount, edgeCount, selectedCount,
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
        <Button
          variant="outline"
          size="sm"
          className="h-8 px-2.5 gap-1.5 text-[12px]"
          onClick={onAddNode}
        >
          <Plus className="size-3.5" />
          <span className="hidden sm:inline">{t('npAddNodeTitle')}</span>
        </Button>
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
  node, selected, multiSelected, computeTick, isConnecting, snapPortId,
  onPointerDownHeader, onDelete, onSelect,
  onConfigChange, onStartConnection, onCompleteConnection,
  variables, onPlotOpen,
}: NodeCardProps) {
  const def = NODE_TYPES[node.type];
  const cat = CATEGORY_COLOR[def.category];
  const Icon = ICONS[def.icon] ?? Hash;
  const portsH = portsSectionHeight(node);
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

  return (
    <motion.div
      ref={cardRef}
      initial={{ opacity: 0, scale: 0.92, y: -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
      className={cn(
        'absolute node-card group',
        selected && 'selected',
        multiSelected && 'ring-2 ring-blue-500 ring-offset-0',
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
            port={port}
            isOutput={false}
            y={i * PORT_ROW_H}
            connected={Boolean(node.outputs && port.id in (node.outputs as object))}
            isConnecting={isConnecting}
            snapped={snapPortId === port.id}
            onStartConnection={onStartConnection}
            onCompleteConnection={onCompleteConnection}
          />
        ))}
        {def.outputs.map((port, i) => (
          <PortLabel
            key={port.id}
            port={port}
            isOutput
            y={i * PORT_ROW_H}
            connected={Boolean(node.outputs && port.id in (node.outputs as object))}
            isConnecting={isConnecting}
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
  port: PortDef;
  isOutput: boolean;
  y: number;
  connected: boolean;
  isConnecting: boolean;
  snapped: boolean;
  onStartConnection: (portId: string, e: React.PointerEvent) => void;
  onCompleteConnection: (portId: string, type: PortDataType) => void;
}

function PortLabel({
  port, isOutput, y, connected, isConnecting, snapped,
  onStartConnection, onCompleteConnection,
}: PortLabelProps) {
  const [hover, setHover] = useState(false);
  return (
    <div
      className={cn(
        'absolute flex items-center gap-1.5 text-[11px]',
        isOutput ? 'right-3 flex-row-reverse' : 'left-3',
      )}
      style={{ top: y, height: PORT_ROW_H }}
    >
      <div
        role="button"
        tabIndex={0}
        aria-label={t(port.labelKey)}
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
          (hover || (isConnecting && !isOutput)) && 'active',
          snapped && 'ring-2 ring-cyan-400 scale-125',
        )}
        style={{
          borderColor: snapped
            ? 'oklch(0.75 0.18 195)'
            : (isOutput ? 'oklch(0.78 0.15 75)' : 'oklch(0.7 0.15 165)'),
          background: snapped
            ? 'oklch(0.75 0.18 195 / 0.35)'
            : connected
              ? (isOutput ? 'oklch(0.78 0.15 75)' : 'oklch(0.7 0.15 165)')
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

function NodeConfig({ node, onConfigChange, variables }: NodeConfigProps) {
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
    case 'evaluate':
    case 'matrix-multiply':
    case 'display':
    default:
      return null;
  }
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
  if (node.result === undefined || node.result === null) {
    return <span className="text-[11px] text-muted-foreground/60">—</span>;
  }

  const r = node.result;

  // Number → big bold display
  if (typeof r === 'number') {
    return (
      <div className="text-center w-full">
        <div className={cn(
          'font-mono font-semibold text-[15px]',
          Number.isNaN(r) ? 'text-destructive' : 'text-foreground',
        )}>
          {Number.isNaN(r) ? 'NaN' : formatShort(r)}
        </div>
      </div>
    );
  }

  // Plot output → mini sparkline (click to open in 2D panel)
  if (node.type === 'plot-output' && node.outputs?.plot) {
    const plot = node.outputs.plot as { samples: Array<[number, number]> };
    return <Sparkline samples={plot.samples} onClick={onPlotOpen} />;
  }

  // MathNode (derivative) → KaTeX
  if (r && typeof r === 'object' && 'toTex' in (r as object)) {
    let latex = '';
    let valid = false;
    try {
      latex = (r as { toTex: (opts?: object) => string }).toTex({ implicit: 'hide' });
      valid = true;
    } catch {
      valid = false;
    }
    if (valid && latex) {
      return (
        <div className="w-full overflow-x-auto scrollbar-none">
          <FormulaRenderer latex={latex} displayMode={false} className="text-[12px] text-center" />
        </div>
      );
    }
    return <span className="text-[11px] font-mono text-muted-foreground truncate">{String(r)}</span>;
  }

  // Matrix → small label
  if (r && typeof r === 'object') {
    const str = String(r);
    if (str.length < 40) {
      return <span className="text-[11px] font-mono text-foreground/80 truncate">{str}</span>;
    }
    return <span className="text-[11px] text-muted-foreground">matrix</span>;
  }

  // String fallback
  return <span className="text-[11px] font-mono text-foreground/80 truncate">{String(r)}</span>;
}

function formatShort(n: number): string {
  if (!Number.isFinite(n)) return n > 0 ? '∞' : '-∞';
  const abs = Math.abs(n);
  if (abs !== 0 && (abs < 1e-4 || abs >= 1e6)) {
    return n.toExponential(3);
  }
  const rounded = Math.round(n);
  if (Math.abs(n - rounded) < 1e-9) return String(rounded);
  return parseFloat(n.toPrecision(6)).toString();
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
 * Edge path
 * ================================================================== */
function EdgePath({
  edge, from, to, selected, onDelete,
}: {
  edge: PipelineEdge;
  from: { x: number; y: number };
  to: { x: number; y: number };
  selected: boolean;
  onDelete: () => void;
}) {
  const [hover, setHover] = useState(false);
  const d = bezierPath(from, to);
  // Midpoint for the click target (small circle).
  const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };

  return (
    <g
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      style={{ pointerEvents: 'auto', cursor: 'pointer' }}
    >
      {/* Invisible thick hit area */}
      <path
        d={d}
        fill="none"
        stroke="transparent"
        strokeWidth={14}
        onPointerUp={(e) => { e.stopPropagation(); onDelete(); }}
      />
      {/* Visible path */}
      <path
        d={d}
        fill="none"
        stroke={hover || selected ? 'url(#edge-gradient-active)' : 'url(#edge-gradient)'}
        strokeWidth={hover || selected ? 2.5 : 2}
        className="node-connector animated"
        style={{ opacity: hover || selected ? 1 : 0.85 }}
      />
      {/* Delete handle on hover */}
      {(hover || selected) && (
        <g onPointerUp={(e) => { e.stopPropagation(); onDelete(); }}>
          <circle cx={mid.x} cy={mid.y} r={7} fill="oklch(0.7 0.2 22)" />
          <path
            d={`M ${mid.x - 3} ${mid.y - 3} L ${mid.x + 3} ${mid.y + 3} M ${mid.x + 3} ${mid.y - 3} L ${mid.x - 3} ${mid.y + 3}`}
            stroke="white"
            strokeWidth={1.4}
            strokeLinecap="round"
          />
        </g>
      )}
      {/* Suppress unused-var lint on `edge` — it's used as a React key. */}
      <g data-edge-id={edge.id} style={{ display: 'none' }} />
    </g>
  );
}

function bezierPath(from: { x: number; y: number }, to: { x: number; y: number }): string {
  const dx = Math.max(Math.abs(to.x - from.x) * 0.5, 30);
  return `M ${from.x} ${from.y} C ${from.x + dx} ${from.y}, ${to.x - dx} ${to.y}, ${to.x} ${to.y}`;
}

/* ================================================================== *
 * Node palette (add-node drawer)
 * ================================================================== */
const PALETTE_GROUPS: Array<{ category: NodeCategory; types: NodeType[] }> = [
  { category: 'input', types: ['number-input', 'expression-input', 'variable', 'constant'] },
  { category: 'operation', types: ['arithmetic'] },
  { category: 'function', types: ['function-apply'] },
  { category: 'plot', types: ['plot-output'] },
  { category: 'matrix', types: ['matrix-input', 'matrix-op', 'matrix-multiply'] },
  { category: 'calculus', types: ['derivative', 'integrate', 'evaluate'] },
  { category: 'output', types: ['display'] },
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
  const filteredGroups = useMemo(() => {
    if (!query) return PALETTE_GROUPS;
    return PALETTE_GROUPS
      .map((group) => ({
        ...group,
        types: group.types.filter((type) => {
          const def = NODE_TYPES[type];
          const label = t(def.labelKey).toLowerCase();
          return type.toLowerCase().includes(query) || label.includes(query);
        }),
      }))
      .filter((g) => g.types.length > 0);
  }, [query]);

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
            <div key={group.category}>
              <div className={cn(
                'text-[10px] font-semibold uppercase tracking-wider mb-1 px-1 flex items-center gap-1.5',
                CATEGORY_COLOR[group.category].text,
              )}>
                <span className={cn('size-1.5 rounded-full', CATEGORY_COLOR[group.category].stripe)} />
                {t(CATEGORY_LABEL_KEY[group.category])}
              </div>
              <div className="space-y-0.5">
                {group.types.map((type) => {
                  const def = NODE_TYPES[type];
                  const Icon = ICONS[def.icon] ?? Hash;
                  const cat = CATEGORY_COLOR[def.category];
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => onPick(type)}
                      className={cn(
                        'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[12px] text-left transition-all',
                        'hover:bg-accent hover:translate-x-0.5 interactive-card',
                      )}
                    >
                      <div className={cn('size-6 grid place-items-center rounded-md', cat.bg)}>
                        <Icon className={cn('size-3.5', cat.text)} />
                      </div>
                      <span>{t(def.labelKey)}</span>
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
