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

import { lazy, Suspense, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { PanelLeftClose, PanelRight, PanelRightOpen, LayoutTemplate } from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable';
import { useWorkbenchStore } from '@/lib/store/workbench';
import { useLayoutStore } from '@/lib/store/layoutStore';
import { useSettingsStore } from '@/lib/store/settingsStore';
import { setDefaultSampleCount } from '@/lib/plots/plot2d';
import { setDefault3DResolution } from '@/lib/plots/plot3d';
import { setResultPrecision } from '@/lib/engine/latex';
import { inTauri } from '@/lib/tauri';
import { setLocale as setI18nLocale, getLocale, t } from '@/lib/i18n';
import { useIsMobile } from '@/hooks/use-mobile';
import { TitleBar } from '@/components/workbench/layout/TitleBar';
import { ActivityBar } from '@/components/workbench/layout/ActivityBar';
import { SidePanel } from '@/components/workbench/layout/SidePanel';
import { EditorPanel } from '@/components/workbench/layout/EditorPanel';
import { PreviewPanel } from '@/components/workbench/layout/PreviewPanel';
import { StatusBar } from '@/components/workbench/layout/StatusBar';
import { CommandPalette } from '@/components/workbench/panels/CommandPalette';
import { GlobalCalcBar } from '@/components/workbench/panels/GlobalCalcBar';
import { FloatingCalculator } from '@/components/workbench/panels/FloatingCalculator';
import { MobileWorkbench } from '@/components/workbench/MobileWorkbench';
import { OnboardingOverlay } from '@/components/workbench/OnboardingOverlay';
import { SettingsPanel } from '@/components/workbench/panels/SettingsPanel';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useShortcutsStore, SHORTCUTS_KEY } from '@/lib/store/shortcutsStore';
import { useGlobalShortcuts, registerShortcutHandler } from '@/lib/hooks/useGlobalShortcuts';
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
const LinearAlgebraWorkbench = lazy(() =>
  import('@/components/workbench/panels/LinearAlgebraWorkbench').then((m) => ({ default: m.LinearAlgebraWorkbench })),
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
const FULLSCREEN_VIEWS: ViewMode[] = ['pipeline', 'whiteboard', 'linalg', 'solver', 'stats', 'control'];

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
        return <LinearAlgebraWorkbench />;
      case 'solver':
        return <SolverWorkbench />;
      case 'stats':
        return <StatisticsWorkbench />;
      case 'control':
        return <ControlTheoryWorkbench />;
      default:
        return null;
    }
  };

  return (
    <div className="flex-1 min-w-0 min-h-0 relative overflow-hidden">
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
  const loadFromStorage = useWorkbenchStore((s) => s.loadFromStorage);
  const theme = useWorkbenchStore((s) => s.theme);
  const locale = useWorkbenchStore((s) => s.locale);
  const sidePanelCollapsed = useWorkbenchStore((s) => s.sidePanelCollapsed);
  const viewMode = useWorkbenchStore((s) => s.viewMode);
  const setViewMode = useWorkbenchStore((s) => s.setViewMode);
  const activityBarPosition = useWorkbenchStore((s) => s.activityBarPosition);
  const editorVisible = useWorkbenchStore((s) => s.editorVisible);
  const previewVisible = useWorkbenchStore((s) => s.previewVisible);
  const setEditorVisible = useWorkbenchStore((s) => s.setEditorVisible);
  const setPreviewVisible = useWorkbenchStore((s) => s.setPreviewVisible);
  const toggleActivityBarHidden = useWorkbenchStore((s) => s.toggleActivityBarHidden);
  const toggleSidePanel = useWorkbenchStore((s) => s.toggleSidePanel);
  const setEditorContent = useWorkbenchStore((s) => s.setEditorContent);
  const setCommandPaletteOpen = useWorkbenchStore((s) => s.setCommandPaletteOpen);

  // 布局状态（预览位置 / 尺寸）
  const previewPosition = useLayoutStore((s) => s.previewPosition);
  const previewSize = useLayoutStore((s) => s.previewSize);
  const loadLayoutFromStorage = useLayoutStore((s) => s.loadFromStorage);

  // 快捷键
  const loadShortcutsFromStorage = useShortcutsStore((s) => s.loadFromStorage);
  const setSettingsOpen = useSettingsStore((s) => s.setOpen);
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

  // Mount: load persisted state once + install global error guards.
  useEffect(() => {
    loadFromStorage();
    loadLayoutFromStorage();
    loadShortcutsFromStorage();

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
  }, [loadFromStorage, loadLayoutFromStorage, loadShortcutsFromStorage]);

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
      setViewMode(viewMode !== 'focus' ? 'focus' : 'workbench');
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
  }, [viewMode, setViewMode, toggleSidePanel, setSettingsOpen, setCommandPaletteOpen, setEditorContent, setPreviewVisible, previewVisible, editorFontSize, setEditorFontSize]);

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

  if (isMobile) {
    return (
      <>
        <MobileWorkbench />
        <CommandPalette />
        <GlobalCalcBar />
        <FloatingCalculator />
        <SettingsPanel />
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
        {activityBarPosition === 'left' && <ActivityBar />}

        {viewMode === 'pipeline' || viewMode === 'whiteboard' || viewMode === 'linalg' || viewMode === 'solver' || viewMode === 'stats' || viewMode === 'control' ? (
          /* 全屏视图（pipeline / whiteboard / linalg / solver / stats）。
             关键修复：与 SidePanel 相同，访问过的全屏视图始终保持挂载，仅用 CSS
             隐藏非激活视图，避免切换时组件卸载导致用户数据（矩阵/方程/结果等）丢失归零。 */
          <FullScreenViews activeViewMode={viewMode} />
        ) : !editorVisible && !previewVisible ? (
          /* Plain layout when both main panels are hidden — avoids empty resizable group. */
          <ResizablePanelGroup direction="horizontal" autoSaveId="omnimath-side-only" className="flex-1 min-w-0">
            {!sidePanelCollapsed && viewMode !== 'focus' && (
              <>
                <ResizablePanel defaultSize={25} minSize={12} maxSize={40} id="side-only-panel" order={1}>
                  <ErrorBoundary>
                    <SidePanel />
                  </ErrorBoundary>
                </ResizablePanel>
                <ResizableHandle withHandle className="data-[resize-handle-active]:bg-primary/60" />
              </>
            )}
            <ResizablePanel defaultSize={sidePanelCollapsed || viewMode === 'focus' ? 100 : 75} minSize={50} id="side-only-empty" order={2}>
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
            {!sidePanelCollapsed && viewMode !== 'focus' && (
              <>
                <ResizablePanel
                  defaultSize={20}
                  minSize={12}
                  maxSize={40}
                  id="side-panel"
                  order={1}
                >
                  <ErrorBoundary>
                    <SidePanel />
                  </ErrorBoundary>
                </ResizablePanel>
                <ResizableHandle withHandle className="data-[resize-handle-active]:bg-primary/60" />
              </>
            )}

            <ResizablePanel
              defaultSize={sidePanelCollapsed || viewMode === 'focus' ? 100 : 80}
              minSize={50}
              id="main-panel"
              order={2}
            >
              <ResizablePanelGroup
                direction={previewPosition === 'right' ? 'horizontal' : 'vertical'}
                autoSaveId={`omnimath-main-${previewPosition}-${previewSize}`}
                className="h-full w-full"
              >
                <ResizablePanel
                  defaultSize={previewSize === 'large' ? 40 : 50}
                  minSize={20}
                  maxSize={80}
                  id="editor-panel"
                  order={1}
                >
                  <ErrorBoundary>
                    <EditorPanel />
                  </ErrorBoundary>
                </ResizablePanel>
                <ResizableHandle withHandle className="data-[resize-handle-active]:bg-primary/60" />
                <ResizablePanel
                  defaultSize={previewSize === 'large' ? 60 : 50}
                  minSize={previewSize === 'large' ? 30 : 20}
                  maxSize={80}
                  id="preview-panel"
                  order={2}
                >
                  <ErrorBoundary>
                    <PreviewPanel />
                  </ErrorBoundary>
                </ResizablePanel>
              </ResizablePanelGroup>
            </ResizablePanel>
          </ResizablePanelGroup>
        ) : (
          /* 单面板布局：side | (editor 或 preview)，沿用旧的扁平结构 */
          <ResizablePanelGroup direction="horizontal" autoSaveId={`omnimath-layout-${previewSize}`} className="flex-1 min-w-0">
            {/* Side panel — collapsible (hidden in focus mode) */}
            {!sidePanelCollapsed && viewMode !== 'focus' && (
              <>
                <ResizablePanel
                  defaultSize={20}
                  minSize={12}
                  maxSize={40}
                  id="side-panel"
                  order={1}
                >
                  <ErrorBoundary>
                    <SidePanel />
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
                  <EditorPanel />
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
                  <PreviewPanel />
                </ErrorBoundary>
              </ResizablePanel>
            )}
          </ResizablePanelGroup>
        )}

        {activityBarPosition === 'right' && <ActivityBar />}
      </div>

      <StatusBar />

      {/* Overlays */}
      <CommandPalette />
      <GlobalCalcBar />
      <FloatingCalculator />
      <SettingsPanel />
      <OnboardingOverlay />
    </motion.div>
  );
}
