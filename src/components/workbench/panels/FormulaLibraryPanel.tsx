'use client';

/**
 * OmniMath Pro — Formula Library Panel
 *
 * 7 built-in categories (Algebra, Geometry, Trigonometry, Calculus,
 * Statistics, Physics, Finance) + a "Custom" category for user-defined
 * formulas, with search + clickable chips.
 *
 * List view: collapsible accordion grouped by category, formula name +
 * brief description, click to expand details.
 * Detail view: name + LaTeX rendering (KaTeX) + description + "Insert"
 * button → inserts example into editor. Custom formulas can be edited
 * or deleted from the detail view.
 *
 * Custom formulas (name / LaTeX / category / description / example) are
 * stored separately from built-ins and persisted to localStorage under
 * the key "omnimath-custom-formulas-v1".
 */

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BookOpen,
  Search,
  ArrowLeft,
  Sparkles,
  Plus,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FormulaRenderer } from '@/components/workbench/FormulaRenderer';
import { useWorkbenchStore } from '@/lib/store/workbench';
import { t } from '@/lib/i18n';
import type { TranslationDict } from '@/lib/i18n';
import { cn } from '@/lib/utils';

type CategoryKey =
  | 'algebra'
  | 'geometry'
  | 'trigonometry'
  | 'calculus'
  | 'statistics'
  | 'physics'
  | 'finance';

interface Formula {
  id: string;
  name: string;
  category: CategoryKey;
  latex: string;
  description: string;
  example: string;
}

interface CustomFormula {
  id: string;
  name: string;
  category: CategoryKey;
  latex: string;
  description: string;
  example: string;
}

const CATEGORY_LABEL_KEY: Record<CategoryKey, keyof TranslationDict> = {
  algebra: 'formulasCategoryAlgebra',
  geometry: 'formulasCategoryGeometry',
  trigonometry: 'formulasCategoryTrigonometry',
  calculus: 'formulasCategoryCalculus',
  statistics: 'formulasCategoryStatistics',
  physics: 'formulasCategoryPhysics',
  finance: 'formulasCategoryFinance',
};

const CATEGORY_COLOR: Record<CategoryKey, string> = {
  algebra: 'text-teal-600 dark:text-teal-400 bg-teal-500/10 border-teal-500/30',
  geometry: 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/30',
  trigonometry: 'text-rose-600 dark:text-rose-400 bg-rose-500/10 border-rose-500/30',
  calculus: 'text-violet-600 dark:text-violet-400 bg-violet-500/10 border-violet-500/30',
  statistics: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
  physics: 'text-orange-600 dark:text-orange-400 bg-orange-500/10 border-orange-500/30',
  finance: 'text-cyan-600 dark:text-cyan-400 bg-cyan-500/10 border-cyan-500/30',
};

const CUSTOM_COLOR =
  'text-fuchsia-600 dark:text-fuchsia-400 bg-fuchsia-500/10 border-fuchsia-500/30';

