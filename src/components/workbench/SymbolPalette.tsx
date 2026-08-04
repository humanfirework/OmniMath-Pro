'use client';

/**
 * OmniMath Pro — Symbol Palette (bottom bar)
 *
 * A fixed panel docked at the bottom of the editor. Clicking a symbol inserts
 * its canonical text at the editor's cursor via the `omnimath-insert-symbol`
 * window custom event, which CodeEditor listens for.
 *
 * Features:
 *  - Drag the thin top edge up/down to resize the panel height (persisted).
 *  - A collapsible "使用提示" (usage hints) section shows common formulas
 *    (solve / matrix / diff / integrate / plot …) that insert on click.
 *  - Search filters every symbol by alias / latex / description / category.
 *
 * The open/closed state lives in settingsStore.symbolPaletteOpen so the
 * EditorPanel toolbar toggle and the Ctrl/Cmd+# shortcut can control it.
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
  Sigma,
  X,
  Search,
  Lightbulb,
  CornerUpRight,
  LogIn,
  Zap,
  CircleEqual,
  Hash,
  Type,
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { symbolAliases, type SymbolAliasEntry } from '@/lib/engine';
import { useSettingsStore } from '@/lib/store/settingsStore';
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

/** Persistence key for the palette height. */
const HEIGHT_KEY = 'omnimath-symbol-palette-height-v1';

const DEFAULT_HEIGHT = 260;
const MIN_HEIGHT = 160;
const MAX_HEIGHT = 460;

