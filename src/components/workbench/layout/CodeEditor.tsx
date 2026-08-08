'use client';

/**
 * OmniMath Pro — CodeMirror 6 Editor
 *
 * Replaces the legacy textarea + gutter with a full-featured CodeMirror 6
 * editor providing:
 *   • Syntax highlighting (custom math tokenizer for Simple mode)
 *   • Line numbers with auto-width
 *   • Code folding
 *   • Bracket matching + auto-close
 *   • Indent guides (2 spaces)
 *   • Linting (mathjs parse errors underlined)
 *   • Custom keymap: Enter=run, Shift+Enter=newline, Tab=indent, Ctrl+/=comment
 */

import { useEffect, useMemo, useRef } from 'react';
import { EditorState, EditorSelection, Compartment, StateField } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, hoverTooltip, showTooltip } from '@codemirror/view';
import { defaultKeymap, historyKeymap, history } from '@codemirror/commands';
import { bracketMatching, indentUnit, indentOnInput, foldGutter, codeFolding, foldKeymap, StreamLanguage, HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { linter, lintGutter } from '@codemirror/lint';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { python } from '@codemirror/lang-python';
import { tags as t } from '@lezer/highlight';
import { math, KEYWORDS, FUNCTIONS, getFunctionInfo, MATLAB_STATEMENTS, type MathFnInfo } from '@/lib/editor/mathLanguage';
import { checkSyntax } from '@/lib/editor/syntaxCheck';
import { semanticDiagnostics } from '@/lib/editor/semanticCheck';
import { useSettingsStore } from '@/lib/store/settingsStore';
import { useWorkbenchStore } from '@/lib/store/workbench';

export interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  onRun: () => void;
  onCursorChange?: (line: number, col: number) => void;
  language?: 'simple' | 'python' | 'matlab';
  placeholder?: string;
  fontSize?: number;
}

