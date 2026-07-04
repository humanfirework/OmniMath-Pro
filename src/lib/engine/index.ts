/**
 * OmniMath Pro — Calculation engine public surface
 *
 * Single import point for the UI layer:
 *
 *   import {
 *     evaluateExpression,
 *     inputToLatex,
 *     type InputMode,
 *     type EvalResult,
 *   } from '@/lib/engine';
 *
 * Everything is pure (no React, no DOM) so the engine can be reused in
 * a Web Worker or on the server.
 */

// ── Public API ────────────────────────────────────────────────────
export { evaluateExpression, getScope, resetScope, setScopeVar } from './evaluator';
export { inputToLatex, resultToLatex, formatNumber, stepsToLatex } from './latex';
export { normalizeSymbols, symbolAliases } from './symbols';
export { lenientPreprocess, preprocessForMode } from './parser';
export {
  functionAliases,
  constantAliases,
  calculusSymbols,
  greekLetters,
  type SymbolAliasEntry,
} from './symbols';

// ── Types ─────────────────────────────────────────────────────────
export type {
  InputMode,
  EvalResult,
  CalcType,
  Scope,
  ScopeEntry,
  PlotType,
} from './types';
export {
  DEFAULT_CARTESIAN_RANGE,
  DEFAULT_POLAR_RANGE,
  DEFAULT_PARAMETRIC_RANGE,
} from './types';
