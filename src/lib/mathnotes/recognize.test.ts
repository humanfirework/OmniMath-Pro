import { describe, expect, it } from 'vitest';
import {
  addUserGlyphSamples,
  applyMathWordCorrection,
  applyRadicalLayout,
  buildFractionLayout,
  buildRecognizedDisplay,
  buildRecognizedText,
  classifyGlyphGeometry,
  clearUserGlyphBank,
  detectRadicalStrokes,
  detectScriptPosition,
  loadUserGlyphSamples,
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

function glyph(char: string, superscript = false, subscript = false): RecognizedGlyph {
  return {
    char,
    displayChar: char === '*' ? '×' : char,
    confidence: 1,
    bbox: { x0: 0, y0: 0, x1: 10, y1: 10 },
    superscript,
    subscript,
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

  it('keeps an adjacent bracket separate from the letter before it', () => {
    // 之前只按 18% 行高的水平间隙合并，log 的 g 和紧随其后的 "(" 会粘成
    // 一个字形，括号被吞掉。只有「细碎笔画」（点的宽度级别）才允许近距合并。
    const loopsAround = (x: number) => ({
      points: [
        { x, y: 0 },
        { x: x + 24, y: 0 },
        { x: x + 24, y: 40 },
        { x, y: 40 },
        { x, y: 0 },
      ],
    });
    const groups = groupStrokesIntoGlyphs([
      loopsAround(0),
      { points: [{ x: 26, y: 0 }, { x: 40, y: 10 }, { x: 40, y: 30 }, { x: 26, y: 40 }] },
    ]);
    expect(groups).toHaveLength(2);
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

describe('personal glyph bank', () => {
  const sample = (char: string, confidence: number, superscript = false): RecognizedGlyph => ({
    char,
    displayChar: char,
    confidence,
    bbox: { x0: 0, y0: 0, x1: 10, y1: 20 },
    superscript,
    strokes: [line(0, 0, 10, 20)],
  });

  it('stores confident, non-superscript glyphs', () => {
    localStorage.clear();
    addUserGlyphSamples([sample('2', 0.9), sample('3', 0.2), sample('4', 0.9, true)]);
    const stored = loadUserGlyphSamples();
    expect(stored.map((s) => s.char)).toEqual(['2']);
  });

  it('caps the number of samples per character', () => {
    localStorage.clear();
    for (let i = 0; i < 9; i++) addUserGlyphSamples([sample('5', 0.9)]);
    expect(loadUserGlyphSamples().filter((s) => s.char === '5').length).toBeLessThanOrEqual(6);
  });

  it('can be cleared', () => {
    localStorage.clear();
    addUserGlyphSamples([sample('7', 0.9)]);
    clearUserGlyphBank();
    expect(loadUserGlyphSamples()).toHaveLength(0);
  });
});

describe('fraction layout', () => {
  const at = (
    char: string,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    superscript = false,
  ): RecognizedGlyph => ({
    char,
    displayChar: char,
    confidence: 1,
    bbox: { x0, y0, x1, y1 },
    superscript,
    strokes: [],
  });

  it('turns a wide bar with ink above and below into a fraction', () => {
    const glyphs = [
      at('1', 0, 0, 12, 30),
      at('-', -4, 40, 48, 44),
      at('2', 0, 52, 12, 82),
    ];
    const layout = buildFractionLayout(glyphs);
    expect(layout).toHaveLength(1);
    expect(layout[0].text).toBe('(1)/(2)');
    expect(buildRecognizedText(layout)).toBe('(1)/(2)');
  });

  it('does not turn a normal minus sign into a fraction', () => {
    const glyphs = [at('5', 0, 0, 12, 30), at('-', 20, 14, 32, 16), at('3', 40, 0, 52, 30)];
    expect(buildFractionLayout(glyphs)).toHaveLength(3);
  });

  it('keeps surrounding terms and inserts multiplication', () => {
    const glyphs = [
      at('x', 0, 0, 12, 30),
      at('+', 20, 14, 36, 16),
      at('1', 46, 0, 58, 30),
      at('-', 42, 40, 94, 44),
      at('2', 46, 52, 58, 82),
    ];
    const layout = buildFractionLayout(glyphs);
    expect(buildRecognizedText(layout)).toBe('x+(1)/(2)');
  });

  it('treats a fraction token as a value for multiplication', () => {
    const fraction = at('(1)/(2)', 0, 0, 30, 40);
    fraction.text = '(1)/(2)';
    expect(buildRecognizedText([fraction, at('x', 40, 0, 52, 30)])).toBe('(1)/(2)*x');
  });

  it('supports nested fractions', () => {
    const glyphs = [
      at('1', 0, 0, 12, 20),
      at('-', -2, 28, 30, 31),
      at('2', 0, 38, 12, 58),
      at('-', -6, 78, 70, 82),
      at('3', 0, 90, 12, 120),
    ];
    const layout = buildFractionLayout(glyphs);
    expect(layout).toHaveLength(1);
    expect(layout[0].text).toBe('((1)/(2))/(3)');
    expect(layout[0].displayChar).toBe('1/2/3');
  });
});

describe('radical layout', () => {
  const radical: RecognitionStroke = {
    points: [
      { x: 0, y: 30 },
      { x: 8, y: 38 },
      { x: 16, y: 60 },
      { x: 24, y: 30 },
      { x: 32, y: 10 },
      { x: 48, y: 9 },
      { x: 64, y: 10 },
      { x: 80, y: 10 },
    ],
  };

  const glyphAt = (
    char: string,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    extra: Partial<RecognizedGlyph> = {},
  ): RecognizedGlyph => ({
    char,
    displayChar: char,
    confidence: 0.9,
    bbox: { x0, y0, x1, y1 },
    superscript: false,
    strokes: [],
    ...extra,
  });

  it('detects a one-stroke radical (tick + diagonal + overbar)', () => {
    const regions = detectRadicalStrokes([radical]);
    expect(regions).toHaveLength(1);
    expect(regions[0].barY).toBeLessThan(20);
    expect(regions[0].startX).toBeGreaterThan(14);
  });

  it('rejects a horizontal dash and a check mark', () => {
    const dash: RecognitionStroke = {
      points: [0, 20, 40, 60, 80, 100].map((x) => ({ x, y: 10 })),
    };
    const check: RecognitionStroke = {
      points: [
        { x: 0, y: 20 },
        { x: 10, y: 30 },
        { x: 20, y: 40 },
        { x: 30, y: 20 },
        { x: 40, y: 0 },
        { x: 50, y: -10 },
        { x: 60, y: -20 },
      ],
    };
    expect(detectRadicalStrokes([dash])).toHaveLength(0);
    expect(detectRadicalStrokes([check])).toHaveLength(0);
  });

  it('wraps glyphs under the overbar into sqrt()', () => {
    const regions = detectRadicalStrokes([radical]);
    const out = applyRadicalLayout([glyphAt('2', 26, 20, 42, 55)], regions);
    expect(out).toHaveLength(1);
    expect(out[0].text).toBe('sqrt(2)');
    expect(out[0].displayChar).toBe('√(2)');
  });

  it('keeps a fraction token inside the radical', () => {
    const regions = detectRadicalStrokes([radical]);
    const fraction = glyphAt('(1)/(2)', 24, 16, 64, 56, {
      text: '(1)/(2)',
      displayChar: '1/2',
      reason: 'fraction',
    });
    const out = applyRadicalLayout([fraction], regions);
    expect(out).toHaveLength(1);
    expect(out[0].text).toBe('sqrt((1)/(2))');
  });

  it('leaves glyphs outside the radical untouched', () => {
    const regions = detectRadicalStrokes([radical]);
    const outside = glyphAt('x', 120, 20, 136, 55);
    const out = applyRadicalLayout([outside], regions);
    expect(out).toHaveLength(1);
    expect(out[0]).toBe(outside);
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

  it('groups consecutive superscripts into one exponent', () => {
    expect(
      buildRecognizedText([glyph('x'), glyph('2', true), glyph('3', true)]),
    ).toBe('x^(23)');
    expect(
      buildRecognizedDisplay([glyph('x'), glyph('2', true), glyph('3', true)]),
    ).toBe('x^(23)');
  });

  it('keeps multiplication after an exponent', () => {
    expect(
      buildRecognizedText([glyph('x'), glyph('2', true), glyph('y')]),
    ).toBe('x^2*y');
  });

  it('rebuilds subscripts', () => {
    expect(buildRecognizedText([glyph('x'), glyph('2', false, true)])).toBe('x_2');
    expect(
      buildRecognizedText([glyph('x'), glyph('2', false, true), glyph('3', false, true)]),
    ).toBe('x_23');
    // 下标之后仍能正确补乘号
    expect(
      buildRecognizedText([glyph('x'), glyph('2', false, true), glyph('y')]),
    ).toBe('x_2*y');
  });

  it('renders subscripts with Unicode subscript glyphs', () => {
    expect(
      buildRecognizedDisplay([glyph('x'), glyph('2', false, true)]),
    ).toBe('x₂');
    expect(
      buildRecognizedDisplay([glyph('x'), glyph('2', false, true), glyph('3', false, true)]),
    ).toBe('x₂₃');
  });

  it('combines subscript and superscript on the same base', () => {
    // 笔顺不同（上标先写 / 下标先写）都归一化为 x_1^2。
    expect(
      buildRecognizedText([glyph('x'), glyph('2', true), glyph('1', false, true)]),
    ).toBe('x_1^2');
    expect(
      buildRecognizedText([glyph('x'), glyph('1', false, true), glyph('2', true)]),
    ).toBe('x_1^2');
    // 上下标之后仍补乘号。
    expect(
      buildRecognizedText([glyph('x'), glyph('2', true), glyph('1', false, true), glyph('y')]),
    ).toBe('x_1^2*y');
    // 显示串：先下标后上标。
    expect(
      buildRecognizedDisplay([glyph('x'), glyph('2', true), glyph('1', false, true)]),
    ).toBe('x₁^2');
  });
});

describe('applyMathWordCorrection', () => {
  const corrected = (chars: string[]) =>
    applyMathWordCorrection(chars.map((c) => glyph(c))).map((g) => g.char).join('');

  it('repairs digit/letter confusions inside function names', () => {
    // 5 vs s, 0 vs o, 1 vs l — 单字形模板无法区分，词汇表按上下文修复。
    expect(corrected(['5', 'i', 'n'])).toBe('sin');
    expect(corrected(['c', '0', '5'])).toBe('cos');
    expect(corrected(['1', 'o', 'g'])).toBe('log');
    // 只有 1 个真字母时，必须靠后面的 "(" 才认定是函数名。
    expect(corrected(['1', 'n'])).toBe('1n');
    expect(corrected(['1', 'n', '('])).toBe('ln(');
  });

  it('does not over-correct a digit + letter that is not a call', () => {
    // y 的两笔被误识成 1n 时，不能强改成 ln（这是之前 y=x² 识别成 ln=x*2 的原因）。
    const glyphs = [glyph('1'), glyph('n'), glyph('='), glyph('x')];
    applyMathWordCorrection(glyphs);
    expect(glyphs.map((g) => g.char).join('')).toBe('1n=x');
  });

  it('does not rewrite a letter into a digit just to match a word', () => {
    // logx 里的 x 不是 log2 里的 2：只有分类器真的给出过该候选时才允许替换。
    const glyphs = [glyph('l'), glyph('o'), glyph('g'), { ...glyph('x'), alternatives: ['x'] }];
    applyMathWordCorrection(glyphs);
    expect(glyphs.map((g) => g.char).join('')).toBe('logx');
  });

  it('uses the alternatives of a rejected "?" glyph', () => {
    const glyphs = [glyph('s'), { ...glyph('?'), alternatives: ['i'] }, glyph('n')];
    applyMathWordCorrection(glyphs);
    expect(glyphs.map((g) => g.char).join('')).toBe('sin');
  });

  it('leaves non-math letter runs and isolated letters untouched', () => {
    expect(corrected(['q', 'w'])).toBe('qw');
    expect(corrected(['x'])).toBe('x');
    // 上标里的字母不是函数名语境。
    const sup = glyph('s', true);
    const out = applyMathWordCorrection([glyph('x'), sup]);
    expect(out[1].char).toBe('s');
    expect(out[1].superscript).toBe(true);
  });

  it('normalizes the display string too', () => {
    const glyphs = [glyph('5'), glyph('i'), glyph('n')];
    applyMathWordCorrection(glyphs);
    expect(glyphs.map((g) => g.displayChar).join('')).toBe('sin');
  });
});

describe('detectScriptPosition', () => {
  const base = glyph('x'); // bbox 0..10 → height 10, center 5
  const group = (centerY: number, height = 5) => ({
    height,
    centerY,
    bbox: { x0: 20, y0: centerY - height / 2, x1: 26, y1: centerY + height / 2 },
  });

  it('detects a small glyph above the baseline as superscript', () => {
    expect(detectScriptPosition(group(1.5), base)).toEqual({ superscript: true, subscript: false });
  });

  it('detects a small glyph below the baseline as subscript', () => {
    expect(detectScriptPosition(group(9), base)).toEqual({ superscript: false, subscript: true });
  });

  it('keeps baseline-sized digits as normal text', () => {
    expect(detectScriptPosition(group(5, 9), base)).toEqual({ superscript: false, subscript: false });
  });

  it('does not treat a low digit after an operator as a subscript', () => {
    expect(detectScriptPosition(group(9), glyph('+')).subscript).toBe(false);
  });

  it('rejects oversized glyphs below the baseline', () => {
    expect(detectScriptPosition(group(9, 9), base)).toEqual({ superscript: false, subscript: false });
  });
});
