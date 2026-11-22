/**
 * OmniMath Pro — on-device handwriting math recognizer
 *
 * This is deliberately *not* an LLM. It follows the same three-stage design
 * as Apple Math Notes:
 *
 *   1. Segment ink strokes into glyph-sized groups using their geometry.
 *   2. Classify every group against skeleton glyph templates (rendered from
 *      the local system fonts, thinned with Zhang–Suen, compared with a
 *      symmetric Chamfer distance).
 *   3. Rebuild the two-dimensional structure (superscripts, implicit
 *      multiplication) into a linear expression string.
 *
 * The classifier is intentionally conservative: when it is not confident it
 * returns `?`, and the UI lets the user correct the result. Accuracy first,
 * speed second — recognition is triggered after the pen has been idle.
 */

import { attachFunctionArguments } from './functionArgs';

export interface RecognitionPoint {
  x: number;
  y: number;
}

export interface RecognitionStroke {
  points: RecognitionPoint[];
}

export interface BBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface GlyphGroup {
  strokes: RecognitionStroke[];
  bbox: BBox;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

export interface RecognizedGlyph {
  char: string;
  displayChar: string;
  confidence: number;
  /** Runner-up characters, for diagnostics / user correction UI. */
  alternatives?: string[];
  /** Which rule produced this glyph (diagnostics). */
  reason?: string;
  /** Multi-character token (e.g. a fraction); takes precedence over `char`. */
  text?: string;
  bbox: BBox;
  superscript: boolean;
  /** 下标：字号更小、整体位于基线下方（x₂）。 */
  subscript?: boolean;
  strokes: RecognitionStroke[];
}

export interface MathRecognitionResult {
  ok: boolean;
  /** Linear expression, e.g. "2.5*365*24*60" / "y=x^3". */
  text: string;
  /** Pretty version for humans, e.g. "2.5×365×24×60". */
  display: string;
  glyphs: RecognizedGlyph[];
  /**
   * Glyphs after fraction / radical layout. Use these for one-click glyph
   * correction in the panel: rebuilding text from them preserves the
   * two-dimensional structure (fractions, sqrt).
   */
  layoutGlyphs: RecognizedGlyph[];
  confidence: number;
  error?: string;
}

/* ================================================================== *
 * 1. Segmentation
 * ================================================================== */

export function strokeBBox(stroke: RecognitionStroke): BBox | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of stroke.points) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    if (p.x < x0) x0 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.x > x1) x1 = p.x;
    if (p.y > y1) y1 = p.y;
  }
  if (!Number.isFinite(x0)) return null;
  return { x0, y0, x1, y1 };
}

function unionBBox(a: BBox, b: BBox): BBox {
  return {
    x0: Math.min(a.x0, b.x0),
    y0: Math.min(a.y0, b.y0),
    x1: Math.max(a.x1, b.x1),
    y1: Math.max(a.y1, b.y1),
  };
}

/**
 * Group strokes into glyph candidates.
 *
 * Two strokes belong together when their horizontal spans overlap strongly
 * (the two bars of "=", the crossing strokes of "x") or when one sits right
 * above the other with little horizontal gap (the dot of "i", a split "4").
 */
export function groupStrokesIntoGlyphs(strokes: RecognitionStroke[]): GlyphGroup[] {
  const items = strokes
    .map((stroke) => ({ stroke, bbox: strokeBBox(stroke) }))
    .filter((it): it is { stroke: RecognitionStroke; bbox: BBox } => it.bbox !== null)
    .sort((a, b) => a.bbox.x0 - b.bbox.x0);

  if (items.length === 0) return [];

  const heights = items.map((it) => Math.max(1, it.bbox.y1 - it.bbox.y0)).sort((a, b) => a - b);
  const medianHeight = heights[Math.floor(heights.length / 2)] || 1;

  const groups: Array<{ strokes: RecognitionStroke[]; bbox: BBox }> = [];

  for (const item of items) {
    let bestIndex = -1;
    let bestScore = 0;
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      const overlap = xOverlapRatio(g.bbox, item.bbox);
      const gap = horizontalGap(g.bbox, item.bbox);
      const verticalOverlap = yOverlapRatio(g.bbox, item.bbox);
      const vGap = verticalGap(g.bbox, item.bbox);
      const near =
        !isTinyBox(item.bbox, medianHeight) &&
        !isTinyBox(g.bbox, medianHeight) &&
        Math.min(item.bbox.x1 - item.bbox.x0, g.bbox.x1 - g.bbox.x0) <= medianHeight * 0.25 &&
        gap <= medianHeight * 0.18 &&
        verticalOverlap > 0.35;
      // Strong horizontal overlap alone must not merge a fraction bar with
      // the digits above/below it — require vertical proximity as well.
      const wideFlat =
        isWideFlat(g.bbox, medianHeight) || isWideFlat(item.bbox, medianHeight);
      const bothBars =
        isWideFlat(g.bbox, medianHeight) && isWideFlat(item.bbox, medianHeight);
      const sameRow =
        overlap >= 0.28 &&
        (verticalOverlap > 0.12 ||
          bothBars ||
          (!wideFlat && vGap <= medianHeight * 0.35));
      const score = near ? Math.max(0.6, overlap) : overlap;
      if ((sameRow || near) && score > bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }
    if (bestIndex >= 0) {
      const g = groups[bestIndex];
      g.strokes.push(item.stroke);
      g.bbox = unionBBox(g.bbox, item.bbox);
    } else {
      groups.push({ strokes: [item.stroke], bbox: item.bbox });
    }
  }

  // Second pass: merge strokes that belong to one symbol but do not overlap
  // enough in the first pass (the two bars of "+", crossing strokes of "x").
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        const a = groups[i];
        const b = groups[j];
        const combined = unionBBox(a.bbox, b.bbox);
        const combinedW = combined.x1 - combined.x0;
        const combinedH = combined.y1 - combined.y0;
        if (combinedW > medianHeight * 2.1 || combinedH > medianHeight * 2.4) continue;

        const xo = xOverlapRatio(a.bbox, b.bbox);
        const yo = yOverlapRatio(a.bbox, b.bbox);
        const centerDy = Math.abs(
          (a.bbox.y0 + a.bbox.y1) / 2 - (b.bbox.y0 + b.bbox.y1) / 2,
        );
        const crossing = xo >= 0.35 && yo >= 0.1;
        const wideFlat =
          isWideFlat(a.bbox, medianHeight) || isWideFlat(b.bbox, medianHeight);
        const stacked = !wideFlat && xo >= 0.7 && centerDy <= medianHeight * 0.5;
        // i / j 的点：一个很小的笔画悬在主干正上方。点如果被拆成独立字形，
        // 会被当成上标或小数点，sin / lim 这类词就整段崩掉。
        const dotAbove =
          isDotAbove(a.bbox, b.bbox, medianHeight) ||
          isDotAbove(b.bbox, a.bbox, medianHeight);
        if (crossing || stacked || dotAbove) {
          a.strokes.push(...b.strokes);
          a.bbox = combined;
          groups.splice(j, 1);
          merged = true;
          break outer;
        }
      }
    }
  }

  return groups
    .map((g) => ({
      strokes: g.strokes,
      bbox: g.bbox,
      width: g.bbox.x1 - g.bbox.x0,
      height: g.bbox.y1 - g.bbox.y0,
      centerX: (g.bbox.x0 + g.bbox.x1) / 2,
      centerY: (g.bbox.y0 + g.bbox.y1) / 2,
    }))
    .sort((a, b) => a.bbox.x0 - b.bbox.x0);
}

function xOverlapRatio(a: BBox, b: BBox): number {
  const overlap = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  if (overlap < 0) return 0;
  // +0.5 so a perfectly vertical stroke (zero-width bbox) still counts as
  // intersecting the horizontal bar it crosses.
  return (overlap + 0.5) / Math.max(1, Math.min(a.x1 - a.x0, b.x1 - b.x0));
}

function yOverlapRatio(a: BBox, b: BBox): number {
  const overlap = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  if (overlap < 0) return 0;
  return (overlap + 0.5) / Math.max(1, Math.min(a.y1 - a.y0, b.y1 - b.y0));
}

function horizontalGap(a: BBox, b: BBox): number {
  if (b.x0 > a.x1) return b.x0 - a.x1;
  if (a.x0 > b.x1) return a.x0 - b.x1;
  return 0;
}

function verticalGap(a: BBox, b: BBox): number {
  if (b.y0 > a.y1) return b.y0 - a.y1;
  if (a.y0 > b.y1) return a.y0 - b.y1;
  return 0;
}

/** A fraction bar or long dash: wide and very flat relative to the writing. */
function isWideFlat(bbox: BBox, medianHeight: number): boolean {
  const w = bbox.x1 - bbox.x0;
  const h = bbox.y1 - bbox.y0;
  return w > medianHeight * 1.2 && h < medianHeight * 0.3;
}

/** 极小的孤立笔画：i / j 的点、小数点、噪点。 */
function isTinyBox(bbox: BBox, refHeight: number): boolean {
  return (
    bbox.x1 - bbox.x0 <= refHeight * 0.32 &&
    bbox.y1 - bbox.y0 <= refHeight * 0.32
  );
}

