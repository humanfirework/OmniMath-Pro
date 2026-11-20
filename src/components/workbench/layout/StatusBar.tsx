'use client';

/**
 * OmniMath Pro — Status Bar
 *
 * Deliberately quiet: one line, no duplicated controls. Quick calculation
 * lives in the command palette / floating calculator instead of eating half
 * of the status bar.
 */

import { useEffect, useMemo, useState } from 'react';
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

  // 运行状态由 EditorPanel 通过 `omnimath:run-state` 广播驱动，
  // 不新增持久化字段；默认就绪，直到下一次运行 / 编辑器被清空。
  type RunState = 'idle' | 'running' | 'success' | 'error';
  const [runState, setRunState] = useState<RunState>('idle');
  useEffect(() => {
    const handler = (e: Event) => {
      const next = (e as CustomEvent<{ state?: unknown }>).detail?.state;
      if (next === 'idle' || next === 'running' || next === 'success' || next === 'error') {
        setRunState(next);
      }
    };
    window.addEventListener('omnimath:run-state', handler);
    return () => window.removeEventListener('omnimath:run-state', handler);
  }, []);

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
  // 编辑器隐藏时（白板 / 蓝图 / 专注模式）不再显示行数与输入模式，
  // 否则底部会挂着与当前画布无关的「9 行 · simple」。
  const showEditorSummary = editorVisible && viewMode !== 'focus' && viewMode !== 'home';

  // 运行状态标签 / 指示点：idle=就绪、running=运行中、success=完成、error=失败。
  const runLabel =
    runState === 'running'
      ? t('statusCalculating')
      : runState === 'success'
        ? '运行完成'
        : runState === 'error'
          ? '运行失败'
          : t('statusReady');
  const runDot =
    runState === 'error'
      ? 'bg-destructive'
      : runState === 'success'
        ? 'bg-[var(--success)]'
        : 'bg-primary';

  return (
    <footer
      className={cn(
        'relative shrink-0 h-6 flex items-center justify-between gap-2 px-2',
        'bg-background border-t border-border text-[10.5px] font-mono',
        'select-none',
      )}
    >
      {/* Left: command palette + run state */}
      <div className="flex items-center gap-2 pl-1.5">
        <button
          type="button"
          onClick={() => setCommandPaletteOpen(true)}
          className="flex items-center gap-1 text-muted-foreground transition-colors hover:text-primary"
        >
          <CommandIcon className="size-3.5" strokeWidth={1.75} />
          <span className="hidden md:inline">{t('menuCommandPalette')}</span>
          <kbd className="hidden rounded border border-border bg-muted/50 px-1 py-px text-[9px] leading-none text-muted-foreground/80 lg:inline">
            Ctrl K
          </kbd>
        </button>
        <span aria-hidden className="hidden h-3 w-px bg-border sm:inline-block" />
        <span
          className="flex items-center gap-1 text-muted-foreground"
          title={runLabel}
          aria-live="polite"
        >
          <span className={cn('size-1.5 rounded-full', runDot)} />
          <span className="hidden sm:inline">{runLabel}</span>
        </span>
      </div>

      {/* Center: editor summary（仅编辑器可见时） */}
      {showEditorSummary && (
        <div className="hidden flex-1 items-center justify-center gap-1.5 text-muted-foreground sm:flex">
          <span>{lineCount} {t('editorLines')}</span>
          <span className="text-border/60">·</span>
          <span className="flex items-center gap-1">
            <Sigma className="size-3.5 text-muted-foreground" strokeWidth={1.75} />
            {inputMode}
          </span>
        </div>
      )}

      {/* Right: vars / plots → conflicts → theme → language */}
      <div className="flex items-center gap-1.5">
        <span className="hidden px-1 text-muted-foreground sm:inline">
          {varCount} {t('statusVars')} · {plotCount} {t('statusPlots')}
        </span>

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
            <AlertTriangle className="size-3.5" strokeWidth={1.75} />
          ) : (
            <CheckCircle2 className="size-3.5" strokeWidth={1.75} />
          )}
        </button>

        <span className="flex items-center gap-1 px-1 text-muted-foreground">
          {theme === 'dark' ? (
            <Moon className="size-3.5" strokeWidth={1.75} />
          ) : (
            <Sun className="size-3.5" strokeWidth={1.75} />
          )}
        </span>
        <span className="hidden items-center gap-1 pr-1 text-muted-foreground sm:flex">
          <Languages className="size-3.5" strokeWidth={1.75} />
          {locale === 'zh-CN' ? '中' : 'EN'}
        </span>
      </div>

      {/* Conflict detail popover — L3 浮层：不透明表面 + 阴影 */}
      <AnimatePresence>
        {conflictPanelOpen && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.14 }}
            className="surface-floating absolute bottom-7 right-2 z-50 max-h-[60vh] w-80 overflow-auto text-popover-foreground"
          >
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold">
                <AlertTriangle className="size-3.5 text-amber-500" strokeWidth={1.75} />
                {t('statusConflictTooltip')}
                <span className="font-normal text-muted-foreground">({summary.total})</span>
              </div>
              <button
                type="button"
                onClick={() => setConflictPanelOpen(false)}
                className="text-muted-foreground hover:text-foreground"
                aria-label="close"
              >
                <X className="size-3.5" strokeWidth={1.75} />
              </button>
            </div>

            {conflicts.length === 0 ? (
              <div className="flex items-center gap-2 px-3 py-4 text-xs text-muted-foreground">
                <CheckCircle2 className="size-3.5" strokeWidth={1.75} />
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
