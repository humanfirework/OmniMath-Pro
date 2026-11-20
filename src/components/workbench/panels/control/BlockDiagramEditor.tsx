'use client';

/**
 * OmniMath Pro — 方框图（Block Diagram）可视化建模编辑器
 *
 * 与「信号流图」互补：用教科书式的「方框 + 求和点 + 引出点 + 箭头」来搭
 * 方框图，直观还原自动控制原理里的结构图。特性：
 *   - 方框（传递函数块）：任意 num/den 字符串，方框随文本自动缩放。
 *   - 求和点（Σ）：入边可带 +/− 符号（负反馈默认 −）。
 *   - 引出点（pickoff）：信号分叉。
 *   - 输入 R(s) / 输出 C(s) 终端。
 *   - 拖拽移动、点选连线、双击空白加块。
 *   - 自动用梅逊增益公式（masonFromGraph）求闭环 T(s)=C(s)/R(s)，
 *     并给出前向通路、回路、Δ、极点判稳、阶跃响应。
 *   - 稳态误差 ess：对单位阶跃输入，ess = (E/R)(0)。
 */

import { useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { FormulaRenderer } from '@/components/workbench/FormulaRenderer';
import { StatsChart } from '@/components/workbench/panels/stats/StatsChart';
import { renderStep } from '@/lib/control/chartRender';
import {
  masonFromGraph,
  parsePolynomial,
  stepResponse,
  type MasonGraphResult,
} from '@/lib/control/transferFunction';
import { polyToLatex } from '@/components/workbench/panels/ControlTheorySection';

const W = 680;
const H = 460;

type BDKind = 'input' | 'sum' | 'block' | 'pickoff' | 'output';

interface BDNode {
  id: number;
  kind: BDKind;
  x: number;
  y: number;
  /** 块的传递函数（仅 block 使用）。 */
  tf?: string;
  /** 求和/引出点名称（G1、H1…）。 */
  name?: string;
}

interface BDEdge {
  id: number;
  from: number;
  to: number;
  /** 进入求和点的符号：1 或 -1（仅当目标为 sum 起作用）。 */
  sign: 1 | -1;
}

/** 默认示例：单位反馈闭环（R → Σ → G(s)=1/(s^2+3s+2) → C，反馈 H=1）。 */
const DEFAULT_NODES: BDNode[] = [
  { id: 0, kind: 'input', x: 60, y: 200, name: 'R' },
  { id: 1, kind: 'sum', x: 150, y: 200, name: 'Σ' },
  { id: 2, kind: 'block', x: 300, y: 200, tf: '1/(s^2+3s+2)', name: 'G' },
  { id: 3, kind: 'output', x: 470, y: 200, name: 'C' },
  { id: 4, kind: 'pickoff', x: 470, y: 200, name: '·' },
];
const DEFAULT_EDGES: BDEdge[] = [
  { id: 1, from: 0, to: 1, sign: 1 },
  { id: 2, from: 1, to: 2, sign: 1 },
  { id: 3, from: 2, to: 4, sign: 1 },
  { id: 4, from: 4, to: 3, sign: 1 },
  { id: 5, from: 4, to: 1, sign: -1 },
];

const EXAMPLES: { label: string; nodes: BDNode[]; edges: BDEdge[] }[] = [
  {
    label: '单位反馈二阶',
    nodes: DEFAULT_NODES,
    edges: DEFAULT_EDGES,
  },
  {
    label: '带前向增益',
    nodes: [
      { id: 0, kind: 'input', x: 60, y: 200, name: 'R' },
      { id: 1, kind: 'sum', x: 150, y: 200, name: 'Σ' },
      { id: 2, kind: 'block', x: 280, y: 200, tf: '5/(s+1)', name: 'G' },
      { id: 3, kind: 'block', x: 430, y: 200, tf: '1/(s+2)', name: 'G2' },
      { id: 4, kind: 'output', x: 560, y: 200, name: 'C' },
      { id: 5, kind: 'pickoff', x: 560, y: 200, name: '·' },
      { id: 6, kind: 'block', x: 430, y: 90, tf: '1', name: 'H' },
    ],
    edges: [
      { id: 1, from: 0, to: 1, sign: 1 },
      { id: 2, from: 1, to: 2, sign: 1 },
      { id: 3, from: 2, to: 3, sign: 1 },
      { id: 4, from: 3, to: 5, sign: 1 },
      { id: 5, from: 5, to: 4, sign: 1 },
      { id: 6, from: 5, to: 6, sign: 1 },
      { id: 7, from: 6, to: 1, sign: -1 },
    ],
  },
];

/** 解析边增益：'num' 或 'num/den' → { num, den }（系数数组，高次在前）。 */
function parseGain(raw: string | undefined): { num: number[]; den: number[] } {
  const s = (raw ?? '1').trim();
  if (!s) return { num: [1], den: [1] };
  const slash = s.lastIndexOf('/');
  if (slash > 0 && slash < s.length - 1) {
    try {
      return { num: parsePolynomial(s.slice(0, slash).trim()), den: parsePolynomial(s.slice(slash + 1).trim()) };
    } catch {
      return { num: [1], den: [1] };
    }
  }
  try {
    return { num: parsePolynomial(s), den: [1] };
  } catch {
    return { num: [1], den: [1] };
  }
}

/** 顶层 '/' 切分子/分母（忽略括号内），用于分式显示。 */
function splitFrac(raw: string): { num: string; den: string } | null {
  const s = raw.trim();
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth--;
    else if (c === '/' && depth === 0 && i > 0 && i < s.length - 1) {
      const num = s.slice(0, i).trim();
      const den = s.slice(i + 1).trim();
      if (num && den) return { num, den };
    }
  }
  return null;
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + '…' : s;
}

