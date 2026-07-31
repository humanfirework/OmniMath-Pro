'use client';

/**
 * OmniMath Pro — Linear Algebra Workbench (Task 1 — P2)
 *
 * 独立的全屏线代视图（viewMode === 'linalg'），布局比侧边栏
 * LinearAlgebraPanel 更宽敞：
 *
 *   ┌────────────┬──────────────────────────────────────────────┐
 *   │ 矩阵列表    │  Tabs: 编辑 / 运算 / 分解 / 方程组 / 变换     │
 *   │  w-64      │  flex-1 (min-w-[600px])                       │
 *   │  A 3×3     │                                                │
 *   │  B 2×2     │                                                │
 *   │  + 新建    │                                                │
 *   └────────────┴──────────────────────────────────────────────┘
 *
 * 复用 mathjs 进行矩阵运算；复用 MatrixTransformViz 子组件做变换可视化。
 * 暗色玻璃质感 + teal 主色调，与项目其它面板风格一致。
 */

import { useState, useMemo, useCallback, useEffect, type ClipboardEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Grid3x3,
  Plus,
  Minus,
  Trash2,
  Save,
  Split,
  Equal,
  Activity,
  X,
  RotateCcw,
  Cog,
  Sigma,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { FormulaRenderer } from '@/components/workbench/FormulaRenderer';
import { MatrixTransformViz } from '@/components/workbench/linalg/MatrixTransformViz';
import { useWorkbenchStore, type VariableEntry } from '@/lib/store/workbench';
import { setScopeVar } from '@/lib/engine';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { math } from '@/lib/engine/mathInstance';

/* ------------------------------------------------------------------ *
 * Types
 * ------------------------------------------------------------------ */
type Matrix = number[][];
type DecompKind = 'lu' | 'qr' | 'eigen' | 'cholesky' | 'svd';

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
  parts: { label: string; latex: string }[];
  note?: string;
}

interface SystemSolution {
  kind: 'unique' | 'none' | 'infinite';
  latex: string;
  augmentedLatex: string;
  rankA?: number;
  rankAug?: number;
  nUnknowns?: number;
}

/* ------------------------------------------------------------------ *
 * Pure math helpers (self-contained — mathjs based)
 * ------------------------------------------------------------------ */
function identity(n: number): Matrix {
  const m: Matrix = [];
  for (let i = 0; i < n; i++) m.push(Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  return m;
}

function zeros(rows: number, cols: number): Matrix {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => 0));
}

function cloneMatrix(m: Matrix): Matrix {
  return m.map((row) => [...row]);
}

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

function numToLatex(v: number): string {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    return Number.isNaN(v) ? '\\text{NaN}' : String(v);
  }
  const rounded = Math.round(v);
  if (Math.abs(v - rounded) < 1e-10) return String(rounded);
  return parseFloat(v.toPrecision(8)).toString();
}

function matrixToLatex(m: Matrix): string {
  if (m.length === 0) return '\\text{—}';
  if (m.length === 1) {
    return `\\begin{bmatrix} ${m[0].map(numToLatex).join(' & ')} \\end{bmatrix}`;
  }
  const rows = m.map((row) => row.map(numToLatex).join(' & '));
  return `\\begin{bmatrix} ${rows.join(' \\\\ ')} \\end{bmatrix}`;
}

function vectorToLatex(v: number[]): string {
  return `\\begin{bmatrix} ${v.map(numToLatex).join(' \\\\ ')} \\end{bmatrix}`;
}

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

function transpose(m: Matrix): Matrix {
  if (m.length === 0) return [];
  const rows = m.length;
  const cols = m[0].length;
  const out: Matrix = Array.from({ length: cols }, () => Array(rows).fill(0));
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) out[j][i] = m[i][j];
  }
  return out;
}

function matrixRank(m: Matrix): number {
  if (m.length === 0) return 0;
  const rows = m.length;
  const cols = m[0].length;
  const a = m.map((r) => r.map((v) => v));
  let rank = 0;
  const eps = 1e-10;
  for (let c = 0; c < cols && rank < rows; c++) {
    let pivot = -1;
    let maxAbs = eps;
    for (let r = rank; r < rows; r++) {
      if (Math.abs(a[r][c]) > maxAbs) {
        maxAbs = Math.abs(a[r][c]);
        pivot = r;
      }
    }
    if (pivot === -1) continue;
    if (pivot !== rank) [a[rank], a[pivot]] = [a[pivot], a[rank]];
    const pv = a[rank][c];
    for (let r = rank + 1; r < rows; r++) {
      const factor = a[r][c] / pv;
      for (let k = c; k < cols; k++) a[r][k] -= factor * a[rank][k];
    }
    rank++;
  }
  return rank;
}

