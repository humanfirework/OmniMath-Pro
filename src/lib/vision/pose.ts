/**
 * MediaPipe Pose 集成 — 把视频帧序列转为骨骼关键点序列，再转为骨骼曲线动画。
 *
 * 关键依赖：`@mediapipe/tasks-vision` 的 `PoseLandmarker`。本模块通过
 * `dynamic import(...)` 在运行时按需加载，**不作为静态依赖**
 * （避免打包体积；package.json 也无需安装该包）。
 *
 * 数据形态：
 *   - PoseLandmark：归一化坐标 [0,1]（x,y）+ z（相对深度）+ visibility
 *   - PoseFrame：一帧的 33 个关键点 + 帧尺寸（用于像素坐标映射）
 *   - PoseSequence：整段视频的关键点序列 + fps + width/height
 *   - BezierPath[]：每条骨骼连线 = 一条单段三次贝塞尔（用直线表达）
 *
 * 降级策略：`getPoseLandmarker` 在加载失败时抛出错误，调用方
 * （pose-track 节点）捕获后返回 `{ error: 'pose model unavailable', fallback: 'contour' }`。
 */
import type { BezierPath, BezierSegment, Point } from './types';
import type { FrameSequence } from './video';
import { downsampleVideoFrame } from './video';
import { throttleFrames } from './videoToCurves';

/* ------------------------------------------------------------------ *
 * 类型
 * ------------------------------------------------------------------ */

export interface PoseLandmark {
  x: number;
  y: number;
  z: number;
  visibility: number;
}

export interface PoseFrame {
  landmarks: PoseLandmark[];
  timestamp: number;
  index: number;
  /** 帧像素宽（用于把归一化坐标映射到像素；缺省时按 1 处理）。 */
  width?: number;
  /** 帧像素高。 */
  height?: number;
}

export interface PoseSequence {
  frames: PoseFrame[];
  fps: number;
  width: number;
  height: number;
}

/* ------------------------------------------------------------------ *
 * MediaPipe Pose 33 关键点骨骼连接
 * ------------------------------------------------------------------ *
 * 索引含义（MediaPipe Pose Landmarker 标准）：
 *   0  鼻子  1  左眼内  2  左眼  3  左眼外
 *   4  右眼内 5  右眼  6  右眼外
 *   7  左耳  8  右耳
 *   9  嘴左  10 嘴右
 *   11 左肩  12 右肩
 *   13 左肘  14 右肘
 *   15 左腕  16 右腕
 *   17 左小指 18 右小指
 *   19 左食指 20 右食指
 *   21 左拇指 22 右拇指
 *   23 左髋  24 右髋
 *   25 左膝  26 右膝
 *   27 左踝  28 右踝
 *   29 左脚跟 30 右脚跟
 *   31 左脚趾 32 右脚趾
 */
export const POSE_CONNECTIONS: ReadonlyArray<readonly [number, number]> = [
  // 头部（眼/耳/嘴）
  [0, 1], [1, 2], [2, 3], [3, 7],
  [0, 4], [4, 5], [5, 6], [6, 8],
  [9, 10],
  // 上肢（肩 → 肘 → 腕 → 指）
  [11, 12],
  [11, 13], [13, 15],
  [15, 17], [15, 19], [15, 21], [17, 19],
  [12, 14], [14, 16],
  [16, 18], [16, 20], [16, 22], [18, 20],
  // 躯干（肩 → 髋）
  [11, 23], [12, 24], [23, 24],
  // 下肢（髋 → 膝 → 踝 → 脚）
  [23, 25], [25, 27], [27, 29], [29, 31], [27, 31],
  [24, 26], [26, 28], [28, 30], [30, 32], [28, 32],
];

/* ------------------------------------------------------------------ *
 * 关键点 → 骨骼曲线
 * ------------------------------------------------------------------ */

/**
 * 把 PoseFrame 转为骨骼曲线集。每条骨骼连线表达为一段三次贝塞尔
 * （控制点 = 端点的 1/3 处，即退化为直线但保留 BezierPath 形态）。
 *
 * 坐标从归一化 [0,1] 映射到 [0, width] × [0, height]。
 * 关键点 visibility 过低（< 0.5）时跳过对应骨骼。
 */
export function poseToCurves(frame: PoseFrame): BezierPath[] {
  const w = frame.width ?? 1;
  const h = frame.height ?? 1;
  const lms = frame.landmarks;
  const paths: BezierPath[] = [];
  for (const [a, b] of POSE_CONNECTIONS) {
    const la = lms[a];
    const lb = lms[b];
    if (!la || !lb) continue;
    if ((la.visibility ?? 1) < 0.5 || (lb.visibility ?? 1) < 0.5) continue;
    const p0: Point = { x: la.x * w, y: la.y * h };
    const p1: Point = { x: lb.x * w, y: lb.y * h };
    // 三次贝塞尔退化直线：c1 = p0 + (p1-p0)/3, c2 = p0 + 2*(p1-p0)/3
    const c1: Point = { x: p0.x + (p1.x - p0.x) / 3, y: p0.y + (p1.y - p0.y) / 3 };
    const c2: Point = { x: p0.x + (2 * (p1.x - p0.x)) / 3, y: p0.y + (2 * (p1.y - p0.y)) / 3 };
    const seg: BezierSegment = { p0, c1, c2, p1 };
    paths.push({ segments: [seg], closed: false });
  }
  return paths;
}

/**
 * 把 PoseSequence 转为动画曲线集（frames[i] = 第 i 帧的 BezierPath[]）。
 */
