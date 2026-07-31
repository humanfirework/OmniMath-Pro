'use client';

/**
 * OmniMath Pro — Plot Toolbar
 *
 * Compact (h-8) toolbar above the canvas with:
 *   • Zoom in / out / reset buttons
 *   • X min/max and Y min/max number inputs
 *   • Plot list (color swatch + expression + visibility toggle + remove)
 *   • Export buttons: PNG, Copy LaTeX
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
} from 'lucide-react';
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
}: PlotToolbarProps) {
  const hasPolar = plots.some((p) => p.plotType === 'polar');
  const hasParametric = plots.some((p) => p.plotType === 'parametric');

  return (
    <TooltipProvider delayDuration={250}>
      <div className="flex flex-col gap-1.5 border-b border-border/60 bg-background/60 px-2 py-1.5">
        {/* Top row: action buttons + range inputs + export */}
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Zoom controls */}
          <div className="flex items-center gap-0.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  onClick={onZoomIn}
                  aria-label="放大"
                >
                  <ZoomIn className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">放大</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  onClick={onZoomOut}
                  aria-label="缩小"
                >
                  <ZoomOut className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">缩小</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  onClick={onReset}
                  aria-label="重置视图"
                >
                  <Maximize className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">重置视图（双击画布亦可）</TooltipContent>
            </Tooltip>
          </div>

          <div className="mx-1 h-5 w-px bg-border/60" />

          {/* Range inputs — compact */}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="font-mono">x</span>
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
            <span className="mx-1 font-mono">y</span>
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

          <div className="mx-1 h-5 w-px bg-border/60" />

          {/* Type badges */}
          <div className="flex items-center gap-1">
            {hasPolar && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#a78bfa]/15 px-2 py-0.5 text-[10px] font-medium text-[#a78bfa]">
                <Radar className="h-3 w-3" /> 极坐标
              </span>
            )}
            {hasParametric && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#fb923c]/15 px-2 py-0.5 text-[10px] font-medium text-[#fb923c]">
                <Crosshair className="h-3 w-3" /> 参数方程
              </span>
            )}
          </div>

          {/* Right side: expand + export */}
          <div className="ml-auto flex items-center gap-0.5">
            {onExpand && plots.length > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1.5 text-primary hover:bg-primary/10 hover:text-primary"
                    onClick={onExpand}
                  >
                    <Maximize2 className="h-3.5 w-3.5" />
                    <span className="hidden text-xs sm:inline">放大</span>
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
                  className="h-8 gap-1.5 text-muted-foreground hover:text-foreground"
                  onClick={onExportPNG}
                >
                  <Download className="h-3.5 w-3.5" />
                  <span className="hidden text-xs sm:inline">PNG</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">导出为 PNG 图片</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1.5 text-muted-foreground hover:text-foreground"
                  onClick={onCopyLatex}
                >
                  <Copy className="h-3.5 w-3.5" />
                  <span className="hidden text-xs sm:inline">LaTeX</span>
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
                className="group flex items-center gap-1.5 rounded-md border border-border/60 bg-background/40 px-1.5 py-0.5 transition-theme hover:border-border"
              >
                <span
                  className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: p.color, boxShadow: `0 0 6px ${p.color}80` }}
                />
                <span className="max-w-[200px] truncate font-mono text-xs text-foreground/90">
                  {p.expression}
                </span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => onToggleVisibility(p.id)}
                      className="text-muted-foreground transition-theme hover:text-foreground"
                      aria-label={p.visible ? '隐藏' : '显示'}
                    >
                      {p.visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
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
                      className="text-muted-foreground transition-theme hover:text-rose-400"
                      aria-label="移除"
                    >
                      <X className="h-3 w-3" />
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
      className="h-7 w-20 rounded border-border/60 bg-background/40 px-1.5 font-mono text-xs tabular-nums"
    />
  );
}