const FORMULAS: Formula[] = [
  // Algebra
  { id: 'quad-formula', name: '求根公式', category: 'algebra', latex: 'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}', description: '二次方程 ax² + bx + c = 0 的解。', example: 'solve(x^2 - 5*x + 6, x)' },
  { id: 'binom', name: '二项式展开', category: 'algebra', latex: '(a+b)^n = \\sum_{k=0}^{n} \\binom{n}{k} a^{n-k} b^k', description: '二项式定理的一般展开形式。', example: '(2+3)^5' },
  { id: 'discriminant', name: '判别式', category: 'algebra', latex: '\\Delta = b^2 - 4ac', description: '判别式决定二次方程的根的个数和性质。', example: 'solve(x^2 - 4*x + 4, x)' },
  { id: 'pythagorean-id', name: '完全平方', category: 'algebra', latex: '(a+b)^2 = a^2 + 2ab + b^2', description: '完全平方展开公式。', example: '(2 + 3)^2' },

  // Geometry
  { id: 'circle-area', name: '圆面积', category: 'geometry', latex: 'A = \\pi r^2', description: '半径为 r 的圆的面积。', example: 'pi * 5^2' },
  { id: 'circle-circ', name: '圆周长', category: 'geometry', latex: 'C = 2 \\pi r', description: '半径为 r 的圆的周长。', example: '2 * pi * 5' },
  { id: 'sphere-vol', name: '球体积', category: 'geometry', latex: 'V = \\frac{4}{3} \\pi r^3', description: '半径为 r 的球的体积。', example: '4/3 * pi * 3^3' },
  { id: 'pythagoras', name: '勾股定理', category: 'geometry', latex: 'a^2 + b^2 = c^2', description: '直角三角形三边关系。', example: 'sqrt(3^2 + 4^2)' },
  { id: 'triangle-area', name: '三角形面积', category: 'geometry', latex: 'A = \\frac{1}{2} b h', description: '底为 b、高为 h 的三角形面积。', example: '0.5 * 6 * 4' },

  // Trigonometry
  { id: 'sin2x', name: '二倍角公式', category: 'trigonometry', latex: '\\sin(2x) = 2 \\sin x \\cos x', description: '正弦的二倍角恒等式。', example: 'plot(sin(2*x))' },
  { id: 'cos2x', name: '余弦二倍角', category: 'trigonometry', latex: '\\cos(2x) = \\cos^2 x - \\sin^2 x', description: '余弦的二倍角恒等式。', example: 'plot(cos(2*x))' },
  { id: 'euler', name: '欧拉公式', category: 'trigonometry', latex: 'e^{i\\pi} + 1 = 0', description: '联系 e、i、π、1、0 的最美公式。', example: 'exp(i * pi) + 1' },
  { id: 'sin-sum', name: '正弦和角公式', category: 'trigonometry', latex: '\\sin(a+b) = \\sin a \\cos b + \\cos a \\sin b', description: '两角和的正弦公式。', example: 'sin(pi/4 + pi/6)' },
  { id: 'tan-half', name: '半角公式', category: 'trigonometry', latex: '\\tan\\frac{x}{2} = \\frac{1 - \\cos x}{\\sin x}', description: '正切半角恒等式。', example: 'tan(pi/8)' },

  // Calculus
  { id: 'deriv-xn', name: '幂函数导数', category: 'calculus', latex: '\\frac{d}{dx} x^n = n x^{n-1}', description: '幂函数的导数公式。', example: "derivative('x^3', 'x')" },
  { id: 'deriv-sin', name: '正弦导数', category: 'calculus', latex: '\\frac{d}{dx} \\sin x = \\cos x', description: 'sin(x) 的导数。', example: "derivative('sin(x)', 'x')" },
  { id: 'integral-xn', name: '幂函数积分', category: 'calculus', latex: '\\int x^n \\, dx = \\frac{x^{n+1}}{n+1} + C', description: '幂函数的不定积分。', example: 'integrate(x^2, x)' },
  { id: 'ftc', name: '微积分基本定理', category: 'calculus', latex: '\\int_a^b f(x) \\, dx = F(b) - F(a)', description: '牛顿—莱布尼茨公式。', example: 'integrate(x^2, x, 0, 1)' },
  { id: 'chain-rule', name: '链式法则', category: 'calculus', latex: '\\frac{d}{dx} f(g(x)) = f\'(g(x)) \\cdot g\'(x)', description: '复合函数求导法则。', example: "derivative('sin(x^2)', 'x')" },
  { id: 'taylor', name: '泰勒展开', category: 'calculus', latex: 'f(x) = \\sum_{n=0}^{\\infty} \\frac{f^{(n)}(a)}{n!} (x-a)^n', description: '函数在某点的泰勒级数展开。', example: "taylor('sin(x)', 'x', 0, 5)" },

  // Statistics
  { id: 'mean', name: '均值', category: 'statistics', latex: '\\bar{x} = \\frac{1}{n} \\sum_{i=1}^{n} x_i', description: '算术平均数。', example: 'mean([1, 2, 3, 4, 5])' },
  { id: 'variance', name: '方差', category: 'statistics', latex: '\\sigma^2 = \\frac{1}{n} \\sum_{i=1}^{n} (x_i - \\bar{x})^2', description: '总体方差。', example: 'var([1, 2, 3, 4, 5])' },
  { id: 'stddev', name: '标准差', category: 'statistics', latex: '\\sigma = \\sqrt{\\frac{1}{n} \\sum_{i=1}^{n} (x_i - \\bar{x})^2}', description: '总体标准差。', example: 'std([1, 2, 3, 4, 5])' },
  { id: 'normal', name: '正态分布', category: 'statistics', latex: 'f(x) = \\frac{1}{\\sigma\\sqrt{2\\pi}} e^{-\\frac{(x-\\mu)^2}{2\\sigma^2}}', description: '正态分布的概率密度函数。', example: 'plot(exp(-x^2/2)/sqrt(2*pi))' },

  // Physics
  { id: 'newton2', name: '牛顿第二定律', category: 'physics', latex: 'F = ma', description: '力等于质量乘以加速度。', example: '5 * 9.8' },
  { id: 'kinematics', name: '运动学方程', category: 'physics', latex: 'v = v_0 + at', description: '匀加速运动的末速度。', example: '0 + 9.8 * 3' },
  { id: 'ke', name: '动能', category: 'physics', latex: 'E_k = \\frac{1}{2} m v^2', description: '物体由于运动而具有的能量。', example: '0.5 * 2 * 10^2' },
  { id: 'ohm', name: '欧姆定律', category: 'physics', latex: 'V = IR', description: '电压等于电流乘以电阻。', example: '2 * 5' },
  { id: 'wave', name: '波速公式', category: 'physics', latex: 'v = \\lambda f', description: '波速等于波长乘以频率。', example: '0.5 * 440' },

  // Finance
  { id: 'ci', name: '复利公式', category: 'finance', latex: 'A = P \\left(1 + \\frac{r}{n}\\right)^{nt}', description: '复利终值计算公式。', example: '1000 * (1 + 0.05/12)^(12*5)' },
  { id: 'pv', name: '现值', category: 'finance', latex: 'PV = \\frac{FV}{(1+r)^n}', description: '未来值折算为现值。', example: '1000 / (1.05^5)' },
  { id: 'pmt', name: '等额本息', category: 'finance', latex: 'PMT = P \\cdot \\frac{r(1+r)^n}{(1+r)^n - 1}', description: '贷款每期还款额。', example: '100000 * (0.05/12 * (1+0.05/12)^60) / ((1+0.05/12)^60 - 1)' },
];

