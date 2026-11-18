import { describe, expect, it } from 'vitest';
import {
  buildRecognizedText,
  distanceTransform,
  groupStrokesIntoGlyphs,
  skeletonize,
  strokeBBox,
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
