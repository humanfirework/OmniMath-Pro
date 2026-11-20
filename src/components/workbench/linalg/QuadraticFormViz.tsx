'use client';

/**
 * OmniMath Pro — QuadraticFormViz: 二次型几何意义可视化
 *
 * 展示对称矩阵 A = [[a, b], [b, c]] 对应的二次型 f(x,y) = ax² + 2bxy + cy²
 * 的等高线图（level sets f = const）。
 *
 *   - 正定 / 负定  → 椭圆等高线（主轴半长 = √(c/λ)）
 *   - 不定          → 双曲线等高线，f=0 为两条渐近线（虚线）
 *   - 退化（半定）  → 平行线或单线
 *
 * 自动计算特征值 / 特征向量，绘制主轴方向（特征向量 × 2.5）。
 * 矩阵类型由 det / trace 判定；判别式 b²-4ac 按用户指定公式显示。
 */

import { useMemo, useState, type ReactElement } from 'react';
import { eigs, matrix } from 'mathjs';
import { Button } from '@/components/ui/button';
import { FormulaRenderer } from '@/components/workbench/FormulaRenderer';
import { RotateCcw, Lightbulb } from 'lucide-react';

// ---- SVG 配置 ----
const QF_SIZE = 300;
const QF_SCALE = 40; // px / unit
const QF_VIEW = QF_SIZE / 2 / QF_SCALE; // 3.75 units 半宽

const CONTOURS = [-8, -4, -2, -1, -0.5, 0.5, 1, 2, 4, 8];

const POS_COLOR = 'oklch(0.7 0.15 165)'; // 正等高线 — 青色
const NEG_COLOR = 'oklch(0.72 0.19 70)'; // 负等高线 — 橙色
const ZERO_COLOR = 'oklch(0.6 0.2 280)'; // 零等高线 — 紫色
const AXIS_EIGEN = 'oklch(0.6 0.2 280)'; // 主轴方向

interface QuadraticFormVizProps {
  /** 对称矩阵 [a, b, b, c] = [[a, b], [b, c]] */
  matrix: number[];
  onMatrixChange?: (m: number[]) => void;
}

interface QFPreset {
  label: string;
  m: number[];
  hint: string;
}

const PRESETS: QFPreset[] = [
  { label: '正定(单位)', m: [1, 0, 0, 1], hint: 'positive definite: identity' },
  { label: '负定', m: [-1, 0, 0, -1], hint: 'negative definite' },
  { label: '不定(双曲线)', m: [1, 0, 0, -1], hint: 'indefinite: hyperbola' },
  { label: '退化', m: [1, 0, 0, 0], hint: 'degenerate (semi-positive)' },
  { label: '一般正定', m: [2, 1, 1, 2], hint: 'general positive definite' },
];

type MatrixType = '正定' | '负定' | '不定' | '半正定' | '半负定' | '退化';

function worldToSvg(x: number, y: number): [number, number] {
  return [QF_SIZE / 2 + x * QF_SCALE, QF_SIZE / 2 - y * QF_SCALE];
}

function classifyMatrix(a: number, b: number, c: number): MatrixType {
  const det = a * c - b * b;
  const trace = a + c;
  const EPS = 1e-9;
  if (Math.abs(det) < EPS) {
    if (trace > EPS) return '半正定';
    if (trace < -EPS) return '半负定';
    return '退化';
  }
  if (det > 0) return trace > 0 ? '正定' : '负定';
  return '不定';
}

interface Eigen {
  values: number[];
  vectors: [number, number][];
}

/**
 * 计算对称 2×2 矩阵的特征值 / 特征向量。
 * 优先使用 mathjs `eigs`（满足导入要求），失败时回退到解析公式。
 * 结果按特征值降序排列。
 */
