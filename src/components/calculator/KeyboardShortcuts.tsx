'use client';

import React, { useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useCalculatorStore } from '@/lib/calculator/store';
import { t } from '@/lib/calculator/i18n';
import { Keyboard } from 'lucide-react';

import type { Translations } from '@/lib/calculator/i18n';

interface ShortcutGroup {
  titleKey: 'ksEditor' | 'ksNavigation' | 'ksQuickActions';
  shortcuts: { keys: string; descKey: keyof Translations }[];
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    titleKey: 'ksEditor',
    shortcuts: [
      { keys: 'Enter', descKey: 'ksEvalExpression' },
      { keys: 'Shift + Enter', descKey: 'ksInsertNewLine' },
      { keys: 'Tab', descKey: 'ksInsertIndent' },
      { keys: 'Ctrl + /', descKey: 'ksToggleComment' },
    ],
  },
  {
    titleKey: 'ksNavigation',
    shortcuts: [
      { keys: 'Ctrl + Shift + P', descKey: 'ksOpenCommandPalette' },
      { keys: 'Ctrl + K', descKey: 'ksOpenCommandPaletteQuick' },
      { keys: 'Ctrl + B', descKey: 'ksToggleSidebar' },
      { keys: '?', descKey: 'ksShowShortcuts' },
      { keys: 'Esc', descKey: 'ksCloseDialog' },
    ],
  },
  {
    titleKey: 'ksQuickActions',
    shortcuts: [
      { keys: 'Click formula', descKey: 'ksCopyRenderedText' },
      { keys: 'Click history', descKey: 'ksLoadIntoEditor' },
      { keys: 'Click symbol', descKey: 'ksInsertAtCursor' },
      { keys: 'Scroll on plot', descKey: 'ksZoomInOut' },
      { keys: 'Drag on plot', descKey: 'ksPanView' },
    ],
  },
];

export function KeyboardShortcuts() {
  const { theme } = useCalculatorStore();
  const [open, setOpen] = React.useState(false);
  const isDark = theme === 'dark';

  // Listen for ? key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Only trigger when not typing in an input/textarea
      const target = e.target as HTMLElement;
      const isTyping = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

      if (e.key === '?' && !isTyping && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className={`max-w-2xl ${isDark ? 'bg-[#252526] border-[#3c3c3c]' : 'bg-white border-[#e0e0e0]'}`}>
        <DialogHeader>
          <DialogTitle className={`flex items-center gap-2 text-lg ${isDark ? 'text-[#cccccc]' : 'text-[#333]'}`}>
            <Keyboard className={`h-5 w-5 ${isDark ? 'text-[#4fc3f7]' : 'text-[#007acc]'}`} />
            {t('ksTitle')}
          </DialogTitle>
          <DialogDescription className={isDark ? 'text-[#858585]' : 'text-[#666]'}>
            {t('ksPressToShow')}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
          {SHORTCUT_GROUPS.map(group => (
            <div key={group.titleKey}>
              <h3 className={`text-[11px] uppercase tracking-wider font-semibold mb-2 ${
                isDark ? 'text-[#858585]' : 'text-[#888]'
              }`}>
                {t(group.titleKey)}
              </h3>
              <div className="space-y-1.5">
                {group.shortcuts.map((sc, i) => (
                  <div key={i} className="flex items-center justify-between gap-2">
                    <span className={`text-[12px] ${isDark ? 'text-[#cccccc]' : 'text-[#333]'}`}>
                      {t(sc.descKey as keyof Translations)}
                    </span>
                    <kbd className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-medium border ${
                      isDark
                        ? 'bg-[#2d2d2d] border-[#3c3c3c] text-[#9cdcfe]'
                        : 'bg-[#f5f5f5] border-[#e0e0e0] text-[#007acc]'
                    }`}>
                      {sc.keys}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className={`mt-4 pt-3 border-t text-[11px] ${isDark ? 'border-[#3c3c3c] text-[#5a5a5a]' : 'border-[#e0e0e0] text-[#999]'}`}>
          <kbd className={`px-1 py-0.5 rounded font-mono border ${
            isDark ? 'bg-[#2d2d2d] border-[#3c3c3c]' : 'bg-[#f5f5f5] border-[#e0e0e0]'
          }`}>?</kbd> {t('ksPressToShow')}
        </div>
      </DialogContent>
    </Dialog>
  );
}
