/**
 * 亚像素 marching squares 等值线追踪。
 *
 * 与「先二值化再追轮廓」不同，本模块直接在灰度图上追踪等值线（isocontour），
 * 在单元边上用线性插值求出亚像素交点，从而保留抗锯齿所携带的 ~0.1px 边界信息，
 * 避免二值化把边界量化到 ±0.5px 造成抖动（对齐 img2bez / kurbo 的思路）。
 *
 * 流程：
 *   1. 逐像素单元（cell）计算 4 个角点在等值线下/上的状态 → 4-bit case。
 *   2. 对每个 case 在相应的边上插值得到亚像素交点，生成单元内直线段。
 *   3. 用「端点共享」把直线段缝合成闭合/开放折线（Polyline）。
 *
 * 全部纯 typed array，无 DOM 依赖，可在主线程或 Web Worker 运行。
 */
import type { Point, Polyline } from './types';
import { signedArea } from './trace';
import { gaussianBlur } from './preprocess';

/** marching squares 的 4 条边：0=下，1=右，2=上，3=左（与边交点索引对应）。 */

/**
 * 由 4-bit case（bit 顺序：角0=左下,角1=右下,角2=右上,角3=左上，置 1 表示 > isolevel）
 * 返回要连接的边对。边号：0=下 1=右 2=上 3=左。
 *
 * 连通性由「等值线是 above 区域的边界」这一几何约束逐 case 推导：
 * 只有两个端点一上一下的边才会被等值线穿过，把穿过的边按单元内连续性连接。
 * case 5/9 为鞍点，用中心均值消歧。
 */
function cellLines(caseIdx: number, centerAbove: boolean): [number, number][] {
  switch (caseIdx) {
    case 0:
    case 15:
      return [];
    // 单角在上面：穿过其相邻两条边
    case 1: // 角0
      return [[0, 3]];
    case 2: // 角1
      return [[0, 1]];
    case 4: // 角2
      return [[1, 2]];
    case 8: // 角3
      return [[2, 3]];
    // 两个相邻角在上面：等值线为一条直线段
    case 3: // 角0,1（下边）→ 穿 右、左
      return [[1, 3]];
    case 6: // 角1,2（右边）→ 穿 下、上
      return [[0, 2]];
    case 12: // 角2,3（上边）→ 穿 左、右
      return [[3, 1]];
    // 三个角在上面：穿过剩余两条边
    case 7: // 除角3 → 穿 上、左
      return [[2, 3]];
    case 11: // 除角1 → 穿 右、上
      return [[1, 2]];
    case 13: // 除角2 → 穿 下、右
      return [[0, 1]];
    case 14: // 除角0 → 穿 下、左
      return [[0, 3]];
    // 两个相邻角在上面（左/右侧）：等值线为一条直线段
    case 9: // 角3,0（左边）→ 穿 下、上
      return [[0, 2]];
    // 鞍点：对角在上面，四条边都穿，用中心均值消歧（asymptotic decider）。
    // 中心在上 → above 区域经中心连通，等值线绕经两个 below 角点。
    case 5: // 角0,2 （above）→ centerAb上：绕角1、角3 → (0,1)&(2,3)
      return centerAbove ? [[0, 1], [2, 3]] : [[0, 3], [1, 2]];
    case 10: // 角1,3 （above）→ centerAb上：绕角0、角2 → (0,3)&(1,2)
      return centerAbove ? [[0, 3], [1, 2]] : [[0, 1], [2, 3]];
    default:
      return [];
  }
}

/** 在某条边上线性插值等值线交点。edge: 0=下 1=右 2=上 3=左。 */
function edgePoint(
  v00: number,
  v10: number,
  v11: number,
  v01: number,
  x: number,
  y: number,
  edge: number,
  iso: number,
): Point {
  const lerp = (a: number, b: number) => {
    const denom = b - a;
    if (Math.abs(denom) < 1e-9) return 0.5;
    const t = (iso - a) / denom;
    return t < 0 ? 0 : t > 1 ? 1 : t;
  };
  switch (edge) {
    case 0: {
      const t = lerp(v00, v10);
      return { x: x + t, y };
    }
    case 1: {
      const t = lerp(v10, v11);
      return { x: x + 1, y: y + t };
    }
    case 2: {
      const t = lerp(v11, v01);
      return { x: x + 1 - t, y: y + 1 };
    }
    case 3: {
      const t = lerp(v01, v00);
      return { x, y: y + 1 - t };
    }
    default:
      return { x, y };
  }
}

