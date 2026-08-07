/**
 * Vision Worker Client — main-thread facade over `visionWorker.ts`.
 *
 * Public surface mirrors the granular stage APIs in `src/lib/vision/`.
 * Each method dispatches the call to a dedicated Web Worker so the main
 * thread stays free to render the UI / animations while a 4K photo or a
 * 300-frame GIF is being processed.
 *
 * Lifecycle & fallback:
 *   - The Worker is created lazily on first call (avoids paying spawn
 *     cost for users who never touch the vision pipeline).
 *   - If `Worker` is undefined (SSR / jsdom test / very old browser),
 *     the client transparently falls back to calling the same pure
 *     functions in-thread. This keeps tests green without a real worker.
 *   - If the Worker throws on its first message (e.g. CSP blocks worker
 *     creation), we permanently mark it as failed and fall back to
 *     in-thread for the rest of the session — no retry storm.
 *
 * Concurrency:
 *   - Each call gets a monotonic `id`; the worker tags its response with
 *     the same id. A `Map<id, resolver>` matches responses back to calls.
 *   - Calls are independent and can be interleaved (no global lock). The
 *     worker is single-threaded so ops naturally run in arrival order.
 */
import {
  toGrayscale,
  binarize,
  multiLevelThreshold,
  binarizeByLevel,
  adaptiveThreshold,
  removeSmallRegions,
  sobel,
  canny,
  traceContours,
  rdpSimplify,
  fitBezierPath,
  fitFourier,
  sampleFourierCurve,
  zhangSuenThin,
  skeletonToPolylines,
  imageToCurves,
  videoToCurves,
} from './index';
import { decodeGif } from './video';
import type {
  Polyline,
  BezierPath,
  ImageDataLike,
  VisionOptions,
  CurveSet,
} from './types';
import type { FrameSequence } from './video';
import type { VideoToCurvesOptions, VideoToCurvesResult } from './videoToCurves';
import type { VisionWorkerOp, VisionWorkerRequest, VisionWorkerResponse } from './visionWorker';

interface PendingRequest {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
}

let workerInstance: Worker | null = null;
let workerFailed = false;
let workerAttempts = 0;
let nextRequestId = 1;
const pending = new Map<number, PendingRequest>();

/** Maximum worker-rebuild attempts before permanently degrading to in-thread. */
const MAX_WORKER_ATTEMPTS = 3;

/**
 * Lazily create the vision worker. Returns `null` when workers are
 * unavailable (SSR, jsdom, or creation rejected by CSP). On creation
 * failure, sets `workerFailed` and increments `workerAttempts`; once
 * `workerAttempts >= MAX_WORKER_ATTEMPTS`, subsequent calls skip the
 * attempt entirely and the client permanently degrades to in-thread.
 */
function getWorker(): Worker | null {
  if (workerFailed && workerAttempts >= MAX_WORKER_ATTEMPTS) return null;
  if (workerInstance) return workerInstance;
  if (typeof Worker === 'undefined') return null;
  try {
    workerAttempts++;
    // The `new URL(..., import.meta.url)` form is the only syntax that
    // Turbopack/Webpack will statically rewrite into a separate worker
    // chunk. Do not refactor to a string-path import.
    const worker = new Worker(new URL('./visionWorker.ts', import.meta.url));
    worker.onmessage = (e: MessageEvent<VisionWorkerResponse>) => {
      const { id, result, error } = e.data;
      const req = pending.get(id);
      if (!req) return;
      pending.delete(id);
      if (error !== undefined) {
        req.reject(new Error(error));
      } else {
        req.resolve(result);
      }
    };
    worker.onerror = (e) => {
      // Reject all pending requests; mark worker as failed and count it
      // toward the rebuild budget so we can retry on the next call.
      workerFailed = true;
      const err = new Error(e.message || 'vision worker crashed');
      for (const req of pending.values()) req.reject(err);
      pending.clear();
      try {
        worker.terminate();
      } catch {
        /* noop */
      }
      workerInstance = null;
    };
    workerInstance = worker;
    workerFailed = false;
    workerAttempts = 0;
    return worker;
  } catch {
    workerFailed = true;
    return null;
  }
}

