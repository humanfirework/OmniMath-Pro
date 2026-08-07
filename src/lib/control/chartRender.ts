/**
 * OmniMath Pro — 控制理论图表 canvas 渲染（纯绘制函数，可单测）。
 *
 * 复用 runResultRender 的视口约定（world ⇄ screen，y 向上），把
 * `lib/control/transferFunction.ts` 算出的数据（Bode / 阶跃 / 根轨迹 / 奈奎斯特）
 * 画到 canvas。每个函数只负责「把数据画进 [view] 视口」。
 */

import type { ResultView } from '@/components/workbench/runresults/runResultRender';
import { worldToScreen, niceStep } from '@/components/workbench/runresults/runResultRender';
import type { BodePoint, StepPoint, RlocusPoint, NyquistPoint, StabilityMargins } from './transferFunction';

const GRID = 'rgba(148,163,184,0.14)';
const AXIS = 'rgba(148,163,184,0.55)';
const INK = 'rgba(226,232,240,0.9)';
const ACCENT = '#38bdf8';
const ACCENT2 = '#f472b6';
const ACCENT3 = '#a3e635';

function drawGrid(ctx: CanvasRenderingContext2D, view: ResultView, size: { w: number; h: number }) {
  const { w, h } = size;
  const spanX = view.xMax - view.xMin;
  const spanY = view.yMax - view.yMin;
  if (spanX <= 0 || spanY <= 0) return;
  const stepX = niceStep(spanX / 8);
  const stepY = niceStep(spanY / 6);
  ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.textBaseline = 'alphabetic';
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
  // 刻度
  ctx.fillStyle = INK;
  for (let x = Math.ceil(view.xMin / stepX) * stepX; x <= view.xMax; x += stepX) {
    const s = worldToScreen(x, 0, size, view);
    ctx.fillText(fmtTick(x), s.x + 3, h - 4);
  }
  for (let y = Math.ceil(view.yMin / stepY) * stepY; y <= view.yMax; y += stepY) {
    const s = worldToScreen(0, y, size, view);
    ctx.fillText(fmtTick(y), 4, s.y - 3);
  }
}

function fmtTick(v: number): string {
  if (!Number.isFinite(v)) return '';
  const abs = Math.abs(v);
  if (abs >= 1e5 || (abs < 0.001 && abs > 0)) return v.toExponential(1);
  return String(Number(v.toPrecision(3)));
}

/** Bode 频率刻度：把 log10(f) 反解为实际频率 10^dec，标成 0.1 / 1 / 10 / 100（Hz）。 */
function freqLabel(dec: number): string {
  const f = Math.pow(10, dec);
  if (f < 0.009) return f.toExponential(0);
  if (f < 999) return String(Number(f.toPrecision(3)));
  return f.toExponential(0);
}

/** 在绘图区角落绘制坐标轴标题与单位（x 底部居中，y 左侧竖向旋转），带半透明底衬避免与刻度重叠。 */
function drawAxisTitles(
  ctx: CanvasRenderingContext2D,
  size: { w: number; h: number },
  titles: { x?: string; y?: string },
) {
  ctx.save();
  ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
  if (titles.x) {
    const tw = ctx.measureText(titles.x).width;
    const tx = size.w / 2;
    const ty = size.h - 2;
    ctx.fillStyle = 'rgba(11,18,32,0.85)';
    ctx.fillRect(tx - tw / 2 - 4, ty - 10, tw + 8, 12);
    ctx.fillStyle = 'rgba(148,163,184,0.95)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(titles.x, tx, ty);
  }
  if (titles.y) {
    const tw = ctx.measureText(titles.y).width;
    ctx.fillStyle = 'rgba(11,18,32,0.85)';
    ctx.fillRect(2, size.h / 2 - tw / 2 - 4, 12, tw + 8);
    ctx.fillStyle = 'rgba(148,163,184,0.95)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.translate(8, size.h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(titles.y, 0, 0);
  }
  ctx.restore();
}

