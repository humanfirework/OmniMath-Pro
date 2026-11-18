'use client';

/**
 * OmniMath Pro — Status Bar
 *
 * Deliberately quiet: one line, no duplicated controls. Quick calculation
 * lives in the command palette / floating calculator instead of eating half
 * of the status bar.
 */

import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertTriangle,
  CheckCircle2,
  Command as CommandIcon,
  Languages,
  Moon,
  Sigma,
  Sun,
  X,
} from 'lucide-react';
import { useWorkbenchStore } from '@/lib/store/workbench';
import { t, useLocale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import {
  detectConflicts,
  summarizeConflicts,
  type Conflict,
} from '@/lib/conflictDetector';

export function StatusBar() {
  const theme = useWorkbenchStore((s) => s.theme);
  const inputMode = useWorkbenchStore((s) => s.inputMode);
  const variables = useWorkbenchStore((s) => s.variables);
  const plots = useWorkbenchStore((s) => s.plots);
  const editorContent = useWorkbenchStore((s) => s.editorContent);
  const setCommandPaletteOpen = useWorkbenchStore((s) => s.setCommandPaletteOpen);

  // Subscribe to everything the conflict detector inspects.
  const editorVisible = useWorkbenchStore((s) => s.editorVisible);
  const previewVisible = useWorkbenchStore((s) => s.previewVisible);
  const viewMode = useWorkbenchStore((s) => s.viewMode);
  const activePreviewTab = useWorkbenchStore((s) => s.activePreviewTab);
  const activityBarHidden = useWorkbenchStore((s) => s.activityBarHidden);
  const activityBarLocked = useWorkbenchStore((s) => s.activityBarLocked);
  const activityBarAutoHide = useWorkbenchStore((s) => s.activityBarAutoHide);
  const resultsLength = useWorkbenchStore((s) => s.results.length);

  const locale = useLocale();

  const conflicts = useMemo<Conflict[]>(
    () => detectConflicts(),
    [
      editorVisible,
      previewVisible,
      viewMode,
      activePreviewTab,
      activityBarHidden,
      activityBarLocked,
      activityBarAutoHide,
      resultsLength,
    ],
  );
  const summary = useMemo(() => summarizeConflicts(conflicts), [conflicts]);
  const [conflictPanelOpen, setConflictPanelOpen] = useState(false);

  const lineCount = editorContent.split('\n').length;
  const varCount = Object.keys(variables).length;
  const plotCount = plots.length;

  return (
    <footer
      className={cn(
        'relative shrink-0 h-6 flex items-center justify-between gap-2 px-2',
        'glass border-t border-border text-[10.5px] font-mono',
        'select-none',
      )}
    >
      <div
        aria-hidden
        className="absolute left-0 top-0 bottom-0 w-0.5 bg-primary"
        style={{ boxShadow: '0 0 6px oklch(0.7 0.15 165 / 60%)' }}
      />

      {/* Left: command palette + ready */}
      <div className="flex items-center gap-2 pl-1.5">
        <button
          type="button"
          onClick={() => setCommandPaletteOpen(true)}
          className="flex items-center gap-1 text-muted-foreground transition-colors hover:text-foreground"
        >
          <CommandIcon className="size-3" />
          <span className="hidden md:inline">{t('menuCommandPalette')}</span>
        </button>
        <span className="text-border hidden sm:inline">|</span>
        <span className="flex items-center gap-1 text-emerald-500">
          <span className="size-1.5 rounded-full bg-emerald-500" />
          <span className="hidden sm:inline">{t('statusReady')}</span>
        </span>
      </div>

      {/* Center: editor summary */}
      <div className="hidden flex-1 items-center justify-center gap-1.5 text-muted-foreground sm:flex">
        <span>{lineCount} {t('editorLines')}</span>
        <span className="text-border/60">·</span>
        <span className="flex items-center gap-1">
          <Sigma className="size-2.5 text-primary" />
          {inputMode}
        </span>
      </div>

      {/* Right: data + preferences */}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setConflictPanelOpen((v) => !v)}
          aria-label={t('statusConflictTooltip')}
          title={
            summary.total === 0
              ? t('statusNoConflicts')
              : `${t('statusConflictTooltip')}: ${summary.total}`
          }
          className={cn(
            'grid size-4 place-items-center rounded transition-colors',
            summary.hasActionable
              ? 'text-amber-500 hover:bg-amber-500/10'
              : 'text-muted-foreground/60 hover:text-foreground',
          )}
        >
          {summary.hasActionable ? (
            <AlertTriangle className="size-2.5" />
          ) : (
            <CheckCircle2 className="size-2.5" />
          )}
        </button>

        <span className="hidden px-1.5 text-muted-foreground sm:inline">
          {varCount} {t('statusVars')} · {plotCount} {t('statusPlots')}
        </span>

        <span className="flex items-center gap-1.5 px-1.5 text-muted-foreground">
          {theme === 'dark' ? <Moon className="size-2.5" /> : <Sun className="size-2.5 text-amber-500" />}
          <span className="hidden sm:flex items-center gap-1">
            <Languages className="size-2.5" />
            {locale === 'zh-CN' ? '中' : 'EN'}
          </span>
        </span>
      </div>

      {/* Conflict detail popover */}
      <AnimatePresence>
        {conflictPanelOpen && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.14 }}
            className="absolute bottom-7 right-2 z-50 max-h-[60vh] w-80 overflow-auto rounded-md border border-border bg-popover text-popover-foreground shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold">
                <AlertTriangle className="size-3.5 text-amber-500" />
                {t('statusConflictTooltip')}
                <span className="font-normal text-muted-foreground">({summary.total})</span>
              </div>
              <button
                type="button"
                onClick={() => setConflictPanelOpen(false)}
                className="text-muted-foreground hover:text-foreground"
                aria-label="close"
              >
                <X className="size-3" />
              </button>
            </div>

            {conflicts.length === 0 ? (
              <div className="flex items-center gap-2 px-3 py-4 text-xs text-emerald-500">
                <CheckCircle2 className="size-3.5" />
                {t('statusNoConflicts')}
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {conflicts.map((c) => (
                  <li key={c.id} className="px-3 py-2">
                    <div className="flex items-start gap-2">
                      <span
                        className={cn(
                          'mt-0.5 size-1.5 shrink-0 rounded-full',
                          c.severity === 'error' && 'bg-destructive',
                          c.severity === 'warning' && 'bg-amber-500',
                          c.severity === 'info' && 'bg-sky-500',
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium">{c.title}</div>
                        <div className="mt-0.5 text-[10.5px] text-muted-foreground">
                          {c.description}
                        </div>
                        {c.fix && c.fixLabel && (
                          <button
                            type="button"
                            onClick={() => c.fix?.()}
                            className="mt-1 text-[10.5px] text-primary hover:underline"
                          >
                            {c.fixLabel}
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </footer>
  );
}
