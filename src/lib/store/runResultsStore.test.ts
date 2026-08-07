import { describe, it, expect, beforeEach } from 'vitest';
import {
  useRunResultsStore,
  computeBounds,
  flattenSegments,
} from './runResultsStore';

beforeEach(() => {
  useRunResultsStore.setState({ panels: [] });
});

describe('runResultsStore', () => {
  it('addRunResult 追加面板并赋 id/createdAt', () => {
    const p = useRunResultsStore.getState().addRunResult({
      title: 'sin(x)',
      kind: 'plot',
      curves: [{ id: 'c1', color: '#a78bfa', width: 2, points: [[0, 0], [1, 1]] }],
    });
    expect(p.id).toBeTruthy();
    expect(p.createdAt).toBeGreaterThan(0);
    expect(useRunResultsStore.getState().panels).toHaveLength(1);
  });

  it('超过 maxPanels 时丢弃最旧面板', () => {
    useRunResultsStore.setState({ maxPanels: 2 });
    const s = useRunResultsStore.getState();
    s.addRunResult({ title: 'a', kind: 'plot', curves: [] });
    s.addRunResult({ title: 'b', kind: 'plot', curves: [] });
    s.addRunResult({ title: 'c', kind: 'plot', curves: [] });
    const titles = useRunResultsStore.getState().panels.map((p) => p.title);
    expect(titles).toEqual(['b', 'c']);
  });

  it('贝塞尔曲线自动计算自动视口 (autoX/autoY)', () => {
    const p = useRunResultsStore.getState().addRunResult({
      title: 'curve',
      kind: 'curves',
      curves: [{
        id: 'c1',
        color: '#a78bfa',
        width: 2,
        segments: [{ cmd: 'lineTo', pts: [[0, 0], [10, 20]] }],
        imageW: 10,
        imageH: 20,
        flipY: true,
      }],
    });
    expect(p.autoX).toBeDefined();
    expect(p.autoY).toBeDefined();
    // 统一约定 y' = H-1-y：像素点 [[0,0],[10,20]] 经 flipY 映射为 [[0,19],[10,-1]]，
    // 包围盒 x 0..10 / y -1..19
    expect(p.autoX).toEqual([0, 10]);
    expect(p.autoY).toEqual([-1, 19]);
  });

  it('closePanel 关闭指定面板', () => {
    const s = useRunResultsStore.getState();
    const a = s.addRunResult({ title: 'a', kind: 'plot', curves: [] });
    const b = s.addRunResult({ title: 'b', kind: 'plot', curves: [] });
    useRunResultsStore.getState().closePanel(a.id);
    expect(useRunResultsStore.getState().panels.map((p) => p.title)).toEqual(['b']);
    expect(b.id).toBeTruthy();
  });

  it('clearPanels 清空全部', () => {
    useRunResultsStore.getState().addRunResult({ title: 'a', kind: 'plot', curves: [] });
    useRunResultsStore.getState().clearPanels();
    expect(useRunResultsStore.getState().panels).toHaveLength(0);
  });

  it('toggleCurveVisible 切换单条曲线显隐', () => {
    const p = useRunResultsStore.getState().addRunResult({
      title: 'a',
      kind: 'plot',
      curves: [
        { id: 'c1', color: '#fff', width: 2, points: [[0, 0]] },
        { id: 'c2', color: '#000', width: 2, points: [[1, 1]] },
      ],
    });
    const s = useRunResultsStore.getState();
    s.toggleCurveVisible(p.id, 'c1');
    let curves = useRunResultsStore.getState().panels[0].curves;
    expect(curves.find((c) => c.id === 'c1')!.visible).toBe(false);
    expect(curves.find((c) => c.id === 'c2')!.visible).toBeUndefined();
    // 再次切换恢复可见
    useRunResultsStore.getState().toggleCurveVisible(p.id, 'c1');
    curves = useRunResultsStore.getState().panels[0].curves;
    expect(curves.find((c) => c.id === 'c1')!.visible).toBe(true);
  });
});

describe('computeBounds', () => {
  it('忽略非法点', () => {
    const b = computeBounds([[0, 0], [NaN, 5], [2, 4]]);
    expect(b).toEqual({ minX: 0, maxX: 2, minY: 0, maxY: 4 });
  });
  it('空/全非法返回 null', () => {
    expect(computeBounds([])).toBeNull();
    expect(computeBounds([[NaN, NaN]])).toBeNull();
  });
});

describe('flattenSegments', () => {
  it('展开 lineTo 为折线', () => {
    const pts = flattenSegments([{ cmd: 'moveTo', pts: [[0, 0]] }, { cmd: 'lineTo', pts: [[2, 2], [4, 0]] }]);
    expect(pts.length).toBeGreaterThanOrEqual(3);
    expect(pts[0]).toEqual([0, 0]);
    expect(pts[pts.length - 1]).toEqual([4, 0]);
  });

  it('展开 schneider 三次贝塞尔段且首末点正确', () => {
    const pts = flattenSegments([{ p0: { x: 0, y: 0 }, c1: { x: 1, y: 3 }, c2: { x: 3, y: 3 }, p1: { x: 4, y: 0 } }]);
    expect(pts[0]).toEqual([0, 0]);
    expect(pts[pts.length - 1]).toEqual([4, 0]);
    expect(pts.length).toBe(13); // 1 + 12 subdivisions
  });
});