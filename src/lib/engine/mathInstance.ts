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

const listeners = new Set<() => void>();

/** Current scope object (live reference — mathjs mutates it in place). */
export function getScope(): Scope {
  return scope;
}

/** Current scope version (for `useSyncExternalStore`). */
export function getScopeVersion(): number {
  return scopeVersion;
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
