'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Calculator, X, Pin, PinOff, Copy, Check, RotateCcw,
  Ruler, ArrowLeftRight, ChevronDown, ChevronUp,
  FlaskConical, Binary, Grid3x3, History, NotebookPen,
  StickyNote, Plus,
} from 'lucide-react';
import { evaluateExpression, math } from '@/lib/engine';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';

type CalcMode = 'basic' | 'scientific' | 'programmer' | 'linalg' | 'converter';
type ConverterCategory = 'length' | 'weight' | 'temperature' | 'area' | 'volume' | 'time';
type ProgrammerBase = 2 | 8 | 10 | 16;
type MatrixSize = 2 | 3;
type MatrixOp = 'det' | 'inv' | 'transpose' | 'eigen';

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

const MODE_TABS: { mode: CalcMode; icon: React.ComponentType<{ className?: string }>; label: string }[] = [
  { mode: 'basic', icon: Calculator, label: 'Basic' },
  { mode: 'scientific', icon: FlaskConical, label: 'Sci' },
  { mode: 'programmer', icon: Binary, label: 'Prog' },
  { mode: 'linalg', icon: Grid3x3, label: 'Lin' },
  { mode: 'converter', icon: ArrowLeftRight, label: 'Conv' },
];

const PROGRAMMER_BASES: { base: ProgrammerBase; label: string }[] = [
  { base: 10, label: 'DEC' },
  { base: 16, label: 'HEX' },
  { base: 2, label: 'BIN' },
  { base: 8, label: 'OCT' },
];

// Format a number for display (trim trailing zeros, keep precision)
function formatNum(v: number): string {
  if (!isFinite(v)) return v.toString();
  if (Number.isInteger(v)) return v.toString();
  const fixed = v.toFixed(6);
  return parseFloat(fixed).toString();
}

// Format an unknown value from mathjs (handles numbers, complex, etc.)
function formatMathValue(v: unknown): string {
  if (typeof v === 'number') return formatNum(v);
  if (v && typeof v === 'object') {
    const obj = v as { re?: number; im?: number };
    if (typeof obj.re === 'number' && typeof obj.im === 'number') {
      const re = obj.re;
      const im = obj.im;
      if (Math.abs(im) < 1e-10) return formatNum(re);
      if (Math.abs(re) < 1e-10) return `${formatNum(im)}i`;
      return `${formatNum(re)} ${im > 0 ? '+' : '-'} ${formatNum(Math.abs(im))}i`;
    }
  }
  return String(v);
}

// Format a 2D number array as a multiline string for clipboard
function formatMatrixString(m: unknown[][]): string {
  return m.map((row) => row.map((v) => formatMathValue(v)).join('\t')).join('\n');
}

// -1 means "use the CSS default position" (bottom-right corner via bottom-4 right-4)
const DEFAULT_FAB_POS = { x: -1, y: -1 };

