'use client';

/**
 * OmniMath Pro — Status Bar
 *
 * VSCode-style bottom bar (h-6, glass) with teal accent stripe on the left.
 *  - Left: memory indicator (M: 42 with glow-pulse), branch / status
 *  - Center: line/col, mode indicator, var count, plot count
 *  - Right: theme indicator, language, ready status, sync icon
 *  - Quick calc input (compact, evaluates inline on Enter)
 */

import { useCallback, useState } from 'react';
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
} from 'lucide-react';
import { useWorkbenchStore } from '@/lib/store/workbench';
import { t, useLocale } from '@/lib/i18n';
import { evaluateExpression } from '@/lib/engine';
import { cn } from '@/lib/utils';

export function StatusBar() {
  const theme = useWorkbenchStore((s) => s.theme);
  const inputMode = useWorkbenchStore((s) => s.inputMode);
  const variables = useWorkbenchStore((s) => s.variables);
  const plots = useWorkbenchStore((s) => s.plots);
  const results = useWorkbenchStore((s) => s.results);
  const editorContent = useWorkbenchStore((s) => s.editorContent);
  const setCommandPaletteOpen = useWorkbenchStore((s) => s.setCommandPaletteOpen);
  const setGlobalCalcOpen = useWorkbenchStore((s) => s.setGlobalCalcOpen);

  const locale = useLocale();

  const [quickCalc, setQuickCalc] = useState('');
  const [quickResult, setQuickResult] = useState<string | null>(null);
  const [quickError, setQuickError] = useState<string | null>(null);
  const [calcLoading, setCalcLoading] = useState(false);

  const lineCount = editorContent.split('\n').length;
  const varCount = Object.keys(variables).length;
  const plotCount = plots.length;

  const runQuickCalc = useCallback(() => {
    if (!quickCalc.trim()) return;
    setCalcLoading(true);
    setTimeout(() => {
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
    </footer>
  );
}
