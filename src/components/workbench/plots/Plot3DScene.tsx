'use client';

/**
 * OmniMath Pro — 3D Plot Scene (react-three-fiber).
 *
 * The interactive 3D viewport. Wraps `<Canvas>` from `@react-three/fiber`
 * with `<OrbitControls>` from drei so the user can freely orbit, zoom,
 * and pan the surface — addressing the user complaint that 3D plots were
 * "just a static image" and "not observable".
 *
 * Props:
 *   - surfaces: Surface3DData[]   — one or more sampled surfaces to render.
 *   - theme: 'dark' | 'light'     — drives background + grid + label colors.
 *   - showAxes: boolean           — X / Y / Z axis lines with labels and ticks.
 *   - showGrid: boolean           — ground grid plane.
 *   - wireframe: boolean          — render surfaces as wireframe instead of solid.
 *   - autoRotate: boolean         — OrbitControls auto-rotate.
 *   - colorMode: 'height' | 'solid' — height-based gradient vs solid per-surface color.
 *   - resetSignal: number         — increment to force the camera back to default.
 *
 * Architecture:
 *   - `<Canvas>` mounts the WebGLRenderer. `frameloop="demand"` when not
 *     auto-rotating so the GPU sleeps between user interactions.
 *   - `<OrbitControls>` from drei wires up mouse / touch interaction. We
 *     stash a ref so the "reset camera" button can call `.reset()`.
 *   - Each surface is a `<SurfaceMesh>` — a memoized `<mesh>` that builds
 *     its `BufferGeometry` from the `Surface3DData` Float32Arrays.
 *   - `<Axes3D>` builds labeled axis lines + ticks via drei `<Text>`
 *     (troika text) — X axis teal, Y axis amber, Z axis rose to match the
 *     design system. NO pure-RGB primary colors.
 *   - `<Grid3D>` uses drei `<Grid>` for a subtle floor grid.
 *   - Lighting: ambient + directional + colored point lights for a
 *     teal/rose rim that gives surfaces a premium feel.
 *
 * Robustness:
 *   - WebGL availability is probed ONCE at module load. If the browser
 *     cannot create a WebGL2 (or WebGL1) context, we render a friendly
 *     fallback instead of mounting `<Canvas>` (which would throw and
 *     crash the whole app — previously the top cause of "绘图即崩溃").
 *   - SurfaceMesh validates Float32Array lengths before handing them to
 *     three.js BufferAttribute, so a malformed Surface3DData cannot
 *     trigger a WebGL error.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import { Canvas, useThree, useFrame, invalidate } from '@react-three/fiber';
import { OrbitControls, Grid, Text, Line, Billboard } from '@react-three/drei';
import * as THREE from 'three';
import type { Surface3DData } from '@/lib/plots/plot3d';
import { solidColorArray } from '@/lib/plots/plot3d';

/* ------------------------------------------------------------------ */
/*  WebGL availability probe                                          */
/* ------------------------------------------------------------------ */
function probeWebGL(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl') || c.getContext('experimental-webgl'));
  } catch {
    return false;
  }
}

let webglAvailable: boolean | null = null;
function isWebGLAvailable(): boolean {
  if (webglAvailable === null) webglAvailable = probeWebGL();
  return webglAvailable;
}

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface Plot3DSceneProps {
  surfaces: Surface3DData[];
  theme: 'dark' | 'light';
  showAxes: boolean;
  showGrid: boolean;
  wireframe: boolean;
  autoRotate?: boolean;
  colorMode?: 'height' | 'solid';
  /** Camera up axis — `y` matches three.js default; `z` gives the math-style z-up view. */
  upAxis?: 'y' | 'z';
  /** Bump this number to force the camera back to its default position. */
  resetSignal?: number;
  /** T6: 命令式截图 ref — 调用 captureRef.current() 会强制渲染一帧并返回
   * PNG data URL。用于绕过 `preserveDrawingBuffer:false` 导致的黑屏导出。 */
  captureRef?: MutableRefObject<CaptureFn | null>;
}

