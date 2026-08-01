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
import { Fragment, memo, useCallback, useRef } from 'react';
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
  PanelRight,
  PanelBottom,
  Columns2,
  Rows2,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { FormulaRenderer } from '@/components/workbench/FormulaRenderer';
import { Plot2DPanel } from '@/components/workbench/plots/Plot2DPanel';
import { AIPanel } from '@/components/workbench/panels/AIPanel';
import { useWorkbenchStore } from '@/lib/store/workbench';
import { useLayoutStore } from '@/lib/store/layoutStore';
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
          {t('preview3DLoading')}
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
  /**
   * 分组 id —— 仅用于 tab bar 的视觉分组，组与组之间插入一条
   * 1px 竖向分隔线。和 ActivityBar 分组逻辑一致：
   *
   *   data   数据组    公式 / 日志        — 查看计算结果
   *   viz    可视化组  2D / 3D            — 图形展示
   *   tools  工具组    流水线 / AI        — 编排与辅助
   *
   * 分组只是视觉提示，不影响点击行为；用户仍可在组间自由切换。
   */
  group: 'data' | 'viz' | 'tools';
}

const TABS: TabDef[] = [
  // ── 数据组 ──────────────────────────────────────
  { id: 'formula', labelKey: 'previewFormula', icon: FileText, always: true, group: 'data' },
  { id: 'log', labelKey: 'previewLog', icon: Clock, always: true, group: 'data' },
  // ── 可视化组 ───────────────────────────────────
  { id: 'plot2d', labelKey: 'previewPlot', icon: BarChart3, always: true, group: 'viz' },
  { id: 'plot3d', labelKey: 'preview3D', icon: Box, always: true, group: 'viz' },
  // ── 工具组 ─────────────────────────────────────
  { id: 'pipeline', labelKey: 'tabPipeline', icon: Workflow, group: 'tools' },
  { id: 'ai', labelKey: 'tabAI', icon: Sparkles, group: 'tools' },
];

