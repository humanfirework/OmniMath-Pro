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
        'grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors',
        'hover:bg-accent/70 hover:text-foreground disabled:pointer-events-none disabled:opacity-35',
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
      <div className="pointer-events-auto flex items-center gap-0.5 rounded-2xl border border-border/70 bg-background/95 px-1.5 py-1 shadow-xl backdrop-blur">
        <ActionButton label="缩小" onClick={onZoomOut}>
          <ZoomOut className="size-4" />
        </ActionButton>
        <button
          type="button"
          onClick={onResetZoom}
          title="重置为 100%"
          className="h-8 min-w-[52px] rounded-lg px-1 text-[11px] font-medium tabular-nums text-muted-foreground hover:bg-accent/70 hover:text-foreground"
        >
          {zoomPercent}%
        </button>
        <ActionButton label="放大" onClick={onZoomIn}>
          <ZoomIn className="size-4" />
        </ActionButton>

        <span className="mx-0.5 h-5 w-px bg-border/70" />

        <ActionButton label="撤销" onClick={onUndo} disabled={!canUndo}>
          <Undo2 className="size-4" />
        </ActionButton>
        <ActionButton label="重做" onClick={onRedo} disabled={!canRedo}>
          <Redo2 className="size-4" />
        </ActionButton>

        <span className="mx-0.5 h-5 w-px bg-border/70" />

        <button
          type="button"
          onClick={onExport}
          disabled={exportDisabled}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-medium text-primary transition-colors hover:bg-primary/10 disabled:pointer-events-none disabled:opacity-35"
        >
          <Download className="size-3.5" />
          导出
        </button>
      </div>
    </div>
  );
}