/* ------------------------------------------------------------------ */
/*  Theme palette                                                      */
/* ------------------------------------------------------------------ */

const THEME = {
  dark: {
    bg: '#1e1e1e',
    gridColor: '#404040',
    gridSection: '#303030',
    axisLabel: '#b0b0b0',
    tickLabel: '#808080',
    fogColor: '#1e1e1e',
    fogNear: 14,
    fogFar: 40,
  },
  light: {
    bg: '#fafafa',
    gridColor: '#c8c8c8',
    gridSection: '#dcdcdc',
    axisLabel: '#404040',
    tickLabel: '#707070',
    fogColor: '#fafafa',
    fogNear: 16,
    fogFar: 44,
  },
};

// Axis colors — math software style (subtle, not neon bright)
const AXIS_COLORS = {
  x: '#1565c0', // blue
  y: '#2e7d32', // green
  z: '#c62828', // red
};

/* ------------------------------------------------------------------ */
/*  SurfaceMesh                                                        */
/* ------------------------------------------------------------------ */

interface SurfaceMeshProps {
  data: Surface3DData;
  wireframe: boolean;
  colorMode: 'height' | 'solid';
}

/** Build an empty (non-rendering) geometry — used as a fallback. */
function emptyGeometry(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(3), 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(3), 3));
  return g;
}

function SurfaceMesh({ data, wireframe, colorMode }: SurfaceMeshProps) {
  // Build the BufferGeometry attributes. Memoized so we don't recreate
  // Float32Arrays / Uint32Arrays on every render — only when the surface
  // data or color mode actually changes.
  const geometry = useMemo(() => {
    try {
      // Defensive: validate lengths so a malformed Surface3DData cannot
      // trigger a three.js error that would bubble up and crash the app.
      if (
        !data || !data.vertices || data.vertices.length < 3 ||
        data.vertices.length % 3 !== 0 ||
        !data.normals || data.normals.length !== data.vertices.length ||
        !data.indices || data.indices.length === 0
      ) {
        // Return an empty geometry — the mesh will simply not render.
        return emptyGeometry();
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(data.vertices, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3));
      const colorAttr =
        colorMode === 'solid'
          ? solidColorArray(data.vertices.length / 3, data.color)
          : data.colors;
      g.setAttribute('color', new THREE.BufferAttribute(
        colorAttr && colorAttr.length === data.vertices.length
          ? colorAttr
          : solidColorArray(data.vertices.length / 3, data.color),
        3,
      ));
      g.setIndex(new THREE.BufferAttribute(data.indices, 1));
      g.computeBoundingSphere();
      return g;
    } catch (err) {
      // Never let a geometry-building failure unmount the whole Canvas.
      console.error('[Plot3DScene] surface geometry build failed', err);
      return emptyGeometry();
    }
  }, [data, colorMode]);

  // Dispose of the old geometry when it changes to avoid GPU memory leaks.
  useEffect(() => {
    return () => {
      geometry.dispose();
    };
  }, [geometry]);

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial
        vertexColors
        side={THREE.DoubleSide}
        wireframe={wireframe}
        flatShading={false}
        metalness={0.0}
        roughness={0.85}
        transparent
        opacity={0.97}
      />
    </mesh>
  );
}

/* ------------------------------------------------------------------ */
/*  AxisLine — thick colored line via drei <Line>                     */
/* ------------------------------------------------------------------ */

interface AxisLineProps {
  from: [number, number, number];
  to: [number, number, number];
  color: string;
  lineWidth?: number;
}

function AxisLine({ from, to, color, lineWidth = 2 }: AxisLineProps) {
  return (
    <Line
      points={[from, to]}
      color={color}
      lineWidth={lineWidth}
      transparent
      opacity={0.95}
    />
  );
}

/* ------------------------------------------------------------------ */
/*  TickMark — small perpendicular tick at an axis position           */
/* ------------------------------------------------------------------ */

interface TickMarkProps {
  position: [number, number, number];
  axis: 'x' | 'y' | 'z';
  color: string;
  length?: number;
}