const ALL_CATEGORIES: CategoryKey[] = [
  'algebra',
  'geometry',
  'trigonometry',
  'calculus',
  'statistics',
  'physics',
  'finance',
];

// Default expanded: first 3 categories (algebra / geometry / trigonometry).
// The rest start collapsed.
const DEFAULT_EXPANDED_CATEGORIES: CategoryKey[] = [
  'algebra',
  'geometry',
  'trigonometry',
];

// Collapsible group keys: the 7 built-in categories plus the "custom" bucket.
type GroupKey = CategoryKey | 'custom';

type ActiveFilter = CategoryKey | 'all' | 'custom';

interface DisplayFormula extends Formula {
  custom: boolean;
}

const CUSTOM_FORMULAS_KEY = 'omnimath-custom-formulas-v1';

function isValidCustomFormula(v: unknown): v is CustomFormula {
  if (typeof v !== 'object' || v === null) return false;
  const f = v as Record<string, unknown>;
  return (
    typeof f.id === 'string' &&
    typeof f.name === 'string' &&
    typeof f.latex === 'string' &&
    typeof f.description === 'string' &&
    typeof f.example === 'string' &&
    typeof f.category === 'string' &&
    (ALL_CATEGORIES as string[]).includes(f.category)
  );
}

function loadCustomFormulas(): CustomFormula[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(CUSTOM_FORMULAS_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.filter(isValidCustomFormula);
  } catch {
    return [];
  }
}

function saveCustomFormulas(list: CustomFormula[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CUSTOM_FORMULAS_KEY, JSON.stringify(list));
  } catch {
    // ignore quota errors
  }
}

