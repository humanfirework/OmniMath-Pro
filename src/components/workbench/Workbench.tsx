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
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable';
import { useWorkbenchStore } from '@/lib/store/workbench';
import { setLocale as setI18nLocale, getLocale } from '@/lib/i18n';
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
    setI18nLocale(locale);
  }, [locale]);

  // Apply theme class to <html> whenever it changes.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (theme === 'dark') document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [theme]);

  // Sync i18n locale when store locale changes.
  useEffect(() => {
    if (getLocale() !== locale) setI18nLocale(locale);
  }, [locale]);

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
        <ActivityBar />

        {viewMode === 'pipeline' ? (
          /* Pipeline view takes over the main area (Task 6). */
          <div className="flex-1 min-w-0 min-h-0">
            <NodePipeline />
          </div>
        ) : (
          <ResizablePanelGroup direction="horizontal" className="flex-1 min-w-0">
            {/* Side panel — collapsible */}
            {!sidePanelCollapsed && (
              <>
                <ResizablePanel
                  defaultSize={20}
                  minSize={15}
                  maxSize={35}
                  id="side-panel"
                  order={1}
                >
                  <SidePanel />
                </ResizablePanel>
                <ResizableHandle />
              </>
            )}

            {/* Editor */}
            <ResizablePanel
              defaultSize={viewMode === 'pipeline' ? 0 : 40}
              minSize={25}
              id="editor-panel"
              order={2}
            >
              <EditorPanel />
            </ResizablePanel>

            <ResizableHandle />

            {/* Preview */}
            <ResizablePanel
              defaultSize={40}
              minSize={25}
              id="preview-panel"
              order={3}
            >
              <PreviewPanel />
            </ResizablePanel>
          </ResizablePanelGroup>
        )}
      </div>

      <StatusBar />

      {/* Overlays */}
      <CommandPalette />
      <GlobalCalcBar />
    </motion.div>
  );
}
