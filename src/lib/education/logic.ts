/**
 * OmniMath Pro — 教育模块 · 选题与答题判定
 *
 * 纯函数集合（无 React / 无 DOM），可离线、可测试。
 *  - 每日一题：以「日期字符串」为种子做确定性选题 → 同一天内稳定、跨天变化。
 *  - 难度解锁：根据连续打卡天数 + 累计答对，渐进解锁（先易后难，避免挫败）。
 *  - 答题判定：numeric 用容差比较；expression 在采样点数值比较；choice 比对下标。
 */

import { math } from '@/lib/engine/mathInstance';
import {
  getQuestion,
  questionsByLevel,
  questionsByStage,
  questionsByStageLevel,
  stageOf,
  type Question,
  type QuestionLevel,
  type QuestionStage,
} from './content';

/** 容差（相对 + 绝对），用于数值比较。 */
const REL_TOL = 1e-6;
const ABS_TOL = 1e-6;

/** 返回本地日期字符串 YYYY-MM-DD（避免时区偏移误差）。 */
export function todayKey(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * 由字符串生成 32 位种子（xorshift 风格）。
 * 用于把「日期字符串」变成稳定的伪随机种子。
 */
function hashSeed(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32 伪随机数生成器（0 ≤ x < 1）。 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 难度解锁策略：
 *  - 从未开始（或仅开始一两天）：1 星热身，先建立「我能做对」的正反馈。
 *  - 连续 ≥ 3 天：解锁 2 星探索。
 *  - 连续 ≥ 7 天：解锁 3 星进阶。
 *  - 连续 ≥ 14 天：解锁 4 星挑战（思维 / 奥数 / 综合题）。
 */
export function unlockLevel(streak: number): QuestionLevel {
  if (streak >= 14) return 4;
  if (streak >= 7) return 3;
  if (streak >= 3) return 2;
  return 1;
}

/**
 * 为指定日期确定性选取「今日一题」。
 *  - 先按「学段 + 已解锁难度」取题池，并避免近期已做过且答对的题（excludeIds）。
 *  - 若该组合池为空（例如所选学段在当前难度没有题），逐级回退到「该学段整池」，
 *    再回退到「全部题库」，保证任何学段每天都能拿到题。
 */
export function pickDailyQuestion(
  dateKey: string,
  level: QuestionLevel,
  excludeIds: string[] = [],
  stage: QuestionStage = 'primary',
  extraPool: Question[] = [],
): Question {
  const stagePool = [...questionsByStage(stage), ...extraPool.filter((q) => stageOf(q) === stage)];
  // 「每日一题」只用于快速热身：排除解答题（kind='problem'）。
  // 解答题带分步评分（parts），应走「每日一卷」的解答题区，而不是单题填空式作答。
  const dailyPool = stagePool.filter((q) => q.kind !== 'problem');
  const levelPool = dailyPool.filter((q) => q.level === level && !excludeIds.includes(q.id));
  const stagePoolUnseen = dailyPool.filter((q) => !excludeIds.includes(q.id));
  const candidates =
    levelPool.length > 0
      ? levelPool
      : stagePoolUnseen.length > 0
        ? stagePoolUnseen
        : stagePool;
  return pickDailyQuestionFromPool(dateKey, candidates);
}

/**
 * 在给定候选池中按日期确定性选一题。供「导入题库」等自定义池使用；
 * 纯函数，可离线测试。调用方负责传入符合学段/难度的候选集。
 */
export function pickDailyQuestionFromPool(
  dateKey: string,
  candidates: Question[],
): Question {
  const rnd = mulberry32(hashSeed(dateKey));
  const idx = Math.floor(rnd() * candidates.length);
  return candidates[idx] ?? candidates[0];
}

/* ═══════════════════ 答题判定 ═══════════════════ */

export interface AnswerVerdict {
  correct: boolean;
  /** 展示给用户的规范答案（LaTeX 优先）。 */
  displayAnswer: string;
  /** 面向心态的反馈语（正确 / 错误都不指责）。 */
  feedback: string;
}

/** 数值是否在容差内相等。 */
function nearlyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) <= ABS_TOL + REL_TOL * Math.max(Math.abs(a), Math.abs(b));
}