/** Clickable example formulas shown in the usage-hints section. */
const USAGE_HINTS: Array<{ label: string; code: string; desc: string }> = [
  { label: '求解方程', code: 'solve(x^2 - 5*x + 6, x)', desc: 'solve(eq, var)' },
  { label: '线性方程组', code: 'solve([x + y = 5, x - y = 1], [x, y])', desc: 'solve([eq1, eq2], [x, y])' },
  { label: '矩阵 / 行列式', code: 'A = [1, 2; 3, 4]\ndet(A)', desc: '先赋值矩阵，再调用 det' },
  { label: '求导', code: 'diff(x^2, x)', desc: 'diff(expr, var)' },
  { label: '不定积分', code: 'integrate(x^2, x)', desc: 'integrate(expr, var)' },
  { label: '2D 绘图', code: 'plot(sin(x))', desc: 'plot(expr)' },
  { label: '3D 曲面', code: 'plot3d(sin(x)*cos(y))', desc: 'plot3d(expr)' },
];

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

  const [query, setQuery] = useState('');
  const [showHints, setShowHints] = useState(true);

  /* ── Height (bottom bar, drag top edge up/down) ─────────────── */
  const [height, setHeight] = useState(DEFAULT_HEIGHT);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const resizeRef = useRef({ startY: 0, startHeight: DEFAULT_HEIGHT, moved: false });
  const resizeRafRef = useRef<number | null>(null);
  const pendingHeightRef = useRef<number | null>(null);
  // 持有最新 onResizeEnd，避免 useCallback 内自引用（onResizeEnd 引用自身）。
  const onResizeEndRef = useRef<() => void>(() => {});

  // Hydrate persisted height after mount (no SSR mismatch).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(HEIGHT_KEY);
      if (raw) {
        const h = parseInt(raw, 10);
        if (!isNaN(h)) {
          setHeight(Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, h)));
        }
      }
    } catch {
      /* ignore */
    }
  }, []);

  const persist = useCallback((h: number) => {
    try {
      localStorage.setItem(HEIGHT_KEY, String(h));
    } catch {
      /* ignore */
    }
  }, []);

  /* ── Resize height (drag top edge; up = taller, down = shorter) ─ */
  const onResizeMove = useCallback((e: MouseEvent) => {
    const dy = e.clientY - resizeRef.current.startY;
    if (Math.abs(dy) > 2) resizeRef.current.moved = true;
    const h = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, resizeRef.current.startHeight - dy));
    pendingHeightRef.current = h;
    if (resizeRafRef.current == null) {
      resizeRafRef.current = requestAnimationFrame(() => {
        resizeRafRef.current = null;
        const hh = pendingHeightRef.current;
        if (hh != null && panelRef.current) {
          panelRef.current.style.height = `${hh}px`;
        }
      });
    }
  }, []);

  const onResizeEnd = useCallback(() => {
    window.removeEventListener('mousemove', onResizeMove);
    window.removeEventListener('mouseup', onResizeEndRef.current);
    if (resizeRafRef.current) {
      cancelAnimationFrame(resizeRafRef.current);
      resizeRafRef.current = null;
    }
    if (resizeRef.current.moved) {
      const h = pendingHeightRef.current ?? resizeRef.current.startHeight;
      setHeight(h);
      persist(h);
      if (panelRef.current) panelRef.current.style.height = '';
    }
  }, [onResizeMove, persist]);
  onResizeEndRef.current = onResizeEnd;

  const onResizeStart = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      resizeRef.current = { startY: e.clientY, startHeight: height, moved: false };
      window.addEventListener('mousemove', onResizeMove);
      window.addEventListener('mouseup', onResizeEnd);
    },
    [height, onResizeMove, onResizeEnd],
  );

  /* ── Search + grouping ────────────────────────────────────────── */
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

  const handleInsert = useCallback((canonical: string) => {
    window.dispatchEvent(
      new CustomEvent('omnimath-insert-symbol', { detail: canonical }),
    );
  }, []);

  const totalCount = filteredEntries.length;
  const showEmpty = q && totalCount === 0;

  if (!open || typeof window === 'undefined') return null;

  return (
    <motion.div
      ref={panelRef}
      initial={{ y: 24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className="flex flex-col shrink-0 overflow-hidden border-t border-border/70 bg-background/95"
      style={{ height }}
    >
      {/* Top drag handle — drag up/down to resize the panel height */}
      <div
        onMouseDown={onResizeStart}
        role="separator"
        aria-orientation="horizontal"
        aria-label="拖动调整高度"
        title="上下拖动调整面板高度"
        className="h-1.5 shrink-0 cursor-ns-resize bg-muted/40 hover:bg-primary/40 transition-colors"
      />

      {/* Header */}
      <div className="flex items-center gap-2 h-8 px-2 border-b border-border/60 bg-muted/30 select-none shrink-0">
        <Sigma className="size-3.5 text-primary" />
        <span className="text-[11.5px] font-semibold tracking-tight text-foreground/90">
          {t('symbolPaletteTitle')}
        </span>
        <span className="text-[10px] text-muted-foreground/70 font-mono hidden sm:inline">
          {totalCount}
        </span>
        <div className="ml-auto flex items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => setShowHints((v) => !v)}
                aria-label="使用提示"
                className={cn(
                  'grid place-items-center size-6 rounded-md transition-colors',
                  showHints
                    ? 'text-primary bg-primary/10'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                <Lightbulb className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">使用提示</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t('symbolPaletteToggle')}
                className="grid place-items-center size-6 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                <X className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">关闭面板</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Search */}
      <div className="shrink-0 px-2 py-1.5 border-b border-border/50">
        <div className="relative">
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

      {/* Usage hints */}
      <AnimatePresence initial={false}>
        {showHints && (
          <motion.div
            key="hints"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            className="overflow-hidden shrink-0 border-b border-border/50"
          >
            <div className="px-2 py-1.5 space-y-1">
              <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                <Lightbulb className="size-3 text-amber-400" />
                使用提示 · 点击插入
              </div>
              <div className="flex flex-wrap gap-1">
                {USAGE_HINTS.map((hint) => (
                  <Tooltip key={hint.label}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => handleInsert(hint.code)}
                        className="inline-flex items-center gap-1 px-1.5 h-5 rounded bg-muted/60 border border-border/60 text-[10px] font-mono text-foreground/80 hover:border-primary/50 hover:text-primary transition-colors"
                      >
                        {hint.label}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[260px]">
                      <code className="text-[11px] font-mono text-primary block mb-0.5 break-all">
                        {hint.code}
                      </code>
                      <span className="text-[10px] text-muted-foreground">{hint.desc}</span>
                    </TooltipContent>
                  </Tooltip>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Symbol grid */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="px-2 py-2 space-y-2">
          {showEmpty ? (
            <div className="text-center py-6 text-[12px] text-muted-foreground">
              {t('cpNoResults')}
            </div>
          ) : (
            grouped.map((cat) => (
              <div key={cat.id} className="space-y-1">
                <div className="flex items-center justify-between">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70 flex items-center gap-1">
                    <CategoryIcon id={cat.id} className="size-3 text-primary/70" />
                    {t(cat.labelKey)}
                  </div>
                  <span className="text-[9px] text-muted-foreground/50 font-mono">
                    {cat.items.length}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {cat.items.map((entry) => (
                    <Tooltip key={entry.alias}>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => handleInsert(entry.canonical)}
                          aria-label={t('ksInsertAtCursor')}
                          className="inline-flex items-center justify-center h-7 min-w-6 px-1.5 rounded text-[11px] font-mono text-foreground/80 hover:bg-accent hover:text-foreground transition-colors"
                        >
                          {entry.alias}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[280px]">
                        <div className="space-y-1 text-left">
                          <div className="katex-display text-center" style={{ fontSize: '28px' }}>
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
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </motion.div>
  );
}