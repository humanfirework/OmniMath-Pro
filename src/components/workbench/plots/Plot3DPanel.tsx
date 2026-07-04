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

import { useCallback, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  Box,
  Eye,
  EyeOff,
  Plus,
  RotateCcw,
  Settings2,
  Sparkles,
  X,
  ChevronDown,
  ChevronRight,
  Maximize2,
} from 'lucide-react';
import { useWorkbenchStore } from '@/lib/store/workbench';
import { sampleSurface, trySampleSurface, type Surface3DData } from '@/lib/plots/plot3d';
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
import { usePlot3DExport } from './Plot3DExport';
import { toast } from 'sonner';

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

const EXAMPLES: Array<{ expr: string; label: string; hint: string }> = [
  { expr: 'sin(x)*cos(y)', label: 'sin(x)·cos(y)', hint: '波纹' },
  { expr: 'x^2 - y^2', label: 'x² − y²', hint: '鞍面' },
  { expr: 'exp(-(x^2+y^2)/4)', label: 'e^(−(x²+y²)/4)', hint: '高斯钟形' },
  { expr: 'sin(sqrt(x^2+y^2))', label: 'sin(√(x²+y²))', hint: '墨西哥帽' },
  { expr: 'x^2 + y^2', label: 'x² + y²', hint: '抛物面' },
  { expr: 'cos(x)*sin(y) + 0.1*x', label: 'cos(x)·sin(y)+0.1x', hint: '倾斜波纹' },
];

const DEFAULT_X: [number, number] = [-5, 5];
const DEFAULT_Y: [number, number] = [-5, 5];

/* ----------------------- Component ----------------------------------- */

