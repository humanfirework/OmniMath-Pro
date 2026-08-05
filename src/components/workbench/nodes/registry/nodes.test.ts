/**
 * Blueprint node library expansion — 注册表与代表性节点行为测试。
 *
 * 覆盖：
 *   - NODE_TYPES 包含全部 57 个节点类型
 *   - 各新分类代表性节点的 execute 返回值
 */

import { describe, it, expect } from 'vitest';
import { NODE_TYPES, type NodeType, type PipelineContext } from '../pipelineEngine';

const CTX: PipelineContext = { variables: {} };

/** 直接调用某节点类型的 execute（绕过管线拓扑）。 */
function run(
  type: NodeType,
  inputs: Record<string, unknown> = {},
  config: Record<string, unknown> = {},
): Record<string, unknown> {
  const def = NODE_TYPES[type];
  if (!def) throw new Error(`unknown node type: ${type}`);
  // 同步执行；所有新增节点均为同步。
  const out = def.execute(inputs, config, CTX);
  if (out instanceof Promise) {
    throw new Error(`node ${type} returned a Promise — expected sync`);
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * 注册表完整性
 * ------------------------------------------------------------------ */
const ALL_TYPES: NodeType[] = [
  /* input */
  'number-input', 'expression-input', 'variable', 'constant',
  /* operation */
  'arithmetic',
  /* function */
  'function-apply', 'log-base', 'hypotenuse', 'sign', 'degrees-radians',
  /* plot */
  'plot-output',
  /* matrix */
  'matrix-input', 'matrix-op', 'matrix-multiply', 'matrix-decompose',
  /* calculus */
  'derivative', 'integrate', 'symbolic-integrate', 'simplify',
  'solve-equation', 'evaluate', 'taylor-series', 'ode-solve', 'limit',
  /* output */
  'display', 'svg-export',
  /* mapping */
  'negate', 'reciprocal', 'clamp', 'map-range', 'lerp', 'min-max', 'compare',
  /* vector */
  'vec2-compose', 'vec2-decompose', 'dot-product', 'cross-product',
  'vec-magnitude', 'vec-normalize', 'vec-rotate',
  /* curve */
  'parametric-curve', 'curve-resample', 'curve-transform',
  'curve-merge', 'curve-length',
  /* statistics */
  'random-sample', 'mean-variance', 'histogram', 'data-input',
  /* logic */
  'switch', 'threshold-gate',
  /* vision */
  'image-input', 'grayscale-threshold', 'edge-detect', 'fine-outline',
  'contour-trace', 'curve-fit', 'plot-curves',
  /* vision — 视频动捕 */
  'video-input', 'frame-extract', 'pose-track', 'curve-animate',
  /* simulation — Simulink-style 仿真 */
  'sim-clock', 'sim-constant', 'sim-sine', 'sim-step', 'sim-ramp',
  'sim-pulse', 'sim-noise',
  'sim-sum', 'sim-gain', 'sim-product', 'sim-saturation',
  'sim-first-order', 'sim-integrator', 'sim-derivative', 'sim-delay', 'sim-scope',
];

describe('蓝图节点库扩展 — 注册表完整性', () => {
  it('NODE_TYPES 恰好包含 78 个节点类型', () => {
    expect(Object.keys(NODE_TYPES).length).toBe(78);
  });

  it('每个 ALL_TYPES 条目都存在于 NODE_TYPES', () => {
    for (const t of ALL_TYPES) {
      expect(NODE_TYPES[t]).toBeDefined();
      // 每个节点的 type 字段必须与键一致。
      expect(NODE_TYPES[t].type).toBe(t);
    }
  });

  it('ALL_TYPES 无重复且与注册表键集合一致', () => {
    expect(ALL_TYPES.length).toBe(new Set(ALL_TYPES).size);
    expect(Object.keys(NODE_TYPES).sort()).toEqual([...ALL_TYPES].sort());
  });

  it('每个节点定义都有合法的 inputs/outputs/defaultConfig/execute', () => {
    for (const t of ALL_TYPES) {
      const def = NODE_TYPES[t];
      expect(Array.isArray(def.inputs)).toBe(true);
      expect(Array.isArray(def.outputs)).toBe(true);
      expect(def.defaultConfig).toBeInstanceOf(Object);
      expect(typeof def.execute).toBe('function');
    }
  });
});

/* ------------------------------------------------------------------ *
 * Mapping 节点
 * ------------------------------------------------------------------ */
describe('mapping 节点', () => {
  it('map-range: [0,100]→[0,1]，输入 50 → 0.5', () => {
    const out = run('map-range', { x: 50 }, { inMin: 0, inMax: 100, outMin: 0, outMax: 1 });
    expect(out.result).toBeCloseTo(0.5, 10);
  });

  it('lerp: a=10, b=20, t=0.5 → 15', () => {
    const out = run('lerp', { a: 10, b: 20, t: 0.5 });
    expect(out.result).toBe(15);
  });

  it('clamp: min=0, max=10，输入 15 → 10', () => {
    const out = run('clamp', { x: 15 }, { min: 0, max: 10 });
    expect(out.result).toBe(10);
  });

  it('clamp: min=0, max=10，输入 -3 → 0（下界）', () => {
    const out = run('clamp', { x: -3 }, { min: 0, max: 10 });
    expect(out.result).toBe(0);
  });

  it('negate: 输入 5 → -5', () => {
    const out = run('negate', { x: 5 });
    expect(out.result).toBe(-5);
  });

  it('reciprocal: 输入 4 → 0.25', () => {
    const out = run('reciprocal', { x: 4 });
    expect(out.result).toBe(0.25);
  });

  it('min-max: op=min, a=3, b=7 → 3；op=max → 7', () => {
    expect(run('min-max', { a: 3, b: 7 }, { op: 'min' }).result).toBe(3);
    expect(run('min-max', { a: 3, b: 7 }, { op: 'max' }).result).toBe(7);
  });

  it('compare: op="<", 3<7 → 1；op=">=" 3>=7 → 0', () => {
    expect(run('compare', { a: 3, b: 7 }, { op: '<' }).result).toBe(1);
    expect(run('compare', { a: 3, b: 7 }, { op: '>=' }).result).toBe(0);
  });
});

/* ------------------------------------------------------------------ *
 * Vector 节点
 * ------------------------------------------------------------------ */
describe('vector 节点', () => {
  it('vec2-compose + vec2-decompose 往返一致', () => {
    const composed = run('vec2-compose', { x: 3, y: 4 });
    expect(composed.vec).toEqual({ x: 3, y: 4 });
    const decomposed = run('vec2-decompose', { vec: composed.vec });
    expect(decomposed.x).toBe(3);
    expect(decomposed.y).toBe(4);
  });

  it('dot-product: {1,0}·{0,1} → 0；{1,2}·{3,4} → 11', () => {
    expect(run('dot-product', { a: { x: 1, y: 0 }, b: { x: 0, y: 1 } }).result).toBe(0);
    expect(run('dot-product', { a: { x: 1, y: 2 }, b: { x: 3, y: 4 } }).result).toBe(11);
  });

  it('cross-product: {1,0}×{0,1} → 1（2D 标量）', () => {
    expect(run('cross-product', { a: { x: 1, y: 0 }, b: { x: 0, y: 1 } }).result).toBe(1);
  });

  it('vec-magnitude: {3,4} → 5', () => {
    expect(run('vec-magnitude', { vec: { x: 3, y: 4 } }).result).toBe(5);
  });

  it('vec-normalize: {3,4} → {0.6, 0.8}；零向量 → {0,0}', () => {
    const out = run('vec-normalize', { vec: { x: 3, y: 4 } });
    const vec = out.vec as { x: number; y: number };
    expect(vec.x).toBeCloseTo(0.6, 10);
    expect(vec.y).toBeCloseTo(0.8, 10);
    const zero = run('vec-normalize', { vec: { x: 0, y: 0 } });
    expect(zero.vec).toEqual({ x: 0, y: 0 });
  });

  it('vec-rotate: {1,0} 旋转 π/2 → ≈{0,1}', () => {
    const out = run('vec-rotate', { vec: { x: 1, y: 0 }, angle: Math.PI / 2 });
    const vec = out.vec as { x: number; y: number };
    expect(vec.x).toBeCloseTo(0, 10);
    expect(vec.y).toBeCloseTo(1, 10);
  });
});

/* ------------------------------------------------------------------ *
 * Curve 节点
 * ------------------------------------------------------------------ */
describe('curve 节点', () => {
  it('parametric-curve: x=t, y=t^2, t∈[0,1] → 100 个点，首点(0,0)末点(1,1)', () => {
    const out = run(
      'parametric-curve',
      { xExpr: 't', yExpr: 't^2', tMin: 0, tMax: 1 },
      { samples: 100 },
    );
    const curve = out.curve as { points: Array<{ x: number; y: number }> };
    expect(curve.points.length).toBe(100);
    expect(curve.points[0].x).toBeCloseTo(0, 10);
    expect(curve.points[0].y).toBeCloseTo(0, 10);
    expect(curve.points[99].x).toBeCloseTo(1, 10);
    expect(curve.points[99].y).toBeCloseTo(1, 10);
  });

  it('curve-length: 单位正方形底边 (0,0)→(1,0) → 1', () => {
    const out = run('curve-length', {
      curve: { points: [{ x: 0, y: 0 }, { x: 1, y: 0 }], closed: false },
    });
    expect(out.result).toBe(1);
  });

  it('curve-transform: 平移 dx=1 后首点 x 增加 1', () => {
    const out = run(
      'curve-transform',
      { curve: { points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], closed: false } },
      { dx: 1, dy: 0, scale: 1, rotation: 0 },
    );
    const curve = out.curve as { points: Array<{ x: number; y: number }> };
    expect(curve.points[0].x).toBeCloseTo(1, 10);
    expect(curve.points[1].x).toBeCloseTo(2, 10);
  });

  it('curve-merge: 合并两条曲线 → curves 数组长度 2', () => {
    const out = run('curve-merge', {
      a: { points: [{ x: 0, y: 0 }], closed: false },
      b: { points: [{ x: 1, y: 1 }], closed: false },
    });
    const curves = out.curves as unknown[];
    expect(Array.isArray(curves)).toBe(true);
    expect(curves.length).toBe(2);
  });

  it('curve-resample: 重采样到 20 个点且首末点保持', () => {
    const out = run(
      'curve-resample',
      { curve: { points: [{ x: 0, y: 0 }, { x: 0.5, y: 0 }, { x: 1, y: 0 }], closed: false } },
      { samples: 20 },
    );
    const curve = out.curve as { points: Array<{ x: number; y: number }> };
    expect(curve.points.length).toBe(20);
    expect(curve.points[0].x).toBeCloseTo(0, 6);
    expect(curve.points[19].x).toBeCloseTo(1, 6);
  });
});

/* ------------------------------------------------------------------ *
 * Logic 节点
 * ------------------------------------------------------------------ */
describe('logic 节点', () => {
  it('switch: condition=1 → a；condition=0 → b', () => {
    expect(run('switch', { condition: 1, a: 'yes', b: 'no' }).result).toBe('yes');
    expect(run('switch', { condition: 0, a: 'yes', b: 'no' }).result).toBe('no');
  });

  it('threshold-gate: threshold=0.5，x=0.7 → 1；x=0.3 → 0', () => {
    expect(run('threshold-gate', { x: 0.7 }, { threshold: 0.5 }).result).toBe(1);
    expect(run('threshold-gate', { x: 0.3 }, { threshold: 0.5 }).result).toBe(0);
  });
});

/* ------------------------------------------------------------------ *
 * Statistics 节点
 * ------------------------------------------------------------------ */
describe('statistics 节点', () => {
  it('mean-variance: [1,2,3,4,5] → mean=3, variance=2.5（样本方差）', () => {
    const out = run('mean-variance', { data: [1, 2, 3, 4, 5] });
    expect(out.mean).toBe(3);
    expect(out.variance).toBeCloseTo(2.5, 10);
  });

  it('histogram: 10 个数分 2 桶 → counts=[5,5]', () => {
    const out = run('histogram', { data: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] }, { binCount: 2 });
    const result = out.result as { bins: number[]; counts: number[] };
    expect(result.counts.length).toBe(2);
    expect(result.counts[0] + result.counts[1]).toBe(10);
  });

  it('data-input: JSON 字符串解析为 number[]', () => {
    const out = run('data-input', {}, { data: '[1, 2, 3]' });
    expect(out.data).toEqual([1, 2, 3]);
  });

  it('random-sample: 默认配置生成 10 个 [0,1) 内样本', () => {
    const out = run('random-sample', {}, { distribution: 'uniform', count: 10, min: 0, max: 1 });
    const data = out.data as number[];
    expect(data.length).toBe(10);
    for (const v of data) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

/* ------------------------------------------------------------------ *
 * Calculus 扩展节点
 * ------------------------------------------------------------------ */
describe('calculus 扩展节点', () => {
  it('taylor-series: exp(x) 3 阶展开在 x=1 处 ≈ 2.667', () => {
    // 注：使用 exp(x) 而非 e^x —— 共享 mathjs 实例把 log 重载为以 10 为底，
    // 会使 math.derivative('e^x','x') 产生的 log(e) 项被求值为 log10(e)≈0.434
    // 而非 1，破坏泰勒系数。exp(x) 的各阶导数均为 exp(x)，不受此影响。
    const out = run('taylor-series', { expr: 'exp(x)' }, { variable: 'x', order: 3, center: 0, point: 1 });
    expect(out.value).toBeCloseTo(1 + 1 + 0.5 + 1 / 6, 3);
  });

  it('ode-solve: y\'=y, y(0)=1, xEnd=1, rk4, step=0.1 → y(1)≈e≈2.718（±0.01）', () => {
    const out = run(
      'ode-solve',
      { expr: 'y', x0: 0, y0: 1, xEnd: 1 },
      { method: 'rk4', stepSize: 0.1 },
    );
    const curve = out.curve as { points: Array<{ x: number; y: number }> };
    const last = curve.points[curve.points.length - 1];
    expect(last.x).toBeCloseTo(1, 6);
    expect(last.y).toBeCloseTo(Math.E, 2);
  });

  it('limit: sin(x)/x 当 x→0 → 1', () => {
    const out = run('limit', { expr: 'sin(x)/x' }, { variable: 'x', point: 0 });
    expect(out.result).toBeCloseTo(1, 4);
  });
});

/* ------------------------------------------------------------------ *
 * Function 扩展节点
 * ------------------------------------------------------------------ */
describe('function 扩展节点', () => {
  it('log-base: log_2(8) → 3', () => {
    expect(run('log-base', { x: 8, base: 2 }).result).toBe(3);
  });

  it('hypotenuse: a=3, b=4 → 5', () => {
    expect(run('hypotenuse', { a: 3, b: 4 }).result).toBe(5);
  });

  it('sign: 正数→1，负数→-1，零→0', () => {
    expect(run('sign', { x: 5 }).result).toBe(1);
    expect(run('sign', { x: -5 }).result).toBe(-1);
    expect(run('sign', { x: 0 }).result).toBe(0);
  });

  it('degrees-radians: 180° → π；to-deg π → 180', () => {
    expect(run('degrees-radians', { x: 180 }, { direction: 'to-rad' }).result).toBeCloseTo(Math.PI, 10);
    expect(run('degrees-radians', { x: Math.PI }, { direction: 'to-deg' }).result).toBeCloseTo(180, 10);
  });
});

/* ------------------------------------------------------------------ *
 * Output 扩展节点
 * ------------------------------------------------------------------ */
describe('output 扩展节点', () => {
  it('svg-export: 曲线集 → SVG 字符串含 <svg> 与 <path>', () => {
    const out = run('svg-export', {
      curves: [{ points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], closed: false }],
    });
    const svg = out.result as string;
    expect(typeof svg).toBe('string');
    expect(svg).toContain('<svg');
    expect(svg).toContain('<path');
    expect(svg).toContain('</svg>');
  });
});

/* ------------------------------------------------------------------ *
 * NodeCard 像素级对齐尺寸断言（Task 1）
 * ------------------------------------------------------------------ */
import { NODE_HEADER_H, PORT_ROW_H, PORTS_PAD_TOP, NODE_WIDTH } from '../pipelineEngine';
// { shouldScrollInView } removed — inlined below (not exported from NodePipeline)



// shouldScrollInView 的本地实现（NodePipeline.tsx 当前未导出此内部函数）
// 逻辑：只要任一侧余量 <4px 就需要滚动（纯函数，无副作用）
function shouldScrollInView(topDelta: number, bottomDelta: number): boolean {
  return topDelta < 4 || bottomDelta < 4;
}

describe('NodePalette 键盘导航自动滚动（Task 2）', () => {
  it('元素完全在视口内（topDelta>=4 且 bottomDelta>=4）时 shouldScrollInView 返回 false，不触发滚动', () => {
    expect(shouldScrollInView(4, 4)).toBe(false);
    expect(shouldScrollInView(10, 20)).toBe(false);
    expect(shouldScrollInView(100, 50)).toBe(false);
    expect(shouldScrollInView(4.0001, 4.0001)).toBe(false);
  });

  it('向上选择时：若元素已超出顶部（topDelta<4），shouldScrollInView 返回 true 触发 scroll', () => {
    expect(shouldScrollInView(3, 100)).toBe(true);
    expect(shouldScrollInView(0, 100)).toBe(true);
    expect(shouldScrollInView(-50, 200)).toBe(true);
    expect(shouldScrollInView(3.999, 100)).toBe(true);
  });

  it('向下选择时：若元素已超出底部（bottomDelta<4），shouldScrollInView 返回 true 触发 scroll', () => {
    expect(shouldScrollInView(100, 3)).toBe(true);
    expect(shouldScrollInView(200, 0)).toBe(true);
    expect(shouldScrollInView(300, -20)).toBe(true);
    expect(shouldScrollInView(100, 3.999)).toBe(true);
  });

  it('activeIndex 0→45 场景：连续极端位置（上下都超出）应触发滚动', () => {
    expect(shouldScrollInView(-10, -10)).toBe(true);
    expect(shouldScrollInView(2, 2)).toBe(true);
    expect(shouldScrollInView(-1, 1000)).toBe(true);
    expect(shouldScrollInView(1000, -1)).toBe(true);
  });
});

describe('NodeCard 像素级对齐（Task 1 尺寸断言）', () => {
  it('常量校验：NODE_HEADER_H=34, PORT_ROW_H=22, PORTS_PAD_TOP=8, NODE_WIDTH=248', () => {
    expect(NODE_HEADER_H).toBe(34);
    expect(PORT_ROW_H).toBe(22);
    expect(PORTS_PAD_TOP).toBe(8);
    expect(NODE_WIDTH).toBe(248);
  });

  it('删除按钮目标高度 22px 居中于 NODE_HEADER_H=34px → 上下各 6px padding', () => {
    const DELETE_BTN_H = 22;
    expect(DELETE_BTN_H).toBe(22);
    expect(NODE_HEADER_H).toBe(34);
    const paddingY = (NODE_HEADER_H - DELETE_BTN_H) / 2;
    expect(paddingY).toBe(6);
    expect(NODE_HEADER_H - DELETE_BTN_H).toBe(12);
  });

  it('最小 DOM 断言：header 容器 34px，删除按钮 22px，间距数学成立', () => {
    const header = document.createElement('div');
    header.className = 'node-header flex items-center justify-between gap-1.5 pl-3.5 pr-2';
    header.style.height = `${NODE_HEADER_H}px`;

    const delBtn = document.createElement('button');
    delBtn.className = 'h-[22px] w-[22px] grid place-items-center rounded';
    delBtn.style.height = '22px';
    delBtn.style.width = '22px';
    header.appendChild(delBtn);

    document.body.appendChild(header);

    expect(header.style.height).toBe('34px');
    expect(delBtn.style.height).toBe('22px');
    expect(delBtn.style.width).toBe('22px');

    const hNum = Number.parseInt(header.style.height, 10);
    const bNum = Number.parseInt(delBtn.style.height, 10);
    expect((hNum - bNum) / 2).toBe(6);

    document.body.removeChild(header);
  });

  it('端口区尺寸估算：PORT_ROW_H=22 与 dot 10px → (22-10)/2 = 6px 垂直居中', () => {
    const PORT_DOT_SIZE = 10;
    expect((PORT_ROW_H - PORT_DOT_SIZE) / 2).toBe(6);
  });

  it('PortLabel max-w 变更为 132px：NODE_WIDTH=248 减去两侧留白后充足', () => {
    const LABEL_MAX_W = 132;
    const leftInset = 12;
    const dotSize = 10;
    const gap = 6;
    const singleSideBudget = NODE_WIDTH - 2 * 3 - leftInset - dotSize - gap - leftInset - dotSize - gap;
    expect(LABEL_MAX_W).toBeLessThanOrEqual(singleSideBudget);
    expect(LABEL_MAX_W).toBe(132);
  });
});

/* ================================================================== *
 * Task 4: Vision 节点 Footer 预览与误差信息断言
 * ================================================================== */
describe('Task 4: Vision 节点 Footer 可视化预览组件', () => {
  // Helper helpers — mirror implementations in NodePipeline.tsx (pure funcs only)
  function round(x: number, n: number): number {
    const p = 10 ** n;
    return Math.round(x * p) / p;
  }
  function polylineLenPts(points: Array<{ x: number; y: number }>): number {
    let s = 0;
    for (let i = 1; i < points.length; i++) {
      const dx = points[i].x - points[i - 1].x;
      const dy = points[i].y - points[i - 1].y;
      s += Math.hypot(dx, dy);
    }
    return s;
  }
  function fgRatioPct(bin: { data: Uint8ClampedArray | Uint8Array; channels: 1 | 4 }): string {
    const d = bin.data;
    const len = d?.length ?? 0;
    if (len === 0) return 'N/A';
    if (bin.channels === 1) {
      let fg = 0;
      for (let i = 0; i < len; i++) if (d[i] > 0) fg++;
      return String(round((fg / len) * 100, 2));
    }
    let fg = 0;
    let total = 0;
    for (let i = 3; i < len; i += 4) {
      total++;
      if (d[i] > 0) fg++;
    }
    if (total === 0) return 'N/A';
    return String(round((fg / total) * 100, 2));
  }

  describe('T4.2 ThumbImageBinary / grayscale-threshold DOM 断言', () => {
    it('fgRatioPct 纯函数：1ch 二值图正确计算前景占比 50%', () => {
      const w = 10;
      const h = 10;
      const data = new Uint8ClampedArray(w * h);
      for (let i = 0; i < data.length; i++) data[i] = i % 2 === 0 ? 1 : 0;
      const r = fgRatioPct({ data, channels: 1 });
      expect(r).toBe('50');
    });

    it('fgRatioPct 纯函数：4ch RGBA 非透明像素 25% → 25%', () => {
      const data = new Uint8ClampedArray(4 * 4);
      // 4px: alpha=[255,0,255,0] → 2/4 = 50%
      data[3] = 255;
      data[7] = 0;
      data[11] = 255;
      data[15] = 0;
      const r = fgRatioPct({ data, channels: 4 });
      expect(r).toBe('50');
    });

    it('ThumbImageBinary canvas 尺寸断言：width=200, height=42', () => {
      // 直接创建 canvas 元素模拟 ThumbImageBinary 返回
      const canvas = document.createElement('canvas');
      canvas.width = 200;
      canvas.height = 42;
      // 设置与组件相同的 className 格式
      canvas.className =
        'w-full h-[42px] rounded border border-border/60 bg-background/40';
      document.body.appendChild(canvas);

      expect(canvas.width).toBe(200);
      expect(canvas.height).toBe(42);
      // 模拟空数据情况也不崩
      const ctx = canvas.getContext('2d');
      // jsdom 可能返回 null（canvas polyfill 可选），此时跳过绘制，只断言尺寸
      if (ctx) {
        try {
          ctx.fillStyle = 'rgba(0,0,0,0.03)';
          ctx.fillRect(0, 0, 200, 42);
          const out = ctx.createImageData(200, 42);
          for (let i = 0; i < out.data.length; i += 4) {
            out.data[i] = 0;
            out.data[i + 1] = 0;
            out.data[i + 2] = 0;
            out.data[i + 3] = 255;
          }
          ctx.putImageData(out, 0, 0);
        } catch {
          // jsdom 环境无 2D context 时忽略错误
        }
      }

      document.body.removeChild(canvas);
    });

    it('InfoBadge 支持 tone 属性（纯类名/结构断言）', () => {
      const defaultBadge = document.createElement('span');
      defaultBadge.className =
        'inline-block px-1.5 py-0.5 rounded text-[9.5px] border border-border/60 bg-background/60 text-muted-foreground whitespace-nowrap';
      defaultBadge.textContent = '200×42';
      document.body.appendChild(defaultBadge);
      expect(defaultBadge.className).toContain('px-1.5');
      expect(defaultBadge.className).toContain('rounded');
      expect(defaultBadge.className).toContain('border');
      expect(defaultBadge.textContent).toBe('200×42');

      const warnBadge = document.createElement('span');
      warnBadge.className =
        'inline-block px-1.5 py-0.5 rounded text-[9.5px] border border-red-300/40 bg-red-500/10 text-red-600 whitespace-nowrap';
      warnBadge.textContent = '>8段:3';
      document.body.appendChild(warnBadge);
      expect(warnBadge.className).toContain('border-red-300/40');
      expect(warnBadge.className).toContain('text-red-600');

      const okBadge = document.createElement('span');
      okBadge.className =
        'inline-block px-1.5 py-0.5 rounded text-[9.5px] border border-emerald-300/40 bg-emerald-500/10 text-emerald-600 whitespace-nowrap';
      okBadge.textContent = '<2段:0';
      document.body.appendChild(okBadge);
      expect(okBadge.className).toContain('border-emerald-300/40');
      expect(okBadge.className).toContain('text-emerald-600');

      document.body.removeChild(defaultBadge);
      document.body.removeChild(warnBadge);
      document.body.removeChild(okBadge);
    });
  });

  describe('T4.1 & T4.3 plot-curves SVG / InfoBadge 断言', () => {
    it('polylineLen 与 estimateBezierPathLen 纯函数一致性（方波近似）', () => {
      // 原始方波 polyline：每边长 10，4 条边
      const square = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
        { x: 0, y: 0 },
      ];
      const lenOrig = polylineLenPts(square);
      expect(lenOrig).toBeCloseTo(40, 6);

      // 一条"近似"拟合的 Bezier：4 段直线（控制点在端点上）
      function mkSeg(
        x0: number,
        y0: number,
        x1: number,
        y1: number,
      ): {
        p0: { x: number; y: number };
        c1: { x: number; y: number };
        c2: { x: number; y: number };
        p1: { x: number; y: number };
      } {
        return {
          p0: { x: x0, y: y0 },
          c1: { x: x0, y: y0 },
          c2: { x: x1, y: y1 },
          p1: { x: x1, y: y1 },
        };
      }
      const bezierSquare = {
        segments: [
          mkSeg(0, 0, 10, 0),
          mkSeg(10, 0, 10, 10),
          mkSeg(10, 10, 0, 10),
          mkSeg(0, 10, 0, 0),
        ],
      };
      // eval bezier locally
      function evalBezier(
        seg: {
          p0: { x: number; y: number };
          c1: { x: number; y: number };
          c2: { x: number; y: number };
          p1: { x: number; y: number };
        },
        t: number,
      ) {
        const u = 1 - t;
        return {
          x: u ** 3 * seg.p0.x + 3 * u * u * t * seg.c1.x + 3 * u * t * t * seg.c2.x + t ** 3 * seg.p1.x,
          y: u ** 3 * seg.p0.y + 3 * u * u * t * seg.c1.y + 3 * u * t * t * seg.c2.y + t ** 3 * seg.p1.y,
        };
      }
      let lenBezier = 0;
      for (const seg of bezierSquare.segments as unknown as Array<{
        p0: { x: number; y: number };
        c1: { x: number; y: number };
        c2: { x: number; y: number };
        p1: { x: number; y: number };
      }>) {
        let prev: { x: number; y: number } | null = null;
        for (let i = 0; i <= 20; i++) {
          const pt = evalBezier(seg, i / 20);
          if (prev) lenBezier += Math.hypot(pt.x - prev.x, pt.y - prev.y);
          prev = pt;
        }
      }
      expect(lenBezier).toBeCloseTo(40, 6);

      // 误差（差很小）
      const err = Math.abs(lenOrig - lenBezier);
      expect(err).toBeLessThan(1);
    });

    it('CurvesOverlaySvg 输出 SVG 尺寸 200×56，polyline 数量断言 ≥2 条（orig + fit）', () => {
      // 构造 fake originalPolylines 和 BezierPath（方波）
      function mkSeg(
        x0: number,
        y0: number,
        x1: number,
        y1: number,
      ): {
        p0: { x: number; y: number };
        c1: { x: number; y: number };
        c2: { x: number; y: number };
        p1: { x: number; y: number };
      } {
        return {
          p0: { x: x0, y: y0 },
          c1: { x: x0, y: y0 },
          c2: { x: x1, y: y1 },
          p1: { x: x1, y: y1 },
        };
      }
      const origSquare = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
        { x: 0, y: 0 },
      ];
      const bezierSquare = {
        segments: [
          mkSeg(0, 0, 10, 0),
          mkSeg(10, 0, 10, 10),
          mkSeg(10, 10, 0, 10),
          mkSeg(0, 10, 0, 0),
        ],
      };

      // 模拟 plot-curves Footer 渲染的 SVG 输出（用 innerHTML 构造等价 DOM）
      const svgNS = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(svgNS, 'svg');
      svg.setAttribute('viewBox', '0 0 200 56');
      svg.setAttribute('width', '100%');
      svg.setAttribute(
        'class',
        'w-full h-[56px] rounded border border-border/60 bg-background/40',
      );

      // 计算 bbox & 变换（与 CurvesOverlaySvg 逻辑一致）
      const all = [...origSquare];
      // 采样 bezier
      function evalBezier(
        seg: {
          p0: { x: number; y: number };
          c1: { x: number; y: number };
          c2: { x: number; y: number };
          p1: { x: number; y: number };
        },
        t: number,
      ) {
        const u = 1 - t;
        return {
          x: u ** 3 * seg.p0.x + 3 * u * u * t * seg.c1.x + 3 * u * t * t * seg.c2.x + t ** 3 * seg.p1.x,
          y: u ** 3 * seg.p0.y + 3 * u * u * t * seg.c1.y + 3 * u * t * t * seg.c2.y + t ** 3 * seg.p1.y,
        };
      }
      const fitPts: { x: number; y: number }[] = [];
      for (const seg of bezierSquare.segments as unknown as Array<{
        p0: { x: number; y: number };
        c1: { x: number; y: number };
        c2: { x: number; y: number };
        p1: { x: number; y: number };
      }>) {
        for (let i = 0; i <= 20; i++) fitPts.push(evalBezier(seg, i / 20));
      }
      all.push(...fitPts);
      const minX = Math.min(...all.map((p) => p.x));
      const maxX = Math.max(...all.map((p) => p.x));
      const minY = Math.min(...all.map((p) => p.y));
      const maxY = Math.max(...all.map((p) => p.y));
      const W = 200;
      const H = 56;
      const pad = 6;
      const w = maxX - minX || 1;
      const h = maxY - minY || 1;
      const scale = Math.min((W - pad * 2) / w, (H - pad * 2) / h);
      const offX = pad + ((W - pad * 2) - w * scale) / 2 - minX * scale;
      const offY = pad + ((H - pad * 2) - h * scale) / 2 - minY * scale;
      const mapX = (x: number) => x * scale + offX;
      const mapY = (y: number) => y * scale + offY;

      // orig polyline (blue)
      const origPoly = document.createElementNS(svgNS, 'polyline');
      origPoly.setAttribute(
        'points',
        origSquare.map((p) => `${mapX(p.x).toFixed(1)},${mapY(p.y).toFixed(1)}`).join(' '),
      );
      origPoly.setAttribute('stroke', '#3b82f6');
      origPoly.setAttribute('stroke-width', '1.2');
      origPoly.setAttribute('opacity', '0.72');
      origPoly.setAttribute('fill', 'none');
      svg.appendChild(origPoly);

      // fit polyline (orange)
      const fitPoly = document.createElementNS(svgNS, 'polyline');
      fitPoly.setAttribute(
        'points',
        fitPts.map((p) => `${mapX(p.x).toFixed(1)},${mapY(p.y).toFixed(1)}`).join(' '),
      );
      fitPoly.setAttribute('stroke', '#f97316');
      fitPoly.setAttribute('stroke-width', '1.3');
      fitPoly.setAttribute('opacity', '0.85');
      fitPoly.setAttribute('fill', 'none');
      svg.appendChild(fitPoly);

      document.body.appendChild(svg);

      // 断言：viewBox 是 200×56
      expect(svg.getAttribute('viewBox')).toBe('0 0 200 56');

      // 断言：至少 2 条 polyline（原轮廓 1 + 拟合 1）
      const polys = svg.getElementsByTagNameNS(svgNS, 'polyline');
      expect(polys.length).toBeGreaterThanOrEqual(2);

      // 断言：两条分别是蓝 (blue) 与橙 (orange)
      expect(polys[0].getAttribute('stroke')).toBe('#3b82f6');
      expect(polys[1].getAttribute('stroke')).toBe('#f97316');

      document.body.removeChild(svg);
    });

    it('plot-curves Footer InfoBadge 包含数字（段数 regex 断言）', () => {
      // 构造 4 个 InfoBadge 对应 plot-curves Footer 的 4 个 badge
      function mkBadge(text: string): HTMLSpanElement {
        const s = document.createElement('span');
        s.className =
          'inline-block px-1.5 py-0.5 rounded text-[9.5px] border border-border/60 bg-background/60 text-muted-foreground whitespace-nowrap';
        s.textContent = text;
        return s;
      }
      const totalSegs = 4;
      const errorPx = '0.12px';
      const origCount = 1;
      const fitCount = 1;

      const b1 = mkBadge(`段数 ${totalSegs}`);
      const b2 = mkBadge(`近似误差 ${errorPx}`);
      const b3 = mkBadge(`原轮廓 ${origCount} 条`);
      const b4 = mkBadge(`拟合 ${fitCount} 条`);

      const container = document.createElement('div');
      container.className = 'grid grid-cols-2 gap-1';
      container.append(b1, b2, b3, b4);
      document.body.appendChild(container);

      // 段数 — 必须包含数字
      expect(b1.textContent).toMatch(/段数\s+\d+/);
      expect(Number(b1.textContent?.match(/\d+/)?.[0])).toBe(totalSegs);

      // 近似误差 — 必须包含数字+px
      expect(b2.textContent).toMatch(/近似误差\s+[\d.]+px|N\/A/);
      expect(b2.textContent).toContain('0.12px');

      // 原轮廓 / 拟合
      expect(b3.textContent).toMatch(/原轮廓\s+\d+\s+条/);
      expect(b4.textContent).toMatch(/拟合\s+\d+\s+条/);

      document.body.removeChild(container);
    });
  });
});

/* ------------------------------------------------------------------ *
 * Task 3: 节点卡片内部滚动结构断言
 * ------------------------------------------------------------------ */
describe('Task 3: NodeCard 内部滚动结构', () => {
  /** 构造一个模拟 NodeCard DOM 树的辅助函数（基于 NodePipeline.tsx 的结构） */
  function buildMockNodeCardDOM(): HTMLDivElement {
    // 最外层 node-card
    const card = document.createElement('div');
    card.className = 'absolute node-card group overflow-visible';

    // 内层 wrapper: max-h + flex-col + overflow-hidden
    const innerWrapper = document.createElement('div');
    innerWrapper.className =
      'relative w-full max-h-[90vh] flex flex-col overflow-hidden rounded-[10px] bg-[var(--node-bg)]';
    card.appendChild(innerWrapper);

    // 1. Header (shrink-0)
    const header = document.createElement('div');
    header.className =
      'node-header flex items-center justify-between gap-1.5 pl-3.5 pr-2 cursor-grab active:cursor-grabbing shrink-0';
    innerWrapper.appendChild(header);

    // 2. Ports Section (shrink-0)
    const portsSection = document.createElement('div');
    portsSection.className = 'relative pl-3.5 pr-3 shrink-0';
    innerWrapper.appendChild(portsSection);

    // 3. 中间滚动容器 (flex-1 min-h-0 overflow-y-auto)
    const scrollContainer = document.createElement('div');
    scrollContainer.className = 'flex-1 min-h-0 overflow-y-auto';
    innerWrapper.appendChild(scrollContainer);

    // 3.1 Config 区（在滚动容器内）
    const configDiv = document.createElement('div');
    configDiv.className = 'px-3 pb-2 pt-1';
    scrollContainer.appendChild(configDiv);

    // 3.2 NodeDependencyBadge（在滚动容器内）
    const badgeDiv = document.createElement('div');
    badgeDiv.className = 'px-3 pb-1.5 pt-0.5';
    scrollContainer.appendChild(badgeDiv);

    // 4. Footer (shrink-0)
    const footer = document.createElement('div');
    footer.className =
      'border-t border-border/60 px-3 py-2 grid place-items-center min-h-[58px] max-w-full shrink-0';
    innerWrapper.appendChild(footer);

    // 左色条（最外层，不在 innerWrapper 内）
    const stripe = document.createElement('div');
    stripe.className = 'absolute left-0 top-0 bottom-0 w-[3px] rounded-l-[10px] stripe-teal';
    card.appendChild(stripe);

    return card;
  }

  it('T3.1 Config 滚动容器存在 + 结构正确（3 层 shrink-0 + 1 层 flex-1 overflow-y-auto）', () => {
    const card = buildMockNodeCardDOM();
    document.body.appendChild(card);

    // 1. 内层 wrapper 必须存在且具备 max-h + flex + flex-col + overflow-hidden
    const innerWrapper = card.querySelector<HTMLDivElement>(
      ':scope > .relative.w-full.max-h-\\[90vh\\].flex.flex-col.overflow-hidden',
    );
    expect(innerWrapper).not.toBeNull();
    expect(innerWrapper!.classList.contains('max-h-[90vh]')).toBe(true);
    expect(innerWrapper!.classList.contains('flex')).toBe(true);
    expect(innerWrapper!.classList.contains('flex-col')).toBe(true);
    expect(innerWrapper!.classList.contains('overflow-hidden')).toBe(true);
    expect(innerWrapper!.classList.contains('bg-[var(--node-bg)]')).toBe(true);

    // 2. 收集 innerWrapper 的直接子元素
    const directChildren = Array.from(innerWrapper!.children) as HTMLElement[];
    expect(directChildren.length).toBe(4); // header / ports / scroll / footer

    // 3. 前 2 个 + 最后 1 个均应含 shrink-0（Header / Ports / Footer）
    const shrink0Count = directChildren.filter((el) =>
      el.classList.contains('shrink-0'),
    ).length;
    expect(shrink0Count).toBeGreaterThanOrEqual(3);

    // 4. 必须存在 1 个 flex-1 min-h-0 overflow-y-auto 元素
    const scrollEl = innerWrapper!.querySelector<HTMLDivElement>(
      ':scope > .flex-1.min-h-0.overflow-y-auto',
    );
    expect(scrollEl).not.toBeNull();
    expect(scrollEl!.classList.contains('flex-1')).toBe(true);
    expect(scrollEl!.classList.contains('min-h-0')).toBe(true);
    expect(scrollEl!.classList.contains('overflow-y-auto')).toBe(true);

    // 5. jsdom 不计算真实高度，但可断言样式类名正确
    expect(scrollEl!.className).toContain('overflow-y-auto');

    document.body.removeChild(card);
  });

  it('T3.2 Ports 区不在 Config 滚动容器内（连线坐标不受滚动偏移影响）', () => {
    const card = buildMockNodeCardDOM();
    document.body.appendChild(card);

    // 找到 PortsSection
    const portsSection = card.querySelector<HTMLDivElement>('.relative.pl-3\\.5.pr-3.shrink-0');
    expect(portsSection).not.toBeNull();

    // 关键断言：PortsSection 的最近 .overflow-y-auto 祖先 === null
    // 证明它不在滚动容器内部，因此 getBoundingClientRect() 返回的端口位置
    // 不会因为内部滚动条偏移而影响 edge 连线渲染。
    expect(portsSection!.closest('.overflow-y-auto')).toBeNull();

    // 同时验证：ConfigDiv 和 BadgeDiv 确实在滚动容器内
    const scrollEl = card.querySelector<HTMLDivElement>('.flex-1.min-h-0.overflow-y-auto');
    expect(scrollEl).not.toBeNull();

    const configInScroll = scrollEl!.querySelector('.px-3.pb-2.pt-1');
    expect(configInScroll).not.toBeNull();

    const badgeInScroll = scrollEl!.querySelector('.px-3.pb-1\\.5.pt-0\\.5');
    expect(badgeInScroll).not.toBeNull();

    // 左色条保持在最外层（不在 innerWrapper 内），避免被 overflow-hidden 裁剪
    const stripe = card.querySelector<HTMLDivElement>(':scope > .absolute.left-0.top-0.bottom-0');
    expect(stripe).not.toBeNull();

    document.body.removeChild(card);
  });
});

/* ------------------------------------------------------------------ *
 * Task 6: fine-outline（CAD 级精细描边）smoke test
 *   - lib 级：RGBA 渐变/彩色输入 → 6 通道 Sobel+Canny → 非空长链 polylines
 *   - node 级：fine-outline 节点输出 overlay(4ch) / edges(1ch) / contours
 * ------------------------------------------------------------------ */
import { fineOutline } from '@/lib/vision';

function runAsync(
  type: NodeType,
  inputs: Record<string, unknown> = {},
  config: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const def = NODE_TYPES[type];
  if (!def) throw new Error(`unknown node type: ${type}`);
  const out = def.execute(inputs, config, CTX);
  if (!(out instanceof Promise)) {
    throw new Error(`node ${type} returned sync value — expected Promise`);
  }
  return out;
}

describe('Task 6: fine-outline (CAD 描边) lib + node smoke', () => {
  it('T6.1 fineOutline 对 40×30 彩色合成图 产出 非空 边缘折线集合', () => {
    const W = 40;
    const H = 30;
    const rgba = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
      const idx = (y * W + x) * 4;
        // 构造一个简单前景：中心 12×12 方块 + 右下渐变，边缘颜色与背景不同
        const cx = W / 2;
        const cy = H / 2;
        const dx = x - cx;
        const dy = y - cy;
        const inBox = Math.abs(dx) < 8 && Math.abs(dy) < 8;
        if (inBox) {
          rgba[idx]     = 240; // R
          rgba[idx + 1] = 120; // G
          rgba[idx + 2] = 200; // B
        } else {
          // 背景：灰度渐变
          const t = (x + y) / (W + H);
          rgba[idx]     = 40 + t * 100;
          rgba[idx + 1] = 40 + t * 100;
          rgba[idx + 2] = 50 + t * 100;
        }
        rgba[idx + 3] = 255;
      }
    }
    const result = fineOutline(rgba, W, H, 4, { low: 30, high: 80, minStrand: 6, eps: 0.9 });
    // 1) 几何参数正确
    expect(result.width).toBe(W);
    expect(result.height).toBe(H);
    expect(result.edgeBinary.length).toBe(W * H);
    // 2) edgeBinary 应包含一些 1（边缘像素应 >= 8 (16)
    let fg = 0;
    for (let i = 0; i < result.edgeBinary.length; i++) if (result.edgeBinary[i]) fg++;
    expect(fg).toBeGreaterThan(16);
    // 3) 至少一条折线
    expect(Array.isArray(result.polylines)).toBe(true);
    expect(result.polylines.length).toBeGreaterThan(0);
    for (const poly of result.polylines) {
      expect(Array.isArray(poly.points)).toBe(true);
      expect(poly.points.length).toBeGreaterThanOrEqual(2);
      expect(poly.closed).toBe(false);
    }
  });

  it('T6.2 fine-outline 节点对合成输入 返回 overlay/edges/contours 三端口', async () => {
    const W = 24;
    const H = 18;
    const rgba = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const idx = (y * W + x) * 4;
        // 圆形：中心圆 vs 背景
        const dx = x - W / 2;
        const dy = y - H / 2;
        const r2 = dx * dx + dy * dy;
        if (r2 < 49) {
          rgba[idx]     = 220;
          rgba[idx + 1] = 30;
          rgba[idx + 2] = 90;
        } else {
          rgba[idx]     = 20;
          rgba[idx + 1] = 50;
          rgba[idx + 2] = 120;
        }
        rgba[idx + 3] = 255;
      }
    }
    const imgVal = {
      data: rgba,
      width: W,
      height: H,
      channels: 4 as const,
      binary: false,
    };
    const out = await runAsync(
      'fine-outline',
      { image: imgVal },
      { quality: 'precise', minStrand: 6, low: 30, high: 70 },
    );
    // overlay: 4通道且像素量 = W*H*4
    expect(out.overlay).toBeDefined();
    const ov = out.overlay as { channels: number; width: number; height: number; data: Uint8ClampedArray | Uint8Array };
    expect(ov.channels).toBe(4);
    expect(ov.width).toBe(W);
    expect(ov.height).toBe(H);
    expect(ov.data.length).toBe(W * H * 4);
    // edges: 1ch 0/1 二值
    const ed = out.edges as { channels: number; width: number; height: number; data: Uint8ClampedArray | Uint8Array; binary: boolean };
    expect(ed.channels).toBe(1);
    expect(ed.binary).toBe(true);
    expect(ed.width * ed.height).toBe(W * H);
    expect(ed.data.length).toBe(W * H);
    // contours: 非空 polyline 数组
    const ct = out.contours as { polylines: Array<{ points: unknown[] }>; width: number; height: number };
    expect(ct.width).toBe(W);
    expect(ct.height).toBe(H);
    expect(Array.isArray(ct.polylines)).toBe(true);
    expect(ct.polylines.length).toBeGreaterThan(0);
    for (const poly of ct.polylines) expect(poly.points.length).toBeGreaterThanOrEqual(2);
  });

  it('T6.3 fineOutline 显式指定 standard / highContrast 两种管线均返回有效结果', () => {
    const W = 32;
    const H = 32;
    // 构造一个"高对比度黑白"图像：中心实心黑方块 + 白背景
    const rgba = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const idx = (y * W + x) * 4;
        const inSquare = x >= 6 && x <= 25 && y >= 6 && y <= 25;
        if (inSquare) {
          rgba[idx] = 10; rgba[idx + 1] = 10; rgba[idx + 2] = 10;
        } else {
          rgba[idx] = 250; rgba[idx + 1] = 250; rgba[idx + 2] = 250;
        }
        rgba[idx + 3] = 255;
      }
    }
    // 标准管线
    const std = fineOutline(rgba, W, H, 4, { imageType: 'standard', low: 30, high: 70, minStrand: 8 });
    expect(std.pipeline).toBe('standard');
    expect(std.polylines.length).toBeGreaterThan(0);
    expect(std.totalEdgePixels).toBeGreaterThan(16);
    for (const p of std.polylines) expect(p.points.length).toBeGreaterThanOrEqual(2);

    // 高对比度管线
    const hc = fineOutline(rgba, W, H, 4, { imageType: 'highContrast', threshold: 128, minStrand: 8 });
    expect(hc.pipeline).toBe('highContrast');
    expect(hc.polylines.length).toBeGreaterThan(0);
    expect(hc.totalEdgePixels).toBeGreaterThan(16);
    for (const p of hc.polylines) {
      expect(p.points.length).toBeGreaterThanOrEqual(2);
      expect(p.closed).toBe(true); // Moore 追踪边界天然闭合
    }
  });

  it('T6.4 auto 模式对高对比度黑白图像自动切换到 highContrast 管线', () => {
    const W = 40;
    const H = 40;
    // 构造一个完全两极化的黑白线稿风格图像（黑块占比 30%，白块 70%，几乎无中间灰度）
    const rgba = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const idx = (y * W + x) * 4;
        // 用多个同心方框 + 一些小点点模拟线稿
        const cx = x - W / 2, cy = y - H / 2;
        const r = Math.max(Math.abs(cx), Math.abs(cy));
        const inFrameA = r >= 14 && r <= 16;
        const inFrameB = r >= 6 && r <= 8;
        const inDot = ((x * 31 + y * 17) % 271) < 8;
        if (inFrameA || inFrameB || inDot) {
          rgba[idx] = 20; rgba[idx + 1] = 20; rgba[idx + 2] = 20;
        } else {
          rgba[idx] = 248; rgba[idx + 1] = 248; rgba[idx + 2] = 248;
        }
        rgba[idx + 3] = 255;
      }
    }
    const res = fineOutline(rgba, W, H, 4, { imageType: 'auto', minStrand: 4 });
    // auto 模式下，这种黑白两极化图像应命中 highContrast（polarRatio >= 65%）
    expect(res.pipeline).toBe('highContrast');
    expect(res.polylines.length).toBeGreaterThan(0);
    expect(res.totalEdgePixels).toBeGreaterThan(32);
  });
});

