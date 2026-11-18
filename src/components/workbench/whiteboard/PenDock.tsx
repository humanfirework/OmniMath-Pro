'use client';

/**
 * 浮动笔工具栏（平板/手机/触屏）。
 */

import { useState, type ReactNode } from 'react';
import {
  Circle,
  Crosshair,
  Download,
  Eraser,
  Grid2x2,
  Lasso,
  Minus,
  MousePointer2,
  Pencil,
  Redo2,
  Shapes,
  Square,
  Trash2,
  Triangle,
  Undo2,
  X,
} from 'lucide-react';
import {
  PEN_COLORS as COLORS,
  PEN_ERASER_SIZES as ERASER_SIZES,
  PEN_WIDTHS as WIDTHS,
} from '@/lib/ink/presets';
import type { InkShapeId, InkTool } from '@/lib/ink/types';
import { cn } from '@/lib/utils';

const SHAPES: Array<{ id: InkShapeId; icon: typeof Minus; label: string }> = [
  { id: 'line', icon: Minus, label: '直线' },
  { id: 'rect', icon: Square, label: '矩形' },
  { id: 'triangle', icon: Triangle, label: '三角' },
  { id: 'circle', icon: Circle, label: '圆' },
  { id: 'axes', icon: Crosshair, label: '坐标' },
];

export interface PenDockProps {
  tool: InkTool;
  onTool: (tool: InkTool) => void;
  color: string;
  onColor: (color: string) => void;
  width: number;
  onWidth: (width: number) => void;
  eraserSize: number;
  onEraserSize: (size: number) => void;
  shapeTool: InkShapeId | null;
  onShapeTool: (shape: InkShapeId | null) => void;
  pixelMode: boolean;
  onPixelMode: (value: boolean) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onClear: () => void;
  onExport: () => void;
}

function DockButton({
  active,
  disabled,
  label,
  onClick,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'grid size-10 place-items-center rounded-xl transition-colors',
        active
          ? 'bg-accent text-foreground'
          : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
        disabled && 'opacity-35',
      )}
    >
      {children}
    </button>
  );
}

