﻿'use client';

/**
 * OmniMath Pro — Linear Algebra Panel (Task 5-b, Part 1)
 *
 * A full matrix workbench with 4 tabs:
 *   1. 矩阵编辑 (Edit)      — Visual grid editor, save to variables
 *   2. 运算   (Operations)   — Add / sub / mul / scalar / power / inv / det / rank / trace / adj
 *   3. 分解   (Decomposition) — LU / QR / Eigen / Cholesky / Schur (SVD/Jordan: note)
 *   4. 方程组 (Linear System) — Solve Ax = b with unique / no / infinite detection
 *
 * All results rendered with KaTeX bmatrix via FormulaRenderer.
 * Teal accent, glass cards, framer-motion entrance.
 */

import { useState, useMemo, useCallback, useEffect, type ClipboardEvent, type CSSProperties } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Grid3x3,
  Plus,
  Minus,
  Trash2,
  ClipboardPaste,
  Save,
  Sigma,
  Cog,
  Split,
  Equal,
  X,
  Check,
  RotateCcw,
  Activity,
  Play,
  Pause,
} from 'lucide-react';
import { ZoomLens, type ZoomStep } from '@/components/workbench/controls/ZoomLens';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MatrixTransformViz } from '@/components/workbench/linalg/MatrixTransformViz';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { FormulaRenderer } from '@/components/workbench/FormulaRenderer';
import { GaussianEliminationView } from '@/components/workbench/panels/GaussianEliminationView';
import { useWorkbenchStore, type VariableEntry } from '@/lib/store/workbench';
import { setScopeVar } from '@/lib/engine';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

/* ------------------------------------------------------------------ *
 * mathjs — shared configured instance (same semantics as the console)
 * ------------------------------------------------------------------ */
import { math } from '@/lib/engine/mathInstance';

/* ------------------------------------------------------------------ *
 * Types
 * ------------------------------------------------------------------ */
type Matrix = number[][];
type DecompKind = 'lu' | 'qr' | 'eigen' | 'cholesky' | 'schur' | 'svd' | 'jordan';

interface MatrixEntry {
  name: string;
  data: Matrix;
}

interface OpResult {
  latex: string;
  text: string;
  isMatrix: boolean;
  matrix?: Matrix;
  steps?: string[];
}

interface DecompositionResult {
  parts: { label: string; latex: string; matrix?: Matrix }[];
  note?: string;
}

interface SystemSolution {
  kind: 'unique' | 'none' | 'infinite';
  latex: string;
  vector?: number[];
  particular?: number[];
  nullBasis?: number[][];
  augmentedLatex: string;
  steps: string[];
  rankA?: number;
  rankAug?: number;
  nUnknowns?: number;
}

/* ------------------------------------------------------------------ *
 * Pure math helpers
 * ------------------------------------------------------------------ */

function identity(n: number): Matrix {
  const m: Matrix = [];
  for (let i = 0; i < n; i++) {
    m.push(Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  }
  return m;
}

function zeros(rows: number, cols: number): Matrix {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => 0));
}

function randomMatrix(rows: number, cols: number): Matrix {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => Math.floor(Math.random() * 19) - 9),
  );
}

function transpose(m: Matrix): Matrix {
  if (m.length === 0) return [];
  const rows = m.length;
  const cols = m[0].length;
  const out: Matrix = Array.from({ length: cols }, () => Array(rows).fill(0));
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      out[j][i] = m[i][j];
    }
  }
  return out;
}

function cloneMatrix(m: Matrix): Matrix {
  return m.map((row) => [...row]);
}

/** Round away float noise inside a matrix. */
function cleanMatrix(m: Matrix): Matrix {
  return m.map((row) =>
    row.map((v) => {
      if (typeof v !== 'number' || !Number.isFinite(v)) return v;
      const rounded = Math.round(v);
      if (Math.abs(v - rounded) < 1e-10) return rounded;
      return parseFloat(v.toPrecision(10));
    }),
  );
}

function matrixToLatex(m: Matrix): string {
  if (m.length === 0) return '\\text{—}';
  // 1-D vector → row bmatrix
  if (m.length === 1) {
    return `\\begin{bmatrix} ${m[0].map(numToLatex).join(' & ')} \\end{bmatrix}`;
  }
  const rows = m.map((row) => row.map(numToLatex).join(' & '));
  return `\\begin{bmatrix} ${rows.join(' \\\\ ')} \\end{bmatrix}`;
}

function numToLatex(v: number): string {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    return Number.isNaN(v) ? '\\text{NaN}' : String(v);
  }
  const rounded = Math.round(v);
  if (Math.abs(v - rounded) < 1e-10) return String(rounded);
  return parseFloat(v.toPrecision(8)).toString();
}

/** Plain-text number formatter (mirrors numToLatex rounding rules, no LaTeX). */
function formatNum(v: number): string {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    return Number.isNaN(v) ? 'NaN' : String(v);
  }
  const rounded = Math.round(v);
  if (Math.abs(v - rounded) < 1e-10) return String(rounded);
  return parseFloat(v.toPrecision(8)).toString();
}

function vectorToLatex(v: number[]): string {
  return `\\begin{bmatrix} ${v.map(numToLatex).join(' \\\\ ')} \\end{bmatrix}`;
}

/** Convert mathjs matrix/array result to number[][] (with float-noise scrubbing). */
function toMatrixArray(value: unknown): Matrix {
  let arr: unknown[];
  if (typeof value === 'object' && value !== null && 'toArray' in value) {
    arr = (value as { toArray: () => unknown[] }).toArray();
  } else if (Array.isArray(value)) {
    arr = value;
  } else {
    return [[Number(value as number)]];
  }
  if (arr.length > 0 && !Array.isArray(arr[0])) {
    return [arr as unknown as number[]];
  }
  return cleanMatrix(arr as number[][]);
}

function isSquare(m: Matrix): boolean {
  return m.length > 0 && m.length === m[0].length;
}

/* ------------------------------------------------------------------ *
 * Paste parser — accepts TSV / CSV / MATLAB-style [a,b;c,d]
 * ------------------------------------------------------------------ */
function parsePastedMatrix(text: string): Matrix | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  // MATLAB-style: [1,2;3,4] or [1 2; 3 4]
  const bracketMatch = /^\[([\s\S]+)\]$/m.exec(trimmed);
  if (bracketMatch) {
    const inner = bracketMatch[1];
    const rows = inner.split(';').map((r) => r.trim()).filter(Boolean);
    const result: Matrix = [];
    let cols = -1;
    for (const r of rows) {
      // Split on commas OR whitespace, but a row could be like "1 2 3" or "1,2,3"
      const cells = r
        .split(/[\s,]+/)
        .map((c) => c.trim())
        .filter(Boolean);
      if (cells.length === 0) continue;
      if (cols === -1) cols = cells.length;
      else if (cells.length !== cols) return null;
      const nums = cells.map((c) => parseFloat(c));
      if (nums.some((n) => Number.isNaN(n))) return null;
      result.push(nums);
    }
    if (result.length === 0) return null;
    return result;
  }

  // TSV / CSV: split by newlines, then by tabs/commas/whitespace
  const lines = trimmed.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;
  const result: Matrix = [];
  let cols = -1;
  for (const line of lines) {
    // Detect the delimiter by counting
    const commaCount = (line.match(/,/g) || []).length;
    const tabCount = (line.match(/\t/g) || []).length;
    let cells: string[];
    if (tabCount > 0) cells = line.split('\t').map((c) => c.trim());
    else if (commaCount > 0) cells = line.split(',').map((c) => c.trim());
    else cells = line.split(/\s+/).map((c) => c.trim());
    cells = cells.filter(Boolean);
    if (cells.length === 0) continue;
    if (cols === -1) cols = cells.length;
    else if (cells.length !== cols) return null;
    const nums = cells.map((c) => parseFloat(c));
    if (nums.some((n) => Number.isNaN(n))) return null;
    result.push(nums);
  }
  return result.length > 0 ? result : null;
}

/**
 * Paste handler for matrix grid cells. When the pasted text contains
 * tab/newline/comma (i.e. multi-cell data copied from Excel/Sheets),
 * parse it as a sub-matrix and fill the grid starting at the focused
 * cell (startRow, startCol), auto-growing rows/cols as needed.
 *
 * Returns true if the paste was intercepted (so the caller's input
 * should NOT also do its default single-value paste).
 *
 * `onApply` receives an updater function (prev matrix → next matrix)
 * so it works with both controlled-value parents and functional
 * setState dispatchers.
 */
function handleGridPaste(
  e: ClipboardEvent<HTMLInputElement>,
  startRow: number,
  startCol: number,
  onApply: (updater: (prev: Matrix) => Matrix) => void,
): boolean {
  const text = e.clipboardData?.getData('text') ?? '';
  if (!text) return false;
  // Only intercept when this looks like multi-cell data; otherwise let
  // the native <input> paste a single number.
  if (!text.includes('\t') && !text.includes('\n') && !text.includes(',')) {
    return false;
  }
  const parsed = parsePastedMatrix(text);
  if (!parsed || parsed.length === 0) return false;
  e.preventDefault();
  onApply((prev: Matrix) => {
    const pastedRows = parsed.length;
    const pastedCols = parsed[0]?.length ?? 0;
    const needRows = startRow + pastedRows;
    const needCols = startCol + pastedCols;
    const next: Matrix = prev.map((row) => [...row]);
    // Pad rows (matching existing column count)
    const curCols = next[0]?.length ?? 0;
    while (next.length < needRows) next.push(Array(curCols).fill(0));
    // Pad columns on every row
    for (const row of next) {
      while (row.length < needCols) row.push(0);
    }
    for (let i = 0; i < pastedRows; i++) {
      for (let j = 0; j < pastedCols; j++) {
        next[startRow + i][startCol + j] = parsed[i][j];
      }
    }
    return next;
  });
  return true;
}

/* ------------------------------------------------------------------ *
 * Default matrix names
 * ------------------------------------------------------------------ */
const DEFAULT_NAMES = ['A', 'B', 'C', 'D', 'E', 'F', 'M', 'N', 'P', 'Q'];

function pickNextName(used: string[]): string {
  for (const name of DEFAULT_NAMES) {
    if (!used.includes(name)) return name;
  }
  let n = 1;
  while (used.includes(`M${n}`)) n++;
  return `M${n}`;
}

/* ================================================================== *
 * MAIN PANEL
 * ================================================================== */
