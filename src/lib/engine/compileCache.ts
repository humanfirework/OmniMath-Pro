/**
 * OmniMath Pro — Compiled-expression LRU cache
 *
 * `math.evaluate(expr, scope)` re-parses `expr` on EVERY call. Plot
 * sampling (plot2d / plot3d / plot2dAnalysis) evaluates the SAME
 * expression hundreds to thousands of times — once per sample point —
 * and re-samples on every slider drag / scope change, so the parse
 * cost dominates. `math.compile(expr)` pays the parse cost once and
 * returns a `CompiledExpression` whose `.evaluate(scope)` is cheap.
 *
 * This module caches those compiled expressions in a small LRU map:
 *   - key   — the expression string,
 *   - value — the mathjs `EvalFunction` (compiled expression),
 *   - cap   — `COMPILE_CACHE_CAPACITY` entries; the least-recently-used
 *             entry is evicted when the cache overflows.
 *
 * Correctness notes:
 *   - A compiled expression has NO scope baked in — callers pass the
 *     scope per evaluation, so cached entries stay valid across scope
 *     mutations (slider drags, variable assignments).
 *   - Compile failures THROW the same parse error `math.evaluate`
 *     would raise, and the failed expression is never inserted into
 *     the cache (no negative caching, no pollution).
 *
 * Pure module (no React, no DOM) — safe for Web Workers.
 */

import type { EvalFunction } from 'mathjs';
import { math } from './mathInstance';

/** Maximum number of compiled expressions kept in the cache. */
export const COMPILE_CACHE_CAPACITY = 100;

/* Map iteration order === insertion order, so the FIRST key is always
 * the least-recently-used entry. A cache hit re-inserts the key at the
 * tail to mark it most-recently-used. */
const cache = new Map<string, EvalFunction>();

/**
 * Compile `expr` with the shared mathjs instance, returning a cached
 * compiled expression when the same string was compiled before.
 *
 * @param expr mathjs expression string (e.g. `"sin(x) + x^2"`).
 * @returns    A compiled expression; call `.evaluate(scope)` per point.
 * @throws     The same parse error `math.evaluate(expr, …)` would raise
 *             for a malformed expression. Nothing is cached on failure.
 */
export function compileCached(expr: string): EvalFunction {
  const hit = cache.get(expr);
  if (hit !== undefined) {
    // Refresh recency: move the entry to the tail of the Map.
    cache.delete(expr);
    cache.set(expr, hit);
    return hit;
  }

  // Compile BEFORE touching the cache so a parse error never pollutes it.
  const compiled = math.compile(expr);

  cache.set(expr, compiled);
  if (cache.size > COMPILE_CACHE_CAPACITY) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) {
      cache.delete(oldest);
    }
  }
  return compiled;
}

/** Drop every cached compiled expression (e.g. on full engine reset). */
export function clearCompileCache(): void {
  cache.clear();
}
