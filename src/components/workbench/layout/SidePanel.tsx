'use client';

/**
 * OmniMath Pro — Side Panel container
 *
 * Switches the active panel based on `activeSidePanel` from the store.
 * Header: panel title (i18n) + collapse button.
 * Body: ScrollArea-wrapped panel.
 *
 * 性能：重量级面板（求解器 / 统计 / 线性代数 / 公式库）用 React.lazy 懒加载，
 * 仅在用户真正切换到对应 tab 时才加载对应代码块，避免应用启动 / 切换 tab 时
 * 一次性实例化所有面板导致的卡顿。轻量面板（历史 / 变量 / 文件）保持静态导入。
 */

import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { PanelLeftClose, Clock, Variable, BookOpen, Grid3x3, FunctionSquare, FileCode2, BarChart3 } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useWorkbenchStore } from '@/lib/store/workbench';
import { t, useLocale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { SidePanelTab } from '@/lib/store/workbench';
import type { TranslationDict } from '@/lib/i18n';
import HistoryPanel from '@/components/workbench/panels/HistoryPanel';
import { VariablesPanel } from '@/components/workbench/panels/VariablesPanel';
import { FilesPanel } from '@/components/workbench/panels/FilesPanel';

const FormulaLibraryPanel = lazy(() =>
  import('@/components/workbench/panels/FormulaLibraryPanel').then((m) => ({ default: m.FormulaLibraryPanel })),
);
const LinearAlgebraPanel = lazy(() =>
  import('@/components/workbench/panels/LinearAlgebraPanel').then((m) => ({ default: m.LinearAlgebraPanel })),
);
const SolverPanel = lazy(() =>
  import('@/components/workbench/panels/SolverPanel').then((m) => ({ default: m.SolverPanel })),
);
const StatisticsPanel = lazy(() =>
  import('@/components/workbench/panels/StatisticsPanel').then((m) => ({ default: m.StatisticsPanel })),
);

const PANEL_TITLE_KEY: Record<SidePanelTab, keyof TranslationDict> = {
  history: 'histTitle',
  variables: 'varsTitle',
  formulas: 'formulasTitle',
  linalg: 'linalgTitle',
  solver: 'solverTitle',
  files: 'tabFiles',
  stats: 'statsTitle',
};

const PANEL_ICON: Record<SidePanelTab, typeof Clock> = {
  history: Clock,
  variables: Variable,
  formulas: BookOpen,
  linalg: Grid3x3,
  solver: FunctionSquare,
  files: FileCode2,
  stats: BarChart3,
};

/** 懒加载面板切换时的轻量占位，避免白屏闪烁。 */
function PanelLoading() {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="size-4 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
    </div>
  );
}

const SIDE_PANEL_TABS: SidePanelTab[] = [
  'history', 'variables', 'files', 'formulas', 'linalg', 'solver', 'stats',
];

/** 桌面侧栏头部常驻的四个高频面板（历史 / 变量 / 文件 / 公式）。
 *  其余重型面板（矩阵/求解/统计）仍在活动栏或「全部工具」里，避免标题栏拥挤。 */
const PRIMARY_TABS: SidePanelTab[] = ['history', 'variables', 'files', 'formulas'];

