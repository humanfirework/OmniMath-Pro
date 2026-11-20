'use client';

/**
 * OmniMath Pro — 教育模块 · AI 助教
 *
 * 面向学习的 AI 对话面板：
 *  - 专属教学 system prompt（分步讲解、鼓励式、不直接给答案先引导）。
 *  - 流式输出（chatCompleteStream），数学公式用 KaTeX 渲染。
 *  - 监听 `omnimath:ai-explain` 事件：每日一题 / 错题本里的「AI 讲解」按钮
 *    会把题目上下文直接送到这里自动发送，形成「做题 → 讲解」闭环。
 *  - 无 API Key 时显示配置卡，不会崩溃。
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  Send,
  Loader2,
  User,
  Bot,
  Trash2,
  Settings,
  KeyRound,
  Eye,
  EyeOff,
  GraduationCap,
  Lightbulb,
} from 'lucide-react';
import { FormulaRenderer } from '@/components/workbench/FormulaRenderer';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  chatCompleteStream,
  loadAIConfig,
  saveAIConfig,
  hasAPIKey,
  DEFAULT_BASE_URL,
  DEFAULT_MODEL,
  type AIMessage,
  type AIConfig,
} from '@/lib/ai-client';
import {
  useEducationStore,
  computeStats,
} from '@/lib/store/educationStore';
import { STAGE_LABEL } from '@/lib/education/content';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

/** 教学助教系统提示：重引导、轻评判、分步、鼓励。 */
const EDU_SYSTEM_PROMPT = `你是 OmniMath Pro 里的「AI 助教」，专门帮助青少年循序渐进地学好数学、建立对数学的信心。

回答规范：
1. 用中文，语气温暖、耐心、鼓励。绝不嘲笑或指责错误。
2. 数学公式用 LaTeX 包裹：行内 $...$，独立块 $$...$$。
3. 讲题必须分步骤，每步给关键变形，并解释「为什么这样做」。
4. 学习理念：
   - 当学生提问一道题时，不要直接甩出答案。先引导思路、给一个提示，鼓励 TA 自己再试；若 TA 明确表示想不出来，再给出完整解答。
   - 指出错误时要温和，比如「这一步很有想法，只是符号/顺序上差了一点」。
5. 针对青少年：语言要生活化、有画面感，多用比喻（如函数像"机器"、积分像"算面积"）。
6. 不要伪造数据或结论；不确定就如实说明并给思路。
7. 当学生分享自己的做题过程时，先肯定努力，再指出可改进之处。`;

/**
 * 根据学习者画像（学段 + 近期统计）生成一段 system context。
 * 让 AI 助教真正「适配」学生的年龄段与当前水平，而不是对所有人都用同一套讲法。
 */
function buildLearnerContext(): string {
  const s = useEducationStore.getState();
  const stats = computeStats(s.days, s.wrongBook, s.recoveries, s.linkedTools, s.papers);
  const stageLabel = STAGE_LABEL[s.stage];
  const lines: string[] = [];
  lines.push(`【学习者画像】这位学生当前选择的是「${stageLabel}」学段。`);
  if (stats.streak > 0) lines.push(`当前连续学习 ${stats.streak} 天，累计答对 ${stats.totalSolved} 道「每日一题」。`);
  if (stats.wrongCount > 0) lines.push(`错题本里还有 ${stats.wrongCount} 道待复盘题目，请多鼓励并从错误中讲解。`);
  lines.push(`请根据「${stageLabel}」学段的认知水平调整讲解深度与用词：低龄多用生活化比喻，高等学段可以适当引入严谨的符号与推导。`);
  // 若用户导入了教材，把 AI 提炼的重点作为参考资料注入，让助教「与教材联络」：
  // 学生问教材相关问题时，应优先依据这些重点讲解，并可据此出题。
  const tb = s.textbook;
  if (tb) {
    lines.push(`【当前教材 · ${tb.title}】学生已导入一本教材，以下是由 AI 提炼的学习重点（请作为讲解与出题的参考依据）：`);
    tb.notes.forEach((n, i) => lines.push(`${i + 1}. ${n}`));
    lines.push('当学生问及教材相关概念时，请优先围绕以上重点讲解；也可以根据这些重点出一道对应的小题来帮助学生巩固。');
  }
  return lines.join('\n');
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  id: string;
}

