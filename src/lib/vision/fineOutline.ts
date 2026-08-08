/**
 * 「精细描边」算法（对应蓝图 `fine-outline` 节点）。
 *
 * 目标：从任意彩色图像（照片、动漫、带渐变阴影）抽出「CAD 级」的主体外轮廓 + 发丝/细节长边缘。
 * 对于黑白线稿 / 高对比度漫画 / 背景单一的图像，自动切换到更合适的管线。
 *
 * 支持 3 种图像模式（FineOutlineOptions.imageType）：
 *   - 'auto'         自动：灰度直方图分析后选择标准或高对比度模式
 *   - 'standard'     标准管线：6通道Sobel融合 + Canny边缘（照片、彩色动漫通用）
 *   - 'highContrast' 高对比度管线：固定阈值二值化 + Moore邻域边界追踪（线稿/黑白漫画/背景单一图像）
 *
 * 标准管线（与独立脚本 real-color-to-cad-outline.mjs 对齐）：
 *   1. 颜色变换：RGBA → 灰度 + R / G / B 独立通道 + Lab a 通道 / b 通道 色度通道
 *   2. 6 通道 Sobel 梯度融合（灰度 35% + R/G/B 各 12% + Lab a/b 通道 各 14%）
 *   3. 双阈值 Canny 滞后阈值 (默认 55 / 130)
 *   4. 8 邻域连通链提取 → 过滤短噪点链（默认 < 40px 丢弃）
 *   5. 链内部按最近邻排序列（保证相邻点在路径上相邻）
 *   6. RDP 简化（默认 eps = 0.9，去冗余拐点 → CAD 感折线）
 *
 * 高对比度管线（新增，针对线稿/黑白漫画）：
 *   1. 灰度二值化（默认 <128 → 前景黑线，否则背景）
 *   2. Moore 邻域边界追踪（Suzuki-Abe 简化版），区分外边界与孔边界
 *   3. 过滤极小噪斑轮廓（默认 < 6 像素的丢弃）
 *   4. RDP 简化（默认 eps = 0.5，更高精度保留线条细节）
 *
 * 输出值结构：
 *   - polylines: 长链（RDP 后），用于直接渲染 SVG 或接 curve-fit 贝塞尔
 *   - width / height: 图像尺寸
 *   - edgeBinary: Uint8 0/1 边缘图（UI 预览用）
 *   - pipeline: 实际使用的管线（'standard' | 'highContrast'）
 *
 * 所有函数纯 typed array，无 DOM 依赖 —— 可在 Web Worker / jsdom / SSR 里直接运行。
 */
import { sobel, canny } from './edges';
import { rdpSimplify } from './fit';
import type { Polyline, Point } from './types';

export type FineOutlineImageType = 'auto' | 'standard' | 'highContrast';

export interface FineOutlineOptions {
  /** 图像模式：auto(自动) / standard(标准6通道+Canny) / highContrast(高对比度二值化+Moore) */
  imageType?: FineOutlineImageType;
  /** Canny 低阈值（standard 模式有效），默认 55 */
  low?: number;
  /** Canny 高阈值（standard 模式有效），默认 130 */
  high?: number;
  /** 二值化阈值（highContrast 模式有效）：灰度 < threshold 认为前景，默认 128 */
  threshold?: number;
  /** 短链过滤：长度（像素数）< minStrand 的连通链直接丢弃，默认 40 */
  minStrand?: number;
  /** RDP 简化误差（px），越小越精细，默认 0.9 */
  eps?: number;
  /** 保留的最长路径数上限，防止超大图爆炸，默认 200 */
  maxPaths?: number;
  /** 是否启用主体前景锁定（Foreground Mask）：先 mask 掉背景再提边缘，默认 false */
  enableForegroundMask?: boolean;
  /** 前景 mask 膨胀半径（r×r 方形结构元），防止削边，默认 2 */
  fgMaskDilation?: number;
  /** 主体面积下限占比（默认 0.01=1%）：小于此值时退化为累加 top-k 直到覆盖 ≥15% 总面积 */
  fgMaskMinAreaRatio?: number;
}

export interface FineOutlineResult {
  /** RDP 简化后的折线集（长度 >= minStrand 的连通链）。 */
  polylines: Polyline[];
  /** 图像宽度（px）。 */
  width: number;
  /** 图像高度（px）。 */
  height: number;
  /** 二值边缘图（0 / 1），UI 预览用。 */
  edgeBinary: Uint8Array;
  /** 保留下的长链累计像素数（用于大致评估信息量）。 */
  totalEdgePixels: number;
  /** 实际使用的处理管线，便于 UI 层显示 badge。 */
  pipeline: 'standard' | 'highContrast';
  /** 是否实际应用了前景 mask（调试用，false 时与旧行为完全一致）。 */
  foregroundMaskApplied?: boolean;
}

/* ------------------------------------------------------------------ *
 * 颜色工具：RGBA → 灰度 / R / G / B / Lab a 通道 / Lab b 通道
 * ------------------------------------------------------------------ */

