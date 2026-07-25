'use client';

/**
 * OmniMath Pro — 2D Plot Advanced Features Panel (collapsible)
 *
 * A compact, default-collapsed panel that houses the "advanced" 2D plot
 * features so they don't clutter the toolbar:
 *   - 交点 (Intersections): compute & list where two curves cross
 *   - 切线 (Tangent): draw the tangent line of a curve at x₀
 *   - 求导 (Derivative): show the 1st/2nd/3rd numerical derivative curve
 *   - 范围 (Range mode): switch between smart / full / manual Y range
 *
 * Design intent (from the user spec):
 *   "避免过多按钮影响界面美观，可采用可折叠面板或上下文菜单形式集成高级功能"
 *   → The panel defaults to collapsed; a single chevron button toggles it.
 *
 * The panel is a *controlled* component — it reports results + range mode
 * via callbacks. The parent (Plot2DPanel) decides how to render overlays.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, GitCompare, Spline, Sigma, Ruler, Layers, Grid3x3 } from 'lucide-react';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  findIntersections,
  tangentLine,
  numericDerivative,
  symbolicDerivative,
  type IntersectionPoint,
  type TangentResult,
} from '@/lib/plots/plot2dAnalysis';
import type { PlotSample } from '@/lib/plots/plot2d';
import type { PlotConfig } from '@/lib/store/workbench';
import { FormulaRenderer } from '@/components/workbench/FormulaRenderer';
import { useScopeVersion } from '@/lib/hooks/useScopeVersion';

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export type RangeMode = 'smart' | 'full' | 'manual';

/**
 * Compare mode for multi-plot rendering.
 * - `overlay`: all curves on a single shared-Y canvas (legacy).
 * - `facet`: each curve in its own mini-canvas with independent Y axis
 *   (default for multi-plot — solves the "x²/sin x/eˣ all crushed
 *   together" problem).
 */
export type CompareMode = 'overlay' | 'facet';

export interface AdvancedOverlays {
  intersections: IntersectionPoint[];
  tangent: TangentResult | null;
  derivativeSamples: PlotSample[];
  derivativeOrder: 1 | 2 | 3;
}

