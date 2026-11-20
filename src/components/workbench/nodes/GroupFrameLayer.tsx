'use client';

/**
 * OmniMath Pro — 分组 Frame 渲染层（Blender 式 Group Frame）
 *
 * 对拥有相同 `group.id` 的节点绘制一个虚线框 + 顶部标题标签。
 * 标题可编辑（双击标签）。折叠时隐藏框内节点（由父组件控制显隐）。
 */

import { useMemo, type ReactElement } from 'react';
import type { PipelineNode } from './pipelineEngine';
import { NODE_WIDTH } from './pipelineEngine';

/** 与节点卡片估算高一致。 */
const APPROX_NODE_H = 120;
const PAD = 16;

interface GroupData {
  id: string;
  title: string;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface GroupFrameLayerProps {
  nodes: PipelineNode[];
  onRename: (groupId: string, title: string) => void;
}

export function GroupFrameLayer({ nodes, onRename }: GroupFrameLayerProps) {
  const groups = useMemo<GroupData[]>(() => {
    const map = new Map<string, GroupData>();
    for (const n of nodes) {
      const g = n.group;
      if (!g) continue;
      let entry = map.get(g.id);
      if (!entry) {
        entry = { id: g.id, title: g.title, minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
        map.set(g.id, entry);
      }
      if (n.position.x < entry.minX) entry.minX = n.position.x;
      if (n.position.y < entry.minY) entry.minY = n.position.y;
      if (n.position.x + NODE_WIDTH > entry.maxX) entry.maxX = n.position.x + NODE_WIDTH;
      if (n.position.y + APPROX_NODE_H > entry.maxY) entry.maxY = n.position.y + APPROX_NODE_H;
    }
    return Array.from(map.values());
  }, [nodes]);

  const rects: ReactElement[] = [];
  for (const g of groups) {
    if (g.minX === Infinity) continue;
    const x = g.minX - PAD;
    const y = g.minY - PAD;
    const w = g.maxX - g.minX + PAD * 2;
    const h = g.maxY - g.minY + PAD * 2;
    rects.push(
      <g key={g.id}>
        <rect
          x={x}
          y={y}
          width={w}
          height={h}
          rx={8}
          fill="rgba(56,189,248,0.04)"
          stroke="rgba(56,189,248,0.45)"
          strokeWidth={1.2}
          strokeDasharray="6 4"
        />
        <g
          onPointerDown={(e) => e.stopPropagation()}
          onDoubleClick={(e) => {
            e.stopPropagation();
            const title = window.prompt('分组名称', g.title);
            if (title != null && title.trim()) onRename(g.id, title.trim());
          }}
        >
          <rect x={x + 8} y={y - 11} width={g.title.length * 7 + 18} height={18} rx={5} fill="rgba(56,189,248,0.9)" />
          <text
            x={x + 17}
            y={y + 2}
            fontSize={10}
            fill="#0b1220"
            fontWeight={600}
            style={{ pointerEvents: 'none' }}
          >
            {g.title}
          </text>
        </g>
      </g>,
    );
  }

  return <>{rects}</>;
}