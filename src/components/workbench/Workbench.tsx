'use client';

/**
 * OmniMath Pro — Workbench
 *
 * Main entry that composes all panels into a VSCode/MATLAB-style IDE.
 *
 * Layout (desktop):
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │ TitleBar                                                    │
 *   ├─────┬───────────────┬───────────────┬──────────────────────┤
 *   │ Act │   SidePanel   │  EditorPanel  │  PreviewPanel        │
 *   │ Bar │  (history…)   │  (script)     │  (formula/plot/…)    │
 *   ├─────┴───────────────┴───────────────┴──────────────────────┤
 *   │ StatusBar                                                   │
 *   └─────────────────────────────────────────────────────────────┘
 *
 * - All three content panels are resizable via react-resizable-panels.
 * - Mobile: simplified stacked layout with tabs.
 * - Mount effects: loadFromStorage(), apply theme class, set i18n locale.
 */

import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { PanelLeftClose, PanelLeftOpen, PanelRight, PanelRightOpen, LayoutTemplate, X, Maximize2 } from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable';
import { useWorkbenchStore } from '@/lib/store/workbench';
import { useLayoutStore } from '@/lib/store/layoutStore';
import { useSettingsStore } from '@/lib/store/settingsStore';
import { setDefaultSampleCount, setDefault3DResolution } from '@/lib/plots/plotDefaults';
import { setResultPrecision } from '@/lib/engine/formatDefaults';
import { inTauri } from '@/lib/tauri';
import { setLocale as setI18nLocale, getLocale, t, useLocale } from '@/lib/i18n';
import { useIsMobile } from '@/hooks/use-mobile';
import { useCoarsePointer } from '@/hooks/use-coarse-pointer';
import { usePortraitTablet } from '@/hooks/use-portrait-tablet';
import { TitleBar } from '@/components/workbench/layout/TitleBar';
import { ActivityBar } from '@/components/workbench/layout/ActivityBar';
import {
  LazyEditorPanel,
  LazyPreviewPanel,
  LazySettingsPanel,
  LazySidePanel,
} from '@/components/workbench/layout/LazyPanels';
import { StatusBar } from '@/components/workbench/layout/StatusBar';
import { CommandPalette } from '@/components/workbench/panels/CommandPalette';
import { GlobalCalcBar } from '@/components/workbench/panels/GlobalCalcBar';
import { FloatingCalculator } from '@/components/workbench/panels/FloatingCalculator';
import { RunResultsHost } from '@/components/workbench/runresults/RunResultsHost';
import { MobileWorkbench } from '@/components/workbench/MobileWorkbench';
import { OnboardingOverlay } from '@/components/workbench/OnboardingOverlay';
import { PracticeGuide } from '@/components/workbench/PracticeGuide';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useShortcutsStore, SHORTCUTS_KEY } from '@/lib/store/shortcutsStore';
import { useGlobalShortcuts, registerShortcutHandler } from '@/lib/hooks/useGlobalShortcuts';
import { useCloudAutoCheck } from '@/lib/hooks/useCloudAutoCheck';
import { registerServiceWorker } from '@/lib/pwa/registerServiceWorker';
import { cn } from '@/lib/utils';
import type { ViewMode } from '@/lib/store/workbench';

// 全屏视图（pipeline / whiteboard / linalg / solver / stats）体积较大，静态导入
// 会在应用启动时就把它们全部加载，导致侧边栏切换视图时卡顿。这里改为懒加载，
// 仅在用户真正进入对应视图时才动态加载对应代码块，显著加快视图切换与首屏。
const NodePipeline = lazy(() =>
  import('@/components/workbench/nodes/NodePipeline').then((m) => ({ default: m.NodePipeline })),
);
const WhiteboardCanvas = lazy(() =>
  import('@/components/workbench/whiteboard/WhiteboardCanvas').then((m) => ({ default: m.WhiteboardCanvas })),
);
const StudioHome = lazy(() =>
  import('@/components/workbench/studio/StudioHome').then((m) => ({ default: m.StudioHome })),
);
const LinalgStudio = lazy(() =>
  import('@/components/workbench/studio/LinalgStudio').then((m) => ({ default: m.LinalgStudio })),
);
const SolverWorkbench = lazy(() =>
  import('@/components/workbench/panels/SolverWorkbench').then((m) => ({ default: m.SolverWorkbench })),
);
const StatisticsWorkbench = lazy(() =>
  import('@/components/workbench/panels/StatisticsWorkbench').then((m) => ({ default: m.StatisticsWorkbench })),
);
const ControlTheoryWorkbench = lazy(() =>
  import('@/components/workbench/panels/ControlTheoryWorkbench').then((m) => ({ default: m.ControlTheoryWorkbench })),
);
const EducationModule = lazy(() =>
  import('@/components/workbench/education/EducationModule').then((m) => ({ default: m.EducationModule })),
);