/**
 * 把用户输入解析为数值。失败返回 null。
 * 支持分数（如 5/8）、小数、含 pi/e 的表达式（如 2*pi）。
 */
function parseNumeric(input: string): number | null {
  const t = input.trim();
  if (!t) return null;
  try {
    const val = math.evaluate(t) as unknown;
    return typeof val === 'number' && Number.isFinite(val) ? val : null;
  } catch {
    return null;
  }
}

/** 在若干采样点比较两个单变量表达式（变量取 x）。 */
function compareExpressions(userExpr: string, answerExpr: string): boolean {
  const points = [-2, -0.5, 0.5, 2, 5];
  for (const x of points) {
    try {
      const u = math.evaluate(userExpr, { x }) as unknown;
      const a = math.evaluate(answerExpr, { x }) as unknown;
      if (typeof u !== 'number' || typeof a !== 'number' || !Number.isFinite(u) || !Number.isFinite(a)) {
        return false;
      }
      if (!nearlyEqual(u, a)) return false;
    } catch {
      return false;
    }
  }
  return true;
}

/**
 * 校验用户的作答。
 *  - numeric：把用户输入解析为数值后与答案比较。
 *  - expression：在采样点比较用户表达式与答案表达式。
 *  - choice：比较下标。
 */
export function checkAnswer(question: Question, userInput: string, choiceIndex?: number): AnswerVerdict {
  const fail = (displayAnswer: string, closeMsg: string): AnswerVerdict => ({
    correct: false,
    displayAnswer,
    feedback: closeMsg,
  });

  if (question.kind === 'choice') {
    const correct = choiceIndex === question.correctIndex;
    const display = question.answerLatex ?? '';
    return {
      correct,
      displayAnswer: display,
      feedback: correct
        ? '答对啦！你找到了正确的那个选项，真棒。'
        : '没关系，差一点点。再看一眼选项，你行的。',
    };
  }

  if (question.kind === 'numeric' || (question.kind === 'problem' && typeof question.answer === 'number')) {
    const expected = typeof question.answer === 'number' ? question.answer : NaN;
    const parsed = parseNumeric(userInput);
    if (parsed === null) {
      return fail(question.answerLatex ?? String(expected), '没看懂你的输入，再试一次，写一个数字。');
    }
    const correct = Number.isFinite(expected) && nearlyEqual(parsed, expected);
    return {
      correct,
      displayAnswer: question.answerLatex ?? String(expected),
      feedback: correct
        ? '答对啦！这一步走得漂亮，继续保持。'
        : '还差一点点，再看看提示，换个思路试试。',
    };
  }

  // expression（含 kind='problem' 且答案为字符串表达式的回退）
  const expected = typeof question.answer === 'string' ? question.answer : '';
  const correct = expected !== '' && compareExpressions(userInput.trim(), expected);
  return {
    correct,
    displayAnswer: question.answerLatex ?? expected,
    feedback: correct
      ? '答对啦！这个表达式写得很好。'
      : '还差一点点，检查一下系数和符号，再试一次。',
  };
}

/** 汇总某个难度池可选的题数（供 UI 展示解锁状态）。 */
export function poolSize(level: QuestionLevel): number {
  return questionsByLevel(level).length;
}

/** 供测试 / 工具使用：取题并断言存在。 */
export function resolveQuestion(id: string): Question | undefined {
  return getQuestion(id);
}

/* ═══════════════════ 每日一卷 ═══════════════════ */

export interface PaperSection {
  type: 'choice' | 'fill' | 'problem';
  title: string;
  questions: Question[];
}

export interface DailyPaper {
  dateKey: string;
  stage: QuestionStage;
  sections: PaperSection[];
}

