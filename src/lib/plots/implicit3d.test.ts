import { describe, expect, it } from 'vitest';
import {
  parse3DEquation,
  splitTopLevelEquation,
  sampleImplicitSurface,
  trySampleImplicitSurface,
} from './implicit3d';

describe('splitTopLevelEquation', () => {
  it('splits a plain equation', () => {
    expect(splitTopLevelEquation('x + z = 1')).toEqual({ lhs: 'x + z', rhs: '1' });
  });

  it('ignores comparison and assignment operators', () => {
    expect(splitTopLevelEquation('a == 1')).toBeNull();
    expect(splitTopLevelEquation('a <= 1')).toBeNull();
    expect(splitTopLevelEquation('a >= 1')).toBeNull();
    expect(splitTopLevelEquation('a != 1')).toBeNull();
  });

  it('ignores equals inside function calls / brackets', () => {
    expect(splitTopLevelEquation('f(x = 1)')).toBeNull();
  });

  it('returns null when one side is empty', () => {
    expect(splitTopLevelEquation('z =')).toBeNull();
  });
});

describe('parse3DEquation', () => {
  it('recognises explicit z = f(x, y)', () => {
    const parsed = parse3DEquation('z = x^2 - y^2');
    expect(parsed).toMatchObject({
      kind: 'explicit',
      rhs: 'x^2 - y^2',
    });
  });

  it('recognises implicit equations', () => {
    const parsed = parse3DEquation('x + z = 1');
    expect(parsed).toEqual({
      kind: 'implicit',
      expression: 'x + z = 1',
      scalarField: '(x + z) - (1)',
    });
  });

  it('rejects expressions without an equals sign', () => {
    expect(parse3DEquation('sin(x)*cos(y)')).toBeNull();
  });
});

describe('sampleImplicitSurface', () => {
  it('renders the plane x + z = 1', () => {
    const data = sampleImplicitSurface('x + z = 1', [-5, 5], [-5, 5], undefined, 24);

    expect(data.validTriangleCount).toBeGreaterThan(0);
    expect(data.vertices.length).toBeGreaterThan(0);

    // 每个顶点都应满足方程（线性插值对平面是精确的）
    for (let i = 0; i < data.vertices.length; i += 3) {
      const x = data.vertices[i];
      const z = data.vertices[i + 2];
      expect(Math.abs(x + z - 1)).toBeLessThan(1e-4);
    }

    // 平面横跨包围盒（surface nets 顶点位于单元内部，两端会略小于边界）
    expect(data.zRange[0]).toBeGreaterThanOrEqual(-5);
    expect(data.zRange[1]).toBeLessThanOrEqual(5);
    expect(data.zRange[1] - data.zRange[0]).toBeGreaterThan(8);
  });

  it('renders a sphere x^2 + y^2 + z^2 = 4', () => {
    const data = sampleImplicitSurface(
      'x^2 + y^2 + z^2 = 4',
      [-3, 3],
      [-3, 3],
      undefined,
      28,
    );

    expect(data.validTriangleCount).toBeGreaterThan(100);

    // 顶点应落在半径 2 的球面附近（surface nets 的离散误差）
    for (let i = 0; i < data.vertices.length; i += 3) {
      const r = Math.hypot(
        data.vertices[i],
        data.vertices[i + 1],
        data.vertices[i + 2],
      );
      expect(Math.abs(r - 2)).toBeLessThan(0.2);
    }
  });

  it('honours an explicit z range', () => {
    const data = sampleImplicitSurface(
      'x + z = 1',
      [-5, 5],
      [-5, 5],
      [-2, 2],
      20,
    );
    expect(data.zRange[0]).toBeGreaterThanOrEqual(-2.01);
    expect(data.zRange[1]).toBeLessThanOrEqual(2.01);
  });

  it('returns an empty mesh when the surface is outside the box', () => {
    const data = sampleImplicitSurface(
      'x^2 + y^2 + z^2 = 100',
      [-1, 1],
      [-1, 1],
      undefined,
      16,
    );
    expect(data.validTriangleCount).toBe(0);
    expect(data.vertices.length).toBe(0);
  });
});

describe('trySampleImplicitSurface', () => {
  it('reports a friendly error when no geometry is produced', () => {
    const { data, error } = trySampleImplicitSurface(
      'x^2 + y^2 + z^2 = 100',
      [-1, 1],
      [-1, 1],
      undefined,
      16,
    );
    expect(data).not.toBeNull();
    expect(error).toContain('未生成可绘制几何');
  });

  it('reports a friendly error for undefined variables', () => {
    const { error } = trySampleImplicitSurface('a*x + z = 1', [-5, 5], [-5, 5]);
    expect(error).toContain('变量未定义');
  });
});