/** 懒加载视图切换时的轻量占位图，避免白屏闪烁。 */
function ViewLoading() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-background/40">
      <div className="flex flex-col items-center gap-2">
        <div className="size-5 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
        <span className="text-[11px] text-muted-foreground">加载中…</span>
      </div>
    </div>
  );
}

/** 全屏视图列表（按 ActivityBar 中「全屏视图」的生命周期保持一致）。 */
const FULLSCREEN_VIEWS: ViewMode[] = ['pipeline', 'whiteboard', 'linalg', 'solver', 'stats', 'control', 'education'];

/** PWA 快捷方式允许直达的视图（查询参数 ?view=）。 */
const PWA_VIEW_MODES: ViewMode[] = ['home', 'workbench', ...FULLSCREEN_VIEWS];

function isFullScreenView(vm: ViewMode): boolean {
  return FULLSCREEN_VIEWS.includes(vm);
}

function fullScreenLabel(vm: ViewMode): string {
  switch (vm) {
    case 'pipeline':
      return t('abPipeline');
    case 'whiteboard':
      return t('abWhiteboard');
    case 'linalg':
      return t('abLinalg');
    case 'solver':
      return t('abSolver');
    case 'stats':
      return t('abStats');
    case 'control':
      return t('abControl');
    case 'education':
      return t('abEducation');
    default:
      return '';
  }
}

