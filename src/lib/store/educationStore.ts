/**
 * OmniMath Pro — 教育模块 · 本地持久化 Store
 *
 * 数据完全本地（localStorage）、无登录、不上传 —— 呼应「心灵陪伴 / 隐私底线」。
 * 记录三类数据：
 *  - days：按日期记录当天活动量（count）与当日一题是否答对（solved）。
 *  - attempts：按日期记录当日一题的作答详情（题目、是否答对、尝试次数）。
 *  - wrongBook：错题本（答错过的题目，供复盘与 AI 讲解）。
 *
 * 所有写操作先更新状态、再防抖持久化；加载时对持久化数据做白名单校验，
 * 避免损坏 / 旧版本数据污染状态（与 settingsStore / workbench 一致的做法）。
 */

import { create } from 'zustand';
import {
  filterValidQuestions,
  getQuestion,
  stageOf,
  isQuestion,
  sanitizeQuestion,
  type Question,
  type QuestionLevel,
  type QuestionStage,
  STAGES,
} from '@/lib/education/content';
import { todayKey, unlockLevel } from '@/lib/education/logic';

export const EDUCATION_STORAGE_KEY = 'omnimath-education-v1';

/* ═══════════════════ 徽章定义 ═══════════════════ */

export interface BadgeMeta {
  id: string;
  name: string;
  desc: string;
  /** 隐藏成就：解锁前不显示名称 / 图标，只显示「???」；解锁后才揭晓。 */
  hidden?: boolean;
  /** 解锁判据：给定当前统计，返回是否已解锁。 */
  unlocked: (s: EducationStats) => boolean;
  /** 未解锁时的进度提示（0–1 用于进度条）。 */
  progress: (s: EducationStats) => number;
  icon: string;
}

export interface EducationStats {
  /** 当前连续天数。 */
  streak: number;
  /** 历史最高连续天数。 */
  bestStreak: number;
  /** 历史最高「连续答对每日一题」天数。 */
  bestSolvedStreak: number;
  /** 累计答对的当日一题天数。 */
  totalSolved: number;
  /** 累计活动量（题目 + 练习次数总和）。 */
  totalActivities: number;
  /** 累计打卡天数。 */
  totalDays: number;
  /** 已解锁的最高难度（1–4 星）。 */
  level: QuestionLevel;
  /** 错题本条目数。 */
  wrongCount: number;
  /** 已从错题本「找回」并移除的题数（复盘后清理，反映韧性）。 */
  recoveries: number;
  /** 已尝试过的学段集合（用于「跨学段探索」隐藏成就）。 */
  stagesTried: QuestionStage[];
  /** 是否曾在 23:00 之后作答（夜猫子）。 */
  hasNightActivity: boolean;
  /** 是否曾在 06:00 之前作答（早起鸟）。 */
  hasEarlyActivity: boolean;
  /** 使用专业工具联动的次数（科研之心）。 */
  linkedTools: number;
  /** 累计完成「每日一卷」的次数。 */
  paperCount: number;
  /** 历史最高「每日一卷」单张得分率（0–1，用于「卷面满分」类成就）。 */
  bestPaperRate: number;
}

