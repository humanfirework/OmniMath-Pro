'use client';

/**
 * OmniMath Pro — Per-curve editor (collapsible)
 *
 * One compact row per 2D curve:
 *   • mode toggle     — 函数 y=f(x) / 极坐标 r=f(θ) / 参数方程
 *   • expression(s)   — one input for cartesian & polar, two (x(t), y(t))
 *                       for parametric
 *   • parameter range — θ range for polar (default 0 … 2π), t range for
 *                       parametric (default -10 … 10)
 *
 * The component is fully controlled: edits are reported via `onSpecChange`
 * and the parent (Plot2DPanel) owns the resolved `Curve2DSpec` map that
 * also feeds the canvas / facet / expand-dialog samplers.
 *
 * i18n note: mode labels reuse the existing plotType* dictionary keys.
 * The remaining strings are NEW keys (listed in PENDING_ZH below) that
 * still need to be merged into src/lib/i18n/index.ts — until then `tp()`
 * falls back to the built-in zh-CN text when the dictionary lookup
 * returns the raw key.
 */

import { useCallback, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useT, type TranslationDict } from '@/lib/i18n';
import {
  DEFAULT_PARAMETRIC_T_RANGE,
  DEFAULT_POLAR_THETA_RANGE,
  type Curve2DSpec,
  type Plot2DType,
} from '@/lib/plots/plot2d';
import type { PlotConfig } from '@/lib/store/workbench';

/* ------------------------------------------------------------------ */
/*  Pending i18n keys (to be merged into lib/i18n by the maintainer)  */
/* ------------------------------------------------------------------ */

/** zh-CN fallbacks for keys not yet present in the i18n dictionaries. */
const PENDING_ZH: Record<string, string> = {
  plotCurveSettings: '曲线设置',
  plotExprY: 'y =',
  plotExprR: 'r(θ) =',
  plotExprX: 'x(t) =',
  plotExprYParam: 'y(t) =',
  plotThetaRange: 'θ 范围',
  plotTRange: 't 范围',
};

/* ------------------------------------------------------------------ */
/*  Props                                                             */
/* ------------------------------------------------------------------ */

export interface PlotCurveEditorProps {
  /** 2D plots currently shown in the panel. */
  plots: PlotConfig[];
  /** Resolved spec per plot id (defaults derived from the PlotConfig). */
  specs: Record<string, Curve2DSpec>;
  /** Called with the full replacement spec whenever a field changes. */
  onSpecChange: (id: string, spec: Curve2DSpec) => void;
}

/* =================================================================== */
/*  Component                                                         */
/* =================================================================== */

