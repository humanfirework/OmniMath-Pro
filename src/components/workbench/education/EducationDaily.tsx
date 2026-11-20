'use client';

/**
 * OmniMath Pro — 教育模块 · 每日一题
 *
 * 以「今天日期」为种子的确定性选题：同一天内无论刷新多少次都稳定是同一题，
 * 跨天自动换新题。题型支持 numeric / expression / choice。
 *
 * 交互流程：作答 → 判定 →（对/错都）给出反馈与逐步讲解 → 可让 AI 进一步讲解。
 * 心态优先：任何结果都不指责，鼓励语来自题库。
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lightbulb, Check, X, Sparkles, BookOpen, Flame, Send, RotateCcw, Grid3x3, FunctionSquare, BarChart3, GraduationCap, FileText, Zap } from 'lucide-react';
import {
  pickDailyQuestion,
  checkAnswer,
  todayKey,
  unlockLevel,
  type AnswerVerdict,
} from '@/lib/education/logic';
import { STAGES, STAGE_LABEL, type QuestionStage } from '@/lib/education/content';
import { useEducationStore, recentlySolvedIds, computeStreak } from '@/lib/store/educationStore';
import { useWorkbenchStore } from '@/lib/store/workbench';
import { MathText } from './MathText';
import { EducationPaper } from './EducationPaper';
import { cn } from '@/lib/utils';

const DIFFICULTY_LABEL: Record<number, { name: string; color: string }> = {
  1: { name: '热身 · 1 星', color: 'text-emerald-600 dark:text-emerald-400' },
  2: { name: '探索 · 2 星', color: 'text-amber-600 dark:text-amber-400' },
  3: { name: '进阶 · 3 星', color: 'text-rose-600 dark:text-rose-400' },
  4: { name: '挑战 · 4 星', color: 'text-indigo-600 dark:text-indigo-400' },
};

const TOOL_META: Record<string, { label: string; icon: typeof Grid3x3; view: 'linalg' | 'solver' | 'stats' }> = {
  linalg: { label: '用线性代数工具', icon: Grid3x3, view: 'linalg' },
  solver: { label: '用求解器验证', icon: FunctionSquare, view: 'solver' },
  stats: { label: '用统计分析', icon: BarChart3, view: 'stats' },
};

/** 把难度渲染成 ★ 串（最多 4 星）。 */
function stars(level: number) {
  const n = Math.max(1, Math.min(4, level));
  return '★'.repeat(n) + '☆'.repeat(4 - n);
}

