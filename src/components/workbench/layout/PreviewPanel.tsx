'use client';

/**
 * OmniMath Pro — Preview Panel (Right panel — live visualization)
 *
 * Top tab bar (h-9, glass): 公式 / 2D绘图 / 3D绘图 / 日志 /
 * conditionally 流水线 / AI. Active tab = teal underline + teal text.
 *
 * Tab content:
 *  - formula: current result rendering. Input box (KaTeX, glass card)
 *    + Output box (KaTeX, larger, glow-card-teal). Matrix → bmatrix.
 *    Error → red-tinted box. Empty state: animated ✨.
 *  - plot2d: <Plot2DPanel />
 *  - plot3d: <Plot3DPanel /> (dynamically imported, ssr:false)
 *  - log: recent results list (Jupyter cells)
 *  - pipeline: <NodePipeline /> (Task 6 — placeholder)
 *  - ai: <AIPanel /> (placeholder)
 *
 * Copy result button (top-right)
 */

import dynamic from 'next/dynamic';
import { useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText,
  BarChart3,
  Box,
  Clock,
  Workflow,
  Sparkles,
  Copy,
  Check,
  ArrowRight,
  AlertCircle,
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { FormulaRenderer } from '@/components/workbench/FormulaRenderer';
import { Plot2DPanel } from '@/components/workbench/plots/Plot2DPanel';
import { AIPanel } from '@/components/workbench/panels/AIPanel';
import { useWorkbenchStore } from '@/lib/store/workbench';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import type { PreviewTab } from '@/lib/store/workbench';

// Plot3DPanel uses three.js — must NOT load on the server.
const Plot3DPanel = dynamic(
  () => import('@/components/workbench/plots/Plot3DPanel').then((m) => m.Plot3DPanel),
  {
    ssr: false,
    loading: () => (
      <div className="h-full w-full grid place-items-center bg-background/40">
        <div className="text-[12px] text-muted-foreground animate-pulse">
          3D 模块加载中…
        </div>
      </div>
    ),
  },
);

interface TabDef {
  id: PreviewTab;
  labelKey:
    | 'previewFormula'
    | 'previewPlot'
    | 'preview3D'
    | 'previewLog'
    | 'tabPipeline'
    | 'tabAI';
  icon: typeof FileText;
  always?: boolean;
}

const TABS: TabDef[] = [
  { id: 'formula', labelKey: 'previewFormula', icon: FileText, always: true },
  { id: 'plot2d', labelKey: 'previewPlot', icon: BarChart3, always: true },
  { id: 'plot3d', labelKey: 'preview3D', icon: Box, always: true },
  { id: 'log', labelKey: 'previewLog', icon: Clock, always: true },
  { id: 'pipeline', labelKey: 'tabPipeline', icon: Workflow },
  { id: 'ai', labelKey: 'tabAI', icon: Sparkles },
];

export function PreviewPanel() {
  const activeTab = useWorkbenchStore((s) => s.activePreviewTab);
  const setActiveTab = useWorkbenchStore((s) => s.setActivePreviewTab);
  const currentResult = useWorkbenchStore((s) => s.currentResult);
  const results = useWorkbenchStore((s) => s.results);
  const setEditorContent = useWorkbenchStore((s) => s.setEditorContent);
  const viewMode = useWorkbenchStore((s) => s.viewMode);

  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    if (!currentResult) return;
    try {
      await navigator.clipboard.writeText(currentResult.output);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* ignore */
    }
  }, [currentResult]);

  return (
    <div className="flex flex-col h-full bg-card/30">
      {/* Tab bar */}
      <div className="shrink-0 h-9 flex items-center justify-between px-1.5 border-b border-border/60 bg-background/40">
        <div className="flex items-center h-full overflow-x-auto scrollbar-none">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'relative h-full flex items-center gap-1.5 px-2.5 text-[11.5px] font-medium transition-colors',
                  isActive
                    ? 'text-primary'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="size-3.5" />
                <span className="whitespace-nowrap">{t(tab.labelKey)}</span>
                {isActive && (
                  <motion.span
                    layoutId="preview-tab-indicator"
                    className="absolute left-1.5 right-1.5 bottom-0 h-[2px] bg-primary rounded-t-full"
                    style={{ boxShadow: '0 0 8px oklch(0.7 0.15 165 / 60%)' }}
                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  />
                )}
              </button>
            );
          })}
        </div>
        {currentResult && !currentResult.error && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={handleCopy}
                className="grid place-items-center size-6 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors mr-1"
                aria-label={t('previewCopy')}
              >
                {copied ? (
                  <Check className="size-3.5 text-emerald-500" />
                ) : (
                  <Copy className="size-3.5" />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{t('previewCopy')}</TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 relative overflow-hidden">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16 }}
            className="absolute inset-0"
          >
            {activeTab === 'formula' && (
              <FormulaView result={currentResult} />
            )}
            {activeTab === 'plot2d' && (
              <ErrorBoundary>
                <Plot2DPanel />
              </ErrorBoundary>
            )}
            {activeTab === 'plot3d' && (
              <ErrorBoundary>
                <Plot3DPanel />
              </ErrorBoundary>
            )}
            {activeTab === 'log' && (
              <LogView results={results} onPick={setEditorContent} />
            )}
            {activeTab === 'pipeline' && <PipelinePlaceholder />}
            {activeTab === 'ai' && <AIPanel />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ─── Formula view ────────────────────────────────────────────── */
function FormulaView({ result }: { result: ReturnType<typeof useWorkbenchStore.getState>['currentResult'] }) {
  if (!result) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center px-8 py-12">
        <motion.div
          animate={{ y: [0, -8, 0], rotate: [0, 6, -6, 0] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
          className="text-4xl mb-3"
        >
          ✨
        </motion.div>
        <p className="text-[13px] font-medium text-foreground/80 mb-1">
          {t('previewEmpty')}
        </p>
        <p className="text-[11.5px] text-muted-foreground max-w-xs">
          {t('previewEmptyHint')}
        </p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-4">
        {/* Input */}
        <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground/80 mb-1.5 flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-amber-500/80" />
            {t('previewInput')}
          </div>
          <div className="font-mono text-[12.5px] text-primary/90 break-all">
            {result.input}
          </div>
        </div>

        {/* Output */}
        {result.error ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/8 p-3">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-destructive mb-1.5">
              <AlertCircle className="size-3" />
              {t('previewError')}
            </div>
            <div className="font-mono text-[12px] text-destructive break-all">
              {result.error}
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 glow-card-teal min-h-[80px] grid place-items-center text-center result-output">
            <div className="w-full">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground/80 mb-2 flex items-center justify-center gap-1.5">
                <span className="size-1.5 rounded-full bg-emerald-500/80" />
                {t('previewResult')}
              </div>
              {result.latex ? (
                <FormulaRenderer
                  latex={result.latex}
                  displayMode
                  showCopy
                  className="text-[15px]"
                />
              ) : (
                <code className="font-mono text-[14px] text-foreground break-all">
                  {result.output}
                </code>
              )}
              {/* Type badge */}
              <div className="mt-3 flex items-center justify-center gap-2 text-[10px] text-muted-foreground">
                <span className="inline-flex items-center px-1.5 py-0.5 rounded border border-border/60 bg-muted/40 font-mono uppercase tracking-wide">
                  {result.type}
                </span>
                {result.isMatrix && result.matrix && (
                  <span className="font-mono">
                    {result.matrix.length}×{result.matrix[0]?.length ?? 0}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </ScrollArea>
  );
}

/* ─── Log view ────────────────────────────────────────────────── */
function LogView({
  results,
  onPick,
}: {
  results: ReturnType<typeof useWorkbenchStore.getState>['results'];
  onPick: (input: string) => void;
}) {
  if (results.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center px-8 py-12">
        <Clock className="size-7 text-muted-foreground/60 mb-2" />
        <p className="text-[12.5px] text-muted-foreground">{t('previewNoHistory')}</p>
      </div>
    );
  }
  return (
    <ScrollArea className="h-full">
      <div className="p-3 space-y-2">
        {results.map((r, i) => (
          <motion.div
            key={r.id}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.16, delay: Math.min(i * 0.015, 0.18) }}
            onClick={() => onPick(r.input)}
            className="rounded-md border border-border/60 bg-card/60 hover:border-primary/40 hover:bg-accent/30 p-2.5 cursor-pointer interactive-card"
          >
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-1">
              <span className="font-mono">[{i + 1}]</span>
              <span className="text-[10px] uppercase tracking-wider">{r.type}</span>
              <span className="ml-auto font-mono text-[10px]">
                {new Date(r.timestamp).toLocaleTimeString()}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <code className="font-mono text-[12px] text-primary/90 truncate flex-1">
                {r.input}
              </code>
              <ArrowRight className="size-3 text-muted-foreground shrink-0" />
              <code
                className={cn(
                  'font-mono text-[12px] truncate flex-1',
                  r.error ? 'text-destructive' : 'text-foreground/85',
                )}
              >
                {r.error ?? r.output}
              </code>
            </div>
          </motion.div>
        ))}
      </div>
    </ScrollArea>
  );
}

/* ─── Pipeline placeholder ─────────────────────────────────────── */
function PipelinePlaceholder() {
  const setViewMode = useWorkbenchStore((s) => s.setViewMode);
  return (
    <div className="h-full flex flex-col items-center justify-center text-center px-8 py-12">
      <div className="grid place-items-center size-14 rounded-2xl bg-primary/8 border border-primary/20 mb-3">
        <Workflow className="size-6 text-primary/70" />
      </div>
      <p className="text-[13px] font-medium text-foreground/80 mb-1">
        {t('pipelineTitle')}
      </p>
      <p className="text-[11.5px] text-muted-foreground max-w-xs mb-4">
        {t('pipelineEmptyHint')}
      </p>
      <Button
        variant="outline"
        size="sm"
        className="h-7 text-[11.5px] gap-1.5"
        onClick={() => setViewMode('pipeline')}
      >
        <Workflow className="size-3.5" />
        进入流水线视图
      </Button>
    </div>
  );
}

/* ─── AI placeholder ──────────────────────────────────────────── */
function AIPlaceholder() {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center px-8 py-12">
      <motion.div
        animate={{ y: [0, -6, 0], rotate: [0, 8, -8, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        className="grid place-items-center size-14 rounded-2xl bg-violet-500/8 border border-violet-500/20 mb-3"
      >
        <Sparkles className="size-6 text-violet-500/80" />
      </motion.div>
      <p className="text-[13px] font-medium text-foreground/80 mb-1">
        {t('aiTitle')}
      </p>
      <p className="text-[11.5px] text-muted-foreground max-w-xs mb-3">
        {t('aiWelcomeHint')}
      </p>
      <div className="grid gap-1.5 text-[11px] text-muted-foreground/80">
        <div className="rounded-md border border-border/60 bg-muted/30 px-2 py-1 cursor-default">
          ✦ {t('aiSuggest1')}
        </div>
        <div className="rounded-md border border-border/60 bg-muted/30 px-2 py-1 cursor-default">
          ✦ {t('aiSuggest2')}
        </div>
        <div className="rounded-md border border-border/60 bg-muted/30 px-2 py-1 cursor-default">
          ✦ {t('aiSuggest3')}
        </div>
      </div>
    </div>
  );
}
