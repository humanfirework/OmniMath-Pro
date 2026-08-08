'use client';

/**
 * OmniMath Pro — 教育模块 · 每日一卷
 *
 * 以「今天日期 + 学段」为种子确定性生成一张完整试卷：
 *  - 一、选择题 5 道（每题 4 分，共 20 分）
 *  - 二、填空题 3 道（每题 6 分，共 18 分）
 *  - 三、解答题 2 道（每题 10 分，共 20 分）
 *
 * 同一张卷在当天刷新保持稳定，跨天自动换新；题目按学段 / 难度从题库
 * 与自定义题库中确定性抽取。作答完成后一键「交卷」，逐题给出判定、
 * 参考答案与得分，并累计到本地学习数据（打卡 / 活动量 / 错题本）。
 */

import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText,
  Check,
  X,
  Send,
  RotateCcw,
  Lightbulb,
  BookOpen,
  Sparkles,
  GraduationCap,
} from 'lucide-react';
import {
  buildDailyPaper,
  checkAnswer,
  todayKey,
  type DailyPaper,
  type PaperSection,
} from '@/lib/education/logic';
import type { Question } from '@/lib/education/content';
import { STAGE_LABEL } from '@/lib/education/content';
import { useEducationStore, recentlySolvedIds } from '@/lib/store/educationStore';
import { MathText } from './MathText';
import { cn } from '@/lib/utils';

/** 每一道题在卷内的作答状态：选择题记选项下标，填空题 / 解答题记文本。
 *  解答题额外记录分步自评（partScores[i] 表示第 i 步是否写对）。 */
interface PaperAnswers {
  [questionId: string]: { choice?: number; text?: string; partScores?: boolean[] };
}

/** 交卷后每道题的判定结果（含得分）。 */
interface PaperVerdict {
  questionId: string;
  correct: boolean;
  displayAnswer: string;
  /** 解答题：分步自评得分（各步骤得分之和）。 */
  earned?: number;
  /** 解答题：满分（各步骤分数之和）。 */
  max?: number;
}

/** 段落小标题 → 渲染用的题型徽标颜色。 */
const SECTION_STYLE: Record<PaperSection['type'], { dot: string; label: string }> = {
  choice: { dot: 'bg-sky-500', label: '选择题' },
  fill: { dot: 'bg-amber-500', label: '填空题' },
  problem: { dot: 'bg-rose-500', label: '解答题' },
};