/** 8-bit sRGB → 线性浮点 0..1 */
function srgbToLin(v: number): number {
  const x = v / 255;
  return x > 0.04045 ? Math.pow((x + 0.055) / 1.055, 2.4) : x / 12.92;
}
/** 线性 → Lab f 函数 */
function labF(t: number): number {
  return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
}

/**
 * 把任意 RGBA / 灰度输入拆成 6 张 8-bit 灰度图（对应：Gray / R / G / B / Lab a 通道 / Lab b 通道）。
 * 每张都可直接喂给现有 Sobel（其把灰度当作亮度，对于色度通道只是"不同亮度的边缘"，一样有效）。
 */
export function splitSixChannels(
  data: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  channels: 1 | 4,
): {
  gray: Uint8ClampedArray;
  R: Uint8ClampedArray;
  G: Uint8ClampedArray;
  B: Uint8ClampedArray;
  a: Uint8ClampedArray;
  b: Uint8ClampedArray;
} {
  const n = width * height;
  const gray = new Uint8ClampedArray(n);
  const R = new Uint8ClampedArray(n);
  const G = new Uint8ClampedArray(n);
  const B = new Uint8ClampedArray(n);
  const a = new Uint8ClampedArray(n); // -128..128 → 0..255
  const b = new Uint8ClampedArray(n); // -128..128 → 0..255

  for (let p = 0, j = 0; p < n; p++) {
    let r8: number, g8: number, b8: number;
    if (channels === 4) {
      r8 = data[j++]; g8 = data[j++]; b8 = data[j++]; j++; // skip alpha
    } else {
      r8 = g8 = b8 = data[j++];
    }
    R[p] = r8;
    G[p] = g8;
    B[p] = b8;
    gray[p] = (0.299 * r8 + 0.587 * g8 + 0.114 * b8) | 0;

    // sRGB → XYZ (D65) → Lab
    const rL = srgbToLin(r8);
    const gL = srgbToLin(g8);
    const bL = srgbToLin(b8);
    const X = rL * 0.4124564 + gL * 0.3575761 + bL * 0.1804375;
    const Y = rL * 0.2126729 + gL * 0.7151522 + bL * 0.0721750;
    const Z = rL * 0.0193339 + gL * 0.1191920 + bL * 0.9503041;
    // D65 white: Xn=0.95047, Yn=1.0, Zn=1.08883
    const fx = labF(X / 0.95047);
    const fy = labF(Y / 1.0);
    const fz = labF(Z / 1.08883);
    const aStar = 500 * (fx - fy); // -128..128 左右
    const bStar = 200 * (fy - fz);
    // 0..255 量化：clamp + offset
    a[p] = Math.max(0, Math.min(255, ((aStar + 128) / 2) | 0));
    b[p] = Math.max(0, Math.min(255, ((bStar + 128) / 2) | 0));
  }
  return { gray, R, G, B, a, b };
}

/* ------------------------------------------------------------------ *
 * 6 通道梯度融合 → 单通道灰度幅值
 * ------------------------------------------------------------------ */

/**
 * 把单通道 Sobel Float32 幅值图 归一化到 0..255 Uint8。
 * scale 用于对某通道"加权放大"（例如 Lab a/b 通道常被设为 1.25，强化发丝色差边缘）。
 */
function normalizeSobel(mag: Float32Array, scale = 1): Uint8Array {
  let max = 0;
  for (let i = 0; i < mag.length; i++) if (mag[i] > max) max = mag[i];
  const norm = max > 0 ? (255 / max) * scale : 0;
  const out = new Uint8Array(mag.length);
  for (let i = 0; i < mag.length; i++) {
    const v = mag[i] * norm;
    out[i] = v >= 255 ? 255 : v | 0;
  }
  return out;
}

export function fusedMultiChannelGradient(
  splits: ReturnType<typeof splitSixChannels>,
  width: number,
  height: number,
): Uint8Array {
  const magG = normalizeSobel(sobel(splits.gray, width, height), 1.1);
  const magR = normalizeSobel(sobel(splits.R, width, height), 1.0);
  const magGr = normalizeSobel(sobel(splits.G, width, height), 1.0);
  const magB = normalizeSobel(sobel(splits.B, width, height), 1.0);
  const magA = normalizeSobel(sobel(splits.a, width, height), 1.25);
  const magBb = normalizeSobel(sobel(splits.b, width, height), 1.25);

  const n = width * height;
  const fused = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const v =
      0.35 * magG[i] +
      0.12 * (magR[i] + magGr[i] + magB[i]) +
      0.14 * (magA[i] + magBb[i]);
    fused[i] = v >= 255 ? 255 : v | 0;
  }
  return fused;
}

/* ------------------------------------------------------------------ *
 * 辅助：RGBA → 灰度 + 直方图分析（自动模式下判定图像类型）
 * ------------------------------------------------------------------ */

