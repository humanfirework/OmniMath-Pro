'use client';

/**
 * OmniMath Pro — ActivityBar
 *
 * VSCode-style far-left icon strip (w-12) with glass background.
 * Vertical icon buttons with active indicator (left teal bar + glow):
 *   - History    (Clock)
 *   - Variables  (Variable)
 *   - Formulas   (BookOpen)
 *   - Linear Alg (Grid3x3)
 *   - Solver     (FunctionSquare)
 *   - Pipeline   (Workflow)   — switches viewMode to 'pipeline'
 * Bottom: settings gear (opens command palette)
 */

import { motion } from 'framer-motion';
import {
  Clock,
  Variable,
  BookOpen,
  Grid3x3,
  FunctionSquare,
  Workflow,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useWorkbenchStore } from '@/lib/store/workbench';
import { t } from '@/lib/i18n';
import type { SidePanelTab } from '@/lib/store/workbench';

interface ActivityItem {
  id: SidePanelTab;
  icon: typeof Clock;
  labelKey:
    | 'abHistory'
    | 'abVariables'
    | 'abFormulas'
    | 'abLinalg'
    | 'abSolver';
}

const TOP_ITEMS: ActivityItem[] = [
  { id: 'history', icon: Clock, labelKey: 'abHistory' },
  { id: 'variables', icon: Variable, labelKey: 'abVariables' },
  { id: 'formulas', icon: BookOpen, labelKey: 'abFormulas' },
  { id: 'linalg', icon: Grid3x3, labelKey: 'abLinalg' },
  { id: 'solver', icon: FunctionSquare, labelKey: 'abSolver' },
];

export function ActivityBar() {
  const activeSidePanel = useWorkbenchStore((s) => s.activeSidePanel);
  const setActiveSidePanel = useWorkbenchStore((s) => s.setActiveSidePanel);
  const sidePanelCollapsed = useWorkbenchStore((s) => s.sidePanelCollapsed);
  const toggleSidePanel = useWorkbenchStore((s) => s.toggleSidePanel);
  const setViewMode = useWorkbenchStore((s) => s.setViewMode);
  const setCommandPaletteOpen = useWorkbenchStore((s) => s.setCommandPaletteOpen);
  const viewMode = useWorkbenchStore((s) => s.viewMode);

  const handleClick = (id: SidePanelTab) => {
    if (id === 'pipeline') {
      setViewMode('pipeline');
      return;
    }
    // When in pipeline/focus view, switch back to workbench and explicitly
    // open the requested side panel so navigation always works.
    if (viewMode !== 'workbench') {
      setViewMode('workbench');
      setActiveSidePanel(id);
      return;
    }
    // Normal workbench toggle behavior.
    if (activeSidePanel === id && !sidePanelCollapsed) {
      toggleSidePanel();
    } else {
      setActiveSidePanel(id);
    }
  };

  return (
    <aside
      className={cn(
        'relative w-12 shrink-0 flex flex-col items-center justify-between py-2 gap-1',
        'glass border-r border-border',
        'select-none',
      )}
      aria-label="Activity Bar"
    >
      <div className="flex flex-col items-center gap-1 w-full">
        {TOP_ITEMS.map((item, idx) => {
          const Icon = item.icon;
          const isActive = activeSidePanel === item.id && !sidePanelCollapsed && viewMode === 'workbench';
          return (
            <Tooltip key={item.id} delayDuration={200}>
              <TooltipTrigger asChild>
                <motion.button
                  type="button"
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.04 * idx, duration: 0.18 }}
                  onClick={() => handleClick(item.id)}
                  aria-label={t(item.labelKey)}
                  className={cn(
                    'relative grid place-items-center size-9 rounded-lg transition-all',
                    isActive
                      ? 'text-primary bg-primary/12'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent/60',
                  )}
                >
                  <Icon className="size-[18px]" strokeWidth={2} />
                  {isActive && (
                    <motion.span
                      layoutId="activity-indicator"
                      className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-5 rounded-r bg-primary"
                      style={{ boxShadow: '0 0 8px oklch(0.7 0.15 165 / 70%)' }}
                      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                    />
                  )}
                </motion.button>
              </TooltipTrigger>
              <TooltipContent side="right">{t(item.labelKey)}</TooltipContent>
            </Tooltip>
          );
        })}

        {/* Pipeline switch — special: changes viewMode */}
        <Tooltip delayDuration={200}>
          <TooltipTrigger asChild>
            <motion.button
              type="button"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.04 * TOP_ITEMS.length, duration: 0.18 }}
              onClick={() => setViewMode(viewMode === 'pipeline' ? 'workbench' : 'pipeline')}
              aria-label={t('abPipeline')}
              className={cn(
                'relative grid place-items-center size-9 rounded-lg transition-all mt-1',
                viewMode === 'pipeline'
                  ? 'text-primary bg-primary/12'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/60',
              )}
            >
              <Workflow className="size-[18px]" strokeWidth={2} />
              {viewMode === 'pipeline' && (
                <motion.span
                  layoutId="activity-indicator"
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-5 rounded-r bg-primary"
                  style={{ boxShadow: '0 0 8px oklch(0.7 0.15 165 / 70%)' }}
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                />
              )}
            </motion.button>
          </TooltipTrigger>
          <TooltipContent side="right">{t('abPipeline')}</TooltipContent>
        </Tooltip>
      </div>

      <div className="flex flex-col items-center gap-1 w-full">
        <Tooltip delayDuration={200}>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={toggleSidePanel}
              aria-label={sidePanelCollapsed ? t('abShowSidebar') : t('abHideSidebar')}
              className="grid place-items-center size-9 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors"
            >
              {sidePanelCollapsed ? (
                <PanelLeftOpen className="size-[18px]" />
              ) : (
                <PanelLeftClose className="size-[18px]" />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">
            {sidePanelCollapsed ? t('abShowSidebar') : t('abHideSidebar')}
          </TooltipContent>
        </Tooltip>

        <Tooltip delayDuration={200}>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => setCommandPaletteOpen(true)}
              aria-label={t('menuCommandPalette')}
              className="grid place-items-center size-9 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors"
            >
              <Settings className="size-[18px]" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">{t('menuCommandPalette')}</TooltipContent>
        </Tooltip>
      </div>
    </aside>
  );
}