/** 由数据点推导初始视口（含 10% 边距）。 */
function autoViewOf(pts: { x: number; y: number }[], padRatio = 0.1): { xMin: number; xMax: number; yMin: number; yMax: number } {
  if (pts.length === 0) return { xMin: -1, xMax: 1, yMin: -1, yMax: 1 };
  let loX = Infinity, hiX = -Infinity, loY = Infinity, hiY = -Infinity;
  for (const p of pts) {
    if (Number.isFinite(p.x)) { if (p.x < loX) loX = p.x; if (p.x > hiX) hiX = p.x; }
    if (Number.isFinite(p.y)) { if (p.y < loY) loY = p.y; if (p.y > hiY) hiY = p.y; }
  }
  if (!Number.isFinite(loX) || loX === hiX) { loX -= 1; hiX += 1; }
  if (!Number.isFinite(loY) || loY === hiY) { loY -= 1; hiY += 1; }
  const padX = (hiX - loX) * padRatio || 1;
  const padY = (hiY - loY) * padRatio || 1;
  return { xMin: loX - padX, xMax: hiX + padX, yMin: loY - padY, yMax: hiY + padY };
}

/** 评估多项式在 s=0 处的值（用于稳态误差）。 */
function polyAtZero(coeffs: number[]): number {
  // 系数高次在前，常数项即末位。
  return coeffs.length > 0 ? coeffs[coeffs.length - 1] : 0;
}