function computeEigen(a: number, b: number, c: number): Eigen {
  let values: number[] = [];
  try {
    const M = matrix([[a, b], [b, c]]);
    const result = eigs(M);
    const valsField = (result as { values: { toArray: () => unknown[] } | unknown[] }).values;
    const raw = Array.isArray(valsField) ? valsField : valsField.toArray();
    values = raw.map((v) => {
      const vn = v as { re?: number; im?: number } | number;
      if (typeof vn === 'number') return vn;
      if (vn && typeof vn === 'object' && 're' in vn) return vn.re ?? 0;
      return 0;
    });
  } catch {
    values = [];
  }
  if (values.length < 2) {
    // 解析公式回退：λ = (tr ± √(tr² - 4det)) / 2
    const tr = a + c;
    const det = a * c - b * b;
    const disc = Math.sqrt(Math.max(0, tr * tr - 4 * det));
    values = [(tr + disc) / 2, (tr - disc) / 2];
  }

  // 对每个 λ 求特征向量：(A - λI) v = 0
  //   [[a-λ, b],[b, c-λ]] → 零空间方向 (b, λ-a) 或 (λ-c, b)
  const vecFor = (lam: number): [number, number] => {
    let vx = b;
    let vy = lam - a;
    if (Math.abs(vx) < 1e-12 && Math.abs(vy) < 1e-12) {
      vx = lam - c;
      vy = b;
    }
    const len = Math.hypot(vx, vy) || 1;
    return [vx / len, vy / len];
  };
  const vectors: [number, number][] = values.map(vecFor);

  // 按特征值降序排列
  const order = values.map((_, i) => i).sort((i, j) => values[j] - values[i]);
  return {
    values: order.map((i) => values[i]),
    vectors: order.map((i) => vectors[i]),
  };
}

interface Contour {
  value: number;
  d: string;
  isZero: boolean;
  sign: 1 | -1 | 0;
}

/**
 * 在特征基下生成等高线 SVG path。
 * 设 (u, w) 为特征基坐标，f = λ1·u² + λ2·w²，世界坐标 (x,y) = u·v1 + w·v2。
 */
function buildContours(eigen: Eigen): Contour[] {
  const [l1, l2] = eigen.values;
  const [v1, v2] = eigen.vectors;
  const EPS = 1e-9;

  // 特征基 → 世界 → SVG 坐标字符串
  const svg = (u: number, w: number): string => {
    const x = u * v1[0] + w * v2[0];
    const y = u * v1[1] + w * v2[1];
    const [sx, sy] = worldToSvg(x, y);
    return `${sx.toFixed(2)},${sy.toFixed(2)}`;
  };

  const posDef = l1 > EPS && l2 > EPS;
  const negDef = l1 < -EPS && l2 < -EPS;
  const indef = l1 > EPS && l2 < -EPS;
  const semiPos = l1 > EPS && Math.abs(l2) < EPS;
  const semiNeg = Math.abs(l1) < EPS && l2 < -EPS;

  const out: Contour[] = [];

  for (const cv of CONTOURS) {
    const sign: 1 | -1 | 0 = cv > 0 ? 1 : cv < 0 ? -1 : 0;
    let d = '';

    if (posDef || negDef) {
      // 椭圆：要求 cv 与特征值同号
      const sameSign = (posDef && cv > 0) || (negDef && cv < 0);
      if (!sameSign) continue;
      const ru = Math.sqrt(Math.max(0, cv / l1));
      const rw = Math.sqrt(Math.max(0, cv / l2));
      const N = 80;
      const pts: string[] = [];
      for (let i = 0; i <= N; i++) {
        const th = (i / N) * Math.PI * 2;
        pts.push(svg(ru * Math.cos(th), rw * Math.sin(th)));
      }
      d = `M${pts.join(' L')} Z`;
    } else if (indef) {
      if (cv > 0) {
        // 沿 v1 方向开口：u = ±au·cosh(t), w = aw·sinh(t)
        const au = Math.sqrt(cv / l1);
        const aw = Math.sqrt(cv / -l2);
        const T = 2.2;
        const N = 50;
        const b1: string[] = [];
        const b2: string[] = [];
        for (let i = 0; i <= N; i++) {
          const t = -T + (2 * T * i) / N;
          b1.push(svg(au * Math.cosh(t), aw * Math.sinh(t)));
          b2.push(svg(-au * Math.cosh(t), aw * Math.sinh(t)));
        }
        d = `M${b1.join(' L')} M${b2.join(' L')}`;
      } else if (cv < 0) {
        // 沿 v2 方向开口：w = ±aw·cosh(t), u = au·sinh(t)
        const au = Math.sqrt(-cv / l1);
        const aw = Math.sqrt(cv / l2); // cv<0, l2<0 → >0
        const T = 2.2;
        const N = 50;
        const b1: string[] = [];
        const b2: string[] = [];
        for (let i = 0; i <= N; i++) {
          const t = -T + (2 * T * i) / N;
          b1.push(svg(au * Math.sinh(t), aw * Math.cosh(t)));
          b2.push(svg(au * Math.sinh(t), -aw * Math.cosh(t)));
        }
        d = `M${b1.join(' L')} M${b2.join(' L')}`;
      }
    } else if (semiPos) {
      // λ1>0, λ2≈0：f = λ1·u² = cv → cv>0 时 u=±√(cv/λ1)，两条平行线
      if (cv > 0) {
        const u0 = Math.sqrt(cv / l1);
        const W = 10;
        d = `M${svg(u0, -W)} L${svg(u0, W)} M${svg(-u0, -W)} L${svg(-u0, W)}`;
      }
    } else if (semiNeg) {
      // λ1≈0, λ2<0：f = λ2·w² = cv → cv<0 时 w=±√(cv/λ2)，两条平行线
      if (cv < 0) {
        const w0 = Math.sqrt(cv / l2);
        const W = 10;
        d = `M${svg(-W, w0)} L${svg(W, w0)} M${svg(-W, -w0)} L${svg(W, -w0)}`;
      }
    }
    if (d) out.push({ value: cv, d, isZero: false, sign });
  }

  // 零等高线 f = 0（虚线）
  if (indef) {
    // λ1·u² + λ2·w² = 0 → w = ±u·√(λ1 / -λ2)，两条渐近线
    const k = Math.sqrt(l1 / -l2);
    const W = 10;
    out.push({
      value: 0,
      d: `M${svg(-W, -W * k)} L${svg(W, W * k)} M${svg(-W, W * k)} L${svg(W, -W * k)}`,
      isZero: true,
      sign: 0,
    });
  } else if (semiPos) {
    // f = λ1·u² = 0 → u = 0，单线（沿 v2 方向）
    const W = 10;
    out.push({ value: 0, d: `M${svg(0, -W)} L${svg(0, W)}`, isZero: true, sign: 0 });
  } else if (semiNeg) {
    // f = λ2·w² = 0 → w = 0，单线（沿 v1 方向）
    const W = 10;
    out.push({ value: 0, d: `M${svg(-W, 0)} L${svg(W, 0)}`, isZero: true, sign: 0 });
  }

  return out;
}