export function FormulaLibraryPanel() {
  const setEditorContent = useWorkbenchStore((s) => s.setEditorContent);
  const [query, setQuery] = useState('');
  const [activeCat, setActiveCat] = useState<ActiveFilter>('all');
  const [selected, setSelected] = useState<DisplayFormula | null>(null);
  const [customFormulas, setCustomFormulas] = useState<CustomFormula[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CustomFormula | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<GroupKey>>(
    () =>
      new Set(
        ALL_CATEGORIES.filter(
          (c) => !DEFAULT_EXPANDED_CATEGORIES.includes(c),
        ),
      ),
  );

  // Load persisted custom formulas after mount (SSR-safe).
  useEffect(() => {
    setCustomFormulas(loadCustomFormulas());
  }, []);

  const toggleGroup = (g: GroupKey) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(g)) next.delete(g);
      else next.add(g);
      return next;
    });
  };

  const allFormulas = useMemo<DisplayFormula[]>(
    () => [
      ...FORMULAS.map((f) => ({ ...f, custom: false })),
      ...customFormulas.map((f) => ({ ...f, custom: true })),
    ],
    [customFormulas],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allFormulas.filter((f) => {
      if (activeCat === 'custom' && !f.custom) return false;
      if (activeCat !== 'all' && activeCat !== 'custom' && f.category !== activeCat)
        return false;
      if (!q) return true;
      return (
        f.name.toLowerCase().includes(q) ||
        f.description.toLowerCase().includes(q) ||
        f.latex.toLowerCase().includes(q)
      );
    });
  }, [query, activeCat, allFormulas]);

  // Show grouped (collapsible) view only when browsing all categories
  // without a search query. Searching falls back to a flat list so all
  // matches are visible regardless of collapse state.
  const showGrouped = activeCat === 'all' && !query.trim();

  const openAddForm = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEditForm = (f: DisplayFormula) => {
    setEditing({
      id: f.id,
      name: f.name,
      category: f.category,
      latex: f.latex,
      description: f.description,
      example: f.example,
    });
    setFormOpen(true);
  };

  const handleSubmitForm = (values: Omit<CustomFormula, 'id'>) => {
    if (editing) {
      const updated: CustomFormula = { ...editing, ...values };
      setCustomFormulas((prev) => {
        const next = prev.map((f) => (f.id === editing.id ? updated : f));
        saveCustomFormulas(next);
        return next;
      });
      setSelected((prev) =>
        prev && prev.id === editing.id
          ? { ...updated, custom: true }
          : prev,
      );
    } else {
      const created: CustomFormula = {
        ...values,
        id: `custom-${Date.now().toString(36)}-${Math.random()
          .toString(36)
          .slice(2, 8)}`,
      };
      setCustomFormulas((prev) => {
        const next = [...prev, created];
        saveCustomFormulas(next);
        return next;
      });
    }
    setFormOpen(false);
    setEditing(null);
  };

  const handleDelete = (f: DisplayFormula) => {
    setCustomFormulas((prev) => {
      const next = prev.filter((c) => c.id !== f.id);
      saveCustomFormulas(next);
      return next;
    });
    setSelected(null);
  };

  const customCount = filtered.filter((f) => f.custom).length;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 px-3 pt-3 pb-2 border-b border-border/60">
        <div className="flex items-center gap-1.5 mb-2">
          <BookOpen className="size-3.5 text-primary" />
          <span className="text-[12.5px] font-semibold tracking-tight">
            {t('formulasTitle')}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={openAddForm}
            className="ml-auto h-6 px-1.5 text-[11px] gap-1 text-muted-foreground hover:text-primary"
            aria-label={t('formulasAddCustom')}
            title={t('formulasAddCustom')}
          >
            <Plus className="size-3.5" />
            {t('formulasAddCustom')}
          </Button>
        </div>
        <div className="relative mb-2">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('formulasSearch')}
            className="h-7 pl-7 pr-2 text-[12px] bg-muted/40 border-border/60"
          />
        </div>
        {/* Category chips */}
        <div className="flex flex-wrap gap-1">
          <Chip
            active={activeCat === 'all'}
            onClick={() => setActiveCat('all')}
            label="全部"
          />
          {ALL_CATEGORIES.map((c) => (
            <Chip
              key={c}
              active={activeCat === c}
              onClick={() => setActiveCat(c)}
              label={t(CATEGORY_LABEL_KEY[c])}
            />
          ))}
          <Chip
            active={activeCat === 'custom'}
            onClick={() => setActiveCat('custom')}
            label={t('formulasCustom')}
          />
        </div>
      </div>

      {/* Body — list or detail */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-2">
          <AnimatePresence mode="wait" initial={false}>
            {selected ? (
              <motion.div
                key={`detail-${selected.id}`}
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.18 }}
              >
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="flex items-center gap-1 text-[11.5px] text-muted-foreground hover:text-foreground mb-3"
                >
                  <ArrowLeft className="size-3.5" />
                  {t('commonClose')}
                </button>
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="size-4 text-primary" />
                    <h3 className="text-[14px] font-semibold tracking-tight">
                      {selected.name}
                    </h3>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Badge
                      variant="outline"
                      className={cn(
                        'h-5 px-2 text-[10px] font-medium',
                        CATEGORY_COLOR[selected.category],
                      )}
                    >
                      {t(CATEGORY_LABEL_KEY[selected.category])}
                    </Badge>
                    {selected.custom && (
                      <Badge
                        variant="outline"
                        className={cn(
                          'h-5 px-2 text-[10px] font-medium',
                          CUSTOM_COLOR,
                        )}
                      >
                        {t('formulasCustom')}
                      </Badge>
                    )}
                  </div>
                  <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 glow-card-teal">
                    <FormulaRenderer latex={selected.latex} displayMode />
                  </div>
                  <p className="text-[12px] text-foreground/80 leading-relaxed">
                    {selected.description}
                  </p>
                  <div className="rounded-md border border-border/60 bg-muted/30 p-2">
                    <div className="text-[10.5px] text-muted-foreground mb-1">
                      {t('formulasExample')}
                    </div>
                    <code className="font-mono text-[12px] text-primary/90 break-all">
                      {selected.example}
                    </code>
                  </div>
                  <Button
                    onClick={() => setEditorContent(selected.example)}
                    className="w-full h-8 text-[12px] gap-1.5"
                    size="sm"
                  >
                    <Plus className="size-3.5" />
                    {t('formulasInsertExample')}
                  </Button>
                  {selected.custom && (
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEditForm(selected)}
                        className="flex-1 h-8 text-[12px] gap-1.5"
                      >
                        <Pencil className="size-3.5" />
                        {t('commonEdit')}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(selected)}
                        className="flex-1 h-8 text-[12px] gap-1.5 text-destructive hover:text-destructive"
                      >
                        <Trash2 className="size-3.5" />
                        {t('commonDelete')}
                      </Button>
                    </div>
                  )}
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="list"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-1"
              >
                {filtered.length === 0 ? (
                  <div className="text-center py-12 text-[12px] text-muted-foreground">
                    {activeCat === 'custom' && !query.trim()
                      ? t('formulasCustomEmpty')
                      : t('cpNoResults')}
                  </div>
                ) : showGrouped ? (
                  <>
                    {ALL_CATEGORIES.map((cat) => {
                      const items = filtered.filter((f) => f.category === cat);
                      if (items.length === 0) return null;
                      const isCollapsed = collapsedGroups.has(cat);
                      return (
                        <div key={cat} className="mb-1">
                          <GroupHeader
                            label={t(CATEGORY_LABEL_KEY[cat])}
                            colorClass={CATEGORY_COLOR[cat]}
                            count={items.length}
                            collapsed={isCollapsed}
                            onToggle={() => toggleGroup(cat)}
                          />
                          <AnimatePresence initial={false}>
                            {!isCollapsed && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2, ease: 'easeInOut' }}
                                className="overflow-hidden"
                              >
                                <div className="space-y-1 pt-1">
                                  {items.map((f, i) => (
                                    <FormulaCard
                                      key={f.id}
                                      formula={f}
                                      index={i}
                                      onClick={() => setSelected(f)}
                                    />
                                  ))}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })}
                    {customCount > 0 && (
                      <div className="mb-1">
                        <GroupHeader
                          label={t('formulasCustom')}
                          colorClass={CUSTOM_COLOR}
                          count={customCount}
                          collapsed={collapsedGroups.has('custom')}
                          onToggle={() => toggleGroup('custom')}
                        />
                        <AnimatePresence initial={false}>
                          {!collapsedGroups.has('custom') && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.2, ease: 'easeInOut' }}
                              className="overflow-hidden"
                            >
                              <div className="space-y-1 pt-1">
                                {filtered
                                  .filter((f) => f.custom)
                                  .map((f, i) => (
                                    <FormulaCard
                                      key={f.id}
                                      formula={f}
                                      index={i}
                                      onClick={() => setSelected(f)}
                                    />
                                  ))}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )}
                  </>
                ) : (
                  filtered.map((f, i) => (
                    <FormulaCard
                      key={f.id}
                      formula={f}
                      index={i}
                      onClick={() => setSelected(f)}
                    />
                  ))
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </ScrollArea>

      <CustomFormulaDialog
        open={formOpen}
        editing={editing}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditing(null);
        }}
        onSubmit={handleSubmitForm}
      />
    </div>
  );
}

