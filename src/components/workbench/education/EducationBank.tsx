'use client';

/**
 * OmniMath Pro — 教育模块 · 题库 & 导入
 *
 * 管理「自定义题库」：
 *  - 展示已导入的自定义题目，可逐条删除 / 一键清空。
 *  - 导入方式一：粘贴 JSON 数组（离线、本地校验，最可靠）。
 *  - 导入方式二：粘贴从 PDF / 网页 / 教材复制来的题目文本，用 AI 助教
 *    自动整理成规范题目（复用已有 AI 配置与接口，形成「导入 → 整理 → 每日一题」闭环）。
 *
 * 所有导入都经过 isQuestion / sanitizeQuestion 校验，脏数据不会污染选题池。
 */

import { useMemo, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Library,
  Upload,
  Sparkles,
  Trash2,
  Check,
  X,
  FileJson,
  BookOpen,
  GraduationCap,
  Loader2,
  Info,
  FileText,
  FileUp,
  NotebookPen,
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useEducationStore } from '@/lib/store/educationStore';
import { STAGE_LABEL, type Question, type QuestionStage } from '@/lib/education/content';
import { chatCompleteStream } from '@/lib/ai-client';
import { MathText } from './MathText';
import { cn } from '@/lib/utils';

const TEMPLATE = `[
  {
    "id": "my-01",
    "level": 2,
    "stage": "middle",
    "topic": "我的自定义题",
    "text": "一个长方形的长是 6，宽是 4，面积是多少？",
    "encouragement": "长乘宽就是面积，你一定行。",
    "kind": "numeric",
    "answer": 24,
    "answerLatex": "6 \\\\times 4 = 24",
    "hint": "面积 = 长 × 宽",
    "solution": ["面积 = 长 × 宽 = 6 × 4 = 24。"]
  }
]`;

/** 从模型回复里尽量稳健地提取一个 JSON 数组（容忍 ```json 代码块与前后杂文本）。 */
function extractJsonArray(text: string): unknown[] | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('[');
  const end = candidate.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

const AI_IMPORT_SYSTEM = `你是 OmniMath Pro 的「题目整理器」。用户会粘贴一段题目原文（可能来自 PDF、网页或教材，可能是中文数学题，含数字 / 方程 / 图形描述）。
请把每一道题整理成规范 JSON 对象，并只输出一个 JSON 数组（不要任何多余文字、不要 markdown 代码块标记以外的解释）。
每个对象字段如下（务必严格遵守）：
- id: 字符串，唯一，如 "custom-1"
- level: 1|2|3（难度星级）
- stage: "primary"|"middle"|"high"|"university"（小学/初中/高中/大学，根据题目难度判断）
- topic: 字符串，简短主题标签
- text: 字符串，题目正文（数学符号可用 LaTeX，行内用 $...$）
- encouragement: 字符串，鼓励语（可选）
- kind: "numeric"（填数字答案）| "expression"（填表达式）| "choice"（选择题）
- answer: kind 为 numeric 填数字，expression 填标准表达式字符串，choice 不填
- options: kind 为 choice 时必须提供至少 2 个选项的字符串数组
- correctIndex: kind 为 choice 时填正确选项下标（从 0 开始）
- answerLatex: 答案的 LaTeX 展示（可选）
- hint: 提示语（可选）
- solution: 字符串数组，分步骤讲解，每一步用 LaTeX
- tools: 可选，数组，取 "linalg" | "solver" | "stats" 中与该题相关的
只返回 JSON 数组本身。`;

/** 「教材重点提炼」系统提示：把整本 / 大段教材整理成清晰的重点清单。 */
const TEXTBOOK_SUMMARY_SYSTEM = `你是 OmniMath Pro 的「教材重点提炼器」。用户会粘贴一段教材原文（可能是一整章或一整本书的文本）。
请把其中的核心概念、公式、定义、重要结论、易错点提炼成一份「学习重点清单」。
要求：
1. 用中文，分点输出，每点一行，以 "- " 开头。
2. 每点尽量自包含、简洁（一句话到一个短句），方便后续作为 AI 助教的参考资料与出题依据。
3. 只输出清单本身，不要额外解释、不要 markdown 标题。
4. 控制在 8–20 个重点。`;

