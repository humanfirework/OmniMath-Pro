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
 *  - Enter = run (no shift)
 *  - Shift+Enter = newline
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
  Loader2,
  Settings2,
  X,
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useWorkbenchStore, STORAGE_KEY } from '@/lib/store/workbench';
import { useFileSystemStore } from '@/lib/store/fileSystemStore';
import { useSettingsStore } from '@/lib/store/settingsStore';
import {
  evaluateExpressionAsync,
  getScope,
  resetScope,
  inputToLatex,
  type InputMode,
} from '@/lib/engine';
import { DEFAULT_CARTESIAN_RANGE } from '@/lib/engine/types';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { CalculationResult, PlotConfig } from '@/lib/store/workbench';
import { CodeEditor } from '@/components/workbench/layout/CodeEditor';
import { FormulaRenderer } from '@/components/workbench/FormulaRenderer';

const DEFAULT_SCRIPT = `# OmniMath Pro — 示例脚本
# 按 Enter 运行，Shift+Enter 换行
# 用 --- 分隔不同计算块（重置变量）

# 矩阵运算
A = [1, 2; 3, 4]
det(A)

# 方程求解
solve(x^2 - 5*x + 6, x)

# 符号积分
integrate(x^2, x)

# 2D 绘图
plot(sin(x))

---

# 新的计算块（上面的变量已重置）
# 3D 曲面绘图
plot3d(sin(x)*cos(y))`;

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

/**
 * i18n keys added by the multi-tab feature, pending merge into
 * src/lib/i18n/index.ts (that file is owned by a separate change).
 * t() falls back to the key string at runtime; the cast only satisfies
 * the TranslationDict type constraint until the keys are merged.
 */
const tPending = (key: string): string => t(key as Parameters<typeof t>[0]);

