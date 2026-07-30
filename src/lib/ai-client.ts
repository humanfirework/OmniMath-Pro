/**
 * OmniMath Pro — Client-side AI helper
 *
 * Talks directly to an OpenAI-compatible Chat Completions endpoint from the
 * browser. This module exists because the Next.js API route was removed
 * (static `output: "export"` forbids server routes), so all AI calls must
 * happen client-side.
 *
 * Configuration is stored in localStorage so the user only needs to enter
 * their API key once. The panel renders a configuration card on first use.
 */

'use client';

/* ----------------------------- localStorage keys ----------------------------- */

export const AI_STORAGE_KEYS = {
  apiKey: 'omnimath:ai:apiKey',
  baseURL: 'omnimath:ai:baseURL',
  model: 'omnimath:ai:model',
} as const;

export const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
export const DEFAULT_MODEL = 'gpt-4o-mini';

/* ----------------------------- Types ----------------------------- */

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/* ----------------------------- Tools (function calling) ----------------------------- */

/** OpenAI-style tool definition (JSON Schema parameters). */
export interface AIToolDef {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/** A single tool call requested by the model. */
export interface AIToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

/**
 * Extended message shape used inside the tool-calling loop:
 * assistant messages may carry `tool_calls`, and tool results are sent back
 * as `role: 'tool'` messages keyed by `tool_call_id`.
 */
export type AIAgentMessage =
  | AIMessage
  | { role: 'assistant'; content: string | null; tool_calls: AIToolCall[] }
  | { role: 'tool'; tool_call_id: string; name: string; content: string };

/** Record of one executed tool call, surfaced in the UI. */
export interface AIToolCallRecord {
  id: string;
  name: string;
  /** Parsed arguments (best-effort; {} when the model sent invalid JSON). */
  args: Record<string, unknown>;
  /** Tool output text sent back to the model. */
  result: string;
  ok: boolean;
}

/**
 * Executes a tool call locally and returns the text result to feed back to
 * the model. Must never throw — encode failures into the returned string.
 */
export type AIToolExecutor = (
  name: string,
  argsJson: string,
) => Promise<{ ok: boolean; content: string }>;

export interface AIAgentOptions extends AIChatOptions {
  /** Max tool-call rounds before giving up (default 5). */
  maxRounds?: number;
  /** Called after each tool call executes (for live UI display). */
  onToolCall?: (record: AIToolCallRecord) => void;
}

export type AIAgentResult =
  | { ok: true; reply: string; toolCalls: AIToolCallRecord[]; usedTools: boolean }
  | { ok: false; error: string; toolCalls: AIToolCallRecord[] };

export interface AIConfig {
  apiKey: string;
  baseURL: string;
  model: string;
}

export type AIResult =
  | { ok: true; reply: string }
  | { ok: false; error: string };

export interface AIChatOptions {
  /** Override the configured model for this call. */
  model?: string;
  /** Sampling temperature, default 0.7. */
  temperature?: number;
  /** Abort the request (e.g. user clicked stop). */
  signal?: AbortSignal;
  /** 最多保留的最近消息条数（防止超长对话触发 400/413）。默认 20。 */
  maxHistoryMessages?: number;
  /**
   * 工作台上下文文本（可选）。非空时作为一条额外的 system 消息插入在
   * 内置 SYSTEM_PROMPT 之后、对话历史之前，且不受历史截断影响。
   */
  context?: string;
}

/* ----------------------------- System prompt ----------------------------- */

/**
 * System prompt for the OmniMath math assistant.
 * Tells the model to: answer math questions, format math with LaTeX,
 * and emit executable scripts inside ```omnimath code fences.
 */
export const SYSTEM_PROMPT = `你是 OmniMath Pro 的内置 AI 数学助手。你的职责是帮助用户理解数学概念、推导公式、求解方程、生成可执行的数学脚本。

回答规范：
1. 用中文回答，语气简洁、专业、友好。
2. 所有数学公式必须用 LaTeX 包裹：
   - 行内公式用 $...$，例如 $\\\\alpha^2 + \\\\beta^2$。
   - 独立公式块用 $$...$$，例如 $$\\\\int_0^1 x^2 \\\\, dx = \\\\frac{1}{3}$$。
3. 推导过程要分步骤清晰呈现，每一步给出关键变形。
4. 当用户需要绘图、计算、矩阵运算等可执行操作时，把脚本放在 \`\`\`omnimath 代码块中。脚本使用 OmniMath 脚本语法（类似 mathjs/Python 风格），例如：
\`\`\`omnimath
# 绘制 sin(x)*cos(x)
plot(sin(x) * cos(x), x, [-2*pi, 2*pi])
\`\`\`
5. 不要伪造数据或结果；如果不确定，明确说明并给出求解思路。
6. 避免无关闲聊，专注数学问题本身。
7. 你可以通过提供的工具直接操作工作台：evaluate_expression（用数学引擎求值）、solve_equation（解方程并给出分步说明）、plot_function（把表达式加入 2D 绘图）、get_workspace_state（获取当前工作台状态）。当用户要求实际计算、解方程或绘图时，优先调用工具获取真实结果，而不是凭记忆编造数值。`;

/* ----------------------------- Config helpers ----------------------------- */

/** Read the user's saved AI config from localStorage. Safe on SSR (returns defaults). */
export function loadAIConfig(): AIConfig {
  const fallback: AIConfig = {
    apiKey: '',
    baseURL: DEFAULT_BASE_URL,
    model: DEFAULT_MODEL,
  };
  if (typeof window === 'undefined') return fallback;
  try {
    const apiKey = window.localStorage.getItem(AI_STORAGE_KEYS.apiKey) ?? '';
    const baseURL =
      window.localStorage.getItem(AI_STORAGE_KEYS.baseURL) || DEFAULT_BASE_URL;
    const model =
      window.localStorage.getItem(AI_STORAGE_KEYS.model) || DEFAULT_MODEL;
    return { apiKey, baseURL, model };
  } catch {
    return fallback;
  }
}

/** Persist the AI config to localStorage. Returns true on success. */
export function saveAIConfig(cfg: AIConfig): boolean {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.setItem(AI_STORAGE_KEYS.apiKey, cfg.apiKey.trim());
    window.localStorage.setItem(
      AI_STORAGE_KEYS.baseURL,
      cfg.baseURL.trim() || DEFAULT_BASE_URL,
    );
    window.localStorage.setItem(
      AI_STORAGE_KEYS.model,
      cfg.model.trim() || DEFAULT_MODEL,
    );
    return true;
  } catch {
    return false;
  }
}

