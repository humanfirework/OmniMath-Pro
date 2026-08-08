/**
 * OmniMath Pro — Shared mathjs instance & reactive user scope
 *
 * SINGLE SOURCE OF TRUTH for all math evaluation in the app.
 *
 * Previously every module called `create(all)` on its own (evaluator,
 * plot2d, plot3d, plot2dAnalysis, latex, SolverPanel, LinearAlgebraPanel,
 * pipelineEngine — 8 instances). That caused three classes of bugs:
 *
 *   1. Semantic drift — the evaluator overrode `log` to base-10 and added
 *      `ln` / `lg` / `arctan` aliases, but plots used a bare instance, so
 *      `log(100)` evaluated to 2 in the console and 4.605 in a plot.
 *   2. Invisible variables — user variables lived in the evaluator's
 *      module-level scope, so `a = 3` followed by `plot(sin(a*x))`
 *      produced an empty curve (the slider linkage appeared "broken").
 *   3. Memory / startup overhead — each `create(all)` builds the full
 *      mathjs function registry (~1 MB per instance).
 *
 * This module owns:
 *   - `math`            — the ONE configured mathjs instance.
 *   - the user `scope`  — variables, matrices, user-defined functions.
 *   - a version counter + pub/sub so React components can re-sample
 *     plots the moment any variable changes (console assignment,
 *     slider drag, variable delete, scope reset, rehydration).
 *
 * Everything here is pure (no React, no DOM) — safe for Web Workers.
 * React components subscribe via `useScopeVersion()` in
 * `@/lib/hooks/useScopeVersion`.
 */

import { create, all, type MathJsInstance } from 'mathjs';
import type { Scope } from './types';
import { makeDistNamed, resolveDist } from '@/lib/probability/distributions';
import { mulberry32, toSeed } from '@/lib/probability/rng';

/* ================================================================== *
 * mathjs instance — created & configured exactly once
 * ================================================================== */
export const math: MathJsInstance = create(all);

/* Save a reference to the ORIGINAL `log` before we override it, so the
 * override can delegate without infinite recursion. */
const originalLog = (math as any).log.bind(math);

/* Override `log` so `log(100)` returns 2 (base-10) instead of 4.605
 * (natural). Users can still call `log(8, 2)` for an explicit base.
 * `ln` / `lg` / inverse-trig aliases match textbook notation.
 *
 * Because every consumer (console, 2D plots, 3D plots, analysis
 * overlays, blueprint pipeline) shares this instance, the semantics are
 * now identical everywhere. */
math.import(
  {
    log: function (x: any, base?: any) {
      if (base === undefined) return originalLog(x, 10);
      return originalLog(x, base);
    },
    ln: function (x: any) {
      return originalLog(x, Math.E);
    },
    lg: function (x: any) {
      return originalLog(x, 10);
    },
    arctan: function (x: any) {
      return math.atan(x);
    },
    arcsin: function (x: any) {
      return math.asin(x);
    },
    arccos: function (x: any) {
      return math.acos(x);
    },
  },
  { override: true }
);

/* ── exp → e^x 显示优化 ─────────────────────────────────────────────
 * 让所有 `node.toTex()` 把 `exp(x)` 渲染成 `e^{x}`（而不是 `\exp(x)`），
 * 使积分 / 导数 / 极限 / 普通表达式里出现 e 的指数时，都以手写数学形式
 * 呈现，更好看、更符合教科书写法。mathjs 的 FunctionNode.toTex 会优先
 * 读取函数对象上的 `toTex` 属性，这里直接挂在共享实例的 `exp` 上即可
 * 覆盖所有调用点（console / 绘图 / 蓝图）。 */
const expFn = (math as any).exp;
if (expFn && typeof expFn === 'function') {
  expFn.toTex = function (node: any, options: any): string {
    const args = node && node.args ? node.args : [];
    const opt = { ...(options || {}), implicit: 'hide' };
    if (args.length === 1) {
      return `e^{${args[0].toTex(opt)}}`;
    }
    // 兜底：退回到默认 exp 渲染
    return `\\exp\\left(${args.map((a: any) => a.toTex(opt)).join(',')}\\right)`;
  };
}

