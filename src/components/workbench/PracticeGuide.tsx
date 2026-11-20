'use client';

/**
 * OmniMath Pro — 动手练习引导浮层（首次引导的一部分）
 *
 * 首次引导进入工作台后，若 `onboardingPractice === true`，此浮层出现在
 * 右下角，分两步引导新用户走通「输入代码 → 点击运行 → 看到结果」：
 *
 *   任务 1  查看示例代码（引导已自动填入左侧编辑器，用户可直接查看）
 *   任务 2  点击编辑器右上角「▶ 运行」按钮
 *
 * 当检测到用户确实运行过（results 非空）后，展示完成祝福，并告知可以
 * 自由探索，同时把 localStorage 标记为已引导，之后不再弹出。
 *
 * 完全瞬态：不持久化状态，不阻塞主界面，可随时「跳过」。
 */

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, Play, Sparkles, ArrowRight } from 'lucide-react';
import { useWorkbenchStore } from '@/lib/store/workbench';

/** 与 OnboardingOverlay 共用同一 localStorage 标记（二者互斥）。 */
const ONBOARDED_KEY = 'omnimath-pro-onboarded-v1';

export function PracticeGuide() {
  const practice = useWorkbenchStore((s) => s.onboardingPractice);
  const setOnboardingPractice = useWorkbenchStore((s) => s.setOnboardingPractice);
  const resultCount = useWorkbenchStore((s) => s.results.length);

  // 进入练习模式前的结果数，用于判断「是否真的跑了一次」。
  const [baseline, setBaseline] = useState<number | null>(null);

  // 每次进入练习模式时记录基线结果数。
  useEffect(() => {
    if (practice) setBaseline(resultCount);
  }, [practice, resultCount]);

  const done = practice && baseline !== null && resultCount > baseline;

  if (!practice) return null;

  const finish = () => {
    try {
      localStorage.setItem(ONBOARDED_KEY, '1');
    } catch {
      // 隐私模式忽略
    }
    setOnboardingPractice(false);
  };

  return (
    <AnimatePresence>
      {practice && (
        <motion.div
          key="practice-guide"
          initial={{ opacity: 0, y: 24, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.96 }}
          transition={{ type: 'spring', stiffness: 280, damping: 26 }}
          className="fixed bottom-5 right-5 z-[90] w-[340px] max-w-[calc(100vw-2.5rem)]"
        >
          <div className="relative overflow-hidden rounded-2xl border border-primary/25 bg-card/90 p-4 shadow-2xl shadow-black/30 backdrop-blur-xl">
            {/* 顶部光斑 */}
            <div className="pointer-events-none absolute -top-10 -right-10 size-32 rounded-full bg-primary/15 blur-3xl" />

            {/* 标题 + 关闭 */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="grid size-7 place-items-center rounded-lg bg-primary/15 text-primary">
                  <Sparkles className="size-4" />
                </span>
                <span className="text-[13px] font-semibold text-foreground">
                  {done ? '完成啦！' : '动手练习'}
                </span>
              </div>
              <button
                type="button"
                onClick={finish}
                aria-label="关闭教学"
                className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                <X className="size-3.5" />
              </button>
            </div>

            {/* 内容 */}
            <div className="mt-3">
              {done ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="space-y-3"
                >
                  <p className="text-[12.5px] leading-relaxed text-foreground">
                    太棒了，你已经成功运行出一行结果！🎉
                  </p>
                  <p className="text-[12px] leading-relaxed text-muted-foreground">
                    你已经掌握了 OmniMath Pro 的核心用法。接下来放心自由探索：
                    试试输入 <code className="rounded bg-muted px-1 text-primary">plot(sin(x))</code> 画个曲线，
                    或打开「文件」菜单体验更多脚本。
                  </p>
                  <button
                    type="button"
                    onClick={finish}
                    className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-primary to-primary/85 px-4 py-2 text-[12px] font-medium text-primary-foreground shadow-lg shadow-primary/25 transition-transform hover:scale-[1.03]"
                  >
                    开始使用
                    <ArrowRight className="size-3.5" />
                  </button>
                </motion.div>
              ) : (
                <div className="space-y-2.5">
                  <StepRow
                    index={1}
                    done
                    title="查看示例代码"
                    desc="左侧编辑器已为你填好几行示例，可直接看，也可随意修改。"
                  />
                  <StepRow
                    index={2}
                    done={false}
                    title="点击「▶ 运行」"
                    desc="在编辑器右上角找到绿色的「运行」按钮并点击，右侧会出现结果。"
                  />
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function StepRow({
  index,
  done,
  title,
  desc,
}: {
  index: number;
  done: boolean;
  title: string;
  desc: string;
}) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-border/60 bg-background/50 px-3 py-2.5">
      <span
        className={
          done
            ? 'mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-primary/20 text-primary'
            : 'mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground'
        }
      >
        {done ? <Check className="size-3" /> : index}
      </span>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 text-[12px] font-semibold text-foreground">
          {title}
          {done && (
            <span className="rounded bg-primary/10 px-1 text-[9.5px] font-medium text-primary">
              已完成
            </span>
          )}
        </div>
        <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{desc}</p>
      </div>
    </div>
  );
}