/** RGBA/灰度输入 → 8-bit 灰度图。 */
function toGray(
  data: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  channels: 1 | 4,
): Uint8ClampedArray {
  const n = width * height;
  const out = new Uint8ClampedArray(n);
  for (let p = 0, j = 0; p < n; p++) {
    if (channels === 4) {
      const r = data[j++], g = data[j++], b = data[j++]; j++;
      out[p] = (r * 77 + g * 150 + b * 29 + 128) >> 8;
    } else {
      out[p] = data[j++];
    }
  }
  return out;
}

/**
 * 基于灰度直方图判断是否为高对比度图像（黑白线稿/漫画/背景单一）。
 * 判断标准：
 *   - 低灰度区（<85） 或 高灰度区（>170）占比之和 ≥ 65%
 *   - 中间灰度区占比 ≤ 35%（说明没有太多渐变阴影，主要是黑/白两极）
 * 满足以上认为是 highContrast，走二值化+Moore 管线。
 */
function isHighContrastByHistogram(gray: Uint8ClampedArray): boolean {
  const hist = new Int32Array(256);
  for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
  let low = 0, mid = 0, high = 0;
  for (let i = 0; i < 256; i++) {
    if (i < 85) low += hist[i];
    else if (i > 170) high += hist[i];
    else mid += hist[i];
  }
  const total = Math.max(1, gray.length);
  const polarRatio = (low + high) / total;
  const midRatio = mid / total;
  return polarRatio >= 0.65 && midRatio <= 0.35;
}

/* ------------------------------------------------------------------ *
 * 高对比度管线：二值化 + Moore 邻域边界追踪（Suzuki-Abe 简化版）
 * ------------------------------------------------------------------ */

/** Moore 8 邻域顺序（顺时针）。 */
const MOORE_N8: Array<[number, number]> = [
  [+1, -1], [+1, 0], [+1, +1], [0, +1],
  [-1, +1], [-1, 0], [-1, -1], [0, -1],
];

/**
 * 对灰度图做二值化 → Moore 邻域追踪所有边界。
 * 返回：
 *   - edgeBinary  0/1 边缘图（与标准管线对齐格式）
 *   - polylines   RDP 简化后的折线集（带 closed / isHole 标记）
 */
