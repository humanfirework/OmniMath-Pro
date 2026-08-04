'use client';

/**
 * OmniMath Pro — Transform3D: 3D 线性变换可视化
 *
 * 使用 React Three Fiber 展示 3×3 矩阵对空间的线性变换：
 *   - 3D 网格（xyz 三轴 + 网格平面）
 *   - 立方体单位体积（变换前后）
 *   - 单位球面（变换前后，显示为椭球）
 *   - 三个基向量 î/ĵ/k̂（红/绿/蓝箭头）
 *
 * 支持 OrbitControls 旋转视角、矩阵插值动画、预设变换。
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Line, Text } from '@react-three/drei';
import { Button } from '@/components/ui/button';
import { Play, Pause, RotateCcw, Lightbulb } from 'lucide-react';
import { FormulaRenderer } from '@/components/workbench/FormulaRenderer';
import * as THREE from 'three';

const IDENTITY_3D = [1, 0, 0, 0, 1, 0, 0, 0, 1];

// 矩阵插值：从 identity 插值到 target
function lerpMatrix3D(m: number[], t: number): number[] {
  const id = IDENTITY_3D;
  return m.map((v, i) => v * t + id[i] * (1 - t));
}

// 应用 3x3 矩阵到向量
function applyMat3(m: number[], v: [number, number, number]): [number, number, number] {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ];
}

// 3x3 行列式
function det3(m: number[]): number {
  return m[0] * (m[4] * m[8] - m[5] * m[7])
       - m[1] * (m[3] * m[8] - m[5] * m[6])
       + m[2] * (m[3] * m[7] - m[4] * m[6]);
}

interface PresetDef3D {
  label: string;
  m: number[];
  hint: string;
}

const PRESETS_3D: PresetDef3D[] = [
  { label: '旋转 X', m: [1, 0, 0, 0, Math.cos(Math.PI / 4), -Math.sin(Math.PI / 4), 0, Math.sin(Math.PI / 4), Math.cos(Math.PI / 4)], hint: 'rotX 45°' },
  { label: '旋转 Y', m: [Math.cos(Math.PI / 4), 0, Math.sin(Math.PI / 4), 0, 1, 0, -Math.sin(Math.PI / 4), 0, Math.cos(Math.PI / 4)], hint: 'rotY 45°' },
  { label: '旋转 Z', m: [Math.cos(Math.PI / 4), -Math.sin(Math.PI / 4), 0, Math.sin(Math.PI / 4), Math.cos(Math.PI / 4), 0, 0, 0, 1], hint: 'rotZ 45°' },
  { label: '缩放2x', m: [2, 0, 0, 0, 2, 0, 0, 0, 2], hint: 'scale 2x' },
  { label: '剪切', m: [1, 0.5, 0, 0, 1, 0, 0, 0, 1], hint: 'shear XY' },
  { label: '投影XY', m: [1, 0, 0, 0, 1, 0, 0, 0, 0], hint: 'project to XY' },
];

interface Transform3DProps {
  matrix: number[];
  onMatrixChange?: (m: number[]) => void;
}

// 变换后的立方体边线
function TransformedCube({ matrix }: { matrix: number[] }) {
  const corners: [number, number, number][] = [
    [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
    [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1],
  ].map((v) => applyMat3(matrix, v as [number, number, number]));

  const edges: Array<[[number, number, number], [number, number, number]]> = [
    [0, 1], [1, 2], [2, 3], [3, 0],
    [4, 5], [5, 6], [6, 7], [7, 4],
    [0, 4], [1, 5], [2, 6], [3, 7],
  ].map(([i, j]) => [corners[i], corners[j]]);

  return (
    <group>
      {/* 填充面 */}
      <mesh>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[new Float32Array([
              ...corners[0], ...corners[1], ...corners[2],
              ...corners[0], ...corners[2], ...corners[3],
              ...corners[4], ...corners[5], ...corners[6],
              ...corners[4], ...corners[6], ...corners[7],
              ...corners[0], ...corners[1], ...corners[5],
              ...corners[0], ...corners[5], ...corners[4],
              ...corners[1], ...corners[2], ...corners[6],
              ...corners[1], ...corners[6], ...corners[5],
              ...corners[2], ...corners[3], ...corners[7],
              ...corners[2], ...corners[7], ...corners[6],
              ...corners[3], ...corners[0], ...corners[4],
              ...corners[3], ...corners[4], ...corners[7],
            ]), 3]}
          />
        </bufferGeometry>
        <meshBasicMaterial color="#2dd4bf" transparent opacity={0.12} side={THREE.DoubleSide} />
      </mesh>
      {/* 边线 */}
      {edges.map(([p1, p2], i) => (
        <Line key={i} points={[p1, p2]} color="#2dd4bf" lineWidth={1.5} />
      ))}
    </group>
  );
}