/* ================================================================== *
 * 概率分布函数 — 统一走 distributions.ts，供控制台 / 绘图 / 蓝图共用
 * ================================================================== *
 * 在表达式里可直接调用（参数为对象字面量）：
 *   distpdf('normal', 0, { mu: 0, sigma: 1 })
 *   distcdf('normal', 0, { mu: 0, sigma: 1 })
 *   distinv('normal', 0.975, { mu: 0, sigma: 1 })
 *   distsample('normal', 100, { mu: 0, sigma: 1 }, 42)   // 可种子复现
 * 以及常用便捷函数：
 *   normpdf(x, mu, sigma) / normcdf(x, mu, sigma) / norminv(p, mu, sigma)
 */
function toParams(raw: any): Record<string, number> {
  if (raw && typeof raw === 'object') {
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(raw)) {
      const n = typeof v === 'number' ? v : Number(v);
      out[k] = Number.isFinite(n) ? n : 0;
    }
    return out;
  }
  return {};
}

math.import(
  {
    distpdf: function (name: any, x: any, params: any) {
      const n = resolveDist(String(name ?? ''));
      const d = makeDistNamed(n ?? 'normal', toParams(params));
      return d.pdf(Number(x));
    },
    distcdf: function (name: any, x: any, params: any) {
      const n = resolveDist(String(name ?? ''));
      const d = makeDistNamed(n ?? 'normal', toParams(params));
      return d.cdf(Number(x));
    },
    distinv: function (name: any, p: any, params: any) {
      const n = resolveDist(String(name ?? ''));
      const d = makeDistNamed(n ?? 'normal', toParams(params));
      return d.inv(Number(p));
    },
    distsample: function (name: any, count: any, params: any, seed: any) {
      const n = resolveDist(String(name ?? ''));
      const d = makeDistNamed(n ?? 'normal', toParams(params));
      const c = Math.max(0, Math.floor(Number(count) || 0));
      const rng =
        seed !== undefined && String(seed) !== ''
          ? mulberry32(toSeed(seed))
          : undefined;
      const out: number[] = [];
      for (let i = 0; i < c; i++) out.push(d.sample(rng));
      return out;
    },
    normpdf: function (x: any, mu: any, sigma: any) {
      return makeDistNamed('normal', { mu: Number(mu) || 0, sigma: Number(sigma) || 1 }).pdf(Number(x));
    },
    normcdf: function (x: any, mu: any, sigma: any) {
      return makeDistNamed('normal', { mu: Number(mu) || 0, sigma: Number(sigma) || 1 }).cdf(Number(x));
    },
    norminv: function (p: any, mu: any, sigma: any) {
      return makeDistNamed('normal', { mu: Number(mu) || 0, sigma: Number(sigma) || 1 }).inv(Number(p));
    },
  },
  { override: true }
);

/* ================================================================== *
 * symbolicMath — 未做任何覆盖的独立实例（供符号求导路径使用）
 * ================================================================== *
 * 上面的共享实例把 `log` 覆盖成了 10 底对数（面向求值的产品语义，
 * 控制台 / 绘图 / 蓝图都依赖 `log(100) = 2`），但 mathjs 的符号求导
 * 内部用 `log` 表示自然对数（d/dx a^x = a^x·log(a)），`simplify`
 * 常量折叠时会按覆盖后的 log10 求值，产生错误的数值系数
 * （例如 d/dx 2^x 的系数变成 0.301 而非 ln 2 ≈ 0.693）。
 *
 * 因此符号路径（derivativeSteps 等）使用这个保持 mathjs 原生语义的
 * 独立实例：log = 自然对数，与求导函数表一致。共享实例的求值语义
 * 不受任何影响。
 */
export const symbolicMath: MathJsInstance = create(all);

/* ================================================================== *
 * Shared user scope + reactive version counter
 * ================================================================== *
 * Plain object so mathjs can read/write user variables. Functions
 * stored as callables work too — mathjs treats any callable value in
 * scope as a function.
 */
let scope: Scope = {};

/** Monotonic counter, incremented on EVERY scope mutation. */
let scopeVersion = 0;

