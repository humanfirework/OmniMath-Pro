'use client';

/**
 * OmniMath Pro — 2D 自由参数滑块（Desmos 式）
 *
 * 自动扫描所有可见 2D 表达式中的自由参数（如 `a*x^2+b` 中的 a、b），
 * 为每个参数生成一行紧凑控件：参数名 + 滑块 + 数值输入框 + 范围/步长
 * 设置弹层。拖动滑块时：
 *   1. `setScopeVar` 把值写入引擎共享作用域并 bump scopeVersion，
 *      曲线经 useScopeVersion 实时重采样（交点/切线等 overlay 同步刷新）；
 *   2. `setPlotParam` 把值持久化到 workbench store（localStorage，
 *      400ms 防抖），刷新后由 loadFromStorage 恢复进引擎作用域。
 *
 * 仅当存在自由参数时才渲染；表达式编辑后参数列表自动更新（新参数补
 * 默认滑块，消失的参数移除滑块但其值保留在 store 中）。
 */

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Settings2, SlidersHorizontal } from 'lucide-react';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { useWorkbenchStore, type PlotConfig, type PlotParamConfig } from '@/lib/store/workbench';
import { extractFreeParameters } from '@/lib/engine/variableScanner';
import { getScope, setScopeVar } from '@/lib/engine/mathInstance';
import { useScopeVersion } from '@/lib/hooks/useScopeVersion';

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

/** 默认滑块配置：以初值 v 为中心取 [v-10, v+10]（v=0 时即 [-10, 10]），
 *  步长 (max-min)/200。 */
function makeDefaultConfig(center = 1): PlotParamConfig {
  const min = center - 10;
  const max = center + 10;
  return { value: center, min, max, step: (max - min) / 200 };
}

