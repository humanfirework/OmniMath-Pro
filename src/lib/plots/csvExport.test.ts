/**
 * Unit tests for src/lib/plots/csvExport.ts
 *
 * 覆盖：seriesToCSV 的表头生成、行对齐、缺失/非有限值留空、空输入。
 */
import { describe, it, expect } from 'vitest';
import { seriesToCSV, type SeriesData } from './csvExport';

describe('seriesToCSV', () => {
  it('returns empty string for empty input', () => {
    expect(seriesToCSV([])).toBe('');
  });

  it('produces {name}_x / {name}_y headers and data rows', () => {
    const series: SeriesData[] = [
      { name: 'y=sin(x)', x: [0, 1, 2], y: [0, 0.84, 0.91] },
    ];
    const csv = seriesToCSV(series);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('y=sin(x)_x,y=sin(x)_y');
    expect(lines[1]).toBe('0,0');
    expect(lines[2]).toBe('1,0.84');
    expect(lines[3]).toBe('2,0.91');
  });

  it('aligns multiple series by the max row count, padding short ones', () => {
    const series: SeriesData[] = [
      { name: 'a', x: [0, 1], y: [0, 1] },
      { name: 'b', x: [10, 20, 30], y: [100, 200, 300] },
    ];
    const csv = seriesToCSV(series);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('a_x,a_y,b_x,b_y');
    // 第 3 行（索引 2）：a 已无数据 → 空单元格补位
    expect(lines[3]).toBe(',,30,300');
  });

  it('leaves non-finite / missing values as empty cells', () => {
    const series: SeriesData[] = [
      { name: 'c', x: [0, Number.NaN, 2], y: [0, Number.POSITIVE_INFINITY, 2] },
    ];
    const csv = seriesToCSV(series);
    const lines = csv.split('\n');
    expect(lines[2]).toBe(','); // NaN / Infinity → 空
    expect(lines[3]).toBe('2,2');
  });
});