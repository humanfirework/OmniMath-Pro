'use client';

/**
 * 白板左侧浮动工具坞（桌面 / 平板横向空间充足时使用）。
 *
 * 参考手写板 / 绘图工具的交互：画布本身占满，工具收进一条竖向浮动坞；
 * 颜色、笔宽、橡皮、形状、背景放在右侧 flyout 里，不再占用一条顶部工具栏。
 */

import { useState, type ReactNode } from 'react';
import {
  CircleDot,
  Eraser,
  Grid2x2,
  Lasso,
  MoreHorizontal,
  MousePointer2,
  Pencil,
  Shapes,
  Sigma,
  Square,
  SquareDashed,
  Timer,
  Trash2,
  X,
} from 'lucide-react';
import {
  PEN_COLORS as COLORS,
  PEN_ERASER_SIZES as ERASER_SIZES,
  PEN_WIDTHS as WIDTHS,
} from '@/lib/ink/presets';
import type { InkBrush, InkShapeId, InkTool } from '@/lib/ink/types';
import type { InkStabilizer } from '@/lib/ink/stabilizer';
import type { EraserMode } from '@/lib/ink/eraser';
import { BRUSHES, SHAPES } from './PenDock';
import { cn } from '@/lib/utils';

type Background = 'dot' | 'grid' | 'ruled' | 'blank';

export interface WhiteboardToolDockProps {
  tool: InkTool;
  onTool: (tool: InkTool) => void;
  brush: InkBrush;
  onBrush: (brush: InkBrush) => void;
  eraserMode: EraserMode;
  onEraserMode: (mode: EraserMode) => void;
  color: string;
  onColor: (color: string) => void;
  width: number;
  onWidth: (width: number) => void;
  eraserSize: number;
  onEraserSize: (size: number) => void;
  shapeTool: InkShapeId | null;
  onShapeTool: (id: InkShapeId | null) => void;
  pixelMode: boolean;
  onPixelMode: (v: boolean) => void;
  stabilizer: InkStabilizer;
  onStabilizer: (v: InkStabilizer) => void;
  background: Background;
  onBackground: (b: Background) => void;
  mathMode: boolean;
  onToggleMath: () => void;
  latencyProbe: boolean;
  onLatencyProbe: () => void;
  onClear: () => void;
}

const BACKGROUNDS: Array<{ id: Background; label: string; icon: typeof CircleDot }> = [
  { id: 'dot', label: '点阵', icon: CircleDot },
  { id: 'grid', label: '网格', icon: Grid2x2 },
  { id: 'ruled', label: '横线', icon: SquareDashed },
  { id: 'blank', label: '空白', icon: Square },
];

const STABILIZERS: Array<{ id: InkStabilizer; label: string }> = [
  { id: 'off', label: '关闭' },
  { id: 'soft', label: '轻' },
  { id: 'strong', label: '强' },
];

type Panel = 'pen' | 'eraser' | 'shape' | 'color' | 'more' | null;