export function CodeEditor({
  value,
  onChange,
  onRun,
  onCursorChange,
  language = 'simple',
  placeholder,
  fontSize: fontSizeProp,
}: CodeEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const langCompartment = useRef(new Compartment());
  const themeCompartment = useRef(new Compartment());
  const onChangeRef = useRef(onChange);
  const onRunRef = useRef(onRun);
  const onCursorChangeRef = useRef(onCursorChange);
  const wheelRafRef = useRef<number | null>(null);
  const langRef = useRef(language);

  const storeFontSize = useSettingsStore((s) => s.editorFontSize);
  const fontSize = fontSizeProp ?? storeFontSize;

  // Keep refs in sync without re-creating the editor.
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  useEffect(() => {
    onRunRef.current = onRun;
  }, [onRun]);
  useEffect(() => {
    onCursorChangeRef.current = onCursorChange;
  }, [onCursorChange]);

  /* ─── Math syntax highlighting style ─────────────────────────── */
  // VSCode Dark+/Light+ inspired palette with bold keywords & functions,
  // 区分 常量 / 布尔 / 变量 / 函数 / 数字 / 字符串 / 注释 / 运算符 / 标点。
  const mathHighlightStyle = useMemo(() => HighlightStyle.define([
    { tag: t.comment, color: 'var(--syntax-comment)', fontStyle: 'italic' },
    { tag: t.keyword, color: 'var(--syntax-keyword)', fontWeight: 'bold' },
    { tag: t.controlKeyword, color: 'var(--syntax-keyword)', fontWeight: 'bold' },
    { tag: t.operatorKeyword, color: 'var(--syntax-keyword)', fontWeight: 'bold' },
    { tag: t.function(t.variableName), color: 'var(--syntax-function)', fontWeight: '500' },
    { tag: t.function(t.propertyName), color: 'var(--syntax-function)', fontWeight: '500' },
    { tag: t.variableName, color: 'var(--syntax-variable)' },
    { tag: t.propertyName, color: 'var(--syntax-property)' },
    { tag: t.number, color: 'var(--syntax-number)' },
    { tag: t.string, color: 'var(--syntax-string)' },
    { tag: t.special(t.string), color: 'var(--syntax-string)' },
    { tag: t.atom, color: 'var(--syntax-constant)' },
    { tag: t.bool, color: 'var(--syntax-bool)', fontWeight: 'bold' },
    { tag: t.operator, color: 'var(--syntax-operator)' },
    { tag: t.punctuation, color: 'var(--syntax-punctuation)' },
    { tag: t.bracket, color: 'var(--syntax-bracket)' },
    { tag: t.meta, color: 'var(--syntax-comment)' },
    { tag: t.invalid, color: 'var(--destructive, #ef4444)' },
  ]), []);

  /* ─── Theme (depends on fontSize for zoom) ─────────────────────── */
  // ROOT CAUSE & FIX (2026-08):
  //  CodeMirror 6's base theme uses `box-sizing: border-box` on every
  //  internal element (`.cm-content`, `.cm-gutters`, `.cm-gutter`,
  //  `.cm-gutterElement`). Tailwind v4's preflight also sets border-box
  //  globally, so the two agree.
  //
  //  The previous code forced `box-sizing: content-box` on the whole editor
  //  subtree plus hard `min-height`/`height` on `.cm-line` and
  //  `.cm-gutterElement`. That fought CodeMirror's geometry engine:
  //    • `.cm-content` has `min-height: 100%`; with content-box the padding
  //      is ADDED on top, so the content grew taller than the (100%-height)
  //      gutter and the two scrolled out of sync.
  //    • CodeMirror sets each gutter element's height via inline
  //      `style.height` (view/dist/index.js GutterElement.update) and stacks
  //      them in a flex column; our forced min-height/display overrides
  //      desynced the gutter rows from the content (:cm-line) rows.
  //
  //  FIX: use border-box (CodeMirror's native model), drop the per-element
  //  height hacks, set ONE consistent line-height/size on the root so both
  //  gutter and content inherit it, and keep gutter/content top padding
  //  identical. CodeMirror then measures the rendered line height and
  //  aligns gutter + content perfectly by construction.
  const GUTTER_PAD_Y = '4px'; // matches CodeMirror's default .cm-content padding

  const editorTheme = useMemo(() => EditorView.theme({
    // Root: single source of truth for metrics. The line-height unitless
    // multiplier is what CodeMirror's measurement (textHeight) reads, so
    // gutter and content always agree on row height.
    '&': {
      fontSize: `${fontSize}px`,
      height: '100%',
      backgroundColor: 'transparent',
      lineHeight: '1.5',
    },
    '&.cm-focused': { outline: 'none' },
    '.cm-scroller': {
      fontFamily: 'ui-monospace, "Geist Mono", "JetBrains Mono", monospace',
      lineHeight: '1.5',
    },
    '.cm-gutters': {
      backgroundColor: 'transparent',
      borderRight: '1px solid var(--border, rgba(255,255,255,0.1))',
      color: 'var(--muted-foreground, #888)',
      // Removed opacity: it washed out the active-line gutter highlight and
      // made the line-number column look faint compared to the code. The
      // muted-foreground color already provides the desired de-emphasis.
      fontFamily: 'ui-monospace, "Geist Mono", "JetBrains Mono", monospace',
      fontSize: `${fontSize}px`,
      lineHeight: '1.5',
      // Top/bottom padding MUST equal .cm-content's — otherwise the first
      // and last rows visibly drift between gutter and content.
      padding: `${GUTTER_PAD_Y} 0`,
    },
    // No height/display overrides here — CodeMirror positions gutter rows
    // via inline style.height + flex column, which auto-aligns with content.
    // We DO use flex centering inside each cell so the digit is vertically
    // centered within the cell's height. Without this the digit sits on the
    // text baseline (slightly above center), which makes the active-line
    // gutter highlight look like it straddles two rows ("一半在上，一半在下"
    // bug). Flex centering is purely visual — the cell's height is still the
    // inline style.height that CodeMirror sets, so geometry measurement is
    // unaffected.
    '.cm-lineNumbers .cm-gutterElement': {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'flex-end',
      padding: '0 8px 0 12px',
      minWidth: '36px',
      // Use line-height: 1 (NOT 1.5) inside gutter cells. The cell's height
      // is set by CodeMirror via inline style.height (= the measured
      // .cm-line height, 21px), so this does NOT change the cell height.
      // What it does: shrink the inline line-box to the font's em-box so the
      // glyph is not pushed around by the 1.5x leading's half-leading
      // distribution (which is asymmetric for most monospace fonts and made
      // the digit sit ~0.5px too high, so the active-line highlight looked
      // like it straddled two rows). With line-height:1 + flex centering,
      // the glyph box is centered inside the 21px cell.
      lineHeight: '1',
      // Tabular numerals — keeps "1" and "8" the same width so the gutter
      // never resizes when typing and re-flows the column.
      fontVariantNumeric: 'tabular-nums',
      fontFeatureSettings: '"tnum"',
      boxSizing: 'border-box',
      // 注意：这里不再对行号元素做 transform 微移（之前的 translateY(-1px) 会连
      // 同 .cm-activeLineGutter 的背景一起偏移，导致左侧行号高光与右侧代码高光
      // 上下错位）。CodeMirror 用 inline style.height 精确设定每个 gutter 行高，
      // 配合 flex 垂直居中即可让行号字形居中，同时高光带与内容行完全对齐。
    },
    // Active-line gutter highlight. We want the gutter cell to look like a
    // continuation of the content active-line band. The gutter element's
    // height is set by CodeMirror to match the corresponding .cm-line, so
    // the background will align as long as we do not add vertical padding or
    // border-radius that changes its visible extent.
    '.cm-activeLineGutter': {
      backgroundColor: 'rgba(45, 212, 191, 0.26)',
      color: 'var(--primary, #2dd4bf)',
      fontWeight: '700',
      // Ensure the highlight fills the full cell, not just the content box,
      // so it never looks shorter than the active content line.
      boxSizing: 'border-box',
    },
    // VSCode-style active line highlight: subtle teal background on both
    // the line content and the gutter. Both use the same vertical extent
    // (the line/gutter element height) and no border-radius so the two
    // bands line up perfectly.
    '.cm-activeLine': {
      backgroundColor: 'rgba(45, 212, 191, 0.16)',
    },
    '.cm-foldPlaceholder': {
      backgroundColor: 'rgba(45, 212, 191, 0.1)',
      border: '1px solid rgba(45, 212, 191, 0.2)',
      borderRadius: '3px',
      padding: '0 4px',
      color: '#2dd4bf',
    },
    '.cm-content': {
      caretColor: 'var(--primary, #2dd4bf)',
      lineHeight: '1.5',
      // Top/bottom MUST equal .cm-gutters' GUTTER_PAD_Y. Left/right can be
      // whatever we want.
      padding: `${GUTTER_PAD_Y} 16px ${GUTTER_PAD_Y} 12px`,
    },
    '.cm-line': {
      lineHeight: '1.5',
      fontSize: `${fontSize}px`,
    },
    '.cm-cursor': { borderLeftColor: 'var(--primary, #2dd4bf)' },
    '.cm-selectionBackground, ::selection': { backgroundColor: 'rgba(45, 212, 191, 0.2)' },
    '.cm-lintRange-error': { textDecoration: 'underline wavy #ef4444' },
    '.cm-tooltip': {
      backgroundColor: 'var(--popover, #18181b)',
      border: '1px solid var(--border, rgba(255,255,255,0.15))',
      borderRadius: '6px',
      color: 'var(--popover-foreground, #fafafa)',
      boxSizing: 'border-box',
    },
  }), [fontSize]);

  /* ─── Create editor on mount ─────────────────────────────────── */
  useEffect(() => {
    if (!containerRef.current) return;

    const langExt = getLanguageExtension(language);
    const syntaxLinter = linter((view) => {
      const lang = langRef.current;
      const syntax = checkSyntax(view, lang);
      // Python 用其自身的括号检查；Simple/MATLAB 再叠加「语义纠错」：
      // 未定义函数 / 未定义变量（工作台变量作为已知符号注入，避免误报）。
      if (lang === 'python') return syntax;
      const known = { variables: Object.keys(useWorkbenchStore.getState().variables ?? {}) };
      return [...syntax, ...semanticDiagnostics(view, known)];
    });

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        onChangeRef.current(update.state.doc.toString());
      }
      if (update.selectionSet || update.docChanged) {
        const pos = update.state.selection.main.head;
        const line = update.state.doc.lineAt(pos);
        onCursorChangeRef.current?.(line.number, pos - line.from + 1);
      }
    });

    const runKeymap = keymap.of([
      {
        key: 'Enter',
        preventDefault: true,
        run: () => {
          onRunRef.current();
          return true;
        },
      },
      {
        key: 'Shift-Enter',
        run: () => false, // let default newline happen
      },
      {
        key: 'Mod-/',
        preventDefault: true,
        run: (view) => {
          toggleComment(view);
          return true;
        },
      },
    ]);

    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        foldGutter({ openText: '▾', closedText: '▸' }),
        history(),
        bracketMatching(),
        closeBrackets(),
        autocompletion(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        highlightSelectionMatches(),
        indentUnit.of('  '),
        indentOnInput(),
        codeFolding(),
        lintGutter(),
        syntaxHighlighting(mathHighlightStyle),
        // Theme wrapped in a compartment so font-size zoom can reconfigure
        // it without recreating the entire editor.
        themeCompartment.current.of(editorTheme),
        EditorView.lineWrapping,
        runKeymap,
        keymap.of([
          ...defaultKeymap,
          ...historyKeymap,
          ...foldKeymap,
          ...closeBracketsKeymap,
          ...completionKeymap,
          ...searchKeymap,
        ]),
        langCompartment.current.of(langExt),
        syntaxLinter,
        updateListener,
        EditorView.contentAttributes.of({ 'aria-label': 'Code editor' }),
      ],
    });

    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        if (wheelRafRef.current !== null) return; // already scheduled
        wheelRafRef.current = requestAnimationFrame(() => {
          wheelRafRef.current = null;
          const current = useSettingsStore.getState().editorFontSize;
          const delta = e.deltaY < 0 ? 1 : -1;
          const next = current + delta;
          if (next >= 10 && next <= 24) {
            useSettingsStore.getState().setEditorFontSize(next);
          }
        });
      }
    };
    containerRef.current.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      containerRef.current?.removeEventListener('wheel', handleWheel);
      view.destroy();
      viewRef.current = null;
    };
     
  }, []);

  /* ─── Reconfigure theme when font size changes ─ */
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: themeCompartment.current.reconfigure(editorTheme),
    });
  }, [editorTheme]);

  /* ─── Sync external value changes ────────────────────────────── */
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      });
    }
  }, [value]);

  /* ─── Switch language extension ──────────────────────────────── */
  useEffect(() => {
    langRef.current = language;
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: langCompartment.current.reconfigure(getLanguageExtension(language)),
    });
  }, [language]);

  /* ─── Insert symbol at cursor (SymbolPalette → custom event) ─── */
  useEffect(() => {
    const handler = (e: Event) => {
      const text = (e as CustomEvent<string>).detail;
      if (typeof text !== 'string') return;
      const view = viewRef.current;
      if (!view) return;
      const sel = view.state.selection.main;
      view.dispatch({ changes: { from: sel.from, to: sel.to, insert: text } });
      view.focus();
    };
    window.addEventListener('omnimath-insert-symbol', handler);
    return () => window.removeEventListener('omnimath-insert-symbol', handler);
  }, []);

  return <div ref={containerRef} className="cm-editor-container h-full w-full overflow-hidden" />;
}

