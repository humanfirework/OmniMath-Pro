'use client';

/**
 * OmniMath Pro — 3D Plot Panel (container)
 *
 * Composes:
 *   - A function input where the user types `z = f(x, y)` (e.g. `sin(x)*cos(y)`)
 *     and an "Add surface" button.
 *   - A collapsible controls panel (wireframe / axes / grid / auto-rotate /
 *     resolution / ranges / color mode / reset camera).
 *   - The Plot3DScene (loaded via next/dynamic with ssr:false to avoid
 *     SSR issues with three.js / WebGL).
 *   - A surface list with remove buttons.
 *   - An animated wireframe-cube empty state.
 *
 * Surfaces come from the workbench store (filtered to `plotType === 'surface3d'`),
 * so they persist across tab switches and reloads. New surfaces are added via
 * `addPlot({ plotType: 'surface3d', ... })`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';
import {
  Box,
  Eye,
  EyeOff,
  FunctionSquare,
  Keyboard,
  Loader2,
  Plus,
  RotateCcw,
  Settings2,
  Sparkles,
  X,
  ChevronDown,
  ChevronRight,
  Maximize2,
  AlertTriangle,
} from 'lucide-react';
import { useWorkbenchStore, type PlotConfig } from '@/lib/store/workbench';
import { trySampleSurface, type Surface3DData } from '@/lib/plots/plot3d';
import {
  defaultImplicitZRange,
  implicitResolutionFromSlider,
  parse3DEquation,
  splitTopLevelEquation,
  trySampleImplicitSurface,
} from '@/lib/plots/implicit3d';
import {
  SurfaceSamplingGeneration,
  buildSurfaceCacheKey,
  normalizeSurfaceResolution,
  sampleSurfaceCached,
  type SurfaceSampleRequest,
  type SurfaceSamplingMode,
} from '@/lib/plots/surfaceSamplingCache';
import { useScopeVersion } from '@/lib/hooks/useScopeVersion';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { MathKeypad, deleteBackward, insertAtSelection } from './MathKeypad';
import { ParameterSliders } from './ParameterSliders';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  ToggleGroup,
  ToggleGroupItem,
} from '@/components/ui/toggle-group';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { usePlot3DExport } from './Plot3DExport';
import { FormulaRenderer } from '@/components/workbench/FormulaRenderer';
import { inputToLatex } from '@/lib/engine/latex';
import { toast } from 'sonner';
import { useT, tf } from '@/lib/i18n';

/* ----------------------- Dynamic load (no SSR) ------------------------ */
/* three.js / WebGL must not run on the server — load the Canvas only in
 * the browser. The empty-state fallback is rendered while loading. */

const Plot3DScene = dynamic(
  () => import('./Plot3DScene').then((m) => m.Plot3DScene),
  {
    ssr: false,
    loading: () => <div className="h-full w-full bg-background/40" />,
  },
);

/* ----------------------- Constants ----------------------------------- */

const PLOT_COLORS = [
  '#2dd4bf', // teal
  '#fbbf24', // amber
  '#fb7185', // rose
  '#34d399', // emerald
  '#a78bfa', // violet
  '#fb923c', // orange
];

const EXAMPLE_GROUPS = [
  {
    titleKey: 'plot3dGroupBasic' as const,
    items: [
      { expr: 'sin(x)*cos(y)', label: 'sin(x)·cos(y)', hintKey: 'plot3dExWave' as const },
      { expr: 'x^2 - y^2', label: 'x² − y²', hintKey: 'plot3dExSaddle' as const },
      { expr: 'x^2 + y^2', label: 'x² + y²', hintKey: 'plot3dExParaboloid' as const },
    ],
  },
  {
    titleKey: 'plot3dGroupAdvanced' as const,
    items: [
      { expr: 'exp(-(x^2+y^2)/4)', label: 'e^(−(x²+y²)/4)', hintKey: 'plot3dExGaussian' as const },
      { expr: 'sin(sqrt(x^2+y^2))', label: 'sin(√(x²+y²))', hintKey: 'plot3dExSombrero' as const },
      { expr: 'cos(x)*sin(y) + 0.1*x', label: 'cos(x)·sin(y)+0.1x', hintKey: 'plot3dExTiltedWave' as const },
    ],
  },
  {
    titleKey: 'plot3dGroupImplicit' as const,
    items: [
      { expr: 'x + z = 1', label: 'x + z = 1', hintKey: 'plot3dExPlane' as const },
      { expr: 'x^2 + y^2 + z^2 = 4', label: 'x² + y² + z² = 4', hintKey: 'plot3dExSphere' as const },
      { expr: 'z^2 = x^2 + y^2', label: 'z² = x² + y²', hintKey: 'plot3dExCone' as const },
    ],
  },
];

const DEFAULT_X: [number, number] = [-5, 5];
const DEFAULT_Y: [number, number] = [-5, 5];

/* ----------------------- Two-phase sampling -------------------------- */

/**
 * 交互期（参数 / 图元变化）先用的低精度分辨率：
 *   - 显式曲面 32² = 1024 次求值，通常 < 2ms；
 *   - 隐式曲面 18³ ≈ 5800 次求值，通常 15–25ms。
 * 只用于“先看到变化”，最终质量由 180ms 后的细化阶段保证。
 */
const QUICK_EXPLICIT_RESOLUTION = 32;
const QUICK_IMPLICIT_RESOLUTION = 18;

/**
 * 拖动参数滑块时 scopeVersion 每一步都会变。快速阶段限制到最多约
 * 11 次/秒（90ms），避免 18³ 采样在拖动期间排队；结构变化（新增 /
 * 删除图元、改表达式 / 范围 / 模式）不受此限制。
 */
const QUICK_THROTTLE_MS = 90;

/** 停止变化后等待多久再开始细化，避免拖动滑块时反复启动高精度采样。 */
const REFINE_DEBOUNCE_MS = 180;

/** 除分辨率 / scope 外的采样输入（由可见图元决定）。 */
type SurfaceInput = Omit<SurfaceSampleRequest, 'resolution' | 'scopeVersion'>;