export const BADGES: BadgeMeta[] = [
  {
    id: 'first_step',
    name: '迈出第一步',
    desc: '完成第一道「每日一题」',
    icon: '🌱',
    unlocked: (s) => s.totalSolved >= 1,
    progress: (s) => Math.min(1, s.totalSolved),
  },
  {
    id: 'streak_3',
    name: '坚持 3 天',
    desc: '连续打卡 3 天',
    icon: '🔥',
    unlocked: (s) => s.bestStreak >= 3,
    progress: (s) => Math.min(1, s.bestStreak / 3),
  },
  {
    id: 'streak_7',
    name: '一周之约',
    desc: '连续打卡 7 天',
    icon: '📅',
    unlocked: (s) => s.bestStreak >= 7,
    progress: (s) => Math.min(1, s.bestStreak / 7),
  },
  {
    id: 'streak_14',
    name: '两周不辍',
    desc: '连续打卡 14 天',
    icon: '🌙',
    unlocked: (s) => s.bestStreak >= 14,
    progress: (s) => Math.min(1, s.bestStreak / 14),
  },
  {
    id: 'streak_30',
    name: '满月坚持',
    desc: '连续打卡 30 天',
    icon: '🏆',
    unlocked: (s) => s.bestStreak >= 30,
    progress: (s) => Math.min(1, s.bestStreak / 30),
  },
  {
    id: 'solver_10',
    name: '十题小成',
    desc: '累计答对 10 道题',
    icon: '✏️',
    unlocked: (s) => s.totalSolved >= 10,
    progress: (s) => Math.min(1, s.totalSolved / 10),
  },
  {
    id: 'solver_30',
    name: '三十题达人',
    desc: '累计答对 30 道题',
    icon: '🎯',
    unlocked: (s) => s.totalSolved >= 30,
    progress: (s) => Math.min(1, s.totalSolved / 30),
  },
  {
    id: 'explorer',
    name: '探索者',
    desc: '解锁 2 星难度',
    icon: '🧭',
    unlocked: (s) => s.level >= 2,
    progress: (s) => Math.min(1, s.level >= 2 ? 1 : s.streak / 3),
  },
  {
    id: 'master',
    name: '进阶大师',
    desc: '解锁 3 星难度',
    icon: '🚀',
    unlocked: (s) => s.level >= 3,
    progress: (s) => Math.min(1, s.level >= 3 ? 1 : s.streak / 7),
  },
  {
    id: 'resilient',
    name: '越挫越勇',
    desc: '从错题本中完成 1 次复盘（移除 1 道已弄懂的错题）',
    icon: '💪',
    unlocked: (s) => s.recoveries >= 1,
    progress: (s) => Math.min(1, s.recoveries / 1),
  },
  {
    id: 'resilient_5',
    name: '百炼成钢',
    desc: '累计完成 5 次错题复盘',
    icon: '🛡️',
    unlocked: (s) => s.recoveries >= 5,
    progress: (s) => Math.min(1, s.recoveries / 5),
  },
  {
    id: 'solver_60',
    name: '六十题宗师',
    desc: '累计答对 60 道题',
    icon: '🎖️',
    unlocked: (s) => s.totalSolved >= 60,
    progress: (s) => Math.min(1, s.totalSolved / 60),
  },
  {
    id: 'polyglot_stage',
    name: '跨学段探索',
    desc: '尝试过全部四个学段（小学 / 初中 / 高中 / 大学）',
    icon: '🌍',
    hidden: true,
    unlocked: (s) => s.stagesTried.length >= 4,
    progress: (s) => Math.min(1, s.stagesTried.length / 4),
  },
  {
    id: 'perfect_7',
    name: '七日全对',
    desc: '连续 7 天都答对当日一题',
    icon: '💎',
    hidden: true,
    unlocked: (s) => s.bestSolvedStreak >= 7,
    progress: (s) => Math.min(1, s.bestSolvedStreak / 7),
  },
  {
    id: 'night_owl',
    name: '夜猫子',
    desc: '在 23:00 之后完成一道每日一题',
    icon: '🦉',
    hidden: true,
    unlocked: (s) => s.hasNightActivity,
    progress: (s) => (s.hasNightActivity ? 1 : 0),
  },
  {
    id: 'early_bird',
    name: '早起鸟',
    desc: '在 06:00 之前完成一道每日一题',
    icon: '🌅',
    hidden: true,
    unlocked: (s) => s.hasEarlyActivity,
    progress: (s) => (s.hasEarlyActivity ? 1 : 0),
  },
  {
    id: 'researcher',
    name: '科研之心',
    desc: '使用过一次「科研 / 专业工具」联动（如线性代数、求解器）',
    icon: '🔬',
    hidden: true,
    unlocked: (s) => s.linkedTools >= 1,
    progress: (s) => Math.min(1, s.linkedTools / 1),
  },
  {
    id: 'paper_first',
    name: '首张考卷',
    desc: '完成第一张「每日一卷」',
    icon: '📄',
    unlocked: (s) => s.paperCount >= 1,
    progress: (s) => Math.min(1, s.paperCount / 1),
  },
  {
    id: 'paper_7',
    name: '一周一练',
    desc: '累计完成 7 张「每日一卷」',
    icon: '🗂️',
    unlocked: (s) => s.paperCount >= 7,
    progress: (s) => Math.min(1, s.paperCount / 7),
  },
  {
    id: 'paper_30',
    name: '卷海无涯',
    desc: '累计完成 30 张「每日一卷」',
    icon: '📚',
    unlocked: (s) => s.paperCount >= 30,
    progress: (s) => Math.min(1, s.paperCount / 30),
  },
  {
    id: 'paper_perfect',
    name: '卷面满分',
    desc: '某一张「每日一卷」全对（100% 正确率）',
    icon: '💯',
    hidden: true,
    unlocked: (s) => s.bestPaperRate >= 1,
    progress: (s) => Math.min(1, s.bestPaperRate),
  },
];

