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

import { useMemo, useState, useRef, useLayoutEffect } from 'react';
import katex from 'katex';
import {
  Check,
  Copy,
  ZoomIn,
  ZoomOut,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { t } from '@/lib/i18n';

interface FormulaRendererProps {
  /** LaTeX source string. Empty strings render nothing. */
  latex: string;
  /** Block (true) or inline (false) — default true. */
  displayMode?: boolean;
  /** Show a copy-Latex button in the top-right corner. */
  showCopy?: boolean;
  /** Optional className for the outer wrapper. */
  className?: string;
  /** Optional title shown above the rendered formula. */
  title?: string;
  /** Enable collapsible long formulas. */
  collapsible?: boolean;
  /** Start collapsed when `collapsible` is true. */
  defaultCollapsed?: boolean;
}

const MIN_SCALE = 0.6;
const MAX_SCALE = 2.0;
const SCALE_STEP = 0.15;
const COLLAPSED_HEIGHT = 120;

export function FormulaRenderer({
  latex,
  displayMode = true,
  showCopy = false,
  className,
  title,
  collapsible = false,
  defaultCollapsed = false,
}: FormulaRendererProps) {
  const [copied, setCopied] = useState(false);
  const [scale, setScale] = useState(1);
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const [canCollapse, setCanCollapse] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const html = useMemo(() => {
    if (!latex) return '';
    try {
      return katex.renderToString(latex, {
        displayMode,
        throwOnError: false,
        strict: false,
        output: 'html',
        trust: false,
        maxSize: 5,
        macros: {
          '\\R': '\\mathbb{R}',
          '\\N': '\\mathbb{N}',
          '\\Z': '\\mathbb{Z}',
          '\\Q': '\\mathbb{Q}',
          '\\C': '\\mathbb{C}',
        },
      });
    } catch {
      // Shouldn't happen with throwOnError:false, but be defensive.
      return `<span class="katex-error">${escapeHtml(latex)}</span>`;
    }
  }, [latex, displayMode]);

  useLayoutEffect(() => {
    if (collapsible && contentRef.current) {
      setCanCollapse(contentRef.current.scrollHeight > COLLAPSED_HEIGHT);
    } else {
      setCanCollapse(false);
    }
  }, [collapsible, html]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(latex);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* ignore */
    }
  };

  const handleZoomIn = () => setScale((s) => Math.min(MAX_SCALE, s + SCALE_STEP));
  const handleZoomOut = () => setScale((s) => Math.max(MIN_SCALE, s - SCALE_STEP));
  const handleResetZoom = () => setScale(1);

  if (!latex) return null;

  const showToolbar = displayMode && (collapsible || showCopy);

  return (
    <div
      className={cn(
        'relative group/formula',
        displayMode && 'flex flex-col',
        className,
      )}
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
        </div>
      )}

      <div
        className={cn(
          'overflow-x-auto overflow-y-hidden',
          displayMode && 'py-1',
        )}
        style={{
          maxHeight: isCollapsed ? COLLAPSED_HEIGHT : undefined,
        }}
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
