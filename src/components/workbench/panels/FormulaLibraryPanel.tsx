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
  Tags,
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
  // A built-in CategoryKey, a user-defined custom category id, or the
  // 'custom' sentinel (uncategorized — falls back to the "Custom" bucket).
  category: string;
  latex: string;
  description: string;
  example: string;
}

interface CustomCategory {
  id: string;
  name: string;
  color?: string;
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

// Preset palette for custom categories — reuses the built-in CATEGORY_COLOR
// hues (plus CUSTOM_COLOR and two extras). `badge` is the class stored on the
// category and reused for badges / group headers; `swatch` is a solid bg used
// only for the picker dot so the color is clearly visible.
interface CategoryColorPreset {
  badge: string;
  swatch: string;
}

const CATEGORY_COLOR_PRESETS: CategoryColorPreset[] = [
  { badge: CATEGORY_COLOR.algebra, swatch: 'bg-teal-500' },
  { badge: CATEGORY_COLOR.geometry, swatch: 'bg-amber-500' },
  { badge: CATEGORY_COLOR.trigonometry, swatch: 'bg-rose-500' },
  { badge: CATEGORY_COLOR.calculus, swatch: 'bg-violet-500' },
  { badge: CATEGORY_COLOR.statistics, swatch: 'bg-emerald-500' },
  { badge: CATEGORY_COLOR.physics, swatch: 'bg-orange-500' },
  { badge: CATEGORY_COLOR.finance, swatch: 'bg-cyan-500' },
  { badge: CUSTOM_COLOR, swatch: 'bg-fuchsia-500' },
  {
    badge: 'text-blue-600 dark:text-blue-400 bg-blue-500/10 border-blue-500/30',
    swatch: 'bg-blue-500',
  },
  {
    badge: 'text-pink-600 dark:text-pink-400 bg-pink-500/10 border-pink-500/30',
    swatch: 'bg-pink-500',
  },
];

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

// Collapsible group keys: a built-in CategoryKey, a custom category id, or
// the "custom" bucket for uncategorized user formulas.
type GroupKey = string;

// Active filter: 'all', 'custom', a built-in CategoryKey, or a custom
// category id.
type ActiveFilter = string;

interface DisplayFormula extends Omit<Formula, 'category'> {
  category: string;
  custom: boolean;
}

const CUSTOM_FORMULAS_KEY = 'omnimath-custom-formulas-v1';
const CUSTOM_CATEGORIES_KEY = 'omnimath-custom-categories-v1';

// Sentinel category value meaning "uncategorized custom formula" — such
// formulas surface under the "Custom" bucket.
const UNCATEGORIZED_SENTINEL = 'custom';

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
    f.category.length > 0
  );
}

