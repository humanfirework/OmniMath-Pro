/**
 * 把求值结果转换成绘图配置。
 *
 * 关键区别：`yRange` 在 2D 里是屏幕纵向范围（习惯留 [-50,50] 交给自动
 * 取景），而在 3D 里是第二个自变量的定义域。两者混用会把曲面在 y 方向
 * 拉成一条长带，因此这里统一收口并补单测。
 */

import { DEFAULT_CARTESIAN_RANGE } from '@/lib/engine/types';
import type { CalculationResult, PlotConfig } from '@/lib/store/workbench';

export type PlotResultInput = Pick<
  CalculationResult,
  'plotExpression' | 'plotType' | 'plotRange'
>;

export function buildPlotConfig(
  result: PlotResultInput,
  color: string,
): Omit<PlotConfig, 'id'> | null {
  if (!result.plotExpression || !result.plotType) return null;
  const range = result.plotRange ?? DEFAULT_CARTESIAN_RANGE;
  return {
    expression: result.plotExpression,
    xRange: range,
    yRange: result.plotType === 'surface3d' ? range : [-50, 50],
    color,
    plotType: result.plotType,
    visible: true,
  };
}
