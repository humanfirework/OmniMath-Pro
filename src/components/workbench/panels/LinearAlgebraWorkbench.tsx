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
  ArrowRight,
  Check,
  Ruler,
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
import { VectorPreviewCanvas } from '@/components/workbench/linalg/VectorPreviewCanvas';
import { AiPromptInput } from '@/components/workbench/ai/AiPromptInput';
import { useAIContextStore } from '@/lib/store/aiContextStore';
import { useWorkbenchStore, type VariableEntry } from '@/lib/store/workbench';
import { setScopeVar } from '@/lib/engine';
import { t, tf, useLocale, type TranslationDict } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { math } from '@/lib/engine/mathInstance';

/* ------------------------------------------------------------------ *
 * Types
 * ------------------------------------------------------------------ */
type Matrix = number[][];
type DecompKind = 'lu' | 'qr' | 'eigen' | 'cholesky' | 'svd';

/**
 * 把 AI 下发的矩阵清洗为合法二维数字矩阵：
 *  - 非数组/空 → null（无法恢复）；
 *  - 每个单元格 NaN/Infinity → 0；
 *  - 浮点误差 → 四舍五入到 1e-9，避免 WebGL / 显示层被微尘噪声污染。
 */
function sanitizeMatrixForAI(value: unknown): Matrix | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const out: Matrix = [];
  for (const row of value) {
    if (!Array.isArray(row)) return null;
    const cleanRow: number[] = [];
    for (const cell of row) {
      const n = typeof cell === 'number' ? cell : Number(cell);
      if (!Number.isFinite(n)) continue; // 非法值整行平移，保持等长
      cleanRow.push(Math.abs(n) < 1e-9 ? 0 : n);
    }
    if (cleanRow.length === 0) return null;
    out.push(cleanRow);
  }
  return out;
}

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
  vector?: number[];
  particular?: number[];
  nullBasis?: number[][];
  pivotCols?: number[];
  freeCols?: number[];
  isHomogeneous?: boolean;
  steps?: string[];
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