// 变换后的单位球面（用参数曲面近似椭球）
function TransformedSphere({ matrix }: { matrix: number[] }) {
  const segments = 24;
  const positions: number[] = [];
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < segments; j++) {
      const theta1 = (i / segments) * Math.PI * 2;
      const theta2 = ((i + 1) / segments) * Math.PI * 2;
      const phi1 = (j / segments) * Math.PI;
      const phi2 = ((j + 1) / segments) * Math.PI;
      const p1 = applyMat3(matrix, [Math.sin(phi1) * Math.cos(theta1), Math.sin(phi1) * Math.sin(theta1), Math.cos(phi1)]);
      const p2 = applyMat3(matrix, [Math.sin(phi1) * Math.cos(theta2), Math.sin(phi1) * Math.sin(theta2), Math.cos(phi1)]);
      const p3 = applyMat3(matrix, [Math.sin(phi2) * Math.cos(theta2), Math.sin(phi2) * Math.sin(theta2), Math.cos(phi2)]);
      positions.push(...p1, ...p2, ...p3);
    }
  }
  return (
    <mesh>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[new Float32Array(positions), 3]} />
      </bufferGeometry>
      <meshBasicMaterial color="#fbbf24" wireframe transparent opacity={0.4} />
    </mesh>
  );
}