function TickMark({ position, axis, color, length = 0.14 }: TickMarkProps) {
  const from: [number, number, number] = [...position] as [number, number, number];
  const to: [number, number, number] = [...position] as [number, number, number];
  if (axis === 'x') {
    from[2] -= length;
    to[2] += length;
  } else if (axis === 'y') {
    from[0] -= length;
    to[0] += length;
  } else {
    from[0] -= length;
    to[0] += length;
  }
  return <AxisLine from={from} to={to} color={color} lineWidth={1.5} />;
}

/* ------------------------------------------------------------------ */
/*  BillboardLabel — text that always faces the camera with           */
/*  screen-space constant size (independent of zoom level)            */
/* ------------------------------------------------------------------ */

interface BillboardLabelProps {
  position: [number, number, number];
  text: string;
  color: string;
  outlineColor: string;
  /** Desired font size in screen pixels (will be scaled by camera distance). */
  pixelSize?: number;
  outlineWidth?: number;
}

function BillboardLabel({
  position,
  text,
  color,
  outlineColor,
  pixelSize = 14,
  outlineWidth = 0.04,
}: BillboardLabelProps) {
  const { camera } = useThree();
  const textRef = useRef<any>(null);
  const posVec = useMemo(() => new THREE.Vector3(...position), [position]);
  const lastDistanceRef = useRef(0);

  // Update fontSize based on camera distance — but only when distance
  // changes by >5%, to avoid updating 24 labels × 60fps unnecessarily.
  // Guarded: a throw inside a useFrame callback propagates through the
  // fiber render loop and can unmount the whole Canvas (blank panel).
  useFrame(() => {
    try {
      if (!textRef.current) return;
      const distance = camera.position.distanceTo(posVec);
      if (lastDistanceRef.current > 0) {
        const ratio = distance / lastDistanceRef.current;
        if (ratio > 0.95 && ratio < 1.05) return; // skip — barely changed
      }
      lastDistanceRef.current = distance;
      const worldSize = (pixelSize * distance) / 280;
      textRef.current.fontSize = worldSize;
    } catch (err) {
      // Never let a label-sizing failure kill the render loop.
      console.error('[Plot3DScene] BillboardLabel frame error', err);
    }
  });

  return (
    <Billboard position={position}>
      <Text
        ref={textRef}
        fontSize={0.3}
        color={color}
        anchorX="center"
        anchorY="middle"
        outlineWidth={outlineWidth}
        outlineColor={outlineColor}
      >
        {text}
      </Text>
    </Billboard>
  );
}

/* ------------------------------------------------------------------ */
/*  Axes3D — labeled X / Y / Z lines with tick marks                  */
/* ------------------------------------------------------------------ */

interface Axes3DProps {
  /** Half-extent of the X axis (axis runs from -sizeX to +sizeX). */
  sizeX: number;
  /** Half-extent of the Y axis. */
  sizeY: number;
  /** T5: Half-extent of the Z axis — derived from actual surface zRange,
   * so the Z axis fits the data instead of mirroring the X/Y extent. */
  sizeZ: number;
  theme: 'dark' | 'light';
}

/** Compute a "nice" tick step + tick values for a symmetric [-size, +size] axis. */
function niceTicks(size: number): { step: number; values: number[] } {
  const rawStep = (2 * size) / 8;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const out: number[] = [];
  for (let v = -Math.floor(size / step) * step; v <= size + 1e-9; v += step) {
    if (Math.abs(v) > size + 1e-9) continue;
    out.push(Math.abs(v) < 1e-9 ? 0 : v);
  }
  return { step, values: out };
}

