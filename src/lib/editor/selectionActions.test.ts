import { describe, it, expect } from 'vitest';
import {
  MAX_PLOT_SELECTION_EXPRESSIONS,
  MAX_PROMPT_SELECTION_CHARS,
  buildExplainPrompt,
  buildSimplifyPrompt,
  clipSelection,
  extractPlotExpressions,
} from './selectionActions';

describe('clipSelection', () => {
  it('去掉首尾空白，短文本原样保留', () => {
    expect(clipSelection('  sin(x)  ')).toBe('sin(x)');
  });

  it('超长文本截断并注明', () => {
    const out = clipSelection('a'.repeat(MAX_PROMPT_SELECTION_CHARS + 50));
    expect(out.length).toBeLessThan(MAX_PROMPT_SELECTION_CHARS + 40);
    expect(out).toContain('已截断');
  });
});

describe('buildExplainPrompt / buildSimplifyPrompt', () => {
  it('解释提示词包含语言、选区与「不要重写」约束', () => {
    const prompt = buildExplainPrompt('y = sin(x)', 'python');
    expect(prompt).toContain('Python');
    expect(prompt).toContain('y = sin(x)');
    expect(prompt).toContain('不要重写代码');
  });

  it('简化提示词要求保持行为不变', () => {
    const prompt = buildSimplifyPrompt('a = 1 + 0', 'simple');
    expect(prompt).toContain('简化');
    expect(prompt).toContain('行为完全不变');
    expect(prompt).toContain('a = 1 + 0');
  });
});

describe('extractPlotExpressions', () => {
  it('提取裸表达式与 y = f(x)', () => {
    expect(extractPlotExpressions('sin(x) * cos(x)\ny = x^2 - 1')).toEqual([
      'sin(x) * cos(x)',
      'x^2 - 1',
    ]);
  });

  it('跳过注释、空行、常数和方程', () => {
    const text = [
      '# 曲线',
      '2 + 3',
      'x^2 + y^2 = 4',
      'a = 5',
      '',
      '// 下面才是函数',
      'tan(x)',
    ].join('\n');
    expect(extractPlotExpressions(text)).toEqual(['tan(x)']);
  });

  it('剥离 plot(...) 外壳和末尾分号', () => {
    expect(extractPlotExpressions('plot(sin(x));')).toEqual(['sin(x)']);
  });

  it('去重并限制数量', () => {
    const lines = Array.from({ length: 10 }, (_, i) => `x + ${i}`);
    lines.push('x + 0');
    const out = extractPlotExpressions(lines.join('\n'));
    expect(out).toHaveLength(MAX_PLOT_SELECTION_EXPRESSIONS);
    expect(new Set(out).size).toBe(out.length);
  });

  it('没有 x 时不提取', () => {
    expect(extractPlotExpressions('a + b\n2 * 3')).toEqual([]);
  });

  it('x 作为更长标识符的一部分不算自变量', () => {
    expect(extractPlotExpressions('exp(x)\nmax(1, 2)')[0]).toBe('exp(x)');
    expect(extractPlotExpressions('index + 1')).toEqual([]);
  });
});
