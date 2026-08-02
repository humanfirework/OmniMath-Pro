/**
 * 边缘检测：Sobel 梯度幅值、Canny 边缘。
 * 纯 typed array，无 DOM 依赖。
 */
import { gaussianBlur } from './preprocess';

/** Sobel 算子梯度幅值（Float32Array，长度 w*h）。 */
export function sobel(
  gray: Uint8ClampedArray,
  w: number,
  h: number,
): Float32Array {
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // 3x3 邻域，边界 clamp
      const xm = x > 0 ? x - 1 : 0;
      const xp = x < w - 1 ? x + 1 : w - 1;
      const ym = y > 0 ? y - 1 : 0;
      const yp = y < h - 1 ? y + 1 : h - 1;
      const g = (xx: number, yy: number) => gray[yy * w + xx];
      const gx =
        -g(xm, ym) - 2 * g(xm, y) - g(xm, yp) +
        g(xp, ym) + 2 * g(xp, y) + g(xp, yp);
      const gy =
        -g(xm, ym) - 2 * g(x, ym) - g(xp, ym) +
        g(xm, yp) + 2 * g(x, yp) + g(xp, yp);
      out[y * w + x] = Math.sqrt(gx * gx + gy * gy);
    }
  }
  return out;
}

/**
 * Canny 边缘检测：高斯平滑 → Sobel → 非极大抑制 → 双阈值滞后。
 * 输出 0/1 边缘图。low/high 默认 30/80。
 */
export function canny(
  gray: Uint8ClampedArray,
  w: number,
  h: number,
  lowThreshold = 30,
  highThreshold = 80,
): Uint8Array {
  const blurred = gaussianBlur(gray, w, h, 1);
  const n = w * h;

  // 1) Sobel 梯度 + 方向
  const mag = new Float32Array(n);
  const ang = new Float32Array(n);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const xm = x > 0 ? x - 1 : 0;
      const xp = x < w - 1 ? x + 1 : w - 1;
      const ym = y > 0 ? y - 1 : 0;
      const yp = y < h - 1 ? y + 1 : h - 1;
      const g = (xx: number, yy: number) => blurred[yy * w + xx];
      const gx =
        -g(xm, ym) - 2 * g(xm, y) - g(xm, yp) +
        g(xp, ym) + 2 * g(xp, y) + g(xp, yp);
      const gy =
        -g(xm, ym) - 2 * g(x, ym) - g(xp, ym) +
        g(xm, yp) + 2 * g(x, yp) + g(xp, yp);
      const m = Math.sqrt(gx * gx + gy * gy);
      mag[y * w + x] = m;
      ang[y * w + x] = Math.atan2(gy, gx);
    }
  }

  // 2) 非极大抑制：将方向量化到 0/45/90/135，与邻域比较
  const nms = new Float32Array(n);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const m = mag[y * w + x];
      if (m < 1e-6) continue;
      const a = ang[y * w + x];
      const deg = ((a * 180) / Math.PI + 180) % 180; // 0..180
      let n1 = 0;
      let n2 = 0;
      if (deg < 22.5 || deg >= 157.5) {
        // 水平方向梯度 → 比较左右
        n1 = x > 0 ? mag[y * w + x - 1] : 0;
        n2 = x < w - 1 ? mag[y * w + x + 1] : 0;
      } else if (deg < 67.5) {
        // 45°
        n1 = x < w - 1 && y > 0 ? mag[(y - 1) * w + x + 1] : 0;
        n2 = x > 0 && y < h - 1 ? mag[(y + 1) * w + x - 1] : 0;
      } else if (deg < 112.5) {
        // 垂直
        n1 = y > 0 ? mag[(y - 1) * w + x] : 0;
        n2 = y < h - 1 ? mag[(y + 1) * w + x] : 0;
      } else {
        // 135°
        n1 = x > 0 && y > 0 ? mag[(y - 1) * w + x - 1] : 0;
        n2 = x < w - 1 && y < h - 1 ? mag[(y + 1) * w + x + 1] : 0;
      }
      if (m >= n1 && m >= n2) nms[y * w + x] = m;
    }
  }

  // 3) 双阈值 + 滞后：强边缘种子，BFS 连接弱边缘
  const out = new Uint8Array(n);
  const weak = new Uint8Array(n);
  const stack: number[] = [];
  for (let i = 0; i < n; i++) {
    if (nms[i] >= highThreshold) {
      out[i] = 1;
      stack.push(i);
    } else if (nms[i] >= lowThreshold) {
      weak[i] = 1;
    }
  }
  while (stack.length > 0) {
    const idx = stack.pop() as number;
    const x = idx % w;
    const y = (idx / w) | 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const ni = ny * w + nx;
        if (weak[ni] === 1 && out[ni] === 0) {
          out[ni] = 1;
          weak[ni] = 0;
          stack.push(ni);
        }
      }
    }
  }
  return out;
}
