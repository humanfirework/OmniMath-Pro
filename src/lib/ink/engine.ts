/**
 * OmniMath — 框架无关的 Canvas 墨迹引擎。
 *
 * 四层画布 + 预测层：
 *   L0 背景（网格/横线/点阵）
 *   L1 已提交笔画（Path2D 缓存）
 *   L2 活动笔画（增量绘制）
 *   L2.5 触控笔预测尾巴（每帧重画，下一帧真实点到达即清除）
 *   L3 交互层（选中框、套圈、橡皮圈）
 *
 * 指针热路径直接写 ref / Path2D，不经过 React state。
 */

import {
  MAX_VIEW_K,
  MIN_VIEW_K,
  PIXEL_CELL,
  newInkId,
  type InkEngineCallbacks,
  type InkPoint,
  type InkStroke,
  type InkStyle,
  type InkView,
} from './types';
import {
  buildCachedStroke,
  drawGrid,
  drawSelectionRect,
  pointInPolygon,
  type CachedInkStroke,
} from './render';
import { predictPenTail } from './predict';

const MIN_POINT_DIST = 1.2;

/** 预测尾巴：按上一段速度外推 10ms，最多 7 个屏幕像素。 */
const PREDICT_AHEAD_MS = 10;
const PREDICT_MAX_PX = 7;

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function snapCell(v: number): number {
  return Math.floor(v / PIXEL_CELL) * PIXEL_CELL;
}

function bresenhamCells(x0: number, y0: number, x1: number, y1: number): Array<{ x: number; y: number }> {
  const cells: Array<{ x: number; y: number }> = [];
  let x = x0;
  let y = y0;
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  const maxSteps = (dx + dy + 2) * 2;
  let steps = 0;
  for (;;) {
    cells.push({ x, y });
    if (x === x1 && y === y1) break;
    if (++steps > maxSteps) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }
  return cells;
}

function readCssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

export class InkEngine {
  private container: HTMLElement;
  private opts: InkEngineCallbacks;

  private bgCanvas: HTMLCanvasElement;
  private mainCanvas: HTMLCanvasElement;
  private liveCanvas: HTMLCanvasElement;
  private predCanvas: HTMLCanvasElement;
  private overlayCanvas: HTMLCanvasElement;
  private bgCtx: CanvasRenderingContext2D;
  private mainCtx: CanvasRenderingContext2D;
  private liveCtx: CanvasRenderingContext2D;
  private predCtx: CanvasRenderingContext2D;
  private overlayCtx: CanvasRenderingContext2D;

  private width = 1;
  private height = 1;
  private dpr = 1;

  private view: InkView = { k: 1, x: 0, y: 0 };
  private style: InkStyle = {
    tool: 'pen',
    shapeTool: null,
    brush: 'pen',
    color: '#0ea5e9',
    width: 4,
    eraserSize: 24,
    pixelMode: false,
    background: 'dot',
  };

  private strokes: InkStroke[] = [];
  private cache = new Map<string, CachedInkStroke>();
  private selectedIds: string[] = [];

  private backgroundColor = '#ffffff';
  private selectionColor = '#0ea5e9';

  private drawing = false;
  private latencyProbe = false;
  private live: InkStroke | null = null;
  private liveDrawn = 0;
  private optimistic: InkStroke | null = null;
  private activePointerType = 'mouse';

  private drag: { ids: string[]; startX: number; startY: number; dx: number; dy: number } | null = null;
  private lasso: InkPoint[] | null = null;
  private pan: { startX: number; startY: number; startView: InkView } | null = null;
  private gesture: { startDist: number; startView: InkView; world: { x: number; y: number } } | null = null;

  private pointers = new Map<number, { x: number; y: number }>();
  private penPointers = new Set<number>();
  private eraserCursor: { x: number; y: number } | null = null;

  private overlayRaf = 0;
  private liveRaf = 0;
  private viewRaf = 0;
  private predTimer: ReturnType<typeof setTimeout> | null = null;
  private predGen = 0;
  private viewTimer: ReturnType<typeof setTimeout> | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private themeObserver: MutationObserver | null = null;
  private destroyed = false;

