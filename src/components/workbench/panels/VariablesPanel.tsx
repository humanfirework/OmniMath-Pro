'use client';

/**
 * OmniMath Pro — Variables Panel
 *
 * List of variables from the store:
 *  - Number: value + Desmos-style mini slider (range ±10×value, adjustable).
 *    Dragging updates the variable in the engine scope AND the store.
 *  - Matrix: shows dimensions (e.g. "2×2") + expandable preview.
 *  - Other types: shows type badge + truncated value preview.
 *  - Delete (X) button on hover.
 * "Clear all" button at top.
 * Empty state hint when no variables.
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Variable as VariableIcon,
  X,
  ChevronDown,
  ChevronRight,
  Trash2,
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { useWorkbenchStore } from '@/lib/store/workbench';
import { setScopeVar } from '@/lib/engine';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { VariableEntry } from '@/lib/store/workbench';

const TYPE_COLORS: Record<string, string> = {
  number: 'text-teal-500 bg-teal-500/10 border-teal-500/30',
  matrix: 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/30',
  complex: 'text-violet-600 dark:text-violet-400 bg-violet-500/10 border-violet-500/30',
  string: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
  boolean: 'text-rose-600 dark:text-rose-400 bg-rose-500/10 border-rose-500/30',
  function: 'text-orange-600 dark:text-orange-400 bg-orange-500/10 border-orange-500/30',
  unit: 'text-cyan-600 dark:text-cyan-400 bg-cyan-500/10 border-cyan-500/30',
};

function previewValue(v: unknown): string {
  if (v === null || v === undefined) return '∅';
  if (typeof v === 'number') return formatNum(v);
  if (typeof v === 'boolean') return String(v);
  if (typeof v === 'string') return `"${v}"`;
  if (Array.isArray(v)) {
    const rows = v.length;
    const cols = Array.isArray(v[0]) ? (v[0] as unknown[]).length : 1;
    return `[${rows}×${cols}]`;
  }
  if (typeof v === 'object') {
    if ('re' in (v as any) && 'im' in (v as any)) {
      const re = (v as any).re as number;
      const im = (v as any).im as number;
      const reStr = Math.abs(re) < 1e-10 ? '' : formatNum(re);
      const imStr = Math.abs(im) < 1e-10
        ? ''
        : `${Math.abs(im) === 1 ? '' : formatNum(Math.abs(im))}i${im < 0 ? '−' : '+'}`;
      if (!reStr && !imStr) return '0';
      if (!reStr) return `${im < 0 ? '−' : ''}${imStr.replace('+', '').replace('−', '')}`;
      if (!imStr) return reStr;
      return `${reStr} ${im < 0 ? '−' : '+'} ${imStr.replace('+', '').replace('−', '')}`;
    }
    try {
      return JSON.stringify(v).slice(0, 60);
    } catch {
      return String(v).slice(0, 60);
    }
  }
  if (typeof v === 'function') return 'λ';
  return String(v).slice(0, 60);
}

function formatNum(n: number): string {
  if (Number.isInteger(n)) return String(n);
  if (Math.abs(n) >= 1e15 || (Math.abs(n) < 1e-4 && n !== 0)) {
    return n.toExponential(3);
  }
  return parseFloat(n.toPrecision(8)).toString();
}

export function VariablesPanel() {
  const variables = useWorkbenchStore((s) => s.variables);
  const removeVariable = useWorkbenchStore((s) => s.removeVariable);
  const clearVariables = useWorkbenchStore((s) => s.clearVariables);
  const setVariable = useWorkbenchStore((s) => s.setVariable);

  const entries = Object.entries(variables);
  const sorted = [...entries].sort((a, b) => a[0].localeCompare(b[0]));

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 px-3 pt-3 pb-2 border-b border-border/60">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-1.5">
            <VariableIcon className="size-3.5 text-primary" />
            <span className="text-[12.5px] font-semibold tracking-tight">
              {t('varsTitle')}
            </span>
            {entries.length > 0 && (
              <span className="text-[10px] text-muted-foreground bg-muted rounded-full px-1.5 py-0.5">
                {entries.length}
              </span>
            )}
          </div>
          {entries.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[11px] text-muted-foreground hover:text-destructive"
              onClick={clearVariables}
            >
              <Trash2 className="size-3 mr-1" />
              {t('commonClear')}
            </Button>
          )}
        </div>
      </div>

      {/* List */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-2 space-y-1.5">
          <AnimatePresence initial={false}>
            {sorted.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center justify-center py-16 text-center px-6"
              >
                <motion.div
                  animate={{ y: [0, -6, 0] }}
                  transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
                  className="grid place-items-center size-14 rounded-2xl bg-primary/8 border border-primary/20 mb-3"
                >
                  <VariableIcon className="size-6 text-primary/70" />
                </motion.div>
                <p className="text-[12.5px] font-medium text-foreground/80 mb-1">
                  {t('varsNoVars')}
                </p>
                <p className="text-[11px] text-muted-foreground">{t('varsNoVarsHint')}</p>
                <pre className="mt-3 text-[10.5px] font-mono text-muted-foreground/80 bg-muted/40 rounded-md px-2 py-1.5">
                  x = 42{'\n'}A = [1, 2; 3, 4]
                </pre>
              </motion.div>
            ) : (
              sorted.map(([name, entry], i) => (
                <motion.div
                  key={name}
                  layout
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -8 }}
                  transition={{ duration: 0.18, delay: Math.min(i * 0.02, 0.18) }}
                >
                  <VariableRow
                    name={name}
                    entry={entry}
                    onRemove={() => removeVariable(name)}
                    onSliderChange={(val) => {
                      setScopeVar(name, val);
                      setVariable(name, { ...entry, value: val });
                    }}
                  />
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </div>
      </ScrollArea>
    </div>
  );
}

