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
  /** Runner-up characters, for diagnostics / user correction UI. */
  alternatives?: string[];
  /** Which rule produced this glyph (diagnostics). */
  reason?: string;
  /** Multi-character token (e.g. a fraction); takes precedence over `char`. */
  text?: string;
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
      const vGap = verticalGap(g.bbox, item.bbox);
      const near = gap <= medianHeight * 0.18 && verticalOverlap > 0.35;
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
        if (crossing || stacked) {
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

/* ================================================================== *
 * 2. Glyph classification (skeleton templates + Chamfer distance)
 * ================================================================== */

export const TEMPLATE_SIZE = 48;
const TEMPLATE_CHARS = [
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
  '+', '-', '*', '/', '=', '(', ')', '.', 'x', 'y',
];
const TEMPLATE_FONTS = ['DejaVu Sans', 'DejaVu Serif', 'DejaVu Sans Mono', 'sans-serif', 'serif'];

interface GlyphTemplate {
  char: string;
  /** Skeleton bitmap, TEMPLATE_SIZE². */
  skeleton: Uint8Array;
  /** Chamfer distance field of the skeleton. */
  distance: Float32Array;
  bbox: BBox;
}

/* ── Personal glyph bank ───────────────────────────────────────────
 * High-confidence glyphs the user has actually written are stored locally
 * and added to the template set. Recognition then adapts to this specific
 * hand instead of only matching system fonts. Nothing leaves the device.
 */
export const USER_GLYPHS_KEY = 'omnimath-glyph-bank-v1';
const MAX_PER_CHAR = 6;
const MAX_TOTAL = 160;

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
      !g.superscript &&
      g.confidence >= 0.66 &&
      g.strokes.length > 0 &&
      g.bbox.x1 > g.bbox.x0,
  );
  if (fresh.length === 0) return;

  const samples = loadUserGlyphSamples();
  const now = Date.now();
  for (const g of fresh) {
    samples.push({
      char: g.char,
      strokes: g.strokes.map((s) => s.points.map((p) => ({ x: p.x, y: p.y }))),
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

    if (aspect >= 2.2 && h <= Math.max(6, w * 0.22) && line.straightness > 0.78) {
      return { char: '-', confidence: 0.88, alternatives: [] };
    }
    if (h / w >= 2.6 && w <= Math.max(6, h * 0.3) && line.straightness > 0.8) {
      return { char: '1', confidence: 0.62, alternatives: [], reason: 'vertical-line' };
    }
    if (aspect >= 0.45 && aspect <= 2.2 && closureRatio(stroke) < 0.22) {
      return { char: '0', confidence: 0.55, alternatives: [], reason: 'closed-loop' };
    }

    // Loop digits: 6 / 8 / 9 all cross themselves. Vertical ink density
    // separates a top loop (9) from a bottom loop (6).
    const selfCrossings = countSelfIntersections(stroke);
    if (selfCrossings >= 1 && h / w >= 1.05) {
      const density = verticalDensity(stroke);
      if (selfCrossings >= 2 && density.top > 0.3 && density.bottom > 0.3) {
        return { char: '8', confidence: 0.58, alternatives: [], reason: `loops(${selfCrossings})` };
      }
      if (density.top > density.bottom * 1.2) {
        return { char: '9', confidence: 0.66, alternatives: [], reason: `loop-top(${selfCrossings})` };
      }
      if (density.bottom > density.top * 1.2) {
        return { char: '6', confidence: 0.66, alternatives: [], reason: `loop-bottom(${selfCrossings})` };
      }
    }

    // "2": a flat horizontal bar at the bottom, ending on the right edge.
    if (hasFlatBar(stroke, 'bottom') && stroke.points[stroke.points.length - 1].x > bbox.x0 + w * 0.72) {
      return { char: '2', confidence: 0.72, alternatives: [], reason: 'bottom-bar' };
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
    if (h / w >= 1.6 && line.straightness < 0.72 && reversals <= 1) {
      const cx = meanX(stroke);
      const endpoints = (stroke.points[0].x + stroke.points[stroke.points.length - 1].x) / 2;
      if (cx < endpoints - w * 0.08) return { char: '(', confidence: 0.68, alternatives: [] };
      if (cx > endpoints + w * 0.08) return { char: ')', confidence: 0.68, alternatives: [] };
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

function meanX(stroke: RecognitionStroke): number {
  let sum = 0;
  for (const p of stroke.points) sum += p.x;
  return sum / Math.max(1, stroke.points.length);
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

export function buildRecognizedText(glyphs: RecognizedGlyph[]): string {
  let out = '';
  let prev: RecognizedGlyph | null = null;
  for (const g of glyphs) {
    if (g.char === '?' && !g.text) continue;
    const token = tokenText(g);
    if (g.superscript) {
      out += `^${/^[0-9a-zA-Z]$/.test(token) ? token : `(${token})`}`;
      prev = g;
      continue;
    }
    if (prev && needsMultiplication(prev, g)) out += '*';
    out += token;
    prev = g;
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

  for (let i = 0; i < glyphs.length; i++) {
    const bar = glyphs[i];
    if (consumed.has(i) || bar.superscript || bar.text || bar.char !== '-') continue;
    const barWidth = bar.bbox.x1 - bar.bbox.x0;
    const barHeight = bar.bbox.y1 - bar.bbox.y0;
    if (barWidth < medianWidth * 1.5 || barHeight > medianHeight * 0.45) continue;

    const tol = Math.max(4, medianHeight * 0.22);
    const above: number[] = [];
    const below: number[] = [];
    for (let j = 0; j < glyphs.length; j++) {
      if (j === i || consumed.has(j)) continue;
      const g = glyphs[j];
      if (g.char === '-' || g.text || g.char === '?') continue;
      const cx = (g.bbox.x0 + g.bbox.x1) / 2;
      if (cx < bar.bbox.x0 - barWidth * 0.2 || cx > bar.bbox.x1 + barWidth * 0.2) continue;
      if (g.bbox.y1 <= bar.bbox.y0 + tol) above.push(j);
      else if (g.bbox.y0 >= bar.bbox.y1 - tol) below.push(j);
    }
    if (above.length === 0 || below.length === 0) continue;

    above.sort((a, b) => glyphs[a].bbox.x0 - glyphs[b].bbox.x0);
    below.sort((a, b) => glyphs[a].bbox.x0 - glyphs[b].bbox.x0);
    // Fraction parts are positioned by the bar, not by a superscript baseline.
    const numGlyphs = above.map((j) => ({ ...glyphs[j], superscript: false }));
    const denGlyphs = below.map((j) => ({ ...glyphs[j], superscript: false }));
    const numText = buildRecognizedText(numGlyphs);
    const denText = buildRecognizedText(denGlyphs);
    if (!numText || !denText) continue;

    const numDisplay = numGlyphs.map((g) => g.displayChar).join('');
    const denDisplay = denGlyphs.map((g) => g.displayChar).join('');
    const tokenTextValue = `(${numText})/(${denText})`;
    const parts = [...above, ...below].map((j) => glyphs[j]);
    const confidence =
      parts.reduce((sum, g) => sum + g.confidence, bar.confidence) / (parts.length + 1);

    tokens.set(i, {
      char: tokenTextValue,
      displayChar: `${numDisplay}/${denDisplay}`,
      text: tokenTextValue,
      confidence,
      bbox: {
        x0: bar.bbox.x0,
        y0: Math.min(bar.bbox.y0, ...above.map((j) => glyphs[j].bbox.y0)),
        x1: bar.bbox.x1,
        y1: Math.max(bar.bbox.y1, ...below.map((j) => glyphs[j].bbox.y1)),
      },
      superscript: false,
      reason: 'fraction',
      strokes: bar.strokes,
    });
    for (const j of [...above, ...below]) consumed.add(j);
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
    const hint = classifyGlyphGeometry(group);
    const cls =
      hint && hint.confidence >= 0.6
        ? hint
        : classifyGlyphBitmap(raster.ink, templates);

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
      alternatives: cls.alternatives,
      reason: hint && hint.confidence >= 0.6 ? (hint.reason ?? 'geometry') : 'template',
      bbox: group.bbox,
      superscript,
      strokes: group.strokes,
    });
  }

  const layoutGlyphs = buildFractionLayout(glyphs);
  const rawText = buildRecognizedText(layoutGlyphs);
  // "x" and "×" share the same two crossing strokes. A lone × after "=", at
  // the start, or before a superscript is the variable x — not multiplication.
  const text = rawText
    .replace(/^\*(?=[+\-/^()]|$)/, 'x')
    .replace(/=\*(?=[+\-/^()]|$)/g, '=x');
  const display = layoutGlyphs
    .map((g) => (g.superscript ? `^${g.displayChar}` : g.displayChar))
    .join('');
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