/** 右侧并排视图：带一个轻量标题栏，关闭后回到普通工作台。 */
function FullScreenPanel({
  viewMode,
  onClose,
  onFocus,
  editorVisible,
  onToggleEditor,
  sideOpen,
  onToggleSide,
}: {
  viewMode: ViewMode;
  onClose: () => void;
  onFocus?: () => void;
  /** 编辑器是否显示；提供 onToggleEditor 时才显示对应按钮。 */
  editorVisible?: boolean;
  onToggleEditor?: () => void;
  /** 工具视图的左侧栏默认收起；提供 onToggleSide 时才显示开关。 */
  sideOpen?: boolean;
  onToggleSide?: () => void;
}) {
  return (
    <div className="h-full w-full flex flex-col min-h-0 bg-background">
      {/* 轻量标题条：只保留视图名 + 三个图标操作。
          之前这里还有「并排视图」和两个文字按钮，和视图自己的标题重复，
          白板 / 蓝图等工具顶部因此叠了两行 chrome。 */}
      <div className="shrink-0 h-8 flex items-center gap-2 border-b border-border/60 bg-card/40 px-2">
        <span className="size-1.5 rounded-full bg-primary" />
        <span className="text-[11px] font-medium text-foreground/75">{fullScreenLabel(viewMode)}</span>
        <div className="flex-1" />
        {onToggleSide && (
          <button
            type="button"
            onClick={onToggleSide}
            className="grid size-6 place-items-center rounded text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
            title={sideOpen ? '收起左侧栏' : '展开左侧栏（变量 / 历史）'}
            aria-label={sideOpen ? '收起左侧栏' : '展开左侧栏'}
          >
            {sideOpen ? <PanelLeftClose className="size-3.5" /> : <PanelLeftOpen className="size-3.5" />}
          </button>
        )}
        {onToggleEditor && (
          <button
            type="button"
            onClick={onToggleEditor}
            className="grid size-6 place-items-center rounded text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
            title={editorVisible ? '隐藏编辑器，让当前视图占满宽度' : '显示编辑器'}
            aria-label={editorVisible ? '隐藏编辑器' : '显示编辑器'}
          >
            {editorVisible ? <PanelLeftClose className="size-3.5" /> : <PanelLeftOpen className="size-3.5" />}
          </button>
        )}
        {onFocus && (
          <button
            type="button"
            onClick={onFocus}
            className="grid size-6 place-items-center rounded text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
            title="收起其他面板，全宽显示当前视图"
            aria-label="专注模式"
          >
            <Maximize2 className="size-3.5" />
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="grid size-6 place-items-center rounded text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
          title="关闭并返回工作台"
          aria-label="关闭"
        >
          <X className="size-3.5" />
        </button>
      </div>
      <div className="flex-1 min-h-0 relative">
        <ErrorBoundary>
          <FullScreenViews activeViewMode={viewMode} />
        </ErrorBoundary>
      </div>
    </div>
  );
}

/**
 * 全屏视图容器 —— 保持挂载策略（防止切换视图时数据丢失）。
 *
 * 之前 Workbench 用「条件渲染」切换全屏视图，切换时 React 会卸载上一视图并挂载
 * 新视图，导致视图内部的本地 useState（线性代数的矩阵、求解器的方程/结果等）在
 * 来回切换后全部丢失、归零。这里改为：访问过的视图始终保持挂载，仅用 CSS 隐藏
 * 非激活视图。首次访问某视图才加载代码块（保留懒加载性能优势），一旦访问过即可
 * 瞬时切回且状态驻留。
 */
function FullScreenViews({ activeViewMode }: { activeViewMode: ViewMode }) {
  const [visited, setVisited] = useState<Set<ViewMode>>(() => new Set([activeViewMode]));
  useEffect(() => {
    setVisited((prev) => {
      if (prev.has(activeViewMode)) return prev;
      const next = new Set(prev);
      next.add(activeViewMode);
      return next;
    });
  }, [activeViewMode]);

  const renderView = (vm: ViewMode) => {
    switch (vm) {
      case 'pipeline':
        return <NodePipeline />;
      case 'whiteboard':
        return <WhiteboardCanvas />;
      case 'linalg':
        return <LinalgStudio />;
      case 'solver':
        return <SolverWorkbench />;
      case 'stats':
        return <StatisticsWorkbench />;
      case 'control':
        return <ControlTheoryWorkbench />;
      case 'education':
        return <EducationModule />;
      default:
        return null;
    }
  };

  return (
    <div className="h-full w-full min-w-0 relative overflow-hidden">
      {FULLSCREEN_VIEWS.map((vm) => (
        <div
          key={vm}
          className={cn('absolute inset-0', vm === activeViewMode ? 'block' : 'hidden')}
          aria-hidden={vm !== activeViewMode}
        >
          {visited.has(vm) && (
            <ErrorBoundary>
              <Suspense fallback={<ViewLoading />}>{renderView(vm)}</Suspense>
            </ErrorBoundary>
          )}
        </div>
      ))}
    </div>
  );
}

export function Workbench() {
  useLocale();
  const loadFromStorage = useWorkbenchStore((s) => s.loadFromStorage);
  const theme = useWorkbenchStore((s) => s.theme);
  const locale = useWorkbenchStore((s) => s.locale);
  const sidePanelCollapsed = useWorkbenchStore((s) => s.sidePanelCollapsed);
  const viewMode = useWorkbenchStore((s) => s.viewMode);
  const setViewMode = useWorkbenchStore((s) => s.setViewMode);
  /** View to restore when leaving focus mode (focus is stored as a viewMode). */
  const [focusView, setFocusView] = useState<ViewMode | null>(null);

  const enterFocus = useCallback(
    (view: ViewMode = viewMode) => {
      if (view !== 'focus') setFocusView(view);
      setViewMode('focus');
    },
    [viewMode, setViewMode],
  );

  const exitFocus = useCallback(() => {
    setViewMode(focusView && focusView !== 'focus' ? focusView : 'workbench');
    setFocusView(null);
  }, [focusView, setViewMode]);
  const activityBarPosition = useWorkbenchStore((s) => s.activityBarPosition);
  const editorVisible = useWorkbenchStore((s) => s.editorVisible);
  const previewVisible = useWorkbenchStore((s) => s.previewVisible);
  const setEditorVisible = useWorkbenchStore((s) => s.setEditorVisible);
  const setPreviewVisible = useWorkbenchStore((s) => s.setPreviewVisible);
  const toggleActivityBarHidden = useWorkbenchStore((s) => s.toggleActivityBarHidden);
  const toggleSidePanel = useWorkbenchStore((s) => s.toggleSidePanel);
  const setEditorContent = useWorkbenchStore((s) => s.setEditorContent);
  const setCommandPaletteOpen = useWorkbenchStore((s) => s.setCommandPaletteOpen);
  /** PWA / 桌面快捷方式显式请求的视图（?view=）；手机端据此选择首个标签。 */
  const [requestedView, setRequestedView] = useState<ViewMode | null>(null);

  // 布局状态（预览位置 / 尺寸）
  const previewPosition = useLayoutStore((s) => s.previewPosition);
  const previewSize = useLayoutStore((s) => s.previewSize);
  const loadLayoutFromStorage = useLayoutStore((s) => s.loadFromStorage);

  // 快捷键
  const loadShortcutsFromStorage = useShortcutsStore((s) => s.loadFromStorage);
  const setSettingsOpen = useSettingsStore((s) => s.setOpen);
  const settingsOpen = useSettingsStore((s) => s.open);
  const loadSettingsFromStorage = useSettingsStore((s) => s.loadFromStorage);
  // 编辑器字号（zoomIn/zoomOut/resetView 快捷键操作对象）
  const editorFontSize = useSettingsStore((s) => s.editorFontSize);
  const setEditorFontSize = useSettingsStore((s) => s.setEditorFontSize);
  // 符号面板开关（Ctrl/Cmd+/ 快捷键操作对象）
  const symbolPaletteOpen = useSettingsStore((s) => s.symbolPaletteOpen);
  const setSymbolPaletteOpen = useSettingsStore((s) => s.setSymbolPaletteOpen);

  // 高级设置（模块级变量同步）：plot2d 采样点 / plot3d 分辨率 / latex 精度。
  // 这些库文件无 React 上下文，无法直接订阅 store，故在 Workbench 挂载时
  // 及设置变化时通过 setter 函数同步。历史记录上限（advancedHistoryLimit）
  // 由 workbench store 的 addResult action 用 getState() 即时读取，无需此处同步。
  const advancedPlotSamples = useSettingsStore((s) => s.advancedPlotSamples);
  const advancedPlot3dResolution = useSettingsStore((s) => s.advancedPlot3dResolution);
  const advancedResultPrecision = useSettingsStore((s) => s.advancedResultPrecision);

  // 窗口尺寸/全屏切换的触发计数器。Tauri 窗口 maximize/fullscreen 时
  // CSS 视口单位会变化但 React 不会自动重渲染，react-resizable-panels
  // 也不会重算布局；用一个 tick 强制重渲染以避免子组件错位。
  // Web 环境跳过（inTauri 守卫）。
  const [, setResizeTick] = useState(0);

  // 激活全局快捷键监听（在 Workbench 挂载一次）
  useGlobalShortcuts();
  // 可选的启动云端检查：有较新备份时提示合并（不自动覆盖本机）。
  useCloudAutoCheck();

  // Mount: load persisted state once + install global error guards.
  useEffect(() => {
    loadFromStorage();
    loadLayoutFromStorage();
    loadShortcutsFromStorage();
    // 设置面板现在是按需挂载（不再常驻），持久化设置必须在应用启动时主动载入，
    // 否则字号 / 白板偏好等要等用户打开设置面板才生效。
    loadSettingsFromStorage();
    // Web / PWA：生产线注册 app shell 缓存（开发模式与 Tauri 内部自动跳过）。
    registerServiceWorker();

    // PWA / 桌面快捷方式：/?view=whiteboard 直接进入对应工具。
    // 读取后清掉 query，避免之后刷新反复强制跳转、也避免污染历史记录。
    try {
      const requested = new URLSearchParams(window.location.search).get('view');
      if (requested && PWA_VIEW_MODES.includes(requested as ViewMode)) {
        useWorkbenchStore.getState().setViewMode(requested as ViewMode);
        setRequestedView(requested as ViewMode);
        window.history.replaceState(null, '', window.location.pathname + window.location.hash);
      }
    } catch {
      // 忽略异常的 URL / 历史 API（隐私模式等）。
    }

    const onUnhandledRejection = (e: PromiseRejectionEvent) => {
      if (typeof console !== 'undefined') {
        console.warn('[OmniMath] unhandled rejection:', e.reason);
      }
      e.preventDefault();
    };
    const onError = (e: ErrorEvent) => {
      if (typeof console !== 'undefined') {
        console.warn('[OmniMath] window error:', e.error ?? e.message);
      }
    };
    // Window-level drag & drop guard.
    //
    // WebView2 (和部分浏览器) 在拖拽 HTML 元素时，若 drop 落在非明确放置目标上，
    // 会触发默认行为——把 dataTransfer 当作 URL 或文件导航当前页面，导致
    // 文件树内部的拖拽排序失效（拖到一半页面被"导航"走）。这里在 window 上
    // 拦截 dragover/drop 并 preventDefault，阻止 WebView 的默认导航行为。
    // React 合成事件（FilesPanel 自身的 dragover/drop 处理器）是独立监听器，
    // 不受影响，仍会正常触发。
    const onWindowDragOver = (e: DragEvent) => {
      e.preventDefault();
    };
    const onWindowDrop = (e: DragEvent) => {
      e.preventDefault();
    };
    window.addEventListener('unhandledrejection', onUnhandledRejection);
    window.addEventListener('error', onError);
    window.addEventListener('dragover', onWindowDragOver);
    window.addEventListener('drop', onWindowDrop);
    return () => {
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
      window.removeEventListener('error', onError);
      window.removeEventListener('dragover', onWindowDragOver);
      window.removeEventListener('drop', onWindowDrop);
    };
  }, [loadFromStorage, loadLayoutFromStorage, loadShortcutsFromStorage, loadSettingsFromStorage]);

  // Sync i18n locale with the store locale.
  useEffect(() => {
    if (getLocale() !== locale) setI18nLocale(locale);
  }, [locale]);

  // Apply theme class to <html> whenever it changes.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (theme === 'dark') document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [theme]);

  // 同步高级设置到 plot2d / plot3d / latex 的模块级默认值变量。
  // 这些纯库文件不持有 React 上下文，需通过命令式 setter 在挂载及设置
  // 变化时更新，保证采样密度 / 3D 网格分辨率 / 数值精度与用户设置一致。
  useEffect(() => {
    setDefaultSampleCount(advancedPlotSamples);
  }, [advancedPlotSamples]);
  useEffect(() => {
    setDefault3DResolution(advancedPlot3dResolution);
  }, [advancedPlot3dResolution]);
  useEffect(() => {
    setResultPrecision(advancedResultPrecision);
  }, [advancedResultPrecision]);

  // 监听 Tauri 窗口尺寸变化（maximize/restore/拖拽边缘/dpi 变化等）。
  // 触发 resizeTick 重渲染，让 react-resizable-panels 重新计算面板尺寸，
  // 避免 maximize 或全屏切换后子组件错位。Web 环境跳过。
  useEffect(() => {
    if (!inTauri()) return;
    const win = getCurrentWindow();
    let unlisten: (() => void) | undefined;
    win.onResized(() => {
      setResizeTick((tick) => tick + 1);
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  // 全局快捷键处理器注册（通过 shortcutsStore 配置，可自定义）
  useEffect(() => {
    const unregs: Array<() => void> = [];
    unregs.push(registerShortcutHandler('focusMode', () => {
      if (viewMode === 'focus') exitFocus();
      else enterFocus();
    }));
    unregs.push(registerShortcutHandler('toggleSidebar', () => {
      toggleSidePanel();
    }));
    unregs.push(registerShortcutHandler('openSettings', () => {
      setSettingsOpen(true);
    }));
    unregs.push(registerShortcutHandler('openPalette', () => {
      setCommandPaletteOpen(true);
    }));
    unregs.push(registerShortcutHandler('clearEditor', () => {
      setEditorContent('');
    }));
    unregs.push(registerShortcutHandler('togglePreview', () => {
      setPreviewVisible(!previewVisible);
    }));
    // 编辑器字号缩放：setEditorFontSize 内部已对 [8,32] 钳制取整。
    // zoomIn/zoomOut 闭包捕获 editorFontSize，因此依赖该值；resetView 重置为默认 14。
    unregs.push(registerShortcutHandler('zoomIn', () => {
      setEditorFontSize(editorFontSize + 1);
    }));
    unregs.push(registerShortcutHandler('zoomOut', () => {
      setEditorFontSize(editorFontSize - 1);
    }));
    unregs.push(registerShortcutHandler('resetView', () => {
      setEditorFontSize(14);
    }));
    return () => unregs.forEach((u) => u());
  }, [viewMode, enterFocus, exitFocus, toggleSidePanel, setSettingsOpen, setCommandPaletteOpen, setEditorContent, setPreviewVisible, previewVisible, editorFontSize, setEditorFontSize]);

  // 符号面板快捷键：Ctrl/Cmd + / 切换符号面板展开/折叠。
  // 编辑器内 Ctrl+/ 仍由 CodeMirror 用于行注释，故仅当焦点不在
  // CodeMirror 编辑器内时才触发，避免与注释快捷键冲突。
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '/') {
        const target = e.target as HTMLElement | null;
        if (target?.closest?.('.cm-editor')) return;
        e.preventDefault();
        setSymbolPaletteOpen(!symbolPaletteOpen);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [symbolPaletteOpen, setSymbolPaletteOpen]);

  const isMobile = useIsMobile();
  const coarsePointer = useCoarsePointer();
  // 竖屏平板默认上下分栏：左右分栏会把编辑器和预览都压到三百多像素，
  // 预览的「流水线 / AI」标签还会被截断。
  const portraitTablet = usePortraitTablet();
  const effectivePreviewPosition = portraitTablet ? 'bottom' : previewPosition;
  // 平板打开白板时收起编辑器/侧栏，让画布吃满屏幕。
  const focusWhiteboard = coarsePointer && viewMode === 'whiteboard';
  // 工具视图（蓝图/白板/线代/求解…）默认不显示左侧栏：这些视图自带完整操作区，
  // 左栏常驻只会把画布挤到右边。需要变量/历史时用标题栏的侧栏按钮临时展开。
  const [toolSideOpen, setToolSideOpen] = useState(false);
  const showFsSide = !focusWhiteboard && (isFullScreenView(viewMode) ? toolSideOpen : !sidePanelCollapsed);

  // 全屏工具视图（白板 / 蓝图 / 矩阵 / 求解 / 统计 / 控制 / 学习）都是自包含的：
  // 进入时自动收起代码编辑器，让工具占满宽度，返回工作台时再恢复。
  // 之前左侧始终挂着 40% 的无关代码编辑器 —— 正是「内容无意义展开」。
  const autoHiddenEditorRef = useRef(false);
  useEffect(() => {
    const toolView = isFullScreenView(viewMode);
    if (toolView) {
      if (!autoHiddenEditorRef.current && useWorkbenchStore.getState().editorVisible) {
        autoHiddenEditorRef.current = true;
        setEditorVisible(false);
      }
      return;
    }
    if (autoHiddenEditorRef.current && (viewMode === 'workbench' || viewMode === 'home')) {
      autoHiddenEditorRef.current = false;
      setEditorVisible(true);
    }
  }, [viewMode, setEditorVisible]);

  // 设置面板只在第一次打开后挂载，之后保持挂载：既避免首屏加载它的代码块，
  // 又保留面板内部的关闭动画与分类 / 导入方式等本地状态（反复开关不重置）。
  const [settingsMounted, setSettingsMounted] = useState(settingsOpen);
  useEffect(() => {
    if (settingsOpen) setSettingsMounted(true);
  }, [settingsOpen]);

  // 进入全屏工具视图时，effect 会在提交后把 editorVisible 置 false。若这一帧
  // 就渲染编辑器，会白下载编辑器 + mathjs 的 chunk（白板/蓝图根本用不到）。
  // 因此在「首次自动隐藏尚未生效」的这帧先渲染空占位；用户之后手动再打开
  // 编辑器时 autoHiddenEditorRef 已为 true，会正常渲染。
  const editorPendingAutoHide =
    isFullScreenView(viewMode) && editorVisible && !autoHiddenEditorRef.current;

  if (isMobile) {
    // 手机上点开首页卡片（蓝图/矩阵/求解/统计等）时，直接渲染全宽视图，
    // 而不是回到四标签工作台：小屏更适合一次专注一个工具。
    if (isFullScreenView(viewMode)) {
      return (
        <>
          <div className="h-[100dvh] w-screen flex flex-col overflow-hidden bg-background text-foreground">
            <TitleBar />
            <div className="shrink-0 h-9 flex items-center gap-2 border-b border-border/60 bg-card/40 px-2">
              <button
                type="button"
                onClick={() => setViewMode('workbench')}
                className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] text-muted-foreground hover:bg-accent/60 hover:text-foreground"
              >
                ← 返回
              </button>
              <span className="text-[11.5px] font-medium text-foreground/80">
                {fullScreenLabel(viewMode)}
              </span>
            </div>
            <div className="flex-1 min-h-0 relative">
              <FullScreenViews activeViewMode={viewMode} />
            </div>
          </div>
          <CommandPalette />
          <GlobalCalcBar />
          <FloatingCalculator />
          <RunResultsHost />
          {settingsMounted && <LazySettingsPanel />}
          <OnboardingOverlay />
        </>
      );
    }
    return (
      <>
        <MobileWorkbench initialView={requestedView} />
        <CommandPalette />
        <GlobalCalcBar />
        <FloatingCalculator />
        <RunResultsHost />
        {settingsMounted && <LazySettingsPanel />}
        <OnboardingOverlay />
      </>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="h-screen w-screen flex flex-col overflow-hidden bg-background text-foreground"
    >
      <TitleBar />

      <div className="flex-1 flex min-h-0">
        {activityBarPosition === 'left' && viewMode !== 'focus' && <ActivityBar />}

        {viewMode === 'focus' ? (
          /* 专注模式：收起活动栏 / 侧栏 / 编辑器，只留当前主工作区。 */
          <div className="flex-1 min-w-0 min-h-0 flex flex-col bg-background">
            <div className="shrink-0 h-8 flex items-center gap-2 border-b border-border/60 bg-card/40 px-3">
              <span className="rounded border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[9.5px] font-medium text-primary">
                专注模式
              </span>
              <span className="text-[11px] text-muted-foreground">
                {focusView && isFullScreenView(focusView)
                  ? fullScreenLabel(focusView)
                  : focusView === 'home'
                    ? '工作台首页'
                    : '预览'}
              </span>
              <div className="flex-1" />
              <button
                type="button"
                onClick={exitFocus}
                className="h-6 rounded px-2 text-[10px] text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
              >
                退出专注 · F11
              </button>
            </div>
            <div className="flex-1 min-h-0 relative">
              <ErrorBoundary>
                {focusView && isFullScreenView(focusView) ? (
                  <FullScreenViews activeViewMode={focusView} />
                ) : focusView === 'home' ? (
                  <Suspense fallback={<ViewLoading />}>
                    <StudioHome />
                  </Suspense>
                ) : (
                  <LazyPreviewPanel />
                )}
              </ErrorBoundary>
            </div>
          </div>
        ) : viewMode === 'home' ? (
          <div className="flex-1 min-w-0 min-h-0">
            <ErrorBoundary>
              <Suspense fallback={<ViewLoading />}>
                <StudioHome />
              </Suspense>
            </ErrorBoundary>
          </div>
        ) : isFullScreenView(viewMode) ? (
          /* 并排工作区：侧栏 | 编辑器 | 视图。编辑器不再被整页替换。 */
          <ResizablePanelGroup
            direction="horizontal"
            autoSaveId="omnimath-side-fs-v1"
            className="flex-1 min-w-0"
          >
            {showFsSide && (
              <>
                <ResizablePanel defaultSize={20} minSize={12} maxSize={40} id="fs-side" order={1}>
                  <ErrorBoundary>
                    <LazySidePanel />
                  </ErrorBoundary>
                </ResizablePanel>
                <ResizableHandle withHandle className="data-[resize-handle-active]:bg-primary/60" />
              </>
            )}
            {editorVisible && !focusWhiteboard && (
              <>
                <ResizablePanel
                  defaultSize={showFsSide ? 35 : 38}
                  minSize={20}
                  id="fs-editor"
                  order={2}
                >
                  <ErrorBoundary>
                    {editorPendingAutoHide ? (
                      <div className="h-full w-full bg-background/30" aria-hidden />
                    ) : (
                      <LazyEditorPanel />
                    )}
                  </ErrorBoundary>
                </ResizablePanel>
                <ResizableHandle withHandle className="data-[resize-handle-active]:bg-primary/60" />
              </>
            )}
            <ResizablePanel
              defaultSize={
                focusWhiteboard
                  ? 100
                  : editorVisible
                    ? showFsSide
                      ? 45
                      : 62
                    : showFsSide
                      ? 80
                      : 100
              }
              minSize={30}
              id="fs-panel"
              order={3}
            >
              <FullScreenPanel
                viewMode={viewMode}
                onClose={() => setViewMode('workbench')}
                onFocus={() => enterFocus(viewMode)}
                editorVisible={editorVisible}
                onToggleEditor={focusWhiteboard ? undefined : () => setEditorVisible(!editorVisible)}
                sideOpen={showFsSide}
                onToggleSide={focusWhiteboard ? undefined : () => setToolSideOpen((v) => !v)}
              />
            </ResizablePanel>
          </ResizablePanelGroup>
        ) : !editorVisible && !previewVisible ? (
          /* Plain layout when both main panels are hidden — avoids empty resizable group. */
          <ResizablePanelGroup direction="horizontal" autoSaveId="omnimath-side-only" className="flex-1 min-w-0">
            {!sidePanelCollapsed && (
              <>
                <ResizablePanel defaultSize={25} minSize={12} maxSize={40} id="side-only-panel" order={1}>
                  <ErrorBoundary>
                    <LazySidePanel />
                  </ErrorBoundary>
                </ResizablePanel>
                <ResizableHandle withHandle className="data-[resize-handle-active]:bg-primary/60" />
              </>
            )}
            <ResizablePanel defaultSize={sidePanelCollapsed ? 100 : 75} minSize={50} id="side-only-empty" order={2}>
              <div className="h-full w-full flex flex-col items-center justify-center gap-3 px-6 text-center bg-background/40">
                <div className="grid place-items-center size-14 rounded-2xl bg-primary/8 border border-primary/20">
                  <PanelLeftClose className="size-6 text-primary/70" />
                </div>
                <p className="text-[13px] font-medium text-foreground/80">
                  {t('wbAllPanelsHidden')}
                </p>
                <p className="text-[11.5px] text-muted-foreground max-w-xs">
                  {t('wbAllPanelsHiddenHint')}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditorVisible(true)}
                    className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                  >
                    <LayoutTemplate className="size-3.5" />
                    {t('abToggleEditor')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewVisible(true)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent transition-colors"
                  >
                    <PanelRight className="size-3.5" />
                    {t('abTogglePreview')}
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleActivityBarHidden()}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent transition-colors"
                  >
                    <PanelRightOpen className="size-3.5" />
                    {t('abShowTaskbar')}
                  </button>
                </div>
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        ) : editorVisible && previewVisible ? (
          /* 双面板布局：外层 side | main，内层 editor | preview（方向由 previewPosition 决定） */
          <ResizablePanelGroup direction="horizontal" autoSaveId="omnimath-side-v2" className="flex-1 min-w-0">
            {!sidePanelCollapsed && (
              <>
                <ResizablePanel
                  defaultSize={20}
                  minSize={12}
                  maxSize={40}
                  id="side-panel"
                  order={1}
                >
                  <ErrorBoundary>
                    <LazySidePanel />
                  </ErrorBoundary>
                </ResizablePanel>
                <ResizableHandle withHandle className="data-[resize-handle-active]:bg-primary/60" />
              </>
            )}

            <ResizablePanel
              defaultSize={sidePanelCollapsed ? 100 : 80}
              minSize={50}
              id="main-panel"
              order={2}
            >
              <ResizablePanelGroup
                direction={effectivePreviewPosition === 'right' ? 'horizontal' : 'vertical'}
                autoSaveId={`omnimath-main-${effectivePreviewPosition}-${previewSize}`}
                className="h-full w-full"
              >
                <ResizablePanel
                  defaultSize={previewSize === 'large' ? 36 : 58}
                  minSize={20}
                  maxSize={80}
                  id="editor-panel"
                  order={1}
                >
                  <ErrorBoundary>
                    <LazyEditorPanel />
                  </ErrorBoundary>
                </ResizablePanel>
                <ResizableHandle withHandle className="data-[resize-handle-active]:bg-primary/60" />
                <ResizablePanel
                  defaultSize={previewSize === 'large' ? 64 : 42}
                  minSize={previewSize === 'large' ? 30 : 20}
                  maxSize={80}
                  id="preview-panel"
                  order={2}
                >
                  <ErrorBoundary>
                    <LazyPreviewPanel />
                  </ErrorBoundary>
                </ResizablePanel>
              </ResizablePanelGroup>
            </ResizablePanel>
          </ResizablePanelGroup>
        ) : (
          /* 单面板布局：side | (editor 或 preview)，沿用旧的扁平结构 */
          <ResizablePanelGroup direction="horizontal" autoSaveId={`omnimath-layout-${previewSize}`} className="flex-1 min-w-0">
            {/* Side panel — collapsible (hidden in focus mode) */}
            {!sidePanelCollapsed && (
              <>
                <ResizablePanel
                  defaultSize={20}
                  minSize={12}
                  maxSize={40}
                  id="side-panel"
                  order={1}
                >
                  <ErrorBoundary>
                    <LazySidePanel />
                  </ErrorBoundary>
                </ResizablePanel>
                <ResizableHandle withHandle className="data-[resize-handle-active]:bg-primary/60" />
              </>
            )}

            {/* Editor */}
            {editorVisible && (
              <ResizablePanel
                defaultSize={previewVisible ? (previewSize === 'large' ? 35 : 40) : 60}
                minSize={20}
                maxSize={70}
                id="editor-panel"
                order={2}
              >
                <ErrorBoundary>
                  <LazyEditorPanel />
                </ErrorBoundary>
              </ResizablePanel>
            )}

            {editorVisible && previewVisible && <ResizableHandle withHandle className="data-[resize-handle-active]:bg-primary/60" />}

            {/* Preview */}
            {previewVisible && (
              <ResizablePanel
                defaultSize={editorVisible ? (previewSize === 'large' ? 45 : 40) : 60}
                minSize={previewSize === 'large' ? 25 : 20}
                maxSize={70}
                id="preview-panel"
                order={3}
              >
                <ErrorBoundary>
                  <LazyPreviewPanel />
                </ErrorBoundary>
              </ResizablePanel>
            )}
          </ResizablePanelGroup>
        )}

        {activityBarPosition === 'right' && viewMode !== 'focus' && <ActivityBar />}
      </div>

      <StatusBar />

      {/* Overlays */}
      <CommandPalette />
      <GlobalCalcBar />
      <RunResultsHost />
      <FloatingCalculator />
      {settingsMounted && <LazySettingsPanel />}
      <OnboardingOverlay />
      <PracticeGuide />
    </motion.div>
  );
}