// 基向量箭头
function BasisArrow({ dir, color, label }: { dir: [number, number, number]; color: string; label: string }) {
  return (
    <group>
      <Line points={[[0, 0, 0], dir]} color={color} lineWidth={2.5} />
      {/* 箭头头部 */}
      <mesh position={dir}>
        <coneGeometry args={[0.05, 0.15, 8]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <Text position={[dir[0] + 0.15, dir[1] + 0.15, dir[2]]} fontSize={0.2} color={color}>
        {label}
      </Text>
    </group>
  );
}

// 3D 场景内容
function SceneContent({ matrix }: { matrix: number[] }) {
  const ihat = applyMat3(matrix, [1, 0, 0]);
  const jhat = applyMat3(matrix, [0, 1, 0]);
  const khat = applyMat3(matrix, [0, 0, 1]);

  return (
    <>
      {/* 网格平面 */}
      <gridHelper args={[6, 12, '#88888866', '#88888833']} />
      {/* 坐标轴 */}
      <Line points={[[0, 0, 0], [2.5, 0, 0]]} color="#666" lineWidth={1} />
      <Line points={[[0, 0, 0], [0, 2.5, 0]]} color="#666" lineWidth={1} />
      <Line points={[[0, 0, 0], [0, 0, 2.5]]} color="#666" lineWidth={1} />

      {/* 变换后的几何体 */}
      <TransformedCube matrix={matrix} />
      <TransformedSphere matrix={matrix} />

      {/* 基向量 */}
      <BasisArrow dir={ihat} color="#ef4444" label="î" />
      <BasisArrow dir={jhat} color="#22c55e" label="ĵ" />
      <BasisArrow dir={khat} color="#3b82f6" label="k̂" />

      <OrbitControls enablePan enableZoom enableRotate />
    </>
  );
}

export function Transform3D({ matrix, onMatrixChange }: Transform3DProps) {
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [showMath, setShowMath] = useState(false);

  useEffect(() => {
    if (!playing) return;
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
  }, [playing]);

  const interpolatedMatrix = useMemo(() => lerpMatrix3D(matrix, progress), [matrix, progress]);
  const det = useMemo(() => det3(interpolatedMatrix), [interpolatedMatrix]);

  const updateCell = (idx: number, value: string) => {
    const n = parseFloat(value);
    const next = [...matrix];
    next[idx] = Number.isNaN(n) ? 0 : n;
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
    onMatrixChange?.([...IDENTITY_3D]);
  };

  return (
    <div className="h-full flex flex-col gap-2 overflow-hidden">
      {/* Controls */}
      <div className="shrink-0 flex items-center gap-2 px-1 py-1 flex-wrap">
        {/* 3x3 Matrix inputs */}
        <div className="flex flex-col gap-0.5 px-2 py-1 rounded-md bg-muted/40 border border-border/60">
          {[0, 3, 6].map((rowStart) => (
            <div key={rowStart} className="flex items-center gap-0.5">
              {rowStart === 0 && <span className="text-[10px] text-muted-foreground font-mono mr-0.5">[[</span>}
              {rowStart === 3 && <span className="text-[10px] text-muted-foreground font-mono mr-0.5"> [</span>}
              {rowStart === 6 && <span className="text-[10px] text-muted-foreground font-mono mr-0.5"> [</span>}
              {[0, 1, 2].map((col) => {
                const idx = rowStart + col;
                return (
                  <input key={idx} type="number" step="0.1" value={matrix[idx]}
                    onChange={(e) => updateCell(idx, e.target.value)}
                    className="w-10 h-5 px-1 text-[10px] font-mono text-center bg-transparent border border-border/60 rounded focus:outline-none focus:border-primary" />
                );
              })}
              {rowStart === 0 && <span className="text-[10px] text-muted-foreground font-mono ml-0.5">]</span>}
              {rowStart === 3 && <span className="text-[10px] text-muted-foreground font-mono ml-0.5">]</span>}
              {rowStart === 6 && <span className="text-[10px] text-muted-foreground font-mono ml-0.5">]]</span>}
            </div>
          ))}
        </div>

        {/* Play / Reset / Math */}
        <div className="flex items-center gap-0.5">
          <Button size="sm" variant="default" onClick={handlePlay} disabled={playing} className="h-6 px-2 text-[10.5px] gap-1">
            {playing ? <Pause className="size-3" /> : <Play className="size-3" />}
            {playing ? '播放中' : '播放'}
          </Button>
          <Button size="sm" variant="outline" onClick={handleReset} className="h-6 px-2 text-[10.5px] gap-1">
            <RotateCcw className="size-3" /> 重置
          </Button>
          <Button size="sm" variant={showMath ? 'default' : 'outline'} onClick={() => setShowMath(!showMath)} className="h-6 px-2 text-[10.5px] gap-1">
            <Lightbulb className="size-3" /> 原理
          </Button>
        </div>

        {/* Progress slider */}
        <input type="range" min="0" max="1" step="0.01" value={progress}
          onChange={(e) => { setPlaying(false); setProgress(parseFloat(e.target.value)); }}
          className="flex-1 min-w-[80px] h-1 accent-primary" />
      </div>

      {/* Presets */}
      <div className="shrink-0 flex items-center gap-1 px-1 flex-wrap">
        <span className="text-[10px] text-muted-foreground">预设:</span>
        {PRESETS_3D.map((p) => (
          <button key={p.hint} type="button"
            onClick={() => { onMatrixChange?.(p.m); setProgress(0); setPlaying(true); }}
            className="px-2 py-0.5 text-[10px] rounded border border-border/60 bg-muted/30 hover:bg-accent hover:text-foreground transition-colors"
            title={p.hint}>
            {p.label}
          </button>
        ))}
      </div>

      {/* 3D Canvas + info */}
      <div className="flex-1 min-h-0 flex gap-2 overflow-hidden">
        <div className="flex-1 min-h-0 rounded-md border border-border/40 overflow-hidden bg-muted/20">
          <Canvas camera={{ position: [3, 3, 3], fov: 50 }}>
            <SceneContent matrix={interpolatedMatrix} />
          </Canvas>
        </div>

        {/* Info panel */}
        <div className="shrink-0 w-40 flex flex-col gap-1.5 p-2 rounded-md bg-muted/20 border border-border/40 text-[10.5px] overflow-y-auto">
          <div className="font-medium text-foreground/80">3D 变换信息</div>
          <div className="flex justify-between"><span className="text-muted-foreground">det</span><span className="font-mono font-medium" style={{ color: Math.abs(det) < 0.01 ? 'oklch(0.65 0.2 25)' : 'inherit' }}>{det.toFixed(3)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">体积比</span><span className="font-mono">{Math.abs(det).toFixed(3)}×</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">|î|</span><span className="font-mono">{Math.hypot(interpolatedMatrix[0], interpolatedMatrix[3], interpolatedMatrix[6]).toFixed(3)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">|ĵ|</span><span className="font-mono">{Math.hypot(interpolatedMatrix[1], interpolatedMatrix[4], interpolatedMatrix[7]).toFixed(3)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">|k̂|</span><span className="font-mono">{Math.hypot(interpolatedMatrix[2], interpolatedMatrix[5], interpolatedMatrix[8]).toFixed(3)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">进度</span><span className="font-mono">{Math.round(progress * 100)}%</span></div>

          {Math.abs(det) < 0.01 && (
            <div className="mt-1 px-1.5 py-1 rounded bg-destructive/10 text-destructive text-[9.5px] leading-tight">det = 0：3D→2D/1D 降维</div>
          )}

          {showMath && (
            <div className="mt-1 pt-1 border-t border-border/40 space-y-1.5">
              <div className="font-medium text-muted-foreground">数学原理</div>
              <FormulaRenderer latex={`\\det(T)=${det.toFixed(3)}`} displayMode />
              <div className="text-[9px] text-muted-foreground leading-tight">
                3D 行列式 = 体积缩放因子<br />
                正值：保持手性<br />
                负值：镜像翻转<br />
                零：降维投影
              </div>
            </div>
          )}

          <div className="mt-1 text-[9px] text-muted-foreground/70 leading-tight">
            <div className="font-medium text-muted-foreground mb-0.5">提示</div>
            红箭头 = î（原 e₁）<br />
            绿箭头 = ĵ（原 e₂）<br />
            蓝箭头 = k̂（原 e₃）<br />
            青色 = 单位立方体<br />
            橙色 = 单位球面<br />
            拖拽旋转视角
          </div>
        </div>
      </div>
    </div>
  );
}
