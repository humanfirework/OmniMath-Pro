/**
 * formatDefaults — 结果有效数字的读写与夹取。
 */

import { afterEach, describe, expect, it } from 'vitest';
import { getResultPrecision, setResultPrecision } from './formatDefaults';

const ORIGINAL = getResultPrecision();

afterEach(() => {
  setResultPrecision(ORIGINAL);
});

describe('formatDefaults', () => {
  it('stores a valid precision', () => {
    setResultPrecision(12.4);
    expect(getResultPrecision()).toBe(12);
  });

  it('clamps precision to [2, 15]', () => {
    setResultPrecision(0);
    expect(getResultPrecision()).toBe(2);
    setResultPrecision(99);
    expect(getResultPrecision()).toBe(15);
  });

  it('ignores non-finite values', () => {
    setResultPrecision(8);
    setResultPrecision(Number.NaN);
    expect(getResultPrecision()).toBe(8);
  });
});