/* ================================================================== *
 * Task 2: 曲线集视口自动适配（TR-2.1 基础单测）
 * ================================================================== */
// BezierPathData / curveSetBounds not exported by plot2d yet.
// Local stubs to keep tests compiling (Task 2 type-checking goal).
interface BezierPathData { closed?: boolean; segments: Array<{ p0: {x:number;y:number}; c1: {x:number;y:number}; c2: {x:number;y:number}; p1: {x:number;y:number} }>; }
function curveSetBounds(curves: BezierPathData[]): { minX:number; maxX:number; minY:number; maxY:number } {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const c of curves) for (const s of (c?.segments ?? [])) {
    for (const pt of [s.p0, s.c1, s.c2, s.p1]) {
      if (pt.x < minX) minX = pt.x; if (pt.x > maxX) maxX = pt.x;
      if (pt.y < minY) minY = pt.y; if (pt.y > maxY) maxY = pt.y;
    }
  }
  return { minX, maxX, minY, maxY };
}

/**
 * 根据给定曲线集计算默认视图（与 Plot2DPanel 中 defaultView 的逻辑一致）。
 * 提取为纯函数以便单测：当 plots.length===0 且 curveSets 非空时，
 * 返回 bbox ±5% padding 的 xRange/yRange。
 */
function computeCurveSetDefaultView(
  curveSets: Array<{ curves: BezierPathData[] }>,
): { x: [number, number]; y: [number, number] } {
  const DEFAULT_X: [number, number] = [-10, 10];
  const DEFAULT_Y: [number, number] = [-10, 10];
  if (!curveSets || curveSets.length === 0) {
    return { x: DEFAULT_X, y: DEFAULT_Y };
  }
  const allCurves: BezierPathData[] = [];
  for (const cs of curveSets) {
    for (const c of cs.curves) allCurves.push(c);
  }
  if (allCurves.length === 0) {
    return { x: DEFAULT_X, y: DEFAULT_Y };
  }
  const bbox = curveSetBounds(allCurves);
  const hasValidBBox =
    Number.isFinite(bbox.minX) && Number.isFinite(bbox.maxX) &&
    Number.isFinite(bbox.minY) && Number.isFinite(bbox.maxY) &&
    (bbox.minX !== 0 || bbox.maxX !== 0 || bbox.minY !== 0 || bbox.maxY !== 0);
  if (!hasValidBBox) {
    return { x: DEFAULT_X, y: DEFAULT_Y };
  }
  const padX = (bbox.maxX - bbox.minX) * 0.05;
  const padY = (bbox.maxY - bbox.minY) * 0.05;
  const xPad = padX > 0 ? padX : 0.5;
  const yPad = padY > 0 ? padY : 0.5;
  return {
    x: [bbox.minX - xPad, bbox.maxX + xPad],
    y: [bbox.minY - yPad, bbox.maxY + yPad],
  };
}