/** Parse pasted matrix from TSV/CSV/[a,b;c,d] — used by editor paste handler. */
function parsePastedMatrix(text: string): Matrix | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const bracketMatch = /^\[([\s\S]+)\]$/m.exec(trimmed);
  if (bracketMatch) {
    const inner = bracketMatch[1];
    const rows = inner.split(';').map((r) => r.trim()).filter(Boolean);
    const result: Matrix = [];
    let cols = -1;
    for (const r of rows) {
      const cells = r.split(/[\s,]+/).map((c) => c.trim()).filter(Boolean);
      if (cells.length === 0) continue;
      if (cols === -1) cols = cells.length;
      else if (cells.length !== cols) return null;
      const nums = cells.map((c) => parseFloat(c));
      if (nums.some((n) => Number.isNaN(n))) return null;
      result.push(nums);
    }
    return result.length > 0 ? result : null;
  }
  const lines = trimmed.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;
  const result: Matrix = [];
  let cols = -1;
  for (const line of lines) {
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

function handleGridPaste(
  e: ClipboardEvent<HTMLInputElement>,
  startRow: number,
  startCol: number,
  onApply: (updater: (prev: Matrix) => Matrix) => void,
): boolean {
  const text = e.clipboardData?.getData('text') ?? '';
  if (!text) return false;
  if (!text.includes('\t') && !text.includes('\n') && !text.includes(',')) return false;
  const parsed = parsePastedMatrix(text);
  if (!parsed || parsed.length === 0) return false;
  e.preventDefault();
  onApply((prev: Matrix) => {
    const pastedRows = parsed.length;
    const pastedCols = parsed[0]?.length ?? 0;
    const needRows = startRow + pastedRows;
    const needCols = startCol + pastedCols;
    const next: Matrix = prev.map((row) => [...row]);
    const curCols = next[0]?.length ?? 0;
    while (next.length < needRows) next.push(Array(curCols).fill(0));
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
 * MAIN WORKBENCH
 * ================================================================== */
export function LinearAlgebraWorkbench() {
  const [matrices, setMatrices] = useState<MatrixEntry[]>(() => {
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
          if (!existingNames.has(name)) initial.push({ name, data: mat });
        }
      }
    } catch {
      // ignore
    }
    return initial;
  });
  const [selectedName, setSelectedName] = useState<string>('A');
  const [activeTab, setActiveTab] = useState<string>('edit');

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
    <div className="h-full w-full flex min-h-0 bg-background/40">
      {/* ─── 左侧矩阵列表 ─────────────────────────────────────── */}
      <aside className="w-64 shrink-0 flex flex-col border-r border-border/60 bg-card/30 backdrop-blur-sm">
        <div className="shrink-0 h-10 px-3 flex items-center justify-between border-b border-border/60 bg-background/40">
          <div className="flex items-center gap-1.5">
            <Grid3x3 className="size-3.5 text-primary" />
            <span className="text-[12px] font-semibold tracking-tight">矩阵库</span>
            <Badge variant="outline" className="h-4 px-1.5 text-[9.5px]">
              {matrices.length}
            </Badge>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={handleNewMatrix}
              >
                <Plus className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">新建矩阵</TooltipContent>
          </Tooltip>
        </div>
        <ScrollArea className="flex-1 min-h-0">
          <ul className="p-2 space-y-1">
            {matrices.map((m) => {
              const active = m.name === selectedName;
              return (
                <li key={m.name}>
                  <button
                    type="button"
                    onClick={() => setSelectedName(m.name)}
                    className={cn(
                      'w-full flex items-center gap-2 px-2.5 py-2 rounded-md transition-colors text-left',
                      active
                        ? 'bg-primary/12 text-primary'
                        : 'hover:bg-accent/60 text-foreground/85',
                    )}
                  >
                    <span
                      className={cn(
                        'grid place-items-center size-7 rounded-md font-mono text-[12px] font-semibold shrink-0',
                        active
                          ? 'bg-primary/20 text-primary border border-primary/40'
                          : 'bg-muted/50 border border-border/60',
                      )}
                    >
                      {m.name}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[11.5px] font-mono font-semibold truncate">
                        {m.name}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {m.data.length} × {m.data[0]?.length ?? 0}
                      </div>
                    </div>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteMatrix(m.name);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          e.stopPropagation();
                          handleDeleteMatrix(m.name);
                        }
                      }}
                      className="grid place-items-center size-6 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer"
                      aria-label="删除矩阵"
                    >
                      <Trash2 className="size-3.5" />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </ScrollArea>
      </aside>

      {/* ─── 右侧主区域（响应式：min-w-0 避免窗口缩放/全屏时溢出错位） ── */}
      <main className="flex-1 min-w-0 min-h-0 flex flex-col">
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex-1 min-h-0 flex flex-col gap-3 p-4"
        >
          <TabsList className="h-9 grid grid-cols-5 w-full max-w-xl text-[11.5px]">
            <TabsTrigger value="edit" className="text-[11.5px] gap-1.5">
              <Grid3x3 className="size-3.5" />
              矩阵编辑
            </TabsTrigger>
            <TabsTrigger value="ops" className="text-[11.5px] gap-1.5">
              <Cog className="size-3.5" />
              运算
            </TabsTrigger>
            <TabsTrigger value="decomp" className="text-[11.5px] gap-1.5">
              <Split className="size-3.5" />
              分解
            </TabsTrigger>
            <TabsTrigger value="system" className="text-[11.5px] gap-1.5">
              <Equal className="size-3.5" />
              方程组
            </TabsTrigger>
            <TabsTrigger value="transform" className="text-[11.5px] gap-1.5">
              <Activity className="size-3.5" />
              变换
            </TabsTrigger>
          </TabsList>

          <TabsContent value="edit" className="flex-1 min-h-0 overflow-hidden">
            <MatrixEditorTab
              matrices={matrices}
              selected={selected}
              onSelect={setSelectedName}
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
            <div className="h-full rounded-lg border border-border/60 bg-card/30 p-3 overflow-hidden">
              <MatrixTransformViz />
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

/* ================================================================== *
 * TAB 1 — Matrix Editor (spacious)
 * ================================================================== */
function MatrixEditorTab({
  matrices,
  selected,
  onSelect,
  onRename,
  onUpdate,
}: {
  matrices: MatrixEntry[];
  selected: MatrixEntry | undefined;
  onSelect: (name: string) => void;
  onRename: (old: string, next: string) => void;
  onUpdate: (name: string, data: Matrix) => void;
}) {
  const setVariable = useWorkbenchStore((s) => s.setVariable);
  const [renameValue, setRenameValue] = useState('');
  const [renaming, setRenaming] = useState(false);

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
  const addCol = () => onUpdate(name, matrix.map((row) => [...row, 0]));
  const delCol = () => {
    if (matrix[0].length <= 1) return;
    onUpdate(name, matrix.map((row) => row.slice(0, -1)));
  };

  const fillIdentity = () => {
    if (matrix.length !== matrix[0]?.length) {
      toast.error('需方阵');
      return;
    }
    onUpdate(name, identity(matrix.length));
  };
  const fillZeros = () => onUpdate(name, zeros(matrix.length, matrix[0]?.length ?? 3));
  const fillTranspose = () => onUpdate(name, transpose(matrix));

  const handleSave = () => {
    if (!selected) return;
    setScopeVar(name, matrix);
    const entry: VariableEntry = {
      name,
      value: matrix,
      type: 'matrix',
      latex: matrixToLatex(matrix),
    };
    setVariable(name, entry);
    toast.success('已保存: ' + name);
  };

  return (
    <div className="h-full overflow-auto">
      <div className="grid grid-cols-[auto_1fr] gap-6 p-2">
        {/* 编辑区 */}
        <div className="space-y-3">
          {/* 名称 + 选择 */}
          <div className="flex items-center gap-2">
            {renaming ? (
              <Input
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                className="h-7 w-24 text-[12px] font-mono"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    onRename(name, renameValue);
                    setRenaming(false);
                  } else if (e.key === 'Escape') {
                    setRenaming(false);
                  }
                }}
              />
            ) : (
              <Badge
                variant="outline"
                className="h-6 px-2.5 text-[12px] font-mono font-semibold text-primary bg-primary/5 border-primary/30 cursor-pointer hover:bg-primary/10"
                onClick={() => {
                  setRenameValue(name);
                  setRenaming(true);
                }}
              >
                {name}
              </Badge>
            )}
            <Select value={name} onValueChange={onSelect}>
              <SelectTrigger className="h-7 w-32 text-[11.5px]">
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
            <span className="text-[11px] text-muted-foreground">
              {matrix.length} × {matrix[0]?.length ?? 0}
            </span>
          </div>

          {/* 网格 */}
          <div className="rounded-lg border border-border/60 bg-muted/20 p-3 overflow-x-auto">
            <div className="inline-block">
              <div className="flex flex-col gap-1.5">
                {matrix.map((row, ri) => (
                  <div key={ri} className="flex gap-1.5">
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
                          'w-16 h-10 px-2 text-[13px] font-mono tabular-nums text-center',
                          'bg-background/60 border border-border/60 rounded-md',
                          'focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/40',
                          'hover:border-primary/40 transition-colors',
                        )}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 行/列操作 + 快速填充 */}
          <div className="flex flex-wrap items-center gap-1.5">
            <Button variant="outline" size="sm" className="h-7 px-2.5 text-[11px]" onClick={addRow}>
              <Plus className="size-3 mr-0.5" /> 加行
            </Button>
            <Button variant="outline" size="sm" className="h-7 px-2.5 text-[11px]" onClick={delRow}>
              <Minus className="size-3 mr-0.5" /> 减行
            </Button>
            <Button variant="outline" size="sm" className="h-7 px-2.5 text-[11px]" onClick={addCol}>
              <Plus className="size-3 mr-0.5" /> 加列
            </Button>
            <Button variant="outline" size="sm" className="h-7 px-2.5 text-[11px]" onClick={delCol}>
              <Minus className="size-3 mr-0.5" /> 减列
            </Button>
            <div className="w-px h-5 bg-border/60 mx-1" />
            <Button variant="outline" size="sm" className="h-7 px-2.5 text-[11px]" onClick={fillIdentity}>
              <Sigma className="size-3 mr-0.5" /> 单位阵
            </Button>
            <Button variant="outline" size="sm" className="h-7 px-2.5 text-[11px]" onClick={fillZeros}>
              零矩阵
            </Button>
            <Button variant="outline" size="sm" className="h-7 px-2.5 text-[11px]" onClick={fillTranspose}>
              <RotateCcw className="size-3 mr-0.5" /> 转置
            </Button>
          </div>

          <Button onClick={handleSave} className="h-9 text-[12px] gap-1.5" size="sm">
            <Save className="size-4" />
            保存到变量 → <span className="font-mono font-semibold">{name}</span>
          </Button>
        </div>

        {/* 预览区 */}
        <div className="space-y-2">
          <div className="text-[11px] text-muted-foreground">KaTeX 预览</div>
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 glow-card-teal min-h-[140px] grid place-items-center overflow-x-auto">
            <FormulaRenderer latex={name + ' = ' + matrixToLatex(matrix)} displayMode />
          </div>
          <div className="text-[10.5px] text-muted-foreground leading-relaxed">
            提示：支持粘贴 TSV / CSV / MATLAB 风格 <code className="font-mono">[1,2;3,4]</code>，
            会自动扩展目标网格。
          </div>
        </div>
      </div>
    </div>
  );
}