  constructor(container: HTMLElement, opts: InkEngineCallbacks) {
    this.container = container;
    this.opts = opts;

    this.bgCanvas = document.createElement('canvas');
    this.mainCanvas = document.createElement('canvas');
    this.liveCanvas = document.createElement('canvas');
    this.predCanvas = document.createElement('canvas');
    this.overlayCanvas = document.createElement('canvas');

    for (const canvas of [this.bgCanvas, this.mainCanvas, this.liveCanvas, this.predCanvas, this.overlayCanvas]) {
      canvas.style.position = 'absolute';
      canvas.style.inset = '0';
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.pointerEvents = 'none';
      container.appendChild(canvas);
    }

    const bgCtx = this.bgCanvas.getContext('2d');
    const mainCtx = this.mainCanvas.getContext('2d');
    const liveCtx = this.liveCanvas.getContext('2d');
    const predCtx = this.predCanvas.getContext('2d');
    const overlayCtx = this.overlayCanvas.getContext('2d');
    if (!bgCtx || !mainCtx || !liveCtx || !predCtx || !overlayCtx) {
      throw new Error('Canvas 2D context unavailable');
    }
    this.bgCtx = bgCtx;
    this.mainCtx = mainCtx;
    this.liveCtx = liveCtx;
    this.predCtx = predCtx;
    this.overlayCtx = overlayCtx;

    container.style.touchAction = 'none';
    container.style.overscrollBehavior = 'none';
    container.style.userSelect = 'none';
    this.updateCursor();

    this.refreshTheme();

    container.addEventListener('pointerdown', this.onPointerDown);
    container.addEventListener('pointermove', this.onPointerMove);
    container.addEventListener('pointerup', this.onPointerUp);
    container.addEventListener('pointercancel', this.onPointerCancel);
    container.addEventListener('pointerleave', this.onPointerLeave);
    container.addEventListener('wheel', this.onWheel, { passive: false });

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(container);
    }
    if (typeof MutationObserver !== 'undefined') {
      this.themeObserver = new MutationObserver(() => this.refreshTheme());
      this.themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class', 'style', 'data-theme'],
      });
    }

    this.resize();
  }

  // ── 公共 API ────────────────────────────────────────────────────────────

  setStyle(patch: Partial<InkStyle>): void {
    const prev = this.style;
    this.style = { ...prev, ...patch };
    if (prev.background !== this.style.background || prev.pixelMode !== this.style.pixelMode) {
      this.drawBackground();
    }
    if (prev.tool !== this.style.tool) {
      this.eraserCursor = null;
      this.updateCursor();
    }
    this.scheduleOverlay();
  }

  /** Enable/disable per-move latency sampling (diagnostics only). */
  setLatencyProbe(enabled: boolean): void {
    this.latencyProbe = enabled;
  }

  setStrokes(strokes: InkStroke[]): void {
    const prevIds = new Set(this.strokes.map((s) => s.id));
    const nextIds = new Set(strokes.map((s) => s.id));

    let removed = false;
    for (const id of prevIds) {
      if (!nextIds.has(id)) {
        removed = true;
        break;
      }
    }

    const optimisticId = this.optimistic?.id;
    const optimisticKept = optimisticId ? nextIds.has(optimisticId) : true;

    let changed = false;
    for (const stroke of strokes) {
      const cached = this.cache.get(stroke.id);
      if (!cached || cached.source !== stroke) {
        this.cache.set(stroke.id, buildCachedStroke(stroke, this.backgroundColor));
        if (prevIds.has(stroke.id)) changed = true;
      }
    }

    const added = strokes.filter((s) => !prevIds.has(s.id));
    for (const id of [...this.cache.keys()]) {
      if (!nextIds.has(id)) this.cache.delete(id);
    }

    this.strokes = strokes;
    this.optimistic = null;

    if (!removed && !changed && added.length === 1) {
      this.applyWorld(this.mainCtx);
      this.cache.get(added[0].id)?.draw(this.mainCtx);
    } else if (removed || changed || !optimisticKept || added.length > 1) {
      this.drawMain();
    }
    this.scheduleOverlay();
  }

  setSelected(ids: string[]): void {
    this.selectedIds = ids;
    this.scheduleOverlay();
  }

  getView(): InkView {
    return { ...this.view };
  }

  setView(view: InkView): void {
    this.view = {
      k: clamp(view.k, MIN_VIEW_K, MAX_VIEW_K),
      x: view.x,
      y: view.y,
    };
    this.redrawAll();
    this.emitView(true);
  }

  zoomAt(factor: number, clientX?: number, clientY?: number): void {
    const rect = this.container.getBoundingClientRect();
    const px = clientX !== undefined ? clientX - rect.left : this.width / 2;
    const py = clientY !== undefined ? clientY - rect.top : this.height / 2;
    const nextK = clamp(this.view.k * factor, MIN_VIEW_K, MAX_VIEW_K);
    if (nextK === this.view.k) return;
    const ratio = nextK / this.view.k;
    this.view = {
      k: nextK,
      x: px - (px - this.view.x) * ratio,
      y: py - (py - this.view.y) * ratio,
    };
    this.scheduleViewDraw();
  }

  async exportPNG(scale = 2): Promise<Blob | null> {
    const w = Math.max(1, this.width);
    const h = Math.max(1, this.height);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.scale(scale, scale);
    ctx.drawImage(this.bgCanvas, 0, 0, this.bgCanvas.width, this.bgCanvas.height, 0, 0, w, h);
    ctx.drawImage(this.mainCanvas, 0, 0, this.mainCanvas.width, this.mainCanvas.height, 0, 0, w, h);
    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), 'image/png');
    });
  }

  destroy(): void {
    this.destroyed = true;
    this.container.removeEventListener('pointerdown', this.onPointerDown);
    this.container.removeEventListener('pointermove', this.onPointerMove);
    this.container.removeEventListener('pointerup', this.onPointerUp);
    this.container.removeEventListener('pointercancel', this.onPointerCancel);
    this.container.removeEventListener('pointerleave', this.onPointerLeave);
    this.container.removeEventListener('wheel', this.onWheel);
    this.resizeObserver?.disconnect();
    this.themeObserver?.disconnect();
    if (this.overlayRaf) cancelAnimationFrame(this.overlayRaf);
    if (this.liveRaf) cancelAnimationFrame(this.liveRaf);
    if (this.viewRaf) cancelAnimationFrame(this.viewRaf);
    if (this.predTimer) clearTimeout(this.predTimer);
    if (this.viewTimer) clearTimeout(this.viewTimer);
    this.bgCanvas.remove();
    this.mainCanvas.remove();
    this.liveCanvas.remove();
    this.predCanvas.remove();
    this.overlayCanvas.remove();
  }

  // ── 主题 / 尺寸 / 变换 ──────────────────────────────────────────────────

  private refreshTheme(): void {
    if (this.destroyed) return;
    const nextBg = readCssVar('--background', '#ffffff');
    const nextSelection = readCssVar('--primary', '#0ea5e9');
    if (nextBg === this.backgroundColor && nextSelection === this.selectionColor) return;
    const bgChanged = nextBg !== this.backgroundColor;
    this.backgroundColor = nextBg;
    this.selectionColor = nextSelection;
    if (bgChanged) {
      this.cache.clear();
      for (const stroke of this.strokes) {
        this.cache.set(stroke.id, buildCachedStroke(stroke, this.backgroundColor));
      }
    }
    this.redrawAll();
  }

  private resize(): void {
    if (this.destroyed) return;
    const rect = this.container.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    const dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
    if (w === this.width && h === this.height && dpr === this.dpr) return;
    this.width = w;
    this.height = h;
    this.dpr = dpr;
    for (const canvas of [this.bgCanvas, this.mainCanvas, this.liveCanvas, this.predCanvas, this.overlayCanvas]) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    this.redrawAll();
  }

  private applyWorld(ctx: CanvasRenderingContext2D): void {
    ctx.setTransform(
      this.dpr * this.view.k,
      0,
      0,
      this.dpr * this.view.k,
      this.dpr * this.view.x,
      this.dpr * this.view.y,
    );
  }

  private clear(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement): void {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  private toWorld(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.container.getBoundingClientRect();
    return {
      x: (clientX - rect.left - this.view.x) / this.view.k,
      y: (clientY - rect.top - this.view.y) / this.view.k,
    };
  }

  // ── 绘制 ────────────────────────────────────────────────────────────────

  private redrawAll(): void {
    this.drawBackground();
    this.drawMain();
    this.clearLive();
    this.drawLiveFull();
    this.drawOverlay();
  }

  private clearLive(): void {
    this.clear(this.liveCtx, this.liveCanvas);
    this.liveDrawn = 0;
    this.clearPrediction();
  }

  private clearPrediction(): void {
    if (this.predTimer) {
      clearTimeout(this.predTimer);
      this.predTimer = null;
    }
    this.predGen += 1;
    this.clear(this.predCtx, this.predCanvas);
  }

  /**
   * 触控笔预测尾巴：只画一小段（≤7px），下一帧真实点到达后整层清除。
   * 只对 pen 生效，鼠标/手指不画，避免出现「鼠标拖影」。
   */
  private drawPrediction(): void {
    this.clearPrediction();
    const stroke = this.live;
    if (!stroke || this.activePointerType !== 'pen') return;
    if (stroke.shape || stroke.pixel || stroke.style === 'eraser') return;
    if (stroke.brush === 'highlighter') return;
    const last = stroke.points[stroke.points.length - 1];
    // 笔停住时不再保留尾巴：最后一点超过 40ms 就视为停顿。
    if (!last?.t || performance.now() - last.t > 40) return;

    const maxWorld = PREDICT_MAX_PX / Math.max(0.05, this.view.k);
    const tail = predictPenTail(stroke.points, PREDICT_AHEAD_MS, maxWorld);
    if (!tail) return;

    const ctx = this.predCtx;
    ctx.save();
    this.applyWorld(ctx);
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = Math.max(0.5, last.w ?? stroke.width);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = stroke.brush === 'marker' ? 0.88 : 1;
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(tail.x, tail.y);
    ctx.stroke();
    ctx.restore();

    // 没有新点时自动消失；有更新的预测会以新的 generation 覆盖这个定时器。
    const gen = this.predGen;
    this.predTimer = setTimeout(() => {
      this.predTimer = null;
      if (this.predGen === gen) this.clear(this.predCtx, this.predCanvas);
    }, 40);
  }

  private drawLiveFull(): void {
    if (!this.live) return;
    this.applyWorld(this.liveCtx);
    buildCachedStroke(this.live, this.backgroundColor).draw(this.liveCtx);
    this.liveDrawn = this.live.points.length;
  }

  private drawLiveIncrement(): void {
    const stroke = this.live;
    if (!stroke) return;
    this.applyWorld(this.liveCtx);

    if (stroke.style === 'eraser') {
      this.liveDrawn = stroke.points.length;
      return;
    }

    if (stroke.shape) {
      this.clearLive();
      this.applyWorld(this.liveCtx);
      buildCachedStroke(stroke, this.backgroundColor).draw(this.liveCtx);
      this.liveDrawn = stroke.points.length;
      return;
    }

    if (stroke.pixel) {
      const ctx = this.liveCtx;
      ctx.fillStyle = stroke.color;
      const start = Math.min(this.liveDrawn, stroke.points.length);
      for (let i = start; i < stroke.points.length; i++) {
        const p = stroke.points[i];
        ctx.fillRect(p.x, p.y, PIXEL_CELL, PIXEL_CELL);
      }
      this.liveDrawn = stroke.points.length;
      return;
    }

    const n = stroke.points.length;
    if (n === 0 || this.liveDrawn >= n) return;
    // 马克笔 / 荧光笔是半透明笔刷。增量绘制会在每一段的接缝处叠加两次
    // alpha，写长笔时出现一节一节的深色斑。整笔重画虽然多算一点，但只
    // 有一条活动笔画，60fps 下完全撑得住，视觉上也干净。
    if (stroke.brush === 'marker' || stroke.brush === 'highlighter') {
      this.clearLive();
      this.applyWorld(this.liveCtx);
      buildCachedStroke(stroke, this.backgroundColor).draw(this.liveCtx);
      this.liveDrawn = n;
      return;
    }
    const from = Math.max(0, this.liveDrawn - 1);
    const segment = stroke.points.slice(from);
    buildCachedStroke({ ...stroke, points: segment }, this.backgroundColor).draw(this.liveCtx);
    this.liveDrawn = n;
  }

  private scheduleLive(): void {
    if (this.liveRaf || this.destroyed) return;
    this.liveRaf = requestAnimationFrame(() => {
      this.liveRaf = 0;
      this.drawLiveIncrement();
      this.drawPrediction();
    });
  }

  private drawBackground(): void {
    const ctx = this.bgCtx;
    this.clear(ctx, this.bgCanvas);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = this.backgroundColor;
    ctx.fillRect(0, 0, this.bgCanvas.width, this.bgCanvas.height);
    this.applyWorld(ctx);
    drawGrid(ctx, this.width, this.height, this.view, this.style.background, this.style.pixelMode);
  }

  private drawMain(): void {
    const ctx = this.mainCtx;
    this.clear(ctx, this.mainCanvas);
    this.applyWorld(ctx);
    const dragging = this.drag ? new Set(this.drag.ids) : null;
    // Viewport culling: with thousands of strokes most of them are off-screen
    // at any given moment. Skipping them keeps pan/zoom at 60fps.
    const margin = 48 / this.view.k;
    const left = -this.view.x / this.view.k - margin;
    const top = -this.view.y / this.view.k - margin;
    const right = left + this.width / this.view.k + margin * 2;
    const bottom = top + this.height / this.view.k + margin * 2;
    for (const stroke of this.strokes) {
      if (dragging?.has(stroke.id)) continue;
      const cached = this.cache.get(stroke.id);
      if (!cached) continue;
      const b = cached.bounds;
      if (b.x2 < left || b.x1 > right || b.y2 < top || b.y1 > bottom) continue;
      cached.draw(ctx);
    }
    if (this.optimistic) {
      buildCachedStroke(this.optimistic, this.backgroundColor).draw(ctx);
    }
  }

  private drawOverlay(): void {
    if (this.destroyed) return;
    const ctx = this.overlayCtx;
    this.clear(ctx, this.overlayCanvas);
    this.applyWorld(ctx);

    if (this.drag) {
      for (const id of this.drag.ids) {
        const cached = this.cache.get(id);
        if (!cached) continue;
        ctx.save();
        ctx.translate(this.drag.dx, this.drag.dy);
        cached.draw(ctx);
        ctx.restore();
        drawSelectionRect(
          ctx,
          {
            x1: cached.bounds.x1 + this.drag.dx,
            y1: cached.bounds.y1 + this.drag.dy,
            x2: cached.bounds.x2 + this.drag.dx,
            y2: cached.bounds.y2 + this.drag.dy,
          },
          this.view.k,
          this.selectionColor,
        );
      }
    } else if (this.selectedIds.length > 0) {
      for (const id of this.selectedIds) {
        const cached = this.cache.get(id);
        if (cached) drawSelectionRect(ctx, cached.bounds, this.view.k, this.selectionColor);
      }
    }

    if (this.lasso && this.lasso.length > 1) {
      const pts = this.lasso;
      ctx.save();
      ctx.strokeStyle = this.selectionColor;
      ctx.lineWidth = 1.5 / this.view.k;
      ctx.setLineDash([5 / this.view.k, 4 / this.view.k]);
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      if (pts.length > 2) ctx.lineTo(pts[0].x, pts[0].y);
      ctx.stroke();
      ctx.restore();
    }

    if (this.eraserCursor && this.style.tool === 'eraser' && !this.style.shapeTool) {
      const r = this.style.eraserSize / 2;
      ctx.save();
      ctx.strokeStyle = this.selectionColor;
      ctx.lineWidth = 1.5 / this.view.k;
      ctx.setLineDash([4 / this.view.k, 3 / this.view.k]);
      ctx.beginPath();
      ctx.arc(this.eraserCursor.x, this.eraserCursor.y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  private scheduleOverlay(): void {
    if (this.overlayRaf || this.destroyed) return;
    this.overlayRaf = requestAnimationFrame(() => {
      this.overlayRaf = 0;
      this.drawOverlay();
    });
  }

  private scheduleViewDraw(): void {
    if (this.viewRaf || this.destroyed) return;
    this.viewRaf = requestAnimationFrame(() => {
      this.viewRaf = 0;
      this.drawBackground();
      this.drawMain();
      this.clearLive();
      this.drawLiveFull();
      this.drawOverlay();
      this.emitView();
    });
  }

  private emitView(force = false): void {
    if (force) {
      if (this.viewTimer) {
        clearTimeout(this.viewTimer);
        this.viewTimer = null;
      }
      this.opts.onViewChange({ ...this.view });
      return;
    }
    if (this.viewTimer) return;
    this.viewTimer = setTimeout(() => {
      this.viewTimer = null;
      this.opts.onViewChange({ ...this.view });
    }, 80);
  }

  private updateCursor(): void {
    this.container.style.cursor =
      this.style.tool === 'select' ? 'default' : this.style.tool === 'eraser' ? 'none' : 'crosshair';
  }

  // ── 事件 ────────────────────────────────────────────────────────────────

  private onPointerDown = (e: PointerEvent): void => {
    if (this.destroyed) return;

    if (e.pointerType === 'touch' && this.penPointers.size > 0) return;

    if (e.pointerType === 'pen') this.penPointers.add(e.pointerId);

    if (e.pointerType === 'touch') {
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size >= 2) {
        this.capture(e.pointerId);
        this.beginGesture();
        return;
      }
    }

    if (e.pointerType !== 'touch' && e.button === 1) {
      this.beginPan(e);
      return;
    }
    if (e.pointerType !== 'touch' && e.button === 0 && e.altKey) {
      this.beginPan(e);
      return;
    }
    if (e.button !== 0 && e.pointerType !== 'touch') return;

    this.capture(e.pointerId);
    this.activePointerType = e.pointerType;

    if (this.style.tool === 'lasso') {
      const p = this.toWorld(e.clientX, e.clientY);
      this.lasso = [{ x: p.x, y: p.y }];
      this.scheduleOverlay();
      return;
    }

    if (this.style.tool === 'select') {
      const p = this.toWorld(e.clientX, e.clientY);
      const id = this.opts.hitTest(p, this.view.k);
      if (!id) {
        this.opts.onSelect([]);
        return;
      }
      const alreadySelected = this.selectedIds.includes(id);
      const ids = alreadySelected ? this.selectedIds.slice() : [id];
      if (!alreadySelected) this.opts.onSelect([id]);
      this.drag = { ids, startX: p.x, startY: p.y, dx: 0, dy: 0 };
      this.drawMain();
      this.scheduleOverlay();
      return;
    }

    this.beginStroke(e);
  };

  private sampleLatency(e: PointerEvent): void {
    if (!this.latencyProbe || !this.opts.onLatency || e.timeStamp <= 0) return;
    const start = e.timeStamp;
    requestAnimationFrame(() => {
      const ms = performance.now() - start;
      if (ms >= 0 && ms < 250) this.opts.onLatency?.(ms);
    });
  }

  private onPointerMove = (e: PointerEvent): void => {
    if (this.destroyed) return;

    if (this.pointers.has(e.pointerId)) {
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    if (this.gesture) {
      this.updateGesture();
      return;
    }

    if (this.pan) {
      this.view = {
        ...this.view,
        x: this.pan.startView.x + (e.clientX - this.pan.startX),
        y: this.pan.startView.y + (e.clientY - this.pan.startY),
      };
      this.scheduleViewDraw();
      return;
    }

    if (this.lasso) {
      const p = this.toWorld(e.clientX, e.clientY);
      const tail = this.lasso[this.lasso.length - 1];
      if (Math.hypot(p.x - tail.x, p.y - tail.y) >= 1.5 / this.view.k) {
        this.lasso.push({ x: p.x, y: p.y });
        this.scheduleOverlay();
      }
      return;
    }

    if (this.drag) {
      const p = this.toWorld(e.clientX, e.clientY);
      this.drag.dx = p.x - this.drag.startX;
      this.drag.dy = p.y - this.drag.startY;
      this.scheduleOverlay();
      return;
    }

    if (this.drawing) {
      this.extendStroke(e);
      this.sampleLatency(e);
      return;
    }

    if (this.style.tool === 'eraser' && !this.style.shapeTool) {
      this.eraserCursor = this.toWorld(e.clientX, e.clientY);
      this.scheduleOverlay();
    }
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (this.destroyed) return;
    this.pointers.delete(e.pointerId);
    this.penPointers.delete(e.pointerId);

    if (this.gesture) {
      if (this.pointers.size < 2) this.endGesture();
      return;
    }
    if (this.pan) {
      this.pan = null;
      this.emitView(true);
      return;
    }
    if (this.lasso) {
      this.finishLasso();
      return;
    }
    if (this.drag) {
      const { dx, dy, ids } = this.drag;
      this.drag = null;
      this.drawMain();
      this.scheduleOverlay();
      if (Math.hypot(dx, dy) > 0.01) this.opts.onMoveEnd(dx, dy, ids);
      return;
    }
    if (this.drawing) {
      this.finishStroke(true);
    }
  };

  private onPointerCancel = (e: PointerEvent): void => {
    this.pointers.delete(e.pointerId);
    this.penPointers.delete(e.pointerId);
    if (this.gesture) {
      this.endGesture();
      return;
    }
    if (this.pan) {
      this.pan = null;
      return;
    }
    if (this.lasso) {
      this.lasso = null;
      this.scheduleOverlay();
      return;
    }
    if (this.drag) {
      this.drag = null;
      this.drawMain();
      this.scheduleOverlay();
      return;
    }
    if (this.drawing) this.finishStroke(false);
  };

  private onPointerLeave = (e: PointerEvent): void => {
    if (this.drawing || this.drag || this.pan || this.gesture) return;
    if (this.container.hasPointerCapture(e.pointerId)) return;
    this.eraserCursor = null;
    this.scheduleOverlay();
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    this.zoomAt(factor, e.clientX, e.clientY);
  };

  private capture(pointerId: number): void {
    try {
      this.container.setPointerCapture(pointerId);
    } catch {
      /* pointer already gone */
    }
  }

  // ── 手势 ────────────────────────────────────────────────────────────────

  private beginGesture(): void {
    const points = [...this.pointers.values()].slice(0, 2);
    if (points.length < 2) return;
    this.drawing = false;
    this.live = null;
    this.clearLive();
    this.lasso = null;
    this.drag = null;
    this.pan = null;

    const [a, b] = points;
    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;
    const rect = this.container.getBoundingClientRect();
    const mx = midX - rect.left;
    const my = midY - rect.top;

    this.gesture = {
      startDist: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)),
      startView: { ...this.view },
      world: {
        x: (mx - this.view.x) / this.view.k,
        y: (my - this.view.y) / this.view.k,
      },
    };
    this.drawMain();
    this.scheduleOverlay();
  }

  private updateGesture(): void {
    if (!this.gesture) return;
    const points = [...this.pointers.values()].slice(0, 2);
    if (points.length < 2) return;
    const [a, b] = points;
    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;
    const rect = this.container.getBoundingClientRect();
    const mx = midX - rect.left;
    const my = midY - rect.top;
    const dist = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
    const k = clamp((this.gesture.startView.k * dist) / this.gesture.startDist, MIN_VIEW_K, MAX_VIEW_K);
    this.view = {
      k,
      x: mx - this.gesture.world.x * k,
      y: my - this.gesture.world.y * k,
    };
    this.scheduleViewDraw();
  }

  private endGesture(): void {
    this.gesture = null;
    this.emitView(true);
  }

  private finishLasso(): void {
    const polygon = this.lasso;
    this.lasso = null;
    if (!polygon || polygon.length < 3) {
      this.opts.onSelect([]);
      this.scheduleOverlay();
      return;
    }

    let px1 = Infinity;
    let py1 = Infinity;
    let px2 = -Infinity;
    let py2 = -Infinity;
    for (const p of polygon) {
      if (p.x < px1) px1 = p.x;
      if (p.y < py1) py1 = p.y;
      if (p.x > px2) px2 = p.x;
      if (p.y > py2) py2 = p.y;
    }

    const ids: string[] = [];
    for (const stroke of this.strokes) {
      const cached = this.cache.get(stroke.id);
      if (!cached) continue;
      const b = cached.bounds;
      if (b.x2 < px1 || b.x1 > px2 || b.y2 < py1 || b.y1 > py2) continue;

      let hit = false;
      const step = Math.max(1, Math.floor(stroke.points.length / 24));
      for (let i = 0; i < stroke.points.length; i += step) {
        if (pointInPolygon(stroke.points[i], polygon)) {
          hit = true;
          break;
        }
      }

      if (!hit) {
        const cx = (b.x1 + b.x2) / 2;
        const cy = (b.y1 + b.y2) / 2;
        for (const corner of [
          { x: b.x1, y: b.y1 },
          { x: b.x2, y: b.y1 },
          { x: b.x1, y: b.y2 },
          { x: b.x2, y: b.y2 },
          { x: cx, y: cy },
        ]) {
          if (pointInPolygon(corner, polygon)) {
            hit = true;
            break;
          }
        }
      }

      if (hit) ids.push(stroke.id);
    }

    this.opts.onSelect(ids);
    this.scheduleOverlay();
  }

  private beginPan(e: PointerEvent): void {
    this.pan = { startX: e.clientX, startY: e.clientY, startView: { ...this.view } };
    this.capture(e.pointerId);
  }

  // ── 绘制笔画 ────────────────────────────────────────────────────────────

  private beginStroke(e: PointerEvent): void {
    const p = this.toWorld(e.clientX, e.clientY);
    const isEraser = this.style.tool === 'eraser';
    const isPixel = this.style.pixelMode && !isEraser && !this.style.shapeTool;
    const brush = this.style.brush;
    const scale = brush === 'highlighter' ? 3.2 : brush === 'marker' ? 1.8 : 1;
    const baseWidth = isEraser ? this.style.eraserSize : this.style.width * scale;

    const point: InkPoint = {
      x: isPixel ? snapCell(p.x) : p.x,
      y: isPixel ? snapCell(p.y) : p.y,
      t: performance.now(),
      w: isPixel ? PIXEL_CELL : this.pointWidth(e, baseWidth),
    };

    const stroke: InkStroke = {
      id: newInkId(),
      points: [point],
      color: this.style.color,
      width: baseWidth,
      style: isEraser ? 'eraser' : 'pen',
      brush: isEraser ? undefined : brush,
      recognized: null,
      pixel: isPixel,
      shape: !isEraser && this.style.shapeTool ? this.style.shapeTool : undefined,
    };

    if (stroke.shape) {
      stroke.points = [point, { ...point }];
    }

    this.live = stroke;
    this.drawing = true;
    this.clearLive();
    this.scheduleLive();
  }

  private pointWidth(e: PointerEvent, base: number): number {
    if (e.pointerType === 'pen' && e.pressure > 0) {
      return clamp(base * (0.4 + e.pressure * 1.2), base * 0.35, base * 1.8);
    }
    return base;
  }

  private extendStroke(e: PointerEvent): void {
    const stroke = this.live;
    if (!stroke) return;

    const coalesced = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
    const events = coalesced.length > 0 ? coalesced : [e];

    if (stroke.shape) {
      const last = events[events.length - 1];
      const p = this.toWorld(last.clientX, last.clientY);
      stroke.points[1] = { ...p, t: performance.now(), w: stroke.width };
      this.scheduleLive();
      return;
    }

    if (stroke.pixel) {
      const last = events[events.length - 1];
      const p = this.toWorld(last.clientX, last.clientY);
      const cellX = Math.floor(p.x / PIXEL_CELL);
      const cellY = Math.floor(p.y / PIXEL_CELL);
      const tail = stroke.points[stroke.points.length - 1];
      const lastX = Math.floor(tail.x / PIXEL_CELL);
      const lastY = Math.floor(tail.y / PIXEL_CELL);
      if (cellX === lastX && cellY === lastY) return;
      if (Math.abs(cellX - lastX) > 1 || Math.abs(cellY - lastY) > 1) {
        const bridge = bresenhamCells(lastX, lastY, cellX, cellY);
        for (let i = 1; i < bridge.length; i++) {
          stroke.points.push({
            x: bridge[i].x * PIXEL_CELL,
            y: bridge[i].y * PIXEL_CELL,
            w: PIXEL_CELL,
          });
        }
      } else {
        stroke.points.push({ x: cellX * PIXEL_CELL, y: cellY * PIXEL_CELL, w: PIXEL_CELL });
      }
      this.scheduleLive();
      return;
    }

    const minDist = MIN_POINT_DIST / this.view.k;
    const base = stroke.width;
    const isPen = this.activePointerType === 'pen';

    for (const ev of events) {
      const p = this.toWorld(ev.clientX, ev.clientY);
      const tail = stroke.points[stroke.points.length - 1];
      const dist = Math.hypot(p.x - tail.x, p.y - tail.y);
      if (dist < minDist) continue;

      const t = performance.now();
      let w: number;
      if (isPen && ev.pressure > 0) {
        w = clamp(base * (0.4 + ev.pressure * 1.2), base * 0.35, base * 1.8);
      } else {
        const dt = Math.max(8, t - (tail.t ?? t));
        const velocity = dist / dt;
        const dynamicW = Math.max(1, base * (1 - Math.min(0.5, velocity * 0.04)));
        w = (tail.w ?? base) * 0.5 + dynamicW * 0.5;
      }

      stroke.points.push({ x: p.x, y: p.y, t, w });
    }

    this.scheduleLive();
  }

  private finishStroke(commit: boolean): void {
    const stroke = this.live;
    if (!stroke) {
      this.drawing = false;
      return;
    }
    this.drawing = false;
    this.live = null;
    this.clearLive();

    let accepted = false;
    if (commit) {
      if (stroke.style === 'eraser') {
        accepted = this.opts.onEraseEnd(stroke);
      } else if (stroke.shape) {
        const a = stroke.points[0];
        const b = stroke.points[stroke.points.length - 1];
        if (Math.hypot(b.x - a.x, b.y - a.y) > 2) {
          accepted = this.opts.onStrokeEnd(stroke);
        }
      } else {
        accepted = this.opts.onStrokeEnd(stroke);
      }
    }

    if (accepted && stroke.style !== 'eraser') {
      this.optimistic = stroke;
      this.applyWorld(this.mainCtx);
      buildCachedStroke(stroke, this.backgroundColor).draw(this.mainCtx);
    }

    this.scheduleOverlay();
  }
}
