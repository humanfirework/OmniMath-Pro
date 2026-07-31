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

import { useEffect, useRef } from 'react';
import { EditorState, EditorSelection, Compartment } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from '@codemirror/view';
import { defaultKeymap, historyKeymap, history } from '@codemirror/commands';
import { bracketMatching, indentUnit, indentOnInput, foldGutter, codeFolding, foldKeymap, StreamLanguage, HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { linter, lintGutter } from '@codemirror/lint';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { python } from '@codemirror/lang-python';
import { tags as t } from '@lezer/highlight';
import { math } from '@/lib/editor/mathLanguage';
import { checkSyntax } from '@/lib/editor/syntaxCheck';

// 字号默认值与 settingsStore.editorFontSize (14) 保持一致，
// 避免组件本地默认与全局默认不一致导致首次渲染行号与内容字号不匹配。
const DEFAULT_FONT_PX = 14;

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
  fontSize = DEFAULT_FONT_PX,
}: CodeEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const langCompartment = useRef(new Compartment());
  const themeCompartment = useRef(new Compartment());
  const onChangeRef = useRef(onChange);
  const onRunRef = useRef(onRun);
  const onCursorChangeRef = useRef(onCursorChange);

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
  const mathHighlightStyle = HighlightStyle.define([
    { tag: t.comment, color: '#6b7280', fontStyle: 'italic' },
    { tag: t.number, color: '#fbbf24' },
    { tag: t.string, color: '#34d399' },
    { tag: t.keyword, color: '#a78bfa', fontWeight: 'bold' },
    { tag: t.variableName, color: '#2dd4bf' },
    { tag: t.function(t.variableName), color: '#60a5fa' },
    { tag: t.operator, color: '#fb7185' },
    { tag: t.punctuation, color: '#9ca3af' },
  ]);

  /* ─── Theme (depends on fontSize for zoom) ─────────────────────── */
  // NOTE: The buggy `backgroundImage` + `backgroundSize: '2ch 100%'` that
  // previously lived on `.cm-line` has been REMOVED. It rendered a vertical
  // stripe every 2ch which the user perceived as "horizontal lines turning
  // into vertical lines". CodeMirror 6 has no first-party indent-guide
  // extension; `indentUnit.of('  ')` + `indentOnInput()` handle indentation
  // behavior without visual artifacts.
  const editorTheme = EditorView.theme({
    '&': {
      fontSize: `${fontSize}px`,
      height: '100%',
      backgroundColor: 'transparent',
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
      opacity: '0.8',
      fontFamily: 'ui-monospace, "Geist Mono", "JetBrains Mono", monospace',
      // 行号字号必须与正文一致，否则行号竖向高度与正文行高不匹配会导致
      // 行号与内容竖向错位（越往下累积越明显）。
      fontSize: `${fontSize}px`,
      lineHeight: '1.5',
    },
    // VSCode-style active line highlight: subtle teal background on both
    // the line content and the gutter. 0.08 is visible but not distracting.
    '.cm-activeLine': {
      backgroundColor: 'rgba(45, 212, 191, 0.08)',
      borderRadius: '2px',
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'rgba(45, 212, 191, 0.08)',
      color: 'var(--primary, #2dd4bf)',
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
      // 恢复 CodeMirror 默认顶部 padding（4px 0）。之前设为 '0' 去掉了
      // 顶部 4px padding，导致行号槽与内容首行竖向基线错位。与 gutter
      // 的默认 padding 对齐，避免第 1 行行号与内容竖向错位累积。
      padding: '4px 0',
    },
    '.cm-cursor': { borderLeftColor: 'var(--primary, #2dd4bf)' },
    '.cm-selectionBackground, ::selection': { backgroundColor: 'rgba(45, 212, 191, 0.2)' },
    '.cm-lintRange-error': { textDecoration: 'underline wavy #ef4444' },
    '.cm-tooltip': {
      backgroundColor: 'var(--popover, #18181b)',
      border: '1px solid var(--border, rgba(255,255,255,0.15))',
      borderRadius: '6px',
      color: 'var(--popover-foreground, #fafafa)',
    },
  });

  /* ─── Create editor on mount ─────────────────────────────────── */
  useEffect(() => {
    if (!containerRef.current) return;

    const langExt = getLanguageExtension(language);
    const syntaxLinter = linter((view) => checkSyntax(view, language));

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

    return () => {
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
  // Simple and MATLAB both use the custom math StreamLanguage
  return StreamLanguage.define(math);
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
      // `rangeFor` 不在当前安装的 @codemirror/state 的类型定义中，
      // 用断言保留原有调用，不改变运行行为。
      range: (EditorSelection as unknown as {
        rangeFor(text: string, from: number, to: number): EditorSelection['ranges'][number];
      }).rangeFor(newText, range.from - lineStart, range.to - lineStart),
    };
  });
  view.dispatch(changes);
}
