'use client';

/**
 * OmniMath Pro — 就地 AI 输入框（ComfyUI 风格）
 *
 * 在模块（蓝图节点 / 求解器 / 线代 / 编辑器）的输入面板旁放一个小输入框 +
 * 「✨」发送按钮。用户写下需求后，把「模块 + 上下文 + 用户输入」打包成 prompt，
 * 通过 `omnimath:ai-explain` 事件送入 AI 面板（复用既有外部触发通道）。
 *
 * 输入框为「自动缩放」textarea：单行时为一行高，随内容增长到多行
 * （上限 MAX_ROWS 行），防止长描述被截断看不全，也不会无限撑大。
 */

import { useRef } from 'react';

export interface AiPromptInputProps {
  /** 模块名，如 pipeline / solver / linalg / editor。 */
  module: string;
  /** 附加到 prompt 的上下文（如节点类型 + 当前配置 JSON）。 */
  context?: string;
  placeholder?: string;
  className?: string;
}

/** 描述区最大展开行数（再多也保持这个高度，避免撑爆卡片）。 */
const MAX_ROWS = 4;

export function AiPromptInput({
  module,
  context,
  placeholder = '把需求交给 AI…',
  className = '',
}: AiPromptInputProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);

  /** 根据内容自动调整高度：1 行起步，最多 MAX_ROWS 行。 */
  const autoResize = () => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_ROWS * 20 + 14)}px`;
  };

  const handleSubmit = () => {
    const el = inputRef.current;
    if (!el) return;
    const text = el.value.trim();
    if (!text) return;

    const prompt = [
      `模块:${module}`,
      context && context.trim() ? `上下文:${context.trim()}` : '',
      '',
      text,
    ]
      .filter((s) => s !== '')
      .join('\n');

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('omnimath:ai-explain', { detail: prompt }));
    }
    el.value = '';
    autoResize();
  };

  return (
    <div className={`flex items-end gap-1 ${className}`}>
      <textarea
        ref={inputRef}
        rows={1}
        placeholder={placeholder}
        onChange={autoResize}
        onKeyDown={(e) => {
          // Enter 发送；Shift+Enter 换行。
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
          }
        }}
        className="min-h-7 max-h-[96px] min-w-0 flex-1 resize-none overflow-y-auto rounded-md border border-border/60 bg-background px-2 py-1 text-[11.5px] leading-5 outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20 placeholder:text-muted-foreground/60"
        style={{ height: 30 }}
      />
      <button
        type="button"
        onClick={handleSubmit}
        title="发送给 AI"
        className="grid size-7 shrink-0 place-items-center rounded-md text-base leading-none text-primary/80 hover:bg-primary/10 hover:text-primary transition-colors"
        style={{ fontSize: 18 }}
      >
        ✨
      </button>
    </div>
  );
}
