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

import { lazy, Suspense, useCallback } from 'react';
import { PanelLeftClose, Clock, Variable, BookOpen, Grid3x3, FunctionSquare, FileCode2, BarChart3 } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useWorkbenchStore } from '@/lib/store/workbench';
import { t } from '@/lib/i18n';
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

export function SidePanel() {
  const activeSidePanel = useWorkbenchStore((s) => s.activeSidePanel);
  const toggleSidePanel = useWorkbenchStore((s) => s.toggleSidePanel);

  const renderPanel = useCallback(() => {
    switch (activeSidePanel) {
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
  }, [activeSidePanel]);

  return (
    <div className="flex flex-col h-full bg-card/40">
      {/* Header */}
      <div className="shrink-0 h-9 flex items-center justify-between px-2 border-b border-border/60 bg-background/40">
        <div className="flex items-center gap-1.5 px-1">
          {(() => {
            const Icon = PANEL_ICON[activeSidePanel];
            return <Icon className="size-3.5 text-primary shrink-0" />;
          })()}
          <span className="text-[11.5px] font-semibold tracking-tight text-foreground/85">
            {t(PANEL_TITLE_KEY[activeSidePanel])}
          </span>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={toggleSidePanel}
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

      {/* Body */}
      <div className="flex-1 min-h-0">
        <Suspense fallback={<PanelLoading />}>{renderPanel()}</Suspense>
      </div>
    </div>
  );
}
