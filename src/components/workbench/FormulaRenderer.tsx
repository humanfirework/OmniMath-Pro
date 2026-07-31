'use client';

/**
 * OmniMath Pro — KaTeX Formula Renderer
 *
 * Pure, reusable wrapper around `katex.renderToString` with:
 *   - `displayMode` prop (block vs inline)
 *   - `throwOnError: false` so malformed LaTeX never crashes the UI
 *   - Bright color in dark mode (#ececec via globals.css `.dark .katex`)
 *   - Optional copy-to-clipboard button (top-right)
 *   - Zoom controls (0.6x - 2.0x)
 *   - Collapsible long formulas
 *
 * Used by the preview panel, history cards, formula library, etc.
 */

import { useMemo, useState, useRef, useLayoutEffect, useCallback } from 'react';
import katex from 'katex';
import {
  Check,
  Copy,
  ZoomIn,
  ZoomOut,
  ChevronDown,
  ChevronUp,
  Download,
  FileImage,
  FileCode,
  FileText,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { t } from '@/lib/i18n';
import { useWorkbenchStore } from '@/lib/store/workbench';
import { useSettingsStore } from '@/lib/store/settingsStore';
import { exportFormula, type FormulaFormat } from '@/lib/formulaExport';

interface FormulaRendererProps {
  /** LaTeX source string. Empty strings render nothing. */
  latex: string;
  /** Block (true) or inline (false) — default true. */
  displayMode?: boolean;
  /** Show a copy-Latex button in the top-right corner. */
  showCopy?: boolean;
  /** Show an export dropdown (PNG / SVG / LaTeX) in the top-right corner. */
  showExport?: boolean;
  /** Optional className for the outer wrapper. */
  className?: string;
  /** Optional title shown above the rendered formula. */
  title?: string;
  /** Enable collapsible long formulas. */
  collapsible?: boolean;
  /** Start collapsed when `collapsible` is true. */
  defaultCollapsed?: boolean;
  /** Font mode — `katex` (default KaTeX fonts), `stix` (STIX Two Math via CDN), or `system` (system-ui). */
  fontMode?: 'katex' | 'stix' | 'system';
  /** Base font size (px) for the rendered/exported formula. When omitted,
   *  falls back to the global `defaultFormulaFontSize` setting (default 28).
   *  Pass an explicit value to override on a per-call basis. */
  fontSize?: number;
  /** Enable auto-shrink to fit container width using ResizeObserver.
   *  If rendered scrollWidth exceeds container clientWidth, shrinks 0.5pt
   *  at a time (minimum 10px) until it fits. Default false. */
  fitToContainer?: boolean;
  /** Optional max height for the formula area (collapsed state uses this value
   *  when collapsible is enabled). Default undefined = no limit. */
  maxHeight?: number;
}

const MIN_SCALE = 0.6;
const MAX_SCALE = 2.0;
const SCALE_STEP = 0.15;
const COLLAPSED_HEIGHT = 120;

export function FormulaRenderer({
  latex,
  displayMode = true,
  showCopy = false,
  showExport = false,
  className,
  title,
  collapsible = false,
  defaultCollapsed = false,
  fontMode = 'katex',
  fontSize,
  fitToContainer = false,
  maxHeight,
}: FormulaRendererProps) {
  const [copied, setCopied] = useState(false);
  const [scale, setScale] = useState(1);
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const [canCollapse, setCanCollapse] = useState(false);
  const [exporting, setExporting] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const outerRef = useRef<HTMLDivElement>(null);
  const theme = useWorkbenchStore((s) => s.theme);
  const defaultFormulaFontSize = useSettingsStore((s) => s.defaultFormulaFontSize);
  const baseFontSize = fontSize ?? defaultFormulaFontSize ?? 28;

  const hasComplexEnv = useMemo(() => {
    const envRegex = /\\begin\{(matrix|bmatrix|pmatrix|vmatrix|Vmatrix|smallmatrix|cases|aligned|gathered|multline)\}/;
    return envRegex.test(latex);
  }, [latex]);

  const html = useMemo(() => {
    if (!latex) return '';
    try {
      const rendered = katex.renderToString(latex, {
        displayMode,
        throwOnError: false,
        strict: false,
        output: 'html',
        trust: false,
        maxSize: 12,
        macros: {
          '\\R': '\\mathbb{R}',
          '\\N': '\\mathbb{N}',
          '\\Z': '\\mathbb{Z}',
          '\\Q': '\\mathbb{Q}',
          '\\C': '\\mathbb{C}',
        },
      });
      if (hasComplexEnv) {
        return `<span style="padding: 0.25em 0.4em; display: inline-block;">${rendered}</span>`;
      }
      return rendered;
    } catch {
      return `<span class="katex-error">${escapeHtml(latex)}</span>`;
    }
  }, [latex, displayMode, hasComplexEnv]);

  useLayoutEffect(() => {
    if (collapsible && contentRef.current) {
      const collapseHeight = maxHeight ?? COLLAPSED_HEIGHT;
      setCanCollapse(contentRef.current.scrollHeight > collapseHeight);
    } else {
      setCanCollapse(false);
    }
  }, [collapsible, html, maxHeight]);

  useLayoutEffect(() => {
    if (!fitToContainer || !outerRef.current || !contentRef.current) return;

    const container = outerRef.current;
    const content = contentRef.current;

    const adjustFontSize = () => {
      let currentSize = parseFloat(
        getComputedStyle(content).fontSize || String(baseFontSize),
      );
      const maxIterations = 60;
      let iterations = 0;

      while (
        iterations < maxIterations &&
        content.scrollWidth > container.clientWidth &&
        currentSize > 10
      ) {
        currentSize -= 0.5;
        content.style.fontSize = `${currentSize}px`;
        iterations++;
      }
    };

    adjustFontSize();

    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => {
        content.style.fontSize = '';
        adjustFontSize();
      });
      ro.observe(container);
      return () => ro.disconnect();
    }
  }, [fitToContainer, html, baseFontSize]);

  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(latex);
      setCopied(true);
      clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 1400);
    } catch {
      /* ignore */
    }
  };

  const handleZoomIn = () => setScale((s) => Math.min(MAX_SCALE, s + SCALE_STEP));
  const handleZoomOut = () => setScale((s) => Math.max(MIN_SCALE, s - SCALE_STEP));
  const handleResetZoom = () => setScale(1);

  const handleExport = useCallback(
    async (format: FormulaFormat) => {
      if (exporting) return;
      setExporting(true);
      try {
        // 导出字号随当前缩放联动（baseFontSize × scale），保证导出与所见一致
        await exportFormula(latex, {
          format,
          defaultName: `omnimath-formula-${Date.now()}`,
          dpi: 2,
          displayMode,
          theme,
          fontSize: Math.round(baseFontSize * scale),
        });
      } finally {
        setExporting(false);
      }
    },
    [latex, displayMode, theme, scale, exporting, baseFontSize],
  );

  if (!latex) return null;

  const showToolbar = displayMode && (collapsible || showCopy || showExport);

  const fontModeClassName = fontMode === 'stix' ? 'stix-mode' : undefined;
  const fontModeStyle =
    fontMode === 'stix'
      ? { fontFamily: 'var(--font-math)' }
      : fontMode === 'system'
        ? { fontFamily: 'system-ui' }
        : undefined;

  return (
    <div
      className={cn(
        'relative group/formula',
        displayMode && 'flex flex-col',
        fontModeClassName,
        className,
      )}
      style={fontModeStyle}
      title={title}
    >
      {showToolbar && (
        <div className="flex items-center justify-end gap-0.5 px-1 py-1 opacity-0 group-hover/formula:opacity-100 transition-opacity">
          {collapsible && canCollapse && (
            <button
              type="button"
              onClick={() => setIsCollapsed((v) => !v)}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10.5px] font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              aria-label={isCollapsed ? t('commonExpand') : t('commonCollapse')}
            >
              {isCollapsed ? (
                <>
                  <ChevronDown className="size-3" />
                  {t('commonExpand')}
                </>
              ) : (
                <>
                  <ChevronUp className="size-3" />
                  {t('commonCollapse')}
                </>
              )}
            </button>
          )}
          <div className="flex items-center rounded-md border border-border/60 bg-background/60 overflow-hidden">
            <button
              type="button"
              onClick={handleZoomOut}
              disabled={scale <= MIN_SCALE}
              className="grid place-items-center size-6 text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-40 transition-colors"
              aria-label={t('previewZoomOut')}
            >
              <ZoomOut className="size-3" />
            </button>
            <button
              type="button"
              onClick={handleResetZoom}
              className="px-1.5 text-[10px] font-mono text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              aria-label={t('previewReset')}
            >
              {Math.round(scale * 100)}%
            </button>
            <button
              type="button"
              onClick={handleZoomIn}
              disabled={scale >= MAX_SCALE}
              className="grid place-items-center size-6 text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-40 transition-colors"
              aria-label={t('previewZoomIn')}
            >
              <ZoomIn className="size-3" />
            </button>
          </div>
          {showCopy && (
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10.5px] font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              aria-label={copied ? t('commonCopied') : t('commonCopy')}
            >
              {copied ? (
                <Check className="size-3 text-emerald-500" />
              ) : (
                <Copy className="size-3" />
              )}
              {copied ? t('commonCopied') : t('commonCopy')}
            </button>
          )}
          {showExport && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  disabled={exporting}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10.5px] font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-40"
                  aria-label={t('formulaExport')}
                >
                  <Download className="size-3" />
                  {t('formulaExport')}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  {t('formulaExportHint')}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => handleExport('png')}
                  className="gap-2 cursor-pointer"
                >
                  <FileImage className="size-3.5 text-primary" />
                  <span className="text-xs">{t('formulaExportPNG')}</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleExport('svg')}
                  className="gap-2 cursor-pointer"
                >
                  <FileCode className="size-3.5 text-primary" />
                  <span className="text-xs">{t('formulaExportSVG')}</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleExport('latex')}
                  className="gap-2 cursor-pointer"
                >
                  <FileText className="size-3.5 text-primary" />
                  <span className="text-xs">{t('formulaExportLatex')}</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      )}

      <div
        ref={outerRef}
        className={cn(
          'overflow-x-auto',
          displayMode && 'py-1',
          isCollapsed && canCollapse && maxHeight !== undefined
            ? 'overflow-y-hidden'
            : 'overflow-y-visible',
        )}
        style={
          isCollapsed && canCollapse && maxHeight !== undefined
            ? { maxHeight: `${maxHeight}px` }
            : undefined
        }
      >
        <div
          ref={contentRef}
          // katex.renderToString already returns safe HTML
          dangerouslySetInnerHTML={{ __html: html }}
          className={displayMode ? 'katex-display-wrap' : 'inline'}
          style={{
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            display: displayMode ? 'inline-block' : 'inline',
            minWidth: displayMode ? '100%' : undefined,
            width: displayMode ? 'max-content' : undefined,
          }}
        />
      </div>

      {isCollapsed && canCollapse && (
        <div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-background to-transparent pointer-events-none" />
      )}
    </div>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
