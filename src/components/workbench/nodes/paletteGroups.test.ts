import { describe, it, expect } from 'vitest';
import {
  PALETTE_GROUPS,
  DEFAULT_EXPANDED_CATEGORIES,
  groupByCategory,
} from './paletteGroups';

describe('paletteGroups — 右键菜单分类（vision/simulation/curve 清晰分组可见）', () => {
  it('vision 分类包含全部视觉节点（搜索可见 → 菜单也可见）', () => {
    const map = groupByCategory();
    const vision = map.get('vision');
    expect(vision).toBeDefined();
    // 关键：视觉节点必须出现在菜单分组里，解决"搜索能搜到、菜单却不显示"。
    expect(vision).toEqual(
      expect.arrayContaining([
        'image-input',
        'grayscale-threshold',
        'edge-detect',
        'contour-trace',
        'curve-fit',
        'plot-curves',
        'video-input',
        'frame-extract',
        'pose-track',
        'curve-animate',
      ]),
    );
  });

  it('simulation 分类包含全部仿真节点', () => {
    const sim = groupByCategory().get('simulation');
    expect(sim).toBeDefined();
    expect(sim).toContain('sim-scope');
    expect(sim).toContain('sim-sine');
    expect(sim).toContain('sim-integrator');
    expect(sim!.length).toBeGreaterThanOrEqual(10);
  });

  it('curve 分类包含曲线处理节点', () => {
    const curve = groupByCategory().get('curve');
    expect(curve).toBeDefined();
    expect(curve).toContain('parametric-curve');
    expect(curve).toContain('curve-resample');
  });

  it('control 分类包含 MATLAB 风格控制节点', () => {
    const ctl = groupByCategory().get('control');
    expect(ctl).toBeDefined();
    expect(ctl).toEqual(
      expect.arrayContaining([
        'control-tf',
        'control-feedback',
        'control-step',
        'control-impulse',
        'control-bode',
        'control-pole',
        'control-roots',
        'control-rlocus',
        'control-nyquist',
      ]),
    );
  });

  it('所有分类默认收起（用户偏好），搜索时再展开', () => {
    expect(DEFAULT_EXPANDED_CATEGORIES.size).toBe(0);
  });

  it('每个分类至少含一个节点，且无空分组', () => {
    for (const g of PALETTE_GROUPS) {
      expect(g.types.length).toBeGreaterThan(0);
    }
  });
});