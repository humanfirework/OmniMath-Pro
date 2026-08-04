/**
 * 复傅里叶级数曲线拟合（闭合轮廓 → epicycles）。
 * 把轮廓点表示为复数 z_k = (x_k - cx) + i(y_k - cy)，
 * 计算 DFT 得到阶数 m ∈ [-n, n] 的系数 c_m。
 * 纯 TypeScript，无 DOM 依赖。
 */
import type { Polyline, Point, FourierCurve } from './types';

/**
 * 把闭合轮廓转为复傅里叶级数。
 * order = 单边阶数 n，共 2n+1 个系数。
 * centerX/Y 取轮廓质心（点均值）。
 */
export function fitFourier(polyline: Polyline, order: number): FourierCurve {
  const pts = polyline.points;
  const N = pts.length;
  const n = order;
  // 空轮廓：无系数、质心归零，避免 NaN 传播。
  if (N === 0) return { coefficients: [], centerX: 0, centerY: 0, n };
  // 质心
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < N; i++) {
    cx += pts[i].x;
    cy += pts[i].y;
  }
  cx /= N;
  cy /= N;

  // z_k = (x-cx) + i(y-cy)
  const zRe = new Float64Array(N);
  const zIm = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    zRe[i] = pts[i].x - cx;
    zIm[i] = pts[i].y - cy;
  }

  // c_m = (1/N) Σ z_k exp(-2πi m k / N), m ∈ [-n, n]
  const coefficients: { re: number; im: number }[] = [];
  for (let mi = 0; mi <= 2 * n; mi++) {
    const m = mi - n;
    let re = 0;
    let im = 0;
    for (let k = 0; k < N; k++) {
      const ang = (-2 * Math.PI * m * k) / N;
      const cos = Math.cos(ang);
      const sin = Math.sin(ang);
      // (zRe + i zIm)(cos + i sin) = (zRe cos - zIm sin) + i(zRe sin + zIm cos)
      re += zRe[k] * cos - zIm[k] * sin;
      im += zRe[k] * sin + zIm[k] * cos;
    }
    coefficients.push({ re: re / N, im: im / N });
  }

  return { coefficients, centerX: cx, centerY: cy, n };
}

/** 按参数 t ∈ [0,1) 采样重建点。 */
export function sampleFourier(fc: FourierCurve, t: number): Point {
  const n = fc.n;
  let re = 0;
  let im = 0;
  for (let i = 0; i < fc.coefficients.length; i++) {
    const m = i - n;
    const ang = 2 * Math.PI * m * t;
    const cos = Math.cos(ang);
    const sin = Math.sin(ang);
    const c = fc.coefficients[i];
    // c_m * exp(+i ang)
    re += c.re * cos - c.im * sin;
    im += c.re * sin + c.im * cos;
  }
  return { x: re + fc.centerX, y: im + fc.centerY };
}

/** 采样整条曲线（numSamples 个点，t ∈ [0,1)）。 */
export function sampleFourierCurve(fc: FourierCurve, numSamples: number): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < numSamples; i++) {
    const t = i / numSamples;
    out.push(sampleFourier(fc, t));
  }
  return out;
}

/**
 * 重建误差（最大偏差）：对原轮廓每个点 k，取 t=k/N 重建，
 * 计算欧氏距离，返回最大值。
 */
export function fourierError(polyline: Polyline, fc: FourierCurve): number {
  const pts = polyline.points;
  const N = pts.length;
  let maxErr = 0;
  for (let k = 0; k < N; k++) {
    const t = k / N;
    const p = sampleFourier(fc, t);
    const dx = pts[k].x - p.x;
    const dy = pts[k].y - p.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > maxErr) maxErr = d;
  }
  return maxErr;
}