/** 以种子做 Fisher–Yates 洗牌（纯函数，同种子结果稳定）。 */
function seededShuffle<T>(arr: T[], seed: number): T[] {
  const a = [...arr];
  const rnd = mulberry32(seed);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * 按学段确定性生成「每日一卷」：5 选择 + 3 填空 + 2 解答。
 *  - 选择 = kind 'choice'；填空 = kind 'numeric'；解答 = kind 'expression'
 *    （expression 不足时回退到带逐步讲解的 numeric）。
 *  - 各区先取本学段对应题型；不足时用本学段剩余题目补齐，保证每张卷都有题目。
 *  - 同一张卷内不重复；日期 + 学段作为种子，同一天稳定、跨天变化。
 */
export function buildDailyPaper(
  dateKey: string,
  stage: QuestionStage,
  excludeIds: string[] = [],
  extraPool: Question[] = [],
  counts: { choice: number; fill: number; problem: number } = { choice: 5, fill: 3, problem: 0 },
): DailyPaper {
  const stagePool = [...questionsByStage(stage), ...extraPool.filter((q) => stageOf(q) === stage)];
  const notExcluded = stagePool.filter((q) => !excludeIds.includes(q.id));
  // 「每日一卷」默认全部选填（选择 + 填空），不出解答题：
  // 解答题需分步自评判对错，用户写了正确答案却可能因没勾全步骤被判错，非常困惑。
  // 需要出解答题时，调用方显式传 counts.problem > 0 即可。
  const pool = counts.problem > 0 ? notExcluded : notExcluded.filter((q) => q.kind !== 'problem');
  const seed = hashSeed(`paper-${dateKey}-${stage}`);

  const choicePool = pool.filter((q) => q.kind === 'choice');
  const fillPool = pool.filter((q) => q.kind === 'numeric');
  // 解答题优先级：kind='problem'（带分步评分 parts）→ expression → numeric（仍可逐步讲解）。
  const problemPool = pool.filter((q) => q.kind === 'problem');
  const problemFallbackExpr = pool.filter((q) => q.kind === 'expression');
  const problemFallback = pool.filter((q) => q.kind === 'numeric');

  const choiceSel = seededShuffle(choicePool, seed).slice(0, counts.choice);
  const fillSel = seededShuffle(
    fillPool.filter((q) => !choiceSel.includes(q)),
    seed + 1,
  ).slice(0, counts.fill);
  const usedIds = new Set([...choiceSel, ...fillSel].map((q) => q.id));
  let problemSel = seededShuffle(
    problemPool.filter((q) => !usedIds.has(q.id)),
    seed + 2,
  ).slice(0, counts.problem);
  // problem 不足时，依次用 expression、numeric 补齐解答题。
  if (problemSel.length < counts.problem) {
    for (const q of problemSel) usedIds.add(q.id);
    const fromExpr = seededShuffle(
      problemFallbackExpr.filter((q) => !usedIds.has(q.id)),
      seed + 4,
    ).slice(0, counts.problem - problemSel.length);
    for (const q of fromExpr) usedIds.add(q.id);
    problemSel = [...problemSel, ...fromExpr];
  }
  if (problemSel.length < counts.problem) {
    const fromNum = seededShuffle(
      problemFallback.filter((q) => !usedIds.has(q.id)),
      seed + 5,
    ).slice(0, counts.problem - problemSel.length);
    problemSel = [...problemSel, ...fromNum];
  }

  // 仍不足时用本学段剩余题目保底，保证卷子完整。
  const usedAll = new Set([...choiceSel, ...fillSel, ...problemSel].map((q) => q.id));
  const remaining = seededShuffle(
    pool.filter((q) => !usedAll.has(q.id)),
    seed + 3,
  );
  let bi = 0;
  const take = (arr: Question[], target: number): Question[] => {
    const out = [...arr];
    while (out.length < target && bi < remaining.length) {
      out.push(remaining[bi++]);
    }
    return out;
  };
  const choiceFinal = take(choiceSel, counts.choice);
  const fillFinal = take(fillSel, counts.fill);
  const problemFinal = take(problemSel, counts.problem);

  return {
    dateKey,
    stage,
    sections: [
      { type: 'choice', title: '一、选择题（每题 4 分，共 20 分）', questions: choiceFinal },
      { type: 'fill', title: '二、填空题（每题 6 分，共 18 分）', questions: fillFinal },
      // 解答题默认为 0，不渲染空段落；仅在调用方显式启用时展示。
      ...(problemFinal.length > 0
        ? [{ type: 'problem' as const, title: '三、解答题（每题 10 分，共 20 分）', questions: problemFinal }]
        : []),
    ],
  };
}