function traceOutlineHighContrast(
  gray: Uint8ClampedArray,
  width: number,
  height: number,
  threshold: number,
  minStrand: number,
  eps: number,
  maxPaths: number,
  foregroundMask?: Uint8Array | null,
): {
  edgeBinary: Uint8Array;
  polylines: Polyline[];
  totalEdgePixels: number;
} {
  const n = width * height;
  // 1) 二值化：F[p]=1 表示前景（黑色线条，灰度<threshold）
  const F = new Uint8Array(n);
  for (let i = 0; i < n; i++) F[i] = gray[i] < threshold ? 1 : 0;
  // 1.5) 若有前景 mask：二值 AND（F[i] = F[i] & mask[i]）
  if (foregroundMask) {
    for (let i = 0; i < n; i++) F[i] &= foregroundMask[i];
  }

  const inside = (x: number, y: number) => x >= 0 && x < width && y >= 0 && y < height;
  const getF = (x: number, y: number) => (inside(x, y) ? F[y * width + x] : 0);

  // 2) Moore 追踪：为每个未访问前景像素分配 label（正=外边界，负=孔）并绕圈
  const label = new Int32Array(n);
  let labelCount = 0;
  const rawContours: Array<{ points: Array<[number, number]>; isHole: boolean }> = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      if (F[p] !== 1 || label[p] !== 0) continue;

      // 判断起点类型（外边界/孔）：看上邻居 & 左邻居
      const above = y > 0 ? F[p - width] : 0;
      const left = x > 0 ? F[p - 1] : 0;
      const isHole = above === 0 && left === 1;

      labelCount++;
      const currentLabel = isHole ? -labelCount : labelCount;
      label[p] = currentLabel;

      const contourPts: Array<[number, number]> = [[x, y]];
      let cx = x, cy = y;

      // 找第一个邻居：外边界从西(索引5)顺时针，孔从东(索引1)顺时针
      const startDir = isHole ? 1 : 5;
      let prevX = -1, prevY = -1;
      let foundFirst = false;
      for (let step = 0; step < 8; step++) {
        const dir = (startDir + step) % 8;
        const [dx, dy] = MOORE_N8[dir];
        const nx = cx + dx, ny = cy + dy;
        if (getF(nx, ny) === 1) {
          prevX = cx; prevY = cy;
          cx = nx; cy = ny;
          if (inside(cx, cy) && label[cy * width + cx] === 0)
            label[cy * width + cx] = currentLabel;
          foundFirst = true;
          break;
        }
      }
      if (!foundFirst) {
        rawContours.push({ points: [[x, y]], isHole });
        continue;
      }
      contourPts.push([cx, cy]);

      const MAX_STEPS = n * 4;
      let safety = 0;
      while (safety++ < MAX_STEPS) {
        // 反方向（当前点指向 prev 的方向）在 MOORE_N8 中的索引
        const backDx = prevX - cx, backDy = prevY - cy;
        let backDir = 0;
        for (let d = 0; d < 8; d++)
          if (MOORE_N8[d][0] === backDx && MOORE_N8[d][1] === backDy) {
            backDir = d; break;
          }
        // 从 backDir 下一个开始顺时针扫 8 邻居找第一个 F=1
        let nextX = -1, nextY = -1;
        for (let step = 1; step <= 8; step++) {
          const dir = (backDir + step) % 8;
          const [dx, dy] = MOORE_N8[dir];
          const nx = cx + dx, ny = cy + dy;
          if (getF(nx, ny) === 1) { nextX = nx; nextY = ny; break; }
        }
        if (nextX < 0) break;
        if (inside(nextX, nextY) && label[nextY * width + nextX] === 0)
          label[nextY * width + nextX] = currentLabel;

        // 终止：回到起点且第二步也重复
        if (
          cx === contourPts[0][0] && cy === contourPts[0][1] &&
          nextX === contourPts[1][0] && nextY === contourPts[1][1] &&
          contourPts.length > 3
        ) break;

        contourPts.push([nextX, nextY]);
        prevX = cx; prevY = cy;
        cx = nextX; cy = nextY;
        if (contourPts.length > MAX_STEPS) break;
      }
      // 去除末尾与起点重合的重复点
      if (contourPts.length > 3) {
        const last = contourPts[contourPts.length - 1], first = contourPts[0];
        if (last[0] === first[0] && last[1] === first[1]) contourPts.pop();
      }
      rawContours.push({ points: contourPts, isHole });
    }
  }

  // 3) 按长度降序 + 过滤短链 + RDP 简化
  rawContours.sort((a, b) => b.points.length - a.points.length);
  let kept = rawContours.filter((c) => c.points.length >= minStrand);
  if (kept.length > maxPaths) kept = kept.slice(0, maxPaths);

  // 用 tuple 版 RDP（直接从 fit 导入的是 Point 型，这里先手动算一份简化版，避免循环依赖）
  const perpDist = (pt: [number, number], a: [number, number], b: [number, number]) => {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const L2 = dx * dx + dy * dy;
    if (L2 === 0) return Math.hypot(pt[0] - a[0], pt[1] - a[1]);
    const t = ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / L2;
    const tc = Math.max(0, Math.min(1, t));
    return Math.hypot(pt[0] - (a[0] + tc * dx), pt[1] - (a[1] + tc * dy));
  };
  const rdpTuple = (pts: Array<[number, number]>, epsVal: number): Array<[number, number]> => {
    if (pts.length < 3) return pts.slice();
    let dmax = 0, idx = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const d = perpDist(pts[i], pts[0], pts[pts.length - 1]);
      if (d > dmax) { dmax = d; idx = i; }
    }
    if (dmax > epsVal) {
      const L = rdpTuple(pts.slice(0, idx + 1), epsVal);
      const R = rdpTuple(pts.slice(idx), epsVal);
      return L.slice(0, -1).concat(R);
    }
    return [pts[0], pts[pts.length - 1]];
  };

  const polylines: Polyline[] = [];
  let totalEdgePixels = 0;
  for (const c of kept) {
    totalEdgePixels += c.points.length;
    if (c.points.length < 2) continue;
    const simplified = rdpTuple(c.points, eps);
    if (simplified.length < 2) continue;
    const points: Point[] = simplified.map(([x, y]) => ({ x, y }));
    polylines.push({ points, closed: true, area: c.points.length, isHole: c.isHole });
  }

  // 4) 构造 edgeBinary（与标准管线格式对齐，UI 预览用）
  const edgeBinary = new Uint8Array(n);
  const setBresenham = (x0: number, y0: number, x1: number, y1: number) => {
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy, x = x0, y = y0;
    while (true) {
      if (inside(x, y)) edgeBinary[y * width + x] = 1;
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x += sx; }
      if (e2 < dx) { err += dx; y += sy; }
    }
  };
  for (const c of polylines) {
    const pts = c.points;
    for (let i = 0; i < pts.length; i++) {
      if (inside(pts[i].x, pts[i].y)) edgeBinary[pts[i].y * width + pts[i].x] = 1;
      if (i > 0) setBresenham(pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y);
    }
  }

  return { edgeBinary, polylines, totalEdgePixels };
}

/* ------------------------------------------------------------------ *
 * 8 邻域连通链 + 排序 + 长度过滤 + RDP
 * ------------------------------------------------------------------ */

const N8: Array<[number, number]> = [
  [-1, -1], [0, -1], [1, -1],
  [1, 0],                [1, 1],
  [0, 1], [-1, 1], [-1, 0],
];

