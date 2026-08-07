/**
 * Vision compute Web Worker entry.
 *
 * Offloads CPU-intensive vision pipeline stages (binarize, edge detect,
 * contour trace, Bezier/Fourier fit, GIF decode) from the main thread so
 * the UI stays responsive while processing large images or long GIFs.
 *
 * Protocol (postMessage):
 *   → request:  { id: number, op: OpName, args: unknown[] }
 *   ← response: { id: number, result?: unknown, error?: string }
 *
 * The op set mirrors the granular stage APIs already exported from
 * `src/lib/vision/`. Each op maps 1:1 to a pure function call; the worker
 * stays stateless between requests.
 *
 * All arguments and return values are plain-serializable (typed arrays,
 * plain objects) — structured clone handles them without any custom
 * serialization. This is why `ImageDataLike` deliberately uses
 * `Uint8ClampedArray` (cloneable) rather than `ImageData` (not cloneable
 * across worker boundary in all browsers).
 */
/// <reference lib="webworker" />

import {
  toGrayscale,
  binarize,
  multiLevelThreshold,
  binarizeByLevel,
  adaptiveThreshold,
  removeSmallRegions,
} from './preprocess';
import { sobel, canny } from './edges';
import { traceContours } from './trace';
import { rdpSimplify, fitBezierPath } from './fit';
import { fitFourier, sampleFourierCurve } from './fourier';
import { zhangSuenThin, skeletonToPolylines } from './skeleton';
import { imageToCurves } from './index';
import { videoToCurves } from './videoToCurves';
import { decodeGif } from './video';
import type { Polyline, BezierPath, ImageDataLike, VisionOptions } from './types';
import type { VideoToCurvesOptions } from './videoToCurves';
import type { FrameSequence } from './video';

/** Operations exposed by this worker. */
export type VisionWorkerOp =
  | 'imageToCurves'
  | 'videoToCurves'
  | 'toGrayscale'
  | 'binarize'
  | 'multiLevelThreshold'
  | 'binarizeByLevel'
  | 'adaptiveThreshold'
  | 'removeSmallRegions'
  | 'sobel'
  | 'canny'
  | 'traceContours'
  | 'zhangSuenThin'
  | 'skeletonToPolylines'
  | 'rdpSimplify'
  | 'fitBezierPath'
  | 'fitFourier'
  | 'sampleFourierCurve'
  | 'decodeGif';

export interface VisionWorkerRequest {
  id: number;
  op: VisionWorkerOp;
  args: unknown[];
}

export interface VisionWorkerResponse {
  id: number;
  result?: unknown;
  error?: string;
}

/** Dispatch table — each entry runs the corresponding pure function. */
function dispatch(op: VisionWorkerOp, args: unknown[]): unknown {
  switch (op) {
    case 'imageToCurves': {
      const [imageData, options] = args as [ImageDataLike, VisionOptions | undefined];
      return imageToCurves(imageData, options);
    }
    case 'videoToCurves': {
      const [seq, options] = args as [FrameSequence, VideoToCurvesOptions | undefined];
      return videoToCurves(seq, options);
    }
    case 'toGrayscale': {
      const [imageData] = args as [ImageDataLike];
      return toGrayscale(imageData);
    }
    case 'binarize': {
      const [gray, w, h, threshold] = args as [Uint8ClampedArray, number, number, number];
      return binarize(gray, w, h, threshold);
    }
    case 'multiLevelThreshold': {
      const [gray, w, h, levels] = args as [Uint8ClampedArray, number, number, number];
      return multiLevelThreshold(gray, w, h, levels);
    }
    case 'binarizeByLevel': {
      const [labels, w, h, level] = args as [Uint8Array, number, number, number];
      return binarizeByLevel(labels, w, h, level);
    }
    case 'adaptiveThreshold': {
      const [gray, w, h] = args as [Uint8ClampedArray, number, number];
      return adaptiveThreshold(gray, w, h);
    }
    case 'removeSmallRegions': {
      const [bin, w, h, turdsize] = args as [Uint8Array, number, number, number];
      return removeSmallRegions(bin, w, h, turdsize);
    }
    case 'sobel': {
      const [gray, w, h] = args as [Uint8ClampedArray, number, number];
      return sobel(gray, w, h);
    }
    case 'canny': {
      const [gray, w, h, low, high] = args as [Uint8ClampedArray, number, number, number, number];
      return canny(gray, w, h, low, high);
    }
    case 'traceContours': {
      const [bin, w, h] = args as [Uint8Array, number, number];
      return traceContours(bin, w, h);
    }
    case 'zhangSuenThin': {
      const [bin, w, h] = args as [Uint8Array, number, number];
      return zhangSuenThin(bin, w, h);
    }
    case 'skeletonToPolylines': {
      const [skel, w, h] = args as [Uint8Array, number, number];
      return skeletonToPolylines(skel, w, h);
    }
    case 'rdpSimplify': {
      const [pts, eps] = args as [Polyline['points'], number];
      return rdpSimplify(pts, eps);
    }
    case 'fitBezierPath': {
      const [poly, errorThreshold, cornerThreshold] = args as [Polyline, number, number];
      return fitBezierPath(poly, errorThreshold, cornerThreshold) as BezierPath;
    }
    case 'fitFourier': {
      const [poly, order] = args as [Polyline, number];
      return fitFourier(poly, order);
    }
    case 'sampleFourierCurve': {
      const [fc, n] = args as [ReturnType<typeof fitFourier>, number];
      return sampleFourierCurve(fc, n);
    }
    case 'decodeGif': {
      // decodeGif is async — caller awaits via promise; worker can post
      // back synchronously after awaiting internally.
      throw new Error('decodeGif must be dispatched via the async path');
    }
    default: {
      const _exhaustive: never = op;
      throw new Error(`Unknown vision worker op: ${String(_exhaustive)}`);
    }
  }
}

/** Async dispatch — for ops that return Promises (currently only decodeGif). */
async function dispatchAsync(op: VisionWorkerOp, args: unknown[]): Promise<unknown> {
  if (op === 'decodeGif') {
    const [data] = args as [ArrayBuffer];
    return decodeGif(data);
  }
  return dispatch(op, args);
}

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = async (e: MessageEvent<VisionWorkerRequest>) => {
  const { id, op, args } = e.data;
  try {
    const result = await dispatchAsync(op, args);
    const response: VisionWorkerResponse = { id, result };
    ctx.postMessage(response);
  } catch (err) {
    const response: VisionWorkerResponse = {
      id,
      error: err instanceof Error ? err.message : String(err),
    };
    ctx.postMessage(response);
  }
};
