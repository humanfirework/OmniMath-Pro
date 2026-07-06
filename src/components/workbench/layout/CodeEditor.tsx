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

export interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  onRun: () => void;
  onCursorChange?: (line: number, col: number) => void;
  language?: 'simple' | 'python' | 'matlab';
  placeholder?: string;
}

export function CodeEditor({
  value,
  onChange,
  onRun,
  onCursorChange,
  language = 'simple',
  placeholder,
}: CodeEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const langCompartment = useRef(new Compartment());
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

  /* ─── Theme ──────────────────────────────────────────────────── */
  const editorTheme = EditorView.theme({
    '&': {
      fontSize: '13.5px',
      height: '100%',
      backgroundColor: 'transparent',
    },
    '&.cm-focused': { outline: 'none' },
    '.cm-scroller': {
      fontFamily: 'ui-monospace, "Geist Mono", "JetBrains Mono", monospace',
      lineHeight: '1.65',
    },
    '.cm-gutters': {
      backgroundColor: 'transparent',
      borderRight: '1px solid var(--border, rgba(255,255,255,0.1))',
      color: 'var(--muted-foreground, #888)',
    },
    '.cm-activeLine': { backgroundColor: 'rgba(45, 212, 191, 0.04)' },
    '.cm-activeLineGutter': { color: 'var(--primary, #2dd4bf)' },
    // Indent guide lines — visible vertical line every 2 spaces.
    // Uses repeating linear-gradient so the line stays aligned with each
    // 2-character indent step. `backgroundAttachment: local` keeps the
    // guides aligned when the editor scrolls horizontally.
    '.cm-line': {
      backgroundImage:
        'linear-gradient(to right, transparent 0, transparent calc(2ch - 1px), var(--indent-guide, rgba(255,255,255,0.06)) calc(2ch - 1px), var(--indent-guide, rgba(255,255,255,0.06)) 2ch, transparent 2ch)',
      backgroundSize: '2ch 100%',
      backgroundAttachment: 'local',
      backgroundPosition: 'left top',
    },
    '.cm-foldPlaceholder': {
      backgroundColor: 'rgba(45, 212, 191, 0.1)',
      border: '1px solid rgba(45, 212, 191, 0.2)',
      borderRadius: '3px',
      padding: '0 4px',
      color: '#2dd4bf',
    },
    '.cm-content': { caretColor: 'var(--primary, #2dd4bf)' },
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
        editorTheme,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      range: EditorSelection.rangeFor(newText, range.from - lineStart, range.to - lineStart),
    };
  });
  view.dispatch(changes);
}
