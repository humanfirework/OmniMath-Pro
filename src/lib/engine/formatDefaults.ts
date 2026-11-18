/**
 * Numeric formatting defaults — mathjs-free module.
 *
 * `latex.ts` imports the shared mathjs instance for `parse` / `format`, so the
 * workbench shell must not import it (or its precision setter) from there: that
 * would pull mathjs into the initial bundle. The mutable precision lives here
 * instead, and `latex.ts` reads it at format time.
 */

let resultPrecision = 10;

/** Update the module-level result precision (significant digits) used by
 * `formatNumber`. Called from a React effect in Workbench. */
export function setResultPrecision(n: number): void {
  if (!Number.isFinite(n)) return;
  resultPrecision = Math.max(2, Math.min(15, Math.round(n)));
}

/** Current result precision default (read at format time). */
export function getResultPrecision(): number {
  return resultPrecision;
}