/* ═══════════════════ 数据类型 ═══════════════════ */

/** 单日活动记录。 */
export interface DayRecord {
  date: string;
  /** 当天活动量（题目 / 练习次数）。 */
  count: number;
  /** 当天是否答对「每日一题」。 */
  solved?: boolean;
  /** 当天「每日一题」的题目 id。 */
  questionId?: string;
  /** 当天作答时的小时（0–23），用于夜猫子 / 早起鸟隐藏成就。 */
  hour?: number;
}

/** 某天「每日一题」的作答详情。 */
export interface DailyAttempt {
  date: string;
  questionId: string;
  solved: boolean;
  attempts: number;
  lastAnswer?: string;
}

/** 错题本条目。 */
export interface WrongItem {
  id: string;
  questionId: string;
  userAnswer: string;
  correctAnswer: string;
  date: string;
}

/** 「每日一卷」的当日卷面记录。 */
export interface PaperRecord {
  date: string;
  /** 答错 / 未作答的题数。 */
  wrong: number;
  /** 总题数（正常为 10：5 选择 + 3 填空 + 2 解答）。 */
  total: number;
  /** 答对题数。 */
  correct: number;
}

/** 导入的教材：原文 + AI 提炼的重点，供「根据教材出题」与 AI 助教参考。 */
export interface Textbook {
  /** 教材 / 章节名称（未命名时用文件名或「导入教材」）。 */
  title: string;
  /** 教材原文（可能是大段文本或整本书提取出的文本）。 */
  content: string;
  /** AI 提炼的重点（分点列表），供 AI 助教「与教材联络」时参考。 */
  notes: string[];
  /** 教材字数（用于展示规模）。 */
  chars: number;
}

interface EducationState {
  days: Record<string, DayRecord>;
  attempts: Record<string, DailyAttempt>;
  wrongBook: WrongItem[];
  /** 「每日一卷」的按日期卷面记录。 */
  papers: Record<string, PaperRecord>;
  /** 累计完成「每日一卷」的次数（用于成就 / 统计）。 */
  paperCount: number;
  /** 首次开始学习的日期（用于贡献表起点）。 */
  startedAt: string;
  /** 从错题本移除（复盘完成）的累计次数，用于「越挫越勇」徽章。 */
  recoveries: number;
  /** 当前学段（小学 / 初中 / 高中 / 大学），决定每日一题的出题范围。 */
  stage: QuestionStage;
  /** 是否已完成「首次学段引导」（选择学段后置为 true，之后不再显示一排学段按钮）。 */
  onboarded: boolean;
  /** 使用专业工具（求解器 / 线性代数 / 统计）联动的累计次数。 */
  linkedTools: number;
  /** 用户导入的自定义题目（与内置题库一同进入「每日一题」选题池）。 */
  customQuestions: Question[];
  /** 用户导入的教材（原文 + AI 重点），供「根据教材出题」与 AI 助教参考。 */
  textbook: Textbook | null;

