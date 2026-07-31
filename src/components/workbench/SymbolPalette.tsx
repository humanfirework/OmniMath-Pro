'use client';

/**
 * OmniMath Pro — Symbol Palette
 *
 * A collapsible strip of math symbols grouped by category, rendered below
 * the code editor. Clicking a symbol inserts its canonical text at the
 * editor's cursor via the `omnimath-insert-symbol` window custom event,
 * which CodeEditor listens for.
 *
 * The open/collapsed state lives in settingsStore.symbolPaletteOpen so the
 * EditorPanel toolbar toggle and the Ctrl/Cmd+/ shortcut can control it.
 */

import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sigma, ChevronDown } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { symbolAliases, type SymbolAliasEntry } from '@/lib/engine';
import { useSettingsStore } from '@/lib/store/settingsStore';
import { t, type TranslationDict } from '@/lib/i18n';
import { cn } from '@/lib/utils';

/** Display order + i18n label key for each symbol category. */
const CATEGORY_ORDER: Array<{
  id: SymbolAliasEntry['category'];
  labelKey: keyof TranslationDict;
}> = [
  { id: 'calculus', labelKey: 'symCalculus' },
  { id: 'trig', labelKey: 'symTrigonometry' },
  { id: 'inverse-trig', labelKey: 'symCatInverseTrig' },
  { id: 'log', labelKey: 'symLogExp' },
  { id: 'power', labelKey: 'symCatPower' },
  { id: 'rounding', labelKey: 'symCatRounding' },
  { id: 'complex', labelKey: 'symCatComplex' },
  { id: 'constant', labelKey: 'symConstants' },
  { id: 'greek', labelKey: 'symGreek' },
];

export function SymbolPalette() {
  const open = useSettingsStore((s) => s.symbolPaletteOpen);
  const setOpen = useSettingsStore((s) => s.setSymbolPaletteOpen);

  const grouped = useMemo(() => {
    const map = new Map<SymbolAliasEntry['category'], SymbolAliasEntry[]>();
    for (const entry of symbolAliases) {
      const arr = map.get(entry.category) ?? [];
      arr.push(entry);
      map.set(entry.category, arr);
    }
    // Keep only categories that actually have entries, in display order.
    return CATEGORY_ORDER.filter((c) => map.has(c.id)).map((c) => ({
      id: c.id,
      labelKey: c.labelKey,
      items: map.get(c.id)!,
    }));
  }, []);

  const handleInsert = (canonical: string) => {
    window.dispatchEvent(
      new CustomEvent('omnimath-insert-symbol', { detail: canonical }),
    );
  };

  return (
    <div className="shrink-0 border-t border-border/60 bg-background/40">
      {/* Header / toggle bar (always visible) */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label={t('symbolPaletteToggle')}
        className="flex w-full h-7 items-center justify-between px-2.5 gap-2 text-[11px] font-medium text-muted-foreground hover:bg-accent/40 hover:text-foreground transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <Sigma className="size-3.5 text-primary" />
          <span>{t('symbolPaletteTitle')}</span>
        </span>
        <ChevronDown
          className={cn(
            'size-3.5 transition-transform',
            open ? '' : '-rotate-90',
          )}
        />
      </button>

      {/* Expandable symbol grid */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="max-h-[150px] overflow-y-auto px-2.5 py-2 space-y-2">
              {grouped.map((cat) => (
                <div key={cat.id} className="space-y-1">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                    {t(cat.labelKey)}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {cat.items.map((entry) => (
                      <Tooltip key={`${entry.category}-${entry.alias}`}>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={() => handleInsert(entry.canonical)}
                            aria-label={t('ksInsertAtCursor')}
                            className="inline-flex items-center justify-center h-7 min-w-7 px-1.5 rounded text-[11px] font-mono text-foreground/80 hover:bg-accent hover:text-foreground transition-colors"
                          >
                            {entry.alias}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-[240px]">
                          <div className="space-y-1">
                            <div className="font-medium">{entry.description}</div>
                            <div className="font-mono text-[11px] text-muted-foreground">
                              {entry.latex}
                            </div>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
