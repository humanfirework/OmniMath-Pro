'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Calculator, X, Pin, PinOff, Copy, Check, RotateCcw,
  Ruler, ArrowLeftRight, ChevronDown, ChevronUp
} from 'lucide-react';
import { useWorkbenchStore } from '@/lib/store/workbench';
import { evaluateExpression } from '@/lib/engine';
import { cn } from '@/lib/utils';

type CalcMode = 'basic' | 'scientific' | 'converter';
type ConverterCategory = 'length' | 'weight' | 'temperature' | 'area' | 'volume' | 'time';

interface UnitDef {
  id: string;
  label: string;
  factor: number;
  offset?: number;
}

const UNIT_CATEGORIES: Record<ConverterCategory, { label: string; units: UnitDef[] }> = {
  length: {
    label: 'Length',
    units: [
      { id: 'm', label: 'm (meter)', factor: 1 },
      { id: 'km', label: 'km', factor: 1000 },
      { id: 'cm', label: 'cm', factor: 0.01 },
      { id: 'mm', label: 'mm', factor: 0.001 },
      { id: 'in', label: 'in (inch)', factor: 0.0254 },
      { id: 'ft', label: 'ft (foot)', factor: 0.3048 },
      { id: 'yd', label: 'yd (yard)', factor: 0.9144 },
      { id: 'mi', label: 'mi (mile)', factor: 1609.344 },
    ],
  },
  weight: {
    label: 'Weight',
    units: [
      { id: 'kg', label: 'kg', factor: 1 },
      { id: 'g', label: 'g', factor: 0.001 },
      { id: 'mg', label: 'mg', factor: 0.000001 },
      { id: 'lb', label: 'lb (pound)', factor: 0.45359237 },
      { id: 'oz', label: 'oz (ounce)', factor: 0.0283495231 },
      { id: 't', label: 't (tonne)', factor: 1000 },
    ],
  },
  temperature: {
    label: 'Temperature',
    units: [
      { id: 'c', label: '°C', factor: 1, offset: 0 },
      { id: 'f', label: '°F', factor: 5 / 9, offset: -32 * 5 / 9 },
      { id: 'k', label: 'K', factor: 1, offset: -273.15 },
    ],
  },
  area: {
    label: 'Area',
    units: [
      { id: 'm2', label: 'm²', factor: 1 },
      { id: 'km2', label: 'km²', factor: 1000000 },
      { id: 'cm2', label: 'cm²', factor: 0.0001 },
      { id: 'ha', label: 'ha (hectare)', factor: 10000 },
      { id: 'ac', label: 'ac (acre)', factor: 4046.8564224 },
      { id: 'ft2', label: 'ft²', factor: 0.09290304 },
    ],
  },
  volume: {
    label: 'Volume',
    units: [
      { id: 'l', label: 'L (liter)', factor: 1 },
      { id: 'ml', label: 'mL', factor: 0.001 },
      { id: 'm3', label: 'm³', factor: 1000 },
      { id: 'gal', label: 'gal (US)', factor: 3.785411784 },
      { id: 'qt', label: 'qt', factor: 0.946352946 },
      { id: 'cup', label: 'cup', factor: 0.2365882365 },
    ],
  },
  time: {
    label: 'Time',
    units: [
      { id: 's', label: 'sec', factor: 1 },
      { id: 'ms', label: 'ms', factor: 0.001 },
      { id: 'min', label: 'min', factor: 60 },
      { id: 'h', label: 'hr', factor: 3600 },
      { id: 'd', label: 'day', factor: 86400 },
      { id: 'wk', label: 'week', factor: 604800 },
    ],
  },
};

function convertUnit(value: number, from: UnitDef, to: UnitDef): number {
  // Special handling for temperature
  if (from.offset !== undefined && to.offset !== undefined) {
    const baseValue = value * from.factor + from.offset;
    return (baseValue - to.offset) / to.factor;
  }
  return (value * from.factor) / to.factor;
}

const BUTTON_CLASS =
  'h-9 rounded-lg text-sm font-medium transition-all duration-100 active:scale-95 select-none flex items-center justify-center';

