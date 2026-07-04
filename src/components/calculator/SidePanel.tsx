'use client';

import React from 'react';
import { useCalculatorStore } from '@/lib/calculator/store';
import { SymbolPalette } from './SymbolPalette';
import { HistoryPanel } from './HistoryPanel';
import { GuidePanel } from './GuidePanel';
import { VariablesPanel } from './VariablesPanel';
import { TemplatesPanel } from './TemplatesPanel';
import { UnitConverter } from './UnitConverter';
import { BaseConverter } from './BaseConverter';
import { EquationSolver } from './EquationSolver';
import { FormulaLibrary } from './FormulaLibrary';
import { ScrollArea } from '@/components/ui/scroll-area';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { t } from '@/lib/calculator/i18n';
import type { Translations } from '@/lib/calculator/i18n';

type PanelTitleKey = keyof Pick<Translations,
  'spSymbols' | 'spTemplates' | 'spSolver' | 'spUnits' | 'spBases' | 'spHistory' | 'spGuide' | 'spVariables' | 'spFormulas'
>;

const PANEL_TITLE_KEYS: Record<string, PanelTitleKey> = {
  symbols: 'spSymbols',
  templates: 'spTemplates',
  solver: 'spSolver',
  units: 'spUnits',
  bases: 'spBases',
  history: 'spHistory',
  guide: 'spGuide',
  variables: 'spVariables',
  formulas: 'spFormulas',
};

export function SidePanel() {
  const { activeSidePanel, sidePanelCollapsed, setActiveSidePanel, theme } = useCalculatorStore();

  if (sidePanelCollapsed || !activeSidePanel) return null;

  const titleKey = PANEL_TITLE_KEYS[activeSidePanel];

  return (
    <div className={`h-full flex flex-col w-72 min-w-[260px] border-r animate-slide-in-left ${
      theme === 'dark' ? 'bg-[#252526] border-[#3c3c3c]' : 'bg-[#f8f8f8] border-[#e0e0e0]'
    }`}>
      {/* Panel header */}
      <div className={`flex items-center justify-between px-3 py-1.5 border-b ${
        theme === 'dark' ? 'border-[#3c3c3c]' : 'border-[#e0e0e0]'
      }`}>
        <span className={`text-[11px] uppercase tracking-wider font-semibold ${
          theme === 'dark' ? 'text-[#bbbbbb]' : 'text-[#555]'
        }`}>
          {titleKey ? t(titleKey) : activeSidePanel.toUpperCase()}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className={`h-5 w-5 hover:bg-transparent ${
            theme === 'dark' ? 'text-[#858585] hover:text-white' : 'text-[#999] hover:text-black'
          }`}
          onClick={() => setActiveSidePanel(null)}
        >
          <X className="h-3 w-3" />
        </Button>
      </div>

      {/* Panel content */}
      {activeSidePanel === 'symbols' && <SymbolPalette />}
      {activeSidePanel === 'templates' && <TemplatesPanel />}
      {activeSidePanel === 'solver' && <EquationSolver />}
      {activeSidePanel === 'units' && <UnitConverter />}
      {activeSidePanel === 'bases' && <BaseConverter />}
      {activeSidePanel === 'history' && <HistoryPanel />}
      {activeSidePanel === 'guide' && <GuidePanel />}
      {activeSidePanel === 'variables' && <VariablesPanel />}
      {activeSidePanel === 'formulas' && <FormulaLibrary />}
    </div>
  );
}
