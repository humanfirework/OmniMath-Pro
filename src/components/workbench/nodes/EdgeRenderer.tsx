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
}

/** Cubic bezier path between two points (horizontal flow). */
export function bezierPath(from: EdgeEndpoint, to: EdgeEndpoint): string {
  const dx = Math.max(Math.abs(to.x - from.x) * 0.5, 30);
  return `M ${from.x} ${from.y} C ${from.x + dx} ${from.y}, ${to.x - dx} ${to.y}, ${to.x} ${to.y}`;
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

      {edges.map(({ edge, from, to }) => (
        <EdgePath
          key={edge.id}
          edge={edge}
          from={from}
          to={to}
          selected={selectedEdgeId === edge.id || selectedNodeId === edge.from || selectedNodeId === edge.to}
          onDelete={() => onDeleteEdge(edge.id)}
          onSelect={() => onSelectEdge(edge.id)}
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
 * ------------------------------------------------------------------ */
interface EdgePathProps {
  edge: PipelineEdge;
  from: EdgeEndpoint;
  to: EdgeEndpoint;
  selected: boolean;
  onDelete: () => void;
  onSelect: () => void;
}

function EdgePath({ edge, from, to, selected, onDelete, onSelect }: EdgePathProps) {
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
        stroke={hover || selected ? 'url(#edge-gradient-active)' : 'url(#edge-gradient)'}
        strokeWidth={hover || selected ? 2.5 : 2}
        className="node-connector animated"
        style={{ opacity: hover || selected ? 1 : 0.85 }}
      />
      {/* Delete affordance — shows on hover or when selected */}
      {(hover || selected) && (
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
