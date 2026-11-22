'use client';

/**
 * OmniMath Pro — 内置数学键盘
 *
 * 手机上系统输入法打 `^`、`√`、`θ`、`π` 都很别扭，这个小键盘直接按键写入
 * 规范表达式（`−` → `-`、`×` → `*`、`√` → `sqrt(`、`θ` → `theta`）。
 *
 * 键盘使用 `onPointerDown={preventDefault}`，点按时不会让输入框失焦，
 * 因此光标位置可以保持不变；插入 / 退格由父组件通过导出的
 * `insertAtSelection` / `deleteBackward` 完成，以便同步受控状态。
 */

import { useMemo, useState, type ReactNode } from 'react';
import { CornerDownLeft, Delete, Eraser } from 'lucide-react';
import { cn } from '@/lib/utils';

export type MathKeypadTab = 'common' | 'letters' | 'numbers';

interface KeypadKey {
  label: ReactNode;
  /** 插入到输入框的规范文本。 */
  insert?: string;
  action?: 'backspace' | 'enter' | 'clear';
  /** 占据的列数（默认 1）。 */
  span?: number;
  tone?: 'var' | 'op' | 'fn' | 'num' | 'action';
  aria?: string;
}

const TABS: Array<{ id: MathKeypadTab; label: string }> = [
  { id: 'common', label: '常用' },
  { id: 'letters', label: '字母' },
  { id: 'numbers', label: '数字' },
];

const ACTIONS: KeypadKey[] = [
  {
    label: <Delete className="size-4" />,
    action: 'backspace',
    span: 2,
    tone: 'action',
    aria: '退格',
  },
  {
    label: <CornerDownLeft className="size-4" />,
    action: 'enter',
    span: 2,
    tone: 'action',
    aria: '确认',
  },
  {
    label: <Eraser className="size-4" />,
    action: 'clear',
    span: 2,
    tone: 'action',
    aria: '清空输入',
  },
];

const COMMON_KEYS: KeypadKey[] = [
  { label: 'x', insert: 'x', tone: 'var' },
  { label: 'y', insert: 'y', tone: 'var' },
  { label: 'z', insert: 'z', tone: 'var' },
  { label: 't', insert: 't', tone: 'var' },
  { label: 'θ', insert: 'theta', tone: 'var' },
  { label: 'π', insert: 'pi', tone: 'var' },

  { label: '+', insert: '+', tone: 'op' },
  { label: '−', insert: '-', tone: 'op' },
  { label: '×', insert: '*', tone: 'op' },
  { label: '÷', insert: '/', tone: 'op' },
  { label: '^', insert: '^', tone: 'op' },
  { label: '√', insert: 'sqrt(', tone: 'fn' },

  { label: '(', insert: '(', tone: 'op' },
  { label: ')', insert: ')', tone: 'op' },
  { label: '=', insert: ' = ', tone: 'op' },
  { label: ',', insert: ', ', tone: 'op' },
  { label: '.', insert: '.', tone: 'op' },
  { label: '|x|', insert: 'abs(', tone: 'fn' },

  { label: 'sin', insert: 'sin(', tone: 'fn' },
  { label: 'cos', insert: 'cos(', tone: 'fn' },
  { label: 'tan', insert: 'tan(', tone: 'fn' },
  { label: 'ln', insert: 'ln(', tone: 'fn' },
  { label: 'log', insert: 'log(', tone: 'fn' },
  { label: 'exp', insert: 'exp(', tone: 'fn' },

  ...ACTIONS,
];

const NUMBER_KEYS: KeypadKey[] = [
  { label: '7', insert: '7', tone: 'num' },
  { label: '8', insert: '8', tone: 'num' },
  { label: '9', insert: '9', tone: 'num' },
  { label: '+', insert: '+', tone: 'op' },
  { label: '−', insert: '-', tone: 'op' },
  { label: '×', insert: '*', tone: 'op' },

  { label: '4', insert: '4', tone: 'num' },
  { label: '5', insert: '5', tone: 'num' },
  { label: '6', insert: '6', tone: 'num' },
  { label: '÷', insert: '/', tone: 'op' },
  { label: '^', insert: '^', tone: 'op' },
  { label: '√', insert: 'sqrt(', tone: 'fn' },

  { label: '1', insert: '1', tone: 'num' },
  { label: '2', insert: '2', tone: 'num' },
  { label: '3', insert: '3', tone: 'num' },
  { label: '(', insert: '(', tone: 'op' },
  { label: ')', insert: ')', tone: 'op' },
  { label: '=', insert: ' = ', tone: 'op' },

  { label: '0', insert: '0', tone: 'num' },
  { label: '.', insert: '.', tone: 'op' },
  { label: ',', insert: ', ', tone: 'op' },
  { label: 'e', insert: 'e', tone: 'var' },
  { label: 'π', insert: 'pi', tone: 'var' },
  { label: 'θ', insert: 'theta', tone: 'var' },

  ...ACTIONS,
];