function isValidCustomCategory(v: unknown): v is CustomCategory {
  if (typeof v !== 'object' || v === null) return false;
  const c = v as Record<string, unknown>;
  return (
    typeof c.id === 'string' &&
    c.id.length > 0 &&
    typeof c.name === 'string' &&
    c.name.length > 0 &&
    (c.color === undefined || typeof c.color === 'string')
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

function loadCustomCategories(): CustomCategory[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(CUSTOM_CATEGORIES_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.filter(isValidCustomCategory);
  } catch {
    return [];
  }
}

function saveCustomCategories(list: CustomCategory[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CUSTOM_CATEGORIES_KEY, JSON.stringify(list));
  } catch {
    // ignore quota errors
  }
}

function isBuiltinCategory(cat: string): cat is CategoryKey {
  return (ALL_CATEGORIES as string[]).includes(cat);
}

// Resolve a category id (built-in, custom, or sentinel/stale) to a color
// class string for badges / group headers.
function resolveCategoryColor(
  cat: string,
  customCategories: CustomCategory[],
): string {
  if (isBuiltinCategory(cat)) return CATEGORY_COLOR[cat];
  const cc = customCategories.find((c) => c.id === cat);
  if (cc?.color) return cc.color;
  return CUSTOM_COLOR;
}

// Resolve a category id to a human-readable label.
function resolveCategoryLabel(
  cat: string,
  customCategories: CustomCategory[],
): string {
  if (isBuiltinCategory(cat)) return t(CATEGORY_LABEL_KEY[cat]);
  const cc = customCategories.find((c) => c.id === cat);
  if (cc) return cc.name;
  return t('formulasCustom');
}

// A formula belongs to a "real" custom category (not the sentinel / stale).
function isInCustomCategory(
  cat: string,
  customCategories: CustomCategory[],
): boolean {
  return customCategories.some((c) => c.id === cat);
}

export function FormulaLibraryPanel() {
  const setEditorContent = useWorkbenchStore((s) => s.setEditorContent);
  const [query, setQuery] = useState('');
  const [activeCat, setActiveCat] = useState<ActiveFilter>('all');
  const [selected, setSelected] = useState<DisplayFormula | null>(null);
  const [customFormulas, setCustomFormulas] = useState<CustomFormula[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CustomFormula | null>(null);
  const [customCategories, setCustomCategories] = useState<CustomCategory[]>([]);
  const [categoryManageOpen, setCategoryManageOpen] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<GroupKey>>(
    () =>
      new Set(
        ALL_CATEGORIES.filter(
          (c) => !DEFAULT_EXPANDED_CATEGORIES.includes(c),
        ),
      ),
  );

  // Load persisted custom formulas + categories after mount (SSR-safe).
  useEffect(() => {
    setCustomFormulas(loadCustomFormulas());
    setCustomCategories(loadCustomCategories());
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

  const handleCreateCategory = (name: string, color?: string) => {
    const created: CustomCategory = {
      id: `cat-${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 8)}`,
      name: name.trim(),
      color: color ?? CUSTOM_COLOR,
    };
    setCustomCategories((prev) => {
      const next = [...prev, created];
      saveCustomCategories(next);
      return next;
    });
  };

  const handleRenameCategory = (id: string, name: string) => {
    setCustomCategories((prev) => {
      const next = prev.map((c) => (c.id === id ? { ...c, name } : c));
      saveCustomCategories(next);
      return next;
    });
  };

  const handleDeleteCategory = (id: string) => {
    setCustomCategories((prev) => {
      const next = prev.filter((c) => c.id !== id);
      saveCustomCategories(next);
      return next;
    });
    // Reassign formulas in the deleted category to the uncategorized
    // ("custom") bucket so they are not orphaned.
    setCustomFormulas((prev) => {
      const next = prev.map((f) =>
        f.category === id ? { ...f, category: UNCATEGORIZED_SENTINEL } : f,
      );
      saveCustomFormulas(next);
      return next;
    });
    // If the deleted category was the active filter, fall back to "all".
    setActiveCat((prev) => (prev === id ? 'all' : prev));
  };

  // "Custom" bucket count: custom formulas NOT filed under a (still-existing)
  // custom category. Built-in-categorized custom formulas are included, so
  // existing behavior (where every custom formula showed under "Custom") is
  // preserved when there are no custom categories.
  const customCount = filtered.filter(
    (f) => f.custom && !isInCustomCategory(f.category, customCategories),
  ).length;

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
            onClick={() => setCategoryManageOpen(true)}
            className="ml-auto h-6 px-1.5 text-[11px] gap-1 text-muted-foreground hover:text-primary"
            aria-label={t('formulasCategoryManage')}
            title={t('formulasCategoryManage')}
          >
            <Tags className="size-3.5" />
            {t('formulasCategoryManage')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={openAddForm}
            className="h-6 px-1.5 text-[11px] gap-1 text-muted-foreground hover:text-primary"
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
          {customCategories.map((cc) => (
            <Chip
              key={cc.id}
              active={activeCat === cc.id}
              onClick={() => setActiveCat(cc.id)}
              label={cc.name}
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
                        resolveCategoryColor(selected.category, customCategories),
                      )}
                    >
                      {resolveCategoryLabel(selected.category, customCategories)}
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
                                      categoryColor={resolveCategoryColor(f.category, customCategories)}
                                      categoryLabel={resolveCategoryLabel(f.category, customCategories)}
                                    />
                                  ))}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })}
                    {customCategories.map((cc) => {
                      const items = filtered.filter((f) => f.category === cc.id);
                      if (items.length === 0) return null;
                      const isCollapsed = collapsedGroups.has(cc.id);
                      return (
                        <div key={cc.id} className="mb-1">
                          <GroupHeader
                            label={cc.name}
                            colorClass={cc.color ?? CUSTOM_COLOR}
                            count={items.length}
                            collapsed={isCollapsed}
                            onToggle={() => toggleGroup(cc.id)}
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
                                      categoryColor={resolveCategoryColor(f.category, customCategories)}
                                      categoryLabel={resolveCategoryLabel(f.category, customCategories)}
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
                                  .filter(
                                    (f) =>
                                      f.custom &&
                                      !isInCustomCategory(f.category, customCategories),
                                  )
                                  .map((f, i) => (
                                    <FormulaCard
                                      key={f.id}
                                      formula={f}
                                      index={i}
                                      onClick={() => setSelected(f)}
                                      categoryColor={resolveCategoryColor(f.category, customCategories)}
                                      categoryLabel={resolveCategoryLabel(f.category, customCategories)}
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
                      categoryColor={resolveCategoryColor(f.category, customCategories)}
                      categoryLabel={resolveCategoryLabel(f.category, customCategories)}
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
        customCategories={customCategories}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditing(null);
        }}
        onSubmit={handleSubmitForm}
      />

      <CategoryManageDialog
        open={categoryManageOpen}
        customCategories={customCategories}
        onOpenChange={setCategoryManageOpen}
        onCreate={handleCreateCategory}
        onRename={handleRenameCategory}
        onDelete={handleDeleteCategory}
      />
    </div>
  );
}

function CustomFormulaDialog({
  open,
  editing,
  customCategories,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  editing: CustomFormula | null;
  customCategories: CustomCategory[];
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: Omit<CustomFormula, 'id'>) => void;
}) {
  const [name, setName] = useState('');
  const [latex, setLatex] = useState('');
  const [category, setCategory] = useState<string>('algebra');
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
              onValueChange={(v) => setCategory(v)}
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
                {customCategories.map((cc) => (
                  <SelectItem key={cc.id} value={cc.id} className="text-[12px]">
                    {cc.name}
                  </SelectItem>
                ))}
                <SelectItem value={UNCATEGORIZED_SENTINEL} className="text-[12px]">
                  {t('formulasCustom')}
                </SelectItem>
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
  categoryColor,
  categoryLabel,
}: {
  formula: DisplayFormula;
  index: number;
  onClick: () => void;
  categoryColor: string;
  categoryLabel: string;
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
          {formula.category !== UNCATEGORIZED_SENTINEL && (
            <span
              className={cn(
                'inline-flex items-center text-[9.5px] font-medium px-1.5 py-0.5 rounded border',
                categoryColor,
              )}
            >
              {categoryLabel}
            </span>
          )}
        </span>
      </div>
      <p className="text-[11px] text-muted-foreground line-clamp-2">
        {formula.description}
      </p>
    </motion.button>
  );
}

function CategoryManageDialog({
  open,
  customCategories,
  onOpenChange,
  onCreate,
  onRename,
  onDelete,
}: {
  open: boolean;
  customCategories: CustomCategory[];
  onOpenChange: (open: boolean) => void;
  onCreate: (name: string, color?: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}) {
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState<string>(CATEGORY_COLOR_PRESETS[0].badge);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  // Reset transient form state each time the dialog opens.
  useEffect(() => {
    if (open) {
      setNewName('');
      setNewColor(CATEGORY_COLOR_PRESETS[0].badge);
      setEditingId(null);
      setEditName('');
    }
  }, [open]);

  const canCreate = newName.trim() !== '';

  const confirmEdit = () => {
    if (editingId && editName.trim()) {
      onRename(editingId, editName.trim());
    }
    setEditingId(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[14px]">
            {t('formulasCategoryManage')}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {/* Create new category */}
          <div className="space-y-2 rounded-md border border-border/60 p-2.5">
            <div className="text-[11px] font-medium text-muted-foreground">
              {t('formulasCategoryAdd')}
            </div>
            <div className="flex gap-2">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t('formulasCategoryName')}
                className="h-8 text-[12px] flex-1"
              />
              <Button
                size="sm"
                disabled={!canCreate}
                onClick={() => {
                  onCreate(newName, newColor);
                  setNewName('');
                  setNewColor(CATEGORY_COLOR_PRESETS[0].badge);
                }}
                className="h-8 text-[12px] gap-1"
              >
                <Plus className="size-3.5" />
                {t('formulasCategoryAdd')}
              </Button>
            </div>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {CATEGORY_COLOR_PRESETS.map((p) => (
                <button
                  key={p.badge}
                  type="button"
                  onClick={() => setNewColor(p.badge)}
                  aria-label={t('formulasCategoryColor')}
                  className={cn(
                    'size-5 rounded-full border-2 border-border/40 transition-all',
                    p.swatch,
                    newColor === p.badge
                      ? 'ring-2 ring-primary/60 scale-110'
                      : 'opacity-80 hover:opacity-100',
                  )}
                />
              ))}
            </div>
          </div>

          {/* Existing custom categories */}
          <div className="space-y-1.5 max-h-60 overflow-auto">
            {customCategories.length === 0 ? (
              <div className="text-center py-6 text-[12px] text-muted-foreground">
                {t('formulasCategoryEmpty')}
              </div>
            ) : (
              customCategories.map((cc) => (
                <div
                  key={cc.id}
                  className="flex items-center gap-2 rounded-md border border-border/60 p-2"
                >
                  <span
                    className={cn(
                      'inline-flex items-center text-[10.5px] font-medium px-1.5 py-0.5 rounded border',
                      cc.color ?? CUSTOM_COLOR,
                    )}
                  >
                    {editingId === cc.id ? (
                      <input
                        autoFocus
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') confirmEdit();
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        className="bg-transparent outline-none w-24 text-[10.5px]"
                      />
                    ) : (
                      cc.name
                    )}
                  </span>
                  <span className="ml-auto flex items-center gap-1">
                    {editingId === cc.id ? (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={confirmEdit}
                          className="h-6 px-2 text-[11px]"
                        >
                          {t('commonSave')}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEditingId(null)}
                          className="h-6 px-2 text-[11px]"
                        >
                          {t('commonCancel')}
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditingId(cc.id);
                            setEditName(cc.name);
                          }}
                          className="h-6 px-2 text-[11px] gap-1"
                        >
                          <Pencil className="size-3" />
                          {t('commonEdit')}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (
                              typeof window !== 'undefined' &&
                              window.confirm(t('formulasCategoryDeleteConfirm'))
                            ) {
                              onDelete(cc.id);
                            }
                          }}
                          className="h-6 px-2 text-[11px] gap-1 text-destructive hover:text-destructive"
                        >
                          <Trash2 className="size-3" />
                          {t('commonDelete')}
                        </Button>
                      </>
                    )}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="h-8 text-[12px]"
          >
            {t('commonClose')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
