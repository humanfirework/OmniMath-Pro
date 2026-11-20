'use client';

/**
 * OmniMath Pro — 通用视图控制按钮组
 *
 * 浮动在画布/预览区右下角的缩放控制按钮：
 *   [放大] [缩小] [重置] [居中（可选）]
 *
 * 用于 Plot2DPanel、NodePipeline 等需要视图缩放的场景。
 * 按钮通过 Tooltip 显示提示，支持紧凑模式。
 */

import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Crosshair,
  type LucideIcon,
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface ViewControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  onCenter?: () => void;
  /** 当前缩放比例（百分比，用于 tooltip 显示） */
  scalePercent?: number;
  /** 紧凑模式（更小的按钮） */
  compact?: boolean;
  /** 额外样式类 */
  className?: string;
}

interface CtrlButtonProps {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  compact?: boolean;
}

function CtrlButton({ icon: Icon, label, onClick, compact }: CtrlButtonProps) {
  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          aria-label={label}
          className={cn(
            'grid place-items-center rounded-md border border-border/60 bg-background/80 text-muted-foreground backdrop-blur-sm transition-theme hover:text-foreground hover:border-primary/40 hover:bg-accent/40',
            compact ? 'size-6' : 'size-7',
          )}
        >
          <Icon className={compact ? 'size-3' : 'size-3.5'} strokeWidth={2} />
        </button>
      </TooltipTrigger>
      <TooltipContent side="left">{label}</TooltipContent>
    </Tooltip>
  );
}

export function ViewControls({
  onZoomIn,
  onZoomOut,
  onReset,
  onCenter,
  scalePercent,
  compact,
  className,
}: ViewControlsProps) {
  return (
    <div
      className={cn(
        'absolute bottom-2 right-2 z-10 flex flex-col gap-1',
        className,
      )}
    >
      <CtrlButton
        icon={ZoomIn}
        label={scalePercent ? `放大 (当前 ${scalePercent}%)` : '放大'}
        onClick={onZoomIn}
        compact={compact}
      />
      <CtrlButton
        icon={ZoomOut}
        label="缩小"
        onClick={onZoomOut}
        compact={compact}
      />
      {onCenter && (
        <CtrlButton
          icon={Crosshair}
          label="居中"
          onClick={onCenter}
          compact={compact}
        />
      )}
      <CtrlButton
        icon={Maximize2}
        label="重置视图"
        onClick={onReset}
        compact={compact}
      />
    </div>
  );
}
