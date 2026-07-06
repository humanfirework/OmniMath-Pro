'use client';

/**
 * OmniMath Pro — Side Panel container
 *
 * Switches the active panel based on `activeSidePanel` from the store.
 * Header: panel title (i18n) + collapse button.
 * Body: ScrollArea-wrapped panel.
 */

import { PanelLeftClose } from 'lucide-react';
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
import { HistoryPanel } from '@/components/workbench/panels/HistoryPanel';
import { VariablesPanel } from '@/components/workbench/panels/VariablesPanel';
import { FormulaLibraryPanel } from '@/components/workbench/panels/FormulaLibraryPanel';
import { LinearAlgebraPanel } from '@/components/workbench/panels/LinearAlgebraPanel';
import { SolverPanel } from '@/components/workbench/panels/SolverPanel';

const PANEL_TITLE_KEY: Record<SidePanelTab, keyof TranslationDict> = {
  history: 'histTitle',
  variables: 'varsTitle',
  formulas: 'formulasTitle',
  linalg: 'linalgTitle',
  solver: 'solverTitle',
  files: 'tabFiles',
};

export function SidePanel() {
  const activeSidePanel = useWorkbenchStore((s) => s.activeSidePanel);
  const toggleSidePanel = useWorkbenchStore((s) => s.toggleSidePanel);

  return (
    <div className="flex flex-col h-full bg-card/40">
      {/* Header */}
      <div className="shrink-0 h-9 flex items-center justify-between px-2 border-b border-border/60 bg-background/40">
        <span className="text-[11.5px] font-semibold tracking-tight text-foreground/85 px-1">
          {t(PANEL_TITLE_KEY[activeSidePanel])}
        </span>
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
        {activeSidePanel === 'history' && <HistoryPanel />}
        {activeSidePanel === 'variables' && <VariablesPanel />}
        {activeSidePanel === 'formulas' && <FormulaLibraryPanel />}
        {activeSidePanel === 'linalg' && <LinearAlgebraPanel />}
        {activeSidePanel === 'solver' && <SolverPanel />}
        {activeSidePanel === 'files' && (
          <PlaceholderPanel tab={activeSidePanel} />
        )}
      </div>
    </div>
  );
}

function PlaceholderPanel({ tab }: { tab: SidePanelTab }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-6 py-12">
      <div className="grid place-items-center size-14 rounded-2xl bg-primary/8 border border-primary/20 mb-3">
        <span className="text-2xl">📁</span>
      </div>
      <p className="text-[12.5px] font-medium text-foreground/80 mb-1">
        {t(PANEL_TITLE_KEY[tab])}
      </p>
      <p className="text-[11px] text-muted-foreground">
        该面板正在开发中（由后续任务实现）。
      </p>
    </div>
  );
}
