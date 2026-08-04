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
    },
    // Active-line gutter highlight. We want the gutter cell to look like a
    // continuation of the content active-line band. The gutter element's
    // height is set by CodeMirror to match the corresponding .cm-line, so
    // the background will align as long as we do not add vertical padding or
    // border-radius that changes its visible extent.
    '.cm-activeLineGutter': {
      backgroundColor: 'rgba(45, 212, 191, 0.18)',
      color: 'var(--primary, #2dd4bf)',
      fontWeight: '600',
      // Ensure the highlight fills the full cell, not just the content box,
      // so it never looks shorter than the active content line.
      boxSizing: 'border-box',
    },
    // VSCode-style active line highlight: subtle teal background on both
    // the line content and the gutter. Both use the same vertical extent
    // (the line/gutter element height) and no border-radius so the two
    // bands line up perfectly.
    '.cm-activeLine': {
      backgroundColor: 'rgba(45, 212, 191, 0.14)',
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
