'use client';

/**
 * 矩阵实验室 —— 线性代数的紧凑视图。
 * 一个矩阵 → 五个运算 → 结果卡片；完整工作台按需动态加载。
 */

import { useState } from 'react';
import dynamic from 'next/dynamic';
import {
  ArrowLeft,
  Calculator,
  Grid3x3,
  Maximize2,
  Minus,
  Plus,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { math } from '@/lib/engine/mathInstance';
import { matrixRank } from '@/lib/engine/matrixCore';
import { useLocale } from '@/lib/i18n';
import { cn } from '@/lib/utils';

const AdvancedLinalg = dynamic(
  () =>
    import('../panels/LinearAlgebraWorkbench').then((m) => ({
      default: m.LinearAlgebraWorkbench,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="grid h-full place-items-center text-xs text-muted-foreground">
        加载完整工作台…
      </div>
    ),
  },
);

type Op = 'det' | 'transpose' | 'inv' | 'rank' | 'eigs';

interface ResultCard {
  id: string;
  title: string;
  value: string;
  matrix?: number[][];
  error?: boolean;
}

const COPY = {
  'zh-CN': {
    title: '线性代数 · 矩阵实验室',
    subtitle: '一个矩阵、五个常用运算。需要完整工作台时再展开。',
    advanced: '完整工作台',
    back: '返回紧凑视图',
    matrix: '矩阵 A',
    operations: '运算',
    results: '结果',
    empty: '点一个运算，结果会出现在这里。',
    invalid: '矩阵里有非法数字，请先修正。',
    addRow: '加行',
    removeRow: '减行',
    addCol: '加列',
    removeCol: '减列',
    identity: '单位阵',
    random: '随机',
    clear: '清零',
    det: '行列式',
    transpose: '转置',
    inv: '逆矩阵',
    rank: '秩',
    eigs: '特征值',
  },
  en: {
    title: 'Linear Algebra · Matrix Lab',
    subtitle: 'One matrix, five core operations. Expand only when you need the full workbench.',
    advanced: 'Full Workbench',
    back: 'Back to Compact',
    matrix: 'Matrix A',
    operations: 'Operations',
    results: 'Results',
    empty: 'Run an operation and the result will appear here.',
    invalid: 'The matrix contains invalid numbers.',
    addRow: 'Add row',
    removeRow: 'Remove row',
    addCol: 'Add column',
    removeCol: 'Remove column',
    identity: 'Identity',
    random: 'Random',
    clear: 'Clear',
    det: 'Determinant',
    transpose: 'Transpose',
    inv: 'Inverse',
    rank: 'Rank',
    eigs: 'Eigenvalues',
  },
};

function makeMatrix(rows: number, cols: number): string[][] {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => '0'));
}

function resizeMatrix(cells: string[][], rows: number, cols: number): string[][] {
  return Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => cells[r]?.[c] ?? '0'),
  );
}

function identityCells(n: number): string[][] {
  return Array.from({ length: n }, (_, r) =>
    Array.from({ length: n }, (_, c) => (r === c ? '1' : '0')),
  );
}

function randomCells(rows: number, cols: number): string[][] {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => String(Math.floor(Math.random() * 19) - 9)),
  );
}

function parseMatrix(cells: string[][]): number[][] | null {
  const out: number[][] = [];
  for (const row of cells) {
    const clean: number[] = [];
    for (const cell of row) {
      const n = Number(cell);
      if (!Number.isFinite(n)) return null;
      clean.push(Object.is(n, -0) ? 0 : n);
    }
    out.push(clean);
  }
  return out;
}

function fmt(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  if (Object.is(n, -0)) return '0';
  const abs = Math.abs(n);
  if (abs !== 0 && (abs < 1e-6 || abs >= 1e6)) return n.toExponential(4);
  return String(Number(n.toPrecision(8)));
}

function fmtValue(v: unknown): string {
  if (typeof v === 'number') return fmt(v);
  if (v && typeof v === 'object' && 're' in (v as Record<string, unknown>)) {
    const c = v as { re: number; im: number };
    return `${fmt(c.re)}${c.im >= 0 ? '+' : '-'}${fmt(Math.abs(c.im))}i`;
  }
  return String(v);
}

