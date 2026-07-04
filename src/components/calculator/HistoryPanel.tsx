'use client';

import { useMemo } from 'react';
import { useCalculatorStore } from '@/lib/calculator/store';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Trash2, History, Variable, ChevronRight } from 'lucide-react';
import { t } from '@/lib/calculator/i18n';
import type { CalculationResult } from '@/lib/calculator/types';

/** Format a timestamp as relative time string */
function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 5) return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;

  return new Date(timestamp).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

/** Map calculation type to badge styling */
function getTypeBadgeStyle(type: CalculationResult['type'], isDark: boolean): string {
  const base = isDark
    ? {
        expression: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
        equation: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
        matrix: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
        plot: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
        calculus: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
        unknown: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
      }
    : {
        expression: 'bg-emerald-100 text-emerald-700 border-emerald-200',
        equation: 'bg-amber-100 text-amber-700 border-amber-200',
        matrix: 'bg-cyan-100 text-cyan-700 border-cyan-200',
        plot: 'bg-purple-100 text-purple-700 border-purple-200',
        calculus: 'bg-rose-100 text-rose-700 border-rose-200',
        unknown: 'bg-zinc-100 text-zinc-600 border-zinc-200',
      };
  return base[type] || base.unknown;
}

export function HistoryPanel() {
  const results = useCalculatorStore((s) => s.results);
  const variables = useCalculatorStore((s) => s.variables);
  const setEditorContent = useCalculatorStore((s) => s.setEditorContent);
  const clearHistory = useCalculatorStore((s) => s.clearHistory);
  const theme = useCalculatorStore((s) => s.theme);

  const isDark = theme === 'dark';

  const sortedResults = useMemo(() => {
    return [...results].sort((a, b) => b.timestamp - a.timestamp);
  }, [results]);

  const variableEntries = useMemo(() => {
    return Object.values(variables);
  }, [variables]);

  const hasHistory = sortedResults.length > 0;
  const hasVariables = variableEntries.length > 0;

  return (
    <div className={`flex flex-col h-full ${isDark ? 'bg-[#181818]' : 'bg-white'}`}>
      {/* Header */}
      <div className={`flex items-center justify-between px-4 py-2.5 border-b ${
        isDark ? 'border-[#2b2b2b]' : 'border-[#e0e0e0]'
      }`}>
        <div className="flex items-center gap-2">
          <History className={`size-3.5 ${isDark ? 'text-[#cccccc]/60' : 'text-[#888]'}`} />
          <span className={`text-[11px] font-semibold uppercase tracking-wider ${
            isDark ? 'text-[#cccccc]/80' : 'text-[#666]'
          }`}>
            {t('spHistory')}
          </span>
        </div>
        {hasHistory && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearHistory}
            className={`h-6 px-2 text-[11px] ${
              isDark
                ? 'text-[#cccccc]/60 hover:text-red-400 hover:bg-red-500/10'
                : 'text-[#888] hover:text-red-600 hover:bg-red-50'
            }`}
          >
            <Trash2 className="size-3 mr-1" />
            {t('histClear')}
          </Button>
        )}
      </div>

      {/* Scrollable Content */}
      <ScrollArea className="flex-1">
        <div className="py-1">
          {/* History Items */}
          {!hasHistory ? (
            <div className="flex flex-col items-center justify-center py-12 px-4">
              <History className={`size-8 mb-2 ${isDark ? 'text-[#cccccc]/20' : 'text-[#ddd]'}`} />
              <p className={`text-[12px] ${isDark ? 'text-[#cccccc]/40' : 'text-[#aaa]'}`}>{t('histNoHistory')}</p>
              <p className={`text-[11px] mt-1 ${isDark ? 'text-[#cccccc]/25' : 'text-[#ccc]'}`}>
                {t('histNoHistoryHint')}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-px">
              {sortedResults.map((result) => (
                <HistoryItem
                  key={result.id}
                  result={result}
                  isDark={isDark}
                  onLoad={() => setEditorContent(result.input)}
                />
              ))}
            </div>
          )}

          {/* Variables Section */}
          {hasVariables && (
            <div className="mt-2">
              <div className={`flex items-center gap-2 px-4 py-1.5 border-t ${
                isDark ? 'border-[#2b2b2b]' : 'border-[#e0e0e0]'
              }`}>
                <Variable className={`size-3.5 ${isDark ? 'text-[#cccccc]/60' : 'text-[#888]'}`} />
                <span className={`text-[11px] font-semibold uppercase tracking-wider ${
                  isDark ? 'text-[#cccccc]/80' : 'text-[#666]'
                }`}>
                  {t('histVariables')} ({variableEntries.length})
                </span>
              </div>

              <div className="flex flex-col gap-px">
                {variableEntries.map((v) => (
                  <button
                    key={v.name}
                    onClick={() => setEditorContent(v.name)}
                    className={`flex items-center gap-2 w-full px-4 py-1.5 cursor-pointer text-left transition-colors group ${
                      isDark ? 'bg-[#1e1e1e] hover:bg-[#2a2d2e]' : 'bg-white hover:bg-[#f0f0f0]'
                    }`}
                  >
                    <ChevronRight className={`size-3 transition-colors shrink-0 ${
                      isDark ? 'text-[#cccccc]/30 group-hover:text-[#cccccc]/60' : 'text-[#ccc] group-hover:text-[#888]'
                    }`} />
                    <span className={`text-[12px] font-mono truncate ${
                      isDark ? 'text-[#9cdcfe]' : 'text-[#007acc]'
                    }`}>
                      {v.name}
                    </span>
                    <span className={`text-[12px] font-mono truncate ${
                      isDark ? 'text-[#cccccc]/40' : 'text-[#aaa]'
                    }`}>
                      =
                    </span>
                    <span className={`text-[12px] font-mono truncate ${
                      isDark ? 'text-[#ce9178]' : 'text-[#a31515]'
                    }`}>
                      {String(v.value)}
                    </span>
                    <Badge
                      variant="outline"
                      className={`ml-auto text-[9px] px-1 py-0 shrink-0 ${
                        isDark ? 'border-[#3c3c3c]' : 'border-[#e0e0e0]'
                      } ${
                        v.type === 'number'
                          ? isDark ? 'text-emerald-400/70 bg-emerald-500/10' : 'text-emerald-700 bg-emerald-50'
                          : v.type === 'matrix'
                            ? isDark ? 'text-cyan-400/70 bg-cyan-500/10' : 'text-cyan-700 bg-cyan-50'
                            : isDark ? 'text-amber-400/70 bg-amber-500/10' : 'text-amber-700 bg-amber-50'
                      }`}
                    >
                      {v.type}
                    </Badge>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

/** Individual history item component */
function HistoryItem({
  result,
  onLoad,
  isDark,
}: {
  result: CalculationResult;
  isDark: boolean;
  onLoad: () => void;
}) {
  const hasError = !!result.error;

  return (
    <button
      onClick={onLoad}
      className={`flex flex-col gap-1 w-full px-4 py-2 cursor-pointer text-left transition-colors group ${
        isDark ? 'bg-[#1e1e1e] hover:bg-[#2a2d2e]' : 'bg-white hover:bg-[#f0f0f0]'
      }`}
    >
      {/* Top row: type badge + timestamp */}
      <div className="flex items-center gap-2">
        <Badge
          variant="outline"
          className={`text-[9px] px-1.5 py-0 leading-none ${getTypeBadgeStyle(result.type, isDark)}`}
        >
          {result.type}
        </Badge>
        <span className={`text-[10px] ml-auto shrink-0 ${
          isDark ? 'text-[#cccccc]/30' : 'text-[#bbb]'
        }`}>
          {formatRelativeTime(result.timestamp)}
        </span>
      </div>

      {/* Expression (input) */}
      <span className={`text-[12px] font-mono truncate ${
        hasError
          ? isDark ? 'text-red-400/80' : 'text-red-600'
          : isDark ? 'text-[#cccccc]/90' : 'text-[#333]'
      }`}>
        {result.input}
      </span>

      {/* Result (output) */}
      {hasError ? (
        <span className={`text-[11px] font-mono truncate ${
          isDark ? 'text-red-400' : 'text-red-600'
        }`}>
          {result.error}
        </span>
      ) : (
        <span className={`text-[11px] font-mono truncate ${
          isDark ? 'text-[#569cd6]' : 'text-[#007acc]'
        }`}>
          = {result.output}
        </span>
      )}
    </button>
  );
}
