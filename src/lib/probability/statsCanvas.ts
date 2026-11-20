/**
 * OmniMath Pro — 统计图表 canvas 渲染（纯绘制函数，可单测）。
 *
 * 复用独立结果面板的视口约定（world ⇄ screen，y 向上），把 `stats.ts`
 * 计算出的数据（分箱 / ECDF / QQ / 箱线 / 回归 / KDE）画到 canvas。
 * 每个函数只负责「把数据画进 [view] 视口」，交互（pan/zoom）由上层组件负责。
 */

import type { ResultView } from '@/components/workbench/runresults/runResultRender';
import { worldToScreen, niceStep } from '@/components/workbench/runresults/runResultRender';
import type { HistBin, XYPoint, BoxStats, RegressionResult, GroupedHistogram } from './stats';

const GRID = 'rgba(148,163,184,0.14)';
const AXIS = 'rgba(148,163,184,0.55)';
const INK = 'rgba(226,232,240,0.9)';
const ACCENT = '#38bdf8';
const ACCENT2 = '#f472b6';
const FILL = 'rgba(56,189,248,0.18)';

/** 画网格 + 坐标轴 + 刻度标签。 */
export function drawAxisGrid(
  ctx: CanvasRenderingContext2D,
  view: ResultView,
  size: { w: number; h: number },
  opts?: { xFmt?: (v: number) => string; yFmt?: (v: number) => string },
) {
  const { w, h } = size;
  const xFmt = opts?.xFmt ?? fmtAuto;
  const yFmt = opts?.yFmt ?? fmtAuto;
  const spanX = view.xMax - view.xMin;
  const spanY = view.yMax - view.yMin;
  const stepX = niceStep(spanX / 8);
  const stepY = niceStep(spanY / 6);

  ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.textBaseline = 'alphabetic';

  // 网格纵线
  ctx.strokeStyle = GRID;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = Math.ceil(view.xMin / stepX) * stepX; x <= view.xMax; x += stepX) {
    const s = worldToScreen(x, 0, size, view);
    ctx.moveTo(s.x, 0);
    ctx.lineTo(s.x, h);
  }
  for (let y = Math.ceil(view.yMin / stepY) * stepY; y <= view.yMax; y += stepY) {
    const s = worldToScreen(0, y, size, view);
    ctx.moveTo(0, s.y);
    ctx.lineTo(w, s.y);
  }
  ctx.stroke();

  // 坐标轴
  ctx.strokeStyle = AXIS;
  ctx.beginPath();
  if (view.yMin <= 0 && view.yMax >= 0) {
    const s = worldToScreen(0, 0, size, view);
    ctx.moveTo(0, s.y);
    ctx.lineTo(w, s.y);
  }
  if (view.xMin <= 0 && view.xMax >= 0) {
    const s = worldToScreen(0, 0, size, view);
    ctx.moveTo(s.x, 0);
    ctx.lineTo(s.x, h);
  }
  ctx.stroke();

  // 刻度标签（带碰撞检测：相邻标签过近时跳过，避免数字重叠）
  ctx.fillStyle = INK;
  ctx.textAlign = 'left';
  const labelGap = 8;
  // 兼容无 measureText 的测试 mock：按字符数粗估宽度
  const textWidth = (t: string) =>
    typeof ctx.measureText === 'function' ? ctx.measureText(t).width : t.length * 6;
  let prevXRight = -Infinity;
  for (let x = Math.ceil(view.xMin / stepX) * stepX; x <= view.xMax; x += stepX) {
    const s = worldToScreen(x, 0, size, view);
    const text = xFmt(x);
    if (!text) continue;
    const tw = textWidth(text);
    if (s.x + 3 < prevXRight + labelGap) continue; // 与前一个标签重叠 → 跳过
    ctx.fillText(text, s.x + 3, h - 4);
    prevXRight = s.x + 3 + tw;
  }
  ctx.textBaseline = 'alphabetic';
  let prevYBase = Infinity;
  for (let y = Math.ceil(view.yMin / stepY) * stepY; y <= view.yMax; y += stepY) {
    const s = worldToScreen(0, y, size, view);
    const text = yFmt(y);
    if (!text) continue;
    const base = s.y - 3;
    if (base > prevYBase - 14) continue; // 与上一个标签过近 → 跳过
    ctx.fillText(text, 4, base);
    prevYBase = base;
  }
}