export function Plot3DPanel() {
  const plots = useWorkbenchStore((s) => s.plots);
  const theme = useWorkbenchStore((s) => s.theme);
  const addPlot = useWorkbenchStore((s) => s.addPlot);
  const removePlot = useWorkbenchStore((s) => s.removePlot);
  const togglePlotVisibility = useWorkbenchStore((s) => s.togglePlotVisibility);

  /* --------------------- Local UI state ---------------------------- */
  const [exprInput, setExprInput] = useState('');
  const [xRange, setXRange] = useState<[number, number]>(DEFAULT_X);
  const [yRange, setYRange] = useState<[number, number]>(DEFAULT_Y);
  const [resolution, setResolution] = useState(60);
  const [wireframe, setWireframe] = useState(false);
  const [showAxes, setShowAxes] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [autoRotate, setAutoRotate] = useState(false);
  const [colorMode, setColorMode] = useState<'height' | 'solid'>('height');
  const [showControls, setShowControls] = useState(true);
  const [resetSignal, setResetSignal] = useState(0);
  const [expandOpen, setExpandOpen] = useState(false);

  /* --------------------- Surfaces from store ----------------------- */
  // Filter for 3D-relevant plots only.
  const surface3dPlots = useMemo(
    () => plots.filter((p) => p.plotType === 'surface3d'),
    [plots],
  );

  // Sample them into Surface3DData. Re-sample only when expression / range /
  // resolution changes — NOT on every theme / wireframe / etc. toggle.
  const surfaces: Surface3DData[] = useMemo(() => {
    const out: Surface3DData[] = [];
    for (let i = 0; i < surface3dPlots.length; i++) {
      const p = surface3dPlots[i];
      if (!p.visible) continue;
      const data = trySampleSurface(
        p.expression,
        p.xRange,
        p.yRange,
        resolution,
        p.color || PLOT_COLORS[i % PLOT_COLORS.length],
      );
      if (data) out.push(data);
    }
    return out;
  }, [surface3dPlots, resolution]);

  /* --------------------- Add surface ------------------------------- */
  const handleAddSurface = useCallback(() => {
    const expr = exprInput.trim();
    if (!expr) {
      toast.error('请输入 z = f(x, y) 表达式');
      return;
    }
    // Quick sanity check before adding — sample at low resolution.
    const probe = trySampleSurface(expr, xRange, yRange, 8, '#2dd4bf');
    if (!probe || probe.validTriangleCount === 0) {
      toast.error('表达式无法求值，请检查变量是否为 x 和 y');
      return;
    }
    const colorIdx = surface3dPlots.length % PLOT_COLORS.length;
    addPlot({
      expression: expr,
      xRange,
      yRange,
      color: PLOT_COLORS[colorIdx],
      plotType: 'surface3d',
      visible: true,
    });
    setExprInput('');
    toast.success('已添加 3D 曲面');
  }, [exprInput, xRange, yRange, surface3dPlots.length, addPlot]);

  const handleAddExample = useCallback(
    (expr: string) => {
      const probe = trySampleSurface(expr, xRange, yRange, 8, '#2dd4bf');
      if (!probe || probe.validTriangleCount === 0) {
        toast.error('示例表达式无法求值');
        return;
      }
      const colorIdx = surface3dPlots.length % PLOT_COLORS.length;
      addPlot({
        expression: expr,
        xRange,
        yRange,
        color: PLOT_COLORS[colorIdx],
        plotType: 'surface3d',
        visible: true,
      });
      toast.success('已添加示例曲面');
    },
    [xRange, yRange, surface3dPlots.length, addPlot],
  );

  /* --------------------- Reset camera ------------------------------ */
  const handleResetCamera = useCallback(() => {
    setResetSignal((n) => n + 1);
  }, []);

  /* --------------------- Export PNG -------------------------------- */
  const canvasWrapperRef = useRef<HTMLDivElement>(null);
  const exportPNG = usePlot3DExport(canvasWrapperRef);

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
      <div className="flex h-full min-h-0 flex-col bg-background">
        {/* ---------- Top bar: function input + add ---------- */}
        <div className="flex flex-col gap-1.5 border-b border-border/60 bg-background/60 px-2 py-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-xs text-muted-foreground">z =</span>
            <Input
              type="text"
              value={exprInput}
              onChange={(e) => setExprInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddSurface();
                }
              }}
              placeholder="输入 f(x, y)，例如 sin(x)*cos(y)"
              className="h-8 min-w-0 flex-1 rounded border-border/60 bg-background/40 px-2 font-mono text-xs"
              aria-label="3D 函数表达式输入"
            />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  className="h-8 gap-1.5 bg-primary/90 px-2.5 text-primary-foreground hover:bg-primary"
                  onClick={handleAddSurface}
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span className="text-xs">添加</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">添加曲面 (Enter)</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowControls((v) => !v)}
                  aria-label="折叠/展开控制面板"
                >
                  {showControls ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {showControls ? '折叠' : '展开'}控制面板
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  onClick={handleResetCamera}
                  aria-label="重置相机"
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">重置相机视角</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  onClick={exportPNG}
                  aria-label="导出 PNG"
                >
                  <Box className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">导出 3D 场景为 PNG</TooltipContent>
            </Tooltip>
          </div>

          {/* ---------- Collapsible controls panel ---------- */}
          {showControls && (
            <div className="glass mt-0.5 grid grid-cols-2 gap-x-3 gap-y-2 rounded-md border border-border/50 p-2 text-xs sm:grid-cols-3 lg:grid-cols-4">
              {/* Wireframe toggle */}
              <ToggleRow
                label="线框"
                checked={wireframe}
                onCheckedChange={setWireframe}
              />
              <ToggleRow
                label="坐标轴"
                checked={showAxes}
                onCheckedChange={setShowAxes}
              />
              <ToggleRow
                label="网格"
                checked={showGrid}
                onCheckedChange={setShowGrid}
              />
              <ToggleRow
                label="自动旋转"
                checked={autoRotate}
                onCheckedChange={setAutoRotate}
              />

              {/* Resolution slider */}
              <div className="col-span-2 flex flex-col gap-1 sm:col-span-1">
                <div className="flex items-center justify-between">
                  <Label className="text-[11px] text-muted-foreground">
                    分辨率
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
                  aria-label="网格分辨率"
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
                  配色
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
                    aria-label="按高度配色"
                  >
                    高度
                  </ToggleGroupItem>
                  <ToggleGroupItem
                    value="solid"
                    className="h-6 px-2 text-[11px]"
                    aria-label="单色"
                  >
                    单色
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>
            </div>
          )}

          {/* Example chips */}
          <div className="flex flex-wrap items-center gap-1 pt-0.5">
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Sparkles className="h-3 w-3" /> 示例
            </span>
            {EXAMPLES.map((ex) => (
              <button
                key={ex.expr}
                type="button"
                onClick={() => handleAddExample(ex.expr)}
                className="rounded-full border border-border/60 bg-background/40 px-2 py-0.5 font-mono text-[10px] text-foreground/80 transition-theme hover:border-primary/60 hover:text-primary"
                title={ex.hint}
              >
                {ex.label}
              </button>
            ))}
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
                        className="text-muted-foreground transition-theme hover:text-foreground"
                        aria-label={p.visible ? '隐藏' : '显示'}
                      >
                        {p.visible ? (
                          <Eye className="h-3 w-3" />
                        ) : (
                          <EyeOff className="h-3 w-3" />
                        )}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      {p.visible ? '隐藏该曲面' : '显示该曲面'}
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => removePlot(p.id)}
                        className="text-muted-foreground transition-theme hover:text-rose-400"
                        aria-label="移除"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">移除该曲面</TooltipContent>
                  </Tooltip>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ---------- 3D Canvas (or empty state) ---------- */}
        <div
          ref={canvasWrapperRef}
          className="relative min-h-0 flex-1"
          style={{
            background:
              theme === 'dark'
                ? 'radial-gradient(circle at 50% 50%, #34343a 0%, #2a2a2e 100%)'
                : 'radial-gradient(circle at 50% 50%, #ffffff 0%, #f4f4f5 100%)',
          }}
        >
          {surfaces.length === 0 ? (
            <EmptyState3D />
          ) : (
            <Plot3DScene
              surfaces={surfaces}
              theme={theme}
              showAxes={showAxes}
              showGrid={showGrid}
              wireframe={wireframe}
              autoRotate={autoRotate}
              colorMode={colorMode}
              resetSignal={resetSignal}
            />
          )}

          {/* Expand button (top-right) */}
          {surfaces.length > 0 && (
            <button
              onClick={() => setExpandOpen(true)}
              className="absolute right-2 top-2 z-20 flex items-center gap-1.5 rounded-md border border-border/60 bg-background/80 px-2.5 py-1.5 text-xs text-primary backdrop-blur-sm transition-colors hover:bg-primary/10 hover:border-primary/40"
              aria-label="放大查看 3D"
            >
              <Maximize2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">放大</span>
            </button>
          )}

          {/* Hint overlay (bottom-left) when surfaces exist */}
          {surfaces.length > 0 && (
            <div className="pointer-events-none absolute bottom-2 left-2 z-10 select-none rounded-md border border-border/40 bg-background/70 px-2 py-1 text-[10px] text-foreground/70 backdrop-blur-sm">
              <span className="flex items-center gap-1">
                <Settings2 className="h-2.5 w-2.5" />
                拖拽旋转 · 滚轮缩放 · 右键平移
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ---------- Expand dialog (full-screen 3D) ---------- */}
      {expandOpen && (
        <div
          className="fixed inset-0 z-[200] flex flex-col bg-background/95 backdrop-blur-md"
          role="dialog"
          aria-modal="true"
          aria-label="放大查看 3D 绘图"
        >
          <div className="flex items-center justify-between border-b border-border/60 bg-background/80 px-4 py-2.5 backdrop-blur">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-semibold text-foreground">3D 曲面大图查看</h2>
              <span className="text-xs text-muted-foreground">
                {surfaces.length} 个曲面 · 拖拽旋转 · 滚轮缩放 · 右键平移
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={handleResetCamera}
                className="grid place-items-center size-8 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                aria-label="重置相机"
              >
                <RotateCcw className="size-4" />
              </button>
              <button
                onClick={exportPNG}
                className="flex items-center gap-1.5 h-8 px-2.5 rounded-md text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <Box className="size-3.5" />
                <span className="hidden sm:inline">导出 PNG</span>
              </button>
              <div className="mx-1 h-5 w-px bg-border/60" />
              <button
                onClick={() => setExpandOpen(false)}
                className="grid place-items-center size-8 rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                aria-label="关闭"
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
              resetSignal={resetSignal}
            />
          </div>
        </div>
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
    <div className="flex items-center justify-between gap-2">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        className="h-4 w-7 scale-90"
        aria-label={label}
      />
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
/*  Empty state — animated wireframe cube                             */
/* ------------------------------------------------------------------ */

function EmptyState3D() {
  return (
    <div className="grid-bg absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
      {/* Animated wireframe cube (pure CSS / SVG) */}
      <div
        className="animate-float relative h-32 w-32"
        style={{ perspective: '600px' }}
        aria-hidden
      >
        <div
          className="absolute inset-0"
          style={{
            transformStyle: 'preserve-3d',
            transform: 'rotateX(-20deg) rotateY(30deg)',
            animation: 'spin3d 12s linear infinite',
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
          3D 曲面工作区
        </p>
        <p className="max-w-xs text-xs text-muted-foreground">
          输入 <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">z = f(x, y)</code>{' '}
          表达式或点击下方示例，添加可自由旋转 / 缩放 / 平移的 3D 曲面。
        </p>
        <p className="mt-1 max-w-xs text-[11px] text-muted-foreground/80">
          支持 sin / cos / exp / sqrt 等函数，变量必须为 x 和 y。
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
        borderColor: '#2dd4bf80',
        backgroundColor: 'rgba(45, 212, 191, 0.05)',
        boxShadow: '0 0 12px rgba(45, 212, 191, 0.15) inset',
      }}
    />
  );
}
