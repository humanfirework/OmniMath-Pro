'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Crosshair, Download, Focus, Gauge, Grid3X3, Image as ImageIcon, Pause, Play, SkipForward } from 'lucide-react';
import type { RunResultPanel } from '@/lib/store/runResultsStore';
import { useRunResultsStore } from '@/lib/store/runResultsStore';
import {
  autoFitView,
  panView,
  renderPanel,
  screenToWorld,
  zoomView,
  type ResultView,
} from './runResultRender';

/** 高 DPI 上限，避免 backing store 像素爆炸导致卡顿。 */
const MAX_DPR = 2;
/** 图例最多显示的曲线数，超出则折叠为计数摘要。 */
const LEGEND_MAX = 12;
/** 逐帧播放速度倍率档位（0.5x / 1x / 2x / 4x）。 */
const PLAYBACK_RATES = [0.5, 1, 2, 4] as const;

interface RunResultViewProps {
  panel: RunResultPanel;
  className?: string;
}

function fmt(v: number): string {
  if (!Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  if (a !== 0 && (a >= 1e5 || a < 1e-3)) return v.toExponential(2);
  const s = v.toFixed(3);
  return s.replace(/\.?0+$/, '') || '0';
}

/**
 * 高性能 canvas 曲线视图：承载海量曲线点，支持拖拽平移、滚轮缩放、双击复位、
 * 逐帧动画播放。P0-4：增强独立结果窗口——
 *  - DPR 高清（devicePixelRatio 感知，上限裁剪）
 *  - 坐标读出（鼠标悬停显示 world 坐标）
 *  - 图例（颜色 + 名称，点击切换显隐）
 *  - 工具栏（复位视口 / 网格 / 坐标轴 / 动画播放）
 */
export function RunResultView({ panel, className }: RunResultViewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<ResultView | null>(null);
  const [frameIndex, setFrameIndex] = useState(0);
  const [playing, setPlaying] = useState(!!panel.animation);
  /** 播放速度倍率（0.5x/1x/2x/4x）。 */
  const [rate, setRate] = useState<number>(1);
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const [showGrid, setShowGrid] = useState(true);
  const [showAxes, setShowAxes] = useState(true);
  /** 是否叠加原图背景（图像+轮廓窗）。默认显示，可切换隐藏以便清晰对比曲线。 */
  const [showImage, setShowImage] = useState(true);
  const toggleCurveVisible = useRunResultsStore((s) => s.toggleCurveVisible);
  const animFps = panel.animation?.fps ?? 30;
  const frameCount = panel.animation?.frames.length ?? 0;

  // P0-4：加载原图叠加层（图像+轮廓窗）。加载完成后触发重绘。
  const [overlayImg, setOverlayImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!panel.image?.src) {
      setOverlayImg(null);
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (!cancelled) setOverlayImg(img);
    };
    img.src = panel.image.src;
    return () => {
      cancelled = true;
    };
  }, [panel.image]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const el = wrapRef.current;
    if (!canvas || !el) return;
    const size = { w: el.clientWidth, h: el.clientHeight };
    if (size.w <= 0 || size.h <= 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const pw = Math.round(size.w * dpr);
    const ph = Math.round(size.h * dpr);
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw;
      canvas.height = ph;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const view = viewRef.current ?? autoFitView(panel);
    if (!view) {
      ctx.clearRect(0, 0, size.w, size.h);
      return;
    }
    const frame = panel.animation ? frameIndex : -1;
    renderPanel(ctx, panel, view, size, { frame, grid: showGrid, axes: showAxes, image: showImage ? overlayImg : null });
  }, [panel, frameIndex, showGrid, showAxes, showImage, overlayImg]);

  // 初始化 / 数据变化时计算自动视口。
  // 注意：这里只依赖 `panel`，绝不能依赖 `draw`（draw 随 frameIndex 播放变化，
  // 若把 setPlaying(false) 放进这里，每次播帧都会把播放状态重置为暂停 → “一点播放就立刻停”）。
  useEffect(() => {
    const v = autoFitView(panel);
    if (v) {
      viewRef.current = v;
      draw();
    }
    setFrameIndex(0);
    setPlaying(false);
  }, [panel]);

  // 逐帧动画播放（帧间隔 = 1s / (基础 fps × 速度倍率)）。
  useEffect(() => {
    if (!playing || !panel.animation) return;
    const id = setInterval(() => {
      setFrameIndex((i) => (i + 1) % (panel.animation!.frames.length || 1));
    }, 1000 / (animFps * rate));
    return () => clearInterval(id);
  }, [playing, panel.animation, animFps, rate]);

  /** 前进一帧（单步）。 */
  const stepFrame = useCallback(() => {
    setPlaying(false);
    setFrameIndex((i) => (frameCount > 1 ? (i + 1) % frameCount : 0));
  }, [frameCount]);

  const getSize = useCallback(() => {
    const el = wrapRef.current;
    return { w: el?.clientWidth ?? 0, h: el?.clientHeight ?? 0 };
  }, []);

  useEffect(() => {
    draw();
  }, [draw]);

  // 窗口尺寸变化时重绘。
  useEffect(() => {
    const ro = new ResizeObserver(() => draw());
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [draw]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const el = wrapRef.current;
      if (!el) return;
      const startX = e.clientX;
      const startY = e.clientY;
      const startView = viewRef.current;
      if (!startView) return;
      const onMove = (ev: PointerEvent) => {
        const v = panView(startView, ev.clientX - startX, ev.clientY - startY, getSize());
        viewRef.current = v;
        draw();
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [draw, getSize],
  );

  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const el = wrapRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const factor = Math.exp(-e.deltaY * 0.0015);
      const cur = viewRef.current;
      if (!cur) return;
      viewRef.current = zoomView(cur, factor, { x: e.clientX - rect.left, y: e.clientY - rect.top }, getSize());
      draw();
    },
    [draw, getSize],
  );

  const onDoubleClick = useCallback(() => {
    const v = autoFitView(panel);
    if (v) {
      viewRef.current = v;
      draw();
    }
  }, [panel, draw]);

  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const el = wrapRef.current;
      const view = viewRef.current;
      if (!el || !view) return;
      const rect = el.getBoundingClientRect();
      const w = screenToWorld(e.clientX - rect.left, e.clientY - rect.top, getSize(), view);
      setHover({ x: w.x, y: w.y });
    },
    [getSize],
  );

  const onMouseLeave = useCallback(() => setHover(null), []);

  const resetView = useCallback(() => {
    const v = autoFitView(panel);
    if (v) {
      viewRef.current = v;
      draw();
    }
  }, [panel, draw]);

  /** P0-4：导出当前视图为 PNG（DPR 高清底图）。 */
  const exportPng = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const a = document.createElement('a');
    a.download = `${panel.title.replace(/[^\w\u4e00-\u9fa5-]+/g, '_') || 'result'}.png`;
    a.href = canvas.toDataURL('image/png');
    a.click();
  }, [panel.title]);

  const legendCurves = panel.animation ? [] : panel.curves;
  const showLegend = legendCurves.length > 0 && legendCurves.length <= LEGEND_MAX;

  return (
    <div
      ref={wrapRef}
      className={`relative w-full h-full overflow-hidden cursor-grab active:cursor-grabbing bg-background ${className ?? ''}`}
      onPointerDown={onPointerDown}
      onWheel={onWheel}
      onDoubleClick={onDoubleClick}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
    >
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

      {/* 工具栏（右上角） */}
      <div className="absolute top-1.5 right-1.5 flex items-center gap-1 select-none">
        <ToolbarBtn
          title={showGrid ? '隐藏网格' : '显示网格'}
          active={showGrid}
          onClick={() => setShowGrid((v) => !v)}
        >
          <Grid3X3 className="size-3.5" />
        </ToolbarBtn>
        <ToolbarBtn
          title={showAxes ? '隐藏坐标轴' : '显示坐标轴'}
          active={showAxes}
          onClick={() => setShowAxes((v) => !v)}
        >
          <Crosshair className="size-3.5" />
        </ToolbarBtn>
        <ToolbarBtn title="复位视口（双击也可）" onClick={resetView}>
          <Focus className="size-3.5" />
        </ToolbarBtn>
        {panel.image && (
          <ToolbarBtn
            title={showImage ? '隐藏原图背景' : '显示原图背景'}
            active={showImage}
            onClick={() => setShowImage((v) => !v)}
          >
            <ImageIcon className="size-3.5" />
          </ToolbarBtn>
        )}
        <ToolbarBtn title="导出 PNG" onClick={exportPng}>
          <Download className="size-3.5" />
        </ToolbarBtn>
        {panel.animation && (
          <ToolbarBtn
            title="播放"
            active={playing}
            onClick={() => setPlaying((v) => !v)}
          >
            {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
          </ToolbarBtn>
        )}
        {panel.animation && frameCount > 1 && (
          <ToolbarBtn title="单步（前进一帧）" onClick={stepFrame}>
            <SkipForward className="size-3.5" />
          </ToolbarBtn>
        )}
        {panel.animation && (
          <button
            type="button"
            title={`播放速度 ${rate}x（点击切换）`}
            onClick={() => {
              const idx = PLAYBACK_RATES.indexOf(rate as (typeof PLAYBACK_RATES)[number]);
              setRate(PLAYBACK_RATES[(idx + 1) % PLAYBACK_RATES.length]);
            }}
            className="flex h-6 items-center gap-1 rounded-md border border-transparent bg-background/60 px-1.5 font-mono text-[10px] tabular-nums text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
          >
            <Gauge className="size-3.5" />
            {rate}x
          </button>
        )}
      </div>

      {/* 图例（左下角） */}
      {showLegend && (
        <div className="absolute left-1.5 bottom-7 flex flex-col gap-0.5 max-w-[60%] select-none">
          {legendCurves.map((c, i) => (
            <button
              key={c.id}
              onClick={() => toggleCurveVisible(panel.id, c.id)}
              title={c.visible === false ? '点击显示' : '点击隐藏'}
              className={`flex items-center gap-1.5 text-[10px] leading-tight rounded px-1 py-0.5 text-left transition-colors ${
                c.visible === false ? 'opacity-40' : 'opacity-90'
              } hover:bg-accent/40`}
            >
              <span
                className="size-1.5 rounded-full shrink-0"
                style={{ background: c.color }}
              />
              <span className="truncate text-muted-foreground">
                {c.label || `曲线 ${i + 1}`}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* 曲线计数摘要（图例超长时） */}
      {legendCurves.length > LEGEND_MAX && (
        <span className="absolute left-1.5 bottom-7 text-[10px] text-muted-foreground/70 select-none">
          {legendCurves.length} 条曲线
        </span>
      )}

      {/* 动画帧滑杆（右下角） */}
      {panel.animation && panel.animation.frames.length > 1 && (
        <div className="absolute right-1.5 bottom-1.5 flex items-center gap-1.5 select-none">
          <input
            type="range"
            min={0}
            max={panel.animation.frames.length - 1}
            value={frameIndex}
            onChange={(e) => setFrameIndex(Number(e.target.value))}
            className="w-24 h-1.5 accent-primary cursor-pointer"
            title="帧滑杆"
          />
          <span className="text-[10px] font-mono text-muted-foreground/80 tabular-nums">
            {frameIndex + 1}/{panel.animation.frames.length}
          </span>
        </div>
      )}

      {/* 坐标读出（左下角） */}
      <div className="absolute left-1.5 bottom-1.5 text-[10px] font-mono text-muted-foreground/80 select-none pointer-events-none">
        {hover ? `(${fmt(hover.x)}, ${fmt(hover.y)})` : '(x, y)'}
      </div>
    </div>
  );
}

function ToolbarBtn(props: {
  title: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const { title, active, onClick, children } = props;
  return (
    <button
      title={title}
      onClick={onClick}
      className={`size-6 grid place-items-center rounded-md border border-transparent transition-colors ${
        active
          ? 'bg-primary/20 text-primary border-primary/30'
          : 'bg-background/60 text-muted-foreground hover:text-foreground hover:bg-accent/60'
      }`}
    >
      {children}
    </button>
  );
}