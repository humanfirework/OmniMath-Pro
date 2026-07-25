'use client';

/**
 * OmniMath Pro — AI Assistant Panel
 *
 * A real chat interface that talks to an OpenAI-compatible LLM endpoint
 * directly from the browser (no Next.js API route — static export forbids it).
 * Supports: math Q&A, formula explanation, generating executable scripts,
 * inserting generated scripts into the editor, KaTeX rendering of math.
 *
 * The panel renders its full UI immediately on mount. The API key is only
 * checked when the user actually sends a message; if missing, a configuration
 * card is shown instead of a crash.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  Send,
  Loader2,
  Trash2,
  Copy,
  ArrowDownToLine,
  User,
  Bot,
  Settings,
  KeyRound,
  Eye,
  EyeOff,
} from 'lucide-react';
import { useWorkbenchStore } from '@/lib/store/workbench';
import { useT } from '@/lib/i18n';
import { FormulaRenderer } from '@/components/workbench/FormulaRenderer';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  chatComplete,
  loadAIConfig,
  saveAIConfig,
  DEFAULT_BASE_URL,
  DEFAULT_MODEL,
  type AIMessage,
  type AIConfig,
} from '@/lib/ai-client';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  id: string;
}

const QUICK_PROMPTS = [
  '解释一下矩阵特征值的意义',
  '帮我生成绘制 sin(x)*cos(x) 的脚本',
  '泰勒展开 e^x 到 5 阶',
  '如何求解 Ax=b？',
];

/** Extract ```omnimath ... ``` code blocks from assistant reply. */
function extractScripts(text: string): string[] {
  const out: string[] = [];
  const re = /```(?:omnimath|math|python|matlab)?\s*\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push(m[1].trim());
  }
  return out;
}

/** Render assistant text with inline LaTeX + code blocks split out. */
function renderAssistantContent(
  text: string,
  onInsert: (script: string) => void,
) {
  const scripts = extractScripts(text);
  // Strip code blocks from displayed text, show them separately as insertable cards
  const displayText = text.replace(/```[\s\S]*?```/g, '\n[脚本]\n').trim();
  const parts = displayText.split(/(\$\$[\s\S]*?\$\$|\$[^$]+\$)/g);

  return (
    <>
      <div className="leading-relaxed text-[13px] text-foreground/90 whitespace-pre-wrap break-words">
        {parts.map((p, i) => {
          if (p.startsWith('$$') && p.endsWith('$$')) {
            return (
              <div key={i} className="my-1.5 overflow-x-auto">
                <FormulaRenderer latex={p.slice(2, -2)} displayMode />
              </div>
            );
          }
          if (p.startsWith('$') && p.endsWith('$')) {
            return (
              <span key={i} className="inline-block align-middle">
                <FormulaRenderer latex={p.slice(1, -1)} />
              </span>
            );
          }
          return <span key={i}>{p}</span>;
        })}
      </div>
      {scripts.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {scripts.map((s, i) => (
            <div
              key={i}
              className="rounded-lg border border-primary/20 bg-primary/5 p-2 group"
            >
              <pre className="text-[11.5px] font-mono text-foreground/80 whitespace-pre-wrap break-all max-h-32 overflow-y-auto scrollbar-none">
                {s}
              </pre>
              <div className="flex items-center justify-end gap-1 mt-1.5">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-[10.5px] text-muted-foreground hover:text-foreground"
                  onClick={() => navigator.clipboard.writeText(s).catch(() => {})}
                >
                  <Copy className="size-3 mr-1" />
                  复制
                </Button>
                <Button
                  size="sm"
                  className="h-6 px-2.5 text-[10.5px] bg-primary text-primary-foreground hover:bg-primary/90"
                  onClick={() => onInsert(s)}
                >
                  <ArrowDownToLine className="size-3 mr-1" />
                  插入编辑器
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/** Map an ai-client error code to a friendly Chinese message. */
function friendlyError(error: string): string {
  switch (error) {
    case 'NO_API_KEY':
      return '尚未配置 API key，请在下方设置中填写。';
    case 'NETWORK_ERROR':
      return '网络连接失败，请检查网络或 API 地址是否可访问。';
    case 'HTTP_401':
    case 'HTTP_403':
      return 'API key 无效或没有权限（鉴权失败），请检查配置。';
    case 'HTTP_429':
      return '请求过于频繁或额度不足（429），请稍后再试。';
    case 'PARSE_ERROR':
      return '无法解析 AI 的响应，可能是 API 地址不正确。';
    case 'EMPTY_REPLY':
      return 'AI 返回了空回复，请重试。';
    case 'ABORTED':
      return '请求已取消。';
    default:
      if (error.startsWith('HTTP_5')) {
        return '服务器内部错误，请稍后再试。';
      }
      if (error.startsWith('HTTP_')) {
        return `请求失败（${error.slice(5)}），请检查配置或稍后重试。`;
      }
      return `请求失败：${error}`;
  }
}

/** Configuration card shown when no API key is set or user opens settings. */
function ConfigCard({
  initial,
  onSave,
  onCancel,
}: {
  initial: AIConfig;
  onSave: (cfg: AIConfig) => void;
  onCancel?: () => void;
}) {
  const [apiKey, setApiKey] = useState(initial.apiKey);
  const [baseURL, setBaseURL] = useState(initial.baseURL);
  const [model, setModel] = useState(initial.model);
  const [showKey, setShowKey] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 space-y-2.5"
    >
      <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
        <KeyRound className="size-3.5" />
        <span className="text-[12px] font-medium">配置 AI 助手</span>
      </div>
      <p className="text-[11px] text-muted-foreground leading-relaxed">
        AI 助手需要配置 OpenAI 兼容的 API key 才能使用。所有配置仅保存在本地浏览器，不会上传。
      </p>

      <label className="block">
        <span className="text-[10.5px] text-muted-foreground">API Key</span>
        <div className="flex items-center gap-1.5 mt-0.5">
          <input
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-..."
            spellCheck={false}
            autoComplete="off"
            className="flex-1 h-7 rounded-md border border-border/60 bg-background px-2 text-[11.5px] outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20"
          />
          <button
            type="button"
            onClick={() => setShowKey((v) => !v)}
            className="grid place-items-center size-7 rounded-md border border-border/60 bg-background text-muted-foreground hover:text-foreground"
            title={showKey ? '隐藏' : '显示'}
          >
            {showKey ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          </button>
        </div>
      </label>

      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-[10.5px] text-muted-foreground">Base URL</span>
          <input
            type="text"
            value={baseURL}
            onChange={(e) => setBaseURL(e.target.value)}
            placeholder={DEFAULT_BASE_URL}
            spellCheck={false}
            autoComplete="off"
            className="mt-0.5 w-full h-7 rounded-md border border-border/60 bg-background px-2 text-[11.5px] outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20"
          />
        </label>
        <label className="block">
          <span className="text-[10.5px] text-muted-foreground">模型</span>
          <input
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder={DEFAULT_MODEL}
            spellCheck={false}
            autoComplete="off"
            className="mt-0.5 w-full h-7 rounded-md border border-border/60 bg-background px-2 text-[11.5px] outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20"
          />
        </label>
      </div>

      <div className="flex items-center justify-end gap-1.5 pt-0.5">
        {onCancel && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2.5 text-[11px] text-muted-foreground hover:text-foreground"
            onClick={onCancel}
          >
            取消
          </Button>
        )}
        <Button
          size="sm"
          className="h-7 px-3 text-[11px] bg-primary text-primary-foreground hover:bg-primary/90"
          disabled={!apiKey.trim()}
          onClick={() =>
            onSave({
              apiKey: apiKey.trim(),
              baseURL: baseURL.trim() || DEFAULT_BASE_URL,
              model: model.trim() || DEFAULT_MODEL,
            })
          }
        >
          保存
        </Button>
      </div>
    </motion.div>
  );
}

export function AIPanel() {
  const t = useT();
  const setEditorContent = useWorkbenchStore((s) => s.setEditorContent);
  const editorContent = useWorkbenchStore((s) => s.editorContent);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [config, setConfig] = useState<AIConfig>(() => loadAIConfig());
  // The last user message we attempted — used to auto-retry after saving config.
  const lastPendingRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom on new message
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading, showConfig]);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;
      setError(null);
      const userMsg: ChatMessage = {
        role: 'user',
        content: trimmed,
        id: `u-${Date.now()}`,
      };
      const prev = messages;
      const history: AIMessage[] = prev.map((m) => ({
        role: m.role,
        content: m.content,
      }));
      setMessages((m) => [...m, userMsg]);
      setInput('');
      setLoading(true);

      const result = await chatComplete([
        ...history,
        { role: 'user', content: trimmed },
      ]);

      if (result.ok) {
        const assistantMsg: ChatMessage = {
          role: 'assistant',
          content: result.reply || '(空回复)',
          id: `a-${Date.now()}`,
        };
        setMessages((m) => [...m, assistantMsg]);
        lastPendingRef.current = null;
      } else if (result.error === 'NO_API_KEY') {
        // Don't crash — surface the config card and remember the message to retry.
        lastPendingRef.current = trimmed;
        setShowConfig(true);
        setConfig(loadAIConfig());
        // Remove the just-added user bubble so the chat stays clean until configured.
        setMessages((m) => m.filter((msg) => msg.id !== userMsg.id));
        setInput(trimmed);
      } else {
        const friendly = friendlyError(result.error);
        setError(friendly);
        setMessages((m) => [
          ...m,
          {
            role: 'assistant',
            content: `⚠️ ${friendly}`,
            id: `e-${Date.now()}`,
          },
        ]);
        lastPendingRef.current = null;
      }
      setLoading(false);
      inputRef.current?.focus();
    },
    [loading, messages],
  );

  const handleSaveConfig = useCallback(
    (cfg: AIConfig) => {
      saveAIConfig(cfg);
      setConfig(cfg);
      setShowConfig(false);
      setError(null);
      // If we were mid-send when the key was missing, retry the last message.
      const pending = lastPendingRef.current;
      if (pending) {
        lastPendingRef.current = null;
        // Defer so the UI updates first; send() guards on loading state.
        setTimeout(() => {
          setInput('');
          void send(pending);
        }, 0);
      }
    },
    [send],
  );

  const handleInsert = useCallback(
    (script: string) => {
      const next = editorContent.trim()
        ? `${editorContent.trimEnd()}\n${script}\n`
        : `${script}\n`;
      setEditorContent(next);
    },
    [editorContent, setEditorContent],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  return (
    <div className="h-full flex flex-col bg-background ai-panel">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/60 bg-muted/20">
        <div className="flex items-center gap-2">
          <motion.div
            animate={{ rotate: [0, 8, -8, 0] }}
            transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
            className="grid place-items-center size-6 rounded-lg bg-violet-500/10 border border-violet-500/25"
          >
            <Sparkles className="size-3.5 text-violet-500" />
          </motion.div>
          <span className="text-[12px] font-medium text-foreground">
            {t('aiTitle')}
          </span>
          {!config.apiKey && (
            <span className="text-[9.5px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20">
              未配置
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
            onClick={() => {
              setConfig(loadAIConfig());
              setShowConfig((v) => !v);
            }}
            title="AI 设置"
          >
            <Settings className="size-3.5" />
          </Button>
          {messages.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[10.5px] text-muted-foreground hover:text-foreground"
              onClick={() => {
                setMessages([]);
                setError(null);
              }}
            >
              <Trash2 className="size-3 mr-1" />
              清空
            </Button>
          )}
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 min-h-0">
        <div ref={scrollRef} className="p-3 space-y-3">
          {/* Configuration card — shown when user opens settings or key is missing */}
          <AnimatePresence>
            {showConfig && (
              <ConfigCard
                initial={config}
                onSave={handleSaveConfig}
                onCancel={messages.length > 0 || config.apiKey ? () => setShowConfig(false) : undefined}
              />
            )}
          </AnimatePresence>

          {messages.length === 0 && !showConfig && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center justify-center text-center py-8"
            >
              <motion.div
                animate={{ y: [0, -6, 0] }}
                transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                className="grid place-items-center size-12 rounded-2xl bg-violet-500/8 border border-violet-500/20 mb-3"
              >
                <Sparkles className="size-5 text-violet-500/80" />
              </motion.div>
              <p className="text-[12.5px] font-medium text-foreground/85 mb-1">
                {t('aiTitle')}
              </p>
              <p className="text-[11px] text-muted-foreground max-w-[260px] mb-4">
                {t('aiWelcomeHint')}
              </p>
              <div className="grid gap-1.5 w-full max-w-[280px]">
                {QUICK_PROMPTS.map((p) => (
                  <button
                    key={p}
                    onClick={() => send(p)}
                    className="text-left text-[11px] rounded-md border border-border/60 bg-muted/30 hover:bg-primary/5 hover:border-primary/30 px-2.5 py-1.5 text-foreground/80 hover:text-foreground transition-colors"
                  >
                    ✦ {p}
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          <AnimatePresence initial={false}>
            {messages.map((m) => (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.18 }}
                className={`flex gap-2 ${
                  m.role === 'user' ? 'flex-row-reverse' : 'flex-row'
                }`}
              >
                <div
                  className={`flex-shrink-0 grid place-items-center size-6 rounded-lg ${
                    m.role === 'user'
                      ? 'bg-primary/10 border border-primary/25'
                      : 'bg-violet-500/10 border border-violet-500/25'
                  }`}
                >
                  {m.role === 'user' ? (
                    <User className="size-3.5 text-primary" />
                  ) : (
                    <Bot className="size-3.5 text-violet-500" />
                  )}
                </div>
                <div
                  className={`max-w-[82%] rounded-xl px-3 py-2 ${
                    m.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted/50 border border-border/60'
                  }`}
                >
                  {m.role === 'user' ? (
                    <p className="text-[12.5px] leading-relaxed whitespace-pre-wrap break-words">
                      {m.content}
                    </p>
                  ) : (
                    renderAssistantContent(m.content, handleInsert)
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {loading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex gap-2 items-center text-muted-foreground"
            >
              <div className="flex-shrink-0 grid place-items-center size-6 rounded-lg bg-violet-500/10 border border-violet-500/25">
                <Bot className="size-3.5 text-violet-500" />
              </div>
              <div className="rounded-xl px-3 py-2.5 bg-muted/50 border border-border/60 flex items-center gap-2">
                <Loader2 className="size-3.5 animate-spin text-primary" />
                <span className="text-[11.5px]">思考中…</span>
                <span className="flex gap-0.5">
                  {[0, 1, 2].map((i) => (
                    <motion.span
                      key={i}
                      animate={{ opacity: [0.3, 1, 0.3] }}
                      transition={{
                        duration: 1.2,
                        repeat: Infinity,
                        delay: i * 0.2,
                      }}
                      className="size-1 rounded-full bg-primary"
                    />
                  ))}
                </span>
              </div>
            </motion.div>
          )}

          {error && (
            <p className="text-[10.5px] text-rose-500/80 text-center">{error}</p>
          )}
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="border-t border-border/60 bg-muted/20 p-2.5">
        <div className="flex items-end gap-2 rounded-xl border border-border/60 bg-background focus-within:border-primary/40 focus-within:ring-1 focus-within:ring-primary/20 transition-all">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('aiInputPlaceholder') || '问任何数学问题…'}
            rows={2}
            className="flex-1 resize-none bg-transparent text-[12.5px] leading-relaxed px-3 py-2 outline-none placeholder:text-muted-foreground/60 max-h-32"
          />
          <Button
            size="sm"
            className="m-1 h-7 w-7 p-0 bg-primary hover:bg-primary/90"
            onClick={() => send(input)}
            disabled={!input.trim() || loading}
          >
            {loading ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Send className="size-3.5" />
            )}
          </Button>
        </div>
        <p className="text-[9.5px] text-muted-foreground/60 mt-1 px-1">
          Enter 发送 · Shift+Enter 换行 · AI 回复中的脚本可一键插入编辑器
        </p>
      </div>
    </div>
  );
}
