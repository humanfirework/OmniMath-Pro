'use client';

/**
 * OmniMath Pro — 分步求解步骤渲染（共享组件，Task 4.4）
 *
 * 将 engine 各模块返回的 steps: string[]（LaTeX 字符串，法则/方法名
 * 内联）渲染为带步骤编号的垂直列表：
 *
 *   ┌───────────────────────────────────────────┐
 *   │ 求解步骤 (5)                       展开/收起 │
 *   │ ①  f(x) = x^2 · sin(x)                    │
 *   │ ②  乘积法则：(u·v)' = u'v + uv'            │
 *   │ ③  …                                      │
 *   └───────────────────────────────────────────┘
 *
 * 供 SolverWorkbench 与 SolverPanel 复用；高斯消元步骤请使用
 * GaussianEliminationView（矩阵时间线，格式不同）。
 */

import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp, ListOrdered } from 'lucide-react';
import { FormulaRenderer } from '@/components/workbench/FormulaRenderer';
import { cn } from '@/lib/utils';

export interface SolverStepsViewProps {
  steps: string[];
  /** 标题，默认 "求解步骤" */
  title?: string;
  /** 默认展开的步数；undefined = 全部展开 */
  defaultExpandedCount?: number;
  className?: string;
}

/** 步骤首条 \text{...} 前缀视为"法则/说明"标签，用于高亮展示 */
function splitRuleLabel(raw: string): { label: string | null; body: string } {
  const m = /^\\text\{([^}]*)\}/.exec(raw);
  if (!m) return { label: null, body: raw };
  const text = m[1];
  // 仅在看起来像法则/方法说明（含"法则"、"提示"、"公式"、"识别"等）时拆出标签
  if (/法则|提示|公式|识别|迭代|扫描|回代|换元|检验|检查/.test(text)) {
    const body = raw.slice(m[0].length).replace(/^[：:]\s*/, '').trim();
    return { label: text, body: body || raw };
  }
  return { label: null, body: raw };
}

export function SolverStepsView({
  steps,
  title = '求解步骤',
  defaultExpandedCount,
  className,
}: SolverStepsViewProps) {
  const parsed = useMemo(() => steps.map(splitRuleLabel), [steps]);
  const [collapsed, setCollapsed] = useState(
    defaultExpandedCount !== undefined && defaultExpandedCount < steps.length,
  );
  const [heightExpanded, setHeightExpanded] = useState(false);

  if (parsed.length === 0) return null;

  const visibleSteps =
    collapsed && defaultExpandedCount !== undefined
      ? parsed.slice(0, defaultExpandedCount)
      : parsed;
  const hiddenCount = parsed.length - visibleSteps.length;

  return (
    <div
      className={cn(
        'rounded-lg border border-border/60 bg-muted/20 overflow-hidden',
        className,
      )}
    >
      {/* 标题栏 */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/40 bg-background/40">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-foreground/85">
          <ListOrdered className="size-3.5 text-primary" />
          {title}
          <span className="text-muted-foreground">({parsed.length})</span>
        </span>
        <div className="flex items-center gap-2">
          {defaultExpandedCount !== undefined && parsed.length > defaultExpandedCount && (
            <button
              type="button"
              onClick={() => setCollapsed((v) => !v)}
              className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              {collapsed ? (
                <>
                  <ChevronDown className="size-3" />
                  展开全部 ({hiddenCount})
                </>
              ) : (
                <>
                  <ChevronUp className="size-3" />
                  收起
                </>
              )}
            </button>
          )}
          <button
            type="button"
            onClick={() => setHeightExpanded((v) => !v)}
            className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          >
            {heightExpanded ? (
              <>
                <ChevronUp className="size-3" />
                收起全部
              </>
            ) : (
              <>
                <ChevronDown className="size-3" />
                展开全部
              </>
            )}
          </button>
        </div>
      </div>

      {/* 步骤列表 */}
      <div
        className={cn(
          'p-2 space-y-1.5',
          heightExpanded ? 'overflow-y-visible' : 'max-h-[600px] overflow-y-auto',
        )}
      >
        <AnimatePresence initial={false}>
          {visibleSteps.map((step, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: Math.min(i * 0.03, 0.3), duration: 0.2 }}
              className="flex items-start gap-2 rounded-md border border-primary/20 bg-primary/5 px-2 py-1.5"
            >
              {/* 步骤编号 */}
              <div className="shrink-0 mt-0.5 grid place-items-center size-5 rounded-full bg-background/80 border border-border/60">
                <span className="text-[9.5px] font-mono font-semibold text-muted-foreground">
                  {i + 1}
                </span>
              </div>

              <div className="flex-1 min-w-0 overflow-x-auto">
                {/* 法则/方法标签 */}
                {step.label && (
                  <div className="text-[10px] font-medium text-primary/90 mb-0.5">
                    {step.label}
                  </div>
                )}
                <div
                  className={cn(
                    'mt-1.5',
                    (/\\begin\{cases\}|\\begin\{bmatrix\}|\\begin\{aligned\}|\\begin\{array\}|\\begin\{pmatrix\}|\\begin\{vmatrix\}/.test(step.body)) && 'formula-card-glow'
                  )}
                  style={(/'''|\\prime\\prime\\prime|\\prime\\prime[^\\]|\\dddot|\\ddddot/.test(step.body)) ? { minHeight: 80 } : undefined}
                >
                  <FormulaRenderer
                    latex={step.body}
                    displayMode
                    fitToContainer={true}
                    className="text-[11px]"
                  />
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
