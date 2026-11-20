'use client';

/**
 * OmniMath Pro — ActivityBar
 *
 * VSCode-style far-left icon strip (w-10) with a flat quiet surface.
 * All icons (including view-mode switches and utility toggles) are freely
 * draggable and their order is persisted in settingsStore.
 */

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
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
  CircleGauge,
  GraduationCap,
  House,
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
import { t, useLocale } from '@/lib/i18n';
import type { SidePanelTab, ViewMode } from '@/lib/store/workbench';
import type { TranslationDict } from '@/lib/i18n';

type ActivityItemId =
  | SidePanelTab
  | 'home'
  | 'solver'
  | 'control'
  | 'pipeline'
  | 'whiteboard'
  | 'education'
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
  home: { icon: House, labelKey: 'abHome' },
  history: { icon: Clock, labelKey: 'abHistory' },
  variables: { icon: Variable, labelKey: 'abVariables' },
  files: { icon: FileCode2, labelKey: 'abFiles' },
  formulas: { icon: BookOpen, labelKey: 'abFormulas' },
  stats: { icon: BarChart3, labelKey: 'abStats' },
  solver: { icon: FunctionSquare, labelKey: 'abSolver' },
  control: { icon: CircleGauge, labelKey: 'abControl' },
  pipeline: { icon: Workflow, labelKey: 'abPipeline' },
  whiteboard: { icon: PencilRuler, labelKey: 'abWhiteboard' },
  education: { icon: GraduationCap, labelKey: 'abEducation' },
  linalg: { icon: Grid3x3, labelKey: 'abLinalg' },
  toggleEditor: { icon: LayoutTemplate, labelKey: 'abToggleEditor' },
  togglePreview: { icon: PanelRight, labelKey: 'abTogglePreview' },
  toggleSidebar: { icon: PanelLeftClose, labelKey: 'abShowSidebar' },
  layoutMenu: { icon: MoreHorizontal, labelKey: 'abLayoutMenu' },
  settings: { icon: Settings, labelKey: 'settingsTitle' },
};

/** Group 1: data / basic panels */
const GROUP_1_IDS: ActivityItemId[] = ['home', 'files', 'history', 'variables'];
/** Group 2: theory / core math */
const GROUP_2_IDS: ActivityItemId[] = ['stats', 'solver', 'linalg', 'control', 'formulas'];
/** Group 3: creative / extensions */
const GROUP_3_IDS: ActivityItemId[] = ['whiteboard', 'education', 'pipeline'];
/** Bottom utilities */
const BOTTOM_UTIL_IDS: ActivityItemId[] = ['toggleEditor', 'togglePreview', 'toggleSidebar', 'layoutMenu', 'settings'];

const GROUP_1_SET = new Set(GROUP_1_IDS);
const GROUP_2_SET = new Set(GROUP_2_IDS);
const GROUP_3_SET = new Set(GROUP_3_IDS);
const BOTTOM_UTIL_SET = new Set(BOTTOM_UTIL_IDS);

