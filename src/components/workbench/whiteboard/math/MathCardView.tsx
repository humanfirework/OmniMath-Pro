'use client';

/**
 * Math card — a *vector* object pinned on the whiteboard.
 *
 * The graph is not a screenshot: the card keeps the expression and samples,
 * and zooming re-samples the function. The result text replays the user's own
 * handwriting glyphs where possible (Apple Math Notes style).
 */

import { useEffect, useRef } from 'react';
import { GripHorizontal, X } from 'lucide-react';
import type { RecognizedGlyph } from '@/lib/mathnotes/recognize';
import type { PlotSample } from '@/lib/mathnotes/expression';
import { sampleExpression } from '@/lib/mathnotes/expression';
import { panRange, zoomRangeAt } from '@/lib/plots/plotRange';
import { FormulaRenderer } from '@/components/workbench/FormulaRenderer';
import { HandwritingText } from './HandwritingText';
import { cn } from '@/lib/utils';
import type { InkView } from '@/lib/ink/types';

export interface MathCard {
  id: string;
  /** World-space top-left corner. */
  x: number;
  y: number;
  kind: 'number' | 'plot';
  /** Normalized expression used for evaluation. */
  expression: string;
  /** Human-readable source expression. */
  display: string;
  latex: string;
  valueText?: string;
  range: [number, number];
  samples?: PlotSample[];
  glyphs?: RecognizedGlyph[];
  createdAt: number;
}

export interface MathCardViewProps {
  card: MathCard;
  view: InkView;
  onChange: (card: MathCard) => void;
  onDelete: (id: string) => void;
}

export function MathCardView({ card, view, onChange, onDelete }: MathCardViewProps) {
  const dragRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startX: number;
    startY: number;
  } | null>(null);

  const sx = card.x * view.k + view.x;
  const sy = card.y * view.k + view.y;

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startX: card.x,
      startY: card.y,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    e.stopPropagation();
    const dx = (e.clientX - drag.startClientX) / Math.max(0.05, view.k);
    const dy = (e.clientY - drag.startClientY) / Math.max(0.05, view.k);
    onChange({ ...card, x: drag.startX + dx, y: drag.startY + dy });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== e.pointerId) return;
    e.stopPropagation();
    dragRef.current = null;
  };

  return (
    <div
      className={cn(
        'absolute z-20 select-none rounded-lg border border-border bg-popover shadow-lg',
        'max-w-[min(86vw,280px)]',
      )}
      style={{ left: 0, top: 0, transform: `translate3d(${sx}px, ${sy}px, 0)` }}
      data-math-card={card.id}
      onPointerDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      <div
        className="flex h-7 cursor-grab touch-none items-center gap-1.5 rounded-t-lg border-b border-border bg-muted/40 px-2 active:cursor-grabbing"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <GripHorizontal className="size-3 text-muted-foreground/70" />
        <span className="text-[10px] font-medium text-muted-foreground">
          {card.kind === 'plot' ? '函数图像' : '计算结果'}
        </span>
        <div className="flex-1" />
        <button
          type="button"
          aria-label="删除"
          onClick={() => onDelete(card.id)}
          className="grid size-4 place-items-center rounded text-muted-foreground/70 hover:bg-accent hover:text-foreground"
        >
          <X className="size-3" strokeWidth={1.75} />
        </button>
      </div>

      <div className="px-2.5 py-2">
        {card.kind === 'number' ? (
          <div className="flex min-h-11 items-center">
            <HandwritingText
              text={card.valueText ?? ''}
              glyphs={card.glyphs}
              size={34}
              className="text-foreground"
            />
          </div>
        ) : (
          <MathPlot
            samples={card.samples ?? []}
            range={card.range}
            className="h-[110px] w-[236px] max-w-full"
            onRangeChange={(range) => {
              onChange({
                ...card,
                range,
                samples: sampleExpression(card.expression, range, 600),
              });
            }}
          />
        )}
        <div className="mt-1.5 flex items-center gap-1 overflow-hidden border-t border-border/40 pt-1.5 text-muted-foreground">
          <FormulaRenderer
            latex={card.latex || card.expression}
            className="min-w-0 truncate text-[10px]"
          />
        </div>
      </div>
    </div>
  );
}

export interface MathPlotProps {
  samples: PlotSample[];
  range: [number, number];
  className?: string;
  onRangeChange?: (range: [number, number]) => void;
}

