/**
 * 手写识别的作用域：只取「刚刚写的那一行公式」，而不是最近 N 笔。
 *
 * 旧逻辑用最近 16 笔的中位数水平带做过滤：当用户在另一行写第二个公式或
 * 随手画标注时，两行会被混进同一个识别输入，导致识别结果错乱。这里改为
 * 以最后一笔为锚点，按「同一行 + 相邻」向前收拢：
 *   - 垂直中心偏离锚点超过约 1.35 倍行高 → 属于别的行，停止；
 *   - 与当前簇的水平间隙超过约 2.2 倍行高 → 属于同一行但独立的公式，停止；
 *   - 最多回看 24 笔，避免长笔记下越界。
 */

export interface ScopeBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface ScopedStroke {
  box: ScopeBox;
}

const MAX_LOOKBACK = 24;
const LINE_BAND = 1.35;
const MAX_GAP = 2.2;

function centerY(b: ScopeBox): number {
  return (b.y0 + b.y1) / 2;
}

function heightOf(b: ScopeBox): number {
  return Math.max(8, b.y1 - b.y0);
}

/** 返回属于同一行、与最后一笔相邻的笔画（保持原有先后顺序）。 */
export function selectRecentLine<T extends ScopedStroke>(items: T[]): T[] {
  if (items.length === 0) return [];
  const anchor = items[items.length - 1];
  const anchorCy = centerY(anchor.box);
  const anchorH = heightOf(anchor.box);

  const picked: T[] = [anchor];
  let x0 = anchor.box.x0;
  let x1 = anchor.box.x1;

  const start = Math.max(0, items.length - 1 - MAX_LOOKBACK);
  for (let i = items.length - 2; i >= start; i--) {
    const item = items[i];
    const b = item.box;
    const dy = Math.abs(centerY(b) - anchorCy);
    // 上下标会明显高于/低于基线，用笔画自身高度放宽一点。
    if (dy > anchorH * LINE_BAND + heightOf(b) * 0.25) break;

    let gap = 0;
    if (b.x1 < x0) gap = x0 - b.x1;
    else if (b.x0 > x1) gap = b.x0 - x1;
    if (gap > anchorH * MAX_GAP) break;

    picked.push(item);
    x0 = Math.min(x0, b.x0);
    x1 = Math.max(x1, b.x1);
  }

  return picked.reverse();
}