  /* actions */
  /** 设置学段。 */
  setStage: (stage: QuestionStage) => void;
  /** 完成首次学段引导（选中学段并进入）。 */
  completeOnboarding: (stage: QuestionStage) => void;
  /** 记录一次「科研 / 专业工具」联动使用。 */
  recordToolUse: () => void;
  /** 提交一次「每日一题」作答，返回是否答对。 */
  submitDaily: (question: Question, userAnswer: string, correct: boolean) => boolean;
  /** 提交「每日一卷」的卷面成绩，记录卷面并累计完成次数。 */
  submitPaper: (wrong: number, total: number) => void;
  /** 记录一次自由练习活动（不做对错判断，只计入当天活动量）。 */
  recordPractice: (date?: string) => void;
  /** 从错题本移除一条（复盘答对后调用）。 */
  removeWrongItem: (id: string) => void;
  /** 清空错题本。 */
  clearWrongBook: () => void;
  /** 重置所有学习数据（隐私：本地数据可一键清空）。 */
  resetAll: () => void;
  /** 批量导入自定义题目（校验 + 去重 + 归一化）。返回新增 / 跳过数量。 */
  importQuestions: (items: unknown[]) => { added: number; skipped: number; questions: Question[] };
  /** 移除一条自定义题目。 */
  removeCustomQuestion: (id: string) => void;
  /** 清空全部自定义题目。 */
  clearCustomQuestions: () => void;
  /** 保存 / 清空导入的教材（含 AI 提炼的重点）。 */
  setTextbook: (t: Textbook | null) => void;

  saveToStorage: () => void;
  loadFromStorage: () => void;
}

/* ═══════════════════ 统计辅助 ═══════════════════ */

/** 计算当前连续天数（含今天或含昨天）。 */
export function computeStreak(days: Record<string, DayRecord>, now = new Date()): number {
  const key = todayKey(now);
  const active = (d: string) => days[d] && days[d].count > 0;
  let streak = 0;
  let cursor = new Date(now);
  // 今天未活动时，从昨天开始数（GitHub 风格，保证昨天打了卡今天未打卡仍算连续）。
  if (!active(key)) cursor.setDate(cursor.getDate() - 1);
  while (active(todayKey(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/** 计算历史最高连续天数。 */
export function computeBestStreak(days: Record<string, DayRecord>): number {
  const dates = Object.keys(days)
    .filter((d) => days[d] && days[d].count > 0)
    .sort();
  if (dates.length === 0) return 0;
  let best = 1;
  let cur = 1;
  for (let i = 1; i < dates.length; i++) {
    const prev = new Date(dates[i - 1] + 'T00:00:00');
    const curD = new Date(dates[i] + 'T00:00:00');
    const diff = (curD.getTime() - prev.getTime()) / 86400000;
    if (diff === 1) {
      cur++;
      best = Math.max(best, cur);
    } else {
      cur = 1;
    }
  }
  return best;
}

/** 计算「连续答对每日一题」的历史最高天数。 */
export function computeBestSolvedStreak(days: Record<string, DayRecord>): number {
  const dates = Object.keys(days)
    .filter((d) => days[d] && days[d].solved)
    .sort();
  if (dates.length === 0) return 0;
  let best = 1;
  let cur = 1;
  for (let i = 1; i < dates.length; i++) {
    const prev = new Date(dates[i - 1] + 'T00:00:00');
    const curD = new Date(dates[i] + 'T00:00:00');
    const diff = (curD.getTime() - prev.getTime()) / 86400000;
    if (diff === 1) {
      cur++;
      best = Math.max(best, cur);
    } else {
      cur = 1;
    }
  }
  return best;
}

/** 汇总统计数据。 */
export function computeStats(
  days: Record<string, DayRecord>,
  wrongBook: WrongItem[],
  recoveries = 0,
  linkedTools = 0,
  papers: Record<string, PaperRecord> = {},
  now = new Date(),
): EducationStats {
  const streak = computeStreak(days, now);
  const bestStreak = computeBestStreak(days);
  const totalSolved = Object.values(days).filter((d) => d.solved).length;
  const totalActivities = Object.values(days).reduce((acc, d) => acc + d.count, 0);
  const totalDays = Object.values(days).filter((d) => d.count > 0).length;
  const level = unlockLevel(streak);

  // 收集所有作答过的题目所属学段（用于「跨学段探索」隐藏成就）。
  const stagesTried: QuestionStage[] = [];
  for (const d of Object.values(days)) {
    if (d.questionId) {
      const q = getQuestion(d.questionId);
      if (q) {
        const st = stageOf(q);
        if (!stagesTried.includes(st)) stagesTried.push(st);
      }
    }
  }
  // 是否曾在深夜 / 清晨作答。
  const hasNightActivity = Object.values(days).some((d) => d.hour !== undefined && d.hour >= 23);
  const hasEarlyActivity = Object.values(days).some((d) => d.hour !== undefined && d.hour < 6);

  // 「每日一卷」累计完成次数与历史最高得分率。
  const paperValues = Object.values(papers);
  const paperCount = paperValues.length;
  const bestPaperRate = paperValues.reduce(
    (acc, p) => Math.max(acc, p.total > 0 ? p.correct / p.total : 0),
    0,
  );

  return {
    streak,
    bestStreak,
    bestSolvedStreak: computeBestSolvedStreak(days),
    totalSolved,
    totalActivities,
    totalDays,
    level,
    wrongCount: wrongBook.length,
    recoveries,
    stagesTried,
    hasNightActivity,
    hasEarlyActivity,
    linkedTools,
    paperCount,
    bestPaperRate,
  };
}

/* ═══════════════════ Store ═══════════════════ */

function sanitizeDay(raw: unknown): DayRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.date !== 'string' || !o.date) return null;
  return {
    date: o.date,
    count: typeof o.count === 'number' && o.count > 0 ? Math.round(o.count) : 1,
    solved: typeof o.solved === 'boolean' ? o.solved : undefined,
    questionId: typeof o.questionId === 'string' ? o.questionId : undefined,
  };
}

function sanitizeWrongItem(raw: unknown): WrongItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== 'string' || typeof o.questionId !== 'string') return null;
  return {
    id: o.id,
    questionId: o.questionId,
    userAnswer: typeof o.userAnswer === 'string' ? o.userAnswer : '',
    correctAnswer: typeof o.correctAnswer === 'string' ? o.correctAnswer : '',
    date: typeof o.date === 'string' ? o.date : '',
  };
}

