/**
 * 图像→曲线模块公开入口（barrel）。
 *
 * 注意：这里仅做**重新导出**，不再内联实现，以避免与 `videoToCurves.ts` /
 * `visionWorkerClient.ts` / `visionWorker.ts` 形成模块环（否则会触发 webpack
 * 的 “Circular dependency between chunks” 构建告警）。`imageToCurves` 主管线
 * 已移到 `./imageToCurves`，消费方应直接 import 该模块。
 */

export * from './types';
export * from './coords';
export * from './preprocess';
export * from './edges';
export * from './trace';
export * from './marchingSquare';
export * from './skeleton';
export {
  rdpSimplify,
  rdpSimplifyClosed,
  detectCorners,
  fitBezierArc,
  fitBezierPath,
  fitBezierPaths,
  flipYBezierPaths,
  polylineLength,
  evalBezier,
} from './fit';
export {
  fitFourier,
  sampleFourier,
  sampleFourierCurve,
  fourierError,
} from './fourier';
export * from './curveCandidates';
export {
  videoToCurves,
  associateTracks,
  smoothTrack,
  samplePath,
  savitzkyGolay,
  savgolKernel,
  throttleFrames,
  type VideoToCurvesOptions,
  type VideoToCurvesResult,
  type VideoTrack,
} from './videoToCurves';
export { visionWorkerClient, type VisionWorkerClient } from './visionWorkerClient';
export {
  fineOutline,
  splitSixChannels,
  fusedMultiChannelGradient,
  type FineOutlineOptions,
  type FineOutlineResult,
} from './fineOutline';
export { imageToCurves } from './imageToCurves';
