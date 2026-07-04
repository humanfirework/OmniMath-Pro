'use client';

import React from 'react';
import { useCalculatorStore } from '@/lib/calculator/store';
import { EXAMPLE_TEMPLATES } from '@/lib/calculator/engine';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FileCode2, ArrowRight } from 'lucide-react';
import { t } from '@/lib/calculator/i18n';

export function TemplatesPanel() {
  const { setEditorContent, theme } = useCalculatorStore();

  return (
    <div className="h-full flex flex-col">
      <div className={`px-3 py-2 text-[11px] uppercase tracking-wider font-medium border-b ${
        theme === 'dark' ? 'text-[#858585] border-[#3c3c3c]' : 'text-[#666] border-[#e0e0e0]'
      }`}>
        {t('spTemplates')}
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1.5">
          {EXAMPLE_TEMPLATES.map((tpl, idx) => (
            <button
              key={idx}
              onClick={() => setEditorContent(tpl.code)}
              className={`w-full text-left p-2.5 rounded-md transition-all group border ${
                theme === 'dark'
                  ? 'bg-[#2d2d2d] hover:bg-[#2a2d2e] border-[#3c3c3c] hover:border-[#094771]'
                  : 'bg-white hover:bg-[#f5f9fc] border-[#e0e0e0] hover:border-[#094771]'
              }`}
            >
              <div className="flex items-start gap-2">
                <FileCode2 className={`h-4 w-4 mt-0.5 flex-shrink-0 ${
                  theme === 'dark' ? 'text-[#519aba]' : 'text-[#007acc]'
                }`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-[12px] font-medium ${
                      theme === 'dark' ? 'text-[#cccccc]' : 'text-[#333]'
                    }`}>
                      {tpl.title}
                    </span>
                    <span className={`text-[10px] opacity-0 group-hover:opacity-100 transition-opacity ${
                      theme === 'dark' ? 'text-[#4fc3f7]' : 'text-[#007acc]'
                    }`}>
                      {t('tplInsert')}
                    </span>
                  </div>
                  <p className={`text-[10px] mt-0.5 ${
                    theme === 'dark' ? 'text-[#858585]' : 'text-[#888]'
                  }`}>
                    {tpl.description}
                  </p>
                  <pre className={`mt-1.5 text-[10px] font-mono p-1.5 rounded overflow-hidden text-ellipsis whitespace-nowrap ${
                    theme === 'dark' ? 'bg-[#1e1e1e] text-[#9cdcfe]' : 'bg-[#f5f5f5] text-[#007acc]'
                  }`}>
                    {tpl.code.split('\n')[0]}
                    {tpl.code.includes('\n') ? ' ...' : ''}
                  </pre>
                </div>
              </div>
            </button>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