/** 从 Canny 0/1 边缘图抽取所有 8 邻域连通链。 */
function chainsFromEdge(edge: Uint8Array, w: number, h: number): Array<Array<[number, number]>> {
  const visited = new Uint8Array(w * h);
  const chains: Array<Array<[number, number]>> = [];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const p = y * w + x;
      if (edge[p] !== 1 || visited[p]) continue;
      const stack: Array<[number, number]> = [[x, y]];
      const pts: Array<[number, number]> = [];
      visited[p] = 1;
      while (stack.length) {
        const [cx, cy] = stack.pop()!;
        pts.push([cx, cy]);
        for (const [dx, dy] of N8) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 1 || ny < 1 || nx >= w - 1 || ny >= h - 1) continue;
          const q = ny * w + nx;
          if (edge[q] === 1 && !visited[q]) {
            visited[q] = 1;
            stack.push([nx, ny]);
          }
        }
      }
      chains.push(pts);
    }
  }
  return chains;
}

/**
 * 把一堆散乱但 8 连通的边缘像素，按「最近邻贪心」排成一条有序路径（近似 2D 欧拉迹）。
 * 对于发丝这种细长的连通集，通常能得到两端从发梢到发根的完整序；
 * 对于分叉多的大块，断链后会得到一段一段子路径，也符合 CAD 感的分笔画。
 */
function orderChainByNearest(pts: Array<[number, number]>): Array<[number, number]> {
  if (pts.length < 2) return pts.slice();
  const used = new Uint8Array(pts.length);
  // 起点：x + y 最小（左上角优先）
  let start = 0;
  let minS = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const s = pts[i][0] + pts[i][1];
    if (s < minS) {
      minS = s;
      start = i;
    }
  }
  const path: Array<[number, number]> = [[pts[start][0], pts[start][1]]];
  used[start] = 1;
  let cur = pts[start];
  for (let k = 1; k < pts.length; k++) {
    let best = -1;
    let bd = Infinity;
    // 简单平方距离（开方省了：只要排序，结果一致）
    for (let i = 0; i < pts.length; i++) {
      if (used[i]) continue;
      const dx = pts[i][0] - cur[0];
      const dy = pts[i][1] - cur[1];
      const d = dx * dx + dy * dy;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    // 最近邻若 >5px (sqrt(25))，认为链"断了"，停止（这条链就作为一个独立的长笔画输出）
    if (best < 0 || bd > 25) break;
    path.push([pts[best][0], pts[best][1]]);
    used[best] = 1;
    cur = pts[best];
  }
  return path;
}

/** [number,number][] → Point[]（Polyline 所需格式）。 */
function toPoints(tuples: Array<[number, number]>): Point[] {
  const out: Point[] = new Array(tuples.length);
  for (let i = 0; i < tuples.length; i++) out[i] = { x: tuples[i][0], y: tuples[i][1] };
  return out;
}

/* ------------------------------------------------------------------ *
 * Foreground Mask（主体前景锁定）相关纯函数
 *   - otsuThreshold: 标准 Otsu 大津法找二值化阈值
 *   - boxBlurGray: 分离式盒子模糊（水平+垂直各一遍，O(n)）
 *   - connectedComponents: 4 连通域分析（两遍扫描+并查集等价表）
 *   - binaryDilation: 二值形态学膨胀（r×r 方形结构元）
 *   - buildForegroundMask: 组合以上步骤，生成主体前景 0/1 mask
 * ------------------------------------------------------------------ */

/**
 * 标准 Otsu 大津法：遍历每个候选阈值 t，
 * 计算「前景类 / 背景类」的类间方差最大者作为最优阈值。
 * 输入：任意 8-bit 灰度数组（Uint8 / Uint8Clamped），长度任意；
 * 输出：阈值 t ∈ [0, 255]。
 */
export function otsuThreshold(gray: Uint8Array | Uint8ClampedArray): number {
  const N = gray.length;
  const hist = new Int32Array(256);
  for (let i = 0; i < N; i++) hist[gray[i]]++;
  const total = N;
  let sumAll = 0;
  for (let t = 0; t < 256; t++) sumAll += t * hist[t];
  let sumBg = 0;
  let wBg = 0;
  let maxVar = -1;
  let bestT = 0;
  for (let t = 0; t < 256; t++) {
    wBg += hist[t];
    if (wBg === 0) continue;
    const wFg = total - wBg;
    if (wFg === 0) break;
    sumBg += t * hist[t];
    const meanBg = sumBg / wBg;
    const meanFg = (sumAll - sumBg) / wFg;
    const diff = meanBg - meanFg;
    const varBetween = wBg * wFg * diff * diff;
    if (varBetween > maxVar) {
      maxVar = varBetween;
      bestT = t;
    }
  }
  return bestT;
}

/**
 * 半径 r 的盒子模糊（分离式：先水平一遍 → 再垂直一遍，O(n)）。
 * 不引入外部包，纯手写累加实现；r 默认 3（盒子窗口 7×7 = (2*3+1)^2）。
 * 边界使用 clamp（与 Sobel 保持一致）。
 */
