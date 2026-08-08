'use client';

/**
 * OmniMath Pro — 首次启动分步引导 + 一键示例
 *
 * 首次启动展示「分步引导」，帮助新用户快速上手：
 *   第 1 步  欢迎       → 产品概览与四大能力亮点
 *   第 2 步  编辑器     → 如何输入表达式并运行
 *   第 3 步  蓝图       → 介绍节点式流程（图像转曲线 / ODE 仿真）
 *   第 4 步  一键示例   → 四个示例卡片，点击立即体验完整链路
 *
 * 交互：
 *   - 顶部步骤指示器（圆点 + 进度），可点击跳转；
 *   - 底部「上一步 / 下一步」导航，最后一步显示「开始使用」；
 *   - 键盘：← / → 切换步骤，Esc 关闭；
 *   - 每个示例点击后立即生效并关闭引导；
 *   - 用 localStorage 标记是否已看过，二次启动不再弹出。
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
  ArrowLeft,
  Waves,
  Grid3x3,
  Workflow,
  PenLine,
  Check,
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

const SCRIPT_PRACTICE = `# 动手练习：改一改，然后点右上角「▶ 运行」
1 + 2
2^10
plot(sin(x))`;

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

/* ── 分步引导内容 ──────────────────────────────────────────────── */
interface StepDef {
  id: string;
  icon: LucideIcon;
  accent: string;
  title: string;
  desc: string;
  /** 关键要点，渲染为带对勾的列表。 */
  bullets: string[];
  /** 可选的自定义主按钮（有则替代「下一步 / 开始使用」）。 */
  primaryAction?: { label: string; run: () => void };
}

const STEPS: StepDef[] = [
  {
    id: 'welcome',
    icon: Sparkles,
    accent: '#818cf8',
    title: '欢迎使用 OmniMath Pro',
    desc: '一站式数学工作台：计算、绘图、图像转函数、ODE 仿真与 AI 解释，全部在同一个窗口完成。',
    bullets: [
      '表达式计算与公式库：像高级计算器一样即时求解',
      '2D / 3D 绘图：曲线、曲面、统计图表直接可视化',
      '节点蓝图：图像转曲线、ODE 仿真等流程可视化搭建',
      '内置求解器、单位换算、线性代数与矩阵工具',
    ],
  },
  {
    id: 'editor',
    icon: PenLine,
    accent: '#34d399',
    title: '在编辑器里输入并运行',
    desc: '左侧编辑器支持多行表达式。输入后按 Enter 运行，结果与绘图会实时出现在右侧预览区。',
    bullets: [
      'Enter 运行当前行，Shift+Enter 换新行',
      'Ctrl+/ 快速注释，Ctrl+Space 触发自动补全',
      'plot(sin(x)) 即可绘制曲线，无需额外配置',
      '运行结果会保留在历史记录，可随时回看',
      '编辑器初始为空：点击左侧「文件」打开脚本，或直接输入开始',
    ],
  },
  {
    id: 'pipeline',
    icon: Workflow,
    accent: '#fbbf24',
    title: '用节点蓝图搭建流程',
    desc: '需要图像转曲线、ODE 仿真等高级流程时，切换到「蓝图」：拖入节点、连线接通数据，自动按顺序执行。',
    bullets: [
      '每个节点一个操作：输入 → 运算 → 输出',
      '连线即数据流，节点自动按依赖顺序执行',
      '图像矢量化、视频转曲线都通过 Web Worker 后台完成',
      '内置模板一键加载，改动节点即可复用',
    ],
  },
  {
    id: 'examples',
    icon: Play,
    accent: '#f472b6',
    title: '选择示例快速上手',
    desc: '点击下方示例卡片，即可自动填入脚本或加载蓝图，直接体验完整链路。',
    bullets: [],
  },
  {
    id: 'practice',
    icon: PenLine,
    accent: '#34d399',
    title: '动手练习：跑通第一个结果',
    desc: '点击「开始练习」进入工作台，我已在左侧编辑器填好示例代码。你只需找到编辑器右上角绿色的「▶ 运行」按钮并点击，就能在右侧看到结果——这就完成了你的第一次运行！',
    bullets: [
      '进入工作台后，左侧编辑器已自动填入几行示例代码',
      '点击右上角「▶ 运行」按钮（或按 Enter），右侧出现计算结果',
      '可随意修改算式再次运行；点左侧活动栏「文件」可浏览 / 保存脚本',
      '运行成功后，本次引导就完成了，你可以自由探索',
    ],
  },
];