function Axes3D({ sizeX, sizeY, sizeZ, theme }: Axes3DProps) {
  const palette = THEME[theme];

  // T5: 每个轴独立计算刻度，避免共用 size 导致 Z 轴刻度与数据脱节。
  const tx = useMemo(() => niceTicks(sizeX), [sizeX]);
  const ty = useMemo(() => niceTicks(sizeY), [sizeY]);
  const tz = useMemo(() => niceTicks(sizeZ), [sizeZ]);

  // Tick label offset — based on the largest axis so labels stay readable.
  const tickOffset = Math.max(0.3, Math.max(sizeX, sizeY, sizeZ) * 0.04);

  return (
    <group>
      {/* X axis line (teal) */}
      <AxisLine from={[-sizeX, 0, 0]} to={[sizeX, 0, 0]} color={AXIS_COLORS.x} lineWidth={2.5} />
      {/* Y axis line (amber) */}
      <AxisLine from={[0, -sizeY, 0]} to={[0, sizeY, 0]} color={AXIS_COLORS.y} lineWidth={2.5} />
      {/* Z axis line (rose) */}
      <AxisLine from={[0, 0, -sizeZ]} to={[0, 0, sizeZ]} color={AXIS_COLORS.z} lineWidth={2.5} />

      {/* X ticks */}
      {tx.values.map((v, i) => (
        <group key={`tx-${i}`}>
          <TickMark position={[v, 0, 0]} axis="x" color={AXIS_COLORS.x} />
          {Math.abs(v) > 1e-9 && (
            <BillboardLabel
              position={[v, -tickOffset, tickOffset]}
              text={fmtTick(v, tx.step)}
              color={palette.tickLabel}
              outlineColor={palette.bg}
              pixelSize={11}
            />
          )}
        </group>
      ))}
      {/* Y ticks */}
      {ty.values.map((v, i) => (
        <group key={`ty-${i}`}>
          <TickMark position={[0, v, 0]} axis="y" color={AXIS_COLORS.y} />
          {Math.abs(v) > 1e-9 && (
            <BillboardLabel
              position={[tickOffset, v, tickOffset]}
              text={fmtTick(v, ty.step)}
              color={palette.tickLabel}
              outlineColor={palette.bg}
              pixelSize={11}
            />
          )}
        </group>
      ))}
      {/* Z ticks */}
      {tz.values.map((v, i) => (
        <group key={`tz-${i}`}>
          <TickMark position={[0, 0, v]} axis="z" color={AXIS_COLORS.z} />
          {Math.abs(v) > 1e-9 && (
            <BillboardLabel
              position={[tickOffset, 0, v]}
              text={fmtTick(v, tz.step)}
              color={palette.tickLabel}
              outlineColor={palette.bg}
              pixelSize={11}
            />
          )}
        </group>
      ))}

      {/* Axis end labels — larger, bolder */}
      <BillboardLabel
        position={[sizeX + tickOffset * 1.8, 0, 0]}
        text="x"
        color={palette.axisLabel}
        outlineColor={palette.bg}
        pixelSize={18}
        outlineWidth={0.05}
      />
      <BillboardLabel
        position={[0, sizeY + tickOffset * 1.8, 0]}
        text="y"
        color={palette.axisLabel}
        outlineColor={palette.bg}
        pixelSize={18}
        outlineWidth={0.05}
      />
      <BillboardLabel
        position={[0, 0, sizeZ + tickOffset * 1.8]}
        text="z"
        color={palette.axisLabel}
        outlineColor={palette.bg}
        pixelSize={18}
        outlineWidth={0.05}
      />

      {/* Origin label */}
      <BillboardLabel
        position={[-tickOffset, -tickOffset, -tickOffset * 0.4]}
        text="0"
        color={palette.tickLabel}
        outlineColor={palette.bg}
        pixelSize={11}
      />
    </group>
  );
}

/* ------------------------------------------------------------------ */
/*  Grid3D — floor grid using drei <Grid>                             */
/* ------------------------------------------------------------------ */

function Grid3D({
  sizeX,
  sizeY,
  theme,
  upAxis,
}: {
  sizeX: number;
  sizeY: number;
  theme: 'dark' | 'light';
  upAxis: 'y' | 'z';
}) {
  const palette = THEME[theme];
  const maxXY = Math.max(sizeX, sizeY);
  return (
    <Grid
      position={[0, 0, 0]}
      rotation={upAxis === 'z' ? [-Math.PI / 2, 0, 0] : [0, 0, 0]}
      args={[2 * sizeX, 2 * sizeY]}
      cellSize={Math.max(0.25, maxXY / 10)}
      cellThickness={0.6}
      cellColor={palette.gridSection}
      sectionSize={Math.max(1, maxXY / 2)}
      sectionThickness={1.1}
      sectionColor={palette.gridColor}
      fadeDistance={40}
      fadeStrength={1}
      followCamera={false}
      infiniteGrid={false}
    />
  );
}

