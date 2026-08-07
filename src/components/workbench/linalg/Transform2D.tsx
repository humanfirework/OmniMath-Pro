'use client';

/**
 * OmniMath Pro — Transform2D: 增强版 2D 线性变换可视化
 *
 * 在原有 LinearTransformAnimation 基础上增强：
 *   - 8 个预设变换（剪切/旋转/缩放/投影/反射/挤压/复合1/复合2）
 *   - 特征向量叠加显示（用 mathjs eigs 计算）
 *   - 行列式区域可视化（填充多边形）
 *   - 数学原理说明面板
 *   - 自定义输入向量变换显示
 *   - 支持分步模式（通过 ZoomLens）
 */

import { useState, useEffect, useMemo, type ReactElement } from 'react';
import { Button } from '@/components/ui/button';
import { Play, Pause, RotateCcw, Lightbulb } from 'lucide-react';
import { FormulaRenderer } from '@/components/workbench/FormulaRenderer';
import { ZoomLens, type ZoomStep } from '@/components/workbench/controls/ZoomLens';
import { eigs, matrix, complex } from 'mathjs';

const TFORM_VIEW = 3;
const TFORM_SCALE = 56;
const TFORM_SIZE = TFORM_VIEW * 2 * TFORM_SCALE;

function applyMatrix(a: number, b: number, c: number, d: number, x: number, y: number): [number, number] {
  return [a * x + b * y, c * x + d * y];
}

function lerpMatrix(m: number[], t: number): [number, number, number, number] {
  return [
    m[0] * t + 1 * (1 - t),
    m[1] * t + 0 * (1 - t),
    m[2] * t + 0 * (1 - t),
    m[3] * t + 1 * (1 - t),
  ];
}

function worldToSvg(x: number, y: number): [number, number] {
  return [
    TFORM_VIEW * TFORM_SCALE + x * TFORM_SCALE,
    TFORM_VIEW * TFORM_SCALE - y * TFORM_SCALE,
  ];
}

interface PresetDef {
  label: string;
  m: number[];
  hint: string;
}

const PRESETS: PresetDef[] = [
  { label: '剪切', m: [1, 1, 0, 1], hint: 'shear' },
  { label: '旋转45°', m: [Math.cos(Math.PI / 4), -Math.sin(Math.PI / 4), Math.sin(Math.PI / 4), Math.cos(Math.PI / 4)], hint: 'rotation' },
  { label: '缩放2x', m: [2, 0, 0, 2], hint: 'scale' },
  { label: '投影', m: [1, 0, 0, 0], hint: 'projection (det=0)' },
  { label: '反射', m: [1, 0, 0, -1], hint: 'reflection (x-axis)' },
  { label: '挤压', m: [2, 0, 0, 0.5], hint: 'squeeze' },
  { label: '复合1', m: [1, 0.5, 0.5, 1], hint: 'compound shear+scale' },
  { label: '复合2', m: [0.8, -0.6, 0.6, 0.8], hint: 'rotation+scale' },
];

interface Transform2DProps {
  /** 矩阵 [a, b, c, d] = [[a,b],[c,d]] */
  matrix: number[];
  onMatrixChange?: (m: number[]) => void;
}

