'use client';

/**
 * OmniMath Pro — 2D 自由参数滑块（Desmos 式）
 *
 * 自动扫描所有可见 2D 表达式中的自由参数（如 `a*x^2+b` 中的 a、b），
 * 为每个参数生成一行紧凑控件：参数名 + 播放按钮 + 滑块 + 数值输入框 +
 * 范围/步长设置弹层。拖动滑块时：
 *   1. `setScopeVar` 把值写入引擎共享作用域并 bump scopeVersion，
 *      曲线经 useScopeVersion 实时重采样（交点/切线等 overlay 同步刷新）；
 *   2. `setPlotParam` 把值持久化到 workbench store（localStorage，
 *      400ms 防抖），刷新后由 loadFromStorage 恢复进引擎作用域。
 *
 * 仅当存在自由参数时才渲染；表达式编辑后参数列表自动更新（新参数补
 * 默认滑块，消失的参数移除滑块但其值保留在 store 中）。
 *
 * 增强特性：
 *   - 折叠状态持久化到 settingsStore.slidersCollapsed（跨会话保留）。
 *   - 每个参数一行"播放"按钮：点击后参数值按正弦波在 [min, max] 间往复
 *     动画（3 秒/周期），用单个 requestAnimationFrame 循环驱动所有正在
 *     播放的参数；再次点击停止并保留当前值。
 *   - Desmos 风格滑块：更粗的轨道、更大的手柄、min→current 的主色渐变。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Pause, Play, Settings2, SlidersHorizontal } from 'lucide-react';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useWorkbenchStore, type PlotConfig, type PlotParamConfig, type ParamPlayMode } from '@/lib/store/workbench';
import { useSettingsStore } from '@/lib/store/settingsStore';
import { extractFreeParameters } from '@/lib/engine/variableScanner';
import { getScope, setScopeVar, setScopeVarSilent, bumpScopeVersion } from '@/lib/engine/mathInstance';
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

/** 播放动画的周期（秒/周期，速度 1× 时）。 */
const PLAY_CYCLE_SECONDS = 3;

/** 播放动画模式的中文标签（用于模式选择器）。 */
const PLAY_MODE_LABELS: Record<ParamPlayMode, string> = {
  bounce: '往复循环',
  forward: '单向重复',
  reverse: '反向重复',
  once: '播放一次',
};

/**
 * 依据播放模式计算时刻 `elapsed`（秒）对应的 [min,max] 内的归一化进度。
 * 所有模式都采用均匀（线性）变化 —— 速度恒定，不忽快忽慢（区别于旧的
 * 正弦波，避免在端点处明显减速）。
 */
