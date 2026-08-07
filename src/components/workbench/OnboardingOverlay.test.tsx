/**
 * OnboardingOverlay — 首次启动分步引导的组件测试。
 *
 * 覆盖：
 *  - 首次启动（无 localStorage 标记）时渲染欢迎步骤与步骤指示器；
 *  - 示例步骤之前不渲染示例卡片，跳到第 4 步后才出现；
 *  - 「上一步 / 下一步」导航与步骤跳转；
 *  - 点击「图像转函数 / 弹簧振子仿真」会写入 pendingPipelineTemplate 并切到蓝图；
 *  - 点击「三角曲线可视化 / 矩阵与特征值」会填入编辑器脚本并切到对应预览标签；
 *  - 关闭（示例 / 跳过 / 开始使用）后写入 localStorage 标记，二次不弹。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { render, act, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { OnboardingOverlay } from './OnboardingOverlay';
import { useWorkbenchStore } from '@/lib/store/workbench';

const ONBOARDED_KEY = 'omnimath-pro-onboarded-v1';
const LAST_STEP_LABEL = '第 4 步：选择示例快速上手';

function resetStore() {
  useWorkbenchStore.setState({
    editorContent: '',
    activePreviewTab: 'formula',
    viewMode: 'workbench',
    pendingPipelineTemplate: null,
  });
}

beforeEach(() => {
  if (typeof window !== 'undefined') {
    localStorage.clear();
    window.matchMedia = window.matchMedia ?? (() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia;
  }
  resetStore();
});

/** 直接跳到示例步骤（第 4 步），跳过中间步骤动画。 */
function jumpToExamples({ getByLabelText }: { getByLabelText: (label: string) => HTMLElement }) {
  act(() => {
    fireEvent.click(getByLabelText(LAST_STEP_LABEL));
  });
}

describe('OnboardingOverlay 首次启动分步引导', () => {
  it('首次启动时渲染欢迎步骤与步骤指示器，示例卡片尚未出现', () => {
    const { getByText, queryByText, getByLabelText } = render(<OnboardingOverlay />);
    expect(getByText(/欢迎使用 OmniMath Pro/)).toBeInTheDocument();
    // 步骤指示器存在
    expect(getByLabelText('第 1 步：欢迎使用 OmniMath Pro')).toBeInTheDocument();
    expect(getByLabelText(LAST_STEP_LABEL)).toBeInTheDocument();
    // 未到示例步骤前不渲染示例卡片
    expect(queryByText('图像转函数')).not.toBeInTheDocument();
    // 非最后一步显示「下一步」
    expect(getByText('下一步')).toBeInTheDocument();
  });

  it('「下一步」逐步推进，最后一步转为「开始使用」并出现示例卡片', () => {
    const { getByText, queryByText } = render(<OnboardingOverlay />);
    for (let i = 0; i < 3; i++) {
      act(() => {
        fireEvent.click(getByText('下一步'));
      });
    }
    expect(queryByText('下一步')).not.toBeInTheDocument();
    expect(getByText('开始使用')).toBeInTheDocument();
    expect(getByText('图像转函数')).toBeInTheDocument();
    expect(getByText('弹簧振子仿真')).toBeInTheDocument();
  });

  it('「上一步」可回退一步，最后一步可回到上一步骤', () => {
    const { getByText, queryByText } = render(<OnboardingOverlay />);
    // 推进到最后一步
    for (let i = 0; i < 3; i++) {
      act(() => {
        fireEvent.click(getByText('下一步'));
      });
    }
    expect(getByText('开始使用')).toBeInTheDocument();
    act(() => {
      fireEvent.click(getByText('上一步'));
    });
    expect(queryByText('开始使用')).not.toBeInTheDocument();
    expect(getByText('下一步')).toBeInTheDocument();
  });

  it('点击「图像转函数」写入 pendingPipelineTemplate 并切到蓝图', async () => {
    const { getByText, getByLabelText } = render(<OnboardingOverlay />);
    jumpToExamples({ getByLabelText });
    await act(async () => {
      fireEvent.click(getByText('图像转函数'));
    });
    await waitFor(() => {
      expect(useWorkbenchStore.getState().pendingPipelineTemplate).toBe('image-vectorization-quickstart');
      expect(useWorkbenchStore.getState().viewMode).toBe('pipeline');
      expect(localStorage.getItem(ONBOARDED_KEY)).toBe('1');
    });
  });

  it('点击「弹簧振子仿真」写入 ODE 反馈模板并切到蓝图', async () => {
    const { getByText, getByLabelText } = render(<OnboardingOverlay />);
    jumpToExamples({ getByLabelText });
    await act(async () => {
      fireEvent.click(getByText('弹簧振子仿真'));
    });
    await waitFor(() => {
      expect(useWorkbenchStore.getState().pendingPipelineTemplate).toBe('ode-feedback-loop');
      expect(useWorkbenchStore.getState().viewMode).toBe('pipeline');
    });
  });

  it('点击「三角曲线可视化」填入脚本并切到 2D 绘图', async () => {
    const { getByText, getByLabelText } = render(<OnboardingOverlay />);
    jumpToExamples({ getByLabelText });
    await act(async () => {
      fireEvent.click(getByText('三角曲线可视化'));
    });
    await waitFor(() => {
      const content = useWorkbenchStore.getState().editorContent;
      expect(content).toContain('plot(sin(x))');
      expect(useWorkbenchStore.getState().activePreviewTab).toBe('plot2d');
      expect(useWorkbenchStore.getState().viewMode).toBe('workbench');
    });
  });

  it('点击「矩阵与特征值」填入编辑器脚本并切到公式预览', async () => {
    const { getByText, getByLabelText } = render(<OnboardingOverlay />);
    jumpToExamples({ getByLabelText });
    await act(async () => {
      fireEvent.click(getByText('矩阵与特征值'));
    });
    await waitFor(() => {
      const content = useWorkbenchStore.getState().editorContent;
      expect(content).toContain('A = [1, 2; 3, 4]');
      expect(useWorkbenchStore.getState().activePreviewTab).toBe('formula');
    });
  });

  it('「跳过」写入标记并关闭引导', async () => {
    const { getByText } = render(<OnboardingOverlay />);
    await act(async () => {
      fireEvent.click(getByText('跳过'));
    });
    expect(localStorage.getItem(ONBOARDED_KEY)).toBe('1');
    expect(getByText(/欢迎使用 OmniMath Pro/)).not.toBeVisible();
  });

  it('已标记过引导后不再渲染', () => {
    localStorage.setItem(ONBOARDED_KEY, '1');
    const { queryByText } = render(<OnboardingOverlay />);
    expect(queryByText(/欢迎使用 OmniMath Pro/)).not.toBeInTheDocument();
  });
});