/**
 * 悬在另一组正上方的点 → 属于下方主干（i / j 的点）。
 * 要求点足够小、水平居中、垂直间隙小于半个字高；小数点在下基线附近，
 * 不会被这条规则误合并。
 */
function isDotAbove(dot: BBox, stem: BBox, refHeight: number): boolean {
  if (!isTinyBox(dot, refHeight) || isTinyBox(stem, refHeight)) return false;
  const cx = (dot.x0 + dot.x1) / 2;
  const tolerance = Math.max((stem.x1 - stem.x0) * 0.25, refHeight * 0.35);
  const above = dot.y1 <= stem.y0 + refHeight * 0.15;
  const close = stem.y0 - dot.y1 <= refHeight * 0.55;
  return cx >= stem.x0 - tolerance && cx <= stem.x1 + tolerance && above && close;
}

/* ================================================================== *
 * 2. Glyph classification (skeleton templates + Chamfer distance)
 * ================================================================== */

export const TEMPLATE_SIZE = 48;
/**
 * Glyph alphabet. Digits + operators + the variable letters, plus the
 * lowercase Latin letters needed for function names (sin / cos / log / ln …).
 * Handwriting users constantly write function names on the board; without
 * these templates every letter was silently dropped from the result.
 */
const TEMPLATE_CHARS = [
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
  '+', '-', '*', '/', '=', '(', ')', '.',
  ...'abcdefghijklmnopqrstuvwxyz'.split(''),
  'π',
];
const TEMPLATE_FONTS = ['DejaVu Sans', 'DejaVu Serif', 'DejaVu Sans Mono', 'sans-serif', 'serif'];
/**
 * 手写风格字体：设备上有就补充模板，没有则自动回退，不影响运行。
 * 打印字体和真实手写差异大，多一套“手写骨架”能明显减少连笔/圆角带来的误判。
 */
const HANDWRITING_FONTS = ['Segoe Print', 'Comic Sans MS', 'Bradley Hand', 'Kaiti SC', 'KaiTi'];
const HANDWRITING_CHARS = /^[0-9a-zA-Z]$/;
/** 这些字形太小/太扁，归一化会放大成别的东西（点→圆、横→方框），保持原样。 */
const NO_NORMALIZE_CHARS = new Set(['.', '-']);

interface GlyphTemplate {
  char: string;
  /** Skeleton bitmap, TEMPLATE_SIZE². */
  skeleton: Uint8Array;
  /** Chamfer distance field of the skeleton. */
  distance: Float32Array;
  /** 骨架墨点下标（预计算，分类时只遍历墨点而不是整张 48×48 位图）。 */
  inkIndices: Uint16Array;
  bbox: BBox;
}

/** 收集位图中所有墨点下标，供 Chamfer 距离快速求和。 */
function inkIndicesOf(bitmap: Uint8Array): Uint16Array {
  let count = 0;
  for (let i = 0; i < bitmap.length; i++) if (bitmap[i]) count++;
  const out = new Uint16Array(count);
  let k = 0;
  for (let i = 0; i < bitmap.length; i++) if (bitmap[i]) out[k++] = i;
  return out;
}

/* ── Personal glyph bank ───────────────────────────────────────────
 * High-confidence glyphs the user has actually written are stored locally
 * and added to the template set. Recognition then adapts to this specific
 * hand instead of only matching system fonts. Nothing leaves the device.
 */
export const USER_GLYPHS_KEY = 'omnimath-glyph-bank-v1';
const MAX_PER_CHAR = 8;
const MAX_TOTAL = 240;

/** 每个样本最多保留的笔画点数（均匀抽样，保留首尾）。 */
const MAX_POINTS_PER_STROKE = 32;

function thinStroke(points: Array<{ x: number; y: number }>): Array<{ x: number; y: number }> {
  if (points.length <= MAX_POINTS_PER_STROKE) return points;
  const step = Math.ceil(points.length / MAX_POINTS_PER_STROKE);
  const out: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < points.length; i += step) out.push(points[i]);
  const last = points[points.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

export interface UserGlyphSample {
  char: string;
  strokes: Array<Array<{ x: number; y: number }>>;
  bbox: BBox;
  addedAt: number;
}

export function loadUserGlyphSamples(): UserGlyphSample[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(USER_GLYPHS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (s): s is UserGlyphSample =>
        !!s &&
        typeof s.char === 'string' &&
        s.char.length === 1 &&
        Array.isArray(s.strokes) &&
        s.strokes.length > 0 &&
        s.bbox &&
        typeof s.bbox.x0 === 'number',
    );
  } catch {
    return [];
  }
}

export function clearUserGlyphBank(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(USER_GLYPHS_KEY);
  } catch {
    // ignore
  }
  templateCache = null;
}

/**
 * Learn from a successfully inserted math note. Only confident, non-superscript
 * glyphs are stored, so a corrected symbol cannot poison the bank too easily.
 */
export function addUserGlyphSamples(glyphs: RecognizedGlyph[]): void {
  if (typeof localStorage === 'undefined') return;
  const fresh = glyphs.filter(
    (g) =>
      g.char !== '?' &&
      g.char.length === 1 &&
      !g.text &&
      !g.superscript &&
      g.confidence >= 0.66 &&
      g.strokes.length > 0 &&
      // 允许竖直/水平的一笔（l、1、-），只排除真正的单点。
      (g.bbox.x1 > g.bbox.x0 || g.bbox.y1 > g.bbox.y0),
  );
  if (fresh.length === 0) return;

  const samples = loadUserGlyphSamples();
  const now = Date.now();
  for (const g of fresh) {
    samples.push({
      char: g.char,
      strokes: g.strokes.map((s) => thinStroke(s.points.map((p) => ({ x: p.x, y: p.y })))),
      bbox: g.bbox,
      addedAt: now,
    });
    // Keep the bank small: newest samples per character win.
    const forChar = samples.filter((s) => s.char === g.char);
    if (forChar.length > MAX_PER_CHAR) {
      const oldest = forChar.sort((a, b) => a.addedAt - b.addedAt)[0];
      const idx = samples.indexOf(oldest);
      if (idx >= 0) samples.splice(idx, 1);
    }
  }
  while (samples.length > MAX_TOTAL) samples.shift();

  try {
    localStorage.setItem(USER_GLYPHS_KEY, JSON.stringify(samples));
  } catch {
    // ignore quota errors
  }
  templateCache = null;
}

let templateCache: GlyphTemplate[] | null = null;

/**
 * 把字体骨架按包围盒等比缩放铺满模板位图，与 `rasterizeGlyph` 对用户笔迹
 * 的归一化方式保持一致。否则字号 42px 的小写字母只占画布中间一小块，
 * 与写满整格的用户笔迹做 Chamfer 距离时会天然偏大，字母几乎无法被识别。
 */
function normalizeSkeleton(skeleton: Uint8Array, bbox: BBox): Uint8Array {
  const w = Math.max(1, bbox.x1 - bbox.x0);
  const h = Math.max(1, bbox.y1 - bbox.y0);
  const pad = 3;
  const scale = (TEMPLATE_SIZE - pad * 2) / Math.max(w, h);
  const offX = (TEMPLATE_SIZE - w * scale) / 2;
  const offY = (TEMPLATE_SIZE - h * scale) / 2;
  const out = new Uint8Array(TEMPLATE_SIZE * TEMPLATE_SIZE);
  for (let y = 0; y < TEMPLATE_SIZE; y++) {
    for (let x = 0; x < TEMPLATE_SIZE; x++) {
      if (!skeleton[y * TEMPLATE_SIZE + x]) continue;
      const nx = Math.round(offX + (x - bbox.x0) * scale);
      const ny = Math.round(offY + (y - bbox.y0) * scale);
      // 缩放后的 1px 骨架容易断开，落点周围补一圈保证连通。
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const px = nx + ox;
          const py = ny + oy;
          if (px < 0 || py < 0 || px >= TEMPLATE_SIZE || py >= TEMPLATE_SIZE) continue;
          out[py * TEMPLATE_SIZE + px] = 1;
        }
      }
    }
  }
  return out;
}