/** Returns true if an API key has been configured. */
export function hasAPIKey(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const k = window.localStorage.getItem(AI_STORAGE_KEYS.apiKey);
    return !!k && k.trim().length > 0;
  } catch {
    return false;
  }
}

/* ----------------------------- Chat call ----------------------------- */

/**
 * Send a chat completion request to an OpenAI-compatible endpoint directly
 * from the browser. Returns the assistant's reply text or a structured error.
 *
 * Error values:
 *  - 'NO_API_KEY'        : no API key configured; UI should show config card.
 *  - 'NETWORK_ERROR'     : fetch threw (CORS, offline, DNS, etc.).
 *  - 'HTTP_<status>'     : server returned non-2xx.
 *  - 'EMPTY_REPLY'       : 2xx but no message content.
 *  - 'PARSE_ERROR'       : response was not valid JSON.
 */
export async function chatComplete(
  messages: AIMessage[],
  opts: AIChatOptions = {},
): Promise<AIResult> {
  const res = await requestCompletion(buildApiMessages(messages, opts), opts);
  if (!res.ok) return res;
  const reply = typeof res.message.content === 'string' ? res.message.content : '';
  if (!reply) return { ok: false, error: 'EMPTY_REPLY' };
  return { ok: true, reply };
}

/* ----------------------------- Tool-calling loop ----------------------------- */

/** Hard cap on tool-call rounds, protecting against models that loop forever. */
export const MAX_TOOL_ROUNDS = 5;

