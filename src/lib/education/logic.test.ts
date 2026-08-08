import { describe, it, expect } from 'vitest';
import {
  todayKey,
  unlockLevel,
  pickDailyQuestion,
  pickDailyQuestionFromPool,
  checkAnswer,
} from './logic';
import {
  getQuestion,
  questionsByLevel,
  VALID_QUESTION_IDS,
  type Question,
  type QuestionLevel,
} from './content';

describe('education · logic', () => {
  describe('题库完整性', () => {
    it('四个难度各有题目', () => {
      expect(questionsByLevel(1).length).toBeGreaterThan(0);
      expect(questionsByLevel(2).length).toBeGreaterThan(0);
      expect(questionsByLevel(3).length).toBeGreaterThan(0);
      expect(questionsByLevel(4).length).toBeGreaterThan(0);
    });

    it('题目 id 唯一且与白名单一致', () => {
      const ids = questionsByLevel(1)
        .concat(questionsByLevel(2), questionsByLevel(3), questionsByLevel(4))
        .map((q) => q.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(VALID_QUESTION_IDS.sort()).toEqual([...ids].sort());
    });

    it('每道题都有讲解步骤', () => {
      const levels: QuestionLevel[] = [1, 2, 3, 4];
      for (const level of levels) {
        for (const q of questionsByLevel(level)) {
          expect(q.solution.length).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('难度解锁', () => {
    it('未满 3 天为 1 星', () => {
      expect(unlockLevel(0)).toBe(1);
      expect(unlockLevel(2)).toBe(1);
    });
    it('满 3 天解锁 2 星', () => {
      expect(unlockLevel(3)).toBe(2);
      expect(unlockLevel(6)).toBe(2);
    });
    it('满 7 天解锁 3 星', () => {
      expect(unlockLevel(7)).toBe(3);
    });
  });

  describe('每日选题', () => {
    it('同一天内稳定选同一题', () => {
      const a = pickDailyQuestion('2026-01-01', 1);
      const b = pickDailyQuestion('2026-01-01', 1);
      expect(a.id).toBe(b.id);
    });

    it('不同日期通常选中不同题目', () => {
      const ids = new Set<string>();
      for (let day = 1; day <= 15; day++) {
        const key = `2026-02-${String(day).padStart(2, '0')}`;
        ids.add(pickDailyQuestion(key, 1).id);
      }
      // 15 天至少覆盖 2 道不同题（大概率远多于 2）。
      expect(ids.size).toBeGreaterThan(1);
    });

    it('返回的题目属于指定难度池（按学段筛选）', () => {
      const q = pickDailyQuestion('2026-01-01', 2, [], 'middle');
      expect(questionsByLevel(2).map((x) => x.id)).toContain(q.id);
    });

    it('按学段出题：primary 阶段只会出小学题', () => {
      const ids = new Set<string>();
      for (let day = 1; day <= 30; day++) {
        const key = `2026-03-${String(day).padStart(2, '0')}`;
        ids.add(pickDailyQuestion(key, 1, [], 'primary').id);
      }
      // primary 学段全部题目难度为 1 星。
      for (const id of ids) {
        expect(getQuestion(id)?.level).toBe(1);
      }
    });

    it('university 学段能出高等题（即使当前难度为 1 星也会回退到大学池）', () => {
      const q = pickDailyQuestion('2026-01-01', 1, [], 'university');
      // university 池内均为 level 3 的高等题。
      expect(questionsByLevel(3).map((x) => x.id)).toContain(q.id);
    });

    it('自定义题库会进入选题池（extraPool）', () => {
      const custom: Question = {
        id: 'custom-x',
        level: 1,
        stage: 'primary',
        topic: '自定义',
        text: '1+1=？',
        encouragement: '加油',
        kind: 'numeric',
        answer: 2,
        solution: ['1+1=2'],
      };
      // 排除全部内置小学题，只剩自定义题 → 必然选中它，证明 extraPool 已进入选题池。
      const builtins = questionsByLevel(1).map((q) => q.id);
      const q = pickDailyQuestion('2026-01-01', 1, builtins, 'primary', [custom]);
      expect(q.id).toBe('custom-x');
    });

    it('自定义题库按学段过滤：大学自定义题不会在小学阶段选中', () => {
      const uniCustom: Question = {
        id: 'custom-uni',
        level: 3,
        stage: 'university',
        topic: '自定义高等题',
        text: '求矩阵行列式',
        encouragement: '加油',
        kind: 'numeric',
        answer: 1,
        solution: ['1'],
      };
      const q = pickDailyQuestion('2026-01-01', 1, [], 'primary', [uniCustom]);
      // primary 池内全是内置小学题，不会选中大学自定义题。
      expect(q.id).not.toBe('custom-uni');
    });

    it('pickDailyQuestionFromPool 从自定义池中确定性选题', () => {
      const pool: Question[] = [
        { id: 'a', level: 1, topic: 't', text: 'A', encouragement: 'e', kind: 'numeric', answer: 1, solution: ['1'] },
        { id: 'b', level: 1, topic: 't', text: 'B', encouragement: 'e', kind: 'numeric', answer: 2, solution: ['2'] },
      ];
      expect(pickDailyQuestionFromPool('2026-05-01', pool).id).toBe(
        pickDailyQuestionFromPool('2026-05-01', pool).id,
      );
      // 池内有题则必返回其一
      expect(['a', 'b']).toContain(pickDailyQuestionFromPool('2026-05-01', pool).id);
    });
  });

  describe('答题判定', () => {
    it('numeric 正确判定', () => {
      const q = getQuestion('l1-01'); // 答案 11
      expect(q).toBeDefined();
      const v = checkAnswer(q!, '11');
      expect(v.correct).toBe(true);
    });

    it('numeric 容差与分数', () => {
      const q = getQuestion('l1-04'); // 答案 5/8
      expect(q).toBeDefined();
      expect(checkAnswer(q!, '0.625').correct).toBe(true);
      expect(checkAnswer(q!, '5/8').correct).toBe(true);
      expect(checkAnswer(q!, '0.6').correct).toBe(false);
    });

    it('expression 采样点比较', () => {
      const q = getQuestion('l3-02'); // 答案 3*x^2
      expect(q).toBeDefined();
      expect(checkAnswer(q!, '3*x^2').correct).toBe(true);
      expect(checkAnswer(q!, '3x^2').correct).toBe(true);
      expect(checkAnswer(q!, 'x^3').correct).toBe(false);
    });

    it('choice 比对下标', () => {
      const q = getQuestion('l1-09'); // 最小质数，答案下标 1（选「2」）
      expect(q).toBeDefined();
      expect(checkAnswer(q!, '', 1).correct).toBe(true);
      expect(checkAnswer(q!, '', 0).correct).toBe(false);
    });

    it('无效数值输入不崩溃且判错', () => {
      const q = getQuestion('l1-01');
      expect(q).toBeDefined();
      const v = checkAnswer(q!, 'abc');
      expect(v.correct).toBe(false);
      expect(v.displayAnswer.length).toBeGreaterThan(0);
    });
  });

  describe('日期工具', () => {
    it('生成 YYYY-MM-DD', () => {
      const d = new Date(2026, 0, 15); // 2026-01-15
      expect(todayKey(d)).toBe('2026-01-15');
    });
  });
});