export function FloatingCalculator() {
  const t = useT();
  const modeLabel: Record<CalcMode, string> = {
    basic: t('qcModeBasic'),
    scientific: t('qcModeSci'),
    programmer: t('qcModeProg'),
    linalg: t('qcModeLin'),
    converter: t('qcModeConv'),
  };
  const unitCategoryLabel: Record<ConverterCategory, string> = {
    length: t('unitsLength'),
    weight: t('unitsMass'),
    temperature: t('unitsTemperature'),
    area: t('unitsArea'),
    volume: t('unitsVolume'),
    time: t('unitsTime'),
  };
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
  // Refs for transform-based drag: write translate3d directly to the DOM via
  // rAF instead of setState({left/top}) on every mousemove (avoids reflow +
  // full re-render). Final position is committed to state once on mouseup.
  const panelRef = useRef<HTMLDivElement>(null);
  const fabRef = useRef<HTMLButtonElement>(null);
  const rafRef = useRef<number | null>(null);
  const fabRafRef = useRef<number | null>(null);
  const pendingPosRef = useRef<{ x: number; y: number } | null>(null);
  const pendingFabPosRef = useRef<{ x: number; y: number } | null>(null);
  const offsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const draggingRef = useRef(false);

  // FAB drag state — lets the user reposition the floating toggle button
  const [fabPosition, setFabPosition] = useState<{x: number, y: number}>(() => {
    try {
      const saved = localStorage.getItem('omnimath-fab-position');
      return saved ? JSON.parse(saved) : DEFAULT_FAB_POS;
    } catch { return DEFAULT_FAB_POS; }
  });
  const [fabDragging, setFabDragging] = useState(false);
  const fabDragRef = useRef({ startX: 0, startY: 0, startPosX: 0, startPosY: 0, moved: false });

  // Programmer state
  const [progBase, setProgBase] = useState<ProgrammerBase>(10);
  const [progValue, setProgValue] = useState('');
  const [progOperand, setProgOperand] = useState<number | null>(null);
  const [progOp, setProgOp] = useState<string | null>(null);
  const [progJustOp, setProgJustOp] = useState(false);

  // LinAlg state
  const [matrixSize, setMatrixSize] = useState<MatrixSize>(2);
  const [matrix, setMatrix] = useState<string[]>(Array(9).fill(''));
  const [matrixResult, setMatrixResult] = useState<
    { kind: 'scalar'; value: string } |
    { kind: 'array'; values: string[] } |
    { kind: 'matrix'; data: string[][] } |
    null
  >(null);
  const [matrixError, setMatrixError] = useState('');
  const [matrixCopied, setMatrixCopied] = useState(false);

  // Memory state (basic mode)
  const memoryRef = useRef<number>(0);
  const [memoryValue, setMemoryValue] = useState(0); // 渲染期读取记忆值（ref 不能在 render 中访问）

  // History state
  const [history, setHistory] = useState<string[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // Notepad state
  const [notepadText, setNotepadText] = useState('');
  const [showNotepad, setShowNotepad] = useState(false);

  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const matrixCopyTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Load memory and history from localStorage on mount
  useEffect(() => {
    try {
      const mem = localStorage.getItem('calc-memory');
      if (mem !== null) {
        memoryRef.current = parseFloat(mem) || 0;
        setMemoryValue(memoryRef.current);
      }
    } catch { /* ignore */ }
    try {
      const hist = localStorage.getItem('calc-history');
      if (hist) {
        const parsed = JSON.parse(hist) as unknown;
        if (Array.isArray(parsed)) {
          setHistory(parsed.filter((x): x is string => typeof x === 'string').slice(0, 20));
        }
      }
    } catch { /* ignore */ }
    try {
      const note = localStorage.getItem('calc-notepad');
      if (note !== null) {
        setNotepadText(note);
      }
    } catch { /* ignore */ }
    try {
      const noteOpen = localStorage.getItem('calc-notepad-open');
      if (noteOpen !== null) {
        setShowNotepad(JSON.parse(noteOpen) === true);
      }
    } catch { /* ignore */ }
  }, []);

  // Persist memory
  const saveMemory = useCallback((v: number) => {
    memoryRef.current = v;
    setMemoryValue(v);
    try {
      localStorage.setItem('calc-memory', v.toString());
    } catch { /* ignore */ }
  }, []);

  // Persist history
  const addHistory = useCallback((entry: string) => {
    setHistory((prev) => {
      const next = [entry, ...prev].slice(0, 20);
      try {
        localStorage.setItem('calc-history', JSON.stringify(next));
      } catch { /* ignore */ }
      return next;
    });
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
    try {
      localStorage.removeItem('calc-history');
    } catch { /* ignore */ }
  }, []);

  // Notepad handlers (persist content and open state)
  const handleNotepadChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    setNotepadText(v);
    try {
      localStorage.setItem('calc-notepad', v);
    } catch { /* ignore */ }
  }, []);

  const toggleNotepad = useCallback(() => {
    setShowNotepad((v) => {
      const next = !v;
      try {
        localStorage.setItem('calc-notepad-open', JSON.stringify(next));
      } catch { /* ignore */ }
      return next;
    });
  }, []);

  // Append a calculation line (HH:MM:SS  expr = result) to the notepad and open it
  const appendToNotepad = useCallback((expr: string, result: string) => {
    const now = new Date();
    const ts = now.toTimeString().slice(0, 8); // HH:MM:SS
    const line = `${ts}  ${expr} = ${result}\n`;
    setNotepadText((prev) => {
      const next = prev + line;
      try {
        localStorage.setItem('calc-notepad', next);
      } catch { /* ignore */ }
      return next;
    });
    setShowNotepad(true);
    try {
      localStorage.setItem('calc-notepad-open', JSON.stringify(true));
    } catch { /* ignore */ }
  }, []);

  // Memory operations
  const memoryClear = useCallback(() => saveMemory(0), [saveMemory]);
  const memoryRecall = useCallback(() => {
    if (justEvaluated || display === '0') {
      setDisplay(memoryRef.current.toString());
      setExpression(memoryRef.current.toString());
    } else {
      setDisplay(display + memoryRef.current.toString());
      setExpression(expression + memoryRef.current.toString());
    }
  }, [display, expression, justEvaluated]);
  const memoryAdd = useCallback(() => {
    try {
      const val = parseFloat(display);
      if (!isNaN(val)) saveMemory(memoryRef.current + val);
    } catch { /* ignore */ }
  }, [display, saveMemory]);
  const memorySubtract = useCallback(() => {
    try {
      const val = parseFloat(display);
      if (!isNaN(val)) saveMemory(memoryRef.current - val);
    } catch { /* ignore */ }
  }, [display, saveMemory]);
  const memoryStore = useCallback(() => {
    try {
      const val = parseFloat(display);
      if (!isNaN(val)) saveMemory(val);
    } catch { /* ignore */ }
  }, [display, saveMemory]);

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
    draggingRef.current = true;
    // Capture pointer offset within the panel so we can derive the new top-left
    // from subsequent mouse positions.
    offsetRef.current = { x: e.clientX - position.x, y: e.clientY - position.y };
  }, [position]);

  useEffect(() => {
    if (!dragging) return;
    // Account for the notepad side panel (200px + 8px gap) when expanded
    const panelWidth = showNotepad ? 488 : 280;
    const handleMove = (e: MouseEvent) => {
      if (!draggingRef.current || !panelRef.current) return;
      if (rafRef.current !== null) return; // a frame is already scheduled
      const x = Math.max(0, Math.min(window.innerWidth - panelWidth, e.clientX - offsetRef.current.x));
      const y = Math.max(0, Math.min(window.innerHeight - 200, e.clientY - offsetRef.current.y));
      pendingPosRef.current = { x, y };
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        if (panelRef.current && pendingPosRef.current) {
          const { x: px, y: py } = pendingPosRef.current;
          panelRef.current.style.transform = `translate3d(${px}px, ${py}px, 0)`;
        }
      });
    };
    const handleUp = () => {
      if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
      draggingRef.current = false;
      // Commit the final position to state once, for persistence.
      if (pendingPosRef.current) setPosition(pendingPosRef.current);
      setDragging(false);
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [dragging, showNotepad]);

  // FAB drag — record start position on mouse down. Don't preventDefault so a
  // normal click still registers; we distinguish click vs drag via the moved flag.
  const handleFabMouseDown = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    // Use the live bounding rect so dragging works from either the CSS default
    // corner or a previously-saved custom position.
    const rect = e.currentTarget.getBoundingClientRect();
    fabDragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startPosX: rect.left,
      startPosY: rect.top,
      moved: false,
    };
    setFabDragging(true);
  }, []);

  // FAB drag — attach window listeners while dragging. On a click (no movement)
  // we toggle the calculator; on a real drag we persist the new position.
  useEffect(() => {
    if (!fabDragging) return;
    const FAB_SIZE = 44;
    const DRAG_THRESHOLD = 3;
    let lastPosX = fabDragRef.current.startPosX;
    let lastPosY = fabDragRef.current.startPosY;
    let neutralized = false;
    const handleMove = (e: MouseEvent) => {
      if (!fabRef.current) return;
      const dx = e.clientX - fabDragRef.current.startX;
      const dy = e.clientY - fabDragRef.current.startY;
      if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
        fabDragRef.current.moved = true;
        // When dragging away from the default bottom/right corner, switch to
        // top-left anchored transform positioning so translate3d lands on the
        // actual cursor target instead of offsetting from the corner.
        if (!neutralized) {
          if (fabPosition.x === -1 && fabRef.current) {
            fabRef.current.style.right = 'auto';
            fabRef.current.style.bottom = 'auto';
            fabRef.current.style.left = '0px';
            fabRef.current.style.top = '0px';
          }
          neutralized = true;
        }
      }
      lastPosX = Math.max(0, Math.min(window.innerWidth - FAB_SIZE, fabDragRef.current.startPosX + dx));
      lastPosY = Math.max(0, Math.min(window.innerHeight - FAB_SIZE, fabDragRef.current.startPosY + dy));
      if (fabRafRef.current !== null) return; // a frame is already scheduled
      pendingFabPosRef.current = { x: lastPosX, y: lastPosY };
      fabRafRef.current = requestAnimationFrame(() => {
        fabRafRef.current = null;
        if (fabRef.current && pendingFabPosRef.current) {
          const { x, y } = pendingFabPosRef.current;
          fabRef.current.style.transform = `translate3d(${x}px, ${y}px, 0)`;
        }
      });
    };
    const handleUp = () => {
      if (fabRafRef.current !== null) { cancelAnimationFrame(fabRafRef.current); fabRafRef.current = null; }
      setFabDragging(false);
      if (!fabDragRef.current.moved) {
        // It was a click, not a drag — toggle the calculator open/closed
        setOpen((v) => !v);
      } else {
        // Commit + persist the new FAB position once
        setFabPosition({ x: lastPosX, y: lastPosY });
        try {
          localStorage.setItem('omnimath-fab-position', JSON.stringify({ x: lastPosX, y: lastPosY }));
        } catch { /* ignore */ }
      }
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [fabDragging, fabPosition.x]);

  // Double-click the FAB to reset its position to the default bottom-right corner
  const handleFabDoubleClick = useCallback(() => {
    setFabPosition(DEFAULT_FAB_POS);
    // Clear transform/anchor styles written imperatively during a drag so the
    // bottom-4/right-4 corner classes take effect again.
    if (fabRef.current) {
      fabRef.current.style.transform = '';
      fabRef.current.style.left = '';
      fabRef.current.style.top = '';
      fabRef.current.style.right = '';
      fabRef.current.style.bottom = '';
    }
    try {
      localStorage.removeItem('omnimath-fab-position');
    } catch { /* ignore */ }
  }, []);

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
        const entry = `${expr} = ${r.result}`;
        setDisplay(r.result);
        setExpression(r.result);
        setJustEvaluated(true);
        addHistory(entry);
      }
    } catch {
      setDisplay('Error');
    }
  }, [display, expression, addHistory]);

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

  // Compute factorial of current display value using math.factorial
  const computeFactorial = useCallback(() => {
    try {
      const val = parseFloat(display);
      if (!isNaN(val) && val >= 0 && Number.isInteger(val) && val <= 170) {
        const result = math.factorial(val);
        const resultStr = result.toString();
        setDisplay(resultStr);
        setExpression(resultStr);
        setJustEvaluated(true);
        addHistory(`${display}! = ${resultStr}`);
      } else {
        setDisplay('Error');
      }
    } catch {
      setDisplay('Error');
    }
  }, [display, addHistory]);

  // ── Programmer mode helpers ─────────────────────────────────────
  const getValidDigits = (base: ProgrammerBase): string => {
    if (base === 2) return '01';
    if (base === 8) return '01234567';
    if (base === 16) return '0123456789abcdefABCDEF';
    return '0123456789';
  };

  const progInputDigit = useCallback((digit: string) => {
    if (!getValidDigits(progBase).includes(digit)) return;
    setProgValue((prev) => {
      if (progJustOp) {
        setProgJustOp(false);
        return digit;
      }
      return prev + digit;
    });
  }, [progBase, progJustOp]);

  const progClear = useCallback(() => {
    setProgValue('');
    setProgOperand(null);
    setProgOp(null);
    setProgJustOp(false);
  }, []);

  const progBackspace = useCallback(() => {
    if (progJustOp) return;
    setProgValue((prev) => prev.slice(0, -1));
  }, [progJustOp]);

  const getProgInt = useCallback((): number => {
    if (!progValue) return 0;
    const neg = progValue.startsWith('-');
    const body = neg ? progValue.slice(1) : progValue;
    const v = parseInt(body, progBase);
    if (isNaN(v)) return 0;
    return neg ? -v : v;
  }, [progValue, progBase]);

  const formatBase = useCallback((val: number, base: ProgrammerBase): string => {
    if (val === 0) return '0';
    const absVal = Math.abs(val);
    const sign = val < 0 ? '-' : '';
    if (base === 16) return sign + absVal.toString(16).toUpperCase();
    if (base === 2) return sign + absVal.toString(2);
    if (base === 8) return sign + absVal.toString(8);
    return sign + absVal.toString(10);
  }, []);

  const applyBitOp = (op: string, a: number, b: number): number => {
    switch (op) {
      case 'AND': return a & b;
      case 'OR': return a | b;
      case 'XOR': return a ^ b;
      default: return b;
    }
  };

  const progBitOp = useCallback((op: string) => {
    const val = getProgInt();
    if (op === 'NOT') {
      setProgValue(formatBase(~val, progBase));
      setProgOp(null);
      setProgOperand(null);
      setProgJustOp(true);
      return;
    }
    if (op === '<<') {
      setProgValue(formatBase(val << 1, progBase));
      setProgOp(null);
      setProgOperand(null);
      setProgJustOp(true);
      return;
    }
    if (op === '>>') {
      setProgValue(formatBase(val >> 1, progBase));
      setProgOp(null);
      setProgOperand(null);
      setProgJustOp(true);
      return;
    }
    // Binary ops: AND, OR, XOR
    if (progOp !== null && progOperand !== null && !progJustOp) {
      const result = applyBitOp(progOp, progOperand, val);
      setProgOperand(result);
      setProgValue(formatBase(result, progBase));
    } else {
      setProgOperand(val);
    }
    setProgOp(op);
    setProgJustOp(true);
  }, [getProgInt, formatBase, progOp, progOperand, progJustOp, progBase]);

  const progEquals = useCallback(() => {
    if (progOp !== null && progOperand !== null) {
      const val = getProgInt();
      const result = applyBitOp(progOp, progOperand, val);
      const resultStr = formatBase(result, progBase);
      const entry = `${formatBase(progOperand, progBase)} ${progOp} ${formatBase(val, progBase)} = ${resultStr}`;
      setProgValue(resultStr);
      setProgOp(null);
      setProgOperand(null);
      setProgJustOp(true);
      addHistory(entry);
    }
  }, [progOp, progOperand, getProgInt, formatBase, progBase, addHistory]);

  // Keyboard shortcut — Ctrl+Shift+C and physical input
  // NOTE: 必须放在 inputDigit/evaluate/prog* 等 useCallback 声明之后，
  // 否则 react-hooks/immutability 会报 "access variable before declared"。
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Always handle the toggle shortcut
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }

      if (!open) return;

      // Escape closes (if not pinned)
      if (e.key === 'Escape') {
        if (!pinned) setOpen(false);
        return;
      }

      // Don't capture physical keys when typing in input/select/textarea fields
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'SELECT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }

      // Skip physical input for modes with their own UI (converter, linalg)
      if (mode === 'converter' || mode === 'linalg') return;

      const key = e.key;

      if (mode === 'programmer') {
        const base = progBase;
        const validChars =
          base === 2
            ? '01'
            : base === 8
              ? '01234567'
              : base === 16
                ? '0123456789abcdefABCDEF'
                : '0123456789';
        if (validChars.includes(key)) {
          e.preventDefault();
          progInputDigit(key);
        } else if (key === 'Backspace') {
          e.preventDefault();
          progBackspace();
        } else if (key === 'Enter' || key === '=') {
          e.preventDefault();
          progEquals();
        }
        return;
      }

      // Basic / scientific mode physical input
      if (key >= '0' && key <= '9') {
        e.preventDefault();
        inputDigit(key);
      } else if (key === '+' || key === '-' || key === '*' || key === '/') {
        e.preventDefault();
        inputOperator(key);
      } else if (key === 'Enter' || key === '=') {
        e.preventDefault();
        evaluate();
      } else if (key === 'Backspace') {
        e.preventDefault();
        backspace();
      } else if (key === '.') {
        e.preventDefault();
        inputDigit('.');
      } else if (key === '(' || key === ')') {
        e.preventDefault();
        inputOperator(key);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, pinned, mode, progBase, display, expression, justEvaluated]);

  // Display values for all 4 bases
  const progDisplayInt = getProgInt();
  const progDec = formatBase(progDisplayInt, 10);
  const progHex = formatBase(progDisplayInt, 16);
  const progBin = formatBase(progDisplayInt, 2);
  const progOct = formatBase(progDisplayInt, 8);

  // ── LinAlg mode helpers ─────────────────────────────────────────
  const updateMatrixCell = useCallback((index: number, value: string) => {
    setMatrix((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }, []);

  const buildMatrix = (size: MatrixSize): number[][] => {
    const m: number[][] = [];
    for (let i = 0; i < size; i++) {
      const row: number[] = [];
      for (let j = 0; j < size; j++) {
        const cellVal = parseFloat(matrix[i * size + j]);
        row.push(isNaN(cellVal) ? 0 : cellVal);
      }
      m.push(row);
    }
    return m;
  };

  // Convert a mathjs matrix/array result into a 2D string grid
  const toMatrixGrid = (value: unknown, size: MatrixSize): string[][] => {
    let arr: unknown[];
    if (typeof value === 'object' && value !== null && 'toArray' in value) {
      arr = (value as { toArray: () => unknown[] }).toArray();
    } else if (Array.isArray(value)) {
      arr = value;
    } else {
      return [[formatMathValue(value)]];
    }
    // If nested array, use directly
    if (arr.length > 0 && Array.isArray(arr[0])) {
      return (arr as unknown[][]).map((row) => row.map((v) => formatMathValue(v)));
    }
    // Flat array — reshape into 2D
    const data: string[][] = [];
    for (let i = 0; i < size; i++) {
      const row: string[] = [];
      for (let j = 0; j < size; j++) {
        row.push(formatMathValue(arr[i * size + j]));
      }
      data.push(row);
    }
    return data;
  };

  const runMatrixOp = useCallback((op: MatrixOp) => {
    try {
      setMatrixError('');
      const m = buildMatrix(matrixSize);
      const mathMatrix = math.matrix(m);
      switch (op) {
        case 'det': {
          const det = math.det(mathMatrix);
          setMatrixResult({ kind: 'scalar', value: formatMathValue(det as unknown) });
          break;
        }
        case 'inv': {
          const inv = math.inv(mathMatrix);
          setMatrixResult({ kind: 'matrix', data: toMatrixGrid(inv, matrixSize) });
          break;
        }
        case 'transpose': {
          const t = math.transpose(mathMatrix);
          setMatrixResult({ kind: 'matrix', data: toMatrixGrid(t, matrixSize) });
          break;
        }
        case 'eigen': {
          const eigsResult = math.eigs(mathMatrix) as unknown as {
            values: { toArray: () => unknown[] } | unknown[];
          };
          const valuesRaw = eigsResult.values;
          const valuesArr =
            valuesRaw && typeof valuesRaw === 'object' && 'toArray' in valuesRaw
              ? valuesRaw.toArray()
              : (valuesRaw as unknown[]);
          const values = valuesArr.map((v) => formatMathValue(v));
          setMatrixResult({ kind: 'array', values });
          break;
        }
      }
    } catch (err) {
      setMatrixError(err instanceof Error ? err.message : 'Calculation error');
      setMatrixResult(null);
    }
  }, [matrix, matrixSize]);

  const matrixResultString = useCallback((): string => {
    if (!matrixResult) return '';
    if (matrixResult.kind === 'scalar') return matrixResult.value;
    if (matrixResult.kind === 'array') return `[${matrixResult.values.join(', ')}]`;
    return formatMatrixString(matrixResult.data);
  }, [matrixResult]);

  const copyMatrixResult = useCallback(async () => {
    const text = matrixResultString();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setMatrixCopied(true);
      clearTimeout(matrixCopyTimerRef.current);
      matrixCopyTimerRef.current = setTimeout(() => setMatrixCopied(false), 1400);
    } catch { /* ignore */ }
  }, [matrixResultString]);

  const reuseHistory = useCallback((entry: string) => {
    // Extract the part after '=' if present
    const parts = entry.split('=');
    const value = parts.length > 1 ? parts[parts.length - 1].trim() : entry.trim();
    setDisplay(value);
    setExpression(value);
    setJustEvaluated(true);
    setShowHistory(false);
  }, []);

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
      {/* Toggle button (fixed corner, draggable) */}
      <button
        ref={fabRef}
        type="button"
        onMouseDown={handleFabMouseDown}
        onDoubleClick={handleFabDoubleClick}
        className={cn(
          'fixed z-[75] size-11 rounded-full bg-primary text-primary-foreground shadow-lg hover:shadow-xl transition-all hover:scale-105 active:scale-95 flex items-center justify-center',
          fabPosition.x === -1 ? 'bottom-4 right-4' : '',
          fabDragging ? 'cursor-grabbing' : 'cursor-grab'
        )}
        style={fabPosition.x === -1 ? undefined : { left: 0, top: 0, transform: `translate3d(${fabPosition.x}px, ${fabPosition.y}px, 0)` }}
        title={`${t('qcFloatingCalc')} · Ctrl+Shift+C · ${t('qcDragHint')}`}
      >
        <Calculator className="size-5" />
      </button>

      <AnimatePresence>
        {open && (
          <div
            ref={panelRef}
            key="calc-panel"
            style={{
              position: 'fixed',
              transform: `translate3d(${position.x}px, ${position.y}px, 0)`,
              zIndex: 76,
            }}
            className={dragging ? 'cursor-grabbing' : ''}
          >
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: 'spring', stiffness: 300, damping: 26 }}
            className="flex items-stretch"
          >
            <div className="w-[280px] rounded-xl border border-border bg-card/95 backdrop-blur-xl shadow-2xl overflow-hidden flex flex-col">
            {/* Header / drag handle */}
            <div
              onMouseDown={handleDragStart}
              className={cn(
                'flex items-center gap-2 px-3 py-2 border-b border-border/60 bg-muted/30',
                dragging ? 'cursor-grabbing' : 'cursor-grab'
              )}
            >
              <Calculator className="size-4 text-primary shrink-0" />
              <span className="text-xs font-medium text-foreground/80 flex-1">{t('qcTitle')}</span>
              <button
                type="button"
                onClick={handleCopy}
                className="size-6 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground flex items-center justify-center"
                title={t('qcCopyResult')}
              >
                {copied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
              </button>
              <button
                type="button"
                onClick={toggleNotepad}
                className={cn(
                  'size-6 rounded-md flex items-center justify-center',
                  showNotepad ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                )}
                title={showNotepad ? t('qcHideNotepad') : t('qcShowNotepad')}
              >
                <NotebookPen className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setPinned(!pinned)}
                className={cn(
                  'size-6 rounded-md flex items-center justify-center',
                  pinned ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                )}
                title={pinned ? t('qcUnpin') : t('qcPin')}
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
              {MODE_TABS.map(({ mode: m, icon: Icon }) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={cn(
                    'flex-1 text-[10px] py-1.5 rounded-md font-medium transition-colors flex flex-col items-center gap-0.5',
                    mode === m
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-accent/50'
                  )}
                  title={modeLabel[m]}
                >
                  <Icon className="size-3.5" />
                  <span>{modeLabel[m]}</span>
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
                      {unitCategoryLabel[cat]}
                    </button>
                  ))}
                </div>

                {/* From input */}
                <div className="space-y-1">
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wider">{t('unitsFrom')}</label>
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
                  <ArrowLeftRight className="size-3" /> {t('unitsSwap')}
                </button>

                {/* To result */}
                <div className="space-y-1">
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wider">{t('unitsTo')}</label>
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
            ) : mode === 'programmer' ? (
              <div className="p-3 space-y-2">
                {/* Base selector */}
                <div className="grid grid-cols-4 gap-1">
                  {PROGRAMMER_BASES.map(({ base, label }) => (
                    <button
                      key={base}
                      type="button"
                      onClick={() => {
                        setProgBase(base);
                        setProgValue('');
                        setProgOp(null);
                        setProgOperand(null);
                        setProgJustOp(false);
                      }}
                      className={cn(
                        'text-[10px] py-1 rounded-md font-semibold transition-colors',
                        progBase === base
                          ? 'bg-primary/15 text-primary'
                          : 'text-muted-foreground hover:bg-accent/50'
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {/* Base display area */}
                <div className="space-y-1 rounded-md bg-muted/40 border border-border/50 p-2">
                  {([
                    { label: 'DEC', value: progDec, base: 10 as ProgrammerBase },
                    { label: 'HEX', value: progHex, base: 16 as ProgrammerBase },
                    { label: 'BIN', value: progBin, base: 2 as ProgrammerBase },
                    { label: 'OCT', value: progOct, base: 8 as ProgrammerBase },
                  ]).map(({ label, value, base }) => (
                    <div
                      key={label}
                      className={cn(
                        'flex items-center gap-2 text-[11px] font-mono',
                        progBase === base ? 'text-primary' : 'text-muted-foreground'
                      )}
                    >
                      <span className="w-7 text-[9px] font-semibold opacity-70">{label}</span>
                      <span className="flex-1 truncate text-right">{value}</span>
                    </div>
                  ))}
                </div>

                {/* Current input echo */}
                <div className="text-right text-xs font-mono text-foreground/70 h-4 truncate">
                  {progOp && progOperand !== null
                    ? `${formatBase(progOperand, progBase)} ${progOp} ${progValue || '?'}`
                    : (progValue || '0')}
                </div>

                {/* Bit operation buttons */}
                <div className="grid grid-cols-3 gap-1.5">
                  <Btn variant="fn" onClick={() => progBitOp('AND')}>AND</Btn>
                  <Btn variant="fn" onClick={() => progBitOp('OR')}>OR</Btn>
                  <Btn variant="fn" onClick={() => progBitOp('XOR')}>XOR</Btn>
                  <Btn variant="fn" onClick={() => progBitOp('NOT')}>NOT</Btn>
                  <Btn variant="fn" onClick={() => progBitOp('<<')}>&lt;&lt;</Btn>
                  <Btn variant="fn" onClick={() => progBitOp('>>')}>&gt;&gt;</Btn>
                </div>

                {/* Digit grid - adapts to current base */}
                <div className="grid grid-cols-4 gap-1.5">
                  <Btn variant="clear" onClick={progClear}>
                    <RotateCcw className="size-4" />
                  </Btn>
                  <Btn variant="fn" onClick={progBackspace}>⌫</Btn>
                  <Btn variant="eq" onClick={progEquals} className="col-span-2">=</Btn>

                  {progBase === 16 && (
                    <>
                      <Btn onClick={() => progInputDigit('A')}>A</Btn>
                      <Btn onClick={() => progInputDigit('B')}>B</Btn>
                      <Btn onClick={() => progInputDigit('C')}>C</Btn>
                      <Btn onClick={() => progInputDigit('D')}>D</Btn>
                      <Btn onClick={() => progInputDigit('E')}>E</Btn>
                      <Btn onClick={() => progInputDigit('F')}>F</Btn>
                    </>
                  )}

                  {progBase !== 2 && (
                    <>
                      <Btn onClick={() => progInputDigit('7')}>7</Btn>
                      <Btn onClick={() => progInputDigit('8')}>8</Btn>
                      <Btn onClick={() => progInputDigit('9')}>9</Btn>
                    </>
                  )}
                  {progBase === 2 && <div className="col-span-3" />}

                  {progBase !== 2 && (
                    <>
                      <Btn onClick={() => progInputDigit('4')}>4</Btn>
                      <Btn onClick={() => progInputDigit('5')}>5</Btn>
                      <Btn onClick={() => progInputDigit('6')}>6</Btn>
                    </>
                  )}
                  {progBase === 2 && <div className="col-span-3" />}

                  {progBase !== 2 && (
                    <>
                      <Btn onClick={() => progInputDigit('1')}>1</Btn>
                      <Btn onClick={() => progInputDigit('2')}>2</Btn>
                      <Btn onClick={() => progInputDigit('3')}>3</Btn>
                    </>
                  )}
                  {progBase === 2 && (
                    <>
                      <div />
                      <Btn onClick={() => progInputDigit('1')}>1</Btn>
                      <div />
                    </>
                  )}

                  <Btn onClick={() => progInputDigit('0')} className="col-span-4">0</Btn>
                </div>
              </div>
            ) : mode === 'linalg' ? (
              <div className="p-3 space-y-2">
                {/* Size selector */}
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setMatrixSize(2);
                      setMatrix(Array(9).fill(''));
                      setMatrixResult(null);
                      setMatrixError('');
                    }}
                    className={cn(
                      'flex-1 text-[11px] py-1.5 rounded-md font-medium transition-colors',
                      matrixSize === 2
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:bg-accent/50'
                    )}
                  >
                    2×2
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMatrixSize(3);
                      setMatrix(Array(9).fill(''));
                      setMatrixResult(null);
                      setMatrixError('');
                    }}
                    className={cn(
                      'flex-1 text-[11px] py-1.5 rounded-md font-medium transition-colors',
                      matrixSize === 3
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:bg-accent/50'
                    )}
                  >
                    3×3
                  </button>
                </div>

                {/* Matrix input grid */}
                <div
                  className="grid gap-1"
                  style={{ gridTemplateColumns: `repeat(${matrixSize}, minmax(0, 1fr))` }}
                >
                  {Array.from({ length: matrixSize * matrixSize }).map((_, idx) => (
                    <input
                      key={idx}
                      type="text"
                      inputMode="decimal"
                      value={matrix[idx] ?? ''}
                      onChange={(e) => updateMatrixCell(idx, e.target.value)}
                      placeholder="0"
                      className="h-8 w-full text-center text-xs font-mono rounded-md bg-muted/50 border border-border/50 outline-none focus:border-primary/50"
                    />
                  ))}
                </div>

                {/* Operation buttons */}
                <div className="grid grid-cols-4 gap-1.5">
                  <Btn variant="fn" onClick={() => runMatrixOp('det')}>det</Btn>
                  <Btn variant="fn" onClick={() => runMatrixOp('inv')}>inv</Btn>
                  <Btn variant="fn" onClick={() => runMatrixOp('transpose')}>trans</Btn>
                  <Btn variant="fn" onClick={() => runMatrixOp('eigen')}>eigen</Btn>
                </div>

                {/* Result display */}
                {matrixError && (
                  <div className="text-[11px] text-destructive font-mono p-2 rounded-md bg-destructive/5 border border-destructive/20">
                    {matrixError}
                  </div>
                )}
                {matrixResult && (
                  <div className="space-y-1 p-2 rounded-md bg-primary/5 border border-primary/20">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{t('linalgResult')}</span>
                      <button
                        type="button"
                        onClick={copyMatrixResult}
                        className="size-5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground flex items-center justify-center"
                        title={t('qcCopyResult')}
                      >
                        {matrixCopied ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
                      </button>
                    </div>
                    {matrixResult.kind === 'scalar' && (
                      <div className="text-sm font-mono text-primary">{matrixResult.value}</div>
                    )}
                    {matrixResult.kind === 'array' && (
                      <div className="text-sm font-mono text-primary">
                        [{matrixResult.values.join(', ')}]
                      </div>
                    )}
                    {matrixResult.kind === 'matrix' && (
                      <div className="overflow-x-auto">
                        <table className="border-collapse">
                          <tbody>
                            {matrixResult.data.map((row, i) => (
                              <tr key={i}>
                                {row.map((cell, j) => (
                                  <td
                                    key={j}
                                    className="px-2 py-0.5 text-xs font-mono text-primary border border-primary/15"
                                  >
                                    {cell}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <>
                {/* Display */}
                <div className="px-3 pt-3 pb-2">
                  <div className="text-right relative">
                    <div className="text-[11px] text-muted-foreground font-mono h-4 truncate">
                      {expression && expression !== display ? expression : ''}
                    </div>
                    <div className="text-2xl font-mono font-semibold text-foreground truncate pr-6">
                      {display}
                    </div>
                    {memoryValue !== 0 && (
                      <div className="text-[9px] text-primary/70 font-mono">M = {memoryValue}</div>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        if (history[0]) {
                          const idx = history[0].lastIndexOf(' = ');
                          if (idx > 0) {
                            appendToNotepad(history[0].slice(0, idx), history[0].slice(idx + 3));
                            return;
                          }
                        }
                        appendToNotepad(expression || display, display);
                      }}
                      className="absolute top-0 right-0 size-5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground flex items-center justify-center"
                      title={t('qcSendToNotepad')}
                      aria-label={t('qcSendToNotepad')}
                    >
                      <StickyNote size={14} />
                    </button>
                  </div>
                </div>

                {/* History panel (collapsible) */}
                <div className="px-3">
                  <button
                    type="button"
                    onClick={() => setShowHistory((v) => !v)}
                    className="w-full flex items-center justify-between py-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <span className="flex items-center gap-1">
                      <History className="size-3" />
                      {t('qcHistTitle')} ({history.length})
                    </span>
                    {showHistory ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
                  </button>
                  {showHistory && (
                    <div className="max-h-28 overflow-y-auto rounded-md bg-muted/30 border border-border/40 mb-1">
                      {history.length === 0 ? (
                        <div className="px-2 py-1.5 text-[10px] text-muted-foreground italic">{t('histNoHistory')}</div>
                      ) : (
                        <>
                          {history.map((entry, i) => {
                            const idx = entry.lastIndexOf(' = ');
                            const expr = idx > 0 ? entry.slice(0, idx) : entry;
                            const result = idx > 0 ? entry.slice(idx + 3) : entry;
                            return (
                              <div key={i} className="flex items-center group">
                                <button
                                  type="button"
                                  onClick={() => reuseHistory(entry)}
                                  className="flex-1 text-left px-2 py-1 text-[10px] font-mono text-foreground/70 hover:bg-accent/50 hover:text-foreground truncate"
                                  title={entry}
                                >
                                  {entry}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => appendToNotepad(expr, result)}
                                  className="size-5 rounded hover:bg-accent text-muted-foreground hover:text-primary flex items-center justify-center shrink-0 opacity-0 group-hover:opacity-100"
                                  title={t('qcSendToNotepad')}
                                  aria-label={t('qcSendToNotepad')}
                                >
                                  <Plus size={12} />
                                </button>
                              </div>
                            );
                          })}
                          <button
                            type="button"
                            onClick={clearHistory}
                            className="w-full text-left px-2 py-1 text-[10px] text-destructive hover:bg-destructive/10"
                          >
                            {t('qcClearHistory')}
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Buttons grid */}
                <div className="px-3 pb-3">
                  {mode === 'basic' && (
                    <div className="grid grid-cols-5 gap-1.5 mb-1.5">
                      <Btn variant="fn" onClick={memoryClear} className="text-[11px]">MC</Btn>
                      <Btn variant="fn" onClick={memoryRecall} className="text-[11px]">MR</Btn>
                      <Btn variant="fn" onClick={memoryAdd} className="text-[11px]">M+</Btn>
                      <Btn variant="fn" onClick={memorySubtract} className="text-[11px]">M-</Btn>
                      <Btn variant="fn" onClick={memoryStore} className="text-[11px]">MS</Btn>
                    </div>
                  )}
                  {mode === 'scientific' && (
                    <>
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
                        <Btn variant="fn" onClick={() => inputOperator('asin(')}>asin</Btn>
                        <Btn variant="fn" onClick={() => inputOperator('acos(')}>acos</Btn>
                        <Btn variant="fn" onClick={() => inputOperator('atan(')}>atan</Btn>
                        <Btn variant="fn" onClick={() => inputOperator('sinh(')}>sinh</Btn>
                        <Btn variant="fn" onClick={() => inputOperator('cosh(')}>cosh</Btn>
                        <Btn variant="fn" onClick={() => inputOperator('tanh(')}>tanh</Btn>
                        <Btn variant="fn" onClick={computeFactorial}>n!</Btn>
                        <Btn variant="fn" onClick={() => inputOperator('gcd(')}>gcd</Btn>
                        <Btn variant="fn" onClick={() => inputOperator('lcm(')}>lcm</Btn>
                        <Btn variant="fn" onClick={() => inputOperator('abs(')}>abs</Btn>
                        <Btn variant="fn" onClick={() => inputOperator('floor(')}>floor</Btn>
                        <Btn variant="fn" onClick={() => inputOperator('ceil(')}>ceil</Btn>
                        <Btn variant="fn" onClick={() => inputOperator('round(')}>round</Btn>
                      </div>
                    </>
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
                    {mode === 'scientific' && (
                      <Btn variant="fn" onClick={() => inputOperator(',')}>,</Btn>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* Footer hint */}
            <div className="px-3 py-1.5 border-t border-border/60 text-[10px] text-muted-foreground flex items-center justify-between bg-muted/20">
              <span className="font-mono">Ctrl+Shift+C</span>
              <span>{t('qcDragHint')}</span>
            </div>
            </div>

            {/* Notepad side panel */}
            <AnimatePresence initial={false}>
              {showNotepad && (
                <motion.div
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: 208, opacity: 1 }}
                  exit={{ width: 0, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                  className="overflow-hidden shrink-0"
                >
                  <div className="w-[200px] h-full ml-2 rounded-xl border border-border bg-card/95 backdrop-blur-xl shadow-2xl p-2 flex flex-col gap-1.5">
                    <div className="flex items-center gap-1 px-1 text-[10px] text-muted-foreground">
                      <NotebookPen className="size-3" />
                      <span>{t('qcNotepad')}</span>
                    </div>
                    <textarea
                      value={notepadText}
                      onChange={handleNotepadChange}
                      placeholder={t('qcNotepadPlaceholder')}
                      className="flex-1 min-h-[160px] w-full resize-none rounded-md bg-muted/50 border border-border/50 p-2 text-xs font-mono outline-none focus:border-primary/50 placeholder:text-muted-foreground/60"
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
