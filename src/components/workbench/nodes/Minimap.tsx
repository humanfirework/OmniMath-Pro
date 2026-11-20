'use client';

/**
 * OmniMath Pro — Node canvas minimap (Blender 式小地图)
 *
 * 在画布一角显示全部节点的缩略总览，并叠加一个「当前视口」矩形。
 * 点击/拖动小地图会把视口中心跳到对应世界坐标。
 *
 * 约定：
 *  - 世界坐标中每个节点占 NODE_WIDTH × 估算高度（用 APPROX_NODE_H）。
 *  - 视口 = 画布当前可见的世界矩形，由 `view`（translate+scale）反推。
 *  - 点击映射：map → world → 居中 setView。
 */

import { useMemo, useRef, type PointerEvent } from 'react';
import type { PipelineNode } from './pipelineEngine';
import { NODE_WIDTH } from './pipelineEngine';

/** 估算节点卡片高度（与布局辅助函数保持一致）。 */
const APPROX_NODE_H = 120;

interface MinimapProps {
  nodes: PipelineNode[];
  view: { x: number; y: number; scale: number };
  canvasSize: { w: number; h: number };
  /** 居中定位到某个世界坐标。 */
  onCenter: (world: { x: number; y: number }) => void;
}

const MAP_W = 180;
const MAP_H = 120;

export function Minimap({ nodes, view, canvasSize, onCenter }: MinimapProps) {
  const ref = useRef<HTMLDivElement>(null);

  // 全部节点的世界包围盒 (minX, minY, maxX, maxY)。
  const bounds = useMemo(() => {
    if (nodes.length === 0) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of nodes) {
      if (n.position.x < minX) minX = n.position.x;
      if (n.position.y < minY) minY = n.position.y;
      if (n.position.x + NODE_WIDTH > maxX) maxX = n.position.x + NODE_WIDTH;
      if (n.position.y + APPROX_NODE_H > maxY) maxY = n.position.y + APPROX_NODE_H;
    }
    return { minX, minY, maxX, maxY };
  }, [nodes]);

  // 当前视口在世界坐标中的矩形。
  const viewport = useMemo(() => {
    const x0 = -view.x / view.scale;
    const y0 = -view.y / view.scale;
    const x1 = (-view.x + canvasSize.w) / view.scale;
    const y1 = (-view.y + canvasSize.h) / view.scale;
    return { x0, y0, x1, y1 };
  }, [view, canvasSize]);

  // map ←→ world 的线性映射（保留 padding，避免节点贴边）。
  const mapping = useMemo(() => {
    if (!bounds) return null;
    const pad = 8;
    const bw = bounds.maxX - bounds.minX || 1;
    const bh = bounds.maxY - bounds.minY || 1;
    const scale = Math.min(
      (MAP_W - pad * 2) / bw,
      (MAP_H - pad * 2) / bh,
    );
    const ox = (MAP_W - bw * scale) / 2 - bounds.minX * scale;
    const oy = (MAP_H - bh * scale) / 2 - bounds.minY * scale;
    return {
      scale,
      ox,
      oy,
      toMap: (wx: number, wy: number): [number, number] => [
        wx * scale + ox,
        wy * scale + oy,
      ],
      toWorld: (mx: number, my: number): { x: number; y: number } => ({
        x: (mx - ox) / scale,
        y: (my - oy) / scale,
      }),
    };
  }, [bounds]);

  const handlePointer = (e: PointerEvent) => {
    if (!mapping || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    onCenter(mapping.toWorld(mx, my));
  };

  if (!bounds || !mapping || nodes.length === 0) return null;

  // 视口矩形（裁剪到 map 边界）。
  const [vx0, vy0] = mapping.toMap(viewport.x0, viewport.y0);
  const [vx1, vy1] = mapping.toMap(viewport.x1, viewport.y1);
  const vrect = {
    x: Math.max(0, Math.min(vx0, vx1)),
    y: Math.max(0, Math.min(vy0, vy1)),
    w: Math.max(2, Math.min(MAP_W, Math.abs(vx1 - vx0))),
    h: Math.max(2, Math.min(MAP_H, Math.abs(vy1 - vy0))),
  };

  return (
    <div
      ref={ref}
      className="absolute bottom-16 left-3 overflow-hidden rounded-md border border-border/60 bg-black/40 backdrop-blur-sm"
      style={{
        width: MAP_W,
        height: MAP_H,
        zIndex: 30,
        touchAction: 'none',
      }}
      onPointerDown={(e) => { e.stopPropagation(); handlePointer(e); }}
      onPointerMove={(e) => {
        if (e.buttons > 0) handlePointer(e);
      }}
    >
      <svg width={MAP_W} height={MAP_H} className="block">
        {/* 节点方块 */}
        {nodes.map((n) => {
          const [x, y] = mapping.toMap(n.position.x, n.position.y);
          const w = Math.max(2, NODE_WIDTH * mapping.scale);
          const h = Math.max(2, APPROX_NODE_H * mapping.scale);
          return (
            <rect
              key={n.id}
              x={x}
              y={y}
              width={w}
              height={h}
              rx={1.5}
              className={n.error ? 'fill-rose-400/80' : 'fill-sky-400/60'}
              stroke={
                n.muted
                  ? 'rgba(251,191,36,0.9)'
                  : 'rgba(255,255,255,0.25)'
              }
              strokeWidth={0.5}
            />
          );
        })}
        {/* 视口叠加 */}
        <rect
          x={vrect.x}
          y={vrect.y}
          width={vrect.w}
          height={vrect.h}
          fill="rgba(255,255,255,0.08)"
          stroke="rgba(255,255,255,0.7)"
          strokeWidth={1}
          rx={1}
        />
      </svg>
    </div>
  );
}