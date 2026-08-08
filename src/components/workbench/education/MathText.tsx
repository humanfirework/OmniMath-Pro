'use client';

/**
 * OmniMath Pro — 教育模块 · 行内数学文本渲染
 *
 * 把含 `$...$` 内联 LaTeX 的字符串渲染成带数学公式的文本节点。
 * 复用全局 FormulaRenderer（KaTeX），保证与工作台其余部分视觉一致。
 * 纯展示组件。
 */

import { Fragment } from 'react';
import { FormulaRenderer, sanitizeLatexInput } from '@/components/workbench/FormulaRenderer';

/** 将文本按 `$...$` / `$$...$$` 切分，数学段用 KaTeX 渲染。 */
export function MathText({ text }: { text: string }) {
  const parts = text.split(/(\$\$[\s\S]*?\$\$|\$[^$\n]+\$)/g);
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith('$$') && p.endsWith('$$') && p.length > 4) {
          return (
            <span key={i} className="inline-block align-middle">
              <FormulaRenderer latex={sanitizeLatexInput(p.slice(2, -2))} displayMode />
            </span>
          );
        }
        if (p.startsWith('$') && p.endsWith('$') && p.length > 2) {
          return (
            <span key={i} className="inline-block align-middle">
              <FormulaRenderer latex={sanitizeLatexInput(p.slice(1, -1))} />
            </span>
          );
        }
        return <Fragment key={i}>{p}</Fragment>;
      })}
    </>
  );
}