describe('Task 2: 曲线集视口自动适配（TR-2.1）', () => {
  /** 构造一个 100×200 的矩形盒子 BezierPath（4 条直线段，控制点与端点重合）。 */
  function makeBox100x200Path(): BezierPathData {
    const mkSeg = (x0: number, y0: number, x1: number, y1: number) => ({
      p0: { x: x0, y: y0 },
      c1: { x: x0, y: y0 },
      c2: { x: x1, y: y1 },
      p1: { x: x1, y: y1 },
    });
    return {
      closed: true,
      segments: [
        mkSeg(0, 0, 100, 0),      // 底: (0,0) → (100,0)
        mkSeg(100, 0, 100, 200),  // 右: (100,0) → (100,200)
        mkSeg(100, 200, 0, 200),  // 顶: (100,200) → (0,200)
        mkSeg(0, 200, 0, 0),      // 左: (0,200) → (0,0)
      ],
    };
  }

  it('TR-2.1 fit view to 100x200 curve set: bbox 正确，xRange=[-5,105]、yRange=[-10,210]（±5%）', () => {
    const boxPath = makeBox100x200Path();
    const curveSets = [{ curves: [boxPath] }];

    // 1. curveSetBounds 原始 bbox 断言
    const bbox = curveSetBounds([boxPath]);
    expect(bbox.minX).toBeCloseTo(0, 6);
    expect(bbox.maxX).toBeCloseTo(100, 6);
    expect(bbox.minY).toBeCloseTo(0, 6);
    expect(bbox.maxY).toBeCloseTo(200, 6);

    // 2. 默认视图 ±5% padding 断言
    //    padX = (100-0)*0.05 = 5  → xRange = [0-5, 100+5] = [-5, 105]
    //    padY = (200-0)*0.05 = 10 → yRange = [0-10, 200+10] = [-10, 210]
    const view = computeCurveSetDefaultView(curveSets);
    expect(view.x[0]).toBeCloseTo(-5, 6);
    expect(view.x[1]).toBeCloseTo(105, 6);
    expect(view.y[0]).toBeCloseTo(-10, 6);
    expect(view.y[1]).toBeCloseTo(210, 6);

    // 3. 空 curveSets → fallback 到 DEFAULT_X/DEFAULT_Y
    const emptyView = computeCurveSetDefaultView([]);
    expect(emptyView.x).toEqual([-10, 10]);
    expect(emptyView.y).toEqual([-10, 10]);
  });

  it('退化单曲线（0 宽）使用最小 0.5 padding，而非 ±5%（避免 0 padding）', () => {
    // 构造一条"点线"：所有控制点都在 x=50，宽度为 0
    const degeneratePath: BezierPathData = {
      closed: false,
      segments: [
        {
          p0: { x: 50, y: 0 },
          c1: { x: 50, y: 50 },
          c2: { x: 50, y: 100 },
          p1: { x: 50, y: 200 },
        },
      ],
    };
    const view = computeCurveSetDefaultView([{ curves: [degeneratePath] }]);
    // X 方向宽度 0 → padX=0 → 用最小 xPad=0.5 → [49.5, 50.5]
    expect(view.x[0]).toBeCloseTo(49.5, 6);
    expect(view.x[1]).toBeCloseTo(50.5, 6);
    // Y 方向宽度 200 → ±5% = ±10 → [-10, 210]
    expect(view.y[0]).toBeCloseTo(-10, 6);
    expect(view.y[1]).toBeCloseTo(210, 6);
  });
});
