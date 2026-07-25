'use client';

/**
 * OmniMath Pro — Matrix Node View
 *
 * Renders a mathjs matrix result as a compact HTML table inside a node
 * footer. Replaces the previous `String(r)` rendering that showed
 * `[[1,2],[3,4]]` as plain text.
 *
 * - Max 8×8 cells shown; larger matrices are truncated with an ellipsis
 *   indicator.
 * - Numeric values are rounded to remove float noise (1.0000000001 → 1).
 * - Cell width auto-shrinks for large matrices so the table fits inside
 *   the node card width (~248px).
 */

import { useMemo } from 'react';
import { cn } from '@/lib/utils';

interface MatrixNodeViewProps {
  /** mathjs Matrix, number[][], or any array-like. */
  value: unknown;
  className?: string;
}

const MAX_ROWS = 8;
const MAX_COLS = 8;

function toNumberArray(value: unknown): number[][] {
  let arr: unknown;
  if (value && typeof value === 'object' && 'toArray' in value) {
    arr = (value as { toArray: () => unknown }).toArray();
  } else if (Array.isArray(value)) {
    arr = value;
  } else {
    return [[Number(value as number) || 0]];
  }
  if (!Array.isArray(arr)) return [[Number(arr) || 0]];
  if (arr.length > 0 && !Array.isArray(arr[0])) {
    return [arr as unknown as number[]];
  }
  return arr as number[][];
}

function cleanNum(v: number): string {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    return Number.isNaN(v) ? 'NaN' : String(v);
  }
  const rounded = Math.round(v);
  if (Math.abs(v - rounded) < 1e-9) return String(rounded);
  return parseFloat(v.toPrecision(6)).toString();
}

export function MatrixNodeView({ value, className }: MatrixNodeViewProps) {
  const matrix = useMemo(() => toNumberArray(value), [value]);
  if (matrix.length === 0) {
    return <span className="text-[11px] text-muted-foreground">—</span>;
  }

  const rows = matrix.length;
  const cols = matrix[0]?.length ?? 0;
  const truncatedRows = rows > MAX_ROWS;
  const truncatedCols = cols > MAX_COLS;
  const displayRows = Math.min(rows, MAX_ROWS);
  const displayCols = Math.min(cols, MAX_COLS);

  // Auto-shrink cell font for large matrices.
  const fontSize = cols > 6 ? '9px' : cols > 4 ? '10px' : '11px';
  const cellPad = cols > 6 ? 'px-0.5 py-0' : 'px-1 py-0.5';

  return (
    <div className={cn('w-full overflow-x-auto scrollbar-none', className)}>
      <table
        className="mx-auto border-collapse"
        style={{ fontSize, fontFamily: 'var(--font-mono, ui-monospace, monospace)' }}
      >
        <tbody>
          {Array.from({ length: displayRows }, (_, i) => (
            <tr key={i}>
              {Array.from({ length: displayCols }, (_, j) => {
                const v = matrix[i]?.[j];
                const isZero = v === 0;
                return (
                  <td
                    key={j}
                    className={cn(
                      'border border-border/40 text-center tabular-nums',
                      cellPad,
                      isZero ? 'text-muted-foreground/60' : 'text-foreground/90',
                    )}
                    style={{ minWidth: cols > 6 ? 18 : 24 }}
                  >
                    {cleanNum(Number(v) || 0)}
                  </td>
                );
              })}
              {truncatedCols && (
                <td className="px-0.5 text-muted-foreground/60 text-center align-middle">…</td>
              )}
            </tr>
          ))}
          {truncatedRows && (
            <tr>
              <td
                colSpan={displayCols + (truncatedCols ? 1 : 0)}
                className="text-center text-muted-foreground/60 py-0.5"
              >
                …
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <div className="mt-0.5 text-[9px] text-muted-foreground/70 text-center">
        {rows}×{cols}
        {(truncatedRows || truncatedCols) && ' (截断显示)'}
      </div>
    </div>
  );
}
