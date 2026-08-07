'use client';

/**
 * OmniMath Pro — AI Assistant Panel
 *
 * A real chat interface that talks to an OpenAI-compatible LLM endpoint
 * directly from the browser (no Next.js API route — static export forbids it).
 * Supports: math Q&A, formula explanation, generating executable scripts,
 * inserting generated scripts into the editor, KaTeX rendering of math.
 *
 * Agent capabilities (see `@/lib/ai-tools` + `chatWithTools` in `@/lib/ai-client`):
 *  - 上下文注入：发送时把当前文件 / 绘图表达式 / 变量表 / 最近错误组装成
 *    一条 system 消息随对话发送（可用输入框上方的开关关闭）。
 *  - Function Calling：模型可通过 evaluate_expression / solve_equation /
 *    plot_function / get_workspace_state 四个工具操作工作台；工具调用过程
 *    以折叠条实时显示在消息流中。
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
  Wrench,
  ChevronDown,
  Paperclip,
} from 'lucide-react';
import { useWorkbenchStore } from '@/lib/store/workbench';
import { useFileSystemStore } from '@/lib/store/fileSystemStore';
import { useT, t as translateRaw, type TranslationDict } from '@/lib/i18n';
import { FormulaRenderer } from '@/components/workbench/FormulaRenderer';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  chatWithTools,
  chatWithToolsStream,
  loadAIConfig,
  saveAIConfig,
  DEFAULT_BASE_URL,
  DEFAULT_MODEL,
  type AIMessage,
  type AIConfig,
  type AIToolCallRecord,
} from '@/lib/ai-client';
import {
  WORKBENCH_TOOLS,
  buildContextMessage,
  collectWorkspaceSnapshot,
  executeWorkbenchTool,
} from '@/lib/ai-tools';

/**
 * 引用尚未合入 i18n 词典的新键：词典中存在时返回译文，
 * 否则回退到给定的默认中文文案（待主代理统一合入词典后即可去掉回退）。
 */