function CustomFormulaDialog({
  open,
  editing,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  editing: CustomFormula | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: Omit<CustomFormula, 'id'>) => void;
}) {
  const [name, setName] = useState('');
  const [latex, setLatex] = useState('');
  const [category, setCategory] = useState<CategoryKey>('algebra');
  const [description, setDescription] = useState('');
  const [example, setExample] = useState('');

  // Reset the form each time the dialog opens (add vs. edit mode).
  useEffect(() => {
    if (open) {
      setName(editing?.name ?? '');
      setLatex(editing?.latex ?? '');
      setCategory(editing?.category ?? 'algebra');
      setDescription(editing?.description ?? '');
      setExample(editing?.example ?? '');
    }
  }, [open, editing]);

  const canSave = name.trim() !== '' && latex.trim() !== '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[14px]">
            {editing ? t('commonEdit') : t('formulasAddCustom')}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="custom-formula-name" className="text-[11.5px]">
              {t('formulasName')}
            </Label>
            <Input
              id="custom-formula-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-8 text-[12px]"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="custom-formula-latex" className="text-[11.5px]">
              {t('formulasLatex')}
            </Label>
            <Input
              id="custom-formula-latex"
              value={latex}
              onChange={(e) => setLatex(e.target.value)}
              className="h-8 text-[12px] font-mono"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11.5px]">{t('formulasCategories')}</Label>
            <Select
              value={category}
              onValueChange={(v) => setCategory(v as CategoryKey)}
            >
              <SelectTrigger className="w-full h-8 text-[12px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ALL_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c} className="text-[12px]">
                    {t(CATEGORY_LABEL_KEY[c])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="custom-formula-desc" className="text-[11.5px]">
              {t('formulasDescription')}
            </Label>
            <Input
              id="custom-formula-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="h-8 text-[12px]"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="custom-formula-example" className="text-[11.5px]">
              {t('formulasExampleInput')}
            </Label>
            <Input
              id="custom-formula-example"
              value={example}
              onChange={(e) => setExample(e.target.value)}
              className="h-8 text-[12px] font-mono"
            />
          </div>
          {latex.trim() && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 glow-card-teal">
              <FormulaRenderer latex={latex} displayMode />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="h-8 text-[12px]"
          >
            {t('commonCancel')}
          </Button>
          <Button
            size="sm"
            disabled={!canSave}
            onClick={() =>
              onSubmit({
                name: name.trim(),
                latex: latex.trim(),
                category,
                description: description.trim(),
                example: example.trim(),
              })
            }
            className="h-8 text-[12px]"
          >
            {t('commonSave')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GroupHeader({
  label,
  colorClass,
  count,
  collapsed,
  onToggle,
}: {
  label: string;
  colorClass: string;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        'w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md border bg-muted/30 hover:bg-muted/60 transition-colors',
        'border-border/60',
      )}
      aria-expanded={!collapsed}
    >
      <span className="flex items-center gap-1.5">
        {collapsed ? (
          <ChevronRight className="size-3.5 text-muted-foreground" />
        ) : (
          <ChevronDown className="size-3.5 text-muted-foreground" />
        )}
        <span
          className={cn(
            'inline-flex items-center text-[10.5px] font-semibold px-1.5 py-0.5 rounded border',
            colorClass,
          )}
        >
          {label}
        </span>
      </span>
      <span className="text-[10.5px] text-muted-foreground tabular-nums">
        {count}
      </span>
    </button>
  );
}

function Chip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'h-5 px-2 text-[10.5px] rounded-full border transition-all',
        active
          ? 'bg-primary/15 text-primary border-primary/40'
          : 'bg-muted/40 text-muted-foreground border-border/60 hover:text-foreground hover:border-primary/40',
      )}
    >
      {label}
    </button>
  );
}

function FormulaCard({
  formula,
  index,
  onClick,
}: {
  formula: DisplayFormula;
  index: number;
  onClick: () => void;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.16, delay: Math.min(index * 0.015, 0.16) }}
      className="w-full text-left rounded-md border border-border/60 bg-card/60 hover:bg-accent/40 hover:border-primary/40 p-2.5 interactive-card"
    >
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-[12.5px] font-medium text-foreground truncate">
          {formula.name}
        </span>
        <span className="flex items-center gap-1 shrink-0">
          {formula.custom && (
            <span
              className={cn(
                'inline-flex items-center text-[9.5px] font-medium px-1.5 py-0.5 rounded border',
                CUSTOM_COLOR,
              )}
            >
              {t('formulasCustom')}
            </span>
          )}
          <span
            className={cn(
              'inline-flex items-center text-[9.5px] font-medium px-1.5 py-0.5 rounded border',
              CATEGORY_COLOR[formula.category],
            )}
          >
            {t(CATEGORY_LABEL_KEY[formula.category])}
          </span>
        </span>
      </div>
      <p className="text-[11px] text-muted-foreground line-clamp-2">
        {formula.description}
      </p>
    </motion.button>
  );
}
