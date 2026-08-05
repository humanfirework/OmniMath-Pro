/**
 * Unit tests for src/lib/exportMarkdown.ts
 *
 * 纯逻辑测试 —— 不依赖 DOM / Tauri，直接验证 Markdown / LaTeX 序列化结果。
 */
import { describe, it, expect } from 'vitest';
import {
  matrixToMarkdown,
  resultToMarkdown,
  resultsToMarkdown,
  matrixToLatex,
  resultToLatex,
} from './exportMarkdown';
import type { CalculationResult } from '@/lib/store/workbench';

function makeResult(overrides: Partial<CalculationResult> = {}): CalculationResult {
  return {
    id: 'r1',
    input: '2 + 3',
    output: '5',
    latex: '2 + 3 = 5',
    timestamp: 0,
    type: 'number',
    ...overrides,
  };
}

describe('matrixToMarkdown', () => {
  it('renders a markdown table for a numeric matrix', () => {
    const md = matrixToMarkdown([
      [1, 2],
      [3, 4],
    ]);
    expect(md).toContain('| c1 | c2 |');
    expect(md).toContain('| 1 | 2 |');
    expect(md).toContain('| 3 | 4 |');
    expect(md).toContain('| --- | --- |');
  });

  it('returns empty string for empty matrix', () => {
    expect(matrixToMarkdown([])).toBe('');
  });

  it('handles ragged rows by filling missing cells', () => {
    const md = matrixToMarkdown([[1, 2, 3], [4]]);
    expect(md).toContain('| 4 |  |  |');
  });

  it('trims long float tails', () => {
    const md = matrixToMarkdown([[1.9999999997]]);
    expect(md).toContain('| 2 |');
    expect(md).not.toContain('1.9999999997');
  });
});

describe('resultToMarkdown', () => {
  it('wraps latex output in $$...$$', () => {
    const md = resultToMarkdown(makeResult());
    expect(md).toContain('$$');
    expect(md).toContain('2 + 3 = 5');
    expect(md).toContain('```text');
    expect(md).toContain('2 + 3');
  });

  it('falls back to a code block when no latex', () => {
    const md = resultToMarkdown(makeResult({ latex: '' }));
    expect(md).not.toContain('$$');
    expect(md).toContain('```text');
    expect(md).toContain('5');
  });

  it('includes a matrix table for matrix results', () => {
    const md = resultToMarkdown(
      makeResult({ isMatrix: true, matrix: [[1, 0], [0, 1]] }),
    );
    expect(md).toContain('**矩阵**');
    expect(md).toContain('| c1 | c2 |');
  });

  it('includes steps as an ordered list', () => {
    const md = resultToMarkdown(makeResult({ steps: ['step a', 'step b'] }));
    expect(md).toContain('**步骤**');
    expect(md).toContain('1. step a');
    expect(md).toContain('2. step b');
  });
});

describe('resultsToMarkdown', () => {
  it('prepends an H1 title and numbers each result', () => {
    const md = resultsToMarkdown(
      [makeResult({ input: 'a' }), makeResult({ input: 'b' })],
      { title: '我的作业' },
    );
    expect(md.startsWith('# 我的作业')).toBe(true);
    expect(md).toContain('## 1. a');
    expect(md).toContain('## 2. b');
  });

  it('uses a default title when not provided', () => {
    const md = resultsToMarkdown([makeResult()]);
    expect(md.startsWith('# OmniMath 计算结果')).toBe(true);
  });
});

describe('matrixToLatex', () => {
  it('renders a bmatrix environment', () => {
    const tex = matrixToLatex([
      [1, 2],
      [3, 4],
    ]);
    expect(tex).toContain('\\begin{bmatrix}');
    expect(tex).toContain('1 & 2 \\\\');
    expect(tex).toContain('3 & 4 \\\\');
    expect(tex).toContain('\\end{bmatrix}');
  });
});

describe('resultToLatex', () => {
  it('produces a compilable document with input/output', () => {
    const tex = resultToLatex(makeResult());
    expect(tex).toContain('\\documentclass{article}');
    expect(tex).toContain('\\usepackage{amsmath}');
    expect(tex).toContain('\\begin{document}');
    expect(tex).toContain('\\end{document}');
    expect(tex).toContain('\\begin{verbatim}');
    expect(tex).toContain('2 + 3');
    expect(tex).toContain('\\[');
    expect(tex).toContain('2 + 3 = 5');
  });

  it('includes a matrix block for matrix results', () => {
    const tex = resultToLatex(makeResult({ isMatrix: true, matrix: [[1, 0]] }));
    expect(tex).toContain('\\begin{bmatrix}');
  });
});