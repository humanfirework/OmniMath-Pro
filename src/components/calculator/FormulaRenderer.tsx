'use client';

import React, { useMemo, useState, useCallback, useRef } from 'react';
import katex from 'katex';
import { Copy, Check } from 'lucide-react';
import { useCalculatorStore } from '@/lib/calculator/store';
import { t } from '@/lib/calculator/i18n';

interface FormulaRendererProps {
  /** The LaTeX expression to render */
  expression: string;
  /** Whether to render in display (block) mode or inline mode */
  displayMode?: boolean;
  /** Callback when user copies the LaTeX source */
  onCopyLaTeX?: (latex: string) => void;
  /** Callback when user copies the rendered text */
  onCopyText?: (text: string) => void;
}

export function FormulaRenderer({
  expression,
  displayMode = true,
  onCopyLaTeX,
  onCopyText,
}: FormulaRendererProps) {
  const { theme } = useCalculatorStore();
  const [isHovered, setIsHovered] = useState(false);
  const [copiedLaTeX, setCopiedLaTeX] = useState(false);
  const [copiedText, setCopiedText] = useState(false);
  const formulaRef = useRef<HTMLDivElement>(null);

  const isDark = theme === 'dark';

  // Render the KaTeX formula, catching any LaTeX errors
  const { html, error } = useMemo(() => {
    if (!expression.trim()) {
      return { html: '', error: null };
    }
    try {
      const rendered = katex.renderToString(expression, {
        displayMode,
        throwOnError: true,
        strict: false,
        trust: true,
      });
      return { html: rendered, error: null };
    } catch (err) {
      // Fallback: try rendering in non-strict mode for partial output
      try {
        const partialRender = katex.renderToString(expression, {
          displayMode,
          throwOnError: false,
          strict: false,
          trust: true,
        });
        const errorMessage =
          err instanceof Error ? err.message : 'Invalid LaTeX expression';
        return { html: partialRender, error: errorMessage };
      } catch {
        return {
          html: '',
          error:
            err instanceof Error ? err.message : 'Invalid LaTeX expression',
        };
      }
    }
  }, [expression, displayMode]);

  const handleCopyLaTeX = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(expression);
      setCopiedLaTeX(true);
      onCopyLaTeX?.(expression);
      setTimeout(() => setCopiedLaTeX(false), 1500);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = expression;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopiedLaTeX(true);
      onCopyLaTeX?.(expression);
      setTimeout(() => setCopiedLaTeX(false), 1500);
    }
  }, [expression, onCopyLaTeX]);

  const handleCopyText = useCallback(async () => {
    const textContent = formulaRef.current?.textContent ?? expression;
    try {
      await navigator.clipboard.writeText(textContent);
      setCopiedText(true);
      onCopyText?.(textContent);
      setTimeout(() => setCopiedText(false), 1500);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = textContent;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopiedText(true);
      onCopyText?.(textContent);
      setTimeout(() => setCopiedText(false), 1500);
    }
  }, [expression, onCopyText]);

  const handleFormulaClick = useCallback(() => {
    handleCopyText();
  }, [handleCopyText]);

  // Empty expression state
  if (!expression.trim()) {
    return (
      <div
        className={`relative rounded-md border px-4 py-3 italic ${
          isDark
            ? 'border-[#3c3c3c] bg-[#1e1e1e] text-[#6a6a6a]'
            : 'border-[#e0e0e0] bg-[#fafafa] text-[#aaa]'
        }`}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {t('frEnterFormula')}
      </div>
    );
  }

  return (
    <div
      className={`group relative rounded-md border transition-all duration-200 ${
        isDark
          ? 'border-[#3c3c3c] bg-[#1e1e1e] hover:border-[#505050] hover:bg-[#252526]'
          : 'border-[#e0e0e0] bg-white hover:border-[#bbb] hover:bg-[#fafafa]'
      }`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        setCopiedLaTeX(false);
        setCopiedText(false);
      }}
    >
      {/* Copy action buttons — visible on hover */}
      <div
        className={`absolute right-2 top-2 flex items-center gap-1 transition-all duration-200 ${
          isHovered
            ? 'translate-y-0 opacity-100'
            : '-translate-y-1 opacity-0 pointer-events-none'
        }`}
      >
        {/* Copy LaTeX source */}
        <button
          type="button"
          onClick={handleCopyLaTeX}
          className={`flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors duration-150 ${
            isDark
              ? 'text-[#cccccc] bg-[#3c3c3c] hover:bg-[#505050] active:bg-[#5a5a5a]'
              : 'text-[#333] bg-[#f0f0f0] hover:bg-[#e0e0e0] active:bg-[#d0d0d0]'
          }`}
          title={t('frCopyLatex')}
          aria-label={t('frCopyLatex')}
        >
          {copiedLaTeX ? (
            <>
              <Check className="h-3 w-3 text-[#6a9955]" />
              <span className="text-[#6a9955]">{t('frCopied')}</span>
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              <span>{t('frCopyLatex')}</span>
            </>
          )}
        </button>

        {/* Copy rendered text */}
        <button
          type="button"
          onClick={handleCopyText}
          className={`flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors duration-150 ${
            isDark
              ? 'text-[#cccccc] bg-[#3c3c3c] hover:bg-[#505050] active:bg-[#5a5a5a]'
              : 'text-[#333] bg-[#f0f0f0] hover:bg-[#e0e0e0] active:bg-[#d0d0d0]'
          }`}
          title={t('frCopyText')}
          aria-label={t('frCopyText')}
        >
          {copiedText ? (
            <>
              <Check className="h-3 w-3 text-[#6a9955]" />
              <span className="text-[#6a9955]">{t('frCopied')}</span>
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              <span>{t('frCopyText')}</span>
            </>
          )}
        </button>
      </div>

      {/* Formula display */}
      <div
        className={`overflow-x-auto px-4 py-3 ${
          displayMode ? 'text-center' : 'text-left'
        }`}
      >
        {error ? (
          <div className="space-y-2">
            {html && (
              <div
                ref={formulaRef}
                onClick={handleFormulaClick}
                className="cursor-pointer opacity-50 select-none"
                dangerouslySetInnerHTML={{ __html: html }}
              />
            )}
            <div className={`flex items-start gap-2 rounded border px-3 py-2 ${
              isDark ? 'border-[#5a1d1d] bg-[#3c1f1f]' : 'border-red-300 bg-red-50'
            }`}>
              <span className={`mt-0.5 text-sm ${isDark ? 'text-[#f48771]' : 'text-red-600'}`}>⚠</span>
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-medium ${isDark ? 'text-[#f48771]' : 'text-red-600'}`}>
                  {t('frLatexError')}
                </p>
                <p className={`mt-0.5 text-xs font-mono break-all leading-relaxed ${
                  isDark ? 'text-[#cc6666]' : 'text-red-500'
                }`}>
                  {error}
                </p>
              </div>
            </div>
            <div className={`rounded px-3 py-2 ${
              isDark ? 'bg-[#2d2d2d]' : 'bg-[#f5f5f5]'
            }`}>
              <p className={`text-xs font-mono break-all leading-relaxed ${
                isDark ? 'text-[#9cdcfe]' : 'text-[#007acc]'
              }`}>
                {expression}
              </p>
            </div>
          </div>
        ) : (
          <div
            ref={formulaRef}
            onClick={handleFormulaClick}
            className={`cursor-pointer select-none transition-opacity duration-150 ${
              isHovered ? 'opacity-90' : 'opacity-100'
            } ${isDark ? 'text-[#e8edf3]' : 'text-[#333]'}`}
            title={t('frClickToCopy')}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        )}
      </div>

      {/* Click-to-copy hint */}
      {!error && isHovered && (
        <div className={`absolute bottom-1.5 left-1/2 -translate-x-1/2 rounded px-2 py-0.5 text-[10px] transition-all duration-200 ${
          isDark ? 'bg-[#3c3c3c] text-[#888]' : 'bg-[#f0f0f0] text-[#888]'
        }`}>
          {t('frClickToCopy')}
        </div>
      )}
    </div>
  );
}
