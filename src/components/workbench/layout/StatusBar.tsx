'use client';

/**
 * OmniMath Pro — Status Bar
 *
 * VSCode-style bottom bar (h-6, glass) with teal accent stripe on the left.
 *  - Left: memory indicator (M: 42 with glow-pulse), branch / status
 *  - Center: line/col, mode indicator, var count, plot count
 *  - Right: theme indicator, language, ready status, sync icon
 *  - Quick calc input (compact, evaluates inline on Enter)
 *  - Conflict detector badge ( Phase 8 )：显示跨 store 冲突数与一键修复入口
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Check,
  Loader2,
  Command as CommandIcon,
  Sun,
  Moon,
  Languages,
  Sigma,
  Activity,
  AlertTriangle,
  CheckCircle2,
  X,
} from 'lucide-react';
import { useWorkbenchStore } from '@/lib/store/workbench';
import { t, useLocale } from '@/lib/i18n';
import { evaluateExpression } from '@/lib/engine';
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
  const results = useWorkbenchStore((s) => s.results);
  const editorContent = useWorkbenchStore((s) => s.editorContent);
  const setCommandPaletteOpen = useWorkbenchStore((s) => s.setCommandPaletteOpen);
  const setGlobalCalcOpen = useWorkbenchStore((s) => s.setGlobalCalcOpen);

  // 订阅所有可能影响冲突的状态，使 detectConflicts 在状态变化时重算
  const editorVisible = useWorkbenchStore((s) => s.editorVisible);
  const previewVisible = useWorkbenchStore((s) => s.previewVisible);
  const viewMode = useWorkbenchStore((s) => s.viewMode);
  const activePreviewTab = useWorkbenchStore((s) => s.activePreviewTab);
  const activityBarHidden = useWorkbenchStore((s) => s.activityBarHidden);
  const activityBarLocked = useWorkbenchStore((s) => s.activityBarLocked);
  const activityBarAutoHide = useWorkbenchStore((s) => s.activityBarAutoHide);

  const locale = useLocale();

  // 冲突检测：依赖上述订阅的状态，每次状态变更都会重算
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
      results.length,
    ],
  );
  const summary = useMemo(() => summarizeConflicts(conflicts), [conflicts]);
  const [conflictPanelOpen, setConflictPanelOpen] = useState(false);

  const [quickCalc, setQuickCalc] = useState('');
  const [quickResult, setQuickResult] = useState<string | null>(null);
  const [quickError, setQuickError] = useState<string | null>(null);
  const [calcLoading, setCalcLoading] = useState(false);

  const lineCount = editorContent.split('\n').length;
  const varCount = Object.keys(variables).length;
  const plotCount = plots.length;

  const calcTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const runQuickCalc = useCallback(() => {
    if (!quickCalc.trim()) return;
    setCalcLoading(true);
    clearTimeout(calcTimerRef.current);
    calcTimerRef.current = setTimeout(() => {
      try {
        const r = evaluateExpression(quickCalc, inputMode);
        if (r.success) {
          setQuickResult(r.result);
          setQuickError(null);
        } else {
          setQuickResult(null);
          setQuickError(r.error ?? 'Error');
        }
      } catch (err) {
        setQuickResult(null);
        setQuickError((err as Error).message);
      } finally {
        setCalcLoading(false);
      }
    }, 40);
  }, [quickCalc, inputMode]);

  return (
    <footer
      className={cn(
        'relative shrink-0 h-6 flex items-center justify-between gap-2 px-2',
        'glass border-t border-border text-[10.5px] font-mono',
        'select-none',
      )}
    >
      {/* teal accent stripe */}
      <div
        aria-hidden
        className="absolute left-0 top-0 bottom-0 w-0.5 bg-primary"
        style={{ boxShadow: '0 0 6px oklch(0.7 0.15 165 / 60%)' }}
      />

      {/* Left */}
      <div className="flex items-center gap-2 pl-1.5">
        <button
          type="button"
          onClick={() => setCommandPaletteOpen(true)}
          className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
        >
          <CommandIcon className="size-3" />
          <span className="hidden sm:inline">{t('menuCommandPalette')}</span>
        </button>
        <span className="text-border hidden sm:inline">|</span>
        <span className="flex items-center gap-1 text-emerald-500">
          <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="hidden sm:inline">{t('statusReady')}</span>
        </span>

        {/* Memory indicator */}
        {results.length > 0 && (
          <span className="hidden md:flex items-center gap-1 text-amber-500">
            <span className="size-1.5 rounded-full bg-amber-500" />
            M: {results.length}
          </span>
        )}
      </div>

      {/* Center — quick calc */}
      <div className="flex-1 max-w-[340px] flex items-center gap-1.5">
        <div className="relative flex-1 flex items-center">
          <input
            type="text"
            value={quickCalc}
            onChange={(e) => setQuickCalc(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') runQuickCalc();
              if (e.key === 'Escape') {
                setQuickCalc('');
                setQuickResult(null);
                setQuickError(null);
              }
            }}
            placeholder={t('qcPlaceholder')}
            className={cn(
              'h-4 w-full px-1.5 text-[10.5px] font-mono bg-muted/40 border border-border/60 rounded',
              'placeholder:text-muted-foreground/60',
              'focus:bg-background focus:border-primary/50 outline-none transition-colors',
            )}
            aria-label={t('statusCalc')}
          />
          {calcLoading && (
            <Loader2 className="absolute right-1 size-2.5 animate-spin text-primary" />
          )}
        </div>
        <AnimatePresence>
          {quickResult && (
            <motion.span
              key="qr"
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-1 text-emerald-500 text-[10.5px] truncate max-w-[120px]"
            >
              <Check className="size-2.5 shrink-0" />
              <span className="truncate">{quickResult}</span>
            </motion.span>
          )}
          {quickError && (
            <motion.span
              key="qe"
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              className="text-destructive text-[10.5px] truncate max-w-[120px]"
            >
              {quickError}
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {/* Right */}
      <div className="flex items-center gap-2">
        {/* Conflict detector badge (Phase 8) */}
        <button
          type="button"
          onClick={() => setConflictPanelOpen((v) => !v)}
          aria-label={t('statusConflictTooltip')}
          className={cn(
            'relative flex items-center gap-1 px-1.5 h-4 rounded text-[10px] transition-colors',
            summary.hasActionable
              ? 'text-amber-500 bg-amber-500/10 hover:bg-amber-500/20'
              : summary.total > 0
                ? 'text-muted-foreground hover:text-foreground'
                : 'text-emerald-500 hover:text-emerald-400',
          )}
          title={
            summary.total === 0
              ? t('statusNoConflicts')
              : `${t('statusConflictTooltip')}: ${summary.total}`
          }
        >
          {summary.hasActionable ? (
            <AlertTriangle className="size-2.5" />
          ) : (
            <CheckCircle2 className="size-2.5" />
          )}
          <span className="hidden sm:inline">
            {summary.total === 0
              ? t('statusNoConflicts')
              : `${summary.total} ${t('statusConflicts')}`}
          </span>
        </button>
        <span className="text-border hidden sm:inline">|</span>
        <span className="hidden md:flex items-center gap-1 text-muted-foreground">
          <Activity className="size-2.5" />
          {lineCount} {t('editorLines')}
        </span>
        <span className="text-border hidden md:inline">|</span>
        <span className="hidden sm:flex items-center gap-1 text-muted-foreground">
          <Sigma className="size-2.5 text-primary" />
          {inputMode}
        </span>
        <span className="text-border hidden sm:inline">|</span>
        <span className="text-muted-foreground">
          {varCount} {t('statusVars')}
        </span>
        <span className="text-border hidden sm:inline">|</span>
        <span className="hidden sm:inline text-muted-foreground">
          {plotCount} {t('statusPlots')}
        </span>
        <span className="text-border">|</span>
        <span className="flex items-center gap-1 text-muted-foreground">
          {theme === 'dark' ? <Moon className="size-2.5" /> : <Sun className="size-2.5 text-amber-500" />}
          <span className="hidden sm:inline">
            {theme === 'dark' ? t('statusDark') : t('statusLight')}
          </span>
        </span>
        <span className="text-border hidden sm:inline">|</span>
        <span className="hidden sm:flex items-center gap-1 text-muted-foreground">
          <Languages className="size-2.5" />
          {locale === 'zh-CN' ? '中' : 'EN'}
        </span>
      </div>

      {/* Conflict detail popover (Phase 8) */}
      <AnimatePresence>
        {conflictPanelOpen && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.14 }}
            className="absolute bottom-7 right-2 z-50 w-80 max-h-[60vh] overflow-auto rounded-md border border-border bg-popover text-popover-foreground shadow-xl"
          >
            <div className="flex items-center justify-between px-3 py-2 border-b border-border">
              <div className="flex items-center gap-1.5 text-xs font-semibold">
                <AlertTriangle className="size-3.5 text-amber-500" />
                {t('statusConflictTooltip')}
                <span className="text-muted-foreground font-normal">
                  ({summary.total})
                </span>
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
                          'mt-0.5 shrink-0 size-1.5 rounded-full',
                          c.severity === 'error' && 'bg-destructive',
                          c.severity === 'warning' && 'bg-amber-500',
                          c.severity === 'info' && 'bg-sky-500',
                        )}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium">{c.title}</div>
                        <div className="text-[10.5px] text-muted-foreground mt-0.5">
                          {c.description}
                        </div>
                        {c.fix && c.fixLabel && (
                          <button
                            type="button"
                            onClick={() => {
                              c.fix?.();
                            }}
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