export function BlockDiagramEditor() {
  const [nodes, setNodes] = useState<BDNode[]>(DEFAULT_NODES);
  const [edges, setEdges] = useState<BDEdge[]>(DEFAULT_EDGES);
  const [nextNodeId, setNextNodeId] = useState(10);
  const [nextEdgeId, setNextEdgeId] = useState(10);
  const [selectedNode, setSelectedNode] = useState<number | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<number | null>(null);
  const [pendingFrom, setPendingFrom] = useState<number | null>(null);
  // 选中块的编辑值（临时输入）。
  const [editTf, setEditTf] = useState<string>('');

  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{ id: number; dx: number; dy: number } | null>(null);

  const toSvg = (cx: number, cy: number): { x: number; y: number } => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const scale = Math.min(rect.width / W, rect.height / H);
    const offX = (rect.width - W * scale) / 2;
    const offY = (rect.height - H * scale) / 2;
    return { x: (cx - rect.left - offX) / scale, y: (cy - rect.top - offY) / scale };
  };

  const addNode = (kind: BDKind, x: number, y: number) => {
    const id = nextNodeId;
    const node: BDNode = kind === 'block'
      ? { id, kind, x, y, tf: '1', name: `G${id}` }
      : kind === 'sum'
        ? { id, kind, x, y, name: 'Σ' }
        : kind === 'pickoff'
          ? { id, kind, x, y, name: '·' }
          : { id, kind, x, y, name: kind === 'input' ? 'R' : 'C' };
    setNodes((prev) => [...prev, node]);
    setNextNodeId((v) => v + 1);
  };

  const addEdge = (from: number, to: number) => {
    // 默认符号：目标为求和点且使其成环 → -1（负反馈），否则 +1。
    const target = nodes.find((n) => n.id === to);
    const sign: 1 | -1 = target?.kind === 'sum' ? -1 : 1;
    const id = nextEdgeId;
    setEdges((prev) => [...prev, { id, from, to, sign }]);
    setNextEdgeId((v) => v + 1);
  };

  const removeSelected = () => {
    if (selectedNode !== null) {
      const id = selectedNode;
      setNodes((prev) => prev.filter((n) => n.id !== id));
      setEdges((prev) => prev.filter((e) => e.from !== id && e.to !== id));
      setSelectedNode(null);
    } else if (selectedEdge !== null) {
      setEdges((prev) => prev.filter((e) => e.id !== selectedEdge));
      setSelectedEdge(null);
    }
    setPendingFrom(null);
  };

  const clearAll = () => {
    setNodes([]);
    setEdges([]);
    setSelectedNode(null);
    setSelectedEdge(null);
    setPendingFrom(null);
  };

  const loadExample = (idx: number) => {
    const ex = EXAMPLES[idx];
    if (!ex) return;
    setNodes(ex.nodes.map((n) => ({ ...n })));
    setEdges(ex.edges.map((e) => ({ ...e })));
    setSelectedNode(null);
    setSelectedEdge(null);
    setPendingFrom(null);
  };

  /* ---- 画布交互 ---- */
  const handleNodePointerDown = (e: React.PointerEvent, id: number) => {
    e.stopPropagation();
    if (pendingFrom !== null) {
      addEdge(pendingFrom, id);
      setPendingFrom(null);
      return;
    }
    const p = toSvg(e.clientX, e.clientY);
    const node = nodes.find((n) => n.id === id);
    if (!node) return;
    dragRef.current = { id, dx: node.x - p.x, dy: node.y - p.y };
    setSelectedNode(id);
    setSelectedEdge(null);
    if (node.kind === 'block') setEditTf(node.tf ?? '1');
    (e.target as Element).setPointerCapture(e.pointerId);
  };
  const handlePointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const p = toSvg(e.clientX, e.clientY);
    setNodes((prev) => prev.map((n) => (n.id === drag.id ? { ...n, x: p.x + drag.dx, y: p.y + drag.dy } : n)));
  };
  const handlePointerUp = (e: React.PointerEvent) => {
    dragRef.current = null;
    (e.target as Element).releasePointerCapture?.(e.pointerId);
  };
  const handleEdgeClick = (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    setSelectedEdge(id);
    setSelectedNode(null);
    setPendingFrom(null);
  };
  const handleBackgroundClick = () => {
    setSelectedNode(null);
    setSelectedEdge(null);
    setPendingFrom(null);
  };

  const toggleEdgeSign = (id: number) => {
    setEdges((prev) => prev.map((e) => (e.id === id ? { ...e, sign: e.sign === 1 ? -1 : 1 } : e)));
  };

  const commitTf = () => {
    if (selectedNode !== null) {
      setNodes((prev) => prev.map((n) => (n.id === selectedNode && n.kind === 'block' ? { ...n, tf: editTf } : n)));
    }
  };

  const nodeById = (id: number) => nodes.find((n) => n.id === id);
  const edgeById = (id: number) => edges.find((e) => e.id === id);

  /* ---- 梅逊计算：闭环 T(s) ---- */
  const result = useMemo<MasonGraphResult | { error: string } | null>(() => {
    const inputNode = nodes.find((n) => n.kind === 'input');
    const outputNode = nodes.find((n) => n.kind === 'output');
    if (!inputNode || !outputNode || nodes.length < 2) return null;
    const mapped: { from: number; to: number; num: number[]; den: number[] }[] = [];
    for (const e of edges) {
      const target = nodeById(e.to);
      if (!target) continue;
      // 目标为块：把块的传递函数作为该入边的增益。
      if (target.kind === 'block') {
        const g = parseGain(target.tf);
        mapped.push({ from: e.from, to: e.to, num: g.num, den: g.den });
      } else {
        // 求和点：+1 / -1；其余节点：+1。
        const sign = target.kind === 'sum' ? e.sign : 1;
        mapped.push({ from: e.from, to: e.to, num: [sign], den: [1] });
      }
    }
    return masonFromGraph(mapped, nodes.length, inputNode.id, outputNode.id);
  }, [nodes, edges]);

  /* ---- 稳态误差 ess（单位阶跃）：ess = (E/R)(0) ---- */
  const ess = useMemo<{ value: number; errorRatioNum: number[]; errorRatioDen: number[] } | null>(() => {
    const inputNode = nodes.find((n) => n.kind === 'input');
    if (!inputNode) return null;
    // 误差节点 = 直接接收输入边且带反馈的求和点（优先），否则第一个求和点。
    const sumNodes = nodes.filter((n) => n.kind === 'sum');
    if (sumNodes.length === 0) return null;
    const receivesInput = sumNodes.filter((n) => edges.some((e) => e.to === n.id && e.from === inputNode.id));
    const hasFeedback = sumNodes.filter((n) => edges.some((e) => e.to === n.id && e.sign === -1));
    const errorNode = receivesInput[0] ?? hasFeedback[0] ?? sumNodes[0];
    // 构建 E/R 的梅逊图（增益规则同闭环，但 sink 为误差节点）。
    const mapped: { from: number; to: number; num: number[]; den: number[] }[] = [];
    for (const e of edges) {
      const target = nodeById(e.to);
      if (!target) continue;
      if (target.kind === 'block') {
        const g = parseGain(target.tf);
        mapped.push({ from: e.from, to: e.to, num: g.num, den: g.den });
      } else {
        const sign = target.kind === 'sum' ? e.sign : 1;
        mapped.push({ from: e.from, to: e.to, num: [sign], den: [1] });
      }
    }
    const er = masonFromGraph(mapped, nodes.length, inputNode.id, errorNode.id);
    if (!er || 'error' in er) return { value: NaN, errorRatioNum: [], errorRatioDen: [] };
    const num = polyAtZero(er.num);
    const den = polyAtZero(er.den);
    return { value: den !== 0 ? num / den : NaN, errorRatioNum: er.num, errorRatioDen: er.den };
  }, [nodes, edges]);

  const isError = result !== null && 'error' in result;
  const ok = result !== null && !isError;

  const stepData = useMemo(() => {
    if (!ok || result.den.length === 0) return [];
    try {
      return stepResponse(result.num, result.den, 10, 300);
    } catch {
      return [];
    }
  }, [result]);

  const selEdge = selectedEdge !== null ? edgeById(selectedEdge) : null;
  const selNode = selectedNode !== null ? nodeById(selectedNode) : null;

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-border/40 bg-background/30 p-3">
        <div className="flex flex-wrap items-center gap-1.5 mb-2">
          <span className="text-[11px] font-medium text-muted-foreground mr-1">方框图建模</span>
          <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={() => addNode('block', W / 2 - 20, H / 2)}>
            + 方框
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={() => addNode('sum', W / 2 - 80, H / 2)}>
            + 求和点
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={() => addNode('pickoff', W / 2 + 40, H / 2)}>
            + 引出点
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-[11px] text-rose-500" onClick={removeSelected} disabled={selectedNode === null && selectedEdge === null}>
            删除所选
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-[11px]" onClick={clearAll}>
            清空
          </Button>
          <select
            value="-1"
            onChange={(e) => loadExample(Number(e.target.value))}
            className="h-7 rounded-md border border-border/60 bg-background px-2 text-[11px] outline-none"
          >
            <option value="-1">示例…</option>
            {EXAMPLES.map((ex, i) => (
              <option key={ex.label} value={i}>{ex.label}</option>
            ))}
          </select>
          <span className="mx-1 text-[10px] text-muted-foreground">单击选中/编辑 · 拖拽移动 · 先点源再点目标连线</span>
          {pendingFrom !== null && (
            <button
              type="button"
              onClick={() => setPendingFrom(null)}
              className="h-7 px-3 rounded-md text-[11px] font-medium border border-amber-500/60 bg-amber-500/15 text-amber-600 dark:text-amber-300 animate-pulse pointer-events-auto"
            >
              🔗 连线中 → 点击目标完成（点此取消）
            </button>
          )}
        </div>

        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="h-96 w-full rounded-md border border-border/50 bg-grid bg-background/40 touch-none select-none"
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onClick={handleBackgroundClick}
        >
          {/* 边 */}
          {edges.map((e) => {
            const a = nodeById(e.from);
            const b = nodeById(e.to);
            if (!a || !b) return null;
            const selected = selectedEdge === e.id;
            const isFeedback = e.sign === -1;
            const isBackward = b.x < a.x - 1 || isFeedback;
            const color = selected ? '#f472b6' : isFeedback ? '#fb923c' : '#94a3b8';
            const midX = (a.x + b.x) / 2;
            const backPath = `M ${a.x} ${a.y} C ${a.x} ${a.y + 70}, ${b.x} ${b.y + 70}, ${b.x} ${b.y}`;
            return (
              <g key={e.id} onClick={(ev) => handleEdgeClick(ev, e.id)} className="cursor-pointer">
                {isBackward ? (
                  <>
                    <path
                      d={backPath}
                      fill="none" stroke={color}
                      strokeWidth={selected ? 3 : 2}
                      strokeDasharray={isFeedback ? '6 3' : undefined}
                      strokeLinecap="round"
                    />
                    <ArrowHead x={b.x} y={b.y} angle={Math.atan2(b.y - a.y, b.x - a.x)} color={color} />
                  </>
                ) : (
                  <>
                    <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeWidth={selected ? 2.5 : 1.8} />
                    <ArrowHead x={b.x} y={b.y} angle={Math.atan2(b.y - a.y, b.x - a.x)} color={color} />
                  </>
                )}
                {/* 求和点入边符号：+/− 显示在目标侧 */}
                {b.kind === 'sum' && (
                  <text
                    x={midX}
                    y={a.y - 6}
                    textAnchor="middle" fontSize={13} fontWeight={700}
                    fill={e.sign === -1 ? '#fb923c' : '#4ade80'}
                    className="pointer-events-auto cursor-pointer"
                    onClick={(ev) => { ev.stopPropagation(); toggleEdgeSign(e.id); }}
                  >
                    {e.sign === 1 ? '+' : '−'}
                  </text>
                )}
              </g>
            );
          })}

          {/* 节点 */}
          {nodes.map((n) => {
            const isSel = selectedNode === n.id;
            const isInput = n.kind === 'input';
            const isOutput = n.kind === 'output';
            const isSource = pendingFrom === n.id;
            if (n.kind === 'input' || n.kind === 'output') {
              return (
                <g key={n.id} onPointerDown={(e) => handleNodePointerDown(e, n.id)} onClick={(e) => e.stopPropagation()} className="cursor-pointer">
                  <circle cx={n.x} cy={n.y} r={12} fill={isInput ? '#4ade80' : '#f472b6'} opacity={isSel ? 1 : 0.85}
                    stroke={isSel ? '#fff' : 'transparent'} strokeWidth={2} />
                  <text x={n.x} y={n.y + 3.5} textAnchor="middle" fontSize={9} fill="#000" fontWeight={700}>
                    {n.name}
                  </text>
                </g>
              );
            }
            if (n.kind === 'pickoff') {
              return (
                <g key={n.id} onPointerDown={(e) => handleNodePointerDown(e, n.id)} onClick={(e) => e.stopPropagation()} className="cursor-pointer">
                  <circle cx={n.x} cy={n.y} r={5.5} fill="#94a3b8" stroke={isSel ? '#fff' : 'transparent'} strokeWidth={2} />
                </g>
              );
            }
            if (n.kind === 'sum') {
              return (
                <g key={n.id} onPointerDown={(e) => handleNodePointerDown(e, n.id)} onClick={(e) => e.stopPropagation()} className="cursor-pointer">
                  <circle cx={n.x} cy={n.y} r={16} fill="rgba(148,163,184,0.12)" stroke={isSel ? '#f472b6' : '#94a3b8'} strokeWidth={1.5} />
                  <line x1={n.x - 16} y1={n.y} x2={n.x + 16} y2={n.y} stroke="#94a3b8" strokeWidth={1} />
                  <line x1={n.x} y1={n.y - 16} x2={n.x} y2={n.y + 16} stroke="#94a3b8" strokeWidth={1} />
                </g>
              );
            }
            // block：方框，随文本自动缩放。
            const fr = n.tf ? splitFrac(n.tf) : null;
            const numStr = fr ? fr.num : (n.tf ?? '1');
            const denLen = fr ? fr.den.length : 0;
            const maxLen = fr ? Math.max(numStr.length, denLen) : (n.tf ?? '1').length;
            const w = Math.max(60, maxLen * 8.2 + 28);
            const h = fr ? 40 : 32;
            return (
              <g key={n.id} onPointerDown={(e) => handleNodePointerDown(e, n.id)} onClick={(e) => e.stopPropagation()} className="cursor-pointer">
                <rect
                  x={n.x - w / 2} y={n.y - h / 2} width={w} height={h} rx={5}
                  fill={isSel ? 'rgba(244,114,182,0.16)' : 'rgba(167,139,250,0.14)'}
                  stroke={isSel ? '#f472b6' : '#a78bfa'}
                  strokeWidth={isSel ? 2.5 : 1.8}
                />
                {fr ? (
                  <>
                    <text x={n.x} y={n.y - 4} textAnchor="middle" fontSize={13} fontWeight={600} fontFamily="ui-monospace,monospace" fill={isSel ? '#f472b6' : '#c4b5fd'}>
                      {truncate(fr.num, 12)}
                    </text>
                    <line x1={n.x - w / 2 + 7} y1={n.y + 3} x2={n.x + w / 2 - 7} y2={n.y + 3} stroke={isSel ? '#f472b6' : '#c4b5fd'} strokeWidth={1.2} opacity={0.8} />
                    <text x={n.x} y={n.y + 16} textAnchor="middle" fontSize={13} fontWeight={600} fontFamily="ui-monospace,monospace" fill={isSel ? '#f472b6' : '#c4b5fd'}>
                      {truncate(fr.den, 12)}
                    </text>
                  </>
                ) : (
                  <text x={n.x} y={n.y + 5} textAnchor="middle" fontSize={15} fontWeight={600} fontFamily="ui-monospace,monospace" fill={isSel ? '#f472b6' : '#c4b5fd'}>
                    {truncate(n.tf ?? '1', 12)}
                  </text>
                )}
              </g>
            );
          })}

          {/* 连线起点高亮 */}
          {pendingFrom !== null && (
            <circle cx={nodeById(pendingFrom)?.x ?? 0} cy={nodeById(pendingFrom)?.y ?? 0} r={4} fill="#fbbf24" />
          )}
        </svg>

        {/* 选中块的传递函数编辑 */}
        {selNode && selNode.kind === 'block' && (
          <div className="mt-2 flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground shrink-0">方框传递函数 G(s)</span>
            <Input
              value={editTf}
              onChange={(e) => setEditTf(e.target.value)}
              onBlur={commitTf}
              onKeyDown={(e) => { if (e.key === 'Enter') { commitTf(); setSelectedNode(null); } }}
              className="h-7 flex-1 font-mono text-[12px]"
              placeholder="例：1/(s+1) 或 5 或 s+2"
            />
            <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={() => { commitTf(); setSelectedNode(null); }}>
              确定
            </Button>
          </div>
        )}
        {selEdge && selEdge !== null && selEdge.sign === -1 && (
          <div className="mt-2 text-[11px] text-amber-500">
            选中了反馈边（−1）：点击边上的「−」可切换正负反馈。
          </div>
        )}
      </div>

      {/* 结果 */}
      {ok && result && !('error' in result) && (
        <div className="rounded-md border border-border/40 bg-background/30 p-3 space-y-2">
          <div className="text-[11px] font-medium text-muted-foreground">闭环传递函数 T(s) = C(s)/R(s)</div>
          <div className="overflow-x-auto">
            <FormulaRenderer
              latex={`T(s)=\\dfrac{${polyToLatex(result.num)}}{${polyToLatex(result.den)}}`}
              displayMode
            />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
            <div className="rounded border border-border/40 bg-muted/20 px-2 py-1">
              <div className="text-[9.5px] text-muted-foreground">前向通路</div>
              <div className="font-mono text-primary">{result.forwardPaths.length}</div>
            </div>
            <div className="rounded border border-border/40 bg-muted/20 px-2 py-1">
              <div className="text-[9.5px] text-muted-foreground">回路</div>
              <div className="font-mono text-primary">{result.loops.length}</div>
            </div>
            <div className="rounded border border-border/40 bg-muted/20 px-2 py-1">
              <div className="text-[9.5px] text-muted-foreground">极点</div>
              <div className={cn('font-mono', result.stable ? 'text-emerald-400' : 'text-rose-400')}>
                {result.stable ? '稳定' : '不稳定'}
              </div>
            </div>
            <div className="rounded border border-border/40 bg-muted/20 px-2 py-1">
              <div className="text-[9.5px] text-muted-foreground">阶跃稳态误差 ess</div>
              <div className="font-mono text-primary">
                {ess && Number.isFinite(ess.value) ? Number(ess.value).toPrecision(4) : '—'}
              </div>
            </div>
          </div>
          {stepData.length > 0 && (
            <div>
              <div className="text-[10px] text-muted-foreground mb-1">闭环阶跃响应</div>
              <StatsChart
                compute={() => stepData}
                draw={renderStep}
                autoView={(pts) => autoViewOf(pts.map((p) => ({ x: p.t, y: p.y })))}
                tooltip={(w) => `t=${w.x.toFixed(2)}  y=${w.y.toFixed(3)}`}
                minHeight={340}
              />
            </div>
          )}
        </div>
      )}

      {/* 错误提示 */}
      {isError && result && 'error' in result && (
        <div className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-500">
          无法求传递函数：{result.error}
        </div>
      )}
    </div>
  );
}

function ArrowHead({ x, y, angle, color }: { x: number; y: number; angle: number; color: string }) {
  const len = 9;
  const a = angle;
  const p1 = { x: x - len * Math.cos(a - 0.4), y: y - len * Math.sin(a - 0.4) };
  const p2 = { x: x - len * Math.cos(a + 0.4), y: y - len * Math.sin(a + 0.4) };
  return (
    <polygon points={`${x},${y} ${p1.x},${p1.y} ${p2.x},${p2.y}`} fill={color} />
  );
}