const QUICK_PROMPTS = [
  '我总记不住公式，有没有好记的办法？',
  '怎么理解函数这个概念？',
  '我最近做每日一题总想不出来，怎么调整心态？',
  '帮我出一道理科题练练手',
];

/** 把 AI 回复里的 $...$ / $$...$$ 渲染成 KaTeX，其余按文本展示。 */
function renderAiText(text: string) {
  const parts = text.split(/(\$\$[\s\S]*?\$\$|\$[^$\n]+\$)/g);
  return parts.map((p, i) => {
    if (p.startsWith('$$') && p.endsWith('$$') && p.length > 4) {
      return (
        <div key={i} className="my-1.5 overflow-x-auto">
          <FormulaRenderer latex={p.slice(2, -2)} displayMode />
        </div>
      );
    }
    if (p.startsWith('$') && p.endsWith('$') && p.length > 2) {
      return (
        <span key={i} className="inline-block align-middle">
          <FormulaRenderer latex={p.slice(1, -1)} />
        </span>
      );
    }
    return <span key={i}>{p}</span>;
  });
}

/** 错误码 → 友好提示。 */
function friendlyError(error: string): string {
  switch (error) {
    case 'NO_API_KEY':
      return '还没有配置 API Key，请在右上角设置后重试。';
    case 'NETWORK_ERROR':
      return '网络连接失败，请检查网络后重试。';
    case 'HTTP_401':
    case 'HTTP_403':
      return 'API Key 无效或没有权限，请检查配置。';
    case 'HTTP_429':
      return '请求过于频繁，请稍后再试。';
    case 'ABORTED':
      return '已停止生成。';
    case 'EMPTY_REPLY':
      return 'AI 没有返回内容，请重试。';
    default:
      if (error.startsWith('HTTP_5')) return 'AI 服务暂时异常，请稍后再试。';
      if (error.startsWith('HTTP_')) return `请求失败（${error.slice(5)}），请检查配置。`;
      return `请求失败：${error}`;
  }
}

