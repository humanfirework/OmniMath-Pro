'use client';

/**
 * OmniMath Pro — ActivityBar
 *
 * VSCode-style far-left icon strip (w-12) with glass background.
 * All icons (including view-mode switches and utility toggles) are freely
 * draggable and their order is persisted in settingsStore.
 */

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { motion } from 'framer-motion';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
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
  FileCode2,
  PencilRuler,
  MoreHorizontal,
  BarChart3,
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useWorkbenchStore } from '@/lib/store/workbench';
import { useSettingsStore, DEFAULT_ACTIVITY_BAR_ORDER } from '@/lib/store/settingsStore';
import { t } from '@/lib/i18n';
import type { SidePanelTab, ViewMode } from '@/lib/store/workbench';
import type { TranslationDict } from '@/lib/i18n';

type ActivityItemId =
  | SidePanelTab
  | 'solver'
  | 'pipeline'
  | 'whiteboard'
  | 'linalg'
  | 'toggleEditor'
  | 'togglePreview'
  | 'toggleSidebar'
  | 'layoutMenu'
  | 'settings';

interface RegistryEntry {
  icon: typeof Clock;
  labelKey: keyof TranslationDict;
}

const ACTIVITY_REGISTRY: Record<ActivityItemId, RegistryEntry> = {
  history: { icon: Clock, labelKey: 'abHistory' },
  variables: { icon: Variable, labelKey: 'abVariables' },
  files: { icon: FileCode2, labelKey: 'abFiles' },
  formulas: { icon: BookOpen, labelKey: 'abFormulas' },
  stats: { icon: BarChart3, labelKey: 'abStats' },
  solver: { icon: FunctionSquare, labelKey: 'abSolver' },
  pipeline: { icon: Workflow, labelKey: 'abPipeline' },
  whiteboard: { icon: PencilRuler, labelKey: 'abWhiteboard' },
  linalg: { icon: Grid3x3, labelKey: 'abLinalg' },
  toggleEditor: { icon: LayoutTemplate, labelKey: 'abToggleEditor' },
  togglePreview: { icon: PanelRight, labelKey: 'abTogglePreview' },
  toggleSidebar: { icon: PanelLeftClose, labelKey: 'abShowSidebar' },
  layoutMenu: { icon: MoreHorizontal, labelKey: 'abLayoutMenu' },
  settings: { icon: Settings, labelKey: 'settingsTitle' },
};

function SortableWrapper({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="w-full flex justify-center">
      {children}
    </div>
  );
}

