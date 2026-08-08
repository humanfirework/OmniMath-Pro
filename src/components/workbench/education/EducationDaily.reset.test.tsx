/**
 * 教育模块 · 清空学习数据（resetAll）回归测试
 *
 * 用户报告：点击「清空学习数据」后应用报错 / 界面消失（白屏）。
 * 本测试在 jsdom 中渲染 EducationDaily，先作答（产生 verdict / wrongBook /
 * days 记录），再调用 store.resetAll()，断言：
 *  1) resetAll 后组件可正常重渲染（不抛异常）；
 *  2) 每日一题输入框重新可用（alreadySolved 回退为 false）。
 *
 * 为隔离环境，mock 掉 KaTeX 渲染与动画，聚焦纯逻辑路径。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';

// --- mock 重型依赖，隔离 DOM 环境 ---
vi.mock('framer-motion', () => ({
  motion: { div: (p: any) => React.createElement('div', p) },
  AnimatePresence: ({ children }: any) => React.createElement(React.Fragment, null, children),
}));
vi.mock('@/components/workbench/FormulaRenderer', () => ({
  FormulaRenderer: ({ latex }: any) => React.createElement('span', null, latex),
  // MathText 依赖该导出做 CJK 标点清洗；mock 为恒等变换即可。
  sanitizeLatexInput: (s: string) => s,
}));
// 让「每日一题」总是返回一道数值题（l1-01），保证测试里必定出现文本输入框，
// 而不依赖当天实际选中的题型（选择题没有文本输入占位符）。
vi.mock('@/lib/education/logic', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/education/logic')>();
  const content = await import('@/lib/education/content');
  return {
    ...actual,
    pickDailyQuestion: () => content.getQuestion('l1-01'),
  };
});

import { EducationDaily } from './EducationDaily';
import { useEducationStore } from '@/lib/store/educationStore';

describe('EducationDaily · 清空学习数据', () => {
  beforeEach(() => {
    // 每个用例前重置 store 到干净状态，避免用例间污染。
    useEducationStore.getState().resetAll();
    useEducationStore.setState({
      days: {},
      attempts: {},
      wrongBook: [],
      startedAt: '2026-01-01',
      recoveries: 0,
      // 本测试聚焦「作答 / 清空 / 重新练习」流程，需已完学段引导以进入每日一题主界面。
      onboarded: true,
      stage: 'primary',
    });
    vi.restoreAllMocks();
  });

  it('resetAll 后组件可重渲染且输入框恢复可用', async () => {
    // 先渲染
    let result: ReturnType<typeof render>;
    await act(async () => {
      result = render(React.createElement(EducationDaily));
    });

    // 模拟「今日已答对」，使 alreadySolved = true，输入框禁用。
    await act(async () => {
      const date = new Date();
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      useEducationStore.setState((s) => ({
        days: {
          ...s.days,
          [key]: { date: key, count: 1, solved: true, questionId: 'l1-01' },
        },
      }));
    });

    // 输入框应为禁用状态
    const input = screen.getByPlaceholderText(
      /输入你的答案|输入表达式/,
    ) as HTMLInputElement;
    expect(input.disabled).toBe(true);

    // 关键：清空学习数据 → resetAll
    await act(async () => {
      useEducationStore.getState().resetAll();
    });

    // 不应抛异常，且输入框应恢复可用
    const input2 = screen.getByPlaceholderText(/输入你的答案|输入表达式/);
    expect(input2).toBeTruthy();
    expect((input2 as HTMLInputElement).disabled).toBe(false);
  });

  it('resetAll 清空 days / wrongBook / recoveries', () => {
    useEducationStore.setState({
      days: { '2026-01-01': { date: '2026-01-01', count: 3, solved: true, questionId: 'l1-01' } },
      wrongBook: [
        { id: 'w1', questionId: 'l1-02', userAnswer: 'x', correctAnswer: 'y', date: '2026-01-01' },
      ],
      recoveries: 5,
    });
    act(() => {
      useEducationStore.getState().resetAll();
    });
    const s = useEducationStore.getState();
    expect(Object.keys(s.days)).toHaveLength(0);
    expect(s.wrongBook).toHaveLength(0);
    expect(s.recoveries).toBe(0);
  });

  it('「重新练习」能解锁已完成的每日一题输入', async () => {
    await act(async () => {
      render(React.createElement(EducationDaily));
    });

    // 今日已答对 → 输入框禁用
    await act(async () => {
      const d = new Date();
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      useEducationStore.setState((s) => ({
        days: {
          ...s.days,
          [key]: { date: key, count: 1, solved: true, questionId: 'l1-01' },
        },
      }));
    });

    const input = screen.getByPlaceholderText(/输入你的答案|输入表达式/) as HTMLInputElement;
    expect(input.disabled).toBe(true);

    // 点击「重新练习」
    const retryBtn = screen.getByText('重新练习');
    await act(async () => {
      fireEvent.click(retryBtn);
    });

    // 输入框应恢复可用，且出现「提交答案」按钮
    const input2 = screen.getByPlaceholderText(/输入你的答案|输入表达式/) as HTMLInputElement;
    expect(input2.disabled).toBe(false);
    expect(screen.getByText('提交答案')).toBeTruthy();
  });
});