export function PlotCurveEditor({ plots, specs, onSpecChange }: PlotCurveEditorProps) {
  const t = useT();
  const [open, setOpen] = useState(false);

  // t() returns the raw key for entries missing from the dictionary;
  // substitute the built-in zh-CN text until the keys are merged.
  const tp = useCallback(
    (key: string): string => {
      const v = t(key as keyof TranslationDict);
      return v === key ? (PENDING_ZH[key] ?? key) : v;
    },
    [t],
  );

  if (plots.length === 0) return null;

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border-b border-border/60 bg-background/40">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex h-7 w-full items-center gap-1.5 px-2.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
          aria-label={tp('plotCurveSettings')}
        >
          {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
          <span>{tp('plotCurveSettings')}</span>
          <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground">
            {plots.length}
          </span>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="flex flex-col gap-1 px-2.5 pb-2 pt-0.5">
          {plots.map((p) => {
            const spec = specs[p.id];
            if (!spec) return null;
            return (
              <CurveRow
                key={p.id}
                plot={p}
                spec={spec}
                onChange={(next) => onSpecChange(p.id, next)}
                tp={tp}
              />
            );
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

/* ------------------------------------------------------------------ */
/*  Single curve row                                                  */
/* ------------------------------------------------------------------ */

interface CurveRowProps {
  plot: PlotConfig;
  spec: Curve2DSpec;
  onChange: (spec: Curve2DSpec) => void;
  tp: (key: string) => string;
}

function CurveRow({ plot, spec, onChange, tp }: CurveRowProps) {
  const t = useT();

  const handleModeChange = (mode: Plot2DType) => {
    if (mode === spec.mode) return;
    onChange({
      ...spec,
      mode,
      // Switching modes resets the parameter range to that mode's
      // default (θ: 0…2π, t: -10…10); cartesian ignores the range.
      paramRange:
        mode === 'polar'
          ? [...DEFAULT_POLAR_THETA_RANGE]
          : mode === 'parametric'
            ? [...DEFAULT_PARAMETRIC_T_RANGE]
            : spec.paramRange,
    });
  };

  const setParam = (index: 0 | 1, v: number) => {
    const next: [number, number] = [...spec.paramRange];
    next[index] = v;
    onChange({ ...spec, paramRange: next });
  };

  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 rounded-md border border-border/40 bg-background/30 px-1.5 py-1">
      {/* Color swatch matching the curve */}
      <span
        className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: plot.color, boxShadow: `0 0 6px ${plot.color}80` }}
      />

      {/* Mode toggle */}
      <ToggleGroup
        type="single"
        value={spec.mode}
        onValueChange={(v) => {
          if (v === 'cartesian' || v === 'polar' || v === 'parametric') {
            handleModeChange(v);
          }
        }}
        className="h-7"
        size="sm"
      >
        <ToggleGroupItem value="cartesian" className="h-7 px-2 text-[10px]" aria-label={t('plotTypeCartesian')}>
          {t('plotTypeCartesian')}
        </ToggleGroupItem>
        <ToggleGroupItem value="polar" className="h-7 px-2 text-[10px]" aria-label={t('plotTypePolar')}>
          {t('plotTypePolar')}
        </ToggleGroupItem>
        <ToggleGroupItem value="parametric" className="h-7 px-2 text-[10px]" aria-label={t('plotTypeParametric')}>
          {t('plotTypeParametric')}
        </ToggleGroupItem>
      </ToggleGroup>

      {/* Expression inputs per mode */}
      {spec.mode === 'cartesian' && (
        <>
          <span className="font-mono text-[10px] text-muted-foreground">{tp('plotExprY')}</span>
          <ExprInput
            value={spec.exprX}
            onChange={(exprX) => onChange({ ...spec, exprX })}
            ariaLabel="y = f(x)"
          />
        </>
      )}

      {spec.mode === 'polar' && (
        <>
          <span className="font-mono text-[10px] text-muted-foreground">{tp('plotExprR')}</span>
          <ExprInput
            value={spec.exprX}
            onChange={(exprX) => onChange({ ...spec, exprX })}
            ariaLabel="r = f(θ)"
          />
          <span className="ml-1 text-[10px] text-muted-foreground">{tp('plotThetaRange')}</span>
          <RangeNumberInput value={spec.paramRange[0]} onChange={(v) => setParam(0, v)} ariaLabel="θ min" />
          <span className="text-muted-foreground/60">~</span>
          <RangeNumberInput value={spec.paramRange[1]} onChange={(v) => setParam(1, v)} ariaLabel="θ max" />
        </>
      )}

      {spec.mode === 'parametric' && (
        <>
          <span className="font-mono text-[10px] text-muted-foreground">{tp('plotExprX')}</span>
          <ExprInput
            value={spec.exprX}
            onChange={(exprX) => onChange({ ...spec, exprX })}
            ariaLabel="x = f(t)"
            narrow
          />
          <span className="font-mono text-[10px] text-muted-foreground">{tp('plotExprYParam')}</span>
          <ExprInput
            value={spec.exprY}
            onChange={(exprY) => onChange({ ...spec, exprY })}
            ariaLabel="y = g(t)"
            narrow
          />
          <span className="ml-1 text-[10px] text-muted-foreground">{tp('plotTRange')}</span>
          <RangeNumberInput value={spec.paramRange[0]} onChange={(v) => setParam(0, v)} ariaLabel="t min" />
          <span className="text-muted-foreground/60">~</span>
          <RangeNumberInput value={spec.paramRange[1]} onChange={(v) => setParam(1, v)} ariaLabel="t max" />
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Inputs                                                            */
/* ------------------------------------------------------------------ */

/** Compact math-expression text input (live — commits per keystroke). */
function ExprInput({
  value,
  onChange,
  ariaLabel,
  narrow,
}: {
  value: string;
  onChange: (v: string) => void;
  ariaLabel: string;
  narrow?: boolean;
}) {
  return (
    <Input
      type="text"
      spellCheck={false}
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`h-7 rounded border-border/60 bg-background/40 px-1.5 font-mono text-xs ${
        narrow ? 'w-28' : 'w-40'
      }`}
    />
  );
}

/** Compact number input for θ / t range endpoints. */
function RangeNumberInput({
  value,
  onChange,
  ariaLabel,
}: {
  value: number;
  onChange: (v: number) => void;
  ariaLabel: string;
}) {
  return (
    <Input
      type="number"
      step="any"
      aria-label={ariaLabel}
      value={Number.isFinite(value) ? Number(value.toFixed(3)) : 0}
      onChange={(e) => {
        const v = parseFloat(e.target.value);
        if (Number.isFinite(v)) onChange(v);
      }}
      className="h-7 w-16 rounded border-border/60 bg-background/40 px-1.5 font-mono text-xs tabular-nums"
    />
  );
}
