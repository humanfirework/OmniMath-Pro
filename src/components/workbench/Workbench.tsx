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

import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { PanelLeftClose, PanelRight, PanelRightOpen, LayoutTemplate } from 'lucide-react';
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable';
import { useWorkbenchStore } from '@/lib/store/workbench';
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
import { MobileWorkbench } from '@/components/workbench/MobileWorkbench';
import { NodePipeline } from '@/components/workbench/nodes/NodePipeline';

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

  // Mount: load persisted state once + install global error guards.
  useEffect(() => {
    loadFromStorage();

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
    window.addEventListener('unhandledrejection', onUnhandledRejection);
    window.addEventListener('error', onError);
    return () => {
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
      window.removeEventListener('error', onError);
    };
  }, [loadFromStorage]);

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

  // F11 toggles focus mode (hide side panel for distraction-free editing).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F11') {
        e.preventDefault();
        setViewMode(viewMode !== 'focus' ? 'focus' : 'workbench');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [viewMode, setViewMode]);

  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <>
        <MobileWorkbench />
        <CommandPalette />
        <GlobalCalcBar />
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

        {viewMode === 'pipeline' ? (
          /* Pipeline view takes over the main area (Task 6). */
          <div className="flex-1 min-w-0 min-h-0">
            <NodePipeline />
          </div>
        ) : !editorVisible && !previewVisible ? (
          /* Plain layout when both main panels are hidden — avoids empty resizable group. */
          <div className="flex-1 flex min-w-0">
            {!sidePanelCollapsed && viewMode !== 'focus' && (
              <div className="w-1/4 min-w-[200px] max-w-[400px] shrink-0 border-r border-border/60 bg-card/30">
                <SidePanel />
              </div>
            )}
            <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center bg-background/40">
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
          </div>
        ) : (
          <ResizablePanelGroup direction="horizontal" autoSaveId="omnimath-layout" className="flex-1 min-w-0">
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
                  <SidePanel />
                </ResizablePanel>
                <ResizableHandle withHandle className="data-[resize-handle-active]:bg-primary/60" />
              </>
            )}

            {/* Editor */}
            {editorVisible && (
              <ResizablePanel
                defaultSize={previewVisible ? 40 : 60}
                minSize={20}
                maxSize={70}
                id="editor-panel"
                order={2}
              >
                <EditorPanel />
              </ResizablePanel>
            )}

            {editorVisible && previewVisible && <ResizableHandle withHandle className="data-[resize-handle-active]:bg-primary/60" />}

            {/* Preview */}
            {previewVisible && (
              <ResizablePanel
                defaultSize={editorVisible ? 40 : 60}
                minSize={20}
                maxSize={70}
                id="preview-panel"
                order={3}
              >
                <PreviewPanel />
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
    </motion.div>
  );
}