export function Transform2D({ matrix, onMatrixChange }: Transform2DProps) {
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [showCircle, setShowCircle] = useState(true);
  const [showSquare, setShowSquare] = useState(true);
  const [showEigen, setShowEigen] = useState(false);
  const [showDetArea, setShowDetArea] = useState(false);
  const [showMath, setShowMath] = useState(false);
  const [stepMode, setStepMode] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [inputVec, setInputVec] = useState<[number, number]>([1.5, 2]);

  // 动画循环
  useEffect(() => {
    if (!playing || stepMode) return;
    let raf = 0;
    const start = performance.now();
    const duration = 1500;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      setProgress(eased);
      if (t < 1) raf = requestAnimationFrame(tick);
      else setPlaying(false);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, stepMode]);

  // 分步模式步骤
  const stepDefs: ZoomStep[] = useMemo(() => {
    const fractions = [0, 0.25, 0.5, 0.75, 1];
    return fractions.map((f) => {
      const m = lerpMatrix(matrix, f);
      const d = m[0] * m[3] - m[1] * m[2];
      return {
        label: `进度 ${Math.round(f * 100)}%`,
        description: `det = ${d.toFixed(3)}  ·  [[${m[0].toFixed(2)}, ${m[1].toFixed(2)}], [${m[2].toFixed(2)}, ${m[3].toFixed(2)}]]`,
        fraction: f,
      };
    });
  }, [matrix]);

  const effectiveProgress = stepMode ? ((stepDefs[stepIndex]?.fraction as number | undefined) ?? 0) : progress;
  const [a, b, c, d] = lerpMatrix(matrix, effectiveProgress);
  const det = a * d - b * c;

  // 特征值/特征向量计算
  const eigenData = useMemo(() => {
    if (!showEigen) return null;
    try {
      // 注：组件 prop `matrix` 遮蔽了 mathjs 的 `matrix` 导入；此处断言为可调用，
      // 保持原有运行行为（调用失败时由 catch 兜底返回 null）。
      const M = (matrix as unknown as (m: number[][]) => Parameters<typeof eigs>[0])(
        [[matrix[0], matrix[1]], [matrix[2], matrix[3]]],
      );
      const result = eigs(M);
      const values = (result as { values: { toArray: () => unknown[] } }).values.toArray();
      return values.map((v) => {
        const vNum = v as { re?: number; im?: number } | number;
        if (typeof vNum === 'number') {
          // 计算特征向量：(A - λI)v = 0
          const lambda = vNum;
          const a11 = matrix[0] - lambda;
          const a22 = matrix[3] - lambda;
          // 特征向量方向：(a12, lambda - a11) 或 (lambda - a22, a21)
          let vx = matrix[1];
          let vy = lambda - matrix[0];
          if (Math.abs(vx) < 1e-10 && Math.abs(vy) < 1e-10) {
            vx = lambda - matrix[3];
            vy = matrix[2];
          }
          const len = Math.hypot(vx, vy) || 1;
          return { value: lambda, vec: [vx / len, vy / len] as [number, number] };
        }
        return null;
      }).filter(Boolean);
    } catch {
      return null;
    }
  }, [matrix, showEigen]);

  // 网格线
  const gridLines: ReactElement[] = [];
  if (showGrid) {
    for (let i = -TFORM_VIEW * 2; i <= TFORM_VIEW * 2; i += 0.5) {
      const pts: [number, number][] = [];
      for (let xi = -TFORM_VIEW; xi <= TFORM_VIEW + 0.01; xi += 0.5) {
        pts.push(applyMatrix(a, b, c, d, xi, i / 2));
      }
      const isAxis = Math.abs(i) < 0.01;
      const svgPts = pts.map(([x, y]) => worldToSvg(x, y).join(',')).join(' ');
      gridLines.push(
        <polyline key={`h-${i}`} points={svgPts} fill="none"
          stroke={isAxis ? 'oklch(0.7 0.15 165 / 0.5)' : 'currentColor'}
          strokeWidth={isAxis ? 1.5 : 0.5}
          className={isAxis ? '' : 'text-muted-foreground/30'} />,
      );
      const vpts: [number, number][] = [];
      for (let yi = -TFORM_VIEW; yi <= TFORM_VIEW + 0.01; yi += 0.5) {
        vpts.push(applyMatrix(a, b, c, d, i / 2, yi));
      }
      const isVAxis = Math.abs(i) < 0.01;
      const vSvgPts = vpts.map(([x, y]) => worldToSvg(x, y).join(',')).join(' ');
      gridLines.push(
        <polyline key={`v-${i}`} points={vSvgPts} fill="none"
          stroke={isVAxis ? 'oklch(0.78 0.15 75 / 0.5)' : 'currentColor'}
          strokeWidth={isVAxis ? 1.5 : 0.5}
          className={isVAxis ? '' : 'text-muted-foreground/30'} />,
      );
    }
  }

  // 单位正方形
  const squareCorners: [number, number][] = [
    [0, 0], [1, 0], [1, 1], [0, 1],
  ].map(([x, y]) => applyMatrix(a, b, c, d, x, y));
  const squarePath = squareCorners.map(([x, y], i) => {
    const [sx, sy] = worldToSvg(x, y);
    return `${i === 0 ? 'M' : 'L'}${sx},${sy}`;
  }).join(' ') + ' Z';

  // 行列式区域填充（原单位正方形变换后的区域）
  const detAreaPath = showDetArea ? squarePath : '';

  // 单位圆
  const circlePts: [number, number][] = [];
  for (let i = 0; i <= 36; i++) {
    const angle = (i / 36) * Math.PI * 2;
    circlePts.push(applyMatrix(a, b, c, d, Math.cos(angle), Math.sin(angle)));
  }
  const circlePath = circlePts.map(([x, y], i) => {
    const [sx, sy] = worldToSvg(x, y);
    return `${i === 0 ? 'M' : 'L'}${sx},${sy}`;
  }).join(' ') + ' Z';

  // 基向量
  const [ihatSvgX, ihatSvgY] = worldToSvg(a, c);
  const [jhatSvgX, jhatSvgY] = worldToSvg(b, d);
  const [originSvgX, originSvgY] = worldToSvg(0, 0);

  // 自定义输入向量
  const [vecX, vecY] = applyMatrix(a, b, c, d, inputVec[0], inputVec[1]);
  const [vecSvgX, vecSvgY] = worldToSvg(vecX, vecY);

  const updateCell = (idx: number, value: string) => {
    const n = parseFloat(value);
    const next = [...matrix];
    // Infinity / NaN 输入一律按 0 处理，杜绝几何体整体消失
    next[idx] = Number.isFinite(n) ? n : 0;
    onMatrixChange?.(next);
    setProgress(1);
  };

  const handlePlay = () => {
    if (progress >= 1) setProgress(0);
    setPlaying(true);
  };
  const handleReset = () => {
    setPlaying(false);
    setProgress(0);
    onMatrixChange?.([1, 0, 0, 1]);
  };

  return (
    <div className="h-full flex flex-col gap-2 overflow-hidden">
      {/* Controls */}
      <div className="shrink-0 flex items-center gap-2 px-1 py-1 flex-wrap">
        {/* Matrix inputs */}
        <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-muted/40 border border-border/60">
          <span className="text-[10px] text-muted-foreground font-mono">[[</span>
          {matrix.map((v, i) => (
            <input key={i} type="number" step="0.1" value={v}
              onChange={(e) => updateCell(i, e.target.value)}
              className="w-12 h-6 px-1 text-[11px] font-mono text-center bg-transparent border border-border/60 rounded focus:outline-none focus:border-primary" />
          ))}
          <span className="text-[10px] text-muted-foreground font-mono">]]</span>
        </div>

        {/* Play / Reset / Step mode */}
        <div className="flex items-center gap-0.5">
          {!stepMode && (
            <Button size="sm" variant="default" onClick={handlePlay} disabled={playing} className="h-6 px-2 text-[10.5px] gap-1">
              {playing ? <Pause className="size-3" /> : <Play className="size-3" />}
              {playing ? '播放中' : '播放'}
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={handleReset} className="h-6 px-2 text-[10.5px] gap-1">
            <RotateCcw className="size-3" />
            重置
          </Button>
          <Button size="sm" variant={stepMode ? 'default' : 'outline'}
            onClick={() => { setStepMode(!stepMode); setPlaying(false); }}
            className="h-6 px-2 text-[10.5px]" title="切换分步/连续动画模式">
            {stepMode ? '分步' : '连续'}
          </Button>
          <Button size="sm" variant={showMath ? 'default' : 'outline'}
            onClick={() => setShowMath(!showMath)}
            className="h-6 px-2 text-[10.5px] gap-1" title="数学原理说明">
            <Lightbulb className="size-3" />
            原理
          </Button>
        </div>

        {/* Progress slider (连续模式) */}
        {!stepMode && (
          <input type="range" min="0" max="1" step="0.01" value={progress}
            onChange={(e) => { setPlaying(false); setProgress(parseFloat(e.target.value)); }}
            className="flex-1 min-w-[80px] h-1 accent-primary" />
        )}

        {/* Toggles */}
        <div className="flex items-center gap-1 text-[10px] flex-wrap">
          <label className="flex items-center gap-0.5 cursor-pointer">
            <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} className="accent-primary" />网格
          </label>
          <label className="flex items-center gap-0.5 cursor-pointer">
            <input type="checkbox" checked={showSquare} onChange={(e) => setShowSquare(e.target.checked)} className="accent-primary" />方块
          </label>
          <label className="flex items-center gap-0.5 cursor-pointer">
            <input type="checkbox" checked={showCircle} onChange={(e) => setShowCircle(e.target.checked)} className="accent-primary" />圆
          </label>
          <label className="flex items-center gap-0.5 cursor-pointer">
            <input type="checkbox" checked={showEigen} onChange={(e) => setShowEigen(e.target.checked)} className="accent-primary" />特征向量
          </label>
          <label className="flex items-center gap-0.5 cursor-pointer">
            <input type="checkbox" checked={showDetArea} onChange={(e) => setShowDetArea(e.target.checked)} className="accent-primary" />行列式区域
          </label>
        </div>
      </div>

      {/* Presets */}
      <div className="shrink-0 flex items-center gap-1 px-1 flex-wrap">
        <span className="text-[10px] text-muted-foreground">预设:</span>
        {PRESETS.map((p) => (
          <button key={p.hint} type="button"
            onClick={() => { onMatrixChange?.(p.m); setProgress(0); setPlaying(!stepMode); }}
            className="px-2 py-0.5 text-[10px] rounded border border-border/60 bg-muted/30 hover:bg-accent hover:text-foreground transition-colors"
            title={p.hint}>
            {p.label}
          </button>
        ))}
      </div>

      {/* SVG canvas + info */}
      <div className="flex-1 min-h-0 flex gap-2 overflow-hidden">
        <div className="flex-1 min-h-0 grid place-items-center overflow-auto bg-muted/20 rounded-md border border-border/40">
          <svg width={TFORM_SIZE} height={TFORM_SIZE} viewBox={`0 0 ${TFORM_SIZE} ${TFORM_SIZE}`} className="max-w-full max-h-full">
            {/* Grid */}
            {gridLines}
            {/* Origin */}
            <circle cx={originSvgX} cy={originSvgY} r={2} fill="currentColor" className="text-foreground/60" />
            {/* 行列式区域填充 */}
            {showDetArea && detAreaPath && (
              <path d={detAreaPath} fill={det >= 0 ? 'oklch(0.7 0.15 165 / 0.15)' : 'oklch(0.65 0.2 25 / 0.15)'} stroke="none" />
            )}
            {/* Unit square */}
            {showSquare && <path d={squarePath} fill="oklch(0.7 0.15 165 / 0.12)" stroke="oklch(0.7 0.15 165)" strokeWidth={1.5} />}
            {/* Unit circle */}
            {showCircle && <path d={circlePath} fill="oklch(0.78 0.15 75 / 0.08)" stroke="oklch(0.78 0.15 75)" strokeWidth={1.5} />}
            {/* 特征向量 */}
            {showEigen && eigenData && eigenData.map((ev, i) => {
              if (!ev) return null;
              const [ex, ey] = applyMatrix(a, b, c, d, ev.vec[0] * 2.5, ev.vec[1] * 2.5);
              const [sx, sy] = worldToSvg(ex, ey);
              return (
                <line key={`eigen-${i}`} x1={originSvgX} y1={originSvgY} x2={sx} y2={sy}
                  stroke="oklch(0.6 0.2 280)" strokeWidth={1.5} strokeDasharray="5 3" opacity={0.7} />
              );
            })}
            {/* Basis vectors */}
            <line x1={originSvgX} y1={originSvgY} x2={ihatSvgX} y2={ihatSvgY} stroke="oklch(0.65 0.2 25)" strokeWidth={2} markerEnd="url(#arrow-ihat2)" />
            <line x1={originSvgX} y1={originSvgY} x2={jhatSvgX} y2={jhatSvgY} stroke="oklch(0.7 0.18 95)" strokeWidth={2} markerEnd="url(#arrow-jhat2)" />
            {/* 自定义输入向量 */}
            <line x1={originSvgX} y1={originSvgY} x2={vecSvgX} y2={vecSvgY} stroke="oklch(0.6 0.2 280)" strokeWidth={1.5} strokeDasharray="3 2" markerEnd="url(#arrow-vec)" />
            <text x={vecSvgX + 6} y={vecSvgY} className="fill-foreground/60" fontSize="9" fontFamily="ui-monospace">
              ({inputVec[0]},{inputVec[1]})→({vecX.toFixed(2)},{vecY.toFixed(2)})
            </text>
            <defs>
              <marker id="arrow-ihat2" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="oklch(0.65 0.2 25)" /></marker>
              <marker id="arrow-jhat2" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="oklch(0.7 0.18 95)" /></marker>
              <marker id="arrow-vec" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="oklch(0.6 0.2 280)" /></marker>
            </defs>
            {/* Labels */}
            <text x={ihatSvgX + 6} y={ihatSvgY} className="fill-foreground/80" fontSize="11" fontFamily="ui-monospace">î ({a.toFixed(2)}, {c.toFixed(2)})</text>
            <text x={jhatSvgX + 6} y={jhatSvgY} className="fill-foreground/80" fontSize="11" fontFamily="ui-monospace">ĵ ({b.toFixed(2)}, {d.toFixed(2)})</text>
          </svg>
        </div>

        {/* Info panel */}
        <div className="shrink-0 w-40 flex flex-col gap-1.5 p-2 rounded-md bg-muted/20 border border-border/40 text-[10.5px] overflow-y-auto">
          <div className="font-medium text-foreground/80">变换信息</div>
          <div className="flex justify-between"><span className="text-muted-foreground">det</span><span className="font-mono font-medium" style={{ color: Math.abs(det) < 0.01 ? 'oklch(0.65 0.2 25)' : 'inherit' }}>{det.toFixed(3)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">面积比</span><span className="font-mono">{Math.abs(det).toFixed(3)}×</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">|î|</span><span className="font-mono">{Math.hypot(a, c).toFixed(3)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">|ĵ|</span><span className="font-mono">{Math.hypot(b, d).toFixed(3)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">进度</span><span className="font-mono">{Math.round(effectiveProgress * 100)}%</span></div>

          {/* 自定义向量输入 */}
          <div className="mt-1 pt-1 border-t border-border/40">
            <div className="font-medium text-muted-foreground mb-1">输入向量</div>
            <div className="flex items-center gap-1">
              <input type="number" step="0.1" value={inputVec[0]} onChange={(e) => setInputVec([parseFloat(e.target.value) || 0, inputVec[1]])} className="w-12 h-5 px-1 text-[10px] font-mono text-center bg-transparent border border-border/60 rounded" />
              <input type="number" step="0.1" value={inputVec[1]} onChange={(e) => setInputVec([inputVec[0], parseFloat(e.target.value) || 0])} className="w-12 h-5 px-1 text-[10px] font-mono text-center bg-transparent border border-border/60 rounded" />
            </div>
            <div className="text-[9px] text-muted-foreground mt-0.5">→ ({vecX.toFixed(2)}, {vecY.toFixed(2)})</div>
          </div>

          {/* 特征值显示 */}
          {showEigen && eigenData && (
            <div className="mt-1 pt-1 border-t border-border/40">
              <div className="font-medium text-muted-foreground mb-1">特征值</div>
              {eigenData.map((ev, i) => ev && (
                <div key={i} className="text-[9.5px] font-mono">
                  λ{i + 1} = {ev.value.toFixed(3)}
                </div>
              ))}
            </div>
          )}

          {Math.abs(det) < 0.01 && (
            <div className="mt-1 px-1.5 py-1 rounded bg-destructive/10 text-destructive text-[9.5px] leading-tight">det = 0：降维变换</div>
          )}

          {showMath && (
            <div className="mt-1 pt-1 border-t border-border/40 space-y-1.5">
              <div className="font-medium text-muted-foreground">数学原理</div>
              <FormulaRenderer latex={`T\\begin{pmatrix}x\\\\y\\end{pmatrix}=\\begin{pmatrix}${a.toFixed(2)}&${b.toFixed(2)}\\\\${c.toFixed(2)}&${d.toFixed(2)}\\end{pmatrix}\\begin{pmatrix}x\\\\y\\end{pmatrix}`} displayMode />
              <FormulaRenderer latex={`\\det(T)=${det.toFixed(3)}`} displayMode />
              <div className="text-[9px] text-muted-foreground leading-tight">
                行列式 = 面积缩放因子<br />
                正值：保持方向<br />
                负值：翻转方向<br />
                零：降维（投影）
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 分步模式控制条 */}
      {stepMode && (
        <div className="shrink-0">
          <ZoomLens steps={stepDefs} currentStep={stepIndex} onStepChange={setStepIndex} defaultCollapsed={false}>
            {({ step }) => (
              <div className="text-[10px] text-muted-foreground text-center py-1">{step.description}</div>
            )}
          </ZoomLens>
        </div>
      )}
    </div>
  );
}
