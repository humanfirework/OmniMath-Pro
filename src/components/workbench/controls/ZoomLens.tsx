'use client';

/**
 * OmniMath Pro — 通用分步放大镜组件
 *
 * 用于极限求解、矩阵变换等需要分步放大观察细节的场景。
 * 通过预定义的步骤序列，逐步放大/推进观察过程，配合平滑动画。
 *
 * 使用 render props 模式：children 是一个函数，接收当前步骤的插值参数。
 *
 * 用法：
 *   <ZoomLens steps={steps} currentStep={step} onStepChange={setStep}>
 *     {({ step, progress }) => <MyView range={step.range} progress={progress} />}
 *   </ZoomLens>
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion, useAnimationControls } from 'framer-motion';
import { ChevronLeft, ChevronRight, Play, Pause, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ZoomStep {
  /** 步骤标签 */
  label: string;
  /** 步骤说明 */
  description?: string;
  /** 任意附加数据（如 range、matrix 等），由 children 渲染函数解释 */
  [key: string]: unknown;
}

export interface ZoomLensProps {
  /** 预定义的放大步骤序列 */
  steps: ZoomStep[];
  /** 当前步骤索引（受控） */
  currentStep: number;
  /** 步骤切换回调 */
  onStepChange: (step: number) => void;
  /** 主视图渲染函数，接收当前步骤和动画进度（0-1） */
  children: (ctx: { step: ZoomStep; progress: number; stepIndex: number }) => ReactNode;
  /** 额外样式类 */
  className?: string;
  /** 是否默认折叠控制条（点击展开） */
  defaultCollapsed?: boolean;
}

export function ZoomLens({
  steps,
  currentStep,
  onStepChange,
  children,
  className,
  defaultCollapsed = false,
}: ZoomLensProps) {
  const [progress, setProgress] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const controls = useAnimationControls();
  const rafRef = useRef<number | null>(null);

  const total = steps.length;
  const safeStep = Math.max(0, Math.min(currentStep, total - 1));

  // 步骤切换时的过渡动画
  useEffect(() => {
    if (total <= 1) return;
    setProgress(0);
    controls.set({ opacity: 0.4, scale: 0.98 });
    controls
      .start({
        opacity: 1,
        scale: 1,
        transition: { duration: 0.6, ease: [0.4, 0, 0.2, 1] },
      })
      .then(() => setProgress(1));
  }, [safeStep, controls, total]);

  // 播放模式：自动推进
  useEffect(() => {
    if (!playing) return;
    const interval = 1500;
    const start = performance.now();
    const tick = (now: number) => {
      if (now - start >= interval) {
        if (safeStep < total - 1) {
          onStepChange(safeStep + 1);
        } else {
          setPlaying(false);
        }
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [playing, safeStep, total, onStepChange]);

  const goPrev = () => {
    if (safeStep > 0) onStepChange(safeStep - 1);
  };
  const goNext = () => {
    if (safeStep < total - 1) onStepChange(safeStep + 1);
  };
  const goReset = () => {
    setPlaying(false);
    onStepChange(0);
  };
  const togglePlay = () => {
    if (safeStep >= total - 1) {
      onStepChange(0);
      setPlaying(true);
    } else {
      setPlaying((p) => !p);
    }
  };

  if (total === 0) return null;

  const currentStepData = steps[safeStep];

  return (
    <div className={cn('flex flex-col rounded-lg border border-border/60 bg-card/30 overflow-hidden', className)}>
      {/* 主视图区域 */}
      <motion.div animate={controls} className="relative flex-1 min-h-0">
        {children({ step: currentStepData, progress, stepIndex: safeStep })}
      </motion.div>

      {/* 控制条 */}
      <div className="shrink-0 border-t border-border/60 bg-background/60 backdrop-blur-sm">
        {/* 步骤标签 + 说明 */}
        <div className="px-3 pt-2 flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-[11.5px] font-medium text-foreground truncate">
              {safeStep + 1}. {currentStepData.label}
            </div>
            {currentStepData.description && (
              <div className="text-[10px] text-muted-foreground truncate">
                {currentStepData.description}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="text-[10px] text-muted-foreground hover:text-foreground px-1"
            aria-label={collapsed ? '展开控制条' : '折叠控制条'}
          >
            {collapsed ? '▾' : '▴'}
          </button>
        </div>

        {/* 步骤指示器 + 控制按钮 */}
        {!collapsed && (
          <div className="px-3 pb-2 pt-1.5 flex items-center gap-2">
            <button
              type="button"
              onClick={goPrev}
              disabled={safeStep === 0}
              className="grid place-items-center size-6 rounded border border-border/60 bg-background text-muted-foreground hover:text-foreground hover:bg-accent/40 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              aria-label="上一步"
            >
              <ChevronLeft className="size-3.5" />
            </button>

            {/* 步骤圆点指示器 */}
            <div className="flex-1 flex items-center justify-center gap-1.5">
              {steps.map((s, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => onStepChange(i)}
                  aria-label={`跳到步骤 ${i + 1}: ${s.label}`}
                  className={cn(
                    'h-1.5 rounded-full transition-all',
                    i === safeStep
                      ? 'w-5 bg-primary'
                      : i < safeStep
                        ? 'w-1.5 bg-primary/50 hover:bg-primary/70'
                        : 'w-1.5 bg-border hover:bg-muted-foreground/50',
                  )}
                />
              ))}
            </div>

            <button
              type="button"
              onClick={goNext}
              disabled={safeStep === total - 1}
              className="grid place-items-center size-6 rounded border border-border/60 bg-background text-muted-foreground hover:text-foreground hover:bg-accent/40 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              aria-label="下一步"
            >
              <ChevronRight className="size-3.5" />
            </button>

            <div className="w-px h-4 bg-border/60 mx-0.5" />

            <button
              type="button"
              onClick={togglePlay}
              className="grid place-items-center size-6 rounded border border-border/60 bg-background text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-colors"
              aria-label={playing ? '暂停' : '播放'}
            >
              {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
            </button>

            <button
              type="button"
              onClick={goReset}
              className="grid place-items-center size-6 rounded border border-border/60 bg-background text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-colors"
              aria-label="重置到第一步"
            >
              <RotateCcw className="size-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