export function FloatingCalculator() {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [mode, setMode] = useState<CalcMode>('basic');
  const [display, setDisplay] = useState('0');
  const [expression, setExpression] = useState('');
  const [justEvaluated, setJustEvaluated] = useState(false);
  const [copied, setCopied] = useState(false);

  // Converter state
  const [convCategory, setConvCategory] = useState<ConverterCategory>('length');
  const [convFrom, setConvFrom] = useState('m');
  const [convTo, setConvTo] = useState('ft');
  const [convValue, setConvValue] = useState('1');
  const [convResult, setConvResult] = useState('3.28084');

  // Drag state
  const [position, setPosition] = useState({ x: 20, y: 80 });
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef({ startX: 0, startY: 0, startPosX: 0, startPosY: 0 });

  // Keyboard shortcut — Ctrl+Shift+C
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === 'Escape' && open && !pinned) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, pinned]);

  // Converter calculation
  useEffect(() => {
    if (mode !== 'converter') return;
    const cat = UNIT_CATEGORIES[convCategory];
    const fromUnit = cat.units.find((u) => u.id === convFrom);
    const toUnit = cat.units.find((u) => u.id === convTo);
    if (!fromUnit || !toUnit) return;
    const val = parseFloat(convValue);
    if (isNaN(val)) {
      setConvResult('');
      return;
    }
    const result = convertUnit(val, fromUnit, toUnit);
    setConvResult(result.toPrecision(6).replace(/\.?0+$/, ''));
  }, [mode, convCategory, convFrom, convTo, convValue]);

  // When category changes, reset to sensible defaults
  useEffect(() => {
    const cat = UNIT_CATEGORIES[convCategory];
    setConvFrom(cat.units[0].id);
    setConvTo(cat.units[1]?.id || cat.units[0].id);
  }, [convCategory]);

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    setDragging(true);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startPosX: position.x,
      startPosY: position.y,
    };
  }, [position]);

  useEffect(() => {
    if (!dragging) return;
    const handleMove = (e: MouseEvent) => {
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      setPosition({
        x: Math.max(0, Math.min(window.innerWidth - 280, dragRef.current.startPosX + dx)),
        y: Math.max(0, Math.min(window.innerHeight - 200, dragRef.current.startPosY + dy)),
      });
    };
    const handleUp = () => setDragging(false);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [dragging]);

  const inputDigit = useCallback((digit: string) => {
    if (justEvaluated) {
      setDisplay(digit);
      setExpression(digit);
      setJustEvaluated(false);
    } else if (display === '0' && digit !== '.') {
      setDisplay(digit);
      setExpression(digit);
    } else {
      setDisplay(display + digit);
      setExpression(expression + digit);
    }
  }, [display, expression, justEvaluated]);

  const inputOperator = useCallback((op: string) => {
    setJustEvaluated(false);
    setDisplay(display + op);
    setExpression(expression + op);
  }, [display, expression]);

  const clearAll = useCallback(() => {
    setDisplay('0');
    setExpression('');
    setJustEvaluated(false);
  }, []);

  const backspace = useCallback(() => {
    if (justEvaluated) {
      clearAll();
      return;
    }
    if (display.length <= 1) {
      setDisplay('0');
      setExpression('');
    } else {
      setDisplay(display.slice(0, -1));
      setExpression(expression.slice(0, -1));
    }
  }, [display, expression, justEvaluated, clearAll]);

  const evaluate = useCallback(() => {
    try {
      const expr = expression || display;
      const r = evaluateExpression(expr, 'simple');
      if (r.success) {
        setDisplay(r.result);
        setExpression(r.result);
        setJustEvaluated(true);
      }
    } catch {
      setDisplay('Error');
    }
  }, [display, expression]);

  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(display);
      setCopied(true);
      clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 1400);
    } catch {
      /* ignore */
    }
  }, [display]);

  const toggleSign = useCallback(() => {
    if (display === '0' || display === 'Error') return;
    if (display.startsWith('-')) {
      setDisplay(display.slice(1));
      setExpression(expression.slice(1));
    } else {
      setDisplay('-' + display);
      setExpression('-' + expression);
    }
  }, [display, expression]);

  const inputPercent = useCallback(() => {
    try {
      const val = parseFloat(display);
      if (!isNaN(val)) {
        const result = (val / 100).toString();
        setDisplay(result);
        setExpression(result);
      }
    } catch { /* ignore */ }
  }, [display]);

  const inputConstant = useCallback((val: string, displayVal: string) => {
    if (justEvaluated || display === '0') {
      setDisplay(displayVal);
      setExpression(val);
    } else {
      setDisplay(display + displayVal);
      setExpression(expression + val);
    }
    setJustEvaluated(false);
  }, [display, expression, justEvaluated]);

  const Btn = ({
    children,
    onClick,
    variant = 'default',
    className = '',
  }: {
    children: React.ReactNode;
    onClick: () => void;
    variant?: 'default' | 'op' | 'fn' | 'eq' | 'clear';
    className?: string;
  }) => {
    const variants = {
      default: 'bg-accent/50 hover:bg-accent text-foreground',
      op: 'bg-primary/10 hover:bg-primary/20 text-primary font-semibold',
      fn: 'bg-muted hover:bg-muted/70 text-muted-foreground',
      eq: 'bg-primary hover:bg-primary/90 text-primary-foreground font-semibold',
      clear: 'bg-destructive/10 hover:bg-destructive/20 text-destructive',
    };
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(BUTTON_CLASS, variants[variant], className)}
      >
        {children}
      </button>
    );
  };

  return (
    <>
      {/* Toggle button (fixed corner) */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="fixed bottom-4 right-4 z-[75] size-11 rounded-full bg-primary text-primary-foreground shadow-lg hover:shadow-xl transition-all hover:scale-105 active:scale-95 flex items-center justify-center"
        title="Floating Calculator (Ctrl+Shift+C)"
      >
        <Calculator className="size-5" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: 'spring', stiffness: 300, damping: 26 }}
            style={{
              left: position.x,
              top: position.y,
              zIndex: 76,
            }}
            className={cn(
              'fixed w-[280px] rounded-xl border border-border bg-card/95 backdrop-blur-xl shadow-2xl overflow-hidden',
              dragging ? 'cursor-grabbing' : ''
            )}
          >
            {/* Header / drag handle */}
            <div
              onMouseDown={handleDragStart}
              className={cn(
                'flex items-center gap-2 px-3 py-2 border-b border-border/60 bg-muted/30',
                dragging ? 'cursor-grabbing' : 'cursor-grab'
              )}
            >
              <Calculator className="size-4 text-primary shrink-0" />
              <span className="text-xs font-medium text-foreground/80 flex-1">Quick Calc</span>
              <button
                type="button"
                onClick={handleCopy}
                className="size-6 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground flex items-center justify-center"
                title="Copy result"
              >
                {copied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
              </button>
              <button
                type="button"
                onClick={() => setPinned(!pinned)}
                className={cn(
                  'size-6 rounded-md flex items-center justify-center',
                  pinned ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                )}
                title={pinned ? 'Unpin (Esc to close)' : 'Pin (always open)'}
              >
                {pinned ? <Pin className="size-3.5" /> : <PinOff className="size-3.5" />}
              </button>
              {!pinned && (
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="size-6 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground flex items-center justify-center"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>

            {/* Mode tabs */}
            <div className="flex px-2 pt-2 gap-1">
              {(['basic', 'scientific', 'converter'] as CalcMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={cn(
                    'flex-1 text-[11px] py-1 rounded-md font-medium transition-colors',
                    mode === m
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-accent/50'
                  )}
                >
                  {m.charAt(0).toUpperCase() + m.slice(1)}
                </button>
              ))}
            </div>

            {mode === 'converter' ? (
              <div className="p-3 space-y-3">
                {/* Category selector */}
                <div className="grid grid-cols-3 gap-1">
                  {(Object.keys(UNIT_CATEGORIES) as ConverterCategory[]).map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setConvCategory(cat)}
                      className={cn(
                        'text-[10px] py-1.5 rounded-md transition-colors flex items-center justify-center gap-1',
                        convCategory === cat
                          ? 'bg-primary/10 text-primary'
                          : 'text-muted-foreground hover:bg-accent/50'
                      )}
                    >
                      <Ruler className="size-3" />
                      {UNIT_CATEGORIES[cat].label.slice(0, 5)}
                    </button>
                  ))}
                </div>

                {/* From input */}
                <div className="space-y-1">
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wider">From</label>
                  <div className="flex gap-1">
                    <input
                      type="text"
                      value={convValue}
                      onChange={(e) => setConvValue(e.target.value)}
                      className="flex-1 h-8 px-2 rounded-md bg-muted/50 border border-border/50 text-sm font-mono outline-none focus:border-primary/50"
                    />
                    <select
                      value={convFrom}
                      onChange={(e) => setConvFrom(e.target.value)}
                      className="h-8 px-1 rounded-md bg-muted/50 border border-border/50 text-xs outline-none"
                    >
                      {UNIT_CATEGORIES[convCategory].units.map((u) => (
                        <option key={u.id} value={u.id}>{u.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Swap button */}
                <button
                  type="button"
                  onClick={() => {
                    const tmp = convFrom;
                    setConvFrom(convTo);
                    setConvTo(tmp);
                    setConvValue(convResult || '1');
                  }}
                  className="w-full flex items-center justify-center gap-1 py-1 text-[11px] text-muted-foreground hover:text-primary"
                >
                  <ArrowLeftRight className="size-3" /> Swap
                </button>

                {/* To result */}
                <div className="space-y-1">
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wider">To</label>
                  <div className="flex gap-1">
                    <div className="flex-1 h-8 px-2 rounded-md bg-primary/5 border border-primary/20 text-sm font-mono text-primary flex items-center">
                      {convResult || '—'}
                    </div>
                    <select
                      value={convTo}
                      onChange={(e) => setConvTo(e.target.value)}
                      className="h-8 px-1 rounded-md bg-muted/50 border border-border/50 text-xs outline-none"
                    >
                      {UNIT_CATEGORIES[convCategory].units.map((u) => (
                        <option key={u.id} value={u.id}>{u.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            ) : (
              <>
                {/* Display */}
                <div className="px-3 pt-3 pb-2">
                  <div className="text-right">
                    <div className="text-[11px] text-muted-foreground font-mono h-4 truncate">
                      {expression && expression !== display ? expression : ''}
                    </div>
                    <div className="text-2xl font-mono font-semibold text-foreground truncate">
                      {display}
                    </div>
                  </div>
                </div>

                {/* Buttons grid */}
                <div className="px-3 pb-3">
                  {mode === 'scientific' && (
                    <div className="grid grid-cols-5 gap-1.5 mb-1.5">
                      <Btn variant="fn" onClick={() => inputConstant('pi', 'π')}>π</Btn>
                      <Btn variant="fn" onClick={() => inputConstant('e', 'e')}>e</Btn>
                      <Btn variant="fn" onClick={() => inputOperator('^2')}>x²</Btn>
                      <Btn variant="fn" onClick={() => inputOperator('^')}>x^y</Btn>
                      <Btn variant="fn" onClick={() => inputOperator('sqrt(')}>√</Btn>
                      <Btn variant="fn" onClick={() => inputOperator('sin(')}>sin</Btn>
                      <Btn variant="fn" onClick={() => inputOperator('cos(')}>cos</Btn>
                      <Btn variant="fn" onClick={() => inputOperator('tan(')}>tan</Btn>
                      <Btn variant="fn" onClick={() => inputOperator('ln(')}>ln</Btn>
                      <Btn variant="fn" onClick={() => inputOperator('log(')}>log</Btn>
                    </div>
                  )}
                  <div className="grid grid-cols-4 gap-1.5">
                    <Btn variant="clear" onClick={clearAll}>
                      <RotateCcw className="size-4" />
                    </Btn>
                    <Btn variant="fn" onClick={toggleSign}>±</Btn>
                    <Btn variant="fn" onClick={inputPercent}>%</Btn>
                    <Btn variant="op" onClick={() => inputOperator('/')}>÷</Btn>

                    <Btn onClick={() => inputDigit('7')}>7</Btn>
                    <Btn onClick={() => inputDigit('8')}>8</Btn>
                    <Btn onClick={() => inputDigit('9')}>9</Btn>
                    <Btn variant="op" onClick={() => inputOperator('*')}>×</Btn>

                    <Btn onClick={() => inputDigit('4')}>4</Btn>
                    <Btn onClick={() => inputDigit('5')}>5</Btn>
                    <Btn onClick={() => inputDigit('6')}>6</Btn>
                    <Btn variant="op" onClick={() => inputOperator('-')}>−</Btn>

                    <Btn onClick={() => inputDigit('1')}>1</Btn>
                    <Btn onClick={() => inputDigit('2')}>2</Btn>
                    <Btn onClick={() => inputDigit('3')}>3</Btn>
                    <Btn variant="op" onClick={() => inputOperator('+')}>+</Btn>

                    <Btn onClick={() => inputDigit('0')} className="col-span-2">0</Btn>
                    <Btn onClick={() => inputDigit('.')}>.</Btn>
                    <Btn variant="eq" onClick={evaluate}>=</Btn>
                  </div>
                  <div className="flex gap-1.5 mt-1.5">
                    <Btn variant="fn" onClick={backspace} className="flex-1">⌫</Btn>
                    <Btn variant="fn" onClick={() => inputOperator('(')}>(</Btn>
                    <Btn variant="fn" onClick={() => inputOperator(')')}>)</Btn>
                  </div>
                </div>
              </>
            )}

            {/* Footer hint */}
            <div className="px-3 py-1.5 border-t border-border/60 text-[10px] text-muted-foreground flex items-center justify-between bg-muted/20">
              <span className="font-mono">Ctrl+Shift+C</span>
              <span>Drag to move</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
