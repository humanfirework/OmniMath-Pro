/**
 * Unit tests for src/lib/plots/viewport.ts
 *
 * 覆盖：签名稳定性（顺序无关）、同数量删除+新增必须变化、最新曲线
 * xRange 的实质性变化必须变化、浮点微小抖动不误判、空集合。
 */
import { describe, it, expect } from 'vitest';
import { plotViewSignature, type ViewSignaturePlot } from './viewport';

const p = (id: string, xRange?: [number, number]): ViewSignaturePlot => ({ id, xRange });

describe('plotViewSignature', () => {
  it('returns a dedicated value for an empty plot set', () => {
    expect(plotViewSignature([])).toBe('empty');
  });

  it('is order-independent for the same id set and latest plot', () => {
    const a = [p('a', [-10, 10]), p('b', [-5, 5]), p('c', [-1, 1])];
    const b = [p('b', [-5, 5]), p('a', [-10, 10]), p('c', [-1, 1])];
    expect(plotViewSignature(a)).toBe(plotViewSignature(b));
  });

  it('changes when one curve is deleted and another with the same count is added', () => {
    const before = [p('plot-1', [-10, 10]), p('plot-2', [-10, 10])];
    const after = [p('plot-1', [-10, 10]), p('plot-3', [-10, 10])];
    expect(after.length).toBe(before.length);
    expect(plotViewSignature(after)).not.toBe(plotViewSignature(before));
  });

  it('changes when the latest plot xRange meaningfully changes', () => {
    const before = [p('plot-1', [-10, 10])];
    const after = [p('plot-1', [-20, 20])];
    expect(plotViewSignature(after)).not.toBe(plotViewSignature(before));
  });

  it('changes when a new latest plot brings a different xRange', () => {
    const before = [p('plot-1', [-10, 10])];
    const after = [p('plot-1', [-10, 10]), p('plot-2', [-1, 1])];
    expect(plotViewSignature(after)).not.toBe(plotViewSignature(before));
  });

  it('ignores sub-precision xRange jitter', () => {
    const before = [p('plot-1', [-10, 10])];
    const jitter = [p('plot-1', [-10 + 1e-9, 10 - 1e-9])];
    expect(plotViewSignature(jitter)).toBe(plotViewSignature(before));
  });

  it('treats missing / non-finite xRange as a stable placeholder', () => {
    expect(plotViewSignature([p('a')])).toBe(plotViewSignature([p('a')]));
    expect(plotViewSignature([p('a', [Number.NaN, Number.NaN])])).toBe(
      plotViewSignature([p('a')]),
    );
    expect(plotViewSignature([p('a', [Number.NaN, 10])])).not.toBe(
      plotViewSignature([p('a')]),
    );
  });
});
