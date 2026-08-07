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

import { useState, useEffect, useMemo, useRef, Component, type ReactNode } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Line, Text } from '@react-three/drei';
import { Button } from '@/components/ui/button';
import { Play, Pause, RotateCcw, Lightbulb, RefreshCw } from 'lucide-react';
import { FormulaRenderer } from '@/components/workbench/FormulaRenderer';
import * as THREE from 'three';

const IDENTITY_3D = [1, 0, 0, 0, 1, 0, 0, 0, 1];

// 矩阵插值：从 identity 插值到 target
function lerpMatrix3D(m: number[], t: number): number[] {
  const id = IDENTITY_3D;
  return m.map((v, i) => v * t + id[i] * (1 - t));
}

/**
 * 清洗 3×3 矩阵，防止几何体因 NaN / Infinity 顶点而整体消失。
 *
 * three.js 在顶点数据含 NaN/Infinity 时，包围球(bounding sphere)会变成 NaN，
 * 导致整个物体被 WebGL 剔除（图像"突然消失"）。此函数：
 *   - 非有限值(Infinity / -Infinity / NaN) → 0
 *   - 绝对值过大(> 100) → 截断到 ±100，避免几何体飞出视域
 */
function sanitize3DMatrix(m: number[]): number[] {
  return m.map((v) => {
    if (!Number.isFinite(v)) return 0;
    if (Math.abs(v) > 100) return Math.sign(v) * 100;
    return v;
  });
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

// 3x3 迹（主对角线之和）
function trace3(m: number[]): number {
  return m[0] + m[4] + m[8];
}

// 3x3 秩（高斯消元，返回线性无关的行数 0..3）
function rank3(m: number[]): number {
  const a = m.slice(); // 拷贝，避免修改原矩阵
  let rank = 0;
  for (let col = 0; col < 3 && rank < 3; col++) {
    // 找当前列主元
    let pivot = -1;
    for (let r = rank; r < 3; r++) {
      if (Math.abs(a[r * 3 + col]) > 1e-9) { pivot = r; break; }
    }
    if (pivot === -1) continue;
    // 交换到当前行
    if (pivot !== rank) {
      for (let c = col; c < 3; c++) {
        const tmp = a[rank * 3 + c];
        a[rank * 3 + c] = a[pivot * 3 + c];
        a[pivot * 3 + c] = tmp;
      }
    }
    const pv = a[rank * 3 + col];
    for (let c = col; c < 3; c++) a[rank * 3 + c] /= pv;
    // 消去下方行
    for (let r = rank + 1; r < 3; r++) {
      const f = a[r * 3 + col];
      if (Math.abs(f) < 1e-9) continue;
      for (let c = col; c < 3; c++) a[r * 3 + c] -= f * a[rank * 3 + c];
    }
    rank++;
  }
  return rank;
}

/** 根据 det / 秩给出通俗易懂的中文解读，帮助理解当前变换的本质。 */
function interpret3D(m: number[], det: number): string {
  const rank = rank3(m);
  if (rank === 0) return '矩阵为零矩阵：所有点被压到原点（完全坍缩）';
  if (rank === 1) return '秩为 1：3D→1D，空间被压成一条直线';
  if (rank === 2) return '秩为 2：3D→2D，空间被压成一个平面（det=0）';
  if (Math.abs(det) < 1e-9) return '秩为 3 但 det=0：(数值上) 接近降维，体积趋近 0';
  if (det < 0) return '体积被翻转（镜像）+ 缩放，方向反向';
  return '可逆变换：体积按 |det| 倍缩放，方向保持';
}

interface PresetDef3D {
  label: string;
  m: number[];
  hint: string;
}

const PRESETS_3D: PresetDef3D[] = [
  { label: '旋转 X', m: [1, 0, 0, 0, Math.cos(Math.PI / 4), -Math.sin(Math.PI / 4), 0, Math.sin(Math.PI / 4), Math.cos(Math.PI / 4)], hint: '绕 X 轴旋转 45°' },
  { label: '旋转 Y', m: [Math.cos(Math.PI / 4), 0, Math.sin(Math.PI / 4), 0, 1, 0, -Math.sin(Math.PI / 4), 0, Math.cos(Math.PI / 4)], hint: '绕 Y 轴旋转 45°' },
  { label: '旋转 Z', m: [Math.cos(Math.PI / 4), -Math.sin(Math.PI / 4), 0, Math.sin(Math.PI / 4), Math.cos(Math.PI / 4), 0, 0, 0, 1], hint: '绕 Z 轴旋转 45°' },
  { label: '缩放 2x', m: [2, 0, 0, 0, 2, 0, 0, 0, 2], hint: '三轴均匀放大 2 倍，体积 ×8' },
  { label: '沿 X 缩放', m: [2, 0, 0, 0, 1, 0, 0, 0, 1], hint: '仅拉伸 X 方向' },
  { label: '沿 Y 缩放', m: [1, 0, 0, 0, 0.5, 0, 0, 0, 1], hint: '仅压缩 Y 方向' },
  { label: '剪切 XY', m: [1, 0.5, 0, 0, 1, 0, 0, 0, 1], hint: 'x 方向剪切，保持体积' },
  { label: '反射 Z', m: [1, 0, 0, 0, 1, 0, 0, 0, -1], hint: '关于 XY 平面反射（det 变负）' },
  { label: '投影 XY', m: [1, 0, 0, 0, 1, 0, 0, 0, 0], hint: '投影到 XY 平面（det=0，降维）' },
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
function SceneContent({ matrix, showOriginal }: { matrix: number[]; showOriginal: boolean }) {
  const ihat = applyMat3(matrix, [1, 0, 0]);
  const jhat = applyMat3(matrix, [0, 1, 0]);
  const khat = applyMat3(matrix, [0, 0, 1]);

  return (
    <>
      {/* 网格平面（有效 6 位十六进制色 + 材质透明度，避免 THREE.Color 解析失败） */}
      <gridHelper args={[6, 12, '#888888', '#444444']} material-transparent material-opacity={0.35} />
      {/* 坐标轴 */}
      <Line points={[[0, 0, 0], [2.5, 0, 0]]} color="#666" lineWidth={1} />
      <Line points={[[0, 0, 0], [0, 2.5, 0]]} color="#666" lineWidth={1} />
      <Line points={[[0, 0, 0], [0, 0, 2.5]]} color="#666" lineWidth={1} />

      {/* 原始叠影（变换前，灰色虚线） */}
      {showOriginal && <OriginalGhost />}

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

// 原始（恒等）几何体虚线叠影，供变换前后对比
function OriginalGhost() {
  const corners: [number, number, number][] = [
    [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
    [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1],
  ];
  const edges: Array<[[number, number, number], [number, number, number]]> = [
    [0, 1], [1, 2], [2, 3], [3, 0],
    [4, 5], [5, 6], [6, 7], [7, 4],
    [0, 4], [1, 5], [2, 6], [3, 7],
  ].map(([i, j]) => [corners[i], corners[j]]);
  return (
    <group>
      {edges.map(([p1, p2], i) => (
        <Line key={`ghost-${i}`} points={[p1, p2]} color="#94a3b8" lineWidth={1} transparent opacity={0.5} />
      ))}
    </group>
  );
}

/**
 * WebGL 错误边界：当 3D 场景因 WebGL 上下文丢失 / 驱动异常而渲染失败时，
 * 显示可读的提示 + 「重试」按钮，而不是白屏。
 */
class GLErrorBoundary extends Component<{ children: ReactNode; onRetry: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { /* 交给边界内 UI 提示 */ }
  render() {
    if (this.state.failed) {
      return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-4 text-center">
          <div className="text-[12px] text-foreground/80">3D 渲染器初始化失败（可能是 WebGL 上下文丢失）</div>
          <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1"
            onClick={() => { this.setState({ failed: false }); this.props.onRetry(); }}>
            <RefreshCw className="size-3" /> 重新加载
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * 尺寸感知容器：仅在容器拥有非零尺寸时挂载 Canvas。
 *
 * 根因：react-three-fiber 的 `<Canvas>` 在挂载时会立即读取容器并绑定事件（`addEventListener`）。
 * 若容器此刻尺寸为 0（例如还在布局中 / 位于隐藏的 Tab / 初次渲染尚未 getBoundingClientRect 完成），
 * R3F 内部 `connect` 会拿到 null -> 抛 `Cannot read properties of null (reading 'addEventListener')`，
 * 导致 3D 场景白屏。通过 ResizeObserver 等到有真实宽高后再挂载，从源头规避该崩溃。
 */
function SizedCanvasMount({ matrix, showOriginal, fallback, onLost }: {
  matrix: number[];
  showOriginal: boolean;
  fallback: string;
  onLost: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 1 && r.height > 1) setSize({ w: r.width, h: r.height });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={ref} className="h-full w-full">
      {size ? (
        <Canvas camera={{ position: [3, 3, 3], fov: 50 }}>
          <ContextLossWatcher onLost={onLost} />
          <SceneContent matrix={matrix} showOriginal={showOriginal} />
        </Canvas>
      ) : (
        <div className="flex h-full w-full items-center justify-center text-[11px] text-muted-foreground">
          {fallback}
        </div>
      )}
    </div>
  );
}

/** 监听 WebGL 上下文丢失事件，触发后由父组件重建 Canvas。 */
function ContextLossWatcher({ onLost }: { onLost: () => void }) {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    const canvas = gl.domElement;
    const handle = (e: Event) => {
      e.preventDefault();
      onLost();
    };
    canvas.addEventListener('webglcontextlost', handle);
    return () => canvas.removeEventListener('webglcontextlost', handle);
  }, [gl, onLost]);
  return null;
}

export function Transform3D({ matrix, onMatrixChange }: Transform3DProps) {
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [showMath, setShowMath] = useState(false);
  const [showOriginal, setShowOriginal] = useState(true);
  // 递增该 key 可强制重建 Canvas（用于 WebGL 上下文丢失后的重试）。
  const [glKey, setGlKey] = useState(0);

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
  const trace = useMemo(() => trace3(interpolatedMatrix), [interpolatedMatrix]);
  const rank = useMemo(() => rank3(interpolatedMatrix), [interpolatedMatrix]);
  const interpretation = useMemo(() => interpret3D(interpolatedMatrix, det), [interpolatedMatrix, det]);

  const updateCell = (idx: number, value: string) => {
    const n = parseFloat(value);
    const next = [...matrix];
    // Infinity / NaN 输入一律按 0 处理，杜绝几何体整体消失
    next[idx] = Number.isFinite(n) ? n : 0;
    onMatrixChange?.(sanitize3DMatrix(next));
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
          <Button size="sm" variant={showOriginal ? 'default' : 'outline'} onClick={() => setShowOriginal(!showOriginal)} className="h-6 px-2 text-[10.5px]" title="显示/隐藏变换前的原始单位立方体（灰虚线叠影）">
            原图
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
            onClick={() => { onMatrixChange?.(sanitize3DMatrix(p.m)); setProgress(0); setPlaying(true); }}
            className="px-2 py-0.5 text-[10px] rounded border border-border/60 bg-muted/30 hover:bg-accent hover:text-foreground transition-colors"
            title={p.hint}>
            {p.label}
          </button>
        ))}
      </div>

      {/* 3D Canvas + info */}
      <div className="flex-1 min-h-0 flex gap-2 overflow-hidden">
        <div className="flex-1 min-h-0 rounded-md border border-border/40 overflow-hidden bg-muted/20">
          <GLErrorBoundary onRetry={() => setGlKey((k) => k + 1)}>
            <div key={glKey} className="h-full w-full">
              <SizedCanvasMount matrix={interpolatedMatrix} showOriginal={showOriginal} onLost={() => setGlKey((k) => k + 1)} fallback="正在初始化 3D 渲染…" />
            </div>
          </GLErrorBoundary>
        </div>

        {/* Info panel */}
        <div className="shrink-0 w-44 flex flex-col gap-1.5 p-2 rounded-md bg-muted/20 border border-border/40 text-[10.5px] overflow-y-auto">
          <div className="font-medium text-foreground/80">3D 变换信息</div>
          <div className="grid grid-cols-2 gap-1">
            <div className="rounded bg-background/30 px-1.5 py-1">
              <div className="text-[8.5px] text-muted-foreground leading-none">det</div>
              <div className="mt-0.5 font-mono font-medium leading-none" style={{ color: Math.abs(det) < 0.01 ? 'oklch(0.65 0.2 25)' : 'inherit' }}>{det.toFixed(3)}</div>
            </div>
            <div className="rounded bg-background/30 px-1.5 py-1">
              <div className="text-[8.5px] text-muted-foreground leading-none">体积比</div>
              <div className="mt-0.5 font-mono leading-none">{Math.abs(det).toFixed(3)}×</div>
            </div>
            <div className="rounded bg-background/30 px-1.5 py-1">
              <div className="text-[8.5px] text-muted-foreground leading-none">秩</div>
              <div className="mt-0.5 font-mono leading-none">{rank} / 3</div>
            </div>
            <div className="rounded bg-background/30 px-1.5 py-1">
              <div className="text-[8.5px] text-muted-foreground leading-none">迹</div>
              <div className="mt-0.5 font-mono leading-none">{trace.toFixed(3)}</div>
            </div>
            <div className="rounded bg-background/30 px-1.5 py-1">
              <div className="text-[8.5px] text-muted-foreground leading-none">|î|</div>
              <div className="mt-0.5 font-mono leading-none">{Math.hypot(interpolatedMatrix[0], interpolatedMatrix[3], interpolatedMatrix[6]).toFixed(3)}</div>
            </div>
            <div className="rounded bg-background/30 px-1.5 py-1">
              <div className="text-[8.5px] text-muted-foreground leading-none">|ĵ|</div>
              <div className="mt-0.5 font-mono leading-none">{Math.hypot(interpolatedMatrix[1], interpolatedMatrix[4], interpolatedMatrix[7]).toFixed(3)}</div>
            </div>
            <div className="rounded bg-background/30 px-1.5 py-1">
              <div className="text-[8.5px] text-muted-foreground leading-none">|k̂|</div>
              <div className="mt-0.5 font-mono leading-none">{Math.hypot(interpolatedMatrix[2], interpolatedMatrix[5], interpolatedMatrix[8]).toFixed(3)}</div>
            </div>
            <div className="rounded bg-background/30 px-1.5 py-1">
              <div className="text-[8.5px] text-muted-foreground leading-none">进度</div>
              <div className="mt-0.5 font-mono leading-none">{Math.round(progress * 100)}%</div>
            </div>
          </div>

          {Math.abs(det) < 0.01 && (
            <div className="mt-1 px-1.5 py-1 rounded bg-destructive/10 text-destructive text-[9.5px] leading-tight">det = 0：3D→2D/1D 降维</div>
          )}

          {/* 动态解读：用通俗语言说明当前变换的本质 */}
          <div className="mt-1 px-1.5 py-1 rounded bg-primary/5 border border-primary/15 text-[9.5px] leading-tight text-foreground/80">
            {interpretation}
          </div>

          {showMath && (
            <div className="mt-1 pt-1 border-t border-border/40 space-y-1.5">
              <div className="font-medium text-muted-foreground">数学原理</div>
              <FormulaRenderer latex={`\\det(T)=${det.toFixed(3)}`} displayMode />
              <div className="text-[9px] text-muted-foreground leading-tight">
                3D 行列式 = 体积缩放因子<br />
                迹 = 主对角线之和（对旋转约 1+2cosθ）<br />
                秩 = 线性无关的行数（满秩=可逆）<br />
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