export function EducationAiTutor() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConfig, setShowConfig] = useState(!hasAPIKey());
  const [config, setConfig] = useState<AIConfig>(() => loadAIConfig());
  const [showKey, setShowKey] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastPendingRef = useRef<string | null>(null);
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading, showConfig]);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) {
        // 用户点击发送但没输入任何内容 → 给出明确提示，而不是静默无响应。
        toast.info('先输入一点内容，再发给助教吧', { description: '可以是一个问题、一道题，或你卡住的困惑。' });
        return;
      }
      if (loading) return;
      setError(null);
      const userMsg: ChatMessage = { role: 'user', content: trimmed, id: `u-${Date.now()}` };
      const history: AIMessage[] = messages.map((m) => ({ role: m.role, content: m.content }));
      setMessages((m) => [...m, userMsg]);
      setInput('');
      setLoading(true);

      const assistantId = `a-${Date.now()}`;
      setMessages((m) => [...m, { role: 'assistant', content: '', id: assistantId }]);
      const ac = new AbortController();
      abortRef.current = ac;
      const appendDelta = (delta: string) =>
        setMessages((m) =>
          m.map((msg) => (msg.id === assistantId ? { ...msg, content: msg.content + delta } : msg)),
        );

      const res = await chatCompleteStream(
        [...history, { role: 'user', content: trimmed }],
        {
          signal: ac.signal,
          onToken: appendDelta,
          temperature: 0.6,
          // 教学专属 system prompt + 实时学习者画像，让助教真正个性化。
          context: `${EDU_SYSTEM_PROMPT}\n\n${buildLearnerContext()}`,
        },
      );

      if (res.ok) {
        setMessages((m) =>
          m.map((msg) => (msg.id === assistantId ? { ...msg, content: res.reply } : msg)),
        );
        lastPendingRef.current = null;
      } else if (res.error === 'NO_API_KEY') {
        lastPendingRef.current = trimmed;
        setShowConfig(true);
        setConfig(loadAIConfig());
        setMessages((m) => m.filter((msg) => msg.id !== userMsg.id && msg.id !== assistantId));
        setInput(trimmed);
      } else if (res.error !== 'ABORTED') {
        const friendly = friendlyError(res.error);
        setError(friendly);
        setMessages((m) =>
          m.map((msg) => (msg.id === assistantId ? { ...msg, content: `⚠️ ${friendly}` } : msg)),
        );
        lastPendingRef.current = null;
      } else {
        lastPendingRef.current = null;
      }
      abortRef.current = null;
      setLoading(false);
    },
    [loading, messages],
  );

  /** 接收「AI 讲解」外部触发（每日一题 / 错题本按钮）。 */
  useEffect(() => {
    const handler = (e: Event) => {
      const prompt = (e as CustomEvent<string>).detail;
      if (typeof prompt !== 'string' || !prompt.trim()) return;
      setInput(prompt);
      clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = setTimeout(() => {
        setInput('');
        void send(prompt);
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
      const pending = lastPendingRef.current;
      if (pending) {
        lastPendingRef.current = null;
        clearTimeout(pendingTimerRef.current);
        pendingTimerRef.current = setTimeout(() => {
          setInput('');
          void send(pending);
        }, 0);
      }
    },
    [send],
  );

  const stopStreaming = () => abortRef.current?.abort();

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col">
      {/* 头部 */}
      <div className="mb-3 flex items-center justify-between rounded-2xl border border-border/60 bg-card/60 px-4 py-3 backdrop-blur-sm">
        <div className="flex items-center gap-2.5">
          <div className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-indigo-500/20 to-teal-500/20">
            <GraduationCap className="size-4 text-primary" />
          </div>
          <div>
            <div className="text-[13px] font-semibold text-foreground">AI 助教</div>
            <div className="text-[10.5px] text-muted-foreground">
              一步步引导你，错了也没关系
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setShowConfig((v) => !v)}
            className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-accent/60 hover:text-foreground transition-colors"
            title="AI 配置"
          >
            <Settings className="size-4" />
          </button>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setMessages([]);
                setError(null);
              }}
              className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-accent/60 hover:text-foreground transition-colors"
              title="清空对话"
            >
              <Trash2 className="size-4" />
            </button>
          )}
        </div>
      </div>

      {/* 对话区 */}
      <ScrollArea className="min-h-0 flex-1">
        <div ref={scrollRef} className="space-y-3 pb-2">
          {/* 配置卡 */}
          <AnimatePresence>
            {showConfig && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="rounded-2xl border border-border/60 bg-card/70 p-4 backdrop-blur-sm"
              >
                <div className="mb-2 flex items-center gap-2 text-primary">
                  <KeyRound className="size-3.5" />
                  <span className="text-[12px] font-medium">AI 配置</span>
                </div>
                <p className="mb-3 text-[11px] text-muted-foreground">
                  填写 OpenAI 兼容接口的密钥即可使用 AI 助教。密钥仅保存在本地。
                </p>
                <div className="mb-2 flex items-center gap-1.5">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={config.apiKey}
                    onChange={(e) => setConfig((c) => ({ ...c, apiKey: e.target.value }))}
                    placeholder="sk-..."
                    spellCheck={false}
                    autoComplete="off"
                    className="h-8 flex-1 rounded-lg border border-border/60 bg-background px-2.5 text-[12px] outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey((v) => !v)}
                    className="grid size-8 place-items-center rounded-lg border border-border/60 text-muted-foreground hover:text-foreground"
                  >
                    {showKey ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    value={config.baseURL}
                    onChange={(e) => setConfig((c) => ({ ...c, baseURL: e.target.value }))}
                    placeholder={DEFAULT_BASE_URL}
                    spellCheck={false}
                    className="h-8 rounded-lg border border-border/60 bg-background px-2.5 text-[11.5px] outline-none focus:border-primary/40"
                  />
                  <input
                    value={config.model}
                    onChange={(e) => setConfig((c) => ({ ...c, model: e.target.value }))}
                    placeholder={DEFAULT_MODEL}
                    spellCheck={false}
                    className="h-8 rounded-lg border border-border/60 bg-background px-2.5 text-[11.5px] outline-none focus:border-primary/40"
                  />
                </div>
                <div className="mt-3 flex justify-end gap-2">
                  {config.apiKey && (
                    <button
                      type="button"
                      onClick={() => setShowConfig(false)}
                      className="h-8 rounded-lg px-3 text-[11.5px] text-muted-foreground hover:text-foreground"
                    >
                      取消
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={!config.apiKey.trim()}
                    onClick={() => handleSaveConfig(config)}
                    className="h-8 rounded-lg bg-primary px-3.5 text-[11.5px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
                  >
                    保存并开始
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* 空状态 */}
          {messages.length === 0 && !showConfig && (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="mb-3 grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500/15 to-teal-500/15">
                <Lightbulb className="size-6 text-primary" />
              </div>
              <p className="mb-1 text-[13.5px] font-semibold text-foreground/90">
                学习路上有个贴心助教
              </p>
              <p className="mb-4 max-w-xs text-[11.5px] text-muted-foreground">
                可以问概念、问公式、问错题，它会一步步带你，而不是直接给答案。
              </p>
              <div className="grid w-full max-w-[320px] gap-1.5">
                {QUICK_PROMPTS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => send(p)}
                    className="rounded-xl border border-border/60 bg-card/50 px-3 py-2 text-left text-[12px] text-foreground/80 hover:border-primary/30 hover:bg-accent/40 transition-colors"
                  >
                    ✦ {p}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 消息流 */}
          <AnimatePresence initial={false}>
            {messages.map((m) => (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn('flex gap-2', m.role === 'user' && 'flex-row-reverse')}
              >
                <div
                  className={cn(
                    'grid size-7 shrink-0 place-items-center rounded-xl',
                    m.role === 'user' ? 'bg-primary/15' : 'bg-gradient-to-br from-indigo-500/20 to-teal-500/20',
                  )}
                >
                  {m.role === 'user' ? (
                    <User className="size-3.5 text-primary" />
                  ) : (
                    <Bot className="size-3.5 text-primary" />
                  )}
                </div>
                <div
                  className={cn(
                    'max-w-[82%] rounded-2xl border px-3.5 py-2.5 text-[12.5px] leading-relaxed',
                    m.role === 'user'
                      ? 'border-primary/20 bg-primary/8 text-foreground'
                      : 'border-border/60 bg-card/70 text-foreground/90 backdrop-blur-sm',
                  )}
                >
                  {m.role === 'user' ? (
                    <p className="whitespace-pre-wrap break-words">{m.content}</p>
                  ) : (
                    <div className="whitespace-pre-wrap break-words">{renderAiText(m.content)}</div>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {loading && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <div className="grid size-7 place-items-center rounded-xl bg-gradient-to-br from-indigo-500/20 to-teal-500/20">
                <Bot className="size-3.5 text-primary" />
              </div>
              <div className="flex items-center gap-2 rounded-2xl border border-border/60 bg-card/70 px-3 py-2">
                <Loader2 className="size-3.5 animate-spin text-primary" />
                <span className="text-[11.5px]">正在思考，别着急…</span>
              </div>
            </div>
          )}

          {error && (
            <p className="text-center text-[10.5px] text-rose-500">{error}</p>
          )}
        </div>
      </ScrollArea>

      {/* 输入区 */}
      <div className="mt-3 rounded-2xl border border-border/60 bg-card/60 p-2 backdrop-blur-sm">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
            placeholder="问问助教，关于数学的任何困惑…"
            rows={2}
            className="max-h-32 flex-1 resize-none rounded-xl bg-background/50 px-3 py-2 text-[12.5px] leading-relaxed outline-none placeholder:text-muted-foreground/60"
          />
          {loading ? (
            <button
              type="button"
              onClick={stopStreaming}
              className="grid size-9 shrink-0 place-items-center rounded-xl bg-rose-500/15 text-rose-500 hover:bg-rose-500/25 transition-colors"
              title="停止"
            >
              <Loader2 className="size-4 animate-spin" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void send(input)}
              className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Send className="size-4" />
            </button>
          )}
        </div>
        <div className="mt-1 flex items-center justify-between px-1 text-[9.5px] text-muted-foreground/60">
          <span>Enter 发送 · Shift+Enter 换行</span>
          <span className="inline-flex items-center gap-1">
            <KeyRound className="size-3" />
            密钥仅存本地，学习记录不上传
          </span>
        </div>
      </div>
    </div>
  );
}
