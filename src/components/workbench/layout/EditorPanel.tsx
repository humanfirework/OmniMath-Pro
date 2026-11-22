'use client';

/**
 * OmniMath Pro — Editor Panel (Script Editor)
 *
 * Layout:
 *  - Top toolbar (h-9): label + 3-segment mode switcher (Simple/Python/MATLAB)
 *    + line/var count + Reset / Clear / Run buttons.
 *  - Editor area: line-number gutter (synced scroll) + textarea (mono font).
 *  - Bottom info bar (h-6): shortcut hints + Ln/Col indicator.
 *
 * Keyboard:
 *  - Enter = newline (standard editor behaviour, keeps indentation)
 *  - Ctrl/Cmd+Enter = run
 *  - Tab = indent 2 spaces
 *  - Ctrl+/ = comment line
 *
 * On Run:
 *  - Iterate lines, call evaluateExpression(line, inputMode)
 *  - addResult / setCurrentResult / setVariable for each
 *  - addPlot if plot type
 *  - Switch preview tab appropriately (plot → plot2d, polar → plot2d,
 *    surface3d → plot3d, matrix → formula)
 *  - Show a brief "calculating" pulse on the Run button
 */

import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play,
  Eraser,
  Trash2,
  FileCode2,
  FunctionSquare,
  Loader2,
  Sigma,
  MoreHorizontal,
  X,
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useWorkbenchStore } from '@/lib/store/workbench';
import { DEFAULT_SCRIPT } from '@/lib/editor/defaultScript';
import { toLiteLatex } from '@/lib/editor/liteLatex';
import { useFileSystemStore } from '@/lib/store/fileSystemStore';
import { useSettingsStore } from '@/lib/store/settingsStore';
import type { InputMode } from '@/lib/engine/types';
import { DEFAULT_CARTESIAN_RANGE } from '@/lib/engine/types';
import { t, useLocale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { CalculationResult } from '@/lib/store/workbench';
import { useRunResultsStore } from '@/lib/store/runResultsStore';
import type { Plot2DType } from '@/lib/plots/plot2d';
import { buildPlotConfig } from '@/lib/plots/fromResult';
import { CodeEditor, type InlineResult } from '@/components/workbench/layout/CodeEditor';
import { registerShortcutHandler } from '@/lib/hooks/useGlobalShortcuts';
import { SymbolPalette } from '@/components/workbench/SymbolPalette';
import { FormulaRenderer } from '@/components/workbench/FormulaRenderer';

// 函数输入器依赖 mathjs；代码模式首屏不需要它，按需加载。
const FunctionInputPanel = lazy(() =>
  import('@/components/workbench/plots/FunctionInputPanel').then((m) => ({
    default: m.FunctionInputPanel,
  })),
);

/** 延迟加载函数输入器时的占位。 */
function FunctionInputLoading() {
  return (
    <div className="h-full w-full grid place-items-center">
      <div className="size-4 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
    </div>
  );
}

const MODES: Array<{ id: InputMode; labelKey: 'editorModeSimple' | 'editorModePython' | 'editorModeMatlab' }> = [
  { id: 'simple', labelKey: 'editorModeSimple' },
  { id: 'python', labelKey: 'editorModePython' },
  { id: 'matlab', labelKey: 'editorModeMatlab' },
];

const MODE_DESCRIPTION: Record<InputMode, string> = {
  simple: '简单模式：宽松语法，自动 2x → 2*x，含 x 自动绘图。',
  python: 'Python 风格：np.sin、math.log 等模块前缀将被剥离。',
  matlab: 'MATLAB 风格：A\\b 求解线性方程组，A\' 转置。',
};

/** 行尾结果胶囊的一句话摘要：压平换行、限制长度。 */
function clipInlineText(text: string, max = 40): string {
  const single = text.replace(/\s+/g, ' ').trim();
  return single.length > max ? `${single.slice(0, max - 1)}…` : single;
}

/**
 * i18n keys added by the multi-tab feature, pending merge into
 * src/lib/i18n/index.ts (that file is owned by a separate change).
 * t() falls back to the key string at runtime; the cast only satisfies
 * the TranslationDict type constraint until the keys are merged.
 */
const tPending = (key: string): string => t(key as Parameters<typeof t>[0]);

export function EditorPanel() {
  useLocale();
  const editorContent = useWorkbenchStore((s) => s.editorContent);
  const setEditorContent = useWorkbenchStore((s) => s.setEditorContent);
  const inputMode = useWorkbenchStore((s) => s.inputMode);
  const setInputMode = useWorkbenchStore((s) => s.setInputMode);
  const inputView = useWorkbenchStore((s) => s.inputView);
  const setInputView = useWorkbenchStore((s) => s.setInputView);
  const addResult = useWorkbenchStore((s) => s.addResult);
  const setCurrentResult = useWorkbenchStore((s) => s.setCurrentResult);
  const setVariable = useWorkbenchStore((s) => s.setVariable);
  const addPlot = useWorkbenchStore((s) => s.addPlot);
  const clearHistory = useWorkbenchStore((s) => s.clearHistory);
  const clearVariables = useWorkbenchStore((s) => s.clearVariables);
  const clearPlots = useWorkbenchStore((s) => s.clearPlots);
  const setActivePreviewTab = useWorkbenchStore((s) => s.setActivePreviewTab);
  const variables = useWorkbenchStore((s) => s.variables);

  const [isRunning, setIsRunning] = useState(false);
  const [previewLine, setPreviewLine] = useState(1);
  // 运行后行尾的结果胶囊（MATLAB live editor 风格）：任何编辑都会清空，
  // 避免结果与代码行错位。
  const [inlineResults, setInlineResults] = useState<InlineResult[]>([]);
  // 输入界面：'code'（代码编辑器） | 'demos'（Desmos 式直接输入）。
  // 状态已提升到 workbench store，供顶栏 TitleBar 与 EditorPanel 共享。
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorContainerRef = useRef<HTMLDivElement | null>(null);

  /* ─── Editor font size from settings store ───────────────────── */
  const editorFontSize = useSettingsStore((s) => s.editorFontSize);
  const setEditorFontSize = useSettingsStore((s) => s.setEditorFontSize);
  const symbolPaletteOpen = useSettingsStore((s) => s.symbolPaletteOpen);
  const setSymbolPaletteOpen = useSettingsStore((s) => s.setSymbolPaletteOpen);

  /* ─── Ctrl/Cmd + wheel zoom ───────────────────────────────────── */
  useEffect(() => {
    const el = editorContainerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const next = editorFontSize + (e.deltaY > 0 ? -1 : 1);
      setEditorFontSize(next);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [editorFontSize, setEditorFontSize]);

  /* ─── File system integration ──────────────────────────────────── */
  // 首次启动的示例脚本由 workbench store 在 loadFromStorage 时写入
  //（见 `@/lib/editor/defaultScript`）——编辑器现在按需加载，不能在这里
  // 判断「是否首次启动」，否则自动保存会先落一个空内容。
  // Load the file system on mount (async, IndexedDB).
  const activeFileId = useFileSystemStore((s) => s.activeFileId);
  const loadFromStorage = useFileSystemStore((s) => s.loadFromStorage);
  const fsLoaded = useFileSystemStore((s) => s.loaded);
  // Multi-tab state.
  const openTabs = useFileSystemStore((s) => s.openTabs);
  const fsNodes = useFileSystemStore((s) => s.nodes);
  const openFile = useFileSystemStore((s) => s.openFile);
  const closeTab = useFileSystemStore((s) => s.closeTab);

  useEffect(() => {
    if (!fsLoaded) void loadFromStorage();
  }, [fsLoaded, loadFromStorage]);

  // When the active file changes, load its content into the editor.
  // We use a ref to skip the auto-save effect during programmatic loads
  // so we don't immediately write back the same content.
  const skipNextSaveRef = useRef(false);
  // Tracks the file we actually loaded, so we can detect it being deleted
  // (activeFileId → null) vs. simply launching with no file open.
  const loadedFileIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!activeFileId) {
      // The previously-open file was deleted (or its folder was) — the
      // store nulled activeFileId. Reset the editor to a safe empty state
      // instead of leaving stale content that looks like it still belongs
      // to the deleted file. On a fresh launch with no active file
      // (loadedFileIdRef still null), keep the persisted draft as-is.
      if (loadedFileIdRef.current !== null) {
        loadedFileIdRef.current = null;
        skipNextSaveRef.current = false;
        setEditorContent('');
      }
      return;
    }
    const file = useFileSystemStore.getState().nodes[activeFileId];
    if (!file || file.type !== 'file') {
      // Dangling reference (e.g. corrupted persisted state) — clear it so
      // the auto-save below can't target a non-existent node.
      loadedFileIdRef.current = null;
      useFileSystemStore.getState().setActiveFile(null);
      setEditorContent('');
      return;
    }
    if (loadedFileIdRef.current !== activeFileId) {
      loadedFileIdRef.current = activeFileId;
      if (file.content !== undefined) {
        skipNextSaveRef.current = true;
        setEditorContent(file.content);
        if (file.language) setInputMode(file.language);
      }
    }
  }, [activeFileId, setEditorContent, setInputMode]);

  // Flush pending edits on unmount (e.g. switching to the pipeline view):
  // the debounced auto-save below would otherwise drop the last <500ms of
  // keystrokes, and the stale file content would overwrite the editor on
  // remount.
  const latestEditRef = useRef({ activeFileId, editorContent });
  useEffect(() => {
    latestEditRef.current = { activeFileId, editorContent };
  }, [activeFileId, editorContent]);
  useEffect(() => {
    return () => {
      const { activeFileId: id, editorContent: content } = latestEditRef.current;
      if (id) useFileSystemStore.getState().updateFileContent(id, content);
    };
  }, []);

  // M3 — 接收 set_editor_content 指令：mode=replace 覆写 / mode=append 追加。
  useEffect(() => {
    const handler = (e: Event) => {
      const d = (e as CustomEvent<{ content?: unknown; mode?: unknown }>).detail;
      if (!d || typeof d.content !== 'string') return;
      const mode = d.mode === 'append' ? 'append' : 'replace';
      if (mode === 'append') {
        setEditorContent(
          editorContent.trim() ? `${editorContent.trimEnd()}\n${d.content}` : d.content,
        );
      } else {
        setEditorContent(d.content);
      }
    };
    window.addEventListener('omnimath:editor-content', handler);
    return () => window.removeEventListener('omnimath:editor-content', handler);
  }, [editorContent, setEditorContent]);

  // When editor content changes AND there's an active file, auto-save to
  // the file system store (debounced). Skip if this change was triggered
  // by loading the active file (skipNextSaveRef).
  useEffect(() => {
    if (!activeFileId) return;
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }
    const timer = setTimeout(() => {
      useFileSystemStore.getState().updateFileContent(activeFileId, editorContent);
    }, 500);
    return () => clearTimeout(timer);
  }, [editorContent, activeFileId]);

  /* ─── Tab bar interactions ─────────────────────────────────────── */
  // Flush pending debounced edits for the currently-open file. Mirrors
  // flushActiveFileEdits() in FilesPanel: switching/closing a tab within
  // the 500ms auto-save window would otherwise drop the last keystrokes.
  const flushCurrentEdits = useCallback(() => {
    const { activeFileId: id, editorContent: content } = latestEditRef.current;
    if (id && useFileSystemStore.getState().nodes[id]?.type === 'file') {
      useFileSystemStore.getState().updateFileContent(id, content);
    }
  }, []);

  const handleTabSelect = useCallback(
    (tabId: string) => {
      if (tabId === activeFileId) return;
      flushCurrentEdits();
      openFile(tabId);
    },
    [activeFileId, flushCurrentEdits, openFile],
  );

  const handleTabClose = useCallback(
    (tabId: string, e?: React.MouseEvent) => {
      e?.stopPropagation();
      // Only the active tab can hold unflushed editor edits.
      if (tabId === activeFileId) flushCurrentEdits();
      closeTab(tabId);
    },
    [activeFileId, flushCurrentEdits, closeTab],
  );

  const lineCount = useMemo(() => editorContent.split('\n').length, [editorContent]);
  const varCount = Object.keys(variables).length;

  /* ─── Live preview LaTeX (simple mode only) ─────────────────────
   * 只做本地轻量排版（`liteLatex`），不触碰 mathjs —— 光标移进表达式行
   * 不应该在后台下载求解引擎。真正的解析与计算仍只在运行时发生。 */
  const previewLatex = useMemo(() => {
    if (inputMode !== 'simple') return '';
    const line = editorContent.split('\n')[previewLine - 1];
    return line ? toLiteLatex(line) : '';
  }, [previewLine, editorContent, inputMode]);

  // 任何编辑 / 切换文件都会改变行号与内容的对应关系，行尾结果立即清空。
  useEffect(() => {
    setInlineResults([]);
  }, [editorContent]);

  /* ─── Run script ───────────────────────────────────────────────── */
  const runScriptTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // P2-1: target='independent' 时，把绘图结果额外送入「独立运行结果面板」
  //（可拖拽/缩放/多开的 MATLAB figure 风格浮窗），而非仅预览面板。
  const runScript = useCallback((target: 'preview' | 'independent' = 'preview', source?: string, sourceStartLine = 1) => {
    if (isRunning) return;
    setIsRunning(true);
    // Defer to allow UI to show running state.
    clearTimeout(runScriptTimerRef.current);
    runScriptTimerRef.current = setTimeout(async () => {
      try {
        // 真正运行时才加载求解引擎（mathjs）：打开编辑器 / 浏览代码不需要它。
        const { evaluateExpressionAsync, resetScope } = await import('@/lib/engine');
        const lines = (source ?? editorContent).split('\n');
        let lastResult: CalculationResult | null = null;
        let plotAdded = false;
        let surface3dAdded = false;
        let matrixSeen = false;
        let resultCount = 0;
        // 收集本次运行的 2D 绘图（供 target='independent' 时送入独立面板）。
        const runPlots: Array<{ expression: string; xRange: [number, number]; plotType: Plot2DType; color: string }> = [];
        // 行尾结果胶囊：行号 = 源起始行 + 循环下标（选区运行也能对回原文件）。
        const nextInline: InlineResult[] = [];
        const PLOT_COLORS = ['#2dd4bf', '#fbbf24', '#fb7185', '#34d399', '#a78bfa', '#fb923c'];
        let plotColorIdx = 0;

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();

          // ── 计算块分隔符：--- 重置 scope，允许在同一文件中写多个独立计算块 ──
          if (line === '---' || line === '%%%') {
            resetScope();
            // Also clear the panel so it doesn't show variables that no
            // longer exist in the engine scope.
            clearVariables();
            continue;
          }

          if (!line || line.startsWith('#') || line.startsWith('//')) continue;

          // Use async evaluator to support symbolic operations (algebrite).
          const result = await evaluateExpressionAsync(line, inputMode);
          const latex = result.latex || (result.success ? '' : '');
          const calcResult = {
            id: `r-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
            input: line,
            output: result.result,
            latex,
            timestamp: Date.now(),
            type: result.type,
            error: result.error,
            isMatrix: result.isMatrix,
            matrix: result.matrix,
            plotExpression: result.plotExpression,
            plotType: result.plotType,
            surfaceMode: result.surfaceMode,
            plotRange: result.plotRange,
          };
          addResult(calcResult);
          lastResult = calcResult;
          resultCount++;

          const inlineText = !result.success
            ? `错误: ${result.error ?? '无法计算'}`
            : result.plotExpression
              ? `图像: ${result.plotExpression}`
              : `= ${result.result}`;
          nextInline.push({
            line: sourceStartLine + i,
            text: clipInlineText(inlineText),
            error: !result.success,
          });

          if (result.isMatrix) matrixSeen = true;

          // If assignment, capture the variable from scope
          if (result.type === 'assignment' && result.variables) {
            for (const [k, v] of Object.entries(result.variables)) {
              const vType = detectType(v);
              setVariable(k, { name: k, value: v, type: vType });
            }
          }

          // If plot, add to plots array
          if (result.plotExpression && result.plotType) {
            const color = PLOT_COLORS[plotColorIdx % PLOT_COLORS.length];
            plotColorIdx++;
            // 3D 曲面的 yRange 是自变量 y 的定义域（不是屏幕 Y 轴），
            // 这里统一由 buildPlotConfig 处理，2D / 3D 不再混用。
            const newPlot = buildPlotConfig(result, color);
            if (newPlot) addPlot(newPlot);
            // 收集 2D 绘图供独立面板使用（3D 曲面与尚未接入采样的
            // 2D 隐式曲线暂不入独立面板）。
            if (result.plotType !== 'surface3d' && result.plotType !== 'implicit2d') {
              runPlots.push({
                expression: result.plotExpression,
                xRange: result.plotRange ?? DEFAULT_CARTESIAN_RANGE,
                plotType: result.plotType,
                color,
              });
            }
            if (result.plotType === 'surface3d') surface3dAdded = true;
            else plotAdded = true;
          }
        }

        if (lastResult) setCurrentResult(lastResult);
        setInlineResults(nextInline);

        // ── 自动切换预览标签 ──────────────────────────────────────────
        // 优先级：3D 图 > 2D 图 > 多结果(日志) > 矩阵(公式) > 单结果(公式)
        if (surface3dAdded) {
          setActivePreviewTab('plot3d');
        } else if (plotAdded) {
          setActivePreviewTab('plot2d');
        } else if (resultCount > 1) {
          // 多行结果时切换到日志，让用户看到所有步骤
          setActivePreviewTab('log');
        } else if (matrixSeen) {
          setActivePreviewTab('formula');
        } else if (resultCount === 1) {
          // 单个数值/赋值结果：切到公式页。
          // 否则用户停在「绘图 / 3D」页运行 11*11 时，右侧没有任何变化，
          // 会误以为没有运行成功。
          setActivePreviewTab('formula');
        }

        // ── P2-1: 运行到独立面板 ─────────────────────────────────────
        // 把本次 2D 绘图采样成点集，归一化为 RunCurve 送入独立结果面板。
        if (target === 'independent' && runPlots.length > 0) {
          const { sampleFunction } = await import('@/lib/plots/plot2d');
          const add = useRunResultsStore.getState().addRunResult;
          for (const p of runPlots) {
            const samples = sampleFunction(p.expression, p.xRange, p.plotType)
              .filter((s) => Number.isFinite(s.x) && Number.isFinite(s.y))
              .map((s) => [s.x, s.y] as [number, number]);
            if (samples.length === 0) continue;
            add({
              title: p.expression,
              kind: 'plot',
              curves: [{
                id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                label: p.expression,
                color: p.color,
                width: 2,
                points: samples,
              }],
            });
          }
          // 提示用户结果在哪查看：浮窗右上角可拖拽/缩放，「关闭全部」可清空。
          toast.success('结果已送入独立浮窗', { description: '可拖拽/缩放，右上角关闭全部；如需结构化查看，请前往「蓝图」', duration: 3200 });
        }

        toast.success(`运行完成 · ${resultCount} 个结果`, { duration: 1200 });
        // 手机端：运行选中后切到预览，结果 / 曲线才看得见。
        if (source) {
          window.dispatchEvent(new CustomEvent('omnimath:mobile-tab', { detail: 'preview' }));
        }
      } catch (err) {
        toast.error('运行出错', { description: (err as Error).message });
      } finally {
        setIsRunning(false);
      }
    }, 80);
  }, [
    editorContent,
    inputMode,
    isRunning,
    addResult,
    setCurrentResult,
    setVariable,
    clearVariables,
    addPlot,
    setActivePreviewTab,
  ]);

  // Clean up timers on unmount.
  useEffect(() => {
    return () => {
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
      if (runScriptTimerRef.current) clearTimeout(runScriptTimerRef.current);
    };
  }, []);

  /* ─── Global run-all event from command palette ───────────────── */
  useEffect(() => {
    const handler = () => runScript();
    window.addEventListener('omnimath:run-all', handler);
    return () => window.removeEventListener('omnimath:run-all', handler);
  }, [runScript]);

  // 菜单 / 命令面板：运行到独立浮窗（MATLAB figure 风格，可拖拽 / 缩放 / 多开）。
  useEffect(() => {
    const handler = () => runScript('independent');
    window.addEventListener('omnimath:run-independent', handler);
    return () => window.removeEventListener('omnimath:run-independent', handler);
  }, [runScript]);

  /* ─── Global run shortcut (Ctrl/Cmd+Enter from settings) ──────── */
  // 编辑器自身由 CodeMirror keymap 处理 Ctrl+Enter；这里补上焦点在
  // 画布/蓝图等其它区域时的全局运行，使设置页里的「运行」快捷键真正生效。
  useEffect(() => registerShortcutHandler('run', () => runScript()), [runScript]);

  /* ─── Reset scope ──────────────────────────────────────────────── */
  const handleReset = useCallback(() => {
    try {
      // clearVariables 会同时清空 store 与引擎作用域（引擎按需加载）。
      clearHistory();
      clearVariables();
      clearPlots();
      setEditorContent(DEFAULT_SCRIPT);
      toast.success(t('commonReset'));
    } catch (err) {
      toast.error('重置出错', { description: (err as Error).message });
    }
  }, [clearHistory, clearVariables, clearPlots, setEditorContent]);

  const handleClear = useCallback(() => {
    setEditorContent('');
  }, [setEditorContent]);

  /* ─── Render ───────────────────────────────────────────────────── */
  // 函数输入器是独立界面，不再套编辑器的工具栏与代码专属 UI。
  if (inputView === 'demos') {
    return (
      <div className="h-full min-h-0 overflow-hidden bg-background/40">
        <Suspense fallback={<FunctionInputLoading />}>
          <FunctionInputPanel />
        </Suspense>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background/60">
      {/* Toolbar —— @container：面板被拖窄或平板竖屏时按容器宽度收缩，
          避免模式切换、统计、操作按钮互相重叠。 */}
      <div className="@container shrink-0 h-9 flex items-center justify-between px-2.5 gap-2 border-b border-border/60 bg-background/40">
        {/* Left: label + mode switch */}
        <div className="flex items-center gap-2 min-w-0">
          {/* 代码 / 函数输入器切换已上移到顶栏 TitleBar，此处不再重复，避免工具栏拥挤 */}
          <div className="flex items-center gap-1.5 shrink-0">
            <FileCode2 className="size-3.5 text-primary" />
            <span className="text-[11.5px] font-semibold tracking-tight hidden @[360px]:inline">
              {t('editorTitle')}
            </span>
            {/* 手机端顶栏没有输入界面切换，这里提供一个入口。 */}
            <button
              type="button"
              onClick={() => setInputView('demos')}
              className="md:hidden inline-flex h-6 items-center gap-1 rounded-md border border-border/60 px-1.5 text-[10.5px] text-muted-foreground hover:bg-accent/60 hover:text-foreground"
            >
              <FunctionSquare className="size-3" />
              函数
            </button>
          </div>
          {/* Mode switcher —— 仅在代码编辑器模式下显示；
              函数输入器有自己的界面，不需要 简单/Python/MATLAB。
              窄容器用下拉框替代三段按钮，避免挤压。 */}
          {inputView === 'code' && (
            <>
              <div className="hidden @[430px]:flex items-center gap-0.5 p-0.5 rounded-md bg-muted/60 border border-border/60">
                {MODES.map((m) => (
                  <Tooltip key={m.id}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => setInputMode(m.id)}
                        className={cn(
                          'h-5 px-2 text-[10.5px] rounded transition-all font-medium',
                          inputMode === m.id
                            ? 'bg-primary/15 text-primary shadow-sm'
                            : 'text-muted-foreground hover:text-foreground',
                        )}
                      >
                        {t(m.labelKey)}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-[200px]">
                      {MODE_DESCRIPTION[m.id]}
                    </TooltipContent>
                  </Tooltip>
                ))}
              </div>
              <Select
                value={inputMode}
                onValueChange={(v) => setInputMode(v as InputMode)}
              >
                <SelectTrigger
                  className="flex @[430px]:hidden h-6 w-[82px] px-2 text-[10.5px] rounded-md bg-muted/60 border-border/60"
                  aria-label={t('editorTitle')}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MODES.map((m) => (
                    <SelectItem key={m.id} value={m.id} className="text-[11px]">
                      {t(m.labelKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}
        </div>

        {/* Center: stats（窄容器隐藏，优先保证编辑与运行） */}
        <div className="hidden @[520px]:flex items-center gap-2 text-[10.5px] text-muted-foreground font-mono">
          <span>{lineCount} {t('editorLines')}</span>
          <span className="text-border">|</span>
          <span>{varCount} {t('editorVars')}</span>
        </div>

        {/* Right: actions —— 仅代码编辑器模式显示；
            函数输入器使用自己的输入与绘图按钮，
            隐藏符号面板/重置/清空/运行等代码编辑专属按键，避免困惑。 */}
        {inputView === 'code' && (
        <div className="flex items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => setSymbolPaletteOpen(!symbolPaletteOpen)}
                aria-label={t('symbolPaletteToggle')}
                className={cn(
                  'grid place-items-center size-7 rounded-md transition-colors',
                  symbolPaletteOpen
                    ? 'bg-primary/15 text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                <Sigma className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{t('symbolPaletteToggle')}</TooltipContent>
          </Tooltip>
          {/* 重置 / 清空收进「更多」：两个低频且不可撤销的操作不再占用
              主工具栏，也避免「橡皮」图标在编辑器里被误读为擦除笔迹。 */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={t('editorMore')}
                title={t('editorMore')}
                className="grid place-items-center size-7 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                <MoreHorizontal className="size-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onClick={handleReset} className="gap-2 text-[11.5px]">
                <Eraser className="size-3.5" />
                <span>{t('editorReset')}</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={handleClear}
                className="gap-2 text-[11.5px] text-rose-500 focus:text-rose-500"
              >
                <Trash2 className="size-3.5" />
                <span>{t('editorClear')}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <motion.button
                type="button"
                onClick={() => runScript()}
                disabled={isRunning}
                whileTap={{ scale: 0.95 }}
                whileHover={{ scale: 1.02 }}
                className={cn(
                  'relative flex items-center gap-1.5 h-7 px-3 ml-1 rounded-md text-[11.5px] font-medium',
                  'text-primary-foreground transition-all',
                  'bg-gradient-to-r from-primary to-primary/80',
                )}
                style={{
                  boxShadow: isRunning
                    ? '0 0 0 2px oklch(0.7 0.15 165 / 30%), 0 0 16px oklch(0.7 0.15 165 / 40%)'
                    : '0 0 0 1px oklch(0.7 0.15 165 / 25%), 0 4px 12px oklch(0.7 0.15 165 / 18%)',
                }}
                aria-label={t('editorRun')}
              >
                <AnimatePresence mode="wait" initial={false}>
                  {isRunning ? (
                    <motion.span
                      key="running"
                      initial={{ opacity: 0, scale: 0.5 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.5 }}
                    >
                      <Loader2 className="size-3.5 animate-spin" />
                    </motion.span>
                  ) : (
                    <motion.span
                      key="play"
                      initial={{ opacity: 0, scale: 0.5 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.5 }}
                    >
                      <Play className="size-3.5" fill="currentColor" />
                    </motion.span>
                  )}
                </AnimatePresence>
                <span className="hidden @[360px]:inline">{t('editorRun')}</span>
              </motion.button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {t('editorRun')} · Ctrl+Enter
            </TooltipContent>
          </Tooltip>
        </div>
        )}
      </div>

      {/* 代码模式内容（函数输入器在上方已提前返回） */}
      <>
      {/* Tab bar */}
      {openTabs.length > 0 && (
        <div
          role="tablist"
          className="shrink-0 flex items-stretch overflow-x-auto border-b border-border/60 bg-muted/20"
        >
          {openTabs.map((tabId) => {
            const node = fsNodes[tabId];
            if (!node) return null;
            const isActive = tabId === activeFileId;
            // Only the active tab can be dirty: edits live in the editor
            // and are flushed to the node on switch/close, so non-active
            // tabs are always saved.
            const isDirty = isActive && (node.content ?? '') !== editorContent;
            return (
              <div
                key={tabId}
                role="tab"
                aria-selected={isActive}
                title={node.name}
                onClick={() => handleTabSelect(tabId)}
                onAuxClick={(e) => {
                  // Middle-click closes the tab (VSCode-style).
                  if (e.button !== 1) return;
                  e.preventDefault();
                  handleTabClose(tabId);
                }}
                className={cn(
                  'group flex items-center gap-1.5 h-7 pl-2.5 pr-1 shrink-0 cursor-pointer select-none',
                  'border-r border-border/40 text-[11px] font-mono transition-colors',
                  isActive
                    ? 'bg-background text-foreground shadow-[inset_0_2px_0_0_var(--primary)]'
                    : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground',
                )}
              >
                <span className="truncate max-w-36">{node.name}</span>
                {isDirty && (
                  <span className="size-1.5 shrink-0 rounded-full bg-primary" />
                )}
                <button
                  type="button"
                  aria-label={tPending('editorTabClose')}
                  onClick={(e) => handleTabClose(tabId, e)}
                  className="grid size-4 shrink-0 place-items-center rounded opacity-0 group-hover:opacity-100 hover:bg-accent hover:text-foreground transition-opacity"
                >
                  <X className="size-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Editor area — 永远保持可输入。
          之前当「未打开文件且内容为空」时会用空状态替换整个编辑器，
          用户按 Ctrl+A + Delete 清空后编辑器直接消失、无法继续输入。 */}
      <div ref={editorContainerRef} className="relative flex-1 min-h-0 flex overflow-hidden">
        <CodeEditor
          value={editorContent}
          onChange={setEditorContent}
          onRun={runScript}
          onRunSelection={(code, startLine) => runScript('preview', code, startLine ?? 1)}
          onCursorChange={(line) => {
            // Debounced preview update.
            if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
            previewTimerRef.current = setTimeout(() => setPreviewLine(line), 200);
          }}
          language={inputMode}
          placeholder={t('editorPlaceholder')}
          fontSize={editorFontSize}
          inlineResults={inlineResults}
        />
        {/* 当前行公式镜头：浮在编辑器右下角，不占布局高度，光标移动时不再
            让整段代码上下跳动。纯展示，不拦截点击。 */}
        {inputMode === 'simple' && previewLatex && (
          <div
            aria-hidden
            className="pointer-events-none absolute bottom-2 right-3 z-10 max-w-[62%] overflow-hidden rounded-md border border-border/60 bg-background/85 px-2.5 py-1 shadow-sm backdrop-blur-sm"
          >
            <div className="flex items-center gap-2">
              <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
                {t('editorLivePreview')}
              </span>
              <FormulaRenderer
                latex={previewLatex}
                displayMode={false}
                className="min-w-0 truncate text-[13px]"
              />
            </div>
          </div>
        )}
      </div>

      {/* Symbol palette (collapsible) */}
      <SymbolPalette />
        </>
    </div>
  );
}

/* ─── Helpers ──────────────────────────────────────────────────── */
function detectType(v: unknown): 'number' | 'matrix' | 'string' | 'boolean' | 'complex' | 'function' | 'unit' {
  if (typeof v === 'number') return 'number';
  if (typeof v === 'boolean') return 'boolean';
  if (typeof v === 'string') return 'string';
  if (typeof v === 'function') return 'function';
  if (Array.isArray(v)) return 'matrix';
  if (v && typeof v === 'object') {
    if ('re' in v && 'im' in v) return 'complex';
    // mathjs matrix or unit
    if ('valueOf' in v && typeof (v as any).valueOf === 'function') {
      const val = (v as any).valueOf();
      if (Array.isArray(val)) return 'matrix';
      if (typeof val === 'number') return 'number';
    }
    if ('toJSON' in v && (v as any).mathjs === 'Unit') return 'unit';
  }
  return 'string';
}
