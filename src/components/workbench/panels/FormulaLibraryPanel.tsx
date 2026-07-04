'use client';

/**
 * OmniMath Pro — Formula Library Panel
 *
 * 7 categories of formulas (Algebra, Geometry, Trigonometry, Calculus,
 * Statistics, Physics, Finance) with search + clickable chips.
 *
 * List view: formula name + brief description, click to expand details.
 * Detail view: name + LaTeX rendering (KaTeX) + description + "Insert"
 * button → inserts example into editor.
 *
 * 30+ formulas across categories.
 */

import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BookOpen,
  Search,
  ArrowLeft,
  Sparkles,
  Plus,
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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

const FORMULAS: Formula[] = [
  // Algebra
  { id: 'quad-formula', name: '求根公式', category: 'algebra', latex: 'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}', description: '二次方程 ax² + bx + c = 0 的解。', example: 'solve(x^2 - 5*x + 6, x)' },
  { id: 'binom', name: '二项式展开', category: 'algebra', latex: '(a+b)^n = \\sum_{k=0}^{n} \\binom{n}{k} a^{n-k} b^k', description: '二项式定理的一般展开形式。', example: '2 + 3 * 4' },
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
  { id: 'integral-xn', name: '幂函数积分', category: 'calculus', latex: '\\int x^n \\, dx = \\frac{x^{n+1}}{n+1} + C', description: '幂函数的不定积分。', example: "integrate('x^2', 'x')" },
  { id: 'ftc', name: '微积分基本定理', category: 'calculus', latex: '\\int_a^b f(x) \\, dx = F(b) - F(a)', description: '牛顿—莱布尼茨公式。', example: "integrate('x^2', 'x')" },
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

export function FormulaLibraryPanel() {
  const setEditorContent = useWorkbenchStore((s) => s.setEditorContent);
  const [query, setQuery] = useState('');
  const [activeCat, setActiveCat] = useState<CategoryKey | 'all'>('all');
  const [selected, setSelected] = useState<Formula | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return FORMULAS.filter((f) => {
      if (activeCat !== 'all' && f.category !== activeCat) return false;
      if (!q) return true;
      return (
        f.name.toLowerCase().includes(q) ||
        f.description.toLowerCase().includes(q) ||
        f.latex.toLowerCase().includes(q)
      );
    });
  }, [query, activeCat]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 px-3 pt-3 pb-2 border-b border-border/60">
        <div className="flex items-center gap-1.5 mb-2">
          <BookOpen className="size-3.5 text-primary" />
          <span className="text-[12.5px] font-semibold tracking-tight">
            {t('formulasTitle')}
          </span>
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
                  <Badge
                    variant="outline"
                    className={cn(
                      'h-5 px-2 text-[10px] font-medium',
                      CATEGORY_COLOR[selected.category],
                    )}
                  >
                    {t(CATEGORY_LABEL_KEY[selected.category])}
                  </Badge>
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
                    {t('cpNoResults')}
                  </div>
                ) : (
                  filtered.map((f, i) => (
                    <motion.button
                      key={f.id}
                      type="button"
                      onClick={() => setSelected(f)}
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.16, delay: Math.min(i * 0.015, 0.16) }}
                      className="w-full text-left rounded-md border border-border/60 bg-card/60 hover:bg-accent/40 hover:border-primary/40 p-2.5 interactive-card"
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-[12.5px] font-medium text-foreground truncate">
                          {f.name}
                        </span>
                        <span
                          className={cn(
                            'inline-flex items-center text-[9.5px] font-medium px-1.5 py-0.5 rounded border',
                            CATEGORY_COLOR[f.category],
                          )}
                        >
                          {t(CATEGORY_LABEL_KEY[f.category])}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground line-clamp-2">
                        {f.description}
                      </p>
                    </motion.button>
                  ))
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </ScrollArea>
    </div>
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
