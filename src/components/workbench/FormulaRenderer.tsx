'use client';

/**
 * OmniMath Pro — KaTeX Formula Renderer
 *
 * Pure, reusable wrapper around `katex.renderToString` with:
 *   - `displayMode` prop (block vs inline)
 *   - `throwOnError: false` so malformed LaTeX never crashes the UI
 *   - Bright color in dark mode (#ececec via globals.css `.dark .katex`)
 *   - Optional copy-to-clipboard button (top-right)
 *
 * Used by the preview panel, history cards, formula library, etc.
 */

import { useMemo, useState } from 'react';
import katex from 'katex';
import { Check, Copy } from 'lucide-react';
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
}

export function FormulaRenderer({
  latex,
  displayMode = true,
  showCopy = false,
  className,
  title,
}: FormulaRendererProps) {
  const [copied, setCopied] = useState(false);

  const html = useMemo(() => {
    if (!latex) return '';
    try {
      return katex.renderToString(latex, {
        displayMode,
        throwOnError: false,
        strict: false,
        output: 'html',
        trust: false,
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

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(latex);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* ignore */
    }
  };

  if (!latex) return null;

  return (
    <div
      className={cn(
        'relative group/formula',
        displayMode && 'overflow-x-auto overflow-y-hidden py-1',
        className,
      )}
      title={title}
    >
      <div
        // katex.renderToString already returns safe HTML
        dangerouslySetInnerHTML={{ __html: html }}
        className={displayMode ? 'katex-display-wrap' : 'inline'}
      />
      {showCopy && (
        <button
          type="button"
          onClick={handleCopy}
          className="absolute top-1 right-1 opacity-0 group-hover/formula:opacity-100 transition-opacity rounded-md p-1.5 bg-background/80 border border-border hover:bg-accent text-muted-foreground hover:text-foreground"
          title={copied ? t('commonCopied') : t('commonCopy')}
          aria-label={copied ? t('commonCopied') : t('commonCopy')}
        >
          {copied ? (
            <Check className="size-3 text-emerald-500" />
          ) : (
            <Copy className="size-3" />
          )}
        </button>
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
