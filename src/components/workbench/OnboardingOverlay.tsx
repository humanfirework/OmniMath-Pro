'use client';

/**
 * OmniMath Pro — 首次启动引导 + 一键示例
 *
 * 首次启动时展示一张带流畅入场动画的欢迎页，包含四个「一键示例」卡片：
 *   1. 三角曲线可视化  →  填入编辑器脚本并切到 2D 绘图
 *   2. 图像转函数      →  切到蓝图并加载「图像矢量化快速入门」模板
 *   3. 弹簧振子仿真    →  切到蓝图并加载「一阶系统反馈仿真」模板
 *   4. 矩阵与特征值    →  填入编辑器脚本并切到公式预览
 *
 * 每个示例点击后立即生效并关闭引导；「开始使用」直接进入工作台。
 * 用 localStorage 标记是否已看过，二次启动不再弹出。
 *
 * 动画全部由 framer-motion 驱动（stagger 入场 / 布局 / hover / tap），
 * 与现有 VSCode 玻璃质感 UI 一致，桌面 / Web 共用。
 */

import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity,
  ImageIcon,
  Play,
  Sigma,
  Sparkles,
  X,
  ArrowRight,
  Waves,
  Grid3x3,
  type LucideIcon,
} from 'lucide-react';
import { useWorkbenchStore } from '@/lib/store/workbench';

/** localStorage 标记：是否已完成首次引导。 */
const ONBOARDED_KEY = 'omnimath-pro-onboarded-v1';

/* ── 一键示例：填入编辑器的脚本 ────────────────────────────────── */
const SCRIPT_TRIANGLE = `# 三角曲线可视化
# 按 Enter 运行，右侧自动切换并绘制曲线
plot(sin(x))
plot(cos(x))
plot(sin(x) * cos(x))`;

const SCRIPT_MATRIX = `# 矩阵与特征值
A = [1, 2; 3, 4]
det(A)
inv(A)
eig(A)`;

interface ExampleDef {
  id: string;
  icon: LucideIcon;
  accent: string; // 卡片强调色（hex），用于图标/描边
  title: string;
  desc: string;
  tag: string;
}

const EXAMPLES: ExampleDef[] = [
  {
    id: 'plot',
    icon: Waves,
    accent: '#2dd4bf',
    title: '三角曲线可视化',
    desc: '一键填入脚本并运行，自动绘制 sin / cos 曲线',
    tag: '绘图',
  },
  {
    id: 'vision',
    icon: ImageIcon,
    accent: '#a78bfa',
    title: '图像转函数',
    desc: '上传图片 → 识别边缘 → 拟合贝塞尔曲线',
    tag: '视觉',
  },
  {
    id: 'sim',
    icon: Activity,
    accent: '#f59e0b',
    title: '弹簧振子仿真',
    desc: '一阶反馈闭环，数值求解 ODE 并实时示波',
    tag: '仿真',
  },
  {
    id: 'matrix',
    icon: Grid3x3,
    accent: '#fb7185',
    title: '矩阵与特征值',
    desc: '行列式、逆矩阵、特征值一键求解',
    tag: '线性代数',
  },
];