/** 把共享端点的直线段缝合为折线（闭合/开放）。 */
function stitch(segs: { a: Point; b: Point }[]): Polyline[] {
  const n = segs.length;
  if (n === 0) return [];
  const key = (p: Point) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`;
  const used = new Uint8Array(n);
  const adj = new Map<string, number[]>();
  const addAdj = (k: string, id: number) => {
    const l = adj.get(k);
    if (l) l.push(id);
    else adj.set(k, [id]);
  };
  for (let i = 0; i < n; i++) {
    addAdj(key(segs[i].a), i);
    addAdj(key(segs[i].b), i);
  }
  const polys: Polyline[] = [];
  const MAX_GUARD = n + 1;
  for (let i = 0; i < n; i++) {
    if (used[i]) continue;
    used[i] = 1;
    const chain: Point[] = [segs[i].a, segs[i].b];
    // 从 b 向前延伸
    let curPoint = segs[i].b;
    for (let g = 0; g < MAX_GUARD; g++) {
      const cands = adj.get(key(curPoint));
      let next = -1;
      if (cands) for (const ci of cands) if (!used[ci]) { next = ci; break; }
      if (next < 0) break;
      const s = segs[next];
      used[next] = 1;
      if (key(s.a) === key(curPoint)) { chain.push(s.b); curPoint = s.b; }
      else { chain.push(s.a); curPoint = s.a; }
    }
    // 从 a 向后延伸
    curPoint = segs[i].a;
    for (let g = 0; g < MAX_GUARD; g++) {
      const cands = adj.get(key(curPoint));
      let next = -1;
      if (cands) for (const ci of cands) if (!used[ci]) { next = ci; break; }
      if (next < 0) break;
      const s = segs[next];
      used[next] = 1;
      if (key(s.a) === key(curPoint)) { chain.unshift(s.b); curPoint = s.b; }
      else { chain.unshift(s.a); curPoint = s.a; }
    }
    const closed =
      chain.length > 2 && key(chain[0]) === key(chain[chain.length - 1]);
    if (closed) chain.pop();
    if (chain.length >= 3) {
      polys.push({ points: chain, closed, area: signedArea(chain, closed) });
    }
  }
  return polys;
}

/**
 * 在灰度图上追踪一条等值线（isolevel）。
 * 可选对输入先做高斯平滑（smoothRadius>0 时），减少椒盐噪声形成的碎轮廓。
 */
export function marchingSquaresIsolevel(
  gray: Uint8ClampedArray,
  w: number,
  h: number,
  isolevel: number,
): Polyline[] {
  const segs: { a: Point; b: Point }[] = [];
  for (let y = 0; y < h - 1; y++) {
    const r0 = y * w;
    const r1 = (y + 1) * w;
    for (let x = 0; x < w - 1; x++) {
      const v00 = gray[r0 + x];
      const v10 = gray[r0 + x + 1];
      const v11 = gray[r1 + x + 1];
      const v01 = gray[r1 + x];
      const caseIdx =
        (v00 > isolevel ? 1 : 0) |
        (v10 > isolevel ? 2 : 0) |
        (v11 > isolevel ? 4 : 0) |
        (v01 > isolevel ? 8 : 0);
      if (caseIdx === 0 || caseIdx === 15) continue;
      if (caseIdx === 5 || caseIdx === 10) {
        // 鞍点：中心均值消歧
        const center = (v00 + v10 + v11 + v01) / 4;
        const lines = cellLines(caseIdx, center > isolevel);
        for (const [ea, eb] of lines) {
          segs.push({
            a: edgePoint(v00, v10, v11, v01, x, y, ea, isolevel),
            b: edgePoint(v00, v10, v11, v01, x, y, eb, isolevel),
          });
        }
      } else {
        const lines = cellLines(caseIdx, false);
        for (const [ea, eb] of lines) {
          segs.push({
            a: edgePoint(v00, v10, v11, v01, x, y, ea, isolevel),
            b: edgePoint(v00, v10, v11, v01, x, y, eb, isolevel),
          });
        }
      }
    }
  }
  return stitch(segs);
}

export interface MarchingSquaresOptions {
  /** 等值线层级数（默认 4）：isolevel 取 k*(256/levels)，k=1..levels-1 的边界。 */
  levels?: number;
  /** 是否先高斯平滑（radius>0），默认 1。 */
  smoothRadius?: number;
  /** 过滤周长 < minPerimeter 的碎轮廓（默认 0=不过滤）。 */
  minPerimeter?: number;
}

/**
 * 多等值线追踪：在灰度图上按 levels 等距取 isolevel，逐层追踪并合并。
 * 返回全部折线（含子像素坐标），供后续 RDP + 贝塞尔拟合。
 */
export function marchingSquaresGray(
  gray: Uint8ClampedArray,
  w: number,
  h: number,
  opts: MarchingSquaresOptions = {},
): Polyline[] {
  const levels = Math.max(2, opts.levels ?? 4);
  const smoothRadius = opts.smoothRadius ?? 1;
  const minPerimeter = opts.minPerimeter ?? 0;
  let src = gray;
  if (smoothRadius > 0) {
    src = gaussianBlur(gray, w, h, smoothRadius);
  }
  const out: Polyline[] = [];
  const widthPer = 256 / levels;
  for (let k = 1; k < levels; k++) {
    const iso = k * widthPer;
    const polys = marchingSquaresIsolevel(src, w, h, iso);
    for (const p of polys) {
      if (minPerimeter > 0) {
        let len = 0;
        for (let i = 1; i < p.points.length; i++) {
          len += Math.hypot(
            p.points[i].x - p.points[i - 1].x,
            p.points[i].y - p.points[i - 1].y,
          );
        }
        if (len < minPerimeter) continue;
      }
      out.push(p);
    }
  }
  return out;
}