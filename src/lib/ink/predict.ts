/**
 * 笔迹预测（pen tail prediction）。
 *
 * 触控笔事件到上屏之间至少隔 1 帧；Apple Pencil / Windows Ink 都会在真实点
 * 之前先画一小段外推的「预测尾巴」，下一帧真实点到达后立即替换。
 *
 * 这里只做纯计算：给定最近两个带时间戳的点，按速度外推 `aheadMs`，并把
 * 外推距离限制在 `maxDistance`（世界坐标）内，避免快速甩笔时尾巴过长。
 * 引擎只对 `pointerType === 'pen'` 且速度合理的笔迹调用它。
 */

import type { InkPoint } from './types';

/** 外推时间上限：超过这个时间的停顿说明用户在思考，不应预测。 */
const MAX_GAP_MS = 80;
/** 低于这个速度（世界单位/毫秒）不预测，避免静止时抖动出一条尾巴。 */
const MIN_SPEED = 0.02;

export function predictPenTail(
  points: InkPoint[],
  aheadMs: number,
  maxDistance: number,
): InkPoint | null {
  if (points.length < 2 || aheadMs <= 0 || maxDistance <= 0) return null;

  const last = points[points.length - 1];
  const prev = points[points.length - 2];
  const dt = (last.t ?? 0) - (prev.t ?? 0);
  if (!Number.isFinite(dt) || dt <= 0 || dt > MAX_GAP_MS) return null;

  const vx = (last.x - prev.x) / dt;
  const vy = (last.y - prev.y) / dt;
  const speed = Math.hypot(vx, vy);
  if (!Number.isFinite(speed) || speed < MIN_SPEED) return null;

  let dx = vx * aheadMs;
  let dy = vy * aheadMs;
  const distance = Math.hypot(dx, dy);
  if (distance > maxDistance) {
    const scale = maxDistance / distance;
    dx *= scale;
    dy *= scale;
  }

  return {
    x: last.x + dx,
    y: last.y + dy,
    w: last.w,
    t: (last.t ?? 0) + aheadMs,
  };
}