/** 按题目自身的 kind 渲染作答控件（与段落类型无关，稳健兼容回退题目）。 */
function QuestionControl({
  q,
  value,
  onChange,
  disabled,
}: {
  q: Question;
  value: PaperAnswers[number];
  onChange: (v: PaperAnswers[number]) => void;
  disabled?: boolean;
}) {
  if (q.kind === 'choice') {
    return (
      <div className="grid gap-2 sm:grid-cols-2">
        {q.options?.map((opt, i) => {
          const selected = value?.choice === i;
          return (
            <button
              key={i}
              type="button"
              onClick={() => onChange({ choice: i })}
              disabled={disabled}
              className={cn(
                'flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-[13px] transition-all',
                selected
                  ? 'border-primary/50 bg-primary/10 text-foreground'
                  : 'border-border/60 bg-background/40 text-foreground/85 hover:border-primary/30 hover:bg-accent/40',
                disabled && 'opacity-70',
              )}
            >
              <span className="grid size-6 shrink-0 place-items-center rounded-md border border-border/60 text-[11px] text-muted-foreground">
                {String.fromCharCode(65 + i)}
              </span>
              <MathText text={opt} />
            </button>
          );
        })}
      </div>
    );
  }
  if (q.kind === 'problem' && q.parts && q.parts.length > 0) {
    const parts = q.parts;
    const scores = value?.partScores ?? parts.map(() => false);
    const toggle = (i: number) => {
      const next = [...scores];
      next[i] = !next[i];
      onChange({ text: value?.text ?? '', partScores: next });
    };
    return (
      <div className="space-y-2.5">
        <textarea
          value={value?.text ?? ''}
          onChange={(e) => onChange({ text: e.target.value, partScores: scores })}
          disabled={disabled}
          rows={3}
          placeholder="在这里写出你的解题过程（可含 $...$ LaTeX）…"
          className="w-full resize-y rounded-xl border border-border/60 bg-background/50 px-3 py-2 text-[13px] outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20 disabled:opacity-60"
        />
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-2.5">
          <p className="mb-1.5 flex items-center gap-1 text-[11px] font-medium text-rose-600 dark:text-rose-400">
            <BookOpen className="size-3" />
            评分细则 · 自评给分（勾选你写对的步骤）
          </p>
          <div className="space-y-1">
            {parts.map((part, i) => (
              <button
                key={i}
                type="button"
                onClick={() => toggle(i)}
                disabled={disabled}
                className={cn(
                  'flex w-full items-start gap-2 rounded-lg border px-2.5 py-1.5 text-left transition-colors',
                  scores[i]
                    ? 'border-emerald-500/40 bg-emerald-500/10'
                    : 'border-border/50 bg-background/30 hover:border-rose-500/30',
                  disabled && 'opacity-70',
                )}
              >
                <span
                  className={cn(
                    'mt-0.5 grid size-4 shrink-0 place-items-center rounded border',
                    scores[i]
                      ? 'border-emerald-500 bg-emerald-500 text-white'
                      : 'border-border/60 text-transparent',
                  )}
                >
                  <Check className="size-3" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="text-[12.5px] leading-relaxed text-foreground/90">
                    <MathText text={part.step} />
                  </span>
                  <span className="ml-1 inline-flex translate-y-[-1px] rounded-full bg-rose-500/15 px-1.5 text-[10px] font-medium text-rose-600 dark:text-rose-400">
                    {part.points} 分
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }
  return (
    <input
      value={value?.text ?? ''}
      onChange={(e) => onChange({ text: e.target.value })}
      disabled={disabled}
      placeholder={
        q.kind === 'expression'
          ? '输入表达式，例如 3*x^2'
          : '输入你的答案（数字或分数，如 5/8）'
      }
      className="h-10 w-full rounded-xl border border-border/60 bg-background/50 px-3 text-[13.5px] outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20 disabled:opacity-60"
    />
  );
}

export function EducationPaper() {
  const stage = useEducationStore((s) => s.stage);
  const days = useEducationStore((s) => s.days);
  const customQuestions = useEducationStore((s) => s.customQuestions);
  const recordPractice = useEducationStore((s) => s.recordPractice);
  const submitPaper = useEducationStore((s) => s.submitPaper);

  const date = todayKey();
  const solvedIds = recentlySolvedIds(days);

  // 当日试卷（确定性：日期 + 学段 + 已答对排除集 + 自定义题库）。
  // 刻意不监听 solvedIds：交卷过程中 recordPractice 会更新 days → solvedIds 引用变化，
  // 若在此重建，buildDailyPaper 会因排除集变化而重组试卷，导致判定结果对不上题目。
  // 排除集的作用是「跨天」避免重复，跨天时 date 变化即会重建，即可生效。
  const paper = useMemo<DailyPaper>(
    () => buildDailyPaper(date, stage, solvedIds, customQuestions),
    [date, stage, customQuestions],
  );

  const [answers, setAnswers] = useState<PaperAnswers>({});
  const [verdicts, setVerdicts] = useState<PaperVerdict[] | null>(null);
  const [reveal, setReveal] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const setAnswer = (id: string, v: PaperAnswers[number]) =>
    setAnswers((a) => ({ ...a, [id]: v }));

  const total = paper.sections.reduce((acc, s) => acc + s.questions.length, 0);

  const handleSubmit = () => {
    const vs: PaperVerdict[] = [];
    let answered = 0;
    for (const sec of paper.sections) {
      for (const q of sec.questions) {
        const a = answers[q.id];
        // 解答题（带分步评分）：按自评勾选的步骤得分求和。
        if (q.kind === 'problem' && q.parts && q.parts.length > 0) {
          if (!a?.text?.trim()) {
            vs.push({
              questionId: q.id,
              correct: false,
              displayAnswer: q.answerLatex ?? '',
              earned: 0,
              max: q.parts.reduce((s, p) => s + p.points, 0),
            });
            continue;
          }
          answered++;
          const max = q.parts.reduce((s, p) => s + p.points, 0);
          const earned = q.parts.reduce(
            (sum, p, i) => sum + (a.partScores?.[i] ? p.points : 0),
            0,
          );
          vs.push({
            questionId: q.id,
            correct: earned >= max,
            displayAnswer: q.answerLatex ?? '',
            earned,
            max,
          });
          continue;
        }
        const userAnswer =
          q.kind === 'choice'
            ? (q.options?.[a?.choice ?? -1] ?? '')
            : (a?.text ?? '');
        if (!userAnswer.trim() && q.kind !== 'choice') {
          vs.push({ questionId: q.id, correct: false, displayAnswer: q.answerLatex ?? '' });
          continue;
        }
        answered++;
        const v = checkAnswer(q, userAnswer, a?.choice);
        vs.push({
          questionId: q.id,
          correct: v.correct,
          displayAnswer: v.displayAnswer,
        });
      }
    }
    setVerdicts(vs);
    setReveal(true);
    setSubmitted(true);
    // 累计活动量：每道已作答的题计一次（打卡 / 贡献表 / 进度）。
    if (answered > 0) {
      for (let i = 0; i < answered; i++) recordPractice(date);
    }
    // 交由 store 记录卷面作答（得分 / 交卷标记 / 错题入库）。
    submitPaper(vs.filter((v) => !v.correct).length, vs.length);
  };

  const handleReset = () => {
    setAnswers({});
    setVerdicts(null);
    setReveal(false);
    setSubmitted(false);
  };

  const score = verdicts ? verdicts.filter((v) => v.correct).length : 0;

  return (
    <div className="mx-auto max-w-3xl">
      {/* 卷头 */}
      <div className="mb-4 overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-br from-emerald-500/10 via-sky-500/5 to-indigo-500/10 shadow-sm backdrop-blur-sm">
        <div className="flex items-center gap-3 px-5 py-4">
          <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-emerald-500/25 to-sky-500/25">
            <FileText className="size-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[17px] font-semibold tracking-tight text-foreground">
                每日一卷
              </h2>
              <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                {STAGE_LABEL[stage]} · {date}
              </span>
            </div>
            <p className="mt-0.5 text-[11.5px] text-muted-foreground">
              选择题 ×5 · 填空题 ×3 · 满分 38 分
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <GraduationCap className="size-3" />
            当前学段：{STAGE_LABEL[stage]}
          </div>
        </div>
      </div>

      {/* 正文：逐大题渲染 */}
      <div className="space-y-4">
        {paper.sections.map((sec) => (
          <section
            key={sec.type}
            className="overflow-hidden rounded-3xl border border-border/60 bg-card/60 shadow-sm backdrop-blur-sm"
          >
            <div className="flex items-center gap-2 border-b border-border/60 bg-background/30 px-5 py-2.5">
              <span className={cn('size-2 rounded-full', SECTION_STYLE[sec.type].dot)} />
              <span className="text-[12.5px] font-semibold text-foreground">{sec.title}</span>
              <span className="ml-auto rounded-full border border-border/60 px-2 py-0.5 text-[10px] text-muted-foreground">
                {SECTION_STYLE[sec.type].label}
              </span>
            </div>

            <div className="divide-y divide-border/40">
              {sec.questions.map((q, qi) => {
                const verdict = verdicts?.find((v) => v.questionId === q.id);
                const a = answers[q.id];
                const answered = q.kind === 'choice' ? a?.choice !== undefined : !!a?.text?.trim();
                return (
                  <div key={q.id} className="px-5 py-4">
                    {/* 题干 */}
                    <div className="flex items-start gap-2.5">
                      <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-lg bg-muted/50 text-[11.5px] font-semibold text-muted-foreground">
                        {qi + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[14px] font-medium leading-relaxed text-foreground">
                          <MathText text={q.text} />
                        </p>
                        {!verdict && (
                          <p className="mt-0.5 flex items-start gap-1 text-[11px] italic text-muted-foreground">
                            <span className="shrink-0">💬</span>
                            <span>
                              <MathText text={q.encouragement} />
                            </span>
                          </p>
                        )}
                      </div>
                    </div>

                    {/* 作答区 */}
                    <div className="mt-3 pl-8">
                      {!verdict ? (
                        <QuestionControl
                          q={q}
                          value={a}
                          onChange={(v) => setAnswer(q.id, v)}
                        />
                      ) : (
                        <div
                          className={cn(
                            'rounded-xl border p-3',
                            verdict.correct
                              ? 'border-emerald-500/40 bg-emerald-500/8'
                              : 'border-rose-500/30 bg-rose-500/5',
                          )}
                        >
                          <div className="flex items-start gap-2">
                            <span
                              className={cn(
                                'mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-white',
                                verdict.correct ? 'bg-emerald-500' : 'bg-rose-500',
                              )}
                            >
                              {verdict.correct ? (
                                <Check className="size-3" />
                              ) : (
                                <X className="size-3" />
                              )}
                            </span>
                            <div className="min-w-0">
                              <p
                                className={cn(
                                  'text-[12.5px] font-medium',
                                  verdict.correct
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : 'text-rose-600 dark:text-rose-400',
                                )}
                              >
                                {verdict.correct ? '答对了' : '答错了 / 未作答'}
                                {verdict.earned !== undefined && verdict.max !== undefined
                                  ? ` · 自评得分 ${verdict.earned}/${verdict.max} 分`
                                  : verdict.correct && ' +' + (sec.type === 'choice' ? 4 : sec.type === 'fill' ? 6 : 10) + ' 分'}
                              </p>
                              {verdict.displayAnswer && (
                                <div className="mt-0.5 text-[12px] text-foreground/80">
                                  <span className="text-muted-foreground">参考答案：</span>
                                  <MathText text={`$${verdict.displayAnswer}$`} />
                                </div>
                              )}
                              {q.kind === 'problem' && q.parts && q.parts.length > 0 && (
                                <div className="mt-2 space-y-1">
                                  {q.parts.map((part, pi) => {
                                    const got = a?.partScores?.[pi];
                                    return (
                                      <div key={pi} className="flex items-start gap-1.5 text-[12px]">
                                        <span
                                          className={cn(
                                            'mt-1 grid size-3.5 shrink-0 place-items-center rounded-full text-white',
                                            got ? 'bg-emerald-500' : 'bg-muted text-muted-foreground',
                                          )}
                                        >
                                          {got ? <Check className="size-2" /> : <span className="text-[8px]">·</span>}
                                        </span>
                                        <span className="text-foreground/80">
                                          <MathText text={part.answer} />
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                          {!verdict.correct && (
                            <div className="mt-2 border-t border-border/40 pt-2">
                              <span className="flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                                <Lightbulb className="size-3" />
                                提示
                              </span>
                              <p className="mt-0.5 text-[12px] text-foreground/75">
                                <MathText text={q.hint ?? '结合参考答案再想一想' } />
                              </p>
                            </div>
                          )}
                          {reveal && !verdict.correct && (
                            <div className="mt-2 border-t border-border/40 pt-2">
                              <span className="flex items-center gap-1 text-[11px] font-medium text-primary">
                                <BookOpen className="size-3" />
                                思路
                              </span>
                              <ol className="mt-0.5 space-y-1">
                                {q.solution.map((step, si) => (
                                  <li key={si} className="flex gap-1.5 text-[12px] leading-relaxed text-foreground/80">
                                    <span className="text-muted-foreground">{si + 1}.</span>
                                    <MathText text={step} />
                                  </li>
                                ))}
                              </ol>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {/* 底部操作区 */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/60 bg-card/60 px-5 py-4 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          {verdicts ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-[12px] font-medium text-emerald-600 dark:text-emerald-400">
              <Check className="size-3.5" />
              得分 {score}/{total} · {Math.round((score / total) * 100)}%
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/40 px-3 py-1 text-[11.5px] text-muted-foreground">
              已作答 {Object.keys(answers).filter((k) => answers[k].choice !== undefined || answers[k].text?.trim()).length}
              /{total} 题
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!verdicts ? (
            <>
              <button
                type="button"
                onClick={() => setReveal((v) => !v)}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border/60 bg-background/40 px-3.5 text-[12px] text-muted-foreground hover:text-foreground transition-colors"
              >
                <Lightbulb className="size-3.5" />
                {reveal ? '隐藏提示' : '显示提示'}
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary px-4 text-[12.5px] font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <Send className="size-3.5" />
                交卷并查看成绩
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border/60 bg-background/40 px-3.5 text-[12px] text-muted-foreground hover:text-foreground transition-colors"
            >
              <RotateCcw className="size-3.5" />
              重新做一遍
            </button>
          )}
        </div>
      </div>

      {submitted && (
        <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-[11px] text-muted-foreground">
          <Sparkles className="size-3 text-primary" />
          卷面已计入今日打卡与错题本（全部本地保存，不上传）。
        </p>
      )}
    </div>
  );
}
