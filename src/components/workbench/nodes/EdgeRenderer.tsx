'use client';

/**
 * OmniMath Pro — Edge Renderer (extracted from NodePipeline.tsx)
 *
 * Renders the SVG edge layer for the node pipeline. Extracted into its
 * own memoized component so that node drag updates (which change node
 * positions but not the edge list) don't re-create the entire SVG
 * subtree from scratch.
 *
 * The gradient defs are defined once here; individual EdgePath instances
 * reference them by id.
 *
 * P6/P7: 边交互改造 ——
 *   - 点击边 = 选中（高亮），不再直接删除（避免拖拽误删）。
 *   - 选中后按 Delete 键、或点击边的垃圾桶图标删除。
 *   - 垃圾桶采用两步确认：第一次点击变红"确认?"，第二次点击才真删。
 *     3 秒不操作自动取消确认态。
 *
 * P1-4: 可拖拽重连 ——
 *   - 每条边在源端/目标端内侧各有一个拖柄（hover/选中时显示）。
 *   - 按住拖柄拖到另一节点的端口上松手，即可把该端重连到新端口（吸附）。
 *   - `onStartReconnect(edgeId, end)` 由父级接管拖拽 + 端口吸附。
 */

import { memo, useState, useEffect, useRef } from 'react';
import { Trash2, Check } from 'lucide-react';
import type { PipelineEdge } from './pipelineEngine';

export interface EdgeEndpoint {
  x: number;
  y: number;
}

export interface EdgePathData {
  edge: PipelineEdge;
  from: EdgeEndpoint;
  to: EdgeEndpoint;
  /** 源端口数据类型对应的颜色（供边随类型着色，类 Unreal Blueprint）。 */
  color?: string;
}

interface EdgeRendererProps {
  edges: EdgePathData[];
  pendingPath: { from: EdgeEndpoint; to: EdgeEndpoint } | null;
  selectedNodeId: string | null;
  /** P6: 当前选中的边 id（用于高亮 + Delete 键删除）。 */
  selectedEdgeId: string | null;
  viewScale: number;
  marquee: { start: EdgeEndpoint; current: EdgeEndpoint } | null;
  onDeleteEdge: (edgeId: string) => void;
  /** P6: 选中边（传 null 清除）。 */
  onSelectEdge: (edgeId: string | null) => void;
  /** P1-4: 正在重连的边 id（高亮 + 隐藏该边普通交互）。 */
  reconnectEdgeId?: string | null;
  /** P1-4: 开始重连某条边的某端（'from'=源端 / 'to'=目标端）。 */
  onStartReconnect?: (edgeId: string, end: 'from' | 'to') => void;
}

/** Cubic bezier path between two points (horizontal flow). */
export function bezierPath(from: EdgeEndpoint, to: EdgeEndpoint): string {
  const dx = Math.max(Math.abs(to.x - from.x) * 0.5, 30);
  return `M ${from.x} ${from.y} C ${from.x + dx} ${from.y}, ${to.x - dx} ${to.y}, ${to.x} ${to.y}`;
}

/** Point on the connecting cubic bezier at parameter t (0..1). */
function bezierPointAt(from: EdgeEndpoint, to: EdgeEndpoint, t: number): EdgeEndpoint {
  const dx = Math.max(Math.abs(to.x - from.x) * 0.5, 30);
  const c1 = { x: from.x + dx, y: from.y };
  const c2 = { x: to.x - dx, y: to.y };
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return {
    x: a * from.x + b * c1.x + c * c2.x + d * to.x,
    y: a * from.y + b * c1.y + c * c2.y + d * to.y,
  };
}