export function poseSequenceToAnimation(seq: PoseSequence): {
  frames: BezierPath[][];
  fps: number;
  frameCount: number;
} {
  const frames: BezierPath[][] = seq.frames.map((f) =>
    poseToCurves({ ...f, width: seq.width, height: seq.height }),
  );
  return { frames, fps: seq.fps, frameCount: frames.length };
}

/* ------------------------------------------------------------------ *
 * Pose Landmarker 加载（dynamic import + CDN，单例缓存）
 * ------------------------------------------------------------------ */

/** 缓存单例；加载成功后复用，避免重复 fetch 模型。 */
let poseLandmarker: any = null;
let poseLandmarkerPromise: Promise<unknown> | null = null;

/** 模型 URL（MediaPipe 官方 pose_landmarker_full，float16）。 */
const POSE_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task';

/** tasks-vision wasm 路径（jsdelivr CDN）。 */
const TASKS_VISION_WASM_URL =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';

/**
 * 加载并初始化 PoseLandmarker（按需，缓存单例）。
 *
 * 加载策略：
 *   1. `dynamic import('@mediapipe/tasks-vision')`：尝试解析本地包；
 *      若未安装则失败。
 *   2. 失败时回退到 `import(/* webpackIgnore *\/ 'https://cdn...')`
 *      从 CDN 加载 ESM bundle。
 *
 * 加载失败抛错，调用方负责降级。
 */
export async function getPoseLandmarker(): Promise<unknown> {
  if (poseLandmarker) return poseLandmarker;
  if (poseLandmarkerPromise) return poseLandmarkerPromise;

  poseLandmarkerPromise = (async () => {
    let vision: any;
    // 尝试 1：本地包（@mediapipe/tasks-vision）
    try {
      vision = await import(/* webpackIgnore: true */ '@mediapipe/tasks-vision');
    } catch {
      // 尝试 2：CDN ESM
      try {
        // CDN URL import — no type declarations; resolves at runtime.
        // 用变量绕过 TS 的静态模块解析（字面量 URL 会触发 TS2307）。
        const cdnUrl = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
        vision = await import(/* webpackIgnore: true */ cdnUrl);
      } catch (e) {
        poseLandmarkerPromise = null;
        throw new Error(
          `Failed to load @mediapipe/tasks-vision: ${(e as Error).message}. ` +
            'Install the package or check network access to the CDN.',
        );
      }
    }

    const { FilesetResolver, PoseLandmarker } = vision;
    if (!FilesetResolver || !PoseLandmarker) {
      poseLandmarkerPromise = null;
      throw new Error('@mediapipe/tasks-vision missing FilesetResolver/PoseLandmarker exports');
    }

    const fileset = await FilesetResolver.forVisionTasks(TASKS_VISION_WASM_URL);
    poseLandmarker = await PoseLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath: POSE_MODEL_URL,
        delegate: 'GPU',
      },
      runningMode: 'IMAGE',
      numPoses: 1,
    });
    return poseLandmarker;
  })();

  return poseLandmarkerPromise;
}

/** 释放单例（测试 / 模型切换时使用）。 */
export function resetPoseLandmarker(): void {
  try {
    poseLandmarker?.close?.();
  } catch {
    // ignore
  }
  poseLandmarker = null;
  poseLandmarkerPromise = null;
}

/* ------------------------------------------------------------------ *
 * 帧序列 → 姿态序列
 * ------------------------------------------------------------------ */

/**
 * 对 FrameSequence 逐帧做姿态检测。
 *
 * MediaPipe PoseLandmarker IMAGE 模式接受单张图像；这里逐帧调用
 * `detect()`，收集 33 个关键点。
 *
 * 性能保护（避免每帧全分辨率逐帧重算拖垮主线程）：
 *   - `maxFrames`：先对帧序列节流到至多该帧数（等间距采样），
 *     超长视频不再逐帧跑姿态检测。
 *   - `maxDimension`：对每帧先降采样到长边 ≤ 该值再送入模型。
 *     姿态关键点是归一化坐标 [0,1]，降采样不改变输出定位，仅降低
 *     MediaPipe 的输入计算量。
 *
 * 失败处理：若 getPoseLandmarker 抛错，本函数直接 re-throw（调用方降级）。
 */
export async function detectPoses(
  frames: FrameSequence,
  options?: { maxFrames?: number; maxDimension?: number },
): Promise<PoseSequence> {
  const landmarker = (await getPoseLandmarker()) as {
    detect: (image: { data: Uint8ClampedArray; width: number; height: number }) => {
      landmarks?: PoseLandmark[][];
    };
  };

  const maxFrames = Math.max(1, Math.floor(options?.maxFrames ?? Infinity));
  const maxDimension = Math.max(0, Math.floor(options?.maxDimension ?? 0));
  const frameList = throttleFrames(frames.frames, maxFrames);

  const poseFrames: PoseFrame[] = [];
  for (const f of frameList) {
    const input = maxDimension > 0 ? downsampleVideoFrame(f.imageData, maxDimension) : f.imageData;
    const result = landmarker.detect(input);
    const lms = result?.landmarks?.[0] ?? [];
    poseFrames.push({
      landmarks: lms,
      timestamp: f.timestamp,
      index: f.index,
      width: frames.width,
      height: frames.height,
    });
  }

  return {
    frames: poseFrames,
    fps: frames.fps,
    width: frames.width,
    height: frames.height,
  };
}
