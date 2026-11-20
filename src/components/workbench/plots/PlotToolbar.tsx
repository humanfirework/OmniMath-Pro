'use client';

/**
 * OmniMath Pro — Plot Toolbar
 *
 * Compact floating toolbar above the canvas with:
 *   • Zoom in / out / reset buttons
 *   • X min/max and Y min/max number inputs
 *   • Plot list (color swatch + expression + visibility toggle + remove)
 *   • Export buttons: PNG, Copy LaTeX
 * Solid popover surface (no glass), 12px radius + layered shadow.
 */

import {
  ZoomIn,
  ZoomOut,
  Maximize,
  Maximize2,
  Crosshair,
  Eye,
  EyeOff,
  X,
  Download,
  Copy,
  Radar,
  SlidersHorizontal,
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { PlotConfig } from '@/lib/store/workbench';

export interface PlotToolbarProps {
  plots: PlotConfig[];
  xRange: [number, number];
  yRange: [number, number];
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  onRangeChange: (which: 'x' | 'y', index: 0 | 1, value: number) => void;
  onToggleVisibility: (id: string) => void;
  onRemovePlot: (id: string) => void;
  onExportPNG: () => void;
  onCopyLatex: () => void;
  onExpand?: () => void;
  /** Task 8.E: 当前是否显示画布内图例，用于 Eye/EyeOff 按钮高亮与图标。 */
  showLegend?: boolean;
  /** Task 8.E: 点击图例切换按钮时触发。 */
  onToggleLegend?: () => void;
  /** 当前可见 2D 表达式中的自由参数数量；>0 时在工具栏显示一个可点击的
   *  圆角徽标，点击切换参数滑块面板的展开/折叠。 */
  freeParamCount?: number;
  /** 参数滑块面板是否处于折叠态（用于徽标的高亮/提示文案）。 */
  slidersCollapsed?: boolean;
  /** 点击参数徽标时触发，由 Plot2DPanel 接到 settingsStore。 */
  onToggleSliders?: () => void;
}

export function PlotToolbar({
  plots,
  xRange,
  yRange,
  onZoomIn,
  onZoomOut,
  onReset,
  onRangeChange,
  onToggleVisibility,
  onRemovePlot,
  onExportPNG,
  onCopyLatex,
  onExpand,
  showLegend = true,
  onToggleLegend,
  freeParamCount = 0,
  slidersCollapsed = false,
  onToggleSliders,
}: PlotToolbarProps) {
  const hasPolar = plots.some((p) => p.plotType === 'polar');
  const hasParametric = plots.some((p) => p.plotType === 'parametric');

  return (
    <TooltipProvider delayDuration={250}>
      {/* 浮动工具条：实色 popover + 1px 边框 + 分层阴影，12px 圆角 */}
      <div className="m-2 flex shrink-0 flex-col gap-1.5 rounded-[12px] border border-border bg-popover px-2 py-1.5 shadow-[var(--shadow-float)]">
        {/* Top row: action buttons + range inputs + export */}
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Zoom controls */}
          <div className="flex items-center gap-0.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="motion-press h-7 w-7 text-muted-foreground hover:text-foreground"
                  onClick={onZoomIn}
                  aria-label="放大"
                >
                  <ZoomIn className="h-4 w-4" strokeWidth={1.75} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">放大</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="motion-press h-7 w-7 text-muted-foreground hover:text-foreground"
                  onClick={onZoomOut}
                  aria-label="缩小"
                >
                  <ZoomOut className="h-4 w-4" strokeWidth={1.75} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">缩小</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="motion-press h-7 w-7 text-muted-foreground hover:text-foreground"
                  onClick={onReset}
                  aria-label="重置视图"
                >
                  <Maximize className="h-4 w-4" strokeWidth={1.75} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">重置视图（双击画布亦可）</TooltipContent>
            </Tooltip>
          </div>

          <div className="mx-0.5 h-4 w-px bg-border" />

          {/* Range inputs — compact */}
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="font-mono text-primary">x</span>
            <CompactNumberInput
              value={xRange[0]}
              onChange={(v) => onRangeChange('x', 0, v)}
              ariaLabel="x min"
            />
            <span className="text-muted-foreground/60">,</span>
            <CompactNumberInput
              value={xRange[1]}
              onChange={(v) => onRangeChange('x', 1, v)}
              ariaLabel="x max"
            />
            <span className="mx-1 font-mono text-primary">y</span>
            <CompactNumberInput
              value={yRange[0]}
              onChange={(v) => onRangeChange('y', 0, v)}
              ariaLabel="y min"
            />
            <span className="text-muted-foreground/60">,</span>
            <CompactNumberInput
              value={yRange[1]}
              onChange={(v) => onRangeChange('y', 1, v)}
              ariaLabel="y max"
            />
          </div>

          <div className="mx-0.5 h-4 w-px bg-border" />

          {/* Type badges */}
          <div className="flex items-center gap-1">
            {hasPolar && (
              <span
                className="inline-flex items-center gap-1 rounded-[5px] px-1.5 py-0.5 text-[10px] font-medium"
                style={{
                  color: 'var(--viz-3)',
                  backgroundColor: 'color-mix(in oklab, var(--viz-3) 14%, transparent)',
                }}
              >
                <Radar className="h-3 w-3" strokeWidth={1.75} /> 极坐标
              </span>
            )}
            {hasParametric && (
              <span
                className="inline-flex items-center gap-1 rounded-[5px] px-1.5 py-0.5 text-[10px] font-medium"
                style={{
                  color: 'var(--viz-2)',
                  backgroundColor: 'color-mix(in oklab, var(--viz-2) 14%, transparent)',
                }}
              >
                <Crosshair className="h-3 w-3" strokeWidth={1.75} /> 参数方程
              </span>
            )}
            {/* 自由参数徽标：仅当存在自由参数时出现，点击切换参数滑块面板的
                展开/折叠（状态持久化在 settingsStore）。 */}
            <AnimatePresence initial={false}>
              {freeParamCount > 0 && (
                <motion.button
                  key="param-badge"
                  type="button"
                  onClick={onToggleSliders}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15, ease: [0.2, 0.8, 0.2, 1] }}
                  className={
                    'motion-press inline-flex items-center gap-1 rounded-[5px] px-1.5 py-0.5 text-[10px] font-medium transition-colors ' +
                    (slidersCollapsed
                      ? 'bg-muted text-muted-foreground hover:bg-accent hover:text-foreground'
                      : 'bg-primary/10 text-primary hover:bg-primary/20')
                  }
                  aria-label={
                    slidersCollapsed ? '展开参数滑块' : '折叠参数滑块'
                  }
                  aria-expanded={!slidersCollapsed}
                >
                  <SlidersHorizontal className="h-3 w-3" strokeWidth={1.75} />
                  <span>参数</span>
                  <span className="rounded-[3px] bg-background/70 px-1 font-mono tabular-nums">
                    {freeParamCount}
                  </span>
                </motion.button>
              )}
            </AnimatePresence>
          </div>

          {/* Right side: legend toggle + expand + export */}
          <div className="ml-auto flex items-center gap-0.5">
            {/* Task 8.E: In-canvas legend Eye/EyeOff toggle */}
            {plots.length > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={
                      'motion-press h-7 w-7 transition-colors ' +
                      (showLegend
                        ? 'text-primary hover:bg-primary/10 hover:text-primary'
                        : 'text-muted-foreground hover:text-foreground')
                    }
                    onClick={onToggleLegend}
                    aria-label={showLegend ? '隐藏画布内图例' : '显示画布内图例'}
                    aria-pressed={showLegend}
                  >
                    {showLegend ? <Eye className="h-4 w-4" strokeWidth={1.75} /> : <EyeOff className="h-4 w-4" strokeWidth={1.75} />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {showLegend ? '隐藏画布内图例' : '显示画布内图例'}
                </TooltipContent>
              </Tooltip>
            )}
            {onExpand && plots.length > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="motion-press h-7 gap-1.5 text-primary hover:bg-primary/10 hover:text-primary"
                    onClick={onExpand}
                  >
                    <Maximize2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                    <span className="hidden text-[11px] sm:inline">放大</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">放大查看（弹出大图面板）</TooltipContent>
              </Tooltip>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="motion-press h-7 gap-1.5 text-muted-foreground hover:text-foreground"
                  onClick={onExportPNG}
                >
                  <Download className="h-3.5 w-3.5" strokeWidth={1.75} />
                  <span className="hidden text-[11px] sm:inline">PNG</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">导出为 PNG 图片</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="motion-press h-7 gap-1.5 text-muted-foreground hover:text-foreground"
                  onClick={onCopyLatex}
                >
                  <Copy className="h-3.5 w-3.5" strokeWidth={1.75} />
                  <span className="hidden text-[11px] sm:inline">LaTeX</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">复制 LaTeX 表达式</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Plot list */}
        {plots.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            {plots.map((p) => (
              <div
                key={p.id}
                className="group flex items-center gap-1.5 rounded-[7px] border border-border bg-card px-1.5 py-1 transition-colors hover:border-primary/30"
              >
                <span
                  className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: p.color }}
                />
                <span className="max-w-[200px] truncate font-mono text-[11px] text-foreground/90">
                  {p.expression}
                </span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => onToggleVisibility(p.id)}
                      className="text-muted-foreground transition-colors hover:text-foreground"
                      aria-label={p.visible ? '隐藏' : '显示'}
                    >
                      {p.visible ? <Eye className="h-3 w-3" strokeWidth={1.75} /> : <EyeOff className="h-3 w-3" strokeWidth={1.75} />}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    {p.visible ? '隐藏该曲线' : '显示该曲线'}
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => onRemovePlot(p.id)}
                      className="text-muted-foreground transition-colors hover:text-destructive"
                      aria-label="移除"
                    >
                      <X className="h-3 w-3" strokeWidth={1.75} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">移除该曲线</TooltipContent>
                </Tooltip>
              </div>
            ))}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}

/* ----------------------- Compact number input --------------------- */

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
      value={Number.isFinite(value) ? value : 0}
      onChange={(e) => {
        const v = parseFloat(e.target.value);
        if (Number.isFinite(v)) onChange(v);
      }}
      className="h-6 w-20 rounded-[4px] border-border bg-muted/50 px-1.5 font-mono text-[11px] tabular-nums focus-visible:border-primary/60"
    />
  );
}