/** Send a request to the worker; fall back to in-thread call if unavailable. */
function callWorker<T>(op: VisionWorkerOp, args: unknown[]): Promise<T> {
  const worker = getWorker();
  if (!worker) {
    // Fallback: run in-thread. Still async to preserve the call shape.
    return Promise.resolve().then(() => runInThread<T>(op, args));
  }
  return new Promise<T>((resolve, reject) => {
    const id = nextRequestId++;
    pending.set(id, {
      resolve: (v: unknown) => resolve(v as T),
      reject,
    });
    const req: VisionWorkerRequest = { id, op, args };
    worker.postMessage(req);
  });
}

/** In-thread fallback — same dispatch table as the worker. */
async function runInThread<T>(op: VisionWorkerOp, args: unknown[]): Promise<T> {
  switch (op) {
    case 'imageToCurves':
      return imageToCurves(args[0] as ImageDataLike, args[1] as VisionOptions | undefined) as T;
    case 'videoToCurves':
      return videoToCurves(args[0] as FrameSequence, args[1] as VideoToCurvesOptions | undefined) as T;
    case 'toGrayscale':
      return toGrayscale(args[0] as ImageDataLike) as T;
    case 'binarize':
      return binarize(args[0] as Uint8ClampedArray, args[1] as number, args[2] as number, args[3] as number) as T;
    case 'multiLevelThreshold':
      return multiLevelThreshold(args[0] as Uint8ClampedArray, args[1] as number, args[2] as number, args[3] as number) as T;
    case 'binarizeByLevel':
      return binarizeByLevel(args[0] as Uint8Array, args[1] as number, args[2] as number, args[3] as number) as T;
    case 'adaptiveThreshold':
      return adaptiveThreshold(args[0] as Uint8ClampedArray, args[1] as number, args[2] as number) as T;
    case 'removeSmallRegions':
      return removeSmallRegions(args[0] as Uint8Array, args[1] as number, args[2] as number, args[3] as number) as T;
    case 'sobel':
      return sobel(args[0] as Uint8ClampedArray, args[1] as number, args[2] as number) as T;
    case 'canny':
      return canny(args[0] as Uint8ClampedArray, args[1] as number, args[2] as number, args[3] as number, args[4] as number) as T;
    case 'traceContours':
      return traceContours(args[0] as Uint8Array, args[1] as number, args[2] as number) as T;
    case 'zhangSuenThin':
      return zhangSuenThin(args[0] as Uint8Array, args[1] as number, args[2] as number) as T;
    case 'skeletonToPolylines':
      return skeletonToPolylines(args[0] as Uint8Array, args[1] as number, args[2] as number) as T;
    case 'rdpSimplify':
      return rdpSimplify(args[0] as Polyline['points'], args[1] as number) as T;
    case 'fitBezierPath':
      return fitBezierPath(args[0] as Polyline, args[1] as number, args[2] as number) as T;
    case 'fitFourier':
      return fitFourier(args[0] as Polyline, args[1] as number) as T;
    case 'sampleFourierCurve':
      return sampleFourierCurve(args[0] as ReturnType<typeof fitFourier>, args[1] as number) as T;
    case 'decodeGif':
      return (await decodeGif(args[0] as ArrayBuffer)) as T;
    default: {
      const _exhaustive: never = op;
      throw new Error(`Unknown vision worker op: ${String(_exhaustive)}`);
    }
  }
}

/* ------------------------------------------------------------------ *
 * Public typed API — each method mirrors a vision stage function but
 * returns a Promise and runs off the main thread when possible.
 * ------------------------------------------------------------------ */