/**
 * Chat with OpenAI-style function calling.
 *
 * Loop: request (with `tools`) → model returns `tool_calls` → execute each
 * locally via `executor` → append results as `role: 'tool'` messages →
 * request again, until the model answers with plain text or `maxRounds`
 * (default 5) is hit.
 *
 * Graceful degradation: if the first request fails with an HTTP error
 * (endpoint/model without tools support typically answers 400), the whole
 * call falls back to a plain `chatComplete` without tools. Errors thrown by
 * the executor are encoded into the tool result instead of crashing.
 */
export async function chatWithTools(
  messages: AIMessage[],
  tools: AIToolDef[],
  executor: AIToolExecutor,
  opts: AIAgentOptions = {},
): Promise<AIAgentResult> {
  const toolCalls: AIToolCallRecord[] = [];
  const maxRounds = opts.maxRounds ?? MAX_TOOL_ROUNDS;

  // Working transcript: system prompt + optional context + trimmed history.
  // After the first round we append assistant/tool messages to this array.
  const transcript: AIAgentMessage[] = buildApiMessages(messages, opts);

  for (let round = 0; round <= maxRounds; round++) {
    // Last allowed round: drop tools so the model must produce a final text.
    const isFinalRound = round === maxRounds;
    const res = await requestCompletion(
      transcript,
      opts,
      isFinalRound || tools.length === 0 ? undefined : tools,
    );

    if (!res.ok) {
      // 首轮（带 tools）失败：端点/模型很可能不支持 function calling，
      // 优雅降级为普通对话（此时尚未执行过任何工具）。
      if (round === 0 && toolCalls.length === 0 && res.error !== 'ABORTED') {
        const fallback = await chatComplete(messages, opts);
        if (fallback.ok) {
          return { ok: true, reply: fallback.reply, toolCalls, usedTools: false };
        }
        return { ok: false, error: fallback.error, toolCalls };
      }
      return { ok: false, error: res.error, toolCalls };
    }

    const msg = res.message;
    const calls = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];

    // No tool calls → final answer.
    if (calls.length === 0) {
      const reply = typeof msg.content === 'string' ? msg.content : '';
      if (!reply) return { ok: false, error: 'EMPTY_REPLY', toolCalls };
      return { ok: true, reply, toolCalls, usedTools: toolCalls.length > 0 };
    }

    // Echo the assistant message (with tool_calls) back into the transcript,
    // then execute each call and append its result as a `tool` message.
    transcript.push({
      role: 'assistant',
      content: typeof msg.content === 'string' ? msg.content : null,
      tool_calls: calls,
    });

    for (const call of calls) {
      const name = call.function?.name ?? '';
      const argsJson = call.function?.arguments ?? '{}';
      let parsedArgs: Record<string, unknown> = {};
      try {
        const p = JSON.parse(argsJson);
        if (p && typeof p === 'object' && !Array.isArray(p)) {
          parsedArgs = p as Record<string, unknown>;
        }
      } catch {
        // 模型偶发输出非法 JSON — 交给 executor 以空参数处理，不崩溃。
      }

      let outcome: { ok: boolean; content: string };
      try {
        outcome = await executor(name, argsJson);
      } catch (err) {
        outcome = {
          ok: false,
          content: `工具执行异常: ${err instanceof Error ? err.message : String(err)}`,
        };
      }

      const record: AIToolCallRecord = {
        id: call.id,
        name,
        args: parsedArgs,
        result: outcome.content,
        ok: outcome.ok,
      };
      toolCalls.push(record);
      opts.onToolCall?.(record);

      transcript.push({
        role: 'tool',
        tool_call_id: call.id,
        name,
        content: outcome.content,
      });
    }
  }

  // Unreachable in practice (loop returns on the final round), kept for TS.
  return { ok: false, error: 'EMPTY_REPLY', toolCalls };
}

/* ----------------------------- Request internals ----------------------------- */