function fmtAuto(v: number): string {
  if (!Number.isFinite(v)) return '';
  const abs = Math.abs(v);
  if (abs >= 1e6 || (abs < 0.001 && abs > 0)) return v.toExponential(1);
  return String(Number(v.toPrecision(3)));
}

/** 直方图（条形 + 可选密度/正态 PDF 叠加）。 */
export function renderHistogram(
  ctx: CanvasRenderingContext2D,
  view: ResultView,
  size: { w: number; h: number },
  bins: HistBin[],
  opts?: { density?: boolean; overlay?: XYPoint[] },
) {
  drawAxisGrid(ctx, view, size);
  ctx.save();
  const { w, h } = size;
  ctx.lineWidth = 1;
  for (const b of bins) {
    const x0 = worldToScreen(b.start, 0, size, view).x;
    const x1 = worldToScreen(b.end, 0, size, view).x;
    const top = worldToScreen(0, opts?.density ? b.density : b.count, size, view).y;
    const bottom = worldToScreen(0, 0, size, view).y;
    const bw = Math.max(1, x1 - x0);
    ctx.fillStyle = FILL;
    ctx.strokeStyle = ACCENT;
    ctx.fillRect(x0, top, bw, Math.max(0, bottom - top));
    ctx.strokeRect(x0, top, bw, Math.max(0, bottom - top));
  }
  // 叠加曲线（正态 PDF / KDE）
  if (opts?.overlay && opts.overlay.length > 1) {
    ctx.strokeStyle = ACCENT2;
    ctx.lineWidth = 2;
    ctx.beginPath();
    let started = false;
    for (const p of opts.overlay) {
      const s = worldToScreen(p.x, p.y, size, view);
      if (!started) { ctx.moveTo(s.x, s.y); started = true; } else ctx.lineTo(s.x, s.y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

/** 折线/曲线（ECDF、KDE 通用）。 */
export function renderLine(
  ctx: CanvasRenderingContext2D,
  view: ResultView,
  size: { w: number; h: number },
  pts: XYPoint[],
  color = ACCENT,
) {
  drawAxisGrid(ctx, view, size);
  if (pts.length < 2) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  let started = false;
  for (const p of pts) {
    const s = worldToScreen(p.x, p.y, size, view);
    if (!started) { ctx.moveTo(s.x, s.y); started = true; } else ctx.lineTo(s.x, s.y);
  }
  ctx.stroke();
  ctx.restore();
}

/** QQ / 散点图（点 + 可选参考线与回归线）。 */
export function renderScatter(
  ctx: CanvasRenderingContext2D,
  view: ResultView,
  size: { w: number; h: number },
  pts: XYPoint[],
  opts?: { refLine?: boolean; reg?: RegressionResult; color?: string },
) {
  drawAxisGrid(ctx, view, size);
  ctx.save();
  // 参考线 y=x（QQ）或回归线
  if (opts?.refLine) {
    ctx.strokeStyle = 'rgba(148,163,184,0.5)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    const a = worldToScreen(view.xMin, view.xMin, size, view);
    const b = worldToScreen(view.xMax, view.xMax, size, view);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.setLineDash([]);
  } else if (opts?.reg && Number.isFinite(opts.reg.slope)) {
    const r = opts.reg;
    ctx.strokeStyle = ACCENT2;
    ctx.lineWidth = 2;
    ctx.beginPath();
    const p0 = worldToScreen(view.xMin, r.slope * view.xMin + r.intercept, size, view);
    const p1 = worldToScreen(view.xMax, r.slope * view.xMax + r.intercept, size, view);
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.stroke();
  }
  // 散点
  ctx.fillStyle = opts?.color ?? ACCENT;
  for (const p of pts) {
    const s = worldToScreen(p.x, p.y, size, view);
    ctx.beginPath();
    ctx.arc(s.x, s.y, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** 各序列并排条形（分组直方图）使用的配色。 */
export const GROUPED_PALETTE = ['#38bdf8', '#f472b6', '#34d399', '#fbbf24', '#a78bfa', '#fb923c', '#2dd4bf', '#818cf8'];

/**
 * 分组直方图：多个序列在共享分箱轴上并排绘制条形。
 * 每个 bin 内按序列顺序从左到右等分，便于逐区间比较分布。
 * 可选密度模式（`density: true` 时纵轴为概率密度，可跨不同样本量比较）。
 */
export function renderGroupedHistogram(
  ctx: CanvasRenderingContext2D,
  view: ResultView,
  size: { w: number; h: number },
  hist: GroupedHistogram,
  opts?: { density?: boolean },
) {
  drawAxisGrid(ctx, view, size);
  if (hist.edges.length === 0 || hist.series.length === 0) return;
  ctx.save();
  const { w, h } = size;
  const nSeries = hist.series.length;
  // 每个 bin 的可用屏幕宽度（钳制到 0..1 px 以避免负宽）
  const binScreenW = (p: { start: number; end: number }) => {
    const x0 = worldToScreen(p.start, 0, size, view).x;
    const x1 = worldToScreen(p.end, 0, size, view).x;
    return Math.max(1, x1 - x0);
  };
  const gap = 1;
  const bottom = worldToScreen(0, 0, size, view).y;

  hist.edges.forEach((edge, bi) => {
    const fullW = binScreenW(edge);
    const slotW = (fullW - gap) / nSeries;
    hist.series.forEach((s, si) => {
      const bin = s.bins[bi];
      if (!bin) return;
      const val = opts?.density ? bin.density : bin.count;
      const color = GROUPED_PALETTE[si % GROUPED_PALETTE.length];
      const x = worldToScreen(edge.start, 0, size, view).x + si * slotW;
      const top = worldToScreen(0, val, size, view).y;
      ctx.fillStyle = color;
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.85;
      ctx.fillRect(x, top, Math.max(1, slotW - gap), Math.max(0, bottom - top));
      ctx.globalAlpha = 1;
      ctx.strokeRect(x, top, Math.max(1, slotW - gap), Math.max(0, bottom - top));
    });
  });

  // 图例（顶行）
  ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.textBaseline = 'alphabetic';
  let lx = 6;
  const ly = 12;
  hist.series.forEach((s, si) => {
    const color = GROUPED_PALETTE[si % GROUPED_PALETTE.length];
    ctx.fillStyle = color;
    ctx.fillRect(lx, ly - 8, 8, 8);
    ctx.strokeStyle = 'rgba(148,163,184,0.6)';
    ctx.strokeRect(lx, ly - 8, 8, 8);
    ctx.fillStyle = INK;
    const label = s.name.length > 12 ? s.name.slice(0, 11) + '…' : s.name;
    ctx.fillText(label, lx + 10, ly);
    lx += 10 + ctx.measureText(label).width + 14;
  });

  ctx.restore();
}

/** 箱线图（水平在屏幕中央，沿 x 轴显示数值）。可选置信凹口。 */
export function renderBoxPlot(
  ctx: CanvasRenderingContext2D,
  view: ResultView,
  size: { w: number; h: number },
  b: BoxStats,
  opts?: { notch?: boolean },
) {
  drawAxisGrid(ctx, view, size);
  ctx.save();
  const { w, h } = size;
  const cy = h / 2;
  const x = (v: number) => worldToScreen(v, 0, size, view).x;
  const half = Math.min(40, h * 0.18);
  const notch = opts?.notch && Number.isFinite(b.notchLow) && Number.isFinite(b.notchHigh);

  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  // 须线
  ctx.beginPath();
  ctx.moveTo(x(b.whiskerLow), cy);
  ctx.lineTo(x(b.whiskerHigh), cy);
  ctx.stroke();
  // 须端帽
  ctx.beginPath();
  ctx.moveTo(x(b.whiskerLow), cy - half / 2);
  ctx.lineTo(x(b.whiskerLow), cy + half / 2);
  ctx.moveTo(x(b.whiskerHigh), cy - half / 2);
  ctx.lineTo(x(b.whiskerHigh), cy + half / 2);
  ctx.stroke();
  // 箱体（含凹口）
  ctx.fillStyle = FILL;
  ctx.strokeStyle = ACCENT;
  if (notch) {
    // 凹口：盒两侧缩进到 notch 边界，形成「沙漏」轮廓
    const nl = x(b.notchLow);
    const nh = x(b.notchHigh);
    const x1 = x(b.q1);
    const x3 = x(b.q3);
    ctx.beginPath();
    ctx.moveTo(x1, cy - half);
    ctx.lineTo(x3, cy - half);
    ctx.lineTo(nh, cy);
    ctx.lineTo(x3, cy + half);
    ctx.lineTo(x1, cy + half);
    ctx.lineTo(nl, cy);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.fillRect(x(b.q1), cy - half, Math.max(1, x(b.q3) - x(b.q1)), half * 2);
    ctx.strokeRect(x(b.q1), cy - half, Math.max(1, x(b.q3) - x(b.q1)), half * 2);
  }
  // 中位线
  ctx.strokeStyle = ACCENT2;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x(b.median), cy - half);
  ctx.lineTo(x(b.median), cy + half);
  ctx.stroke();
  // 离群点
  ctx.fillStyle = 'rgba(248,113,113,0.9)';
  for (const o of b.outliers) {
    ctx.beginPath();
    ctx.arc(x(o), cy, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** 小提琴图：KDE 密度沿竖直数值轴左右镜像，叠加中位数/四分位箱线。 */
export function renderViolin(
  ctx: CanvasRenderingContext2D,
  view: ResultView,
  size: { w: number; h: number },
  kdePts: XYPoint[],
  b: BoxStats,
) {
  drawAxisGrid(ctx, view, size);
  ctx.save();
  const { w, h } = size;
  const cx = w / 2;
  const y = (v: number) => worldToScreen(0, v, size, view).y;
  // 归一化密度到最大宽度（≤ 40% 画布宽）
  let maxD = 1e-9;
  for (const p of kdePts) if (p.y > maxD) maxD = p.y;
  const halfW = Math.min(w * 0.4, 60);
  const sx = (d: number) => (d / maxD) * halfW;

  // 左半
  ctx.beginPath();
  for (let i = 0; i < kdePts.length; i++) {
    const p = kdePts[i];
    const px = cx - sx(p.y);
    const py = y(p.x);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  for (let i = kdePts.length - 1; i >= 0; i--) {
    const p = kdePts[i];
    ctx.lineTo(cx + sx(p.y), y(p.x));
  }
  ctx.closePath();
  ctx.fillStyle = FILL;
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = 1.5;
  ctx.fill();
  ctx.stroke();

  // 中位数横线
  ctx.strokeStyle = ACCENT2;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - Math.min(sx(kdeMaxAt(kdePts, b.median)), halfW), y(b.median));
  ctx.lineTo(cx + Math.min(sx(kdeMaxAt(kdePts, b.median)), halfW), y(b.median));
  ctx.stroke();
  // 四分位短横线
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1;
  for (const q of [b.q1, b.q3]) {
    if (!Number.isFinite(q)) continue;
    ctx.beginPath();
    ctx.moveTo(cx - Math.min(sx(kdeMaxAt(kdePts, q)), halfW), y(q));
    ctx.lineTo(cx + Math.min(sx(kdeMaxAt(kdePts, q)), halfW), y(q));
    ctx.stroke();
  }
  ctx.restore();
}

/** 取 KDE 曲线在 x 附近的高度（线性插值）。 */
function kdeMaxAt(pts: XYPoint[], x0: number): number {
  if (pts.length === 0) return 0;
  let best = pts[0];
  let bd = Math.abs(pts[0].x - x0);
  for (const p of pts) {
    const d = Math.abs(p.x - x0);
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  return best.y;
}

/** 填充 KDE 曲线下面积。 */
export function renderArea(
  ctx: CanvasRenderingContext2D,
  view: ResultView,
  size: { w: number; h: number },
  pts: XYPoint[],
  color = ACCENT,
) {
  drawAxisGrid(ctx, view, size);
  if (pts.length < 2) return;
  ctx.save();
  ctx.beginPath();
  const first = worldToScreen(pts[0].x, pts[0].y, size, view);
  ctx.moveTo(first.x, worldToScreen(0, 0, size, view).y);
  ctx.lineTo(first.x, first.y);
  for (let i = 1; i < pts.length; i++) {
    const s = worldToScreen(pts[i].x, pts[i].y, size, view);
    ctx.lineTo(s.x, s.y);
  }
  const last = pts[pts.length - 1];
  const ls = worldToScreen(last.x, last.y, size, view);
  ctx.lineTo(ls.x, worldToScreen(0, 0, size, view).y);
  ctx.closePath();
  ctx.fillStyle = FILL;
  ctx.fill();
  // 描边
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const s = worldToScreen(pts[i].x, pts[i].y, size, view);
    if (i === 0) ctx.moveTo(s.x, s.y);
    else ctx.lineTo(s.x, s.y);
  }
  ctx.stroke();
  ctx.restore();
}