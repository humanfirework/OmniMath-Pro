import { beforeEach, describe, expect, it } from 'vitest';
import { useAIContextStore } from './aiContextStore';

beforeEach(() => {
  useAIContextStore.setState({ pendingPrompt: null, promptSeq: 0 });
});

describe('AI prompt queue', () => {
  it('queuePrompt 保存内容并递增序号', () => {
    const store = useAIContextStore.getState();
    store.queuePrompt('解释 x^2');
    expect(useAIContextStore.getState().pendingPrompt).toBe('解释 x^2');
    expect(useAIContextStore.getState().promptSeq).toBe(1);
    // 相同文案再次入队也要能触发消费（序号必须继续递增）。
    store.queuePrompt('解释 x^2');
    expect(useAIContextStore.getState().promptSeq).toBe(2);
  });

  it('consumePrompt 取出后清空队列', () => {
    useAIContextStore.getState().queuePrompt('a');
    expect(useAIContextStore.getState().consumePrompt()).toBe('a');
    expect(useAIContextStore.getState().pendingPrompt).toBeNull();
    expect(useAIContextStore.getState().consumePrompt()).toBeNull();
  });

  it('consumePrompt 只在内容一致时清空（避免丢掉新排队的请求）', () => {
    useAIContextStore.getState().queuePrompt('new');
    expect(useAIContextStore.getState().consumePrompt('old')).toBeNull();
    expect(useAIContextStore.getState().pendingPrompt).toBe('new');
    expect(useAIContextStore.getState().consumePrompt('new')).toBe('new');
  });
});
