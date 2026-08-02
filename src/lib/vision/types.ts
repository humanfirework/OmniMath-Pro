/**
 * 图像矢量化管线核心数据类型。
 *
 * 全部为纯 TypeScript 数据结构，不依赖 React / DOM，
 * 可在主线程或 Web Worker 中被序列化与传递。
 */

/** 像素 / 几何点（浮点坐标） */
export interface Point {
  x: number;
  y: number;
}

/** 折线（轮廓追踪的直接产物） */
export interface Polyline {
  points: Point[];
  closed: boolean;
  /** 有符号面积（shoelace）：>0 外轮廓（CCW），<0 孔洞（CW） */
  area?: number;
  /** 是否为孔洞轮廓（Moore 追踪时标记） */
  isHole?: boolean;
}

/** 三次贝塞尔曲线段 */
export interface BezierSegment {
  p0: Point;
  c1: Point;
  c2: Point;
  p1: Point;
}

/** 贝塞尔路径（若干三次贝塞尔段首尾相接） */
export interface BezierPath {
  segments: BezierSegment[];
  closed: boolean;
  area?: number;
}

/** 傅里叶系数（复数 cn 的实/虚部） */
export interface FourierCoeff {
  a_n: number;
  b_n: number;
  a_n_imag: number;
  b_n_imag: number;
}

/**
 * 复傅里叶级数表达的闭合曲线。
 * coefficients[i] 对应阶数 m = i - n（共 2n+1 项，m ∈ [-n, n]）。
 */
export interface FourierCurve {
  coefficients: { re: number; im: number }[];
  centerX: number;
  centerY: number;
  /** 单边阶数：共 2n+1 个系数 */
  n: number;
}

/** 统一曲线类型 */
export type CurveData = BezierPath | Polyline;

/** CurveSet 元数据：全部为可选字段，保持向后兼容。 */
export interface CurveSetMetadata {
  /** 拟合模式 */
  fitMode?: FitMode;
  /** 多阈值分层级数 */
  levels?: number;
  /** 是否走了骨架化路径 */
  skeletonize?: boolean;
  /** 产出曲线数 */
  curveCount?: number;
  /** 输入图超过 2048px 长边时是否做了降采样 */
  downsampled?: boolean;
  /** 降采样比例（原图宽 / 缩小后宽），仅在 downsampled=true 时存在 */
  scaleFactor?: number;
  /** 允许其它扩展字段 */
  [key: string]: unknown;
}

/** 整张图像矢量化的结果集合 */
export interface CurveSet {
  curves: BezierPath[];
  width: number;
  height: number;
  metadata?: CurveSetMetadata;
}

/** 拟合模式 */
export type FitMode = 'bezier' | 'fourier';

/** 边缘检测方法 */
export type EdgeMethod = 'sobel' | 'canny';

/**
 * 图像→曲线管线的可选参数。
 */
export interface VisionOptions {
  /** 单阈值（默认 128） */
  threshold?: number;
  /** 多阈值分层级数（默认 4，覆盖全明暗范围） */
  levels?: number;
  /** 噪点面积下限（默认 2，设 0 保留所有轮廓） */
  turdsize?: number;
  /** 拟合模式 */
  fitMode?: FitMode;
  /** 傅里叶阶数（默认 50） */
  fourierOrder?: number;
  /** 角点检测阈值（默认 1.0，单位 rad） */
  cornerThreshold?: number;
  /** 贝塞尔拟合误差阈值（默认 1.0px） */
  errorThreshold?: number;
  /** 是否做中心线提取（线稿模式，默认 false） */
  skeletonize?: boolean;
  /** 边缘检测方法 */
  edgeMethod?: EdgeMethod;
}

/**
 * ImageData 的最小可用子集，避免依赖 DOM / jsdom 的 ImageData 构造器。
 * 任何形如 { data, width, height } 的对象都可作为输入。
 */
export interface ImageDataLike {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/** BezierPath 的公开数据别名（序列化友好命名）。 */
export type BezierPathData = BezierPath;

/** CurveSet 的公开数据别名（序列化友好命名）。 */
export type CurveSetData = CurveSet;
