/**
 * AI 读取上下文 store（只读镜像）。
 *
 * 各模块（蓝图节点 / 求解器 / 线性代数 / 控制理论）把自己的**局部 useState**
 * 摘要同步到这里，供 `collectWorkspaceSnapshot()` 读取，从而让 AI 在对话时
 * 「看懂」当前模块状态。
 *
 * 关键约束（见 AI_DEEP_INTEGRATION_DESIGN）：
 *  - 本 store 只作为 AI 的**读**上下文，绝不是各模块的「真相来源」。
 *    模块始终以自己的 useState 为准，仅在有变化时把摘要 set 到本 store。
 *  - 写操作不走这里 —— 写走 `omnimath:*` 自定义事件回到模块自身的 setter。
 *  - 所有字段都必须是可序列化的基础类型 / 纯对象 / 数组（绝不放函数/类实例）。
 */

import { create } from 'zustand';

interface AIContextState {
  /** 蓝图节点图摘要：{ nodes: [{id,type,config}], edgeCount }。 */
  pipeline: unknown;
  /** 求解器摘要：{ tab, equation, ... }。 */
  solver: unknown;
  /** 线性代数矩阵摘要：{ matrices: [{name,data}], selectedName }。 */
  linalg: unknown;
  /** 控制理论摘要（预留）。 */
  control: unknown;
  setPipeline: (v: unknown) => void;
  setSolver: (v: unknown) => void;
  setLinalg: (v: unknown) => void;
  setControl: (v: unknown) => void;
}

export const useAIContextStore = create<AIContextState>((set) => ({
  pipeline: undefined,
  solver: undefined,
  linalg: undefined,
  control: undefined,
  setPipeline: (v) => set((s) => ({ pipeline: v })),
  setSolver: (v) => set((s) => ({ solver: v })),
  setLinalg: (v) => set((s) => ({ linalg: v })),
  setControl: (v) => set((s) => ({ control: v })),
}));