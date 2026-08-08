import { describe, it, expect, beforeEach } from 'vitest';
import {
  computeStreak,
  computeBestStreak,
  computeStats,
  BADGES,
  useEducationStore,
} from './educationStore';
import { todayKey, unlockLevel } from '@/lib/education/logic';
import type { DayRecord, WrongItem } from './educationStore';

/** 构造某一天的记录。 */
function day(date: string, count = 1, solved?: boolean, questionId?: string): DayRecord {
  return { date, count, solved, questionId };
}

function daysFrom(entries: Array<[string, DayRecord]>): Record<string, DayRecord> {
  return Object.fromEntries(entries);
}

describe('education · store 统计', () => {
  describe('computeStreak', () => {
    const now = new Date(2026, 2, 10); // 2026-03-10

    it('空数据连续为 0', () => {
      expect(computeStreak({}, now)).toBe(0);
    });

    it('今天活动算 1 天', () => {
      const d = daysFrom([['2026-03-10', day('2026-03-10')]]);
      expect(computeStreak(d, now)).toBe(1);
    });

    it('连续三天', () => {
      const d = daysFrom([
        ['2026-03-10', day('2026-03-10')],
        ['2026-03-09', day('2026-03-09')],
        ['2026-03-08', day('2026-03-08')],
      ]);
      expect(computeStreak(d, now)).toBe(3);
    });

    it('今天未活动但昨天打了卡，仍算连续（GitHub 风格）', () => {
      const d = daysFrom([
        ['2026-03-09', day('2026-03-09')],
        ['2026-03-08', day('2026-03-08')],
      ]);
      expect(computeStreak(d, now)).toBe(2);
    });

    it('中间断开则重新计数', () => {
      const d = daysFrom([
        ['2026-03-10', day('2026-03-10')],
        ['2026-03-08', day('2026-03-08')],
        ['2026-03-07', day('2026-03-07')],
      ]);
      expect(computeStreak(d, now)).toBe(1);
    });
  });

  describe('computeBestStreak', () => {
    it('返回历史最长连续', () => {
      const d = daysFrom([
        ['2026-03-01', day('2026-03-01')],
        ['2026-03-02', day('2026-03-02')],
        ['2026-03-03', day('2026-03-03')],
        ['2026-03-10', day('2026-03-10')],
        ['2026-03-11', day('2026-03-11')],
      ]);
      expect(computeBestStreak(d)).toBe(3);
    });
  });

  describe('computeStats + 徽章判据', () => {
    it('统计汇总正确', () => {
      const d = daysFrom([
        ['2026-03-09', day('2026-03-09', 2, true, 'l1-01')],
        ['2026-03-10', day('2026-03-10', 1, false, 'l1-02')],
      ]);
      const wrong: WrongItem[] = [
        { id: 'w1', questionId: 'l1-02', userAnswer: 'x', correctAnswer: 'y', date: '2026-03-10' },
      ];
      const s = computeStats(d, wrong, 1, 0, {}, new Date(2026, 2, 10));
      expect(s.streak).toBe(2);
      expect(s.bestStreak).toBe(2);
      expect(s.totalSolved).toBe(1);
      expect(s.totalActivities).toBe(3);
      expect(s.totalDays).toBe(2);
      expect(s.wrongCount).toBe(1);
      expect(s.recoveries).toBe(1);
      expect(s.level).toBe(unlockLevel(s.streak));
    });

    it('越挫越勇徽章：recoveries>=1 才解锁', () => {
      const resilient = BADGES.find((b) => b.id === 'resilient');
      expect(resilient).toBeDefined();
      const s = computeStats({}, [], 0, 0, {}, new Date(2026, 2, 10));
      expect(resilient!.unlocked(s)).toBe(false);
      expect(resilient!.unlocked({ ...s, recoveries: 1 })).toBe(true);
    });
  });
});

describe('education · 日期与解锁联动', () => {
  it('todayKey 与解锁阈值逻辑一致', () => {
    expect(todayKey(new Date(2026, 11, 31))).toBe('2026-12-31');
    expect(unlockLevel(6)).toBe(2);
    expect(unlockLevel(7)).toBe(3);
  });
});

describe('education · 自定义题目导入', () => {
  beforeEach(() => {
    useEducationStore.getState().resetAll();
  });

  const validQuestion = {
    id: 'my-01',
    level: 2,
    stage: 'middle',
    topic: '测试题',
    text: '求 6 × 7。',
    encouragement: '加油',
    kind: 'numeric',
    answer: 42,
    answerLatex: '42',
    solution: ['6×7=42'],
  };

  it('导入合法题目：新增计数正确，并写入题库', () => {
    const res = useEducationStore.getState().importQuestions([validQuestion]);
    expect(res.added).toBe(1);
    expect(res.skipped).toBe(0);
    expect(useEducationStore.getState().customQuestions).toHaveLength(1);
  });

  it('跳过格式不合法的对象', () => {
    const bad = { id: 'x', level: 99, text: '', kind: 'weird', solution: [] };
    const res = useEducationStore.getState().importQuestions([bad]);
    expect(res.added).toBe(0);
    expect(res.skipped).toBe(1);
    expect(useEducationStore.getState().customQuestions).toHaveLength(0);
  });

  it('重复 id 会被去重跳过', () => {
    const store = useEducationStore.getState();
    store.importQuestions([validQuestion]);
    const res = store.importQuestions([validQuestion]);
    expect(res.added).toBe(0);
    expect(res.skipped).toBe(1);
    expect(useEducationStore.getState().customQuestions).toHaveLength(1);
  });

  it('可删除自定义题目', () => {
    useEducationStore.getState().importQuestions([validQuestion]);
    useEducationStore.getState().removeCustomQuestion('my-01');
    expect(useEducationStore.getState().customQuestions).toHaveLength(0);
  });

  it('清空自定义题目', () => {
    useEducationStore.getState().importQuestions([validQuestion]);
    useEducationStore.getState().clearCustomQuestions();
    expect(useEducationStore.getState().customQuestions).toHaveLength(0);
  });
});

describe('education · 教材导入（textbook）', () => {
  beforeEach(() => {
    useEducationStore.getState().resetAll();
  });

  const tb = {
    title: '初中代数',
    content: '一元一次方程是指含有一个未知数、未知数的次数为 1 的方程……',
    notes: ['一元一次方程的定义', '移项要变号', '系数化为 1'],
    chars: 320,
  };

  it('setTextbook 保存教材并写入状态', () => {
    useEducationStore.getState().setTextbook(tb);
    const s = useEducationStore.getState();
    expect(s.textbook).toEqual(tb);
    expect(s.textbook?.notes).toHaveLength(3);
  });

  it('setTextbook(null) 清空教材', () => {
    useEducationStore.getState().setTextbook(tb);
    useEducationStore.getState().setTextbook(null);
    expect(useEducationStore.getState().textbook).toBeNull();
  });

  it('resetAll 会清空教材，但保留学段与引导状态', () => {
    useEducationStore.setState({ stage: 'high', onboarded: true });
    useEducationStore.getState().setTextbook(tb);
    useEducationStore.getState().resetAll();
    const s = useEducationStore.getState();
    expect(s.textbook).toBeNull();
    expect(s.stage).toBe('high');
    expect(s.onboarded).toBe(true);
  });
});

