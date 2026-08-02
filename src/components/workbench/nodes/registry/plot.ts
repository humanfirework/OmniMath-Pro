/**
 * Plot category node definitions.
 * 从 pipelineEngine.ts 拆分而来，行为保持完全一致。
 */

import { math, getEvalScope } from '@/lib/engine/mathInstance';
import type { NodeTypeDef } from '../pipelineEngine';
import { toExprString } from './helpers';

export const plotNodes = {
  'plot-output': {
    type: 'plot-output',
    category: 'plot',
    labelKey: 'npPlotOutput',
    icon: 'LineChart',
    color: 'violet',
    inputs: [{ id: 'expr', labelKey: 'npPortExpr', type: 'expression' }],
    outputs: [{ id: 'plot', labelKey: 'npPortPlot', type: 'plot' }],
    defaultConfig: { xMin: -10, xMax: 10 },
    execute: (inputs, config) => {
      const expr = toExprString(inputs.expr) || 'x';
      const xMin = Number(config.xMin ?? -10);
      const xMax = Number(config.xMax ?? 10);
      // Sample the curve so the node footer can show a sparkline.
      const samples: Array<[number, number]> = [];
      const N = 60;
      for (let i = 0; i <= N; i++) {
        const xv = xMin + ((xMax - xMin) * i) / N;
        try {
          const yv = Number(math.evaluate(expr, getEvalScope({ x: xv })));
          samples.push([xv, Number.isFinite(yv) ? yv : NaN]);
        } catch {
          samples.push([xv, NaN]);
        }
      }
      return { plot: { expr, xMin, xMax, samples } };
    },
  },
} satisfies Record<string, NodeTypeDef>;