/** Bode 专用网格：x 轴按整数对数 decade 画网格，刻度标为实际频率。 */
function drawBodeGrid(
  ctx: CanvasRenderingContext2D,
  view: ResultView,
  size: { w: number; h: number },
  yUnit: string,
) {
  const { w, h } = size;
  const spanX = view.xMax - view.xMin;
  const spanY = view.yMax - view.yMin;
  if (spanX <= 0 || spanY <= 0) return;
  const stepY = niceStep(spanY / 6);
  ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.textBaseline = 'alphabetic';
  // 水平网格 + y 刻度
  ctx.strokeStyle = GRID;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let y = Math.ceil(view.yMin / stepY) * stepY; y <= view.yMax; y += stepY) {
    const s = worldToScreen(0, y, size, view);
    ctx.moveTo(0, s.y);
    ctx.lineTo(w, s.y);
  }
  ctx.stroke();
  // 垂直网格（整数 log decade）
  ctx.beginPath();
  for (let dec = Math.ceil(view.xMin); dec <= view.xMax; dec++) {
    const s = worldToScreen(dec, 0, size, view);
    ctx.moveTo(s.x, 0);
    ctx.lineTo(s.x, h);
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
  // 刻度标签
  ctx.fillStyle = INK;
  for (let dec = Math.ceil(view.xMin); dec <= view.xMax; dec++) {
    const s = worldToScreen(dec, 0, size, view);
    ctx.fillText(freqLabel(dec), s.x + 3, h - 4);
  }
  for (let y = Math.ceil(view.yMin / stepY) * stepY; y <= view.yMax; y += stepY) {
    const s = worldToScreen(0, y, size, view);
    ctx.fillText(fmtTick(y), 4, s.y - 3);
  }
  void yUnit;
}

function trace(
  ctx: CanvasRenderingContext2D,
  pts: { x: number; y: number }[],
  view: ResultView,
  size: { w: number; h: number },
  color: string,
) {
  if (pts.length < 2) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  let started = false;
  for (const p of pts) {
    const s = worldToScreen(p.x, p.y, size, view);
    if (!Number.isFinite(s.x) || !Number.isFinite(s.y)) continue;
    if (!started) {
      ctx.moveTo(s.x, s.y);
      started = true;
    } else ctx.lineTo(s.x, s.y);
  }
  ctx.stroke();
  ctx.restore();
}

/** Bode 幅值（dB，x 轴为 log10(f)）。 */
export function renderBodeMag(
  ctx: CanvasRenderingContext2D,
  view: ResultView,
  size: { w: number; h: number },
  pts: BodePoint[],
  margins?: StabilityMargins,
) {
  drawBodeGrid(ctx, view, size, 'dB');
  trace(ctx, pts.map((p) => ({ x: Math.log10(p.f), y: p.db })), view, size, ACCENT);
  drawAxisTitles(ctx, size, { x: '频率 (Hz)', y: '幅值 (dB)' });
  // 增益/相位裕度标注：幅值图标 GM（0dB 参考线与相位穿越频率交点）
  if (margins && margins.gm !== null && margins.wpc !== null) {
    drawMarginMarker(ctx, view, size, {
      x: Math.log10(margins.wpc / (2 * Math.PI)),
      y: 0,
      label: `GM ${margins.gm.toFixed(1)} dB`,
      color: '#a3e635',
    });
  }
}

/** Bode 相位（度，x 轴为 log10(f)）。 */
export function renderBodePhase(
  ctx: CanvasRenderingContext2D,
  view: ResultView,
  size: { w: number; h: number },
  pts: BodePoint[],
  margins?: StabilityMargins,
) {
  drawBodeGrid(ctx, view, size, '°');
  trace(ctx, pts.map((p) => ({ x: Math.log10(p.f), y: p.phaseDeg })), view, size, ACCENT2);
  drawAxisTitles(ctx, size, { x: '频率 (Hz)', y: '相位 (°)' });
  // 相位图标 PM（-180° 参考线与增益穿越频率交点）
  if (margins && margins.pm !== null && margins.wgc !== null) {
    drawMarginMarker(ctx, view, size, {
      x: Math.log10(margins.wgc / (2 * Math.PI)),
      y: -180,
      label: `PM ${margins.pm.toFixed(1)}°`,
      color: '#fbbf24',
    });
  }
}

