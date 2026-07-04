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
6. 避免无关闲聊，专注数学问题本身。`;

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
  const cfg = loadAIConfig();
  if (!cfg.apiKey.trim()) {
    return { ok: false, error: 'NO_API_KEY' };
  }

  const baseURL = cfg.baseURL.replace(/\/+$/, '');
  const url = `${baseURL}/chat/completions`;
  const model = opts.model ?? cfg.model;
  const temperature = opts.temperature ?? 0.7;

  const payload = {
    model,
    temperature,
    messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
  };

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

  const reply = extractReply(data);
  if (!reply) {
    return { ok: false, error: 'EMPTY_REPLY' };
  }
  return { ok: true, reply };
}

/** Pull the assistant message text out of an OpenAI-style response object. */
function extractReply(data: unknown): string {
  if (!data || typeof data !== 'object') return '';
  const obj = data as Record<string, unknown>;
  const choices = obj.choices;
  if (!Array.isArray(choices) || choices.length === 0) return '';
  const first = choices[0] as Record<string, unknown> | undefined;
  if (!first || typeof first !== 'object') return '';
  const msg = first.message as Record<string, unknown> | undefined;
  if (!msg || typeof msg !== 'object') return '';
  const content = msg.content;
  if (typeof content === 'string') return content;
  return '';
}
