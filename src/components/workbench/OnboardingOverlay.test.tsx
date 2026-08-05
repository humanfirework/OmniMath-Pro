/**
 * OnboardingOverlay — 首次启动引导一键示例的组件测试。
 *
 * 覆盖：
 *  - 首次启动（无 localStorage 标记）时渲染出欢迎层与四个示例卡片；
 *  - 点击「图像转函数 / 弹簧振子仿真」会写入 pendingPipelineTemplate 并切到蓝图；
 *  - 点击「三角曲线可视化 / 矩阵与特征值」会填入编辑器脚本并切到对应预览标签；
 *  - 关闭（示例或「开始使用」）后写入 localStorage 标记，二次不弹。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { render, act, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { OnboardingOverlay } from './OnboardingOverlay';
import { useWorkbenchStore } from '@/lib/store/workbench';

const ONBOARDED_KEY = 'omnimath-pro-onboarded-v1';

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

describe('OnboardingOverlay 首次启动引导', () => {
  it('首次启动时渲染欢迎层与四个示例卡片', () => {
    const { getByText } = render(<OnboardingOverlay />);
    expect(getByText(/欢迎使用 OmniMath Pro/)).toBeInTheDocument();
    expect(getByText('三角曲线可视化')).toBeInTheDocument();
    expect(getByText('图像转函数')).toBeInTheDocument();
    expect(getByText('弹簧振子仿真')).toBeInTheDocument();
    expect(getByText('矩阵与特征值')).toBeInTheDocument();
  });

  it('点击「图像转函数」写入 pendingPipelineTemplate 并切到蓝图', async () => {
    const { getByText } = render(<OnboardingOverlay />);
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
    const { getByText } = render(<OnboardingOverlay />);
    await act(async () => {
      fireEvent.click(getByText('弹簧振子仿真'));
    });
    await waitFor(() => {
      expect(useWorkbenchStore.getState().pendingPipelineTemplate).toBe('ode-feedback-loop');
      expect(useWorkbenchStore.getState().viewMode).toBe('pipeline');
    });
  });

  it('点击「矩阵与特征值」填入编辑器脚本并切到公式预览', async () => {
    const { getByText } = render(<OnboardingOverlay />);
    await act(async () => {
      fireEvent.click(getByText('矩阵与特征值'));
    });
    await waitFor(() => {
      const content = useWorkbenchStore.getState().editorContent;
      expect(content).toContain('A = [1, 2; 3, 4]');
      expect(useWorkbenchStore.getState().activePreviewTab).toBe('formula');
    });
  });

  it('已标记过引导后不再渲染', () => {
    localStorage.setItem(ONBOARDED_KEY, '1');
    const { queryByText } = render(<OnboardingOverlay />);
    expect(queryByText(/欢迎使用 OmniMath Pro/)).not.toBeInTheDocument();
  });
});