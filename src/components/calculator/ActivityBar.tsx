'use client';

import React from 'react';
import { useCalculatorStore } from '@/lib/calculator/store';
import { SidePanelTab } from '@/lib/calculator/types';
import {
  Sigma,
  History,
  BookOpen,
  Variable,
  PanelLeftClose,
  PanelLeftOpen,
  LayoutTemplate,
  Ruler,
  Hash,
  Equal,
  BookMarked,
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { t } from '@/lib/calculator/i18n';

interface ActivityBarItem {
  id: SidePanelTab;
  icon: React.ReactNode;
  labelKey: keyof Pick<import('@/lib/calculator/i18n').Translations,
    'abSymbols' | 'abTemplates' | 'abSolver' | 'abUnits' | 'abBases' | 'abHistory' | 'abVariables' | 'abGuide' | 'abFormulas'>;
}

const items: ActivityBarItem[] = [
  { id: 'symbols', icon: <Sigma className="h-5 w-5" />, labelKey: 'abSymbols' },
  { id: 'formulas', icon: <BookMarked className="h-5 w-5" />, labelKey: 'abFormulas' },
  { id: 'templates', icon: <LayoutTemplate className="h-5 w-5" />, labelKey: 'abTemplates' },
  { id: 'solver', icon: <Equal className="h-5 w-5" />, labelKey: 'abSolver' },
  { id: 'units', icon: <Ruler className="h-5 w-5" />, labelKey: 'abUnits' },
  { id: 'bases', icon: <Hash className="h-5 w-5" />, labelKey: 'abBases' },
  { id: 'history', icon: <History className="h-5 w-5" />, labelKey: 'abHistory' },
  { id: 'variables', icon: <Variable className="h-5 w-5" />, labelKey: 'abVariables' },
  { id: 'guide', icon: <BookOpen className="h-5 w-5" />, labelKey: 'abGuide' },
];

export function ActivityBar() {
  const { activeSidePanel, setActiveSidePanel, sidePanelCollapsed, toggleSidePanel, theme } = useCalculatorStore();

  const bgColor = theme === 'dark' ? 'bg-[#333333]' : 'bg-[#2c2c2c]';
  const borderColor = theme === 'dark' ? 'border-[#252526]' : 'border-[#252526]';

  return (
    <TooltipProvider delayDuration={300}>
      <div className={`flex flex-col items-center w-12 ${bgColor} border-r ${borderColor} py-1 overflow-y-auto`}>
        {/* Top icons */}
        <div className="flex flex-col items-center gap-0.5 flex-1">
          {items.map(item => (
            <Tooltip key={item.id}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => {
                    if (activeSidePanel === item.id && !sidePanelCollapsed) {
                      setActiveSidePanel(null);
                    } else {
                      setActiveSidePanel(item.id);
                    }
                  }}
                  className={`w-12 h-11 flex items-center justify-center transition-all duration-200 relative group flex-shrink-0
                    ${activeSidePanel === item.id && !sidePanelCollapsed
                      ? 'text-white scale-110'
                      : 'text-[#858585] hover:text-white hover:bg-white/5 hover:scale-105'
                    }`}
                >
                  {/* Active indicator bar */}
                  {activeSidePanel === item.id && !sidePanelCollapsed && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-7 bg-white rounded-r transition-all duration-200 shadow-[0_0_8px_rgba(255,255,255,0.5)]" />
                  )}
                  {/* Hover indicator */}
                  {!(activeSidePanel === item.id && !sidePanelCollapsed) && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-0 bg-white/40 rounded-r group-hover:h-6 transition-all duration-200" />
                  )}
                  <div className="transition-transform duration-200">
                    {item.icon}
                  </div>
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="bg-[#252526] text-[#cccccc] border-[#3c3c3c] text-xs">
                {t(item.labelKey)}
              </TooltipContent>
            </Tooltip>
          ))}
        </div>

        {/* Bottom toggle */}
        <div className="flex flex-col items-center gap-0.5 pb-1 flex-shrink-0">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={toggleSidePanel}
                className="w-12 h-11 flex items-center justify-center text-[#858585] hover:text-white hover:bg-white/5 transition-colors"
              >
                {sidePanelCollapsed ? (
                  <PanelLeftOpen className="h-4 w-4" />
                ) : (
                  <PanelLeftClose className="h-4 w-4" />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="bg-[#252526] text-[#cccccc] border-[#3c3c3c] text-xs">
              {sidePanelCollapsed ? t('abShowSidebar') : t('abHideSidebar')}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </TooltipProvider>
  );
}