/** 一个曲面当前展示的数据（低精度或细化后的结果）。 */
interface SampledSurface {
  plotId: string;
  expression: string;
  data: Surface3DData | null;
  error: string | null;
}

function quickResolutionFor(mode: SurfaceSamplingMode): number {
  return mode === 'implicit'
    ? QUICK_IMPLICIT_RESOLUTION
    : QUICK_EXPLICIT_RESOLUTION;
}

/**
 * 细化阶段的目标分辨率。显式曲面直接跟随滑块的 20..100；
 * 隐式曲面把同一个滑块映射到 12..44（默认 60 → 34）。
 */
function targetResolutionFor(
  mode: SurfaceSamplingMode,
  sliderResolution: number,
): number {
  return mode === 'implicit'
    ? implicitResolutionFromSlider(sliderResolution)
    : normalizeSurfaceResolution('explicit', sliderResolution);
}

function sampleInput(
  input: SurfaceInput,
  resolution: number,
  scopeVersion: number,
): SampledSurface {
  const result = sampleSurfaceCached({ ...input, resolution, scopeVersion });
  return {
    plotId: input.plotId,
    expression: input.expression,
    data: result.data,
    error: result.error,
  };
}

/** 是否按隐式方程采样：显式标记优先，旧数据按 `=` 推断。 */
function isImplicitPlot(plot: PlotConfig): boolean {
  if (plot.surfaceMode) return plot.surfaceMode === 'implicit';
  return plot.expression.includes('=') && !/^\s*z\s*=/i.test(plot.expression);
}

/* ----------------------- Component ----------------------------------- */

