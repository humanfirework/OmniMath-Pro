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
 */

import { useEffect, useMemo, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Grid, Text, Line } from '@react-three/drei';
import * as THREE from 'three';
import type { Surface3DData } from '@/lib/plots/plot3d';
import { solidColorArray } from '@/lib/plots/plot3d';

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
  /** Bump this number to force the camera back to its default position. */
  resetSignal?: number;
}

/* ------------------------------------------------------------------ */
/*  Theme palette                                                      */
/* ------------------------------------------------------------------ */

const THEME = {
  dark: {
    bg: '#1a1a1d',
    gridColor: '#3a3a40',
    gridSection: '#2a2a2e',
    axisLabel: '#b8b8c0',
    tickLabel: '#8a8a92',
    fogColor: '#1a1a1d',
    fogNear: 14,
    fogFar: 40,
  },
  light: {
    bg: '#fafafa',
    gridColor: '#d4d4d8',
    gridSection: '#e4e4e7',
    axisLabel: '#3f3f46',
    tickLabel: '#71717a',
    fogColor: '#fafafa',
    fogNear: 16,
    fogFar: 44,
  },
};

// Axis colors — tinted to the OmniMath palette (teal / amber / rose) instead
// of pure RGB red/green/blue.
const AXIS_COLORS = {
  x: '#2dd4bf', // teal
  y: '#fbbf24', // amber
  z: '#fb7185', // rose
};

/* ------------------------------------------------------------------ */
/*  SurfaceMesh                                                        */
/* ------------------------------------------------------------------ */

interface SurfaceMeshProps {
  data: Surface3DData;
  wireframe: boolean;
  colorMode: 'height' | 'solid';
}

function SurfaceMesh({ data, wireframe, colorMode }: SurfaceMeshProps) {
  // Build the BufferGeometry attributes. Memoized so we don't recreate
  // Float32Arrays / Uint32Arrays on every render — only when the surface
  // data or color mode actually changes.
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(data.vertices, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3));
    const colorAttr =
      colorMode === 'solid'
        ? solidColorArray(data.vertices.length / 3, data.color)
        : data.colors;
    g.setAttribute('color', new THREE.BufferAttribute(colorAttr, 3));
    g.setIndex(new THREE.BufferAttribute(data.indices, 1));
    g.computeBoundingSphere();
    return g;
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
        metalness={0.15}
        roughness={0.55}
        transparent
        opacity={0.94}
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
/*  Axes3D — labeled X / Y / Z lines with tick marks                  */
/* ------------------------------------------------------------------ */

interface Axes3DProps {
  /** Half-extent of the axes (axis runs from -size to +size). */
  size: number;
  theme: 'dark' | 'light';
}

