'use client';

import React, { useRef, useEffect, useCallback, useState } from 'react';
import { useCalculatorStore } from '@/lib/calculator/store';
import { evaluateExpression, EvalResult, resetScope, getScope } from '@/lib/calculator/engine';
import { CalculationResult, VariableEntry } from '@/lib/calculator/types';
import { Play, Trash2, CornerDownLeft, Sparkles, Eraser } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { v4 as uuidv4 } from 'uuid';
import { t } from '@/lib/calculator/i18n';

export function EditorPanel() {
  const {
    editorContent,
    setEditorContent,
    cursorPosition,
    setCursorPosition,
    addResult,
    setCurrentResult,
    setVariable,
    addPlot,
    theme,
    saveToStorage,
    inputMode,
    setInputMode,
  } = useCalculatorStore();

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);
  const [isExecuting, setIsExecuting] = useState(false);

  const lines = editorContent.split('\n');
  const lineCount = lines.length;

  // Sync scroll between textarea and line numbers
  const handleScroll = useCallback(() => {
    if (textareaRef.current && lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  }, []);

  // Handle cursor position
  const handleSelect = useCallback(() => {
    if (textareaRef.current) {
      setCursorPosition(textareaRef.current.selectionStart);
    }
  }, [setCursorPosition]);

  // Execute all lines or current line
  const execute = useCallback(() => {
    setIsExecuting(true);
    try {
      const content = editorContent.trim();
      if (!content) return;

      // Execute line by line
      const linesToExecute = content.split('\n').filter(l => l.trim());

      let lastResult: EvalResult | null = null;

      for (const line of linesToExecute) {
        const result = evaluateExpression(line.trim(), inputMode);
        lastResult = result;

        if (result.success) {
          const calcResult: CalculationResult = {
            id: uuidv4(),
            input: line.trim(),
            output: result.result,
            latex: result.latex,
            timestamp: Date.now(),
            type: result.type,
            variables: result.variables,
          };
          addResult(calcResult);
          setCurrentResult(calcResult);

          // Track variables
          if (result.variables) {
            Object.entries(result.variables).forEach(([name, value]) => {
              setVariable(name, {
                name,
                value,
                type: 'number',
              });
            });
          }

          // Handle plot - add new plot
          if (result.type === 'plot' && result.plotExpression) {
            const colors = ['#4fc3f7', '#81c784', '#ffb74d', '#f06292', '#ba68c8', '#4db6ac'];
            const isPolar = result.plotType === 'polar';
            const xRange: [number, number] = result.plotRange ?? (isPolar ? [0, 2 * Math.PI] : [-10, 10]);
            addPlot({
              expression: result.plotExpression,
              xRange,
              yRange: [-10, 10],
              color: colors[Date.now() % colors.length],
              plotType: result.plotType ?? 'cartesian',
            });
          }
        } else {
          const calcResult: CalculationResult = {
            id: uuidv4(),
            input: line.trim(),
            output: result.error || 'Error',
            latex: '',
            timestamp: Date.now(),
            type: result.type,
            error: result.error,
          };
          addResult(calcResult);
          setCurrentResult(calcResult);
        }
      }

      // Save to storage after execution
      saveToStorage();
    } finally {
      setIsExecuting(false);
    }
  }, [editorContent, addResult, setCurrentResult, setVariable, addPlot, saveToStorage, inputMode]);

  // Clear all (reset scope, history, variables)
  const clearAll = useCallback(() => {
    resetScope();
    setEditorContent('');
  }, [setEditorContent]);

  // Keyboard shortcuts
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter to execute
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      execute();
    }
    // Tab for indent
    if (e.key === 'Tab') {
      e.preventDefault();
      const target = e.target as HTMLTextAreaElement;
      const start = target.selectionStart;
      const end = target.selectionEnd;
      const newContent = editorContent.substring(0, start) + '  ' + editorContent.substring(end);
      setEditorContent(newContent);
      setTimeout(() => {
        target.selectionStart = target.selectionEnd = start + 2;
      }, 0);
    }
    // Ctrl+/ for comment
    if ((e.ctrlKey || e.metaKey) && e.key === '/') {
      e.preventDefault();
      const target = e.target as HTMLTextAreaElement;
      const start = target.selectionStart;
      const lineStart = editorContent.lastIndexOf('\n', start - 1) + 1;
      const newContent = editorContent.substring(0, lineStart) + '# ' + editorContent.substring(lineStart);
      setEditorContent(newContent);
    }
  }, [execute, editorContent, setEditorContent]);

  // Auto-focus on mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Syntax highlighting for line numbers area
  const lineNumbers = Array.from({ length: lineCount }, (_, i) => i + 1);

  // Calculate current line and column
  const currentLine = editorContent.substring(0, cursorPosition).split('\n').length;
  const lastNewline = editorContent.lastIndexOf('\n', cursorPosition - 1);
  const currentCol = cursorPosition - lastNewline;

  const isDark = theme === 'dark';

  return (
    <div className={`h-full flex flex-col ${isDark ? 'bg-[#1e1e1e]' : 'bg-white'}`}>
      {/* Editor toolbar */}
      <div className={`flex items-center justify-between px-3 py-1.5 border-b ${
        isDark ? 'bg-[#252526] border-[#3c3c3c]' : 'bg-[#f3f3f3] border-[#e0e0e0]'
      }`}>
        <div className="flex items-center gap-2">
          <span className={`text-[11px] uppercase tracking-wider font-medium ${
            isDark ? 'text-[#858585]' : 'text-[#666]'
          }`}>
            {t('editorTitle')}
          </span>
          <span className={`text-[10px] ${isDark ? 'text-[#5a5a5a]' : 'text-[#999]'}`}>
            |
          </span>
          <span className={`text-[10px] ${isDark ? 'text-[#5a5a5a]' : 'text-[#999]'}`}>
            mathjs
          </span>
          <span className={`text-[10px] ${isDark ? 'text-[#5a5a5a]' : 'text-[#999]'}`}>
            ·
          </span>
          {/* Input mode toggle */}
          <div className="flex items-center gap-0">
            <button
              onClick={() => setInputMode('simple')}
              className={`px-1.5 py-0 text-[9px] rounded-l transition-colors ${
                inputMode === 'simple'
                  ? isDark
                    ? 'bg-[#094771] text-[#4fc3f7]'
                    : 'bg-[#cce4f7] text-[#007acc]'
                  : isDark
                    ? 'bg-[#2d2d2d] text-[#5a5a5a] hover:text-[#858585]'
                    : 'bg-[#e8e8e8] text-[#999] hover:text-[#666]'
              }`}
              title="Simple mode - Desmos-like lenient parsing"
            >
              {t('editorModeSimple')}
            </button>
            <button
              onClick={() => setInputMode('advanced')}
              className={`px-1.5 py-0 text-[9px] rounded-r transition-colors ${
                inputMode === 'advanced'
                  ? isDark
                    ? 'bg-[#094771] text-[#4fc3f7]'
                    : 'bg-[#cce4f7] text-[#007acc]'
                  : isDark
                    ? 'bg-[#2d2d2d] text-[#5a5a5a] hover:text-[#858585]'
                    : 'bg-[#e8e8e8] text-[#999] hover:text-[#666]'
              }`}
              title="Advanced mode - strict math.js syntax"
            >
              {t('editorModeAdvanced')}
            </button>
          </div>
          <span className={`text-[10px] ${isDark ? 'text-[#5a5a5a]' : 'text-[#999]'}`}>
            ·
          </span>
          <span className={`text-[10px] ${isDark ? 'text-[#5a5a5a]' : 'text-[#999]'}`}>
            {Object.keys(getScope()).length} {t('editorVars')}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className={`h-6 px-2 text-[11px] ${
              isDark
                ? 'text-[#cccccc] hover:text-white hover:bg-[#094771]'
                : 'text-[#333] hover:text-black hover:bg-[#e5f1fb]'
            }`}
            onClick={clearAll}
            title="Clear editor and reset scope"
          >
            <Eraser className="h-3 w-3 mr-1" />
            {t('editorReset')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={`h-6 px-2 text-[11px] ${
              isDark
                ? 'text-[#cccccc] hover:text-white hover:bg-[#3c3c3c]'
                : 'text-[#333] hover:text-black hover:bg-[#e0e0e0]'
            }`}
            onClick={() => setEditorContent('')}
            title="Clear editor only"
          >
            <Trash2 className="h-3 w-3 mr-1" />
            {t('editorClear')}
          </Button>
          <Button
            variant="default"
            size="sm"
            className="h-6 px-3 text-[11px] bg-gradient-to-b from-[#1177bb] to-[#0e639c] hover:from-[#1388cc] hover:to-[#0f6fa8] text-white border-none shadow-[0_1px_3px_rgba(0,0,0,0.2)] hover:shadow-[0_2px_5px_rgba(0,122,204,0.4)] transition-all duration-150 active:scale-95"
            onClick={execute}
            disabled={isExecuting}
            title="运行所有 (Enter)"
          >
            <Play className={`h-3 w-3 mr-1 transition-transform ${isExecuting ? 'animate-pulse' : ''}`} />
            {t('editorRun')}
          </Button>
        </div>
      </div>

      {/* Editor area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Line numbers */}
        <div
          ref={lineNumbersRef}
          className={`select-none overflow-hidden text-right pr-3 pl-3 pt-2 text-[13px] leading-[20px] font-mono border-r ${
            isDark
              ? 'text-[#858585] bg-[#1e1e1e] border-[#3c3c3c]'
              : 'text-[#999] bg-[#fafafa] border-[#e0e0e0]'
          }`}
          style={{ minWidth: '50px' }}
        >
          {lineNumbers.map((num, idx) => (
            <div
              key={num}
              className={`h-[20px] ${
                idx === currentLine - 1
                  ? isDark ? 'text-[#c6c6c6]' : 'text-[#333]'
                  : ''
              }`}
            >
              {num}
            </div>
          ))}
        </div>

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={editorContent}
          onChange={e => setEditorContent(e.target.value)}
          onKeyDown={handleKeyDown}
          onScroll={handleScroll}
          onSelect={handleSelect}
          onKeyUp={handleSelect}
          onClick={handleSelect}
          className={`flex-1 resize-none bg-transparent text-[13px] leading-[20px] font-mono p-2 outline-none border-none placeholder:text-[#5a5a5a] caret-[#007acc] ${
            isDark ? 'text-[#d4d4d4]' : 'text-[#333]'
          }`}
          placeholder={t('editorPlaceholder')}
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
        />
      </div>

      {/* Bottom quick info bar */}
      <div className={`flex items-center justify-between px-3 py-1 border-t ${
        isDark ? 'bg-[#252526] border-[#3c3c3c]' : 'bg-[#f3f3f3] border-[#e0e0e0]'
      }`}>
        <div className={`flex items-center gap-2 text-[10px] ${
          isDark ? 'text-[#858585]' : 'text-[#666]'
        }`}>
          <CornerDownLeft className="h-3 w-3" />
          <span>{t('editorEnterToEval')}</span>
          <span className={isDark ? 'text-[#5a5a5a]' : 'text-[#aaa]'}>|</span>
          <span>{t('editorShiftEnterNewLine')}</span>
          <span className={isDark ? 'text-[#5a5a5a]' : 'text-[#aaa]'}>|</span>
          <span>{t('editorCtrlSlashComment')}</span>
        </div>
        <div className={`text-[10px] ${isDark ? 'text-[#5a5a5a]' : 'text-[#999]'}`}>
          Ln {currentLine}, Col {currentCol}
        </div>
      </div>
    </div>
  );
}
