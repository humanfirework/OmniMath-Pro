'use client';

/**
 * OmniMath Pro — History Panel (sticky-note style)
 *
 * Each result is rendered as a compact sticky-note card:
 *  - Collapsed: one-line preview (input + truncated output) so the list stays
 *    scannable and the panel never feels crowded.
 *  - Expanded: full input, formatted output/LaTeX, type badge, timestamp and
 *    actions (copy / load into editor / delete).
 *  - Smooth but lightweight animations: simple opacity/translate/scale
 *    transitions, no expensive layout re-measurement on every list update.
 */

import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ClipboardCopy,
  History,
  Image as ImageIcon,
  AlertCircle,
  Search,
  ChevronDown,
  Trash2,
  CornerDownLeft,
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useWorkbenchStore } from '@/lib/store/workbench';
import { t, useLocale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { CalculationResult } from '@/lib/store/workbench';
import { FormulaRenderer } from '@/components/workbench/FormulaRenderer';

/* Relative-time formatter — pure, no external deps. */
function relativeTime(ts: number): string {
  const delta = Math.max(0, Date.now() - ts);
  const sec = Math.floor(delta / 1000);
  if (sec < 45) return t('histJustNow');
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} ${t('histMinAgo')}`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} ${t('histHourAgo')}`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} ${t('histDayAgo')}`;
  return new Date(ts).toLocaleDateString();
}

function formatPreviewOutput(result: CalculationResult): string {
  if (result.error) return result.error;
  if (result.plotType) return `[${t('histPlot')}] ${result.plotExpression ?? result.input}`;
  if (result.isMatrix && result.matrix) {
    return `[${result.matrix.length}×${result.matrix[0]?.length ?? 0}]`;
  }
  return result.output ?? '';
}

function copyToClipboard(text: string) {
  if (!text) return;
  navigator.clipboard.writeText(text).catch(() => {});
}

interface HistoryCardProps {
  result: CalculationResult;
  onLoad: (input: string) => void;
  onDelete: (id: string) => void;
}

function HistoryCard({ result, onLoad, onDelete }: HistoryCardProps) {
  const [expanded, setExpanded] = useState(false);
  const isError = Boolean(result.error);
  const isPlot = Boolean(result.plotType);
  const preview = formatPreviewOutput(result);

  return (
    <motion.div
      layout={false}
      initial={{ opacity: 0, y: -8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 24, scale: 0.96 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className={cn(
        'group relative rounded-xl border p-3 shadow-sm transition-shadow',
        'bg-card/80 hover:shadow-md hover:bg-card',
        isError
          ? 'border-destructive/30'
          : isPlot
            ? 'border-primary/30'
            : 'border-border/70',
        'before:absolute before:left-0 before:top-2 before:bottom-2 before:w-[3px] before:rounded-full',
        isError
          ? 'before:bg-destructive/60'
          : isPlot
            ? 'before:bg-primary/60'
            : 'before:bg-emerald-500/60'
      )}
    >
      {/* Collapsed header — always visible */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full text-left focus:outline-none"
        aria-expanded={expanded}
      >
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              {isError && <AlertCircle className="size-3.5 text-destructive shrink-0" />}
              {isPlot && <ImageIcon className="size-3.5 text-primary shrink-0" />}
              <span className="font-mono text-[12px] text-foreground/90 truncate">
                {result.input}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
              <span className="truncate max-w-[70%] font-mono">
                {preview}
              </span>
              <span className="shrink-0">·</span>
              <span className="shrink-0">{relativeTime(result.timestamp)}</span>
            </div>
          </div>
          <motion.div
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            className="shrink-0 mt-0.5 text-muted-foreground"
          >
            <ChevronDown className="size-4" />
          </motion.div>
        </div>
      </button>

      {/* Expanded body */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="pt-3 mt-2 border-t border-border/50 space-y-3">
              {/* Input */}
              <div className="space-y-1">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 flex items-center gap-1">
                  <span className="size-1.5 rounded-full bg-amber-500/70" />
                  {t('previewInput')}
                </div>
                <code className="block font-mono text-[12px] text-foreground/90 break-all bg-muted/40 rounded-md px-2 py-1.5">
                  {result.input}
                </code>
              </div>

              {/* Output */}
              <div className="space-y-1">
                <div className={cn(
                  'text-[10px] uppercase tracking-wider flex items-center gap-1',
                  isError ? 'text-destructive/80' : 'text-muted-foreground/70'
                )}>
                  {isError ? (
                    <AlertCircle className="size-3" />
                  ) : (
                    <span className="size-1.5 rounded-full bg-emerald-500/70" />
                  )}
                  {isError ? t('previewError') : t('previewResult')}
                </div>
                {result.latex && !isError ? (
                  <div className="bg-muted/40 rounded-md px-2 py-1.5">
                    <FormulaRenderer
                      latex={result.latex}
                      displayMode
                      className="text-[13px]"
                    />
                  </div>
                ) : (
                  <code className={cn(
                    'block font-mono text-[12px] break-all rounded-md px-2 py-1.5',
                    isError
                      ? 'bg-destructive/10 text-destructive'
                      : 'bg-muted/40 text-foreground/90'
                  )}>
                    {isError ? result.error : result.output}
                  </code>
                )}
              </div>

              {/* Footer: meta + actions */}
              <div className="flex items-center justify-between gap-2 pt-1">
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded border border-border/60 bg-muted/40 font-mono uppercase tracking-wide">
                    {result.type}
                  </span>
                  {result.isMatrix && result.matrix && (
                    <span className="font-mono">
                      {result.matrix.length}×{result.matrix[0]?.length ?? 0}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 text-muted-foreground hover:text-foreground"
                    onClick={(e) => {
                      e.stopPropagation();
                      copyToClipboard(isError ? result.error ?? '' : result.output ?? result.input);
                    }}
                    aria-label={t('commonCopy') ?? 'Copy'}
                  >
                    <ClipboardCopy className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 text-muted-foreground hover:text-foreground"
                    onClick={(e) => {
                      e.stopPropagation();
                      onLoad(result.input);
                    }}
                    aria-label={t('ksLoadIntoEditor') ?? 'Load into editor'}
                  >
                    <CornerDownLeft className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 text-muted-foreground hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(result.id);
                    }}
                    aria-label={t('commonDelete') ?? 'Delete'}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function HistoryPanel() {
  useLocale();
  const results = useWorkbenchStore((s) => s.results);
  const setEditorContent = useWorkbenchStore((s) => s.setEditorContent);
  const removeResult = useWorkbenchStore((s) => s.removeResult);
  const clearHistory = useWorkbenchStore((s) => s.clearHistory);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return results;
    return results.filter(
      (r) =>
        r.input.toLowerCase().includes(q) ||
        (r.output?.toLowerCase().includes(q) ?? false) ||
        (r.error?.toLowerCase().includes(q) ?? false)
    );
  }, [results, query]);

  const handleLoad = (input: string) => {
    setEditorContent(input);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header + search */}
      <div className="px-3 pt-3 pb-2 space-y-2 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[12px] font-medium text-foreground/80">
            <History className="size-3.5 text-primary/70" />
            {t('histTitle')}
            <span className="text-muted-foreground">({filtered.length})</span>
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
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('searchHistory')}
            className="h-8 pl-7 pr-2 text-[12px] bg-muted/40 border-border/60"
          />
        </div>
      </div>

      {/* Sticky-note list */}
      <ScrollArea className="flex-1 px-3 pb-3">
        <div className="space-y-2.5">
          <AnimatePresence mode="popLayout" initial={false}>
            {filtered.map((result) => (
              <HistoryCard
                key={result.id}
                result={result}
                onLoad={handleLoad}
                onDelete={removeResult}
              />
            ))}
          </AnimatePresence>
          {filtered.length === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-10 text-center"
            >
              <div className="grid place-items-center size-12 rounded-2xl bg-muted/50 border border-border/60 mb-3">
                <History className="size-5 text-muted-foreground/60" />
              </div>
              <p className="text-[12px] font-medium text-foreground/70 mb-1">
                {query ? t('noSearchResults') : t('histNoHistory')}
              </p>
              <p className="text-[11px] text-muted-foreground max-w-[180px]">
                {query ? t('tryDifferentSearch') : t('histNoHistoryHint')}
              </p>
            </motion.div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
