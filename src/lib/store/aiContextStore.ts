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
  /**
   * 待发送的 prompt。AI 面板只在「预览区 AI 标签」激活时挂载，
   * 直接派发 `omnimath:ai-explain` 事件可能在监听器挂载前丢失；
   * 这里先把请求排队，AI 面板挂载后消费，保证请求一定被送出。
   */
  pendingPrompt: string | null;
  /** 每排一次队 +1，供 AI 面板区分「同一个 prompt 再次发送」。 */
  promptSeq: number;
  setPipeline: (v: unknown) => void;
  setSolver: (v: unknown) => void;
  setLinalg: (v: unknown) => void;
  setControl: (v: unknown) => void;
  queuePrompt: (prompt: string) => void;
  /** 取出并清空待发送 prompt；传入 expected 时只在内容一致时清空。 */
  consumePrompt: (expected?: string) => string | null;
}

export const useAIContextStore = create<AIContextState>((set, get) => ({
  pipeline: undefined,
  solver: undefined,
  linalg: undefined,
  control: undefined,
  pendingPrompt: null,
  promptSeq: 0,
  setPipeline: (v) => set((s) => ({ pipeline: v })),
  setSolver: (v) => set((s) => ({ solver: v })),
  setLinalg: (v) => set((s) => ({ linalg: v })),
  setControl: (v) => set((s) => ({ control: v })),
  queuePrompt: (prompt) => set((s) => ({ pendingPrompt: prompt, promptSeq: s.promptSeq + 1 })),
  consumePrompt: (expected) => {
    const prompt = get().pendingPrompt;
    if (!prompt) return null;
    if (expected !== undefined && prompt !== expected) return null;
    set({ pendingPrompt: null });
    return prompt;
  },
}));