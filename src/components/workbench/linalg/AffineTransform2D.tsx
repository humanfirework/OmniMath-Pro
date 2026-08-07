'use client';

/**
 * OmniMath Pro — 仿射 / 平移 / 透视变换可视化（齐次坐标）
 *
 * 用 3×3 齐次矩阵 M = [[a, b, tx], [c, d, ty], [px, py, w]] 表示：
 *   - 线性部分 [[a,b],[c,d]]：旋转 / 缩放 / 剪切 / 投影
 *   - 平移部分 [tx, ty]
 *   - 透视部分 [px, py, w]：w≠1 时做齐次除法 (x/w, y/w)
 *
 * 覆盖大纲 8 类中的 平移 / 仿射 / 透视（其余 5 类在 Transform2D 已实现）。
 * 纯 UI 组件、无外部数值依赖，复用 Transform2D 的 SVG 渲染范式。
 */

import { useState } from 'react';
import { FormulaRenderer } from '@/components/workbench/FormulaRenderer';

const VIEW = 3;
const SCALE = 56;
const SIZE = VIEW * 2 * SCALE;

/** 行列主序 3×3：m = [a,b,tx, c,d,ty, px,py,w] */
function applyH(m: number[], x: number, y: number): [number, number] {
  const [a, b, tx, c, d, ty, px, py, w] = m;
  const xp = a * x + b * y + tx;
  const yp = c * x + d * y + ty;
  const wp = px * x + py * y + w;
  if (Math.abs(wp) < 1e-9) return [Number.NaN, Number.NaN];
  return [xp / wp, yp / wp];
}

function worldToSvg(x: number, y: number): [number, number] {
  return [VIEW * SCALE + x * SCALE, VIEW * SCALE - y * SCALE];
}

interface PresetDef {
  label: string;
  kind: 'translation' | 'affine' | 'perspective';
  m: number[];
  desc: string;
}

const PRESETS: PresetDef[] = [
  { label: '单位', kind: 'affine', m: [1, 0, 0, 0, 1, 0, 0, 0, 1], desc: 'I₃ 齐次恒等变换' },
  { label: '平移', kind: 'translation', m: [1, 0, 2, 0, 1, 1, 0, 0, 1], desc: '平移 (2, 1)，线性部分不变' },
  { label: '平移+缩放', kind: 'affine', m: [2, 0, 1, 0, 1.5, -0.5, 0, 0, 1], desc: '仿射：缩放 + 平移' },
  { label: '仿射(旋转+剪切)', kind: 'affine', m: [0.866, -0.5, 1, 0.5, 0.866, 2, 0, 0, 1], desc: '旋转 30° + 平移 (1,2)' },
  { label: '透视', kind: 'perspective', m: [1, 0, 0, 0, 1, 0, 0.2, 0.1, 1], desc: '透视投影：w=0.2x+0.1y+1' },
  { label: '强透视', kind: 'perspective', m: [1, 0, 0, 0, 1, 0, 0.35, 0.2, 1], desc: '更强透视变形' },
];

/** 把 m 里的单个元素弹出为 9 个可编辑输入框的布局标签。 */
const CELL_LABELS = ['a', 'b', 'tx', 'c', 'd', 'ty', 'px', 'py', 'w'];

function matrix3ToLatex(m: number[]): string {
  const fmt = (v: number) => {
    if (!Number.isFinite(v)) return '\\text{?}';
    const r = Math.round(v * 100) / 100;
    return String(r);
  };
  return `\\begin{bmatrix} ${fmt(m[0])} & ${fmt(m[1])} & ${fmt(m[2])} \\\\ ${fmt(m[3])} & ${fmt(m[4])} & ${fmt(m[5])} \\\\ ${fmt(m[6])} & ${fmt(m[7])} & ${fmt(m[8])} \\end{bmatrix}`;
}