export function PreviewPanel() {
  const activeTab = useWorkbenchStore((s) => s.activePreviewTab);
  const setActiveTab = useWorkbenchStore((s) => s.setActivePreviewTab);
  const currentResult = useWorkbenchStore((s) => s.currentResult);
  const results = useWorkbenchStore((s) => s.results);
  const setEditorContent = useWorkbenchStore((s) => s.setEditorContent);
  const viewMode = useWorkbenchStore((s) => s.viewMode);

  // 布局状态
  const previewPosition = useLayoutStore((s) => s.previewPosition);
  const setPreviewPosition = useLayoutStore((s) => s.setPreviewPosition);
  const previewSize = useLayoutStore((s) => s.previewSize);
  const setPreviewSize = useLayoutStore((s) => s.setPreviewSize);

  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const handleCopy = useCallback(async () => {
    if (!currentResult) return;
    try {
      await navigator.clipboard.writeText(currentResult.output);
      setCopied(true);
      clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 1400);
    } catch {
      /* ignore */
    }
  }, [currentResult]);

  return (
    <div className="flex flex-col h-full bg-card/30">
      {/* Tab bar */}
      <div className="shrink-0 h-9 flex items-center justify-between px-1.5 border-b border-border/60 bg-background/40">
        <div className="flex items-center h-full overflow-x-auto scrollbar-none">
          {TABS.map((tab, idx) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <Fragment key={tab.id}>
                {/* 组间分隔线：当当前 tab 的 group 与上一个不同时插入。
                    用 1px 竖线把"数据/可视化/工具"三组分开，让 tab bar
                    不再是 6 个无差别的图标横排，而是一眼能看出语义分区。 */}
                {idx > 0 && tab.group !== TABS[idx - 1].group && (
                  <div
                    aria-hidden
                    className="w-px h-3.5 bg-border/50 mx-0.5 shrink-0"
                  />
                )}
                <button
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'relative h-full flex items-center gap-1.5 px-2.5 text-[11.5px] font-medium transition-colors shrink-0',
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
              </Fragment>
            );
          })}
        </div>
        <div className="flex items-center gap-0.5 mr-1">
          {/* 布局切换 */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="grid place-items-center size-6 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                aria-label={t('layoutSwitch')}
              >
                {previewPosition === 'right' ? (
                  <Columns2 className="size-3.5" />
                ) : (
                  <Rows2 className="size-3.5" />
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                {t('layoutSwitch')}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setPreviewPosition('right')}
                className="gap-2 cursor-pointer"
              >
                <PanelRight className="size-3.5" />
                <span className="text-xs">{t('layoutRight')}</span>
                {previewPosition === 'right' && (
                  <Check className="size-3 text-primary ml-auto" />
                )}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setPreviewPosition('bottom')}
                className="gap-2 cursor-pointer"
              >
                <PanelBottom className="size-3.5" />
                <span className="text-xs">{t('layoutBottom')}</span>
                {previewPosition === 'bottom' && (
                  <Check className="size-3 text-primary ml-auto" />
                )}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                {t('layoutSize')}
              </DropdownMenuLabel>
              <DropdownMenuItem
                onClick={() => setPreviewSize('compact')}
                className="gap-2 cursor-pointer"
              >
                <Minimize2 className="size-3.5" />
                <span className="text-xs">{t('layoutCompact')}</span>
                {previewSize === 'compact' && (
                  <Check className="size-3 text-primary ml-auto" />
                )}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setPreviewSize('large')}
                className="gap-2 cursor-pointer"
              >
                <Maximize2 className="size-3.5" />
                <span className="text-xs">{t('layoutLarge')}</span>
                {previewSize === 'large' && (
                  <Check className="size-3 text-primary ml-auto" />
                )}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {currentResult && !currentResult.error && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="grid place-items-center size-6 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
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
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 relative overflow-hidden">
        {/* T3: Plot3D 常驻挂载 — 用 display:none 隐藏而非卸载，避免切 tab
            导致 WebGLRenderer 被销毁、再切回时重新创建上下文（切 16 次后
            浏览器会因 WebGL 上下文数量上限而黑屏）。frameloop="demand" 让
            隐藏期间 GPU 不消耗资源，切回时由 ResizeObserver 自动恢复尺寸。 */}
        <div
          className="absolute inset-0"
          style={{ display: activeTab === 'plot3d' ? 'block' : 'none' }}
          aria-hidden={activeTab !== 'plot3d'}
        >
          <ErrorBoundary>
            <Plot3DPanel />
          </ErrorBoundary>
        </div>

        {/* 其余 tab 走 AnimatePresence 过渡（plot3d 不在此渲染，避免重复挂载） */}
        <AnimatePresence mode="wait" initial={false}>
          {activeTab !== 'plot3d' && (
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.16 }}
              className="absolute inset-0"
            >
              {activeTab === 'formula' && (
                <FormulaView result={currentResult} previewSize={previewSize} />
              )}
              {activeTab === 'plot2d' && (
                <ErrorBoundary>
                  <Plot2DPanel />
                </ErrorBoundary>
              )}
              {activeTab === 'log' && (
                <LogView results={results} onPick={setEditorContent} />
              )}
              {activeTab === 'pipeline' && <PipelinePlaceholder />}
              {activeTab === 'ai' && <AIPanel />}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ─── Formula view ────────────────────────────────────────────── */
const FormulaView = memo(function FormulaView({
  result,
  previewSize,
}: {
  result: ReturnType<typeof useWorkbenchStore.getState>['currentResult'];
  previewSize: 'compact' | 'large';
}) {
  if (!result) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center px-8 py-12">
        <motion.div
          animate={{ y: [0, -6, 0] }}
          transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
          className="grid place-items-center size-14 rounded-2xl bg-primary/8 border border-primary/20 mb-3"
        >
          <Sparkles className="size-6 text-primary/70" />
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
          <div className={cn(
            'rounded-lg border border-primary/30 bg-primary/5 p-4 glow-card-teal grid place-items-center text-center result-output',
            previewSize === 'large' ? 'min-h-[180px]' : 'min-h-[100px]',
          )}>
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
                  showExport
                  collapsible
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
});

/* ─── Log view ────────────────────────────────────────────────── */
const LogView = memo(function LogView({
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
});

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
        {t('pipelineEnterView')}
      </Button>
    </div>
  );
}
