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
  bbox: BBox;
  superscript: boolean;
  strokes: RecognitionStroke[];
}

export interface MathRecognitionResult {
  ok: boolean;
  /** Linear expression, e.g. "2.5*365*24*60" / "y=x^3". */
  text: string;
  /** Pretty version for humans, e.g. "2.5×365×24×60". */
  display: string;
  glyphs: RecognizedGlyph[];
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
      const near = gap <= medianHeight * 0.18 && verticalOverlap > 0.35;
      const score = near ? Math.max(0.6, overlap) : overlap;
      if ((overlap >= 0.28 || near) && score > bestScore) {
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
  if (overlap <= 0) return 0;
  return overlap / Math.max(1, Math.min(a.x1 - a.x0, b.x1 - b.x0));
}

function yOverlapRatio(a: BBox, b: BBox): number {
  const overlap = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  if (overlap <= 0) return 0;
  return overlap / Math.max(1, Math.min(a.y1 - a.y0, b.y1 - b.y0));
}

function horizontalGap(a: BBox, b: BBox): number {
  if (b.x0 > a.x1) return b.x0 - a.x1;
  if (a.x0 > b.x1) return a.x0 - b.x1;
  return 0;
}

/* ================================================================== *
 * 2. Glyph classification (skeleton templates + Chamfer distance)
 * ================================================================== */

export const TEMPLATE_SIZE = 48;
const TEMPLATE_CHARS = [
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
  '+', '-', '*', '/', '=', '(', ')', '.', 'x', 'y',
];
const TEMPLATE_FONTS = ['sans-serif', 'serif', 'monospace'];

interface GlyphTemplate {
  char: string;
  /** Skeleton bitmap, TEMPLATE_SIZE². */
  skeleton: Uint8Array;
  /** Chamfer distance field of the skeleton. */
  distance: Float32Array;
  bbox: BBox;
}

let templateCache: GlyphTemplate[] | null = null;

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
    const skeleton = skeletonize(ink, TEMPLATE_SIZE, TEMPLATE_SIZE);
    return {
      char,
      skeleton,
      distance: distanceTransform(skeleton, TEMPLATE_SIZE, TEMPLATE_SIZE),
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
  const userDistance = distanceTransform(ink, TEMPLATE_SIZE, TEMPLATE_SIZE);
  const scores = new Map<string, number>();

  for (const t of templates) {
    let sumUser = 0;
    let userCount = 0;
    for (let i = 0; i < ink.length; i++) {
      if (!ink[i]) continue;
      sumUser += t.distance[i];
      userCount++;
    }
    let sumTemplate = 0;
    let templateCount = 0;
    for (let i = 0; i < t.skeleton.length; i++) {
      if (!t.skeleton[i]) continue;
      sumTemplate += userDistance[i];
      templateCount++;
    }
    if (userCount === 0 || templateCount === 0) continue;
    const score = (sumUser / userCount + sumTemplate / templateCount) / 2;
    const prev = scores.get(t.char);
    if (prev === undefined || score < prev) scores.set(t.char, score);
  }

  const ranked = [...scores.entries()].sort((a, b) => a[1] - b[1]);
  if (ranked.length === 0) return { char: '?', confidence: 0, alternatives: [] };

  const [bestChar, bestScore] = ranked[0];
  // 0 px error → 1.0; ~7 px average error → 0. Confidence is advisory.
  const confidence = Math.max(0, Math.min(1, 1 - bestScore / 7));
  const char = confidence < 0.28 ? '?' : bestChar;
  return {
    char,
    confidence,
    alternatives: ranked.slice(1, 4).map(([c]) => c),
  };
}

/* ================================================================== *
 * 3. Layout reconstruction
 * ================================================================== */

const DIGITS = new Set(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']);
const VALUE_END = new Set(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', ')', 'x', 'y']);

/**
 * Rebuild implicit multiplication without breaking numbers.
 * Multi-digit numbers arrive as separate glyphs ("3" "6" "5" → 365), so a
 * digit followed by a digit must never gain a `*`.
 */
function needsMultiplication(prev: string, next: string): boolean {
  if (!prev) return false;
  if (next === '.' || prev === '.') return false;
  if (DIGITS.has(prev) && DIGITS.has(next)) return false;
  if (!VALUE_END.has(prev)) return false;
  if (next === '(') return true;
  if (next === 'x' || next === 'y') return true;
  if (prev === ')' && DIGITS.has(next)) return true;
  if ((prev === 'x' || prev === 'y') && DIGITS.has(next)) return true;
  return false;
}

export function buildRecognizedText(glyphs: RecognizedGlyph[]): string {
  let out = '';
  for (const g of glyphs) {
    if (g.char === '?') continue;
    if (g.superscript) {
      out += `^${g.char}`;
      continue;
    }
    const next = g.char;
    const prev = out.slice(-1);
    if (needsMultiplication(prev, next)) out += '*';
    out += next;
  }
  return out;
}

/**
 * Recognize a set of ink strokes as a math expression.
 * `strokes` should already be in reading order or arbitrary; grouping sorts.
 */
export function recognizeMathInk(strokes: RecognitionStroke[]): MathRecognitionResult {
  const groups = groupStrokesIntoGlyphs(strokes);
  if (groups.length === 0) {
    return {
      ok: false,
      text: '',
      display: '',
      glyphs: [],
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
      confidence: 0,
      error: '当前环境不支持本地识别',
    };
  }

  const glyphs: RecognizedGlyph[] = [];
  for (const group of groups) {
    const raster = rasterizeGlyph(group.strokes);
    if (!raster) continue;
    const cls = classifyGlyphBitmap(raster.ink, templates);

    let char = cls.char;
    // Preferred display for multiplication.
    const displayChar = char === '*' ? '×' : char;

    // Superscript: clearly above the previous glyph and smaller.
    let superscript = false;
    const prev = glyphs[glyphs.length - 1];
    if (prev && group.height > 0 && prev.bbox.y1 - prev.bbox.y0 > 0) {
      const prevHeight = prev.bbox.y1 - prev.bbox.y0;
      const prevCenterY = (prev.bbox.y0 + prev.bbox.y1) / 2;
      const above = group.centerY < prevCenterY - prevHeight * 0.28;
      const smaller = group.height < prevHeight * 0.85;
      superscript = above && smaller;
    }

    // Decimal point writes tiny; keep it even when classifier is unsure.
    if (!superscript && group.width < (group.height || 1) * 0.35 && group.height < 6) {
      char = '.';
    }

    glyphs.push({
      char,
      displayChar: char === '*' ? '×' : displayChar,
      confidence: superscript ? cls.confidence * 0.9 : cls.confidence,
      bbox: group.bbox,
      superscript,
      strokes: group.strokes,
    });
  }

  const text = buildRecognizedText(glyphs);
  const display = glyphs.map((g) => (g.superscript ? `^${g.displayChar}` : g.displayChar)).join('');
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
      confidence,
      error: '识别置信度过低，请重写或手动修正',
    };
  }

  return { ok: true, text, display, glyphs, confidence };
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
