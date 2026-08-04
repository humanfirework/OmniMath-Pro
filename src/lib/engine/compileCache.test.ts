/**
 * Unit tests for src/lib/engine/compileCache.ts
 *
 * 覆盖：compileCached 的缓存命中 / 多 scope 求值 / LRU 淘汰 /
 * 非法表达式抛错且不缓存，以及 clearCompileCache。
 * 这些都是纯逻辑，无 React / DOM 依赖，可独立验证。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  compileCached,
  clearCompileCache,
  COMPILE_CACHE_CAPACITY,
} from './compileCache';
import { math } from './mathInstance';

beforeEach(() => {
  clearCompileCache();
  vi.restoreAllMocks();
});

/* ---------------------------- compileCached ---------------------------- */

describe('compileCached', () => {
  it('returns the cached instance for repeated compiles of the same expression', () => {
    const spy = vi.spyOn(math, 'compile');
    const first = compileCached('sin(x) + x^2');
    const second = compileCached('sin(x) + x^2');
    const third = compileCached('sin(x) + x^2');

    expect(second).toBe(first);
    expect(third).toBe(first);
    // math.compile (the parse step) ran exactly once.
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('evaluates correctly under different scopes', () => {
    const compiled = compileCached('x^2 + a');
    expect(compiled.evaluate({ x: 1, a: 10 })).toBe(11);
    expect(compiled.evaluate({ x: 2, a: 10 })).toBe(14);
    expect(compiled.evaluate({ x: -3, a: 0 })).toBe(9);
  });

  it('evicts the least-recently-used entry once capacity is exceeded', () => {
    // Fill the cache to exactly capacity.
    const exprs = Array.from(
      { length: COMPILE_CACHE_CAPACITY },
      (_, i) => `x + ${i}`,
    );
    const first = compileCached(exprs[0]);
    const second = compileCached(exprs[1]);
    for (let i = 2; i < exprs.length; i++) {
      compileCached(exprs[i]);
    }

    // Refresh exprs[0] — now exprs[1] is the least-recently-used entry.
    expect(compileCached(exprs[0])).toBe(first);

    // One more unique expression overflows the cache → evicts exprs[1].
    compileCached(`x + ${COMPILE_CACHE_CAPACITY}`);

    // Recently used entry survives; the LRU entry was recompiled.
    expect(compileCached(exprs[0])).toBe(first);
    expect(compileCached(exprs[1])).not.toBe(second);
  });

  it('throws for an invalid expression and does not cache it', () => {
    const spy = vi.spyOn(math, 'compile');
    expect(() => compileCached('sin(')).toThrow();
    // A failed compile must not occupy a cache slot: compiling the same
    // bad expression again hits math.compile again instead of the cache.
    expect(() => compileCached('sin(')).toThrow();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('throws the same error message math.evaluate would produce', () => {
    let expected = '';
    try {
      math.evaluate('2 +');
    } catch (err) {
      expected = (err as Error).message;
    }
    expect(expected).not.toBe('');
    expect(() => compileCached('2 +')).toThrow(expected);
  });

  it('treats different expressions as different cache entries', () => {
    const a = compileCached('x + 1');
    const b = compileCached('x + 2');
    expect(a).not.toBe(b);
    expect(a.evaluate({ x: 1 })).toBe(2);
    expect(b.evaluate({ x: 1 })).toBe(3);
  });
});

/* -------------------------- clearCompileCache -------------------------- */

describe('clearCompileCache', () => {
  it('drops cached entries so the next compile re-parses', () => {
    const spy = vi.spyOn(math, 'compile');
    const first = compileCached('cos(x)');
    clearCompileCache();
    const second = compileCached('cos(x)');

    expect(second).not.toBe(first);
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