/** 将 mathjs 特征向量（一维数组或 n×1 矩阵）规范为「列向量」二维数组 [[v1],[v2],…]。 */
function toColumnMatrix(value: unknown): Matrix {
  let arr: unknown[];
  if (typeof value === 'object' && value !== null && 'toArray' in value) {
    arr = (value as { toArray: () => unknown[] }).toArray();
  } else if (Array.isArray(value)) {
    arr = value;
  } else {
    return [[Number(value as number)]];
  }
  // 已是二维（例如 n×1 矩阵）：逐行取首列组成列向量。
  if (arr.length > 0 && Array.isArray(arr[0])) {
    return (arr as number[][]).map((row) => [Number(row[0])]);
  }
  // 一维数组 → 列向量 [[v1],[v2],…]。
  return (arr as number[]).map((x) => [Number(x)]);
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

/** Compact read-only preview of a matrix as a grid — used under the
 *  operand A/B selectors. */
function MatrixPreview({ matrix }: { matrix: Matrix }) {
  const rows = matrix.length;
  const cols = matrix[0]?.length ?? 0;
  return (
    <div className="overflow-x-auto">
      <div className="grid gap-px" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {matrix.flatMap((row, i) =>
          row.map((v, j) => (
            <div
              key={`${i}-${j}`}
              className="flex items-center justify-center rounded bg-muted/40 px-1.5 py-0.5 font-mono text-[11px] tabular-nums"
            >
              {Number.isInteger(v) ? v : (Math.round(v * 1000) / 1000).toString()}
            </div>
          )),
        )}
      </div>
      {rows === 0 && <div className="text-[11px] text-muted-foreground">(0×0)</div>}
    </div>
  );
}

/* ================================================================== *
 * MAIN WORKBENCH
 * ================================================================== */
export function LinearAlgebraWorkbench() {
  useLocale();
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

  // M2 — 把矩阵与选中项同步到 AI 读取上下文 store（只读镜像）。
  useEffect(() => {
    useAIContextStore.getState().setLinalg({
      matrices: matrices.map((m) => ({ name: m.name, data: m.data })),
      selectedName,
    });
  }, [matrices, selectedName]);

  // M2 — 接收 apply_matrix 指令：清洗后写入当前选中矩阵（仅改数据，不动结构）。
  useEffect(() => {
    const handler = (e: Event) => {
      const d = (e as CustomEvent<{ matrix?: unknown }>).detail;
      if (!d || !Array.isArray(d.matrix) || d.matrix.length === 0) return;
      const cleaned = sanitizeMatrixForAI(d.matrix);
      if (!cleaned) return;
      const target = selectedName || matrices[0]?.name;
      if (!target) return;
      handleUpdateMatrix(target, cleaned);
    };
    window.addEventListener('omnimath:linalg-apply', handler);
    return () => window.removeEventListener('omnimath:linalg-apply', handler);
  }, [selectedName, matrices, handleUpdateMatrix]);

  return (
    <div className="h-full w-full flex min-h-0 bg-background/40">
      {/* ─── 左侧矩阵列表 ─────────────────────────────────────── */}
      <aside className="w-64 shrink-0 flex flex-col border-r border-border/60 bg-card/30 backdrop-blur-sm">
        <div className="shrink-0 h-10 px-3 flex items-center justify-between border-b border-border/60 bg-background/40">
          <div className="flex items-center gap-1.5">
            <Grid3x3 className="size-3.5 text-primary" />
            <span className="text-[12px] font-semibold tracking-tight">{t('linalgMatrixLib')}</span>
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
            <TooltipContent side="bottom">{t('linalgNewMatrix')}</TooltipContent>
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
                      aria-label={t('linalgDeleteMatrix')}
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
          <TabsList className="h-9 grid grid-cols-6 w-full max-w-2xl text-[11.5px]">
            <TabsTrigger value="edit" className="text-[11.5px] gap-1.5">
              <Grid3x3 className="size-3.5" />
              {t('linalgTabEdit')}
            </TabsTrigger>
            <TabsTrigger value="ops" className="text-[11.5px] gap-1.5">
              <Cog className="size-3.5" />
              {t('linalgTabOps')}
            </TabsTrigger>
            <TabsTrigger value="decomp" className="text-[11.5px] gap-1.5">
              <Split className="size-3.5" />
              {t('linalgTabDecomp')}
            </TabsTrigger>
            <TabsTrigger value="system" className="text-[11.5px] gap-1.5">
              <Equal className="size-3.5" />
              {t('linalgTabSystem')}
            </TabsTrigger>
            <TabsTrigger value="vector" className="text-[11.5px] gap-1.5">
              <ArrowRight className="size-3.5" />
              {t('linalgTabVector')}
            </TabsTrigger>
            <TabsTrigger value="transform" className="text-[11.5px] gap-1.5">
              <Activity className="size-3.5" />
              {t('linalgTabTransform')}
            </TabsTrigger>
          </TabsList>

          <TabsContent
            value="edit"
            forceMount
            className={cn('min-h-0 overflow-hidden', activeTab === 'edit' ? 'flex-1' : 'hidden')}
          >
            <MatrixEditorTab
              matrices={matrices}
              selected={selected}
              onSelect={setSelectedName}
              onRename={handleRenameMatrix}
              onUpdate={handleUpdateMatrix}
            />
          </TabsContent>

          <TabsContent
            value="ops"
            forceMount
            className={cn('min-h-0 overflow-hidden', activeTab === 'ops' ? 'flex-1' : 'hidden')}
          >
            <OperationsTab matrices={matrices} />
          </TabsContent>

          <TabsContent
            value="decomp"
            forceMount
            className={cn('min-h-0 overflow-hidden', activeTab === 'decomp' ? 'flex-1' : 'hidden')}
          >
            <DecompositionTab matrices={matrices} selected={selected} />
          </TabsContent>

          <TabsContent
            value="system"
            forceMount
            className={cn('min-h-0 overflow-hidden', activeTab === 'system' ? 'flex-1' : 'hidden')}
          >
            <LinearSystemTab matrices={matrices} selected={selected} />
          </TabsContent>

          <TabsContent
            value="vector"
            forceMount
            className={cn('min-h-0 overflow-hidden', activeTab === 'vector' ? 'flex-1' : 'hidden')}
          >
            <VectorOpsTab />
          </TabsContent>

          <TabsContent
            value="transform"
            forceMount
            className={cn('min-h-0 overflow-hidden', activeTab === 'transform' ? 'flex-1' : 'hidden')}
          >
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
      toast.error(t('linalgNeedSquare'));
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
    toast.success(tf('linalgSavedVar', { name }));
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
              <Plus className="size-3 mr-0.5" /> {t('linalgAddRowBtn')}
            </Button>
            <Button variant="outline" size="sm" className="h-7 px-2.5 text-[11px]" onClick={delRow}>
              <Minus className="size-3 mr-0.5" /> {t('linalgDelRowBtn')}
            </Button>
            <Button variant="outline" size="sm" className="h-7 px-2.5 text-[11px]" onClick={addCol}>
              <Plus className="size-3 mr-0.5" /> {t('linalgAddColBtn')}
            </Button>
            <Button variant="outline" size="sm" className="h-7 px-2.5 text-[11px]" onClick={delCol}>
              <Minus className="size-3 mr-0.5" /> {t('linalgDelColBtn')}
            </Button>
            <div className="w-px h-5 bg-border/60 mx-1" />
            <Button variant="outline" size="sm" className="h-7 px-2.5 text-[11px]" onClick={fillIdentity}>
              <Sigma className="size-3 mr-0.5" /> {t('linalgIdentity')}
            </Button>
            <Button variant="outline" size="sm" className="h-7 px-2.5 text-[11px]" onClick={fillZeros}>
              {t('linalgZeros')}
            </Button>
            <Button variant="outline" size="sm" className="h-7 px-2.5 text-[11px]" onClick={fillTranspose}>
              <RotateCcw className="size-3 mr-0.5" /> {t('linalgTranspose')}
            </Button>
          </div>

          <Button onClick={handleSave} className="h-9 text-[12px] gap-1.5" size="sm">
            <Save className="size-4" />
            {t('linalgSaveToVar')} <span className="font-mono font-semibold">{name}</span>
          </Button>

          {/* M2 — 矩阵编辑器就地 AI 输入：把当前矩阵打包发给 AI。 */}
          <AiPromptInput
            module="linalg"
            context={`当前矩阵 ${name} = ${JSON.stringify(matrix).slice(0, 800)}`}
            placeholder="设矩阵、解释或求值…"
          />
        </div>

        {/* 预览区 */}
        <div className="space-y-2">
          <div className="text-[11px] text-muted-foreground">{t('linalgKatexPreview')}</div>
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 glow-card-teal min-h-[140px] grid place-items-center overflow-x-auto">
            <FormulaRenderer latex={name + ' = ' + matrixToLatex(matrix)} displayMode fitToContainer={true} />
          </div>
          <div className="text-[10.5px] text-muted-foreground leading-relaxed">
            {t('linalgPasteExpandHint')}
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
        setError(t('linalgMatrixEmpty'));
        return;
      }
      let res: OpResult;

      if (isBinary) {
        if (!matrixB) {
          setError(t('linalgMatrixBEmpty'));
          return;
        }
        const aRows = matrixA.length;
        const aCols = matrixA[0]?.length ?? 0;
        const bRows = matrixB.length;
        const bCols = matrixB[0]?.length ?? 0;
        if (opKind === 'mul') {
          if (aCols !== bRows) {
            setError(tf('linalgDimMismatchMul', { ar: aRows, ac: aCols, br: bRows, bc: bCols }));
            return;
          }
        } else {
          if (aRows !== bRows || aCols !== bCols) {
            setError(tf('linalgDimMismatchBin', { ar: aRows, ac: aCols, br: bRows, bc: bCols }));
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
        const binSteps: string[] = [];
        if (opKind === 'mul') {
          binSteps.push(`${opA} = ${matrixToLatex(matrixA)}, \\quad ${opB} = ${matrixToLatex(matrixB)}`);
          binSteps.push(`(AB)_{ij} = \\sum_{k} A_{ik} B_{kj}`);
          binSteps.push(`${expr} = ${matrixToLatex(mat)}`);
        } else if (opKind === 'emul' || opKind === 'ediv') {
          const opSym = opKind === 'emul' ? '\\odot' : '\\oslash';
          const elSym = opKind === 'emul' ? '\\times' : '\\div';
          binSteps.push(`${opA} = ${matrixToLatex(matrixA)}, \\quad ${opB} = ${matrixToLatex(matrixB)}`);
          binSteps.push(`(A ${opSym} B)_{ij} = A_{ij} ${elSym} B_{ij}`);
          binSteps.push(`${expr} = ${matrixToLatex(mat)}`);
        } else {
          const sym = opKind === 'add' ? '+' : '-';
          binSteps.push(`${opA} = ${matrixToLatex(matrixA)}, \\quad ${opB} = ${matrixToLatex(matrixB)}`);
          binSteps.push(`(A ${sym} B)_{ij} = A_{ij} ${sym} B_{ij}`);
          binSteps.push(`${expr} = ${matrixToLatex(mat)}`);
        }
        res = {
          latex: expr + ' = ' + matrixToLatex(mat),
          text: expr,
          isMatrix: true,
          matrix: mat,
          steps: binSteps,
        };
      } else if (isScalar) {
        const val = math.multiply(scalar, math.matrix(matrixA));
        const mat = toMatrixArray(val);
        res = {
          latex: `${scalar} \\cdot ${opA} = ${matrixToLatex(mat)}`,
          text: `${scalar}*${opA}`,
          isMatrix: true,
          matrix: mat,
          steps: [
            `${opA} = ${matrixToLatex(matrixA)}`,
            `(c \\cdot A)_{ij} = c \\cdot A_{ij}`,
            `${scalar} \\cdot ${opA} = ${matrixToLatex(mat)}`,
          ],
        };
      } else if (isPower) {
        if (!isSquare(matrixA)) {
          setError(t('linalgNeedSquare'));
          return;
        }
        const val = math.pow(math.matrix(matrixA), power);
        const mat = toMatrixArray(val);
        res = {
          latex: `${opA}^{${power}} = ${matrixToLatex(mat)}`,
          text: `${opA}^${power}`,
          isMatrix: true,
          matrix: mat,
          steps: [
            `${opA} = ${matrixToLatex(matrixA)}`,
            `${opA}^{${power}} = \\underbrace{${opA} \\cdots ${opA}}_{${power} \\text{${t('linalgTimesOp')}}} = ${matrixToLatex(mat)}`,
          ],
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
              steps: [
                `${opA} = ${matrixToLatex(matrixA)}`,
                `(A^T)_{ij} = A_{ji} \\implies ${opA}^T = ${matrixToLatex(mat)}`,
              ],
            };
            break;
          }
          case 'inv': {
            if (!isSquare(matrixA)) {
              setError(t('linalgNeedSquare'));
              return;
            }
            const det = math.det(matrixA);
            if (Math.abs(det) < 1e-12) {
              setError(t('linalgSingularNonInv'));
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
                `\\det(${opA}) \\neq 0 \\Rightarrow ${opA} \\text{${t('linalgInvertibleLatex')}}`,
                `${opA}^{-1} = ${matrixToLatex(mat)}`,
              ],
            };
            break;
          }
          case 'det': {
            if (!isSquare(matrixA)) {
              setError(t('linalgNeedSquare'));
              return;
            }
            const det = math.det(matrixA);
            res = {
              latex: `\\det(${opA}) = ${numToLatex(det)}`,
              text: `det(${opA}) = ${det}`,
              isMatrix: false,
              steps: [
                `${opA} = ${matrixToLatex(matrixA)}`,
                `\\det(${opA}) = ${numToLatex(det)}`,
              ],
            };
            break;
          }
          case 'rank': {
            const r = matrixRank(matrixA);
            res = {
              latex: `\\operatorname{rank}(${opA}) = ${r}`,
              text: `rank(${opA}) = ${r}`,
              isMatrix: false,
              steps: [
                `${opA} = ${matrixToLatex(matrixA)}`,
                `\\operatorname{rank}(${opA}) = ${r} \\quad (\\text{${t('linalgMaxIndepRows')}})`,
              ],
            };
            break;
          }
          case 'trace': {
            if (!isSquare(matrixA)) {
              setError(t('linalgNeedSquare'));
              return;
            }
            const tr = matrixA.reduce((sum, row, i) => sum + (row[i] ?? 0), 0);
            res = {
              latex: `\\operatorname{tr}(${opA}) = ${numToLatex(tr)}`,
              text: `tr(${opA}) = ${tr}`,
              isMatrix: false,
              steps: [
                `${opA} = ${matrixToLatex(matrixA)}`,
                `\\operatorname{tr}(${opA}) = \\sum_{i} A_{ii} = ${numToLatex(tr)}`,
              ],
            };
            break;
          }
          default:
            setError(t('linalgUnknownOp'));
            return;
        }
      }
      setResult(res);
    } catch (err) {
      setError((err as Error).message || t('linalgCalcError'));
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
            <label className="text-[11px] text-muted-foreground">{t('linalgOperandA')}</label>
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

          {matrices.find((m) => m.name === opA) && (
            <div className="mt-1.5 rounded-md border border-border/40 bg-muted/20 p-2">
              <MatrixPreview matrix={matrices.find((m) => m.name === opA)!.data} />
            </div>
          )}

          {isBinary && (
            <div>
              <label className="text-[11px] text-muted-foreground">{t('linalgOperandB')}</label>
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
          {matrices.find((m) => m.name === opB) && (
            <div className="mt-1.5 rounded-md border border-border/40 bg-muted/20 p-2">
              <MatrixPreview matrix={matrices.find((m) => m.name === opB)!.data} />
            </div>
          )}

          {isScalar && (
            <div>
              <label className="text-[11px] text-muted-foreground">{t('linalgScalar')}</label>
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
              <label className="text-[11px] text-muted-foreground">{t('linalgPowerInt')}</label>
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
            <label className="text-[11px] text-muted-foreground">{t('linalgOperation')}</label>
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
            {t('linalgCompute')}
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
                <div className="text-[11px] text-muted-foreground mb-2">{t('linalgCalcResult')}</div>
                <div className="overflow-x-auto">
                  <FormulaRenderer latex={result.latex} displayMode fitToContainer={true} />
                </div>
                {result.steps && result.steps.length > 0 && (
                  <details className="mt-3 group">
                    <summary className="cursor-pointer inline-flex items-center gap-1.5 text-[12px] font-medium text-primary hover:text-primary/80 select-none">
                      {t('linalgDerivationSteps')} ({result.steps.length})
                    </summary>
                    <div className="mt-2 space-y-2">
                      {result.steps.map((s, i) => (
                        <div
                          key={i}
                          className="flex gap-2 items-start rounded-md border border-border/40 bg-background/40 p-2"
                        >
                          <span className="mt-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/20 text-[10px] font-medium text-primary">
                            {i + 1}
                          </span>
                          <div className="overflow-x-auto">
                            <FormulaRenderer latex={s} displayMode fitToContainer={true} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </motion.div>
            )}

            {!result && !error && (
              <div className="h-full min-h-[200px] grid place-items-center text-[11.5px] text-muted-foreground">
                {t('linalgOpsInputPrompt')}
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Matrix Norms & Properties (Task 14) — always-on section for selected matrix A */}
      <MatrixNormsSection matrix={matrixA} matrixName={opA} />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Matrix Norms & Properties section (Task 14)
 * ------------------------------------------------------------------ */
function MatrixNormsSection({
  matrix,
  matrixName,
}: {
  matrix: Matrix | undefined;
  matrixName: string;
}) {
  const norms = useMemo(() => {
    if (!matrix || matrix.length === 0) return null;
    return {
      n1: norm1(matrix),
      nInf: normInf(matrix),
      nFro: normFrobenius(matrix),
      nSpec: normSpectral(matrix),
      symmetric: isSymmetric(matrix),
      positiveDefinite: isPositiveDefinite(matrix),
      invertible: isInvertible(matrix),
      orthogonal: isOrthogonal(matrix),
    };
  }, [matrix]);

  if (!matrix || matrix.length === 0 || !norms) {
    return (
      <div className="mt-4 rounded-md border border-border/60 bg-muted/20 p-3 text-[11.5px] text-muted-foreground">
        {t('linalgNormsProps')} — {t('linalgEmpty')}
      </div>
    );
  }

  const normRows: Array<{ label: keyof TranslationDict; value: number }> = [
    { label: 'linalgNorm1', value: norms.n1 },
    { label: 'linalgNormInf', value: norms.nInf },
    { label: 'linalgNormFrobenius', value: norms.nFro },
    { label: 'linalgNormSpectral', value: norms.nSpec },
  ];

  const propRows: Array<{ label: keyof TranslationDict; value: boolean }> = [
    { label: 'linalgSymmetric', value: norms.symmetric },
    { label: 'linalgPositiveDefinite', value: norms.positiveDefinite },
    { label: 'linalgInvertible', value: norms.invertible },
    { label: 'linalgOrthogonal', value: norms.orthogonal },
  ];

  return (
    <div className="mt-4 rounded-md border border-border/60 bg-card/30 p-3">
      <div className="text-[12px] font-semibold text-foreground/80 mb-2 flex items-center gap-1.5">
        <Ruler className="size-3.5 text-primary" />
        {t('linalgNormsProps')}
        <span className="text-[10.5px] text-muted-foreground font-normal font-mono">
          ({matrixName}, {matrix.length}×{matrix[0]?.length ?? 0})
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {/* Norms */}
        <div className="space-y-1.5">
          <div className="text-[10.5px] text-muted-foreground">{t('linalgNorm1')} / {t('linalgNormInf')} / {t('linalgNormFrobenius')} / {t('linalgNormSpectral')}</div>
          {normRows.map((row) => (
            <div
              key={row.label}
              className="flex items-center justify-between gap-2 px-2 py-1 rounded border border-border/40 bg-muted/20 text-[11.5px]"
            >
              <span className="text-muted-foreground">{t(row.label)}</span>
              <span className="font-mono font-medium tabular-nums">
                {Number.isFinite(row.value) ? numToLatex(row.value) : '—'}
              </span>
            </div>
          ))}
        </div>

        {/* Properties */}
        <div className="space-y-1.5">
          <div className="text-[10.5px] text-muted-foreground">{t('linalgSymmetric')} / {t('linalgPositiveDefinite')} / {t('linalgInvertible')} / {t('linalgOrthogonal')}</div>
          {propRows.map((row) => (
            <div
              key={row.label}
              className={cn(
                'flex items-center justify-between gap-2 px-2 py-1 rounded border text-[11.5px]',
                row.value
                  ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300'
                  : 'border-rose-500/30 bg-rose-500/5 text-rose-700 dark:text-rose-300',
              )}
            >
              <span className="font-medium">{t(row.label)}</span>
              {row.value ? (
                <Check className="size-3.5" />
              ) : (
                <X className="size-3.5" />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Matrix norms & properties helpers
 * ------------------------------------------------------------------ */

/** 1-范数：最大列绝对值之和 */
function norm1(m: Matrix): number {
  if (m.length === 0) return 0;
  const cols = m[0].length;
  let max = 0;
  for (let c = 0; c < cols; c++) {
    let sum = 0;
    for (let r = 0; r < m.length; r++) sum += Math.abs(m[r][c]);
    if (sum > max) max = sum;
  }
  return max;
}

/** ∞-范数：最大行绝对值之和 */
function normInf(m: Matrix): number {
  let max = 0;
  for (const row of m) {
    let sum = 0;
    for (const v of row) sum += Math.abs(v);
    if (sum > max) max = sum;
  }
  return max;
}

/** Frobenius 范数：√(Σ aij²) */
function normFrobenius(m: Matrix): number {
  let sum = 0;
  for (const row of m) for (const v of row) sum += v * v;
  return Math.sqrt(sum);
}

/** 谱范数：A^T*A 的最大特征值的平方根（即最大奇异值） */
function normSpectral(m: Matrix): number {
  if (m.length === 0) return 0;
  const at = transpose(m);
  const ata = math.multiply(at, m) as Matrix;
  try {
    const eig = math.eigs(math.matrix(ata));
    const values = (eig as unknown as { values: { toArray: () => unknown[] } }).values.toArray();
    let max = 0;
    for (const v of values) {
      const real = Math.abs(Number(v));
      if (real > max) max = real;
    }
    return Math.sqrt(max);
  } catch {
    return NaN;
  }
}

/** 对称性：A === A^T */
function isSymmetric(m: Matrix): boolean {
  if (!isSquare(m)) return false;
  const n = m.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (Math.abs(m[i][j] - m[j][i]) > 1e-9) return false;
    }
  }
  return true;
}

/** 正定性：对称且所有特征值 > 0 */
function isPositiveDefinite(m: Matrix): boolean {
  if (!isSquare(m)) return false;
  if (!isSymmetric(m)) return false;
  try {
    const eig = math.eigs(math.matrix(m));
    const values = (eig as unknown as { values: { toArray: () => unknown[] } }).values.toArray();
    return values.every((v) => Number(v) > 1e-12);
  } catch {
    return false;
  }
}

/** 可逆性：det(A) !== 0 */
function isInvertible(m: Matrix): boolean {
  if (!isSquare(m)) return false;
  try {
    return Math.abs(math.det(m)) > 1e-12;
  } catch {
    return false;
  }
}

/** 正交性：A^T * A === I */
function isOrthogonal(m: Matrix): boolean {
  if (!isSquare(m)) return false;
  const n = m.length;
  const at = transpose(m);
  const ata = math.multiply(at, m) as Matrix;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const expected = i === j ? 1 : 0;
      if (Math.abs(ata[i][j] - expected) > 1e-9) return false;
    }
  }
  return true;
}

/* ================================================================== *
 * TAB — Vector Operations (Task 13)
 * ================================================================== */
type VectorOp = 'dot' | 'cross' | 'magnitude' | 'angle' | 'projection';

const VECTOR_OP_LABELS: Record<VectorOp, keyof TranslationDict> = {
  dot: 'linalgDotProduct',
  cross: 'linalgCrossProduct',
  magnitude: 'linalgMagnitude',
  angle: 'linalgAngle',
  projection: 'linalgProjection',
};

/** Parse a comma/space-separated list of numbers into a number[] vector. */
function parseVectorInput(text: string): number[] | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const cells = trimmed.split(/[\s,]+/).map((c) => c.trim()).filter(Boolean);
  if (cells.length === 0) return null;
  const nums = cells.map((c) => parseFloat(c));
  if (nums.some((n) => Number.isNaN(n))) return null;
  return nums;
}

function VectorOpsTab() {
  const [vecAText, setVecAText] = useState('1, 2, 3');
  const [vecBText, setVecBText] = useState('4, 5, 6');
  const [op, setOp] = useState<VectorOp>('dot');
  const [result, setResult] = useState<OpResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  // Gram-Schmidt state
  const [gsText, setGsText] = useState('1, 1, 0\n1, 0, 1\n0, 1, 1');
  const [gsResult, setGsResult] = useState<{
    vectors: number[][];
    steps: string[];
  } | null>(null);
  const [gsError, setGsError] = useState<string | null>(null);

  const needsB = op === 'dot' || op === 'cross' || op === 'angle' || op === 'projection';

  // 实时解析输入，用于操作前预览向量内容。
  const parsedA = useMemo(() => parseVectorInput(vecAText), [vecAText]);
  const parsedB = useMemo(
    () => (needsB ? parseVectorInput(vecBText) : null),
    [needsB, vecBText],
  );

  // 实时解析 Gram-Schmidt 输入，用于结果/预览前显示原始向量组。
  const parsedGsVectors = useMemo(
    () =>
      gsText
        .split(/\r?\n/)
        .map((l) => parseVectorInput(l))
        .filter((v): v is number[] => v !== null),
    [gsText],
  );

  const handleCompute = () => {
    setWorking(true);
    setError(null);
    setResult(null);
    try {
      const a = parseVectorInput(vecAText);
      if (!a || a.length === 0) {
        setError(t('linalgVectorDimMismatch') + ' (A)');
        return;
      }
      let b: number[] | null = null;
      if (needsB) {
        b = parseVectorInput(vecBText);
        if (!b || b.length === 0) {
          setError(t('linalgVectorDimMismatch') + ' (B)');
          return;
        }
        if (a.length !== b.length) {
          setError(t('linalgVectorDimMismatch'));
          return;
        }
      }

      let res: OpResult;
      switch (op) {
        case 'dot': {
          const d = math.dot(a, b as number[]) as number;
          res = {
            latex: `A \\cdot B = ${numToLatex(d)}`,
            text: `dot = ${d}`,
            isMatrix: false,
            steps: [
              `A = ${vectorToLatex(a)}, \\quad B = ${vectorToLatex(b as number[])}`,
              `A \\cdot B = \\sum_{i=1}^{n} a_i b_i = ${numToLatex(d)}`,
            ],
          };
          break;
        }
        case 'cross': {
          if (a.length !== 3 || (b as number[]).length !== 3) {
            setError(t('linalgCross3DOnly'));
            return;
          }
          const c = math.cross(a, b as number[]) as number[];
          res = {
            latex: `A \\times B = ${vectorToLatex(c)}`,
            text: `cross = [${c.join(', ')}]`,
            isMatrix: true,
            matrix: [c],
            steps: [
              `A = ${vectorToLatex(a)}, \\quad B = ${vectorToLatex(b as number[])}`,
              `A \\times B = ${vectorToLatex(c)}`,
            ],
          };
          break;
        }
        case 'magnitude': {
          const mag = Math.sqrt(a.reduce((s, x) => s + x * x, 0));
          res = {
            latex: `\\lVert A \\rVert = ${numToLatex(mag)}`,
            text: `|A| = ${mag}`,
            isMatrix: false,
            steps: [
              `A = ${vectorToLatex(a)}`,
              `\\lVert A \\rVert = \\sqrt{\\sum_{i=1}^{n} a_i^2} = ${numToLatex(mag)}`,
            ],
          };
          break;
        }
        case 'angle': {
          const d = math.dot(a, b as number[]) as number;
          const magA = Math.sqrt(a.reduce((s, x) => s + x * x, 0));
          const magB = Math.sqrt((b as number[]).reduce((s, x) => s + x * x, 0));
          if (magA < 1e-12 || magB < 1e-12) {
            setError(t('linalgVectorDimMismatch'));
            return;
          }
          const cos = Math.max(-1, Math.min(1, d / (magA * magB)));
          const angleRad = Math.acos(cos);
          const angleDeg = (angleRad * 180) / Math.PI;
          res = {
            latex: `\\theta = \\arccos\\left(\\frac{A \\cdot B}{\\lVert A \\rVert \\lVert B \\rVert}\\right) = ${numToLatex(angleDeg)}^{\\circ}`,
            text: `angle = ${angleDeg}°`,
            isMatrix: false,
            steps: [
              `A \\cdot B = ${numToLatex(d)}`,
              `\\lVert A \\rVert = ${numToLatex(magA)}, \\quad \\lVert B \\rVert = ${numToLatex(magB)}`,
              `\\cos\\theta = ${numToLatex(cos)} \\Rightarrow \\theta = ${numToLatex(angleDeg)}^{\\circ}`,
            ],
          };
          break;
        }
        case 'projection': {
          const bb = b as number[];
          const dotAB = math.dot(a, bb) as number;
          const dotBB = bb.reduce((s, x) => s + x * x, 0);
          if (Math.abs(dotBB) < 1e-12) {
            setError(t('linalgVectorDimMismatch') + ' (B = 0)');
            return;
          }
          const coef = dotAB / dotBB;
          const proj = bb.map((x) => coef * x);
          res = {
            latex: `\\operatorname{proj}_{B}(A) = ${vectorToLatex(proj)}`,
            text: `proj = [${proj.join(', ')}]`,
            isMatrix: true,
            matrix: [proj],
            steps: [
              `A \\cdot B = ${numToLatex(dotAB)}, \\quad B \\cdot B = ${numToLatex(dotBB)}`,
              `\\operatorname{proj}_{B}(A) = \\frac{A \\cdot B}{B \\cdot B} B = ${numToLatex(coef)} \\cdot ${vectorToLatex(bb)}`,
              `\\operatorname{proj}_{B}(A) = ${vectorToLatex(proj)}`,
            ],
          };
          break;
        }
        default:
          setError(t('linalgError'));
          return;
      }
      setResult(res);
    } catch (err) {
      setError((err as Error).message || t('linalgError'));
    } finally {
      setWorking(false);
    }
  };

  const handleGramSchmidt = () => {
    setGsError(null);
    setGsResult(null);
    try {
      const lines = gsText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      if (lines.length === 0) {
        setGsError(t('linalgVectorDimMismatch'));
        return;
      }
      const vectors: number[][] = [];
      let dim = -1;
      for (const line of lines) {
        const v = parseVectorInput(line);
        if (!v) {
          setGsError(t('linalgVectorDimMismatch'));
          return;
        }
        if (dim === -1) dim = v.length;
        else if (v.length !== dim) {
          setGsError(t('linalgVectorDimMismatch'));
          return;
        }
        vectors.push(v);
      }
      const { orthogonal, steps } = gramSchmidt(vectors);
      setGsResult({ vectors: orthogonal, steps });
    } catch (err) {
      setGsError((err as Error).message || t('linalgError'));
    }
  };

  // —— 可视化预览用向量 ——
  // 向量运算：A / B / 结果（结果为向量时）。
  const vectorPreviewVectors: { v: number[]; color?: string; label?: string }[] = [];
  if (parsedA) vectorPreviewVectors.push({ v: parsedA, color: '#2dd4bf', label: 'A' });
  if (needsB && parsedB) vectorPreviewVectors.push({ v: parsedB, color: '#f59e0b', label: 'B' });
  if (result?.matrix && result.matrix.length === 1) {
    vectorPreviewVectors.push({ v: result.matrix[0], color: '#a78bfa', label: '结果' });
  }

  // Gram-Schmidt：原始向量组（青色系）+ 正交化基（红色系）。
  const gsOriginColors = ['#2dd4bf', '#f59e0b', '#a78bfa', '#22c55e'];
  const gsOrthColors = ['#ef4444', '#3b82f6', '#10b981', '#f43f5e'];
  const gsPreviewVectors: { v: number[]; color?: string; label?: string }[] = [];
  parsedGsVectors.forEach((v, i) => {
    gsPreviewVectors.push({ v, color: gsOriginColors[i % gsOriginColors.length], label: `v${i + 1}` });
  });
  gsResult?.vectors.forEach((v, i) => {
    gsPreviewVectors.push({
      v,
      color: gsOrthColors[i % gsOrthColors.length],
      label: `q${i + 1}${'\u2020'}`,
    });
  });
  const gsDim: 2 | 3 = parsedGsVectors.some((v) => v.length >= 3) ? 3 : 2;

  return (
    <div className="h-full overflow-auto">
      <div className="grid grid-cols-[minmax(0,340px)_minmax(0,1fr)] gap-5 p-2">
        {/* Left: vector ops（收窄向量组输入区） */}
        <div className="space-y-3">
          <div className="text-[12px] font-semibold text-foreground/80 flex items-center gap-1.5">
            <ArrowRight className="size-3.5 text-primary" />
            {t('linalgTabVector')}
          </div>

          <div>
            <label className="text-[11px] text-muted-foreground">
              {t('linalgVectorA')} ({t('linalgVectorInputHint')})
            </label>
            <Input
              value={vecAText}
              onChange={(e) => setVecAText(e.target.value)}
              className="h-8 text-[12px] font-mono mt-1"
              placeholder="1, 2, 3"
            />
          </div>

          {/* 向量 A 实时预览 */}
          {parsedA && parsedA.length > 0 ? (
            <div className="rounded-md border border-border/40 bg-muted/20 p-2">
              <div className="text-[11px] text-muted-foreground mb-1.5 font-mono">A =</div>
              <MatrixPreview matrix={parsedA.map((v) => [v])} />
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-border/40 bg-transparent p-2 text-[11px] text-muted-foreground">
              {t('linalgVectorEmpty')}
            </div>
          )}

          {needsB && (
            <div>
              <label className="text-[11px] text-muted-foreground">
                {t('linalgVectorB')} ({t('linalgVectorInputHint')})
              </label>
              <Input
                value={vecBText}
                onChange={(e) => setVecBText(e.target.value)}
                className="h-8 text-[12px] font-mono mt-1"
                placeholder="4, 5, 6"
              />
            </div>
          )}

          {/* 向量 B 实时预览 */}
          {needsB &&
            (parsedB && parsedB.length > 0 ? (
              <div className="rounded-md border border-border/40 bg-muted/20 p-2">
                <div className="text-[11px] text-muted-foreground mb-1.5 font-mono">B =</div>
                <MatrixPreview matrix={parsedB.map((v) => [v])} />
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-border/40 bg-transparent p-2 text-[11px] text-muted-foreground">
                {t('linalgVectorEmpty')}
              </div>
            ))}

          <div>
            <label className="text-[11px] text-muted-foreground">{t('linalgOperation')}</label>
            <Select value={op} onValueChange={(v) => setOp(v as VectorOp)}>
              <SelectTrigger className="h-8 text-[12px] mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(VECTOR_OP_LABELS) as VectorOp[]).map((k) => (
                  <SelectItem key={k} value={k} className="text-[12px]">
                    {t(VECTOR_OP_LABELS[k])}
                  </SelectItem>
                ))}
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
            {t('linalgCompute')}
          </Button>

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
                className="rounded-md border border-primary/30 bg-primary/5 p-3 glow-card-teal"
              >
                <div className="text-[11px] text-muted-foreground mb-2">{t('linalgResult')}</div>
                <div className="overflow-x-auto">
                  <FormulaRenderer latex={result.latex} displayMode fitToContainer={true} />
                </div>
                {result.steps && result.steps.length > 0 && (
                  <details className="mt-3 group">
                    <summary className="cursor-pointer text-[11px] text-muted-foreground hover:text-foreground select-none">
                      {t('linalgSteps')} ({result.steps.length})
                    </summary>
                    <div className="mt-2 space-y-1.5 overflow-x-auto">
                      {result.steps.map((s, i) => (
                        <div key={i} className="text-[11.5px] text-foreground/80">
                          <FormulaRenderer latex={s} displayMode fitToContainer={true} />
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Right: 可视化预览 + Gram-Schmidt */}
        <div className="space-y-3">
          {/* 向量运算可视化 */}
          <div>
            <div className="text-[11px] text-muted-foreground mb-1.5 flex items-center gap-1.5">
              <Activity className="size-3.5" /> {t('linalgVectorVisual')}
            </div>
            <VectorPreviewCanvas
              vectors={vectorPreviewVectors}
              dim={parsedA && parsedA.length >= 3 ? 3 : needsB && parsedB && parsedB.length >= 3 ? 3 : 2}
              height={220}
              emptyText={t('linalgVectorVisualEmpty')}
            />
          </div>

          {/* Gram-Schmidt */}
          <div className="space-y-3">
            <div className="text-[12px] font-semibold text-foreground/80 flex items-center gap-1.5">
              <Ruler className="size-3.5 text-primary" />
              {t('linalgGramSchmidt')}
            </div>

            <div>
              <label className="text-[11px] text-muted-foreground">
                {t('linalgGramSchmidtHint')}
              </label>
              <textarea
                value={gsText}
                onChange={(e) => setGsText(e.target.value)}
                className={cn(
                  'min-h-[88px] w-full p-2.5 text-[12px] font-mono mt-1',
                  'bg-muted/40 border border-border/60 rounded-md',
                  'focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/40',
                  'resize-y',
                )}
                placeholder={'1, 1, 0\n1, 0, 1\n0, 1, 1'}
              />
            </div>

            <Button
              onClick={handleGramSchmidt}
              className="w-full h-9 text-[12px] gap-1.5"
              size="sm"
            >
              <Ruler className="size-4" />
              {t('linalgGramSchmidt')}
            </Button>

            {/* Gram-Schmidt 可视化：原始向量组 + 正交化基 */}
            {parsedGsVectors.length > 0 && (
              <div>
                <div className="text-[11px] text-muted-foreground mb-1.5 flex items-center gap-1.5">
                  <Ruler className="size-3.5" /> {t('linalgOrthogonalizedVisual')}
                </div>
                <VectorPreviewCanvas
                  vectors={gsPreviewVectors}
                  dim={gsDim}
                  height={220}
                  emptyText={t('linalgVectorVisualEmpty')}
                />
              </div>
            )}

            <AnimatePresence mode="wait">
              {gsError && (
                <motion.div
                  key="gs-err"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="rounded-md border border-rose-500/40 bg-rose-500/10 p-3 text-[12px] text-rose-600 dark:text-rose-300"
                >
                  <div className="flex items-start gap-1.5">
                    <X className="size-4 mt-0.5 shrink-0" />
                    <span>{gsError}</span>
                  </div>
                </motion.div>
              )}

              {gsResult && !gsError && (
                <motion.div
                  key="gs-res"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="rounded-md border border-primary/30 bg-primary/5 p-3 glow-card-teal space-y-2"
                >
                  <div className="text-[11px] text-muted-foreground">{t('linalgOrthogonalized')}</div>
                  {gsResult.vectors.map((v, i) => (
                    <div key={i} className="overflow-x-auto">
                      <FormulaRenderer
                        latex={`q_{${i + 1}} = ${vectorToLatex(v)}`}
                        displayMode
                        fitToContainer={true}
                      />
                    </div>
                  ))}
                  {gsResult.steps.length > 0 && (
                    <details className="mt-2 group">
                      <summary className="cursor-pointer text-[11px] text-muted-foreground hover:text-foreground select-none">
                        {t('linalgGramSchmidtSteps')} ({gsResult.steps.length})
                      </summary>
                      <div className="mt-2 space-y-1.5 overflow-x-auto">
                        {gsResult.steps.map((s, i) => (
                          <div key={i} className="text-[11.5px] text-foreground/80">
                            <FormulaRenderer latex={s} displayMode fitToContainer={true} />
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Gram-Schmidt orthogonalization with per-step LaTeX recording. */
function gramSchmidt(vectors: number[][]): { orthogonal: number[][]; steps: string[] } {
  const steps: string[] = [];
  const orthogonal: number[][] = [];
  for (let i = 0; i < vectors.length; i++) {
    const v = [...vectors[i]];
    let q = v;
    for (let j = 0; j < orthogonal.length; j++) {
      const qj = orthogonal[j];
      const dot = qj.reduce((s, x, k) => s + x * v[k], 0);
      const normSq = qj.reduce((s, x) => s + x * x, 0);
      if (Math.abs(normSq) < 1e-12) continue;
      q = q.map((x, k) => x - (dot / normSq) * qj[k]);
      steps.push(
        `v_{${i + 1}} \\leftarrow v_{${i + 1}} - \\frac{v_{${i + 1}} \\cdot q_{${j + 1}}}{q_{${j + 1}} \\cdot q_{${j + 1}}} q_{${j + 1}} = ${vectorToLatex(q)}`,
      );
    }
    const norm = Math.sqrt(q.reduce((s, x) => s + x * x, 0));
    let unit: number[];
    if (norm < 1e-12) {
      // Linearly dependent — keep zero vector (won't be normalized)
      unit = q.map(() => 0);
      steps.push(`\\lVert v_{${i + 1}} \\rVert = 0 \\Rightarrow \\text{${t('linalgLinearlyDependent')}}`);
    } else {
      unit = q.map((x) => x / norm);
      steps.push(
        `q_{${i + 1}} = \\frac{v_{${i + 1}}}{\\lVert v_{${i + 1}} \\rVert} = ${vectorToLatex(unit)}`,
      );
    }
    orthogonal.push(unit);
  }
  return { orthogonal, steps };
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
        setError(t('linalgMatrixEmpty'));
        return;
      }
      if (!isSquare(matrix)) {
        setError(t('linalgNeedSquare'));
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
              label: t('linalgEigenvalues'),
              latex: `\\begin{bmatrix} ${values.map((v) => numToLatex(Number(v))).join(' \\\\ ')} \\end{bmatrix}`,
            },
          ];
          for (let i = 0; i < vectors.length; i++) {
            const ev = vectors[i];
            const vec = toColumnMatrix(ev.vector);
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
            note: t('linalgCholeskyNote'),
          };
          break;
        }
        case 'svd': {
          toast.warning(t('linalgSvdNotSupported'));
          res = {
            parts: [],
            note: t('linalgSvdNotSupportedNote'),
          };
          break;
        }
        default:
          setError(t('linalgNotSupportedShort'));
          return;
      }
      setResult(res);
    } catch (err) {
      setError((err as Error).message || t('linalgCalcError'));
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="h-full overflow-auto">
      <div className="grid grid-cols-[320px_1fr] gap-5 p-2">
        <div className="space-y-3">
          <div>
            <label className="text-[11px] text-muted-foreground">{t('linalgMatrixLabel')}</label>
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

          {/* 选中矩阵 A 的实时预览（与「运算」tab 一致，便于分解前确认输入） */}
          {matrix && (
            <div className="rounded-md border border-border/40 bg-muted/20 p-2">
              <div className="text-[11px] text-muted-foreground mb-1.5 font-mono">
                {matrixName} =
              </div>
              <MatrixPreview matrix={matrix} />
            </div>
          )}

          <div>
            <label className="text-[11px] text-muted-foreground">{t('linalgDecompType')}</label>
            <Select value={decompKind} onValueChange={(v) => setDecompKind(v as DecompKind)}>
              <SelectTrigger className="h-8 text-[12px] mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="lu" className="text-[12px]">{t('linalgLu')}</SelectItem>
                <SelectItem value="qr" className="text-[12px]">{t('linalgQr')}</SelectItem>
                <SelectItem value="eigen" className="text-[12px]">{t('linalgEigenDecomp')}</SelectItem>
                <SelectItem value="cholesky" className="text-[12px]">{t('linalgCholesky')}</SelectItem>
                <SelectItem value="svd" className="text-[12px]">{t('linalgSvdNotSupportedItem')}</SelectItem>
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
            {t('linalgDecompose')}
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 auto-rows-min">
                  {result.parts.map((part, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.04 }}
                      className="rounded-md border border-border/60 bg-muted/30 p-3 flex flex-col"
                    >
                      <div className="text-[11px] text-muted-foreground mb-1.5">
                        <FormulaRenderer latex={part.label} displayMode fitToContainer={true} />
                      </div>
                      <div className="overflow-x-auto">
                        <FormulaRenderer latex={part.latex} displayMode fitToContainer={true} />
                      </div>
                    </motion.div>
                  ))}
                </div>
                {result.parts.length === 0 && (
                  <div
                    className="rounded-md border p-3 text-[12px]"
                    style={{
                      borderColor: 'color-mix(in oklab, var(--primary) 30%, transparent)',
                      backgroundColor: 'color-mix(in oklab, var(--primary) 10%, transparent)',
                      color: 'var(--primary)',
                    }}
                  >
                    {result.note || t('linalgNotSupportedShort')}
                  </div>
                )}
              </motion.div>
            )}

            {!result && !error && (
              <div className="h-full min-h-[200px] grid place-items-center text-[11.5px] text-muted-foreground">
                {t('linalgDecompInputPrompt')}
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
        throw new Error(t('linalgCholeskyNotSymmetric'));
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
        if (v <= 0) throw new Error(t('linalgCholeskyNotPosDef'));
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
function LinearSystemTab({
  matrices,
  selected,
}: {
  matrices: MatrixEntry[];
  selected: MatrixEntry | undefined;
}) {
  const [matrix, setMatrix] = useState<Matrix>(
    selected?.data ?? [[1, 1, 1], [0, 2, 5], [2, 5, -1]],
  );
  const [vector, setVector] = useState<number[]>([6, -4, 27]);
  const [solution, setSolution] = useState<SystemSolution | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  // 同步「编辑」tab 中当前选中的矩阵，使方程组不再是一个孤立矩阵：
  // 切换主矩阵时，以该矩阵为系数矩阵并重置常数向量 b 的维度。
  useEffect(() => {
    if (selected?.data && selected.data.length > 0) {
      setMatrix(selected.data);
      setVector(Array(selected.data.length).fill(0));
      setSolution(null);
      setError(null);
    }
  }, [selected?.name, selected?.data]);

  // 从可用矩阵列表中显式选择系数矩阵（维度适配）。
  const loadMatrix = (name: string) => {
    const entry = matrices.find((m) => m.name === name);
    if (!entry) return;
    setMatrix(entry.data);
    setVector(Array(entry.data.length).fill(0));
    setSolution(null);
    setError(null);
  };

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
        setError(t('linalgConstVecSizeMismatch'));
        return;
      }
      const sol = solveLinearSystem(matrix, vector);
      sol.augmentedLatex = augmentedLatex;
      setSolution(sol);
    } catch (err) {
      setError((err as Error).message || t('linalgSolveError'));
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="h-full overflow-auto">
      <div className="grid grid-cols-[auto_1fr] gap-5 p-2">
        {/* 系数矩阵 + b */}
        <div className="space-y-3">
          {/* 从已定义矩阵中选择系数矩阵（不再孤立，可直接复用矩阵 A/B/C…） */}
          <div>
            <label className="text-[11px] text-muted-foreground">{t('linalgMatrixLabel')}</label>
            <Select value={selected?.name ?? ''} onValueChange={loadMatrix}>
              <SelectTrigger className="h-8 text-[12px] mt-1">
                <SelectValue placeholder={t('linalgMatrixLabel')} />
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
          <div className="flex items-center justify-between">
            <label className="text-[11px] text-muted-foreground">{t('linalgAugmented')}</label>
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
            {t('linalgSolveAxb')}
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
                <div className="rounded-md border border-border/60 bg-muted/30 p-3 overflow-x-auto min-w-[240px]">
                  <div className="text-[11px] text-muted-foreground mb-1.5">
                    {t('linalgAugmented')}
                  </div>
                  <FormulaRenderer latex={solution.augmentedLatex} displayMode fitToContainer={true} />
                </div>

                {/* System type badge: 齐次 / 非齐次 + solution kind */}
                <div className="flex flex-wrap items-center gap-2">
                  <div
                    className="rounded-md border px-2.5 py-1.5 text-[11.5px] font-medium"
                    style={
                      solution.isHomogeneous
                        ? {
                            borderColor: 'color-mix(in oklab, var(--primary) 40%, transparent)',
                            backgroundColor: 'color-mix(in oklab, var(--primary) 10%, transparent)',
                            color: 'var(--primary)',
                          }
                        : {
                            borderColor: 'color-mix(in oklab, var(--accent, var(--primary)) 40%, transparent)',
                            backgroundColor: 'color-mix(in oklab, var(--accent, var(--primary)) 10%, transparent)',
                            color: 'var(--accent-foreground, var(--primary))',
                          }
                    }
                  >
                    {solution.isHomogeneous
                      ? t('linalgHomogeneousSystem')
                      : t('linalgNonHomogeneousSystem')}
                  </div>
                  <div
                    className="rounded-md border px-2.5 py-1.5 text-[11.5px] font-medium"
                    style={
                      solution.kind === 'unique'
                        ? {
                            borderColor: 'color-mix(in oklab, var(--success, #10b981) 30%, transparent)',
                            backgroundColor: 'color-mix(in oklab, var(--success, #10b981) 10%, transparent)',
                            color: 'var(--success, #10b981)',
                          }
                        : solution.kind === 'none'
                          ? {
                              borderColor: 'color-mix(in oklab, var(--destructive, #ef4444) 40%, transparent)',
                              backgroundColor: 'color-mix(in oklab, var(--destructive, #ef4444) 10%, transparent)',
                              color: 'var(--destructive, #ef4444)',
                            }
                          : {
                              borderColor: 'color-mix(in oklab, var(--primary) 40%, transparent)',
                              backgroundColor: 'color-mix(in oklab, var(--primary) 10%, transparent)',
                              color: 'var(--primary)',
                            }
                    }
                  >
                    {solution.kind === 'unique' && t('linalgUniqueSolution')}
                    {solution.kind === 'none' && t('linalgNoSolution')}
                    {solution.kind === 'infinite' && t('linalgInfiniteSolution')}
                  </div>
                </div>

                {solution.rankA !== undefined && solution.rankAug !== undefined && (
                  <div className="text-[11px] text-muted-foreground bg-muted/30 border border-border/40 rounded px-2.5 py-1.5 font-mono">
                    {tf('linalgRankInfo', { rankA: solution.rankA, rankAug: solution.rankAug })}
                    {solution.nUnknowns !== undefined && (
                      <>{tf('linalgUnknownsInfo', { n: solution.nUnknowns })}</>
                    )}
                    {solution.kind === 'infinite' &&
                      solution.nUnknowns !== undefined &&
                      solution.rankA !== undefined &&
                      tf('linalgFreeVarsCount', { n: solution.nUnknowns - solution.rankA })}
                  </div>
                )}

                {/* Free variable identification */}
                {solution.kind === 'infinite' &&
                  solution.freeCols &&
                  solution.freeCols.length > 0 && (
                    <div className="text-[11px] text-amber-700 dark:text-amber-300 bg-amber-500/5 border border-amber-500/30 rounded px-2.5 py-1.5">
                      <span className="font-medium">{t('linalgFreeVarsColon')}</span>
                      <span className="font-mono">
                        {' '}
                        {solution.freeCols.map((c) => `x_{${c + 1}}`).join(', ')}
                      </span>
                      <span className="text-muted-foreground">
                        {' '}
                        {tf('linalgCountItems', { n: solution.freeCols.length })}
                      </span>
                    </div>
                  )}

                <div className="rounded-md border border-primary/30 bg-primary/5 p-3 glow-card-teal overflow-x-auto min-w-[240px]">
                  <div className="text-[11px] text-muted-foreground mb-1.5">
                    {solution.kind === 'infinite'
                      ? t('linalgGeneralSolution')
                      : t('linalgResult')}
                  </div>
                  <FormulaRenderer latex={solution.latex} displayMode fitToContainer={true} />
                </div>

                {solution.steps && solution.steps.length > 0 && (
                  <details className="group">
                    <summary className="cursor-pointer inline-flex items-center gap-1.5 text-[12px] font-medium text-primary hover:text-primary/80 select-none">
                      {t('linalgDerivationSteps')} ({solution.steps.length})
                    </summary>
                    <div className="mt-2 space-y-2">
                      {solution.steps.map((s, i) => (
                        <div
                          key={i}
                          className="flex gap-2 items-start rounded-md border border-border/40 bg-background/40 p-2"
                        >
                          <span className="mt-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/20 text-[10px] font-medium text-primary">
                            {i + 1}
                          </span>
                          <div className="overflow-x-auto">
                            <FormulaRenderer latex={s} displayMode fitToContainer={true} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </details>
                )}

                {/* Infinite: split into 特解 + 基础解系 */}
                {solution.kind === 'infinite' &&
                  solution.particular &&
                  solution.nullBasis &&
                  solution.nullBasis.length > 0 && (
                    <div className="space-y-2">
                      {/* For homogeneous systems the particular solution is the zero vector,
                          so we hide it and just show the fundamental solution system. */}
                      {!solution.isHomogeneous && (
                        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2.5 overflow-x-auto">
                          <div className="text-[11px] text-emerald-700 dark:text-emerald-300 mb-1 font-medium">
                            {t('linalgParticularSolution')} η*
                          </div>
                          <FormulaRenderer
                            latex={'\\eta^* = ' + vectorToLatex(solution.particular)}
                            displayMode
                            fitToContainer={true}
                          />
                        </div>
                      )}
                      <div className="rounded-md border border-violet-500/30 bg-violet-500/5 p-2.5 overflow-x-auto">
                        <div className="text-[11px] text-violet-700 dark:text-violet-300 mb-1 font-medium">
                          {t('linalgFundamentalSystem')}
                          {solution.isHomogeneous && ` (${t('linalgHomogeneousSystem')})`}
                        </div>
                        {solution.nullBasis.map((v, i) => (
                          <div key={i} className="mb-1 last:mb-0">
                            <FormulaRenderer
                              latex={`\\xi_{${i + 1}} = ` + vectorToLatex(v)}
                              displayMode
                              fitToContainer={true}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
              </motion.div>
            )}

            {!solution && !error && (
              <div className="h-full min-h-[200px] grid place-items-center text-[11.5px] text-muted-foreground">
                {t('linalgSystemInputPrompt')}
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

  const steps: string[] = [];
  const augLatex = (m: number[][]) => {
    const r = m.map((row) => {
      const left = row.slice(0, cols).map(numToLatex).join(' & ');
      const right = numToLatex(row[cols]);
      return `${left} & \\big| & ${right}`;
    });
    return `\\left[\\begin{array}{${'c'.repeat(cols)}|c} ${r.join(' \\\\ ')} \\end{array}\\right]`;
  };

  steps.push(`[A \\mid b] = ${augLatex(aug)}`);

  let pivotRow = 0;
  const eps = 1e-10;
  const rowOps: string[] = [];
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
    if (maxIdx !== pivotRow) {
      [aug[maxIdx], aug[pivotRow]] = [aug[pivotRow], aug[maxIdx]];
      rowOps.push(`R_{${pivotRow + 1}} \\leftrightarrow R_{${maxIdx + 1}}`);
    }
    const pv = aug[pivotRow][c];
    if (Math.abs(pv) > eps) {
      for (let k = c; k <= cols; k++) aug[pivotRow][k] /= pv;
    }
    for (let r = 0; r < rows; r++) {
      if (r === pivotRow) continue;
      const factor = aug[r][c];
      if (Math.abs(factor) > eps) {
        for (let k = c; k <= cols; k++) aug[r][k] -= factor * aug[pivotRow][k];
        rowOps.push(`R_{${r + 1}} \\to R_{${r + 1}} - ${numToLatex(factor)} R_{${pivotRow + 1}}`);
      }
    }
    pivotRow++;
  }

  // Keep the step list concise: at most a few representative row operations.
  const maxOps = 4;
  for (let i = 0; i < Math.min(rowOps.length, maxOps); i++) {
    steps.push(rowOps[i]);
  }
  if (rowOps.length > maxOps) {
    steps.push(`\\ldots \\; (\\text{${tf('linalgOmittedSteps', { n: rowOps.length - maxOps })}})`);
  }
  steps.push(`\\text{${t('linalgRowReduced')}} ${augLatex(aug)}`);

  const rankA = matrixRank(A);
  const augMat: Matrix = A.map((row, i) => [...row, b[i] ?? 0]);
  const rankAug = matrixRank(augMat);

  // Homogeneous detection: all b values are zero
  const isHomogeneous = b.every((v) => Math.abs(v) < eps);

  if (rankA < rankAug) {
    steps.push(`\\operatorname{rank}(A) = ${rankA} < \\operatorname{rank}([A \\mid b]) = ${rankAug} \\Rightarrow \\text{${t('linalgSystemNoSolution')}}`);
    return {
      kind: 'none',
      latex: `\\text{${t('linalgSystemNoSolution')}}`,
      rankA,
      rankAug,
      nUnknowns: cols,
      augmentedLatex: '',
      isHomogeneous,
      steps,
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
    steps.push(`\\text{${t('linalgBackSubstitution')}} x = ${vectorToLatex(x)}`);
    return {
      kind: 'unique',
      latex: 'x = ' + vectorToLatex(x),
      vector: x,
      rankA,
      rankAug,
      nUnknowns: cols,
      augmentedLatex: '',
      pivotCols,
      freeCols,
      isHomogeneous,
      steps,
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
  steps.push(`\\text{${t('linalgFreeVarsLatex')}} ${freeCols.map((c) => `x_{${c + 1}}`).join(', ')}`);
  steps.push(`\\text{${t('linalgGeneralSolutionLatex')}} x = ${terms.join(' ')}`);
  return {
    kind: 'infinite',
    latex: 'x = ' + terms.join(' '),
    particular,
    nullBasis,
    pivotCols,
    freeCols,
    rankA,
    rankAug,
    nUnknowns: cols,
    augmentedLatex: '',
    isHomogeneous,
    steps,
  };
}
