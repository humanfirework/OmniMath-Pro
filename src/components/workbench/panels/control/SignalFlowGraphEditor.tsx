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
import { polyToLatexFrac } from '@/components/workbench/panels/control/latex';
import { FormulaRenderer } from '@/components/workbench/FormulaRenderer';
import { StatsChart } from '@/components/workbench/panels/stats/StatsChart';
import { renderStep } from '@/lib/control/chartRender';

const W = 620;
const H = 440;
const NODE_R = 20;
// 反馈/回程边（从右往左）的纵向弯曲幅度，避免与正向边重叠。
const BACK_EDGE_BEND = 60;

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

/** 系数转字符串（去掉浮点噪声，负数带符号）。 */
function fmtCoeff(c: number): string {
  const a = Math.abs(c);
  const s = a !== 0 && (a > 1e7 || (a < 1e-4 && a > 0)) ? c.toPrecision(4) : String(Number(c.toPrecision(6)));
  return s;
}

/**
 * 把小数格式化为「最简分数」（当分母较小且足够接近时），否则回退到精简小数。
 * 用于极点等展示，避免 0.333333 / 1.414214 这类长小数难以阅读。
 * 例：-1.5 → -3/2，0.3333 → 1/3，2.5 → 5/2，√2≈1.4142 → 1.4142（非有理则保留小数）。
 */
function fmtFrac(v: number): string {
  if (!Number.isFinite(v)) return String(v);
  if (Math.abs(v - Math.round(v)) < 1e-9) return String(Math.round(v));
  const av = Math.abs(v);
  if (av > 1e4) return String(Number(v.toPrecision(4)));
  let bestN = 0;
  let bestD = 1;
  let bestErr = Infinity;
  for (let d = 1; d <= 50; d++) {
    const n = Math.round(av * d);
    const err = Math.abs(av - n / d);
    if (err < bestErr) {
      bestErr = err;
      bestN = n;
      bestD = d;
    }
  }
  if (bestD > 1 && bestErr < 0.005) {
    const sign = v < 0 ? '-' : '';
    const whole = Math.floor(bestN / bestD);
    const rem = bestN % bestD;
    if (whole > 0) return rem > 0 ? `${sign}${whole} ${rem}/${bestD}` : `${sign}${whole}`;
    return `${sign}${rem}/${bestD}`;
  }
  return String(Number(v.toPrecision(4)));
}

/** 复数的分数式展示：实部 / 虚部分别按最简分数格式化。 */
function fmtComplex(re: number, im: number): string {
  const rs = fmtFrac(re);
  if (Math.abs(im) < 1e-12) return rs;
  const is = fmtFrac(Math.abs(im));
  return `${rs} ${im >= 0 ? '+' : '−'} ${is}i`;
}

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

