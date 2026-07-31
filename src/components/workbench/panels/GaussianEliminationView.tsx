'use client';

/**
 * OmniMath Pro — 高斯消元步骤可视化
 *
 * 将 solveLinearSystem 返回的 steps: string[] 渲染为带步骤编号、
 * 操作类型标签、颜色编码的垂直时间线。每一步显示：
 *   - 步骤序号徽章
 *   - 操作描述（如 R₁ ↔ R₂、R₁ ÷ 2、R₂ − 3R₁）
 *   - 增广矩阵的 KaTeX 渲染
 *
 * 步骤字符串格式（由 LinearAlgebraPanel.solveLinearSystem 生成）：
 *   - 初始：'\text{增广矩阵 } [A|b] = <matrix_latex>'
 *   - 交换：'R_i \leftrightarrow R_j: <matrix_latex>'
 *   - 缩放：'R_i \div k: <matrix_latex>'
 *   - 消元：'R_i - k R_j: <matrix_latex>'
 */

import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp, GitCompareArrows, Scissors, Scale } from 'lucide-react';
import { FormulaRenderer } from '@/components/workbench/FormulaRenderer';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';

type StepKind = 'initial' | 'swap' | 'scale' | 'eliminate';

interface ParsedStep {
  kind: StepKind;
  operation: string;
  matrix: string;
  raw: string;
}

/** 根据操作字符串前缀推断步骤类型 */
function classifyStep(operation: string): StepKind {
  if (operation.includes('\\leftrightarrow')) return 'swap';
  if (operation.includes('\\div')) return 'scale';
  if (operation.includes('-') || operation.includes('R_')) return 'eliminate';
  return 'initial';
}

/** 将 solveLinearSystem 的 step 字符串解析为 { operation, matrix } */
function parseStep(raw: string): ParsedStep {
  // 初始增广矩阵步骤：以 "= " 分隔
  const eqIdx = raw.indexOf('= ');
  if (eqIdx !== -1 && raw.startsWith('\\text{')) {
    const operation = raw.slice(0, eqIdx);
    const matrix = raw.slice(eqIdx + 2);
    return { kind: 'initial', operation, matrix, raw };
  }
  // 操作步骤：以 ": " 分隔
  const colonIdx = raw.indexOf(': ');
  if (colonIdx !== -1) {
    const operation = raw.slice(0, colonIdx);
    const matrix = raw.slice(colonIdx + 2);
    return { kind: classifyStep(operation), operation, matrix, raw };
  }
  // 无法解析 — 整体作为矩阵
  return { kind: 'initial', operation: '', matrix: raw, raw };
}

const KIND_CONFIG: Record<StepKind, { color: string; bg: string; border: string; icon: typeof Scale; label: string }> = {
  initial: {
    color: 'text-sky-400',
    bg: 'bg-sky-500/8',
    border: 'border-sky-500/30',
    icon: GitCompareArrows,
    label: '初始',
  },
  swap: {
    color: 'text-amber-400',
    bg: 'bg-amber-500/8',
    border: 'border-amber-500/30',
    icon: GitCompareArrows,
    label: '交换',
  },
  scale: {
    color: 'text-violet-400',
    bg: 'bg-violet-500/8',
    border: 'border-violet-500/30',
    icon: Scale,
    label: '缩放',
  },
  eliminate: {
    color: 'text-teal-400',
    bg: 'bg-teal-500/8',
    border: 'border-teal-500/30',
    icon: Scissors,
    label: '消元',
  },
};

export interface GaussianEliminationViewProps {
  steps: string[];
  /** 默认展开数量（前 N 步），默认全部展开 */
  defaultExpandedCount?: number;
  className?: string;
}

export function GaussianEliminationView({
  steps,
  defaultExpandedCount,
  className,
}: GaussianEliminationViewProps) {
  const parsed = useMemo(() => steps.map(parseStep), [steps]);
  const [collapsed, setCollapsed] = useState(defaultExpandedCount !== undefined && defaultExpandedCount < steps.length);

  const visibleSteps = collapsed && defaultExpandedCount !== undefined
    ? parsed.slice(0, defaultExpandedCount)
    : parsed;
  const hiddenCount = parsed.length - visibleSteps.length;

  if (parsed.length === 0) return null;

  return (
    <div className={cn('rounded-lg border border-border/60 bg-muted/20 overflow-hidden', className)}>
      {/* 标题栏 */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/40 bg-background/40">
        <span className="text-[11px] font-medium text-foreground/85">
          {t('linalgGaussSteps')}
          <span className="ml-1.5 text-muted-foreground">({parsed.length})</span>
        </span>
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
      </div>

      {/* 步骤列表 */}
      <div className="max-h-80 overflow-y-auto p-2 space-y-1.5">
        <AnimatePresence initial={false}>
          {visibleSteps.map((step, i) => {
            const cfg = KIND_CONFIG[step.kind];
            const Icon = cfg.icon;
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: Math.min(i * 0.03, 0.3), duration: 0.2 }}
                className={cn(
                  'grid grid-cols-[auto,1fr] gap-3 max-[480px]:grid-cols-1 rounded-md border px-2 py-1.5',
                  cfg.bg,
                  cfg.border,
                )}
              >
                {/* 步骤编号 */}
                <div className="shrink-0 mt-0.5 grid place-items-center size-5 rounded-full bg-background/80 border border-border/60">
                  <span className="text-[9.5px] font-mono font-semibold text-muted-foreground">
                    {i + 1}
                  </span>
                </div>

                {/* 操作标签 */}
                {step.operation && (
                  <div className="shrink-0 flex items-center gap-1 mt-0.5">
                    <Icon className={cn('size-3', cfg.color)} />
                    <span className={cn('text-[10px] font-mono', cfg.color)}>
                      {step.operation.replace(/\\leftrightarrow/g, '↔').replace(/\\div/g, '÷').replace(/\\text\{([^}]*)\}/g, '$1')}
                    </span>
                  </div>
                )}

                {/* 矩阵渲染 */}
                <div className="min-w-0 overflow-x-auto">
                  <FormulaRenderer
                    latex={step.matrix}
                    displayMode
                    fitToContainer={true}
                    className="text-[11px]"
                  />
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
