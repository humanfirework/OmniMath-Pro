'use client';

import React, { useMemo, useState } from 'react';
import { FORMULA_LIBRARY, FormulaCategory, FormulaItem } from '@/lib/calculator/engine';
import { useCalculatorStore } from '@/lib/calculator/store';
import { FormulaRenderer } from './FormulaRenderer';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Search, BookMarked, ChevronRight } from 'lucide-react';
import { t } from '@/lib/calculator/i18n';

export function FormulaLibrary() {
  const setEditorContent = useCalculatorStore((s) => s.setEditorContent);
  const theme = useCalculatorStore((s) => s.theme);
  const isDark = theme === 'dark';
  const [search, setSearch] = useState('');
  const [selectedFormula, setSelectedFormula] = useState<{ category: FormulaCategory; formula: FormulaItem } | null>(null);

  // Filter formulas based on search
  const filteredCategories = useMemo(() => {
    if (!search.trim()) return FORMULA_LIBRARY;
    const q = search.toLowerCase();
    return FORMULA_LIBRARY.map((cat) => ({
      ...cat,
      formulas: cat.formulas.filter(
        (f) =>
          f.name.toLowerCase().includes(q) ||
          f.nameEn.toLowerCase().includes(q) ||
          f.description.toLowerCase().includes(q),
      ),
    })).filter((cat) => cat.formulas.length > 0);
  }, [search]);

  const handleInsertExample = (example: string) => {
    setEditorContent(example);
  };

  const handleShowFormula = (category: FormulaCategory, formula: FormulaItem) => {
    setSelectedFormula({ category, formula });
  };

  // Show selected formula detail
  if (selectedFormula) {
    const { category, formula } = selectedFormula;
    return (
      <ScrollArea className="h-full">
        <div className="p-3 space-y-3">
          {/* Back button */}
          <button
            onClick={() => setSelectedFormula(null)}
            className={`flex items-center gap-1 text-[11px] ${
              isDark ? 'text-[#4fc3f7] hover:text-[#7dd3fc]' : 'text-[#007acc] hover:text-[#005a9e]'
            }`}
          >
            <ChevronRight className="h-3 w-3 rotate-180" />
            返回列表
          </button>

          {/* Formula header */}
          <div className={`rounded-md p-3 border ${
            isDark ? 'bg-[#2d2d2d] border-[#3c3c3c]' : 'bg-[#fafafa] border-[#e0e0e0]'
          }`}>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-base">{category.icon}</span>
              <span className={`text-[10px] uppercase tracking-wider ${
                isDark ? 'text-[#858585]' : 'text-[#999]'
              }`}>
                {category.name}
              </span>
            </div>
            <h3 className={`text-[14px] font-semibold ${
              isDark ? 'text-[#cccccc]' : 'text-[#333]'
            }`}>
              {formula.name}
            </h3>
            <p className={`text-[10px] mt-0.5 ${isDark ? 'text-[#858585]' : 'text-[#999]'}`}>
              {formula.nameEn}
            </p>
          </div>

          {/* Formula rendering */}
          <div>
            <div className={`text-[10px] uppercase tracking-wider mb-1 ${
              isDark ? 'text-[#5a5a5a]' : 'text-[#aaa]'
            }`}>
              公式
            </div>
            <FormulaRenderer
              expression={formula.latex}
              displayMode={true}
            />
          </div>

          {/* Description */}
          <div>
            <div className={`text-[10px] uppercase tracking-wider mb-1 ${
              isDark ? 'text-[#5a5a5a]' : 'text-[#aaa]'
            }`}>
              说明
            </div>
            <p className={`text-[12px] leading-relaxed ${
              isDark ? 'text-[#cccccc]' : 'text-[#555]'
            }`}>
              {formula.description}
            </p>
          </div>

          {/* Example */}
          <div>
            <div className={`text-[10px] uppercase tracking-wider mb-1 ${
              isDark ? 'text-[#5a5a5a]' : 'text-[#aaa]'
            }`}>
              示例
            </div>
            <div className={`rounded-md border overflow-hidden ${
              isDark ? 'border-[#3c3c3c]' : 'border-[#e0e0e0]'
            }`}>
              <div className={`px-3 py-2 font-mono text-[11px] ${
                isDark ? 'bg-[#1a1a2e] text-emerald-300/90' : 'bg-[#f5f7fa] text-[#007acc]'
              }`}>
                {formula.example}
              </div>
              <button
                onClick={() => handleInsertExample(formula.example)}
                className={`w-full px-3 py-1.5 text-[11px] text-center transition-colors ${
                  isDark
                    ? 'bg-[#094771]/30 text-[#4fc3f7] hover:bg-[#094771]/50'
                    : 'bg-[#e5f1fb] text-[#007acc] hover:bg-[#cce4f7]'
                }`}
              >
                插入示例到编辑器
              </button>
            </div>
          </div>
        </div>
      </ScrollArea>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Search bar */}
      <div className={`p-2 border-b ${isDark ? 'border-[#3c3c3c]' : 'border-[#e0e0e0]'}`}>
        <div className={`flex items-center gap-2 px-2 py-1 rounded-md ${
          isDark ? 'bg-[#2d2d2d]' : 'bg-[#f5f5f5]'
        }`}>
          <Search className={`h-3 w-3 ${isDark ? 'text-[#858585]' : 'text-[#999]'}`} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索公式..."
            className={`flex-1 bg-transparent text-[11px] outline-none ${
              isDark ? 'text-[#cccccc] placeholder:text-[#5a5a5a]' : 'text-[#333] placeholder:text-[#aaa]'
            }`}
          />
        </div>
      </div>

      {/* Formula list */}
      <ScrollArea className="flex-1">
        <div className="p-2">
          {filteredCategories.length === 0 ? (
            <div className={`text-center text-[11px] py-8 ${
              isDark ? 'text-[#5a5a5a]' : 'text-[#999]'
            }`}>
              <BookMarked className="h-6 w-6 mx-auto mb-2 opacity-50" />
              未找到匹配的公式
            </div>
          ) : (
            <Accordion
              type="multiple"
              defaultValue={filteredCategories.length > 0 ? [filteredCategories[0].name] : []}
              className="w-full space-y-1"
            >
              {filteredCategories.map((category) => (
                <AccordionItem
                  key={category.name}
                  value={category.name}
                  className={`rounded-md border px-1 ${
                    isDark ? 'border-[#3c3c3c]' : 'border-[#e0e0e0]'
                  }`}
                >
                  <AccordionTrigger className={`py-2 text-[12px] font-medium hover:no-underline ${
                    isDark ? 'text-zinc-300 hover:text-zinc-100' : 'text-[#555] hover:text-[#222]'
                  }`}>
                    <span className="flex items-center gap-2">
                      <span className="text-sm">{category.icon}</span>
                      <span>{category.name}</span>
                      <span className={`text-[9px] px-1 rounded ${
                        isDark ? 'bg-[#3c3c3c] text-[#858585]' : 'bg-[#e0e0e0] text-[#999]'
                      }`}>
                        {category.formulas.length}
                      </span>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-1 pb-1">
                      {category.formulas.map((formula, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleShowFormula(category, formula)}
                          className={`w-full text-left p-2 rounded-md transition-all border ${
                            isDark
                              ? 'bg-[#2d2d2d] border-[#3c3c3c] hover:border-[#094771] hover:bg-[#252526]'
                              : 'bg-white border-[#e0e0e0] hover:border-[#007acc] hover:bg-[#f5f7fa]'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className={`text-[12px] font-medium ${
                              isDark ? 'text-[#cccccc]' : 'text-[#333]'
                            }`}>
                              {formula.name}
                            </span>
                            <ChevronRight className={`h-3 w-3 ${
                              isDark ? 'text-[#858585]' : 'text-[#999]'
                            }`} />
                          </div>
                          <div className={`text-[10px] font-mono truncate ${
                            isDark ? 'text-[#569cd6]' : 'text-[#007acc]'
                          }`}>
                            {formula.latex.replace(/\\/g, '').substring(0, 40)}
                            {formula.latex.length > 40 ? '...' : ''}
                          </div>
                          <div className={`text-[10px] mt-0.5 line-clamp-1 ${
                            isDark ? 'text-[#858585]' : 'text-[#999]'
                          }`}>
                            {formula.description}
                          </div>
                        </button>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
