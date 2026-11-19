'use client';

/**
 * 手写识别浮卡。
 *
 * 停笔约 0.7 秒后，识别结果以一张锚定在笔迹旁的卡片出现：
 *   - 默认是 compact 形态：原始笔迹图 + 可编辑表达式 + 「识别为公式」；
 *   - 用户确认后才插入画布，不会自动把识别结果写进白板；
 *   - 需要看数值/图像/AI 解释时再展开。
 *
 * 识别永远不可能 100% 准确，所以这里始终保留「直接输入」的退路。
 */

import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, RefreshCw, Sigma, Sparkles, X } from 'lucide-react';
import type { RecognizedGlyph } from '@/lib/mathnotes/recognize';
import type { InkPoint, InkView } from '@/lib/ink/types';
import { evaluateMathNote } from '@/lib/mathnotes/expression';
import { chatComplete, hasAPIKey, type AIMessage } from '@/lib/ai-client';
import { FormulaRenderer } from '@/components/workbench/FormulaRenderer';
import { HandwritingText } from './HandwritingText';
import { InkPreview } from './InkPreview';
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
  /** Post-layout glyphs (fractions / sqrt already folded); used for 1-click fixes. */
  layoutGlyphs?: RecognizedGlyph[];
  confidence: number;
  error?: string;
  /** 原始笔迹，用于在识别窗口里回显「我写的是什么」。 */
  sourcePoints?: InkPoint[][];
}

export interface MathNotePanelProps {
  draft: MathNoteDraft;
  onChange: (text: string) => void;
  onRetry: () => void;
  onInsert: (text: string) => void;
  onClose: () => void;
  /** 点击低置信度字符的备选：直接改写该字形并重新生成表达式。 */
  onCorrectGlyph?: (glyphIndex: number, char: string) => void;
  /** 触屏设备底部有 PenDock，识别窗口需要抬高避免遮住笔刷/橡皮。 */
  raised?: boolean;
  /** 识别笔迹的世界坐标（用于把浮卡放到笔迹旁）。 */
  anchor?: { x: number; y: number };
  /** 当前画布视口，与 anchor 一起换算屏幕坐标。 */
  view?: InkView;
}

const QUICK_SYMBOLS = ['sin', 'cos', 'tan', 'ln', '√', 'π', '^', '(', ')', '/'];