/** 精简活动栏中常驻的高频入口（其余全部收进「全部工具」菜单）。 */
const COMPACT_PRIMARY_IDS: ActivityItemId[] = ['home', 'whiteboard', 'linalg', 'pipeline'];
const COMPACT_PRIMARY_SET = new Set(COMPACT_PRIMARY_IDS);
const SIDE_TAB_SET = new Set<ActivityItemId>(['history', 'variables', 'files', 'formulas']);
const VIEW_MODE_SET = new Set<ActivityItemId>([
  'home', 'solver', 'control', 'pipeline', 'whiteboard', 'linalg', 'stats', 'education',
]);

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
  useLocale();
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
  const activityBarCompact = useSettingsStore((s) => s.activityBarCompact);
  const setActivityBarCompact = useSettingsStore((s) => s.setActivityBarCompact);

  const isRight = activityBarPosition === 'right';
  const tooltipSide = isRight ? 'left' : 'right';
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // dnd-kit generates aria-describedby via useId which differs between SSR
  // and client hydration → causes a React hydration mismatch warning that
  // can leave the first paint in an inconsistent state. Mount the sortable
  // area only after hydration completes.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // Currently-dragged item id, used to drive the DragOverlay visual feedback.
  const [activeId, setActiveId] = useState<ActivityItemId | null>(null);

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

  // distance: 8 — a slightly larger activation threshold than the previous
  // value of 5 so that a plain click does not accidentally trigger a drag
  // (which made the bar feel "stuck"), while still being easy to drag.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const orderedIds = useMemo(() => {
    const ids = activityBarOrder.filter((id): id is ActivityItemId =>
      DEFAULT_ACTIVITY_BAR_ORDER.includes(id),
    );
    for (const id of DEFAULT_ACTIVITY_BAR_ORDER as ActivityItemId[]) {
      if (!ids.includes(id)) ids.push(id);
    }
    return ids;
  }, [activityBarOrder]);

  // Split the persisted full order into the visual groups while preserving
  // per-group user-defined ordering. Persistence still stores the full list —
  // these filters only determine which items render in which DndContext.
  // Any new icon not in a known group falls through to group3 (creative/extensions).
  const group1Ids = useMemo(
    () => orderedIds.filter((id) => GROUP_1_SET.has(id)),
    [orderedIds],
  );
  const group2Ids = useMemo(
    () => orderedIds.filter((id) => GROUP_2_SET.has(id)),
    [orderedIds],
  );
  const group3Ids = useMemo(
    () => orderedIds.filter((id) => GROUP_3_SET.has(id) || (!GROUP_1_SET.has(id) && !GROUP_2_SET.has(id) && !BOTTOM_UTIL_SET.has(id))),
    [orderedIds],
  );
  const bottomUtilIds = useMemo(
    () => orderedIds.filter((id) => BOTTOM_UTIL_SET.has(id)),
    [orderedIds],
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as ActivityItemId);
  };

  const handleDragCancel = () => {
    setActiveId(null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = orderedIds.indexOf(active.id as ActivityItemId);
    const newIndex = orderedIds.indexOf(over.id as ActivityItemId);
    if (oldIndex === -1 || newIndex === -1) return;
    setActivityBarOrder(arrayMove(orderedIds, oldIndex, newIndex));
  };

  // Visual copy of the dragged icon rendered into DragOverlay. Kept free of
  // click handlers / tooltips so it floats cleanly under the cursor with a
  // semi-transparent, shadowed, ringed appearance for clear drag feedback.
  const renderOverlayItem = (id: ActivityItemId) => {
    const reg = ACTIVITY_REGISTRY[id];
    if (!reg) return null;
    const Icon = reg.icon;
    return (
      <div
        className={cn(
          'grid place-items-center size-8 rounded-lg pointer-events-none',
          'bg-popover text-foreground',
          'border border-border',
          'shadow-[var(--shadow-float)]',
        )}
      >
        <Icon className="size-4" strokeWidth={1.75} />
      </div>
    );
  };

  const renderItem = (id: ActivityItemId, sortable = true) => {
    const reg = ACTIVITY_REGISTRY[id];
    if (!reg) return null;
    const Icon = reg.icon;

    const wrapper = (children: React.ReactNode) =>
      sortable ? <SortableWrapper key={id} id={id}>{children}</SortableWrapper> : <div key={id} className="w-full flex justify-center">{children}</div>;

    // ── Side-panel tabs ──
    if (['history', 'variables', 'files', 'formulas'].includes(id)) {
      const isActive = activeSidePanel === id && !sidePanelCollapsed && viewMode === 'workbench';
      return wrapper(
        <Tooltip delayDuration={200}>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => handlePanelClick(id as SidePanelTab)}
              aria-label={t(reg.labelKey)}
              className={cn(
                'relative grid place-items-center size-9 rounded-md transition-colors',
                isActive
                  ? 'bg-primary/12 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
              )}
            >
              <Icon className="size-[18px]" strokeWidth={1.75} />
            </button>
          </TooltipTrigger>
          <TooltipContent side={tooltipSide}>{t(reg.labelKey)}</TooltipContent>
        </Tooltip>,
      );
    }

    // ── View-mode switches ──
    if (['home', 'solver', 'control', 'pipeline', 'whiteboard', 'linalg', 'stats', 'education'].includes(id)) {
      const isActive = viewMode === id;
      return wrapper(
        <Tooltip delayDuration={200}>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => setViewMode(viewMode === id ? 'workbench' : id as ViewMode)}
              aria-label={t(reg.labelKey)}
              className={cn(
                'relative grid place-items-center size-9 rounded-md transition-colors',
                isActive
                  ? 'bg-primary/12 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
              )}
            >
              <Icon className="size-[18px]" strokeWidth={1.75} />
            </button>
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
                'grid place-items-center size-8 rounded-md transition-colors',
                isActive
                  ? 'bg-primary/12 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/60',
              )}
            >
              <LayoutTemplate className="size-4" strokeWidth={1.75} />
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
                'grid place-items-center size-8 rounded-md transition-colors',
                isActive
                  ? 'bg-primary/12 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/60',
              )}
            >
              <PanelRight className="size-4" strokeWidth={1.75} />
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
              className="grid place-items-center size-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors"
            >
              {sidePanelCollapsed ? (
                <PanelLeftOpen className="size-4" strokeWidth={1.75} />
              ) : (
                <PanelLeftClose className="size-4" strokeWidth={1.75} />
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
                    'grid place-items-center size-8 rounded-md transition-colors',
                    activityBarLocked || activityBarAutoHide
                      ? 'bg-primary/12 text-primary'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent/60',
                  )}
                >
                  <MoreHorizontal className="size-4" strokeWidth={1.75} />
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
              className="grid place-items-center size-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors"
            >
              <Settings className="size-4" strokeWidth={1.75} />
            </button>
          </TooltipTrigger>
          <TooltipContent side={tooltipSide}>{t(reg.labelKey)}</TooltipContent>
        </Tooltip>,
      );
    }

    return null;
  };

  /**
   * 精简模式：「全部工具」菜单的分发入口。
   * 侧边面板需要先回到工作台视图，再切到对应面板；全屏视图直接切换。
   */
  const openFromOverflow = (id: ActivityItemId) => {
    if (id === 'toggleEditor') {
      setEditorVisible(!editorVisible);
      return;
    }
    if (id === 'togglePreview') {
      setPreviewVisible(!previewVisible);
      return;
    }
    if (id === 'toggleSidebar') {
      toggleSidePanel();
      return;
    }
    if (id === 'settings') {
      setSettingsOpen(true);
      return;
    }
    if (SIDE_TAB_SET.has(id)) {
      if (viewMode !== 'workbench') setViewMode('workbench');
      // setActiveSidePanel 已经会把 sidePanelCollapsed 置为 false（展开侧栏）。
      // 这里不能再按旧的 sidePanelCollapsed 调 toggleSidePanel —— 那样会把刚展开的
      // 侧栏又收起来，表现为「从全部工具菜单点历史/文件没有任何反应」。
      setActiveSidePanel(id as SidePanelTab);
      return;
    }
    if (VIEW_MODE_SET.has(id)) {
      setViewMode(id as ViewMode);
    }
  };

  const renderMenuEntry = (id: ActivityItemId) => {
    const reg = ACTIVITY_REGISTRY[id];
    if (!reg) return null;
    const Icon = reg.icon;
    return (
      <DropdownMenuItem
        key={id}
        onClick={() => openFromOverflow(id)}
        className="gap-2 text-[11.5px]"
      >
        <Icon className="size-3.5" />
        <span>{t(reg.labelKey)}</span>
      </DropdownMenuItem>
    );
  };

  const overflowRestIds = orderedIds.filter(
    (id) => !COMPACT_PRIMARY_SET.has(id) && !BOTTOM_UTIL_SET.has(id),
  );
  const overflowViewIds = overflowRestIds.filter((id) => VIEW_MODE_SET.has(id));
  const overflowSideIds = overflowRestIds.filter((id) => SIDE_TAB_SET.has(id));

  const renderGroup1 = (ids: ActivityItemId[]) => {
    if (!mounted) {
      return (
        <>
          {ids.map((id) => renderItem(id, false))}
        </>
      );
    }
    return (
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {ids.map((id) => renderItem(id, true))}
        </SortableContext>
        <DragOverlay dropAnimation={null}>
          {activeId && ids.includes(activeId) ? renderOverlayItem(activeId) : null}
        </DragOverlay>
      </DndContext>
    );
  };

  const renderGroup2 = (ids: ActivityItemId[]) => {
    if (!mounted) {
      return (
        <>
          {ids.map((id) => renderItem(id, false))}
        </>
      );
    }
    return (
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {ids.map((id) => renderItem(id, true))}
        </SortableContext>
        <DragOverlay dropAnimation={null}>
          {activeId && ids.includes(activeId) ? renderOverlayItem(activeId) : null}
        </DragOverlay>
      </DndContext>
    );
  };

  const renderGroup3 = (ids: ActivityItemId[]) => {
    if (!mounted) {
      return (
        <>
          {ids.map((id) => renderItem(id, false))}
        </>
      );
    }
    return (
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {ids.map((id) => renderItem(id, true))}
        </SortableContext>
        <DragOverlay dropAnimation={null}>
          {activeId && ids.includes(activeId) ? renderOverlayItem(activeId) : null}
        </DragOverlay>
      </DndContext>
    );
  };

  const renderBottomGroup = (ids: ActivityItemId[]) => {
    if (!mounted) {
      return (
        <>
          {ids.map((id) => renderItem(id, false))}
        </>
      );
    }
    return (
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {ids.map((id) => renderItem(id, true))}
        </SortableContext>
        <DragOverlay dropAnimation={null}>
          {activeId && ids.includes(activeId) ? renderOverlayItem(activeId) : null}
        </DragOverlay>
      </DndContext>
    );
  };

  // Auto-hide: collapsed trigger strip. Hovering reveals the full bar.
  if (activityBarHidden) {
    return (
      <aside
        className={cn(
          'relative shrink-0 z-20 flex flex-col items-center',
          'w-1.5 hover:w-10 transition-[width] duration-200 ease-out',
          'hover:bg-sidebar hover:border-border',
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
          <span className="w-[2px] h-8 rounded-full bg-border" />
        </div>
      </aside>
    );
  }

  // Compact rail: only the four most-used destinations stay visible; every
  // other view/panel moves into a single "All tools" menu. This directly
  // addresses the "left side is a wall of icons" complaint while keeping the
  // full drag-sortable rail one click away.
  if (activityBarCompact) {
    return (
      <aside
        className={cn(
          'activity-bar relative w-10 shrink-0 flex flex-col items-center justify-between py-2 gap-1',
          'bg-sidebar border-r border-sidebar-border',
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
          {COMPACT_PRIMARY_IDS.map((id) => renderItem(id, false))}
          <div className="mx-2 h-px bg-border/60 my-1" />
          <DropdownMenu>
            <Tooltip delayDuration={200}>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label={t('abAllTools')}
                    className="grid place-items-center size-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors"
                  >
                    <MoreHorizontal className="size-4" strokeWidth={1.75} />
                  </button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent side={tooltipSide}>{t('abAllTools')}</TooltipContent>
            </Tooltip>
            <DropdownMenuContent side={tooltipSide} align="start" className="w-56">
              {overflowViewIds.length > 0 && (
                <>
                  <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {t('abViewGroup')}
                  </DropdownMenuLabel>
                  {overflowViewIds.map(renderMenuEntry)}
                </>
              )}
              {overflowSideIds.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {t('abPanelGroup')}
                  </DropdownMenuLabel>
                  {overflowSideIds.map(renderMenuEntry)}
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {t('abLayoutGroup')}
              </DropdownMenuLabel>
              <DropdownMenuItem
                onClick={() => setEditorVisible(!editorVisible)}
                className="gap-2 text-[11.5px]"
              >
                <LayoutTemplate className="size-3.5" />
                <span>{t('abToggleEditor')}</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setPreviewVisible(!previewVisible)}
                className="gap-2 text-[11.5px]"
              >
                <PanelRight className="size-3.5" />
                <span>{t('abTogglePreview')}</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={toggleSidePanel}
                className="gap-2 text-[11.5px]"
              >
                {sidePanelCollapsed ? <PanelLeftOpen className="size-3.5" /> : <PanelLeftClose className="size-3.5" />}
                <span>{sidePanelCollapsed ? t('abShowSidebar') : t('abHideSidebar')}</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setActivityBarCompact(false)}
                className="gap-2 text-[11.5px]"
              >
                <PanelLeft className="size-3.5" />
                <span>{t('abShowFullBar')}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="flex flex-col items-center gap-1 w-full">
          {renderItem('toggleSidebar', false)}
          {renderItem('settings', false)}
        </div>
      </aside>
    );
  }

  return (
    <aside
      className={cn(
        'activity-bar relative w-10 shrink-0 flex flex-col items-center justify-between py-2 gap-1',
        'bg-sidebar border-r border-sidebar-border',
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
        {renderGroup1(group1Ids)}
        <div
          role="separator"
          aria-label="基础面板与数学功能分隔线"
          className="mx-2 h-px bg-border/60 my-1"
        />
        {renderGroup2(group2Ids)}
        <div
          role="separator"
          aria-label="数学功能与创意扩展分隔线"
          className="mx-2 h-px bg-border/60 my-1"
        />
        {renderGroup3(group3Ids)}
      </div>
      {/* Visual separator between the top navigation groups and the bottom utility group. */}
      <div className="mx-2 h-px bg-border/60 my-2" />
      <div className="flex flex-col items-center gap-1 w-full mt-auto">
        {renderBottomGroup(bottomUtilIds)}
      </div>
    </aside>
  );
}