export function boxBlurGray(
  src: Uint8Array | Uint8ClampedArray,
  w: number,
  h: number,
  r = 3,
): Uint8ClampedArray {
  const N = w * h;
  const k = 2 * r + 1; // 窗口边长
  const tmp = new Uint32Array(N); // 中间：水平模糊后的整型累加值
  const out = new Uint8ClampedArray(N);

  // 第 1 遍：水平方向模糊
  for (let y = 0; y < h; y++) {
    let sum = 0;
    const rowBase = y * w;
    // 初始化窗口（x=0 时，左边超出部分全 clamp 为 src[rowBase]）
    for (let x = -r; x <= r; x++) {
      const cx = x < 0 ? 0 : x >= w ? w - 1 : x;
      sum += src[rowBase + cx];
    }
    tmp[rowBase] = sum;
    for (let x = 1; x < w; x++) {
      // 移除最左（x-1-r clamp 后），加入最右（x+r clamp 后）
      const xOut = x - 1 - r;
      const xIn = x + r;
      const cxOut = xOut < 0 ? 0 : xOut >= w ? w - 1 : xOut;
      const cxIn = xIn < 0 ? 0 : xIn >= w ? w - 1 : xIn;
      sum = sum - src[rowBase + cxOut] + src[rowBase + cxIn];
      tmp[rowBase + x] = sum;
    }
  }

  // 第 2 遍：垂直方向模糊（对 tmp 操作），结果除以 (k*k) 量化回 0..255
  const kk = k * k;
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let y = -r; y <= r; y++) {
      const cy = y < 0 ? 0 : y >= h ? h - 1 : y;
      sum += tmp[cy * w + x];
    }
    out[x] = (sum + kk / 2) / kk | 0;
    for (let y = 1; y < h; y++) {
      const yOut = y - 1 - r;
      const yIn = y + r;
      const cyOut = yOut < 0 ? 0 : yOut >= h ? h - 1 : yOut;
      const cyIn = yIn < 0 ? 0 : yIn >= h ? h - 1 : yIn;
      sum = sum - tmp[cyOut * w + x] + tmp[cyIn * w + x];
      out[y * w + x] = (sum + kk / 2) / kk | 0;
    }
  }

  return out;
}

/**
 * 4 连通域分析（两遍扫描：第一遍贴标签+等价表并查集，第二遍归并）。
 *   conn: 4（当前仅实现 4 连通；参数占位以便未来扩展 8 连通）
 * 返回：
 *   - labels: Int32Array（长度 w*h），0 表示背景；1..count 表示连通域编号
 *   - areas:  每个 label（索引从 1 起）的面积（像素数）
 *   - count:  连通域数量（不含背景 0）
 */
export function connectedComponents(
  binary: Uint8Array,
  w: number,
  h: number,
  conn = 4,
): { labels: Int32Array; areas: number[]; count: number } {
  const N = w * h;
  const labels = new Int32Array(N);
  // 并查集：parent[0] 未用，parent[1..nextLabel-1] 有效
  let nextLabel = 1;
  const parent: number[] = [0];

  function find(x: number): number {
    // 路径压缩
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  }
  function union(a: number, b: number): void {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) {
      // 小的并入大的（rank 简化：直接按编号合并）
      if (ra < rb) parent[rb] = ra;
      else parent[ra] = rb;
    }
  }

  // 第 1 遍：逐像素标记（4 连通：上 & 左邻居）
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (binary[p] !== 1) continue; // 背景
      const up = y > 0 ? labels[p - w] : 0;
      const left = x > 0 ? labels[p - 1] : 0;
      if (up === 0 && left === 0) {
        // 新连通域
        const lbl = nextLabel++;
        parent.push(lbl);
        labels[p] = lbl;
      } else if (up !== 0 && left !== 0) {
        union(up, left);
        labels[p] = find(up);
      } else {
        labels[p] = up !== 0 ? find(up) : find(left);
      }
    }
  }

  // 第 2 遍：归并等价类 → 重新编号为连续的 1..count
  const map = new Int32Array(nextLabel); // 旧 label → 新 label
  let count = 0;
  for (let oldL = 1; oldL < nextLabel; oldL++) {
    const root = find(oldL);
    if (map[root] === 0) {
      count++;
      map[root] = count;
    }
    map[oldL] = map[root];
  }
  const areas: number[] = new Array(count + 1).fill(0); // 索引 1..count
  for (let i = 0; i < N; i++) {
    const oldL = labels[i];
    if (oldL === 0) continue;
    const newL = map[oldL];
    labels[i] = newL;
    areas[newL]++;
  }
  return { labels, areas, count };
}

/**
 * 二值形态学膨胀：r×r 方形结构元，0/1 数组输入输出。
 * 实现：对每个 src[i]=1，把其周围 r 邻域（方形）内的 dst 像素全部置 1。
 * 对 r 较小（默认 2，5×5）时这是最简洁且足够快的实现；
 * 边界自动 clamp。
 */