export function QuadraticFormViz({ matrix, onMatrixChange }: QuadraticFormVizProps) {
  const [showMath, setShowMath] = useState(false);

  // matrix = [a, b, b, c]
  const a = matrix[0] ?? 1;
  const b = matrix[1] ?? 0;
  const c = matrix[3] ?? 1;

  const eigen = useMemo(() => computeEigen(a, b, c), [a, b, c]);
  const contours = useMemo(() => buildContours(eigen), [eigen]);
  const mtype = useMemo(() => classifyMatrix(a, b, c), [a, b, c]);

  const det = a * c - b * b;
  const trace = a + c;
  const disc = b * b - 4 * a * c; // 判别式（按用户指定公式 b² - 4ac）

  const updateCell = (idx: number, value: string) => {
    const n = parseFloat(value);
    const v = Number.isNaN(n) ? 0 : n;
    const next = [...matrix];
    next[idx] = v;
    if (idx === 1) next[2] = v; // 保持对称：b 同时写入 [0,1] 与 [1,0]
    if (idx === 2) next[1] = v;
    onMatrixChange?.(next);
  };

  const handleReset = () => onMatrixChange?.([1, 0, 0, 1]);

  // ---- SVG 元素 ----
  const [ox, oy] = worldToSvg(0, 0);

  const gridLines: ReactElement[] = [];
  for (let i = -Math.floor(QF_VIEW); i <= Math.floor(QF_VIEW); i++) {
    const isAxis = i === 0;
    const [v1x, v1y] = worldToSvg(i, -QF_VIEW);
    const [v2x, v2y] = worldToSvg(i, QF_VIEW);
    gridLines.push(
      <line key={`vg-${i}`} x1={v1x} y1={v1y} x2={v2x} y2={v2y}
        stroke="currentColor" strokeWidth={isAxis ? 1 : 0.5}
        className={isAxis ? 'text-foreground/40' : 'text-muted-foreground/20'} />,
    );
    const [h1x, h1y] = worldToSvg(-QF_VIEW, i);
    const [h2x, h2y] = worldToSvg(QF_VIEW, i);
    gridLines.push(
      <line key={`hg-${i}`} x1={h1x} y1={h1y} x2={h2x} y2={h2y}
        stroke="currentColor" strokeWidth={isAxis ? 1 : 0.5}
        className={isAxis ? 'text-foreground/40' : 'text-muted-foreground/20'} />,
    );
  }

  // 主轴方向箭头（特征向量 × 2.5）
  const axisArrows = eigen.vectors.map((v, i) => {
    const len = 2.5;
    const ex = v[0] * len;
    const ey = v[1] * len;
    const [sx, sy] = worldToSvg(ex, ey);
    const [nx, ny] = worldToSvg(-ex, -ey);
    const lam = eigen.values[i];
    return (
      <g key={`ax-${i}`}>
        <line x1={ox} y1={oy} x2={nx} y2={ny}
          stroke={AXIS_EIGEN} strokeWidth={1.2} opacity={0.35} strokeDasharray="3 2" />
        <line x1={ox} y1={oy} x2={sx} y2={sy}
          stroke={AXIS_EIGEN} strokeWidth={1.5} opacity={0.85}
          markerEnd="url(#qf-arrow)" />
        <text x={sx + 4} y={sy} fontSize="9" fontFamily="ui-monospace" className="fill-foreground/70">
          v{i + 1} (λ={lam.toFixed(2)})
        </text>
      </g>
    );
  });

  const typeColor =
    mtype === '正定' ? POS_COLOR :
    mtype === '负定' ? NEG_COLOR :
    mtype === '不定' ? 'oklch(0.65 0.2 25)' :
    AXIS_EIGEN;

  const discColor =
    disc > 1e-9 ? 'oklch(0.65 0.2 25)' :
    disc < -1e-9 ? POS_COLOR :
    AXIS_EIGEN;

  return (
    <div className="h-full flex flex-col gap-2 overflow-hidden">
      {/* 顶部控制栏 */}
      <div className="shrink-0 flex items-center gap-2 px-1 py-1 flex-wrap">
        <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-muted/40 border border-border/60">
          <span className="text-[10px] text-muted-foreground font-mono">A=[[</span>
          <input type="number" step="0.1" value={a}
            onChange={(e) => updateCell(0, e.target.value)}
            className="w-12 h-6 px-1 text-[11px] font-mono text-center bg-transparent border border-border/60 rounded focus:outline-none focus:border-primary"
            title="a (矩阵 [0,0])" />
          <input type="number" step="0.1" value={b}
            onChange={(e) => updateCell(1, e.target.value)}
            className="w-12 h-6 px-1 text-[11px] font-mono text-center bg-transparent border border-border/60 rounded focus:outline-none focus:border-primary"
            title="b (矩阵 [0,1] = [1,0]，对称)" />
          <span className="text-[10px] text-muted-foreground font-mono">,</span>
          <input type="number" step="0.1" value={c}
            onChange={(e) => updateCell(3, e.target.value)}
            className="w-12 h-6 px-1 text-[11px] font-mono text-center bg-transparent border border-border/60 rounded focus:outline-none focus:border-primary"
            title="c (矩阵 [1,1])" />
          <span className="text-[10px] text-muted-foreground font-mono">]]</span>
        </div>

        <Button size="sm" variant="outline" onClick={handleReset} className="h-6 px-2 text-[10.5px] gap-1">
          <RotateCcw className="size-3" />
          重置
        </Button>
        <Button size="sm" variant={showMath ? 'default' : 'outline'}
          onClick={() => setShowMath(!showMath)}
          className="h-6 px-2 text-[10.5px] gap-1" title="数学原理说明">
          <Lightbulb className="size-3" />
          原理
        </Button>

        <span className="px-2 py-0.5 text-[10px] rounded border border-border/60 bg-muted/30 font-mono">
          类型: <span className="font-medium" style={{ color: typeColor }}>{mtype}</span>
        </span>
      </div>

      {/* 预设 */}
      <div className="shrink-0 flex items-center gap-1 px-1 flex-wrap">
        <span className="text-[10px] text-muted-foreground">预设:</span>
        {PRESETS.map((p) => (
          <button key={p.hint} type="button"
            onClick={() => onMatrixChange?.(p.m)}
            className="px-2 py-0.5 text-[10px] rounded border border-border/60 bg-muted/30 hover:bg-accent hover:text-foreground transition-colors"
            title={p.hint}>
            {p.label}
          </button>
        ))}
      </div>

      {/* SVG 画布 + 信息面板 */}
      <div className="flex-1 min-h-0 flex gap-2 overflow-hidden">
        <div className="flex-1 min-h-0 grid place-items-center overflow-auto bg-muted/20 rounded-md border border-border/40">
          <svg width={QF_SIZE} height={QF_SIZE} viewBox={`0 0 ${QF_SIZE} ${QF_SIZE}`} className="max-w-full max-h-full">
            <defs>
              <clipPath id="qf-clip"><rect x="0" y="0" width={QF_SIZE} height={QF_SIZE} /></clipPath>
              <marker id="qf-arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
                <path d="M0,0 L8,4 L0,8 Z" fill={AXIS_EIGEN} />
              </marker>
            </defs>
            <g clipPath="url(#qf-clip)">
              {gridLines}
              {/* 等高线 */}
              {contours.map((ct, i) => {
                const color = ct.isZero ? ZERO_COLOR : ct.sign > 0 ? POS_COLOR : NEG_COLOR;
                return (
                  <path key={`ct-${i}`} d={ct.d} fill="none"
                    stroke={color}
                    strokeWidth={ct.isZero ? 1.2 : 1}
                    strokeDasharray={ct.isZero ? '4 3' : undefined}
                    opacity={ct.isZero ? 0.85 : 0.7} />
                );
              })}
              {/* 主轴方向 */}
              {axisArrows}
              {/* 原点 */}
              <circle cx={ox} cy={oy} r={2.5} fill="currentColor" className="text-foreground/70" />
            </g>
            {/* 坐标轴标签 */}
            <text x={QF_SIZE - 8} y={oy - 4} fontSize="9" fontFamily="ui-monospace" className="fill-foreground/50" textAnchor="end">x</text>
            <text x={ox + 4} y={10} fontSize="9" fontFamily="ui-monospace" className="fill-foreground/50">y</text>
          </svg>
        </div>

        {/* 信息面板 */}
        <div className="shrink-0 w-48 flex flex-col gap-1.5 p-2 rounded-md bg-muted/20 border border-border/40 text-[10.5px] overflow-y-auto">
          <div className="font-medium text-foreground/80">二次型信息</div>
          <div className="flex justify-between gap-1"><span className="text-muted-foreground shrink-0">f(x,y)</span><span className="font-mono text-right">{a}x²+{2 * b}xy+{c}y²</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">trace</span><span className="font-mono">{trace.toFixed(3)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">det</span><span className="font-mono">{det.toFixed(3)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Δ=b²-4ac</span><span className="font-mono" style={{ color: discColor }}>{disc.toFixed(3)}</span></div>

          <div className="mt-1 pt-1 border-t border-border/40">
            <div className="font-medium text-muted-foreground mb-1">特征值</div>
            {eigen.values.map((lam, i) => (
              <div key={i} className="flex justify-between font-mono text-[9.5px]">
                <span>λ{i + 1}</span>
                <span>{lam.toFixed(4)}</span>
              </div>
            ))}
          </div>

          <div className="mt-1 pt-1 border-t border-border/40">
            <div className="font-medium text-muted-foreground mb-1">主轴方向 (特征向量)</div>
            {eigen.vectors.map((v, i) => (
              <div key={i} className="font-mono text-[9.5px]">
                v{i + 1} = ({v[0].toFixed(3)}, {v[1].toFixed(3)})
              </div>
            ))}
            <div className="text-[9px] text-muted-foreground mt-0.5">主轴半长 = √(c/|λ|)</div>
          </div>

          {showMath && (
            <div className="mt-1 pt-1 border-t border-border/40 space-y-1.5">
              <div className="font-medium text-muted-foreground">数学原理</div>
              <FormulaRenderer latex={`Q(\\mathbf{x})=\\mathbf{x}^{T}A\\mathbf{x}=ax^2+2bxy+cy^2`} displayMode />
              <FormulaRenderer latex={`A=\\begin{pmatrix}${a.toFixed(2)}&${b.toFixed(2)}\\\\${b.toFixed(2)}&${c.toFixed(2)}\\end{pmatrix}`} displayMode />
              <div className="text-[9px] text-muted-foreground leading-tight space-y-0.5">
                <div>· 主轴定理：实对称矩阵可正交对角化，特征向量即椭圆/双曲线的主轴方向。</div>
                <div>· 等高线 Q = c：在特征基下为 λ₁u² + λ₂w² = c，主轴半长 = √(c/λ)。</div>
                <div>· det = ac − b²：&gt;0 定号（椭圆），&lt;0 不定（双曲线），=0 退化。</div>
                <div>· 判别式 Δ = b² − 4ac：圆锥曲线分类的传统判据（符号决定曲线类型）。</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
