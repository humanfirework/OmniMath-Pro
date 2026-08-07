'use client';

/**
 * OmniMath Pro — 信号流图可视化建模（Signal Flow Graph Editor）
 *
 * 「自己画信号流图，然后看传递函数 / 闭环 / 极点判稳」：
 *   - 双击空白处或点「+ 节点」添加节点；拖拽节点调整布局。
 *   - 点一个节点进入连线模式，再点另一节点（或自身）创建有向边。
 *   - 边的增益支持 s 的多项式（如 1、s、-2、s+1）或分式（如 1/(s+1)）。
 *   - 指定输入（source）与输出（sink）节点。
 *   - 自动用梅逊增益公式（masonFromGraph）求传递函数 T(s)，
 *     并展示前向通路、回路、Δ、极点与稳定判据、闭环阶跃响应。
 */

import { useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  masonFromGraph,
  parsePolynomial,
  stepResponse,
  type MasonGraphResult,
} from '@/lib/control/transferFunction';
import { polyToLatex } from '@/components/workbench/panels/ControlTheorySection';
import { StatsChart } from '@/components/workbench/panels/stats/StatsChart';
import { renderStep } from '@/lib/control/chartRender';

const W = 620;
const H = 400;
const NODE_R = 20;

interface GNode {
  id: number;
  x: number;
  y: number;
}
interface GEdge {
  id: number;
  from: number;
  to: number;
  /** 增益字符串：多项式（1、s、-2）或分式（num/den，如 1/(s+1)）。 */
  gain: string;
}

/** 默认示例：单位反馈（源→求和→对象→输出，对象→求和 反馈，反馈边增益 -1）。 */
const DEFAULT_EDGES: GEdge[] = [
  { id: 1, from: 0, to: 1, gain: '1' },
  { id: 2, from: 1, to: 2, gain: '1/(s+1)' },
  { id: 3, from: 2, to: 3, gain: '1' },
  { id: 4, from: 2, to: 1, gain: '-1' },
];
const DEFAULT_NODES: GNode[] = [
  { id: 0, x: 90, y: 200 },
  { id: 1, x: 230, y: 200 },
  { id: 2, x: 390, y: 200 },
  { id: 3, x: 540, y: 200 },
];

const EXAMPLES: { label: string; nodes: GNode[]; edges: GEdge[]; source: number; sink: number }[] = [
  {
    label: '单位反馈',
    nodes: DEFAULT_NODES,
    edges: DEFAULT_EDGES,
    source: 0,
    sink: 3,
  },
  {
    label: '两级串联',
    nodes: [
      { id: 0, x: 100, y: 200 },
      { id: 1, x: 280, y: 200 },
      { id: 2, x: 460, y: 200 },
      { id: 3, x: 520, y: 200 },
    ],
    edges: [
      { id: 1, from: 0, to: 1, gain: '1' },
      { id: 2, from: 1, to: 2, gain: 's+1' },
      { id: 3, from: 2, to: 3, gain: '1/(s+2)' },
    ],
    source: 0,
    sink: 3,
  },
  {
    label: '双回路（不相交）',
    nodes: [
      { id: 0, x: 90, y: 300 },
      { id: 1, x: 230, y: 300 },
      { id: 2, x: 390, y: 300 },
      { id: 3, x: 540, y: 300 },
      { id: 4, x: 230, y: 120 },
      { id: 5, x: 390, y: 120 },
    ],
    edges: [
      { id: 1, from: 0, to: 1, gain: '1' },
      { id: 2, from: 1, to: 2, gain: '1' },
      { id: 3, from: 2, to: 3, gain: '1' },
      { id: 4, from: 4, to: 1, gain: '1' },
      { id: 5, from: 1, to: 4, gain: '-0.5' },
      { id: 6, from: 5, to: 2, gain: '1' },
      { id: 7, from: 2, to: 5, gain: '-0.3' },
    ],
    source: 0,
    sink: 3,
  },
];

