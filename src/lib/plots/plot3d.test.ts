import { describe, it, expect } from 'vitest';
import { trySampleSurface } from './plot3d';

describe('trySampleSurface', () => {
  it('测试 1：sin(x)*cos(y) 正常采样', () => {
    const result = trySampleSurface('sin(x)*cos(y)', [-5, 5], [-5, 5]);
    expect(result.data).not.toBeNull();
    expect(result.error).toBeNull();
    if (result.data) {
      expect(result.data.validTriangleCount).toBeGreaterThan(0);
    }
  });

  it('测试 2：foobar(x,y) 未定义变量错误', () => {
    const result = trySampleSurface('foobar(x,y)', [-5, 5], [-5, 5]);
    expect(result.error).not.toBeNull();
    const hasUndefined = result.error?.includes('变量未定义') ?? false;
    const hasParseError = result.error?.includes('解析错误') ?? false;
    const hasNoGeometry = result.error?.includes('可绘制几何') ?? false;
    expect(hasUndefined || hasParseError || hasNoGeometry).toBe(true);
  });

  it('测试 3：log(-x^2 - y^2 - 1) 定义域错误或无几何', () => {
    const result = trySampleSurface('log(-x^2 - y^2 - 1)', [-5, 5], [-5, 5]);
    const domainError = result.error?.includes('定义域错误') ?? false;
    const noGeometry =
      (result.data !== null && result.data.validTriangleCount === 0) &&
      (result.error?.includes('可绘制几何') ?? false);
    expect(domainError || noGeometry).toBe(true);
  });

  it('测试 4：NaN 范围触发采样范围错误', () => {
    // @ts-expect-error 测试防御性 NaN 输入
    const result = trySampleSurface('x+y', [NaN, NaN], [0, 1]);
    expect(result.error).not.toBeNull();
    expect(result.error).toContain('采样范围错误');
  });

  it('测试 5：xMin===xMax 触发采样范围错误', () => {
    const result = trySampleSurface('x+y', [5, 5], [0, 1]);
    expect(result.error).not.toBeNull();
    expect(result.error).toContain('采样范围错误');
  });
});
