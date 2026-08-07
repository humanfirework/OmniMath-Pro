'use client';

/**
 * OmniMath Pro — Statistics Workbench (独立全屏概率统计视图)
 *
 * 与 SolverWorkbench / LinearAlgebraWorkbench 对齐的独立窗口布局：
 * 左侧导航（描述统计 / 概率分布 / 假设检验 / 回归分析）+ 右侧主区域。
 * 每个子模块复用 StatisticsPanel 中已导出的 Tab 组件，保证与侧边栏内
 * 逻辑完全一致，同时获得更宽裕的全屏排版空间。
 */

import { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BarChart3,
  Sigma,
  FlaskConical,
  TrendingUp,
  PanelTopOpen,
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DescriptiveStatsTab,
  DistributionTab,
  HypothesisTab,
  RegressionTab,
} from './StatisticsPanel';
import { FigureWindow } from '@/components/figure/FigureWindow';
import { cn } from '@/lib/utils';

type StatNavId = 'descriptive' | 'distribution' | 'hypothesis' | 'regression';

const NAV_ITEMS: {
  id: StatNavId;
  icon: typeof Sigma;
  label: string;
  desc: string;
}[] = [
  { id: 'descriptive', icon: Sigma, label: '描述统计', desc: '均值 / 中位数 / 标准差 / 分位数' },
  { id: 'distribution', icon: BarChart3, label: '概率分布', desc: 'PDF / CDF / 分位数 / 随机数' },
  { id: 'hypothesis', icon: FlaskConical, label: '假设检验', desc: 't 检验 / 卡方拟合优度' },
  { id: 'regression', icon: TrendingUp, label: '回归分析', desc: '最小二乘线性回归' },
];

export function StatisticsWorkbench() {
  const [nav, setNav] = useState<StatNavId>('descriptive');
  const [popupOpen, setPopupOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const active = NAV_ITEMS.find((n) => n.id === nav) ?? NAV_ITEMS[0];
  const ActiveIcon = active.icon;

  return (
    <div className="h-full w-full flex min-h-0 bg-background/40">
      {/* ─── 左侧统计模块导航 ─────────────────────────────────── */}
      <aside className="w-64 shrink-0 flex flex-col border-r border-border/60 bg-card/30 backdrop-blur-sm">
        <div className="shrink-0 h-10 px-3 flex items-center gap-1.5 border-b border-border/60 bg-background/40">
          <BarChart3 className="size-3.5 text-primary" />
          <span className="text-[12px] font-semibold tracking-tight">概率统计</span>
        </div>
        <ScrollArea className="flex-1 min-h-0">
          <ul className="p-2 space-y-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = item.id === nav;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => setNav(item.id)}
                    className={cn(
                      'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md transition-colors text-left',
                      isActive
                        ? 'bg-primary/12 text-primary'
                        : 'hover:bg-accent/60 text-foreground/85',
                    )}
                  >
                    <span
                      className={cn(
                        'grid place-items-center size-7 rounded-md shrink-0',
                        isActive
                          ? 'bg-primary/20 text-primary border border-primary/40'
                          : 'bg-muted/50 border border-border/60 text-muted-foreground',
                      )}
                    >
                      <Icon className="size-3.5" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-semibold truncate">{item.label}</div>
                      <div className="text-[10px] text-muted-foreground truncate">{item.desc}</div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </ScrollArea>
      </aside>

      {/* ─── 右侧主区域（响应式：min-w-0 避免窗口缩放/全屏时溢出错位） ── */}
      <main className="flex-1 min-w-0 min-h-0 flex flex-col">
        {/* 标题条 */}
        <div className="shrink-0 h-11 px-4 flex items-center gap-2 border-b border-border/60 bg-background/30">
          <ActiveIcon className="size-4 text-primary" />
          <span className="text-[13px] font-semibold tracking-tight">{active.label}</span>
          <span className="text-[11px] text-muted-foreground">{active.desc}</span>
          <div className="flex-1" />
          <button
            onClick={() => setPopupOpen((v) => !v)}
            className={cn(
              'flex items-center gap-1.5 px-2.5 h-7 rounded-md border text-[11px] transition-colors',
              popupOpen
                ? 'bg-primary/15 text-primary border-primary/30'
                : 'border-border/60 text-muted-foreground hover:text-foreground hover:bg-accent',
            )}
            title="在独立 Figure 窗口中打开（共享标题栏 / 工具栏 / 导出）"
          >
            <PanelTopOpen className="size-3.5" />
            <span className="hidden sm:inline">{popupOpen ? '关闭 Figure' : '独立 Figure'}</span>
          </button>
        </div>

        <ScrollArea className="flex-1 min-h-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={nav}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="p-4"
              ref={contentRef}
            >
              {nav === 'descriptive' && <DescriptiveStatsTab fullscreen />}
              {nav === 'distribution' && <DistributionTab fullscreen />}
              {nav === 'hypothesis' && <HypothesisTab />}
              {nav === 'regression' && <RegressionTab />}
            </motion.div>
          </AnimatePresence>
        </ScrollArea>
      </main>

      {/* ─── G4：独立 Figure 窗口（共享标题栏 / 工具栏 / 导出） ── */}
      <AnimatePresence>
        {popupOpen && (
          <FigureWindow
            id="statistics-figure"
            title={`${active.label} · 独立 Figure`}
            icon={<BarChart3 className="size-3 text-primary" />}
            onClose={() => setPopupOpen(false)}
            getSources={() => ({
              node: contentRef.current,
              defaultName: `omnimath-stats-${nav}`,
            })}
            initial={{ x: 60, y: 60, w: 560, h: 440 }}
          >
            <div className="h-full w-full overflow-auto p-3">
              {nav === 'descriptive' && <DescriptiveStatsTab fullscreen />}
              {nav === 'distribution' && <DistributionTab fullscreen />}
              {nav === 'hypothesis' && <HypothesisTab />}
              {nav === 'regression' && <RegressionTab />}
            </div>
          </FigureWindow>
        )}
      </AnimatePresence>
    </div>
  );
}