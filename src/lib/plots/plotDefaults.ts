/**
 * Plot sampling defaults — mathjs-free module.
 *
 * `plot2d.ts` / `plot3d.ts` import the mathjs instance at module scope, so the
 * workbench shell used to pull the whole mathjs runtime (~1.4 MB) into the
 * initial bundle just to call the two setters below. Keeping the mutable
 * defaults in this tiny module lets the shell configure them without touching
 * the plotting engine, which is now only loaded when a plot is actually drawn.
 */

let defaultSampleCount = 800;

/** Update the module-level default sample count used by `sampleFunction` /
 * samplePolar` / `sampleParametric` / `sampleCurve` when no explicit count is
 * passed. Called from a React effect in Workbench. */
export function setDefaultSampleCount(n: number): void {
  if (!Number.isFinite(n)) return;
  defaultSampleCount = Math.max(2, Math.min(2000, Math.round(n)));
}

/** Current 2D sample count default (read at sample time). */
export function getDefaultSampleCount(): number {
  return defaultSampleCount;
}

let default3DResolution = 60;

/** Update the module-level default 3D mesh resolution used by
 * `sampleSurface` / `trySampleSurface` when no explicit resolution is passed.
 * Called from a React effect in Workbench. */
export function setDefault3DResolution(n: number): void {
  if (!Number.isFinite(n)) return;
  default3DResolution = Math.max(2, Math.min(200, Math.round(n)));
}

/** Current 3D mesh resolution default (read at sample time). */
export function getDefault3DResolution(): number {
  return default3DResolution;
}