export function PenDock(props: PenDockProps) {
  const [panelOpen, setPanelOpen] = useState(false);

  const applyTool = (tool: InkTool) => {
    props.onTool(tool);
    if (tool !== 'pen') props.onShapeTool(null);
  };

  return (
    <div
      data-pen-dock=""
      className="pointer-events-none absolute inset-x-0 bottom-3 z-30 flex flex-col items-center gap-2 px-2"
    >
      {panelOpen && (
        <div className="pointer-events-auto w-[min(92vw,360px)] rounded-2xl border border-border/70 bg-background p-3 shadow-2xl">
          <div className="flex items-center justify-between">
            <span className="text-2xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
              笔刷设置
            </span>
            <button
              type="button"
              aria-label="关闭笔刷设置"
              onClick={() => setPanelOpen(false)}
              className="grid size-7 place-items-center rounded-lg text-muted-foreground hover:bg-accent/60 hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          </div>

          <div className="mt-2 text-2xs text-muted-foreground">颜色</div>
          <div className="mt-1 flex flex-wrap gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`颜色 ${c}`}
                onClick={() => props.onColor(c)}
                className={cn(
                  'size-8 rounded-full border transition-transform',
                  props.color === c
                    ? 'scale-110 border-foreground/40 ring-2 ring-foreground/20'
                    : 'border-border/60',
                )}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>

          <div className="mt-3 flex items-center justify-between">
            <span className="text-2xs text-muted-foreground">
              {props.tool === 'eraser' ? '橡皮尺寸' : '笔宽'}
            </span>
            <div className="flex items-center gap-1">
              {(props.tool === 'eraser' ? ERASER_SIZES : WIDTHS).map((size) => {
                const active = props.tool === 'eraser' ? props.eraserSize === size : props.width === size;
                return (
                  <button
                    key={size}
                    type="button"
                    aria-label={`尺寸 ${size}`}
                    onClick={() =>
                      props.tool === 'eraser' ? props.onEraserSize(size) : props.onWidth(size)
                    }
                    className={cn(
                      'grid size-8 place-items-center rounded-lg border transition-colors',
                      active
                        ? 'border-foreground/30 bg-accent text-foreground'
                        : 'border-border/60 text-muted-foreground hover:bg-accent/60',
                    )}
                  >
                    <span
                      className="rounded-full bg-foreground"
                      style={{
                        width: Math.min(18, Math.max(4, size * 0.45)),
                        height: Math.min(18, Math.max(4, size * 0.45)),
                      }}
                    />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-3 text-2xs text-muted-foreground">图形</div>
          <div className="mt-1 flex flex-wrap gap-1">
            {SHAPES.map(({ id, icon: Icon, label }) => (
              <button
                key={id}
                type="button"
                aria-label={`图形 ${label}`}
                onClick={() => props.onShapeTool(props.shapeTool === id ? null : id)}
                className={cn(
                  'grid size-9 place-items-center rounded-lg transition-colors',
                  props.shapeTool === id
                    ? 'bg-accent text-foreground'
                    : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                )}
              >
                <Icon className="size-4" />
              </button>
            ))}
          </div>

          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => props.onPixelMode(!props.pixelMode)}
              className={cn(
                'inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg border text-2xs transition-colors',
                props.pixelMode
                  ? 'border-foreground/30 bg-accent text-foreground'
                  : 'border-border/60 text-muted-foreground hover:bg-accent/60',
              )}
            >
              <Grid2x2 className="size-3.5" />
              像素画
            </button>
            <button
              type="button"
              onClick={props.onClear}
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-border/60 px-2 text-2xs text-muted-foreground hover:bg-accent/60 hover:text-foreground"
            >
              <Trash2 className="size-3.5" />
              清空
            </button>
            <button
              type="button"
              onClick={props.onExport}
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-border/60 px-2 text-2xs text-muted-foreground hover:bg-accent/60 hover:text-foreground"
            >
              <Download className="size-3.5" />
              PNG
            </button>
          </div>
        </div>
      )}

      <div className="pointer-events-auto flex items-center gap-0.5 rounded-2xl border border-border/70 bg-background p-1.5 shadow-xl">
        <DockButton label="撤销" disabled={!props.canUndo} onClick={props.onUndo}>
          <Undo2 className="size-4" />
        </DockButton>
        <DockButton label="重做" disabled={!props.canRedo} onClick={props.onRedo}>
          <Redo2 className="size-4" />
        </DockButton>
        <span className="mx-0.5 h-6 w-px bg-border/60" />
        <DockButton label="笔" active={props.tool === 'pen' && !props.shapeTool} onClick={() => applyTool('pen')}>
          <Pencil className="size-4" />
        </DockButton>
        <DockButton label="橡皮" active={props.tool === 'eraser' && !props.shapeTool} onClick={() => applyTool('eraser')}>
          <Eraser className="size-4" />
        </DockButton>
        <DockButton label="套圈" active={props.tool === 'lasso'} onClick={() => applyTool('lasso')}>
          <Lasso className="size-4" />
        </DockButton>
        <DockButton label="选择" active={props.tool === 'select'} onClick={() => applyTool('select')}>
          <MousePointer2 className="size-4" />
        </DockButton>
        <span className="mx-0.5 h-6 w-px bg-border/60" />
        <button
          type="button"
          aria-label="颜色与笔刷"
          onClick={() => setPanelOpen((v) => !v)}
          className={cn(
            'grid size-10 place-items-center rounded-xl transition-colors',
            panelOpen ? 'bg-accent' : 'hover:bg-accent/60',
          )}
        >
          <span className="relative grid size-6 place-items-center rounded-full border border-border/60">
            <span className="size-4 rounded-full" style={{ backgroundColor: props.color }} />
            <Shapes className="absolute -bottom-1 -right-1 size-3 rounded bg-background p-px text-muted-foreground" />
          </span>
        </button>
      </div>
    </div>
  );
}
