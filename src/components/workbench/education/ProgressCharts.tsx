'use client';

/**
 * OmniMath Pro — 教育模块 · 进度曲线
 *
 * 纯 SVG 绘制的轻量统计图（不引入第三方图表库，保持依赖精简）：
 *  - 活动量折线/面积图（近 N 天）。
 *  - 累计完成「每日一题」的阶梯图。
 *  - 连续打卡增长曲线。
 *
 * 全部为纯展示组件；数据来自 educationStore 的 days 记录。
 */

import { useMemo } from 'react';
import { cn } from '@/lib/utils';

interface SeriesPoint {
  label: string;
  value: number;
}

interface ChartProps {
  data: SeriesPoint[];
  height?: number;
  /** 曲线颜色（描边）。 */
  color?: string;
  /** 是否填充面积。 */
  area?: boolean;
  /** 是否隐藏 Y 轴刻度。 */
  hideAxis?: boolean;
}

/** 计算 SVG 折线的 points 字符串。 */
function toPoints(data: SeriesPoint[], width: number, height: number, pad: number, max: number) {
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const step = data.length > 1 ? innerW / (data.length - 1) : 0;
  return data
    .map((p, i) => {
      const x = pad + step * i;
      const y = pad + innerH - (max > 0 ? (p.value / max) * innerH : 0);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

/** 通用 SVG 折线/面积图。 */
export function LineChart({
  data,
  height = 120,
  color = '#10b981',
  area = true,
  hideAxis = false,
}: ChartProps) {
  const width = 320;
  const pad = 18;
  const max = useMemo(
    () => Math.max(1, ...data.map((d) => d.value), 3),
    [data],
  );
  const points = useMemo(
    () => toPoints(data, width, height, pad, max),
    [data, height, max],
  );
  if (data.length < 2) return null;

  const step = data.length > 1 ? (width - pad * 2) / (data.length - 1) : 0;
  const rightX = pad + step * (data.length - 1);
  const areaPath = `${points} L ${rightX},${height - pad} L ${pad},${height - pad} Z`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full h-auto select-none"
      preserveAspectRatio="xMidYMid meet"
      role="img"
    >
      {/* 网格线 */}
      {!hideAxis &&
        [0.25, 0.5, 0.75].map((f) => (
          <line
            key={f}
            x1={pad}
            x2={width - pad}
            y1={pad + (height - pad * 2) * f}
            y2={pad + (height - pad * 2) * f}
            stroke="hsl(var(--border))"
            strokeDasharray="3 3"
            strokeWidth={0.6}
          />
        ))}
      {area && (
        <path d={areaPath} fill={color} opacity={0.12} stroke="none" />
      )}
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* 数据点 */}
      {data.map((p, i) => (
        <circle
          key={i}
          cx={parseFloat(points.split(' ')[i].split(',')[0])}
          cy={parseFloat(points.split(' ')[i].split(',')[1])}
          r={p.value > 0 ? 2 : 1}
          fill={p.value > 0 ? color : 'hsl(var(--muted-foreground))'}
          opacity={p.value > 0 ? 0.9 : 0.4}
        />
      ))}
    </svg>
  );
}

/** 横向条形图（用于对比各周/各模块）。 */
export function BarList({
  items,
  color = '#10b981',
}: {
  items: { label: string; value: number; unit?: string }[];
  color?: string;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="space-y-2">
      {items.map((it) => (
        <div key={it.label} className="flex items-center gap-2">
          <span className="w-16 shrink-0 truncate text-[10.5px] text-muted-foreground">
            {it.label}
          </span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-border/40">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${(it.value / max) * 100}%`,
                backgroundColor: color,
                opacity: it.value > 0 ? 0.85 : 0,
              }}
            />
          </div>
          <span className="w-12 shrink-0 text-right text-[10.5px] font-medium text-foreground/80">
            {it.value}
            {it.unit ? ` ${it.unit}` : ''}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────
   聚合：把 days 记录整理成各图所需序列
   ─────────────────────────────────────────────────────────────── */

/** 近 n 天的活动量序列（含 0 值占位，保证折线连续）。 */
export function dailySeries(
  days: Record<string, { count: number; solved?: boolean }>,
  n: number,
  now = new Date(),
): SeriesPoint[] {
  const out: SeriesPoint[] = [];
  const key = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const k = key(d);
    out.push({
      label: `${d.getMonth() + 1}/${d.getDate()}`,
      value: days[k]?.count ?? 0,
    });
  }
  return out;
}

/** 近 n 天的累计「完成每日一题」阶梯序列。 */
export function cumulativeSolvedSeries(
  days: Record<string, { count: number; solved?: boolean }>,
  n: number,
  now = new Date(),
): SeriesPoint[] {
  const key = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  let acc = 0;
  const out: SeriesPoint[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const k = key(d);
    if (days[k]?.solved) acc++;
    out.push({ label: `${d.getMonth() + 1}/${d.getDate()}`, value: acc });
  }
  return out;
}

/** 按周聚合的活动量（近 8 周）。 */
export function weeklySeries(
  days: Record<string, { count: number; solved?: boolean }>,
  weeks = 8,
  now = new Date(),
): { label: string; value: number; unit?: string }[] {
  const key = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const out: { label: string; value: number }[] = [];
  const end = new Date(now);
  end.setHours(0, 0, 0, 0);
  const lastSunday = new Date(end);
  lastSunday.setDate(end.getDate() - end.getDay());
  for (let w = weeks - 1; w >= 0; w--) {
    const start = new Date(lastSunday);
    start.setDate(lastSunday.getDate() - w * 7);
    let total = 0;
    for (let d = 0; d < 7; d++) {
      const dd = new Date(start);
      dd.setDate(start.getDate() + d);
      if (dd > end) break;
      total += days[key(dd)]?.count ?? 0;
    }
    out.push({ label: `${start.getMonth() + 1}/${start.getDate()}`, value: total });
  }
  return out;
}

/** 进度卡片容器（统一圆角 + 边框 + 标题）。 */
export function ChartCard({
  title,
  subtitle,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-border/60 bg-card/60 p-4 backdrop-blur-sm',
        className,
      )}
    >
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="text-[12.5px] font-semibold text-foreground/90">{title}</span>
        {subtitle && (
          <span className="text-[10px] text-muted-foreground">{subtitle}</span>
        )}
      </div>
      {children}
    </div>
  );
}
