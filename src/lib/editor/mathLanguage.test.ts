import { describe, it, expect } from 'vitest';
import { KEYWORDS } from './mathLanguage';

describe('mathLanguage', () => {
  describe('KEYWORDS', () => {
    it('包含新增的 MATLAB 关键字：elseif, switch, case, otherwise, try, catch, global, persistent', () => {
      const expectedNewKeywords = ['elseif', 'switch', 'case', 'otherwise', 'try', 'catch', 'global', 'persistent'];
      for (const kw of expectedNewKeywords) {
        expect(KEYWORDS).toContain(kw);
      }
    });

    it('包含原有核心关键字：function, if, elseif, end 至少 4 个', () => {
      const requiredKeywords = ['function', 'if', 'elseif', 'end'];
      const present = requiredKeywords.filter((kw) => KEYWORDS.includes(kw));
      expect(present.length).toBeGreaterThanOrEqual(4);
      expect(KEYWORDS).toContain('function');
      expect(KEYWORDS).toContain('if');
      expect(KEYWORDS).toContain('elseif');
      expect(KEYWORDS).toContain('end');
    });

    it('KEYWORDS 数组无重复项', () => {
      const unique = new Set(KEYWORDS);
      expect(unique.size).toBe(KEYWORDS.length);
    });
  });
});