function DockButton({
  active,
  label,
  onClick,
  children,
}: {
  active?: boolean;
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        'grid size-10 place-items-center rounded-xl transition-colors',
        active
          ? 'bg-primary/15 text-primary'
          : 'text-muted-foreground hover:bg-accent/70 hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

export function WhiteboardToolDock(props: WhiteboardToolDockProps) {
  const [panel, setPanel] = useState<Panel>(null);
  const toggle = (next: Exclude<Panel, null>) => setPanel((p) => (p === next ? null : next));

  const applyTool = (tool: InkTool) => {
    props.onTool(tool);
    if (tool !== 'pen') props.onShapeTool(null);
    setPanel(null);
  };

  return (
    <div className="pointer-events-none absolute left-3 top-1/2 z-30 -translate-y-1/2">
      <div className="pointer-events-auto flex flex-col items-center gap-0.5 rounded-2xl border border-border/70 bg-background/95 p-1.5 shadow-xl backdrop-blur">
        <DockButton label="选择" active={props.tool === 'select'} onClick={() => applyTool('select')}>
          <MousePointer2 className="size-4" />
        </DockButton>
        <DockButton label="套圈" active={props.tool === 'lasso'} onClick={() => applyTool('lasso')}>
          <Lasso className="size-4" />
        </DockButton>
        <DockButton
          label="钢笔"
          active={props.tool === 'pen' && !props.shapeTool}
          onClick={() => {
            applyTool('pen');
            toggle('pen');
          }}
        >
          <Pencil className="size-4" />
        </DockButton>
        <DockButton
          label="橡皮"
          active={props.tool === 'eraser' && !props.shapeTool}
          onClick={() => {
            applyTool('eraser');
            toggle('eraser');
          }}
        >
          <Eraser className="size-4" />
        </DockButton>
        <DockButton
          label="形状"
          active={!!props.shapeTool}
          onClick={() => {
            props.onTool('pen');
            toggle('shape');
          }}
        >
          <Shapes className="size-4" />
        </DockButton>

        <span className="my-0.5 h-px w-6 bg-border/70" />

        <DockButton label="颜色与笔刷" onClick={() => toggle('color')}>
          <span className="relative grid size-6 place-items-center rounded-full border border-border/70">
            <span className="size-4 rounded-full" style={{ backgroundColor: props.color }} />
          </span>
        </DockButton>
        <DockButton
          label="数学模式"
          active={props.mathMode}
          onClick={() => {
            props.onToggleMath();
            setPanel(null);
          }}
        >
          <Sigma className="size-4" />
        </DockButton>
        <DockButton label="更多" active={panel === 'more'} onClick={() => toggle('more')}>
          <MoreHorizontal className="size-4" />
        </DockButton>
      </div>

      {panel && (
        <div className="pointer-events-auto absolute left-full top-1/2 ml-2 max-h-[min(78vh,560px)] w-[270px] -translate-y-1/2 overflow-y-auto rounded-2xl border border-border/70 bg-background p-3 shadow-2xl">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              {panel === 'pen'
                ? '笔刷'
                : panel === 'eraser'
                  ? '橡皮'
                  : panel === 'shape'
                    ? '形状'
                    : panel === 'color'
                      ? '颜色'
                      : '画布'}
            </span>
            <button
              type="button"
              aria-label="关闭设置"
              onClick={() => setPanel(null)}
              className="grid size-6 place-items-center rounded-lg text-muted-foreground hover:bg-accent/60 hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          </div>

          {(panel === 'pen' || panel === 'color') && (
            <>
              <div className="mt-2 text-[10px] text-muted-foreground">颜色</div>
              <div className="mt-1 flex flex-wrap gap-2">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`颜色 ${c}`}
                    onClick={() => props.onColor(c)}
                    className={cn(
                      'size-7 rounded-full border transition-transform',
                      props.color === c
                        ? 'scale-110 border-foreground/40 ring-2 ring-foreground/20'
                        : 'border-border/60',
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>

              <div className="mt-3 flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">笔刷</span>
                <div className="flex items-center gap-1">
                  {BRUSHES.map(({ id, icon: Icon, label }) => (
                    <button
                      key={id}
                      type="button"
                      aria-label={label}
                      title={label}
                      onClick={() => props.onBrush(id)}
                      className={cn(
                        'grid size-7 place-items-center rounded-lg border transition-colors',
                        props.tool === 'pen' && props.brush === id
                          ? 'border-primary/40 bg-primary/10 text-primary'
                          : 'border-border/60 text-muted-foreground hover:bg-accent/60',
                      )}
                    >
                      <Icon className="size-3.5" />
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">笔宽</span>
                <div className="flex items-center gap-1">
                  {WIDTHS.map((size) => (
                    <button
                      key={size}
                      type="button"
                      aria-label={`笔宽 ${size}`}
                      onClick={() => props.onWidth(size)}
                      className={cn(
                        'grid size-7 place-items-center rounded-lg border transition-colors',
                        props.width === size
                          ? 'border-primary/40 bg-primary/10 text-primary'
                          : 'border-border/60 text-muted-foreground hover:bg-accent/60',
                      )}
                    >
                      <span
                        className="rounded-full bg-current"
                        style={{ width: Math.min(16, size + 2), height: Math.min(16, size + 2) }}
                      />
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">手感</span>
                <div className="flex items-center gap-0.5 rounded-lg border border-border/60 p-0.5">
                  {STABILIZERS.map(({ id, label }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => props.onStabilizer(id)}
                      className={cn(
                        'h-6 rounded px-2 text-[10px] transition-colors',
                        props.stabilizer === id
                          ? 'bg-primary/15 text-primary'
                          : 'text-muted-foreground hover:bg-accent/60',
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {panel === 'eraser' && (
            <>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">模式</span>
                <div className="flex items-center gap-0.5 rounded-lg border border-border/60 p-0.5">
                  {(
                    [
                      ['partial', '点擦'],
                      ['stroke', '划擦'],
                    ] as Array<[EraserMode, string]>
                  ).map(([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => props.onEraserMode(mode)}
                      className={cn(
                        'h-6 rounded px-2 text-[10px] transition-colors',
                        props.eraserMode === mode
                          ? 'bg-primary/15 text-primary'
                          : 'text-muted-foreground hover:bg-accent/60',
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">尺寸</span>
                <div className="flex items-center gap-1">
                  {ERASER_SIZES.map((size) => (
                    <button
                      key={size}
                      type="button"
                      aria-label={`橡皮 ${size}`}
                      onClick={() => props.onEraserSize(size)}
                      className={cn(
                        'grid size-8 place-items-center rounded-lg border transition-colors',
                        props.eraserSize === size
                          ? 'border-primary/40 bg-primary/10 text-primary'
                          : 'border-border/60 text-muted-foreground hover:bg-accent/60',
                      )}
                    >
                      <span
                        className="rounded-full bg-current"
                        style={{ width: Math.min(18, size * 0.45), height: Math.min(18, size * 0.45) }}
                      />
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {panel === 'shape' && (
            <div className="mt-2 grid grid-cols-5 gap-1">
              {SHAPES.map(({ id, icon: Icon, label }) => (
                <button
                  key={id}
                  type="button"
                  aria-label={label}
                  title={label}
                  onClick={() => {
                    props.onShapeTool(props.shapeTool === id ? null : id);
                    setPanel(null);
                  }}
                  className={cn(
                    'grid h-10 place-items-center rounded-lg transition-colors',
                    props.shapeTool === id
                      ? 'bg-primary/15 text-primary'
                      : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                  )}
                >
                  <Icon className="size-4" />
                </button>
              ))}
            </div>
          )}

          {panel === 'more' && (
            <div className="mt-2 space-y-1">
              <div className="text-[10px] text-muted-foreground">背景</div>
              <div className="grid grid-cols-2 gap-1">
                {BACKGROUNDS.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => props.onBackground(id)}
                    className={cn(
                      'flex h-8 items-center gap-1.5 rounded-lg px-2 text-[10.5px] transition-colors',
                      props.background === id
                        ? 'bg-primary/15 text-primary'
                        : 'text-muted-foreground hover:bg-accent/60',
                    )}
                  >
                    <Icon className="size-3.5" />
                    {label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => props.onPixelMode(!props.pixelMode)}
                className={cn(
                  'mt-1 flex h-8 w-full items-center gap-2 rounded-lg px-2 text-[10.5px] transition-colors',
                  props.pixelMode
                    ? 'bg-primary/15 text-primary'
                    : 'text-muted-foreground hover:bg-accent/60',
                )}
              >
                <Grid2x2 className="size-3.5" />
                像素画
              </button>
              <button
                type="button"
                onClick={props.onLatencyProbe}
                className={cn(
                  'flex h-8 w-full items-center gap-2 rounded-lg px-2 text-[10.5px] transition-colors',
                  props.latencyProbe
                    ? 'bg-primary/15 text-primary'
                    : 'text-muted-foreground hover:bg-accent/60',
                )}
              >
                <Timer className="size-3.5" />
                笔迹延迟测试
              </button>
              <button
                type="button"
                onClick={() => {
                  props.onClear();
                  setPanel(null);
                }}
                className="flex h-8 w-full items-center gap-2 rounded-lg px-2 text-[10.5px] text-rose-500 transition-colors hover:bg-rose-500/10"
              >
                <Trash2 className="size-3.5" />
                清空画布
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
