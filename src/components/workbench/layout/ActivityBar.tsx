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

import { Fragment, useRef, type CSSProperties } from 'react';
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
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useWorkbenchStore } from '@/lib/store/workbench';
import { useSettingsStore } from '@/lib/store/settingsStore';
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
    | 'abSolver'
    | 'abFiles';
  /** 分组 id，决定该 item 在哪个视觉组里渲染（组间有分隔线）。 */
  group: 'edit' | 'math' | 'tools';
}

/**
 * 顶部分组定义 —— ActivityBar 把所有 side-panel 入口按语义分成 3 组：
 *
 *   edit   编辑组    历史 / 变量 / 文件     — 数据入口
 *   math   数学组    公式 / 线代 / 求解器   — 数学工具
 *   tools  工具组    （Pipeline 单独渲染，所以这里其实只有 edit+math 两组）
 *
 * 组与组之间用一条 1px 分隔线分开，让用户一眼看出"这是不同类别的功能"，
 * 而不是 6 个图标堆在一起。和 VSCode 的 ActivityBar 分组逻辑一致。
 *
 * 注：Pipeline 按钮单独渲染在分组下方（因为它切 viewMode 而非 sidePanel），
 * 视觉上属于"可视化"组，所以前面再加一条分隔线。
 */
const TOP_ITEMS: ActivityItem[] = [
  // ── 编辑组 ──────────────────────────────────────────
  { id: 'history', icon: Clock, labelKey: 'abHistory', group: 'edit' },
  { id: 'variables', icon: Variable, labelKey: 'abVariables', group: 'edit' },
  { id: 'files', icon: FileCode2, labelKey: 'abFiles', group: 'edit' },
  // ── 数学组 ──────────────────────────────────────────
  { id: 'formulas', icon: BookOpen, labelKey: 'abFormulas', group: 'math' },
  { id: 'linalg', icon: Grid3x3, labelKey: 'abLinalg', group: 'math' },
  { id: 'solver', icon: FunctionSquare, labelKey: 'abSolver', group: 'math' },
];

interface SortableActivityItemProps {
  item: ActivityItem;
  isActive: boolean;
  isRight: boolean;
  tooltipSide: 'left' | 'right';
  onClick: () => void;
}

/** Draggable activity bar button. Uses dnd-kit's useSortable hook so the
 *  user can reorder the activity bar items by dragging. Click vs drag is
 *  disambiguated by PointerSensor's activationConstraint (distance: 5). */
function SortableActivityItem({ item, isActive, isRight, tooltipSide, onClick }: SortableActivityItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const Icon = item.icon;

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>
          <motion.button
            type="button"
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClick}
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
        <TooltipContent side={tooltipSide}>{t(item.labelKey)}</TooltipContent>
      </Tooltip>
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
  const openSettings = useSettingsStore((s) => s.setOpen);

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
  const activityBarOrder = useWorkbenchStore((s) => s.activityBarOrder);
  const setActivityBarOrder = useWorkbenchStore((s) => s.setActivityBarOrder);

  const isRight = activityBarPosition === 'right';
  const tooltipSide = isRight ? 'left' : 'right';
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleClick = (id: SidePanelTab) => {
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

  // Drag-to-reorder: sensors with a small activation distance so clicks
  // are still registered (not mistaken for drags).
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );
  const orderedItems = activityBarOrder
    .map((id) => TOP_ITEMS.find((item) => item.id === id))
    .filter((item): item is ActivityItem => item !== undefined);
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = activityBarOrder.indexOf(active.id as SidePanelTab);
    const newIndex = activityBarOrder.indexOf(over.id as SidePanelTab);
    if (oldIndex === -1 || newIndex === -1) return;
    setActivityBarOrder(arrayMove(activityBarOrder, oldIndex, newIndex));
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
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={orderedItems.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            {orderedItems.map((item, idx) => (
              <Fragment key={item.id}>
                {/* 组间分隔线：当当前 item 的 group 与上一个不同时插入。
                    仅在 idx > 0 时检查，避免顶部出现多余分隔线。
                    分隔线是纯视觉元素，不参与 dnd-kit 排序。 */}
                {idx > 0 && item.group !== orderedItems[idx - 1].group && (
                  <div
                    aria-hidden
                    className="w-5 h-px bg-border/50 my-1"
                  />
                )}
                <SortableActivityItem
                  item={item}
                  isActive={activeSidePanel === item.id && !sidePanelCollapsed && viewMode === 'workbench'}
                  isRight={isRight}
                  tooltipSide={tooltipSide}
                  onClick={() => handleClick(item.id)}
                />
              </Fragment>
            ))}
          </SortableContext>
        </DndContext>

        {/* 组间分隔线：Pipeline 按钮属于"可视化"组，与上方数学组之间分隔 */}
        <div aria-hidden className="w-5 h-px bg-border/50 my-1" />

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
                'relative grid place-items-center size-9 rounded-lg transition-all',
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

        {/* Settings — 打开设置面板 */}
        <Tooltip delayDuration={200}>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => openSettings(true)}
              aria-label={t('settingsTitle')}
              className="grid place-items-center size-9 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors"
            >
              <Settings className="size-[18px]" />
            </button>
          </TooltipTrigger>
          <TooltipContent side={tooltipSide}>{t('settingsTitle')}</TooltipContent>
        </Tooltip>
      </div>
    </aside>
  );
}