/** 解析边增益：支持 'num' 或 'num/den'，返回 { num, den }（系数数组）。 */
function parseEdgeGain(raw: string): { num: number[]; den: number[] } | null {
  const s = raw.trim();
  if (!s) return { num: [1], den: [1] };
  const slash = s.lastIndexOf('/');
  if (slash > 0 && slash < s.length - 1) {
    const numStr = s.slice(0, slash).trim();
    const denStr = s.slice(slash + 1).trim();
    try {
      return { num: parsePolynomial(numStr), den: parsePolynomial(denStr) };
    } catch {
      return null;
    }
  }
  try {
    return { num: parsePolynomial(s), den: [1] };
  } catch {
    return null;
  }
}

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

export function SignalFlowGraphEditor() {
  const [nodes, setNodes] = useState<GNode[]>(DEFAULT_NODES);
  const [edges, setEdges] = useState<GEdge[]>(DEFAULT_EDGES);
  const [sourceId, setSourceId] = useState<number>(0);
  const [sinkId, setSinkId] = useState<number>(3);
  const [nextNodeId, setNextNodeId] = useState(10);
  const [nextEdgeId, setNextEdgeId] = useState(10);

  const [selectedNode, setSelectedNode] = useState<number | null>(null);
  const [pendingFrom, setPendingFrom] = useState<number | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<number | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{ id: number; dx: number; dy: number } | null>(null);

  /* ---- 坐标换算（viewBox meet 映射） ---- */
  const toSvg = (clientX: number, clientY: number): { x: number; y: number } => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const scale = Math.min(rect.width / W, rect.height / H);
    const offX = (rect.width - W * scale) / 2;
    const offY = (rect.height - H * scale) / 2;
    return { x: (clientX - rect.left - offX) / scale, y: (clientY - rect.top - offY) / scale };
  };

  /* ---- 增删节点/边 ---- */
  const addNode = (x: number, y: number) => {
    const id = nextNodeId;
    setNodes((prev) => [...prev, { id, x, y }]);
    setNextNodeId((v) => v + 1);
  };
  const addEdge = (from: number, to: number) => {
    const id = nextEdgeId;
    setEdges((prev) => [...prev, { id, from, to, gain: '1' }]);
    setNextEdgeId((v) => v + 1);
  };
  const removeSelected = () => {
    if (selectedNode !== null) {
      const id = selectedNode;
      setNodes((prev) => prev.filter((n) => n.id !== id));
      setEdges((prev) => prev.filter((e) => e.from !== id && e.to !== id));
      if (sourceId === id) setSourceId(-1);
      if (sinkId === id) setSinkId(-1);
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
    setSourceId(-1);
    setSinkId(-1);
    setSelectedNode(null);
    setSelectedEdge(null);
    setPendingFrom(null);
  };

  /* ---- 画布交互 ---- */
  const handleSvgDoubleClick = (e: React.MouseEvent) => {
    const p = toSvg(e.clientX, e.clientY);
    addNode(p.x, p.y);
  };
  const handleNodePointerDown = (e: React.PointerEvent, id: number) => {
    e.stopPropagation();
    if (pendingFrom !== null) {
      // 连线模式：给 pendingFrom → id 加边
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
    (e.target as Element).setPointerCapture(e.pointerId);
  };
  const handleSvgPointerMove = (e: React.PointerEvent) => {
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
  const handleSvgBackgroundClick = () => {
    setSelectedNode(null);
    setSelectedEdge(null);
    setPendingFrom(null);
  };

  const updateEdgeGain = (id: number, gain: string) => {
    setEdges((prev) => prev.map((e) => (e.id === id ? { ...e, gain } : e)));
  };

  /* ---- 梅逊计算 ---- */
  const result = useMemo<MasonGraphResult | { error: string } | null>(() => {
    if (nodes.length < 2 || sourceId < 0 || sinkId < 0) return null;
    const mapped: { num: number[]; den: number[] }[] = [];
    for (const e of edges) {
      const g = parseEdgeGain(e.gain);
      if (!g) return { error: `边增益解析失败：${e.gain}` };
      mapped.push(g);
    }
    const eIn = edges.map((e, i) => ({ from: e.from, to: e.to, num: mapped[i].num, den: mapped[i].den }));
    return masonFromGraph(eIn, nodes.length, sourceId, sinkId);
  }, [nodes, edges, sourceId, sinkId]);

  const stepData = useMemo(() => {
    if (!result || 'error' in result || result.den.length === 0) return [];
    try {
      return stepResponse(result.num, result.den, 8, 300);
    } catch {
      return [];
    }
  }, [result]);

  const edgeById = (id: number) => edges.find((e) => e.id === id);
  const nodeById = (id: number) => nodes.find((n) => n.id === id);
  const selEdge = selectedEdge !== null ? edgeById(selectedEdge) : null;

  const isError = result !== null && 'error' in result;
  const ok = result !== null && !isError;

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-border/40 bg-background/30 p-3">
        <div className="flex flex-wrap items-center gap-1.5 mb-2">
          <span className="text-[11px] font-medium text-muted-foreground mr-1">信号流图建模</span>
          <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={() => addNode(W / 2 - 20, H / 2)}>
            + 节点
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-[11px] text-rose-500" onClick={removeSelected} disabled={selectedNode === null && selectedEdge === null}>
            删除所选
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-[11px]" onClick={clearAll}>
            清空
          </Button>
          <span className="mx-1 text-[10px] text-muted-foreground">双击空白加节点 · 拖拽移动 · 先点节点再点另一节点连线</span>
        </div>

        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="h-72 w-full rounded-md border border-border/50 bg-grid bg-background/40 touch-none select-none"
          onDoubleClick={handleSvgDoubleClick}
          onPointerMove={handleSvgPointerMove}
          onPointerUp={handlePointerUp}
          onClick={handleSvgBackgroundClick}
        >
          {/* 边 */}
          {edges.map((e) => {
            const a = nodeById(e.from);
            const b = nodeById(e.to);
            if (!a || !b) return null;
            const isSelf = e.from === e.to;
            const midX = (a.x + b.x) / 2;
            const midY = (a.y + b.y) / 2;
            const selected = selectedEdge === e.id;
            const selfLoopPath = `M ${a.x} ${a.y - NODE_R} C ${a.x + 60} ${a.y - 60}, ${a.x + 60} ${a.y + 30}, ${a.x} ${a.y + NODE_R}`;
            return (
              <g key={e.id} onClick={(ev) => handleEdgeClick(ev, e.id)} className="cursor-pointer">
                {isSelf ? (
                  <path d={selfLoopPath} fill="none" stroke={selected ? '#f472b6' : '#94a3b8'} strokeWidth={selected ? 2.5 : 1.8} />
                ) : (
                  <>
                    <line
                      x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                      stroke={selected ? '#f472b6' : '#94a3b8'}
                      strokeWidth={selected ? 2.5 : 1.8}
                    />
                    <ArrowHead x={b.x} y={b.y} angle={Math.atan2(b.y - a.y, b.x - a.x)} color={selected ? '#f472b6' : '#94a3b8'} />
                  </>
                )}
                {/* 增益标签 */}
                <g className="pointer-events-auto">
                  <rect x={midX - 26} y={midY - 11} width={52} height={22} rx={4} fill="var(--background)" stroke="var(--border)" className="cursor-text" />
                  <text x={midX} y={midY + 3.5} textAnchor="middle" fontSize={11} fontFamily="ui-monospace,monospace" fill="var(--foreground)" className="cursor-text">
                    {e.gain.length > 8 ? e.gain.slice(0, 8) + '…' : e.gain}
                  </text>
                </g>
              </g>
            );
          })}

          {/* 节点 */}
          {nodes.map((n) => {
            const isSource = n.id === sourceId;
            const isSink = n.id === sinkId;
            const isSel = selectedNode === n.id;
            const isPending = pendingFrom === n.id;
            const fill = isSource ? '#10b981' : isSink ? '#3b82f6' : isPending ? '#f59e0b' : '#334155';
            return (
              <g
                key={n.id}
                onPointerDown={(e) => handleNodePointerDown(e, n.id)}
                className="cursor-pointer"
                onContextMenu={(e) => e.preventDefault()}
              >
                <circle cx={n.x} cy={n.y} r={NODE_R} fill={fill} stroke={isSel ? '#f472b6' : '#1e293b'} strokeWidth={isSel ? 2.5 : 1.5} />
                <text x={n.x} y={n.y + 3.5} textAnchor="middle" fontSize={11} fontWeight={600} fill="#fff">
                  {n.id === sourceId ? 'R' : n.id === sinkId ? 'Y' : 'x' + n.id}
                </text>
              </g>
            );
          })}
        </svg>

        {/* 输入输出 / 编辑区 */}
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <label className="text-[10px] text-muted-foreground block">
            输入节点（source）
            <select
              value={sourceId}
              onChange={(e) => setSourceId(Number(e.target.value))}
              className="mt-0.5 h-8 w-full rounded-md border border-border/60 bg-background px-2 text-[12px]"
            >
              <option value={-1}>— 未指定 —</option>
              {nodes.map((n) => (
                <option key={n.id} value={n.id}>{n.id === sinkId ? `节点 ${n.id}（当前为输出）` : `节点 ${n.id}`}</option>
              ))}
            </select>
          </label>
          <label className="text-[10px] text-muted-foreground block">
            输出节点（sink）
            <select
              value={sinkId}
              onChange={(e) => setSinkId(Number(e.target.value))}
              className="mt-0.5 h-8 w-full rounded-md border border-border/60 bg-background px-2 text-[12px]"
            >
              <option value={-1}>— 未指定 —</option>
              {nodes.map((n) => (
                <option key={n.id} value={n.id}>{n.id === sourceId ? `节点 ${n.id}（当前为输入）` : `节点 ${n.id}`}</option>
              ))}
            </select>
          </label>
          <label className="text-[10px] text-muted-foreground block">
            选中边增益（如 1、s、-2、1/(s+1)）
            <Input
              value={selEdge?.gain ?? ''}
              disabled={!selEdge}
              onChange={(e) => selEdge && updateEdgeGain(selEdge.id, e.target.value)}
              className="mt-0.5 h-8 font-mono text-[12px]"
              placeholder={selEdge ? '输入增益' : '先点击一条边'}
            />
          </label>
        </div>

        {/* 示例 */}
        <div className="mt-2 flex flex-wrap items-center gap-1">
          <span className="text-[10px] text-muted-foreground mr-1">示例：</span>
          {EXAMPLES.map((ex) => (
            <button
              key={ex.label}
              onClick={() => {
                setNodes(ex.nodes);
                setEdges(ex.edges);
                setSourceId(ex.source);
                setSinkId(ex.sink);
                setSelectedNode(null);
                setSelectedEdge(null);
                setPendingFrom(null);
              }}
              className="h-6 px-2 rounded text-[10px] border border-border/50 text-muted-foreground hover:bg-accent/60"
            >
              {ex.label}
            </button>
          ))}
          <button
            className="h-6 px-2 rounded text-[10px] border border-border/50 text-muted-foreground hover:bg-accent/60"
            onClick={() => setPendingFrom(null)}
          >
            取消连线
          </button>
        </div>
      </div>

      {/* 结果 */}
      {result === null && (
        <div className="rounded-md border border-border/40 bg-background/30 p-3 text-[11.5px] text-muted-foreground">
          添加节点、连线并指定输入/输出后，自动计算梅逊增益与传递函数。
        </div>
      )}
      {isError && (
        <div className="rounded-md border border-rose-500/40 bg-rose-500/10 p-2.5 text-[11.5px] text-rose-600 dark:text-rose-300">
          {'error' in result ? result.error : '计算失败'}
        </div>
      )}
      {ok && result && (
        <div className="space-y-3">
          {/* 传递函数 + 稳定判据 */}
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <div className="rounded-md border border-border/40 bg-background/30 p-2.5">
              <div className="text-[10px] text-muted-foreground mb-1">总传递函数 T(s) = ΣPₖΔₖ / Δ</div>
              <div className="overflow-x-auto font-mono text-[12.5px] text-primary whitespace-nowrap">
                T(s) = {polyToLatex(result.num)} / {polyToLatex(result.den)}
              </div>
              <div className="mt-1 text-[10px] text-muted-foreground">
                特征式 Δ = {polyToLatex(result.deltaNum)} / {polyToLatex(result.deltaDen)}
              </div>
            </div>
            <div className="rounded-md border border-border/40 bg-background/30 p-2.5">
              <div className="text-[10px] text-muted-foreground mb-1">极点与稳定性</div>
              <div className={cn('text-[11.5px] font-mono', result.stable ? 'text-emerald-400' : 'text-rose-400')}>
                {result.stable ? '稳定（全部极点 Re < 0）' : '不稳定（存在右半平面极点）'}
              </div>
              <div className="mt-1 flex flex-wrap gap-x-2 font-mono text-[10.5px] text-foreground">
                {result.poles.map((p, i) => (
                  <span key={i} className={p.re < 0 ? 'text-emerald-400' : 'text-rose-400'}>
                    {p.re.toFixed(3)}{p.im >= 0 ? '+' : ''}{p.im.toFixed(3)}i
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* 前向通路 / 回路 */}
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <div className="rounded-md border border-border/40 bg-background/30 p-2.5 text-[11px]">
              <div className="text-muted-foreground mb-1">前向通路（{result.forwardPaths.length}）</div>
              <div className="space-y-1">
                {result.forwardPaths.map((p, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-muted-foreground">P{i + 1}:</span>
                    <span className="font-mono text-primary">{p.nodes.join('→')}</span>
                    <span className="font-mono text-[10px] text-sky-500">= {polyToLatex(p.num)}/{polyToLatex(p.den)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-md border border-border/40 bg-background/30 p-2.5 text-[11px]">
              <div className="text-muted-foreground mb-1">回路（{result.loops.length}）{result.nonTouchingPairs.length > 0 ? ` · 不相交对 ${result.nonTouchingPairs.length}` : ''}{result.nonTouchingTriples.length > 0 ? ` · 三元组 ${result.nonTouchingTriples.length}` : ''}</div>
              <div className="space-y-1">
                {result.loops.map((l, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-muted-foreground">L{i + 1}:</span>
                    <span className="font-mono text-primary">{l.nodes.join('→') + '→' + l.nodes[0]}</span>
                    <span className="font-mono text-[10px] text-sky-500">= {polyToLatex(l.num)}/{polyToLatex(l.den)}</span>
                  </div>
                ))}
                {result.loops.length === 0 && <span className="text-muted-foreground">无回路（开环路径）</span>}
              </div>
            </div>
          </div>

          {/* 闭环阶跃响应 */}
          {stepData.length > 0 && (
            <div>
              <div className="mb-1 text-[10.5px] text-muted-foreground">闭环单位阶跃响应</div>
              <StatsChart
                compute={() => stepData}
                draw={renderStep}
                autoView={(pts) => autoViewOf(pts.map((p) => ({ x: p.t, y: p.y })))}
                tooltip={(w) => `t=${w.x.toFixed(2)}  y=${w.y.toFixed(3)}`}
                minHeight={240}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** 有向边箭头（在目标节点处）。 */
function ArrowHead({ x, y, angle, color }: { x: number; y: number; angle: number; color: string }) {
  const L = 12;
  const x1 = x - L * Math.cos(angle);
  const y1 = y - L * Math.sin(angle);
  const x2 = x - L * Math.cos(angle - 0.45);
  const y2 = y - L * Math.sin(angle - 0.45);
  const x3 = x - L * Math.cos(angle + 0.45);
  const y3 = y - L * Math.sin(angle + 0.45);
  return <polygon points={`${x1},${y1} ${x2},${y2} ${x3},${y3}`} fill={color} />;
}