function tAI(key: string, fallback: string): string {
  const v = translateRaw(key as keyof TranslationDict);
  return v === key ? fallback : v;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  id: string;
  /** 本轮回复中发生过的工具调用记录（折叠条展示）。 */
  toolCalls?: AIToolCallRecord[];
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
                  {translateRaw('aiCopy')}
                </Button>
                <Button
                  size="sm"
                  className="h-6 px-2.5 text-[10.5px] bg-primary text-primary-foreground hover:bg-primary/90"
                  onClick={() => onInsert(s)}
                >
                  <ArrowDownToLine className="size-3 mr-1" />
                  {translateRaw('aiInsertEditor')}
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
      return translateRaw('aiErrNoKey');
    case 'NETWORK_ERROR':
      return translateRaw('aiErrNetwork');
    case 'HTTP_401':
    case 'HTTP_403':
      return translateRaw('aiErrAuth');
    case 'HTTP_429':
      return translateRaw('aiErrRateLimit');
    case 'PARSE_ERROR':
      return translateRaw('aiErrParse');
    case 'EMPTY_REPLY':
      return translateRaw('aiErrEmpty');
    case 'ABORTED':
      return translateRaw('aiErrCancelled');
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

/** 工具参数的一行预览：`expr: "sin(x)"` — 超长截断。 */
function formatArgsPreview(args: Record<string, unknown>): string {
  const parts = Object.entries(args).map(([k, v]) => {
    const val = JSON.stringify(v) ?? String(v);
    return `${k}: ${val}`;
  });
  const text = parts.join(', ') || '…';
  return text.length > 64 ? `${text.slice(0, 64)}…` : text;
}

/** 单条工具调用的折叠条 — "调用 plot_function(expr: "sin(x)")"，展开可见参数与结果。 */
function ToolCallStrip({ record }: { record: AIToolCallRecord }) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="backdrop-blur-sm border rounded-md p-2"
      style={{
        backgroundColor: 'var(--ai-tool-bg)',
        borderColor: 'var(--ai-tool-border)',
      }}
    >
      <CollapsibleTrigger
        className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left text-[11px] rounded-lg transition-colors"
        style={{ color: 'var(--primary)' }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor =
            'color-mix(in oklab, var(--primary) 10%, transparent)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = '';
        }}
      >
        <Wrench className="size-3 shrink-0" />
        <span className="flex-1 min-w-0 truncate font-mono">
          {tAI('aiToolCallLabel', '调用')} {record.name}({formatArgsPreview(record.args)})
        </span>
        {!record.ok && (
          <span
            className="shrink-0 text-[9px] px-1 py-px rounded border"
            style={{
              backgroundColor: 'color-mix(in oklab, var(--destructive, #ef4444) 15%, transparent)',
              borderColor: 'color-mix(in oklab, var(--destructive, #ef4444) 20%, transparent)',
              color: 'var(--destructive, #ef4444)',
            }}
          >
            {tAI('aiToolFailedLabel', '失败')}
          </span>
        )}
        <ChevronDown
          className={`size-3 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="px-2 pb-2 space-y-1">
        <div>
          <p className="text-[9.5px] text-muted-foreground/70 mb-0.5">
            {tAI('aiToolArgsLabel', '参数')}
          </p>
          <pre className="text-[10.5px] font-mono text-foreground/70 whitespace-pre-wrap break-all max-h-24 overflow-y-auto scrollbar-none rounded bg-background/60 border border-border/40 p-1.5">
            {JSON.stringify(record.args, null, 2)}
          </pre>
        </div>
        <div>
          <p className="text-[9.5px] text-muted-foreground/70 mb-0.5">
            {tAI('aiToolResultLabel', '结果')}
          </p>
          <pre className="text-[10.5px] font-mono text-foreground/70 whitespace-pre-wrap break-all max-h-32 overflow-y-auto scrollbar-none rounded bg-background/60 border border-border/40 p-1.5">
            {record.result}
          </pre>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
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
  const t = useT();
  const [apiKey, setApiKey] = useState(initial.apiKey);
  const [baseURL, setBaseURL] = useState(initial.baseURL);
  const [model, setModel] = useState(initial.model);
  const [showKey, setShowKey] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className="backdrop-blur-sm border rounded-lg p-3 space-y-2.5"
      style={{
        backgroundColor: 'var(--ai-card-bg)',
        borderColor: 'var(--ai-card-border)',
      }}
    >
      <div className="flex items-center gap-2" style={{ color: 'var(--primary)' }}>
        <KeyRound className="size-3.5" />
        <span className="text-[12px] font-medium">{t('aiConfig')}</span>
      </div>
      <p className="text-[11px] text-muted-foreground leading-relaxed">
        {t('aiConfigHint')}
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
            {t('aiCancel')}
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
          {t('aiSave')}
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
  // 上下文注入开关（默认开）— 发送时把工作台状态随对话一起发给模型。
  const [attachContext, setAttachContext] = useState(true);
  // 当前这轮对话里实时发生的工具调用（完成后归档到 assistant 消息上）。
  const [activeToolCalls, setActiveToolCalls] = useState<AIToolCallRecord[]>([]);
  // The last user message we attempted — used to auto-retry after saving config.
  const lastPendingRef = useRef<string | null>(null);
  const pendingSendTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // 当前流式请求的 AbortController，供「停止」按钮中断生成。
  const abortRef = useRef<AbortController | null>(null);

  // 上下文指示器数据（只读订阅，切换文件/增删绘图与变量时自动刷新）。
  const plotsCount = useWorkbenchStore((s) => s.plots.length);
  const variablesCount = useWorkbenchStore((s) => Object.keys(s.variables).length);
  const activeFileName = useFileSystemStore((s) => {
    if (!s.activeFileId) return null;
    const node = s.nodes[s.activeFileId];
    return node && node.type === 'file' ? node.name : null;
  });

  // Auto-scroll to bottom on new message
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading, showConfig, activeToolCalls]);

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
      setActiveToolCalls([]);

      // 上下文注入：发送时采集工作台快照，组装成一条 system 消息随对话发送。
      const context = attachContext
        ? buildContextMessage(collectWorkspaceSnapshot())
        : undefined;

      // 流式输出：先插入一个「流式占位」assistant 气泡，增量文本实时追加到其上。
      const assistantId = `a-${Date.now()}`;
      setMessages((m) => [...m, { role: 'assistant', content: '', id: assistantId }]);

      const ac = new AbortController();
      abortRef.current = ac;
      const appendDelta = (delta: string) => {
        setMessages((m) =>
          m.map((msg) =>
            msg.id === assistantId ? { ...msg, content: msg.content + delta } : msg,
          ),
        );
      };

      // Function Calling + 流式：模型返回 tool_calls → 本地执行 → 回填 → 再请求，
      // 文本增量实时渲染；首轮流式失败自动降级为非流式工具对话。
      const result = await chatWithToolsStream(
        [...history, { role: 'user', content: trimmed }],
        WORKBENCH_TOOLS,
        executeWorkbenchTool,
        {
          context,
          signal: ac.signal,
          onToken: appendDelta,
          onToolCall: (record) =>
            setActiveToolCalls((calls) => [...calls, record]),
        },
      );

      if (result.ok) {
        setMessages((m) =>
          m.map((msg) =>
            msg.id === assistantId
              ? {
                  ...msg,
                  content: result.reply || tAI('aiEmptyReply', '(空回复)'),
                  toolCalls: result.toolCalls.length > 0 ? result.toolCalls : undefined,
                }
              : msg,
          ),
        );
        lastPendingRef.current = null;
      } else if (result.error === 'NO_API_KEY') {
        // Don't crash — surface the config card and remember the message to retry.
        lastPendingRef.current = trimmed;
        setShowConfig(true);
        setConfig(loadAIConfig());
        // Remove the just-added user + placeholder bubbles so the chat stays clean.
        setMessages((m) =>
          m.filter((msg) => msg.id !== userMsg.id && msg.id !== assistantId),
        );
        setInput(trimmed);
      } else if (result.error !== 'ABORTED') {
        const friendly = friendlyError(result.error);
        setError(friendly);
        setMessages((m) =>
          m.map((msg) =>
            msg.id === assistantId
              ? {
                  ...msg,
                  content: `⚠️ ${friendly}`,
                  toolCalls: result.toolCalls.length > 0 ? result.toolCalls : undefined,
                }
              : msg,
          ),
        );
        lastPendingRef.current = null;
      } else {
        // 用户点击「停止」：保留已生成的部分内容。
        lastPendingRef.current = null;
      }
      abortRef.current = null;
      setActiveToolCalls([]);
      setLoading(false);
      inputRef.current?.focus();
    },
    [loading, messages, attachContext],
  );

  /** 停止当前流式生成。 */
  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  // 端到端闭环：接收外部「AI 解释」请求（如 PreviewPanel 的结果解释按钮），
  // 自动填充输入并发送，打通「计算 → 绘图 → AI 解释」链路。
  useEffect(() => {
    const handler = (e: Event) => {
      const prompt = (e as CustomEvent<string>).detail;
      if (typeof prompt !== 'string' || !prompt.trim()) return;
      setInput(prompt);
      // 交给 send 的 debounce 通道，避免与 loading 状态竞争。
      clearTimeout(pendingSendTimerRef.current);
      pendingSendTimerRef.current = setTimeout(() => {
        send(prompt);
      }, 60);
    };
    window.addEventListener('omnimath:ai-explain', handler);
    return () => window.removeEventListener('omnimath:ai-explain', handler);
  }, [send]);

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
        clearTimeout(pendingSendTimerRef.current);
        pendingSendTimerRef.current = setTimeout(() => {
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
            className="grid place-items-center size-6 rounded-lg border"
            style={{
              backgroundColor: 'color-mix(in oklab, var(--primary) 10%, transparent)',
              borderColor: 'color-mix(in oklab, var(--primary) 25%, transparent)',
            }}
          >
            <Sparkles className="size-3.5" style={{ color: 'var(--primary)' }} />
          </motion.div>
          <span className="text-[12px] font-medium text-foreground">
            {t('aiTitle')}
          </span>
          {!config.apiKey && (
            <span
              className="text-[9.5px] px-1.5 py-0.5 rounded-full border"
              style={{
                backgroundColor: 'color-mix(in oklab, var(--primary) 12%, transparent)',
                borderColor: 'color-mix(in oklab, var(--primary) 22%, transparent)',
                color: 'var(--primary)',
              }}
            >
              {t('aiNotConfigured')}
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
            title={t('aiSettings')}
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
              {t('aiClear')}
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
                className="grid place-items-center size-12 rounded-2xl border mb-3"
                style={{
                  backgroundColor: 'color-mix(in oklab, var(--primary) 8%, transparent)',
                  borderColor: 'color-mix(in oklab, var(--primary) 20%, transparent)',
                }}
              >
                <Sparkles
                  className="size-5"
                  style={{ color: 'color-mix(in oklab, var(--primary) 80%, transparent)' }}
                />
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
                    className="backdrop-blur-sm border rounded-md px-2.5 py-1.5 text-xs cursor-pointer transition-colors text-left text-foreground/80 hover:text-foreground"
                    style={{
                      backgroundColor: 'var(--ai-quick-bg)',
                      borderColor: 'var(--ai-quick-border)',
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                        'var(--ai-quick-hover-bg)';
                      (e.currentTarget as HTMLButtonElement).style.borderColor =
                        'var(--ai-quick-hover-border)';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                        'var(--ai-quick-bg)';
                      (e.currentTarget as HTMLButtonElement).style.borderColor =
                        'var(--ai-quick-border)';
                    }}
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
                  className="flex-shrink-0 grid place-items-center size-6 rounded-lg border"
                  style={{
                    backgroundColor: 'color-mix(in oklab, var(--primary) 10%, transparent)',
                    borderColor: 'color-mix(in oklab, var(--primary) 25%, transparent)',
                  }}
                >
                  {m.role === 'user' ? (
                    <User className="size-3.5" style={{ color: 'var(--primary)' }} />
                  ) : (
                    <Bot className="size-3.5" style={{ color: 'var(--primary)' }} />
                  )}
                </div>
                <div
                  className="max-w-[82%] rounded-xl px-3 py-2 backdrop-blur-sm border"
                  style={
                    m.role === 'user'
                      ? {
                          backgroundColor: 'var(--ai-user-bg)',
                          borderColor: 'var(--ai-user-border)',
                          color: 'var(--ai-user-fg)',
                        }
                      : {
                          backgroundColor: 'var(--ai-assistant-bg)',
                          borderColor: 'var(--ai-assistant-border)',
                          color: 'var(--ai-assistant-fg)',
                        }
                  }
                >
                  {m.role === 'user' ? (
                    <p className="text-[12.5px] leading-relaxed whitespace-pre-wrap break-words">
                      {m.content}
                    </p>
                  ) : (
                    <>
                      {m.toolCalls && m.toolCalls.length > 0 && (
                        <div className="mb-2 space-y-1">
                          {m.toolCalls.map((tc) => (
                            <ToolCallStrip key={tc.id} record={tc} />
                          ))}
                        </div>
                      )}
                      {renderAssistantContent(m.content, handleInsert)}
                    </>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {/* 进行中的工具调用（实时展示，完成后归档到 assistant 消息内） */}
          {activeToolCalls.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex gap-2"
            >
              <div
                className="flex-shrink-0 grid place-items-center size-6 rounded-lg border"
                style={{
                  backgroundColor: 'color-mix(in oklab, var(--primary) 10%, transparent)',
                  borderColor: 'color-mix(in oklab, var(--primary) 25%, transparent)',
                }}
              >
                <Wrench className="size-3.5" style={{ color: 'var(--primary)' }} />
              </div>
              <div className="max-w-[82%] flex-1 space-y-1">
                {activeToolCalls.map((tc) => (
                  <ToolCallStrip key={tc.id} record={tc} />
                ))}
              </div>
            </motion.div>
          )}

          {loading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex gap-2 items-center text-muted-foreground"
            >
              <div
                className="flex-shrink-0 grid place-items-center size-6 rounded-lg border"
                style={{
                  backgroundColor: 'color-mix(in oklab, var(--primary) 10%, transparent)',
                  borderColor: 'color-mix(in oklab, var(--primary) 25%, transparent)',
                }}
              >
                <Bot className="size-3.5" style={{ color: 'var(--primary)' }} />
              </div>
              <div
                className="rounded-xl px-3 py-2.5 backdrop-blur-sm border flex items-center gap-2"
                style={{
                  backgroundColor: 'var(--ai-assistant-bg)',
                  borderColor: 'var(--ai-assistant-border)',
                  color: 'var(--ai-assistant-fg)',
                }}
              >
                <Loader2 className="size-3.5 animate-spin text-primary" />
                <span className="text-[11.5px]">{t('aiThinking')}</span>
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
            <p
              className="text-[10.5px] text-center"
              style={{ color: 'color-mix(in oklab, var(--destructive, #ef4444) 80%, transparent)' }}
            >
              {error}
            </p>
          )}
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="border-t border-border/60 bg-muted/20 p-2.5">
        {/* 上下文注入开关 + "已附加上下文" 指示 */}
        <div className="flex items-center gap-1.5 px-1 pb-1.5">
          <Switch
            checked={attachContext}
            onCheckedChange={setAttachContext}
            aria-label={tAI('aiContextToggle', '附带工作台上下文')}
            className="scale-[0.7] origin-left"
          />
          <span className="text-[10px] text-muted-foreground">
            {tAI('aiContextToggle', '附带工作台上下文')}
          </span>
          {attachContext && (
            <span
              className="ml-auto inline-flex items-center gap-1 text-[9.5px] px-1.5 py-0.5 rounded-full border max-w-[65%] truncate"
              style={{
                backgroundColor: 'color-mix(in oklab, var(--primary) 12%, transparent)',
                borderColor: 'color-mix(in oklab, var(--primary) 28%, transparent)',
                color: 'var(--primary)',
              }}
              title={tAI('aiContextAttachedHint', '发送时会附带当前文件、绘图与变量信息')}
            >
              <Paperclip className="size-2.5 shrink-0" />
              <span className="truncate">
                {tAI('aiContextAttached', '已附加上下文')} ·{' '}
                {activeFileName ?? tAI('aiContextNoFile', '无文件')} ·{' '}
                {tAI('aiContextPlots', '绘图')}×{plotsCount} ·{' '}
                {tAI('aiContextVars', '变量')}×{variablesCount}
              </span>
            </span>
          )}
        </div>
        <div
          className="flex items-end gap-2 rounded-xl border border-border/60 bg-background focus-within:border-primary/40 focus-within:ring-1 focus-within:ring-primary/20 transition-all"
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('aiAskPlaceholder')}
            rows={2}
            className="flex-1 resize-none text-[12.5px] leading-relaxed px-3 py-2 outline-none placeholder:text-muted-foreground/60 max-h-32 rounded-xl"
            style={{
              backgroundColor: 'var(--ai-input-bg)',
              borderColor: 'var(--ai-input-border)',
            }}
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