/** 「根据教材出题」系统提示：基于教材内容生成规范题目（复用题目整理器的字段规范）。 */
const TEXTBOOK_QUIZ_SYSTEM = `${AI_IMPORT_SYSTEM}

额外要求：
- 这些题目必须严格「源自」用户提供的教材内容，覆盖教材里的重点概念与公式。
- 题型可以混合：选择题（kind=choice）、填空题（kind=numeric 或 expression）。
- stage 根据教材内容与题目难度合理判断（小学/初中/高中/大学）。
- 尽量让题目能覆盖教材的多个重要知识点，难度适中，先易后难。`;

/** 处理拖入 / 选择的文件：PDF 提取文本，txt/md 直接读文本，结果填入输入框。 */
async function readFileToText(f: File): Promise<string> {
  const lower = f.name.toLowerCase();
  if (lower.endsWith('.pdf')) {
    const buf = await f.arrayBuffer();
    return extractPdfText(buf);
  }
  return f.text();
}

/**
 * 尽力从 PDF 二进制中提取文本（仅适用于「未压缩文本流」的简单 PDF）。
 * 对于扫描版 / FlateDecode 压缩的 PDF 无法解压，返回较少或空文本。
 * 提取到的原文会交给 AI 助教进一步整理成规范题目。
 */
