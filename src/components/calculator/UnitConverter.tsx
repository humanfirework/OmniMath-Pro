'use client';

import React, { useState, useMemo } from 'react';
import { UNIT_CATEGORIES, convertUnit } from '@/lib/calculator/engine';
import { useCalculatorStore } from '@/lib/calculator/store';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { ArrowRight, Copy, Ruler } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { t } from '@/lib/calculator/i18n';

export function UnitConverter() {
  const { theme, setEditorContent } = useCalculatorStore();
  const isDark = theme === 'dark';

  const [category, setCategory] = useState('Length');
  const [fromUnit, setFromUnit] = useState('m');
  const [toUnit, setToUnit] = useState('ft');
  const [inputValue, setInputValue] = useState('1');

  const currentCategory = useMemo(
    () => UNIT_CATEGORIES.find(c => c.name === category),
    [category]
  );

  const result = useMemo(() => {
    const val = parseFloat(inputValue);
    if (isNaN(val)) return null;
    return convertUnit(val, fromUnit, toUnit, category);
  }, [inputValue, fromUnit, toUnit, category]);

  const handleCategoryChange = (newCat: string) => {
    setCategory(newCat);
    const cat = UNIT_CATEGORIES.find(c => c.name === newCat);
    if (cat && cat.units.length >= 2) {
      setFromUnit(cat.units[0].symbol);
      setToUnit(cat.units[1].symbol);
    }
  };

  const swapUnits = () => {
    setFromUnit(toUnit);
    setToUnit(fromUnit);
  };

  const copyResult = () => {
    if (result !== null) {
      navigator.clipboard.writeText(result.toString()).catch(() => {});
    }
  };

  const formatResult = (val: number): string => {
    if (Math.abs(val) >= 1e6 || (Math.abs(val) < 1e-4 && val !== 0)) {
      return val.toExponential(6);
    }
    return val.toLocaleString(undefined, { maximumFractionDigits: 8 });
  };

  return (
    <div className="h-full flex flex-col">
      <div className={`px-3 py-2 text-[11px] uppercase tracking-wider font-medium border-b flex items-center justify-between ${
        isDark ? 'text-[#858585] border-[#3c3c3c]' : 'text-[#666] border-[#e0e0e0]'
      }`}>
        <span className="flex items-center gap-1.5">
          <Ruler className={`h-3.5 w-3.5 ${isDark ? 'text-[#4fc3f7]' : 'text-[#007acc]'}`} />
          {t('unitsTitle')}
        </span>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-3">
          {/* Category selector */}
          <div>
            <label className={`text-[10px] uppercase tracking-wider mb-1 block ${
              isDark ? 'text-[#858585]' : 'text-[#888]'
            }`}>
              {t('unitsCategory')}
            </label>
            <Select value={category} onValueChange={handleCategoryChange}>
              <SelectTrigger className={`h-8 text-[12px] ${
                isDark ? 'bg-[#2d2d2d] border-[#3c3c3c] text-[#cccccc]' : 'bg-white border-[#e0e0e0] text-[#333]'
              }`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className={isDark ? 'bg-[#252526] border-[#3c3c3c]' : 'bg-white border-[#e0e0e0]'}>
                {UNIT_CATEGORIES.map(cat => (
                  <SelectItem key={cat.name} value={cat.name} className={`text-[12px] ${
                    isDark ? 'text-[#cccccc] focus:bg-[#094771]' : 'text-[#333] focus:bg-[#e5f1fb]'
                  }`}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Input value */}
          <div>
            <label className={`text-[10px] uppercase tracking-wider mb-1 block ${
              isDark ? 'text-[#858585]' : 'text-[#888]'
            }`}>
              {t('unitsValue')}
            </label>
            <Input
              type="text"
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              className={`h-8 font-mono text-[13px] ${
                isDark ? 'bg-[#2d2d2d] border-[#3c3c3c] text-[#cccccc]' : 'bg-white border-[#e0e0e0] text-[#333]'
              }`}
              placeholder={t('unitsEnterValue')}
            />
          </div>

          {/* From / To units */}
          <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-end">
            <div>
              <label className={`text-[10px] uppercase tracking-wider mb-1 block ${
                isDark ? 'text-[#858585]' : 'text-[#888]'
              }`}>
                {t('unitsFrom')}
              </label>
              <Select value={fromUnit} onValueChange={setFromUnit}>
                <SelectTrigger className={`h-8 text-[12px] ${
                  isDark ? 'bg-[#2d2d2d] border-[#3c3c3c] text-[#cccccc]' : 'bg-white border-[#e0e0e0] text-[#333]'
                }`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className={isDark ? 'bg-[#252526] border-[#3c3c3c]' : 'bg-white border-[#e0e0e0]'}>
                  {currentCategory?.units.map(unit => (
                    <SelectItem key={unit.symbol} value={unit.symbol} className={`text-[12px] ${
                      isDark ? 'text-[#cccccc] focus:bg-[#094771]' : 'text-[#333] focus:bg-[#e5f1fb]'
                    }`}>
                      <span className="font-mono">{unit.symbol}</span>
                      <span className="ml-2 opacity-60">{unit.name}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={swapUnits}
                    className={`h-8 w-8 ${
                      isDark ? 'text-[#858585] hover:text-[#4fc3f7] hover:bg-[#2a2d2e]' : 'text-[#888] hover:text-[#007acc] hover:bg-[#f0f0f0]'
                    }`}
                  >
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('unitsSwap')}</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <div>
              <label className={`text-[10px] uppercase tracking-wider mb-1 block ${
                isDark ? 'text-[#858585]' : 'text-[#888]'
              }`}>
                {t('unitsTo')}
              </label>
              <Select value={toUnit} onValueChange={setToUnit}>
                <SelectTrigger className={`h-8 text-[12px] ${
                  isDark ? 'bg-[#2d2d2d] border-[#3c3c3c] text-[#cccccc]' : 'bg-white border-[#e0e0e0] text-[#333]'
                }`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className={isDark ? 'bg-[#252526] border-[#3c3c3c]' : 'bg-white border-[#e0e0e0]'}>
                  {currentCategory?.units.map(unit => (
                    <SelectItem key={unit.symbol} value={unit.symbol} className={`text-[12px] ${
                      isDark ? 'text-[#cccccc] focus:bg-[#094771]' : 'text-[#333] focus:bg-[#e5f1fb]'
                    }`}>
                      <span className="font-mono">{unit.symbol}</span>
                      <span className="ml-2 opacity-60">{unit.name}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Result */}
          <div className={`rounded-md p-3 border ${
            isDark ? 'bg-[#1a2332] border-[#2a4a6a]/30' : 'bg-[#f0f7ff] border-[#cce4f7]'
          }`}>
            <div className={`text-[10px] uppercase tracking-wider mb-1 ${
              isDark ? 'text-[#5a5a5a]' : 'text-[#aaa]'
            }`}>
              {t('unitsResult')}
            </div>
            {result !== null && !isNaN(result) ? (
              <div className="flex items-center justify-between">
                <div className={`font-mono text-[16px] ${
                  isDark ? 'text-[#4fc3f7]' : 'text-[#007acc]'
                }`}>
                  {formatResult(result)}
                </div>
                <div className="flex items-center gap-1">
                  <span className={`text-[11px] font-mono ${
                    isDark ? 'text-[#858585]' : 'text-[#888]'
                  }`}>
                    {toUnit}
                  </span>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={copyResult}
                          className={`h-6 w-6 ${
                            isDark ? 'text-[#858585] hover:text-[#cccccc]' : 'text-[#888] hover:text-[#333]'
                          }`}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{t('unitsCopy')}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>
            ) : (
              <div className={`text-[13px] ${isDark ? 'text-[#5a5a5a]' : 'text-[#aaa]'}`}>
                {t('unitsEnterNumber')}
              </div>
            )}
          </div>

          {/* Quick conversions table */}
          {result !== null && !isNaN(result) && currentCategory && (
            <div>
              <div className={`text-[10px] uppercase tracking-wider mb-2 ${
                isDark ? 'text-[#858585]' : 'text-[#888]'
              }`}>
                {t('unitsAllConversions')}
              </div>
              <div className="space-y-1">
                {currentCategory.units
                  .filter(u => u.symbol !== fromUnit)
                  .map(unit => {
                    const converted = convertUnit(parseFloat(inputValue) || 0, fromUnit, unit.symbol, category);
                    if (converted === null || isNaN(converted)) return null;
                    return (
                      <button
                        key={unit.symbol}
                        onClick={() => setToUnit(unit.symbol)}
                        className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-[11px] transition-colors ${
                          isDark
                            ? 'hover:bg-[#2a2d2e] text-[#cccccc]'
                            : 'hover:bg-[#f0f0f0] text-[#333]'
                        }`}
                      >
                        <span className={`font-mono ${isDark ? 'text-[#9cdcfe]' : 'text-[#007acc]'}`}>
                          {unit.symbol}
                        </span>
                        <span className="font-mono opacity-80">
                          {formatResult(converted)}
                        </span>
                      </button>
                    );
                  })}
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
