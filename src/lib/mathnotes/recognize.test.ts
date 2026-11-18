import { describe, expect, it } from 'vitest';
import {
  buildRecognizedText,
  classifyGlyphGeometry,
  distanceTransform,
  groupStrokesIntoGlyphs,
  skeletonize,
  strokeBBox,
  type GlyphGroup,
  type RecognizedGlyph,
  type RecognitionStroke,
} from './recognize';

function line(x0: number, y0: number, x1: number, y1: number, y?: number): RecognitionStroke {
  return {
    points: [
      { x: x0, y: y0 },
      { x: x1, y: y1 ?? y0 },
    ],
  };
}

function glyph(char: string, superscript = false): RecognizedGlyph {
  return {
    char,
    displayChar: char === '*' ? '×' : char,
    confidence: 1,
    bbox: { x0: 0, y0: 0, x1: 10, y1: 10 },
    superscript,
    strokes: [],
  };
}

describe('groupStrokesIntoGlyphs', () => {
  it('groups the two bars of an equals sign', () => {
    const groups = groupStrokesIntoGlyphs([
      line(0, 0, 20, 0),
      line(0, 8, 20, 8),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].width).toBeCloseTo(20);
  });

  it('merges crossing strokes into one plus glyph', () => {
    const groups = groupStrokesIntoGlyphs([
      line(0, 10, 24, 10),
      line(12, 0, 12, 20),
    ]);
    expect(groups).toHaveLength(1);
  });

  it('keeps separate symbols apart', () => {
    const groups = groupStrokesIntoGlyphs([
      line(0, 0, 10, 20),
      line(40, 0, 50, 20),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0].centerX).toBeLessThan(groups[1].centerX);
  });

  it('ignores empty strokes', () => {
    expect(groupStrokesIntoGlyphs([{ points: [] }])).toHaveLength(0);
    expect(strokeBBox({ points: [] })).toBeNull();
  });
});

describe('skeletonize', () => {
  it('thins a filled block but keeps it connected', () => {
    const w = 9;
    const h = 9;
    const ink = new Uint8Array(w * h);
    for (let y = 2; y < 7; y++) for (let x = 2; x < 7; x++) ink[y * w + x] = 1;
    const skel = skeletonize(ink, w, h);
    const total = skel.reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(0);
    expect(total).toBeLessThan(25);
  });
});

describe('distanceTransform', () => {
  it('measures chamfer distance to the nearest ink pixel', () => {
    const w = 7;
    const h = 7;
    const ink = new Uint8Array(w * h);
    ink[3 * w + 3] = 1;
    const d = distanceTransform(ink, w, h);
    expect(d[3 * w + 3]).toBe(0);
    expect(d[3 * w + 4]).toBeCloseTo(1);
    expect(d[3 * w + 5]).toBeCloseTo(2);
  });
});

describe('classifyGlyphGeometry', () => {
  const asGroup = (strokes: RecognitionStroke[]): GlyphGroup => {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const s of strokes) {
      const b = strokeBBox(s)!;
      x0 = Math.min(x0, b.x0);
      y0 = Math.min(y0, b.y0);
      x1 = Math.max(x1, b.x1);
      y1 = Math.max(y1, b.y1);
    }
    return {
      strokes,
      bbox: { x0, y0, x1, y1 },
      width: x1 - x0,
      height: y1 - y0,
      centerX: (x0 + x1) / 2,
      centerY: (y0 + y1) / 2,
    };
  };

  it('recognizes plus, minus and equals structurally', () => {
    expect(
      classifyGlyphGeometry(asGroup([line(0, 10, 24, 10), line(12, 0, 12, 20)]))?.char,
    ).toBe('+');
    expect(classifyGlyphGeometry(asGroup([line(0, 10, 24, 10)]))?.char).toBe('-');
    expect(
      classifyGlyphGeometry(asGroup([line(0, 0, 24, 0), line(0, 8, 24, 8)]))?.char,
    ).toBe('=');
  });

  it('recognizes a two-stroke y instead of a 7', () => {
    const yMain: RecognitionStroke = {
      points: [
        { x: 0, y: 0 }, { x: 3, y: 6 }, { x: 7, y: 13 }, { x: 10, y: 18 },
        { x: 13, y: 13 }, { x: 17, y: 6 }, { x: 20, y: 0 },
      ],
    };
    const yTail: RecognitionStroke = {
      points: [{ x: 10, y: 18 }, { x: 6, y: 30 }, { x: 2, y: 40 }],
    };
    expect(classifyGlyphGeometry(asGroup([yMain, yTail]))?.char).toBe('y');
  });

  it('recognizes a dot and a diagonal slash', () => {
    expect(classifyGlyphGeometry(asGroup([line(10, 10, 12, 12)]))?.char).toBe('.');
    expect(classifyGlyphGeometry(asGroup([line(0, 20, 20, 0)]))?.char).toBe('/');
  });
});

describe('buildRecognizedText', () => {
  it('reconstructs a decimal arithmetic expression', () => {
    const text = buildRecognizedText([
      glyph('2'), glyph('.'), glyph('5'), glyph('*'), glyph('3'), glyph('6'), glyph('5'),
    ]);
    expect(text).toBe('2.5*365');
  });

  it('inserts implicit multiplication between adjacent operands', () => {
    expect(buildRecognizedText([glyph('2'), glyph('x')])).toBe('2*x');
    expect(buildRecognizedText([glyph('('), glyph('x'), glyph(')')])).toBe('(x)');
    expect(
      buildRecognizedText([glyph('('), glyph('x'), glyph(')'), glyph('('), glyph('2'), glyph(')')]),
    ).toBe('(x)*(2)');
  });

  it('rebuilds superscripts', () => {
    expect(buildRecognizedText([glyph('x'), glyph('2', true)])).toBe('x^2');
    expect(
      buildRecognizedText([glyph('y'), glyph('='), glyph('x'), glyph('3', true)]),
    ).toBe('y=x^3');
  });
});