/**
 * 动画专用版本号。参数播放动画每帧只写「数值型参数」到 scope，若每次都
 * bump scopeVersion，会让所有 useScopeVersion 订阅组件（DemosPanel 的 KaTeX、
 * Plot2DAdvancedPanel、FacetGrid、Plot3DPanel 等）在每帧全量重渲染 —— 这是
 * 拖动/播放动画卡顿的主因。因此动画帧走独立的 animVersion：只通知真正需要
 * 重采样重绘的 Plot2DCanvas，避免整棵子树每帧重渲染，逼近 Desmos 的流畅度。
 */
let animVersion = 0;

const listeners = new Set<() => void>();

/**
 * 动画专用订阅集。与 scopeVersion 的 listeners 分离，动画帧只唤醒它。
 * Plot2DCanvas（唯一需要随参数动画实时重绘的组件）同时订阅两者。
 */
const animListeners = new Set<() => void>();

/** Current scope object (live reference — mathjs mutates it in place). */
export function getScope(): Scope {
  return scope;
}

/** Current scope version (for `useSyncExternalStore`). */
export function getScopeVersion(): number {
  return scopeVersion;
}

/** 当前动画版本号（参数播放动画专用，避免整树重渲染）。 */
export function getAnimVersion(): number {
  return animVersion;
}

/**
 * Subscribe to scope mutations. Returns an unsubscribe function.
 * Compatible with React's `useSyncExternalStore`.
 */
export function subscribeScope(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Subscribe to animation-version mutations (parameter playback). */
export function subscribeAnim(listener: () => void): () => void {
  animListeners.add(listener);
  return () => {
    animListeners.delete(listener);
  };
}

/**
 * 仅通知动画订阅者（Plot2DCanvas）。参数播放动画的每帧更新走这里，
 * 不触碰 scopeVersion，从而避免 DemosPanel / AdvancedPanel / 3D 等
 * 无关组件在每帧被不必要地重渲染。
 */
export function bumpAnimVersion(): void {
  animVersion++;
  for (const l of animListeners) {
    try {
      l();
    } catch {
      // A broken listener must not take down the others.
    }
  }
}

/**
 * Notify all subscribers that the scope changed. Called automatically
 * by the mutators below; the evaluator also calls it after processing
 * an assignment (mathjs writes into the scope object directly, so the
 * mutators don't see those writes).
 */
export function bumpScopeVersion(): void {
  scopeVersion++;
  for (const l of listeners) {
    try {
      l();
    } catch {
      // A broken listener must not take down the others.
    }
  }
}

/** Set a single variable and notify. */
export function setScopeVar(name: string, value: any): void {
  scope[name] = value;
  bumpScopeVersion();
}

/**
 * 写参数值但只 bump 动画版本（不 bump scopeVersion）。供参数播放动画的
 * 每帧调用：只让 Plot2DCanvas 重采样重绘，避免整棵 React 子树每帧重渲染。
 * 动画停止后应调用一次 setScopeVar 把最终值落定（触发全局同步）。
 */
export function setScopeVarSilent(name: string, value: any): void {
  scope[name] = value;
  bumpAnimVersion();
}

/** Delete a single variable and notify (no-op if absent). */
export function deleteScopeVar(name: string): void {
  if (name in scope) {
    delete scope[name];
    bumpScopeVersion();
  }
}

/** Clear the whole scope and notify. */
export function resetScope(): void {
  scope = {};
  bumpScopeVersion();
}

/**
 * Replace the scope with the given variables (used to rehydrate the
 * engine from the persisted workbench store on app start).
 */
export function syncScope(vars: Record<string, unknown>): void {
  scope = { ...vars };
  bumpScopeVersion();
}

/**
 * Build an evaluation scope for sampling: a shallow copy of the user
 * scope with `extra` (e.g. the plot parameter `{ x: t }`) layered on
 * top so plot parameters shadow user variables of the same name.
 *
 * A copy (not the live object) is used so a stray `math.evaluate` can
 * never mutate the real user scope during sampling.
 */
export function getEvalScope(extra?: Record<string, unknown>): Record<string, unknown> {
  return extra ? { ...scope, ...extra } : { ...scope };
}
