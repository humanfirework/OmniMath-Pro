'use client';

import React, { useState, useMemo } from 'react';
import { getAllBases, NumberBase } from '@/lib/calculator/engine';
import { useCalculatorStore } from '@/lib/calculator/store';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Hash, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { t } from '@/lib/calculator/i18n';

const BASE_LABEL_KEYS: Record<NumberBase, 'basesBinary' | 'basesOctal' | 'basesDecimal' | 'basesHex'> = {
  bin: 'basesBinary',
  oct: 'basesOctal',
  dec: 'basesDecimal',
  hex: 'basesHex',
};

const BASE_INFO: Record<NumberBase, { prefix: string; color: string; description: string }> = {
  bin: { prefix: '0b', color: 'text-[#81c784]', description: 'Base 2 (0-1)' },
  oct: { prefix: '0o', color: 'text-[#ffb74d]', description: 'Base 8 (0-7)' },
  dec: { prefix: '', color: 'text-[#4fc3f7]', description: 'Base 10 (0-9)' },
  hex: { prefix: '0x', color: 'text-[#f06292]', description: 'Base 16 (0-F)' },
};

export function BaseConverter() {
  const { theme, setEditorContent } = useCalculatorStore();
  const isDark = theme === 'dark';

  const [inputBase, setInputBase] = useState<NumberBase>('dec');
  const [inputValue, setInputValue] = useState('42');
  const [copied, setCopied] = useState<string | null>(null);

  const allBases = useMemo(() => {
    if (!inputValue.trim()) return null;
    return getAllBases(inputValue, inputBase);
  }, [inputValue, inputBase]);

  const handleCopy = (base: NumberBase, value: string) => {
    navigator.clipboard.writeText(value).catch(() => {});
    setCopied(base);
    setTimeout(() => setCopied(null), 1500);
  };

  const isValidInput = (value: string, base: NumberBase): boolean => {
    if (!value.trim()) return false;
    const cleaned = value.trim().replace(/^0[xbo]/i, '');
    switch (base) {
      case 'bin': return /^[01]+$/.test(cleaned);
      case 'oct': return /^[0-7]+$/.test(cleaned);
      case 'dec': return /^\d+$/.test(cleaned);
      case 'hex': return /^[0-9a-fA-F]+$/.test(cleaned);
    }
  };

  const valid = isValidInput(inputValue, inputBase);

  return (
    <div className="h-full flex flex-col">
      <div className={`px-3 py-2 text-[11px] uppercase tracking-wider font-medium border-b flex items-center justify-between ${
        isDark ? 'text-[#858585] border-[#3c3c3c]' : 'text-[#666] border-[#e0e0e0]'
      }`}>
        <span className="flex items-center gap-1.5">
          <Hash className={`h-3.5 w-3.5 ${isDark ? 'text-[#4fc3f7]' : 'text-[#007acc]'}`} />
          {t('basesTitle')}
        </span>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-3">
          {/* Base selector tabs */}
          <div>
            <label className={`text-[10px] uppercase tracking-wider mb-1 block ${
              isDark ? 'text-[#858585]' : 'text-[#888]'
            }`}>
              {t('basesInput')}
            </label>
            <div className="grid grid-cols-4 gap-1">
              {(Object.keys(BASE_LABEL_KEYS) as NumberBase[]).map(base => (
                <button
                  key={base}
                  onClick={() => setInputBase(base)}
                  className={`px-2 py-1.5 rounded text-[11px] font-medium transition-all ${
                    inputBase === base
                      ? isDark
                        ? 'bg-[#094771] text-white'
                        : 'bg-[#007acc] text-white'
                      : isDark
                        ? 'bg-[#2d2d2d] text-[#858585] hover:bg-[#2a2d2e] hover:text-[#cccccc]'
                        : 'bg-[#f5f5f5] text-[#888] hover:bg-[#f0f0f0] hover:text-[#333]'
                  }`}
                >
                  {t(BASE_LABEL_KEYS[base])}
                </button>
              ))}
            </div>
          </div>

          {/* Input value */}
          <div>
            <label className={`text-[10px] uppercase tracking-wider mb-1 block ${
              isDark ? 'text-[#858585]' : 'text-[#888]'
            }`}>
              {t('basesInput')} ({BASE_INFO[inputBase].description})
            </label>
            <Input
              type="text"
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              className={`h-9 font-mono text-[14px] ${
                !valid
                  ? 'border-red-500'
                  : isDark
                    ? 'bg-[#2d2d2d] border-[#3c3c3c] text-[#cccccc] focus-visible:border-[#007acc]'
                    : 'bg-white border-[#e0e0e0] text-[#333] focus-visible:border-[#007acc]'
              }`}
              placeholder={`${t(BASE_LABEL_KEYS[inputBase])}...`}
            />
            {!valid && inputValue.trim() && (
              <p className={`text-[10px] mt-1 ${isDark ? 'text-red-400' : 'text-red-600'}`}>
                {t('basesInvalidNumber')}
              </p>
            )}
          </div>

          {/* All bases display */}
          {allBases && valid ? (
            <div className="space-y-2">
              <div className={`text-[10px] uppercase tracking-wider mb-2 ${
                isDark ? 'text-[#858585]' : 'text-[#888]'
              }`}>
                {t('basesConversions')}
              </div>
              {(Object.keys(BASE_LABEL_KEYS) as NumberBase[]).map(base => {
                const value = allBases[base];
                const info = BASE_INFO[base];
                return (
                  <div
                    key={base}
                    className={`rounded-md p-2.5 border transition-all ${
                      base === inputBase
                        ? isDark
                          ? 'bg-[#094771]/20 border-[#094771]/40'
                          : 'bg-[#e5f1fb] border-[#007acc]/30'
                        : isDark
                          ? 'bg-[#2d2d2d] border-[#3c3c3c] hover:border-[#505050]'
                          : 'bg-[#fafafa] border-[#e0e0e0] hover:border-[#bbb]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] uppercase tracking-wider font-medium ${info.color}`}>
                          {t(BASE_LABEL_KEYS[base])}
                        </span>
                        {base === inputBase && (
                          <span className={`text-[9px] px-1 rounded ${
                            isDark ? 'bg-[#4fc3f7]/20 text-[#4fc3f7]' : 'bg-[#007acc]/20 text-[#007acc]'
                          }`}>
                            {t('basesInputTag')}
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => handleCopy(base, value)}
                        className={`p-1 rounded transition-colors ${
                          isDark ? 'text-[#858585] hover:text-[#cccccc] hover:bg-[#3c3c3c]' : 'text-[#888] hover:text-[#333] hover:bg-[#e0e0e0]'
                        }`}
                      >
                        {copied === base ? (
                          <Check className="h-3 w-3 text-[#6a9955]" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </button>
                    </div>
                    <div className={`font-mono text-[14px] mt-1 break-all ${
                      isDark ? 'text-[#d4d4d4]' : 'text-[#333]'
                    }`}>
                      {info.prefix && <span className="opacity-50">{info.prefix}</span>}
                      {value}
                    </div>
                  </div>
                );
              })}

              {/* Insert into editor button */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditorContent(allBases.dec)}
                className={`w-full mt-3 h-7 text-[11px] ${
                  isDark
                    ? 'bg-[#2d2d2d] border-[#3c3c3c] text-[#cccccc] hover:bg-[#2a2d2e]'
                    : 'bg-white border-[#e0e0e0] text-[#333] hover:bg-[#f0f0f0]'
                }`}
              >
                {t('basesInsert')}
              </Button>
            </div>
          ) : (
            <div className={`text-center text-[11px] py-8 ${isDark ? 'text-[#5a5a5a]' : 'text-[#aaa]'}`}>
              <Hash className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p>{t('basesEnterNumber')}</p>
            </div>
          )}

          {/* Bit visualization for small numbers */}
          {allBases && valid && allBases.dec.length <= 20 && parseInt(allBases.dec, 10) <= 1023 && (
            <div>
              <div className={`text-[10px] uppercase tracking-wider mb-2 ${
                isDark ? 'text-[#858585]' : 'text-[#888]'
              }`}>
                {t('basesBits')}
              </div>
              <div className="flex flex-wrap gap-0.5">
                {allBases.bin.split('').map((bit, i) => (
                  <div
                    key={i}
                    className={`w-6 h-6 flex items-center justify-center rounded text-[10px] font-mono font-medium ${
                      bit === '1'
                        ? isDark
                          ? 'bg-[#4fc3f7]/30 text-[#4fc3f7] border border-[#4fc3f7]/40'
                          : 'bg-[#007acc]/20 text-[#007acc] border border-[#007acc]/30'
                        : isDark
                          ? 'bg-[#2d2d2d] text-[#5a5a5a] border border-[#3c3c3c]'
                          : 'bg-[#f5f5f5] text-[#bbb] border border-[#e0e0e0]'
                    }`}
                    title={`Bit ${allBases.bin.length - 1 - i} (value ${Math.pow(2, allBases.bin.length - 1 - i)})`}
                  >
                    {bit}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