function Axes3D({ size, theme }: Axes3DProps) {
  const palette = THEME[theme];

  // Tick spacing — pick a "nice" step from {1, 2, 5} × 10^n.
  const ticks = useMemo(() => {
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
  }, [size]);

  const labelProps = {
    fontSize: 0.45,
    color: palette.axisLabel,
    anchorX: 'center' as const,
    anchorY: 'middle' as const,
    outlineWidth: 0.025,
    outlineColor: palette.bg,
  };

  const tickLabelProps = {
    fontSize: 0.28,
    color: palette.tickLabel,
    anchorX: 'center' as const,
    anchorY: 'middle' as const,
    outlineWidth: 0.018,
    outlineColor: palette.bg,
  };

  return (
    <group>
      {/* X axis line (teal) */}
      <AxisLine from={[-size, 0, 0]} to={[size, 0, 0]} color={AXIS_COLORS.x} lineWidth={2.5} />
      {/* Y axis line (amber) */}
      <AxisLine from={[0, -size, 0]} to={[0, size, 0]} color={AXIS_COLORS.y} lineWidth={2.5} />
      {/* Z axis line (rose) */}
      <AxisLine from={[0, 0, -size]} to={[0, 0, size]} color={AXIS_COLORS.z} lineWidth={2.5} />

      {/* Tick marks + labels along each axis */}
      {ticks.values.map((v, i) => (
        <group key={`tick-${i}`}>
          {/* X tick at (v, 0, 0) */}
          <TickMark position={[v, 0, 0]} axis="x" color={AXIS_COLORS.x} />
          {Math.abs(v) > 1e-9 && (
            <Text position={[v, -0.3, 0.3]} rotation={[-Math.PI / 2, 0, 0]} {...tickLabelProps}>
              {fmtTick(v, ticks.step)}
            </Text>
          )}
          {/* Y tick at (0, v, 0) */}
          <TickMark position={[0, v, 0]} axis="y" color={AXIS_COLORS.y} />
          {Math.abs(v) > 1e-9 && (
            <Text position={[0.3, v, 0.3]} rotation={[0, 0, 0]} {...tickLabelProps}>
              {fmtTick(v, ticks.step)}
            </Text>
          )}
          {/* Z tick at (0, 0, v) */}
          <TickMark position={[0, 0, v]} axis="z" color={AXIS_COLORS.z} />
          {Math.abs(v) > 1e-9 && (
            <Text position={[0.3, 0, v]} rotation={[0, 0, 0]} {...tickLabelProps}>
              {fmtTick(v, ticks.step)}
            </Text>
          )}
        </group>
      ))}

      {/* Axis end labels */}
      <Text position={[size + 0.6, 0, 0]} {...labelProps}>
        x
      </Text>
      <Text position={[0, size + 0.6, 0]} {...labelProps}>
        y
      </Text>
      <Text position={[0, 0, size + 0.6]} {...labelProps}>
        z
      </Text>

      {/* Origin label */}
      <Text position={[-0.35, -0.35, -0.1]} {...tickLabelProps}>
        0
      </Text>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/*  Grid3D — floor grid using drei <Grid>                             */
/* ------------------------------------------------------------------ */

function Grid3D({
  size,
  theme,
}: {
  size: number;
  theme: 'dark' | 'light';
}) {
  const palette = THEME[theme];
  return (
    <Grid
      position={[0, 0, 0]}
      args={[2 * size, 2 * size]}
      cellSize={Math.max(0.25, size / 10)}
      cellThickness={0.6}
      cellColor={palette.gridSection}
      sectionSize={Math.max(1, size / 2)}
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
/*  CameraReset — watches resetSignal, calls controls.reset()         */
/* ------------------------------------------------------------------ */

function CameraReset({
  resetSignal,
  controlsRef,
}: {
  resetSignal: number;
  controlsRef: MutableRefObject<{ reset: () => void } | null>;
}) {
  const { camera } = useThree();
  useEffect(() => {
    if (resetSignal === 0) return; // skip initial mount
    camera.position.set(6, 5, 6);
    camera.lookAt(0, 0, 0);
    if (controlsRef.current) {
      controlsRef.current.reset();
    }
  }, [resetSignal]);
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
  resetSignal: number;
}

function SceneContents({
  surfaces,
  theme,
  showAxes,
  showGrid,
  wireframe,
  autoRotate,
  colorMode,
  resetSignal,
}: SceneContentsProps) {
  const palette = THEME[theme];
  const controlsRef = useRef<{ reset: () => void } | null>(null);

  // Compute a unified axis half-extent: max of |x|, |y| from the surfaces'
  // domain plus a generous margin so axes extend beyond the data.
  const axisSize = useMemo(() => {
    if (surfaces.length === 0) return 5;
    let m = 5;
    for (const s of surfaces) {
      m = Math.max(
        m,
        Math.abs(s.xRange[0]),
        Math.abs(s.xRange[1]),
        Math.abs(s.yRange[0]),
        Math.abs(s.yRange[1]),
      );
    }
    // Add ~8% margin, snap to next 0.5
    return Math.ceil(m * 1.08 * 2) / 2;
  }, [surfaces]);

  return (
    <>
      <color attach="background" args={[palette.bg]} />
      <fog attach="fog" args={[palette.fogColor, palette.fogNear, palette.fogFar]} />

      {/* Lighting — three-point-ish setup */}
      <ambientLight intensity={theme === 'dark' ? 0.6 : 0.9} />
      <directionalLight
        position={[8, 12, 6]}
        intensity={theme === 'dark' ? 1.0 : 1.2}
        color="#ffffff"
      />
      <pointLight
        position={[-6, -4, 8]}
        intensity={theme === 'dark' ? 0.4 : 0.25}
        color={AXIS_COLORS.x}
      />
      <pointLight
        position={[6, -4, -8]}
        intensity={theme === 'dark' ? 0.3 : 0.18}
        color={AXIS_COLORS.z}
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
      {showAxes && <Axes3D size={axisSize} theme={theme} />}

      {/* Grid */}
      {showGrid && <Grid3D size={axisSize} theme={theme} />}

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

      <CameraReset resetSignal={resetSignal} controlsRef={controlsRef} />
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
  resetSignal = 0,
}: Plot3DSceneProps) {
  // `frameloop="demand"` saves GPU cycles when the scene is static. When
  // auto-rotating we switch to `always` so the rotation animates smoothly.
  const frameloop = autoRotate ? 'always' : 'demand';

  return (
    <Canvas
      camera={{ position: [6, 5, 6], fov: 50, near: 0.1, far: 100 }}
      dpr={[1, 2]}
      frameloop={frameloop}
      gl={{ antialias: true, alpha: false, preserveDrawingBuffer: true }}
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
        resetSignal={resetSignal}
      />
    </Canvas>
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
