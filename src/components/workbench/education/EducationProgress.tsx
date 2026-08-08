'use client';

/**
 * OmniMath Pro — 教育模块 · 进度轨迹
 *
 * 汇总展示学习进展：
 *  - 顶部：四项核心统计卡（连续天数 / 历史最高 / 累计答对 / 累计活动量）。
 *  - 中部：GitHub 风格贡献热力表（近 15 周）。
 *  - 下部：活动量折线、累计完成阶梯、按周对比条形 三张曲线图。
 *
 * 全部为本地数据的纯展示，数据来自 educationStore。
 */

import { useMemo } from 'react';
import {
  Flame,
  Trophy,
  CheckCircle2,
  Activity,
  Target,
} from 'lucide-react';
import {
  useEducationStore,
  computeStats,
} from '@/lib/store/educationStore';
import { ContributionChart } from './ContributionChart';
import {
  dailySeries,
  cumulativeSolvedSeries,
  weeklySeries,
  LineChart,
  BarList,
  ChartCard,
} from './ProgressCharts';
import { cn } from '@/lib/utils';

export function EducationProgress() {
  const days = useEducationStore((s) => s.days);
  const wrongBook = useEducationStore((s) => s.wrongBook);
  const recoveries = useEducationStore((s) => s.recoveries);
  const papers = useEducationStore((s) => s.papers);

  const stats = useMemo(
    () => computeStats(days, wrongBook, recoveries, 0, papers),
    [days, wrongBook, recoveries, papers],
  );

  const daily = useMemo(() => dailySeries(days, 30), [days]);
  const cumulative = useMemo(() => cumulativeSolvedSeries(days, 30), [days]);
  const weekly = useMemo(() => weeklySeries(days, 8), [days]);

  const statCards = [
    {
      label: '当前连续',
      value: `${stats.streak} 天`,
      icon: Flame,
      color: 'text-orange-500',
      bg: 'bg-orange-500/10',
    },
    {
      label: '历史最高',
      value: `${stats.bestStreak} 天`,
      icon: Trophy,
      color: 'text-amber-500',
      bg: 'bg-amber-500/10',
    },
    {
      label: '累计答对',
      value: `${stats.totalSolved} 题`,
      icon: CheckCircle2,
      color: 'text-emerald-500',
      bg: 'bg-emerald-500/10',
    },
    {
      label: '累计活动量',
      value: `${stats.totalActivities}`,
      icon: Activity,
      color: 'text-sky-500',
      bg: 'bg-sky-500/10',
    },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      {/* 统计卡 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {statCards.map((c) => {
          const Icon = c.icon;
          return (
            <div
              key={c.label}
              className="rounded-2xl border border-border/60 bg-card/60 p-4 backdrop-blur-sm"
            >
              <div className={cn('mb-2 grid size-8 place-items-center rounded-xl', c.bg)}>
                <Icon className={cn('size-4', c.color)} />
              </div>
              <div className="text-[20px] font-semibold leading-tight text-foreground">
                {c.value}
              </div>
              <div className="mt-0.5 text-[10.5px] text-muted-foreground">{c.label}</div>
            </div>
          );
        })}
      </div>

      {/* 难度解锁状态 */}
      <div className="rounded-2xl border border-border/60 bg-card/60 p-4 backdrop-blur-sm">
        <div className="mb-3 flex items-center gap-2">
          <Target className="size-4 text-primary" />
          <span className="text-[12.5px] font-semibold text-foreground/90">难度解锁</span>
          <span className="text-[10.5px] text-muted-foreground">
            连续学习天数越多，解锁的题目越有挑战
          </span>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          {[
            { level: 1, name: '热身', desc: '连续 0 天即可', unlocked: true, need: 0 },
            { level: 2, name: '探索', desc: '连续 3 天解锁', unlocked: stats.level >= 2, need: 3 },
            { level: 3, name: '进阶', desc: '连续 7 天解锁', unlocked: stats.level >= 3, need: 7 },
          ].map((l) => {
            const progress = Math.min(1, stats.bestStreak / l.need);
            return (
              <div
                key={l.level}
                className={cn(
                  'rounded-xl border p-3 transition-colors',
                  l.unlocked
                    ? 'border-primary/40 bg-primary/8'
                    : 'border-border/60 bg-background/40',
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-semibold text-foreground/90">
                    {'★'.repeat(l.level)}
                  </span>
                  <span className={cn('text-[11px] font-medium', l.unlocked ? 'text-primary' : 'text-muted-foreground')}>
                    {l.unlocked ? '已解锁' : '未解锁'}
                  </span>
                </div>
                <div className="mt-0.5 text-[12px] font-medium text-foreground">{l.name}</div>
                <div className="text-[10.5px] text-muted-foreground">{l.desc}</div>
                {!l.unlocked && (
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-border/40">
                    <div
                      className="h-full rounded-full bg-primary/70"
                      style={{ width: `${progress * 100}%` }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 贡献热力表 */}
      <ChartCard title="学习足迹" subtitle="GitHub 风格 · 整年铺开 · 悬停查看详情">
        <ContributionChart days={days} weeks={52} />
      </ChartCard>

      {/* 曲线图 */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="近 30 天活动量" subtitle="折线 + 面积">
          <LineChart data={daily} color="#10b981" area />
        </ChartCard>
        <ChartCard title="累计完成每日一题" subtitle="阶梯增长">
          <LineChart data={cumulative} color="#6366f1" area={false} />
        </ChartCard>
      </div>

      <ChartCard title="近 8 周对比" subtitle="每周活动总量">
        <BarList items={weekly} color="#f59e0b" />
      </ChartCard>
    </div>
  );
}
