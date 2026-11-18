/**
 * 2D 视图范围的纯函数（白板数学卡片、迷你图共用）。
 *
 * 抽成纯函数的原因：拖动平移与滚轮缩放的边界很容易写反（拖右应看左边），
 * 放在组件里既难测也容易在两个入口之间漂移。
 */

const MIN_SPAN = 0.05;
const MAX_SPAN = 1e6;

/**
 * 拖动平移：`deltaFraction` 是拖动距离占绘图宽度的比例（向右为正）。
 * 向右拖动内容 → 视图左移，因此范围整体减去 `deltaFraction * span`。
 */
export function panRange(
  range: [number, number],
  deltaFraction: number,
): [number, number] {
  const [a, b] = range;
  const span = b - a;
  if (!Number.isFinite(span) || span <= 0) return range;
  if (!Number.isFinite(deltaFraction) || deltaFraction === 0) return range;
  const shift = -deltaFraction * span;
  return [a + shift, b + shift];
}

/**
 * 以鼠标位置为锚点缩放：`px` ∈ [0,1] 是光标在绘图宽度中的比例，
 * `factor` > 1 为缩小（范围变大），< 1 为放大。
 */
export function zoomRangeAt(
  range: [number, number],
  px: number,
  factor: number,
): [number, number] {
  const [a, b] = range;
  const span0 = b - a;
  if (!Number.isFinite(span0) || span0 <= 0) return range;
  if (!Number.isFinite(factor) || factor <= 0) return range;
  const clampedPx = Math.max(0, Math.min(1, Number.isFinite(px) ? px : 0.5));
  const span = Math.max(MIN_SPAN, Math.min(MAX_SPAN, span0 * factor));
  const center = a + span0 * clampedPx;
  return [center - span * clampedPx, center + span * (1 - clampedPx)];
}