export function ActivityBar() {
  const activeSidePanel = useWorkbenchStore((s) => s.activeSidePanel);
  const setActiveSidePanel = useWorkbenchStore((s) => s.setActiveSidePanel);
  const sidePanelCollapsed = useWorkbenchStore((s) => s.sidePanelCollapsed);
  const toggleSidePanel = useWorkbenchStore((s) => s.toggleSidePanel);
  const setViewMode = useWorkbenchStore((s) => s.setViewMode);
  const viewMode = useWorkbenchStore((s) => s.viewMode);
  const setSettingsOpen = useSettingsStore((s) => s.setOpen);

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

  const activityBarOrder = useSettingsStore((s) => s.activityBarOrder);
  const setActivityBarOrder = useSettingsStore((s) => s.setActivityBarOrder);

  const isRight = activityBarPosition === 'right';
  const tooltipSide = isRight ? 'left' : 'right';
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // dnd-kit generates aria-describedby via useId which differs between SSR
  // and client hydration → causes a React hydration mismatch warning that
  // can leave the first paint in an inconsistent state. Mount the sortable
  // area only after hydration completes.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // 清理 hide timer — 防止组件卸载后 timer 仍触发，污染全局 store
  useEffect(() => {
    return () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
    };
  }, []);

  const handlePanelClick = (id: SidePanelTab) => {
    if (viewMode !== 'workbench') {
      setViewMode('workbench');
      setActiveSidePanel(id);
      return;
    }
    if (activeSidePanel === id && !sidePanelCollapsed) {
      toggleSidePanel();
    } else {
      setActiveSidePanel(id);
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const orderedIds = activityBarOrder
    .filter((id): id is ActivityItemId => DEFAULT_ACTIVITY_BAR_ORDER.includes(id));
  for (const id of DEFAULT_ACTIVITY_BAR_ORDER as ActivityItemId[]) {
    if (!orderedIds.includes(id)) orderedIds.push(id);
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = orderedIds.indexOf(active.id as ActivityItemId);
    const newIndex = orderedIds.indexOf(over.id as ActivityItemId);
    if (oldIndex === -1 || newIndex === -1) return;
    setActivityBarOrder(arrayMove(orderedIds, oldIndex, newIndex));
  };

  const renderItem = (id: ActivityItemId, sortable = true) => {
    const reg = ACTIVITY_REGISTRY[id];
    if (!reg) return null;
    const Icon = reg.icon;

    const wrapper = (children: React.ReactNode) =>
      sortable ? <SortableWrapper key={id} id={id}>{children}</SortableWrapper> : <div key={id} className="w-full flex justify-center">{children}</div>;

    // ── Side-panel tabs ──
    if (['history', 'variables', 'files', 'formulas', 'stats'].includes(id)) {
      const isActive = activeSidePanel === id && !sidePanelCollapsed && viewMode === 'workbench';
      return wrapper(
        <Tooltip delayDuration={200}>
          <TooltipTrigger asChild>
            <motion.button
              type="button"
              initial={false}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.18 }}
              onClick={() => handlePanelClick(id as SidePanelTab)}
              aria-label={t(reg.labelKey)}
              className={cn(
                'relative grid place-items-center size-9 rounded-lg transition-all',
                isActive
                  ? 'text-primary bg-primary/12'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/60',
              )}
            >
              <Icon className="size-[18px]" strokeWidth={2} />
              {isActive && (
                <span
                  className={cn(
                    'absolute top-1/2 -translate-y-1/2 w-[2px] h-5 bg-primary',
                    isRight ? 'right-0 rounded-l' : 'left-0 rounded-r',
                  )}
                  style={{ boxShadow: '0 0 8px oklch(0.7 0.15 165 / 70%)' }}
                />
              )}
            </motion.button>
          </TooltipTrigger>
          <TooltipContent side={tooltipSide}>{t(reg.labelKey)}</TooltipContent>
        </Tooltip>,
      );
    }

    // ── View-mode switches ──
    if (['solver', 'pipeline', 'whiteboard', 'linalg'].includes(id)) {
      const isActive = viewMode === id;
      return wrapper(
        <Tooltip delayDuration={200}>
          <TooltipTrigger asChild>
            <motion.button
              type="button"
              initial={false}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.18 }}
              onClick={() => setViewMode(viewMode === id ? 'workbench' : id as ViewMode)}
              aria-label={t(reg.labelKey)}
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
          <TooltipContent side={tooltipSide}>{t(reg.labelKey)}</TooltipContent>
        </Tooltip>,
      );
    }

    // ── Utility: Toggle Editor ──
    if (id === 'toggleEditor') {
      const isActive = editorVisible;
      return wrapper(
        <Tooltip delayDuration={200}>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => setEditorVisible(!editorVisible)}
              aria-label={t(reg.labelKey)}
              className={cn(
                'grid place-items-center size-9 rounded-lg transition-colors',
                isActive
                  ? 'text-primary bg-primary/12'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/60',
              )}
            >
              <LayoutTemplate className="size-[18px]" />
            </button>
          </TooltipTrigger>
          <TooltipContent side={tooltipSide}>{t(reg.labelKey)}</TooltipContent>
        </Tooltip>,
      );
    }

    // ── Utility: Toggle Preview ──
    if (id === 'togglePreview') {
      const isActive = previewVisible;
      return wrapper(
        <Tooltip delayDuration={200}>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => setPreviewVisible(!previewVisible)}
              aria-label={t(reg.labelKey)}
              className={cn(
                'grid place-items-center size-9 rounded-lg transition-colors',
                isActive
                  ? 'text-primary bg-primary/12'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/60',
              )}
            >
              <PanelRight className="size-[18px]" />
            </button>
          </TooltipTrigger>
          <TooltipContent side={tooltipSide}>{t(reg.labelKey)}</TooltipContent>
        </Tooltip>,
      );
    }

    // ── Utility: Toggle Sidebar ──
    if (id === 'toggleSidebar') {
      return wrapper(
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
        </Tooltip>,
      );
    }

    // ── Utility: Layout Menu ──
    if (id === 'layoutMenu') {
      return wrapper(
        <DropdownMenu>
          <Tooltip delayDuration={200}>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label={t(reg.labelKey)}
                  className={cn(
                    'grid place-items-center size-9 rounded-lg transition-colors',
                    activityBarLocked || activityBarAutoHide
                      ? 'text-primary bg-primary/12'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent/60',
                  )}
                >
                  <MoreHorizontal className="size-[18px]" />
                </button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side={tooltipSide}>{t(reg.labelKey)}</TooltipContent>
          </Tooltip>
          <DropdownMenuContent side={tooltipSide} align="end" className="w-44">
            <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {t('abLayoutMenu')}
            </DropdownMenuLabel>
            <DropdownMenuItem
              onClick={() => setActivityBarPosition(isRight ? 'left' : 'right')}
              disabled={activityBarLocked}
              className="text-[11.5px] gap-2"
            >
              {isRight ? <PanelLeft className="size-3.5" /> : <PanelRight className="size-3.5" />}
              <span>{isRight ? t('abMoveLeft') : t('abMoveRight')}</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={toggleActivityBarLock}
              className="text-[11.5px] gap-2"
            >
              {activityBarLocked ? <Pin className="size-3.5" /> : <PinOff className="size-3.5" />}
              <span>{activityBarLocked ? t('abUnlockTaskbar') : t('abLockTaskbar')}</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setActivityBarAutoHide(!activityBarAutoHide)}
              disabled={activityBarLocked}
              className="text-[11.5px] gap-2"
            >
              {activityBarAutoHide ? <PanelRightClose className="size-3.5" /> : <PanelRightOpen className="size-3.5" />}
              <span>{activityBarAutoHide ? t('abDisableAutoHide') : t('abAutoHide')}</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => toggleActivityBarHidden()}
              disabled={activityBarLocked}
              className="text-[11.5px] gap-2"
            >
              {isRight ? <PanelRightClose className="size-3.5" /> : <PanelLeftClose className="size-3.5" />}
              <span>{t('abHideTaskbar')}</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>,
      );
    }

    // ── Utility: Settings ──
    if (id === 'settings') {
      return wrapper(
        <Tooltip delayDuration={200}>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              aria-label={t(reg.labelKey)}
              className="grid place-items-center size-9 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors"
            >
              <Settings className="size-[18px]" />
            </button>
          </TooltipTrigger>
          <TooltipContent side={tooltipSide}>{t(reg.labelKey)}</TooltipContent>
        </Tooltip>,
      );
    }

    return null;
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
        {mounted ? (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={orderedIds} strategy={verticalListSortingStrategy}>
              {orderedIds.map((id) => renderItem(id, true))}
            </SortableContext>
          </DndContext>
        ) : (
          /* SSR / pre-hydration placeholder — same visual layout but no dnd-kit,
             so server and client markup match (avoids hydration mismatch). */
          <div className="flex flex-col items-center gap-1 w-full">
            {orderedIds.map((id) => renderItem(id, false))}
          </div>
        )}
      </div>
    </aside>
  );
}