export function LinearAlgebraPanel() {
  const [activeTab, setActiveTab] = useState<string>('edit');
  const [matrices, setMatrices] = useState<MatrixEntry[]>(() => {
    // Lazy init: read any matrices already in the store on first mount.
    const initial: MatrixEntry[] = [
      { name: 'A', data: [[1, 2, 3], [4, 5, 6], [7, 8, 0]] },
      { name: 'B', data: [[2, 0, 1], [0, 3, 0], [1, 0, 2]] },
    ];
    try {
      const storeVars = useWorkbenchStore.getState().variables;
      const existingNames = new Set(initial.map((m) => m.name));
      for (const [name, entry] of Object.entries(storeVars)) {
        if (entry.type === 'matrix' && Array.isArray(entry.value)) {
          const arr = entry.value as unknown[];
          let mat: Matrix;
          if (arr.length > 0 && Array.isArray(arr[0])) {
            mat = (arr as unknown as Matrix).map((row) =>
              (Array.isArray(row) ? row : [row]).map((c) => Number(c)),
            );
          } else {
            mat = [arr.map((c) => Number(c))];
          }
          if (!existingNames.has(name)) {
            initial.push({ name, data: mat });
          }
        }
      }
    } catch {
      // ignore
    }
    return initial;
  });
  const [selectedName, setSelectedName] = useState<string>('A');

  const selected = useMemo(
    () => matrices.find((m) => m.name === selectedName) ?? matrices[0],
    [matrices, selectedName],
  );

  const handleNewMatrix = useCallback(() => {
    const used = matrices.map((m) => m.name);
    const name = pickNextName(used);
    const newEntry: MatrixEntry = { name, data: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] };
    setMatrices((prev) => [...prev, newEntry]);
    setSelectedName(name);
  }, [matrices]);

  const handleDeleteMatrix = useCallback(
    (name: string) => {
      setMatrices((prev) => {
        const next = prev.filter((m) => m.name !== name);
        if (next.length === 0) {
          const fallback: MatrixEntry = { name: 'A', data: identity(3) };
          setSelectedName('A');
          return [fallback];
        }
        if (selectedName === name) setSelectedName(next[0].name);
        return next;
      });
    },
    [selectedName],
  );

  const handleUpdateMatrix = useCallback((name: string, data: Matrix) => {
    setMatrices((prev) => prev.map((m) => (m.name === name ? { ...m, data } : m)));
  }, []);

  const handleRenameMatrix = useCallback((oldName: string, newName: string) => {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(newName)) return;
    setMatrices((prev) => {
      if (prev.some((m) => m.name === newName)) return prev;
      return prev.map((m) => (m.name === oldName ? { ...m, name: newName } : m));
    });
    if (selectedName === oldName) setSelectedName(newName);
  }, [selectedName]);

  return (
    <div className="flex flex-col h-full bg-card/30">
      {/* Header */}
      <div className="shrink-0 px-3 pt-2.5 pb-2 border-b border-border/60">
        <div className="flex items-center gap-1.5 mb-1">
          <Grid3x3 className="size-3.5 text-primary" />
          <span className="text-[12.5px] font-semibold tracking-tight">
            {t('linalgTitle')}
          </span>
          <Badge variant="outline" className="h-4 px-1.5 text-[9.5px] ml-auto">
            {matrices.length}
          </Badge>
        </div>
      </div>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="flex-1 min-h-0 flex flex-col gap-2 px-2 pt-2"
      >
        <TabsList className="h-7 grid grid-cols-5 w-full text-[10.5px]">
          <TabsTrigger value="edit" className="text-[10.5px] px-1 py-0.5 gap-1">
            <Grid3x3 className="size-3" />
            <span className="hidden sm:inline">{t('linalgTabEdit')}</span>
          </TabsTrigger>
          <TabsTrigger value="ops" className="text-[10.5px] px-1 py-0.5 gap-1">
            <Cog className="size-3" />
            <span className="hidden sm:inline">{t('linalgTabOps')}</span>
          </TabsTrigger>
          <TabsTrigger value="decomp" className="text-[10.5px] px-1 py-0.5 gap-1">
            <Split className="size-3" />
            <span className="hidden sm:inline">{t('linalgTabDecomp')}</span>
          </TabsTrigger>
          <TabsTrigger value="system" className="text-[10.5px] px-1 py-0.5 gap-1">
            <Equal className="size-3" />
            <span className="hidden sm:inline">{t('linalgTabSystem')}</span>
          </TabsTrigger>
          <TabsTrigger value="transform" className="text-[10.5px] px-1 py-0.5 gap-1">
            <Activity className="size-3" />
            <span className="hidden sm:inline">{t('linalgTabTransform')}</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="edit" className="flex-1 min-h-0 overflow-hidden">
          <MatrixEditorTab
            matrices={matrices}
            selected={selected}
            onSelect={setSelectedName}
            onNew={handleNewMatrix}
            onDelete={handleDeleteMatrix}
            onRename={handleRenameMatrix}
            onUpdate={handleUpdateMatrix}
          />
        </TabsContent>

        <TabsContent value="ops" className="flex-1 min-h-0 overflow-hidden">
          <OperationsTab matrices={matrices} />
        </TabsContent>

        <TabsContent value="decomp" className="flex-1 min-h-0 overflow-hidden">
          <DecompositionTab matrices={matrices} selected={selected} />
        </TabsContent>

        <TabsContent value="system" className="flex-1 min-h-0 overflow-hidden">
          <LinearSystemTab defaultMatrix={selected?.data} />
        </TabsContent>

        <TabsContent value="transform" className="flex-1 min-h-0 overflow-hidden">
          <MatrixTransformViz />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ================================================================== *
 * TAB 1 — Matrix Editor
 * ================================================================== */
function MatrixEditorTab({
  matrices,
  selected,
  onSelect,
  onNew,
  onDelete,
  onRename,
  onUpdate,
}: {
  matrices: MatrixEntry[];
  selected: MatrixEntry | undefined;
  onSelect: (name: string) => void;
  onNew: () => void;
  onDelete: (name: string) => void;
  onRename: (old: string, next: string) => void;
  onUpdate: (name: string, data: Matrix) => void;
}) {
  const setVariable = useWorkbenchStore((s) => s.setVariable);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');

  const matrix = selected?.data ?? identity(3);
  const name = selected?.name ?? 'A';

  const updateCell = (r: number, c: number, val: string) => {
    const v = parseFloat(val);
    const next = cloneMatrix(matrix);
    next[r][c] = Number.isNaN(v) ? 0 : v;
    onUpdate(name, next);
  };

  const addRow = () => {
    const cols = matrix[0]?.length ?? 3;
    onUpdate(name, [...matrix, Array(cols).fill(0)]);
  };
  const delRow = () => {
    if (matrix.length <= 1) return;
    onUpdate(name, matrix.slice(0, -1));
  };
  const addCol = () => {
    onUpdate(name, matrix.map((row) => [...row, 0]));
  };
  const delCol = () => {
    if (matrix[0].length <= 1) return;
    onUpdate(name, matrix.map((row) => row.slice(0, -1)));
  };

  const fillIdentity = () => {
    if (matrix.length !== matrix[0]?.length) {
      toast.error(t('linalgNonSquare'));
      return;
    }
    onUpdate(name, identity(matrix.length));
  };
  const fillZeros = () => onUpdate(name, zeros(matrix.length, matrix[0]?.length ?? 3));
  const fillRandom = () => onUpdate(name, randomMatrix(matrix.length, matrix[0]?.length ?? 3));
  const fillTranspose = () => onUpdate(name, transpose(matrix));

  const handlePaste = () => {
    const parsed = parsePastedMatrix(pasteText);
    if (!parsed) {
      toast.error(t('linalgPasteInvalid'));
      return;
    }
    onUpdate(name, parsed);
    setPasteOpen(false);
    setPasteText('');
    toast.success(t('linalgSaved'));
  };

  const handleSave = () => {
    if (!selected) return;
    // Save to engine scope AND to store
    setScopeVar(name, matrix);
    const entry: VariableEntry = {
      name,
      value: matrix,
      type: 'matrix',
      latex: matrixToLatex(matrix),
    };
    setVariable(name, entry);
    toast.success(t('linalgSaved') + ': ' + name);
  };

  return (
    <ScrollArea className="h-full">
      <div className="p-2 space-y-3">
        {/* Matrix selector */}
        <div className="flex items-center gap-1.5">
          <Select value={name} onValueChange={onSelect}>
            <SelectTrigger className="h-7 flex-1 text-[11.5px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {matrices.map((m) => (
                <SelectItem key={m.name} value={m.name} className="text-[11.5px]">
                  <span className="font-mono font-semibold text-primary">{m.name}</span>
                  <span className="text-muted-foreground ml-1.5">
                    ({m.data.length}×{m.data[0]?.length ?? 0})
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={onNew}
              >
                <Plus className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{t('linalgNewMatrix')}</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-7 w-7 p-0 hover:text-destructive hover:border-destructive/40"
                onClick={() => onDelete(name)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{t('commonDelete')}</TooltipContent>
          </Tooltip>
        </div>

        {/* Name editor */}
        {renaming ? (
          <div className="flex items-center gap-1.5">
            <Input
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              className="h-7 text-[11.5px] font-mono"
              placeholder="A"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  onRename(name, renameValue);
                  setRenaming(false);
                } else if (e.key === 'Escape') {
                  setRenaming(false);
                }
              }}
            />
            <Button
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => {
                onRename(name, renameValue);
                setRenaming(false);
              }}
            >
              <Check className="size-3.5" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <Badge
              variant="outline"
              className="h-5 px-2 text-[11px] font-mono font-semibold text-primary bg-primary/5 border-primary/30 cursor-pointer hover:bg-primary/10"
              onClick={() => {
                setRenameValue(name);
                setRenaming(true);
              }}
            >
              {name}
            </Badge>
            <span className="text-[10.5px] text-muted-foreground">
              {t('linalgMatrixSize')}: {matrix.length}×{matrix[0]?.length ?? 0}
            </span>
          </div>
        )}

        {/* Editable grid */}
        <div className="rounded-lg border border-border/60 bg-muted/20 p-2 overflow-x-auto">
          <div className="inline-block">
            <div className="flex flex-col gap-1">
              {matrix.map((row, ri) => (
                <div key={ri} className="flex gap-1">
                  {row.map((cell, ci) => (
                    <input
                      key={ci}
                      type="number"
                      value={cell}
                      step="any"
                      onChange={(e) => updateCell(ri, ci, e.target.value)}
                      onPaste={(e) =>
                        handleGridPaste(e, ri, ci, (updater) =>
                          onUpdate(name, updater(matrix)),
                        )
                      }
                      className={cn(
                        'w-12 h-8 px-1 text-[11.5px] font-mono tabular-nums text-center',
                        'bg-background/60 border border-border/60 rounded',
                        'focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/40',
                        'hover:border-primary/40 transition-colors',
                      )}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Row/col controls */}
        <div className="flex flex-wrap gap-1">
          <Button variant="outline" size="sm" className="h-6 px-2 text-[10.5px]" onClick={addRow}>
            <Plus className="size-3 mr-0.5" /> {t('matrixAddRow')}
          </Button>
          <Button variant="outline" size="sm" className="h-6 px-2 text-[10.5px]" onClick={delRow}>
            <Minus className="size-3 mr-0.5" /> {t('matrixDelRow')}
          </Button>
          <Button variant="outline" size="sm" className="h-6 px-2 text-[10.5px]" onClick={addCol}>
            <Plus className="size-3 mr-0.5" /> {t('matrixAddCol')}
          </Button>
          <Button variant="outline" size="sm" className="h-6 px-2 text-[10.5px]" onClick={delCol}>
            <Minus className="size-3 mr-0.5" /> {t('matrixDelCol')}
          </Button>
        </div>

        {/* Quick fill */}
        <div>
          <div className="text-[10.5px] text-muted-foreground mb-1">{t('linalgQuickFill')}</div>
          <div className="flex flex-wrap gap-1">
            <Button variant="outline" size="sm" className="h-6 px-2 text-[10.5px]" onClick={fillIdentity}>
              <Sigma className="size-3 mr-0.5" /> {t('linalgIdentity')}
            </Button>
            <Button variant="outline" size="sm" className="h-6 px-2 text-[10.5px]" onClick={fillZeros}>
              {t('linalgZeros')}
            </Button>
            <Button variant="outline" size="sm" className="h-6 px-2 text-[10.5px]" onClick={fillRandom}>
              {t('linalgRandom')}
            </Button>
            <Button variant="outline" size="sm" className="h-6 px-2 text-[10.5px]" onClick={fillTranspose}>
              <RotateCcw className="size-3 mr-0.5" /> {t('linalgTranspose')}
            </Button>
            <Button variant="outline" size="sm" className="h-6 px-2 text-[10.5px]" onClick={() => setPasteOpen(true)}>
              <ClipboardPaste className="size-3 mr-0.5" /> {t('linalgPaste')}
            </Button>
          </div>
        </div>

        {/* Save */}
        <Button onClick={handleSave} className="w-full h-8 text-[11.5px] gap-1.5" size="sm">
          <Save className="size-3.5" />
          {t('linalgSave')} → <span className="font-mono font-semibold">{name}</span>
        </Button>

        {/* Live KaTeX preview */}
        <div>
          <div className="text-[10.5px] text-muted-foreground mb-1">{t('linalgPreview')}</div>
          <div className="rounded-md border border-primary/30 bg-primary/5 p-2.5 glow-card-teal overflow-x-auto">
            <FormulaRenderer latex={name + ' = ' + matrixToLatex(matrix)} displayMode />
          </div>
        </div>
      </div>

      {/* Paste dialog */}
      <Dialog open={pasteOpen} onOpenChange={setPasteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[13px]">{t('linalgPaste')}</DialogTitle>
          </DialogHeader>
          <p className="text-[11.5px] text-muted-foreground whitespace-pre-line">
            {t('linalgPasteHint')}
          </p>
          <textarea
            autoFocus
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            className={cn(
              'min-h-[120px] w-full p-2.5 text-[12px] font-mono',
              'bg-muted/40 border border-border/60 rounded-md',
              'focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/40',
              'resize-y',
            )}
            placeholder={'1, 2, 3\n4, 5, 6\n7, 8, 9\n\nor [1,2;3,4]'}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handlePaste();
            }}
          />
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setPasteOpen(false)}>
              {t('commonCancel')}
            </Button>
            <Button size="sm" onClick={handlePaste}>
              {t('linalgPasteConfirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ScrollArea>
  );
}

/* ------------------------------------------------------------------ *
 * Matrix grid view — read-only table / heatmap toggle
 * ------------------------------------------------------------------ */

/** Render a read-only matrix as a plain table or a color-coded heatmap.
 *  Heatmap: values ≥ 0 fade from white → red; values < 0 fade from white → blue.
 *  Intensity is normalized against the largest magnitude on each side of zero. */
function MatrixGridView({
  matrix,
  viewMode,
}: {
  matrix: Matrix;
  viewMode: 'table' | 'heatmap';
}) {
  let min = Infinity;
  let max = -Infinity;
  for (const row of matrix) {
    for (const v of row) {
      if (Number.isFinite(v)) {
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
  }
  const posMax = max > 0 ? max : 1;
  const negMax = min < 0 ? -min : 1;

  const cellStyle = (v: number): CSSProperties => {
    if (viewMode !== 'heatmap') return {};
    let r = 255;
    let g = 255;
    let b = 255;
    if (v >= 0) {
      const intensity = posMax > 0 ? Math.min(v / posMax, 1) : 0;
      g = Math.round(255 - intensity * 255);
      b = g;
    } else {
      const intensity = negMax > 0 ? Math.min(-v / negMax, 1) : 0;
      r = Math.round(255 - intensity * 255);
      g = r;
    }
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return {
      backgroundColor: `rgb(${r}, ${g}, ${b})`,
      color: lum > 0.5 ? '#000' : '#fff',
    };
  };

  return (
    <div className="overflow-x-auto">
      <div className="inline-block">
        <div className="flex flex-col gap-0.5">
          {matrix.map((row, ri) => (
            <div key={ri} className="flex gap-0.5">
              {row.map((v, ci) => (
                <div
                  key={ci}
                  style={cellStyle(v)}
                  className={cn(
                    'min-w-[2.5rem] h-7 px-1 text-[11px] font-mono tabular-nums text-center',
                    'border border-border/60 rounded flex items-center justify-center',
                  )}
                >
                  {formatNum(v)}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ================================================================== *
 * TAB 2 — Operations
 * ================================================================== */

type BinaryOp = 'add' | 'sub' | 'mul' | 'emul' | 'ediv';
type UnaryOp = 'transpose' | 'inv' | 'det' | 'rank' | 'trace' | 'adj';
type ScalarOp = 'scalar' | 'pow';
type OpKind = BinaryOp | UnaryOp | ScalarOp;

const OP_LABELS: Record<OpKind, string> = {
  add: 'A + B',
  sub: 'A − B',
  mul: 'A × B',
  emul: 'A .* B',
  ediv: 'A ./ B',
  scalar: 'k · A',
  pow: 'A^k',
  transpose: 'A^T',
  inv: 'A^(−1)',
  det: 'det(A)',
  rank: 'rank(A)',
  trace: 'tr(A)',
  adj: 'adj(A)',
};

function OperationsTab({ matrices }: { matrices: MatrixEntry[] }) {
  const [opA, setOpA] = useState(matrices[0]?.name ?? 'A');
  const [opB, setOpB] = useState(matrices[1]?.name ?? 'B');
  const [opKind, setOpKind] = useState<OpKind>('mul');
  const [scalar, setScalar] = useState(2);
  const [power, setPower] = useState(2);
  const [result, setResult] = useState<OpResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [viewMode, setViewMode] = useState<'table' | 'heatmap'>('table');

  const matrixA = matrices.find((m) => m.name === opA)?.data;
  const matrixB = matrices.find((m) => m.name === opB)?.data;

  const isBinary = ['add', 'sub', 'mul', 'emul', 'ediv'].includes(opKind);
  const isScalar = opKind === 'scalar';
  const isPower = opKind === 'pow';
  const returnsMatrix = !['det', 'rank', 'trace'].includes(opKind);

  const handleCompute = () => {
    setWorking(true);
    setError(null);
    setResult(null);
    try {
      if (!matrixA) {
        setError(t('linalgEmpty'));
        return;
      }

      let res: OpResult;

      if (isBinary) {
        if (!matrixB) {
          setError(t('linalgEmpty'));
          return;
        }
        // dimension checks
        const aRows = matrixA.length;
        const aCols = matrixA[0]?.length ?? 0;
        const bRows = matrixB.length;
        const bCols = matrixB[0]?.length ?? 0;
        if (opKind === 'mul') {
          if (aCols !== bRows) {
            setError(`${t('linalgDimMismatch')}: A(${aRows}×${aCols}) × B(${bRows}×${bCols})`);
            return;
          }
        } else {
          // add / sub / emul / ediv require same shape
          if (aRows !== bRows || aCols !== bCols) {
            setError(`${t('linalgDimMismatch')}: A(${aRows}×${aCols}) vs B(${bRows}×${bCols})`);
            return;
          }
        }
        const a = math.matrix(matrixA);
        const b = math.matrix(matrixB);
        let val: unknown;
        let expr = '';
        switch (opKind) {
          case 'add':
            val = math.add(a, b);
            expr = `${opA} + ${opB}`;
            break;
          case 'sub':
            val = math.subtract(a, b);
            expr = `${opA} - ${opB}`;
            break;
          case 'mul':
            val = math.multiply(a, b);
            expr = `${opA} * ${opB}`;
            break;
          case 'emul':
            val = math.dotMultiply(a, b);
            expr = `${opA} .* ${opB}`;
            break;
          case 'ediv':
            val = math.dotDivide(a, b);
            expr = `${opA} ./ ${opB}`;
            break;
        }
        const mat = toMatrixArray(val);
        res = {
          latex: expr + ' = ' + matrixToLatex(mat),
          text: expr,
          isMatrix: true,
          matrix: mat,
        };
      } else if (isScalar) {
        const val = math.multiply(scalar, math.matrix(matrixA));
        const mat = toMatrixArray(val);
        res = {
          latex: `${scalar} \\cdot ${opA} = ${matrixToLatex(mat)}`,
          text: `${scalar}*${opA}`,
          isMatrix: true,
          matrix: mat,
        };
      } else if (isPower) {
        if (!isSquare(matrixA)) {
          setError(t('linalgNonSquare'));
          return;
        }
        const val = math.pow(math.matrix(matrixA), power);
        const mat = toMatrixArray(val);
        res = {
          latex: `${opA}^{${power}} = ${matrixToLatex(mat)}`,
          text: `${opA}^${power}`,
          isMatrix: true,
          matrix: mat,
        };
      } else {
        // Unary operations
        switch (opKind) {
          case 'transpose': {
            const mat = transpose(matrixA);
            res = {
              latex: `${opA}^{T} = ${matrixToLatex(mat)}`,
              text: `${opA}^T`,
              isMatrix: true,
              matrix: mat,
            };
            break;
          }
          case 'inv': {
            if (!isSquare(matrixA)) {
              setError(t('linalgNonSquare'));
              return;
            }
            const det = math.det(matrixA);
            if (Math.abs(det) < 1e-12) {
              setError(t('linalgSingular'));
              return;
            }
            const val = math.inv(math.matrix(matrixA));
            const mat = toMatrixArray(val);
            res = {
              latex: `${opA}^{-1} = ${matrixToLatex(mat)}`,
              text: `inv(${opA})`,
              isMatrix: true,
              matrix: mat,
              steps: [
                `\\det(${opA}) = ${numToLatex(det)}`,
                `\\det(${opA}) \\neq 0 \\Rightarrow ${opA} \\text{ 可逆}`,
                `${opA}^{-1} = ${matrixToLatex(mat)}`,
              ],
            };
            break;
          }
          case 'det': {
            if (!isSquare(matrixA)) {
              setError(t('linalgNonSquare'));
              return;
            }
            const det = math.det(matrixA);
            res = {
              latex: `\\det(${opA}) = ${numToLatex(det)}`,
              text: `det(${opA}) = ${det}`,
              isMatrix: false,
            };
            break;
          }
          case 'rank': {
            const r = matrixRank(matrixA);
            res = {
              latex: `\\operatorname{rank}(${opA}) = ${r}`,
              text: `rank(${opA}) = ${r}`,
              isMatrix: false,
            };
            break;
          }
          case 'trace': {
            if (!isSquare(matrixA)) {
              setError(t('linalgNonSquare'));
              return;
            }
            const tr = matrixA.reduce((sum, row, i) => sum + (row[i] ?? 0), 0);
            res = {
              latex: `\\operatorname{tr}(${opA}) = ${numToLatex(tr)}`,
              text: `tr(${opA}) = ${tr}`,
              isMatrix: false,
            };
            break;
          }
          case 'adj': {
            if (!isSquare(matrixA)) {
              setError(t('linalgNonSquare'));
              return;
            }
            const adj = adjugate(matrixA);
            res = {
              latex: `\\operatorname{adj}(${opA}) = ${matrixToLatex(adj)}`,
              text: `adj(${opA})`,
              isMatrix: true,
              matrix: adj,
            };
            break;
          }
          default:
            setError(t('linalgEmpty'));
            return;
        }
      }

      setResult(res);
    } catch (err) {
      setError((err as Error).message || t('linalgError'));
    } finally {
      setWorking(false);
    }
  };

  return (
    <ScrollArea className="h-full">
      <div className="p-2 space-y-2.5">
        {/* Operand A */}
        <div>
          <label className="text-[10.5px] text-muted-foreground">{t('linalgOpsA')}</label>
          <Select value={opA} onValueChange={setOpA}>
            <SelectTrigger className="h-7 text-[11.5px] mt-0.5">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {matrices.map((m) => (
                <SelectItem key={m.name} value={m.name} className="text-[11.5px]">
                  <span className="font-mono font-semibold text-primary">{m.name}</span>
                  <span className="text-muted-foreground ml-1.5">
                    ({m.data.length}×{m.data[0]?.length ?? 0})
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Operand B */}
        {isBinary && (
          <div>
            <label className="text-[10.5px] text-muted-foreground">{t('linalgOpsB')}</label>
            <Select value={opB} onValueChange={setOpB}>
              <SelectTrigger className="h-7 text-[11.5px] mt-0.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {matrices.map((m) => (
                  <SelectItem key={m.name} value={m.name} className="text-[11.5px]">
                    <span className="font-mono font-semibold text-primary">{m.name}</span>
                    <span className="text-muted-foreground ml-1.5">
                      ({m.data.length}×{m.data[0]?.length ?? 0})
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Scalar input */}
        {isScalar && (
          <div>
            <label className="text-[10.5px] text-muted-foreground">{t('linalgScalar')}</label>
            <Input
              type="number"
              value={scalar}
              step="any"
              onChange={(e) => setScalar(parseFloat(e.target.value) || 0)}
              className="h-7 text-[11.5px] mt-0.5"
            />
          </div>
        )}

        {/* Power input */}
        {isPower && (
          <div>
            <label className="text-[10.5px] text-muted-foreground">{t('linalgPower')}</label>
            <Input
              type="number"
              value={power}
              step="1"
              onChange={(e) => setPower(parseInt(e.target.value, 10) || 0)}
              className="h-7 text-[11.5px] mt-0.5"
            />
          </div>
        )}

        {/* Operation selector */}
        <div>
          <label className="text-[10.5px] text-muted-foreground">{t('linalgOperation')}</label>
          <Select value={opKind} onValueChange={(v) => setOpKind(v as OpKind)}>
            <SelectTrigger className="h-7 text-[11.5px] mt-0.5 font-mono">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mul" className="text-[11.5px] font-mono">A × B</SelectItem>
              <SelectItem value="add" className="text-[11.5px] font-mono">A + B</SelectItem>
              <SelectItem value="sub" className="text-[11.5px] font-mono">A − B</SelectItem>
              <SelectItem value="emul" className="text-[11.5px] font-mono">A .* B</SelectItem>
              <SelectItem value="ediv" className="text-[11.5px] font-mono">A ./ B</SelectItem>
              <SelectItem value="scalar" className="text-[11.5px] font-mono">k · A</SelectItem>
              <SelectItem value="pow" className="text-[11.5px] font-mono">A^k</SelectItem>
              <SelectItem value="transpose" className="text-[11.5px] font-mono">A^T</SelectItem>
              <SelectItem value="inv" className="text-[11.5px] font-mono">A^(−1)</SelectItem>
              <SelectItem value="det" className="text-[11.5px] font-mono">det(A)</SelectItem>
              <SelectItem value="rank" className="text-[11.5px] font-mono">rank(A)</SelectItem>
              <SelectItem value="trace" className="text-[11.5px] font-mono">tr(A)</SelectItem>
              <SelectItem value="adj" className="text-[11.5px] font-mono">adj(A)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Compute button */}
        <Button
          onClick={handleCompute}
          disabled={working}
          className="w-full h-8 text-[11.5px] gap-1.5"
          size="sm"
        >
          <Cog className="size-3.5" />
          {t('linalgCompute')}
        </Button>

        {/* Result */}
        <AnimatePresence mode="wait">
          {error && (
            <motion.div
              key="err"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="rounded-md border border-rose-500/40 bg-rose-500/10 p-2.5 text-[11.5px] text-rose-600 dark:text-rose-300"
            >
              <div className="flex items-start gap-1.5">
                <X className="size-3.5 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            </motion.div>
          )}

          {result && !error && (
            <motion.div
              key="result"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="rounded-md border border-primary/30 bg-primary/5 p-2.5 glow-card-teal"
            >
              <div className="text-[10.5px] text-muted-foreground mb-1">{t('linalgResult')}</div>
              <div className="overflow-x-auto">
                <FormulaRenderer latex={result.latex} displayMode />
              </div>
              {result.isMatrix && result.matrix && (
                <div className="mt-2">
                  <div className="flex gap-1 mb-1.5">
                    <Button
                      variant={viewMode === 'table' ? 'default' : 'outline'}
                      size="sm"
                      className="h-6 px-2 text-[10.5px]"
                      onClick={() => setViewMode('table')}
                    >
                      表格
                    </Button>
                    <Button
                      variant={viewMode === 'heatmap' ? 'default' : 'outline'}
                      size="sm"
                      className="h-6 px-2 text-[10.5px]"
                      onClick={() => setViewMode('heatmap')}
                    >
                      热力图
                    </Button>
                  </div>
                  <div className="rounded-md border border-border/60 bg-muted/20 p-2">
                    <MatrixGridView matrix={result.matrix} viewMode={viewMode} />
                  </div>
                </div>
              )}
              {result.steps && result.steps.length > 0 && (
                <details className="mt-2 group">
                  <summary className="cursor-pointer text-[10.5px] text-muted-foreground hover:text-foreground select-none">
                    {t('linalgSteps')} ({result.steps.length})
                  </summary>
                  <div className="mt-1.5 space-y-1 overflow-x-auto">
                    {result.steps.map((s, i) => (
                      <div key={i} className="text-[11px] text-foreground/80">
                        <FormulaRenderer latex={s} displayMode />
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </ScrollArea>
  );
}

/** Compute matrix rank via Gaussian elimination with partial pivoting. */
function matrixRank(m: Matrix): number {
  if (m.length === 0) return 0;
  const rows = m.length;
  const cols = m[0].length;
  const a = m.map((r) => r.map((v) => v));
  let rank = 0;
  const eps = 1e-10;
  for (let c = 0; c < cols && rank < rows; c++) {
    // find pivot
    let pivot = -1;
    let maxAbs = eps;
    for (let r = rank; r < rows; r++) {
      if (Math.abs(a[r][c]) > maxAbs) {
        maxAbs = Math.abs(a[r][c]);
        pivot = r;
      }
    }
    if (pivot === -1) continue;
    if (pivot !== rank) {
      [a[rank], a[pivot]] = [a[pivot], a[rank]];
    }
    const pv = a[rank][c];
    for (let r = rank + 1; r < rows; r++) {
      const factor = a[r][c] / pv;
      for (let k = c; k < cols; k++) {
        a[r][k] -= factor * a[rank][k];
      }
    }
    rank++;
  }
  return rank;
}

/** Adjugate (classical adjoint) of a square matrix. */
function adjugate(m: Matrix): Matrix {
  const n = m.length;
  if (n === 1) return [[1]];
  const adj: Matrix = zeros(n, n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const minor = m
        .filter((_, ri) => ri !== i)
        .map((row) => row.filter((_, ci) => ci !== j));
      const cofactor = ((i + j) % 2 === 0 ? 1 : -1) * math.det(minor);
      adj[j][i] = cofactor; // transpose
    }
  }
  return cleanMatrix(adj);
}

/* ================================================================== *
 * TAB 3 — Decomposition
 * ================================================================== */

function DecompositionTab({
  matrices,
  selected,
}: {
  matrices: MatrixEntry[];
  selected: MatrixEntry | undefined;
}) {
  const [matrixName, setMatrixName] = useState(selected?.name ?? 'A');
  const [decompKind, setDecompKind] = useState<DecompKind>('lu');
  const [result, setResult] = useState<DecompositionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const matrix = matrices.find((m) => m.name === matrixName)?.data;

  const handleDecompose = () => {
    setWorking(true);
    setError(null);
    setResult(null);
    try {
      if (!matrix) {
        setError(t('linalgEmpty'));
        return;
      }
      if (!isSquare(matrix)) {
        setError(t('linalgNonSquare'));
        return;
      }

      let res: DecompositionResult;

      switch (decompKind) {
        case 'lu': {
          const lu = math.lup(math.matrix(matrix));
          const L = toMatrixArray(lu.L);
          const U = toMatrixArray(lu.U);
          // Build P matrix from permutation array `p`
          const p = (lu as unknown as { p: number[] }).p;
          const n = matrix.length;
          const P: Matrix = zeros(n, n);
          for (let i = 0; i < n; i++) P[i][p[i]] = 1;
          res = {
            parts: [
              { label: t('linalgPmatrix'), latex: matrixToLatex(P), matrix: P },
              { label: t('linalgLmatrix'), latex: matrixToLatex(L), matrix: L },
              { label: t('linalgUmatrix'), latex: matrixToLatex(U), matrix: U },
            ],
            note: 'P · A = L · U',
          };
          break;
        }
        case 'qr': {
          const qr = math.qr(math.matrix(matrix));
          const Q = toMatrixArray(qr.Q);
          const R = toMatrixArray(qr.R);
          res = {
            parts: [
              { label: t('linalgQmatrix'), latex: matrixToLatex(Q), matrix: Q },
              { label: t('linalgRmatrix'), latex: matrixToLatex(R), matrix: R },
            ],
            note: 'A = Q · R,  Q^T · Q = I',
          };
          break;
        }
        case 'eigen': {
          const eig = math.eigs(math.matrix(matrix));
          const values = (eig as unknown as { values: { toArray: () => unknown[] } }).values.toArray();
          const vectors = (eig as unknown as {
            eigenvectors: { value: number; vector: { toArray: () => unknown[] } }[];
          }).eigenvectors;
          const parts = [
            {
              label: t('linalgEigenvalues'),
              latex: `\\begin{bmatrix} ${values.map((v) => numToLatex(Number(v))).join(' \\\\ ')} \\end{bmatrix}`,
            },
          ];
          for (let i = 0; i < vectors.length; i++) {
            const ev = vectors[i];
            const vec = toMatrixArray(ev.vector);
            parts.push({
              label: `\\lambda_{${i + 1}} = ${numToLatex(ev.value)}, \\quad v_{${i + 1}}`,
              latex: matrixToLatex(vec),
            });
          }
          res = { parts, note: 'A · v_i = λ_i · v_i' };
          break;
        }
        case 'cholesky': {
          try {
            const L = choleskyDecomp(matrix);
            res = {
              parts: [{ label: t('linalgLmatrix'), latex: matrixToLatex(L), matrix: L }],
              note: 'A = L · L^T  (requires symmetric positive-definite)',
            };
          } catch (e) {
            setError((e as Error).message);
            return;
          }
          break;
        }
        case 'schur': {
          // mathjs doesn't have a schur function exposed; show note + toast.
          toast.warning('该分解暂不支持，mathjs 未提供实现');
          res = {
            parts: [],
            note: t('linalgNotSupported') + ' (mathjs 无内置 Schur 分解。可使用 QR 算法迭代近似)',
          };
          break;
        }
        case 'svd': {
          // mathjs doesn't have SVD; provide a one-sided Jacobi SVD for square-ish matrices
          try {
            const svd = svdJacobi(matrix);
            res = {
              parts: [
                { label: t('linalgUmatrix'), latex: matrixToLatex(svd.U), matrix: svd.U },
                {
                  label: t('linalgSmatrix'),
                  latex: matrixToLatex(svd.S.map((s) => [s])),
                },
                { label: t('linalgVmatrix'), latex: matrixToLatex(svd.V), matrix: svd.V },
              ],
              note: 'A = U · Σ · V^T  (one-sided Jacobi)',
            };
          } catch (e) {
            setError((e as Error).message);
            return;
          }
          break;
        }
        case 'jordan': {
          toast.warning('该分解暂不支持，mathjs 未提供实现');
          res = {
            parts: [],
            note: t('linalgNotSupported') + ' (mathjs 无 Jordan 标准型实现；建议使用特征值分解代替)',
          };
          break;
        }
        default:
          setError(t('linalgNotSupported'));
          return;
      }

      setResult(res);
    } catch (err) {
      setError((err as Error).message || t('linalgError'));
    } finally {
      setWorking(false);
    }
  };

  return (
    <ScrollArea className="h-full">
      <div className="p-2 space-y-2.5">
        {/* Matrix selector */}
        <div>
          <label className="text-[10.5px] text-muted-foreground">{t('linalgOpsA')}</label>
          <Select value={matrixName} onValueChange={setMatrixName}>
            <SelectTrigger className="h-7 text-[11.5px] mt-0.5">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {matrices.map((m) => (
                <SelectItem key={m.name} value={m.name} className="text-[11.5px]">
                  <span className="font-mono font-semibold text-primary">{m.name}</span>
                  <span className="text-muted-foreground ml-1.5">
                    ({m.data.length}×{m.data[0]?.length ?? 0})
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Decomp type */}
        <div>
          <label className="text-[10.5px] text-muted-foreground">{t('linalgDecompType')}</label>
          <Select value={decompKind} onValueChange={(v) => setDecompKind(v as DecompKind)}>
            <SelectTrigger className="h-7 text-[11.5px] mt-0.5">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="lu" className="text-[11.5px]">{t('linalgLu')}</SelectItem>
              <SelectItem value="qr" className="text-[11.5px]">{t('linalgQr')}</SelectItem>
              <SelectItem value="eigen" className="text-[11.5px]">{t('linalgEigenvalues')}</SelectItem>
              <SelectItem value="cholesky" className="text-[11.5px]">{t('linalgCholesky')}</SelectItem>
              <SelectItem value="svd" className="text-[11.5px]">SVD</SelectItem>
              <SelectItem value="schur" className="text-[11.5px]">{t('linalgSchur')}</SelectItem>
              <SelectItem value="jordan" className="text-[11.5px]">{t('linalgJordan')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button
          onClick={handleDecompose}
          disabled={working}
          className="w-full h-8 text-[11.5px] gap-1.5"
          size="sm"
        >
          <Split className="size-3.5" />
          {t('linalgDecompose')}
        </Button>

        <AnimatePresence mode="wait">
          {error && (
            <motion.div
              key="err"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="rounded-md border border-rose-500/40 bg-rose-500/10 p-2.5 text-[11.5px] text-rose-600 dark:text-rose-300"
            >
              <div className="flex items-start gap-1.5">
                <X className="size-3.5 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            </motion.div>
          )}

          {result && !error && (
            <motion.div
              key="res"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="space-y-2"
            >
              {result.note && (
                <div className="text-[11px] text-primary/90 bg-primary/5 border border-primary/20 rounded-md px-2 py-1.5">
                  {result.note}
                </div>
              )}
              <div className="grid grid-cols-1 gap-2">
                {result.parts.map((part, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className="rounded-md border border-border/60 bg-muted/30 p-2"
                  >
                    <div className="text-[10.5px] text-muted-foreground mb-1 overflow-x-auto">
                      <FormulaRenderer latex={part.label} displayMode={false} />
                    </div>
                    <div className="overflow-x-auto">
                      <FormulaRenderer latex={part.latex} displayMode />
                    </div>
                  </motion.div>
                ))}
                {result.parts.length === 0 && (
                  <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2.5 text-[11.5px] text-amber-700 dark:text-amber-300">
                    {result.note || t('linalgNotSupported')}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </ScrollArea>
  );
}

/** Cholesky decomposition (lower-triangular L such that A = L · Lᵀ).
 * Requires symmetric positive-definite. */
function choleskyDecomp(m: Matrix): Matrix {
  const n = m.length;
  // Symmetry check
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (Math.abs(m[i][j] - m[j][i]) > 1e-9) {
        throw new Error(t('linalgNotPositiveDef') + ' (非对称)');
      }
    }
  }
  const L = zeros(n, n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = 0;
      for (let k = 0; k < j; k++) sum += L[i][k] * L[j][k];
      if (i === j) {
        const v = m[i][i] - sum;
        if (v <= 0) {
          throw new Error(t('linalgNotPositiveDef'));
        }
        L[i][j] = Math.sqrt(v);
      } else {
        L[i][j] = (m[i][j] - sum) / L[j][j];
      }
    }
  }
  return cleanMatrix(L);
}

/** One-sided Jacobi SVD for an m×n matrix (m ≥ n preferred).
 * Returns U (m×m), S (length-n vector), V (n×n). */
function svdJacobi(A: Matrix): { U: Matrix; S: number[]; V: Matrix } {
  const m = A.length;
  const n = A[0].length;
  // Work on a copy.
  const B = A.map((row) => [...row]);
  // V starts as identity n×n; U is computed at the end from B's columns.
  let V = identity(n);

  // Iterate Jacobi rotations on columns of B until off-diagonal B^T B is small.
  const maxSweeps = 60;
  for (let sweep = 0; sweep < maxSweeps; sweep++) {
    let off = 0;
    for (let i = 0; i < n - 1; i++) {
      for (let j = i + 1; j < n; j++) {
        // Compute α = B[:,i]·B[:,i], β = B[:,j]·B[:,j], γ = B[:,i]·B[:,j]
        let alpha = 0, beta = 0, gamma = 0;
        for (let k = 0; k < m; k++) {
          alpha += B[k][i] * B[k][i];
          beta += B[k][j] * B[k][j];
          gamma += B[k][i] * B[k][j];
        }
        off += gamma * gamma;
        if (Math.abs(gamma) < 1e-14) continue;
        const zeta = (beta - alpha) / (2 * gamma);
        const t = Math.sign(zeta) / (Math.abs(zeta) + Math.sqrt(1 + zeta * zeta));
        const c = 1 / Math.sqrt(1 + t * t);
        const s = c * t;
        // Apply rotation to columns i, j of B
        for (let k = 0; k < m; k++) {
          const bi = B[k][i];
          const bj = B[k][j];
          B[k][i] = c * bi - s * bj;
          B[k][j] = s * bi + c * bj;
        }
        // Apply rotation to columns of V
        for (let k = 0; k < n; k++) {
          const vi = V[k][i];
          const vj = V[k][j];
          V[k][i] = c * vi - s * vj;
          V[k][j] = s * vi + c * vj;
        }
      }
    }
    if (off < 1e-24) break;
  }

  // Singular values are norms of B's columns.
  const sv: number[] = [];
  const Ucols: number[][] = [];
  for (let j = 0; j < n; j++) {
    let norm = 0;
    for (let k = 0; k < m; k++) norm += B[k][j] * B[k][j];
    norm = Math.sqrt(norm);
    sv.push(norm);
    // u_j = B[:,j] / σ_j  (only if σ > 0)
    const col: number[] = [];
    for (let k = 0; k < m; k++) {
      col.push(norm > 1e-12 ? B[k][j] / norm : 0);
    }
    Ucols.push(col);
  }
  // Pad U to m×m if needed (orthogonal completion not done for brevity).
  const U: Matrix = Array.from({ length: m }, () => Array(m).fill(0));
  for (let j = 0; j < n; j++) {
    for (let k = 0; k < m; k++) U[k][j] = Ucols[j][k];
  }
  // If m > n, fill remaining columns with standard basis vectors orthogonal to existing ones.
  // (For UI display this approximation is acceptable.)

  return { U: cleanMatrix(U), S: sv.map((s) => parseFloat(s.toPrecision(8))), V: cleanMatrix(V) };
}

/* ================================================================== *
 * TAB 4 — Linear System  (Ax = b)
 * ================================================================== */

function LinearSystemTab({ defaultMatrix }: { defaultMatrix: Matrix | undefined }) {
  const [rows, setRows] = useState<number>(3);
  const [cols, setCols] = useState<number>(3);
  const [matrix, setMatrix] = useState<Matrix>(
    defaultMatrix ?? [[1, 1, 1], [0, 2, 5], [2, 5, -1]],
  );
  const [vector, setVector] = useState<number[]>([6, -4, 27]);
  const [solution, setSolution] = useState<SystemSolution | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  // Sync matrix when defaultMatrix changes
  useEffect(() => {
    if (defaultMatrix && defaultMatrix.length > 0) {
      setMatrix(defaultMatrix);
      setRows(defaultMatrix.length);
      setCols(defaultMatrix[0]?.length ?? 3);
      setVector(Array(defaultMatrix.length).fill(0));
    }
  }, [defaultMatrix]);

  const updateCell = (r: number, c: number, val: string) => {
    const v = parseFloat(val);
    setMatrix((prev) => {
      const next = prev.map((row) => [...row]);
      if (!next[r]) next[r] = Array(cols).fill(0);
      next[r][c] = Number.isNaN(v) ? 0 : v;
      return next;
    });
  };
  const updateB = (i: number, val: string) => {
    const v = parseFloat(val);
    setVector((prev) => {
      const next = [...prev];
      next[i] = Number.isNaN(v) ? 0 : v;
      return next;
    });
  };

  const addRow = () => {
    setRows((r) => r + 1);
    setMatrix((prev) => [...prev, Array(cols).fill(0)]);
    setVector((prev) => [...prev, 0]);
  };
  const delRow = () => {
    if (rows <= 1) return;
    setRows((r) => r - 1);
    setMatrix((prev) => prev.slice(0, -1));
    setVector((prev) => prev.slice(0, -1));
  };
  const addCol = () => {
    setCols((c) => c + 1);
    setMatrix((prev) => prev.map((row) => [...row, 0]));
  };
  const delCol = () => {
    if (cols <= 1) return;
    setCols((c) => c - 1);
    setMatrix((prev) => prev.map((row) => row.slice(0, -1)));
  };

  const augmentedLatex = useMemo(() => {
    const aug = matrix.map((row, i) => [...row, vector[i] ?? 0]);
    // Render with a vertical bar between coefficient and constant columns
    const cols = matrix[0]?.length ?? 0;
    const rows = aug.map((r) => {
      const left = r.slice(0, cols).map(numToLatex).join(' & ');
      const right = numToLatex(r[cols]);
      return `${left} & \\big| & ${right}`;
    });
    return `\\left[\\begin{array}{${'c'.repeat(cols)}|c} ${rows.join(' \\\\ ')} \\end{array}\\right]`;
  }, [matrix, vector]);

  const handleSolve = () => {
    setWorking(true);
    setError(null);
    setSolution(null);
    try {
      if (vector.length !== matrix.length) {
        setError(t('linalgConstVecSize'));
        return;
      }
      const sol = solveLinearSystem(matrix, vector);
      sol.augmentedLatex = augmentedLatex;
      setSolution(sol);
    } catch (err) {
      setError((err as Error).message || t('linalgError'));
    } finally {
      setWorking(false);
    }
  };

  return (
    <ScrollArea className="h-full">
      <div className="p-2 space-y-2.5">
        {/* Coefficient matrix editor */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[10.5px] text-muted-foreground">{t('linalgMatrixA')}</label>
            <div className="flex gap-0.5">
              <Button variant="outline" size="sm" className="h-5 w-5 p-0" onClick={addRow}>
                <Plus className="size-3" />
              </Button>
              <Button variant="outline" size="sm" className="h-5 w-5 p-0" onClick={delRow}>
                <Minus className="size-3" />
              </Button>
              <Button variant="outline" size="sm" className="h-5 w-5 p-0" onClick={addCol}>
                <Plus className="size-3" />
              </Button>
              <Button variant="outline" size="sm" className="h-5 w-5 p-0" onClick={delCol}>
                <Minus className="size-3" />
              </Button>
            </div>
          </div>
          <div className="rounded-md border border-border/60 bg-muted/20 p-1.5 overflow-x-auto">
            <div className="inline-flex gap-3">
              {/* Matrix A */}
              <div className="flex flex-col gap-1">
                {matrix.map((row, ri) => (
                  <div key={ri} className="flex gap-1">
                    {row.map((cell, ci) => (
                      <input
                        key={ci}
                        type="number"
                        value={cell}
                        step="any"
                        onChange={(e) => updateCell(ri, ci, e.target.value)}
                        onPaste={(e) => handleGridPaste(e, ri, ci, setMatrix)}
                        className="w-11 h-7 px-1 text-[11px] font-mono tabular-nums text-center bg-background/60 border border-border/60 rounded focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/40"
                      />
                    ))}
                  </div>
                ))}
              </div>
              {/* Vector b */}
              <div className="flex flex-col gap-1">
                <div className="text-[9.5px] text-muted-foreground text-center mb-0.5">b</div>
                {vector.map((v, i) => (
                  <input
                    key={i}
                    type="number"
                    value={v}
                    step="any"
                    onChange={(e) => updateB(i, e.target.value)}
                    className="w-11 h-7 px-1 text-[11px] font-mono tabular-nums text-center bg-primary/5 border border-primary/30 rounded focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/40"
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        <Button
          onClick={handleSolve}
          disabled={working}
          className="w-full h-8 text-[11.5px] gap-1.5"
          size="sm"
        >
          <Equal className="size-3.5" />
          {t('linalgSolveAxb')}
        </Button>

        <AnimatePresence mode="wait">
          {error && (
            <motion.div
              key="err"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="rounded-md border border-rose-500/40 bg-rose-500/10 p-2.5 text-[11.5px] text-rose-600 dark:text-rose-300"
            >
              <div className="flex items-start gap-1.5">
                <X className="size-3.5 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            </motion.div>
          )}

          {solution && !error && (
            <motion.div
              key="sol"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="space-y-2"
            >
              {/* Augmented matrix */}
              <div className="rounded-md border border-border/60 bg-muted/30 p-2 overflow-x-auto">
                <div className="text-[10.5px] text-muted-foreground mb-1">{t('linalgAugmented')}</div>
                <FormulaRenderer latex={solution.augmentedLatex} displayMode />
              </div>

              {/* Result badge */}
              <div
                className={cn(
                  'rounded-md border px-2.5 py-1.5 text-[11.5px] font-medium',
                  solution.kind === 'unique' &&
                    'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
                  solution.kind === 'none' &&
                    'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
                  solution.kind === 'infinite' &&
                    'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
                )}
              >
                {solution.kind === 'unique' && t('linalgUniqueSolution')}
                {solution.kind === 'none' && t('linalgNoSolution')}
                {solution.kind === 'infinite' && t('linalgInfiniteSolution')}
              </div>

              {/* Rank info — justifies the classification above */}
              {solution.rankA !== undefined && solution.rankAug !== undefined && (
                <div className="text-[10.5px] text-muted-foreground bg-muted/30 border border-border/40 rounded px-2 py-1.5 font-mono">
                  rank(A) = {solution.rankA}，rank([A|b]) = {solution.rankAug}
                  {solution.nUnknowns !== undefined && (
                    <>
                      ，未知数 n = {solution.nUnknowns}
                      {solution.kind === 'infinite' &&
                        `，自由变量 = ${solution.nUnknowns - solution.rankA}`}
                    </>
                  )}
                </div>
              )}

              {/* Solution LaTeX */}
              <div className="rounded-md border border-primary/30 bg-primary/5 p-2.5 glow-card-teal overflow-x-auto">
                <FormulaRenderer latex={solution.latex} displayMode />
              </div>

              {/* Infinite: split into 特解 (particular) + 基础解系 (null-space basis) */}
              {solution.kind === 'infinite' &&
                solution.particular &&
                solution.nullBasis &&
                solution.nullBasis.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2 overflow-x-auto">
                      <div className="text-[10.5px] text-emerald-700 dark:text-emerald-300 mb-1 font-medium">
                        {t('linalgParticularSolution')} η*
                      </div>
                      <FormulaRenderer
                        latex={'\\eta^* = ' + vectorToLatex(solution.particular)}
                        displayMode
                      />
                    </div>
                    <div className="rounded-md border border-violet-500/30 bg-violet-500/5 p-2 overflow-x-auto">
                      <div className="text-[10.5px] text-violet-700 dark:text-violet-300 mb-1 font-medium">
                        {t('linalgNullSpace')}（基础解系）
                      </div>
                      {solution.nullBasis.map((v, i) => (
                        <div key={i} className="mb-1 last:mb-0">
                          <FormulaRenderer
                            latex={`\\xi_{${i + 1}} = ` + vectorToLatex(v)}
                            displayMode
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              {/* Gaussian elimination steps — 可视化时间线 */}
              {solution.steps.length > 0 && (
                <GaussianEliminationView
                  steps={solution.steps}
                  defaultExpandedCount={6}
                />
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </ScrollArea>
  );
}

/* Solve Ax = b with Gauss-Jordan elimination. Detects unique / none / infinite. */
function solveLinearSystem(A: Matrix, b: number[]): SystemSolution {
  const rows = A.length;
  const cols = A[0]?.length ?? 0;

  // Build augmented matrix
  const aug: number[][] = A.map((row, i) => [...row, b[i] ?? 0]);

  const steps: string[] = [];
  steps.push('\\text{增广矩阵 } [A|b] = ' + augmentedMatrixLatex(aug, cols));

  // Forward elimination with partial pivoting
  let pivotRow = 0;
  const eps = 1e-10;
  for (let c = 0; c < cols && pivotRow < rows; c++) {
    // Find pivot
    let maxIdx = -1;
    let maxAbs = eps;
    for (let r = pivotRow; r < rows; r++) {
      if (Math.abs(aug[r][c]) > maxAbs) {
        maxAbs = Math.abs(aug[r][c]);
        maxIdx = r;
      }
    }
    if (maxIdx === -1) continue; // free column

    if (maxIdx !== pivotRow) {
      [aug[maxIdx], aug[pivotRow]] = [aug[pivotRow], aug[maxIdx]];
      steps.push(`R_${maxIdx + 1} \\leftrightarrow R_${pivotRow + 1}: ` + augmentedMatrixLatex(aug, cols));
    }

    // Normalize pivot row
    const pv = aug[pivotRow][c];
    if (Math.abs(pv) > eps) {
      for (let k = c; k <= cols; k++) aug[pivotRow][k] /= pv;
      steps.push(`R_${pivotRow + 1} \\div ${numToLatex(pv)}: ` + augmentedMatrixLatex(aug, cols));
    }

    // Eliminate other rows
    for (let r = 0; r < rows; r++) {
      if (r === pivotRow) continue;
      const factor = aug[r][c];
      if (Math.abs(factor) > eps) {
        for (let k = c; k <= cols; k++) aug[r][k] -= factor * aug[pivotRow][k];
        steps.push(
          `R_${r + 1} - ${numToLatex(factor)} R_${pivotRow + 1}: ` + augmentedMatrixLatex(aug, cols),
        );
      }
    }
    pivotRow++;
  }

  // Determine solution type via rank comparison (computed from the
  // ORIGINAL A and [A|b], so the numbers are not contaminated by the
  // elimination above):
  //   rank(A) < rank([A|b])        → 无解 (inconsistent)
  //   rank(A) = rank([A|b]) = n     → 唯一解
  //   rank(A) = rank([A|b]) < n     → 无穷多解
  const rankA = matrixRank(A);
  const augMat: Matrix = A.map((row, i) => [...row, b[i] ?? 0]);
  const rankAug = matrixRank(augMat);

  if (rankA < rankAug) {
    return {
      kind: 'none',
      latex:
        '\\text{方程组无解 } (\\operatorname{rank}(A) = ' +
        rankA +
        ' < \\operatorname{rank}([A|b]) = ' +
        rankAug +
        ')',
      rankA,
      rankAug,
      nUnknowns: cols,
      augmentedLatex: '',
      steps,
    };
  }

  // Identify pivot columns
  const pivotCols: number[] = [];
  {
    let r = 0;
    for (let c = 0; c < cols && r < rows; c++) {
      if (Math.abs(aug[r][c]) > eps) {
        pivotCols.push(c);
        r++;
      }
    }
  }
  const freeCols: number[] = [];
  for (let c = 0; c < cols; c++) {
    if (!pivotCols.includes(c)) freeCols.push(c);
  }

  if (freeCols.length === 0 && pivotCols.length === cols) {
    // Unique solution
    const x = Array(cols).fill(0);
    for (let r = 0; r < rows; r++) {
      // find pivot column in this row
      let pc = -1;
      for (let c = 0; c < cols; c++) {
        if (Math.abs(aug[r][c]) > eps) {
          pc = c;
          break;
        }
      }
      if (pc !== -1) x[pc] = aug[r][cols];
    }
    return {
      kind: 'unique',
      latex: 'x = ' + vectorToLatex(x),
      vector: x,
      rankA,
      rankAug,
      nUnknowns: cols,
      augmentedLatex: '',
      steps,
    };
  }

  // Infinite solutions: build particular solution + null space basis
  // Set free variables to 0 → particular solution
  const particular = Array(cols).fill(0);
  for (let i = 0; i < pivotCols.length; i++) {
    const pc = pivotCols[i];
    particular[pc] = aug[i][cols];
  }

  // For each free variable, set it to 1 and others to 0 → null-space basis vector
  const nullBasis: number[][] = [];
  for (const fc of freeCols) {
    const v = Array(cols).fill(0);
    v[fc] = 1;
    for (let i = 0; i < pivotCols.length; i++) {
      const pc = pivotCols[i];
      v[pc] = -aug[i][fc];
    }
    nullBasis.push(v);
  }

  const terms: string[] = [];
  terms.push(vectorToLatex(particular));
  for (let i = 0; i < nullBasis.length; i++) {
    terms.push(`+ t_{${i + 1}} ` + vectorToLatex(nullBasis[i]));
  }
  return {
    kind: 'infinite',
    latex: 'x = ' + terms.join(' '),
    particular,
    nullBasis,
    rankA,
    rankAug,
    nUnknowns: cols,
    augmentedLatex: '',
    steps,
  };
}

function augmentedMatrixLatex(aug: number[][], cols: number): string {
  const rows = aug.map((r) => {
    const left = r.slice(0, cols).map(numToLatex).join(' & ');
    const right = numToLatex(r[cols]);
    return `${left} & \\big| & ${right}`;
  });
  return `\\left[\\begin{array}{${'c'.repeat(cols)}|c} ${rows.join(' \\\\ ')} \\end{array}\\right]`;
}

/* ================================================================== *
 * LinearTransformAnimation — 3Blue1Brown-style 2D matrix visualization
 * ================================================================== *
 * Shows how a 2×2 matrix [[a,b],[c,d]] transforms the plane:
 *   - Background grid (every 0.5 unit) morphs to show the mapping
 *   - Unit square (blue) shows area change → |det|
 *   - Unit circle (green) shows the general distortion
 *   - Basis vectors î (red) and ĵ (green) show where e1/e2 land
 *   - Smooth ease-in-out animation from identity to the target matrix
 *
 * Interaction:
 *   - 4 number inputs for a/b/c/d
 *   - Play / Pause / Reset buttons + progress slider
 *   - Preset buttons: shear / rotation / scale / projection
 */
const TFORM_VIEW = 3;        // viewport half-extent in world units
const TFORM_SCALE = 56;      // pixels per world unit
const TFORM_SIZE = TFORM_VIEW * 2 * TFORM_SCALE; // SVG size in px

// Transform a world point by matrix [[a,b],[c,d]].
function applyMatrix(a: number, b: number, c: number, d: number, x: number, y: number): [number, number] {
  return [a * x + b * y, c * x + d * y];
}

// Linear interpolation between identity and target matrix.
function lerpMatrix(m: number[], t: number): [number, number, number, number] {
  // m = [a, b, c, d], identity = [1,0,0,1]
  const a = m[0] * t + 1 * (1 - t);
  const b = m[1] * t + 0 * (1 - t);
  const c = m[2] * t + 0 * (1 - t);
  const d = m[3] * t + 1 * (1 - t);
  return [a, b, c, d];
}

// World (x,y) → SVG (px, py). Origin at center, y flipped.
function worldToSvg(x: number, y: number): [number, number] {
  return [
    TFORM_VIEW * TFORM_SCALE + x * TFORM_SCALE,
    TFORM_VIEW * TFORM_SCALE - y * TFORM_SCALE,
  ];
}

function LinearTransformAnimation() {
  // Matrix [a, b, c, d] representing [[a, b], [c, d]].
  const [matrix, setMatrix] = useState<number[]>([1, 0, 0, 1]);
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [showCircle, setShowCircle] = useState(true);
  const [showSquare, setShowSquare] = useState(true);
  const [stepMode, setStepMode] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  // Animation loop — ease-in-out over 1.5s.
  useEffect(() => {
    if (!playing || stepMode) return;
    let raf = 0;
    const start = performance.now();
    const duration = 1500;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // ease-in-out cubic
      const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      setProgress(eased);
      if (t < 1) raf = requestAnimationFrame(tick);
      else setPlaying(false);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, stepMode]);

  // 分步模式的步骤定义
  const stepDefs: ZoomStep[] = useMemo(() => {
    const fractions = [0, 0.25, 0.5, 0.75, 1];
    return fractions.map((f) => {
      const m = lerpMatrix(matrix, f);
      const d = m[0] * m[3] - m[1] * m[2];
      return {
        label: `进度 ${Math.round(f * 100)}%`,
        description: `det = ${d.toFixed(3)}  ·  [[${m[0].toFixed(2)}, ${m[1].toFixed(2)}], [${m[2].toFixed(2)}, ${m[3].toFixed(2)}]]`,
        fraction: f,
      };
    });
  }, [matrix]);

  // 分步模式下，进度由 stepIndex 决定
  const effectiveProgress = stepMode ? ((stepDefs[stepIndex]?.fraction as number | undefined) ?? 0) : progress;

  const [a, b, c, d] = lerpMatrix(matrix, effectiveProgress);
  const det = a * d - b * c;

  // Grid lines (every 0.5 unit from -3 to 3). Each line is transformed
  // by the interpolated matrix so the grid morphs with the animation.
  const gridLines: React.ReactElement[] = [];
  if (showGrid) {
    for (let i = -TFORM_VIEW * 2; i <= TFORM_VIEW * 2; i += 0.5) {
      // Horizontal line: y = i/2, x from -3 to 3 → 13 sample points
      const pts: [number, number][] = [];
      for (let xi = -TFORM_VIEW; xi <= TFORM_VIEW + 0.01; xi += 0.5) {
        pts.push(applyMatrix(a, b, c, d, xi, i / 2));
      }
      const isAxis = Math.abs(i) < 0.01;
      const svgPts = pts.map(([x, y]) => worldToSvg(x, y).join(',')).join(' ');
      gridLines.push(
        <polyline
          key={`h-${i}`}
          points={svgPts}
          fill="none"
          stroke={isAxis ? 'oklch(0.7 0.15 165 / 0.5)' : 'currentColor'}
          strokeWidth={isAxis ? 1.5 : 0.5}
          className={isAxis ? '' : 'text-muted-foreground/30'}
        />,
      );
      // Vertical line: x = i/2
      const vpts: [number, number][] = [];
      for (let yi = -TFORM_VIEW; yi <= TFORM_VIEW + 0.01; yi += 0.5) {
        vpts.push(applyMatrix(a, b, c, d, i / 2, yi));
      }
      const isVAxis = Math.abs(i) < 0.01;
      const vSvgPts = vpts.map(([x, y]) => worldToSvg(x, y).join(',')).join(' ');
      gridLines.push(
        <polyline
          key={`v-${i}`}
          points={vSvgPts}
          fill="none"
          stroke={isVAxis ? 'oklch(0.78 0.15 75 / 0.5)' : 'currentColor'}
          strokeWidth={isVAxis ? 1.5 : 0.5}
          className={isVAxis ? '' : 'text-muted-foreground/30'}
        />,
      );
    }
  }

  // Unit square — 4 corners transformed.
  const squareCorners: [number, number][] = [
    [0, 0], [1, 0], [1, 1], [0, 1],
  ].map(([x, y]) => applyMatrix(a, b, c, d, x, y));
  const squarePath = squareCorners
    .map(([x, y], i) => {
      const [sx, sy] = worldToSvg(x, y);
      return `${i === 0 ? 'M' : 'L'}${sx},${sy}`;
    })
    .join(' ') + ' Z';

  // Unit circle — 36 sample points.
  const circlePts: [number, number][] = [];
  for (let i = 0; i <= 36; i++) {
    const angle = (i / 36) * Math.PI * 2;
    circlePts.push(applyMatrix(a, b, c, d, Math.cos(angle), Math.sin(angle)));
  }
  const circlePath = circlePts
    .map(([x, y], i) => {
      const [sx, sy] = worldToSvg(x, y);
      return `${i === 0 ? 'M' : 'L'}${sx},${sy}`;
    })
    .join(' ') + (circlePts.length > 0 ? ' Z' : '');

  // Basis vectors — î = (a, c), ĵ = (b, d).
  const [ihatSvgX, ihatSvgY] = worldToSvg(a, c);
  const [jhatSvgX, jhatSvgY] = worldToSvg(b, d);
  const [originSvgX, originSvgY] = worldToSvg(0, 0);

  // Presets.
  const presets: Array<{ label: string; m: number[]; hint: string }> = [
    { label: '剪切', m: [1, 1, 0, 1], hint: 'shear' },
    { label: '旋转45°', m: [Math.cos(Math.PI / 4), -Math.sin(Math.PI / 4), Math.sin(Math.PI / 4), Math.cos(Math.PI / 4)], hint: 'rotation' },
    { label: '缩放2x', m: [2, 0, 0, 2], hint: 'scale' },
    { label: '投影', m: [1, 0, 0, 0], hint: 'projection (det=0)' },
  ];

  const updateCell = (idx: number, value: string) => {
    const n = parseFloat(value);
    setMatrix((prev) => {
      const next = [...prev];
      next[idx] = Number.isNaN(n) ? 0 : n;
      return next;
    });
    setProgress(1);
  };

  const handlePlay = () => {
    if (progress >= 1) setProgress(0);
    setPlaying(true);
  };
  const handleReset = () => {
    setPlaying(false);
    setProgress(0);
    setMatrix([1, 0, 0, 1]);
  };

  return (
    <div className="h-full flex flex-col gap-2 overflow-hidden">
      {/* Controls */}
      <div className="shrink-0 flex items-center gap-2 px-1 py-1 flex-wrap">
        {/* Matrix inputs */}
        <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-muted/40 border border-border/60">
          <span className="text-[10px] text-muted-foreground font-mono">[[</span>
          {matrix.map((v, i) => (
            <input
              key={i}
              type="number"
              step="0.1"
              value={v}
              onChange={(e) => updateCell(i, e.target.value)}
              className="w-12 h-6 px-1 text-[11px] font-mono text-center bg-transparent border border-border/60 rounded focus:outline-none focus:border-primary"
            />
          ))}
          <span className="text-[10px] text-muted-foreground font-mono">]]</span>
        </div>

        {/* Play / Reset / Step mode toggle */}
        <div className="flex items-center gap-0.5">
          {!stepMode && (
            <Button
              size="sm"
              variant="default"
              onClick={handlePlay}
              disabled={playing}
              className="h-6 px-2 text-[10.5px] gap-1"
            >
              {playing ? <Pause className="size-3" /> : <Play className="size-3" />}
              {playing ? '播放中' : '播放'}
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={handleReset}
            className="h-6 px-2 text-[10.5px] gap-1"
          >
            <RotateCcw className="size-3" />
            重置
          </Button>
          <Button
            size="sm"
            variant={stepMode ? 'default' : 'outline'}
            onClick={() => { setStepMode(!stepMode); setPlaying(false); }}
            className="h-6 px-2 text-[10.5px] gap-1"
            title="切换分步/连续动画模式"
          >
            {stepMode ? '分步' : '连续'}
          </Button>
        </div>

        {/* Progress slider (连续模式) */}
        {!stepMode && (
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={progress}
            onChange={(e) => { setPlaying(false); setProgress(parseFloat(e.target.value)); }}
            className="flex-1 min-w-[80px] h-1 accent-primary"
          />
        )}

        {/* Toggles */}
        <div className="flex items-center gap-1 text-[10px]">
          <label className="flex items-center gap-0.5 cursor-pointer">
            <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} className="accent-primary" />
            网格
          </label>
          <label className="flex items-center gap-0.5 cursor-pointer">
            <input type="checkbox" checked={showSquare} onChange={(e) => setShowSquare(e.target.checked)} className="accent-primary" />
            方块
          </label>
          <label className="flex items-center gap-0.5 cursor-pointer">
            <input type="checkbox" checked={showCircle} onChange={(e) => setShowCircle(e.target.checked)} className="accent-primary" />
            圆
          </label>
        </div>
      </div>

      {/* Presets */}
      <div className="shrink-0 flex items-center gap-1 px-1 flex-wrap">
        <span className="text-[10px] text-muted-foreground">预设:</span>
        {presets.map((p) => (
          <button
            key={p.hint}
            type="button"
            onClick={() => { setMatrix(p.m); setProgress(0); setPlaying(true); }}
            className="px-2 py-0.5 text-[10px] rounded border border-border/60 bg-muted/30 hover:bg-accent hover:text-foreground transition-colors"
            title={p.hint}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* SVG canvas + info */}
      <div className="flex-1 min-h-0 flex gap-2 overflow-hidden">
        <div className="flex-1 min-h-0 grid place-items-center overflow-auto bg-muted/20 rounded-md border border-border/40">
          <svg
            width={TFORM_SIZE}
            height={TFORM_SIZE}
            viewBox={`0 0 ${TFORM_SIZE} ${TFORM_SIZE}`}
            className="max-w-full max-h-full"
          >
            {/* Background grid (transformed) */}
            {gridLines}

            {/* Origin marker */}
            <circle cx={originSvgX} cy={originSvgY} r={2} fill="currentColor" className="text-foreground/60" />

            {/* Transformed unit square */}
            {showSquare && (
              <path
                d={squarePath}
                fill="oklch(0.7 0.15 165 / 0.12)"
                stroke="oklch(0.7 0.15 165)"
                strokeWidth={1.5}
              />
            )}

            {/* Transformed unit circle */}
            {showCircle && (
              <path
                d={circlePath}
                fill="oklch(0.78 0.15 75 / 0.08)"
                stroke="oklch(0.78 0.15 75)"
                strokeWidth={1.5}
              />
            )}

            {/* Basis vector î (red/teal) */}
            <line
              x1={originSvgX} y1={originSvgY}
              x2={ihatSvgX} y2={ihatSvgY}
              stroke="oklch(0.65 0.2 25)"
              strokeWidth={2}
              markerEnd="url(#arrow-ihat)"
            />
            {/* Basis vector ĵ (green/amber) */}
            <line
              x1={originSvgX} y1={originSvgY}
              x2={jhatSvgX} y2={jhatSvgY}
              stroke="oklch(0.7 0.18 95)"
              strokeWidth={2}
              markerEnd="url(#arrow-jhat)"
            />

            {/* Arrow markers */}
            <defs>
              <marker id="arrow-ihat" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
                <path d="M0,0 L8,4 L0,8 Z" fill="oklch(0.65 0.2 25)" />
              </marker>
              <marker id="arrow-jhat" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
                <path d="M0,0 L8,4 L0,8 Z" fill="oklch(0.7 0.18 95)" />
              </marker>
            </defs>

            {/* Labels */}
            <text x={ihatSvgX + 6} y={ihatSvgY} className="fill-foreground/80" fontSize="11" fontFamily="ui-monospace">
              î ({a.toFixed(2)}, {c.toFixed(2)})
            </text>
            <text x={jhatSvgX + 6} y={jhatSvgY} className="fill-foreground/80" fontSize="11" fontFamily="ui-monospace">
              ĵ ({b.toFixed(2)}, {d.toFixed(2)})
            </text>
          </svg>
        </div>

        {/* Info panel */}
        <div className="shrink-0 w-36 flex flex-col gap-1.5 p-2 rounded-md bg-muted/20 border border-border/40 text-[10.5px]">
          <div className="font-medium text-foreground/80">变换信息</div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">det</span>
            <span className="font-mono font-medium" style={{ color: Math.abs(det) < 0.01 ? 'oklch(0.65 0.2 25)' : 'inherit' }}>
              {det.toFixed(3)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">面积比</span>
            <span className="font-mono">{Math.abs(det).toFixed(3)}×</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">|î|</span>
            <span className="font-mono">{Math.hypot(a, c).toFixed(3)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">|ĵ|</span>
            <span className="font-mono">{Math.hypot(b, d).toFixed(3)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">进度</span>
            <span className="font-mono">{Math.round(effectiveProgress * 100)}%</span>
          </div>
          {Math.abs(det) < 0.01 && (
            <div className="mt-1 px-1.5 py-1 rounded bg-destructive/10 text-destructive text-[9.5px] leading-tight">
              det = 0：变换将平面压缩到一条直线（降维）
            </div>
          )}
          <div className="mt-1 text-[9px] text-muted-foreground/70 leading-tight">
            <div className="font-medium text-muted-foreground mb-0.5">提示</div>
            红色箭头 = î（原 e₁ 方向）<br />
            绿色箭头 = ĵ（原 e₂ 方向）<br />
            蓝色方块 = 单位正方形<br />
            绿色椭圆 = 单位圆
          </div>
        </div>
      </div>

      {/* 分步模式控制条 */}
      {stepMode && (
        <div className="shrink-0">
          <ZoomLens
            steps={stepDefs}
            currentStep={stepIndex}
            onStepChange={setStepIndex}
            defaultCollapsed={false}
          >
            {({ step }) => (
              <div className="text-[10px] text-muted-foreground text-center py-1">
                {step.description}
              </div>
            )}
          </ZoomLens>
        </div>
      )}
    </div>
  );
}