function VariableRow({
  name,
  entry,
  onRemove,
  onSliderChange,
}: {
  name: string;
  entry: VariableEntry;
  onRemove: () => void;
  onSliderChange: (v: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const isNumber = entry.type === 'number' && typeof entry.value === 'number';
  const isMatrix =
    entry.type === 'matrix' && Array.isArray(entry.value) && Array.isArray(entry.value[0]);

  const numVal = isNumber ? (entry.value as number) : 0;
  const absV = Math.abs(numVal) || 1;
  const sliderMin = -absV * 10;
  const sliderMax = absV * 10;
  const sliderStep = (sliderMax - sliderMin) / 200;

  return (
    <div className="group/var-item interactive-card relative rounded-md border border-border/60 bg-card/60 hover:border-primary/40 hover:bg-accent/30 p-2.5">
      {/* Header row */}
      <div className="flex items-center gap-2">
        {isMatrix && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="grid place-items-center size-4 rounded hover:bg-accent text-muted-foreground"
            aria-label="Expand"
          >
            {expanded ? (
              <ChevronDown className="size-3" />
            ) : (
              <ChevronRight className="size-3" />
            )}
          </button>
        )}
        <code className="font-mono text-[12.5px] font-semibold text-primary flex-1 truncate">
          {name}
        </code>
        <Badge
          variant="outline"
          className={cn(
            'h-4 px-1.5 text-[9.5px] font-mono uppercase tracking-wide',
            TYPE_COLORS[entry.type] ?? TYPE_COLORS.string,
          )}
        >
          {entry.type}
        </Badge>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onRemove}
              className="opacity-0 group-hover/var-item:opacity-100 transition-opacity grid place-items-center size-5 rounded hover:bg-destructive/15 text-muted-foreground hover:text-destructive"
              aria-label={t('varsDelete')}
            >
              <X className="size-3" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="left">{t('varsDelete')}</TooltipContent>
        </Tooltip>
      </div>

      {/* Value preview */}
      <div className="mt-1.5 ml-0.5">
        <code className="font-mono text-[11.5px] text-foreground/80 break-all">
          {previewValue(entry.value)}
        </code>
      </div>

      {/* Slider for numbers */}
      {isNumber && (
        <div className="mt-2 flex items-center gap-2">
          <Slider
            value={[numVal]}
            min={sliderMin}
            max={sliderMax}
            step={sliderStep}
            onValueChange={(vals) => vals[0] !== undefined && onSliderChange(vals[0])}
            className="flex-1 h-3"
          />
          <input
            type="number"
            value={numVal}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (!Number.isNaN(v)) onSliderChange(v);
            }}
            className="w-16 h-6 px-1.5 text-[11px] font-mono bg-muted/40 border border-border/60 rounded text-right tabular-nums"
          />
        </div>
      )}

      {/* Expanded matrix view */}
      {isMatrix && expanded && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="mt-2 overflow-auto max-h-40 rounded border border-border/60 bg-muted/30 p-1.5"
        >
          <table className="text-[10.5px] font-mono tabular-nums">
            <tbody>
              {(entry.value as number[][]).map((row, ri) => (
                <tr key={ri}>
                  {row.map((cell, ci) => (
                    <td
                      key={ci}
                      className="px-1.5 py-0.5 text-foreground/85 text-right border-r border-border/30 last:border-r-0"
                    >
                      {formatNum(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </motion.div>
      )}
    </div>
  );
}