/** 校验「每日一卷」持久化数据，过滤损坏条目。 */
function sanitizePapers(raw: unknown): Record<string, PaperRecord> {
  const out: Record<string, PaperRecord> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [date, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== 'object') continue;
    const o = v as Record<string, unknown>;
    if (typeof o.wrong !== 'number' || typeof o.total !== 'number') continue;
    out[date] = {
      date: typeof o.date === 'string' ? o.date : date,
      wrong: Math.max(0, Math.round(o.wrong)),
      total: Math.max(1, Math.round(o.total)),
      correct: typeof o.correct === 'number' ? Math.max(0, Math.round(o.correct)) : Math.max(0, Math.round(o.total) - Math.max(0, Math.round(o.wrong))),
    };
  }
  return out;
}

/** 校验持久化的教材数据；非法 / 损坏时返回 null。 */
function sanitizeTextbook(raw: unknown): Textbook | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.content !== 'string' || !o.content.trim()) return null;
  return {
    title: typeof o.title === 'string' ? o.title : '导入教材',
    content: o.content,
    notes: Array.isArray(o.notes) ? o.notes.filter((n): n is string => typeof n === 'string') : [],
    chars: typeof o.chars === 'number' ? Math.max(0, Math.round(o.chars)) : o.content.length,
  };
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

