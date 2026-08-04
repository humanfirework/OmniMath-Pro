/**
 * ai-client 单测 — chatWithTools 工具调用循环（mock fetch）。
 *
 * 覆盖：
 *  - 普通对话（无 tool_calls 直接返回文本）
 *  - 工具调用循环：tool_calls → 本地执行 → 结果回填 → 最终文本
 *  - 上下文注入：context 作为第二条 system 消息进入请求体
 *  - 优雅降级：端点不支持 tools（首轮 HTTP 400）→ 回退普通对话
 *  - 循环上限：最后一轮强制去掉 tools 逼模型给出最终回复
 *  - NO_API_KEY 行为不变
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  chatComplete,
  chatWithTools,
  AI_STORAGE_KEYS,
  type AIToolDef,
  type AIMessage,
} from './ai-client';

/* ------------------------------------------------------------------ */
/* fetch mock 工具                                                     */
/* ------------------------------------------------------------------ */

function completionBody(message: Record<string, unknown>) {
  return { choices: [{ message }] };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

type FetchMock = ReturnType<typeof vi.fn>;

/** 读取第 n 次 fetch 调用的请求体（解析为对象）。 */
function requestBodyOf(fetchMock: FetchMock, n: number): Record<string, unknown> {
  const init = fetchMock.mock.calls[n][1] as RequestInit;
  return JSON.parse(String(init.body)) as Record<string, unknown>;
}

const TOOLS: AIToolDef[] = [
  {
    type: 'function',
    function: {
      name: 'evaluate_expression',
      description: '求值',
      parameters: {
        type: 'object',
        properties: { expr: { type: 'string' } },
        required: ['expr'],
      },
    },
  },
];

const USER: AIMessage[] = [{ role: 'user', content: '帮我算 6*7' }];

let fetchMock: FetchMock;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  window.localStorage.setItem(AI_STORAGE_KEYS.apiKey, 'sk-test');
  window.localStorage.removeItem(AI_STORAGE_KEYS.baseURL);
  window.localStorage.removeItem(AI_STORAGE_KEYS.model);
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

/* ------------------------------------------------------------------ */
/* chatComplete（基线行为）                                             */
/* ------------------------------------------------------------------ */

describe('chatComplete', () => {
  it('返回助手文本', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(completionBody({ content: '你好' })));
    const r = await chatComplete([{ role: 'user', content: 'hi' }]);
    expect(r).toEqual({ ok: true, reply: '你好' });
  });

  it('context 选项注入为第二条 system 消息', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(completionBody({ content: 'ok' })));
    await chatComplete(USER, { context: '[工作台上下文] 变量 a=5' });
    const body = requestBodyOf(fetchMock, 0);
    const messages = body.messages as Array<{ role: string; content: string }>;
    expect(messages[0].role).toBe('system');
    expect(messages[1]).toEqual({ role: 'system', content: '[工作台上下文] 变量 a=5' });
    expect(messages[messages.length - 1]).toEqual({ role: 'user', content: '帮我算 6*7' });
  });

  it('无 API key → NO_API_KEY，不发请求', async () => {
    window.localStorage.removeItem(AI_STORAGE_KEYS.apiKey);
    const r = await chatComplete(USER);
    expect(r).toEqual({ ok: false, error: 'NO_API_KEY' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------ */
/* chatWithTools — 工具调用循环                                         */
/* ------------------------------------------------------------------ */

describe('chatWithTools', () => {
  it('模型直接回复文本：一次请求，未使用工具', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(completionBody({ content: '答案是 42' })));
    const executor = vi.fn();
    const r = await chatWithTools(USER, TOOLS, executor);
    expect(r).toEqual({ ok: true, reply: '答案是 42', toolCalls: [], usedTools: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(executor).not.toHaveBeenCalled();
    // 首次请求带上了 tools
    expect(requestBodyOf(fetchMock, 0).tools).toEqual(TOOLS);
  });

  it('完整循环：tool_calls → 本地执行 → tool 消息回填 → 最终文本', async () => {
    fetchMock
      // 第 1 轮：模型要求调用 evaluate_expression("6*7")
      .mockResolvedValueOnce(
        jsonResponse(
          completionBody({
            content: null,
            tool_calls: [
              {
                id: 'call_1',
                type: 'function',
                function: { name: 'evaluate_expression', arguments: '{"expr":"6*7"}' },
              },
            ],
          }),
        ),
      )
      // 第 2 轮：模型基于工具结果给出最终回复
      .mockResolvedValueOnce(jsonResponse(completionBody({ content: '6*7 等于 42' })));

    const executor = vi.fn().mockResolvedValue({ ok: true, content: '6*7 = 42' });
    const onToolCall = vi.fn();
    const r = await chatWithTools(USER, TOOLS, executor, { onToolCall });

    expect(r).toEqual({
      ok: true,
      reply: '6*7 等于 42',
      usedTools: true,
      toolCalls: [
        { id: 'call_1', name: 'evaluate_expression', args: { expr: '6*7' }, result: '6*7 = 42', ok: true },
      ],
    });
    expect(executor).toHaveBeenCalledWith('evaluate_expression', '{"expr":"6*7"}');
    expect(onToolCall).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // 第 2 次请求体：assistant(tool_calls) + tool 结果 已回填
    const messages = requestBodyOf(fetchMock, 1).messages as Array<Record<string, unknown>>;
    const assistantMsg = messages.find((m) => m.role === 'assistant');
    expect(assistantMsg?.tool_calls).toHaveLength(1);
    const toolMsg = messages.find((m) => m.role === 'tool');
    expect(toolMsg).toMatchObject({
      role: 'tool',
      tool_call_id: 'call_1',
      name: 'evaluate_expression',
      content: '6*7 = 42',
    });
  });

  it('一轮内多个 tool_calls 全部执行并回填', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(
          completionBody({
            content: null,
            tool_calls: [
              {
                id: 'c1',
                type: 'function',
                function: { name: 'evaluate_expression', arguments: '{"expr":"1+1"}' },
              },
              {
                id: 'c2',
                type: 'function',
                function: { name: 'evaluate_expression', arguments: '{"expr":"2+2"}' },
              },
            ],
          }),
        ),
      )
      .mockResolvedValueOnce(jsonResponse(completionBody({ content: '都算完了' })));

    const executor = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, content: '1+1 = 2' })
      .mockResolvedValueOnce({ ok: true, content: '2+2 = 4' });
    const r = await chatWithTools(USER, TOOLS, executor);
    expect(r.ok && r.toolCalls).toHaveLength(2);
    const messages = requestBodyOf(fetchMock, 1).messages as Array<Record<string, unknown>>;
    expect(messages.filter((m) => m.role === 'tool')).toHaveLength(2);
  });

  it('executor 抛异常 → 编码为工具失败结果继续循环，不崩溃', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(
          completionBody({
            content: null,
            tool_calls: [
              {
                id: 'c1',
                type: 'function',
                function: { name: 'evaluate_expression', arguments: 'bad json' },
              },
            ],
          }),
        ),
      )
      .mockResolvedValueOnce(jsonResponse(completionBody({ content: '工具失败了' })));

    const executor = vi.fn().mockRejectedValue(new Error('engine exploded'));
    const r = await chatWithTools(USER, TOOLS, executor);
    expect(r.ok).toBe(true);
    expect(r.ok && r.toolCalls[0].ok).toBe(false);
    expect(r.ok && r.toolCalls[0].result).toContain('engine exploded');
    // 非法 JSON 参数 → args 回退为空对象
    expect(r.ok && r.toolCalls[0].args).toEqual({});
  });

  it('优雅降级：首轮带 tools 请求 HTTP 400 → 回退为不带 tools 的普通对话', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: 'tools not supported' }, 400))
      .mockResolvedValueOnce(jsonResponse(completionBody({ content: '普通回复' })));

    const executor = vi.fn();
    const r = await chatWithTools(USER, TOOLS, executor);

    expect(r).toEqual({ ok: true, reply: '普通回复', toolCalls: [], usedTools: false });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(requestBodyOf(fetchMock, 0).tools).toEqual(TOOLS); // 首轮带 tools
    expect(requestBodyOf(fetchMock, 1)).not.toHaveProperty('tools'); // 降级后不带
    expect(executor).not.toHaveBeenCalled();
  });

  it('降级也失败：返回第二次的错误', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: 'bad request' }, 400))
      .mockResolvedValueOnce(jsonResponse({ error: 'server down' }, 500));
    const r = await chatWithTools(USER, TOOLS, vi.fn());
    expect(r).toEqual({ ok: false, error: 'HTTP_500', toolCalls: [] });
  });

  it('达到最大轮数：最后一轮去掉 tools 强制模型给出文本回复', async () => {
    // 模型在带 tools 的请求下永远返回 tool_calls；
    // 不带 tools 的请求才返回最终文本。
    fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      if (Array.isArray(body.tools)) {
        return jsonResponse(
          completionBody({
            content: null,
            tool_calls: [
              {
                id: `c${fetchMock.mock.calls.length}`,
                type: 'function',
                function: { name: 'evaluate_expression', arguments: '{"expr":"1"}' },
              },
            ],
          }),
        );
      }
      return jsonResponse(completionBody({ content: '最终答案' }));
    });

    const executor = vi.fn().mockResolvedValue({ ok: true, content: '1' });
    const r = await chatWithTools(USER, TOOLS, executor, { maxRounds: 3 });

    expect(r).toMatchObject({ ok: true, reply: '最终答案', usedTools: true });
    // 轮次：round 0..3 共 4 次请求，最后一次不带 tools
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(requestBodyOf(fetchMock, 3)).not.toHaveProperty('tools');
    // 前 3 轮各执行了一次工具
    expect(executor).toHaveBeenCalledTimes(3);
  });

  it('无 API key → NO_API_KEY，不发请求', async () => {
    window.localStorage.removeItem(AI_STORAGE_KEYS.apiKey);
    const r = await chatWithTools(USER, TOOLS, vi.fn());
    expect(r).toEqual({ ok: false, error: 'NO_API_KEY', toolCalls: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('context 注入到工具循环的每一轮请求', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(
          completionBody({
            content: null,
            tool_calls: [
              {
                id: 'c1',
                type: 'function',
                function: { name: 'evaluate_expression', arguments: '{"expr":"6*7"}' },
              },
            ],
          }),
        ),
      )
      .mockResolvedValueOnce(jsonResponse(completionBody({ content: '42' })));

    const executor = vi.fn().mockResolvedValue({ ok: true, content: '42' });
    await chatWithTools(USER, TOOLS, executor, { context: '[工作台上下文] 测试' });

    for (const n of [0, 1]) {
      const messages = requestBodyOf(fetchMock, n).messages as Array<{ role: string; content: string }>;
      expect(messages[1]).toEqual({ role: 'system', content: '[工作台上下文] 测试' });
    }
  });
});