export interface Plot2DAdvancedPanelProps {
  plots: PlotConfig[];
  xRange: [number, number];
  yRange: [number, number];
  /** Labels of curves flagged as outliers by coordinatedYRange (e.g. ["e^x"]). */
  outliers: string[];
  /** Current range mode. */
  rangeMode: RangeMode;
  onRangeModeChange: (mode: RangeMode) => void;
  /** Current compare mode (overlay vs facet). */
  compareMode: CompareMode;
  onCompareModeChange: (mode: CompareMode) => void;
  /** Called whenever the computed overlays change. */
  onOverlaysChange: (overlays: AdvancedOverlays) => void;
  /** Whether X/Y axes use equal scale (1:1) so circles stay circular. */
  equalAspect: boolean;
  onEqualAspectChange: (v: boolean) => void;
}

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export function Plot2DAdvancedPanel({
  plots,
  xRange,
  yRange,
  outliers,
  rangeMode,
  onRangeModeChange,
  compareMode,
  onCompareModeChange,
  onOverlaysChange,
  equalAspect,
  onEqualAspectChange,
}: Plot2DAdvancedPanelProps) {
  const [open, setOpen] = useState(false);
  const showCompareToggle = plots.length > 1;

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border-b border-border/60 bg-background/40">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex h-7 w-full items-center gap-1.5 px-2.5 text-[11px] font-medium text-muted-foreground hover:bg-accent/40 hover:text-foreground transition-colors"
          aria-label={open ? '折叠高级功能' : '展开高级功能'}
        >
          {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
          <span>高级功能</span>
          {outliers.length > 0 && (
            <span className="ml-1 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] text-amber-600 dark:text-amber-400">
              {outliers.length} 条离群曲线已裁切
            </span>
          )}
          {showCompareToggle && (
            <span className="ml-auto flex items-center gap-1 text-[9px] text-muted-foreground">
              {compareMode === 'facet' ? <Grid3x3 className="size-2.5" /> : <Layers className="size-2.5" />}
              {compareMode === 'facet' ? '分面' : '叠加'}
            </span>
          )}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="px-2 pb-2 pt-0.5">
          <Tabs defaultValue="range" className="gap-1.5">
            <TabsList className="h-7 text-[10px]">
              <TabsTrigger value="range" className="gap-1 px-2 py-0.5 text-[10px]">
                <Ruler className="size-3" /> 范围
              </TabsTrigger>
              <TabsTrigger value="intersect" className="gap-1 px-2 py-0.5 text-[10px]">
                <GitCompare className="size-3" /> 交点
              </TabsTrigger>
              <TabsTrigger value="tangent" className="gap-1 px-2 py-0.5 text-[10px]">
                <Spline className="size-3" /> 切线
              </TabsTrigger>
              <TabsTrigger value="deriv" className="gap-1 px-2 py-0.5 text-[10px]">
                <Sigma className="size-3" /> 求导
              </TabsTrigger>
            </TabsList>

            <TabsContent value="range">
              <RangeTab
                outliers={outliers}
                rangeMode={rangeMode}
                onRangeModeChange={onRangeModeChange}
                compareMode={compareMode}
                onCompareModeChange={onCompareModeChange}
                showCompareToggle={showCompareToggle}
                equalAspect={equalAspect}
                onEqualAspectChange={onEqualAspectChange}
              />
            </TabsContent>
            <TabsContent value="intersect">
              <IntersectTab plots={plots} xRange={xRange} onOverlaysChange={onOverlaysChange} />
            </TabsContent>
            <TabsContent value="tangent">
              <TangentTab plots={plots} xRange={xRange} onOverlaysChange={onOverlaysChange} />
            </TabsContent>
            <TabsContent value="deriv">
              <DerivativeTab plots={plots} xRange={xRange} onOverlaysChange={onOverlaysChange} />
            </TabsContent>
          </Tabs>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

/* ------------------------------------------------------------------ */
/*  Range mode tab                                                    */
/* ------------------------------------------------------------------ */

function RangeTab({
  outliers,
  rangeMode,
  onRangeModeChange,
  compareMode,
  onCompareModeChange,
  showCompareToggle,
  equalAspect,
  onEqualAspectChange,
}: {
  outliers: string[];
  rangeMode: RangeMode;
  onRangeModeChange: (m: RangeMode) => void;
  compareMode: CompareMode;
  onCompareModeChange: (m: CompareMode) => void;
  showCompareToggle: boolean;
  equalAspect: boolean;
  onEqualAspectChange: (v: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-2 py-1">
      {showCompareToggle && (
        <>
          <Label className="text-[10px] text-muted-foreground">对比模式</Label>
          <ToggleGroup
            type="single"
            value={compareMode}
            onValueChange={(v) => {
              if (v === 'overlay' || v === 'facet') onCompareModeChange(v);
            }}
            className="h-7"
            size="sm"
          >
            <ToggleGroupItem value="facet" className="h-7 px-2 text-[10px] gap-1" aria-label="分面对比">
              <Grid3x3 className="size-3" /> 分面
            </ToggleGroupItem>
            <ToggleGroupItem value="overlay" className="h-7 px-2 text-[10px] gap-1" aria-label="叠加对比">
              <Layers className="size-3" /> 叠加
            </ToggleGroupItem>
          </ToggleGroup>
          <p className="text-[10px] text-muted-foreground">
            {compareMode === 'facet'
              ? '分面模式：每个函数独立 Y 轴，适合对比不同量级的函数形状。'
              : '叠加模式：所有函数共享 Y 轴，适合对比相同量级的函数。'}
          </p>
        </>
      )}
      <Label className="text-[10px] text-muted-foreground">坐标轴比例</Label>
      <ToggleGroup
        type="single"
        value={equalAspect ? 'equal' : 'free'}
        onValueChange={(v) => {
          if (v === 'equal' || v === 'free') onEqualAspectChange(v === 'equal');
        }}
        className="h-7"
        size="sm"
      >
        <ToggleGroupItem value="equal" className="h-7 px-2 text-[10px] gap-1" aria-label="等比例">
          <Grid3x3 className="size-3" /> 等比例 (1:1)
        </ToggleGroupItem>
        <ToggleGroupItem value="free" className="h-7 px-2 text-[10px] gap-1" aria-label="自由比例">
          <Layers className="size-3" /> 自由
        </ToggleGroupItem>
      </ToggleGroup>
      <p className="text-[10px] text-muted-foreground">
        {equalAspect
          ? '等比例模式：X/Y 轴比例尺相同，圆形保持圆形。适合几何函数。'
          : '自由模式：X/Y 轴独立缩放，充分利用画布空间。适合波形函数。'}
      </p>
      <Label className="text-[10px] text-muted-foreground">Y 轴范围模式{showCompareToggle && compareMode === 'facet' ? '（仅叠加模式生效）' : ''}</Label>
      <ToggleGroup
        type="single"
        value={rangeMode}
        onValueChange={(v) => {
          if (v === 'smart' || v === 'full' || v === 'manual') onRangeModeChange(v);
        }}
        className="h-7"
        size="sm"
        disabled={showCompareToggle && compareMode === 'facet'}
      >
        <ToggleGroupItem value="smart" className="h-7 px-2 text-[10px]" aria-label="智能范围">
          智能
        </ToggleGroupItem>
        <ToggleGroupItem value="full" className="h-7 px-2 text-[10px]" aria-label="全范围">
          全范围
        </ToggleGroupItem>
        <ToggleGroupItem value="manual" className="h-7 px-2 text-[10px]" aria-label="手动范围">
          手动
        </ToggleGroupItem>
      </ToggleGroup>
      {outliers.length > 0 && (
        <p className="rounded border border-amber-500/30 bg-amber-500/5 px-2 py-1 text-[10px] text-amber-600 dark:text-amber-400">
          检测到 <span className="font-mono">{outliers.join(', ')}</span> 数值跨度极大，已用智能范围裁切。切换到「全范围」可查看完整曲线。
        </p>
      )}
      {outliers.length === 0 && rangeMode === 'smart' && !(showCompareToggle && compareMode === 'facet') && (
        <p className="text-[10px] text-muted-foreground">
          智能模式使用 P5/P95 分位数自动过滤极端值，保持多曲线比例协调。
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Intersections tab                                                 */
/* ------------------------------------------------------------------ */

function IntersectTab({
  plots,
  xRange,
  onOverlaysChange,
}: {
  plots: PlotConfig[];
  xRange: [number, number];
  onOverlaysChange: (o: AdvancedOverlays) => void;
}) {
  const visiblePlots = useMemo(() => plots.filter((p) => p.visible && p.plotType !== 'surface3d'), [plots]);
  const [idx1, setIdx1] = useState(0);
  const [idx2, setIdx2] = useState(1);
  const [enabled, setEnabled] = useState(false);
  const scopeVersion = useScopeVersion();

  const results = useMemo<IntersectionPoint[]>(() => {
    void scopeVersion; // re-compute when a slider / variable changes
    if (!enabled || visiblePlots.length < 2) return [];
    const a = visiblePlots[Math.min(idx1, visiblePlots.length - 1)];
    const b = visiblePlots[Math.min(idx2, visiblePlots.length - 1)];
    if (!a || !b || a.id === b.id) return [];
    return findIntersections(a.expression, b.expression, xRange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, visiblePlots, idx1, idx2, xRange, scopeVersion]);

  useEffect(() => {
    onOverlaysChange({
      intersections: results,
      tangent: null,
      derivativeSamples: [],
      derivativeOrder: 1,
    });
    return () => {
      onOverlaysChange({ intersections: [], tangent: null, derivativeSamples: [], derivativeOrder: 1 });
    };
  }, [results, onOverlaysChange]);

  if (visiblePlots.length < 2) {
    return <p className="py-2 text-[10px] text-muted-foreground">需要至少 2 条可见曲线才能计算交点。</p>;
  }

  return (
    <div className="flex flex-col gap-2 py-1">
      <div className="flex items-center gap-1.5">
        <Button
          size="sm"
          variant={enabled ? 'default' : 'outline'}
          className="h-6 px-2 text-[10px]"
          onClick={() => setEnabled((v) => !v)}
        >
          {enabled ? '关闭交点' : '显示交点'}
        </Button>
        {enabled && (
          <span className="text-[10px] text-muted-foreground">
            找到 {results.length} 个交点
          </span>
        )}
      </div>
      {enabled && (
        <div className="grid grid-cols-2 gap-1.5">
          <CurveSelect label="曲线 A" plots={visiblePlots} value={idx1} onChange={setIdx1} />
          <CurveSelect label="曲线 B" plots={visiblePlots} value={idx2} onChange={setIdx2} />
        </div>
      )}
      {enabled && results.length > 0 && (
        <ScrollArea className="max-h-32 rounded border border-border/40">
          <div className="p-1.5 font-mono text-[10px]">
            {results.map((p, i) => (
              <div key={i} className="flex justify-between py-0.5">
                <span className="text-muted-foreground">[{i + 1}]</span>
                <span className="text-foreground/80">
                  ({p.x.toFixed(4)}, {p.y.toFixed(4)})
                </span>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tangent tab                                                       */
/* ------------------------------------------------------------------ */

function TangentTab({
  plots,
  xRange,
  onOverlaysChange,
}: {
  plots: PlotConfig[];
  xRange: [number, number];
  onOverlaysChange: (o: AdvancedOverlays) => void;
}) {
  const visiblePlots = useMemo(() => plots.filter((p) => p.visible && p.plotType !== 'surface3d'), [plots]);
  const [idx, setIdx] = useState(0);
  const [x0, setX0] = useState(0);
  const [enabled, setEnabled] = useState(false);
  const scopeVersion = useScopeVersion();

  const tangent = useMemo<TangentResult | null>(() => {
    void scopeVersion; // re-compute when a slider / variable changes
    if (!enabled || visiblePlots.length === 0) return null;
    const p = visiblePlots[Math.min(idx, visiblePlots.length - 1)];
    if (!p) return null;
    return tangentLine(p.expression, x0, xRange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, visiblePlots, idx, x0, xRange, scopeVersion]);

  useEffect(() => {
    onOverlaysChange({
      intersections: [],
      tangent,
      derivativeSamples: [],
      derivativeOrder: 1,
    });
    return () => {
      onOverlaysChange({ intersections: [], tangent: null, derivativeSamples: [], derivativeOrder: 1 });
    };
  }, [tangent, onOverlaysChange]);

  if (visiblePlots.length === 0) {
    return <p className="py-2 text-[10px] text-muted-foreground">无可见曲线。</p>;
  }

  return (
    <div className="flex flex-col gap-2 py-1">
      <div className="flex items-center gap-1.5">
        <Button
          size="sm"
          variant={enabled ? 'default' : 'outline'}
          className="h-6 px-2 text-[10px]"
          onClick={() => setEnabled((v) => !v)}
        >
          {enabled ? '关闭切线' : '显示切线'}
        </Button>
      </div>
      {enabled && (
        <>
          <CurveSelect label="曲线" plots={visiblePlots} value={idx} onChange={setIdx} />
          <div className="flex items-center gap-1.5">
            <Label className="text-[10px] text-muted-foreground">x₀ =</Label>
            <Input
              type="number"
              step="any"
              value={x0}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (Number.isFinite(v)) setX0(v);
              }}
              className="h-6 w-20 rounded px-1.5 font-mono text-[11px]"
            />
          </div>
          {tangent && (
            <div className="rounded border border-border/40 bg-muted/20 p-1.5 font-mono text-[10px]">
              <div className="text-muted-foreground">斜率 k = <span className="text-primary">{tangent.slope.toFixed(4)}</span></div>
              <div className="text-muted-foreground">切点 ({tangent.at.x.toFixed(2)}, {tangent.at.y.toFixed(2)})</div>
              <div className="text-foreground/80">y = {tangent.slope.toFixed(3)}·x {tangent.intercept >= 0 ? '+' : '−'} {Math.abs(tangent.intercept).toFixed(3)}</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Derivative tab                                                    */
/* ------------------------------------------------------------------ */

function DerivativeTab({
  plots,
  xRange,
  onOverlaysChange,
}: {
  plots: PlotConfig[];
  xRange: [number, number];
  onOverlaysChange: (o: AdvancedOverlays) => void;
}) {
  const visiblePlots = useMemo(() => plots.filter((p) => p.visible && p.plotType !== 'surface3d'), [plots]);
  const [idx, setIdx] = useState(0);
  const [order, setOrder] = useState<1 | 2 | 3>(1);
  const [enabled, setEnabled] = useState(false);
  const [symbolic, setSymbolic] = useState<{ latex: string; success: boolean } | null>(null);
  const scopeVersion = useScopeVersion();

  const derivSamples = useMemo<PlotSample[]>(() => {
    void scopeVersion; // re-compute when a slider / variable changes
    if (!enabled || visiblePlots.length === 0) return [];
    const p = visiblePlots[Math.min(idx, visiblePlots.length - 1)];
    if (!p) return [];
    return numericDerivative(p.expression, xRange, order);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, visiblePlots, idx, order, xRange, scopeVersion]);

  // Compute symbolic derivative (async, for display only).
  useEffect(() => {
    void scopeVersion; // re-run when the underlying variables change
    if (!enabled || visiblePlots.length === 0) {
      setSymbolic(null);
      return;
    }
    const p = visiblePlots[Math.min(idx, visiblePlots.length - 1)];
    if (!p) return;
    let cancelled = false;
    symbolicDerivative(p.expression, 'x').then((res) => {
      if (!cancelled) setSymbolic({ latex: res.latex, success: res.success });
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, visiblePlots, idx, scopeVersion]);

  useEffect(() => {
    onOverlaysChange({
      intersections: [],
      tangent: null,
      derivativeSamples: derivSamples,
      derivativeOrder: order,
    });
    return () => {
      onOverlaysChange({ intersections: [], tangent: null, derivativeSamples: [], derivativeOrder: 1 });
    };
  }, [derivSamples, order, onOverlaysChange]);

  if (visiblePlots.length === 0) {
    return <p className="py-2 text-[10px] text-muted-foreground">无可见曲线。</p>;
  }

  return (
    <div className="flex flex-col gap-2 py-1">
      <div className="flex items-center gap-1.5">
        <Button
          size="sm"
          variant={enabled ? 'default' : 'outline'}
          className="h-6 px-2 text-[10px]"
          onClick={() => setEnabled((v) => !v)}
        >
          {enabled ? '关闭求导' : '显示导数曲线'}
        </Button>
      </div>
      {enabled && (
        <>
          <CurveSelect label="曲线" plots={visiblePlots} value={idx} onChange={setIdx} />
          <div className="flex items-center gap-1.5">
            <Label className="text-[10px] text-muted-foreground">阶数</Label>
            <ToggleGroup
              type="single"
              value={String(order)}
              onValueChange={(v) => {
                const n = Number(v);
                if (n === 1 || n === 2 || n === 3) setOrder(n as 1 | 2 | 3);
              }}
              className="h-6"
              size="sm"
            >
              <ToggleGroupItem value="1" className="h-6 px-2 text-[10px]">1 阶</ToggleGroupItem>
              <ToggleGroupItem value="2" className="h-6 px-2 text-[10px]">2 阶</ToggleGroupItem>
              <ToggleGroupItem value="3" className="h-6 px-2 text-[10px]">3 阶</ToggleGroupItem>
            </ToggleGroup>
          </div>
          {symbolic?.success && symbolic.latex && (
            <div className="rounded border border-primary/30 bg-primary/5 p-1.5">
              <div className="mb-1 text-[9px] uppercase tracking-wider text-muted-foreground">
                符号求导 d<sup>{order}</sup>/dx<sup>{order}</sup>
              </div>
              <FormulaRenderer latex={symbolic.latex} displayMode className="text-[11px]" />
            </div>
          )}
          {symbolic && !symbolic.success && (
            <p className="text-[10px] text-muted-foreground">符号求导不可用，仅显示数值导数曲线。</p>
          )}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Shared sub-component: curve selector                              */
/* ------------------------------------------------------------------ */

function CurveSelect({
  label,
  plots,
  value,
  onChange,
}: {
  label: string;
  plots: PlotConfig[];
  value: number;
  onChange: (i: number) => void;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <Label className="text-[10px] text-muted-foreground">{label}</Label>
      <select
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10) || 0)}
        className="h-6 rounded border border-border/60 bg-background/40 px-1.5 font-mono text-[10px]"
      >
        {plots.map((p, i) => (
          <option key={p.id} value={i}>
            {p.expression.slice(0, 24)}
          </option>
        ))}
      </select>
    </div>
  );
}
