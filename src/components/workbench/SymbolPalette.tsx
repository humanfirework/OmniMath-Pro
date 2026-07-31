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

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sigma,
  ChevronDown,
  Star,
  StarOff,
  Search,
  CornerUpRight,
  LogIn,
  Zap,
  CircleEqual,
  Hash,
  Type,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Input } from '@/components/ui/input';
import { symbolAliases, type SymbolAliasEntry } from '@/lib/engine';
import { useSettingsStore, DEFAULT_SYMBOL_CATEGORY_ORDER } from '@/lib/store/settingsStore';
import { t, type TranslationDict } from '@/lib/i18n';
import { cn } from '@/lib/utils';

/** Display order + i18n label key for each symbol category. */
const CATEGORY_DEFS: Array<{
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

/** Default favorites (first-time load): alias/latex matched against actual entries. */
const DEFAULT_FAV_ALIASES = [
  'sin', 'cos', 'tan',
  'pi', 'e',
  'integrate', 'taylor', 'sqrt', 'infinity',
  'lambda', 'mu', 'sigma', 'theta', 'Delta', 'diff',
];

const FAVS_KEY = 'omnimath-symbol-favs-v1';

/** lucide-react icon per category id. */
function CategoryIcon({ id, className }: { id: SymbolAliasEntry['category']; className?: string }) {
  switch (id) {
    case 'calculus':
      return <Sigma className={className} />;
    case 'trig':
      return <Sigma className={className} />;
    case 'inverse-trig':
      return <CornerUpRight className={className} />;
    case 'log':
      return <LogIn className={className} />;
    case 'power':
      return <Zap className={className} />;
    case 'rounding':
      return <CircleEqual className={className} />;
    case 'complex':
      return <Sigma className={className} />;
    case 'constant':
      return <Hash className={className} />;
    case 'greek':
      return <Type className={className} />;
    default:
      return <Sigma className={className} />;
  }
}

export function SymbolPalette() {
  const open = useSettingsStore((s) => s.symbolPaletteOpen);
  const setOpen = useSettingsStore((s) => s.setSymbolPaletteOpen);
  const symbolCategoryOrder = useSettingsStore((s) => s.symbolCategoryOrder);
  const setSymbolCategoryOrder = useSettingsStore((s) => s.setSymbolCategoryOrder);
  const [query, setQuery] = useState('');
  const [favs, setFavs] = useState<string[]>([]);

  /** Load favorites from localStorage on mount, falling back to default set. */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(FAVS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setFavs(parsed.filter((x) => typeof x === 'string'));
          return;
        }
      }
    } catch {
      // fall through to defaults
    }
    const defaultSet = DEFAULT_FAV_ALIASES.filter((a) =>
      symbolAliases.some(
        (e) => e.alias === a || e.latex.replace(/\\/g, '').toLowerCase() === a.toLowerCase(),
      ),
    );
    setFavs(defaultSet);
    try {
      localStorage.setItem(FAVS_KEY, JSON.stringify(defaultSet));
    } catch {
      // ignore quota errors
    }
  }, []);

  const toggleFav = (alias: string) => {
    setFavs((prev) => {
      const next = prev.includes(alias)
        ? prev.filter((a) => a !== alias)
        : [...prev, alias];
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(FAVS_KEY, JSON.stringify(next));
        } catch {
          // ignore quota errors
        }
      }
      return next;
    });
  };

  const moveCategory = (idx: number, dir: -1 | 1) => {
    const next = [...symbolCategoryOrder];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    setSymbolCategoryOrder(next);
  };

  /** Category label (Chinese) resolved per category id for search match. */
  const categoryLabelMap = useMemo(() => {
    const m = new Map<SymbolAliasEntry['category'], string>();
    for (const c of CATEGORY_DEFS) m.set(c.id, t(c.labelKey));
    return m;
  }, []);

  const q = query.trim().toLowerCase();

  const filteredEntries = useMemo(() => {
    if (!q) return symbolAliases;
    return symbolAliases.filter((e) => {
      const catLabel = categoryLabelMap.get(e.category) ?? '';
      return (
        e.alias.toLowerCase().includes(q) ||
        e.latex.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        catLabel.toLowerCase().includes(q)
      );
    });
  }, [q, categoryLabelMap]);

  const favEntries = useMemo(
    () =>
      favs
        .map((a) => symbolAliases.find((e) => e.alias === a))
        .filter((e): e is SymbolAliasEntry => Boolean(e)),
    [favs],
  );

  const grouped = useMemo(() => {
    const map = new Map<SymbolAliasEntry['category'], SymbolAliasEntry[]>();
    for (const entry of filteredEntries) {
      const arr = map.get(entry.category) ?? [];
      arr.push(entry);
      map.set(entry.category, arr);
    }
    const orderedIds = symbolCategoryOrder.filter(
      (id) => CATEGORY_DEFS.some((c) => c.id === id) && map.has(id as SymbolAliasEntry['category']),
    );
    // Append any remaining ids from CATEGORY_DEFS that are missing in the order.
    for (const c of CATEGORY_DEFS) {
      if (!orderedIds.includes(c.id) && map.has(c.id)) {
        orderedIds.push(c.id);
      }
    }
    return orderedIds.map((id) => {
      const def = CATEGORY_DEFS.find((c) => c.id === id)!;
      return {
        id: id as SymbolAliasEntry['category'],
        labelKey: def.labelKey,
        items: map.get(id as SymbolAliasEntry['category'])!,
      };
    });
  }, [filteredEntries, symbolCategoryOrder]);

  const handleInsert = (canonical: string) => {
    window.dispatchEvent(
      new CustomEvent('omnimath-insert-symbol', { detail: canonical }),
    );
  };

  const totalCount = filteredEntries.length;
  const showEmpty = q && totalCount === 0;
  const showFavsSection = favEntries.length > 0 && !q;

  const renderSymbolButton = (entry: SymbolAliasEntry) => {
    const isFav = favs.includes(entry.alias);
    return (
      <div key={`${entry.category}-${entry.alias}`} className="relative">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => handleInsert(entry.canonical)}
              aria-label={t('ksInsertAtCursor')}
              className="inline-flex items-center justify-center h-8 min-w-7 px-1.5 rounded text-[11px] font-mono text-foreground/80 hover:bg-accent hover:text-foreground transition-colors"
            >
              {entry.alias}
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-[280px]">
            <div className="space-y-1 text-left">
              <div className="katex-display text-center" style={{ fontSize: '32px' }}>
                {entry.latex}
              </div>
              <code className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded block">
                {entry.latex}
              </code>
              <div className="text-[10px] text-green-400">
                键盘快捷：输入 &quot;{entry.alias}&quot; + 空格自动替换
              </div>
            </div>
          </TooltipContent>
        </Tooltip>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            toggleFav(entry.alias);
          }}
          aria-label={isFav ? '取消收藏' : '收藏'}
          className="absolute -top-1 -right-1 size-3.5 rounded-full bg-background/80 backdrop-blur border border-border/60 flex items-center justify-center text-amber-500/80 hover:text-amber-400 hover:bg-background transition-colors"
        >
          {isFav ? <Star className="size-2.5 fill-current" /> : <StarOff className="size-2.5" />}
        </button>
      </div>
    );
  };

  return (
    <div className="shrink-0 border-t border-border/60 bg-background/40 z-40 relative">
      {/* Header / toggle bar (always visible) */}
      <div className="flex items-center gap-2 px-2.5 h-7">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-label={t('symbolPaletteToggle')}
          className="flex items-center justify-between gap-2 text-[11px] font-medium text-muted-foreground hover:bg-accent/40 hover:text-foreground transition-colors rounded px-1 py-0.5 shrink-0"
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

        <div className="relative flex-1 max-w-xs ml-auto">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground pointer-events-none" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('formulasSearch')}
            className="h-6 pl-7 pr-2 text-[11px] bg-muted/40 border-border/60"
          />
        </div>
      </div>

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
            <div className="max-h-[220px] overflow-y-auto px-2.5 py-2 space-y-2">
              {showEmpty ? (
                <div className="text-center py-6 text-[12px] text-muted-foreground">
                  {t('cpNoResults')}
                </div>
              ) : (
                <>
                  {showFavsSection && (
                    <div className="space-y-1 pb-1 border-b border-border/40">
                      <div className="flex items-center justify-between">
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70 flex items-center gap-1">
                          <Star className="size-3 fill-amber-400 text-amber-400" />
                          <span>⭐ 常用</span>
                          <span className="text-muted-foreground/50 normal-case">({favEntries.length})</span>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {favEntries.map((entry) => renderSymbolButton(entry))}
                      </div>
                    </div>
                  )}

                  {grouped.map((cat, idx) => (
                    <div key={cat.id} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70 flex items-center gap-1">
                          <CategoryIcon id={cat.id} className="size-3 text-primary/70" />
                          {t(cat.labelKey)}
                        </div>
                        {!q && (
                          <div className="flex items-center gap-0.5">
                            <button
                              type="button"
                              onClick={() => moveCategory(idx, -1)}
                              disabled={idx === 0}
                              aria-label="上移分类"
                              className={cn(
                                'size-4 rounded flex items-center justify-center text-muted-foreground/60 hover:text-foreground hover:bg-accent/40 disabled:opacity-30 disabled:hover:bg-transparent transition-colors',
                              )}
                            >
                              <ArrowUp className="size-2.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => moveCategory(idx, 1)}
                              disabled={idx === grouped.length - 1}
                              aria-label="下移分类"
                              className={cn(
                                'size-4 rounded flex items-center justify-center text-muted-foreground/60 hover:text-foreground hover:bg-accent/40 disabled:opacity-30 disabled:hover:bg-transparent transition-colors',
                              )}
                            >
                              <ArrowDown className="size-2.5" />
                            </button>
                          </div>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {cat.items.map((entry) => renderSymbolButton(entry))}
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
