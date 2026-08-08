import { describe, it, expect } from 'vitest';
import { evaluateExpression } from '@/lib/engine/evaluator';
import { preprocessForMode } from '@/lib/engine/parser';
import { normalizeSymbols } from '@/lib/engine/symbols';
import { extractFreeParameters } from '@/lib/engine/variableScanner';

describe('Demos polar auto-detection', () => {
  it('detects `r = sin(6θ)` as a polar plot (not an assignment)', () => {
    const res = evaluateExpression('r = sin(6θ)', 'simple');
    expect(res.success).toBe(true);
    expect(res.plotType).toBe('polar');
    expect(res.plotExpression).toContain('sin');
  });

  it('detects `r = sin(6*theta)` (latin theta) as polar too', () => {
    const res = evaluateExpression('r = sin(6*theta)', 'simple');
    expect(res.success).toBe(true);
    expect(res.plotType).toBe('polar');
  });

  it('does NOT treat `r = 5` as a polar plot (plain assignment)', () => {
    const res = evaluateExpression('r = 5', 'simple');
    expect(res.success).toBe(true);
    expect(res.plotType).toBeUndefined();
  });

  it('keeps `sin(x)` auto-cartesian working', () => {
    const res = evaluateExpression('sin(x)', 'simple');
    expect(res.success).toBe(true);
    expect(res.plotType).toBe('cartesian');
  });
});

describe('Demos preprocessing (implicit multiply with θ)', () => {
  it('normalizes latin theta to unicode θ', () => {
    expect(normalizeSymbols('sin(theta)')).toContain('θ');
  });

  it('parses `sin(6θ)` for sampling via mathjs implicit multiply', () => {
    // preprocess in simple mode should leave `6θ` intact; mathjs handles
    // the implicit multiply at compile time.
    const out = preprocessForMode('r = sin(6θ)', 'simple');
    expect(out).toContain('6θ');
  });
});

describe('Demos free-parameter detection', () => {
  it('does not treat θ/theta as a slider parameter', () => {
    const params = extractFreeParameters(['sin(6θ)'], []);
    expect(params).not.toContain('θ');
    expect(params).not.toContain('theta');
    expect(params).not.toContain('x');
  });

  it('treats `a` as a free parameter (slider candidate)', () => {
    const params = extractFreeParameters(['a*sin(x) + b'], []);
    expect(params).toContain('a');
    expect(params).toContain('b');
  });
});
