/**
 * OmniMath Pro — Calculation Engine Type Definitions
 *
 * Pure TypeScript types. No runtime side-effects.
 * Kept framework-agnostic so the engine can run server-side or in a Web Worker.
 */

/** The three input dialects supported by the workbench. */
export type InputMode = 'simple' | 'python' | 'matlab';

/** Coarse classification of a computation result, used by the UI to pick a renderer. */
export type CalcType =
  | 'number' // numeric / symbolic scalar (incl. complex)
  | 'matrix' // 2D matrix / vector
  | 'plot' // 2D cartesian plot
  | 'polar' // 2D polar plot
  | 'symbolic' // derivative / integral / taylor / limit
  | 'equation' // root finding / linear solve
  | 'error' // evaluation failed
  | 'assignment'; // variable or function was stored

/** The kind of plot the engine produced. Drives which renderer the UI uses. */
export type PlotType = 'cartesian' | 'polar' | 'parametric' | 'surface3d';

/** A live scope of variables and user-defined functions, keyed by name. */
export type Scope = Record<string, any>;

/** Canonical result envelope returned by `evaluateExpression`. */
export interface EvalResult {
  /** True when evaluation succeeded (no thrown error and not an error type). */
  success: boolean;
  /** Human-readable result string (e.g. "42", "x = 5", "Roots: 2, 3"). */
  result: string;
  /** LaTeX representation of the *result*, ready for KaTeX. */
  latex: string;
  /** Result classification. */
  type: CalcType;
  /** Optional error message (only when `success === false`). */
  error?: string;
  /** Optional suggestion to help the user recover (e.g. "Did you mean arctan(x)?"). */
  hint?: string;
  /** Snapshot of the scope after evaluation (useful for the Variables panel). */
  variables?: Scope;
  /** ─── Plot fields ─────────────────────────────────────────── */
  /** The mathjs expression string used to drive the plot. */
  plotExpression?: string;
  /** [xmin, xmax] for cartesian; [tmin, tmax] for parametric; [thetaMin, thetaMax] for polar. */
  plotRange?: [number, number];
  /** Which renderer to use. */
  plotType?: PlotType;
  /** Optional precomputed sample points (array of [x,y] or [r,θ]). */
  plotData?: any;
  /** ─── Matrix fields ───────────────────────────────────────── */
  /** True when the result is a 2D matrix / vector. */
  isMatrix?: boolean;
  /** The matrix as a plain JS array of arrays of numbers. */
  matrix?: number[][];
  /** ─── Step-by-step symbolic fields ───────────────────────── */
  /** Optional ordered list of explanation steps (LaTeX strings). */
  steps?: string[];
}

/** Convenience type for the serialized scope entry the UI displays. */
export interface ScopeEntry {
  name: string;
  value: any;
  type: 'number' | 'matrix' | 'function' | 'complex' | 'string' | 'unknown';
  latex?: string;
}

/** Default evaluation range for cartesian plots.
 *
 *  A wide initial viewport ([-100, 100]) gives users an "infinite canvas"
 *  feel; the renderer re-samples for the visible region as they pan/zoom,
 *  so exploration is effectively unbounded. */
export const DEFAULT_CARTESIAN_RANGE: [number, number] = [-100, 100];

/** Default range for polar plots — a full revolution. */
export const DEFAULT_POLAR_RANGE: [number, number] = [0, 2 * Math.PI];

/** Default range for parametric plots. */
export const DEFAULT_PARAMETRIC_RANGE: [number, number] = [0, 2 * Math.PI];