/* ------------------------------------------------------------------ */
/*  CaptureBridge — T6: 暴露命令式截图 API                            */
/* ------------------------------------------------------------------ */
/**
 * 因为 Plot3DScene 用 `preserveDrawingBuffer: false` 以提升性能，导出
 * `canvas.toDataURL()` 会得到黑屏（缓冲区在合成后已被清空）。
 *
 * 此组件在 Canvas 内部用 `useThree` 拿到 gl/scene/camera，把一个
 * "渲染一帧 → 返回 canvas"的函数注册到外部 ref。导出按钮调用它拿到
 * 刚渲染好的 canvas，再立即交给 saveCanvasToFile 转 blob —— 整个流程
 * 同步执行，避免浏览器在中间清空缓冲区。
 */
export type CaptureFn = () => HTMLCanvasElement | null;

function CaptureBridge({
  captureRef,
}: {
  captureRef: MutableRefObject<CaptureFn | null>;
}) {
  const { gl, scene, camera } = useThree();

  useEffect(() => {
    captureRef.current = () => {
      try {
        // 强制渲染一帧，把当前场景写入 drawing buffer。
        // 调用方必须紧接着同步读取（toBlob/drawImage），否则缓冲区
        // 会在下一次合成后被清空。
        gl.render(scene, camera);
        return gl.domElement;
      } catch (err) {
        console.error('[Plot3DScene] capture failed', err);
        return null;
      }
    };
    return () => {
      captureRef.current = null;
    };
  }, [gl, scene, camera, captureRef]);

  return null;
}

/* ------------------------------------------------------------------ */
/*  CameraReset — watches resetSignal, calls controls.reset()         */
/* ------------------------------------------------------------------ */

function CameraReset({
  resetSignal,
  controlsRef,
  upAxis,
}: {
  resetSignal: number;
  controlsRef: MutableRefObject<{ reset: () => void; update?: () => void } | null>;
  upAxis: 'y' | 'z';
}) {
  const { camera } = useThree();

  // upAxis 变化时总是同步 camera.up 向量 + controls，不受 resetSignal 限制。
  // 这修复了"切换 Y/Z 轴有时失效"的问题：之前 upAxis 变化被 resetSignal===0
  // 守卫跳过，导致 camera.up 未更新，OrbitControls 行为异常。
  useEffect(() => {
    camera.up.set(0, upAxis === 'z' ? 0 : 1, upAxis === 'z' ? 1 : 0);
    camera.lookAt(0, 0, 0);
    if (controlsRef.current?.update) {
      controlsRef.current.update();
    }
  }, [upAxis, camera]);

  // resetSignal 变化时重置相机到默认位置（保留首次挂载跳过）。
  useEffect(() => {
    if (resetSignal === 0) return; // skip initial mount
    const defaultPos: [number, number, number] =
      upAxis === 'z' ? [6, 6, 5] : [6, 5, 6];
    camera.up.set(0, upAxis === 'z' ? 0 : 1, upAxis === 'z' ? 1 : 0);
    camera.position.set(...defaultPos);
    camera.lookAt(0, 0, 0);
    if (controlsRef.current) {
      controlsRef.current.reset();
    }
  }, [resetSignal, upAxis, camera]);  
  return null;
}

/* ------------------------------------------------------------------ */
/*  WebGLContextGuard — handle context loss / restore                 */
/* ------------------------------------------------------------------ */