export function EducationDaily() {
  const days = useEducationStore((s) => s.days);
  const attempts = useEducationStore((s) => s.attempts);
  const submitDaily = useEducationStore((s) => s.submitDaily);
  const stage = useEducationStore((s) => s.stage);
  const onboarded = useEducationStore((s) => s.onboarded);
  const completeOnboarding = useEducationStore((s) => s.completeOnboarding);
  const customQuestions = useEducationStore((s) => s.customQuestions);
  const recordToolUse = useEducationStore((s) => s.recordToolUse);
  const setViewMode = useWorkbenchStore((s) => s.setViewMode);

  const date = todayKey();
  const streak = useMemo(() => computeStreak(days), [days]);
  const level = unlockLevel(streak);
  const solvedIds = recentlySolvedIds(days);

  // 今日题目（确定性：date + level + 学段 + 已答对排除集 + 自定义题库）。
  // 刻意不监听 solvedIds：答对后 submitDaily 会更新 days → solvedIds 引用变化，
  // 若在此重建，会立即换到下一题并清空刚判定出的对错结果，用户根本看不清答案。
  // 排除集用于「跨天」避免重复；跨天时 date 变化即会重建，即可生效。
  const question = useMemo(
    () => pickDailyQuestion(date, level, solvedIds, stage, customQuestions),
    [date, level, stage, customQuestions],
  );

  const alreadySolved = days[date]?.solved === true;

  const [input, setInput] = useState('');
  const [choice, setChoice] = useState<number | undefined>(undefined);
  const [verdict, setVerdict] = useState<AnswerVerdict | null>(null);
  const [showTip, setShowTip] = useState(true);
  const [showHint, setShowHint] = useState(false);
  const [revealSolution, setRevealSolution] = useState(false);
  const [aiRequested, setAiRequested] = useState(false);
  // 「重新练习」模式：今日已答对后，允许在本机重练同一题，不影响当日进度判定。
  const [practiceMode, setPracticeMode] = useState(false);
  // 「每日一题」↔「每日一卷」切换。
  const [view, setView] = useState<'single' | 'paper'>('single');
  // 空提交的轻提示：避免用户还没输入就点提交，却毫无反馈。
  const [inputError, setInputError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 今日是否已被锁定（已答对且未进入重新练习）。
  const locked = alreadySolved && !practiceMode;

  // 换题后自动聚焦答案框，让「敲答案」更连贯；清除上次的输入与判定。
  useEffect(() => {
    setInput('');
    setChoice(undefined);
    setVerdict(null);
    setInputError(null);
    setShowHint(false);
    setRevealSolution(false);
    // 稍等一帧让卡片动画完成后再聚焦，避免被动画打断。
    const t = setTimeout(() => {
      if (!locked && inputRef.current && question.kind !== 'choice') {
        inputRef.current.focus();
      }
    }, 60);
    return () => clearTimeout(t);
  }, [question.id, practiceMode]);

  const reset = () => {
    setInput('');
    setChoice(undefined);
    setVerdict(null);
    setShowHint(false);
    setRevealSolution(false);
    setAiRequested(false);
    setInputError(null);
  };

  // 进入重新练习：解锁输入（不改变 store 的「今日已完成」）。
  const startPractice = () => {
    setPracticeMode(true);
    reset();
  };

  const handleCheck = () => {
    // 文本输入题（numeric/expression）空提交给出轻提示，不静默、不判错。
    if (question.kind !== 'choice' && !input.trim()) {
      setInputError('先在这里输入你的答案，再提交吧。');
      inputRef.current?.focus();
      return;
    }
    const userAnswer =
      question.kind === 'choice'
        ? question.options?.[choice ?? -1] ?? ''
        : input;
    const v = checkAnswer(question, input, choice);
    setVerdict(v);
    submitDaily(question, userAnswer, v.correct);
    if (v.correct || question.kind === 'choice') setRevealSolution(true);
    else setShowHint(true);
  };

  const diff = DIFFICULTY_LABEL[question.level];

  // 首次使用：引导选择学段（小学 / 初中 / 高中 / 大学），选定后进入每日一题。
  if (!onboarded) {
    return (
      <div className="mx-auto max-w-2xl">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="overflow-hidden rounded-3xl border border-border/60 bg-card/70 shadow-sm backdrop-blur-sm"
        >
          <div className="bg-gradient-to-br from-emerald-500/15 via-sky-500/10 to-indigo-500/15 px-6 py-6 text-center">
            <div className="mx-auto mb-3 grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-emerald-500/20 to-sky-500/20">
              <GraduationCap className="size-7 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h2 className="text-[18px] font-semibold text-foreground">欢迎开始「学习陪伴」</h2>
            <p className="mx-auto mt-1.5 max-w-md text-[12.5px] leading-relaxed text-muted-foreground">
              先告诉我你的学段，我会为你匹配更贴合当前水平的题目，
              并让 AI 助教用更合适的深度讲解。以后也可以在「设置」里随时更改。
            </p>
          </div>

          <div className="grid gap-2.5 p-5 sm:grid-cols-2">
            {STAGES.map((st) => {
              const Icon = { primary: '🎒', middle: '📚', high: '🎓', university: '🧪' }[st];
              const desc = {
                primary: '口算、分数、图形基础，贴近生活',
                middle: '函数入门、几何、简单方程、概率',
                high: '微积分初步、统计、极值、数列',
                university: '线代、高数、概率统计，联动专业工具',
              }[st];
              return (
                <button
                  key={st}
                  type="button"
                  onClick={() => completeOnboarding(st)}
                  className="group flex flex-col items-start gap-1 rounded-2xl border border-border/60 bg-background/40 p-4 text-left transition-all hover:border-primary/40 hover:bg-primary/5"
                >
                  <span className="text-[22px]">{Icon}</span>
                  <span className="mt-1 text-[14px] font-semibold text-foreground">
                    {STAGE_LABEL[st]}
                  </span>
                  <span className="text-[11px] leading-relaxed text-muted-foreground">{desc}</span>
                  <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
                    选择这个学段 →
                  </span>
                </button>
              );
            })}
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      {/* 学段提示（紧凑，不再展示一整排按钮；如需更改请到设置） */}
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <GraduationCap className="size-3" />
          当前学段：<span className="font-medium text-foreground/80">{STAGE_LABEL[stage]}</span>
        </span>
        <span className="text-muted-foreground/60">· 可在「设置」中更改</span>

        {/* 每日一题 ↔ 每日一卷 切换 */}
        <span className="ml-auto inline-flex items-center gap-0.5 rounded-lg border border-border/60 bg-card/60 p-0.5">
          <button
            type="button"
            onClick={() => setView('single')}
            className={cn(
              'inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors',
              view === 'single' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Zap className="size-3" />
            每日一题
          </button>
          <button
            type="button"
            onClick={() => setView('paper')}
            className={cn(
              'inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors',
              view === 'paper' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <FileText className="size-3" />
            每日一卷
          </button>
        </span>
      </div>

      {view === 'paper' ? (
        <EducationPaper />
      ) : (
      <>
      {/* 顶部状态条 */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-border/60 bg-background/60 px-3 py-1 text-[11px] text-muted-foreground">
          {date}
        </span>
        <span className={cn('rounded-full border border-border/60 bg-background/60 px-3 py-1 text-[11px] font-medium', diff.color)}>
          {stars(question.level)} {diff.name}
        </span>
        <span className="rounded-full border border-border/60 bg-background/60 px-3 py-1 text-[11px] text-muted-foreground">
          <Flame className="mr-1 inline size-3 text-orange-500" />
          连续 {streak} 天
        </span>
        {alreadySolved && !practiceMode && (
          <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
            今日已完成
          </span>
        )}
        {practiceMode && (
          <span className="rounded-full border border-amber-400/40 bg-amber-500/10 px-3 py-1 text-[11px] font-medium text-amber-600 dark:text-amber-400">
            重新练习中
          </span>
        )}
      </div>

      {/* 题目卡片 */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-3xl border border-border/60 bg-card/70 p-6 backdrop-blur-sm shadow-sm"
      >
        <div className="mb-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <BookOpen className="size-3" />
          {question.topic}
        </div>
        <h3 className="text-[17px] font-semibold leading-relaxed text-foreground">
          <MathText text={question.text} />
        </h3>
        {showTip && (
          <p className="mt-2 flex items-start gap-1.5 text-[12.5px] italic text-muted-foreground">
            <span className="mt-0.5 shrink-0">💬</span>
            <span className="flex-1">
              <MathText text={question.encouragement} />
            </span>
            <button
              type="button"
              onClick={() => setShowTip(false)}
              className="shrink-0 rounded p-0.5 text-muted-foreground/50 hover:text-foreground transition-colors"
              aria-label="关闭提示"
              title="关闭提示"
            >
              <X className="size-3" />
            </button>
          </p>
        )}

        {/* 作答区 */}
        <div className="mt-5">
          {question.kind === 'choice' ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {question.options?.map((opt, i) => {
                const selected = choice === i;
                const isCorrectReveal = revealSolution && i === question.correctIndex;
                const isWrongPick = verdict && !verdict.correct && choice === i;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setChoice(i)}
                    disabled={locked}
                    className={cn(
                      'flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-[13px] transition-all',
                      selected
                        ? 'border-primary/50 bg-primary/10 text-foreground'
                        : 'border-border/60 bg-background/40 text-foreground/85 hover:border-primary/30 hover:bg-accent/40',
                      isCorrectReveal && 'border-emerald-500/50 bg-emerald-500/10',
                      isWrongPick && 'border-rose-500/50 bg-rose-500/10',
                      alreadySolved && 'opacity-70',
                    )}
                  >
                    <span className="grid size-6 shrink-0 place-items-center rounded-md border border-border/60 text-[11px] text-muted-foreground">
                      {String.fromCharCode(65 + i)}
                    </span>
                    <MathText text={opt} />
                    {isCorrectReveal && <Check className="ml-auto size-4 text-emerald-500" />}
                    {isWrongPick && <X className="ml-auto size-4 text-rose-500" />}
                  </button>
                );
              })}
            </div>
          ) : (
            <>
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  if (inputError) setInputError(null);
                }}
                onKeyDown={(e) => e.key === 'Enter' && handleCheck()}
                disabled={locked}
                placeholder={
                  question.kind === 'expression'
                    ? '输入表达式，例如 3*x^2'
                    : '输入你的答案（数字或分数，如 5/8）'
                }
                className={cn(
                  'h-10 w-full rounded-xl border border-border/60 bg-background/50 px-3 text-[13.5px] outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20 disabled:opacity-60 transition-colors',
                  inputError && 'border-amber-400/70 focus:border-amber-400/70 focus:ring-amber-400/30',
                )}
              />
              {inputError && (
                <p className="mt-1.5 flex items-center gap-1 text-[11.5px] text-amber-600 dark:text-amber-400">
                  <Lightbulb className="size-3" />
                  {inputError}
                </p>
              )}
            </>
          )}

          {/* 操作按钮 */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {!locked && (
              <button
                type="button"
                onClick={handleCheck}
                disabled={question.kind === 'choice' && choice === undefined}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary px-4 text-[12.5px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors"
              >
                <Send className="size-3.5" />
                {question.kind === 'choice' ? '提交选择' : '提交答案'}
              </button>
            )}
            {!locked && (
              <button
                type="button"
                onClick={() => setShowHint((v) => !v)}
                className={cn(
                  'inline-flex h-9 items-center gap-1.5 rounded-xl border px-3.5 text-[12px] transition-colors',
                  showHint
                    ? 'border-amber-400/50 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                    : 'border-border/60 bg-background/40 text-muted-foreground hover:text-foreground',
                )}
              >
                <Lightbulb className="size-3.5" />
                {showHint ? '收起提示' : '查看提示'}
              </button>
            )}
            {alreadySolved && !practiceMode && (
              <button
                type="button"
                onClick={startPractice}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border/60 bg-background/40 px-3.5 text-[12px] text-muted-foreground hover:text-foreground transition-colors"
              >
                <RotateCcw className="size-3.5" />
                重新练习
              </button>
            )}
            {practiceMode && (
              <button
                type="button"
                onClick={() => {
                  setPracticeMode(false);
                  reset();
                }}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border/60 bg-background/40 px-3.5 text-[12px] text-muted-foreground hover:text-foreground transition-colors"
              >
                <Check className="size-3.5" />
                回到完成状态
              </button>
            )}
          </div>
        </div>

        {/* 提示 */}
        <AnimatePresence>
          {showHint && question.hint && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-4 rounded-xl border border-amber-400/30 bg-amber-500/5 p-3 text-[13px] text-foreground/85">
                <span className="font-medium text-amber-600 dark:text-amber-400">提示：</span>
                <MathText text={question.hint} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 判定反馈 */}
        <AnimatePresence>
          {verdict && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={cn(
                'mt-4 rounded-2xl border p-4',
                verdict.correct
                  ? 'border-emerald-500/40 bg-emerald-500/8'
                  : 'border-rose-500/30 bg-rose-500/5',
              )}
            >
              <div className="flex items-start gap-2">
                <span
                  className={cn(
                    'mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-white',
                    verdict.correct ? 'bg-emerald-500' : 'bg-rose-500',
                  )}
                >
                  {verdict.correct ? <Check className="size-3.5" /> : <X className="size-3.5" />}
                </span>
                <div>
                  <p className={cn('text-[13.5px] font-medium', verdict.correct ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400')}>
                    {verdict.correct ? '答对了！' : '没关系，再想想'}
                  </p>
                  <p className="mt-0.5 text-[12.5px] text-foreground/80">{verdict.feedback}</p>
                  {verdict.displayAnswer && (
                    <div className="mt-2">
                      <span className="text-[11px] text-muted-foreground">参考答案：</span>
                      <MathText text={`$${verdict.displayAnswer}$`} />
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 逐步讲解 */}
        <AnimatePresence>
          {revealSolution && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-4"
            >
              <div className="rounded-2xl border border-border/60 bg-background/40 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-[12px] font-semibold text-foreground/90">
                    <BookOpen className="size-3.5 text-primary" />
                    逐步讲解
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setAiRequested(true);
                      if (typeof window !== 'undefined') {
                        window.dispatchEvent(
                          new CustomEvent('omnimath:ai-explain', {
                            detail: `请帮我深入讲解这道题的解法，题目：${question.text}。请分步骤、用浅显的语言，并解释每一步背后的数学思想。`,
                          }),
                        );
                      }
                    }}
                    className="inline-flex h-7 items-center gap-1 rounded-lg border border-primary/30 bg-primary/10 px-2.5 text-[11px] font-medium text-primary hover:bg-primary/15 transition-colors"
                  >
                    <Sparkles className="size-3" />
                    AI 深入讲解
                  </button>
                </div>
                <ol className="space-y-1.5">
                  {question.solution.map((step, i) => (
                    <li key={i} className="flex gap-2 text-[13px] leading-relaxed text-foreground/85">
                      <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary">
                        {i + 1}
                      </span>
                      <MathText text={step} />
                    </li>
                  ))}
                </ol>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {alreadySolved && !practiceMode && !revealSolution && (
          <p className="mt-4 text-center text-[12px] text-muted-foreground">
            🎉 今天的每日一题已完成，明天再来！也可以到「错题本 / 进度」继续回顾。
          </p>
        )}
        {aiRequested && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            ✨ 已把题目交给 AI 助教，去「AI 助教」面板查看深入讲解。
          </p>
        )}

        {/* 联动工具：把这道题交给求解器 / 线性代数 / 统计等专业模块进一步探索 */}
        {question.tools && question.tools.length > 0 && (
          <div className="mt-4 rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-3">
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-indigo-600 dark:text-indigo-400">
              <Sparkles className="size-3" />
              用专业工具深入探索
            </div>
            <div className="flex flex-wrap gap-2">
              {question.tools.map((tool) => {
                const meta = TOOL_META[tool];
                if (!meta) return null;
                const ToolIcon = meta.icon;
                return (
                  <button
                    key={tool}
                    type="button"
                    onClick={() => {
                      recordToolUse();
                      setViewMode(meta.view);
                    }}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-indigo-400/30 bg-indigo-500/10 px-3 text-[11.5px] font-medium text-indigo-700 dark:text-indigo-300 hover:bg-indigo-500/20 transition-colors"
                  >
                    <ToolIcon className="size-3.5" />
                    {meta.label}
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-[10.5px] text-muted-foreground">
              这道题与工作台的专业工具相联动，点一下即可用更强大的方式验证和理解。
            </p>
          </div>
        )}
      </motion.div>
      </>
      )}
    </div>
  );
}
