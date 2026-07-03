'use client';

import React, { useState, useCallback } from 'react';
import { useCalculatorStore } from '@/lib/calculator/store';
import { quickEval } from '@/lib/calculator/engine';
import { t } from '@/lib/calculator/i18n';
import {
  Sun,
  Moon,
  Terminal,
  Check,
  AlertCircle,
  CornerDownLeft,
  Command,
  X,
  Download,
  Database,
  Plus,
  Minus,
  RotateCcw,
  Languages,
} from 'lucide-react';

export function StatusBar() {
  const {
    theme,
    toggleTheme,
    currentResult,
    results,
    variables,
    setCommandPaletteOpen,
    inputMode,
    memory,
    memoryAdd,
    memorySubtract,
    memoryRecall,
    memoryClear,
    memoryStore,
    insertAtCursor,
    locale,
    setLocale,
  } = useCalculatorStore();
  const [showQuickCalc, setShowQuickCalc] = useState(false);
  const [quickCalcInput, setQuickCalcInput] = useState('');
  const [quickCalcResult, setQuickCalcResult] = useState('');
  const [showMemory, setShowMemory] = useState(false);

  const handleQuickCalc = useCallback(() => {
    if (!quickCalcInput.trim()) return;
    const result = quickEval(quickCalcInput, inputMode);
    setQuickCalcResult(result);
  }, [quickCalcInput, inputMode]);

  const handleQuickCalcKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleQuickCalc();
    } else if (e.key === 'Escape') {
      setShowQuickCalc(false);
      setQuickCalcInput('');
      setQuickCalcResult('');
    }
  };

  // Export history to file
  const handleExportHistory = useCallback(() => {
    if (results.length === 0) return;
    const lines = results.map((r, i) => {
      const time = new Date(r.timestamp).toLocaleString('zh-CN');
      const status = r.error ? '❌ 错误' : '✓ 成功';
      return `【${i + 1}】${time} ${status}\n  输入: ${r.input}\n  ${r.error ? '错误: ' + r.error : '结果: ' + r.output}\n`;
    });
    const content = `OmniMath 计算历史\n导出时间: ${new Date().toLocaleString('zh-CN')}\n共 ${results.length} 条记录\n${'='.repeat(50)}\n\n${lines.join('\n')}`;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `omnmath-history-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [results]);

  // Get current numeric result for memory operations
  const getCurrentValue = (): number => {
    if (!currentResult || currentResult.error) return 0;
    const out = currentResult.output;
    // Try to parse the output as a number
    const match = out.match(/-?\d+\.?\d*/);
    return match ? parseFloat(match[0]) : 0;
  };

  const errorCount = results.filter(r => r.error).length;
  const successCount = results.filter(r => !r.error).length;

  return (
    <div className="flex flex-col">
      {/* Memory bar */}
      {showMemory && (
        <div className={`flex items-center px-2 py-1 border-t gap-1 ${
          theme === 'dark' ? 'bg-[#252526] border-[#3c3c3c]' : 'bg-[#f3f3f3] border-[#e0e0e0]'
        }`}>
          <Database className={`h-3.5 w-3.5 mr-1 flex-shrink-0 ${
            theme === 'dark' ? 'text-[#c586c0]' : 'text-[#9333ea]'
          }`} />
          <span className={`text-[10px] mr-2 font-mono ${
            theme === 'dark' ? 'text-[#c586c0]' : 'text-[#9333ea]'
          }`}>M:</span>
          <span className={`text-[11px] font-mono mr-3 ${
            theme === 'dark' ? 'text-[#d4d4d4]' : 'text-[#333]'
          }`}>
            {memory.toFixed(6).replace(/\.?0+$/, '')}
          </span>
          {/* MS - Memory Store */}
          <button
            onClick={() => memoryStore(getCurrentValue())}
            className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors ${
              theme === 'dark'
                ? 'bg-[#3c3c3c] text-[#cccccc] hover:bg-[#094771] hover:text-white'
                : 'bg-[#e0e0e0] text-[#333] hover:bg-[#cce4f7] hover:text-[#007acc]'
            }`}
            title="存入当前结果到内存 (MS)"
          >
            MS
          </button>
          {/* M+ - Memory Add */}
          <button
            onClick={() => memoryAdd(getCurrentValue())}
            className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors ${
              theme === 'dark'
                ? 'bg-[#3c3c3c] text-[#cccccc] hover:bg-[#094771] hover:text-white'
                : 'bg-[#e0e0e0] text-[#333] hover:bg-[#cce4f7] hover:text-[#007acc]'
            }`}
            title="将当前结果加到内存 (M+)"
          >
            M+
          </button>
          {/* M- - Memory Subtract */}
          <button
            onClick={() => memorySubtract(getCurrentValue())}
            className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors ${
              theme === 'dark'
                ? 'bg-[#3c3c3c] text-[#cccccc] hover:bg-[#094771] hover:text-white'
                : 'bg-[#e0e0e0] text-[#333] hover:bg-[#cce4f7] hover:text-[#007acc]'
            }`}
            title="从内存中减去当前结果 (M-)"
          >
            M-
          </button>
          {/* MR - Memory Recall */}
          <button
            onClick={() => insertAtCursor(String(memory))}
            className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors ${
              theme === 'dark'
                ? 'bg-[#3c3c3c] text-[#cccccc] hover:bg-[#094771] hover:text-white'
                : 'bg-[#e0e0e0] text-[#333] hover:bg-[#cce4f7] hover:text-[#007acc]'
            }`}
            title="召回内存值到编辑器 (MR)"
          >
            MR
          </button>
          {/* MC - Memory Clear */}
          <button
            onClick={() => memoryClear()}
            className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors ${
              theme === 'dark'
                ? 'bg-[#3c3c3c] text-[#f48771] hover:bg-[#5a1d1d] hover:text-white'
                : 'bg-[#e0e0e0] text-[#dc2626] hover:bg-[#fee2e2] hover:text-[#991b1b]'
            }`}
            title="清除内存 (MC)"
          >
            MC
          </button>
          <div className="flex-1" />
          <button
            onClick={() => setShowMemory(false)}
            className={`p-0.5 rounded ${theme === 'dark' ? 'text-[#858585] hover:text-white' : 'text-[#999] hover:text-black'}`}
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Quick calculation bar */}
      {showQuickCalc && (
        <div className={`flex items-center px-2 py-1 border-t ${
          theme === 'dark' ? 'bg-[#252526] border-[#3c3c3c]' : 'bg-[#f3f3f3] border-[#e0e0e0]'
        }`}>
          <Terminal className="h-3.5 w-3.5 text-[#4fc3f7] mr-2 flex-shrink-0" />
          <span className={`text-[10px] mr-2 font-mono ${
            theme === 'dark' ? 'text-[#4fc3f7]' : 'text-[#007acc]'
          }`}>{'>'}</span>
          <input
            type="text"
            value={quickCalcInput}
            onChange={e => setQuickCalcInput(e.target.value)}
            onKeyDown={handleQuickCalcKeyDown}
            className={`flex-1 bg-transparent text-[12px] font-mono outline-none placeholder:text-[#5a5a5a] ${
              theme === 'dark' ? 'text-[#cccccc]' : 'text-[#333]'
            }`}
            placeholder={t('qcPlaceholder')}
            autoFocus
          />
          {quickCalcResult && (
            <span className={`text-[12px] font-mono mr-2 ${
              theme === 'dark' ? 'text-[#4fc3f7]' : 'text-[#007acc]'
            }`}>
              = {quickCalcResult}
            </span>
          )}
          <CornerDownLeft className="h-3 w-3 text-[#5a5a5a] mr-2" />
          <button
            onClick={() => { setShowQuickCalc(false); setQuickCalcInput(''); setQuickCalcResult(''); }}
            className={`p-0.5 rounded ${theme === 'dark' ? 'text-[#858585] hover:text-white' : 'text-[#999] hover:text-black'}`}
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Status bar */}
      <div className="flex items-center justify-between bg-[#007acc] h-6 px-2 text-white text-[11px]">
        <div className="flex items-center gap-3">
          {/* Brand */}
          <div className="flex items-center gap-1 font-medium">
            <SigmaIcon className="h-3.5 w-3.5" />
            <span>OmniMath</span>
          </div>

          {/* Command palette trigger */}
          <button
            onClick={() => setCommandPaletteOpen(true)}
            className="flex items-center gap-1 hover:bg-white/20 px-1.5 py-0.5 rounded-sm transition-colors"
            title="打开命令面板 (Ctrl+Shift+P)"
          >
            <Command className="h-3 w-3" />
            <span>{t('sbCommand')}</span>
          </button>

          {/* Input mode indicator */}
          <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-sm bg-white/10">
            <span className={`text-[10px] ${inputMode === 'simple' ? 'text-white' : 'text-white/70'}`}>
              {inputMode === 'simple' ? t('editorModeSimple') : t('editorModeAdvanced')}
            </span>
          </div>

          {/* Memory indicator (always visible) */}
          {memory !== 0 && (
            <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-sm bg-white/10">
              <Database className="h-3 w-3" />
              <span className="text-[10px] font-mono">
                M: {memory.toFixed(4).replace(/\.?0+$/, '')}
              </span>
            </div>
          )}

          {/* Calculation status */}
          {currentResult && (
            <div className="flex items-center gap-1">
              {currentResult.error ? (
                <>
                  <AlertCircle className="h-3 w-3" />
                  <span>{t('sbError')}</span>
                </>
              ) : (
                <>
                  <Check className="h-3 w-3" />
                  <span>{t('sbReady')}</span>
                </>
              )}
            </div>
          )}

          {/* Stats */}
          <div className="flex items-center gap-2 opacity-90">
            <span>{successCount} {t('sbOk')}</span>
            {errorCount > 0 && (
              <span className="text-yellow-200">{errorCount} {t('sbErr')}</span>
            )}
            <span>{Object.keys(variables).length} {t('sbVars')}</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Memory toggle */}
          <button
            onClick={() => setShowMemory(!showMemory)}
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded-sm transition-colors ${
              showMemory ? 'bg-white/30' : 'hover:bg-white/20'
            }`}
            title="内存功能 (M+, M-, MR, MC, MS)"
          >
            <Database className="h-3 w-3" />
            <span>内存</span>
          </button>

          {/* Export history */}
          <button
            onClick={handleExportHistory}
            disabled={results.length === 0}
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded-sm transition-colors ${
              results.length === 0 ? 'opacity-40 cursor-not-allowed' : 'hover:bg-white/20'
            }`}
            title="导出计算历史到文件"
          >
            <Download className="h-3 w-3" />
            <span>导出</span>
          </button>

          {/* Quick calc toggle */}
          <button
            onClick={() => setShowQuickCalc(!showQuickCalc)}
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded-sm transition-colors ${
              showQuickCalc ? 'bg-white/30' : 'hover:bg-white/20'
            }`}
            title="快速计算栏 (Ctrl+K)"
          >
            <Terminal className="h-3 w-3" />
            <span>{t('sbCalc')}</span>
          </button>

          {/* Language switcher */}
          <button
            onClick={() => setLocale(locale === 'zh-CN' ? 'en' : 'zh-CN')}
            className="flex items-center gap-1 hover:bg-white/20 px-1.5 py-0.5 rounded-sm transition-colors"
            title={locale === 'zh-CN' ? 'Switch to English' : '切换到中文'}
          >
            <Languages className="h-3 w-3" />
            <span>{locale === 'zh-CN' ? '中文' : 'EN'}</span>
          </button>

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="flex items-center gap-1 hover:bg-white/20 px-1.5 py-0.5 rounded-sm transition-colors"
            title="切换主题"
          >
            {theme === 'dark' ? (
              <>
                <Sun className="h-3 w-3" />
                <span>{t('sbLight')}</span>
              </>
            ) : (
              <>
                <Moon className="h-3 w-3" />
                <span>{t('sbDark')}</span>
              </>
            )}
          </button>

          {/* Engine */}
          <span className="opacity-80">math.js v15</span>
        </div>
      </div>
    </div>
  );
}

function SigmaIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M18 7V4H6l6 8-6 8h12v-3" />
    </svg>
  );
}