export function MathNotePanel({
  draft,
  onChange,
  onRetry,
  onInsert,
  onClose,
  onCorrectGlyph,
  raised,
  anchor,
  view,
}: MathNotePanelProps) {
  const evaluation = useMemo(() => evaluateMathNote(draft.text), [draft.text]);
  const confidence = Math.round(draft.confidence * 100);
  const [expanded, setExpanded] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 低置信度字符 + 分类器给出的备选：点一下就能改，不用整行重打。
  const unsure = useMemo(() => {
    const glyphs = draft.layoutGlyphs ?? draft.glyphs;
    const out: Array<{ index: number; char: string; alternatives: string[] }> = [];
    for (let i = 0; i < glyphs.length; i++) {
      const g = glyphs[i];
      if (g.text || g.superscript || g.subscript) continue;
      const alts = (g.alternatives ?? []).filter((a) => a && a !== g.char).slice(0, 3);
      if ((g.confidence < 0.72 || g.char === '?') && alts.length > 0) {
        out.push({ index: i, char: g.char === '?' ? '□' : g.char, alternatives: alts });
      }
      if (out.length >= 5) break;
    }
    return out;
  }, [draft.glyphs, draft.layoutGlyphs]);

  const [explain, setExplain] = useState<string | null>(null);
  const [explaining, setExplaining] = useState(false);

  // 锚定定位：优先放在笔迹右上方；右侧放不下就换左侧，再 clamp 到画布内。
  useLayoutEffect(() => {
    if (!anchor || !view || raised) {
      setPos(null);
      return;
    }
    const card = cardRef.current;
    const parent = card?.parentElement;
    if (!card || !parent) return;
    const pw = parent.clientWidth;
    const ph = parent.clientHeight;
    const cw = card.offsetWidth;
    const ch = card.offsetHeight;
    const sx = anchor.x * view.k + view.x;
    const sy = anchor.y * view.k + view.y;
    let left = sx + 26;
    if (left + cw > pw - 12) left = sx - cw - 26;
    const maxLeft = Math.max(10, pw - cw - 10);
    // 桌面端左侧有浮动工具坞，别让识别卡压住它；窄屏则优先保证卡片完整。
    left = Math.max(Math.min(64, maxLeft), Math.min(maxLeft, left));
    const top = Math.max(10, Math.min(ph - ch - 10, sy - 18));
    setPos({ left, top });
  }, [anchor, view, raised, expanded, draft.text, unsure.length]);

  const insertSymbol = (symbol: string) => {
    const input = inputRef.current;
    if (!input) {
      onChange(draft.text + symbol);
      return;
    }
    const start = input.selectionStart ?? draft.text.length;
    const end = input.selectionEnd ?? draft.text.length;
    const next = draft.text.slice(0, start) + symbol + draft.text.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      input.focus();
      const caret = start + symbol.length;
      input.setSelectionRange(caret, caret);
    });
  };

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

  const anchored = pos !== null;

  return (
    <div
      ref={cardRef}
      className={cn(
        'absolute z-30 w-[min(94vw,430px)]',
        anchored ? '' : 'left-1/2 -translate-x-1/2',
        !anchored && (raised ? 'bottom-[76px]' : 'bottom-3'),
        'rounded-2xl border border-border/70 bg-background/95 shadow-2xl shadow-black/20 backdrop-blur',
      )}
      style={anchored ? { left: pos.left, top: pos.top } : undefined}
      onPointerDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      role="dialog"
      aria-label="手写识别结果"
    >
      {/* 标题栏 */}
      <div className="flex h-8 items-center gap-1.5 border-b border-border/50 bg-muted/40 px-2.5">
        <Sigma className="size-3.5 text-primary" />
        <span className="text-[11px] font-semibold">识别结果</span>
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
        {/* 原始笔迹 + 表达式 */}
        <div className="flex items-start gap-2">
          {draft.sourcePoints && draft.sourcePoints.length > 0 && (
            <InkPreview
              strokes={draft.sourcePoints}
              className="h-[64px] w-[118px] shrink-0 rounded-lg border border-border/60 bg-background"
            />
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <input
              ref={inputRef}
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
              className="h-8 w-full min-w-0 rounded-lg border border-border/70 bg-background px-2 font-mono text-[12.5px] outline-none transition-colors focus:border-primary/70"
              placeholder="没认出来？直接输入表达式…"
            />
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onInsert(draft.text)}
                disabled={!evaluation.ok}
                className="inline-flex h-7 flex-1 items-center justify-center gap-1 rounded-lg bg-primary px-2.5 text-[11px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                <Check className="size-3" />
                识别为公式
              </button>
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="inline-flex h-7 items-center gap-0.5 rounded-lg border border-border/70 px-2 text-[10.5px] text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-expanded={expanded}
              >
                {expanded ? '收起' : '展开'}
                <ChevronDown className={cn('size-3 transition-transform', expanded && 'rotate-180')} />
              </button>
              <button
                type="button"
                onClick={onRetry}
                aria-label="重试识别"
                title="重试识别"
                className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-border/70 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <RefreshCw className="size-3" />
              </button>
            </div>
          </div>
        </div>

        {!evaluation.ok && (
          <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 px-2 py-1.5">
            <p className="text-[10px] text-rose-500">
              {evaluation.error ?? draft.error ?? '识别失败'} · 可以直接修改表达式
            </p>
            <div className="mt-1 flex flex-wrap gap-1">
              {QUICK_SYMBOLS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => insertSymbol(s)}
                  className="rounded border border-border/60 bg-background/70 px-1.5 py-0.5 font-mono text-[10px] text-foreground/80 hover:border-primary/40 hover:text-primary"
                >
                  {s}
                </button>
              ))}
              <button
                type="button"
                onClick={() => inputRef.current?.focus()}
                className="rounded px-1.5 py-0.5 text-[10px] text-primary hover:bg-primary/10"
              >
                直接输入
              </button>
            </div>
          </div>
        )}

        {/* 展开后才显示计算/图像与 AI，避免一识别就弹一大块 */}
        {expanded && (
          <>
            {unsure.length > 0 && onCorrectGlyph && (
              <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-amber-500/25 bg-amber-500/5 px-2 py-1">
                <span className="text-[9.5px] font-medium text-amber-600 dark:text-amber-400">
                  不太确定
                </span>
                {unsure.map((u) => (
                  <span key={u.index} className="inline-flex items-center gap-0.5 text-[10.5px]">
                    <span className="rounded bg-background/70 px-1 font-mono text-foreground/80">
                      {u.char}
                    </span>
                    <span className="text-muted-foreground">→</span>
                    {u.alternatives.map((alt) => (
                      <button
                        key={alt}
                        type="button"
                        onClick={() => onCorrectGlyph(u.index, alt)}
                        title={`改为 ${alt}（并记住这次写法）`}
                        className="rounded px-1 font-mono text-primary transition-colors hover:bg-primary/10"
                      >
                        {alt}
                      </button>
                    ))}
                  </span>
                ))}
              </div>
            )}

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
                    <p className="mt-0.5 text-[9.5px] text-muted-foreground">
                      确认后会生成可拖动、可缩放的矢量图
                    </p>
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
                停笔 0.7 秒自动识别 · 可随时改表达式
              </p>
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
            </div>
          </>
        )}
      </div>
    </div>
  );
}