export function OnboardingOverlay() {
  const [visible, setVisible] = useState(false);

  const setEditorContent = useWorkbenchStore((s) => s.setEditorContent);
  const setActivePreviewTab = useWorkbenchStore((s) => s.setActivePreviewTab);
  const setViewMode = useWorkbenchStore((s) => s.setViewMode);
  const setPendingPipelineTemplate = useWorkbenchStore((s) => s.setPendingPipelineTemplate);

  // 首次启动（无 localStorage 标记）才显示。
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (localStorage.getItem(ONBOARDED_KEY) === '1') return;
    setVisible(true);
  }, []);

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(ONBOARDED_KEY, '1');
    } catch {
      // 忽略隐私模式下的写入失败
    }
    setVisible(false);
  }, []);

  /** 处理一次示例点击：执行对应动作并关闭引导。 */
  const handleExample = useCallback(
    (id: string) => {
      if (id === 'plot') {
        setEditorContent(SCRIPT_TRIANGLE);
        setActivePreviewTab('plot2d');
        setViewMode('workbench');
      } else if (id === 'vision') {
        setPendingPipelineTemplate('image-vectorization-quickstart');
        setActivePreviewTab('plot2d');
        setViewMode('pipeline');
      } else if (id === 'sim') {
        setPendingPipelineTemplate('ode-feedback-loop');
        setActivePreviewTab('plot2d');
        setViewMode('pipeline');
      } else if (id === 'matrix') {
        setEditorContent(SCRIPT_MATRIX);
        setActivePreviewTab('formula');
        setViewMode('workbench');
      }
      dismiss();
    },
    [setEditorContent, setActivePreviewTab, setViewMode, setPendingPipelineTemplate, dismiss],
  );

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="onboarding"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35 }}
          className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-background/70 backdrop-blur-xl"
        >
          {/* 柔和光斑背景 */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute -top-40 -left-32 size-96 rounded-full bg-primary/15 blur-3xl" />
            <div className="absolute -bottom-40 -right-32 size-96 rounded-full bg-violet-500/15 blur-3xl" />
          </div>

          <motion.div
            initial={{ y: 24, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 12, opacity: 0, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 260, damping: 26 }}
            className="relative w-full max-w-3xl px-6 py-10 sm:py-14"
          >
            {/* 关闭按钮 */}
            <button
              type="button"
              onClick={dismiss}
              aria-label="关闭引导"
              className="absolute right-2 top-2 grid size-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <X className="size-4" />
            </button>

            {/* 标题区 */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.4 }}
              className="text-center"
            >
              <div className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-primary to-violet-500 text-primary-foreground shadow-lg shadow-primary/20">
                <Sparkles className="size-6" />
              </div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                欢迎使用 OmniMath Pro
              </h1>
              <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-muted-foreground">
                一站式数学工作台：计算、绘图、图像转函数、ODE 仿真与 AI 解释。
                <br />
                从下方示例开始，一键体验完整链路。
              </p>
            </motion.div>

            {/* 示例卡片网格 */}
            <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {EXAMPLES.map((ex, i) => {
                const Icon = ex.icon;
                return (
                  <motion.button
                    key={ex.id}
                    type="button"
                    onClick={() => handleExample(ex.id)}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 + i * 0.08, type: 'spring', stiffness: 300, damping: 24 }}
                    whileHover={{ y: -3, scale: 1.015 }}
                    whileTap={{ scale: 0.98 }}
                    className="group relative flex items-start gap-3 rounded-2xl border border-border/70 bg-card/80 p-4 text-left shadow-sm transition-colors hover:border-primary/40 hover:bg-card"
                  >
                    <div
                      className="grid size-10 shrink-0 place-items-center rounded-xl"
                      style={{ backgroundColor: `color-mix(in oklab, ${ex.accent} 14%, transparent)`, color: ex.accent }}
                    >
                      <Icon className="size-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-semibold text-foreground">{ex.title}</span>
                        <span
                          className="rounded px-1.5 py-px text-[9.5px] font-medium"
                          style={{ backgroundColor: `color-mix(in oklab, ${ex.accent} 12%, transparent)`, color: ex.accent }}
                        >
                          {ex.tag}
                        </span>
                      </div>
                      <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">{ex.desc}</p>
                      <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
                        打开示例
                        <ArrowRight className="size-3" />
                      </span>
                    </div>
                  </motion.button>
                );
              })}
            </div>

            {/* 底部操作 */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.55, duration: 0.4 }}
              className="mt-8 flex items-center justify-center gap-3"
            >
              <motion.button
                type="button"
                onClick={dismiss}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-primary to-primary/85 px-6 py-2.5 text-[13px] font-medium text-primary-foreground shadow-lg shadow-primary/25"
              >
                <Play className="size-4" fill="currentColor" />
                开始使用
              </motion.button>
              <button
                type="button"
                onClick={dismiss}
                className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background/60 px-5 py-2.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                <Sigma className="size-4" />
                直接进入编辑器
              </button>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}