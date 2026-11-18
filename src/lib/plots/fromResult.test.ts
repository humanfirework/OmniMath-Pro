import { describe, expect, it } from 'vitest';
import { DEFAULT_CARTESIAN_RANGE } from '@/lib/engine/types';
import { buildPlotConfig } from './fromResult';

describe('buildPlotConfig', () => {
  it('2D 曲线：yRange 保持自动取景范围', () => {
    const cfg = buildPlotConfig(
      { plotExpression: 'sin(x)', plotType: 'cartesian', plotRange: [-5, 5] },
      '#2dd4bf',
    );
    expect(cfg).toEqual({
      expression: 'sin(x)',
      xRange: [-5, 5],
      yRange: [-50, 50],
      color: '#2dd4bf',
      plotType: 'cartesian',
      visible: true,
    });
  });

  it('3D 曲面：两个自变量使用同一范围，避免曲面被拉成长带', () => {
    const cfg = buildPlotConfig(
      { plotExpression: 'sin(x)*cos(y)', plotType: 'surface3d', plotRange: [-5, 5] },
      '#fbbf24',
    );
    expect(cfg?.xRange).toEqual([-5, 5]);
    expect(cfg?.yRange).toEqual([-5, 5]);
  });

  it('没有范围时回退到默认笛卡尔范围', () => {
    const cfg = buildPlotConfig({ plotExpression: 'x^2', plotType: 'cartesian' }, '#fff');
    expect(cfg?.xRange).toEqual(DEFAULT_CARTESIAN_RANGE);
    expect(cfg?.yRange).toEqual([-50, 50]);
  });

  it('没有可绘制表达式时返回 null', () => {
    expect(buildPlotConfig({ plotType: 'cartesian' }, '#fff')).toBeNull();
    expect(buildPlotConfig({ plotExpression: 'sin(x)' }, '#fff')).toBeNull();
  });
});
