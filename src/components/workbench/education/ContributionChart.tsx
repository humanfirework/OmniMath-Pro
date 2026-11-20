'use client';

/**
 * OmniMath Pro — 教育模块 · 贡献热力表（GitHub 风格）
 *
 * 把「过去若干周每天的活动量」渲染成 GitHub contribution 那样的网格：
 *  - 每一列代表一周（按自然周对齐，周日起始）。
 *  - 每一格代表一天，颜色随当天活动量分级（0 / 1 / 2 / 3+）。
 *  - 悬停显示当天的日期与完成情况（答对每日一题时额外打星）。
 *
 * 数据来自 educationStore 的 lastNDays，纯展示组件，无副作用。
 */

import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';

interface ContributionChartProps {
  /** 日期 -> 当天记录（含 count 与 solved）。 */
  days: Record<string, { count: number; solved?: boolean }>;
  /** 统计的周数（默认 15 周 ≈ 105 天）。 */
  weeks?: number;
  now?: Date;
}

/** 本地日期字符串 YYYY-MM-DD（避免时区偏移）。 */
function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

interface Cell {
  date: string;
  /** 0..N 活动量。 */
  count: number;
  solved: boolean;
}

/** 活动量 → 颜色等级（0 为空，1–2 浅，3–4 中，5+ 深）。 */
function level(count: number): 0 | 1 | 2 | 3 {
  if (count <= 0) return 0;
  if (count <= 2) return 1;
  if (count <= 4) return 2;
  return 3;
}

const LEVEL_CLASS: Record<number, string> = {
  0: 'bg-border/40',
  1: 'bg-emerald-500/25 hover:bg-emerald-500/40',
  2: 'bg-emerald-500/55 hover:bg-emerald-500/70',
  3: 'bg-emerald-500/90 hover:bg-emerald-500',
};

const WEEKDAY_LABEL = ['', '一', '', '三', '', '五', ''];

export function ContributionChart({
  days,
  weeks: initialWeeks = 15,
  now = new Date(),
}: ContributionChartProps) {
  // 可视周数切换：整年 52 周（≈365 天铺开）/ 半年 26 周 / 近 15 周。
  const [weeks, setWeeks] = useState(initialWeeks);
  const weekOptions = [
    { n: 52, label: '近一年' },
    { n: 26, label: '近半年' },
    { n: 15, label: '近 15 周' },
  ];
  const grid = useMemo<Cell[][]>(() => {
    // 找到「最近一个周日起始」作为网格右端。
    const end = new Date(now);
    end.setHours(0, 0, 0, 0);
    // 定位到本周末尾（下个周日）作为可视范围的终点，保证整周对齐。
    const dow = end.getDay(); // 0 = 周日
    const thisSunday = new Date(end);
    thisSunday.setDate(end.getDate() - dow);
    // 终点为「最后一天所在周的周日」。
    const lastSunday = new Date(thisSunday);
    // 以 lastSunday 为最后一列。天数 = weeks*7，起点即起始周日。
    const start = new Date(lastSunday);
    start.setDate(lastSunday.getDate() - (weeks - 1) * 7);

    const cols: Cell[][] = [];
    for (let col = 0; col < weeks; col++) {
      const column: Cell[] = [];
      for (let row = 0; row < 7; row++) {
        const d = new Date(start);
        d.setDate(start.getDate() + col * 7 + row);
        // 只保留在可视时间窗内（不早于起始周日，不晚于结束周日的今天）。
        if (d > lastSunday) break;
        const key = dayKey(d);
        const rec = days[key];
        column.push({
          date: key,
          count: rec?.count ?? 0,
          solved: rec?.solved ?? false,
        });
      }
      cols.push(column);
    }
    return cols;
  }, [days, weeks, now]);

  // 统计总活动天数与总活动量（供顶部小结）。
  const totals = useMemo(() => {
    let activeDays = 0;
    let solved = 0;
    for (const col of grid) {
      for (const c of col) {
        if (c.count > 0) activeDays++;
        if (c.solved) solved++;
      }
    }
    return { activeDays, solved };
  }, [grid]);

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <span className="text-[12px] font-semibold text-foreground/90">
            过去 {weeks} 周学习足迹
          </span>
          <span className="text-[10.5px] text-muted-foreground">
            {totals.activeDays} 天活动 · {totals.solved} 天完成每日一题
          </span>
        </div>
        <div className="flex items-center gap-0.5 rounded-lg border border-border/60 bg-background/40 p-0.5">
          {weekOptions.map((o) => (
            <button
              key={o.n}
              type="button"
              onClick={() => setWeeks(o.n)}
              className={cn(
                'h-6 rounded-md px-2 text-[10.5px] font-medium transition-colors',
                weeks === o.n
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        {/* 左侧星期标签 */}
        <div className="flex flex-col justify-start gap-[3px] pt-[14px]">
          {WEEKDAY_LABEL.map((label, i) => (
            <span
              key={i}
              className={cn(
                'text-[9px] leading-3 text-muted-foreground/70',
                label === '' && 'invisible',
              )}
            >
              {label}
            </span>
          ))}
        </div>

        {/* 网格主体 */}
        <div className="flex gap-[3px]">
          {grid.map((col, ci) => (
            <div key={ci} className="flex flex-col gap-[3px]">
              {col.map((cell, ri) => (
                <div
                  key={ri}
                  className={cn(
                    'group relative size-2.5 rounded-[3px] transition-colors',
                    LEVEL_CLASS[level(cell.count)],
                    cell.solved && cell.count > 0 && 'ring-1 ring-amber-400/70',
                  )}
                >
                  {/* 悬停提示：首行向下弹出（避免被上方滚动容器裁剪），其余行向上弹出 */}
                  <div
                    className={cn(
                      'pointer-events-none absolute left-1/2 z-50 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-[10px] text-popover-foreground shadow-md group-hover:block',
                      ri === 0
                        ? 'top-full mt-1'
                        : 'bottom-full',
                    )}
                  >
                    <span className="font-medium">{cell.date}</span>
                    <span className="text-muted-foreground">
                      {' · '}
                      {cell.count > 0 ? `${cell.count} 次活动` : '未活动'}
                      {cell.solved && ' · 完成每日一题'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* 图例 */}
      <div className="flex items-center gap-1.5 text-[9.5px] text-muted-foreground">
        <span>少</span>
        {[0, 1, 2, 3].map((l) => (
          <span
            key={l}
            className={cn('size-2 rounded-[3px]', LEVEL_CLASS[l])}
          />
        ))}
        <span>多</span>
        <span className="ml-2 inline-flex items-center gap-1">
          <span className="size-2 rounded-[3px] ring-1 ring-amber-400/70 bg-emerald-500/25" />
          有圆环 = 当天完成每日一题
        </span>
      </div>
    </div>
  );
}