/** 数值显示格式：整数原样，其余最多 6 位有效数字。 */
function formatParamValue(v: number): string {
  if (!Number.isFinite(v)) return '—';
  if (Number.isInteger(v)) return String(v);
  return parseFloat(v.toPrecision(6)).toString();
}

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export function ParameterSliders({ plots }: { plots: PlotConfig[] }) {
  const variables = useWorkbenchStore((s) => s.variables);
  const plotParams = useWorkbenchStore((s) => s.plotParams);
  const setPlotParam = useWorkbenchStore((s) => s.setPlotParam);
  const [open, setOpen] = useState(true);
  // scopeVersion 变化（滑块拖动、变量增删、作用域重置/恢复）时重新对齐
  // 参数列表与引擎作用域中的值。
  const scopeVersion = useScopeVersion();

  /* 可见 2D 表达式中的自由参数（排除 x/y/t、内置符号、已定义变量）。 */
  const params = useMemo(() => {
    void scopeVersion; // variables 可能随赋值变化，与作用域保持同拍
    const exprs = plots
      .filter((p) => p.visible && p.plotType !== 'surface3d')
      .map((p) => p.expression);
    return extractFreeParameters(exprs, Object.keys(variables));
  }, [plots, variables, scopeVersion]);

  /* 每个参数的有效配置：优先用 store 中持久化的值；否则以引擎作用域里
   * 的当前已知值（或 1）为中心生成默认配置。 */
  const configs = useMemo<Record<string, PlotParamConfig>>(() => {
    const scope = getScope();
    const map: Record<string, PlotParamConfig> = {};
    for (const name of params) {
      const stored = plotParams[name];
      if (stored) {
        map[name] = stored;
      } else {
        const cur = scope[name];
        map[name] = makeDefaultConfig(typeof cur === 'number' ? cur : 1);
      }
    }
    return map;
  }, [params, plotParams, scopeVersion]);

  /* 把参数值同步进引擎作用域：首次出现、localStorage 恢复、或变量面板
   * "清空全部"（resetScope 会连参数一起清掉）之后自动补齐。若作用域
   * 中已是目标值则不再写入，避免循环 bump。 */
  useEffect(() => {
    const scope = getScope();
    for (const [name, cfg] of Object.entries(configs)) {
      if (scope[name] !== cfg.value) {
        setScopeVar(name, cfg.value);
      }
    }
  }, [configs]);

  if (params.length === 0) return null;

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border-t border-border/60 bg-background/40">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex h-7 w-full items-center gap-1.5 px-2.5 text-[11px] font-medium text-muted-foreground hover:bg-accent/40 hover:text-foreground transition-colors"
          aria-label={open ? '折叠参数滑块' : '展开参数滑块'}
        >
          {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
          <SlidersHorizontal className="size-3" />
          <span>参数滑块</span>
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px]">
            {params.length}
          </span>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="flex flex-col gap-1 px-2.5 pb-2 pt-0.5">
          {params.map((name) => (
            <ParamRow
              key={name}
              name={name}
              config={configs[name] ?? makeDefaultConfig()}
              onValueChange={(v) => {
                // 先写引擎作用域（触发重绘），再持久化到 store。
                setScopeVar(name, v);
                setPlotParam(name, { value: v });
              }}
              onConfigChange={(patch) => setPlotParam(name, patch)}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

/* ------------------------------------------------------------------ */
/*  Single parameter row                                              */
/* ------------------------------------------------------------------ */

function ParamRow({
  name,
  config,
  onValueChange,
  onConfigChange,
}: {
  name: string;
  config: PlotParamConfig;
  onValueChange: (v: number) => void;
  onConfigChange: (patch: Partial<PlotParamConfig>) => void;
}) {
  const { value, min, max, step } = config;
  return (
    <div className="flex items-center gap-2">
      {/* 参数名：等宽斜体，对齐数学排版习惯 */}
      <code className="w-8 shrink-0 truncate font-mono text-[12px] italic font-semibold text-primary">
        {name}
      </code>
      <Slider
        value={[Math.min(max, Math.max(min, value))]}
        min={min}
        max={max}
        step={step}
        onValueChange={(vals) => vals[0] !== undefined && onValueChange(vals[0])}
        className="h-3 min-w-0 flex-1"
        aria-label={`参数 ${name}`}
      />
      <NumberField
        value={value}
        onCommit={onValueChange}
        className="h-6 w-16 shrink-0 rounded border border-border/60 bg-muted/40 px-1.5 text-right font-mono text-[11px] tabular-nums focus:border-primary/60 focus:outline-none"
        ariaLabel={`参数 ${name} 的值`}
      />
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="grid size-5 shrink-0 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            aria-label={`参数 ${name} 的范围与步长设置`}
          >
            <Settings2 className="size-3" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-52 p-2.5">
          <div className="flex flex-col gap-1.5">
            <p className="font-mono text-[10px] text-muted-foreground">
              参数 <span className="italic text-primary">{name}</span> 的范围与步长
            </p>
            <div className="grid grid-cols-3 gap-1.5">
              <RangeField
                label="min"
                value={min}
                onCommit={(v) => {
                  if (v < max) onConfigChange({ min: v });
                }}
              />
              <RangeField
                label="max"
                value={max}
                onCommit={(v) => {
                  if (v > min) onConfigChange({ max: v });
                }}
              />
              <RangeField
                label="step"
                value={step}
                onCommit={(v) => {
                  if (v > 0) onConfigChange({ step: v });
                }}
              />
            </div>
            <p className="text-[9px] text-muted-foreground/80">
              min 必须小于 max，step 必须大于 0。
            </p>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Numeric input fields                                              */
/* ------------------------------------------------------------------ */

/**
 * 数值输入框：本地编辑态 + Enter/失焦提交。相比受控 number input，
 * 可以正常键入负号与小数点等中间态；非法输入在提交时丢弃并还原显示。
 */
function NumberField({
  value,
  onCommit,
  className,
  ariaLabel,
}: {
  value: number;
  onCommit: (v: number) => void;
  className?: string;
  ariaLabel?: string;
}) {
  // editing === null 表示未在编辑，显示跟随外部值。
  const [editing, setEditing] = useState<string | null>(null);

  const commit = () => {
    if (editing !== null) {
      const v = parseFloat(editing);
      if (Number.isFinite(v)) onCommit(v);
      setEditing(null);
    }
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      value={editing ?? formatParamValue(value)}
      onChange={(e) => setEditing(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          commit();
          (e.target as HTMLInputElement).blur();
        } else if (e.key === 'Escape') {
          setEditing(null);
          (e.target as HTMLInputElement).blur();
        }
      }}
      className={className}
      aria-label={ariaLabel}
    />
  );
}

/** 范围弹层里的 min/max/step 输入（带 Label 的 NumberField）。 */
function RangeField({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: number;
  onCommit: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <Label className="font-mono text-[9px] text-muted-foreground">{label}</Label>
      <NumberField
        value={value}
        onCommit={onCommit}
        className="h-6 w-full rounded border border-border/60 bg-muted/40 px-1.5 font-mono text-[11px] tabular-nums focus:border-primary/60 focus:outline-none"
        ariaLabel={label}
      />
    </div>
  );
}