/** Parsed assistant message from an OpenAI-style response. */
interface RawAssistantMessage {
  content: string | null;
  tool_calls?: AIToolCall[];
}

type RawRequestResult =
  | { ok: true; message: RawAssistantMessage }
  | { ok: false; error: string };

/**
 * Build the wire message array: built-in system prompt, optional workbench
 * context (as a second system message), then the trimmed conversation.
 */
function buildApiMessages(
  messages: AIMessage[],
  opts: AIChatOptions,
): AIAgentMessage[] {
  // 安全/稳定性防护：截断过长的历史消息，避免触发上下文窗口上限 (400/413)。
  // 默认只保留最近 20 条（10 轮对话），system prompt 不计入。
  const maxHistory = opts.maxHistoryMessages ?? 20;
  const trimmed = messages.length > maxHistory
    ? messages.slice(-maxHistory)
    : messages;

  const out: AIAgentMessage[] = [{ role: 'system', content: SYSTEM_PROMPT }];
  if (opts.context && opts.context.trim()) {
    out.push({ role: 'system', content: opts.context });
  }
  out.push(...trimmed);
  return out;
}

/**
 * Single POST to the chat-completions endpoint. Shared by `chatComplete`
 * and the tool-calling loop. Never throws — all failures are encoded in the
 * returned error string.
 */
async function requestCompletion(
  messages: AIAgentMessage[],
  opts: AIChatOptions,
  tools?: AIToolDef[],
): Promise<RawRequestResult> {
  const cfg = loadAIConfig();
  if (!cfg.apiKey.trim()) {
    return { ok: false, error: 'NO_API_KEY' };
  }

  const baseURL = cfg.baseURL.replace(/\/+$/, '');
  const url = `${baseURL}/chat/completions`;

  const payload: Record<string, unknown> = {
    model: opts.model ?? cfg.model,
    temperature: opts.temperature ?? 0.7,
    messages,
  };
  if (tools && tools.length > 0) {
    payload.tools = tools;
    payload.tool_choice = 'auto';
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey.trim()}`,
      },
      body: JSON.stringify(payload),
      signal: opts.signal,
    });
  } catch (err) {
    // fetch throws on network failure, CORS, abort, etc.
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { ok: false, error: 'ABORTED' };
    }
    return { ok: false, error: 'NETWORK_ERROR' };
  }

  if (!res.ok) {
    return { ok: false, error: `HTTP_${res.status}` };
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    return { ok: false, error: 'PARSE_ERROR' };
  }

  const message = extractAssistantMessage(data);
  if (!message) return { ok: false, error: 'EMPTY_REPLY' };
  return { ok: true, message };
}

/** Pull the assistant message (content + tool_calls) out of an OpenAI-style response. */
function extractAssistantMessage(data: unknown): RawAssistantMessage | null {
  if (!data || typeof data !== 'object') return null;
  const obj = data as Record<string, unknown>;
  const choices = obj.choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const first = choices[0] as Record<string, unknown> | undefined;
  if (!first || typeof first !== 'object') return null;
  const msg = first.message as Record<string, unknown> | undefined;
  if (!msg || typeof msg !== 'object') return null;

  const content = typeof msg.content === 'string' ? msg.content : null;
  const tool_calls = sanitizeToolCalls(msg.tool_calls);
  // A message with neither text nor tool calls is unusable.
  if (content === null && tool_calls.length === 0) return null;
  return { content, tool_calls };
}

/** Validate the `tool_calls` array from an untrusted API response. */
function sanitizeToolCalls(raw: unknown): AIToolCall[] {
  if (!Array.isArray(raw)) return [];
  const out: AIToolCall[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const fn = o.function as Record<string, unknown> | undefined;
    if (typeof o.id !== 'string' || !fn || typeof fn !== 'object') continue;
    if (typeof fn.name !== 'string' || !fn.name) continue;
    out.push({
      id: o.id,
      type: 'function',
      function: {
        name: fn.name,
        arguments: typeof fn.arguments === 'string' ? fn.arguments : '{}',
      },
    });
  }
  return out;
}