function paramPlayFraction(
  mode: ParamPlayMode,
  elapsed: number,
  cycleSeconds: number,
): { frac: number; done: boolean } {
  const cycle = Math.max(cycleSeconds, 1e-6);
  const p = (elapsed % cycle) / cycle; // 0…1（一个周期内的归一化位置）
  switch (mode) {
    case 'bounce': // 0→1→0 三角波（前向再回转，匀速）
      return { frac: p < 0.5 ? p * 2 : 2 - p * 2, done: false };
    case 'forward': // 0→1 后瞬间跳回 0，重复（单向）
      return { frac: p, done: false };
    case 'reverse': // 1→0 后瞬间跳回 1，重复
      return { frac: 1 - p, done: false };
    case 'once': // 0→1 播放一次后停止
      return { frac: Math.min(elapsed / cycle, 1), done: elapsed >= cycle };
  }
}

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export function ParameterSliders({
  plots,
  className,
  extraParams,
}: {
  plots: PlotConfig[];
  className?: string;
  /** 显式添加的变量（Desmos 式「+ 添加变量」）。即便尚未出现在任何表达式
   *  中也会显示为可调滑块，写入引擎作用域后供 θ/t 范围等表达式使用。 */
  extraParams?: string[];
}) {
  const variables = useWorkbenchStore((s) => s.variables);
  const plotParams = useWorkbenchStore((s) => s.plotParams);
  const setPlotParam = useWorkbenchStore((s) => s.setPlotParam);
  // 折叠状态改为持久化到 settingsStore，跨会话保留用户偏好。
  const slidersCollapsed = useSettingsStore((s) => s.slidersCollapsed);
  const setSlidersCollapsed = useSettingsStore((s) => s.setSlidersCollapsed);
  // scopeVersion 变化（滑块拖动、变量增删、作用域重置/恢复）时重新对齐
  // 参数列表与引擎作用域中的值。
  const scopeVersion = useScopeVersion();

  /* 可见 2D 表达式中的自由参数（排除 x/y/t、内置符号、已定义变量），
   * 合并显式添加的变量（extraParams，如用户在 Demos 里新加的 t）。 */
  const params = useMemo(() => {
    void scopeVersion; // variables 可能随赋值变化，与作用域保持同拍
    const exprs = plots
      .filter((p) => p.visible && p.plotType !== 'surface3d')
      .map((p) => p.expression);
    const free = extractFreeParameters(exprs, Object.keys(variables));
    if (extraParams && extraParams.length > 0) {
      for (const name of extraParams) {
        if (!free.includes(name)) free.push(name);
      }
    }
    return free;
  }, [plots, variables, scopeVersion, extraParams]);

  /* Task 9.B: 监听 plotParams 的 keys 变化（「清除参数」或清空回默认值时，
   * 确保滑块显示值与引擎重新对齐，不出现显示旧值的脱节）。
   * 无专用 plotParamsVersion 时，用排序后的 keys 串联字符串做浅比较。 */
  const plotParamsKeys = useMemo(
    () => Object.keys(plotParams).sort().join(','),
    [plotParams],
  );

  /* 每个参数的有效配置：优先用 store 中持久化的值；否则以引擎作用域里
   * 的当前已知值（或 1）为中心生成默认配置。
   * 额外依赖 plotParamsKeys：当「清除参数」导致 plotParams 集合变化时
   * 强制重算，即使 params 列表没变（避免显示值与引擎脱节）。 */
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
  }, [params, plotParams, scopeVersion, plotParamsKeys]);

  /* 把参数值同步进引擎作用域：首次出现、localStorage 恢复、或变量面板
   * "清空全部"（resetScope 会连参数一起清掉）之后自动补齐。若作用域
   * 中已是目标值则不再写入，避免循环 bump。
   * Task 9.B: 额外依赖 plotParamsKeys，确保「清除参数」后即使 configs
   * 引用相同也能重新对齐显示值与引擎值。 */
  useEffect(() => {
    void plotParamsKeys; // 保证 lint 不报警；语义上作为重置信号
    const scope = getScope();
    for (const [name, cfg] of Object.entries(configs)) {
      if (scope[name] !== cfg.value) {
        setScopeVar(name, cfg.value);
      }
    }
  }, [configs, plotParamsKeys]);

  /* ----------------------- 播放动画 ----------------------- */
  // 每个参数是否正在播放；startTimesRef 记录每个参数开始播放的时刻
  //（performance.now() 毫秒）。configsRef 让 rAF 回调读到最新 min/max
  // 而无需重新订阅。所有正在播放的参数共用一个 requestAnimationFrame
  // 循环（tick），添加/移除播放参数时只增删集合，循环自我续期。
  const [playingParams, setPlayingParams] = useState<Set<string>>(new Set());
  const playingParamsRef = useRef<Set<string>>(new Set());
  const startTimesRef = useRef<Record<string, number>>({});
  const configsRef = useRef<Record<string, PlotParamConfig>>(configs);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    configsRef.current = configs;
  }, [configs]);
  useEffect(() => {
    playingParamsRef.current = playingParams;
  }, [playingParams]);

  // tickRef holds the latest animation callback so the rAF loop can
  // reschedule itself without a self-referential useCallback (which
  // triggers react-hooks/immutability: "accessed before declared").
  const tickRef = useRef<FrameRequestCallback>(() => {});
  tickRef.current = () => {
    const now = performance.now();
    const playing = playingParamsRef.current;
    const cfgs = configsRef.current;
    const doneNames: string[] = [];
    for (const name of playing) {
      const cfg = cfgs[name];
      if (!cfg || cfg.max <= cfg.min) continue;
      const start = startTimesRef.current[name];
      if (start === undefined) continue;
      const elapsed = (now - start) / 1000;
      // 速度倍率：默认 1×；越大周期越短（动得越快）。
      const cycle = PLAY_CYCLE_SECONDS / (cfg.speed && cfg.speed > 0 ? cfg.speed : 1);
      const { frac, done } = paramPlayFraction(cfg.playMode ?? 'bounce', elapsed, cycle);
      if (done) {
        doneNames.push(name);
        continue;
      }
      // 均匀线性插值：value = min + frac·(max−min)
      const value = cfg.min + frac * (cfg.max - cfg.min);
      // 动画期间用「静默」写入：只 bump animVersion，让 Plot2DCanvas 单独
      // 重采样重绘，避免整棵 React 子树每帧重渲染（Desmos 流畅度的关键）。
      // 动画停止后再用 setScopeVar 落定最终值，触发全局 scopeVersion 同步。
      setScopeVarSilent(name, value);
      setPlotParam(name, { value });
    }
    // 'once' 模式播完即从播放集移除（保留当前值，不重置）。
    if (doneNames.length > 0) {
      for (const n of doneNames) {
        playing.delete(n);
        delete startTimesRef.current[n];
        // 动画结束（如 'once' 播完）：用 setScopeVar 把最终值同步到全局作用域，
        // 确保其它组件（KaTeX 显示、AdvancedPanel 等）读到最新值。
        const cfg0 = cfgs[n];
        if (cfg0 && cfg0.max > cfg0.min) {
          const frac0 = paramPlayFraction(cfg0.playMode ?? 'bounce', 0, PLAY_CYCLE_SECONDS).frac;
          const finalVal = cfg0.min + frac0 * (cfg0.max - cfg0.min);
          setScopeVar(n, finalVal);
        }
      }
      setPlayingParams(new Set(playing));
    }
    // 仍有参数在播放就续期，否则停止循环并把 rafRef 置空。
    if (playingParamsRef.current.size > 0) {
      rafRef.current = requestAnimationFrame(tickRef.current);
    } else {
      rafRef.current = null;
    }
  };

  // 有参数开始播放时启动循环；全部停止时取消循环。
  useEffect(() => {
    if (playingParams.size > 0 && rafRef.current === null) {
      rafRef.current = requestAnimationFrame(tickRef.current);
    } else if (playingParams.size === 0 && rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, [playingParams]);

  // 卸载时取消循环并清空起始时间，避免泄漏 / 卸载后 setState。
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      startTimesRef.current = {};
    };
  }, []);

  // 参数从表达式中消失时停止其播放（保留当前值，不重置）。
  useEffect(() => {
    setPlayingParams((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const name of prev) {
        if (params.includes(name)) {
          next.add(name);
        } else {
          changed = true;
          delete startTimesRef.current[name];
        }
      }
      return changed ? next : prev;
    });
  }, [params]);

  const togglePlay = useCallback((name: string) => {
    // 记录播放状态，用于在状态更新之外执行副作用（避免在 reducer 内
    // 调用 setScopeVar 触发跨组件同步更新，导致 React "setState during
    // render" 告警）。
    const wasPlaying = playingParamsRef.current.has(name);
    setPlayingParams((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
    if (wasPlaying) {
      delete startTimesRef.current[name];
      // 手动暂停：把最后写入的（静默）值用 setScopeVar 落定，
      // 触发全局 scopeVersion 同步，让其它组件读到最新值。
      const cfg0 = configsRef.current[name];
      if (cfg0) setScopeVar(name, cfg0.value);
    } else {
      startTimesRef.current[name] = performance.now();
    }
  }, []);

  /* Task 9.C: 「重置全部」按钮：把所有滑块恢复到默认中心、
   * 清除持久化 patch 覆盖、并触发 scopeVersion 重采样。 */
  const handleResetAll = useCallback(() => {
    // 先停掉所有正在播放的动画，避免 rAF 循环继续写旧值
    setPlayingParams(new Set());
    startTimesRef.current = {};
    for (const name of params) {
      const cfg = configs[name];
      // 默认中心：若无配置则用引擎当前值（或 1）作为中心生成默认
      const defaultCenter = cfg
        ? (cfg.min + cfg.max) / 2
        : (() => {
            const cur = getScope()[name];
            return typeof cur === 'number' ? cur : 1;
          })();
      // 1) 把引擎作用域恢复到默认中心
      setScopeVar(name, defaultCenter);
      // 3) 清除 plotParams patch 覆盖（下次出现走默认配置）
      setPlotParam(name, undefined);
    }
    // 2) 显式 bump 一次 scopeVersion，确保 Plot2DCanvas 的 useMemo
    //    失效并重采样（setScopeVar 已经 bump，但多一次无副作用）
    bumpScopeVersion();
  }, [params, configs, setPlotParam]);

  // 无自由参数时给出明确引导（而非一片空白）：让用户知道用
  // a*sin(x)+b 这类含参数表达式即可出现实时调节滑块。
  if (params.length === 0) {
    const hasVisiblePlot = plots.some((p) => p.visible && p.plotType !== 'surface3d');
    return (
      <div className="border-t border-border/60 bg-background/40 px-3 py-2 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-1.5 font-medium">
          <SlidersHorizontal className="size-3" />
          <span>参数滑块</span>
        </div>
        <p className="mt-1 leading-relaxed">
          {hasVisiblePlot
            ? '当前表达式没有可调参数（如 a·x²+b 中的 a、b）。在表达式里加入字母参数即可出现可拖动滑块，实时改变曲线。'
            : '还没有可见的 2D 曲线。输入如 a*sin(x)+b 的表达式并运行，即可出现可拖动滑块，实时改变曲线。'}
        </p>
      </div>
    );
  }

  return (
    <Collapsible open={!slidersCollapsed} onOpenChange={(o) => setSlidersCollapsed(!o)} className={`border-t border-border/60 bg-background/40 ${className ?? ''}`}>
      {/* Task 9.C: 头部一行 — 左侧折叠触发器，右侧「重置全部」按钮 */}
      <div className="flex items-center justify-between px-1">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex h-7 flex-1 items-center gap-1.5 px-1.5 text-[11px] font-medium text-muted-foreground hover:bg-accent/40 hover:text-foreground transition-colors rounded"
            aria-label={slidersCollapsed ? '展开参数滑块' : '折叠参数滑块'}
          >
            {!slidersCollapsed ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
            <SlidersHorizontal className="size-3" />
            <span>参数滑块</span>
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px]">
              {params.length}
            </span>
          </button>
        </CollapsibleTrigger>
        <Button
          size="sm"
          variant="ghost"
          onClick={handleResetAll}
          className="h-7 px-2 text-[11px]"
        >
          ↺ 重置全部
        </Button>
      </div>
      <CollapsibleContent>
        <div className="flex flex-col gap-1.5 px-2.5 pb-2 pt-1">
          {params.map((name) => (
            <ParamRow
              key={name}
              name={name}
              config={configs[name] ?? makeDefaultConfig()}
              isPlaying={playingParams.has(name)}
              onTogglePlay={() => togglePlay(name)}
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
  isPlaying,
  onTogglePlay,
  onValueChange,
  onConfigChange,
}: {
  name: string;
  config: PlotParamConfig;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onValueChange: (v: number) => void;
  onConfigChange: (patch: Partial<PlotParamConfig>) => void;
}) {
  const { value, min, max, step, playMode = 'bounce', speed = 1 } = config;
  return (
    <div
      className="flex items-center gap-1.5"
      title={isPlaying ? '动画播放中，点击 ⏸ 暂停' : undefined}
    >
      {/* 参数名：等宽斜体，对齐数学排版习惯 */}
      <code className="w-7 shrink-0 truncate font-mono text-[12px] italic font-semibold text-primary">
        {name}
      </code>
      {/* 播放/暂停：点击在 [min, max] 间按正弦波动画参数值 */}
      <button
        type="button"
        onClick={onTogglePlay}
        className={
          'grid size-6 shrink-0 place-items-center rounded transition-colors ' +
          (isPlaying
            ? 'bg-primary/15 text-primary'
            : 'text-muted-foreground hover:bg-accent hover:text-primary')
        }
        aria-label={isPlaying ? `暂停参数 ${name} 动画` : `播放参数 ${name} 动画`}
        title={isPlaying ? '暂停动画' : '播放动画'}
      >
        {isPlaying ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
      </button>
      <DesmosSlider
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={isPlaying}
        onChange={onValueChange}
        ariaLabel={`参数 ${name}`}
      />
      {/* Task 9.D: 播放时在数值输入框左侧显示绿色播放徽标 */}
      {isPlaying && (
        <Play className="h-3 w-3 shrink-0 text-green-400 inline-block mr-1" />
      )}
      <NumberField
        value={value}
        onCommit={onValueChange}
        className={
          'h-6 w-16 shrink-0 rounded border border-border/60 bg-muted/40 px-1.5 text-right font-mono text-[12px] tabular-nums focus:border-primary/60 focus:outline-none ' +
          (isPlaying ? 'text-green-400' : 'text-foreground')
        }
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
        <PopoverContent align="end" className="w-64 p-2.5">
          <div className="flex flex-col gap-2">
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
            <div className="border-t border-border/60 pt-1.5 flex flex-col gap-1.5">
              <p className="font-mono text-[10px] text-muted-foreground">播放模式</p>
              <div className="grid grid-cols-2 gap-1">
                {(Object.keys(PLAY_MODE_LABELS) as ParamPlayMode[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => onConfigChange({ playMode: m })}
                    className={
                      'h-6 rounded border px-1.5 text-[10px] font-medium transition-colors ' +
                      (playMode === m
                        ? 'border-primary/50 bg-primary/15 text-primary'
                        : 'border-border/60 text-muted-foreground hover:bg-accent hover:text-foreground')
                    }
                  >
                    {PLAY_MODE_LABELS[m]}
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-between gap-2">
                <Label className="font-mono text-[9px] text-muted-foreground shrink-0">
                  速度 {speed}×
                </Label>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onConfigChange({ speed: Math.max(0.1, Math.round((speed / 2) * 10) / 10) })}
                    className="grid size-5 place-items-center rounded border border-border/60 text-[11px] text-muted-foreground hover:bg-accent"
                    aria-label="放慢速度"
                  >
                    −
                  </button>
                  <input
                    type="range"
                    min={0.1}
                    max={5}
                    step={0.1}
                    value={speed}
                    onChange={(e) => onConfigChange({ speed: parseFloat(e.target.value) })}
                    className="desmos-range h-2 w-24"
                    aria-label={`参数 ${name} 的播放速度`}
                  />
                  <button
                    type="button"
                    onClick={() => onConfigChange({ speed: Math.min(5, Math.round(speed * 2 * 10) / 10) })}
                    className="grid size-5 place-items-center rounded border border-border/60 text-[11px] text-muted-foreground hover:bg-accent"
                    aria-label="加快速度"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Desmos-style range slider                                         */
/* ------------------------------------------------------------------ */

/**
 * 原生 range input 的 Desmos 风格封装：
 *  - 视觉样式（粗轨道 / 大手柄 / 悬停放大）由 globals.css 的
 *    `.desmos-range` 作用域类提供，不影响其它 Radix 滑块；
 *  - 轨道渐变（min→current 为主色，current→max 为 muted）通过内联
 *    background 实时刷新，拖动/动画时手柄位置与填充同步移动；
 *  - 保留原生键盘可达性（←/→ 微调，Home/End 跳到端点）。
 */
function DesmosSlider({
  value,
  min,
  max,
  step,
  disabled,
  onChange,
  ariaLabel,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  disabled?: boolean;
  onChange: (v: number) => void;
  ariaLabel: string;
}) {
  const clamped = Math.min(max, Math.max(min, value));
  const pct = max > min ? ((clamped - min) / (max - min)) * 100 : 0;
  const safePct = Math.max(0, Math.min(100, pct));
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={clamped}
      disabled={disabled}
      onChange={(e) => {
        const v = parseFloat(e.target.value);
        if (Number.isFinite(v)) onChange(v);
      }}
      className="desmos-range h-2 min-w-0 flex-1"
      style={{
        background:
          `linear-gradient(to right, var(--primary, #2dd4bf) 0%, ` +
          `var(--primary, #2dd4bf) ${safePct}%, ` +
          `var(--muted, #3a3a3a) ${safePct}%, ` +
          `var(--muted, #3a3a3a) 100%)`,
      }}
      aria-label={ariaLabel}
    />
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
