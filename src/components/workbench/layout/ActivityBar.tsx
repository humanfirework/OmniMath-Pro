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

import { useRef } from 'react';
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
  PanelRight,
  LayoutTemplate,
  Pin,
  PinOff,
  PanelLeft,
  PanelRightClose,
  PanelRightOpen,
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

  const activityBarPosition = useWorkbenchStore((s) => s.activityBarPosition);
  const activityBarLocked = useWorkbenchStore((s) => s.activityBarLocked);
  const activityBarAutoHide = useWorkbenchStore((s) => s.activityBarAutoHide);
  const activityBarHidden = useWorkbenchStore((s) => s.activityBarHidden);
  const editorVisible = useWorkbenchStore((s) => s.editorVisible);
  const previewVisible = useWorkbenchStore((s) => s.previewVisible);
  const setActivityBarPosition = useWorkbenchStore((s) => s.setActivityBarPosition);
  const toggleActivityBarLock = useWorkbenchStore((s) => s.toggleActivityBarLock);
  const setActivityBarAutoHide = useWorkbenchStore((s) => s.setActivityBarAutoHide);
  const toggleActivityBarHidden = useWorkbenchStore((s) => s.toggleActivityBarHidden);
  const setEditorVisible = useWorkbenchStore((s) => s.setEditorVisible);
  const setPreviewVisible = useWorkbenchStore((s) => s.setPreviewVisible);

  const isRight = activityBarPosition === 'right';
  const tooltipSide = isRight ? 'left' : 'right';
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Auto-hide: collapsed trigger strip. Hovering reveals the full bar.
  if (activityBarHidden) {
    return (
      <motion.aside
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className={cn(
          'relative shrink-0 z-20 flex flex-col items-center',
          'w-1.5 hover:w-12 transition-all duration-200 ease-out',
          'hover:bg-background/80 hover:backdrop-blur-sm hover:border-border',
          isRight ? 'border-l border-transparent hover:border-border' : 'border-r border-transparent hover:border-border',
        )}
        onMouseEnter={() => {
          if (hideTimerRef.current) {
            clearTimeout(hideTimerRef.current);
            hideTimerRef.current = null;
          }
          if (!activityBarLocked) {
            toggleActivityBarHidden();
          }
        }}
        aria-label={t('abHideTaskbar')}
      >
        <div className="w-full h-full flex flex-col items-center py-2 opacity-0 hover:opacity-100 transition-opacity">
          <span className="w-[2px] h-8 rounded-full bg-primary/40" />
        </div>
      </motion.aside>
    );
  }

  return (
    <aside
      className={cn(
        'relative w-12 shrink-0 flex flex-col items-center justify-between py-2 gap-1',
        'glass border-r border-border',
        'select-none',
        isRight && 'border-r-0 border-l border-border',
      )}
      aria-label="Activity Bar"
      onMouseLeave={() => {
        if (activityBarAutoHide && !activityBarLocked) {
          if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
          hideTimerRef.current = setTimeout(() => {
            toggleActivityBarHidden();
            hideTimerRef.current = null;
          }, 200);
        }
      }}
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
                      className={cn(
                        'absolute top-1/2 -translate-y-1/2 w-[2px] h-5 bg-primary',
                        isRight ? 'right-0 rounded-l' : 'left-0 rounded-r',
                      )}
                      style={{ boxShadow: '0 0 8px oklch(0.7 0.15 165 / 70%)' }}
                      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                    />
                  )}
                </motion.button>
              </TooltipTrigger>
              <TooltipContent side={tooltipSide}>{t(item.labelKey)}</TooltipContent>
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
                  className={cn(
                    'absolute top-1/2 -translate-y-1/2 w-[2px] h-5 bg-primary',
                    isRight ? 'right-0 rounded-l' : 'left-0 rounded-r',
                  )}
                  style={{ boxShadow: '0 0 8px oklch(0.7 0.15 165 / 70%)' }}
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                />
              )}
            </motion.button>
          </TooltipTrigger>
          <TooltipContent side={tooltipSide}>{t('abPipeline')}</TooltipContent>
        </Tooltip>
      </div>

      <div className="flex flex-col items-center gap-1 w-full">
        {/* Toggle Editor */}
        <Tooltip delayDuration={200}>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => setEditorVisible(!editorVisible)}
              aria-label={t('abToggleEditor')}
              className={cn(
                'grid place-items-center size-9 rounded-lg transition-colors',
                editorVisible
                  ? 'text-primary bg-primary/12'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/60',
              )}
            >
              <LayoutTemplate className="size-[18px]" />
            </button>
          </TooltipTrigger>
          <TooltipContent side={tooltipSide}>{t('abToggleEditor')}</TooltipContent>
        </Tooltip>

        {/* Toggle Preview */}
        <Tooltip delayDuration={200}>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => setPreviewVisible(!previewVisible)}
              aria-label={t('abTogglePreview')}
              className={cn(
                'grid place-items-center size-9 rounded-lg transition-colors',
                previewVisible
                  ? 'text-primary bg-primary/12'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/60',
              )}
            >
              <PanelRight className="size-[18px]" />
            </button>
          </TooltipTrigger>
          <TooltipContent side={tooltipSide}>{t('abTogglePreview')}</TooltipContent>
        </Tooltip>

        {/* Toggle Sidebar */}
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
          <TooltipContent side={tooltipSide}>
            {sidePanelCollapsed ? t('abShowSidebar') : t('abHideSidebar')}
          </TooltipContent>
        </Tooltip>

        <div className="w-6 h-px bg-border/60 my-0.5" />

        {/* Move position */}
        <Tooltip delayDuration={200}>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => setActivityBarPosition(isRight ? 'left' : 'right')}
              disabled={activityBarLocked}
              aria-label={isRight ? t('abMoveLeft') : t('abMoveRight')}
              className={cn(
                'grid place-items-center size-9 rounded-lg transition-colors',
                activityBarLocked
                  ? 'text-muted-foreground/40 cursor-not-allowed'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/60',
              )}
            >
              {isRight ? <PanelLeft className="size-[18px]" /> : <PanelRight className="size-[18px]" />}
            </button>
          </TooltipTrigger>
          <TooltipContent side={tooltipSide}>
            {activityBarLocked ? t('abLocked') : isRight ? t('abMoveLeft') : t('abMoveRight')}
          </TooltipContent>
        </Tooltip>

        {/* Lock / Unlock */}
        <Tooltip delayDuration={200}>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={toggleActivityBarLock}
              aria-label={activityBarLocked ? t('abUnlockTaskbar') : t('abLockTaskbar')}
              className={cn(
                'grid place-items-center size-9 rounded-lg transition-colors',
                activityBarLocked
                  ? 'text-primary bg-primary/12'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/60',
              )}
            >
              {activityBarLocked ? <Pin className="size-[18px]" /> : <PinOff className="size-[18px]" />}
            </button>
          </TooltipTrigger>
          <TooltipContent side={tooltipSide}>
            {activityBarLocked ? t('abUnlockTaskbar') : t('abLockTaskbar')}
          </TooltipContent>
        </Tooltip>

        {/* Auto-hide */}
        <Tooltip delayDuration={200}>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => setActivityBarAutoHide(!activityBarAutoHide)}
              disabled={activityBarLocked}
              aria-label={t('abAutoHide')}
              className={cn(
                'grid place-items-center size-9 rounded-lg transition-colors',
                activityBarLocked
                  ? 'text-muted-foreground/40 cursor-not-allowed'
                  : activityBarAutoHide
                    ? 'text-primary bg-primary/12'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/60',
              )}
            >
              {activityBarAutoHide ? (
                <PanelRightClose className="size-[18px]" />
              ) : (
                <PanelRightOpen className="size-[18px]" />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side={tooltipSide}>
            {activityBarLocked ? t('abLocked') : activityBarAutoHide ? t('abDisableAutoHide') : t('abAutoHide')}
          </TooltipContent>
        </Tooltip>

        {/* Hide taskbar (manual) */}
        <Tooltip delayDuration={200}>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => toggleActivityBarHidden()}
              disabled={activityBarLocked}
              aria-label={t('abHideTaskbar')}
              className={cn(
                'grid place-items-center size-9 rounded-lg transition-colors',
                activityBarLocked
                  ? 'text-muted-foreground/40 cursor-not-allowed'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/60',
              )}
            >
              {isRight ? <PanelRightClose className="size-[18px]" /> : <PanelLeftClose className="size-[18px]" />}
            </button>
          </TooltipTrigger>
          <TooltipContent side={tooltipSide}>
            {activityBarLocked ? t('abLocked') : t('abHideTaskbar')}
          </TooltipContent>
        </Tooltip>

        <div className="w-6 h-px bg-border/60 my-0.5" />

        {/* Settings / Command palette */}
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
          <TooltipContent side={tooltipSide}>{t('menuCommandPalette')}</TooltipContent>
        </Tooltip>
      </div>
    </aside>
  );
}