/** A small interactive Cartesian plot. Drag pans, wheel zooms (re-samples). */
export function MathPlot({ samples, range, className, onRangeChange }: MathPlotProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  // 拖动平移：记录起点与按下时的范围，移动时只做纯函数换算，避免累积误差。
  const panRef = useRef<{
    pointerId: number;
    startX: number;
    startRange: [number, number];
  } | null>(null);
  const panRafRef = useRef<number | null>(null);
  const pendingRangeRef = useRef<[number, number] | null>(null);

  // 平移时每帧最多重采样一次（父组件会重新采 600 点），避免指针事件频率
  // 高于屏幕刷新导致移动端掉帧。
  useEffect(() => {
    return () => {
      if (panRafRef.current !== null) cancelAnimationFrame(panRafRef.current);
      panRafRef.current = null;
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const draw = () => drawPlot(canvas, samples, range);
    draw();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(draw);
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [samples, range]);

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (!onRangeChange) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const px = Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width)));
    const factor = e.deltaY > 0 ? 1.2 : 1 / 1.2;
    onRangeChange(zoomRangeAt(range, px, factor));
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!onRangeChange) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    panRef.current = { pointerId: e.pointerId, startX: e.clientX, startRange: range };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const pan = panRef.current;
    if (!pan || pan.pointerId !== e.pointerId || !onRangeChange) return;
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const delta = (e.clientX - pan.startX) / Math.max(1, rect.width);
    pendingRangeRef.current = panRange(pan.startRange, delta);
    if (panRafRef.current !== null) return;
    panRafRef.current = requestAnimationFrame(() => {
      panRafRef.current = null;
      const next = pendingRangeRef.current;
      pendingRangeRef.current = null;
      if (next) onRangeChange(next);
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (panRef.current?.pointerId !== e.pointerId) return;
    e.stopPropagation();
    panRef.current = null;
  };

  return (
    <div
      ref={wrapRef}
      className={cn(
        'relative touch-none',
        onRangeChange && 'cursor-grab active:cursor-grabbing',
        className,
      )}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onDoubleClick={() => onRangeChange?.([-10, 10])}
      title={onRangeChange ? '拖动平移 · 滚轮缩放 · 双击重置范围' : undefined}
    >
      <canvas ref={canvasRef} className="block size-full" />
    </div>
  );
}

function drawPlot(canvas: HTMLCanvasElement, samples: PlotSample[], range: [number, number]) {
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(40, Math.round(rect.width));
  const h = Math.max(30, Math.round(rect.height));
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const pad = { l: 22, r: 8, t: 8, b: 14 };
  const plotW = Math.max(10, w - pad.l - pad.r);
  const plotH = Math.max(10, h - pad.t - pad.b);

  const ys = samples
    .map((s) => s.y)
    .filter((v): v is number => v !== null && Number.isFinite(v))
    .sort((a, b) => a - b);
  let yMin = -1;
  let yMax = 1;
  if (ys.length > 0) {
    const lo = ys[Math.floor(ys.length * 0.02)] ?? ys[0];
    const hi = ys[Math.floor(ys.length * 0.98)] ?? ys[ys.length - 1];
    yMin = lo;
    yMax = hi;
    if (yMax === yMin) {
      yMin -= 1;
      yMax += 1;
    }
    const padY = (yMax - yMin) * 0.1;
    yMin -= padY;
    yMax += padY;
  }

  const [xMin, xMax] = range;
  const sx = (x: number) => pad.l + ((x - xMin) / Math.max(1e-9, xMax - xMin)) * plotW;
  const sy = (y: number) => pad.t + (1 - (y - yMin) / Math.max(1e-9, yMax - yMin)) * plotH;

  // grid
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.18)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const x = pad.l + (plotW * i) / 4;
    const y = pad.t + (plotH * i) / 4;
    ctx.beginPath();
    ctx.moveTo(x, pad.t);
    ctx.lineTo(x, pad.t + plotH);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(pad.l, y);
    ctx.lineTo(pad.l + plotW, y);
    ctx.stroke();
  }

  // axes
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.55)';
  ctx.beginPath();
  if (0 >= xMin && 0 <= xMax) {
    const x0 = sx(0);
    ctx.moveTo(x0, pad.t);
    ctx.lineTo(x0, pad.t + plotH);
  }
  if (0 >= yMin && 0 <= yMax) {
    const y0 = sy(0);
    ctx.moveTo(pad.l, y0);
    ctx.lineTo(pad.l + plotW, y0);
  }
  ctx.stroke();

  // curve
  ctx.beginPath();
  ctx.strokeStyle = '#14b8a6';
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  let drawing = false;
  for (const s of samples) {
    if (s.y === null || !Number.isFinite(s.y)) {
      drawing = false;
      continue;
    }
    const x = sx(s.x);
    const y = sy(s.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      drawing = false;
      continue;
    }
    if (!drawing) {
      ctx.moveTo(x, y);
      drawing = true;
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.stroke();

  // labels
  ctx.fillStyle = 'rgba(148, 163, 184, 0.9)';
  ctx.font = '9px ui-monospace, monospace';
  ctx.textBaseline = 'top';
  ctx.fillText(String(Math.round(xMin)), 1, pad.t + plotH + 2);
  ctx.textAlign = 'right';
  ctx.fillText(String(Math.round(xMax)), w - 2, pad.t + plotH + 2);
  ctx.textAlign = 'left';
}
