import { describe, it, expect, vi } from 'vitest';
import { StreamLanguage } from '@codemirror/language';
import { math, KEYWORDS, FUNCTIONS } from './mathLanguage';

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

  describe('函数标记（防 CodeMirror "Modifier function used at start of tag" 警告）', () => {
    // `function` 在 @lezer/highlight 中是修饰符（modifier）而非独立标签。
    // 单独返回 'function' 会让 StreamLanguage 解析器告警；应返回
    // 'variableName.function'（用点把修饰符应用到基础标签上）。
    const lang = StreamLanguage.define(math);

    it('解析包含函数的代码时不抛错，能构建语法树', () => {
      const tree = lang.parser.parse('y = sin(x) + cos(x)\n');
      expect(tree.length).toBeGreaterThan(0);
    });

    it('解析包含函数的代码时不再触发 "Modifier function used at start of tag" 警告', () => {
      const warns: string[] = [];
      const spy = vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
        warns.push(args.map(String).join(' '));
      });
      try {
        // 触发 StreamLanguage 解析（含多个函数名），复现旧版告警路径。
        lang.parser.parse('det(A) + inv(B) * sin(x)\n');
        lang.parser.parse('y = cos(t)\n');
      } finally {
        spy.mockRestore();
      }
      const bad = warns.filter((w) => w.includes('Modifier') || w.includes('used at start of tag'));
      expect(bad).toEqual([]);
    });
  });
});
