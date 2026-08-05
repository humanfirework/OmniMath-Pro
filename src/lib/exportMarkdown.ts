// 数据可迁移导出 —— Markdown / LaTeX 序列化辅助
//
// 纯逻辑模块（无 DOM 依赖），把 CalculationResult 序列化为可粘贴到
// 论文 / 课程 / Obsidian / Typora 等场景的文本。供 PreviewPanel（结果
// 导出）与 FloatingCalculator（便签导出）复用。
//
// 导出能力：
//   - Markdown：含标题、输入/输出代码块、LaTeX 用 $$...$$ 包裹、
//     矩阵用 Markdown 表格、求解步骤用有序列表。
//   - LaTeX：生成可直接编译的完整 .tex 文档片段。

import type { CalculationResult } from '@/lib/store/workbench';

/** 将二维数值矩阵序列化为 Markdown 表格。 */
export function matrixToMarkdown(matrix: number[][]): string {
  if (matrix.length === 0) return '';
  const cols = matrix.reduce((m, row) => Math.max(m, row.length), 0);
  if (cols === 0) return '';

  const header = Array.from({ length: cols }, (_, i) => `c${i + 1}`).join(' | ');
  const separator = Array.from({ length: cols }, () => '---').join(' | ');
  const rows = matrix.map((row) =>
    Array.from({ length: cols }, (_, i) =>
      row[i] === undefined ? '' : formatNumber(row[i]),
    ).join(' | '),
  );

  return [`| ${header} |`, `| ${separator} |`, ...rows.map((r) => `| ${r} |`)].join(
    '\n',
  );
}

/** 将单个计算结果序列化为 Markdown 段落。 */
export function resultToMarkdown(result: CalculationResult): string {
  const parts: string[] = [];

  // 输入
  parts.push('**输入**');
  parts.push(['```text', result.input, '```'].join('\n'));

  // 输出：优先 LaTeX（块级公式），否则用代码块
  parts.push('**输出**');
  if (result.latex && result.latex.trim()) {
    parts.push(['$$', result.latex, '$$'].join('\n'));
  } else {
    parts.push(['```text', result.output, '```'].join('\n'));
  }

  // 矩阵 → Markdown 表格
  if (result.isMatrix && result.matrix && result.matrix.length > 0) {
    parts.push('**矩阵**');
    parts.push(matrixToMarkdown(result.matrix));
  }

  // 求解步骤 → 有序列表
  if (result.steps && result.steps.length > 0) {
    parts.push('**步骤**');
    parts.push(result.steps.map((s, i) => `${i + 1}. ${s}`).join('\n'));
  }

  return parts.join('\n\n');
}

/**
 * 将一组计算结果序列化为完整的 Markdown 文档。
 * @param results 结果数组（按给定顺序输出）
 * @param options title 文档标题
 */
export function resultsToMarkdown(
  results: CalculationResult[],
  options: { title?: string } = {},
): string {
  const { title = 'OmniMath 计算结果' } = options;
  const header = `# ${title}`;
  const body = results
    .map((r, i) => `## ${i + 1}. ${r.input}\n\n${resultToMarkdown(r)}`)
    .join('\n\n---\n\n');
  return [header, '', body].join('\n');
}

/** 将二维数值矩阵序列化为 LaTeX bmatrix 环境。 */
export function matrixToLatex(matrix: number[][]): string {
  if (matrix.length === 0) return '\\begin{bmatrix}\\end{bmatrix}';
  const body = matrix.map((row) => row.map((v) => formatNumber(v)).join(' & ') + ' \\\\').join('\n');
  return `\\begin{bmatrix}\n${body}\n\\end{bmatrix}`;
}

/** 将单个计算结果序列化为可编译的 .tex 文档。 */
export function resultToLatex(result: CalculationResult): string {
  const lines: string[] = [];
  lines.push('\\documentclass{article}');
  lines.push('\\usepackage{amsmath}');
  lines.push('\\begin{document}');
  lines.push(`\\section*{输入}`);
  lines.push(['\\begin{verbatim}', result.input, '\\end{verbatim}'].join('\n'));
  lines.push(`\\section*{输出}`);
  if (result.latex && result.latex.trim()) {
    lines.push(`\\[\n${result.latex}\n\\]`);
  } else {
    lines.push(['\\begin{verbatim}', result.output, '\\end{verbatim}'].join('\n'));
  }
  if (result.isMatrix && result.matrix && result.matrix.length > 0) {
    lines.push(`\\section*{矩阵}`);
    lines.push(`\\[\n${matrixToLatex(result.matrix)}\n\\]`);
  }
  lines.push('\\end{document}');
  return lines.join('\n');
}

/** 数值格式化：保留 8 位小数，去掉浮点尾数（如 0.30000000000000004 → 0.3）。 */
function formatNumber(v: number): string {
  if (!Number.isFinite(v)) return String(v);
  if (Math.abs(v) < 1e-8) return '0';
  const rounded = Math.round(v * 1e8) / 1e8;
  return String(rounded);
}