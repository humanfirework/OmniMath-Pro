/**
 * OmniMath Pro — 曲线数据 CSV 序列化（纯函数，无 React/DOM 依赖）。
 *
 * 供 2D 绘图导出：把多条曲线序列合并为一张 CSV 表格，每条序列占两列
 * （`{name}_x` / `{name}_y`）。不同序列取最大行数对齐，缺失/非有限值留空，
 * 保证 Excel / MATLAB / pandas 都能直接打开。
 */

/** 一条可导出为 CSV 的序列数据。 */
export interface SeriesData {
  name: string;
  x: number[];
  y: number[];
}

/**
 * 把多条序列合并为 CSV 文本。
 * - 空输入返回空字符串。
 * - 表头 = 每条序列的 `{name}_x`, `{name}_y`。
 * - 行数 = 所有序列 x/y 长度的最大值；不足的行补空单元格。
 */
export function seriesToCSV(series: SeriesData[]): string {
  if (series.length === 0) return '';
  const headers = series.flatMap((s) => [`${s.name}_x`, `${s.name}_y`]);
  const rows = Math.max(0, ...series.map((s) => Math.max(s.x.length, s.y.length)));
  const lines: string[] = [headers.join(',')];
  for (let i = 0; i < rows; i++) {
    const cells: string[] = [];
    for (const s of series) {
      cells.push(formatCell(s.x[i]));
      cells.push(formatCell(s.y[i]));
    }
    lines.push(cells.join(','));
  }
  return lines.join('\n');
}

/** 数值转 CSV 单元格：缺失 / 非有限值输出空字符串。 */
function formatCell(v: number | undefined): string {
  if (v === undefined || !Number.isFinite(v)) return '';
  return String(v);
}