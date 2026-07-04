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
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useWorkbenchStore, STORAGE_KEY } from '@/lib/store/workbench';
import {
  evaluateExpression,
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

const DEFAULT_SCRIPT = `# OmniMath Pro — 示例脚本
# 按 Enter 运行当前行，Shift+Enter 换行
2 + 3 * 4
sin(pi/4)
log(100)
A = [1, 2; 3, 4]
det(A)
sin(x)
solve(x^2 - 5*x + 6, x)`;

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

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const [cursor, setCursor] = useState({ line: 1, col: 1 });
  const [isRunning, setIsRunning] = useState(false);
  const defaultScriptSetRef = useRef(false);

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

  const lineCount = useMemo(() => editorContent.split('\n').length, [editorContent]);
  const varCount = Object.keys(variables).length;

  /* ─── Cursor position tracking ─────────────────────────────────── */
  const updateCursor = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const pos = ta.selectionStart ?? 0;
    const before = ta.value.slice(0, pos);
    const linesArr = before.split('\n');
    setCursor({ line: linesArr.length, col: (linesArr[linesArr.length - 1]?.length ?? 0) + 1 });
  }, []);

  /* ─── Run script ───────────────────────────────────────────────── */
  const runScript = useCallback(() => {
    if (isRunning) return;
    setIsRunning(true);
    // Defer to allow UI to show running state.
    setTimeout(() => {
      try {
        const lines = editorContent.split('\n');
        let lastResult: CalculationResult | null = null;
        let plotAdded = false;
        let surface3dAdded = false;
        let matrixSeen = false;
        const PLOT_COLORS = ['#2dd4bf', '#fbbf24', '#fb7185', '#34d399', '#a78bfa', '#fb923c'];
        let plotColorIdx = 0;

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line || line.startsWith('#') || line.startsWith('//')) continue;

          const result = evaluateExpression(line, inputMode);
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

        // Auto-switch preview tab
        if (surface3dAdded) setActivePreviewTab('plot3d');
        else if (plotAdded) setActivePreviewTab('plot2d');
        else if (matrixSeen) setActivePreviewTab('formula');

        toast.success('运行完成', { duration: 1200 });
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
    addPlot,
    setActivePreviewTab,
  ]);

  /* ─── Keyboard handling ────────────────────────────────────────── */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Enter (no shift) → run
      if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        runScript();
        return;
      }
      // Tab → indent 2 spaces
      if (e.key === 'Tab') {
        e.preventDefault();
        const ta = e.currentTarget;
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        const next = ta.value.slice(0, start) + '  ' + ta.value.slice(end);
        setEditorContent(next);
        requestAnimationFrame(() => {
          ta.selectionStart = ta.selectionEnd = start + 2;
        });
        return;
      }
      // Ctrl/Cmd + / → toggle line comment
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault();
        const ta = e.currentTarget;
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        const value = ta.value;
        // find line start of selection start
        const lineStart = value.lastIndexOf('\n', start - 1) + 1;
        const lineEndIdx = value.indexOf('\n', end);
        const lineEnd = lineEndIdx === -1 ? value.length : lineEndIdx;
        const selectedLines = value.slice(lineStart, lineEnd);
        const lines = selectedLines.split('\n');
        const allCommented = lines.every((l) => l.trimStart().startsWith('#'));
        const newLines = lines.map((l) =>
          allCommented ? l.replace(/^(\s*)#\s?/, '$1') : /^\s/.test(l) ? l.replace(/^(\s*)/, '$1# ') : '# ' + l,
        );
        const nextValue = value.slice(0, lineStart) + newLines.join('\n') + value.slice(lineEnd);
        setEditorContent(nextValue);
        requestAnimationFrame(() => {
          ta.selectionStart = lineStart;
          ta.selectionEnd = lineStart + newLines.join('\n').length;
        });
      }
    },
    [runScript, setEditorContent],
  );

  /* ─── Sync gutter scroll with textarea ─────────────────────────── */
  const handleScroll = useCallback(() => {
    const ta = textareaRef.current;
    const gutter = gutterRef.current;
    if (ta && gutter) {
      gutter.scrollTop = ta.scrollTop;
    }
  }, []);

  /* ─── Reset scope ──────────────────────────────────────────────── */
  const handleReset = useCallback(() => {
    resetScope();
    clearHistory();
    clearVariables();
    clearPlots();
    setEditorContent(DEFAULT_SCRIPT);
    toast.success(t('commonReset'));
  }, [clearHistory, clearVariables, clearPlots, setEditorContent]);

  const handleClear = useCallback(() => {
    setEditorContent('');
    requestAnimationFrame(() => textareaRef.current?.focus());
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

      {/* Editor area */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* Gutter */}
        <div
          ref={gutterRef}
          aria-hidden
          className="shrink-0 w-12 overflow-hidden select-none text-right py-3 px-2 font-mono text-[12px] leading-[1.65] text-muted-foreground/60 bg-muted/20 border-r border-border/60"
        >
          {Array.from({ length: lineCount }, (_, i) => (
            <div
              key={i}
              className={cn(
                'h-[1.65em] leading-[1.65em]',
                cursor.line === i + 1 && 'text-primary/80',
              )}
            >
              {i + 1}
            </div>
          ))}
        </div>

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={editorContent}
          onChange={(e) => setEditorContent(e.target.value)}
          onKeyDown={handleKeyDown}
          onKeyUp={updateCursor}
          onClick={updateCursor}
          onScroll={handleScroll}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          placeholder={t('editorPlaceholder')}
          className={cn(
            'editor-input flex-1 min-w-0 resize-none bg-transparent',
            'px-3 py-3 text-foreground font-mono text-[13.5px] leading-[1.65]',
            'placeholder:text-muted-foreground/50',
            'outline-none border-0',
          )}
          style={{ tabSize: 2 }}
        />
      </div>

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
