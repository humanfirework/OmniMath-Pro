'use client';

import React from 'react';
import { useCalculatorStore } from '@/lib/calculator/store';
import { inputToLatex } from '@/lib/calculator/engine';
import { FormulaRenderer } from './FormulaRenderer';
import { PlotPanel } from './PlotPanel';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileText, BarChart3, Copy, Clock, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { t } from '@/lib/calculator/i18n';

export function PreviewPanel() {
  const { currentResult, results, plots, previewVisible, theme, clearPlots, removePlot, setEditorContent } = useCalculatorStore();
  const [activeTab, setActiveTab] = React.useState('formula');

  // Auto-switch to plot tab when a plot is generated
  React.useEffect(() => {
    if (plots.length > 0 && currentResult?.type === 'plot') {
      setActiveTab('plot');
    }
  }, [plots.length, currentResult?.type]);

  if (!previewVisible) return null;

  const isDark = theme === 'dark';
  const plotExpressions = plots.map(p => p.expression);
  const plotColors = plots.map(p => p.color);

  const handleCopyResult = () => {
    if (currentResult?.output) {
      navigator.clipboard.writeText(currentResult.output).catch(() => {});
    }
  };

  // Get recent results for history display
  const recentResults = results.slice(0, 20);

  return (
    <div className={`h-full flex flex-col border-l ${
      isDark ? 'bg-[#1e1e1e] border-[#3c3c3c]' : 'bg-white border-[#e0e0e0]'
    }`}>
      {/* Header */}
      <div className={`flex items-center justify-between px-3 py-1.5 border-b ${
        isDark ? 'bg-[#252526] border-[#3c3c3c]' : 'bg-[#f8f8f8] border-[#e0e0e0]'
      }`}>
        <span className={`text-[11px] uppercase tracking-wider font-medium ${
          isDark ? 'text-[#858585]' : 'text-[#666]'
        }`}>
          {t('previewTitle')}
        </span>
        {currentResult && (
          <Button
            variant="ghost"
            size="sm"
            className={`h-5 px-1.5 text-[10px] ${
              isDark ? 'text-[#858585] hover:text-[#cccccc]' : 'text-[#999] hover:text-[#333]'
            }`}
            onClick={handleCopyResult}
          >
            <Copy className="h-3 w-3 mr-1" />
            {t('previewCopy')}
          </Button>
        )}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
        <TabsList className={`w-full justify-start rounded-none border-b p-0 h-8 ${
          isDark ? 'bg-[#252526] border-[#3c3c3c]' : 'bg-[#f8f8f8] border-[#e0e0e0]'
        }`}>
          <TabsTrigger
            value="formula"
            className={`rounded-none border-b-2 border-transparent data-[state=active]:border-[#007acc] data-[state=active]:bg-transparent data-[state=active]:shadow-none px-3 h-8 text-[11px] ${
              isDark ? 'text-[#858585] data-[state=active]:text-[#cccccc]' : 'text-[#888] data-[state=active]:text-[#333]'
            }`}
          >
            <FileText className="h-3 w-3 mr-1" />
            {t('previewFormula')}
          </TabsTrigger>
          <TabsTrigger
            value="plot"
            className={`rounded-none border-b-2 border-transparent data-[state=active]:border-[#007acc] data-[state=active]:bg-transparent data-[state=active]:shadow-none px-3 h-8 text-[11px] ${
              isDark ? 'text-[#858585] data-[state=active]:text-[#cccccc]' : 'text-[#888] data-[state=active]:text-[#333]'
            }`}
          >
            <BarChart3 className="h-3 w-3 mr-1" />
            {t('previewPlot')}
            {plots.length > 0 && (
              <span className="ml-1 bg-[#007acc]/20 text-[#007acc] px-1 rounded text-[9px]">
                {plots.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger
            value="history"
            className={`rounded-none border-b-2 border-transparent data-[state=active]:border-[#007acc] data-[state=active]:bg-transparent data-[state=active]:shadow-none px-3 h-8 text-[11px] ${
              isDark ? 'text-[#858585] data-[state=active]:text-[#cccccc]' : 'text-[#888] data-[state=active]:text-[#333]'
            }`}
          >
            <Clock className="h-3 w-3 mr-1" />
            {t('previewLog')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="formula" className="flex-1 m-0 overflow-auto">
          <ScrollArea className="h-full">
            <div className="p-4 space-y-4">
              {/* Current result display */}
              {currentResult && (
                <>
                  {/* Input rendering */}
                  <div>
                    <div className={`text-[10px] uppercase tracking-wider mb-1 ${
                      isDark ? 'text-[#5a5a5a]' : 'text-[#aaa]'
                    }`}>
                      {t('previewInput')}
                    </div>
                    <div className={`rounded-md p-3 border ${
                      isDark ? 'bg-[#2d2d2d] border-[#3c3c3c]' : 'bg-[#fafafa] border-[#e0e0e0]'
                    }`}>
                      <FormulaRenderer
                        expression={inputToLatex(currentResult.input)}
                        displayMode={true}
                      />
                    </div>
                  </div>

                  {/* Output rendering */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-[10px] uppercase tracking-wider ${
                        isDark ? 'text-[#5a5a5a]' : 'text-[#aaa]'
                      }`}>
                        {t('previewResult')}
                      </span>
                      {currentResult.error ? (
                        <span className="text-[10px] text-red-500">{t('previewError')}</span>
                      ) : (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                          isDark ? 'bg-[#094771]/40 text-[#4fc3f7]' : 'bg-[#e5f1fb] text-[#007acc]'
                        }`}>
                          {currentResult.type}
                        </span>
                      )}
                    </div>
                    <div className={`rounded-md p-4 border animate-bounce-in ${
                      currentResult.error
                        ? isDark
                          ? 'bg-red-900/10 border-red-800/30'
                          : 'bg-red-50 border-red-200'
                        : isDark
                          ? 'bg-[#1e3a5f]/40 border-[#3a7bd5]/30 shadow-[0_0_15px_rgba(59,130,246,0.1)]'
                          : 'bg-[#f0f7ff] border-[#cce4f7]'
                    }`}>
                      {currentResult.error ? (
                        <div className={`text-sm font-mono ${isDark ? 'text-red-400' : 'text-red-600'}`}>
                          <span className={isDark ? 'text-red-500' : 'text-red-700'}>✕ </span>
                          {currentResult.error}
                        </div>
                      ) : (
                        <div className={isDark ? 'text-[#e0e8f0] text-[15px]' : ''}>
                          <FormulaRenderer
                            expression={currentResult.latex || currentResult.output}
                            displayMode={true}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}

              {!currentResult && (
                <div className={`flex items-center justify-center h-40 text-sm ${
                  isDark ? 'text-[#5a5a5a]' : 'text-[#aaa]'
                }`}>
                  <div className="text-center">
                    <div className="text-3xl mb-2">✨</div>
                    <p>{t('previewEmpty')}</p>
                    <p className={`text-xs mt-1 ${isDark ? 'text-[#4a4a4a]' : 'text-[#bbb]'}`}>
                      {t('previewEmptyHint')}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="plot" className="flex-1 m-0 min-h-0">
          {plots.length > 0 && (
            <div className={`flex items-center justify-end gap-1 px-2 py-1 border-b ${
              isDark ? 'bg-[#252526] border-[#3c3c3c]' : 'bg-[#f8f8f8] border-[#e0e0e0]'
            }`}>
              <Button
                variant="ghost"
                size="sm"
                className={`h-5 px-1.5 text-[10px] ${
                  isDark ? 'text-[#858585] hover:text-[#cccccc]' : 'text-[#888] hover:text-[#333]'
                }`}
                onClick={clearPlots}
              >
                <Trash2 className="h-3 w-3 mr-1" />
                {t('previewClearAll')}
              </Button>
            </div>
          )}
          <PlotPanel
            expressions={plotExpressions}
            colors={plotColors}
            onInsertExample={(expr) => setEditorContent(expr)}
          />
        </TabsContent>

        <TabsContent value="history" className="flex-1 m-0 overflow-auto">
          <ScrollArea className="h-full">
            <div className="p-3 space-y-2">
              {recentResults.length === 0 ? (
                <div className={`text-center text-xs py-8 ${
                  isDark ? 'text-[#5a5a5a]' : 'text-[#aaa]'
                }`}>
                  {t('previewNoHistory')}
                </div>
              ) : (
                recentResults.map((result, idx) => (
                  <div
                    key={result.id}
                    className={`rounded-md p-2.5 border text-[12px] ${
                      result.error
                        ? isDark
                          ? 'bg-red-900/5 border-red-800/20'
                          : 'bg-red-50 border-red-200'
                        : isDark
                          ? 'bg-[#2d2d2d] border-[#3c3c3c]'
                          : 'bg-[#fafafa] border-[#e0e0e0]'
                    }`}
                    style={{ opacity: 1 - idx * 0.03 }}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className={`font-mono ${
                        result.error
                          ? isDark ? 'text-red-400' : 'text-red-600'
                          : isDark ? 'text-[#9cdcfe]' : 'text-[#007acc]'
                      }`}>
                        {result.input}
                      </span>
                      <span className={`text-[9px] ${isDark ? 'text-[#5a5a5a]' : 'text-[#aaa]'}`}>
                        {new Date(result.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className={`font-mono ${
                      result.error
                        ? isDark ? 'text-red-300/70' : 'text-red-500'
                        : isDark ? 'text-[#4fc3f7]' : 'text-[#0e639c]'
                    }`}>
                      {result.error ? `${t('previewError')}: ${result.error}` : `= ${result.output}`}
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}