export const EdgeRenderer = memo(function EdgeRenderer({
  edges,
  pendingPath,
  selectedNodeId,
  selectedEdgeId,
  viewScale,
  marquee,
  onDeleteEdge,
  onSelectEdge,
  reconnectEdgeId,
  onStartReconnect,
}: EdgeRendererProps) {
  return (
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

      {edges.map(({ edge, from, to, color }) => (
        <EdgePath
          key={edge.id}
          edge={edge}
          from={from}
          to={to}
          color={color}
          selected={selectedEdgeId === edge.id || selectedNodeId === edge.from || selectedNodeId === edge.to}
          reconnecting={reconnectEdgeId === edge.id}
          onDelete={() => onDeleteEdge(edge.id)}
          onSelect={() => onSelectEdge(edge.id)}
          onStartReconnect={(end) => onStartReconnect?.(edge.id, end)}
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
          strokeWidth={1 / viewScale}
          strokeDasharray={`${4 / viewScale} ${2 / viewScale}`}
          className="pointer-events-none"
        />
      )}
    </svg>
  );
});

/* ------------------------------------------------------------------ *
 * Single edge path — P6/P7: 点击选中 + 两步确认删除
 *                     P1-4: 源端/目标端拖柄重连
 * ------------------------------------------------------------------ */
interface EdgePathProps {
  edge: PipelineEdge;
  from: EdgeEndpoint;
  to: EdgeEndpoint;
  color?: string;
  selected: boolean;
  reconnecting: boolean;
  onDelete: () => void;
  onSelect: () => void;
  onStartReconnect: (end: 'from' | 'to') => void;
}

function EdgePath({ edge, from, to, color, selected, reconnecting, onDelete, onSelect, onStartReconnect }: EdgePathProps) {
  const [hover, setHover] = useState(false);
  // P7: 两步确认。confirming=true 时垃圾桶变红显示对勾，再点一次才真删。
  const [confirming, setConfirming] = useState(false);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 3 秒后自动取消确认态，避免用户点了第一次就走了、回来误删。
  useEffect(() => {
    if (confirming) {
      confirmTimer.current = setTimeout(() => setConfirming(false), 3000);
    }
    return () => {
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
    };
  }, [confirming]);

  const d = bezierPath(from, to);
  const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  // P1-4: 拖柄位于源端/目标端内侧（曲线上 t≈0.12 / t≈0.88），不遮挡端口圆点。
  const fromHandle = bezierPointAt(from, to, 0.12);
  const toHandle = bezierPointAt(from, to, 0.88);

  const handleTrashClick = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (confirming) {
      // 第二次点击 → 真删
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
      setConfirming(false);
      onDelete();
    } else {
      // 第一次点击 → 进入确认态
      setConfirming(true);
    }
  };

  const startReconnect = (end: 'from' | 'to') => (e: React.PointerEvent) => {
    e.stopPropagation();
    onStartReconnect(end);
  };

  return (
    <g
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      style={{ pointerEvents: 'auto', cursor: 'pointer' }}
    >
      {/* Invisible thick hit area — P6: 点击只选中，不删除 */}
      <path
        d={d}
        fill="none"
        stroke="transparent"
        strokeWidth={14}
        onPointerUp={(e) => { e.stopPropagation(); onSelect(); }}
      />
      {/* Visible path */}
      <path
        d={d}
        fill="none"
        stroke={reconnecting ? 'transparent' : (color ?? 'url(#edge-gradient)')}
        strokeWidth={hover || selected ? 2.5 : 2}
        className="node-connector animated"
        style={{ opacity: hover || selected ? 1 : 0.85 }}
      />

      {/* P1-4: 源端/目标端拖柄（hover/选中时显示），按住拖到另一端口松开即重连 */}
      {(hover || selected) && !reconnecting && (
        <>
          <circle
            cx={fromHandle.x}
            cy={fromHandle.y}
            r={5.5}
            fill="var(--node-bg, oklch(0.2 0.02 250))"
            stroke={color ?? 'oklch(0.7 0.15 165)'}
            strokeWidth={1.4}
            className="cursor-grab"
            onPointerDown={startReconnect('from')}
          />
          <circle
            cx={toHandle.x}
            cy={toHandle.y}
            r={5.5}
            fill="var(--node-bg, oklch(0.2 0.02 250))"
            stroke={color ?? 'oklch(0.7 0.15 165)'}
            strokeWidth={1.4}
            className="cursor-grab"
            onPointerDown={startReconnect('to')}
          />
        </>
      )}

      {/* Delete affordance — shows on hover or when selected */}
      {(hover || selected) && !reconnecting && (
        <g
          transform={`translate(${mid.x}, ${mid.y})`}
          onPointerUp={handleTrashClick}
        >
          <circle
            r={9}
            fill={confirming ? 'oklch(0.6 0.2 25)' : 'var(--node-bg, oklch(0.2 0.02 250))'}
            stroke={confirming ? 'oklch(0.7 0.2 25)' : 'oklch(0.7 0.18 25)'}
            strokeWidth={1.5}
          />
          <g transform="translate(-4, -4) scale(0.5)">
            {confirming ? (
              <Check className="text-white" strokeWidth={2.5} />
            ) : (
              <Trash2 className="text-rose-500" strokeWidth={2.5} />
            )}
          </g>
        </g>
      )}
      {/* Suppress unused-var lint on `edge` — it's used as a React key. */}
      <g data-edge-id={edge.id} style={{ display: 'none' }} />
    </g>
  );
}