/* ─── Helpers ──────────────────────────────────────────────────── */

function getLanguageExtension(language: CodeEditorProps['language']) {
  if (language === 'python') return python();
  // Simple and MATLAB both use the custom math StreamLanguage. We attach a
  // completion source so the editor offers keyword/function/variable
  // suggestions (previously only Python had autocompletion), plus a
  // MATLAB-style hover tooltip that pops up a function's signature & doc.
  const mathLang = StreamLanguage.define(math);
  return [
    mathLang,
    // 现代 CodeMirror 用 Language.data.autocomplete 注册补全源
    //（与 @codemirror/lang-python 的 localCompletionSource 一致）。
    // MATLAB 模式额外注入语句片段补全（if/for/while/function/switch…）。
    mathLang.data.of({ autocomplete: (ctx) => mathCompletionSource(ctx, language === 'matlab') }),
    mathHoverTooltip,
    mathSignatureHelp,
  ];
}

/**
 * 签名提示状态：光标位于函数调用括号内时，记录当前函数 + 参数下标。
 * 在文档/光标变化时重算（纯函数，不持有 DOM）。
 */
const signatureHintState = StateField.define<{ pos: number; info: MathFnInfo; arg: number } | null>({
  create() {
    return null;
  },
  update(value, tr) {
    if (!tr.docChanged && !tr.selection) return value;
    const doc = tr.state.doc;
    const pos = tr.state.selection.main.head;
    const line = doc.lineAt(pos);
    // 取光标所在行、光标左侧的文本。
    const before = doc.sliceString(line.from, pos);
    // 匹配最近一个未闭合的函数调用：funcName( 参数段（不含嵌套括号）。
    const m = before.match(/([A-Za-z_][A-Za-z0-9_]*)\s*\(\s*([^()]*)$/);
    if (!m) return null;
    const fnName = m[1];
    const info = getFunctionInfo(fnName);
    // 无签名信息或零参数函数不提示；避免把普通括号误判为函数调用。
    if (!info || info.args.length === 0) return null;
    // 参数段内顶级逗号数 = 当前参数下标（0 起）。
    const inside = m[2];
    let arg = 0;
    for (const ch of inside) if (ch === ',') arg++;
    if (arg >= info.args.length) arg = info.args.length - 1;
    return { pos, info, arg };
  },
});

/**
 * MATLAB 风格"函数签名提示"（signature help）。
 *
 * 当光标位于一个函数调用的括号内（如 `sin(|`、`log(x,|`）时，在光标正下方
 * 弹窗显示该函数的完整签名，并高亮当前正在输入的第几个参数 —— 与 MATLAB
 * Live Editor 键入 `(` 后弹出"函数构法提示"的体验一致。
 */
const mathSignatureHelp = [
  signatureHintState,
  showTooltip.from(signatureHintState, (sig) =>
    sig
      ? { pos: sig.pos, above: false, create: () => buildSignatureHelpDom(sig.info, sig.arg) }
      : null),
];

/** 渲染签名提示浮窗：签名 + 高亮当前参数 + 简要说明（含参数类别/默认值）。 */
function buildSignatureHelpDom(info: MathFnInfo, activeArg: number): { dom: HTMLElement } {
  const dom = document.createElement('div');
  dom.className = 'math-fn-tooltip';
  const style: Partial<CSSStyleDeclaration> = {
    maxWidth: '380px',
    padding: '8px 10px',
    fontSize: '12px',
    lineHeight: '1.6',
    color: 'var(--popover-foreground, #fafafa)',
  };
  Object.assign(dom.style, style);

  const sig = document.createElement('div');
  sig.style.fontFamily = 'ui-monospace, monospace';
  sig.style.fontWeight = '500';
  sig.style.whiteSpace = 'pre-wrap';
  sig.style.wordBreak = 'break-all';
  sig.style.marginBottom = '6px';
  // 把 activeArg 对应的参数名用高亮 chip 呈现，其余参数用普通颜色。
  const beforeStart = info.signature.indexOf('(');
  const open = info.signature.slice(0, beforeStart + 1);
  sig.appendChild(document.createTextNode(open));
  info.args.forEach((a, i) => {
    if (i > 0) sig.appendChild(document.createTextNode(', '));
    const span = document.createElement('span');
    span.textContent = a;
    span.style.borderRadius = '4px';
    span.style.padding = '0 3px';
    if (i === activeArg) {
      span.style.background = 'rgba(45, 212, 191, 0.28)';
      span.style.color = 'var(--syntax-number, #fbbf24)';
      span.style.fontWeight = '700';
      span.style.boxShadow = 'inset 0 0 0 1px rgba(45,212,191,.4)';
    } else {
      span.style.color = 'var(--syntax-variable, #94a3b8)';
    }
    sig.appendChild(span);
  });
  sig.appendChild(document.createTextNode(')'));
  dom.appendChild(sig);

  // 参数明细（functionSignatures.json 风格：必选/可选/标志 + 类型 + 默认值）。
  const params = info.params;
  if (params && params.length > 0) {
    const list = document.createElement('div');
    list.style.borderTop = '1px solid var(--border, rgba(255,255,255,0.1))';
    list.style.paddingTop = '6px';
    list.style.marginBottom = '4px';
    params.forEach((p, i) => {
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.gap = '6px';
      row.style.margin = '2px 0';
      if (i === activeArg) row.style.background = 'rgba(45,212,191,0.12)';
      row.style.borderRadius = '4px';
      row.style.padding = '1px 4px';
      // 类别徽标
      const kind = document.createElement('span');
      const kindMap: Record<string, { text: string; color: string }> = {
        required: { text: '必选', color: '#fb923c' },
        optional: { text: '可选', color: '#94a3b8' },
        flag: { text: '标志', color: '#38bdf8' },
        namevalue: { text: '名值对', color: '#a78bfa' },
      };
      const k = kindMap[p.kind] ?? kindMap.optional;
      kind.textContent = k.text;
      kind.style.color = k.color;
      kind.style.fontSize = '10px';
      kind.style.border = `1px solid ${k.color}55`;
      kind.style.padding = '0 4px';
      kind.style.borderRadius = '3px';
      kind.style.flexShrink = '0';
      row.appendChild(kind);
      // 参数名 + 类型
      const name = document.createElement('span');
      name.textContent = p.name;
      name.style.fontFamily = 'ui-monospace, monospace';
      name.style.fontWeight = i === activeArg ? '700' : '500';
      name.style.color = i === activeArg ? 'var(--syntax-number,#fbbf24)' : 'var(--popover-foreground,#fafafa)';
      row.appendChild(name);
      if (p.type) {
        const type = document.createElement('span');
        type.textContent = p.type;
        type.style.color = 'var(--muted-foreground,#888)';
        type.style.fontSize = '10.5px';
        row.appendChild(type);
      }
      if (p.default) {
        const def = document.createElement('span');
        def.textContent = `= ${p.default}`;
        def.style.color = '#34d399';
        def.style.fontFamily = 'ui-monospace, monospace';
        def.style.fontSize = '10.5px';
        row.appendChild(def);
      }
      list.appendChild(row);
    });
    dom.appendChild(list);
  }

  const hint = document.createElement('div');
  hint.style.color = 'var(--muted-foreground, #999)';
  hint.textContent = `正在输入参数 ${info.args[activeArg]}：${info.doc}`;
  dom.appendChild(hint);

  return { dom };
}

/** MATLAB-style 文档浮窗：悬停在函数名上弹出签名 + 参数说明。 */
const mathHoverTooltip = hoverTooltip((view, pos) => {
  const line = view.state.doc.lineAt(pos);
  const text = line.text;
  // 取光标所在位置的单词（identifier）。
  let start = pos - line.from;
  let end = start;
  while (start > 0 && /[\w]/.test(text[start - 1])) start--;
  while (end < text.length && /[\w]/.test(text[end])) end++;
  const word = text.slice(start, end);
  if (!word) return null;
  const info = getFunctionInfo(word);
  if (!info) return null;
  const from = line.from + start;
  const to = line.from + end;
  return {
    pos: from,
    end: to,
    create: () => buildInfoTooltip(info),
  };
});

function buildInfoTooltip(info: MathFnInfo): { dom: HTMLElement } {
  const dom = document.createElement('div');
  dom.className = 'math-fn-tooltip';
  const style: Partial<CSSStyleDeclaration> = {
    maxWidth: '320px',
    padding: '8px 10px',
    fontSize: '12px',
    lineHeight: '1.5',
    color: 'var(--popover-foreground, #fafafa)',
  };
  Object.assign(dom.style, style);

  const sig = document.createElement('div');
  sig.style.fontWeight = '600';
  sig.style.fontFamily = 'ui-monospace, monospace';
  sig.style.color = 'var(--syntax-function, #7dd3fc)';
  sig.style.marginBottom = '4px';
  sig.textContent = info.signature;
  dom.appendChild(sig);

  if (info.args.length > 0) {
    const args = document.createElement('div');
    args.style.margin = '4px 0';
    const argLabel = document.createElement('span');
    argLabel.style.color = 'var(--muted-foreground, #888)';
    argLabel.textContent = '参数：';
    args.appendChild(argLabel);
    info.args.forEach((a, i) => {
      if (i > 0) args.appendChild(document.createTextNode('  '));
      const chip = document.createElement('span');
      chip.style.display = 'inline-block';
      chip.style.padding = '0 4px';
      chip.style.margin = '0 2px 2px 0';
      chip.style.borderRadius = '4px';
      chip.style.background = 'rgba(45, 212, 191, 0.15)';
      chip.style.color = 'var(--syntax-number, #fbbf24)';
      chip.style.fontFamily = 'ui-monospace, monospace';
      chip.textContent = a;
      args.appendChild(chip);
    });
    dom.appendChild(args);
  }

  const doc = document.createElement('div');
  doc.style.color = 'var(--muted-foreground, #999)';
  doc.textContent = info.doc;
  dom.appendChild(doc);

  return { dom };
}

/**
 * Code completion for the math StreamLanguage (Simple / MATLAB modes).
 * Sources, in boost order:
 *  1. Control keywords / plot & solve commands (KEYWORDS)
 *  2. Built-in math functions (FUNCTIONS)
 *  3. User variables from the workbench store (read live at request time)
 *  4. MATLAB 语句片段（if/for/while/…，仅 MATLAB 模式，`withStatements`）
 */
function mathCompletionSource(context: CompletionContext, withStatements = false): CompletionResult | null {
  const word = context.matchBefore(/[\w]+/);
  // Only trigger after the user has typed at least one word char (or hit
  // Ctrl-Space, which sets context.explicit = true).
  if (!word || (word.from === word.to && !context.explicit)) return null;

  const vars = Object.keys(useWorkbenchStore.getState().variables ?? {});
  const options = [
    ...KEYWORDS.map((k) => ({ label: k, type: 'keyword', boost: 90 })),
    ...FUNCTIONS.map((f) => {
      const info = getFunctionInfo(f);
      return {
        label: f,
        type: 'function',
        boost: 80,
        // MATLAB 风格：补全面板里同时展示函数签名摘要。
        detail: info ? info.signature : undefined,
        info: info ? buildInfoHtml(info) : undefined,
        // 选中常用单参函数时直接用签名补全（方便继续输入参数）。
        apply: info && info.args.length === 1 ? `${f}(${info.args[0]})` : undefined,
      };
    }),
    ...vars.map((v) => ({ label: v, type: 'variable', boost: 70 })),
  ];

  // MATLAB 语句片段：更高优先级，插入后自动定位光标到占位处。
  if (withStatements) {
    const statements = MATLAB_STATEMENTS.map((s) => ({
      label: s.label,
      type: 'snippet' as const,
      boost: 95,
      detail: s.detail,
      apply: (view: EditorView, completion: { apply?: string }, from: number, to: number) => {
        const line = view.state.doc.lineAt(from);
        const indent = line.text.slice(0, from - line.from);
        const text = s.template(indent);
        view.dispatch({
          changes: { from, to, insert: text },
          selection: { anchor: cursorAfterPlaceholder(text, s.cursorPlaceholder) },
        });
        return true;
      },
    }));
    options.unshift(...statements);
  }

  return {
    from: word.from,
    options,
  };
}

/** 计算模板中第一个占位字符串之后的字符偏移（用于定位光标）。 */
function cursorAfterPlaceholder(text: string, placeholder: string): number {
  if (!placeholder) return text.length;
  const idx = text.indexOf(placeholder);
  return idx >= 0 ? idx + placeholder.length : text.length;
}

/** 生成补班主任（info 面板）的 HTML 文档内容。 */
function buildInfoHtml(info: MathFnInfo): string {
  const paramsHtml = info.params?.length
    ? `<div style="margin:4px 0;font-size:11px;line-height:1.7">
        ${info.params.map((p) => {
          const kind = p.kind === 'required' ? '必选' : p.kind === 'flag' ? '标志' : p.kind === 'namevalue' ? '名值对' : '可选';
          const color = p.kind === 'required' ? '#fb923c' : '#94a3b8';
          return `<div style="display:flex;gap:6px;align-items:baseline">
            <span style="flex-shrink:0;color:${color};border:1px solid ${color}55;border-radius:3px;padding:0 4px;font-size:10px">${kind}</span>
            <span style="font-family:ui-monospace,monospace;color:var(--syntax-number,#fbbf24)">${p.name}</span>
            ${p.type ? `<span style="color:var(--muted-foreground,#888)">${p.type}</span>` : ''}
            ${p.default ? `<span style="color:#34d399;font-family:ui-monospace,monospace">= ${p.default}</span>` : ''}
          </div>`;
        }).join('')}
       </div>`
    : (info.args.length
        ? `<div style="margin:4px 0">
            <span style="color:var(--muted-foreground,#888)">参数：</span>
            ${info.args.map((a) =>
              `<span style="display:inline-block;padding:0 4px;margin:0 2px 2px 0;border-radius:4px;background:rgba(45,212,191,.15);color:var(--syntax-number,#fbbf24);font-family:ui-monospace,monospace">${a}</span>`
            ).join('')}
           </div>`
        : '');
  return `<div style="font-size:12px;line-height:1.5;color:var(--popover-foreground,#fafafa)">
    <div style="font-weight:600;font-family:ui-monospace,monospace;color:var(--syntax-function,#7dd3fc)">${info.signature}</div>
    ${paramsHtml}
    <div style="color:var(--muted-foreground,#999)">${info.doc}</div>
  </div>`;
}

/** Toggle `#` comment on selected lines — mirrors the old textarea behavior. */
function toggleComment(view: EditorView) {
  const state = view.state;
  const changes = state.changeByRange((range) => {
    const lineStart = state.doc.lineAt(range.from).from;
    const lineEnd = state.doc.lineAt(range.to).to;
    const text = state.doc.slice(lineStart, lineEnd).toString();
    const lines = text.split('\n');
    const allCommented = lines.every((l) => l.trimStart().startsWith('#'));
    const newLines = lines.map((l) =>
      allCommented
        ? l.replace(/^(\s*)#\s?/, '$1')
        : /^\s/.test(l)
          ? l.replace(/^(\s*)/, '$1# ')
          : '# ' + l,
    );
    const newText = newLines.join('\n');
    return {
      changes: { from: lineStart, to: lineEnd, insert: newText },
      range: EditorSelection.range(range.from, range.to),
    };
  });
  view.dispatch(changes);
}