const LETTER_KEYS: KeypadKey[] = [
  ...'xyzabcdefghijklmnopqrstuvw'.split('').map((ch) => ({
    label: ch,
    insert: ch,
    tone: 'var' as const,
  })),
  { label: 'e', insert: 'e', tone: 'var' },
  { label: 'θ', insert: 'theta', tone: 'var' },
  { label: 'π', insert: 'pi', tone: 'var' },
  { label: 'φ', insert: 'phi', tone: 'var' },
];

function keysForTab(tab: MathKeypadTab): KeypadKey[] {
  switch (tab) {
    case 'letters':
      return [...LETTER_KEYS, ...ACTIONS];
    case 'numbers':
      return NUMBER_KEYS;
    default:
      return COMMON_KEYS;
  }
}

/** 在光标 / 选区处插入文本，返回新值和新光标位置。 */
export function insertAtSelection(
  el: HTMLInputElement | HTMLTextAreaElement,
  text: string,
): { next: string; caret: number } {
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? start;
  return {
    next: el.value.slice(0, start) + text + el.value.slice(end),
    caret: start + text.length,
  };
}

/** 退格：有选区时删除选区，否则删除一个字符（函数名整体删除）。 */
export function deleteBackward(
  el: HTMLInputElement | HTMLTextAreaElement,
): { next: string; caret: number } {
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? start;
  if (start !== end) {
    return { next: el.value.slice(0, start) + el.value.slice(end), caret: start };
  }
  if (start === 0) return { next: el.value, caret: 0 };

  const before = el.value.slice(0, start);
  const fn = /(sin|cos|tan|ln|log|sqrt|abs|exp)\($/.exec(before);
  const cut = fn ? fn[1].length + 1 : 1;
  return {
    next: el.value.slice(0, start - cut) + el.value.slice(end),
    caret: start - cut,
  };
}

export interface MathKeypadProps {
  onInsert: (text: string) => void;
  onBackspace: () => void;
  onClear?: () => void;
  onEnter?: () => void;
  className?: string;
  defaultTab?: MathKeypadTab;
}

export function MathKeypad({
  onInsert,
  onBackspace,
  onClear,
  onEnter,
  className,
  defaultTab = 'common',
}: MathKeypadProps) {
  const [tab, setTab] = useState<MathKeypadTab>(defaultTab);
  const keys = useMemo(() => keysForTab(tab), [tab]);

  const handleKey = (key: KeypadKey) => {
    if (key.action === 'backspace') return onBackspace();
    if (key.action === 'enter') return onEnter?.();
    if (key.action === 'clear') return onClear?.();
    if (key.insert) onInsert(key.insert);
  };

  return (
    <div
      className={cn(
        'flex flex-col gap-1.5 border-t border-border/60 bg-background/60 px-2 py-1.5',
        className,
      )}
      // 点按键盘时不抢走输入框焦点，光标位置才能保留。
      onPointerDown={(e) => e.preventDefault()}
    >
      <div className="flex items-center gap-1">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={cn(
              'rounded-md px-2 py-0.5 text-[10.5px] transition-colors',
              tab === item.id
                ? 'bg-primary/15 font-medium text-primary'
                : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
            )}
          >
            {item.label}
          </button>
        ))}
        <span className="ml-auto pr-0.5 text-[9px] text-muted-foreground/60">
          点按输入
        </span>
      </div>

      <div className="grid grid-cols-6 gap-1">
        {keys.map((key, i) => (
          <button
            key={`${key.label}-${i}`}
            type="button"
            onClick={() => handleKey(key)}
            aria-label={key.aria}
            tabIndex={-1}
            style={key.span ? { gridColumn: `span ${key.span} / span ${key.span}` } : undefined}
            className={cn(
              'flex h-8 select-none items-center justify-center rounded-md border text-[13px] leading-none transition-colors active:scale-[0.97]',
              key.tone === 'op' &&
                'border-border/50 bg-muted/30 text-foreground/80 hover:bg-accent/70',
              key.tone === 'var' &&
                'border-primary/25 bg-primary/[0.06] font-mono italic text-primary hover:bg-primary/15',
              key.tone === 'fn' &&
                'border-border/50 bg-background/70 font-mono text-[11.5px] text-foreground/80 hover:bg-accent/70',
              key.tone === 'num' &&
                'border-border/50 bg-background/70 font-mono text-[13px] text-foreground/90 hover:bg-accent/70',
              key.tone === 'action' &&
                'border-border/50 bg-background/50 text-muted-foreground hover:bg-accent/70 hover:text-foreground',
            )}
          >
            {key.label}
          </button>
        ))}
      </div>
    </div>
  );
}
