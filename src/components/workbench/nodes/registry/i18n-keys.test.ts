/**
 * i18n 完整性 — 节点 labelKey 在 zh-CN / en 字典中的存在性校验。
 *
 * 直接导入 i18n 模块导出的两个字典对象（zhCN / en），遍历 NODE_TYPES
 * 每个节点的 labelKey（以及全部输入/输出端口的 labelKey），逐个断言
 * 键在两个字典中均有定义。
 *
 * 与 i18n-coverage.test.ts（经 t()/setLocale 行为探测）互补：
 * 本文件直接断言字典对象本身的键存在性。
 */

import { describe, it, expect } from 'vitest';
import { zhCN, en, type TranslationDict } from '@/lib/i18n';
import { NODE_TYPES } from '../pipelineEngine';

/** 收集全部节点标题 labelKey + 端口 labelKey（owner 用于失败定位）。 */
function collectKeys(): Array<{ owner: string; key: string }> {
  const refs: Array<{ owner: string; key: string }> = [];
  for (const def of Object.values(NODE_TYPES)) {
    refs.push({ owner: `node:${def.type}`, key: def.labelKey });
    for (const port of def.inputs) {
      refs.push({ owner: `port:${def.type}.inputs.${port.id}`, key: port.labelKey });
    }
    for (const port of def.outputs) {
      refs.push({ owner: `port:${def.type}.outputs.${port.id}`, key: port.labelKey });
    }
  }
  return refs;
}

const KEY_REFS = collectKeys();

/** Lookup a key in a dictionary via direct or nested dot-path, returning the string value or undefined. */
function dictLookup(dict: TranslationDict, key: string): string | undefined {
  // Direct lookup for flat keys
  const direct = (dict as unknown as Record<string, unknown>)[key];
  if (typeof direct === 'string') return direct;
  if (!key.includes('.')) return typeof direct === 'string' ? direct : undefined;
  // Path-based lookup for nested keys
  const parts = key.split('.');
  let cur: unknown = dict;
  for (const p of parts) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return typeof cur === 'string' ? cur : undefined;
}

describe('i18n 完整性 — 节点 labelKey 字典键存在性', () => {
  it('NODE_TYPES 非空且收集到 labelKey', () => {
    expect(Object.keys(NODE_TYPES).length).toBeGreaterThan(0);
    expect(KEY_REFS.length).toBeGreaterThan(0);
  });

  it('每个节点 labelKey 在 zh-CN 字典中已定义', () => {
    for (const def of Object.values(NODE_TYPES)) {
      expect(
        dictLookup(zhCN, def.labelKey),
        `zh-CN 缺失: node:${def.type} -> ${String(def.labelKey)}`,
      ).toBeDefined();
    }
  });

  it('每个节点 labelKey 在 en 字典中已定义', () => {
    for (const def of Object.values(NODE_TYPES)) {
      expect(
        dictLookup(en, def.labelKey),
        `en 缺失: node:${def.type} -> ${String(def.labelKey)}`,
      ).toBeDefined();
    }
  });

  it('每个端口 labelKey 在 zh-CN 与 en 字典中均已定义', () => {
    const missing: string[] = [];
    for (const { owner, key } of KEY_REFS) {
      if (dictLookup(zhCN, key) === undefined) missing.push(`zh-CN 缺失: ${owner} -> ${String(key)}`);
      if (dictLookup(en, key) === undefined) missing.push(`en 缺失: ${owner} -> ${String(key)}`);
    }
    expect(missing).toEqual([]);
  });

  it('两个字典对同一 labelKey 的翻译值均非空字符串', () => {
    const uniqueKeys = [...new Set(KEY_REFS.map((r) => r.key))];
    for (const key of uniqueKeys) {
      const zhVal = dictLookup(zhCN, key);
      const enVal = dictLookup(en, key);
      expect(
        zhVal?.trim().length ?? 0,
        `zh-CN 为空: ${String(key)}`,
      ).toBeGreaterThan(0);
      expect(
        enVal?.trim().length ?? 0,
        `en 为空: ${String(key)}`,
      ).toBeGreaterThan(0);
    }
  });
});