export function OnboardingOverlay() {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);

  const setEditorContent = useWorkbenchStore((s) => s.setEditorContent);
  const setInputMode = useWorkbenchStore((s) => s.setInputMode);
  const setActivePreviewTab = useWorkbenchStore((s) => s.setActivePreviewTab);
  const setViewMode = useWorkbenchStore((s) => s.setViewMode);
  const setPendingPipelineTemplate = useWorkbenchStore((s) => s.setPendingPipelineTemplate);
  const setOnboardingPractice = useWorkbenchStore((s) => s.setOnboardingPractice);

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

  const lastStep = STEPS.length - 1;
  /** 示例卡片所在的步骤下标（该步渲染示例网格）。 */
  const EXAMPLES_STEP = 3;

  /**
   * 处理「开始练习」：把示例代码填入编辑器、进入工作台、并激活
   * PracticeGuide 浮层（onboardingPractice = true），随后关闭引导。
   * PracticeGuide 会继续引导用户点击「运行」跑出第一个结果。
   */
  const runPractice = useCallback(() => {
    setEditorContent(SCRIPT_PRACTICE);
    setActivePreviewTab('formula');
    setViewMode('workbench');
    setOnboardingPractice(true);
    dismiss();
  }, [setEditorContent, setActivePreviewTab, setViewMode, setOnboardingPractice, dismiss]);

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

  // 键盘导航：← 上一步 / → 下一步 / Esc 关闭。
  useEffect(() => {
    if (!visible) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setStep((s) => (s < lastStep ? s + 1 : s));
      else if (e.key === 'ArrowLeft') setStep((s) => (s > 0 ? s - 1 : s));
      else if (e.key === 'Escape') dismiss();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [visible, lastStep, dismiss]);

  // 示例步骤：卡片点击即完成，无需「下一步」；练习步骤：点击「开始练习」。
  const onPrimary = useCallback(() => {
    if (step === lastStep) {
      runPractice();
    } else if (step < lastStep) {
      setStep((s) => s + 1);
    } else {
      dismiss();
    }
  }, [step, lastStep, runPractice, dismiss]);

  const stepDef = STEPS[step];
  const StepIcon = stepDef.icon;

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

            {/* 步骤指示器 */}
            <div className="mb-8 flex items-center justify-center gap-2">
              {STEPS.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setStep(i)}
                  aria-label={`第 ${i + 1} 步：${s.title}`}
                  className="group flex items-center gap-2"
                >
                  <span
                    className={[
                      'grid size-7 place-items-center rounded-full text-[11px] font-semibold transition-all',
                      i === step
                        ? 'bg-primary text-primary-foreground shadow-md shadow-primary/30'
                        : i < step
                          ? 'bg-primary/20 text-primary'
                          : 'bg-muted text-muted-foreground group-hover:bg-accent',
                    ].join(' ')}
                  >
                    {i < step ? <Check className="size-3.5" /> : i + 1}
                  </span>
                  {/* 连接线 */}
                  {i < lastStep && (
                    <span
                      className={[
                        'h-px w-6 transition-colors sm:w-10',
                        i < step ? 'bg-primary/40' : 'bg-border',
                      ].join(' ')}
                    />
                  )}
                </button>
              ))}
            </div>

            {/* 当前步骤内容（AnimatePresence 切换动画） */}
            <AnimatePresence mode="wait">
              <motion.div
                key={step}
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.22, ease: 'easeOut' }}
                className="text-center"
              >
                <div
                  className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl shadow-lg"
                  style={{
                    backgroundColor: `color-mix(in oklab, ${stepDef.accent} 15%, transparent)`,
                    color: stepDef.accent,
                    boxShadow: `0 8px 24px -8px ${stepDef.accent}55`,
                  }}
                >
                  <StepIcon className="size-6" />
                </div>
                <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                  {stepDef.title}
                </h1>
                <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-muted-foreground">
                  {stepDef.desc}
                </p>
              </motion.div>
            </AnimatePresence>

            {/* 要点列表（有要点的步骤渲染；示例步骤用卡片，练习步骤用要点） */}
            {stepDef.bullets.length > 0 && (
              <motion.ul
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15, duration: 0.3 }}
                className="mx-auto mt-6 grid max-w-lg grid-cols-1 gap-2 text-left sm:grid-cols-2"
              >
                {stepDef.bullets.map((b) => (
                  <li
                    key={b}
                    className="flex items-start gap-2 rounded-lg border border-border/60 bg-card/60 px-3 py-2 text-[12px] leading-relaxed text-foreground/90"
                  >
                    <Check className="mt-0.5 size-3.5 shrink-0 text-primary" />
                    <span>{b}</span>
                  </li>
                ))}
              </motion.ul>
            )}

            {/* 示例卡片网格（示例步骤） */}
            {step === EXAMPLES_STEP && (
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
                      transition={{ delay: 0.1 + i * 0.07, type: 'spring', stiffness: 300, damping: 24 }}
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
            )}

            {/* 底部导航（非示例步骤显示上一步 / 下一步；示例步骤显示开始使用） */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.4 }}
              className="mt-8 flex items-center justify-center gap-3"
            >
              {step > 0 && (
                <button
                  type="button"
                  onClick={() => setStep((s) => s - 1)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background/60 px-5 py-2.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  <ArrowLeft className="size-4" />
                  上一步
                </button>
              )}

              {step < lastStep ? (
                <motion.button
                  type="button"
                  onClick={onPrimary}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-primary to-primary/85 px-6 py-2.5 text-[13px] font-medium text-primary-foreground shadow-lg shadow-primary/25"
                >
                  下一步
                  <ArrowRight className="size-4" />
                </motion.button>
              ) : (
                <motion.button
                  type="button"
                  onClick={onPrimary}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-primary to-primary/85 px-6 py-2.5 text-[13px] font-medium text-primary-foreground shadow-lg shadow-primary/25"
                >
                  <Play className="size-4" fill="currentColor" />
                  开始练习
                </motion.button>
              )}

              <button
                type="button"
                onClick={dismiss}
                className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background/60 px-5 py-2.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                <Sigma className="size-4" />
                跳过
              </button>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}