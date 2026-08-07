/**
 * 图像预处理：灰度化、高斯模糊、（多级 / 自适应 / 简单）阈值化、小区域去除。
 *
 * 全部基于 typed array，无 DOM 依赖。约定：
 *  - 灰度图为 Uint8ClampedArray（长度 = w*h）。
 *  - 二值图 / 标签图为 Uint8Array，前景 = 1。
 */
import type { ImageDataLike } from './types';

/** 校验公开入口的图像尺寸与数据长度；非法输入直接抛错，避免产生垃圾输出。 */
function assertValidInput(
  fn: string,
  dataLength: number,
  w: number,
  h: number,
  channels: 1 | 4,
): void {
  if (!(w > 0) || !(h > 0)) {
    throw new Error(`${fn}: 输入尺寸非法 (w=${w}, h=${h})`);
  }
  const expected = w * h * channels;
  if (dataLength !== expected) {
    throw new Error(
      `${fn}: 数据长度与尺寸不匹配 (data.length=${dataLength}, 期望 ${expected} = ${w}*${h}*${channels})`,
    );
  }
}

/** 标准亮度公式：0.299R + 0.587G + 0.114B。忽略 alpha。 */
export function toGrayscale(imageData: ImageDataLike): Uint8ClampedArray {
  const { data, width, height } = imageData;
  assertValidInput('toGrayscale', data.length, width, height, 4);
  const n = width * height;
  const gray = new Uint8ClampedArray(n);
  for (let i = 0; i < n; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    gray[i] = (0.299 * r + 0.587 * g + 0.114 * b + 0.5) | 0;
  }
  return gray;
}

/**
 * 可分离高斯模糊（支持任意 radius）。
 * 核由一维高斯 G(x)=exp(-x²/(2σ²)) 生成，σ = radius/3（保证 radius 处衰减到 ~0.01），
 * 做两次一维卷积（先 x 后 y），边界采用 clamp。radius<=0 返回原副本。
 */
export function gaussianBlur(
  gray: Uint8ClampedArray,
  w: number,
  h: number,
  radius = 1,
): Uint8ClampedArray {
  if (radius <= 0) return gray.slice();
  const r = Math.floor(radius);
  const sigma = Math.max(0.5, radius / 3);
  // 构建一维高斯核（长度为 2r+1）
  const kernel = new Float64Array(2 * r + 1);
  let kSum = 0;
  for (let k = -r; k <= r; k++) {
    const v = Math.exp(-(k * k) / (2 * sigma * sigma));
    kernel[k + r] = v;
    kSum += v;
  }

  const tmp = new Float64Array(w * h);
  // 水平 pass
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let k = -r; k <= r; k++) {
        const xx = x + k < 0 ? 0 : x + k >= w ? w - 1 : x + k;
        acc += gray[row + xx] * kernel[k + r];
      }
      tmp[row + x] = acc / kSum;
    }
  }
  // 垂直 pass
  const out = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let k = -r; k <= r; k++) {
        const yy = y + k < 0 ? 0 : y + k >= h ? h - 1 : y + k;
        acc += tmp[yy * w + x] * kernel[k + r];
      }
      out[y * w + x] = acc / kSum + 0.5;
    }
  }
  return out;
}

/**
 * 多阈值分层：把 [0,255] 等间距划分为 levels 个区间，
 * 每个像素归入对应区间标签 0..levels-1，覆盖全部明暗范围。
 */
export function multiLevelThreshold(
  gray: Uint8ClampedArray,
  w: number,
  h: number,
  levels: number,
): Uint8Array {
  assertValidInput('multiLevelThreshold', gray.length, w, h, 1);
  const n = w * h;
  const labels = new Uint8Array(n);
  const safeLevels = levels > 1 ? levels : 1;
  // 区间宽度 = 256 / levels。label = floor(gray / width)，并 clamp。
  const widthPerLevel = 256 / safeLevels;
  for (let i = 0; i < n; i++) {
    let lbl = (gray[i] / widthPerLevel) | 0;
    if (lbl >= safeLevels) lbl = safeLevels - 1;
    if (lbl < 0) lbl = 0;
    labels[i] = lbl;
  }
  return labels;
}

/**
 * 自适应二值化：局部均值（blockRadius 邻域）- C。
 * 用积分图加速局部均值。输出 0/1，前景（暗）= 1。
 */
export function adaptiveThreshold(
  gray: Uint8ClampedArray,
  w: number,
  h: number,
  blockRadius = 5,
  C = 5,
): Uint8Array {
  assertValidInput('adaptiveThreshold', gray.length, w, h, 1);
  const n = w * h;
  // 积分图（多一行一列便于求和）
  const integral = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let rowSum = 0;
    for (let x = 0; x < w; x++) {
      rowSum += gray[y * w + x];
      integral[(y + 1) * (w + 1) + (x + 1)] =
        integral[y * (w + 1) + (x + 1)] + rowSum;
    }
  }
  const out = new Uint8Array(n);
  const r = blockRadius;
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(h - 1, y + r);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w - 1, x + r);
      const area = (y1 - y0 + 1) * (x1 - x0 + 1);
      const sum =
        integral[(y1 + 1) * (w + 1) + (x1 + 1)] -
        integral[y0 * (w + 1) + (x1 + 1)] -
        integral[(y1 + 1) * (w + 1) + x0] +
        integral[y0 * (w + 1) + x0];
      const mean = sum / area;
      out[y * w + x] = gray[y * w + x] < mean - C ? 1 : 0;
    }
  }
  return out;
}

