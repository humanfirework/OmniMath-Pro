import { describe, it, expect } from 'vitest';
import {
  extractSymbols,
  scanVariables,
  scanVariablesBatch,
  buildVariableUsageIndex,
} from './variableScanner';

describe('variableScanner', () => {
  describe('extractSymbols', () => {
    it('提取简单变量', () => {
      expect(extractSymbols('a + b')).toEqual(['a', 'b']);
    });

    it('不把内置函数当作变量', () => {
      // sin / cos 是 FunctionNode，不会被收集
      expect(extractSymbols('sin(x) + cos(y)')).toEqual(['x', 'y']);
    });

    it('默认剔除内置常量 pi/e', () => {
      expect(extractSymbols('sin(pi * x) + e^y')).toEqual(['x', 'y']);
    });

    it('保留内置常量当 filterBuiltins=false', () => {
      const syms = extractSymbols('pi + e', { filterBuiltins: false });
      expect(syms).toContain('pi');
      expect(syms).toContain('e');
    });

    it('去重', () => {
      expect(extractSymbols('a + a + a')).toEqual(['a']);
    });

    it('处理嵌套表达式（默认剔除内置常量 e）', () => {
      // e 是 mathjs 内置常量（自然对数底），默认被 filterBuiltins 剔除。
      // 若用户确实有名为 e 的变量，应通过 scanVariables + knownVars 路径
      // 消歧（见 scanVariables 测试组）。
      expect(extractSymbols('a*b + c*(d+e)')).toEqual(['a', 'b', 'c', 'd']);
    });

    it('语法错误返回空数组不抛异常', () => {
      expect(extractSymbols('a + * b')).toEqual([]);
    });

    it('空输入返回空', () => {
      expect(extractSymbols('')).toEqual([]);
      expect(extractSymbols(null as unknown as string)).toEqual([]);
    });

    it('函数名不被收集（无论内置还是用户定义）', () => {
      // f / g 是 FunctionNode 的 fn，按设计不被收集为变量。
      // 这是已知取舍：若用户定义了函数变量 f 并写 f(x)，f 不会出现在
      // 依赖列表中。实际场景中函数变量很少作为"被依赖的变量"出现，
      // 这个取舍可接受；未来如需支持，应在 walk 中对 fn.name 做额外判断。
      expect(extractSymbols('f(x) + g(y, z)')).toEqual(['x', 'y', 'z']);
    });
  });

  describe('scanVariables', () => {
    it('只返回已知变量中被引用的', () => {
      const known = ['a', 'b', 'c', 'd'];
      expect(scanVariables('a + c', known)).toEqual(['a', 'c']);
    });

    it('未知符号被忽略', () => {
      expect(scanVariables('a + unknown_var', ['a'])).toEqual(['a']);
    });

    it('空已知变量列表返回空', () => {
      expect(scanVariables('a + b', [])).toEqual([]);
    });
  });

  describe('scanVariablesBatch', () => {
    it('批量扫描多个表达式', () => {
      const entries = [
        { id: 'n1', expr: 'a + b' },
        { id: 'n2', expr: 'b * c' },
        { id: 'n3', expr: 'sin(x)' },
      ];
      const result = scanVariablesBatch(entries, ['a', 'b', 'c']);
      expect(result.get('n1')).toEqual(['a', 'b']);
      expect(result.get('n2')).toEqual(['b', 'c']);
      expect(result.get('n3')).toEqual([]);
    });
  });

  describe('buildVariableUsageIndex', () => {
    it('建立变量→引用者的反向索引', () => {
      const entries = [
        { id: 'n1', expr: 'a + b' },
        { id: 'n2', expr: 'b + c' },
        { id: 'n3', expr: 'a' },
      ];
      const index = buildVariableUsageIndex(entries, ['a', 'b', 'c', 'd']);
      expect(index.get('a')).toEqual(new Set(['n1', 'n3']));
      expect(index.get('b')).toEqual(new Set(['n1', 'n2']));
      expect(index.get('c')).toEqual(new Set(['n2']));
      expect(index.get('d')).toEqual(new Set());
    });
  });
});