export function SidePanel({ onClose }: { onClose?: () => void } = {}) {
  useLocale();
  const activeSidePanel = useWorkbenchStore((s) => s.activeSidePanel);
  const setActiveSidePanel = useWorkbenchStore((s) => s.setActiveSidePanel);
  const toggleSidePanel = useWorkbenchStore((s) => s.toggleSidePanel);

  // 关键修复：面板状态持久化。
  // 之前这里用 switch 返回单个面板，切换 tab 时 React 会「卸载」旧面板并「挂载」新面板，
  // 导致面板内部所有本地 useState（矩阵、方程、结果等）在切换后全部丢失、归零。
  // 现在改为「访问过的面板始终保持挂载」，仅用 CSS 隐藏非激活面板：
  //   - 首次访问某 tab 才加载对应代码块（懒加载性能优势保留）；
  //   - 一旦访问过，面板及其本地状态一直驻留，来回切换不再丢数据；
  //   - 切回已访问面板是瞬时响应，无需重新初始化。
  const [visited, setVisited] = useState<Set<SidePanelTab>>(() => new Set([activeSidePanel]));
  useEffect(() => {
    setVisited((prev) => {
      if (prev.has(activeSidePanel)) return prev;
      const next = new Set(prev);
      next.add(activeSidePanel);
      return next;
    });
  }, [activeSidePanel]);

  const renderPanel = useCallback((tab: SidePanelTab) => {
    switch (tab) {
      case 'history':
        return <HistoryPanel />;
      case 'variables':
        return <VariablesPanel />;
      case 'files':
        return <FilesPanel />;
      case 'formulas':
        return <FormulaLibraryPanel />;
      case 'linalg':
        return <LinearAlgebraPanel />;
      case 'solver':
        return <SolverPanel />;
      case 'stats':
        return <StatisticsPanel />;
      default:
        return null;
    }
  }, []);

  return (
    <div className="flex flex-col h-full bg-card/40">
      {/* Header — 手机端由下面的标签条 + 关闭按钮代替，省掉一整行 */}
      <div className="hidden md:flex shrink-0 h-9 items-center justify-between px-2 border-b border-border/60 bg-background/40">
        <div className="flex items-center gap-1.5 px-1 min-w-0">
          {(() => {
            const Icon = PANEL_ICON[activeSidePanel];
            return <Icon className="size-3.5 text-primary shrink-0" />;
          })()}
          <span className="text-[11.5px] font-semibold tracking-tight text-foreground/85 truncate">
            {t(PANEL_TITLE_KEY[activeSidePanel])}
          </span>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          {/* 桌面端常驻四个高频面板：侧栏打开时一眼就能切换，
              不必再去「全部工具」菜单里找历史 / 变量 / 公式。 */}
          {PRIMARY_TABS.map((tab) => {
            const Icon = PANEL_ICON[tab];
            const active = tab === activeSidePanel;
            return (
              <Tooltip key={tab}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => setActiveSidePanel(tab)}
                    aria-label={t(PANEL_TITLE_KEY[tab])}
                    aria-pressed={active}
                    className={cn(
                      'grid place-items-center size-6 rounded-md transition-colors',
                      active
                        ? 'bg-primary/12 text-primary'
                        : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                    )}
                  >
                    <Icon className="size-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">{t(PANEL_TITLE_KEY[tab])}</TooltipContent>
              </Tooltip>
            );
          })}
          <span aria-hidden className="mx-0.5 h-3.5 w-px bg-border/60" />
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onClose ?? toggleSidePanel}
                aria-label={t('abHideSidebar')}
                className={cn(
                  'grid place-items-center size-6 rounded-md text-muted-foreground',
                  'hover:bg-accent hover:text-foreground transition-colors',
                )}
              >
                <PanelLeftClose className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{t('abHideSidebar')}</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* 手机端没有左侧活动栏：在面板内补一条可横向滑动的标签条，
          否则手机用户只能看到上一次停留的面板（历史/变量/公式都进不去）。 */}
      <div className="md:hidden shrink-0 flex items-center gap-1 px-2 py-1.5 border-b border-border/60 bg-background/30">
        <div role="tablist" aria-label="侧边面板切换" className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {SIDE_PANEL_TABS.map((tab) => {
            const Icon = PANEL_ICON[tab];
            const active = tab === activeSidePanel;
            return (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveSidePanel(tab)}
                className={cn(
                  'inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-[11px] font-medium transition-colors',
                  active
                    ? 'bg-primary/12 text-primary'
                    : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                )}
              >
                <Icon className="size-3.5" />
                {t(PANEL_TITLE_KEY[tab])}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={onClose ?? toggleSidePanel}
          aria-label={t('abHideSidebar')}
          className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <PanelLeftClose className="size-3.5" />
        </button>
      </div>

      {/* Body — all visited panels stay mounted; only the active one is visible */}
      <div className="flex-1 min-h-0 relative">
        {SIDE_PANEL_TABS.map((tab) => (
          <div
            key={tab}
            className={cn('absolute inset-0 h-full', tab === activeSidePanel ? 'block' : 'hidden')}
            aria-hidden={tab !== activeSidePanel}
          >
            {visited.has(tab) && (
              <Suspense fallback={<PanelLoading />}>{renderPanel(tab)}</Suspense>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