export function binaryDilation(
  src: Uint8Array,
  w: number,
  h: number,
  r = 2,
): Uint8Array {
  const N = w * h;
  const dst = new Uint8Array(N);
  if (r <= 0) {
    dst.set(src);
    return dst;
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (src[p] !== 1) continue;
      const y0 = y - r < 0 ? 0 : y - r;
      const y1 = y + r >= h ? h - 1 : y + r;
      const x0 = x - r < 0 ? 0 : x - r;
      const x1 = x + r >= w ? w - 1 : x + r;
      for (let yy = y0; yy <= y1; yy++) {
        const row = yy * w;
        for (let xx = x0; xx <= x1; xx++) {
          dst[row + xx] = 1;
        }
      }
    }
  }
  return dst;
}

/**
 * 组合以上步骤，生成主体前景 0/1 mask：
 *   1) toGray → 灰度
 *   2) boxBlurGray(r=3) 平滑
 *   3) Otsu 取阈值 → 二值化（前景=1，背景=0）
 *   4) connectedComponents → 找最大连通域 / 退化到 top-k 覆盖 ≥15% 面积
 *   5) 构建只保留选中连通域的 mask
 *   6) binaryDilation(r=fgMaskDilation) 微扩 1~2px 防削边
 *
 * 如果最终 mask 面积过小（退化 fallback），则返回 null 表示「不应用 mask」。
 */
export function buildForegroundMask(
  gray: Uint8ClampedArray,
  w: number,
  h: number,
  fgMaskDilation: number,
  fgMaskMinAreaRatio: number,
): Uint8Array | null {
  const N = w * h;
  const blurred = boxBlurGray(gray, w, h, 3);
  const t = otsuThreshold(blurred);

  // Otsu 二值化：灰度 > t 认为前景（=1），否则背景（=0）
  // 原因：对于大部分"主体亮/背景暗"或"主体暗/背景亮"的情况，
  // 最大连通域策略都能正确挑出主体；真正的主体色不影响此步骤。
  const bin = new Uint8Array(N);
  for (let i = 0; i < N; i++) bin[i] = blurred[i] > t ? 1 : 0;

  const cc = connectedComponents(bin, w, h, 4);
  if (cc.count === 0) return null;

  // 构造 (label, area) 数组并按面积降序
  const domains: Array<{ label: number; area: number }> = [];
  for (let l = 1; l <= cc.count; l++) {
    if (cc.areas[l] > 0) domains.push({ label: l, area: cc.areas[l] });
  }
  domains.sort((a, b) => b.area - a.area);

  // 边框接触标记：接触图像四条边界的连通域绝大多数是背景
  // （天空 / 地面 / 墙 / 大色块纹理），而主体（人 / 物）通常不接触边框。
  // 因此优先选「面积最大且不接触边框」的连通域作为主体 —— 这能显著改善
  // 复杂背景（背景比主体更大）下的前景分割。
  const touchesBorder = new Set<number>();
  for (let x = 0; x < w; x++) {
    touchesBorder.add(cc.labels[x]);
    touchesBorder.add(cc.labels[(h - 1) * w + x]);
  }
  for (let y = 0; y < h; y++) {
    touchesBorder.add(cc.labels[y * w]);
    touchesBorder.add(cc.labels[y * w + (w - 1)]);
  }
  touchesBorder.delete(0); // label 0 = 背景

  const minRatio = Math.max(0, Math.min(0.5, fgMaskMinAreaRatio));
  const selectedLabels = new Set<number>();

  // 1) 优先：最大「不接触边框」的连通域（主体）
  let bestNonBorderArea = 0;
  for (const d of domains) {
    if (touchesBorder.has(d.label)) continue;
    if (d.area > bestNonBorderArea) bestNonBorderArea = d.area;
  }
  if (bestNonBorderArea / N >= minRatio) {
    for (const d of domains) {
      if (!touchesBorder.has(d.label) && d.area === bestNonBorderArea) selectedLabels.add(d.label);
    }
  } else if (domains[0].area / N >= minRatio) {
    // 2) 主体铺满全帧（全接触边框）→ 退化为最大连通域
    selectedLabels.add(domains[0].label);
  } else {
    // 3) 全是碎块 → top-k 累加覆盖 15%（兜底防止主体被误判为背景小碎块）
    const TARGET = 0.15;
    let acc = 0;
    for (const d of domains) {
      selectedLabels.add(d.label);
      acc += d.area / N;
      if (acc >= TARGET) break;
    }
  }

  // 退化 fallback：如果最终选中的总面积 < 1% 或 > 99%，放弃 mask（防止纯色图误删）
  let selectedArea = 0;
  for (const d of domains) if (selectedLabels.has(d.label)) selectedArea += d.area;
  const ratio = selectedArea / N;
  if (ratio < 0.01 || ratio > 0.99) return null;

  // 构建 mask
  const mask = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const l = cc.labels[i];
    if (l !== 0 && selectedLabels.has(l)) mask[i] = 1;
  }

  // 膨胀
  return binaryDilation(mask, w, h, fgMaskDilation);
}

