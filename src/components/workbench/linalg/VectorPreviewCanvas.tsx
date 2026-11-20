'use client';

/**
 * OmniMath Pro — Vector Preview Canvas (lightweight SVG)
 *
 * 为「向量运算」与「Gram-Schmidt 正交化」提供可视化箭头图。
 * 用纯 SVG 绘制，避免引入 R3F/WebGL 的挂载崩溃风险。
 *
 * 支持：
 *   - 2D 向量：直接绘制 (x, y) 箭头
 *   - 3D 向量：等轴测投影 (px = x − 0.35·z, py = y − 0.35·z)
 *   - 自适应缩放，使所有向量恰好落在画布内
 *   - 网格背景 + 坐标轴 + 彩色箭头与图例
 */

interface VectorDatum {
  v: number[];
  color?: string;
  label?: string;
}

interface VectorPreviewCanvasProps {
  vectors: VectorDatum[];
  /** 覆盖维度（默认取最大向量长度）。2D 直接绘制；3D 做等轴测投影。 */
  dim?: 2 | 3;
  /** 画布高度（px），宽度自适应父容器。 */
  height?: number;
  /** 是否显示图例（默认 true）。 */
  showLegend?: boolean;
  /** 空态提示文案。 */
  emptyText?: string;
}

const PALETTE = ['#2dd4bf', '#f59e0b', '#a78bfa', '#ef4444', '#22c55e', '#3b82f6'];

function project(v: number[], dim: 2 | 3): [number, number] {
  if (dim === 3) {
    return [v[0] - 0.35 * (v[2] ?? 0), v[1] - 0.35 * (v[2] ?? 0)];
  }
  return [v[0] ?? 0, v[1] ?? 0];
}

export function VectorPreviewCanvas({
  vectors,
  dim: dimProp,
  height = 240,
  showLegend = true,
  emptyText = '等待输入向量…',
}: VectorPreviewCanvasProps) {
  const W = 300;
  const H = Math.max(160, height);
  const cx = W / 2;
  const cy = H / 2;

  const effective = vectors.filter((d) => d.v && d.v.length > 0);
  const dim: 2 | 3 = dimProp ?? (Math.max(0, ...effective.map((d) => d.v.length)) >= 3 ? 3 : 2);

  // 自适应缩放：把所有端点（含负方向）投影后放进画布。
  const pts = effective.map((d) => project(d.v, dim));
  let maxExtent = 1;
  for (const [x, y] of pts) {
    maxExtent = Math.max(maxExtent, Math.abs(x), Math.abs(y));
  }
  // 留 15% 边距
  const usable = Math.min(W, H) / 2 - 22;
  const scale = usable / maxExtent;
  const toPx = ([x, y]: [number, number]): [number, number] => [cx + x * scale, cy - y * scale];

  const axis = dim === 3 ? 2.2 : 1.3;
  const axisX = toPx([axis, 0] as [number, number]);
  const axisY = toPx([0, axis] as [number, number]);
  const axisZ = dim === 3 ? toPx(project([0, 0, 2.2], 3)) : axisY;

  const arrowHead = (x1: number, y1: number, x2: number, y2: number, color: string) => {
    const ang = Math.atan2(y2 - y1, x2 - x1);
    const L = 7;
    const a1 = [x2 - L * Math.cos(ang - 0.4), y2 - L * Math.sin(ang - 0.4)];
    const a2 = [x2 - L * Math.cos(ang + 0.4), y2 - L * Math.sin(ang + 0.4)];
    return (
      <polygon
        points={`${x2},${y2} ${a1[0]},${a1[1]} ${a2[0]},${a2[1]}`}
        fill={color}
        stroke={color}
        strokeWidth="0.6"
        strokeLinejoin="round"
      />
    );
  };

  return (
    <div className="rounded-md border border-border/40 bg-muted/20 p-2">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        className="block"
        role="img"
        aria-label="向量预览"
      >
        {/* 网格背景 */}
        <g stroke="currentColor" strokeOpacity="0.06">
          {Array.from({ length: 11 }, (_, i) => {
            const x = (i / 10) * W;
            return <line key={`vx${i}`} x1={x} y1={0} x2={x} y2={H} strokeWidth="1" />;
          })}
          {Array.from({ length: 11 }, (_, i) => {
            const y = (i / 10) * H;
            return <line key={`hy${i}`} x1={0} y1={y} x2={W} y2={y} strokeWidth="1" />;
          })}
        </g>

        {/* 坐标轴 */}
        <line x1={cx} y1={0} x2={cx} y2={H} stroke="currentColor" strokeOpacity="0.25" strokeWidth="1" />
        <line x1={0} y1={cy} x2={W} y2={cy} stroke="currentColor" strokeOpacity="0.25" strokeWidth="1" />
        {dim === 3 && (
          <line x1={axisZ[0]} y1={axisZ[1]} x2={cx} y2={cy} stroke="currentColor" strokeOpacity="0.18" strokeWidth="1" strokeDasharray="3 3" />
        )}
        <text x={axisX[0]} y={axisX[1] + 12} textAnchor="middle" fontSize="10" fill="currentColor" fillOpacity="0.5">x</text>
        <text x={axisY[0] - 8} y={axisY[1]} textAnchor="middle" fontSize="10" fill="currentColor" fillOpacity="0.5">y</text>
        {dim === 3 && (
          <text x={axisZ[0] + 8} y={axisZ[1] + 10} fontSize="10" fill="currentColor" fillOpacity="0.5">z</text>
        )}

        {/* 向量箭头 */}
        {effective.map((d, i) => {
          const p = toPx(project(d.v, dim));
          const color = d.color ?? PALETTE[i % PALETTE.length];
          return (
            <g key={i}>
              <line x1={cx} y1={cy} x2={p[0]} y2={p[1]} stroke={color} strokeWidth="2.2" strokeLinecap="round" />
              {arrowHead(cx, cy, p[0], p[1], color)}
            </g>
          );
        })}

        {/* 原点 */}
        <circle cx={cx} cy={cy} r="2.5" fill="currentColor" fillOpacity="0.5" />
      </svg>

      {effective.length > 0 ? (
        showLegend && (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            {effective.map((d, i) => (
              <span key={i} className="inline-flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
                <span
                  className="inline-block h-0.5 w-4 rounded"
                  style={{ backgroundColor: d.color ?? PALETTE[i % PALETTE.length] }}
                />
                {d.label ?? `v${i + 1}`}
              </span>
            ))}
          </div>
        )
      ) : (
        <div className="mt-1.5 text-center text-[11px] text-muted-foreground">{emptyText}</div>
      )}
    </div>
  );
}