export const useEducationStore = create<EducationState>((set, get) => ({
  days: {},
  attempts: {},
  wrongBook: [],
  papers: {},
  paperCount: 0,
  startedAt: todayKey(),
  recoveries: 0,
  stage: 'primary',
  onboarded: false,
  linkedTools: 0,
  customQuestions: [],
  textbook: null,

  setStage: (stage) => {
    set({ stage });
    get().saveToStorage();
  },

  completeOnboarding: (stage) => {
    set({ stage, onboarded: true });
    get().saveToStorage();
  },

  recordToolUse: () => {
    set((s) => ({ linkedTools: s.linkedTools + 1 }));
    get().saveToStorage();
  },

  submitDaily: (question, userAnswer, correct) => {
    const date = todayKey();
    set((s) => {
      const day = s.days[date] ?? { date, count: 0 };
      const nextDay: DayRecord = {
        ...day,
        date,
        count: day.count + 1,
        solved: correct ? true : day.solved,
        questionId: question.id,
        hour: new Date().getHours(),
      };
      const attempt: DailyAttempt = {
        date,
        questionId: question.id,
        solved: correct,
        attempts: (s.attempts[date]?.attempts ?? 0) + 1,
        lastAnswer: userAnswer,
      };
      const nextAttempts = { ...s.attempts, [date]: attempt };
      let nextWrong = s.wrongBook;
      if (!correct) {
        const item: WrongItem = {
          id: `wrong-${date}-${Date.now()}`,
          questionId: question.id,
          userAnswer,
          correctAnswer: question.answerLatex ?? String(question.answer ?? ''),
          date,
        };
        nextWrong = [item, ...s.wrongBook].slice(0, 200);
      }
      return {
        days: { ...s.days, [date]: nextDay },
        attempts: nextAttempts,
        wrongBook: nextWrong,
      };
    });
    get().saveToStorage();
    return correct;
  },

  submitPaper: (wrong, total) => {
    const date = todayKey();
    const correct = Math.max(0, total - wrong);
    set((s) => {
      const existed = !!s.papers[date];
      const papers = { ...s.papers, [date]: { date, wrong, total, correct } };
      return {
        papers,
        paperCount: existed ? s.paperCount : s.paperCount + 1,
      };
    });
    get().saveToStorage();
  },

  recordPractice: (date) => {
    const d = date ?? todayKey();
    set((s) => {
      const day = s.days[d] ?? { date: d, count: 0 };
      return {
        days: { ...s.days, [d]: { ...day, date: d, count: day.count + 1 } },
      };
    });
    get().saveToStorage();
  },

  removeWrongItem: (id) => {
    // 移除错题视为「已找回 / 复盘完成」：累计韧性计数（不重复计数已删除项）。
    const existed = get().wrongBook.some((w) => w.id === id);
    set((s) => ({
      wrongBook: s.wrongBook.filter((w) => w.id !== id),
      recoveries: existed ? s.recoveries + 1 : s.recoveries,
    }));
    get().saveToStorage();
  },

  clearWrongBook: () => {
    set({ wrongBook: [] });
    get().saveToStorage();
  },

  importQuestions: (items) => {
    const existing = get().customQuestions;
    const seen = new Set(existing.map((q) => q.id));
    const added: Question[] = [];
    let skipped = 0;
    for (const item of items) {
      if (!isQuestion(item)) {
        skipped++;
        continue;
      }
      const q = sanitizeQuestion(item);
      if (seen.has(q.id)) {
        skipped++;
        continue;
      }
      seen.add(q.id);
      added.push(q);
    }
    if (added.length > 0) {
      set((s) => ({ customQuestions: [...s.customQuestions, ...added] }));
      get().saveToStorage();
    }
    return { added: added.length, skipped, questions: added };
  },

  removeCustomQuestion: (id) => {
    set((s) => ({ customQuestions: s.customQuestions.filter((q) => q.id !== id) }));
    get().saveToStorage();
  },

  clearCustomQuestions: () => {
    set({ customQuestions: [] });
    get().saveToStorage();
  },

  setTextbook: (t) => {
    set({ textbook: t });
    get().saveToStorage();
  },

  resetAll: () => {
    // 清空学习「数据」（打卡 / 进度 / 成就 / 错题 / 自定义题库），
    // 但保留已选学段与引导完成状态，避免每次清空都要重选学段。
    const stage = get().stage;
    const onboarded = get().onboarded;
    set({
      days: {},
      attempts: {},
      wrongBook: [],
      papers: {},
      paperCount: 0,
      startedAt: todayKey(),
      recoveries: 0,
      stage,
      onboarded,
      linkedTools: 0,
      customQuestions: [],
      textbook: null,
    });
    get().saveToStorage();
  },

  saveToStorage: () => {
    if (typeof window === 'undefined') return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const s = get();
      try {
        localStorage.setItem(
          EDUCATION_STORAGE_KEY,
          JSON.stringify({
            days: s.days,
            attempts: s.attempts,
            wrongBook: s.wrongBook,
            papers: s.papers,
            paperCount: s.paperCount,
            startedAt: s.startedAt,
            recoveries: s.recoveries,
            stage: s.stage,
            onboarded: s.onboarded,
            linkedTools: s.linkedTools,
            customQuestions: s.customQuestions,
            textbook: s.textbook,
          }),
        );
      } catch {
        // ignore quota errors
      }
    }, 300);
  },

  loadFromStorage: () => {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(EDUCATION_STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw) as Record<string, unknown>;
      const days: Record<string, DayRecord> = {};
      if (data.days && typeof data.days === 'object') {
        for (const [date, v] of Object.entries(data.days as Record<string, unknown>)) {
          const d = sanitizeDay(v);
          if (d) days[date] = d;
        }
      }
      // 白名单校验错题本的题目 id，过滤掉已下线 / 损坏的条目。
      const wrongBook: WrongItem[] = [];
      if (Array.isArray(data.wrongBook)) {
        for (const item of data.wrongBook) {
          const w = sanitizeWrongItem(item);
          if (w && getQuestion(w.questionId)) wrongBook.push(w);
        }
      }
      // 恢复自定义题库：逐条校验 + 归一化 + 去重。
      const customQuestions: Question[] = [];
      if (Array.isArray(data.customQuestions)) {
        const seen = new Set<string>();
        for (const item of data.customQuestions) {
          if (isQuestion(item)) {
            const q = sanitizeQuestion(item);
            if (!seen.has(q.id)) {
              seen.add(q.id);
              customQuestions.push(q);
            }
          }
        }
      }
      set({
        days,
        wrongBook,
        startedAt: typeof data.startedAt === 'string' ? data.startedAt : todayKey(),
        papers: sanitizePapers(data.papers),
        paperCount:
          typeof data.paperCount === 'number' && Number.isFinite(data.paperCount)
            ? Math.max(0, Math.round(data.paperCount))
            : 0,
        recoveries:
          typeof data.recoveries === 'number' && Number.isFinite(data.recoveries)
            ? Math.max(0, Math.round(data.recoveries))
            : 0,
        stage:
          typeof data.stage === 'string' && STAGES.includes(data.stage as QuestionStage)
            ? (data.stage as QuestionStage)
            : 'primary',
        onboarded: typeof data.onboarded === 'boolean' ? data.onboarded : false,
        linkedTools:
          typeof data.linkedTools === 'number' && Number.isFinite(data.linkedTools)
            ? Math.max(0, Math.round(data.linkedTools))
            : 0,
        customQuestions,
        textbook: sanitizeTextbook(data.textbook),
      });
    } catch {
      // ignore parse errors
    }
  },
}));

