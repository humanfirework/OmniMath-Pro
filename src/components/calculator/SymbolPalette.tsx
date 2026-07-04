'use client';

import { useMemo } from 'react';
import { SYMBOL_CATEGORIES } from '@/lib/calculator/engine';
import { useCalculatorStore } from '@/lib/calculator/store';
import { t } from '@/lib/calculator/i18n';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

/** Map category keys (used in engine.ts SYMBOL_CATEGORIES) to i18n keys */
const CATEGORY_I18N_KEYS: Record<string, 'symBasic' | 'symGreek' | 'symCalculus' | 'symTrigonometry' | 'symLogExp' | 'symLinearAlgebra' | 'symStatistics' | 'symCombinatorics' | 'symConstants'> = {
  Basic: 'symBasic',
  Greek: 'symGreek',
  Calculus: 'symCalculus',
  Trigonometry: 'symTrigonometry',
  'Log & Exp': 'symLogExp',
  'Linear Algebra': 'symLinearAlgebra',
  Statistics: 'symStatistics',
  Combinatorics: 'symCombinatorics',
  Constants: 'symConstants',
};

/** Grid column config per category name. */
const GRID_COLS: Record<string, string> = {
  Basic: 'grid-cols-5',
  Greek: 'grid-cols-3',
  Calculus: 'grid-cols-3',
  Trigonometry: 'grid-cols-3',
  'Log & Exp': 'grid-cols-2',
  'Linear Algebra': 'grid-cols-3',
  Statistics: 'grid-cols-2',
  Combinatorics: 'grid-cols-2',
  Constants: 'grid-cols-2',
};

/** Ordered list of categories to render. */
const CATEGORY_ORDER = [
  'Basic',
  'Greek',
  'Calculus',
  'Trigonometry',
  'Log & Exp',
  'Linear Algebra',
  'Statistics',
  'Combinatorics',
  'Constants',
];

export function SymbolPalette() {
  const insertAtCursor = useCalculatorStore((s) => s.insertAtCursor);
  const theme = useCalculatorStore((s) => s.theme);

  const categories = useMemo(
    () =>
      CATEGORY_ORDER.filter((name) => SYMBOL_CATEGORIES[name]?.length > 0).map(
        (name) => ({
          name,
          symbols: SYMBOL_CATEGORIES[name],
          gridCols: GRID_COLS[name] ?? 'grid-cols-4',
          i18nKey: CATEGORY_I18N_KEYS[name],
        }),
      ),
    [],
  );

  const isDark = theme === 'dark';

  return (
    <ScrollArea className="h-full">
      <div className={`p-2 ${isDark ? 'bg-[#1e1e1e]' : 'bg-white'}`}>
        <Accordion
          type="multiple"
          defaultValue={['Basic']}
          className="w-full"
        >
          {categories.map(({ name, symbols, gridCols, i18nKey }) => (
            <AccordionItem
              key={name}
              value={name}
              className={isDark ? 'border-[#3c3c3c]' : 'border-[#e0e0e0]'}
            >
              <AccordionTrigger className={`py-2 px-1 text-xs font-semibold uppercase tracking-wider rounded-sm transition-colors hover:no-underline ${
                isDark
                  ? 'text-[#cccccc] hover:bg-[#2a2d2e]'
                  : 'text-[#555] hover:bg-[#f0f0f0]'
              }`}>
                {i18nKey ? t(i18nKey) : name}
              </AccordionTrigger>

              <AccordionContent className="pb-2">
                <div className={`grid ${gridCols} gap-1 px-1`}>
                  {symbols.map((symbol) => (
                    <Tooltip key={symbol.input + symbol.label}>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className={`h-8 w-full rounded-sm text-sm font-mono transition-all active:scale-95 ${
                            isDark
                              ? 'bg-[#2d2d2d] text-[#cccccc] hover:bg-[#094771] hover:text-[#ffffff] active:bg-[#0e639c]'
                              : 'bg-[#f5f5f5] text-[#333] hover:bg-[#e5f1fb] hover:text-[#007acc] active:bg-[#cce4f7]'
                          }`}
                          onClick={() => insertAtCursor(symbol.input)}
                          aria-label={
                            symbol.description ?? `插入 ${symbol.label}`
                          }
                        >
                          <span className="truncate">{symbol.label}</span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent
                        side="right"
                        sideOffset={6}
                        className={`text-xs px-2 py-1 ${
                          isDark
                            ? 'bg-[#252526] text-[#cccccc] border border-[#454545]'
                            : 'bg-white text-[#333] border border-[#e0e0e0]'
                        }`}
                      >
                        {symbol.description ? (
                          <span>
                            <span className={`font-mono ${isDark ? 'text-[#569cd6]' : 'text-[#007acc]'}`}>
                              {symbol.label}
                            </span>
                            {' \u2014 '}
                            {symbol.description}
                          </span>
                        ) : (
                          <span>
                            插入{' '}
                            <span className={`font-mono ${isDark ? 'text-[#569cd6]' : 'text-[#007acc]'}`}>
                              {symbol.input}
                            </span>
                          </span>
                        )}
                      </TooltipContent>
                    </Tooltip>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </ScrollArea>
  );
}