/** Render + thin a character with a local font. Browser only. */
function renderTemplate(char: string, font: string): GlyphTemplate | null {
  if (typeof document === 'undefined') return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = TEMPLATE_SIZE;
    canvas.height = TEMPLATE_SIZE;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, TEMPLATE_SIZE, TEMPLATE_SIZE);
    ctx.fillStyle = '#000';
    ctx.font = `42px ${font}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(char, TEMPLATE_SIZE / 2, TEMPLATE_SIZE / 2);

    const data = ctx.getImageData(0, 0, TEMPLATE_SIZE, TEMPLATE_SIZE).data;
    const ink = new Uint8Array(TEMPLATE_SIZE * TEMPLATE_SIZE);
    for (let i = 0; i < ink.length; i++) {
      // Luma < 128 → ink
      const luma = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
      ink[i] = luma < 128 ? 1 : 0;
    }
    let skeleton = skeletonize(ink, TEMPLATE_SIZE, TEMPLATE_SIZE);
    const bbox = bitmapBBox(skeleton, TEMPLATE_SIZE, TEMPLATE_SIZE);
    if (bbox.x1 <= bbox.x0 && bbox.y1 <= bbox.y0) return null;
    if (!NO_NORMALIZE_CHARS.has(char)) {
      skeleton = normalizeSkeleton(skeleton, bbox);
    }
    return {
      char,
      skeleton,
      distance: distanceTransform(skeleton, TEMPLATE_SIZE, TEMPLATE_SIZE),
      inkIndices: inkIndicesOf(skeleton),
      bbox: bitmapBBox(skeleton, TEMPLATE_SIZE, TEMPLATE_SIZE),
    };
  } catch {
    return null;
  }
}

export function getGlyphTemplates(): GlyphTemplate[] {
  if (templateCache) return templateCache;
  const out: GlyphTemplate[] = [];
  for (const char of TEMPLATE_CHARS) {
    for (const font of TEMPLATE_FONTS) {
      const t = renderTemplate(char, font);
      if (t) out.push(t);
    }
    if (HANDWRITING_CHARS.test(char)) {
      for (const font of HANDWRITING_FONTS) {
        const t = renderTemplate(char, font);
        if (t) out.push(t);
      }
    }
  }

  // Personal samples are added alongside the fonts, never replacing them.
  for (const sample of loadUserGlyphSamples()) {
    const raster = rasterizeGlyph(sample.strokes.map((points) => ({ points })));
    if (!raster) continue;
    const skeleton = skeletonize(raster.ink, TEMPLATE_SIZE, TEMPLATE_SIZE);
    let inkCount = 0;
    for (let i = 0; i < skeleton.length; i++) inkCount += skeleton[i];
    if (inkCount === 0) continue;
    out.push({
      char: sample.char,
      skeleton,
      distance: distanceTransform(skeleton, TEMPLATE_SIZE, TEMPLATE_SIZE),
      inkIndices: inkIndicesOf(skeleton),
      bbox: bitmapBBox(skeleton, TEMPLATE_SIZE, TEMPLATE_SIZE),
    });
  }

  templateCache = out;
  return out;
}

/** Rasterize user strokes into a TEMPLATE_SIZE² ink bitmap. */
export function rasterizeGlyph(strokes: RecognitionStroke[]): { ink: Uint8Array; bbox: BBox } | null {
  const bbox = strokes.reduce<BBox | null>((acc, s) => {
    const b = strokeBBox(s);
    if (!b) return acc;
    return acc ? unionBBox(acc, b) : b;
  }, null);
  if (!bbox) return null;

  const pad = 3;
  const w = Math.max(1, bbox.x1 - bbox.x0);
  const h = Math.max(1, bbox.y1 - bbox.y0);
  const scale = (TEMPLATE_SIZE - pad * 2) / Math.max(w, h);
  const offsetX = (TEMPLATE_SIZE - w * scale) / 2;
  const offsetY = (TEMPLATE_SIZE - h * scale) / 2;

  const ink = new Uint8Array(TEMPLATE_SIZE * TEMPLATE_SIZE);
  for (const stroke of strokes) {
    let prev: { x: number; y: number } | null = null;
    for (const p of stroke.points) {
      const x = offsetX + (p.x - bbox.x0) * scale;
      const y = offsetY + (p.y - bbox.y0) * scale;
      if (prev) drawThickLine(ink, prev.x, prev.y, x, y, 1);
      prev = { x, y };
    }
    if (!prev) continue;
    // A single tap is a dot.
    drawThickLine(ink, prev.x, prev.y, prev.x + 0.01, prev.y + 0.01, 1);
  }
  return { ink, bbox: bitmapBBox(ink, TEMPLATE_SIZE, TEMPLATE_SIZE) };
}

/** Distance from every pixel to the nearest ink pixel (chamfer 3-4). */
export function distanceTransform(ink: Uint8Array, w: number, h: number): Float32Array {
  const INF = 1e9;
  const d = new Float32Array(w * h);
  for (let i = 0; i < d.length; i++) d[i] = ink[i] ? 0 : INF;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (i === 0) continue;
      let v = d[i];
      if (x > 0) v = Math.min(v, d[i - 1] + 1);
      if (y > 0) v = Math.min(v, d[i - w] + 1);
      if (x > 0 && y > 0) v = Math.min(v, d[i - w - 1] + 1.4142);
      if (x < w - 1 && y > 0) v = Math.min(v, d[i - w + 1] + 1.4142);
      d[i] = v;
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      let v = d[i];
      if (x < w - 1) v = Math.min(v, d[i + 1] + 1);
      if (y < h - 1) v = Math.min(v, d[i + w] + 1);
      if (x < w - 1 && y < h - 1) v = Math.min(v, d[i + w + 1] + 1.4142);
      if (x > 0 && y < h - 1) v = Math.min(v, d[i + w - 1] + 1.4142);
      d[i] = v;
    }
  }
  return d;
}

function bitmapBBox(ink: Uint8Array, w: number, h: number): BBox {
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!ink[y * w + x]) continue;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return { x0: 0, y0: 0, x1: 0, y1: 0 };
  return { x0, y0, x1, y1 };
}

interface Classification {
  char: string;
  confidence: number;
  alternatives: string[];
}

/** Compare one glyph bitmap against every template. */
export function classifyGlyphBitmap(ink: Uint8Array, templates: GlyphTemplate[]): Classification {
  if (templates.length === 0) {
    return { char: '?', confidence: 0, alternatives: [] };
  }
  const userIndices = inkIndicesOf(ink);
  const userDistance = distanceTransform(ink, TEMPLATE_SIZE, TEMPLATE_SIZE);
  const scores = new Map<string, number>();

  for (const t of templates) {
    let sumUser = 0;
    for (let k = 0; k < userIndices.length; k++) sumUser += t.distance[userIndices[k]];
    let sumTemplate = 0;
    for (let k = 0; k < t.inkIndices.length; k++) sumTemplate += userDistance[t.inkIndices[k]];
    const userCount = userIndices.length;
    const templateCount = t.inkIndices.length;
    if (userCount === 0 || templateCount === 0) continue;
    const score = (sumUser / userCount + sumTemplate / templateCount) / 2;
    const prev = scores.get(t.char);
    if (prev === undefined || score < prev) scores.set(t.char, score);
  }

  const ranked = [...scores.entries()].sort((a, b) => a[1] - b[1]);
  if (ranked.length === 0) return { char: '?', confidence: 0, alternatives: [] };

  const [bestChar, bestScore] = ranked[0];
  // 0 px error → 1.0; ~7 px average error 0. Confidence is advisory.
  const confidence = Math.max(0, Math.min(1, 1 - bestScore / 7));
  const char = confidence < 0.28 ? '?' : bestChar;
  return {
    char,
    confidence,
    // When the best guess is rejected as "?", keep it in the alternatives so
    // the word-level correction pass can still use it (e.g. "s?n" → "sin").
    alternatives: (char === '?' ? ranked.slice(0, 3) : ranked.slice(1, 4)).map(([c]) => c),
  };
}

/* ================================================================== *
 * 3. Geometry shortcuts
 *
 * Digits need templates, but + − = / × . ( ) are structurally trivial and
 * much more reliable with a few geometric rules. Running these first stops
 * "2 + 3" from being classified as a single odd glyph.
 * ================================================================== */

export interface GeometryHint {
  char: string;
  confidence: number;
  alternatives: string[];
  reason?: string;
}

export function classifyGlyphGeometry(group: GlyphGroup): GeometryHint | null {
  const strokes = group.strokes.filter((s) => s.points.length >= 2);
  if (strokes.length === 0) return null;
  const groupW = Math.max(1, group.width);
  const groupH = Math.max(1, group.height);

  if (groupW <= 6 && groupH <= 6) {
    // 极短的一横（连字符 / 减号）比点更宽：先按长宽比区分，
    // 否则 6×1 的短横会被当成小数点。
    if (groupW >= Math.max(4, groupH * 2)) {
      return { char: '-', confidence: 0.8, alternatives: [] };
    }
    return { char: '.', confidence: 0.9, alternatives: [] };
  }

  if (strokes.length === 1) {
    const stroke = strokes[0];
    const bbox = strokeBBox(stroke);
    if (!bbox) return null;
    const w = Math.max(1, bbox.x1 - bbox.x0);
    const h = Math.max(1, bbox.y1 - bbox.y0);
    const aspect = w / h;
    const line = pathLinearity(stroke);
    const reversals = directionReversals(stroke);

    if (aspect >= 2.0 && h <= Math.max(6, w * 0.3) && line.straightness > 0.72) {
      return { char: '-', confidence: 0.88, alternatives: [] };
    }
    // 括号：细高、向一侧鼓出，而且最鼓的位置在笔画中点附近。
    // 前者把它和竖线 1 分开，后者避免把 y / g 这种「下半段带钩」的字母
    // 误判成括号（它们的最大偏移在顶部或底部，不在中点）。
    if (h / w >= 1.4 && line.straightness < 0.98) {
      const pts0 = stroke.points;
      const chordDx = Math.abs(pts0[0].x - pts0[pts0.length - 1].x);
      // 括号从上方写到下方，首尾基本在同一个 x 上；s / n / y 的收笔会明显偏开。
      const verticalChord = chordDx <= Math.max(4, h * 0.15);
      const { bulge, peakDy } = bracketBulge(stroke);
      if (verticalChord && Math.abs(bulge) > Math.max(3, h * 0.1) && peakDy <= h * 0.24) {
        return {
          char: bulge < 0 ? '(' : ')',
          confidence: 0.7,
          alternatives: [],
          reason: 'arc-bulge',
        };
      }
    }
    if (h / w >= 2.6 && w <= Math.max(6, h * 0.3) && line.straightness > 0.8) {
      // 竖线既可能是 1 也可能是 l / i；字母上下文由词级纠错决定。
      return { char: '1', confidence: 0.62, alternatives: ['l', 'i'], reason: 'vertical-line' };
    }
    if (aspect >= 0.45 && aspect <= 2.2 && closureRatio(stroke) < 0.22) {
      return { char: '0', confidence: 0.55, alternatives: ['o'], reason: 'closed-loop' };
    }

    // Loop digits: 6 / 8 / 9 all cross themselves. Vertical ink density
    // separates a top loop (9) from a bottom loop (6).
    const selfCrossings = countSelfIntersections(stroke);
    if (selfCrossings >= 1 && h / w >= 1.05) {
      const density = verticalDensity(stroke);
      if (selfCrossings >= 2 && density.top > 0.3 && density.bottom > 0.3) {
        return { char: '8', confidence: 0.58, alternatives: ['b'], reason: `loops(${selfCrossings})` };
      }
      if (density.top > density.bottom * 1.2) {
        return { char: '9', confidence: 0.66, alternatives: ['g', 'q'], reason: `loop-top(${selfCrossings})` };
      }
      if (density.bottom > density.top * 1.2) {
        return { char: '6', confidence: 0.66, alternatives: ['b'], reason: `loop-bottom(${selfCrossings})` };
      }
    }

    // "2": a flat horizontal bar at the bottom, ending on the right edge.
    if (hasFlatBar(stroke, 'bottom') && stroke.points[stroke.points.length - 1].x > bbox.x0 + w * 0.72) {
      return { char: '2', confidence: 0.72, alternatives: ['z'], reason: 'bottom-bar' };
    }
    // "3": two right-facing bumps, both endpoints on the left.
    if (
      reversals >= 2 &&
      stroke.points[0].x < bbox.x0 + w * 0.55 &&
      stroke.points[stroke.points.length - 1].x < bbox.x0 + w * 0.55
    ) {
      return { char: '3', confidence: 0.68, alternatives: [], reason: 'double-bump' };
    }
    // "7": a flat top bar followed by a descending diagonal.
    if (hasFlatBar(stroke, 'top')) {
      return { char: '7', confidence: 0.56, alternatives: [], reason: 'top-bar' };
    }
    if (line.pathRatio < 1.3 && w > 12 && h > 12) {
      const p0 = stroke.points[0];
      const p1 = stroke.points[stroke.points.length - 1];
      const dx = Math.abs(p1.x - p0.x);
      const dy = Math.abs(p1.y - p0.y);
      if (dx > w * 0.55 && dy > h * 0.55) {
        return { char: '/', confidence: 0.66, alternatives: [] };
      }
    }
    return null;
  }

  if (strokes.length === 2) {
    const a = strokeBBox(strokes[0]);
    const b = strokeBBox(strokes[1]);
    if (!a || !b) return null;
    const aw = Math.max(1, a.x1 - a.x0);
    const ah = Math.max(1, a.y1 - a.y0);
    const bw = Math.max(1, b.x1 - b.x0);
    const bh = Math.max(1, b.y1 - b.y0);
    const aHoriz = aw / ah >= 2.2;
    const bHoriz = bw / bh >= 2.2;
    const aVert = ah / aw >= 2.2;
    const bVert = bh / bw >= 2.2;

    if (aHoriz && bHoriz) {
      const gap = Math.abs((a.y0 + a.y1) / 2 - (b.y0 + b.y1) / 2);
      if (gap >= 2 && gap <= Math.max(ah, bh) * 1.8 + 10) {
        return { char: '=', confidence: 0.88, alternatives: [] };
      }
    }
    if ((aHoriz && bVert) || (aVert && bHoriz)) {
      return { char: '+', confidence: 0.86, alternatives: [] };
    }

    // "y": a V-shaped body with a narrower descender below it. This is the
    // common two-stroke way of writing y, and it keeps y from being read as 7.
    const a0 = a.y0 <= b.y0 ? a : b;
    const tail = a.y0 <= b.y0 ? b : a;
    const mainW = Math.max(1, a0.x1 - a0.x0);
    const mainH = Math.max(1, a0.y1 - a0.y0);
    const tailW = Math.max(1, tail.x1 - tail.x0);
    const tailH = Math.max(1, tail.y1 - tail.y0);
    const mainStroke = a.y0 <= b.y0 ? strokes[0] : strokes[1];
    if (
      tail.y1 > a0.y1 + mainH * 0.2 &&
      tailW < mainW * 0.9 &&
      tailH > mainH * 0.5 &&
      tailW / tailH < 2.2 &&
      directionReversalsY(mainStroke) >= 1
    ) {
      return { char: 'y', confidence: 0.68, alternatives: [] };
    }

    if (
      lineOf(strokes[0]).straightness > 0.72 &&
      lineOf(strokes[1]).straightness > 0.72 &&
      segmentsIntersect(
        strokes[0].points[0],
        strokes[0].points[strokes[0].points.length - 1],
        strokes[1].points[0],
        strokes[1].points[strokes[1].points.length - 1],
      )
    ) {
      return { char: '*', confidence: 0.68, alternatives: ['x'] };
    }
  }

  return null;
}

function lineOf(stroke: RecognitionStroke) {
  return pathLinearity(stroke);
}

/** 1 = perfectly straight chord; lower = more curved. */
function pathLinearity(stroke: RecognitionStroke) {
  const pts = stroke.points;
  let path = 0;
  for (let i = 1; i < pts.length; i++) {
    path += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  }
  const chord = Math.hypot(pts[pts.length - 1].x - pts[0].x, pts[pts.length - 1].y - pts[0].y);
  return {
    straightness: chord / Math.max(1e-6, path),
    pathRatio: path / Math.max(1e-6, chord),
  };
}

function closureRatio(stroke: RecognitionStroke): number {
  const bbox = strokeBBox(stroke);
  if (!bbox) return 1;
  const diag = Math.hypot(bbox.x1 - bbox.x0, bbox.y1 - bbox.y0) || 1;
  const pts = stroke.points;
  return Math.hypot(pts[pts.length - 1].x - pts[0].x, pts[pts.length - 1].y - pts[0].y) / diag;
}

/**
 * 括号的单侧鼓包：返回相对首尾连线的最大水平偏移，以及该偏移点
 * 距离连线中点的高度差。真正的括号在中点最鼓；y / g 的钩在顶部或底部。
 */
function bracketBulge(stroke: RecognitionStroke): { bulge: number; peakDy: number } {
  const pts = stroke.points;
  if (pts.length === 0) return { bulge: 0, peakDy: 0 };
  const first = pts[0];
  const last = pts[pts.length - 1];
  const midX = (first.x + last.x) / 2;
  const midY = (first.y + last.y) / 2;
  let bulge = 0;
  let peakDy = 0;
  // 首尾点必然落在连线上，只看中间点：否则 'n' 的右端点会被当成鼓包。
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i];
    const dx = p.x - midX;
    if (Math.abs(dx) > Math.abs(bulge)) {
      bulge = dx;
      peakDy = Math.abs(p.y - midY);
    }
  }
  return { bulge, peakDy };
}

/** Count horizontal direction reversals (a "3" has two bumps, ")" only one). */
function directionReversals(stroke: RecognitionStroke): number {
  const pts = stroke.points;
  let lastSign = 0;
  let reversals = 0;
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x - pts[i - 1].x;
    if (Math.abs(dx) < 1.2) continue;
    const sign = Math.sign(dx);
    if (lastSign !== 0 && sign !== lastSign) reversals++;
    lastSign = sign;
  }
  return reversals;
}

/** Vertical direction reversals (a V-shaped "y" goes down then up). */
function directionReversalsY(stroke: RecognitionStroke): number {
  const pts = stroke.points;
  let lastSign = 0;
  let reversals = 0;
  for (let i = 1; i < pts.length; i++) {
    const dy = pts[i].y - pts[i - 1].y;
    if (Math.abs(dy) < 1.2) continue;
    const sign = Math.sign(dy);
    if (lastSign !== 0 && sign !== lastSign) reversals++;
    lastSign = sign;
  }
  return reversals;
}

/** Is there a long, almost horizontal segment at the top/bottom of the stroke? */
function hasFlatBar(stroke: RecognitionStroke, where: 'top' | 'bottom'): boolean {
  const bbox = strokeBBox(stroke);
  if (!bbox) return false;
  const w = Math.max(1, bbox.x1 - bbox.x0);
  const h = Math.max(1, bbox.y1 - bbox.y0);
  const pts = stroke.points;
  if (pts.length < 4) return false;

  // Walk from the relevant end while the pen stays on the same horizontal
  // line. Using a fixed % of points fails because pointer sampling is not
  // uniform along the path.
  const tolerance = Math.max(3, h * 0.13);
  const run: RecognitionPoint[] = [];
  if (where === 'bottom') {
    const ref = pts[pts.length - 1].y;
    for (let i = pts.length - 1; i >= 0; i--) {
      if (Math.abs(pts[i].y - ref) > tolerance) break;
      run.push(pts[i]);
    }
  } else {
    const ref = pts[0].y;
    for (let i = 0; i < pts.length; i++) {
      if (Math.abs(pts[i].y - ref) > tolerance) break;
      run.push(pts[i]);
    }
  }
  if (run.length < 3) return false;

  let minX = Infinity;
  let maxX = -Infinity;
  let sumY = 0;
  for (const p of run) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    sumY += p.y;
  }
  const meanY = sumY / run.length;
  const wide = maxX - minX >= w * 0.65;
  const located =
    where === 'bottom' ? meanY >= bbox.y0 + h * 0.68 : meanY <= bbox.y0 + h * 0.32;
  return wide && located;
}

/** Fraction of ink points above / below the vertical midline. */
function verticalDensity(stroke: RecognitionStroke): { top: number; bottom: number } {
  const bbox = strokeBBox(stroke);
  if (!bbox) return { top: 0, bottom: 0 };
  const mid = (bbox.y0 + bbox.y1) / 2;
  let top = 0;
  let bottom = 0;
  for (const p of stroke.points) {
    if (p.y < mid) top++;
    else bottom++;
  }
  const total = Math.max(1, top + bottom);
  return { top: top / total, bottom: bottom / total };
}

/** Number of times the stroke crosses itself (loops in 6/8/9). */
function countSelfIntersections(stroke: RecognitionStroke): number {
  const pts = stroke.points;
  const step = Math.max(1, Math.floor(pts.length / 40));
  const sampled: RecognitionPoint[] = [];
  for (let i = 0; i < pts.length; i += step) sampled.push(pts[i]);
  let count = 0;
  for (let i = 0; i < sampled.length - 1; i++) {
    for (let j = i + 3; j < sampled.length - 1; j++) {
      if (
        segmentsIntersect(sampled[i], sampled[i + 1], sampled[j], sampled[j + 1])
      ) {
        count++;
        if (count > 4) return count;
      }
    }
  }
  return count;
}

function segmentsIntersect(
  a: RecognitionPoint,
  b: RecognitionPoint,
  c: RecognitionPoint,
  d: RecognitionPoint,
): boolean {
  const cross = (p: RecognitionPoint, q: RecognitionPoint, r: RecognitionPoint) =>
    (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const d1 = cross(a, b, c);
  const d2 = cross(a, b, d);
  const d3 = cross(c, d, a);
  const d4 = cross(c, d, b);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/* ================================================================== *
 * 4. Layout reconstruction
 * ================================================================== */

const DIGITS = new Set(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']);

type GlyphKind = 'digit' | 'dot' | 'var' | 'close' | 'open' | 'op' | 'fraction' | 'other';

function glyphKind(g: RecognizedGlyph): GlyphKind {
  if (g.text) return 'fraction';
  const ch = g.char;
  if (DIGITS.has(ch)) return 'digit';
  if (ch === '.') return 'dot';
  if (ch === 'x' || ch === 'y') return 'var';
  if (ch === ')') return 'close';
  if (ch === '(') return 'open';
  if (ch === '+' || ch === '-' || ch === '*' || ch === '/' || ch === '=' || ch === '^') {
    return 'op';
  }
  return 'other';
}

function startsValue(kind: GlyphKind): boolean {
  return kind === 'digit' || kind === 'var' || kind === 'fraction' || kind === 'open';
}

/**
 * Rebuild implicit multiplication without breaking numbers.
 * Multi-digit numbers arrive as separate glyphs ("3" "6" "5" → 365), so a
 * digit followed by a digit must never gain a `*`.
 */
function needsMultiplication(prev: RecognizedGlyph, next: RecognizedGlyph): boolean {
  const a = glyphKind(prev);
  const b = glyphKind(next);
  if (b === 'dot' || a === 'dot') return false;
  if (a === 'digit' && b === 'digit') return false;
  if (a === 'open' || a === 'op' || a === 'other') return false;
  if (b === 'close' || b === 'op' || b === 'other') return false;
  return startsValue(b);
}

function tokenText(g: RecognizedGlyph): string {
  return g.text ?? g.char;
}

/**
 * 小数点 vs 噪点。
 *
 * 分类器会把任何极小的点都当作 "."。只有紧挨数字（前或后）的点才可能是
 * 小数点；孤立的小点通常是笔尖误触，降级为 "?"（后续重建表达式时会被
 * 忽略），避免 "2+" 被读成 "2+." 这类无效表达式。
 */
export function refineDotGlyphs(glyphs: RecognizedGlyph[]): RecognizedGlyph[] {
  for (let i = 0; i < glyphs.length; i++) {
    const g = glyphs[i];
    if (g.text || g.char !== '.' || g.superscript || g.subscript) continue;
    const prev = glyphs[i - 1];
    const next = glyphs[i + 1];
    const prevDigit =
      !!prev && !prev.superscript && !prev.subscript && DIGITS.has(prev.char);
    const nextDigit =
      !!next && !next.superscript && !next.subscript && DIGITS.has(next.char);
    if (!prevDigit && !nextDigit) {
      g.char = '?';
      g.displayChar = '?';
      g.confidence = Math.min(g.confidence, 0.2);
      g.reason = 'stray-dot';
    }
  }
  return glyphs;
}

export function buildRecognizedText(glyphs: RecognizedGlyph[]): string {
  let out = '';
  let prev: RecognizedGlyph | null = null;
  let i = 0;
  while (i < glyphs.length) {
    const g = glyphs[i];
    if (g.char === '?' && !g.text) {
      i++;
      continue;
    }
    if (g.superscript || g.subscript) {
      // 一段连续的上下标合并成一个脚本簇：同一基座写出的 x₁² / x²₁
      // 常因笔顺不同而上下标交错，统一输出「先下标、后上标」的
      // `x_1^2`（mathjs 里 x_1 是合法标识符，再做幂运算）。
      const sup: string[] = [];
      const sub: string[] = [];
      let j = i;
      while (j < glyphs.length && (glyphs[j].superscript || glyphs[j].subscript)) {
        const s = glyphs[j];
        if (!(s.char === '?' && !s.text)) {
          (s.superscript ? sup : sub).push(tokenText(s));
        }
        j++;
      }
      const subJoined = sub.join('');
      if (subJoined) {
        out += /^[0-9A-Za-z]+$/.test(subJoined) ? `_${subJoined}` : `_(${subJoined})`;
      }
      const supJoined = sup.join('');
      if (supJoined) {
        out += `^${/^[0-9a-zA-Z]$/.test(supJoined) ? supJoined : `(${supJoined})`}`;
      }
      if (subJoined || supJoined) prev = glyphs[j - 1];
      i = j;
      continue;
    }
    const token = tokenText(g);
    if (prev && needsMultiplication(prev, g)) out += '*';
    out += token;
    prev = g;
    i++;
  }
  // sin x 手写常被拆成 s i n x，拼出来是 "sin*x"。补成 sin(x)，否则
  // mathjs 会把 sin 当成变量相乘，识别结果显示「没有用」。
  return attachFunctionArguments(out);
}

/* ================================================================== *
 * 2b. Word-level correction (function names)
 *
 * Per-glyph classification cannot tell "1" from "l" or "5" from "s": both
 * are the same ink. Math notation gives us a strong prior though — a run of
 * 2+ letters is almost always a function name (sin / cos / log / ln …).
 * This pass snaps such runs to the nearest known name, repairing the exact
 * confusions the template classifier is prone to.
 * ================================================================== */

const MATH_WORDS = [
  'sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'asin', 'acos', 'atan',
  'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh', 'atan2',
  'log', 'ln', 'lg', 'log10', 'log2', 'sqrt', 'cbrt', 'nthroot',
  'abs', 'exp', 'floor', 'ceil', 'round', 'sign', 'min', 'max',
  'mod', 'pow', 'det', 'lim', 'pi', 'tau', 'phi', 'deg', 'rad',
];

const CONFUSABLE_LETTERS: Record<string, string[]> = {
  '0': ['o'],
  '1': ['l', 'i'],
  '2': ['z'],
  '5': ['s'],
  '6': ['b'],
  '8': ['b'],
  '9': ['g', 'q'],
};

/**
 * 常见「长得一样」的字形。单字形模板无法区分它们，收集为候选字符供
 * 用户一键修正；这里只补充候选，不改变分类器给出的结果。
 */
const CONFUSABLE_ALTERNATIVES: Record<string, string[]> = {
  '0': ['o'],
  o: ['0'],
  '1': ['l', 'i'],
  l: ['1', 'i'],
  i: ['1', 'l'],
  '2': ['z'],
  z: ['2'],
  '5': ['s'],
  s: ['5'],
};

/** 合并模板候选与常见混淆字符（去重、最多 4 个）。 */
export function withConfusableAlternatives(
  char: string,
  alternatives: string[] = [],
): string[] {
  if (char.length !== 1) return alternatives;
  const merged = [...alternatives, ...(CONFUSABLE_ALTERNATIVES[char] ?? [])].filter(
    (c) => c && c !== char,
  );
  return [...new Set(merged)].slice(0, 4);
}

/** Possible letters this glyph could stand for inside a word. */
function letterCandidates(g: RecognizedGlyph): string[] {
  if (g.text) return [];
  const ch = g.char.toLowerCase();
  const out: string[] = [];
  // 字母本身、以及数字被误读成字母的情况；数字自身也保留，
  // 这样 log2 / log10 这类带数字的函数名不会被排斥。
  if (/^[a-z0-9]$/.test(ch)) out.push(ch);
  const mapped = CONFUSABLE_LETTERS[ch];
  if (mapped) out.push(...mapped);
  if (ch === '?') {
    for (const alt of g.alternatives ?? []) {
      if (/^[a-z]$/i.test(alt)) out.push(alt.toLowerCase());
    }
  }
  return [...new Set(out)];
}

function isWordGlyph(g: RecognizedGlyph): boolean {
  if (g.text || g.superscript || g.subscript) return false;
  if (/^[a-z]$/i.test(g.char) || g.char === '?') return true;
  return g.char in CONFUSABLE_LETTERS;
}

/** Best known math word for a run of glyphs, or null when none is close. */
function matchMathWord(run: RecognizedGlyph[]): string | null {
  const candidates = run.map(letterCandidates);
  if (candidates.some((c) => c.length === 0)) return null;
  let best: { word: string; cost: number } | null = null;
  for (const word of MATH_WORDS) {
    if (word.length !== run.length) continue;
    let cost = 0;
    for (let k = 0; k < word.length; k++) {
      if (candidates[k].includes(word[k])) continue;
      if (run[k].char === '?') {
        // "?" has no usable guess: allow it as a wildcard, but cost more than
        // a confident letter match so a real letter match still wins.
        cost += 0.5;
        if (cost > 1) break;
        continue;
      }
      // A replacement is only credible when the classifier actually listed
      // that character as an alternative. "logx" must not become "log2".
      const alts = (run[k].alternatives ?? []).map((a) => a.toLowerCase());
      if (!alts.includes(word[k])) {
        cost = 2;
        break;
      }
      cost += 1;
      if (cost > 1) break;
    }
    if (cost > 1) continue;
    if (!best || cost < best.cost) best = { word, cost };
  }
  return best?.word ?? null;
}

/**
 * Rewrite consecutive letter-like glyphs into known function names.
 * Mutates the glyphs in place and returns the same array.
 */
export function applyMathWordCorrection(glyphs: RecognizedGlyph[]): RecognizedGlyph[] {
  let i = 0;
  while (i < glyphs.length) {
    if (!isWordGlyph(glyphs[i])) {
      i++;
      continue;
    }
    let j = i;
    while (j < glyphs.length && isWordGlyph(glyphs[j])) j++;
    const run = glyphs.slice(i, j);
    if (run.length >= 2 && run.length <= 12) {
      // 先试整段（sin / cos / log）；手写时参数变量通常紧贴函数名，
      // 会被并进同一个字母段（s i n x 是一段 4 个字形），整段匹配不到，
      // 这时再按前缀匹配，把 sin 从 sinx 里拆出来。
      let word = matchMathWord(run);
      let used = run.length;
      if (!word) {
        for (let len = Math.min(12, run.length - 1); len >= 2; len--) {
          const prefix = matchMathWord(run.slice(0, len));
          if (prefix) {
            word = prefix;
            used = len;
            break;
          }
        }
      }
      // 纠正也要保守：2 个字母的短词只在后面紧跟 "(" 或一个操作数时才认，
      // 否则 y 的两笔被误识成 "1n" 就会被强改成 "ln"（y=x² → ln=x*2）。
      // 3 个字母以上（sin / cos / log）辨识度足够，直接纠正。
      const nextChar = used < run.length ? run[used].char : glyphs[j]?.char;
      const followedByCall = nextChar === '(';
      const followedByValue = !!nextChar && /^[0-9a-zA-Z]$/.test(nextChar);
      const shortCall = (word === 'ln' || word === 'lg') && followedByValue;
      const safe = followedByCall || (word?.length ?? 0) >= 3 || word === 'pi' || shortCall;
      if (word && safe) {
        for (let k = 0; k < used; k++) {
          const g = run[k];
          g.char = word[k];
          g.displayChar = word[k];
          g.confidence = Math.max(g.confidence, 0.6);
          g.reason = 'lexicon';
        }
      }
    }
    i = j;
  }
  return glyphs;
}

/**
 * A cross glyph ("×") is ambiguous: it is either the multiplication sign or
 * the letter x. In math notation the two never appear in the same position —
 * a cross in operand position (after "(" / an operator / at the start, or
 * before ")" / an operator) must be the variable x.
 */
export function disambiguateCrossGlyphs(glyphs: RecognizedGlyph[]): RecognizedGlyph[] {
  for (let i = 0; i < glyphs.length; i++) {
    const g = glyphs[i];
    if (g.char !== '*' || g.text) continue;
    let prev: RecognizedGlyph | null = null;
    for (let k = i - 1; k >= 0; k--) {
      if (!glyphs[k].superscript && !glyphs[k].subscript) { prev = glyphs[k]; break; }
    }
    let next: RecognizedGlyph | null = null;
    for (let k = i + 1; k < glyphs.length; k++) {
      if (!glyphs[k].superscript && !glyphs[k].subscript) { next = glyphs[k]; break; }
    }
    const prevKind = prev ? glyphKind(prev) : null;
    const nextKind = next ? glyphKind(next) : null;
    const operandPosition = !prev || prevKind === 'open' || prevKind === 'op';
    const expressionEnd = !next || nextKind === 'close' || nextKind === 'op';
    if (operandPosition || expressionEnd) {
      g.char = 'x';
      g.displayChar = 'x';
      g.reason = 'cross-variable';
    }
  }
  return glyphs;
}

/* ================================================================== *
 * 3b. Math word correction is applied in `recognizeMathInk` below.
 * ================================================================== */

/**
 * Decide whether a glyph group is a superscript or subscript of `base`.
 *
 * 上标：更小且中心明显高于基线；下标：更小且中心明显低于基线。
 * 下标还要求基线是「值」（字母/数字/右括号），避免把运算符后的
 * 低矮数字误判成下标。阈值刻意偏严，宁可漏判也不要把正常书写拆坏。
 */
export function detectScriptPosition(
  group: Pick<GlyphGroup, 'height' | 'centerY' | 'bbox'>,
  base: RecognizedGlyph | null,
): { superscript: boolean; subscript: boolean } {
  if (!base || group.height <= 0) return { superscript: false, subscript: false };
  const baseHeight = base.bbox.y1 - base.bbox.y0;
  if (baseHeight <= 0) return { superscript: false, subscript: false };
  const baseCenterY = (base.bbox.y0 + base.bbox.y1) / 2;

  const above = group.centerY < baseCenterY - baseHeight * 0.28;
  const smaller = group.height < baseHeight * 0.85;
  if (above && smaller) return { superscript: true, subscript: false };

  const baseIsValue = /^[0-9A-Za-z)\]]$/.test(base.char);
  const below = group.centerY > baseCenterY + baseHeight * 0.22;
  const smallEnough = group.height < baseHeight * 0.78;
  return { superscript: false, subscript: baseIsValue && below && smallEnough };
}

/**
 * 下标显示映射：优先用 Unicode 下标字符（x₂、log₂），
 * 没有对应字形的字符返回 null，调用方回退到 _(...) 形式。
 */
const SUBSCRIPT_MAP: Record<string, string> = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄',
  '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
  '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎',
  a: 'ₐ', e: 'ₑ', h: 'ₕ', i: 'ᵢ', j: 'ⱼ', k: 'ₖ', l: 'ₗ',
  m: 'ₘ', n: 'ₙ', o: 'ₒ', p: 'ₚ', r: 'ᵣ', s: 'ₛ', t: 'ₜ',
  u: 'ᵤ', v: 'ᵥ', x: 'ₓ',
};

export function toSubscriptDisplay(text: string): string | null {
  let out = '';
  for (const ch of text) {
    const mapped = SUBSCRIPT_MAP[ch];
    if (!mapped) return null;
    out += mapped;
  }
  return out;
}

/**
 * Human-readable display string. Consecutive superscript glyphs are grouped
 * into one caret so x²³ shows as x^(23) instead of x^2^3.
 */
export function buildRecognizedDisplay(glyphs: RecognizedGlyph[]): string {
  let out = '';
  let i = 0;
  while (i < glyphs.length) {
    const g = glyphs[i];
    if (g.superscript || g.subscript) {
      // 与 buildRecognizedText 一致：上下标交错时先显示下标，再显示上标。
      const sup: string[] = [];
      const sub: string[] = [];
      let j = i;
      while (j < glyphs.length && (glyphs[j].superscript || glyphs[j].subscript)) {
        (glyphs[j].superscript ? sup : sub).push(glyphs[j].displayChar);
        j++;
      }
      const subJoined = sub.join('');
      if (subJoined) out += toSubscriptDisplay(subJoined) ?? `_(${subJoined})`;
      const supJoined = sup.join('');
      if (supJoined) out += supJoined.length <= 1 ? `^${supJoined}` : `^(${supJoined})`;
      i = j;
      continue;
    }
    out += g.displayChar;
    i++;
  }
  return out;
}

/**
 * Turn the flat glyph list into 2D tokens: a wide horizontal bar with glyphs
 * above and below becomes one fraction token.
 */
export function buildFractionLayout(glyphs: RecognizedGlyph[]): RecognizedGlyph[] {
  if (glyphs.length < 3) return glyphs;

  const widths = glyphs
    .filter((g) => g.char !== '-' && !g.text)
    .map((g) => Math.max(1, g.bbox.x1 - g.bbox.x0))
    .sort((a, b) => a - b);
  const heights = glyphs
    .map((g) => Math.max(1, g.bbox.y1 - g.bbox.y0))
    .sort((a, b) => a - b);
  if (widths.length === 0) return glyphs;
  const medianWidth = widths[Math.floor(widths.length / 2)];
  const medianHeight = heights[Math.floor(heights.length / 2)];

  const consumed = new Set<number>();
  const tokens = new Map<number, RecognizedGlyph>();

  // 候选分数条按宽度从大到小处理：外层分数条通常更宽，先建立外层 token，
  // 再递归识别分子/分母中的嵌套分数（(1/2)/(3/4)）。
  const barCandidates: number[] = [];
  for (let i = 0; i < glyphs.length; i++) {
    const bar = glyphs[i];
    if (bar.superscript || bar.text || bar.char !== '-') continue;
    const barWidth = bar.bbox.x1 - bar.bbox.x0;
    const barHeight = bar.bbox.y1 - bar.bbox.y0;
    if (barWidth < medianWidth * 1.5 || barHeight > medianHeight * 0.45) continue;
    barCandidates.push(i);
  }
  barCandidates.sort(
    (a, b) =>
      glyphs[b].bbox.x1 - glyphs[b].bbox.x0 - (glyphs[a].bbox.x1 - glyphs[a].bbox.x0),
  );

  for (const i of barCandidates) {
    if (consumed.has(i)) continue;
    const bar = glyphs[i];
    const barWidth = bar.bbox.x1 - bar.bbox.x0;

    const tol = Math.max(4, medianHeight * 0.22);
    const above: number[] = [];
    const below: number[] = [];
    for (let j = 0; j < glyphs.length; j++) {
      if (j === i || consumed.has(j)) continue;
      const g = glyphs[j];
      if (g.text || g.char === '?') continue;
      const cx = (g.bbox.x0 + g.bbox.x1) / 2;
      if (cx < bar.bbox.x0 - barWidth * 0.2 || cx > bar.bbox.x1 + barWidth * 0.2) continue;
      // 分子/分母内部可能还有分数条（嵌套分数），因此 '-' 也要参与分组，
      // 交给递归的 buildFractionLayout 再判断它是不是分数条。
      if (g.bbox.y1 <= bar.bbox.y0 + tol) above.push(j);
      else if (g.bbox.y0 >= bar.bbox.y1 - tol) below.push(j);
    }
    if (above.length === 0 || below.length === 0) continue;

    above.sort((a, b) => glyphs[a].bbox.x0 - glyphs[b].bbox.x0);
    below.sort((a, b) => glyphs[a].bbox.x0 - glyphs[b].bbox.x0);
    // Fraction parts are positioned by the bar, not by a superscript baseline.
    // 递归处理分子/分母内部的分数条，支持 (1/2)/(3/4) 这类嵌套分数。
    const numGlyphs = buildFractionLayout(
      above.map((j) => ({ ...glyphs[j], superscript: false })),
    );
    const denGlyphs = buildFractionLayout(
      below.map((j) => ({ ...glyphs[j], superscript: false })),
    );
    const numText = buildRecognizedText(numGlyphs);
    const denText = buildRecognizedText(denGlyphs);
    if (!numText || !denText) continue;

    const numDisplay = numGlyphs.map((g) => g.displayChar).join('');
    const denDisplay = denGlyphs.map((g) => g.displayChar).join('');
    const tokenTextValue = `(${numText})/(${denText})`;
    const parts = [...above, ...below].map((j) => glyphs[j]);
    const confidence =
      parts.reduce((sum, g) => sum + g.confidence, bar.confidence) / (parts.length + 1);
    const fractionBBox = {
      x0: Math.min(bar.bbox.x0, ...parts.map((g) => g.bbox.x0)),
      y0: Math.min(bar.bbox.y0, ...parts.map((g) => g.bbox.y0)),
      x1: Math.max(bar.bbox.x1, ...parts.map((g) => g.bbox.x1)),
      y1: Math.max(bar.bbox.y1, ...parts.map((g) => g.bbox.y1)),
    };

    tokens.set(i, {
      char: tokenTextValue,
      displayChar: `${numDisplay}/${denDisplay}`,
      text: tokenTextValue,
      confidence,
      bbox: fractionBBox,
      superscript: false,
      reason: 'fraction',
      strokes: bar.strokes,
    });
    for (const j of [...above, ...below]) consumed.add(j);
    // 外包分数的 bbox 内的其它分数条（嵌套分数的分子/分母条）归外包分数消费，
    // 避免它们再作为独立分数输出一份。
    for (let j = 0; j < glyphs.length; j++) {
      if (j === i || consumed.has(j)) continue;
      const g = glyphs[j];
      if (g.char !== '-' || g.text) continue;
      const cx = (g.bbox.x0 + g.bbox.x1) / 2;
      const cy = (g.bbox.y0 + g.bbox.y1) / 2;
      if (
        cx >= fractionBBox.x0 - tol &&
        cx <= fractionBBox.x1 + tol &&
        cy >= fractionBBox.y0 - tol &&
        cy <= fractionBBox.y1 + tol
      ) {
        consumed.add(j);
        tokens.delete(j);
      }
    }
  }

  if (tokens.size === 0) return glyphs;
  const out: RecognizedGlyph[] = [];
  for (let i = 0; i < glyphs.length; i++) {
    if (consumed.has(i)) continue;
    out.push(tokens.get(i) ?? glyphs[i]);
  }
  return out;
}

/**
 * A single-stroke square-root symbol: short descending tick, long rising
 * diagonal, then a nearly flat overbar.
 */
export interface RadicalRegion {
  /** Full stroke bbox (pixel/ink coordinates). */
  bbox: BBox;
  /** x where the radicand starts (right of the tick). */
  startX: number;
  /** y of the overbar; radicand glyphs must sit below it. */
  barY: number;
  stroke: RecognitionStroke;
  confidence: number;
}

/**
 * Detect one-stroke radical symbols before glyph grouping.
 *
 * The shape we accept is deliberately narrow: the lowest point (the V vertex)
 * must be in the left 60% of the stroke, the stroke must dip well below its
 * top, and the tail must be a flat overbar near the top. A checkmark, "7" or
 * "z" fails at least one of those tests.
 */
export function detectRadicalStrokes(strokes: RecognitionStroke[]): RadicalRegion[] {
  const heights = strokes
    .map((s) => strokeBBox(s))
    .filter((b): b is BBox => b !== null)
    .map((b) => Math.max(1, b.y1 - b.y0))
    .sort((a, b) => a - b);
  const medianHeight = heights.length > 0 ? heights[Math.floor(heights.length / 2)] : 20;

  const out: RadicalRegion[] = [];
  for (const stroke of strokes) {
    const pts = stroke.points;
    if (pts.length < 6) continue;
    const bbox = strokeBBox(stroke);
    if (!bbox) continue;
    const w = bbox.x1 - bbox.x0;
    const h = bbox.y1 - bbox.y0;
    if (w < 18 || h < 8) continue;
    if (w < medianHeight * 1.1) continue;
    if (w < h * 0.9 || w > h * 12) continue;

    // Lowest point = the sharp vertex of the radical.
    let lowIdx = 0;
    let lowY = -Infinity;
    for (let i = 0; i < pts.length; i++) {
      if (pts[i].y > lowY) {
        lowY = pts[i].y;
        lowIdx = i;
      }
    }
    if (lowIdx < 1 || lowIdx > pts.length * 0.6) continue;
    const vertex = pts[lowIdx];
    if (vertex.y - bbox.y0 < h * 0.55) continue;
    // Start near the upper-left, not already at the bottom.
    if (pts[0].y - bbox.y0 > h * 0.55) continue;

    // The tail after the vertex must be an overbar near the top.
    const tailStart = Math.max(lowIdx + 1, Math.floor(pts.length * 0.62));
    const tail = pts.slice(tailStart);
    if (tail.length < 2) continue;
    let tailY = 0;
    let tailMinY = Infinity;
    let tailMaxY = -Infinity;
    for (const p of tail) {
      tailY += p.y;
      if (p.y < tailMinY) tailMinY = p.y;
      if (p.y > tailMaxY) tailMaxY = p.y;
    }
    tailY /= tail.length;
    if (tailMaxY - tailMinY > h * 0.18) continue;
    if (tailY - bbox.y0 > h * 0.35) continue;
    if (tail[tail.length - 1].x - tail[0].x < w * 0.25) continue;
    // The overbar must extend to the right of the vertex.
    if (bbox.x1 - vertex.x < w * 0.4) continue;

    out.push({
      bbox,
      startX: vertex.x + w * 0.04,
      barY: tailY,
      stroke,
      confidence: 0.75,
    });
  }
  return out;
}

/**
 * Wrap glyphs that sit under a detected radical into `sqrt(...)` tokens.
 * Applied after fraction layout so `√(1/2)` keeps the fraction token inside.
 */
export function applyRadicalLayout(
  glyphs: RecognizedGlyph[],
  regions: RadicalRegion[],
): RecognizedGlyph[] {
  if (regions.length === 0 || glyphs.length === 0) return glyphs;

  const consumed = new Set<number>();
  const tokens = new Map<number, RecognizedGlyph>();

  for (const region of regions) {
    const indices: number[] = [];
    for (let i = 0; i < glyphs.length; i++) {
      if (consumed.has(i)) continue;
      const g = glyphs[i];
      const cx = (g.bbox.x0 + g.bbox.x1) / 2;
      if (cx < region.startX || cx > region.bbox.x1 + 8) continue;
      // 上标 / 数字只要底部在横杠下方，就属于被开方内容。
      if (g.bbox.y1 < region.barY - 2) continue;
      indices.push(i);
    }
    if (indices.length === 0) continue;
    indices.sort((a, b) => glyphs[a].bbox.x0 - glyphs[b].bbox.x0);

    const inner = indices.map((i) => glyphs[i]);
    const innerText = buildRecognizedText(inner);
    if (!innerText) continue;
    const innerDisplay = buildRecognizedDisplay(inner);
    const confidence =
      inner.reduce((sum, g) => sum + g.confidence, 0) / inner.length;

    const x0 = Math.min(region.bbox.x0, ...inner.map((g) => g.bbox.x0));
    const y0 = Math.min(region.bbox.y0, ...inner.map((g) => g.bbox.y0));
    const x1 = Math.max(region.bbox.x1, ...inner.map((g) => g.bbox.x1));
    const y1 = Math.max(region.bbox.y1, ...inner.map((g) => g.bbox.y1));

    tokens.set(indices[0], {
      char: `sqrt(${innerText})`,
      displayChar: `√(${innerDisplay})`,
      text: `sqrt(${innerText})`,
      confidence: Math.min(0.95, (confidence + region.confidence) / 2),
      bbox: { x0, y0, x1, y1 },
      superscript: false,
      reason: 'radical',
      strokes: [region.stroke],
    });
    for (const i of indices) consumed.add(i);
  }

  if (tokens.size === 0) return glyphs;
  const out: RecognizedGlyph[] = [];
  for (let i = 0; i < glyphs.length; i++) {
    const token = tokens.get(i);
    if (token) out.push(token);
    else if (!consumed.has(i)) out.push(glyphs[i]);
  }
  return out;
}

/**
 * Recognize a set of ink strokes as a math expression.
 * `strokes` should already be in reading order or arbitrary; grouping sorts.
 */
export function recognizeMathInk(strokes: RecognitionStroke[]): MathRecognitionResult {
  // 根号通常是一笔跨在数字上方的长笔画，会与下方字形的大包围盒重叠而干扰分组，
  // 因此先单独识别并抽走，再对剩余笔画做字形分组。
  const radicals = detectRadicalStrokes(strokes);
  const radicalStrokes = new Set(radicals.map((r) => r.stroke));
  const inkStrokes =
    radicalStrokes.size > 0 ? strokes.filter((s) => !radicalStrokes.has(s)) : strokes;
  const groups = groupStrokesIntoGlyphs(inkStrokes);
  if (groups.length === 0) {
    return {
      ok: false,
      text: '',
      display: '',
      glyphs: [],
      layoutGlyphs: [],
      confidence: 0,
      error: '没有可识别的笔迹',
    };
  }

  const templates = getGlyphTemplates();
  if (templates.length === 0) {
    return {
      ok: false,
      text: '',
      display: '',
      glyphs: [],
      layoutGlyphs: [],
      confidence: 0,
      error: '当前环境不支持本地识别',
    };
  }

  const glyphs: RecognizedGlyph[] = [];
  // Last non-superscript glyph — the baseline a new exponent is compared to.
  let superscriptBase: RecognizedGlyph | null = null;
  for (const group of groups) {
    const raster = rasterizeGlyph(group.strokes);
    if (!raster) continue;
    const hint = classifyGlyphGeometry(group);
    const cls =
      hint && hint.confidence >= 0.6
        ? hint
        : classifyGlyphBitmap(raster.ink, templates);

    let char = cls.char;

    // Superscript / subscript: compare against the last baseline glyph, not
    // just the previous one, so multi-digit scripts (x²³, x₂₃) stay together.
    let superscript = false;
    let subscript = false;
    const prev = glyphs[glyphs.length - 1];
    const base = superscriptBase ?? prev;
    if (base) {
      const script = detectScriptPosition(group, base);
      superscript = script.superscript;
      subscript = script.subscript;
    }

    // Decimal point writes tiny; keep it even when classifier is unsure.
    if (!superscript && !subscript && group.width < (group.height || 1) * 0.35 && group.height < 6) {
      char = '.';
    }
    // 小数点/极小笔画永远不是下标，也不该被当成上标（i 的点已在上游合并）。
    if (char === '.') {
      superscript = false;
      subscript = false;
    }

    const glyph: RecognizedGlyph = {
      char,
      displayChar: char === '*' ? '×' : char,
      confidence: superscript || subscript ? cls.confidence * 0.9 : cls.confidence,
      alternatives:
        char === '?'
          ? cls.alternatives
          : withConfusableAlternatives(char, cls.alternatives),
      reason: hint && hint.confidence >= 0.6 ? (hint.reason ?? 'geometry') : 'template',
      bbox: group.bbox,
      superscript,
      subscript,
      strokes: group.strokes,
    };
    if (!glyph.superscript && !glyph.subscript) superscriptBase = glyph;
    glyphs.push(glyph);
  }

  // 字母序列（sin / cos / log …）用数学词汇表纠正 1↔l、5↔s、0↔o 这类
  // 单字形无法区分的混淆，再进入二维结构重建。
  disambiguateCrossGlyphs(glyphs);
  applyMathWordCorrection(glyphs);
  refineDotGlyphs(glyphs);

  const layoutGlyphs = applyRadicalLayout(buildFractionLayout(glyphs), radicals);
  const rawText = buildRecognizedText(layoutGlyphs);
  // "x" and "×" share the same two crossing strokes. A lone × after "=", at
  // the start, or before a superscript is the variable x — not multiplication.
  const text = rawText
    .replace(/^\*(?=[+\-/^()]|$)/, 'x')
    .replace(/=\*(?=[+\-/^()]|$)/g, '=x');
  const display = buildRecognizedDisplay(layoutGlyphs);
  const confidence =
    glyphs.length > 0
      ? glyphs.reduce((sum, g) => sum + g.confidence, 0) / glyphs.length
      : 0;

  if (!text) {
    return {
      ok: false,
      text,
      display,
      glyphs,
      layoutGlyphs,
      confidence,
      error: '识别置信度过低，请重写或手动修正',
    };
  }

  return { ok: true, text, display, glyphs, layoutGlyphs, confidence };
}

/* ================================================================== *
 * Bitmap helpers
 * ================================================================== */

function drawThickLine(
  ink: Uint8Array,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  radius: number,
): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy)));
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const x = Math.round(x0 + dx * t);
    const y = Math.round(y0 + dy * t);
    for (let oy = -radius; oy <= radius; oy++) {
      for (let ox = -radius; ox <= radius; ox++) {
        if (ox * ox + oy * oy > radius * radius) continue;
        const px = x + ox;
        const py = y + oy;
        if (px < 0 || py < 0 || px >= TEMPLATE_SIZE || py >= TEMPLATE_SIZE) continue;
        ink[py * TEMPLATE_SIZE + px] = 1;
      }
    }
  }
}

/** Zhang–Suen thinning. */
export function skeletonize(binary: Uint8Array, w: number, h: number): Uint8Array {
  const img = binary.slice();
  const at = (x: number, y: number) => img[y * w + x];
  let changed = true;
  let guard = 0;
  while (changed && guard++ < 64) {
    changed = false;
    for (let step = 0; step < 2; step++) {
      const remove: number[] = [];
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          if (!at(x, y)) continue;
          const p2 = at(x, y - 1);
          const p3 = at(x + 1, y - 1);
          const p4 = at(x + 1, y);
          const p5 = at(x + 1, y + 1);
          const p6 = at(x, y + 1);
          const p7 = at(x - 1, y + 1);
          const p8 = at(x - 1, y);
          const p9 = at(x - 1, y - 1);
          const b = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
          if (b < 2 || b > 6) continue;
          const a =
            (p2 === 0 && p3 === 1 ? 1 : 0) +
            (p3 === 0 && p4 === 1 ? 1 : 0) +
            (p4 === 0 && p5 === 1 ? 1 : 0) +
            (p5 === 0 && p6 === 1 ? 1 : 0) +
            (p6 === 0 && p7 === 1 ? 1 : 0) +
            (p7 === 0 && p8 === 1 ? 1 : 0) +
            (p8 === 0 && p9 === 1 ? 1 : 0) +
            (p9 === 0 && p2 === 1 ? 1 : 0);
          if (a !== 1) continue;
          if (step === 0) {
            if (p2 * p4 * p6 !== 0 || p4 * p6 * p8 !== 0) continue;
          } else {
            if (p2 * p4 * p8 !== 0 || p2 * p6 * p8 !== 0) continue;
          }
          remove.push(y * w + x);
        }
      }
      if (remove.length > 0) {
        changed = true;
        for (const i of remove) img[i] = 0;
      }
    }
  }
  return img;
}
