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
 *   - 顶部品牌行 + 4px 进度条（宽度 180ms 过渡）；
 *   - 底部「跳过 / 上一步 / 下一步」导航，最后一步显示「开始练习」；
 *   - 键盘：← / → 切换步骤，Esc 关闭；
 *   - 每个示例点击后立即生效并关闭引导；
 *   - 用 localStorage 标记是否已看过，二次启动不再弹出。
 *
 * 动效只使用 opacity + 4px 位移，180ms；减少动态效果时只保留透明度。
 */

import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  Activity,
  ImageIcon,
  Play,
  Sigma,
  X,
  ArrowRight,
  ArrowLeft,
  Waves,
  Grid3x3,
  Check,
  type LucideIcon,
} from 'lucide-react';
import { useWorkbenchStore } from '@/lib/store/workbench';
import { cn } from '@/lib/utils';

/** localStorage 标记：是否已完成首次引导。 */
const ONBOARDED_KEY = 'omnimath-pro-onboarded-v2';

/* ── 一键示例：填入编辑器的脚本 ────────────────────────────────── */
const SCRIPT_TRIANGLE = `# 三角曲线可视化
# 按 Ctrl+Enter 运行，右侧自动切换并绘制曲线
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
  title: string;
  desc: string;
  tag: string;
}

const EXAMPLES: ExampleDef[] = [
  {
    id: 'plot',
    icon: Waves,
    title: '三角曲线可视化',
    desc: '一键填入脚本并运行，自动绘制 sin / cos 曲线',
    tag: '绘图',
  },
  {
    id: 'vision',
    icon: ImageIcon,
    title: '图像转函数',
    desc: '上传图片 → 识别边缘 → 拟合贝塞尔曲线',
    tag: '视觉',
  },
  {
    id: 'sim',
    icon: Activity,
    title: '弹簧振子仿真',
    desc: '一阶反馈闭环，数值求解 ODE 并实时示波',
    tag: '仿真',
  },
  {
    id: 'matrix',
    icon: Grid3x3,
    title: '矩阵与特征值',
    desc: '行列式、逆矩阵、特征值一键求解',
    tag: '线性代数',
  },
];

/* ── 分步引导内容 ──────────────────────────────────────────────── */
interface StepDef {
  id: string;
  /** 进度条下方的小标签。 */
  label: string;
  title: string;
  desc: string;
  /** 关键要点，渲染为带对勾的列表。 */
  bullets: string[];
}

const STEPS: StepDef[] = [
  {
    id: 'welcome',
    label: '欢迎',
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
    label: '编辑器',
    title: '在编辑器里输入并运行',
    desc: '左侧编辑器支持多行表达式。输入后按 Ctrl+Enter 运行，结果与绘图会实时出现在右侧预览区。',
    bullets: [
      'Ctrl+Enter 运行，Enter 正常换行（自动保持缩进）',
      'Ctrl+/ 快速注释，Ctrl+Space 触发自动补全',
      'plot(sin(x)) 即可绘制曲线，无需额外配置',
      '运行结果会保留在历史记录，可随时回看',
      '编辑器初始为空：点击左侧「文件」打开脚本，或直接输入开始',
    ],
  },
  {
    id: 'pipeline',
    label: '蓝图',
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
    label: '示例',
    title: '选择示例快速上手',
    desc: '点击下方示例卡片，即可自动填入脚本或加载蓝图，直接体验完整链路。',
    bullets: [],
  },
  {
    id: 'practice',
    label: '练习',
    title: '动手练习：跑通第一个结果',
    desc: '点击「开始练习」进入工作台，我已在左侧编辑器填好示例代码。你只需找到编辑器右上角的「▶ 运行」按钮并点击，就能在右侧看到结果——这就完成了你的第一次运行！',
    bullets: [
      '进入工作台后，左侧编辑器已自动填入几行示例代码',
      '点击右上角「▶ 运行」按钮（或按 Ctrl+Enter），右侧出现计算结果',
      '可随意修改算式再次运行；点左侧活动栏「文件」可浏览 / 保存脚本',
      '运行成功后，本次引导就完成了，你可以自由探索',
    ],
  },
];

/**
 * 引导内的品牌插画：极淡网格 + 一条蓝→紫正弦曲线。
 * 纯静态，不使用无限动画；颜色全部来自可视化 token。
 */
function StepIllustration() {
  return (
    <svg
      viewBox="0 0 200 64"
      width={200}
      height={64}
      fill="none"
      aria-hidden
      className="h-16 w-[200px] max-w-full"
    >
      <defs>
        <linearGradient
          id="onboarding-curve"
          x1="0"
          y1="0"
          x2="200"
          y2="0"
          gradientUnits="userSpaceOnUse"
        >
          <stop style={{ stopColor: 'var(--viz-1)' }} />
          <stop offset="1" style={{ stopColor: 'var(--viz-3)' }} />
        </linearGradient>
      </defs>

      {/* 极淡网格 */}
      <g style={{ stroke: 'var(--viz-grid)' }} strokeWidth="1">
        {[0, 40, 80, 120, 160, 200].map((x) => (
          <line key={`v${x}`} x1={x} y1="0" x2={x} y2="64" />
        ))}
        {[0, 16, 32, 48, 64].map((y) => (
          <line key={`h${y}`} x1="0" y1={y} x2="200" y2={y} />
        ))}
      </g>

      {/* 坐标轴 */}
      <line
        x1="0"
        y1="32"
        x2="200"
        y2="32"
        style={{ stroke: 'var(--viz-axis)' }}
        strokeWidth="1"
        strokeOpacity="0.55"
      />

      {/* 正弦曲线（蓝 → 紫） */}
      <path
        d="M0 32 L10 23.2 L20 17.7 L30 17.7 L40 23.2 L50 32 L60 40.8 L70 46.3 L80 46.3 L90 40.8 L100 32 L110 23.2 L120 17.7 L130 17.7 L140 23.2 L150 32 L160 40.8 L170 46.3 L180 46.3 L190 40.8 L200 32"
        stroke="url(#onboarding-curve)"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function OnboardingOverlay() {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);
  const reduceMotion = useReducedMotion();

  const setEditorContent = useWorkbenchStore((s) => s.setEditorContent);
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

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="onboarding"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/45 p-4 dark:bg-black/65"
        >
          <motion.div
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reduceMotion ? 0 : 4 }}
            transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
            role="dialog"
            aria-labelledby="onboarding-title"
            className="surface-floating relative max-h-[calc(100dvh_-_2rem)] w-full max-w-[600px] overflow-y-auto rounded-xl p-7 sm:p-8"
          >
            {/* ── 品牌行：Σ 标识 + 产品名 + 步骤计数 + 关闭 ── */}
            <div className="flex items-center gap-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-border bg-[var(--primary-bg-soft)] text-primary">
                <Sigma className="size-4" strokeWidth={1.75} />
              </span>
              <div className="min-w-0 leading-tight">
                <p className="truncate text-[13px] font-semibold tracking-tight text-foreground">
                  OmniMath Pro
                </p>
                <p className="mt-0.5 text-[10.5px] uppercase tracking-[0.16em] text-muted-foreground">
                  快速上手
                </p>
              </div>
              <div className="ml-auto flex shrink-0 items-center gap-1.5">
                <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                  {String(step + 1).padStart(2, '0')} / {String(STEPS.length).padStart(2, '0')}
                </span>
                <button
                  type="button"
                  onClick={dismiss}
                  aria-label="关闭引导"
                  className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-accent/60 hover:text-foreground"
                >
                  <X className="size-3.5" strokeWidth={1.75} />
                </button>
              </div>
            </div>

            {/* ── 4px 分段进度条（可点击跳转） + 小标签行 ── */}
            <div className="mt-5">
              <div
                role="progressbar"
                aria-valuemin={1}
                aria-valuemax={STEPS.length}
                aria-valuenow={step + 1}
                aria-label="引导进度"
                className="flex h-1 w-full gap-1"
              >
                {STEPS.map((s, i) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setStep(i)}
                    aria-label={`第 ${i + 1} 步：${s.title}`}
                    aria-current={i === step ? 'step' : undefined}
                    className="group relative h-1 flex-1 overflow-hidden rounded-full bg-muted"
                  >
                    <span
                      className={cn(
                        'absolute inset-y-0 left-0 w-full rounded-full bg-primary transition-[width] duration-[180ms] ease-[var(--motion-ease)]',
                        i <= step ? 'scale-x-100' : 'scale-x-0',
                      )}
                      style={{ transformOrigin: 'left center' }}
                    />
                  </button>
                ))}
              </div>
              <div className="mt-1.5 flex items-center justify-between text-[10.5px] text-muted-foreground">
                <span>
                  第 {step + 1} 步 · {stepDef.label}
                </span>
                <span>共 {STEPS.length} 步</span>
              </div>
            </div>

            {/* ── 步骤内容：整块 180ms 透明度 + 4px 位移 ── */}
            <motion.div
              key={step}
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
              className="mt-6 text-left"
            >
                <StepIllustration />

                <h2
                  id="onboarding-title"
                  className="mt-4 text-[21px] font-semibold leading-tight tracking-tight text-foreground"
                >
                  {stepDef.title}
                </h2>
                <p className="mt-2 max-w-[52ch] text-[12.5px] leading-relaxed text-muted-foreground">
                  {stepDef.desc}
                </p>

                {/* 要点：两列卡片 */}
                {stepDef.bullets.length > 0 && (
                  <ul className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {stepDef.bullets.map((b) => (
                      <li
                        key={b}
                        className="surface-card flex items-start gap-2 rounded-lg px-3 py-2 text-[12px] leading-relaxed text-foreground/90"
                      >
                        <Check className="mt-0.5 size-3.5 shrink-0 text-primary" strokeWidth={1.75} />
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {/* 示例卡片：两列，hover 仅变边框 / 图标颜色 */}
                {step === EXAMPLES_STEP && (
                  <div className="mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    {EXAMPLES.map((ex, i) => {
                      const Icon = ex.icon;
                      return (
                        <motion.button
                          key={ex.id}
                          type="button"
                          onClick={() => handleExample(ex.id)}
                          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: reduceMotion ? 0 : 0.04 + i * 0.04, duration: 0.18 }}
                          className="surface-card group flex w-full items-start gap-3 rounded-lg p-3.5 text-left transition-colors duration-150 hover:border-primary/45!"
                        >
                          <span className="grid size-8 shrink-0 place-items-center rounded-md border border-border bg-muted/40 text-muted-foreground transition-colors duration-150 group-hover:border-primary/40 group-hover:text-primary">
                            <Icon className="size-4" strokeWidth={1.75} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2">
                              <span className="text-[12.5px] font-medium text-foreground">
                                {ex.title}
                              </span>
                              <span className="rounded-[3px] border border-border px-1.5 py-px text-[9px] text-muted-foreground">
                                {ex.tag}
                              </span>
                            </span>
                            <span className="mt-1 block text-[11px] leading-relaxed text-muted-foreground">
                              {ex.desc}
                            </span>
                            <span className="mt-2 inline-flex items-center gap-1 text-[10.5px] text-muted-foreground opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                              打开示例
                              <ArrowRight className="size-3" strokeWidth={1.75} />
                            </span>
                          </span>
                        </motion.button>
                      );
                    })}
                  </div>
                )}
              </motion.div>

            {/* ── 底部：跳过居左，上一步 / 下一步居右 ── */}
            <div className="mt-7 flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={dismiss}
                className="rounded-md px-2.5 py-2 text-[12px] font-medium text-muted-foreground transition-colors duration-150 hover:bg-accent/60 hover:text-foreground"
              >
                跳过
              </button>

              <div className="flex items-center gap-2">
                {step > 0 && (
                  <button
                    type="button"
                    onClick={() => setStep((s) => s - 1)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border px-4 py-2 text-[12px] font-medium text-muted-foreground transition-colors duration-150 hover:bg-accent/60 hover:text-foreground"
                  >
                    <ArrowLeft className="size-4" strokeWidth={1.75} />
                    上一步
                  </button>
                )}

                <button
                  type="button"
                  onClick={onPrimary}
                  className="motion-press inline-flex items-center gap-1.5 rounded-md bg-primary px-5 py-2 text-[12px] font-medium text-primary-foreground transition-colors duration-150 hover:bg-primary/90"
                >
                  {step === lastStep ? (
                    <>
                      <Play className="size-4" fill="currentColor" strokeWidth={1.75} />
                      开始练习
                    </>
                  ) : (
                    <>
                      下一步
                      <ArrowRight className="size-4" strokeWidth={1.75} />
                    </>
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