export function Plot3DPanel() {
  const t = useT();
  const plots = useWorkbenchStore((s) => s.plots);
  const theme = useWorkbenchStore((s) => s.theme);
  const addPlot = useWorkbenchStore((s) => s.addPlot);
  const removePlot = useWorkbenchStore((s) => s.removePlot);
  const togglePlotVisibility = useWorkbenchStore((s) => s.togglePlotVisibility);
  // 3D 面板添加的曲面也登记到函数输入器，两处共用同一个列表。
  const addDemosPlotId = useWorkbenchStore((s) => s.addDemosPlotId);
  const setInputView = useWorkbenchStore((s) => s.setInputView);

  /* --------------------- Local UI state ---------------------------- */
  const [exprInput, setExprInput] = useState('');
  const isMobile = useIsMobile();
  // 3D 面板默认不展开键盘，避免挤占画布；需要时点输入框右侧的键盘按钮。
  const [keypadOpen, setKeypadOpen] = useState(false);
  const exprInputRef = useRef<HTMLInputElement>(null);
  const pendingCaretRef = useRef<number | null>(null);

  const [xRange, setXRange] = useState<[number, number]>(DEFAULT_X);
  const [yRange, setYRange] = useState<[number, number]>(DEFAULT_Y);
  // 默认 80：曲面细分数比 60 明显更清晰，空闲细化阶段仍能保持可接受耗时。
  const [resolution, setResolution] = useState(80);
  const [wireframe, setWireframe] = useState(false);
  const [showAxes, setShowAxes] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [autoRotate, setAutoRotate] = useState(false);
  const [colorMode, setColorMode] = useState<'height' | 'solid'>('height');
  // 数学惯例 z 朝上（three.js 默认是 y 朝上）。z=f(x,y) 的曲面应当从
  // z 轴方向看过去是碗形，而不是把定义域的 y 当成竖直方向。
  const [upAxis, setUpAxis] = useState<'y' | 'z'>('z');
  const [showControls, setShowControls] = useState(false);
  const [resetSignal, setResetSignal] = useState(0);
  const [expandOpen, setExpandOpen] = useState(false);

  /* --------------------- Live LaTeX preview of the input ----------- */
  // Convert the raw `z =` input to display LaTeX on every keystroke so the
  // user sees the normalized math form (e.g. `2x` → `2 x`, `sqrt(x^2+y^2)`
  // → `√(x²+y²)`) as they type. Empty input yields an empty string, which
  // the preview row replaces with a placeholder.
  const exprLatex = useMemo(
    () => (exprInput.trim() ? inputToLatex(exprInput) : ''),
    [exprInput],
  );
  // `x + z = 1` 这类隐式方程自带 `z`，预览时不再额外加 `z =` 前缀。
  const parsedInput = useMemo(
    () => parse3DEquation(exprInput.trim()),
    [exprInput],
  );
  const previewLatex = useMemo(() => {
    if (!exprLatex) return '';
    if (parsedInput) return exprLatex;
    // 裸表达式默认是 z 的右端；如果用户已经写了 z（例如还没输入等号时的
    // `z + x`），就不要再补前缀，避免出现 “z = z + x” 这种误导性预览。
    if (/(^|[^A-Za-z0-9_])z([^A-Za-z0-9_]|$)/i.test(exprInput)) return exprLatex;
    return `z = ${exprLatex}`;
  }, [exprLatex, parsedInput, exprInput]);

  /* --------------------- Surfaces from store ----------------------- */
  // Filter for 3D-relevant plots only.
  const surface3dPlots = useMemo(
    () => plots.filter((p) => p.plotType === 'surface3d'),
    [plots],
  );

  // 可见曲面的采样输入。只依赖 plots：主题、线框 / 坐标轴 / 网格开关、
  // 控件折叠、标签切换都不会改变这个数组，因此不会触发重新采样。
  const surfaceInputs = useMemo<SurfaceInput[]>(() => {
    const out: SurfaceInput[] = [];
    for (let i = 0; i < surface3dPlots.length; i++) {
      const p = surface3dPlots[i];
      if (!p.visible) continue;
      out.push({
        plotId: p.id,
        expression: p.expression,
        xRange: p.xRange,
        yRange: p.yRange,
        surfaceMode: isImplicitPlot(p) ? 'implicit' : 'explicit',
        color: p.color || PLOT_COLORS[i % PLOT_COLORS.length],
      });
    }
    return out;
  }, [surface3dPlots]);

  const scopeVersion = useScopeVersion();

  /* ---------------- Phase 1: quick interactive sampling ------------- */
  // 结构性签名：图元集合 / 表达式 / 定义域 / 模式。任何一项变化都需要
  // 立即重采样，不能被下面的 scope 节流延迟。
  const quickStructureSignature = useMemo(
    () =>
      surfaceInputs
        .map(
          (input) =>
            `${input.plotId}|${input.surfaceMode}|${input.expression}|${input.xRange[0]},${input.xRange[1]}|${input.yRange[0]},${input.yRange[1]}`,
        )
        .join('#'),
    [surfaceInputs],
  );

  // 快速阶段使用的 scope 版本。纯参数变化走尾随节流（最多 ~11 次/秒），
  // 保证拖动时不会让 18³ 采样任务排队；如果结构变化则本轮渲染直接使用
  // 最新 scope，节流状态在提交后对齐。
  const [quickSnapshot, setQuickSnapshot] = useState(() => ({
    scopeVersion,
    structure: quickStructureSignature,
  }));
  const lastQuickSampleAtRef = useRef(0);

  useEffect(() => {
    if (quickSnapshot.structure === quickStructureSignature) return;
    lastQuickSampleAtRef.current = performance.now();
    setQuickSnapshot({
      scopeVersion,
      structure: quickStructureSignature,
    });
  }, [quickStructureSignature, scopeVersion, quickSnapshot.structure]);

  // 尾随节流：拖动停止后仍会以最后一次 scopeVersion 采样一次。
  useEffect(() => {
    if (quickSnapshot.structure !== quickStructureSignature) return;
    if (quickSnapshot.scopeVersion === scopeVersion) return;
    const elapsed = performance.now() - lastQuickSampleAtRef.current;
    const delay = Math.max(0, QUICK_THROTTLE_MS - elapsed);
    const timer = window.setTimeout(() => {
      lastQuickSampleAtRef.current = performance.now();
      setQuickSnapshot({
        scopeVersion,
        structure: quickStructureSignature,
      });
    }, delay);
    return () => window.clearTimeout(timer);
  }, [scopeVersion, quickSnapshot, quickStructureSignature]);

  const effectiveQuickScope =
    quickSnapshot.structure === quickStructureSignature
      ? quickSnapshot.scopeVersion
      : scopeVersion;

  // 同步低精度采样：结果按 (图元, 表达式, 范围, 模式, 分辨率, scope 版本)
  // 缓存，重复渲染不会重复求值。
  const quickSurfaces = useMemo<SampledSurface[]>(
    () =>
      surfaceInputs.map((input) =>
        sampleInput(
          input,
          quickResolutionFor(input.surfaceMode),
          effectiveQuickScope,
        ),
      ),
    [surfaceInputs, effectiveQuickScope],
  );

  /* ---------------- Phase 2: idle refinement ----------------------- */
  // 细化请求的签名：只要签名没变（主题 / 控件开关 / 标签切换），下面的
  // effect 就不会重新采样。buildSurfaceCacheKey 已覆盖图元 id、表达式、
  // 范围、模式与 scope 版本，这里再叠加目标分辨率。
  const refineSignature = useMemo(
    () =>
      surfaceInputs
        .map((input) =>
          buildSurfaceCacheKey({
            ...input,
            resolution: targetResolutionFor(input.surfaceMode, resolution),
            scopeVersion,
          }),
        )
        .join('#'),
    [surfaceInputs, resolution, scopeVersion],
  );

  const needsRefine = useMemo(
    () =>
      surfaceInputs.some(
        (input) =>
          targetResolutionFor(input.surfaceMode, resolution) !==
          quickResolutionFor(input.surfaceMode),
      ),
    [surfaceInputs, resolution],
  );

  // 代际令牌：每次请求细化时领取新 token，旧的异步结果在写回前比对，
  // 过期结果直接丢弃。
  const refineTrackerRef = useRef<SurfaceSamplingGeneration | null>(null);
  if (refineTrackerRef.current === null) {
    refineTrackerRef.current = new SurfaceSamplingGeneration();
  }
  const refineTracker = refineTrackerRef.current;

  const [refinedState, setRefinedState] = useState<{
    signature: string;
    surfaces: SampledSurface[];
  } | null>(null);

  useEffect(() => {
    if (surfaceInputs.length === 0 || !needsRefine) return;

    const token = refineTracker.next();
    let disposed = false;

    const timer = window.setTimeout(() => {
      if (disposed || !refineTracker.isCurrent(token)) return;

      const run = async () => {
        const next: SampledSurface[] = [];
        for (let i = 0; i < surfaceInputs.length; i++) {
          if (disposed || !refineTracker.isCurrent(token)) return;
          const input = surfaceInputs[i];
          next.push(
            sampleInput(
              input,
              targetResolutionFor(input.surfaceMode, resolution),
              scopeVersion,
            ),
          );
          // 多个隐式曲面连续采样时让出一帧，避免合成一条长任务。
          if (i < surfaceInputs.length - 1) {
            await new Promise<void>((resolve) => {
              window.setTimeout(resolve, 0);
            });
          }
        }
        if (disposed || !refineTracker.isCurrent(token)) return;
        setRefinedState({ signature: refineSignature, surfaces: next });
      };

      void run();
    }, REFINE_DEBOUNCE_MS);

    return () => {
      disposed = true;
      window.clearTimeout(timer);
      // 让本轮尚未完成的 token 失效，避免过期结果覆盖新数据。
      refineTracker.invalidate();
    };
  }, [
    refineSignature,
    needsRefine,
    surfaceInputs,
    resolution,
    scopeVersion,
    refineTracker,
  ]);

  // 只有签名匹配的细化结果才展示；否则继续用低精度结果，画面不会空白。
  const refinedSurfaces =
    refinedState && refinedState.signature === refineSignature
      ? refinedState.surfaces
      : null;
  const sampledSurfaces = refinedSurfaces ?? quickSurfaces;
  const refining =
    needsRefine && surfaceInputs.length > 0 && refinedSurfaces === null;

  // Valid meshes handed to Plot3DScene. Sampling failures are excluded so
  // the renderer never sees null geometry.
  const surfaces: Surface3DData[] = useMemo(
    () =>
      sampledSurfaces
        .map((s) => s.data)
        .filter((d): d is Surface3DData => d !== null),
    [sampledSurfaces],
  );

  // Human-readable error messages for display. Covers two failure modes:
  //   1. Sampling threw (`error !== null`) — show the thrown message.
  //   2. Sampling succeeded but produced 0 valid triangles
  //      (`data.validTriangleCount === 0`) — typically wrong variable
  //      names or an expression that is constant NaN over the domain.
  // This also catches surfaces that were valid when added but later
  // became invalid because a scope variable changed (scopeVersion bump).
  const surfaceErrors = useMemo(() => {
    const msgs: Array<{ plotId: string; expression: string; message: string }> = [];
    for (const s of sampledSurfaces) {
      if (s.error) {
        msgs.push({ plotId: s.plotId, expression: s.expression, message: s.error });
      } else if (s.data && s.data.validTriangleCount === 0) {
        msgs.push({
          plotId: s.plotId,
          expression: s.expression,
          message: t('plot3dErrNoGeometry'),
        });
      }
    }
    return msgs;
  }, [sampledSurfaces, t]);

  /* --------------------- Add surface ------------------------------- */
  // Unified add path for both explicit functions (`x^2 - y^2`) and equations
  // (`z = …`, `x + z = 1`, `x^2 + y^2 + z^2 = 4`). Implicit equations are
  // sampled with surface nets; explicit ones keep the height-map path.
  const addSurface = useCallback(
    (raw: string, fromExample: boolean) => {
      const text = raw.trim();
      if (!text) {
        toast.error(t('plot3dErrEmpty'));
        return;
      }

      // 只支持一个等号。`z = z + x = 1` / `x = y = 1` 会被误当成显式曲面
      // 去求值，这里直接给出可理解的提示。
      const firstParts = splitTopLevelEquation(text);
      if (firstParts && splitTopLevelEquation(firstParts.rhs)) {
        toast.error('一个方程只能有一个等号，例如 x + z = 1');
        return;
      }

      const parsed = parse3DEquation(text);
      const implicit = parsed?.kind === 'implicit';
      const expression = parsed ? parsed.expression : text;
      const sampleExpr =
        parsed?.kind === 'explicit' && parsed.rhs ? parsed.rhs : text;

      // Quick sanity check before adding — sample at low resolution.
      const probe = implicit
        ? trySampleImplicitSurface(
            expression,
            xRange,
            yRange,
            defaultImplicitZRange(xRange, yRange),
            20,
            '#2dd4bf',
          )
        : trySampleSurface(sampleExpr, xRange, yRange, 8, '#2dd4bf');

      if (probe.error) {
        // Surface the concrete error instead of a generic "无法求值".
        toast.error(
          tf(fromExample ? 'plot3dErrExampleEval' : 'plot3dErrEval', {
            err: probe.error,
          }),
        );
        return;
      }
      if (!probe.data || probe.data.validTriangleCount === 0) {
        toast.error(
          t(fromExample ? 'plot3dErrExampleEvalVars' : 'plot3dErrEvalVars'),
        );
        return;
      }

      const colorIdx = surface3dPlots.length % PLOT_COLORS.length;
      addPlot({
        expression,
        xRange,
        yRange,
        color: PLOT_COLORS[colorIdx],
        plotType: 'surface3d',
        surfaceMode: implicit ? 'implicit' : 'explicit',
        visible: true,
      });
      // 同步登记到函数输入器；否则这里添加的曲面在函数列表里看不到。
      const latest = useWorkbenchStore.getState().plots;
      addDemosPlotId(latest[latest.length - 1].id);
      if (!fromExample) setExprInput('');
      toast.success(t(fromExample ? 'plot3dExampleAdded' : 'plot3dAdded'));
    },
    [xRange, yRange, surface3dPlots.length, addPlot, addDemosPlotId, t],
  );

  const handleAddSurface = useCallback(
    () => addSurface(exprInput, false),
    [addSurface, exprInput],
  );

  const handleAddExample = useCallback(
    (expr: string) => addSurface(expr, true),
    [addSurface],
  );

  /* --------------------- 内置数学键盘 ------------------------------ */
  const insertKeypadText = useCallback((text: string) => {
    const el = exprInputRef.current;
    if (!el) return;
    const { next, caret } = insertAtSelection(el, text);
    setExprInput(next);
    pendingCaretRef.current = caret;
  }, []);

  const backspaceKeypad = useCallback(() => {
    const el = exprInputRef.current;
    if (!el) return;
    const { next, caret } = deleteBackward(el);
    setExprInput(next);
    pendingCaretRef.current = caret;
  }, []);

  const clearKeypad = useCallback(() => {
    setExprInput('');
    pendingCaretRef.current = 0;
  }, []);

  // 受控输入更新后恢复光标。
  useEffect(() => {
    if (pendingCaretRef.current === null) return;
    const pos = pendingCaretRef.current;
    pendingCaretRef.current = null;
    const el = exprInputRef.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    const p = Math.max(0, Math.min(pos, el.value.length));
    el.setSelectionRange(p, p);
  }, [exprInput]);

  /* --------------------- Reset camera ------------------------------ */
  const handleResetCamera = useCallback(() => {
    setResetSignal((n) => n + 1);
  }, []);

  /* --------------------- Export PNG -------------------------------- */
  const canvasWrapperRef = useRef<HTMLDivElement>(null);
  // T6: 命令式截图 ref — 由 Plot3DScene 内部 CaptureBridge 注册。
  // 主面板和展开对话框共用同一个 ref（二者不会同时挂载），所以导出
  // 按钮始终捕获当前可见的那个场景。
  const captureRef = useRef<(() => HTMLCanvasElement | null) | null>(null);
  const exportPNG = usePlot3DExport(canvasWrapperRef, captureRef);

  /* --------------------- Range change handlers --------------------- */
  // Clamp xMin < xMax at the onChange site instead of in an effect, so we
  // don't trigger cascading renders.
  const setXMin = useCallback((v: number) => {
    setXRange(([mx]) => (v >= mx ? [v, v + 1] : [v, mx]));
  }, []);
  const setXMax = useCallback((v: number) => {
    setXRange(([mn]) => (v <= mn ? [mn, mn + 1] : [mn, v]));
  }, []);
  const setYMin = useCallback((v: number) => {
    setYRange(([mx]) => (v >= mx ? [v, v + 1] : [v, mx]));
  }, []);
  const setYMax = useCallback((v: number) => {
    setYRange(([mn]) => (v <= mn ? [mn, mn + 1] : [mn, v]));
  }, []);

  /* --------------------- Render ------------------------------------ */
  return (
    <TooltipProvider delayDuration={250}>
      <div className="plot-3d-panel flex h-full min-h-0 flex-col bg-background">
        {/* ---------- Top bar: function input + add ---------- */}
        <div className="flex flex-col gap-1.5 border-b border-border/60 bg-background/60 px-2 py-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <Input
              ref={exprInputRef}
              type="text"
              value={exprInput}
              onChange={(e) => setExprInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddSurface();
                }
              }}
              inputMode={isMobile && keypadOpen ? 'none' : 'text'}
              placeholder={t('plot3dInputPlaceholder')}
              className="h-8 min-w-[132px] flex-1 rounded border-border/60 bg-background/40 px-2 font-mono text-xs"
              aria-label={t('plot3dExprInputAria')}
            />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    'touch-target h-8 w-8',
                    keypadOpen
                      ? 'text-primary hover:text-primary'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                  onClick={() => setKeypadOpen((v) => !v)}
                  aria-label={keypadOpen ? '收起数学键盘' : '打开数学键盘'}
                >
                  <Keyboard className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {keypadOpen ? '收起数学键盘' : '内置数学键盘'}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="touch-target h-8 w-8 text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setInputView('demos');
                    window.dispatchEvent(
                      new CustomEvent('omnimath:mobile-tab', { detail: 'editor' }),
                    );
                  }}
                  aria-label="在函数输入器中编辑"
                >
                  <FunctionSquare className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                在函数输入器中编辑（支持 2D / 3D、参数滑块）
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  className="h-8 gap-1.5 bg-primary/90 px-2.5 text-primary-foreground hover:bg-primary"
                  onClick={handleAddSurface}
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span className="text-xs">{t('plot3dAdd')}</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{t('plot3dAddSurface')}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="touch-target h-8 w-8 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowControls((v) => !v)}
                  aria-label={t('plot3dToggleControlsAria')}
                >
                  {showControls ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {showControls ? t('plot3dCollapseControls') : t('plot3dExpandControls')}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="touch-target h-8 w-8 text-muted-foreground hover:text-foreground"
                  onClick={handleResetCamera}
                  aria-label={t('plot3dResetCameraAria')}
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{t('plot3dResetCameraView')}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="touch-target h-8 w-8 text-muted-foreground hover:text-foreground"
                  onClick={exportPNG}
                  aria-label={t('plot3dExportPngAria')}
                >
                  <Box className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{t('plot3dExportScene')}</TooltipContent>
            </Tooltip>
          </div>

          {/* ---------- Live LaTeX preview of the z = input ----------
              Renders the normalized math form of whatever the user typed
              (via inputToLatex) so they can confirm the parsing before
              adding the surface. The container is horizontally scrollable
              for long expressions and shows a placeholder when empty. */}
          <div className="flex min-h-6 items-center gap-1.5 overflow-x-auto rounded-md border border-border/40 bg-background/40 px-2 py-0.5">
            <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
              {t('plot3dPreview')}
            </span>
            {previewLatex ? (
              <FormulaRenderer
                latex={previewLatex}
                displayMode={false}
                className="min-w-0 flex-1"
              />
            ) : (
              <span className="shrink-0 text-[11px] italic text-muted-foreground/60">
                {t('plot3dPreviewHint')}
              </span>
            )}
          </div>

          {/* 内置数学键盘：手机上直接点按输入 ^、√、θ、π 等符号。 */}
          {keypadOpen && (
            <MathKeypad
              className="rounded-md border border-border/40"
              onInsert={insertKeypadText}
              onBackspace={backspaceKeypad}
              onClear={clearKeypad}
              onEnter={handleAddSurface}
            />
          )}

          {/* ---------- Collapsible controls panel ---------- */}
          {showControls && (
            <div className="glass mt-0.5 grid grid-cols-2 gap-x-3 gap-y-2 rounded-md border border-border/50 p-2 text-xs sm:grid-cols-3 lg:grid-cols-4">
              {/* Wireframe toggle */}
              <ToggleRow
                label={t('plot3dWireframe')}
                checked={wireframe}
                onCheckedChange={setWireframe}
              />
              <ToggleRow
                label={t('plot3dAxes')}
                checked={showAxes}
                onCheckedChange={setShowAxes}
              />
              <ToggleRow
                label={t('plot3dGrid')}
                checked={showGrid}
                onCheckedChange={setShowGrid}
              />
              <ToggleRow
                label={t('plot3dAutoRotate')}
                checked={autoRotate}
                onCheckedChange={setAutoRotate}
              />

              {/* Resolution slider */}
              <div className="col-span-2 flex flex-col gap-1 sm:col-span-1">
                <div className="flex items-center justify-between">
                  <Label className="text-[11px] text-muted-foreground">
                    {t('plot3dResolution')}
                  </Label>
                  <span className="font-mono text-[11px] tabular-nums text-foreground/80">
                    {resolution}
                  </span>
                </div>
                <Slider
                  value={[resolution]}
                  min={20}
                  max={100}
                  step={5}
                  onValueChange={(v) => setResolution(v[0])}
                  className="h-1.5"
                  aria-label={t('plot3dGridResolutionAria')}
                />
              </div>

              {/* X range */}
              <div className="col-span-2 flex items-center gap-1 sm:col-span-1">
                <Label className="text-[11px] text-muted-foreground">x</Label>
                <CompactNumberInput
                  value={xRange[0]}
                  onChange={setXMin}
                  ariaLabel="x min"
                />
                <span className="text-muted-foreground/60">,</span>
                <CompactNumberInput
                  value={xRange[1]}
                  onChange={setXMax}
                  ariaLabel="x max"
                />
              </div>

              {/* Y range */}
              <div className="col-span-2 flex items-center gap-1 sm:col-span-1">
                <Label className="text-[11px] text-muted-foreground">y</Label>
                <CompactNumberInput
                  value={yRange[0]}
                  onChange={setYMin}
                  ariaLabel="y min"
                />
                <span className="text-muted-foreground/60">,</span>
                <CompactNumberInput
                  value={yRange[1]}
                  onChange={setYMax}
                  ariaLabel="y max"
                />
              </div>

              {/* Color mode */}
              <div className="col-span-2 flex flex-col gap-1 sm:col-span-1">
                <Label className="text-[11px] text-muted-foreground">
                  {t('plot3dColorScheme')}
                </Label>
                <ToggleGroup
                  type="single"
                  value={colorMode}
                  onValueChange={(v) => {
                    if (v === 'height' || v === 'solid') setColorMode(v);
                  }}
                  className="h-6"
                  size="sm"
                >
                  <ToggleGroupItem
                    value="height"
                    className="h-6 px-2 text-[11px]"
                    aria-label={t('plot3dSchemeHeightAria')}
                  >
                    {t('plot3dSchemeHeight')}
                  </ToggleGroupItem>
                  <ToggleGroupItem
                    value="solid"
                    className="h-6 px-2 text-[11px]"
                    aria-label={t('plot3dSchemeMonoAria')}
                  >
                    {t('plot3dSchemeMono')}
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>

              {/* Up-axis mode */}
              <div className="col-span-2 flex flex-col gap-1 sm:col-span-1">
                <Label className="text-[11px] text-muted-foreground">
                  {t('plot3dUpAxis')}
                </Label>
                <ToggleGroup
                  type="single"
                  value={upAxis}
                  onValueChange={(v) => {
                    if (v === 'y' || v === 'z') setUpAxis(v);
                  }}
                  className="h-6"
                  size="sm"
                >
                  <ToggleGroupItem
                    value="y"
                    className="h-6 px-2 text-[11px]"
                    aria-label={t('plot3dYUpAria')}
                  >
                    {t('plot3dYUp')}
                  </ToggleGroupItem>
                  <ToggleGroupItem
                    value="z"
                    className="h-6 px-2 text-[11px]"
                    aria-label={t('plot3dZUpAria')}
                  >
                    {t('plot3dZUp')}
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>
            </div>
          )}

          {/* Example dropdown — collapsed by default to avoid clutter.
              Previously 6 chips spread across the top bar; now a single
              "示例" button that opens a grouped dropdown menu. */}
          <div className="flex items-center gap-1.5 pt-0.5">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-1 rounded-md border border-border/60 bg-background/40 px-2 py-0.5 text-[10px] text-foreground/80 transition-theme hover:border-primary/60 hover:text-primary"
                  aria-label={t('plot3dOpenExamplesAria')}
                >
                  <Sparkles className="h-3 w-3" />
                  {t('plot3dExamples')}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                {EXAMPLE_GROUPS.map((group, gi) => (
                  <div key={group.titleKey}>
                    {gi > 0 && <DropdownMenuSeparator />}
                    <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {t(group.titleKey)}
                    </DropdownMenuLabel>
                    {group.items.map((ex) => (
                      <DropdownMenuItem
                        key={ex.expr}
                        onClick={() => handleAddExample(ex.expr)}
                        className="cursor-pointer font-mono text-[11px]"
                      >
                        <div className="flex flex-col gap-0.5">
                          <span>{ex.label}</span>
                          <span className="text-[9px] text-muted-foreground">{t(ex.hintKey)}</span>
                        </div>
                      </DropdownMenuItem>
                    ))}
                  </div>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Surface list */}
          {surface3dPlots.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              {surface3dPlots.map((p, i) => (
                <div
                  key={p.id}
                  className="group flex items-center gap-1.5 rounded-md border border-border/60 bg-background/40 px-1.5 py-0.5 transition-theme hover:border-border"
                >
                  <span
                    className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{
                      backgroundColor: p.color || PLOT_COLORS[i % PLOT_COLORS.length],
                      boxShadow: `0 0 6px ${p.color || PLOT_COLORS[i % PLOT_COLORS.length]}80`,
                    }}
                  />
                  <span className="max-w-[200px] truncate font-mono text-xs text-foreground/90">
                    {p.expression}
                  </span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => togglePlotVisibility(p.id)}
                        className="touch-target text-muted-foreground transition-theme hover:text-foreground"
                        aria-label={p.visible ? t('plot3dHide') : t('plot3dShow')}
                      >
                        {p.visible ? (
                          <Eye className="h-3 w-3" />
                        ) : (
                          <EyeOff className="h-3 w-3" />
                        )}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      {p.visible ? t('plot3dHideSurface') : t('plot3dShowSurface')}
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => removePlot(p.id)}
                        className="touch-target text-muted-foreground transition-theme hover:text-rose-400"
                        aria-label={t('plot3dRemoveAria')}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">{t('plot3dRemoveSurface')}</TooltipContent>
                  </Tooltip>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 3D 曲面里的自由参数（如 z = a*sin(x)*cos(y)）直接给滑块，
            与函数输入器共用同一份参数状态，拖动后立即重采样。 */}
        {surface3dPlots.length > 0 && (
          <div
            className="max-h-36 shrink-0 overflow-y-auto"
            // 调 3D 参数时收起内置键盘，给系统数字键盘留出空间。
            onPointerDownCapture={() => setKeypadOpen(false)}
            onFocusCapture={() => setKeypadOpen(false)}
          >
            <ParameterSliders
              plots={surface3dPlots}
              className="!border-t-0"
            />
          </div>
        )}

        {/* ---------- 3D Canvas (or empty state) ---------- */}
        {/* min-h-[200px]: guarantee the WebGL canvas never collapses to a
            zero-height container when the controls panel crowds the flex
            column — a 0-size container prevents renderer init. */}
        <div
          ref={canvasWrapperRef}
          className="plot-canvas-wrapper relative min-h-[200px] flex-1"
          style={{
            background:
              theme === 'dark'
                ? 'radial-gradient(circle at 50% 50%, #34343a 0%, #2a2a2e 100%)'
                : 'radial-gradient(circle at 50% 50%, #ffffff 0%, #f4f4f5 100%)',
          }}
        >
          {surfaces.length === 0 ? (
            /* If every visible surface failed to sample, show the concrete
               errors instead of the generic empty state — otherwise the
               user sees a blank canvas with no clue why (root cause 1/2). */
            surfaceErrors.length > 0 ? (
              <SurfaceErrorState errors={surfaceErrors} />
            ) : (
              <EmptyState3D />
            )
          ) : expandOpen ? (
            /* Avoid double WebGL context while the expand dialog is open. */
            <div className="h-full w-full" />
          ) : (
            <Plot3DScene
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
          )}

          {/* Expand button (top-right) */}
          {surfaces.length > 0 && (
            <button
              onClick={() => setExpandOpen(true)}
              className="absolute right-2 top-2 z-20 flex items-center gap-1.5 rounded-md border border-border/60 bg-background/80 px-2.5 py-1.5 text-xs text-primary backdrop-blur-sm transition-colors hover:bg-primary/10 hover:border-primary/40"
              aria-label={t('plot3dZoomInAria')}
            >
              <Maximize2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t('plot3dZoomIn')}</span>
            </button>
          )}

          {/* Error overlay (top-left) — some surfaces rendered but at least
              one failed (compile error, invalid range, or 0 triangles).
              Shown inline rather than as a toast so it persists while the
              broken surface stays in the list. Hidden while the expand
              dialog is open to avoid duplicating it there. */}
          {surfaces.length > 0 && surfaceErrors.length > 0 && !expandOpen && (
            <SurfaceErrorOverlay errors={surfaceErrors} />
          )}

          {/* Refinement indicator (bottom-right) — subtle, does not cover
              the canvas. Existing (quick) surfaces stay visible while the
              idle high-resolution pass runs. */}
          {refining && !expandOpen && (
            <div
              className="pointer-events-none absolute bottom-2 right-2 z-10 flex items-center gap-1.5 rounded-md border border-border/40 bg-background/75 px-2 py-1 text-[10px] text-foreground/70 backdrop-blur-sm"
              role="status"
              aria-live="polite"
            >
              <Loader2 className="h-3 w-3 animate-spin text-primary" />
              <span>{t('plot3dRefining')}</span>
            </div>
          )}

          {/* Hint overlay (bottom-left) when surfaces exist */}
          {surfaces.length > 0 && (
            <div className="pointer-events-none absolute bottom-2 left-2 z-10 select-none rounded-md border border-border/40 bg-background/70 px-2 py-1 text-[10px] text-foreground/70 backdrop-blur-sm">
              <span className="flex items-center gap-1">
                <Settings2 className="h-2.5 w-2.5" />
                {t('plot3dControlsHint')}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ---------- Expand dialog (full-screen 3D) ----------
          Rendered via Portal to <body> so that ancestor `transform`
          (from framer-motion) and `overflow-hidden` don't trap the
          `fixed inset-0` dialog inside the preview panel area. */}
      {expandOpen && typeof document !== 'undefined' && createPortal(
        (
          <div
            className="fixed inset-0 z-[200] flex flex-col bg-background/95 backdrop-blur-md"
            role="dialog"
            aria-modal="true"
            aria-label={t('plot3dExpandAria')}
          >
            <div className="flex items-center justify-between border-b border-border/60 bg-background/80 px-4 py-2.5 backdrop-blur">
              <div className="flex items-center gap-3">
                <h2 className="text-sm font-semibold text-foreground">{t('plot3dExpandTitle')}</h2>
                <span className="text-xs text-muted-foreground">
                  {tf('plot3dExpandSubtitle', { n: surfaces.length })}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={handleResetCamera}
                  className="grid place-items-center size-8 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  aria-label={t('plot3dResetCameraAria')}
                >
                  <RotateCcw className="size-4" />
                </button>
                <button
                  onClick={exportPNG}
                  className="flex items-center gap-1.5 h-8 px-2.5 rounded-md text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                >
                  <Box className="size-3.5" />
                  <span className="hidden sm:inline">{t('plot3dExportPng')}</span>
                </button>
                <div className="mx-1 h-5 w-px bg-border/60" />
                <button
                  onClick={() => setExpandOpen(false)}
                  className="grid place-items-center size-8 rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                  aria-label={t('plot3dCloseAria')}
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>
            <div
              className="relative flex-1 min-h-0"
              style={{
                background:
                  theme === 'dark'
                    ? 'radial-gradient(circle at 50% 50%, #34343a 0%, #2a2a2e 100%)'
                    : 'radial-gradient(circle at 50% 50%, #ffffff 0%, #f4f4f5 100%)',
              }}
            >
              <Plot3DScene
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
              {refining && (
                <div
                  className="pointer-events-none absolute bottom-3 right-3 z-10 flex items-center gap-1.5 rounded-md border border-border/40 bg-background/75 px-2 py-1 text-[10px] text-foreground/70 backdrop-blur-sm"
                  role="status"
                  aria-live="polite"
                >
                  <Loader2 className="h-3 w-3 animate-spin text-primary" />
                  <span>{t('plot3dRefining')}</span>
                </div>
              )}
            </div>
          </div>
        ),
        document.body,
      )}
    </TooltipProvider>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                    */
/* ------------------------------------------------------------------ */

function ToggleRow({
  label,
  checked,
  onCheckedChange,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        className="h-4 w-7 scale-90"
        aria-label={label}
        id={`toggle-${label}`}
      />
      <Label
        htmlFor={`toggle-${label}`}
        className="cursor-pointer text-[11px] text-muted-foreground"
      >
        {label}
      </Label>
    </div>
  );
}

function CompactNumberInput({
  value,
  onChange,
  ariaLabel,
}: {
  value: number;
  onChange: (v: number) => void;
  ariaLabel: string;
}) {
  return (
    <Input
      type="number"
      step="any"
      aria-label={ariaLabel}
      value={Number.isFinite(value) ? Number(value.toFixed(2)) : 0}
      onChange={(e) => {
        const v = parseFloat(e.target.value);
        if (Number.isFinite(v)) onChange(v);
      }}
      className="h-6 w-14 rounded border-border/60 bg-background/40 px-1.5 font-mono text-[11px] tabular-nums"
    />
  );
}

/* ------------------------------------------------------------------ */
/*  Surface sampling errors                                           */
/* ------------------------------------------------------------------ */

interface SurfaceError {
  plotId: string;
  expression: string;
  message: string;
}

/**
 * Full-canvas replacement shown when every visible surface failed to
 * sample (so there is nothing to render). Lists each broken expression
 * with its concrete error message instead of a blank canvas.
 */
function SurfaceErrorState({ errors }: { errors: SurfaceError[] }) {
  const t = useT();
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
      <div className="flex items-center gap-2 text-rose-500">
        <AlertTriangle className="h-5 w-5" />
        <span className="text-sm font-medium">{t('plot3dSampleFailed')}</span>
      </div>
      <div className="flex w-full max-w-md flex-col gap-1.5">
        {errors.map((e) => (
          <div
            key={e.plotId}
            className="rounded-md border border-rose-500/40 bg-rose-500/10 px-2.5 py-1.5 text-left"
          >
            <div className="truncate font-mono text-[11px] text-rose-600 dark:text-rose-400">
              {e.expression}
            </div>
            <div className="mt-0.5 break-words text-[11px] text-foreground/70">
              {e.message}
            </div>
          </div>
        ))}
      </div>
      <p className="max-w-xs text-[11px] text-muted-foreground">
        {t('plot3dSampleFailedHint')}
      </p>
    </div>
  );
}

/**
 * Compact overlay shown when at least one surface failed but others are
 * still rendering. Pinned to the top-left so it doesn't collide with the
 * expand button (top-right).
 */
function SurfaceErrorOverlay({ errors }: { errors: SurfaceError[] }) {
  const t = useT();
  return (
    <div className="absolute left-2 top-2 z-20 flex max-w-xs flex-col gap-1 rounded-md border border-rose-500/50 bg-background/90 p-1.5 text-left shadow-lg backdrop-blur-sm">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-rose-500">
        <AlertTriangle className="h-3 w-3" />
        <span>{tf('plot3dSurfacesFailed', { n: errors.length })}</span>
      </div>
      {errors.map((e) => (
        <div key={e.plotId} className="min-w-0">
          <div className="truncate font-mono text-[10px] text-rose-600 dark:text-rose-400">
            {e.expression}
          </div>
          <div className="break-words text-[10px] text-foreground/70">
            {e.message}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Empty state — animated wireframe cube                             */
/* ------------------------------------------------------------------ */

function EmptyState3D() {
  const t = useT();
  return (
    <div className="grid-bg absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
      {/* Static wireframe cube (pure CSS / SVG). 之前是无限浮动 + 旋转，
          在空状态里持续占用合成器；改成静态后视觉更安静，也不再空转。 */}
      <div
        className="relative h-32 w-32"
        style={{ perspective: '600px' }}
        aria-hidden
      >
        <div
          className="absolute inset-0"
          style={{
            transformStyle: 'preserve-3d',
            transform: 'rotateX(-20deg) rotateY(30deg)',
          }}
        >
          {/* Cube faces as borders */}
          <CubeFace position="front" />
          <CubeFace position="back" />
          <CubeFace position="left" />
          <CubeFace position="right" />
          <CubeFace position="top" />
          <CubeFace position="bottom" />
        </div>
      </div>

      <div className="flex flex-col items-center gap-1.5">
        <p className="text-sm font-medium text-foreground/90">
          {t('plot3dWorkspaceTitle')}
        </p>
        <p className="max-w-xs text-xs text-muted-foreground">
          {t('plot3dWorkspaceHintPre')}{' '}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">z = f(x, y)</code>{' '}
          {t('plot3dWorkspaceHintPost')}
        </p>
        <p className="mt-1 max-w-xs text-[11px] text-muted-foreground/80">
          {t('plot3dWorkspaceSupported')}
        </p>
      </div>

      {/* Inline keyframes for 3D rotation */}
      <style jsx>{`
        @keyframes spin3d {
          0% { transform: rotateX(-20deg) rotateY(0deg); }
          100% { transform: rotateX(-20deg) rotateY(360deg); }
        }
      `}</style>
    </div>
  );
}

interface CubeFaceProps {
  position: 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom';
}

function CubeFace({ position }: CubeFaceProps) {
  // 50% size cube centered on parent
  const transform: Record<CubeFaceProps['position'], string> = {
    front: 'translateZ(64px)',
    back: 'rotateY(180deg) translateZ(64px)',
    left: 'rotateY(-90deg) translateZ(64px)',
    right: 'rotateY(90deg) translateZ(64px)',
    top: 'rotateX(90deg) translateZ(64px)',
    bottom: 'rotateX(-90deg) translateZ(64px)',
  };
  return (
    <div
      className="absolute inset-0 rounded-sm border"
      style={{
        transform: transform[position],
        borderColor: 'var(--primary, #2dd4bf80)',
        backgroundColor: 'var(--primary-bg-soft, rgba(45, 212, 191, 0.05))',
        boxShadow: '0 0 12px var(--primary-shadow, rgba(45, 212, 191, 0.15)) inset',
      }}
    />
  );
}