/* ------------------------------------------------------------------ *
 * 主入口
 * ------------------------------------------------------------------ */

export function fineOutline(
  data: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  channels: 1 | 4,
  options: FineOutlineOptions = {},
): FineOutlineResult {
  // 通用参数（两种管线都会用到）
  const minStrand = options.minStrand ?? 40;
  const maxPaths = options.maxPaths ?? 200;

  // Foreground Mask 新参数（默认全部向后兼容：enable=false）
  const enableForegroundMask = options.enableForegroundMask ?? false;
  const fgMaskDilation = Math.max(0, Math.floor(options.fgMaskDilation ?? 2));
  const fgMaskMinAreaRatio = options.fgMaskMinAreaRatio ?? 0.01;

  // 先转灰度（两种管线都可能用到，auto模式下做直方图分析）
  const gray = toGray(data, width, height, channels);

  // 预计算前景 mask（若启用）。结果可能为 null（退化 fallback，此时与旧行为完全一致）
  let fgMask: Uint8Array | null = null;
  let foregroundMaskApplied = false;
  if (enableForegroundMask) {
    fgMask = buildForegroundMask(gray, width, height, fgMaskDilation, fgMaskMinAreaRatio);
    foregroundMaskApplied = fgMask !== null;
  }

  // 判断应该走哪条管线
  let pipeline: 'standard' | 'highContrast';
  if (options.imageType === 'highContrast') {
    pipeline = 'highContrast';
  } else if (options.imageType === 'standard') {
    pipeline = 'standard';
  } else {
    // auto：用直方图自动判断
    pipeline = isHighContrastByHistogram(gray) ? 'highContrast' : 'standard';
  }

  // ===== 高对比度管线：二值化 + Moore 邻域追踪 =====
  if (pipeline === 'highContrast') {
    const threshold = options.threshold ?? 128;
    const eps = options.eps ?? 0.5;  // Moore 管线默认更高精度
    const res = traceOutlineHighContrast(gray, width, height, threshold, minStrand, eps, maxPaths, fgMask);
    return {
      polylines: res.polylines,
      width,
      height,
      edgeBinary: res.edgeBinary,
      totalEdgePixels: res.totalEdgePixels,
      pipeline: 'highContrast',
      foregroundMaskApplied,
    };
  }

  // ===== 标准管线：6 通道融合 + Canny =====
  const low = options.low ?? 55;
  const high = options.high ?? 130;
  const eps = options.eps ?? 0.9;

  // 1) 6 通道 + 融合
  const splits = splitSixChannels(data, width, height, channels);
  let fused = fusedMultiChannelGradient(splits, width, height);

  // 1.5) 若有前景 mask：在送入 Canny 之前对 fused 梯度做乘法等价于 AND（mask 是 0/1）
  if (fgMask) {
    const n = width * height;
    const maskedFused = new Uint8Array(n);
    for (let i = 0; i < n; i++) maskedFused[i] = fused[i] * fgMask[i];
    fused = maskedFused;
  }

  const edgeBinary = canny(fused as unknown as Uint8ClampedArray, width, height, low, high);

  // 2) 连通链 + 过滤短链
  let chains = chainsFromEdge(edgeBinary, width, height);
  chains.sort((x, y) => y.length - x.length);
  if (chains.length > maxPaths) chains = chains.slice(0, maxPaths);
  let keepRaw = chains.filter((c) => c.length >= minStrand);

  // 2.5) 噪声抑制：嘈杂背景下（花草树木/纹理）会抽出大量短碎链。
  // 若保留链数量较多，额外丢弃明显短于最长链的碎链，让「主体轮廓」更突出。
  // 仅在未锁定前景或链数很多时启用，避免误删人脸/表情等关键短特征。
  if (keepRaw.length >= 40) {
    const maxLen = keepRaw[0]?.length ?? 0;
    const cutoff = Math.max(minStrand, Math.floor(maxLen * 0.12));
    keepRaw = keepRaw.filter((c) => c.length >= cutoff);
  }

  // 3) 排序列 → Polyline → RDP 简化
  const polylines: Polyline[] = [];
  let totalEdgePixels = 0;
  for (const raw of keepRaw) {
    totalEdgePixels += raw.length;
    const ordered = orderChainByNearest(raw);
    // Polyline 需要的是至少 2 个点（开放或闭合的一段）——少于 2 的直接丢弃
    if (ordered.length < 2) continue;
    const pointsBefore = toPoints(ordered);
    const simplifiedPoints = rdpSimplify(pointsBefore, eps);
    if (simplifiedPoints.length < 2) continue;
    polylines.push({ points: simplifiedPoints, closed: false, area: ordered.length });
  }

  return { polylines, width, height, edgeBinary, totalEdgePixels, pipeline: 'standard', foregroundMaskApplied };
}
