'use client';

/**
 * OmniMath Pro — History Panel
 *
 * Search box + scrollable list of calculation results (newest first).
 *  - Each card: input (mono), relative timestamp, output (mono) or matrix
 *    preview or "绘图" badge for plots.
 *  - Error results: red-tinted.
 *  - Click → reload input into editor (`setEditorContent`).
 *  - Hover → copy button.
 *  - Framer-motion staggered entrance.
 */

import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ClipboardCopy, History, Image as ImageIcon, AlertCircle, Search } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useWorkbenchStore } from '@/lib/store/workbench';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { CalculationResult } from '@/lib/store/workbench';

/* Relative-time formatter — pure, no external deps. */
function relativeTime(ts: number, locale: 'zh-CN' | 'en'): string {
  const delta = Math.max(0, Date.now() - ts);
  const sec = Math.floor(delta / 1000);
  if (sec < 45) return t('histJustNow');
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} ${t('histMinAgo')}`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} ${t('histHourAgo')}`;
  const day = Math.floor(hr / 24);
  return `${day} ${t('histDayAgo')}`;
}

export function HistoryPanel() {
  const results = useWorkbenchStore((s) => s.results);
  const clearHistory = useWorkbenchStore((s) => s.clearHistory);
  const setEditorContent = useWorkbenchStore((s) => s.setEditorContent);

  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    if (!query.trim()) return results;
    const q = query.toLowerCase();
    return results.filter(
      (r) =>
        r.input.toLowerCase().includes(q) ||
        r.output.toLowerCase().includes(q) ||
        (r.error ?? '').toLowerCase().includes(q),
    );
  }, [results, query]);

  const handleCopy = async (r: CalculationResult) => {
    try {
      await navigator.clipboard.writeText(r.output);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 px-3 pt-3 pb-2 border-b border-border/60">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <History className="size-3.5 text-primary" />
            <span className="text-[12.5px] font-semibold tracking-tight">
              {t('histTitle')}
            </span>
            {results.length > 0 && (
              <span className="text-[10px] text-muted-foreground bg-muted rounded-full px-1.5 py-0.5">
                {results.length}
              </span>
            )}
          </div>
          {results.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[11px] text-muted-foreground hover:text-destructive"
              onClick={clearHistory}
            >
              {t('histClear')}
            </Button>
          )}
        </div>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('commonSearch')}
            className="h-7 pl-7 pr-2 text-[12px] bg-muted/40 border-border/60"
          />
        </div>
      </div>

      {/* List */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-2 space-y-1.5">
          <AnimatePresence initial={false}>
            {filtered.length === 0 ? (
              <EmptyState query={query} />
            ) : (
              filtered.map((r, i) => (
                <motion.div
                  key={r.id}
                  layout
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ duration: 0.18, delay: Math.min(i * 0.018, 0.18) }}
                  onClick={() => setEditorContent(r.input)}
                  className={cn(
                    'group/hist-item interactive-card relative cursor-pointer rounded-md border p-2.5',
                    'bg-card/60 hover:bg-accent/40',
                    r.error
                      ? 'border-destructive/40 hover:border-destructive/60'
                      : 'border-border/60 hover:border-primary/40',
                  )}
                >
                  {/* Input */}
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <code
                      className="font-mono text-[12px] text-primary/90 truncate flex-1"
                      dir="ltr"
                    >
                      {r.input}
                    </code>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-[10px] text-muted-foreground/70 font-mono">
                        {relativeTime(r.timestamp, 'zh-CN')}
                      </span>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopy(r);
                            }}
                            className="opacity-0 group-hover/hist-item:opacity-100 transition-opacity p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
                            aria-label={t('histCopy')}
                          >
                            <ClipboardCopy className="size-3" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="left">{t('histCopy')}</TooltipContent>
                      </Tooltip>
                    </div>
                  </div>

                  {/* Output */}
                  <div className="flex items-start gap-2">
                    {r.error ? (
                      <div className="flex items-start gap-1.5 text-[12px] text-destructive">
                        <AlertCircle className="size-3.5 mt-0.5 shrink-0" />
                        <span className="font-mono break-all line-clamp-3">{r.error}</span>
                      </div>
                    ) : r.plotExpression ? (
                      <div className="flex items-center gap-1.5">
                        <span className="inline-flex items-center gap-1 text-[10.5px] font-medium text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-full px-2 py-0.5">
                          <ImageIcon className="size-3" />
                          {t('previewPlot')}
                        </span>
                        <code className="text-[11px] text-muted-foreground truncate font-mono">
                          {r.plotExpression}
                        </code>
                      </div>
                    ) : r.isMatrix ? (
                      <code className="font-mono text-[12px] text-foreground/80 truncate">
                        {r.matrix
                          ? `${r.matrix.length}×${r.matrix[0]?.length ?? 0} ${t('tabMatrix')}`
                          : r.output}
                      </code>
                    ) : (
                      <code className="font-mono text-[12px] text-foreground/85 break-all line-clamp-2">
                        {r.output}
                      </code>
                    )}
                  </div>
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </div>
      </ScrollArea>
    </div>
  );
}

function EmptyState({ query }: { query: string }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col items-center justify-center py-16 text-center px-6"
    >
      <motion.div
        animate={{ y: [0, -6, 0] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
        className="grid place-items-center size-14 rounded-2xl bg-primary/8 border border-primary/20 mb-3"
      >
        <History className="size-6 text-primary/70" />
      </motion.div>
      <p className="text-[12.5px] font-medium text-foreground/80 mb-1">
        {query ? t('cpNoResults') : t('histNoHistory')}
      </p>
      <p className="text-[11px] text-muted-foreground">{t('histNoHistoryHint')}</p>
    </motion.div>
  );
}