export const visionWorkerClient = {
  imageToCurves(imageData: ImageDataLike, options?: VisionOptions): Promise<CurveSet> {
    return callWorker<CurveSet>('imageToCurves', [imageData, options]);
  },
  videoToCurves(seq: FrameSequence, options?: VideoToCurvesOptions): Promise<VideoToCurvesResult> {
    return callWorker<VideoToCurvesResult>('videoToCurves', [seq, options]);
  },
  toGrayscale(imageData: ImageDataLike): Promise<Uint8ClampedArray> {
    return callWorker<Uint8ClampedArray>('toGrayscale', [imageData]);
  },
  binarize(gray: Uint8ClampedArray, w: number, h: number, threshold: number): Promise<Uint8Array> {
    return callWorker<Uint8Array>('binarize', [gray, w, h, threshold]);
  },
  multiLevelThreshold(gray: Uint8ClampedArray, w: number, h: number, levels: number): Promise<Uint8Array> {
    return callWorker<Uint8Array>('multiLevelThreshold', [gray, w, h, levels]);
  },
  binarizeByLevel(labels: Uint8Array, w: number, h: number, level: number): Promise<Uint8Array> {
    return callWorker<Uint8Array>('binarizeByLevel', [labels, w, h, level]);
  },
  adaptiveThreshold(gray: Uint8ClampedArray, w: number, h: number): Promise<Uint8Array> {
    return callWorker<Uint8Array>('adaptiveThreshold', [gray, w, h]);
  },
  removeSmallRegions(bin: Uint8Array, w: number, h: number, turdsize: number): Promise<Uint8Array> {
    return callWorker<Uint8Array>('removeSmallRegions', [bin, w, h, turdsize]);
  },
  sobel(gray: Uint8ClampedArray, w: number, h: number): Promise<Float32Array> {
    return callWorker<Float32Array>('sobel', [gray, w, h]);
  },
  canny(gray: Uint8ClampedArray, w: number, h: number, low: number, high: number): Promise<Uint8Array> {
    return callWorker<Uint8Array>('canny', [gray, w, h, low, high]);
  },
  traceContours(bin: Uint8Array, w: number, h: number): Promise<Polyline[]> {
    return callWorker<Polyline[]>('traceContours', [bin, w, h]);
  },
  zhangSuenThin(bin: Uint8Array, w: number, h: number): Promise<Uint8Array> {
    return callWorker<Uint8Array>('zhangSuenThin', [bin, w, h]);
  },
  skeletonToPolylines(skel: Uint8Array, w: number, h: number): Promise<Polyline[]> {
    return callWorker<Polyline[]>('skeletonToPolylines', [skel, w, h]);
  },
  rdpSimplify(pts: Polyline['points'], eps: number): Promise<Polyline['points']> {
    return callWorker<Polyline['points']>('rdpSimplify', [pts, eps]);
  },
  fitBezierPath(poly: Polyline, errorThreshold: number, cornerThreshold: number): Promise<BezierPath> {
    return callWorker<BezierPath>('fitBezierPath', [poly, errorThreshold, cornerThreshold]);
  },
  fitFourier(poly: Polyline, order: number): Promise<ReturnType<typeof fitFourier>> {
    return callWorker<ReturnType<typeof fitFourier>>('fitFourier', [poly, order]);
  },
  sampleFourierCurve(fc: ReturnType<typeof fitFourier>, n: number): Promise<Polyline['points']> {
    return callWorker<Polyline['points']>('sampleFourierCurve', [fc, n]);
  },
  decodeGif(data: ArrayBuffer): Promise<FrameSequence> {
    return callWorker<FrameSequence>('decodeGif', [data]);
  },
  /** True when the vision worker is alive and being used (no fallback). */
  isUsingWorker(): boolean {
    return !workerFailed && workerInstance !== null && typeof Worker !== 'undefined';
  },
};

export type VisionWorkerClient = typeof visionWorkerClient;