function WebGLContextGuard() {
  const { gl } = useThree();
  useEffect(() => {
    const canvas = gl.domElement;
    const handleLost = (e: Event) => {
      e.preventDefault();
      console.warn('[Plot3DScene] WebGL context lost');
    };
    const handleRestored = () => {
      console.log('[Plot3DScene] WebGL context restored');
      gl.resetState();
      invalidate();
    };
    canvas.addEventListener('webglcontextlost', handleLost);
    canvas.addEventListener('webglcontextrestored', handleRestored);
    return () => {
      canvas.removeEventListener('webglcontextlost', handleLost);
      canvas.removeEventListener('webglcontextrestored', handleRestored);
    };
  }, [gl]);
  return null;
}

/* ------------------------------------------------------------------ */
/*  Scene contents (inside <Canvas>)                                  */
/* ------------------------------------------------------------------ */

interface SceneContentsProps {
  surfaces: Surface3DData[];
  theme: 'dark' | 'light';
  showAxes: boolean;
  showGrid: boolean;
  wireframe: boolean;
  autoRotate: boolean;
  colorMode: 'height' | 'solid';
  upAxis: 'y' | 'z';
  resetSignal: number;
  captureRef?: MutableRefObject<CaptureFn | null>;
}

function SceneContents({
  surfaces,
  theme,
  showAxes,
  showGrid,
  wireframe,
  autoRotate,
  colorMode,
  upAxis,
  resetSignal,
  captureRef,
}: SceneContentsProps) {
  const palette = THEME[theme];
  const controlsRef = useRef<{ reset: () => void } | null>(null);

  // T5: 各轴独立计算半轴长度。X/Y 来自曲面域，Z 来自实际采样到的 zRange，
  // 这样高曲率曲面（如 e^x）的 Z 轴不再被压扁成 X/Y 的尺度。
  const { sizeX, sizeY, sizeZ } = useMemo(() => {
    if (surfaces.length === 0) {
      return { sizeX: 5, sizeY: 5, sizeZ: 5 };
    }
    let mx = 5, my = 5, mz = 5;
    for (const s of surfaces) {
      mx = Math.max(mx, Math.abs(s.xRange[0]), Math.abs(s.xRange[1]));
      my = Math.max(my, Math.abs(s.yRange[0]), Math.abs(s.yRange[1]));
      // Z 用实际数据范围（已含正负），取绝对值最大者作为对称半轴。
      if (s.validTriangleCount > 0) {
        mz = Math.max(mz, Math.abs(s.zRange[0]), Math.abs(s.zRange[1]));
      }
    }
    // Add ~8% margin, snap to next 0.5
    const snap = (v: number) => Math.ceil(v * 1.08 * 2) / 2;
    return { sizeX: snap(mx), sizeY: snap(my), sizeZ: snap(mz) };
  }, [surfaces]);

  return (
    <>
      <color attach="background" args={[palette.bg]} />
      <fog attach="fog" args={[palette.fogColor, palette.fogNear, palette.fogFar]} />

      {/* Lighting — soft natural lighting like math software */}
      <ambientLight intensity={theme === 'dark' ? 0.7 : 0.8} />
      <directionalLight
        position={[10, 15, 8]}
        intensity={theme === 'dark' ? 0.7 : 0.8}
        color="#ffffff"
      />
      <directionalLight
        position={[-8, -5, -6]}
        intensity={theme === 'dark' ? 0.25 : 0.2}
        color="#ffffff"
      />
      <hemisphereLight
        color="#ffffff"
        groundColor={theme === 'dark' ? '#2a2a2a' : '#e8e8e8'}
        intensity={theme === 'dark' ? 0.3 : 0.35}
      />

      {/* Surfaces */}
      {surfaces.map((s, i) => (
        <SurfaceMesh
          key={`surf-${i}-${s.expression}`}
          data={s}
          wireframe={wireframe}
          colorMode={colorMode}
        />
      ))}

      {/* Axes */}
      {showAxes && <Axes3D sizeX={sizeX} sizeY={sizeY} sizeZ={sizeZ} theme={theme} />}

      {/* Grid */}
      {showGrid && <Grid3D sizeX={sizeX} sizeY={sizeY} theme={theme} upAxis={upAxis} />}

      {/* Camera controls — fully orbit / zoom / pan enabled */}
      <OrbitControls
        ref={(r) => {
          controlsRef.current = (r as unknown as { reset: () => void } | null);
        }}
        enableZoom
        enablePan
        enableRotate
        autoRotate={autoRotate}
        autoRotateSpeed={1.2}
        minDistance={2}
        maxDistance={40}
        target={[0, 0, 0]}
        makeDefault
      />

      <CameraReset resetSignal={resetSignal} controlsRef={controlsRef} upAxis={upAxis} />

      {/* T6: 命令式截图桥接 — 把 gl.render + toDataURL 注册到外部 ref */}
      {captureRef && <CaptureBridge captureRef={captureRef} />}

      {/* WebGL context loss / restore handling */}
      <WebGLContextGuard />
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Exported Canvas wrapper                                           */
/* ------------------------------------------------------------------ */

export function Plot3DScene({
  surfaces,
  theme,
  showAxes,
  showGrid,
  wireframe,
  autoRotate = false,
  colorMode = 'height',
  upAxis = 'y',
  resetSignal = 0,
  captureRef,
}: Plot3DSceneProps) {
  // `frameloop="demand"` saves GPU cycles when the scene is static. When
  // auto-rotating we switch to `always` so the rotation animates smoothly.
  const frameloop = autoRotate ? 'always' : 'demand';

  // Probe WebGL once on the client; if unavailable, render a fallback
  // instead of mounting <Canvas> (which would synchronously throw).
  const [webglOk] = useState<boolean>(() => isWebGLAvailable());

  // The renderer must only initialize once the container has non-zero
  // size. Mounting <Canvas> while the host is 0×0 (hidden tab, collapsed
  // panel, dialog animating open) creates a 0×0 drawing buffer that
  // stays black — with frameloop="demand" nothing forces a re-render.
  // ResizeObserver waits for the first visible layout before mounting,
  // and keeps the renderer sized correctly afterwards (fibre handles
  // the resize itself via its own observer).
  const hostRef = useRef<HTMLDivElement>(null);
  const [hostReady, setHostReady] = useState(false);
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const check = () => {
      if (el.clientWidth > 0 && el.clientHeight > 0) {
        setHostReady(true);
      }
    };
    check();
    if (hostReady) return; // already visible — no observer needed
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setHostReady(true);
          ro.disconnect();
          return;
        }
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [hostReady]);

  if (!webglOk) {
    return (
      <div className="grid h-full w-full place-items-center bg-background p-6 text-center">
        <div className="space-y-2">
          <div className="text-2xl"> WebGL 不可用</div>
          <p className="max-w-sm text-sm text-muted-foreground">
            当前环境无法创建 WebGL 上下文，3D 绘图不可用。请检查显卡驱动是否正常、浏览器是否禁用了硬件加速。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div ref={hostRef} className="h-full w-full">
      {hostReady ? (
        <Canvas
          camera={{
            position: upAxis === 'z' ? [6, 6, 5] : [6, 5, 6],
            up: upAxis === 'z' ? [0, 0, 1] : [0, 1, 0],
            fov: 50,
            near: 0.1,
            far: 100,
          }}
          dpr={[1, 2]}
          frameloop={frameloop}
          gl={{ antialias: true, alpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' }}
          style={{ width: '100%', height: '100%', touchAction: 'none' }}
        >
          <SceneContents
            surfaces={surfaces}
            theme={theme}
            showAxes={showAxes}
            showGrid={showGrid}
            wireframe={wireframe}
            autoRotate={autoRotate}
            colorMode={colorMode}
            upAxis={upAxis}
            resetSignal={resetSignal}
            captureRef={captureRef}
          />
        </Canvas>
      ) : (
        // Placeholder while waiting for the first non-zero layout —
        // matches the dynamic-import loading fallback in Plot3DPanel.
        <div className="h-full w-full bg-background/40" />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function fmtTick(v: number, step: number): string {
  // For step >= 1, show integer. For step < 1, show with as many decimals as step.
  if (step >= 1) return Math.round(v).toString();
  const decimals = Math.max(0, -Math.floor(Math.log10(step)));
  return v.toFixed(decimals);
}
