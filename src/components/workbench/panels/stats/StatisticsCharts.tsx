'use client';

/**
 * OmniMath Pro — 交互式统计图表网格
 *
 * 把直方图 / 箱线图 / ECDF / QQ / KDE 以响应式栅格并排展示（消除原 SVG 固定宽度
 * 造成的重叠），每个图独立可缩放 / 平移 / 悬停 tooltip。对齐 MATLAB Statistics
 * Toolbox 的分布图集。
 */

import { useMemo, useState } from 'react';
import { HistogramChart } from './HistogramChart';
import { BoxplotChart } from './BoxplotChart';
import { ViolinChart } from './ViolinChart';
import { ECDFChart } from './ECDFChart';
import { QQChart } from './QQChart';
import { PPChart } from './PPChart';
import { KdeChart } from './KdeChart';
import { makeDist } from '@/lib/probability/distributions';
import { fitDistribution } from '@/lib/probability/fitter';
import type { BinRule } from '@/lib/probability/stats';

export interface StatisticsChartsProps {
  data: number[];
  binRule?: BinRule;
  density?: boolean;
}

/** QQ/PP 可切换的对照分布。 */
const QQ_DISTS: { value: string; label: string }[] = [
  { value: 'normal', label: '正态' },
  { value: 'lognormal', label: '对数正态' },
  { value: 'exponential', label: '指数' },
  { value: 'gamma', label: 'Gamma' },
  { value: 'weibull', label: 'Weibull' },
  { value: 'uniform', label: '均匀' },
];

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border/40 bg-card/50 p-2 min-w-0">
      <div className="text-[11px] font-semibold text-muted-foreground px-1">{title}</div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function StatisticsCharts({ data, binRule = 'sturges', density = false }: StatisticsChartsProps) {
  const empty = data.length === 0;
  const memoData = useMemo(() => data, [data]);
  const [qqKind, setQqKind] = useState('normal');

  // 按所选分布拟合数据，得到参数以驱动 QQ/PP 的理论曲线
  const qqDist = useMemo(() => {
    if (qqKind === 'normal') return null;
    try {
      return makeDist(qqKind as Parameters<typeof makeDist>[0], fitParamsOf(qqKind, memoData));
    } catch {
      return null;
    }
  }, [qqKind, memoData]);

  if (empty) {
    return (
      <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-border/50 text-sm text-muted-foreground">
        暂无数据，请输入或载入数据集
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10.5px] text-muted-foreground">QQ/PP 对照分布</span>
        <select
          value={qqKind}
          onChange={(e) => setQqKind(e.target.value)}
          className="h-6 rounded border border-border/60 bg-background px-1.5 text-[11px] outline-none"
        >
          {QQ_DISTS.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
        <ChartCard title="直方图 + 分布">
          <HistogramChart data={memoData} binRule={binRule} density={density} minHeight={200} />
        </ChartCard>
        <ChartCard title="箱线图（凹口）">
          <BoxplotChart data={memoData} notch minHeight={200} />
        </ChartCard>
        <ChartCard title="小提琴图">
          <ViolinChart data={memoData} minHeight={200} />
        </ChartCard>
        <ChartCard title="经验 CDF">
          <ECDFChart data={memoData} minHeight={200} />
        </ChartCard>
        <ChartCard title={`QQ 图（${QQ_DISTS.find((d) => d.value === qqKind)?.label ?? qqKind}）`}>
          <QQChart data={memoData} distKind={qqKind} distParams={fitParamsOf(qqKind, memoData)} minHeight={200} />
        </ChartCard>
        <ChartCard title="P-P 图（拟合优度）">
          <PPChart data={memoData} cdf={qqDist ? (x: number) => qqDist.cdf(x) : undefined} minHeight={200} />
        </ChartCard>
        <ChartCard title="核密度估计 KDE">
          <KdeChart data={memoData} minHeight={200} />
        </ChartCard>
      </div>
    </div>
  );
}

/** 用 MLE 拟合所选分布参数；normal 返回空（QQChart 内部用标准正态）。 */
function fitParamsOf(kind: string, data: number[]): Record<string, number> {
  if (kind === 'normal') return {};
  try {
    const f = fitDistribution(kind as Parameters<typeof fitDistribution>[0], data);
    return Number.isFinite(f.logLik) ? f.params : {};
  } catch {
    return {};
  }
}