'use client';

/**
 * OmniMath Pro — Math Render (node footer helper)
 *
 * Unified rendering for mathjs results inside node footers. Handles:
 *   - MathNode (objects with `.toTex()`) → KaTeX
 *   - String expression → parse + toTex → KaTeX
 *   - Number → formatted string
 *   - Matrix → MatrixNodeView
 *   - Object with `.latex` field (from improved integrate/derivative nodes)
 *
 * Falls back to `String(r)` when no renderer applies.
 */

import { FormulaRenderer } from '@/components/workbench/FormulaRenderer';
import { MatrixNodeView } from './MatrixNodeView';
import { cn } from '@/lib/utils';

interface MathRenderProps {
  value: unknown;
  className?: string;
}

function formatShort(n: number): string {
  if (!Number.isFinite(n)) return n > 0 ? '∞' : '-∞';
  const abs = Math.abs(n);
  if (abs !== 0 && (abs < 1e-4 || abs >= 1e6)) {
    return n.toExponential(3);
  }
  const rounded = Math.round(n);
  if (Math.abs(n - rounded) < 1e-9) return String(rounded);
  return parseFloat(n.toPrecision(6)).toString();
}

export function MathRender({ value, className }: MathRenderProps) {
  if (value === undefined || value === null) {
    return <span className="text-[11px] text-muted-foreground/60">—</span>;
  }

  // Number
  if (typeof value === 'number') {
    return (
      <div className={cn('text-center w-full', className)}>
        <div
          className={cn(
            'font-mono font-semibold text-[15px]',
            Number.isNaN(value) ? 'text-destructive' : 'text-foreground',
          )}
        >
          {Number.isNaN(value) ? 'NaN' : formatShort(value)}
        </div>
      </div>
    );
  }

  // String expression — try parse + toTex for nicer rendering.
  if (typeof value === 'string') {
    // If it's a plain expression string (no LaTeX), try to render as math.
    // We avoid importing mathjs here to keep this leaf component light;
    // FormulaRenderer already handles raw strings gracefully by displaying
    // them as-is when KaTeX can't parse them.
    return (
      <span
        className={cn('text-[11px] font-mono text-foreground/80 break-all whitespace-normal', className)}
        style={{ wordBreak: 'break-word' }}
      >
        {value}
      </span>
    );
  }

  // Object with explicit latex field (from improved integrate/derivative).
  if (value && typeof value === 'object' && 'latex' in value) {
    const latex = (value as { latex: string }).latex;
    if (typeof latex === 'string' && latex) {
      return (
        <div className={cn('w-full overflow-x-auto scrollbar-none', className)}>
          <FormulaRenderer latex={latex} displayMode={false} className="text-[12px] text-center" />
        </div>
      );
    }
  }

  // MathNode (has toTex).
  if (value && typeof value === 'object' && 'toTex' in value) {
    let latex = '';
    try {
      latex = (value as { toTex: (opts?: object) => string }).toTex({ implicit: 'hide' });
    } catch {
      latex = '';
    }
    if (latex) {
      return (
        <div className={cn('w-full overflow-x-auto scrollbar-none', className)}>
          <FormulaRenderer latex={latex} displayMode={false} className="text-[12px] text-center" />
        </div>
      );
    }
  }

  // Matrix (mathjs Matrix or number[][]).
  if (value && typeof value === 'object') {
    const maybeMatrix =
      'toArray' in value || Array.isArray(value);
    if (maybeMatrix) {
      return <MatrixNodeView value={value} className={className} />;
    }
  }

  // Fallback
  return (
    <span
      className={cn('text-[11px] font-mono text-foreground/80 break-all whitespace-normal', className)}
      style={{ wordBreak: 'break-word' }}
    >
      {String(value)}
    </span>
  );
}
