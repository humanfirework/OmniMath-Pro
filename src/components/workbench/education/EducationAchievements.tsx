'use client';

/**
 * OmniMath Pro — 教育模块 · 成就徽章 & 错题本
 *
 *  - 成就徽章：展示 BADGES 定义、解锁状态与进度。
 *  - 错题本：列出答错过（并已收集）的题目，可逐条删除 / 清空，或交给 AI 讲解。
 */

import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Award, BookX, Sparkles, Lock, Trash2, X, HelpCircle } from 'lucide-react';
import {
  useEducationStore,
  BADGES,
  computeStats,
  getQuestionAny,
} from '@/lib/store/educationStore';
import { MathText } from './MathText';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export function EducationAchievements() {
  const days = useEducationStore((s) => s.days);
  const wrongBook = useEducationStore((s) => s.wrongBook);
  const recoveries = useEducationStore((s) => s.recoveries);
  const linkedTools = useEducationStore((s) => s.linkedTools);
  const papers = useEducationStore((s) => s.papers);
  const customQuestions = useEducationStore((s) => s.customQuestions);
  const removeWrongItem = useEducationStore((s) => s.removeWrongItem);
  const clearWrongBook = useEducationStore((s) => s.clearWrongBook);
  const [tab, setTab] = useState<'badges' | 'wrong'>('badges');
  const [confirmClearWrong, setConfirmClearWrong] = useState(false);

  const stats = useMemo(
    () => computeStats(days, wrongBook, recoveries, linkedTools, papers),
    [days, wrongBook, recoveries, linkedTools, papers],
  );

  const unlockedCount = BADGES.filter((b) => b.unlocked(stats)).length;
  const hiddenLockedCount = BADGES.filter((b) => b.hidden && !b.unlocked(stats)).length;

  return (
    <div className="mx-auto max-w-4xl">
      {/* 标签切换 */}
      <div className="mb-5 flex items-center gap-1 rounded-xl border border-border/60 bg-card/50 p-1 backdrop-blur-sm">
        <button
          type="button"
          onClick={() => setTab('badges')}
          className={cn(
            'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[12.5px] font-medium transition-colors',
            tab === 'badges' ? 'bg-primary/12 text-primary' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <Award className="size-3.5" />
          成就徽章
          <span className="text-[10px] text-muted-foreground">
            {unlockedCount}/{BADGES.length}
          </span>
          {hiddenLockedCount > 0 && (
            <span className="text-[10px] text-muted-foreground/70">
              · {hiddenLockedCount} 个隐藏
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setTab('wrong')}
          className={cn(
            'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[12.5px] font-medium transition-colors',
            tab === 'wrong' ? 'bg-primary/12 text-primary' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <BookX className="size-3.5" />
          错题本
          <span className="text-[10px] text-muted-foreground">{wrongBook.length}</span>
        </button>
      </div>

      <AnimatePresence mode="wait">
        {tab === 'badges' ? (
          <motion.div
            key="badges"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {BADGES.map((badge) => {
                const unlocked = badge.unlocked(stats);
                const progress = Math.min(1, Math.max(0, badge.progress(stats)));
                const isHiddenLocked = badge.hidden && !unlocked;
                return (
                  <div
                    key={badge.id}
                    className={cn(
                      'relative rounded-2xl border p-4 backdrop-blur-sm transition-all',
                      unlocked
                        ? 'border-amber-400/40 bg-gradient-to-br from-amber-500/10 to-rose-500/5 shadow-sm'
                        : 'border-border/60 bg-card/50 opacity-80',
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={cn(
                          'grid size-11 shrink-0 place-items-center rounded-xl text-[22px]',
                          unlocked
                            ? 'bg-amber-500/15'
                            : isHiddenLocked
                              ? 'bg-slate-500/10'
                              : 'bg-muted/40 grayscale',
                        )}
                      >
                        {unlocked ? (
                          badge.icon
                        ) : (
                          <Lock className="size-4 text-muted-foreground" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-[13px] font-semibold text-foreground">
                            {isHiddenLocked ? '???' : badge.name}
                          </span>
                          {unlocked && (
                            <span className="shrink-0 rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-medium text-amber-600 dark:text-amber-400">
                              已解锁
                            </span>
                          )}
                          {isHiddenLocked && (
                            <span className="shrink-0 rounded-full bg-slate-500/20 px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">
                              隐藏成就
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-[10.5px] leading-snug text-muted-foreground">
                          {isHiddenLocked
                            ? '神秘的隐藏成就，达成条件后才会揭晓。'
                            : badge.desc}
                        </p>
                      </div>
                    </div>
                    {!unlocked && (
                      <div className="mt-3">
                        <div className="h-1.5 overflow-hidden rounded-full bg-border/40">
                          <div
                            className="h-full rounded-full bg-amber-500/70 transition-all"
                            style={{ width: `${progress * 100}%` }}
                          />
                        </div>
                        <div className="mt-1 text-right text-[9.5px] text-muted-foreground">
                          {isHiddenLocked ? '???%' : `${Math.round(progress * 100)}%`}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="mt-4 text-center text-[11px] text-muted-foreground">
              徽章完全离线计算，安心记录，无需登录。
              {hiddenLockedCount > 0 && ' 带有「隐藏成就」标记的徽章，达成后才会揭晓名字与图标。'}
            </p>
          </motion.div>
        ) : (
          <motion.div
            key="wrong"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="space-y-3"
          >
            <div className="flex items-center justify-between">
              <p className="text-[12px] text-muted-foreground">
                共 {wrongBook.length} 条错题记录，点击即可回顾与重练。
              </p>
              {wrongBook.length > 0 && (
                <button
                  type="button"
                  onClick={() => setConfirmClearWrong(true)}
                  className="inline-flex h-7 items-center gap-1 rounded-lg border border-border/60 px-2.5 text-[11px] text-muted-foreground hover:text-rose-500 hover:border-rose-500/40 transition-colors"
                >
                  <Trash2 className="size-3" />
                  清空
                </button>
              )}
            </div>

            {wrongBook.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 bg-card/30 py-12 text-center">
                <BookX className="mb-2 size-8 text-muted-foreground/40" />
                <p className="text-[13px] font-medium text-foreground/80">错题本是空的</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  答错过的题目会出现在这里，方便你反复巩固。
                </p>
              </div>
            ) : (
              wrongBook.map((item) => {
                const q = getQuestionAny(item.questionId, customQuestions);
                if (!q) return null;
                return (
                  <div
                    key={item.id}
                    className="rounded-2xl border border-border/60 bg-card/60 p-4 backdrop-blur-sm"
                  >
                    <div className="mb-1 flex items-center justify-between">
                      <span className="rounded-full border border-border/60 px-2 py-0.5 text-[10px] text-muted-foreground">
                        {item.date} · {q.topic}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeWrongItem(item.id)}
                        className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-rose-500/10 hover:text-rose-500 transition-colors"
                        title="移除该条"
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                    <p className="text-[13.5px] leading-relaxed text-foreground">
                      <MathText text={q.text} />
                    </p>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px]">
                      <span className="text-rose-500">你的作答：{item.userAnswer || '未填写'}</span>
                      <span className="text-emerald-500">
                        正确答案：
                        <MathText text={`$${item.correctAnswer || ''}$`} />
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (typeof window !== 'undefined') {
                          window.dispatchEvent(
                            new CustomEvent('omnimath:ai-explain', {
                              detail: `这道题我上次做错了，请你结合我的错误答案，帮我理解错在哪、如何改正：题目：${q.text}。我的答案：${item.userAnswer}。正确答案：${item.correctAnswer}。`,
                            }),
                          );
                        }
                      }}
                      className="mt-2 inline-flex h-7 items-center gap-1 rounded-lg border border-primary/30 bg-primary/10 px-2.5 text-[11px] font-medium text-primary hover:bg-primary/15 transition-colors"
                    >
                      <Sparkles className="size-3" />
                      让 AI 讲解这道错题
                    </button>
                  </div>
                );
              })
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* 清空错题本 · 二次确认（应用内对话框，兼容桌面 WebView） */}
      <Dialog open={confirmClearWrong} onOpenChange={setConfirmClearWrong}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="size-4 text-rose-500" />
              清空全部错题本？
            </DialogTitle>
            <DialogDescription>
              此操作将删除本地全部错题记录（含复盘次数），且不可撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setConfirmClearWrong(false)}>
              取消
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                clearWrongBook();
                setConfirmClearWrong(false);
              }}
            >
              <Trash2 className="size-3.5" />
              确认清空
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
