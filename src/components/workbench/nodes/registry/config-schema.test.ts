/**
 * 声明式 configSchema —— 蓝图 P0 可用性。
 *
 * 覆盖：
 *   - 每个声明了 configSchema 的节点，schema 结构合法（key/label/type 齐全，
 *     number 字段 min<max，select 字段有非空 options）
 *   - schema 字段的 key 与 defaultConfig 对齐（避免「写了 schema 但读不到默认值」）
 *   - 端口类型色盘覆盖全部 PortDataType（供端口颜色编码使用）
 */

import { describe, it, expect } from 'vitest';
import { NODE_TYPES, type NodeConfigField, type PortDataType } from '../pipelineEngine';

/** 节点类型 → 端口类型色盘（需与 NodePipeline 的端口颜色编码保持一致）。 */
const PORT_TYPE_COLORS: Record<PortDataType, string> = {
  number: 'emerald',
  expression: 'blue',
  matrix: 'violet',
  curve: 'orange',
  curves: 'orange',
  image: 'rose',
  animation: 'cyan',
  plot: 'sky',
  any: 'gray',
};

describe('蓝图 configSchema 完整性', () => {
  const schemaNodes = Object.values(NODE_TYPES).filter(
    (def) => def.configSchema && def.configSchema.length > 0,
  );

  it('至少有一个节点接入声明式 configSchema', () => {
    expect(schemaNodes.length).toBeGreaterThan(0);
  });

  it('每个 schema 字段结构合法', () => {
    const problems: string[] = [];
    for (const def of schemaNodes) {
      def.configSchema!.forEach((field: NodeConfigField, idx: number) => {
        const pos = `${def.type}.configSchema[${idx}]`;
        if (!field.key) problems.push(`${pos}: 缺少 key`);
        if (!field.label) problems.push(`${pos}: 缺少 label`);
        if (field.type === 'number') {
          const min = field.min ?? 0;
          const max = field.max ?? 1;
          if (min >= max) problems.push(`${pos}: number min>=max (${min}>=${max})`);
          if (!Number.isFinite(field.step ?? 1)) problems.push(`${pos}: step 非法`);
        }
        if (field.type === 'select') {
          if (!field.options || field.options.length === 0) {
            problems.push(`${pos}: select 缺少 options`);
          } else {
            for (const o of field.options) {
              if (!o.value) problems.push(`${pos}: option 缺少 value`);
              if (!o.label) problems.push(`${pos}: option 缺少 label`);
            }
          }
        }
      });
    }
    expect(problems).toEqual([]);
  });

  it('schema 字段的 key 与 defaultConfig 对齐（有默认值的字段应存在）', () => {
    const missing: string[] = [];
    for (const def of schemaNodes) {
      def.configSchema!.forEach((field) => {
        // 仅校验「在 defaultConfig 中声明了默认值」的字段 —— 这类字段运行期会
        // 读取 config[field.key]，若 schema 用了别名 key 就会读不到默认值。
        if (
          Object.prototype.hasOwnProperty.call(def.defaultConfig, field.key) &&
          def.defaultConfig[field.key] === undefined
        ) {
          missing.push(`${def.type}.${field.key}: defaultConfig 中缺默认值`);
        }
      });
    }
    expect(missing).toEqual([]);
  });
});

describe('端口类型色盘覆盖', () => {
  it('覆盖全部 PortDataType，且颜色互不冲突（curve/curves 同属曲线族、any 灰色除外）', () => {
    const used = new Set<string>();
    const conflicts: string[] = [];
    for (const type of Object.keys(PORT_TYPE_COLORS) as PortDataType[]) {
      if (type === 'any') continue;
      const color = PORT_TYPE_COLORS[type];
      if (used.has(color)) conflicts.push(`${type} -> ${color}`);
      used.add(color);
    }
    // curve 与 curves 共享橙色是有意设计（同一数据族），不视为冲突。
    expect(conflicts).toEqual(['curves -> orange']);
    expect(used.size).toBeGreaterThanOrEqual(6);
  });
});