/** 在 Bode 图上标注一个裕度参考点：参考线 + 圆点 + 数值标签。 */
function drawMarginMarker(
  ctx: CanvasRenderingContext2D,
  view: ResultView,
  size: { w: number; h: number },
  pt: { x: number; y: number; label: string; color: string },
) {
  const s = worldToScreen(pt.x, pt.y, size, view);
  if (!Number.isFinite(s.x) || !Number.isFinite(s.y)) return;
  ctx.save();
  // 参考线（横穿）
  ctx.strokeStyle = pt.color;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(0, s.y);
  ctx.lineTo(size.w, s.y);
  ctx.stroke();
  // 竖直虚线到交点
  ctx.beginPath();
  ctx.moveTo(s.x, 0);
  ctx.lineTo(s.x, size.h);
  ctx.stroke();
  ctx.restore();
  // 交点圆点
  ctx.save();
  ctx.fillStyle = pt.color;
  ctx.beginPath();
  ctx.arc(s.x, s.y, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // 标签（带底衬）
  ctx.save();
  ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.textBaseline = 'alphabetic';
  const tw = ctx.measureText(pt.label).width;
  const lx = Math.min(s.x + 6, size.w - tw - 6);
  const ly = s.y > 20 ? s.y - 6 : s.y + 14;
  ctx.fillStyle = 'rgba(11,18,32,0.85)';
  ctx.fillRect(lx - 3, ly - 10, tw + 6, 13);
  ctx.fillStyle = pt.color;
  ctx.fillText(pt.label, lx, ly);
  ctx.restore();
}

/** 阶跃响应（y vs t）。 */
export function renderStep(
  ctx: CanvasRenderingContext2D,
  view: ResultView,
  size: { w: number; h: number },
  pts: StepPoint[],
) {
  drawGrid(ctx, view, size);
  trace(ctx, pts.map((p) => ({ x: p.t, y: p.y })), view, size, ACCENT);
  drawAxisTitles(ctx, size, { x: '时间 t (s)', y: '响应 y(t)' });
  // 稳态参考线（末点）
  const last = pts[pts.length - 1];
  if (Number.isFinite(last.y)) {
    ctx.save();
    ctx.strokeStyle = 'rgba(163,230,53,0.5)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    const a = worldToScreen(view.xMin, last.y, size, view);
    const b = worldToScreen(view.xMax, last.y, size, view);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.restore();
  }
}

/** 开环 + 闭环阶跃响应对比（左上角图例）。 */
export function renderStepBoth(
  ctx: CanvasRenderingContext2D,
  view: ResultView,
  size: { w: number; h: number },
  data: { open: StepPoint[]; closed: StepPoint[] },
) {
  drawGrid(ctx, view, size);
  trace(ctx, data.open.map((p) => ({ x: p.t, y: p.y })), view, size, ACCENT);
  trace(ctx, data.closed.map((p) => ({ x: p.t, y: p.y })), view, size, ACCENT2);
  drawAxisTitles(ctx, size, { x: '时间 t (s)', y: '响应 y(t)' });
  // 图例
  ctx.save();
  ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.textBaseline = 'alphabetic';
  let lx = 8;
  let ly = 14;
  const items: Array<[string, string]> = [
    ['开环 G', ACCENT],
    ['闭环 T', ACCENT2],
  ];
  for (const [label, color] of items) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(lx, ly - 3);
    ctx.lineTo(lx + 16, ly - 3);
    ctx.stroke();
    ctx.fillStyle = 'rgba(15,23,42,0.65)';
    ctx.fillRect(lx - 2, ly - 9, label.length * 6 + 26, 13);
    ctx.fillStyle = INK;
    ctx.fillText(label, lx + 20, ly);
    ly += 17;
  }
  ctx.restore();
}