/** 简单阈值二值化：gray < threshold → 1（前景），否则 0。 */
export function binarize(
  gray: Uint8ClampedArray,
  w: number,
  h: number,
  threshold: number,
): Uint8Array {
  assertValidInput('binarize', gray.length, w, h, 1);
  const n = w * h;
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = gray[i] < threshold ? 1 : 0;
  }
  return out;
}

/** 由标签图层（multiLevelThreshold 的输出）得到某一层级的二值图。 */
export function binarizeByLevel(
  labels: Uint8Array,
  w: number,
  h: number,
  level: number,
): Uint8Array {
  const n = w * h;
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = labels[i] === level ? 1 : 0;
  }
  return out;
}

/**
 * 移除面积 < turdsize 的前景连通区域（4-连通 flood fill 标记）。
 * 原地返回新数组；turdsize <= 0 时直接返回副本。
 */
export function removeSmallRegions(
  binary: Uint8Array,
  w: number,
  h: number,
  turdsize: number,
): Uint8Array {
  assertValidInput('removeSmallRegions', binary.length, w, h, 1);
  const n = w * h;
  const out = binary.slice();
  if (turdsize <= 0) return out;
  const labels = new Int32Array(n).fill(-1);
  const stack: number[] = [];
  let curLabel = 0;
  for (let start = 0; start < n; start++) {
    if (out[start] !== 1 || labels[start] !== -1) continue;
    // flood fill
    stack.length = 0;
    stack.push(start);
    labels[start] = curLabel;
    const members: number[] = [];
    while (stack.length > 0) {
      const idx = stack.pop() as number;
      members.push(idx);
      const x = idx % w;
      const y = (idx / w) | 0;
      // 4 邻接
      const neigh = [
        x > 0 ? idx - 1 : -1,
        x < w - 1 ? idx + 1 : -1,
        y > 0 ? idx - w : -1,
        y < h - 1 ? idx + w : -1,
      ];
      for (let k = 0; k < 4; k++) {
        const ni = neigh[k];
        if (ni < 0) continue;
        if (out[ni] === 1 && labels[ni] === -1) {
          labels[ni] = curLabel;
          stack.push(ni);
        }
      }
    }
    if (members.length < turdsize) {
      for (let i = 0; i < members.length; i++) out[members[i]] = 0;
    }
    curLabel++;
  }
  return out;
}

/**
 * 二值腐蚀：r×r 方形结构元，0/1 数组。
 * 输出中，仅当 src 的 r 邻域内全部为 1 时该像素保留。
 */
export function binaryErode(
  src: Uint8Array,
  w: number,
  h: number,
  r = 1,
): Uint8Array {
  const n = w * h;
  const dst = new Uint8Array(n);
  if (r <= 0) {
    dst.set(src);
    return dst;
  }
  for (let y = 0; y < h; y++) {
    const y0 = y - r < 0 ? 0 : y - r;
    const y1 = y + r >= h ? h - 1 : y + r;
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (src[p] !== 1) continue;
      const x0 = x - r < 0 ? 0 : x - r;
      const x1 = x + r >= w ? w - 1 : x + r;
      let all = true;
      outer: for (let yy = y0; yy <= y1; yy++) {
        const row = yy * w;
        for (let xx = x0; xx <= x1; xx++) {
          if (src[row + xx] !== 1) {
            all = false;
            break outer;
          }
        }
      }
      if (all) dst[p] = 1;
    }
  }
  return dst;
}

/** 二值膨胀：r×r 方形结构元（与 fineOutline.binaryDilation 等价，供 preprocess 独立使用）。 */
export function binaryDilate(
  src: Uint8Array,
  w: number,
  h: number,
  r = 1,
): Uint8Array {
  const n = w * h;
  const dst = new Uint8Array(n);
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
        for (let xx = x0; xx <= x1; xx++) dst[row + xx] = 1;
      }
    }
  }
  return dst;
}

/**
 * 形态学开运算：先腐蚀后膨胀。去除细小毛刺/孤立点，保持对象整体形状。
 * op='open' → 先 erode 后 dilate；op='close' → 先 dilate 后 erode（填充小孔）。
 */
export function binaryMorphology(
  src: Uint8Array,
  w: number,
  h: number,
  op: 'open' | 'close',
  r = 1,
): Uint8Array {
  if (r <= 0) return src.slice();
  if (op === 'open') {
    return binaryDilate(binaryErode(src, w, h, r), w, h, r);
  }
  return binaryErode(binaryDilate(src, w, h, r), w, h, r);
}