function MatrixGrid({ matrix }: { matrix: number[][] }) {
  const cols = Math.max(1, matrix[0]?.length ?? 1);
  return (
    <div className="mt-2 inline-grid gap-1" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {matrix.flatMap((row, r) =>
        row.map((v, c) => (
          <span
            key={`${r}-${c}`}
            className="rounded bg-muted/40 px-2 py-1 text-center font-mono text-[11px] tabular-nums text-foreground/90"
          >
            {fmt(v)}
          </span>
        )),
      )}
    </div>
  );
}

export function LinalgStudio() {
  const locale = useLocale();
  const copy = COPY[locale] ?? COPY['zh-CN'];
  const [cells, setCells] = useState<string[][]>(() => identityCells(3));
  const [results, setResults] = useState<ResultCard[]>([]);
  const [advanced, setAdvanced] = useState(false);

  const rows = cells.length;
  const cols = cells[0]?.length ?? 1;

  const addResult = (card: Omit<ResultCard, 'id'>) => {
    setResults((prev) =>
      [{ ...card, id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}` }, ...prev].slice(0, 6),
    );
  };

  const run = (op: Op) => {
    const m = parseMatrix(cells);
    if (!m) {
      addResult({ title: copy.title, value: copy.invalid, error: true });
      return;
    }
    try {
      switch (op) {
        case 'det':
          addResult({ title: 'det(A)', value: fmt(math.det(m)) });
          break;
        case 'transpose': {
          const t = math.transpose(m) as unknown as { toArray: () => number[][] };
          addResult({ title: 'Aᵀ', value: '', matrix: t.toArray() });
          break;
        }
        case 'inv': {
          const inv = math.inv(m) as unknown as { toArray: () => number[][] };
          addResult({ title: 'A⁻¹', value: '', matrix: inv.toArray() });
          break;
        }
        case 'rank':
          addResult({ title: 'rank(A)', value: String(matrixRank(m)) });
          break;
        case 'eigs': {
          const e = math.eigs(m) as unknown as { values: unknown };
          const raw = e.values;
          const values = Array.isArray(raw)
            ? raw
            : raw && typeof raw === 'object' && 'toArray' in raw
              ? (raw as { toArray: () => unknown[] }).toArray()
              : [raw];
          addResult({ title: 'eigenvalues', value: values.map(fmtValue).join(', ') });
          break;
        }
      }
    } catch (err) {
      addResult({ title: 'error', value: (err as Error)?.message || 'failed', error: true });
    }
  };

  if (advanced) {
    return (
      <div className="flex h-full w-full flex-col bg-background">
        <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border/60 bg-card/40 px-3">
          <button
            type="button"
            onClick={() => setAdvanced(false)}
            className="inline-flex h-6 items-center gap-1 rounded px-2 text-[10px] text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
          >
            <ArrowLeft className="size-3" />
            {copy.back}
          </button>
          <span className="text-[10px] text-muted-foreground">{copy.advanced}</span>
        </div>
        <div className="min-h-0 flex-1">
          <AdvancedLinalg />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-auto bg-background/40">
      <div className="mx-auto flex max-w-4xl flex-col gap-4 p-4">
        <header className="flex flex-wrap items-start gap-3">
          <div className="grid size-10 place-items-center rounded-xl bg-cyan-500/10 text-cyan-500">
            <Grid3x3 className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-base font-semibold text-foreground">{copy.title}</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">{copy.subtitle}</p>
          </div>
          <button
            type="button"
            onClick={() => setAdvanced(true)}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/60 bg-background px-3 text-xs text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
          >
            <Maximize2 className="size-3.5" />
            {copy.advanced}
          </button>
        </header>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section className="rounded-2xl border border-border/60 bg-card/40 p-3">
            <div className="flex items-center justify-between">
              <div className="text-xs font-medium text-foreground/80">{copy.matrix}</div>
              <div className="text-[10px] tabular-nums text-muted-foreground">
                {rows} × {cols}
              </div>
            </div>

            <div className="mt-3 overflow-x-auto pb-1">
              <div className="inline-grid gap-1" style={{ gridTemplateColumns: `repeat(${cols}, 56px)` }}>
                {cells.map((row, r) =>
                  row.map((cell, c) => (
                    <input
                      key={`${r}-${c}`}
                      value={cell}
                      inputMode="decimal"
                      aria-label={`matrix cell ${r + 1},${c + 1}`}
                      onChange={(e) => {
                        const next = cells.map((rowCells) => rowCells.slice());
                        next[r][c] = e.target.value;
                        setCells(next);
                      }}
                      className="h-8 w-14 rounded-md border border-border/60 bg-background px-1.5 text-center font-mono text-xs tabular-nums text-foreground outline-none transition-colors focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
                    />
                  )),
                )}
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              <button type="button" onClick={() => setCells(resizeMatrix(cells, rows + 1, cols))} className="inline-flex h-7 items-center gap-1 rounded-md border border-border/60 px-2 text-[10px] text-muted-foreground hover:bg-accent/60 hover:text-foreground">
                <Plus className="size-3" />{copy.addRow}
              </button>
              <button type="button" disabled={rows <= 1} onClick={() => setCells(resizeMatrix(cells, rows - 1, cols))} className="inline-flex h-7 items-center gap-1 rounded-md border border-border/60 px-2 text-[10px] text-muted-foreground hover:bg-accent/60 hover:text-foreground disabled:opacity-40">
                <Minus className="size-3" />{copy.removeRow}
              </button>
              <button type="button" onClick={() => setCells(resizeMatrix(cells, rows, cols + 1))} className="inline-flex h-7 items-center gap-1 rounded-md border border-border/60 px-2 text-[10px] text-muted-foreground hover:bg-accent/60 hover:text-foreground">
                <Plus className="size-3" />{copy.addCol}
              </button>
              <button type="button" disabled={cols <= 1} onClick={() => setCells(resizeMatrix(cells, rows, cols - 1))} className="inline-flex h-7 items-center gap-1 rounded-md border border-border/60 px-2 text-[10px] text-muted-foreground hover:bg-accent/60 hover:text-foreground disabled:opacity-40">
                <Minus className="size-3" />{copy.removeCol}
              </button>
              <span className="mx-1 h-5 w-px self-center bg-border/60" />
              <button type="button" onClick={() => setCells(identityCells(Math.max(rows, cols)))} className="inline-flex h-7 items-center gap-1 rounded-md border border-border/60 px-2 text-[10px] text-muted-foreground hover:bg-accent/60 hover:text-foreground">
                <RotateCcw className="size-3" />{copy.identity}
              </button>
              <button type="button" onClick={() => setCells(randomCells(rows, cols))} className="inline-flex h-7 items-center gap-1 rounded-md border border-border/60 px-2 text-[10px] text-muted-foreground hover:bg-accent/60 hover:text-foreground">
                <Calculator className="size-3" />{copy.random}
              </button>
              <button type="button" onClick={() => setCells(makeMatrix(rows, cols))} className="inline-flex h-7 items-center gap-1 rounded-md border border-border/60 px-2 text-[10px] text-muted-foreground hover:bg-accent/60 hover:text-foreground">
                <Trash2 className="size-3" />{copy.clear}
              </button>
            </div>
          </section>

          <section className="rounded-2xl border border-border/60 bg-card/40 p-3">
            <div className="text-xs font-medium text-foreground/80">{copy.operations}</div>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              {(
                [
                  ['det', copy.det],
                  ['transpose', copy.transpose],
                  ['inv', copy.inv],
                  ['rank', copy.rank],
                  ['eigs', copy.eigs],
                ] as Array<[Op, string]>
              ).map(([op, label]) => (
                <button
                  key={op}
                  type="button"
                  onClick={() => run(op)}
                  className="h-8 rounded-lg border border-border/60 bg-background px-2 text-xs text-foreground/80 transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-foreground"
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="mt-4 text-xs font-medium text-foreground/80">{copy.results}</div>
            <div className="mt-2 space-y-2">
              {results.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border/60 px-3 py-6 text-center text-[10px] leading-relaxed text-muted-foreground">
                  {copy.empty}
                </p>
              ) : (
                results.map((r) => (
                  <div
                    key={r.id}
                    className={cn(
                      'rounded-lg border px-3 py-2',
                      r.error ? 'border-rose-500/30 bg-rose-500/5' : 'border-border/60 bg-background/60',
                    )}
                  >
                    <div className="text-[10px] font-medium text-muted-foreground">{r.title}</div>
                    {r.value ? (
                      <div
                        className={cn(
                          'mt-1 break-words font-mono text-xs tabular-nums',
                          r.error ? 'text-rose-500' : 'text-foreground',
                        )}
                      >
                        {r.value}
                      </div>
                    ) : null}
                    {r.matrix ? <MatrixGrid matrix={r.matrix} /> : null}
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
