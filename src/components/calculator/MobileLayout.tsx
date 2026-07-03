'use client';

import React, { useState } from 'react';
import { useCalculatorStore } from '@/lib/calculator/store';
import { EditorPanel } from './EditorPanel';
import { PreviewPanel } from './PreviewPanel';
import { SymbolPalette } from './SymbolPalette';
import { HistoryPanel } from './HistoryPanel';
import { GuidePanel } from './GuidePanel';
import { VariablesPanel } from './VariablesPanel';
import { evaluateExpression } from '@/lib/calculator/engine';
import { CalculationResult } from '@/lib/calculator/types';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { v4 as uuidv4 } from 'uuid';
import {
  Menu,
  Sigma,
  History,
  BookOpen,
  Variable,
  Play,
} from 'lucide-react';
import { t } from '@/lib/calculator/i18n';

type DrawerTab = 'symbols' | 'history' | 'guide' | 'variables';

export function MobileLayout() {
  const { theme, editorContent, setEditorContent, addResult, setCurrentResult, setVariable, addPlot, inputMode } = useCalculatorStore();
  const [showPreview, setShowPreview] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<DrawerTab>('symbols');

  const handleEvaluate = () => {
    const content = editorContent.trim();
    if (!content) return;

    const lines = content.split('\n').filter(l => l.trim());
    for (const line of lines) {
      const result = evaluateExpression(line.trim(), inputMode);
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
        if (result.variables) {
          Object.entries(result.variables).forEach(([name, value]) => {
            setVariable(name, { name, value, type: 'number' });
          });
        }
        if (result.type === 'plot' && result.plotExpression) {
          const isPolar = result.plotType === 'polar';
          const xRange: [number, number] = result.plotRange ?? (isPolar ? [0, 2 * Math.PI] : [-10, 10]);
          addPlot({
            expression: result.plotExpression,
            xRange,
            yRange: [-10, 10],
            color: '#4fc3f7',
            plotType: result.plotType ?? 'cartesian',
          });
        }
      } else {
        addResult({
          id: uuidv4(),
          input: line.trim(),
          output: result.error || 'Error',
          latex: '',
          timestamp: Date.now(),
          type: result.type,
          error: result.error,
        });
      }
    }
    setShowPreview(true);
  };

  const drawerTabs: { id: DrawerTab; icon: React.ReactNode; labelKey: 'abSymbols' | 'abHistory' | 'abGuide' | 'abVariables' }[] = [
    { id: 'symbols', icon: <Sigma className="h-4 w-4" />, labelKey: 'abSymbols' },
    { id: 'history', icon: <History className="h-4 w-4" />, labelKey: 'abHistory' },
    { id: 'guide', icon: <BookOpen className="h-4 w-4" />, labelKey: 'abGuide' },
    { id: 'variables', icon: <Variable className="h-4 w-4" />, labelKey: 'abVariables' },
  ];

  return (
    <div className={`h-screen w-screen flex flex-col overflow-hidden ${
      theme === 'dark' ? 'bg-[#1e1e1e] text-[#cccccc]' : 'bg-white text-[#333333]'
    }`}>
      {/* Top bar */}
      <div className={`flex items-center h-11 px-3 gap-2 flex-shrink-0 ${
        theme === 'dark' ? 'bg-[#323233] border-b border-[#252526]' : 'bg-[#f3f3f3] border-b border-[#e0e0e0]'
      }`}>
        {/* Drawer trigger */}
        <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <Menu className="h-4 w-4" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className={`w-72 p-0 ${
            theme === 'dark' ? 'bg-[#252526] border-[#3c3c3c]' : 'bg-white border-[#e0e0e0]'
          }`}>
            <SheetHeader className="p-3 border-b border-[#3c3c3c]">
              <SheetTitle className={`text-sm ${theme === 'dark' ? 'text-[#cccccc]' : 'text-[#333333]'}`}>
                OmniMath
              </SheetTitle>
            </SheetHeader>
            {/* Tab buttons */}
            <div className="flex border-b border-[#3c3c3c]">
              {drawerTabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setDrawerTab(tab.id)}
                  className={`flex-1 flex flex-col items-center gap-0.5 py-2 text-[10px] ${
                    drawerTab === tab.id
                      ? 'text-[#007acc] border-b-2 border-[#007acc]'
                      : theme === 'dark' ? 'text-[#858585]' : 'text-[#999999]'
                  }`}
                >
                  {tab.icon}
                  {t(tab.labelKey)}
                </button>
              ))}
            </div>
            {/* Tab content */}
            <ScrollArea className="h-[calc(100vh-120px)]">
              {drawerTab === 'symbols' && <SymbolPalette />}
              {drawerTab === 'history' && <HistoryPanel />}
              {drawerTab === 'guide' && <GuidePanel />}
              {drawerTab === 'variables' && <VariablesPanel />}
            </ScrollArea>
          </SheetContent>
        </Sheet>

        <svg className="h-4 w-4 text-[#007acc]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 7V4H6l6 8-6 8h12v-3" />
        </svg>
        <span className="text-[12px] font-medium">OmniMath</span>

        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-[11px] text-emerald-400 hover:text-emerald-300"
            onClick={handleEvaluate}
          >
            <Play className="h-3 w-3 mr-1" />
            {t('mobileRun')}
          </Button>
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Editor / Preview toggle */}
        <div className={`flex border-b border-[#3c3c3c] ${
          theme === 'dark' ? 'bg-[#252526]' : 'bg-[#f3f3f3]'
        }`}>
          <button
            onClick={() => setShowPreview(false)}
            className={`flex-1 py-2 text-[11px] font-medium transition-colors ${
              !showPreview
                ? 'text-[#007acc] border-b-2 border-[#007acc]'
                : theme === 'dark' ? 'text-[#858585]' : 'text-[#999999]'
            }`}
          >
            {t('mobileEditor')}
          </button>
          <button
            onClick={() => setShowPreview(true)}
            className={`flex-1 py-2 text-[11px] font-medium transition-colors ${
              showPreview
                ? 'text-[#007acc] border-b-2 border-[#007acc]'
                : theme === 'dark' ? 'text-[#858585]' : 'text-[#999999]'
            }`}
          >
            {t('mobilePreview')}
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0">
          {!showPreview ? (
            <EditorPanel />
          ) : (
            <PreviewPanel />
          )}
        </div>
      </div>

      {/* Quick symbol row */}
      <div className={`flex items-center gap-1 px-2 py-1.5 overflow-x-auto flex-shrink-0 ${
        theme === 'dark' ? 'bg-[#252526] border-t border-[#3c3c3c]' : 'bg-[#f3f3f3] border-t border-[#e0e0e0]'
      }`}>
        {['+', '-', '*', '/', '^', '(', ')', 'sin(', 'cos(', 'sqrt(', 'pi', 'e'].map(sym => (
          <button
            key={sym}
            onClick={() => setEditorContent(editorContent + sym)}
            className={`flex-shrink-0 h-8 min-w-[32px] px-1.5 rounded text-[12px] font-mono ${
              theme === 'dark'
                ? 'bg-[#2d2d2d] text-[#cccccc] hover:bg-[#2a2d2e]'
                : 'bg-[#e8e8e8] text-[#333333] hover:bg-[#ddd]'
            }`}
          >
            {sym}
          </button>
        ))}
      </div>
    </div>
  );
}
