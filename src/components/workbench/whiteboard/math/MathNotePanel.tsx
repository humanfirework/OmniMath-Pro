'use client';

/**
 * Floating math-note draft panel.
 *
 * Recognition runs after the pen has been idle for ~1s. The panel keeps the
 * result editable: handwriting recognition is never perfect, so the user can
 * fix a symbol before inserting the calculation / graph onto the board.
 */

import { useMemo, useState } from 'react';
import { Check, RefreshCw, Sigma, Sparkles, X } from 'lucide-react';
import type { RecognizedGlyph } from '@/lib/mathnotes/recognize';
import { evaluateMathNote } from '@/lib/mathnotes/expression';
import { chatComplete, hasAPIKey, type AIMessage } from '@/lib/ai-client';
import { FormulaRenderer } from '@/components/workbench/FormulaRenderer';
import { HandwritingText } from './HandwritingText';
import { MathPlot } from './MathCardView';
import { cn } from '@/lib/utils';

export interface MathNoteDraft {
  /** Editable linear expression. */
  text: string;
  /** Recognized display text (e.g. 2.5×365). */
  display: string;
  /** Text produced by the recognizer before any correction. */
  sourceText?: string;
  glyphs: RecognizedGlyph[];
  confidence: number;
  error?: string;
}

export interface MathNotePanelProps {
  draft: MathNoteDraft;
  onChange: (text: string) => void;
  onRetry: () => void;
  onInsert: (text: string) => void;
  onClose: () => void;
}

export function MathNotePanel({ draft, onChange, onRetry, onInsert, onClose }: MathNotePanelProps) {
  const evaluation = useMemo(() => evaluateMathNote(draft.text), [draft.text]);
  const confidence = Math.round(draft.confidence * 100);
  const [explain, setExplain] = useState<string | null>(null);
  const [explaining, setExplaining] = useState(false);

  const handleExplain = async () => {
    if (explaining) return;
    if (!hasAPIKey()) {
      setExplain('请先在预览区的 AI 标签中配置 API Key。');
      return;
    }
    setExplaining(true);
    setExplain(null);
    const context =
      evaluation.ok && evaluation.kind === 'number'
        ? `${draft.text} = ${evaluation.valueText}`
        : `${draft.text}（函数图像）`;
    const messages: AIMessage[] = [
      {
        role: 'system',
        content: '你是数学老师。用不超过 4 句中文解释这个表达式或结果的关键含义与推导步骤，不要客套。',
      },
      { role: 'user', content: context },
    ];
    const result = await chatComplete(messages);
    setExplaining(false);
    setExplain(
      result.ok
        ? result.reply
        : result.error === 'NO_API_KEY'
          ? '请先配置 API Key。'
          : 'AI 请求失败，请稍后重试。',
    );
  };

  return (
    <div
      className={cn(
        'absolute bottom-3 left-1/2 z-30 w-[min(94vw,540px)] -translate-x-1/2',
        'rounded-xl border border-border/70 bg-background/95 shadow-xl shadow-black/15 backdrop-blur',
      )}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex h-8 items-center gap-1.5 border-b border-border/50 bg-muted/40 px-2.5">
        <Sigma className="size-3.5 text-primary" />
        <span className="text-[11px] font-medium">数学笔记</span>
        <span
          className={cn(
            'rounded px-1 py-0.5 text-[9px] font-mono',
            confidence >= 65
              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
              : 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
          )}
          title="本地识别置信度"
        >
          {confidence}%
        </span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭"
          className="grid size-5 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="size-3" />
        </button>
      </div>

      <div className="space-y-2 px-2.5 py-2">
        <input
          value={draft.text}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && evaluation.ok) {
              e.preventDefault();
              onInsert(draft.text);
            }
          }}
          spellCheck={false}
          aria-label="识别结果（可编辑）"
          className="h-7 w-full rounded-md border border-border/70 bg-background px-2 font-mono text-[12px] outline-none transition-colors focus:border-primary/70"
          placeholder="识别结果，可手动修正…"
        />

        <div className="min-h-[52px] rounded-lg border border-border/50 bg-muted/20 px-2 py-1.5">
          {evaluation.ok && evaluation.kind === 'number' ? (
            <div className="flex items-center gap-2">
              <FormulaRenderer latex={evaluation.latex} className="min-w-0 shrink truncate text-[11px]" />
              <span className="text-muted-foreground">=</span>
              <HandwritingText
                text={evaluation.valueText ?? ''}
                glyphs={draft.glyphs}
                size={30}
                className="text-foreground"
              />
            </div>
          ) : evaluation.ok && evaluation.kind === 'plot' && evaluation.plot ? (
            <div className="flex items-center gap-2">
              <MathPlot
                samples={evaluation.plot.samples}
                range={evaluation.plot.range}
                className="h-[76px] w-[190px] shrink-0"
              />
              <div className="min-w-0">
                <FormulaRenderer latex={evaluation.latex} className="min-w-0 truncate text-[11px]" />
                <p className="mt-0.5 text-[9.5px] text-muted-foreground">拖动卡片后可在图上滚轮缩放</p>
              </div>
            </div>
          ) : (
            <p className="py-1 text-[11px] text-rose-500">
              {evaluation.error ?? draft.error ?? '识别失败'}
            </p>
          )}
        </div>

        {explain && (
          <div className="max-h-28 overflow-auto whitespace-pre-wrap rounded-md border border-primary/20 bg-primary/5 px-2 py-1.5 text-[11px] leading-relaxed text-foreground/85">
            {explain}
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          <p className="text-[9.5px] text-muted-foreground">
            识别有误？直接修改上方表达式 · 停笔 1 秒自动识别
          </p>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => void handleExplain()}
              disabled={explaining}
              className="inline-flex items-center gap-1 rounded-md border border-primary/30 px-2 py-1 text-[10.5px] text-primary hover:bg-primary/10 disabled:opacity-50"
              title="只把当前表达式发送给已配置的 AI"
            >
              <Sparkles className={cn('size-3', explaining && 'animate-pulse')} />
              AI 解释
            </button>
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-1 rounded-md border border-border/70 px-2 py-1 text-[10.5px] text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <RefreshCw className="size-3" />
              重试
            </button>
            <button
              type="button"
              onClick={() => onInsert(draft.text)}
              disabled={!evaluation.ok}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-[10.5px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              <Check className="size-3" />
              插入画布
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