/** 根轨迹（复平面 Re-Im）。可选传入开环极点/零点，用 ×/○ 标注。 */
export function renderRlocus(
  ctx: CanvasRenderingContext2D,
  view: ResultView,
  size: { w: number; h: number },
  pts: RlocusPoint[],
  poles?: { re: number; im: number }[],
  zeros?: { re: number; im: number }[],
) {
  drawGrid(ctx, view, size);
  drawAxisTitles(ctx, size, { x: '实部 Re', y: '虚部 Im' });
  // 每个 K 的根连成轨迹
  const nRoots = pts.length > 0 ? pts[0].roots.length : 0;
  for (let r = 0; r < nRoots; r++) {
    const path = pts
      .map((p) => p.roots[r])
      .filter((z) => Number.isFinite(z.re) && Number.isFinite(z.im))
      .map((z) => ({ x: z.re, y: z.im }));
    trace(ctx, path, view, size, ACCENT);
  }
  // 关键点标注：仅沿轨迹高亮 K→0（起点）与 K→∞（终点）处闭环极点，避免整条轨迹
  // 撒满圆点（视觉上像“太多零点”）。开环极点（×）与零点（○）见下方独立标注。
  const Kstart = pts[0]?.roots ?? [];
  const Kend = pts[pts.length - 1]?.roots ?? [];
  ctx.save();
  ctx.fillStyle = ACCENT2;
  const Kpts = [...Kstart, ...Kend];
  for (const z of Kpts) {
    if (!Number.isFinite(z.re) || !Number.isFinite(z.im)) continue;
    const s = worldToScreen(z.re, z.im, size, view);
    ctx.beginPath();
    ctx.arc(s.x, s.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  // 开环极点（×）与零点（○）标注
  ctx.save();
  ctx.lineWidth = 1.6;
  if (poles) {
    ctx.strokeStyle = '#a3e635';
    ctx.fillStyle = '#a3e635';
    for (const z of poles) {
      if (!Number.isFinite(z.re) || !Number.isFinite(z.im)) continue;
      const s = worldToScreen(z.re, z.im, size, view);
      const r = 5;
      ctx.beginPath();
      ctx.moveTo(s.x - r, s.y - r);
      ctx.lineTo(s.x + r, s.y + r);
      ctx.moveTo(s.x + r, s.y - r);
      ctx.lineTo(s.x - r, s.y + r);
      ctx.stroke();
    }
  }
  if (zeros) {
    ctx.strokeStyle = '#38bdf8';
    for (const z of zeros) {
      if (!Number.isFinite(z.re) || !Number.isFinite(z.im)) continue;
      const s = worldToScreen(z.re, z.im, size, view);
      ctx.beginPath();
      ctx.arc(s.x, s.y, 5, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.restore();
  // 图例
  if (poles || zeros) {
    ctx.save();
    ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textBaseline = 'alphabetic';
    let ly = 14;
    if (poles) {
      ctx.strokeStyle = '#a3e635';
      ctx.beginPath();
      ctx.moveTo(8, ly - 3);
      ctx.lineTo(16, ly - 3);
      ctx.moveTo(12, ly - 7);
      ctx.lineTo(12, ly + 1);
      ctx.stroke();
      ctx.fillStyle = 'rgba(15,23,42,0.65)';
      ctx.fillRect(4, ly - 9, 40, 13);
      ctx.fillStyle = '#a3e635';
      ctx.fillText('极点 ×', 20, ly);
      ly += 15;
    }
    if (zeros) {
      ctx.strokeStyle = '#38bdf8';
      ctx.beginPath();
      ctx.arc(12, ly - 3, 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(15,23,42,0.65)';
      ctx.fillRect(4, ly - 9, 40, 13);
      ctx.fillStyle = '#38bdf8';
      ctx.fillText('零点 ○', 20, ly);
    }
    ctx.restore();
  }
}

/** 奈奎斯特曲线（复平面 Re-Im）。 */
export function renderNyquist(
  ctx: CanvasRenderingContext2D,
  view: ResultView,
  size: { w: number; h: number },
  pts: NyquistPoint[],
) {
  drawGrid(ctx, view, size);
  drawAxisTitles(ctx, size, { x: '实部 Re', y: '虚部 Im' });
  trace(
    ctx,
    pts.map((p) => ({ x: p.re, y: p.im })),
    view,
    size,
    ACCENT,
  );
  // 关键点 (-1, j0)：穿越判稳参考。若曲线有效给出绕 -1 包络次数与大圆环映射提示。
  ctx.save();
  // 参考虚线十字
  ctx.strokeStyle = 'rgba(163,230,53,0.35)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  const r = worldToScreen(-1, 0, size, view);
  ctx.beginPath();
  ctx.moveTo(0, r.y);
  ctx.lineTo(size.w, r.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(r.x, 0);
  ctx.lineTo(r.x, size.h);
  ctx.stroke();
  ctx.restore();
  // 关键点实心 + 外圈
  ctx.save();
  ctx.strokeStyle = '#f472b6';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(r.x, r.y, 6, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#f472b6';
  ctx.beginPath();
  ctx.arc(r.x, r.y, 2.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillText('(-1, j0)', r.x + 8, r.y - 6);
  ctx.fillText('判稳点', r.x + 8, r.y + 6);
  ctx.restore();
}