function extractPdfText(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  // Latin-1 逐字节解码可保留 PDF 流中的原始字节序列。
  const raw = new TextDecoder('latin1').decode(bytes);
  const out: string[] = [];
  // 匹配 ( ... ) Tj 或 [ ... ] TJ 两种文本绘制操作中的字符串。
  const single = /\(((?:\\.|[^\\()])*)\)\s*Tj/g;
  let m: RegExpExecArray | null;
  while ((m = single.exec(raw)) !== null) out.push(m[1]);
  const arr = /\[((?:[^\]])*)\]\s*TJ/g;
  while ((m = arr.exec(raw)) !== null) {
    // 数组中每个 ( 串 是一小段文本，用空格拼接。
    const inner = /\(((?:\\.|[^\\()])*)\)/g;
    let n: RegExpExecArray | null;
    while ((n = inner.exec(m[1])) !== null) out.push(n[1]);
  }
  // 去掉 PDF 常见转义（\n 换行、\r、\( \) 转义括号、\\ 反斜杠）。
  return out
    .map((s) =>
      s
        .replace(/\\\(/g, '(')
        .replace(/\\\)/g, ')')
        .replace(/\\\\/g, '\\')
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, ''),
    )
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function EducationBank() {
  const customQuestions = useEducationStore((s) => s.customQuestions);
  const importQuestions = useEducationStore((s) => s.importQuestions);
  const removeCustomQuestion = useEducationStore((s) => s.removeCustomQuestion);
  const clearCustomQuestions = useEducationStore((s) => s.clearCustomQuestions);
  const textbook = useEducationStore((s) => s.textbook);
  const setTextbook = useEducationStore((s) => s.setTextbook);

  const [text, setText] = useState('');
  const [mode, setMode] = useState<'json' | 'text' | 'textbook'>('json');
  const [result, setResult] = useState<{ added: number; skipped: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  // 文件拖拽 / 选择导入
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileReading, setFileReading] = useState(false);
  // 教材模式状态
  const [notesLoading, setNotesLoading] = useState(false);
  const [notesResult, setNotesResult] = useState<number | null>(null);
  const [quizLoading, setQuizLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // 防重复文件：同一文件重复 drop 不重复处理。
  const lastFileRef = useRef<string | null>(null);

  const stats = useMemo(
    () => ({
      total: customQuestions.length,
      stages: new Set(customQuestions.map((q) => q.stage)).size,
      withTools: customQuestions.filter((q) => q.tools && q.tools.length > 0).length,
    }),
    [customQuestions],
  );

  const handleImportJson = () => {
    setError(null);
    setResult(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      setError('JSON 解析失败，请检查括号与引号是否完整。');
      return;
    }
    if (!Array.isArray(parsed)) {
      setError('请提供一个「题目对象数组」（以 [ 开头、] 结尾）。');
      return;
    }
    const res = importQuestions(parsed);
    setResult({ added: res.added, skipped: res.skipped });
    if (res.added === 0) setError('没有新增题目：可能是格式不符或 id 已存在。');
  };

  const handleAiImport = async () => {
    if (!text.trim()) return;
    setError(null);
    setResult(null);
    setAiLoading(true);
    const res = await chatCompleteStream(
      [{ role: 'user', content: text }],
      {
        temperature: 0.2,
        context: AI_IMPORT_SYSTEM,
      },
    );
    setAiLoading(false);
    if (!res.ok) {
      if (res.error === 'NO_API_KEY') {
        setError('还没有配置 AI，请在「AI 助教」里填入 API Key，或改用「粘贴 JSON」方式导入。');
      } else {
        setError(`AI 整理失败：${res.error}。可改用「粘贴 JSON」方式导入。`);
      }
      return;
    }
    const arr = extractJsonArray(res.reply);
    if (!arr) {
      setError('AI 没有返回可识别的题目数组，请检查原文是否包含完整题目。');
      return;
    }
    const imp = importQuestions(arr);
    setResult({ added: imp.added, skipped: imp.skipped });
    if (imp.added === 0) setError('AI 整理出的题目格式不符，请调整后重试。');
  };

  /** 处理拖入 / 选择的文件：读文本并填入输入框。 */
  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const f = files[0];
    if (lastFileRef.current === `${f.name}-${f.size}-${f.lastModified}`) return;
    lastFileRef.current = `${f.name}-${f.size}-${f.lastModified}`;
    setFileName(f.name);
    setFileReading(true);
    setError(null);
    setResult(null);
    try {
      const extracted = await readFileToText(f);
      if (!extracted.trim()) {
        setError('未能从该文件提取到文本（PDF 可能是扫描版或压缩流）。可改用「粘贴文本」方式。');
        setFileName(null);
        return;
      }
      setText(extracted);
    } catch {
      setError('读取文件失败，请重试。');
      setFileName(null);
    } finally {
      setFileReading(false);
    }
  };

  /** 教材模式：「AI 提取重点」——整理教材原文并沉淀到 store，供出题与助教参考。 */
  const handleExtractNotes = async () => {
    const content = text.trim() || textbook?.content?.trim() || '';
    if (!content) {
      setError('请先粘贴或拖入教材内容，再提取重点。');
      return;
    }
    setError(null);
    setResult(null);
    setNotesLoading(true);
    const res = await chatCompleteStream(
      [{ role: 'user', content: content.slice(0, 20000) }],
      { temperature: 0.2, context: TEXTBOOK_SUMMARY_SYSTEM },
    );
    setNotesLoading(false);
    if (!res.ok) {
      setError(res.error === 'NO_API_KEY' ? '还没有配置 AI，请在「AI 助教」里填入 API Key，或先手动整理。' : `AI 提炼失败：${res.error}`);
      return;
    }
    const notes = res.reply
      .split('\n')
      .map((l) => l.replace(/^[-*#\d.\s]+/, '').trim())
      .filter((l) => l.length > 0)
      .slice(0, 20);
    if (notes.length === 0) {
      setError('AI 没有返回可识别的重点，请重试或更换内容。');
      return;
    }
    setTextbook({ title: fileName ?? textbook?.title ?? '导入教材', content, notes, chars: content.length });
    setNotesResult(notes.length);
  };

  /** 教材模式：「根据教材出题」——让 AI 基于教材内容生成规范题目并导入。 */
  const handleGenerateFromTextbook = async () => {
    const content = text.trim() || textbook?.content?.trim() || '';
    if (!content) {
      setError('请先粘贴或拖入教材内容，再生成题目。');
      return;
    }
    setError(null);
    setResult(null);
    setQuizLoading(true);
    const res = await chatCompleteStream(
      [{ role: 'user', content: `教材内容如下：\n${content.slice(0, 20000)}` }],
      { temperature: 0.2, context: TEXTBOOK_QUIZ_SYSTEM },
    );
    setQuizLoading(false);
    if (!res.ok) {
      setError(res.error === 'NO_API_KEY' ? '还没有配置 AI，请在「AI 助教」里填入 API Key。' : `AI 出题失败：${res.error}`);
      return;
    }
    const arr = extractJsonArray(res.reply);
    if (!arr || arr.length === 0) {
      setError('AI 没有返回可识别的题目数组，请重试。');
      return;
    }
    const imp = importQuestions(arr);
    setResult({ added: imp.added, skipped: imp.skipped });
    if (imp.added === 0) setError('AI 生成的题目格式不符，请调整后重试。');
  };

  const stageName = (s?: QuestionStage) => (s ? STAGE_LABEL[s] : '—');

  return (
    <div className="mx-auto max-w-4xl">
      {/* 概览 */}
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        {[
          { label: '自定义题目', value: stats.total, icon: Library, color: 'text-primary' },
          { label: '覆盖学段', value: stats.stages, icon: GraduationCap, color: 'text-emerald-600' },
          { label: '可联动专业工具', value: stats.withTools, icon: Sparkles, color: 'text-indigo-500' },
        ].map((c) => {
          const Icon = c.icon;
          return (
            <div
              key={c.label}
              className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card/60 px-4 py-3 backdrop-blur-sm"
            >
              <div className={cn('grid size-9 place-items-center rounded-xl bg-muted/40', c.color)}>
                <Icon className="size-4" />
              </div>
              <div>
                <div className={cn('text-xl font-semibold', c.color)}>{c.value}</div>
                <div className="text-[10.5px] text-muted-foreground">{c.label}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 导入区 */}
      <div className="mb-4 rounded-3xl border border-border/60 bg-card/60 p-5 backdrop-blur-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="grid size-8 place-items-center rounded-xl bg-primary/10">
              <Upload className="size-4 text-primary" />
            </div>
            <div>
              <div className="text-[13px] font-semibold text-foreground">导入题目</div>
              <div className="text-[10.5px] text-muted-foreground">
                导入后会进入「每日一题」选题池，与内置题库一起按学段 / 难度出题
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-border/60 bg-background/40 p-0.5">
            {(
              [
                { id: 'json', label: '粘贴 JSON', icon: FileJson },
                { id: 'text', label: '粘贴文本 / PDF', icon: BookOpen },
                { id: 'textbook', label: '导入教材 · 出题', icon: NotebookPen },
              ] as const
            ).map((m) => {
              const MIcon = m.icon;
              const active = mode === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setMode(m.id);
                    setError(null);
                    setResult(null);
                    setNotesResult(null);
                  }}
                  className={cn(
                    'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11.5px] font-medium transition-colors',
                    active ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <MIcon className="size-3.5" />
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mb-3 flex items-start gap-2 rounded-xl border border-sky-500/20 bg-sky-500/5 p-3 text-[11.5px] text-foreground/80">
          <Info className="mt-0.5 size-3.5 shrink-0 text-sky-500" />
          <span>
            {mode === 'json'
              ? '粘贴一个题目对象数组（字段见下方模板）。每道题需包含 id / level / text / kind / solution；kind 为 choice 时需带 options 与 correctIndex。'
              : mode === 'text'
                ? '把 PDF、网页或教材里的题目原文整段复制进来（也可直接拖入 .pdf / .txt / .md 文件），点「AI 整理成题目」即可自动生成规范题目。未配置 AI 时也可手动整理成 JSON 后粘贴。'
                : '把教材原文整段粘贴进来，或直接把 .pdf / .txt / .md 教材文件拖进来。先「AI 提取重点」沉淀教材要点（供 AI 助教参考），再「根据教材出题」生成覆盖教材重点的规范题目并入库。'}
          </span>
        </div>

        {/* 文件拖拽区 + 文本输入 */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={(e) => {
            // 离开当前 drop 目标时才取消高亮，避免子元素抖动。
            if (e.currentTarget === e.target) setDragging(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            handleFiles(e.dataTransfer.files);
          }}
          className={cn(
            'relative rounded-2xl border-2 border-dashed transition-colors',
            dragging
              ? 'border-primary/60 bg-primary/5'
              : 'border-border/60 bg-background/40',
          )}
        >
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={
              mode === 'json'
                ? TEMPLATE
                : mode === 'text'
                  ? '例如：\n1. 一个长方形的长是 6，宽是 4，面积是多少？\n2. 解方程 x + 7 = 15。'
                  : '把教材原文粘贴到这里，或把教材文件拖入上方虚线框…\n（支持 .pdf / .txt / .md，PDF 自动提取文本）'
            }
            spellCheck={false}
            rows={8}
            className={cn(
              'w-full resize-y rounded-2xl border-0 bg-transparent px-3.5 py-3 font-mono text-[12px] leading-relaxed outline-none placeholder:text-muted-foreground/50',
              mode === 'json' && 'border border-border/60 bg-background/50',
            )}
          />
          {/* 拖拽遮罩提示 */}
          <AnimatePresence>
            {dragging && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="pointer-events-none absolute inset-0 grid place-items-center rounded-2xl bg-background/80 backdrop-blur-sm"
              >
                <div className="flex flex-col items-center gap-1 text-center">
                  <FileUp className="size-6 text-primary" />
                  <span className="text-[13px] font-medium text-foreground">
                    {fileReading ? '正在读取文件…' : '松开以导入文件'}
                  </span>
                  <span className="text-[10.5px] text-muted-foreground">支持 .pdf / .txt / .md</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* 文件操作行 */}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.txt,.md,text/plain,application/pdf"
            className="hidden"
            onChange={(e) => {
              handleFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={fileReading}
            className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-border/60 px-2.5 text-[11px] text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors disabled:opacity-40"
          >
            {fileReading ? <Loader2 className="size-3 animate-spin" /> : <FileText className="size-3" />}
            {fileName ?? (fileReading ? '正在读取…' : '选择文件导入')}
          </button>
          {fileName && (
            <button
              type="button"
              onClick={() => {
                setFileName(null);
                setText('');
              }}
              className="inline-flex h-7 items-center gap-1 rounded-lg px-2 text-[11px] text-muted-foreground hover:text-rose-500 transition-colors"
            >
              <X className="size-3" />
              清除
            </button>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {mode === 'json' ? (
            <button
              type="button"
              onClick={handleImportJson}
              disabled={!text.trim()}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary px-4 text-[12.5px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors"
            >
              <FileJson className="size-3.5" />
              校验并导入
            </button>
          ) : mode === 'text' ? (
            <button
              type="button"
              onClick={handleAiImport}
              disabled={!text.trim() || aiLoading}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary px-4 text-[12.5px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors"
            >
              {aiLoading ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Sparkles className="size-3.5" />
              )}
              {aiLoading ? '正在整理…' : 'AI 整理成题目'}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={handleExtractNotes}
                disabled={notesLoading}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-primary/40 bg-primary/10 px-4 text-[12.5px] font-medium text-primary hover:bg-primary/15 transition-colors disabled:opacity-40"
              >
                {notesLoading ? <Loader2 className="size-3.5 animate-spin" /> : <NotebookPen className="size-3.5" />}
                {notesLoading ? '正在提炼…' : 'AI 提取重点'}
              </button>
              <button
                type="button"
                onClick={handleGenerateFromTextbook}
                disabled={quizLoading}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary px-4 text-[12.5px] font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40"
              >
                {quizLoading ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                {quizLoading ? '正在出题…' : '根据教材出题'}
              </button>
            </>
          )}
          {notesResult !== null && (
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-1.5 text-[11.5px] font-medium text-sky-600 dark:text-sky-400">
              <NotebookPen className="size-3.5" />
              已提炼 {notesResult} 条重点
            </span>
          )}
          {result && (
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-[11.5px] font-medium text-emerald-600 dark:text-emerald-400">
              <Check className="size-3.5" />
              已新增 {result.added} 道，跳过 {result.skipped} 道
            </span>
          )}
          {error && (
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-[11.5px] font-medium text-rose-500">
              <X className="size-3.5" />
              {error}
            </span>
          )}
        </div>
      </div>

      {/* 已导入教材 · 摘要 + 重点 */}
      {mode === 'textbook' && textbook && (
        <div className="mb-4 rounded-3xl border border-border/60 bg-card/60 p-5 backdrop-blur-sm">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="grid size-8 place-items-center rounded-xl bg-sky-500/10">
                <BookOpen className="size-4 text-sky-600 dark:text-sky-400" />
              </div>
              <div>
                <div className="text-[13px] font-semibold text-foreground">
                  {textbook.title || '导入教材'}
                </div>
                <div className="text-[10.5px] text-muted-foreground">
                  {textbook.chars.toLocaleString()} 字 · {textbook.notes.length} 条重点
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setTextbook(null);
                setNotesResult(null);
              }}
              className="inline-flex h-7 items-center gap-1 rounded-lg border border-border/60 px-2.5 text-[11px] text-muted-foreground hover:text-rose-500 hover:border-rose-500/40 transition-colors"
            >
              <Trash2 className="size-3" />
              移除教材
            </button>
          </div>
          {textbook.notes.length > 0 && (
            <div className="rounded-xl border border-border/60 bg-background/40 p-3">
              <div className="mb-1.5 text-[10.5px] font-medium text-muted-foreground">
                AI 提炼的重点（AI 助教也会参考这些内容）
              </div>
              <ul className="space-y-1">
                {textbook.notes.map((n, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-[12px] leading-relaxed text-foreground/85">
                    <span className="mt-0.5 size-1.5 shrink-0 rounded-full bg-sky-500/70" />
                    <span>{n}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}


      {/* 自定义题目列表 */}
      <div className="rounded-3xl border border-border/60 bg-card/60 backdrop-blur-sm">
        <div className="flex items-center justify-between border-b border-border/60 px-5 py-3">
          <span className="text-[13px] font-semibold text-foreground">我的题库</span>
          {customQuestions.length > 0 && (
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              className="inline-flex h-7 items-center gap-1 rounded-lg border border-border/60 px-2.5 text-[11px] text-muted-foreground hover:text-rose-500 hover:border-rose-500/40 transition-colors"
            >
              <Trash2 className="size-3" />
              清空全部
            </button>
          )}
        </div>

        {customQuestions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Library className="mb-2 size-8 text-muted-foreground/40" />
            <p className="text-[13px] font-medium text-foreground/80">题库还是空的</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              导入你的自定义题目，让「每日一题」更贴合你的学习计划。
            </p>
          </div>
        ) : (
          <ScrollArea className="max-h-[360px]">
            <div className="divide-y divide-border/50">
              {customQuestions.map((q: Question) => (
                <div key={q.id} className="flex items-start gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="mb-0.5 flex flex-wrap items-center gap-1.5">
                      <span className="rounded-full border border-border/60 px-2 py-0.5 text-[10px] text-muted-foreground">
                        {stageName(q.stage)} · {q.level} 星
                      </span>
                      <span className="rounded-full border border-border/60 px-2 py-0.5 text-[10px] text-muted-foreground">
                        {q.topic}
                      </span>
                      {q.tools && q.tools.length > 0 && (
                        <span className="rounded-full border border-indigo-400/30 bg-indigo-500/10 px-2 py-0.5 text-[10px] font-medium text-indigo-600 dark:text-indigo-300">
                          可联动工具
                        </span>
                      )}
                    </div>
                    <p className="text-[13px] leading-relaxed text-foreground">
                      <MathText text={q.text} />
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeCustomQuestion(q.id)}
                    className="grid size-7 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-rose-500/10 hover:text-rose-500 transition-colors"
                    title="删除该题"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </div>

      {/* 清空全部自定义题目 · 二次确认 */}
      <Dialog open={confirmClear} onOpenChange={setConfirmClear}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="size-4 text-rose-500" />
              清空全部自定义题目？
            </DialogTitle>
            <DialogDescription>
              将删除你导入的全部自定义题目，且不可撤销。内置题库不受影响。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setConfirmClear(false)}>
              取消
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                clearCustomQuestions();
                setConfirmClear(false);
              }}
            >
              <Trash2 className="size-3.5" />
              确认清空
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
