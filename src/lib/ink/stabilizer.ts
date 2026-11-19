/**
 * 笔迹稳定器 —— 对刚采集到的点做指数平滑。
 *
 * `off` 完全不改变原始点；`soft` / `strong` 分别用 0.72 / 0.45 的跟随系数，
 * 在「笔尖跟手」和「减少抖动」之间取舍。只影响新采集的点，不改变已有笔迹。
 */

export type InkStabilizer = 'off' | 'soft' | 'strong';

export function stabilizerAlpha(level: InkStabilizer): number {
  switch (level) {
    case 'strong':
      return 0.45;
    case 'soft':
      return 0.72;
    default:
      return 1;
  }
}

export class StrokeStabilizer {
  private x = 0;
  private y = 0;
  private ready = false;

  reset(p: { x: number; y: number }): void {
    this.x = p.x;
    this.y = p.y;
    this.ready = true;
  }

  push(p: { x: number; y: number }, alpha: number): { x: number; y: number } {
    if (!this.ready) {
      this.reset(p);
      return { x: p.x, y: p.y };
    }
    if (alpha >= 1) {
      this.x = p.x;
      this.y = p.y;
      return { x: p.x, y: p.y };
    }
    this.x += (p.x - this.x) * alpha;
    this.y += (p.y - this.y) * alpha;
    return { x: this.x, y: this.y };
  }
}
