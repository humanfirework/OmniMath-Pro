/**
 * OmniMath Pro — 2D 视口失效判定（纯函数）
 *
 * `Plot2DPanel` 会把用户的平移 / 缩放结果存为 `userView` 覆盖层。当曲线
 * 集合发生变化时，这层覆盖必须失效，否则会残留上一个曲线集合的视口。
 *
 * 旧实现用 `plots.length` 判断：删除一条再新增一条（数量不变）时视口不会
 * 失效，画面会停在旧曲线上。这里改为「曲线 id 集合 + 最新曲线的 xRange」
 * 的稳定签名：
 *   - id 集合排序后拼接 → 与顺序无关；删除 + 新增同数量曲线必然不同；
 *   - 最新曲线的 xRange → 新曲线带来不同的自适应窗口时同样失效；
 *   - xRange 按 6 位有效数字归一化 → 浮点重算的微小抖动不会误判。
 *
 * 纯逻辑，无 React / DOM 依赖。
 */

/** 生成视口签名所需的最小曲线信息。 */
export interface ViewSignaturePlot {
  id: string;
  xRange?: [number, number];
}

const XRANGE_PRECISION = 6;

/**
 * 把 xRange 端点归一化为稳定字符串。
 * 非有限值统一为 `∅`，其余按 6 位有效数字截断。
 */
function stableEndpoint(v: number | undefined): string {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '∅';
  return v.toPrecision(XRANGE_PRECISION);
}

/**
 * 计算当前曲线集合的稳定视口签名。
 *
 * 相同集合（id 相同、顺序可不同、最新曲线 xRange 相同）→ 相同签名；
 * 任意一条曲线被替换 / 删除 / 新增，或最新曲线的 xRange 有实质性变化 →
 * 不同签名，从而让 `userView` 覆盖失效。
 */
export function plotViewSignature(
  plots: readonly ViewSignaturePlot[],
): string {
  if (plots.length === 0) return 'empty';
  const ids = plots
    .map((p) => p.id)
    .sort()
    .join('|');
  const latest = plots[plots.length - 1];
  const xr = latest?.xRange;
  return `${ids}::${latest?.id ?? ''}::${stableEndpoint(xr?.[0])},${stableEndpoint(xr?.[1])}`;
}
