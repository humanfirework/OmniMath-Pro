/**
 * 曲线 / 贝塞尔类型 — 纯类型模块（无 React、无 DOM、无 mathjs）。
 *
 * 这些类型原先定义在 `components/workbench/plots/Plot2DCanvas.tsx` 里，
 * 导致 store 与 vision 库反向 import 组件（分层倒置，也会把整个绘图组件
 * 拖进只想要一个类型的模块图）。现在统一收口到这里：
 *
 *   lib/store、lib/vision、lib/plots、components/* 都从这里取类型。
 */

/** 2D 点：兼容 [x, y] 元组（画布命令）与 { x, y } 对象（vision 贝塞尔段）。 */
export type Pt2 = { x: number; y: number } | [number, number];

/** 贝塞尔段 — 兼容 vision/types 的序列化结构。 */
export type BezierSegmentData =
  | { cmd: 'moveTo'; pts: Array<[number, number]> }
  | { cmd: 'lineTo'; pts: Array<[number, number]> }
  | { cmd: 'quadTo'; pts: Array<[number, number]> }   // [c, end]
  | { cmd: 'cubicTo'; pts: Array<[number, number]> } // [c1, c2, end]
  // vision 拟合结果（Schneider 三次贝塞尔段）：p0/c1/c2/p1 各为 2D 点。
  | { p0: Pt2; c1: Pt2; c2: Pt2; p1: Pt2 };

/** 一条贝塞尔路径 = 多段组成（通常是一条闭合或开放的轮廓）。 */
export interface BezierPathData {
  segments: BezierSegmentData[];
  closed?: boolean;
}

/** 一档拟合候选（粗略 / 均衡 / 精细 / 自定义），供人工修正面板切换。 */
export interface CurveCorrectionCandidate {
  /** 档位标识：loose | balanced | fine | custom。 */
  id: string;
  labelZh: string;
  labelEn: string;
  curves: BezierPathData[];
  errorThreshold: number;
  cornerThreshold: number;
}

/** 蓝图 plot-curves 节点输出的曲线集。 */
export interface CurveSetData {
  id?: string;
  curves: BezierPathData[];
  /** 原始图像的像素宽高（用于像素 → 数学坐标映射）。 */
  width: number;
  height: number;
  color?: string;
  strokeWidth?: number;
  flipY?: boolean;
  flipX?: boolean;
  /**
   * 逐帧动画：`frames[i]` = 第 i 帧的曲线路径数组。存在且非空时，
   * 2D 画布的时间轴会按帧播放，`curves` 仅作为「第 0 帧」的静态回退。
   */
  frames?: BezierPathData[][];
  /** 播放帧率（fps），用于时间轴自动播放速度。 */
  fps?: number;
  /**
   * 多档拟合候选（镜像 vision curve-fit 的 candidates）。
   * 存在时，2D 绘图可让用户「切换候选结果」。
   */
  candidates?: CurveCorrectionCandidate[];
  /**
   * 拟合前的原始折线（像素坐标）。存在时，2D 绘图可让用户
   * 「调整参数（误差阈值/角点阈值）后重新拟合」。
   */
  originalPolylines?: Array<{ points: Pt2[]; closed?: boolean; area?: number }>;
  /** 当前选中的候选档位（默认 'balanced'）。 */
  presetId?: string;
}