export function AffineTransform2D() {
  const [matrix, setMatrix] = useState<number[]>([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  const [showGrid, setShowGrid] = useState(true);
  const [showSquare, setShowSquare] = useState(true);
  const [showCircle, setShowCircle] = useState(true);
  const [showMath, setShowMath] = useState(false);

  const updateCell = (idx: number, value: string) => {
    const n = parseFloat(value);
    const next = [...matrix];
    next[idx] = Number.isNaN(n) ? 0 : n;
    setMatrix(next);
  };

  // 网格
  const gridLines: React.ReactElement[] = [];
  if (showGrid) {
    for (let i = -VIEW * 2; i <= VIEW * 2; i += 0.5) {
      const hPts: [number, number][] = [];
      for (let xi = -VIEW; xi <= VIEW + 0.01; xi += 0.5) hPts.push(applyH(matrix, xi, i / 2));
      const isAxis = Math.abs(i) < 0.01;
      gridLines.push(
        <polyline key={`h-${i}`} points={hPts.map(([x, y]) => worldToSvg(x, y).join(',')).join(' ')} fill="none"
          stroke={isAxis ? 'oklch(0.7 0.15 165 / 0.5)' : 'currentColor'}
          strokeWidth={isAxis ? 1.5 : 0.5} className={isAxis ? '' : 'text-muted-foreground/30'} />,
      );
      const vPts: [number, number][] = [];
      for (let yi = -VIEW; yi <= VIEW + 0.01; yi += 0.5) vPts.push(applyH(matrix, i / 2, yi));
      const isVAxis = Math.abs(i) < 0.01;
      gridLines.push(
        <polyline key={`v-${i}`} points={vPts.map(([x, y]) => worldToSvg(x, y).join(',')).join(' ')} fill="none"
          stroke={isVAxis ? 'oklch(0.78 0.15 75 / 0.5)' : 'currentColor'}
          strokeWidth={isVAxis ? 1.5 : 0.5} className={isVAxis ? '' : 'text-muted-foreground/30'} />,
      );
    }
  }

  // 单位正方形
  const squarePts = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([x, y]) => applyH(matrix, x, y));
  const squarePath = squarePts.map(([x, y], i) => {
    const [sx, sy] = worldToSvg(x, y);
    return `${i === 0 ? 'M' : 'L'}${isFinite(sx) ? sx : 0},${isFinite(sy) ? sy : 0}`;
  }).join(' ') + ' Z';

  // 单位圆
  const circlePts: [number, number][] = [];
  for (let i = 0; i <= 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    circlePts.push(applyH(matrix, Math.cos(a), Math.sin(a)));
  }
  const circlePath = circlePts.map(([x, y], i) => {
    const [sx, sy] = worldToSvg(x, y);
    return `${i === 0 ? 'M' : 'L'}${isFinite(sx) ? sx : 0},${isFinite(sy) ? sy : 0}`;
  }).join(' ') + ' Z';

  // 基向量
  const [ex, ey] = applyH(matrix, 1, 0);
  const [jy, jyy] = applyH(matrix, 0, 1);
  const [ox, oy] = applyH(matrix, 0, 0);
  const [isx, isy] = worldToSvg(ex, ey);
  const [jsx, jsy] = worldToSvg(jy, jyy);
  const [osx, osy] = worldToSvg(ox, oy);

  const kind = PRESETS.find((p) => p.m.every((v, i) => Math.abs(v - matrix[i]) < 1e-9))?.kind ?? 'affine';

  return (
    <div className="h-full flex flex-col gap-2 overflow-hidden">
      {/* Controls */}
      <div className="shrink-0 flex items-center gap-2 px-1 py-1 flex-wrap">
        <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-muted/40 border border-border/60">
          <span className="text-[10px] text-muted-foreground font-mono">M =</span>
          {matrix.map((v, i) => (
            <div key={i} className="flex flex-col items-center">
              <span className="text-[8px] text-muted-foreground/70 leading-none mb-0.5">{CELL_LABELS[i]}</span>
              <input type="number" step="0.1" value={v}
                onChange={(e) => updateCell(i, e.target.value)}
                className="w-11 h-6 px-1 text-[11px] font-mono text-center bg-transparent border border-border/60 rounded focus:outline-none focus:border-primary" />
            </div>
          ))}
        </div>

        <div className="flex items-center gap-1 text-[10px] flex-wrap">
          <p className="text-[10px] font-medium text-muted-foreground">
            类型：<span className="text-foreground">{kind}</span>
          </p>
          <label className="flex items-center gap-0.5 cursor-pointer ml-1">
            <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} className="accent-primary" />网格
          </label>
          <label className="flex items-center gap-0.5 cursor-pointer">
            <input type="checkbox" checked={showSquare} onChange={(e) => setShowSquare(e.target.checked)} className="accent-primary" />方块
          </label>
          <label className="flex items-center gap-0.5 cursor-pointer">
            <input type="checkbox" checked={showCircle} onChange={(e) => setShowCircle(e.target.checked)} className="accent-primary" />圆
          </label>
          <button type="button" onClick={() => setShowMath(!showMath)}
            className="px-1.5 py-0.5 text-[10px] rounded border border-border/60 bg-muted/30 hover:bg-accent transition-colors">
            原理
          </button>
        </div>
      </div>

      {/* Presets */}
      <div className="shrink-0 flex items-center gap-1 px-1 flex-wrap">
        <span className="text-[10px] text-muted-foreground">预设:</span>
        {PRESETS.map((p) => (
          <button key={p.label} type="button" title={p.desc}
            onClick={() => setMatrix([...p.m])}
            className="px-2 py-0.5 text-[10px] rounded border border-border/60 bg-muted/30 hover:bg-accent hover:text-foreground transition-colors">
            {p.label}
          </button>
        ))}
      </div>

      {/* SVG canvas + info */}
      <div className="flex-1 min-h-0 flex gap-2 overflow-hidden">
        <div className="flex-1 min-h-0 grid place-items-center overflow-auto bg-muted/20 rounded-md border border-border/40">
          <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="max-w-full max-h-full">
            {gridLines}
            <circle cx={osx} cy={osy} r={2.5} fill="currentColor" className="text-foreground/60" />
            {showSquare && <path d={squarePath} fill="oklch(0.7 0.15 165 / 0.12)" stroke="oklch(0.7 0.15 165)" strokeWidth={1.5} />}
            {showCircle && <path d={circlePath} fill="oklch(0.78 0.15 75 / 0.08)" stroke="oklch(0.78 0.15 75)" strokeWidth={1.5} />}
            <line x1={osx} y1={osy} x2={isx} y2={isy} stroke="oklch(0.65 0.2 25)" strokeWidth={2} markerEnd="url(#arrow-a2d)" />
            <line x1={osx} y1={osy} x2={jsx} y2={jsy} stroke="oklch(0.7 0.18 95)" strokeWidth={2} markerEnd="url(#arrow-j2d)" />
            <text x={isx + 5} y={isy} className="fill-foreground/80" fontSize="11" fontFamily="ui-monospace">î ({isFinite(ex) ? ex.toFixed(2) : '∞'}, {isFinite(ey) ? ey.toFixed(2) : '∞'})</text>
            <text x={jsx + 5} y={jsy} className="fill-foreground/80" fontSize="11" fontFamily="ui-monospace">ĵ ({isFinite(jy) ? jy.toFixed(2) : '∞'}, {isFinite(jyy) ? jyy.toFixed(2) : '∞'})</text>
            <defs>
              <marker id="arrow-a2d" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="oklch(0.65 0.2 25)" /></marker>
              <marker id="arrow-j2d" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="oklch(0.7 0.18 95)" /></marker>
            </defs>
          </svg>
        </div>

        <div className="shrink-0 w-44 flex flex-col gap-1.5 p-2 rounded-md bg-muted/20 border border-border/40 text-[10.5px] overflow-y-auto">
          <div className="font-medium text-foreground/80">齐次变换</div>
          <FormulaRenderer latex={`M=${matrix3ToLatex(matrix)}`} className="text-[10px]" />
          <div className="flex justify-between"><span className="text-muted-foreground">原点</span><span className="font-mono">({isFinite(ox) ? ox.toFixed(2) : '∞'}, {isFinite(oy) ? oy.toFixed(2) : '∞'})</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">|î|</span><span className="font-mono">{isFinite(ex) && isFinite(ey) ? Math.hypot(ex, ey).toFixed(3) : '∞'}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">|ĵ|</span><span className="font-mono">{isFinite(jy) && isFinite(jyy) ? Math.hypot(jy, jyy).toFixed(3) : '∞'}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">透视 w</span><span className="font-mono">{matrix[8].toFixed(3)}</span></div>

          <div className="mt-1 pt-1 border-t border-border/40 space-y-1">
            <div className="font-medium text-muted-foreground">分类</div>
            <div className="text-[9.5px] text-muted-foreground leading-tight">
              {kind === 'translation' && '平移：仅 [tx,ty] 非零，图形不变形。'}
              {kind === 'affine' && '仿射：线性 + 平移，平行线仍平行、面积等比缩放。'}
              {kind === 'perspective' && '透视：w 随坐标变化，平行线汇聚于灭点。'}
            </div>
          </div>

          {showMath && (
            <div className="mt-1 pt-1 border-t border-border/40 space-y-1.5">
              <div className="font-medium text-muted-foreground">数学原理</div>
              <FormulaRenderer latex={`\\begin{pmatrix}x'\\\\y'\\\\w'\\end{pmatrix}=M\\begin{pmatrix}x\\\\y\\\\1\\end{pmatrix},\\quad (X,Y)=\\left(\\frac{x'}{w'},\\frac{y'}{w'}\\right)`} displayMode />
              <div className="text-[9px] text-muted-foreground leading-tight">w&apos;=1 → 仿射；w&apos;≠1 → 透视。w&apos;→0 时点趋于无穷远。</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}