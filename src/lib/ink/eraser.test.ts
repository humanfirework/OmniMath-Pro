import { describe, expect, it } from 'vitest';
import { applyEraser } from './eraser';
import { PIXEL_CELL, type InkStroke } from './types';

function horizontal(count = 10): InkStroke {
  return {
    id: 's1',
    points: Array.from({ length: count }, (_, i) => ({ x: i * 10, y: 0, w: 4 })),
    color: '#000',
    width: 4,
    style: 'pen',
  };
}

function eraserAt(x: number, y = 0, width = 20): InkStroke {
  return {
    id: 'e1',
    points: [
      { x, y: y - 20 },
      { x, y: y + 20 },
    ],
    color: '#000',
    width,
    style: 'eraser',
  };
}

describe('applyEraser', () => {
  it('partial 模式沿路径切断自由笔迹', () => {
    const { next, changed } = applyEraser([horizontal()], eraserAt(50), 'partial');
    expect(changed).toBe(true);
    expect(next.length).toBe(2);
    expect(next[0].points.length).toBeLessThan(10);
    expect(next[0].id).not.toBe('s1');
  });

  it('stroke 模式整条删除', () => {
    const { next, changed } = applyEraser([horizontal()], eraserAt(50), 'stroke');
    expect(changed).toBe(true);
    expect(next).toEqual([]);
  });

  it('没碰到就不改', () => {
    const { next, changed } = applyEraser([horizontal()], eraserAt(500), 'stroke');
    expect(changed).toBe(false);
    expect(next).toHaveLength(1);
  });

  it('像素画逐格删除', () => {
    const pixel: InkStroke = {
      id: 'p1',
      points: [
        { x: 0, y: 0, w: PIXEL_CELL },
        { x: PIXEL_CELL, y: 0, w: PIXEL_CELL },
      ],
      color: '#000',
      width: PIXEL_CELL,
      style: 'pen',
      pixel: true,
    };
    const eraser: InkStroke = {
      id: 'e2',
      points: [{ x: PIXEL_CELL / 2, y: PIXEL_CELL / 2 }],
      color: '#000',
      width: 10,
      style: 'eraser',
    };
    const { next, changed } = applyEraser([pixel], eraser, 'partial');
    expect(changed).toBe(true);
    expect(next[0].points).toHaveLength(1);
    expect(next[0].points[0].x).toBe(PIXEL_CELL);
  });
});