/* ================================================================== *
 * TAB 2 — Operations
 * ================================================================== */
type BinaryOp = 'add' | 'sub' | 'mul' | 'emul' | 'ediv';
type UnaryOp = 'transpose' | 'inv' | 'det' | 'rank' | 'trace';
type ScalarOp = 'scalar' | 'pow';
type OpKind = BinaryOp | UnaryOp | ScalarOp;

function OperationsTab({ matrices }: { matrices: MatrixEntry[] }) {
  const [opA, setOpA] = useState(matrices[0]?.name ?? 'A');
  const [opB, setOpB] = useState(matrices[1]?.name ?? 'B');
  const [opKind, setOpKind] = useState<OpKind>('mul');
  const [scalar, setScalar] = useState(2);
  const [power, setPower] = useState(2);
  const [result, setResult] = useState<OpResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const matrixA = matrices.find((m) => m.name === opA)?.data;
  const matrixB = matrices.find((m) => m.name === opB)?.data;

  const isBinary = ['add', 'sub', 'mul', 'emul', 'ediv'].includes(opKind);
  const isScalar = opKind === 'scalar';
  const isPower = opKind === 'pow';

  const handleCompute = () => {
    setWorking(true);
    setError(null);
    setResult(null);
    try {
      if (!matrixA) {
        setError('矩阵为空');
        return;
      }
      let res: OpResult;

      if (isBinary) {
        if (!matrixB) {
          setError('矩阵 B 为空');
          return;
        }
        const aRows = matrixA.length;
        const aCols = matrixA[0]?.length ?? 0;
        const bRows = matrixB.length;
        const bCols = matrixB[0]?.length ?? 0;
        if (opKind === 'mul') {
          if (aCols !== bRows) {
            setError(`维度不匹配: A(${aRows}×${aCols}) × B(${bRows}×${bCols})`);
            return;
          }
        } else {
          if (aRows !== bRows || aCols !== bCols) {
            setError(`维度不匹配: A(${aRows}×${aCols}) vs B(${bRows}×${bCols})`);
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
        res = { latex: expr + ' = ' + matrixToLatex(mat), text: expr, isMatrix: true, matrix: mat };
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
          setError('需方阵');
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
              setError('需方阵');
              return;
            }
            const det = math.det(matrixA);
            if (Math.abs(det) < 1e-12) {
              setError('奇异矩阵，不可逆');
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
              setError('需方阵');
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
              setError('需方阵');
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
          default:
            setError('未知操作');
            return;
        }
      }
      setResult(res);
    } catch (err) {
      setError((err as Error).message || '计算错误');
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="h-full overflow-auto">
      <div className="grid grid-cols-[320px_1fr] gap-5 p-2">
        {/* 控件区 */}
        <div className="space-y-3">
          <div>
            <label className="text-[11px] text-muted-foreground">操作数 A</label>
            <Select value={opA} onValueChange={setOpA}>
              <SelectTrigger className="h-8 text-[12px] mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {matrices.map((m) => (
                  <SelectItem key={m.name} value={m.name} className="text-[12px]">
                    <span className="font-mono font-semibold text-primary">{m.name}</span>
                    <span className="text-muted-foreground ml-1.5">
                      ({m.data.length}×{m.data[0]?.length ?? 0})
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isBinary && (
            <div>
              <label className="text-[11px] text-muted-foreground">操作数 B</label>
              <Select value={opB} onValueChange={setOpB}>
                <SelectTrigger className="h-8 text-[12px] mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {matrices.map((m) => (
                    <SelectItem key={m.name} value={m.name} className="text-[12px]">
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

          {isScalar && (
            <div>
              <label className="text-[11px] text-muted-foreground">标量 k</label>
              <Input
                type="number"
                value={scalar}
                step="any"
                onChange={(e) => setScalar(parseFloat(e.target.value) || 0)}
                className="h-8 text-[12px] mt-1"
              />
            </div>
          )}

          {isPower && (
            <div>
              <label className="text-[11px] text-muted-foreground">幂次 k（整数）</label>
              <Input
                type="number"
                value={power}
                step="1"
                onChange={(e) => setPower(parseInt(e.target.value, 10) || 0)}
                className="h-8 text-[12px] mt-1"
              />
            </div>
          )}

          <div>
            <label className="text-[11px] text-muted-foreground">运算</label>
            <Select value={opKind} onValueChange={(v) => setOpKind(v as OpKind)}>
              <SelectTrigger className="h-8 text-[12px] mt-1 font-mono">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mul" className="text-[12px] font-mono">A × B</SelectItem>
                <SelectItem value="add" className="text-[12px] font-mono">A + B</SelectItem>
                <SelectItem value="sub" className="text-[12px] font-mono">A − B</SelectItem>
                <SelectItem value="emul" className="text-[12px] font-mono">A .* B</SelectItem>
                <SelectItem value="ediv" className="text-[12px] font-mono">A ./ B</SelectItem>
                <SelectItem value="scalar" className="text-[12px] font-mono">k · A</SelectItem>
                <SelectItem value="pow" className="text-[12px] font-mono">A^k</SelectItem>
                <SelectItem value="transpose" className="text-[12px] font-mono">A^T</SelectItem>
                <SelectItem value="inv" className="text-[12px] font-mono">A^(−1)</SelectItem>
                <SelectItem value="det" className="text-[12px] font-mono">det(A)</SelectItem>
                <SelectItem value="rank" className="text-[12px] font-mono">rank(A)</SelectItem>
                <SelectItem value="trace" className="text-[12px] font-mono">tr(A)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button
            onClick={handleCompute}
            disabled={working}
            className="w-full h-9 text-[12px] gap-1.5"
            size="sm"
          >
            <Cog className="size-4" />
            计算
          </Button>
        </div>

        {/* 结果区 */}
        <div className="min-w-0">
          <AnimatePresence mode="wait">
            {error && (
              <motion.div
                key="err"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="rounded-md border border-rose-500/40 bg-rose-500/10 p-3 text-[12px] text-rose-600 dark:text-rose-300"
              >
                <div className="flex items-start gap-1.5">
                  <X className="size-4 mt-0.5 shrink-0" />
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
                className="rounded-md border border-primary/30 bg-primary/5 p-4 glow-card-teal"
              >
                <div className="text-[11px] text-muted-foreground mb-2">计算结果</div>
                <div className="overflow-x-auto">
                  <FormulaRenderer latex={result.latex} displayMode />
                </div>
                {result.steps && result.steps.length > 0 && (
                  <details className="mt-3 group">
                    <summary className="cursor-pointer text-[11px] text-muted-foreground hover:text-foreground select-none">
                      推导步骤 ({result.steps.length})
                    </summary>
                    <div className="mt-2 space-y-1.5 overflow-x-auto">
                      {result.steps.map((s, i) => (
                        <div key={i} className="text-[11.5px] text-foreground/80">
                          <FormulaRenderer latex={s} displayMode />
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </motion.div>
            )}

            {!result && !error && (
              <div className="h-full min-h-[200px] grid place-items-center text-[11.5px] text-muted-foreground">
                选择操作数与运算后点击 "计算"
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
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
        setError('矩阵为空');
        return;
      }
      if (!isSquare(matrix)) {
        setError('需方阵');
        return;
      }
      let res: DecompositionResult;

      switch (decompKind) {
        case 'lu': {
          const lu = math.lup(math.matrix(matrix));
          const L = toMatrixArray(lu.L);
          const U = toMatrixArray(lu.U);
          const p = (lu as unknown as { p: number[] }).p;
          const n = matrix.length;
          const P: Matrix = zeros(n, n);
          for (let i = 0; i < n; i++) P[i][p[i]] = 1;
          res = {
            parts: [
              { label: 'P', latex: matrixToLatex(P) },
              { label: 'L', latex: matrixToLatex(L) },
              { label: 'U', latex: matrixToLatex(U) },
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
              { label: 'Q', latex: matrixToLatex(Q) },
              { label: 'R', latex: matrixToLatex(R) },
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
              label: '特征值',
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
          const L = choleskyDecomp(matrix);
          res = {
            parts: [{ label: 'L', latex: matrixToLatex(L) }],
            note: 'A = L · L^T  (要求对称正定)',
          };
          break;
        }
        case 'svd': {
          toast.warning('mathjs 未内置 SVD，请使用 "特征值分解" 替代');
          res = {
            parts: [],
            note: 'mathjs 未提供 SVD 实现；建议使用 QR 或特征值分解代替',
          };
          break;
        }
        default:
          setError('暂不支持');
          return;
      }
      setResult(res);
    } catch (err) {
      setError((err as Error).message || '计算错误');
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="h-full overflow-auto">
      <div className="grid grid-cols-[320px_1fr] gap-5 p-2">
        <div className="space-y-3">
          <div>
            <label className="text-[11px] text-muted-foreground">矩阵</label>
            <Select value={matrixName} onValueChange={setMatrixName}>
              <SelectTrigger className="h-8 text-[12px] mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {matrices.map((m) => (
                  <SelectItem key={m.name} value={m.name} className="text-[12px]">
                    <span className="font-mono font-semibold text-primary">{m.name}</span>
                    <span className="text-muted-foreground ml-1.5">
                      ({m.data.length}×{m.data[0]?.length ?? 0})
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-[11px] text-muted-foreground">分解类型</label>
            <Select value={decompKind} onValueChange={(v) => setDecompKind(v as DecompKind)}>
              <SelectTrigger className="h-8 text-[12px] mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="lu" className="text-[12px]">LU 分解</SelectItem>
                <SelectItem value="qr" className="text-[12px]">QR 分解</SelectItem>
                <SelectItem value="eigen" className="text-[12px]">特征值分解</SelectItem>
                <SelectItem value="cholesky" className="text-[12px]">Cholesky 分解</SelectItem>
                <SelectItem value="svd" className="text-[12px]">SVD（暂不支持）</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button
            onClick={handleDecompose}
            disabled={working}
            className="w-full h-9 text-[12px] gap-1.5"
            size="sm"
          >
            <Split className="size-4" />
            分解
          </Button>
        </div>

        <div className="min-w-0">
          <AnimatePresence mode="wait">
            {error && (
              <motion.div
                key="err"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="rounded-md border border-rose-500/40 bg-rose-500/10 p-3 text-[12px] text-rose-600 dark:text-rose-300"
              >
                <div className="flex items-start gap-1.5">
                  <X className="size-4 mt-0.5 shrink-0" />
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
                className="space-y-3"
              >
                {result.note && (
                  <div className="text-[12px] text-primary/90 bg-primary/5 border border-primary/20 rounded-md px-3 py-2">
                    {result.note}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  {result.parts.map((part, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.04 }}
                      className="rounded-md border border-border/60 bg-muted/30 p-3"
                    >
                      <div className="text-[11px] text-muted-foreground mb-1.5 overflow-x-auto">
                        <FormulaRenderer latex={part.label} displayMode={false} />
                      </div>
                      <div className="overflow-x-auto">
                        <FormulaRenderer latex={part.latex} displayMode />
                      </div>
                    </motion.div>
                  ))}
                </div>
                {result.parts.length === 0 && (
                  <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-[12px] text-amber-700 dark:text-amber-300">
                    {result.note || '暂不支持'}
                  </div>
                )}
              </motion.div>
            )}

            {!result && !error && (
              <div className="h-full min-h-[200px] grid place-items-center text-[11.5px] text-muted-foreground">
                选择矩阵与分解方法后点击 "分解"
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

/** Cholesky decomposition (A = L · Lᵀ, requires symmetric positive-definite). */
function choleskyDecomp(m: Matrix): Matrix {
  const n = m.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (Math.abs(m[i][j] - m[j][i]) > 1e-9) {
        throw new Error('非对称，无法做 Cholesky 分解');
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
        if (v <= 0) throw new Error('非正定，无法做 Cholesky 分解');
        L[i][j] = Math.sqrt(v);
      } else {
        L[i][j] = (m[i][j] - sum) / L[j][j];
      }
    }
  }
  return cleanMatrix(L);
}

/* ================================================================== *
 * TAB 4 — Linear System (Ax = b)
 * ================================================================== */
function LinearSystemTab({ defaultMatrix }: { defaultMatrix: Matrix | undefined }) {
  const [matrix, setMatrix] = useState<Matrix>(
    defaultMatrix ?? [[1, 1, 1], [0, 2, 5], [2, 5, -1]],
  );
  const [vector, setVector] = useState<number[]>([6, -4, 27]);
  const [solution, setSolution] = useState<SystemSolution | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (defaultMatrix && defaultMatrix.length > 0) {
      setMatrix(defaultMatrix);
      setVector(Array(defaultMatrix.length).fill(0));
    }
  }, [defaultMatrix]);

  const updateCell = (r: number, c: number, val: string) => {
    const v = parseFloat(val);
    setMatrix((prev) => {
      const next = prev.map((row) => [...row]);
      if (!next[r]) next[r] = Array(prev[0]?.length ?? 3).fill(0);
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
    const cols = matrix[0]?.length ?? 3;
    setMatrix((prev) => [...prev, Array(cols).fill(0)]);
    setVector((prev) => [...prev, 0]);
  };
  const delRow = () => {
    if (matrix.length <= 1) return;
    setMatrix((prev) => prev.slice(0, -1));
    setVector((prev) => prev.slice(0, -1));
  };
  const addCol = () => setMatrix((prev) => prev.map((row) => [...row, 0]));
  const delCol = () => {
    if ((matrix[0]?.length ?? 0) <= 1) return;
    setMatrix((prev) => prev.map((row) => row.slice(0, -1)));
  };

  const augmentedLatex = useMemo(() => {
    const cols = matrix[0]?.length ?? 0;
    const aug = matrix.map((row, i) => [...row, vector[i] ?? 0]);
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
        setError('常向量长度需等于矩阵行数');
        return;
      }
      const sol = solveLinearSystem(matrix, vector);
      sol.augmentedLatex = augmentedLatex;
      setSolution(sol);
    } catch (err) {
      setError((err as Error).message || '求解错误');
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="h-full overflow-auto">
      <div className="grid grid-cols-[auto_1fr] gap-5 p-2">
        {/* 系数矩阵 + b */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-[11px] text-muted-foreground">增广矩阵 [A | b]</label>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" className="h-6 w-6 p-0" onClick={addRow}>
                <Plus className="size-3" />
              </Button>
              <Button variant="outline" size="sm" className="h-6 w-6 p-0" onClick={delRow}>
                <Minus className="size-3" />
              </Button>
              <Button variant="outline" size="sm" className="h-6 w-6 p-0" onClick={addCol}>
                <Plus className="size-3" />
              </Button>
              <Button variant="outline" size="sm" className="h-6 w-6 p-0" onClick={delCol}>
                <Minus className="size-3" />
              </Button>
            </div>
          </div>
          <div className="rounded-lg border border-border/60 bg-muted/20 p-3 overflow-x-auto">
            <div className="inline-flex gap-4">
              <div className="flex flex-col gap-1.5">
                {matrix.map((row, ri) => (
                  <div key={ri} className="flex gap-1.5">
                    {row.map((cell, ci) => (
                      <input
                        key={ci}
                        type="number"
                        value={cell}
                        step="any"
                        onChange={(e) => updateCell(ri, ci, e.target.value)}
                        onPaste={(e) => handleGridPaste(e, ri, ci, setMatrix)}
                        className="w-14 h-9 px-2 text-[12px] font-mono tabular-nums text-center bg-background/60 border border-border/60 rounded-md focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/40"
                      />
                    ))}
                  </div>
                ))}
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="text-[10px] text-muted-foreground text-center mb-0.5">b</div>
                {vector.map((v, i) => (
                  <input
                    key={i}
                    type="number"
                    value={v}
                    step="any"
                    onChange={(e) => updateB(i, e.target.value)}
                    className="w-14 h-9 px-2 text-[12px] font-mono tabular-nums text-center bg-primary/5 border border-primary/30 rounded-md focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/40"
                  />
                ))}
              </div>
            </div>
          </div>

          <Button
            onClick={handleSolve}
            disabled={working}
            className="w-full h-9 text-[12px] gap-1.5"
            size="sm"
          >
            <Equal className="size-4" />
            求解 Ax = b
          </Button>
        </div>

        {/* 结果 */}
        <div className="min-w-0">
          <AnimatePresence mode="wait">
            {error && (
              <motion.div
                key="err"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="rounded-md border border-rose-500/40 bg-rose-500/10 p-3 text-[12px] text-rose-600 dark:text-rose-300"
              >
                <div className="flex items-start gap-1.5">
                  <X className="size-4 mt-0.5 shrink-0" />
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
                className="space-y-3"
              >
                <div className="rounded-md border border-border/60 bg-muted/30 p-3 overflow-x-auto">
                  <div className="text-[11px] text-muted-foreground mb-1.5">增广矩阵</div>
                  <FormulaRenderer latex={solution.augmentedLatex} displayMode />
                </div>

                <div
                  className={cn(
                    'rounded-md border px-3 py-2 text-[12px] font-medium',
                    solution.kind === 'unique' &&
                      'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
                    solution.kind === 'none' &&
                      'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
                    solution.kind === 'infinite' &&
                      'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
                  )}
                >
                  {solution.kind === 'unique' && '唯一解'}
                  {solution.kind === 'none' && '无解'}
                  {solution.kind === 'infinite' && '无穷多解'}
                </div>

                {solution.rankA !== undefined && solution.rankAug !== undefined && (
                  <div className="text-[11px] text-muted-foreground bg-muted/30 border border-border/40 rounded px-2.5 py-1.5 font-mono">
                    rank(A) = {solution.rankA}，rank([A|b]) = {solution.rankAug}
                    {solution.nUnknowns !== undefined && (
                      <>，未知数 n = {solution.nUnknowns}</>
                    )}
                  </div>
                )}

                <div className="rounded-md border border-primary/30 bg-primary/5 p-3 glow-card-teal overflow-x-auto">
                  <FormulaRenderer latex={solution.latex} displayMode />
                </div>
              </motion.div>
            )}

            {!solution && !error && (
              <div className="h-full min-h-[200px] grid place-items-center text-[11.5px] text-muted-foreground">
                填写系数矩阵与常向量后点击 "求解"
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

/** Solve Ax = b with Gauss-Jordan elimination, classifying into unique / none / infinite. */
function solveLinearSystem(A: Matrix, b: number[]): SystemSolution {
  const rows = A.length;
  const cols = A[0]?.length ?? 0;
  const aug: number[][] = A.map((row, i) => [...row, b[i] ?? 0]);

  let pivotRow = 0;
  const eps = 1e-10;
  for (let c = 0; c < cols && pivotRow < rows; c++) {
    let maxIdx = -1;
    let maxAbs = eps;
    for (let r = pivotRow; r < rows; r++) {
      if (Math.abs(aug[r][c]) > maxAbs) {
        maxAbs = Math.abs(aug[r][c]);
        maxIdx = r;
      }
    }
    if (maxIdx === -1) continue;
    if (maxIdx !== pivotRow) [aug[maxIdx], aug[pivotRow]] = [aug[pivotRow], aug[maxIdx]];
    const pv = aug[pivotRow][c];
    if (Math.abs(pv) > eps) {
      for (let k = c; k <= cols; k++) aug[pivotRow][k] /= pv;
    }
    for (let r = 0; r < rows; r++) {
      if (r === pivotRow) continue;
      const factor = aug[r][c];
      if (Math.abs(factor) > eps) {
        for (let k = c; k <= cols; k++) aug[r][k] -= factor * aug[pivotRow][k];
      }
    }
    pivotRow++;
  }

  const rankA = matrixRank(A);
  const augMat: Matrix = A.map((row, i) => [...row, b[i] ?? 0]);
  const rankAug = matrixRank(augMat);

  if (rankA < rankAug) {
    return {
      kind: 'none',
      latex: '\\text{方程组无解}',
      rankA,
      rankAug,
      nUnknowns: cols,
      augmentedLatex: '',
    };
  }

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
    const x = Array(cols).fill(0);
    for (let r = 0; r < rows; r++) {
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
      rankA,
      rankAug,
      nUnknowns: cols,
      augmentedLatex: '',
    };
  }

  const particular = Array(cols).fill(0);
  for (let i = 0; i < pivotCols.length; i++) {
    particular[pivotCols[i]] = aug[i][cols];
  }
  const nullBasis: number[][] = [];
  for (const fc of freeCols) {
    const v = Array(cols).fill(0);
    v[fc] = 1;
    for (let i = 0; i < pivotCols.length; i++) {
      v[pivotCols[i]] = -aug[i][fc];
    }
    nullBasis.push(v);
  }
  const terms: string[] = [vectorToLatex(particular)];
  for (let i = 0; i < nullBasis.length; i++) {
    terms.push(`+ t_{${i + 1}} ` + vectorToLatex(nullBasis[i]));
  }
  return {
    kind: 'infinite',
    latex: 'x = ' + terms.join(' '),
    rankA,
    rankAug,
    nUnknowns: cols,
    augmentedLatex: '',
  };
}
