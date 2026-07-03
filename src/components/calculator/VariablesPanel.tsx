'use client';

import React, { useState } from 'react';
import { useCalculatorStore } from '@/lib/calculator/store';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Variable, Hash, Brackets, FunctionSquare, Sliders, Plus, Minus } from 'lucide-react';
import { t } from '@/lib/calculator/i18n';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export function VariablesPanel() {
  const { variables, setEditorContent, theme, setVariable, plots } = useCalculatorStore();
  const isDark = theme === 'dark';
  const [sliderMode, setSliderMode] = useState<string | null>(null);

  const varEntries = Object.entries(variables);

  const getIcon = (type: string) => {
    switch (type) {
      case 'number': return <Hash className={`h-3 w-3 ${isDark ? 'text-[#4fc3f7]' : 'text-[#007acc]'}`} />;
      case 'matrix': return <Brackets className={`h-3 w-3 ${isDark ? 'text-[#81c784]' : 'text-emerald-600'}`} />;
      case 'function': return <FunctionSquare className={`h-3 w-3 ${isDark ? 'text-[#ffb74d]' : 'text-amber-600'}`} />;
      default: return <Variable className={`h-3 w-3 ${isDark ? 'text-[#858585]' : 'text-[#888]'}`} />;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'number': return isDark ? 'text-[#4fc3f7]' : 'text-[#007acc]';
      case 'matrix': return isDark ? 'text-[#81c784]' : 'text-emerald-600';
      case 'function': return isDark ? 'text-[#ffb74d]' : 'text-amber-600';
      default: return isDark ? 'text-[#858585]' : 'text-[#888]';
    }
  };

  // Update a numeric variable's value (for slider adjustment)
  const updateNumericVar = (name: string, newValue: number) => {
    setVariable(name, {
      name,
      value: newValue,
      type: 'number',
    });
  };

  return (
    <div className="h-full flex flex-col">
      <div className={`px-3 py-2 text-[11px] uppercase tracking-wider font-medium border-b flex items-center justify-between ${
        isDark ? 'text-[#858585] border-[#3c3c3c]' : 'text-[#666] border-[#e0e0e0]'
      }`}>
        <span>{t('spVariables')}</span>
        <span className={isDark ? 'text-[#5a5a5a]' : 'text-[#aaa]'}>
          {varEntries.length}
        </span>
      </div>

      {varEntries.length === 0 ? (
        <div className={`flex-1 flex items-center justify-center text-xs p-4 ${
          isDark ? 'text-[#5a5a5a]' : 'text-[#aaa]'
        }`}>
          <div className="text-center">
            <Variable className={`h-8 w-8 mx-auto mb-2 opacity-30`} />
            <p>{t('varsNoVars')}</p>
            <p className={`text-[10px] mt-1 ${isDark ? 'text-[#4a4a4a]' : 'text-[#bbb]'}`}>
              {t('varsNoVarsHint')}
            </p>
          </div>
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-0.5">
            {/* Hint about sliders */}
            <div className={`text-[10px] mb-2 px-2 py-1.5 rounded-md border ${
              isDark ? 'bg-[#1a2332]/40 border-[#2a4a6a]/30 text-[#4fc3f7]/80' : 'bg-[#f0f7ff] border-[#cce4f7] text-[#007acc]'
            }`}>
              💡 提示：点击 <Sliders className="inline h-2.5 w-2.5" /> 图标可调整数值变量的值
            </div>

            {varEntries.map(([name, entry]) => {
              const isNumeric = entry.type === 'number' && typeof entry.value === 'number';
              const isSliderOpen = sliderMode === name;

              return (
                <div key={name} className={`rounded-sm transition-colors ${
                  isSliderOpen
                    ? isDark ? 'bg-[#2a2d2e]' : 'bg-[#f0f0f0]'
                    : ''
                }`}>
                  <div className="flex items-center gap-2 px-2 py-1.5 group">
                    {getIcon(entry.type)}
                    <button
                      onClick={() => setEditorContent(name)}
                      className={`flex items-center gap-1.5 flex-1 min-w-0 text-left`}
                    >
                      <span className={`text-[12px] font-mono flex-shrink-0 ${
                        isDark ? 'text-[#9cdcfe]' : 'text-[#007acc]'
                      }`}>
                        {name}
                      </span>
                      <span className={`text-[10px] flex-shrink-0 ${
                        isDark ? 'text-[#5a5a5a]' : 'text-[#aaa]'
                      }`}>
                        =
                      </span>
                      <span className={`text-[12px] font-mono truncate ${getTypeColor(entry.type)}`}>
                        {typeof entry.value === 'number'
                          ? (Number.isInteger(entry.value) ? entry.value : entry.value.toFixed(6))
                          : String(entry.value)
                        }
                      </span>
                    </button>

                    {/* Slider toggle for numeric variables */}
                    {isNumeric && (
                      <TooltipProvider delayDuration={300}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              onClick={() => setSliderMode(isSliderOpen ? null : name)}
                              className={`p-0.5 rounded transition-colors flex-shrink-0 ${
                                isSliderOpen
                                  ? isDark ? 'bg-[#094771] text-[#4fc3f7]' : 'bg-[#cce4f7] text-[#007acc]'
                                  : isDark
                                    ? 'text-[#5a5a5a] hover:text-[#4fc3f7]'
                                    : 'text-[#aaa] hover:text-[#007acc]'
                              }`}
                            >
                              <Sliders className="h-3 w-3" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="left" className={isDark ? 'bg-[#252526] text-[#cccccc] border-[#3c3c3c]' : 'bg-white text-[#333] border-[#e0e0e0]'}>
                            调整数值
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}

                    <span className={`text-[9px] flex-shrink-0 ${
                      isDark ? 'text-[#5a5a5a]' : 'text-[#aaa]'
                    }`}>
                      {entry.type}
                    </span>
                  </div>

                  {/* Slider control (expandable) */}
                  {isNumeric && isSliderOpen && (
                    <div className={`px-3 py-2 border-t ${
                      isDark ? 'border-[#3c3c3c]' : 'border-[#e0e0e0]'
                    }`}>
                      <SliderControl
                        name={name}
                        value={entry.value as number}
                        onChange={(v) => updateNumericVar(name, v)}
                        isDark={isDark}
                      />
                    </div>
                  )}
                </div>
              );
            })}

            {/* Plots info */}
            {plots.length > 0 && (
              <div className={`mt-3 pt-2 border-t text-[10px] ${
                isDark ? 'border-[#3c3c3c] text-[#5a5a5a]' : 'border-[#e0e0e0] text-[#aaa]'
              }`}>
                <div className="flex items-center justify-between px-1">
                  <span>当前绘图</span>
                  <span className={isDark ? 'text-[#4fc3f7]' : 'text-[#007acc]'}>{plots.length}</span>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

// Slider control component for adjusting numeric values
interface SliderControlProps {
  name: string;
  value: number;
  onChange: (value: number) => void;
  isDark: boolean;
}

function SliderControl({ name, value, onChange, isDark }: SliderControlProps) {
  // Auto-calculate range based on current value
  const absVal = Math.abs(value);
  const baseRange = absVal < 1 ? 1 : absVal < 10 ? 10 : absVal < 100 ? 100 : 1000;
  const [range, setRange] = useState(baseRange);
  const [step, setStep] = useState(baseRange / 100);

  const min = -range;
  const max = range;

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = parseFloat(e.target.value);
    onChange(newVal);
  };

  const handleStep = (delta: number) => {
    onChange(value + delta);
  };

  const adjustRange = (factor: number) => {
    const newRange = range * factor;
    setRange(newRange);
    setStep(newRange / 100);
  };

  return (
    <div className="space-y-2">
      {/* Current value display */}
      <div className="flex items-center justify-between">
        <span className={`text-[10px] font-mono ${isDark ? 'text-[#858585]' : 'text-[#999]'}`}>
          {name} =
        </span>
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className={`w-24 px-1.5 py-0.5 text-[11px] font-mono text-right rounded border outline-none ${
            isDark
              ? 'bg-[#1e1e1e] border-[#3c3c3c] text-[#4fc3f7] focus:border-[#007acc]'
              : 'bg-white border-[#e0e0e0] text-[#007acc] focus:border-[#007acc]'
          }`}
          step={step}
        />
      </div>

      {/* Slider */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => handleStep(-step)}
          className={`p-0.5 rounded transition-colors ${
            isDark ? 'text-[#858585] hover:text-white hover:bg-[#3c3c3c]' : 'text-[#999] hover:text-black hover:bg-[#e0e0e0]'
          }`}
          title="减小"
        >
          <Minus className="h-3 w-3" />
        </button>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={handleSliderChange}
          className="flex-1 h-1 accent-[#007acc] cursor-pointer"
          style={{
            background: isDark
              ? `linear-gradient(to right, #007acc 0%, #007acc ${((value - min) / (max - min)) * 100}%, #3c3c3c ${((value - min) / (max - min)) * 100}%, #3c3c3c 100%)`
              : `linear-gradient(to right, #007acc 0%, #007acc ${((value - min) / (max - min)) * 100}%, #e0e0e0 ${((value - min) / (max - min)) * 100}%, #e0e0e0 100%)`,
            borderRadius: '2px',
          }}
        />
        <button
          onClick={() => handleStep(step)}
          className={`p-0.5 rounded transition-colors ${
            isDark ? 'text-[#858585] hover:text-white hover:bg-[#3c3c3c]' : 'text-[#999] hover:text-black hover:bg-[#e0e0e0]'
          }`}
          title="增大"
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>

      {/* Range controls */}
      <div className="flex items-center justify-between text-[9px]">
        <span className={`font-mono ${isDark ? 'text-[#5a5a5a]' : 'text-[#aaa]'}`}>
          {min.toFixed(2)}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => adjustRange(0.1)}
            className={`px-1 py-0.5 rounded transition-colors ${
              isDark ? 'text-[#858585] hover:text-white hover:bg-[#3c3c3c]' : 'text-[#999] hover:text-black hover:bg-[#e0e0e0]'
            }`}
            title="缩小范围"
          >
            ×0.1
          </button>
          <button
            onClick={() => adjustRange(10)}
            className={`px-1 py-0.5 rounded transition-colors ${
              isDark ? 'text-[#858585] hover:text-white hover:bg-[#3c3c3c]' : 'text-[#999] hover:text-black hover:bg-[#e0e0e0]'
            }`}
            title="扩大范围"
          >
            ×10
          </button>
        </div>
        <span className={`font-mono ${isDark ? 'text-[#5a5a5a]' : 'text-[#aaa]'}`}>
          {max.toFixed(2)}
        </span>
      </div>

      {/* Step info */}
      <div className={`text-[9px] text-center ${isDark ? 'text-[#5a5a5a]' : 'text-[#aaa]'}`}>
        步长: {step}
      </div>
    </div>
  );
}