/** 暴露到 window 供 Playwright / 截图脚本调用（与 workbench store 一致）。 */
if (typeof window !== 'undefined') {
  (window as unknown as { __EDU_STORE__?: typeof useEducationStore }).__EDU_STORE__ = useEducationStore;
}

/** 从错题本中按 questionId 取题目对象。 */
export function questionFromWrongItem(id: string): Question | undefined {
  return getQuestion(id);
}

/**
 * 从内置题库或自定义题库中按 id 取题。
 * 用于错题本等场景渲染「用户导入的自定义题目」。
 */
export function getQuestionAny(
  id: string,
  customQuestions: Question[] = useEducationStore.getState().customQuestions,
): Question | undefined {
  return getQuestion(id) ?? customQuestions.find((q) => q.id === id);
}

/** 供贡献表使用：按日期取过去 n 天（含今天）每天的活动量数组。 */
export function lastNDays(days: Record<string, DayRecord>, n: number, now = new Date()): { date: string; count: number; solved: boolean }[] {
  const out: { date: string; count: number; solved: boolean }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = todayKey(d);
    const rec = days[key];
    out.push({
      date: key,
      count: rec?.count ?? 0,
      solved: rec?.solved ?? false,
    });
  }
  return out;
}

/** 供选题：返回最近已答对且不重复的题目 id（避免近期重复）。 */
export function recentlySolvedIds(days: Record<string, DayRecord>): string[] {
  const ids: string[] = [];
  for (const d of Object.values(days)) {
    if (d.solved && d.questionId && !ids.includes(d.questionId)) {
      ids.push(d.questionId);
    }
  }
  return ids.slice(0, 30);
}

export { filterValidQuestions };
