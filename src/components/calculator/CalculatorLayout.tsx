'use client';

import React, { useEffect } from 'react';
import { useCalculatorStore } from '@/lib/calculator/store';
import { ActivityBar } from './ActivityBar';
import { SidePanel } from './SidePanel';
import { EditorPanel } from './EditorPanel';
import { PreviewPanel } from './PreviewPanel';
import { StatusBar } from './StatusBar';
import { CommandPalette } from './CommandPalette';
import { KeyboardShortcuts } from './KeyboardShortcuts';
import { MobileLayout } from './MobileLayout';
import { useIsMobile } from '@/hooks/use-mobile';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { t, setLocale } from '@/lib/calculator/i18n';

export function CalculatorLayout() {
  const { theme, previewVisible, activeSidePanel, sidePanelCollapsed, loadFromStorage, locale } = useCalculatorStore();
  const isMobile = useIsMobile();

  // Apply theme class to document
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  // Initialize i18n locale on mount
  useEffect(() => {
    setLocale(locale);
  }, [locale]);

  // Load persisted state on mount
  useEffect(() => {
    loadFromStorage();
  }, [loadFromStorage]);

  // Mobile layout
  if (isMobile) {
    return (
      <>
        <MobileLayout />
        <CommandPalette />
      </>
    );
  }

  return (
    <div className={`h-screen w-screen flex flex-col overflow-hidden ${
      theme === 'dark' ? 'bg-[#1e1e1e] text-[#cccccc]' : 'bg-white text-[#333]'
    }`}>
      {/* Title bar */}
      <div className={`flex items-center h-9 px-4 select-none flex-shrink-0 relative overflow-hidden ${
        theme === 'dark' ? 'bg-[#323233] border-b border-[#252526]' : 'bg-[#f3f3f3] border-b border-[#e0e0e0]'
      }`}>
        {/* Subtle gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-r from-[#007acc]/5 via-transparent to-[#007acc]/5 pointer-events-none" />
        <div className="flex items-center gap-2 relative">
          <div className="relative">
            <svg className="h-4 w-4 text-[#007acc] drop-shadow-[0_0_4px_rgba(0,122,204,0.5)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 7V4H6l6 8-6 8h12v-3" />
            </svg>
          </div>
          <span className={`text-[12px] font-medium tracking-wide ${
            theme === 'dark' ? 'text-[#cccccc]' : 'text-[#333]'
          }`}>
            OmniMath
          </span>
          <span className={`text-[11px] hidden sm:inline ${
            theme === 'dark' ? 'text-[#858585]' : 'text-[#999]'
          }`}>
            {t('appSubtitle')}
          </span>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <button className={`px-2 py-0.5 text-[11px] rounded hover:bg-[#ffffff1a] ${
            theme === 'dark' ? 'text-[#cccccc]' : 'text-[#333]'
          }`}>
            {t('menuFile')}
          </button>
          <button className={`px-2 py-0.5 text-[11px] rounded hover:bg-[#ffffff1a] ${
            theme === 'dark' ? 'text-[#cccccc]' : 'text-[#333]'
          }`}>
            {t('menuEdit')}
          </button>
          <button className={`px-2 py-0.5 text-[11px] rounded hover:bg-[#ffffff1a] ${
            theme === 'dark' ? 'text-[#cccccc]' : 'text-[#333]'
          }`}>
            {t('menuView')}
          </button>
          <button className={`px-2 py-0.5 text-[11px] rounded hover:bg-[#ffffff1a] ${
            theme === 'dark' ? 'text-[#cccccc]' : 'text-[#333]'
          }`}>
            {t('menuHelp')}
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex min-h-0">
        {/* Activity bar */}
        <ActivityBar />

        {/* Side panel (fixed width, not resizable) */}
        <SidePanel />

        {/* Editor + Preview (resizable) */}
        <ResizablePanelGroup direction="horizontal" className="flex-1">
          <ResizablePanel defaultSize={previewVisible ? 55 : 100} minSize={30}>
            <EditorPanel />
          </ResizablePanel>

          {previewVisible && (
            <>
              <ResizableHandle withHandle className={theme === 'dark' ? 'bg-[#3c3c3c]' : 'bg-[#e0e0e0]'} />
              <ResizablePanel defaultSize={45} minSize={25}>
                <PreviewPanel />
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      </div>

      {/* Status bar */}
      <StatusBar />

      {/* Command palette overlay */}
      <CommandPalette />

      {/* Keyboard shortcuts overlay */}
      <KeyboardShortcuts />
    </div>
  );
}
