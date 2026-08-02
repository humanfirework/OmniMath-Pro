/**
 * i18n coverage — 蓝图节点 labelKey 字典完整性校验。
 *
 * 遍历 NODE_TYPES 全部节点定义（含节点标题与每个输入/输出端口的
 * labelKey），断言每个键在 zh-CN 与 en 两种语言下都能翻译出非空
 * 字符串。
 *
 * 实现说明：i18n 模块的字典对象（zhCN / en）是模块私有常量，未直接
 * 导出；这里通过公开的 `t()` + `setLocale()` 检测 —— `t()` 在键缺失
 * 时会回退返回键名本身（见 i18n/index.ts 的 fallback 逻辑），因此
 * 「返回值 === 键名」或「返回值为空白」即视为缺失。en 缺失时会回退到
 * zh-CN，该情形由 TranslationDict 接口的完整性（tsc 强制两个字典
 * 实现全量字段）兜底。
 */

import { describe, it, expect, afterAll } from 'vitest';
import {
  t,
  setLocale,
  DEFAULT_LOCALE,
  type Locale,
  type TranslationDict,
} from '@/lib/i18n';
import { NODE_TYPES } from '../pipelineEngine';

/** 一条待校验的 labelKey 记录：owner 用于失败时定位。 */
interface KeyRef {
  /** 形如 "node:negate" / "port:vec-rotate.inputs.angle" */
  owner: string;
  key: string;
}

/** 收集全部节点标题 labelKey + 所有端口 labelKey（去重前）。 */
function collectKeyRefs(): KeyRef[] {
  const refs: KeyRef[] = [];
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

const KEY_REFS = collectKeyRefs();
const UNIQUE_KEYS = [...new Set(KEY_REFS.map((r) => r.key))];

/** 在指定语言下解析键，返回 t() 的解析结果。 */
function resolveIn(locale: Locale, key: string): string {
  setLocale(locale);
  return t(key);
}

afterAll(() => {
  // 恢复默认语言，避免污染同进程内的其他测试文件。
  setLocale(DEFAULT_LOCALE);
});

describe('i18n 覆盖 — 节点 labelKey 完整性', () => {
  it('NODE_TYPES 非空且收集到 labelKey', () => {
    expect(Object.keys(NODE_TYPES).length).toBeGreaterThan(0);
    expect(KEY_REFS.length).toBeGreaterThan(0);
  });

  it('每个节点/端口 labelKey 在 zh-CN 中存在且非空', () => {
    const missing: string[] = [];
    for (const { owner, key } of KEY_REFS) {
      const value = resolveIn('zh-CN', key);
      // t() 缺失时回退为键名本身；空串/全空白视为缺失。
      if (value === String(key) || value.trim().length === 0) {
        missing.push(`${owner} -> ${String(key)}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('每个节点/端口 labelKey 在 en 中存在且非空', () => {
    const missing: string[] = [];
    for (const { owner, key } of KEY_REFS) {
      const value = resolveIn('en', key);
      if (value === String(key) || value.trim().length === 0) {
        missing.push(`${owner} -> ${String(key)}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('去重后的 labelKey 在两种语言下均无缺失（汇总快照）', () => {
    const summary = UNIQUE_KEYS.map((key) => ({
      key: String(key),
      zh: resolveIn('zh-CN', key),
      en: resolveIn('en', key),
    }));
    for (const { key, zh, en } of summary) {
      expect(zh, `zh-CN 缺失: ${key}`).not.toBe(key);
      expect(zh.trim().length, `zh-CN 为空: ${key}`).toBeGreaterThan(0);
      expect(en, `en 缺失: ${key}`).not.toBe(key);
      expect(en.trim().length, `en 为空: ${key}`).toBeGreaterThan(0);
    }
  });
});