export function EditorPanel() {
  const editorContent = useWorkbenchStore((s) => s.editorContent);
  const setEditorContent = useWorkbenchStore((s) => s.setEditorContent);
  const inputMode = useWorkbenchStore((s) => s.inputMode);
  const setInputMode = useWorkbenchStore((s) => s.setInputMode);
  const addResult = useWorkbenchStore((s) => s.addResult);
  const setCurrentResult = useWorkbenchStore((s) => s.setCurrentResult);
  const setVariable = useWorkbenchStore((s) => s.setVariable);
  const addPlot = useWorkbenchStore((s) => s.addPlot);
  const clearHistory = useWorkbenchStore((s) => s.clearHistory);
  const clearVariables = useWorkbenchStore((s) => s.clearVariables);
  const clearPlots = useWorkbenchStore((s) => s.clearPlots);
  const setActivePreviewTab = useWorkbenchStore((s) => s.setActivePreviewTab);
  const variables = useWorkbenchStore((s) => s.variables);

  const [cursor, setCursor] = useState({ line: 1, col: 1 });
  const [isRunning, setIsRunning] = useState(false);
  const [previewLine, setPreviewLine] = useState(1);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const defaultScriptSetRef = useRef(false);
  const editorContainerRef = useRef<HTMLDivElement | null>(null);

  /* ─── Editor font size from settings store ───────────────────── */
  const editorFontSize = useSettingsStore((s) => s.editorFontSize);
  const setEditorFontSize = useSettingsStore((s) => s.setEditorFontSize);

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

  // Initialize default script only on the very first app launch (no persisted
  // storage). Once storage exists, an empty editor is intentional — do not
  // restore the default script, even if this component remounts (e.g. after
  // switching from the pipeline view).
  useEffect(() => {
    if (!defaultScriptSetRef.current && typeof window !== 'undefined') {
      defaultScriptSetRef.current = true;
      const hasStorage = localStorage.getItem(STORAGE_KEY) !== null;
      if (!editorContent && !hasStorage) {
        setEditorContent(DEFAULT_SCRIPT);
      }
    }
  }, [editorContent, setEditorContent]);

  /* ─── File system integration ──────────────────────────────────── */
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

  // Clean up timers on unmount.
  useEffect(() => {
    return () => {
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
      if (runScriptTimerRef.current) clearTimeout(runScriptTimerRef.current);
    };
  }, []);

  const lineCount = useMemo(() => editorContent.split('\n').length, [editorContent]);
  const varCount = Object.keys(variables).length;

  /* ─── Live preview LaTeX (simple mode only) ───────────────────── */
  const previewLatex = useMemo(() => {
    if (inputMode !== 'simple') return '';
    const lines = editorContent.split('\n');
    const line = lines[previewLine - 1];
    if (!line) return '';
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) return '';
    return inputToLatex(line, 'simple');
  }, [previewLine, editorContent, inputMode]);

  /* ─── Run script ───────────────────────────────────────────────── */
  const runScriptTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const runScript = useCallback(() => {
    if (isRunning) return;
    setIsRunning(true);
    // Defer to allow UI to show running state.
    clearTimeout(runScriptTimerRef.current);
    runScriptTimerRef.current = setTimeout(async () => {
      try {
        const lines = editorContent.split('\n');
        let lastResult: CalculationResult | null = null;
        let plotAdded = false;
        let surface3dAdded = false;
        let matrixSeen = false;
        let resultCount = 0;
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
            plotRange: result.plotRange,
          };
          addResult(calcResult);
          lastResult = calcResult;
          resultCount++;

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
            const newPlot: Omit<PlotConfig, 'id'> = {
              expression: result.plotExpression,
              xRange: result.plotRange ?? DEFAULT_CARTESIAN_RANGE,
              yRange: [-50, 50],
              color,
              plotType: result.plotType,
              visible: true,
            };
            addPlot(newPlot);
            if (result.plotType === 'surface3d') surface3dAdded = true;
            else plotAdded = true;
          }
        }

        if (lastResult) setCurrentResult(lastResult);

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
        }

        toast.success(`运行完成 · ${resultCount} 个结果`, { duration: 1200 });
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

  /* ─── Global run-all event from command palette ───────────────── */
  useEffect(() => {
    const handler = () => runScript();
    window.addEventListener('omnimath:run-all', handler);
    return () => window.removeEventListener('omnimath:run-all', handler);
  }, [runScript]);

  /* ─── Reset scope ──────────────────────────────────────────────── */
  const handleReset = useCallback(() => {
    try {
      resetScope();
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
  return (
    <div className="flex flex-col h-full bg-background/60">
      {/* Toolbar */}
      <div className="shrink-0 h-9 flex items-center justify-between px-2.5 gap-2 border-b border-border/60 bg-background/40">
        {/* Left: label + mode switch */}
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex items-center gap-1.5">
            <FileCode2 className="size-3.5 text-primary" />
            <span className="text-[11.5px] font-semibold tracking-tight hidden sm:inline">
              {t('editorTitle')}
            </span>
          </div>
          {/* Mode switcher */}
          <div className="flex items-center gap-0.5 p-0.5 rounded-md bg-muted/60 border border-border/60">
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
        </div>

        {/* Center: stats */}
        <div className="hidden md:flex items-center gap-2 text-[10.5px] text-muted-foreground font-mono">
          <span>{lineCount} {t('editorLines')}</span>
          <span className="text-border">|</span>
          <span>{varCount} {t('editorVars')}</span>
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={handleReset}
                aria-label={t('editorReset')}
                className="grid place-items-center size-7 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                <Eraser className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{t('editorReset')}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={handleClear}
                aria-label={t('editorClear')}
                className="grid place-items-center size-7 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                <Trash2 className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{t('editorClear')}</TooltipContent>
          </Tooltip>
          <motion.button
            type="button"
            onClick={runScript}
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
            <span>{t('editorRun')}</span>
          </motion.button>
        </div>
      </div>

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

      {fsLoaded && openTabs.length === 0 ? (
        /* Empty state — no open tabs */
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
          <FileCode2 className="size-9 text-muted-foreground/30" />
          <p className="text-[12.5px] font-medium text-muted-foreground">
            {tPending('editorTabsEmptyTitle')}
          </p>
          <p className="text-[11px] text-muted-foreground/70">
            {tPending('editorTabsEmptyHint')}
          </p>
        </div>
      ) : (
        <>
          {/* Live preview bar (simple mode only) */}
          {inputMode === 'simple' && (
            <div className="shrink-0 min-h-10 max-h-48 flex items-start gap-2 px-2.5 py-2 border-b border-border/60 bg-muted/30 border-l-2 border-l-primary/60 overflow-x-auto overflow-y-auto">
              <span className="text-[12px] font-medium text-muted-foreground shrink-0 mt-0.5">
                {t('editorLivePreview')}:
              </span>
              {previewLatex ? (
                <FormulaRenderer
                  latex={previewLatex}
                  displayMode
                  className="min-w-0 flex-1 text-[13px]"
                />
              ) : (
                <span className="text-[12px] text-muted-foreground/70 mt-0.5">
                  {t('editorLivePreviewHint')}
                </span>
              )}
            </div>
          )}

          {/* Editor area */}
          <div ref={editorContainerRef} className="flex-1 min-h-0 flex overflow-hidden">
            <CodeEditor
              value={editorContent}
              onChange={setEditorContent}
              onRun={runScript}
              onCursorChange={(line, col) => {
                setCursor({ line, col });
                // Debounced preview update.
                if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
                previewTimerRef.current = setTimeout(() => setPreviewLine(line), 200);
              }}
              language={inputMode}
              placeholder={t('editorPlaceholder')}
              fontSize={editorFontSize}
            />
          </div>
        </>
      )}

      {/* Bottom info bar */}
      <div className="shrink-0 h-6 flex items-center justify-between px-2.5 text-[10.5px] text-muted-foreground border-t border-border/60 bg-background/40">
        <div className="flex items-center gap-3 font-mono">
          <span>↵ {t('editorEnterToEval')}</span>
          <span className="hidden sm:inline">⇧↵ {t('editorShiftEnterNewLine')}</span>
          <span className="hidden md:inline">⌘/ {t('editorCtrlSlashComment')}</span>
        </div>
        <div className="flex items-center gap-2 font-mono">
          <Settings2 className="size-3" />
          <span>{t('editorLn')} {cursor.line}, {t('editorCol')} {cursor.col}</span>
        </div>
      </div>
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
