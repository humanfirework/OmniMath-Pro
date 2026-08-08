/**
 * OmniMath Pro — 控制理论 LaTeX 辅助工具
 *
 * 将多项式系数数组 / 有理分式转换为可被 FormulaRenderer（KaTeX）渲染的
 * LaTeX 字符串，供劳斯判据、梅逊公式、信号流图、校正器设计等模块复用。
 */

import { polyToLatex } from '@/components/workbench/panels/ControlTheorySection';

/** 多项式 → 带括号的 LaTeX（用于分子/分母，避免负号/加法歧义）。 */
export function polyToLatexParen(coeffs: number[]): string {
  const s = polyToLatex(coeffs);
  if (!s || s === '0') return '0';
  return `\\left(${s}\\right)`;
}

/** 有理分式 N(s)/D(s) → LaTeX 分式。 */
export function polyToLatexFrac(num: number[], den: number[]): string {
  const n = polyToLatex(num);
  const d = polyToLatex(den);
  if ((!n || n === '0') && (!d || d === '0')) return '0';
  if (!d || d === '0') return n || '0';
  if (!n || n === '0') return '0';
  return `\\dfrac{${n}}{${d}}`;
}

/** 系数数组 → 带符号的环形列表字符串（如 "0 → 1 → 2 → 0"）。 */
export function nodePathLatex(nodes: number[]): string {
  return nodes.map((n) => `x_{${n}}`).join(' \\to ');
}