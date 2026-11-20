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
import { Fragment, memo, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  FileText,
  BarChart3,
  Box,
  Clock,
  Workflow,
  Sparkles,
  Copy,
  Check,
  Play,
  ArrowRight,
  AlertCircle,
  PanelRight,
  PanelBottom,
  Columns2,
  Rows2,
  Maximize2,
  Minimize2,
  Download,
  FileCode,
  Grid3x3,
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
import { AIPanel } from '@/components/workbench/panels/AIPanel';
import { useWorkbenchStore } from '@/lib/store/workbench';
import { useLayoutStore } from '@/lib/store/layoutStore';
import { useAIContextStore } from '@/lib/store/aiContextStore';
import { t, useLocale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { saveTextToFile } from '@/lib/nativeExport';
import { resultToMarkdown, resultToLatex } from '@/lib/exportMarkdown';
import { useState } from 'react';
import type { PreviewTab, CalculationResult } from '@/lib/store/workbench';

/** 懒加载面板的轻骨架：替代居中转圈，避免白屏与布局跳动。 */
function PanelLoadingSkeleton({ label }: { label?: string }) {
  return (
    <div
      className="h-full w-full bg-[var(--preview-canvas)] p-4"
      aria-busy="true"
      aria-label={label}
    >
      <div className="mb-3 h-3 w-28 rounded-full bg-muted-foreground/15 animate-pulse" />
      <div className="h-[calc(100%-1.75rem)] rounded-lg border border-border/60 bg-card/60 animate-pulse" />
    </div>
  );
}

// Plot2DPanel 依赖 mathjs；只有切到「绘图」标签或真的运行绘图时才需要它。
const Plot2DPanel = dynamic(
  () => import('@/components/workbench/plots/Plot2DPanel').then((m) => m.Plot2DPanel),
  {
    ssr: false,
    loading: () => <PanelLoadingSkeleton />,
  },
);

// Plot3DPanel uses three.js — must NOT load on the server.
const Plot3DPanel = dynamic(
  () => import('@/components/workbench/plots/Plot3DPanel').then((m) => m.Plot3DPanel),
  {
    ssr: false,
    loading: () => <PanelLoadingSkeleton label={t('preview3DLoading')} />,
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
  useLocale();
  // 尊重系统「减少动态效果」：只保留透明度过渡，不做位移。
  const reduceMotion = useReducedMotion();
  const activeTab = useWorkbenchStore((s) => s.activePreviewTab);
  const inputView = useWorkbenchStore((s) => s.inputView);
  // 函数输入器只关心图：隐藏公式/日志/流水线/AI，并强制渲染 2D 或 3D 绘图。
  // 这里不改写 store 里的 activeTab，切回代码模式时用户原来的标签会恢复。
  const functionMode = inputView === 'demos';
  const effectiveTab: PreviewTab =
    functionMode && activeTab !== 'plot2d' && activeTab !== 'plot3d'
      ? 'plot2d'
      : activeTab;
  const visibleTabs = functionMode
    ? TABS.filter((tab) => tab.id === 'plot2d' || tab.id === 'plot3d')
    : TABS;
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

  // Three.js is expensive: do not create a WebGL context until the user
  // actually opens the 3D tab. Once visited it stays mounted (hidden) so
  // switching back is instant and we never churn WebGL contexts.
  const [visited3d, setVisited3d] = useState(effectiveTab === 'plot3d');
  useEffect(() => {
    if (effectiveTab === 'plot3d') setVisited3d(true);
  }, [effectiveTab]);

  // 预览面板较窄时（平板竖屏 / 小窗口左右分栏）只显示图标，
  // 避免「流水线 / AI」被挤出可视区；宽度恢复后自动带回文字。
  const tabBarRef = useRef<HTMLDivElement>(null);
  const [compactTabs, setCompactTabs] = useState(false);
  useEffect(() => {
    const el = tabBarRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? el.clientWidth;
      setCompactTabs(width < 430);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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
    <div className="flex flex-col h-full bg-background">
      {/* Tab bar */}
      <div ref={tabBarRef} className="shrink-0 h-8 flex items-center justify-between px-1.5 border-b border-border bg-transparent">
        <div className="flex items-center h-full overflow-x-auto scrollbar-none">
          {visibleTabs.map((tab, idx) => {
            const Icon = tab.icon;
            const isActive = effectiveTab === tab.id;
            return (
              <Fragment key={tab.id}>
                {/* 组间分隔线：当当前 tab 的 group 与上一个不同时插入。
                    用 1px 竖线把"数据/可视化/工具"三组分开，让 tab bar
                    不再是 6 个无差别的图标横排，而是一眼能看出语义分区。 */}
                {idx > 0 && tab.group !== visibleTabs[idx - 1].group && (
                  <div
                    aria-hidden
                    className="w-px h-3.5 bg-border mx-0.5 shrink-0"
                  />
                )}
                <button
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  title={compactTabs ? t(tab.labelKey) : undefined}
                  aria-label={compactTabs ? t(tab.labelKey) : undefined}
                  className={cn(
                    'relative h-full flex items-center gap-1.5 text-[11px] font-medium transition-colors shrink-0',
                    compactTabs ? 'px-2' : 'px-2.5',
                    isActive
                      ? 'text-primary'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Icon className="size-3.5" strokeWidth={1.75} />
                  {!compactTabs && <span className="whitespace-nowrap">{t(tab.labelKey)}</span>}
                  {isActive && (
                    <span
                      aria-hidden
                      className="absolute left-2 right-2 bottom-0 h-[2px] rounded-full bg-primary"
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
                className="grid place-items-center size-6 rounded text-muted-foreground hover:bg-accent/60 hover:text-foreground transition-colors"
                aria-label={t('layoutSwitch')}
              >
                {previewPosition === 'right' ? (
                  <Columns2 className="size-3.5" strokeWidth={1.75} />
                ) : (
                  <Rows2 className="size-3.5" strokeWidth={1.75} />
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
                  className="grid place-items-center size-6 rounded text-muted-foreground hover:bg-accent/60 hover:text-foreground transition-colors"
                  aria-label={t('previewCopy')}
                >
                  {copied ? (
                    <Check className="size-3.5 text-primary" />
                  ) : (
                    <Copy className="size-3.5" strokeWidth={1.75} />
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
        {/* 首次进入 3D 才挂载；之后用 display:none 隐藏而非卸载，避免切 tab
            导致 WebGLRenderer 被销毁、再切回时重新创建上下文（切 16 次后
            浏览器会因 WebGL 上下文数量上限而黑屏）。frameloop="demand" 让
            隐藏期间 GPU 不消耗资源，切回时由 ResizeObserver 自动恢复尺寸。 */}
        <div
          className="absolute inset-0"
          style={{ display: effectiveTab === 'plot3d' ? 'block' : 'none' }}
          aria-hidden={effectiveTab !== 'plot3d'}
        >
          <ErrorBoundary>
            {visited3d && <Plot3DPanel />}
          </ErrorBoundary>
        </div>

        {/* 其余 tab 走 AnimatePresence 过渡（plot3d 不在此渲染，避免重复挂载） */}
        <AnimatePresence mode="wait" initial={false}>
          {effectiveTab !== 'plot3d' && (
            <motion.div
              key={effectiveTab}
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
              transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
              className="absolute inset-0"
            >
              {effectiveTab === 'formula' && (
                <FormulaView results={results} previewSize={previewSize} />
              )}
              {effectiveTab === 'plot2d' && (
                <ErrorBoundary>
                  <Plot2DPanel />
                </ErrorBoundary>
              )}
              {effectiveTab === 'log' && (
                <LogView results={results} onPick={setEditorContent} />
              )}
              {effectiveTab === 'pipeline' && <PipelinePlaceholder />}
              {effectiveTab === 'ai' && <AIPanel />}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ─── Formula view ────────────────────────────────────────────── */

/** 空状态下的三个一键示例：点一下即填入脚本并运行。 */
const EMPTY_EXAMPLES = [
  { id: 'curve2d', label: '2D 曲线', snippet: 'plot(sin(x))', icon: BarChart3 },
  { id: 'surface3d', label: '3D 曲面', snippet: 'plot3d(sin(x) * cos(y))', icon: Box },
  { id: 'matrix', label: '矩阵运算', snippet: 'inv([1, 2; 3, 4])', icon: Grid3x3 },
] as const;

/**
 * 空状态迷你图表：极淡网格 + 一条蓝→紫正弦曲线。
 * 纯静态，颜色取自可视化 token，不参与动画。
 */
function EmptyPreviewChart() {
  return (
    <svg
      viewBox="0 0 180 110"
      width={180}
      height={110}
      fill="none"
      aria-hidden
      className="block h-[110px] w-full"
    >
      <defs>
        <linearGradient
          id="preview-empty-curve"
          x1="14"
          y1="0"
          x2="166"
          y2="0"
          gradientUnits="userSpaceOnUse"
        >
          <stop style={{ stopColor: 'var(--viz-1)' }} />
          <stop offset="1" style={{ stopColor: 'var(--viz-3)' }} />
        </linearGradient>
      </defs>

      {/* 极淡网格 */}
      <g style={{ stroke: 'var(--viz-grid)' }} strokeWidth="1">
        {[14, 52, 90, 128, 166].map((x) => (
          <line key={`v${x}`} x1={x} y1="20" x2={x} y2="92" />
        ))}
        {[34, 56, 78].map((y) => (
          <line key={`h${y}`} x1="14" y1={y} x2="166" y2={y} />
        ))}
      </g>

      {/* 曲线：蓝 → 紫 */}
      <path
        d="M14 56 L23.5 40.4 L33 34 L42.5 40.4 L52 56 L61.5 71.6 L71 78 L80.5 71.6 L90 56 L99.5 40.4 L109 34 L118.5 40.4 L128 56 L137.5 71.6 L147 78 L156.5 71.6 L166 56"
        stroke="url(#preview-empty-curve)"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const FormulaView = memo(function FormulaView({
  results,
  previewSize,
}: {
  results: ReturnType<typeof useWorkbenchStore.getState>['results'];
  previewSize: 'compact' | 'large';
}) {
  // 导出成功后的短暂反馈：按钮内显示「已导出」约 1.8s，不弹阻塞 Toast。
  const [exportedId, setExportedId] = useState<string | null>(null);
  const exportTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    return () => clearTimeout(exportTimerRef.current);
  }, []);

  // 导出单个计算结果为 LaTeX / Markdown
  const handleExportResult = useCallback(
    async (result: CalculationResult, format: 'latex' | 'md') => {
      const stamp = `omnimath-result-${Date.now()}`;
      const saved = format === 'latex'
        ? await saveTextToFile(resultToLatex(result), {
            defaultName: stamp,
            extensions: ['tex'],
          })
        : await saveTextToFile(resultToMarkdown(result), {
            defaultName: stamp,
            extensions: ['md'],
          });
      if (!saved) return;
      setExportedId(result.id);
      clearTimeout(exportTimerRef.current);
      exportTimerRef.current = setTimeout(() => setExportedId(null), 1800);
    },
    [],
  );

  // 端到端闭环：把当前结果交给 AI 解释。切到 AI 标签并把
  // 一句包含上下文的提示词排进队列（由 AIPanel 消费并自动发送）。
  const handleAIExplain = useCallback((result: CalculationResult) => {
    useWorkbenchStore.getState().setActivePreviewTab('ai');
    const prompt = `请用中文解释这个计算结果：\n输入：\`${result.input}\`\n输出：\`${result.output}\`\n请你不仅陈述结果，还要说明它的数学含义、推导依据和常见易错点。`;
    // 排队而不是直接派发事件：AI 标签刚切过去时面板可能还没挂载。
    useAIContextStore.getState().queuePrompt(prompt);
  }, []);

  // 空状态示例：写入指定脚本，确保工作台可见，然后触发一次运行。
  // 默认的「运行示例」与下方三个快捷 chip 共用这段逻辑。
  const handleRunExample = useCallback((snippet: string = 'plot(sin(x))') => {
    const store = useWorkbenchStore.getState();
    store.setEditorContent(snippet);
    store.setInputView('code');
    store.setPreviewVisible(true);
    store.setViewMode('workbench');
    // 等编辑器内容与 run-all 监听器完成本轮更新后再运行（约一帧多一点）。
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent('omnimath:run-all'));
    }, 80);
  }, []);

  if (results.length === 0) {
    return (
      <div className="@container h-full overflow-y-auto bg-[var(--preview-canvas)]">
        <div className="flex min-h-full flex-col items-center justify-center px-5 py-8 text-center">
          <div className="w-full max-w-[340px]">
            {/* 迷你图表卡：面板窄于 360px 时隐藏，避免挤压文字 */}
            <div className="mx-auto mb-4 hidden w-[180px] overflow-hidden rounded-lg border border-border bg-card shadow-[var(--shadow-card)] @[360px]:block">
              <EmptyPreviewChart />
            </div>

            <p className="text-[13px] font-medium text-foreground">
              {t('previewEmpty')}
            </p>
            <p className="mx-auto mt-1 max-w-[32ch] text-[11.5px] leading-relaxed text-muted-foreground">
              {t('previewEmptyHint')}
            </p>

            {/* 一键示例 chips */}
            <div className="mt-4 flex flex-wrap justify-center gap-1.5">
              {EMPTY_EXAMPLES.map((ex) => {
                const Icon = ex.icon;
                return (
                  <button
                    key={ex.id}
                    type="button"
                    onClick={() => handleRunExample(ex.snippet)}
                    className="surface-card inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-medium text-muted-foreground transition-colors duration-150 hover:border-primary/45! hover:text-primary"
                  >
                    <Icon className="size-3" strokeWidth={1.75} />
                    {ex.label}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => handleRunExample()}
              className="motion-press mt-3 inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3.5 text-[11.5px] font-medium text-primary-foreground transition-colors duration-150 hover:bg-primary/90"
            >
              <Play className="size-3" fill="currentColor" strokeWidth={1.75} />
              运行示例
            </button>
          </div>
        </div>
      </div>
    );
  }

  // `addResult` prepends new results to the front of the array, so
  // `results` is in REVERSE execution order (last line first). To display
  // them in the order the user wrote them (top = first line), we reverse.
  const ordered = [...results].reverse();
  // The newest result sits at `results[0]` (array front). Show its badge
  // on the last rendered row (which is the newest after reversing).
  const newestId = results[0]?.id;

  return (
    <ScrollArea className="h-full bg-[var(--preview-canvas)]">
      <div className="p-4 space-y-4">
        {ordered.map((result) => {
          const isCurrent = result.id === newestId;
          return (
            <div key={result.id} className="space-y-2 motion-result-in">
              {/* Input */}
              <div className="surface-card rounded-lg p-3">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground/80 mb-1.5 flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full bg-muted-foreground/50" />
                  {t('previewInput')}
                </div>
                <div className="font-mono text-[12.5px] text-foreground/85 break-all">
                  {result.input}
                </div>
              </div>

              {/* Output */}
              {result.error ? (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
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
                  'rounded-lg p-4 grid place-items-center text-center result-output',
                  isCurrent
                    ? 'border border-border bg-[var(--paper)] text-[var(--paper-foreground)] shadow-[var(--shadow-card)] dark:border-primary/25 dark:bg-card dark:text-card-foreground'
                    : 'surface-card',
                  previewSize === 'large' ? 'min-h-[180px]' : 'min-h-[100px]',
                )}>
                  <div className="w-full">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground/80 mb-2 flex items-center justify-center gap-1.5">
                      <span className={cn(
                        'size-1.5 rounded-full',
                        isCurrent ? 'bg-primary/70' : 'bg-muted-foreground/40',
                      )} />
                      {t('previewResult')}
                    </div>
                    {result.latex ? (
                      <FormulaRenderer
                        latex={result.latex}
                        displayMode
                        showCopy
                        showExport
                        collapsible
                        scrollbarOnHover
                        className="text-[15px]"
                      />
                    ) : (
                      <code className="font-mono text-[14px] text-foreground break-all">
                        {result.output}
                      </code>
                    )}
                    {/* Type badge + export */}
                    <div className="mt-3 flex items-center justify-center gap-2 text-[10px] text-muted-foreground">
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-[3px] border border-border bg-muted/40 font-mono uppercase tracking-wide">
                        {result.type}
                      </span>
                      {result.isMatrix && result.matrix && (
                        <span className="font-mono">
                          {result.matrix.length}×{result.matrix[0]?.length ?? 0}
                        </span>
                      )}
                      <div className="ml-auto flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleAIExplain(result)}
                          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] font-medium text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors"
                          aria-label="AI 解释结果"
                        >
                          <Sparkles className="size-3" strokeWidth={1.75} />
                          AI 解释
                        </button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] font-medium text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                              aria-label={exportedId === result.id ? '已导出' : t('exportResult')}
                            >
                              {exportedId === result.id ? (
                                <Check className="size-3 text-[var(--success)]" strokeWidth={1.75} />
                              ) : (
                                <Download className="size-3" strokeWidth={1.75} />
                              )}
                              {exportedId === result.id ? '已导出' : t('exportResult')}
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuLabel className="text-xs text-muted-foreground">
                              {t('exportResultHint')}
                            </DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => handleExportResult(result, 'latex')}
                              className="gap-2 cursor-pointer"
                            >
                              <FileText className="size-3.5 text-muted-foreground" strokeWidth={1.75} />
                              <span className="text-xs">{t('exportResultLatex')}</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleExportResult(result, 'md')}
                              className="gap-2 cursor-pointer"
                            >
                              <FileCode className="size-3.5 text-muted-foreground" strokeWidth={1.75} />
                              <span className="text-xs">{t('exportResultMarkdown')}</span>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
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
  const newestId = results[0]?.id;
  return (
    <ScrollArea className="h-full bg-[var(--preview-canvas)]">
      <div className="p-3 space-y-2">
        {/* reverse → show in the order the user wrote the lines (top = first) */}
        {[...results].reverse().map((r, i) => {
          const isNewest = r.id === newestId;
          return (
            <div
              key={r.id}
              onClick={() => onPick(r.input)}
              className={cn(
                'relative rounded-lg surface-card p-2.5 pl-3 cursor-pointer motion-result-in',
                'transition-colors duration-[var(--motion-fast)]',
                // surface-card 是 unlayered 工具类，hover 需要 ! 才能覆盖其底色/边框。
                'hover:border-primary/40! hover:bg-primary/5!',
              )}
            >
              {/* 最新一条：左侧细蓝条，不参与布局 */}
              {isNewest && (
                <span
                  aria-hidden
                  className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-full bg-primary/70"
                />
              )}
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-1">
                <span className="font-mono">[{i + 1}]</span>
                <span className="text-[10px] uppercase tracking-wider">{r.type}</span>
                <span className="ml-auto font-mono text-[10px]">
                  {new Date(r.timestamp).toLocaleTimeString()}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <code className="font-mono text-[12px] text-foreground/80 truncate flex-1">
                  {r.input}
                </code>
                <ArrowRight className="size-3 text-muted-foreground shrink-0" strokeWidth={1.75} />
                <code
                  className={cn(
                    'font-mono text-[12px] truncate flex-1',
                    r.error ? 'text-destructive' : 'text-foreground/85',
                  )}
                >
                  {r.error ?? r.output}
                </code>
              </div>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
});

/* ─── Pipeline placeholder ─────────────────────────────────────── */
function PipelinePlaceholder() {
  const setViewMode = useWorkbenchStore((s) => s.setViewMode);
  return (
    <div className="h-full flex flex-col items-center justify-center text-center px-8 py-12 bg-[var(--preview-canvas)]">
      <div className="grid place-items-center size-10 rounded-md border border-border bg-card mb-3">
        <Workflow className="size-4 text-muted-foreground" strokeWidth={1.75} />
      </div>
      <p className="text-[12.5px] font-medium text-foreground/80 mb-1">
        {t('pipelineTitle')}
      </p>
      <p className="text-[11.5px] text-muted-foreground max-w-xs mb-4">
        {t('pipelineEmptyHint')}
      </p>
      <Button
        variant="outline"
        size="sm"
        className="h-7 text-[11px] gap-1.5"
        onClick={() => setViewMode('pipeline')}
      >
        <Workflow className="size-3.5" strokeWidth={1.75} />
        {t('pipelineEnterView')}
      </Button>
    </div>
  );
}
