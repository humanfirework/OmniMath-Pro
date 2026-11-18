/**
 * plotDefaults — 采样默认值的读写与夹取。
 *
 * 这些默认值从绘图引擎里拆出来（mathjs-free），工作台外壳只依赖这里，
 * 因此必须保证 setter 的边界行为稳定：非法输入被忽略，越界被夹取。
 */

import { afterEach, describe, expect, it } from 'vitest';
import {
  getDefault3DResolution,
  getDefaultSampleCount,
  setDefault3DResolution,
  setDefaultSampleCount,
} from './plotDefaults';

const ORIGINAL_SAMPLES = getDefaultSampleCount();
const ORIGINAL_RESOLUTION = getDefault3DResolution();

afterEach(() => {
  setDefaultSampleCount(ORIGINAL_SAMPLES);
  setDefault3DResolution(ORIGINAL_RESOLUTION);
});

describe('plotDefaults', () => {
  it('rounds and stores a valid 2D sample count', () => {
    setDefaultSampleCount(1234.6);
    expect(getDefaultSampleCount()).toBe(1235);
  });

  it('clamps the 2D sample count to [2, 2000]', () => {
    setDefaultSampleCount(0);
    expect(getDefaultSampleCount()).toBe(2);
    setDefaultSampleCount(9999);
    expect(getDefaultSampleCount()).toBe(2000);
  });

  it('ignores non-finite values', () => {
    setDefaultSampleCount(600);
    setDefaultSampleCount(Number.NaN);
    expect(getDefaultSampleCount()).toBe(600);
    setDefaultSampleCount(Number.POSITIVE_INFINITY);
    expect(getDefaultSampleCount()).toBe(600);
  });

  it('clamps the 3D resolution to [2, 200]', () => {
    setDefault3DResolution(1);
    expect(getDefault3DResolution()).toBe(2);
    setDefault3DResolution(500);
    expect(getDefault3DResolution()).toBe(200);
    setDefault3DResolution(64.4);
    expect(getDefault3DResolution()).toBe(64);
  });
});