/** 把增益字符串按顶层 '/'（括号外）切成分子/分母，便于分式显示。 */
function splitGainFraction(raw: string): { num: string; den: string } | null {
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

/** 超长文本截断（保留尾部 '…'）。 */
function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + '…' : s;
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

  // 传递函数 → 信号流图
  const [tfNum, setTfNum] = useState('1');
  const [tfDen, setTfDen] = useState('s^2+3s+2');
  const [tfError, setTfError] = useState<string | null>(null);

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

  // 直接 II 型可控标准型信号流图：
  //   H(s) = (b_0+b_1 s+…+b_{n-1}s^{n-1}+b_n s^n) / (s^n + a_0 + a_1 s + … + a_{n-1}s^{n-1})
  //   状态 x_1…x_n：x_1'=x_2、…、x_{n-1}'=x_n、x_n'=u - a_0 x_1 - … - a_{n-1} x_n
  //   信号流图：R(输入) → Σ(求和) → x_n → x_{n-1} → … → x_1 →（前馈各路）→ Y(输出)
  //     积分链 Σ→x_n→…→x_1 均带 1/s；反馈 x_i→Σ 增益 -a_{i-1}（橙色虚线）；
  //     前馈 x_i→Y 增益 c_i = b_{i-1} - b_n·a_{i-1}；直通 R→Y 增益 b_n。
  const buildFromTF = () => {
    setTfError(null);
    let num: number[];
    let den: number[];
    try {
      num = parsePolynomial(tfNum);
      den = parsePolynomial(tfDen);
    } catch {
      setTfError(`传递函数解析失败，请检查输入。`);
      return;
    }
    const n = den.length - 1; // 阶数
    if (n < 1) { setTfError('分母次数至少为 1。'); return; }
    if (Math.abs(den[0]) < 1e-12) { setTfError('分母首项系数不能为 0。'); return; }
    // 归一化分母为首一多项式：D(s)=s^n + a[1]s^{n-1} + … + a[n]（a[1..n] 为反馈系数）
    const a = den.map((c) => c / den[0]);
    // 分子系数 b[j]（j=0 常数项，j=1..n 为 s^j 系数，幂次升序）
    const b = new Array<number>(n + 1).fill(0);
    const m = num.length - 1;
    for (let j = 0; j <= n; j++) b[j] = j <= m ? num[m - j] / den[0] : 0;
    const bn = b[n]; // 直通项（同次）

    // 节点 id：0=R，1=Σ，状态 x_i 的 id = 2 + (n - i)（x_n 紧邻 Σ，x_1 在最右），Y=2+n
    const nodes: GNode[] = [{ id: 0, x: 80, y: 200 }, { id: 1, x: 190, y: 200 }];
    for (let slot = 0; slot < n; slot++) {
      nodes.push({ id: 2 + slot, x: 300 + slot * 100, y: 200 });
    }
    const Y = 2 + n;
    nodes.push({ id: Y, x: 300 + n * 100, y: 200 });

    const edges: GEdge[] = [];
    const eid = (() => { let k = 1; return () => k++; })();
    // 输入 R → Σ
    edges.push({ id: eid(), from: 0, to: 1, gain: '1' });
    // 积分链：Σ→x_n→x_{n-1}→…→x_1（n 条，均 1/s）
    for (let id = 1; id <= Y - 2; id++) {
      edges.push({ id: eid(), from: id, to: id + 1, gain: '1/s' });
    }
    // 反馈：x_i → Σ，增益 -a_{i-1}（a_{i-1}=a[n-i+1]）
    for (let i = 1; i <= n; i++) {
      const coef = a[n - i + 1];
      if (Math.abs(coef) > 1e-12) {
        edges.push({ id: eid(), from: 2 + (n - i), to: 1, gain: `-${fmtCoeff(coef)}` });
      }
    }
    // 前馈：x_i → Y，增益 c_i = b[i-1] - bn·a_{i-1}
    for (let i = 1; i <= n; i++) {
      const c = b[i - 1] - bn * a[n - i + 1];
      if (Math.abs(c) > 1e-12) {
        edges.push({ id: eid(), from: 2 + (n - i), to: Y, gain: `${fmtCoeff(c)}` });
      }
    }
    // 直通项 R → Y
    if (Math.abs(bn) > 1e-12) {
      edges.push({ id: eid(), from: 0, to: Y, gain: `${fmtCoeff(bn)}` });
    }

    setNodes(nodes);
    setEdges(edges);
    setSourceId(0);
    setSinkId(Y);
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

  // 反馈边检测：参与任一回路（存在 from→...→to→from 的路径，或自环）的边视为反馈。
  const feedbackEdgeIds = useMemo<Set<number>>(() => {
    const set = new Set<number>();
    const out: Record<number, number[]> = {};
    for (const e of edges) {
      (out[e.from] ??= []).push(e.to);
    }
    const reach: Record<number, Set<number>> = {};
    const dfsReach = (start: number) => {
      if (reach[start]) return reach[start];
      const seen = new Set<number>();
      const stack = [start];
      while (stack.length) {
        const cur = stack.pop()!;
        for (const nxt of out[cur] ?? []) {
          if (!seen.has(nxt)) { seen.add(nxt); stack.push(nxt); }
        }
      }
      reach[start] = seen;
      return seen;
    };
    for (const e of edges) {
      if (e.from === e.to) { set.add(e.id); continue; }
      const r = dfsReach(e.from);
      if (r.has(e.to)) set.add(e.id); // from 能回到 to，说明该边在某个环上
    }
    return set;
  }, [edges]);

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
          {pendingFrom !== null && (
            <button
              type="button"
              onClick={() => setPendingFrom(null)}
              className="h-7 px-3 rounded-md text-[11px] font-medium border border-amber-500/60 bg-amber-500/15 text-amber-600 dark:text-amber-300 animate-pulse pointer-events-auto"
            >
              🔗 连线中：从「{pendingFrom === sourceId ? 'R' : pendingFrom === sinkId ? 'Y' : 'x' + pendingFrom}」出发 → 点击目标节点完成（点此取消）
            </button>
          )}
        </div>

        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="h-96 w-full rounded-md border border-border/50 bg-grid bg-background/40 touch-none select-none"
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
            const isFeedback = feedbackEdgeIds.has(e.id);
            // 回程边：目标在源的左侧（右→左）或反馈边，向下弯曲成弧线，避免与正向边重叠。
            const isBackward = b.x < a.x - 1 || isFeedback;
            const selected = selectedEdge === e.id;
            const edgeColor = selected ? '#f472b6' : isFeedback ? '#fb923c' : '#94a3b8';
            const selfLoopPath = `M ${a.x} ${a.y - NODE_R} C ${a.x + 60} ${a.y - 60}, ${a.x + 60} ${a.y + 30}, ${a.x} ${a.y + NODE_R}`;
            const midX = (a.x + b.x) / 2;
            const midY = isBackward ? Math.max(a.y, b.y) + BACK_EDGE_BEND / 2 : (a.y + b.y) / 2;
            // 弧线路径：控制点向下（或向上）弯曲，使反馈边与主线分离
            const backPath = `M ${a.x} ${a.y} C ${a.x} ${a.y + BACK_EDGE_BEND}, ${b.x} ${b.y + BACK_EDGE_BEND}, ${b.x} ${b.y}`;
            const labelY = isBackward ? midY + (isFeedback ? 6 : 10) : midY;
            return (
              <g key={e.id} onClick={(ev) => handleEdgeClick(ev, e.id)} className="cursor-pointer">
                {isSelf ? (
                  <path d={selfLoopPath} fill="none" stroke={edgeColor} strokeWidth={selected ? 2.5 : 1.8} />
                ) : isBackward ? (
                  <>
                    <path
                      d={backPath}
                      fill="none"
                      stroke={edgeColor}
                      strokeWidth={selected ? 3 : isFeedback ? 2.6 : 2}
                      strokeDasharray={isFeedback ? '6 3' : undefined}
                      strokeLinecap="round"
                    />
                    {/* 反馈/回程边是向下弯曲的贝塞尔曲线，末端切线竖直向上；用 -π/2 让箭头贴合曲线，
                        而不是沿直线弦方向（否则箭头会横向扎进节点，难以观察方向）。 */}
                    <ArrowHead x={b.x} y={b.y} angle={-Math.PI / 2} color={edgeColor} isFeedback={isFeedback} />
                  </>
                ) : (
                  <>
                    <line
                      x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                      stroke={edgeColor}
                      strokeWidth={selected ? 2.5 : isFeedback ? 2.2 : 1.8}
                      strokeDasharray={isFeedback ? '5 3' : undefined}
                    />
                    <ArrowHead x={b.x} y={b.y} angle={Math.atan2(b.y - a.y, b.x - a.x)} color={edgeColor} isFeedback={isFeedback} />
                  </>
                )}
                {/* 增益标签：自动按内容定宽；分式显示为「分子/分数线/分母」便于阅读 */}
                <g className="pointer-events-auto">
                  {(() => {
                    // 顶层 '/' 切分分子/分母（忽略括号内），如 1/(s+1) → [1, s+1]
                    const fr = splitGainFraction(e.gain);
                    const isFrac = fr !== null;
                    const numStr = isFrac ? fr.num : e.gain;
                    const denLen = fr ? fr.den.length : 0;
                    const maxLen = isFrac
                      ? Math.max(numStr.length, denLen)
                      : e.gain.length;
                    const w = Math.max(40, maxLen * 7.2 + 16);
                    const isFracTall = isFrac && (numStr.length > 4 || denLen > 4);
                    const h = isFrac ? (isFracTall ? 34 : 30) : 22;
                    const cx = midX;
                    const cy = labelY;
                    return (
                      <g>
                        <rect
                          x={cx - w / 2} y={cy - h / 2} width={w} height={h} rx={5}
                          fill={isFeedback ? 'rgba(251,146,60,0.12)' : 'var(--background)'}
                          stroke={isFeedback ? '#fb923c' : 'var(--border)'}
                          strokeWidth={1}
                        />
                        {isFrac ? (
                          <>
                            <text x={cx} y={cy - (isFracTall ? 3 : 1)} textAnchor="middle" fontSize={10.5} fontFamily="ui-monospace,monospace" fill={isFeedback ? '#fb923c' : 'var(--foreground)'} className="cursor-text">
                              {truncate(numStr, 10)}
                            </text>
                            <line x1={cx - w / 2 + 5} y1={isFracTall ? cy + 3 : cy + 2} x2={cx + w / 2 - 5} y2={isFracTall ? cy + 3 : cy + 2} stroke={isFeedback ? '#fb923c' : 'currentColor'} strokeWidth={1} opacity={0.6} />
                            <text x={cx} y={cy + (isFracTall ? 12 : 11)} textAnchor="middle" fontSize={10.5} fontFamily="ui-monospace,monospace" fill={isFeedback ? '#fb923c' : 'var(--foreground)'} className="cursor-text">
                              {fr ? truncate(fr.den, 10) : ''}
                            </text>
                          </>
                        ) : (
                          <text x={cx} y={cy + 3.5} textAnchor="middle" fontSize={11} fontWeight={500} fontFamily="ui-monospace,monospace" fill={isFeedback ? '#fb923c' : 'var(--foreground)'} className="cursor-text">
                            {truncate(e.gain, maxLen > 10 ? 12 : 12)}
                          </text>
                        )}
                      </g>
                    );
                  })()}
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
                onDoubleClick={(e) => e.stopPropagation()}
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

        {/* 图例：边/节点颜色说明 */}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="inline-block w-5 h-0.5" style={{ background: '#94a3b8' }} /> 正向边
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-5 h-0.5 border-t-2 border-dashed" style={{ borderColor: '#fb923c' }} /> 反馈边（虚线，
            <span className="text-[#fb923c]">回程</span>）
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block size-2.5 rounded-full bg-emerald-500" /> 输入 R
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block size-2.5 rounded-full bg-blue-500" /> 输出 Y
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block size-2.5 rounded-full bg-slate-600" /> 状态节点
          </span>
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

        {/* 传递函数 → 信号流图 */}
        <div className="mt-2 rounded-md border border-border/40 bg-background/40 p-2.5">
          <div className="text-[10px] font-medium text-muted-foreground mb-1.5">
            传递函数 → 信号流图（直接 II 型可控标准型）
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <label className="text-[10px] text-muted-foreground block">
              分子 N(s)
              <Input value={tfNum} onChange={(e) => setTfNum(e.target.value)} className="mt-0.5 h-8 font-mono text-[12px]" placeholder="例：1" />
            </label>
            <label className="text-[10px] text-muted-foreground block">
              分母 D(s)
              <Input value={tfDen} onChange={(e) => setTfDen(e.target.value)} className="mt-0.5 h-8 font-mono text-[12px]" placeholder="例：s^2+3s+2" />
            </label>
            <Button variant="outline" size="sm" className="h-8 self-end text-[11px]" onClick={buildFromTF}>
              生成信号流图
            </Button>
          </div>
          <div className="flex flex-wrap gap-1 mt-1.5">
            <span className="text-[10px] text-muted-foreground mr-1">预设：</span>
            {(['1/s+1', '1/s^2+3s+2', 's+2/s^2+2s+1', '5/s^3+3s^2+2s'] as const).map((preset) => {
              const [numP, denP] = preset.split('/');
              return (
                <button
                  key={preset}
                  onClick={() => { setTfNum(numP); setTfDen(denP); }}
                  className="h-6 px-2 rounded text-[10px] border border-border/50 text-muted-foreground hover:bg-accent/60"
                >
                  {preset}
                </button>
              );
            })}
          </div>
          {tfError && (
            <div className="mt-1.5 rounded border border-rose-500/40 bg-rose-500/10 px-2 py-1 text-[11px] text-rose-600 dark:text-rose-300">
              {tfError}
            </div>
          )}
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
              <FormulaRenderer
                latex={`T(s) = ${polyToLatexFrac(result.num, result.den)}`}
                displayMode
                fitToContainer
                className="text-sm"
              />
              <div className="mt-1 text-[10px] text-muted-foreground">
                特征式 Δ = {polyToLatex(result.deltaNum)} / {polyToLatex(result.deltaDen)}
              </div>
            </div>
            <div className="rounded-md border border-border/40 bg-background/30 p-2.5">
              <div className="text-[10px] text-muted-foreground mb-1">极点与稳定性</div>
              <div className={cn('text-[11.5px] font-mono', result.stable ? 'text-emerald-400' : 'text-rose-400')}>
                {result.stable ? '稳定（全部极点 Re < 0）' : '不稳定（存在右半平面极点）'}
              </div>
              <div className="mt-1 flex flex-wrap gap-x-2 font-mono text-[11px] text-foreground">
                {result.poles.map((p, i) => (
                  <span key={i} className={p.re < 0 ? 'text-emerald-400' : 'text-rose-400'}>
                    {fmtComplex(p.re, p.im)}
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
                    <FormulaRenderer
                      latex={`= ${polyToLatexFrac(p.num, p.den)}`}
                      className="text-[11px] leading-none"
                    />
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
                    <FormulaRenderer
                      latex={`= ${polyToLatexFrac(l.num, l.den)}`}
                      className="text-[11px] leading-none"
                    />
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
                minHeight={340}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** 有向边箭头（在目标节点处）。反馈边（回环）用较大、更醒目的箭头。 */
function ArrowHead({ x, y, angle, color, isFeedback = false }: { x: number; y: number; angle: number; color: string; isFeedback?: boolean }) {
  const L = isFeedback ? 15 : 12;
  const x1 = x - L * Math.cos(angle);
  const y1 = y - L * Math.sin(angle);
  const x2 = x - L * Math.cos(angle - 0.45);
  const y2 = y - L * Math.sin(angle - 0.45);
  const x3 = x - L * Math.cos(angle + 0.45);
  const y3 = y - L * Math.sin(angle + 0.45);
  return <polygon points={`${x1},${y1} ${x2},${y2} ${x3},${y3}`} fill={color} />;
}
