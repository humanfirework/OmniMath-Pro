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
import { useSettingsStore } from '@/lib/store/settingsStore';

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
  const mathHighlightStyle = useMemo(() => HighlightStyle.define([
    { tag: t.comment, color: 'var(--syntax-comment)', fontStyle: 'italic' },
    { tag: t.number, color: 'var(--syntax-number)' },
    { tag: t.string, color: 'var(--syntax-string)' },
    { tag: t.keyword, color: 'var(--syntax-keyword)', fontWeight: 'bold' },
    { tag: t.variableName, color: 'var(--syntax-variable)' },
    { tag: t.function(t.variableName), color: 'var(--syntax-function)' },
    { tag: t.operator, color: 'var(--syntax-operator)' },
    { tag: t.punctuation, color: 'var(--syntax-punctuation)' },
  ]), []);

  /* ─── Theme (depends on fontSize for zoom) ─────────────────────── */
  // NOTE: The buggy `backgroundImage` + `backgroundSize: '2ch 100%'` that
  // previously lived on `.cm-line` has been REMOVED. It rendered a vertical
  // stripe every 2ch which the user perceived as "horizontal lines turning
  // into vertical lines". CodeMirror 6 has no first-party indent-guide
  // extension; `indentUnit.of('  ')` + `indentOnInput()` handle indentation
  // behavior without visual artifacts.
  //
  // IMPORTANT LAYOUT FIXES (VSCode-style robust layout):
  //  Tailwind v4 preflight sets `* { box-sizing: border-box }` globally, but
  //  CodeMirror 6's internal flex layout (gutters || content) relies on
  //  content-box calculations. Additionally, Tailwind's global border applied
  //  via `* { @apply border-border }` can disturb flex item measurements.
  //  We therefore:
  //    (1) Force `.cm-scroller { display: flex; flex-direction: row }` so that
  //        gutters and content always sit side-by-side rather than stacking.
  //    (2) Reset `box-sizing` on every CodeMirror-internal element back to
  //        content-box, matching what CodeMirror's geometry engine expects.
  //    (3) Remove any borders that Tailwind injected onto gutters/content.
  //    (4) Pin gutter shrink-0 + content flex: 1 1 auto so the layout never
  //        wraps or collapses when the viewport is resized.
  const editorTheme = useMemo(() => EditorView.theme({
    '&': {
      fontSize: `${fontSize}px`,
      height: '100%',
      backgroundColor: 'transparent',
      // Contain box-sizing reset to CodeMirror subtree only (see above).
      boxSizing: 'content-box',
    },
    '& *, & *::before, & *::after': {
      boxSizing: 'content-box',
    },
    '&.cm-focused': { outline: 'none' },
    '.cm-scroller': {
      display: 'flex !important',
      flexDirection: 'row !important',
      alignItems: 'flex-start',
      overflow: 'auto',
      fontFamily: 'ui-monospace, "Geist Mono", "JetBrains Mono", monospace',
      lineHeight: '1.5',
      width: '100%',
    },
    '.cm-gutters': {
      flex: '0 0 auto',
      shrink: '0',
      backgroundColor: 'transparent',
      borderRight: '1px solid var(--border, rgba(255,255,255,0.1))',
      borderLeft: 'none',
      borderTop: 'none',
      borderBottom: 'none',
      color: 'var(--muted-foreground, #888)',
      opacity: '0.8',
      fontFamily: 'ui-monospace, "Geist Mono", "JetBrains Mono", monospace',
      // 行号字号必须与正文一致，否则行号竖向高度与正文行高不匹配会导致
      // 行号与内容竖向错位（越往下累积越明显）。
      fontSize: `${fontSize}px`,
      lineHeight: '1.5',
      padding: '4px 0',
      margin: '0',
      boxSizing: 'content-box',
    },
    '.cm-gutter': {
      boxSizing: 'content-box',
      border: 'none',
    },
    '.cm-lineNumbers .cm-gutterElement': {
      padding: '0 8px 0 12px',
      minWidth: '36px',
      textAlign: 'right',
      boxSizing: 'content-box',
      border: 'none',
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
      boxSizing: 'border-box',
    },
    '.cm-content': {
      flex: '1 1 auto',
      caretColor: 'var(--primary, #2dd4bf)',
      lineHeight: '1.5',
      // 恢复 CodeMirror 默认顶部 padding（4px 0）。之前设为 '0' 去掉了
      // 顶部 4px padding，导致行号槽与内容首行竖向基线错位。与 gutter
      // 的默认 padding 对齐，避免第 1 行行号与内容竖向错位累积。
      padding: '4px 16px 4px 12px',
      margin: '0',
      border: 'none',
      boxSizing: 'content-box',
      minWidth: '0',
    },
    '.cm-line': {
      boxSizing: 'content-box',
      border: 'none',
      padding: '0 2px',
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
    '.cm-layer': {
      boxSizing: 'content-box',
      border: 'none',
    },
    '.cm-sizer': {
      boxSizing: 'content-box',
      border: 'none',
      display: 'block',
    },
  }), [fontSize]);

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
      range: EditorSelection.range(range.from, range.to),
    };
  });
  view.dispatch(changes);
}
