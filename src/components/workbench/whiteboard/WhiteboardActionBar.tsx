'use client';

/**
 * 白板底部浮动操作条：缩放、撤销、重做、导出。
 * 参考绘图工具/手写板：画布底部居中，不占布局高度。
 */

import { type ReactNode } from 'react';
import { Download, Redo2, Undo2, ZoomIn, ZoomOut } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface WhiteboardActionBarProps {
  zoomPercent: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onExport: () => void;
  exportDisabled?: boolean;
}

function ActionButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'motion-press grid size-8 place-items-center rounded-full text-muted-foreground transition-colors',
        'hover:bg-accent/60 hover:text-foreground disabled:pointer-events-none disabled:opacity-35',
      )}
    >
      {children}
    </button>
  );
}

export function WhiteboardActionBar({
  zoomPercent,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onExport,
  exportDisabled,
}: WhiteboardActionBarProps) {
  return (
    <div className="pointer-events-none absolute bottom-3 left-1/2 z-30 -translate-x-1/2">
      <div className="pointer-events-auto flex items-center gap-0.5 rounded-full border border-border bg-popover px-1.5 py-0.5 shadow-[var(--shadow-float)]">
        <ActionButton label="缩小" onClick={onZoomOut}>
          <ZoomOut className="size-4" strokeWidth={1.75} />
        </ActionButton>
        <button
          type="button"
          onClick={onResetZoom}
          title="重置为 100%"
          className="h-8 min-w-[44px] rounded-full px-1 text-[11px] font-medium tabular-nums text-muted-foreground hover:bg-accent/60 hover:text-foreground sm:min-w-[52px]"
        >
          {zoomPercent}%
        </button>
        <ActionButton label="放大" onClick={onZoomIn}>
          <ZoomIn className="size-4" strokeWidth={1.75} />
        </ActionButton>

        <span className="mx-0.5 h-5 w-px bg-border" />

        <ActionButton label="撤销" onClick={onUndo} disabled={!canUndo}>
          <Undo2 className="size-4" strokeWidth={1.75} />
        </ActionButton>
        <ActionButton label="重做" onClick={onRedo} disabled={!canRedo}>
          <Redo2 className="size-4" strokeWidth={1.75} />
        </ActionButton>

        <span className="mx-0.5 h-5 w-px bg-border" />

        <button
          type="button"
          onClick={onExport}
          disabled={exportDisabled}
          aria-label="导出白板为 PNG"
          title="导出白板为 PNG"
          className="motion-press inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground disabled:pointer-events-none disabled:opacity-35"
        >
          <Download className="size-4" strokeWidth={1.75} />
          <span className="hidden sm:inline">导出</span>
        </button>
      </div>
    </div>
  );
}
