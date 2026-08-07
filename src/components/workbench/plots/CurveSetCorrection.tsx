'use client';

/**
 * CurveSetCorrection — 视觉「图像转曲线」的人工修正面板。
 *
 * 识别不准时，用户可在 2D 绘图中对视觉曲线集做三类容错修正：
 *   1. 切换候选结果：在曲线拟合时生成的「粗略 / 均衡 / 精细」多档候选间切换；
 *   2. 删除单条曲线：逐条查看并删除误识别曲线；
 *   3. 调整参数重新拟合：调节误差阈值 / 角点阈值后，基于原始折线重新拟合。
 *
 * 仅当曲线集携带 candidates（切换候选）或 originalPolylines（重新拟合）时
 * 显示；纯函数逻辑（refitCurveCandidate / generateCurveFitCandidates）位于
 * src/lib/vision/curveCandidates.ts，可单测。
 *
 * 桌面 / Web 共用，使用 shadcn/ui + Tailwind，风格与现有 VSCode 玻璃质感一致。
 */

import { useMemo, useState } from 'react';
import { useWorkbenchStore } from '@/lib/store/workbench';
import { refitCurveCandidate, type Polyline, type Point } from '@/lib/vision';
import type { CurveSetData, CurveCorrectionCandidate, Pt2, BezierPathData } from './Plot2DCanvas';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { SlidersHorizontal, Trash2, Wand2, X, ChevronDown, ChevronUp, Check, Download } from 'lucide-react';
import { toast } from 'sonner';

/** 把 2D 通用顶点（[x,y] 或 {x,y}）归一化为 vision 的 {x,y} 点。 */
function toPoint(p: Pt2): Point {
  if (Array.isArray(p)) return { x: p[0], y: p[1] };
  return { x: p.x, y: p.y };
}

/** 把 2D 通用顶点解包为 [x, y] 元组。 */
function toXY(p: Pt2): [number, number] {
  return Array.isArray(p) ? [p[0], p[1]] : [p.x, p.y];
}

/** 把 CurveSetData.originalPolylines 归一化为 vision Polyline[]。 */
function toVisionPolylines(cs: CurveSetData): Polyline[] {
  const polys = cs.originalPolylines;
  if (!Array.isArray(polys) || polys.length === 0) return [];
  return polys
    .filter((p) => p && Array.isArray(p.points) && p.points.length >= 2)
    .map((p) => ({
      points: p.points.map(toPoint),
      closed: Boolean(p.closed),
      area: typeof p.area === 'number' ? p.area : undefined,
    }));
}

/** 把贝塞尔路径折线化，返回像素坐标点列（用于 CSV / SVG 导出）。 */
function flattenPathToPts(path: BezierPathData): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const segs = Array.isArray(path.segments) ? path.segments : [];
  for (const seg of segs) {
    if (!seg) continue;
    // Schneider 三次贝塞尔段 { p0, c1, c2, p1 }（vision 拟合结果）
    if (!('cmd' in seg)) {
      const s = seg as { p0: Pt2; c1: Pt2; c2: Pt2; p1: Pt2 };
      const [p0x, p0y] = toXY(s.p0);
      const [c1x, c1y] = toXY(s.c1);
      const [c2x, c2y] = toXY(s.c2);
      const [p1x, p1y] = toXY(s.p1);
      const N = 24;
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const mt = 1 - t;
        const x = mt * mt * mt * p0x + 3 * mt * mt * t * c1x + 3 * mt * t * t * c2x + t * t * t * p1x;
        const y = mt * mt * mt * p0y + 3 * mt * mt * t * c1y + 3 * mt * t * t * c2y + t * t * t * p1y;
        out.push([x, y]);
      }
      continue;
    }
    const pts = Array.isArray(seg.pts) ? seg.pts : [];
    if (seg.cmd === 'moveTo' || seg.cmd === 'lineTo') {
      pts.forEach((p) => out.push([p[0], p[1]]));
    } else if (seg.cmd === 'quadTo' && pts.length >= 2) {
      const [cp, end] = pts as [[number, number], [number, number]];
      const start = out.length ? out[out.length - 1] : cp;
      const N = 24;
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const mt = 1 - t;
        out.push([mt * mt * start[0] + 2 * mt * t * cp[0] + t * t * end[0], mt * mt * start[1] + 2 * mt * t * cp[1] + t * t * end[1]]);
      }
    } else if (seg.cmd === 'cubicTo' && pts.length >= 3) {
      const [c1, c2, end] = pts as [[number, number], [number, number], [number, number]];
      const start = out.length ? out[out.length - 1] : c1;
      const N = 24;
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const mt = 1 - t;
        out.push([
          mt * mt * mt * start[0] + 3 * mt * mt * t * c1[0] + 3 * mt * t * t * c2[0] + t * t * t * end[0],
          mt * mt * mt * start[1] + 3 * mt * mt * t * c1[1] + 3 * mt * t * t * c2[1] + t * t * t * end[1],
        ]);
      }
    }
  }
  return out;
}

/** 触发浏览器下载。 */
function downloadFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** 导出为 JSON：保留完整贝塞尔段结构，可被蓝图 plot-curves 节点重新消费。 */
function exportJSON(curves: BezierPathData[]) {
  const payload = { version: 1, curves, count: curves.length };
  downloadFile('curves.json', JSON.stringify(payload, null, 2), 'application/json');
}

/** 导出为 SVG：把每条曲线渲染成 <path>，便于在矢量工具中继续编辑。 */
function exportSVG(curves: BezierPathData[], width: number, height: number) {
  const paths = curves
    .map((path) => {
      const d = (Array.isArray(path.segments) ? path.segments : [])
        .map((seg) => {
          if (!('cmd' in seg)) {
            const s = seg as { p0: Pt2; c1: Pt2; c2: Pt2; p1: Pt2 };
            const [x0, y0] = toXY(s.p0);
            const [x1, y1] = toXY(s.c1);
            const [x2, y2] = toXY(s.c2);
            const [x3, y3] = toXY(s.p1);
            return `C ${x1} ${y1} ${x2} ${y2} ${x3} ${y3}`;
          }
          const pts = Array.isArray(seg.pts) ? seg.pts : [];
          if (seg.cmd === 'moveTo') return pts.length ? `M ${pts[0][0]} ${pts[0][1]}` : '';
          if (seg.cmd === 'lineTo') return pts.map((p) => `L ${p[0]} ${p[1]}`).join(' ');
          if (seg.cmd === 'quadTo' && pts.length >= 2) return `Q ${pts[0][0]} ${pts[0][1]} ${pts[1][0]} ${pts[1][1]}`;
          if (seg.cmd === 'cubicTo' && pts.length >= 3) return `C ${pts[0][0]} ${pts[0][1]} ${pts[1][0]} ${pts[1][1]} ${pts[2][0]} ${pts[2][1]}`;
          return '';
        })
        .join(' ');
      return `<path d="${d}" fill="none" stroke="#1565c0" stroke-width="1.5" ${path.closed ? 'stroke-linejoin="round"' : ''}/>`;
    })
    .join('\n  ');
  const svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">\n  ${paths}\n</svg>`;
  downloadFile('curves.svg', svg, 'image/svg+xml');
}

/** 导出为 CSV：每条曲线折线化后的采样点，列为 curve, x, y。 */
function exportCSV(curves: BezierPathData[]) {
  const rows: string[] = ['curve,x,y'];
  curves.forEach((path, idx) => {
    flattenPathToPts(path).forEach(([x, y]) => {
      rows.push(`${idx + 1},${x},${y}`);
    });
  });
  downloadFile('curves.csv', rows.join('\n'), 'text/csv');
}

interface CurveSetCorrectionProps {
  curveSet: CurveSetData;
}

export function CurveSetCorrection({ curveSet }: CurveSetCorrectionProps) {
  const updateCurveSet = useWorkbenchStore((s) => s.updateCurveSet);
  const removeCurveSet = useWorkbenchStore((s) => s.removeCurveSet);

  // 面板折叠态（每曲线集独立记忆于组件挂载期间）。
  const [open, setOpen] = useState(true);
  // 自定义重新拟合参数（滑动条）。
  const [errorThreshold, setErrorThreshold] = useState(1.5);
  const [cornerThreshold, setCornerThreshold] = useState(0.7);
  // 正在重新拟合（防抖/防重复点击）。
  const [refitting, setRefitting] = useState(false);

  const candidates = useMemo<CurveCorrectionCandidate[]>(() => {
    const c = curveSet.candidates;
    return Array.isArray(c) ? c.filter((x) => x && Array.isArray(x.curves)) : [];
  }, [curveSet.candidates]);

  const polylines = useMemo(() => toVisionPolylines(curveSet), [curveSet.originalPolylines]);

  // 无候选也无原始折线 → 没有可修正的能力，不渲染。
  if (candidates.length === 0 && polylines.length === 0) return null;

  const activePresetId = curveSet.presetId ?? 'balanced';
  const curveCount = Array.isArray(curveSet.curves) ? curveSet.curves.length : 0;

  const switchCandidate = (cand: CurveCorrectionCandidate) => {
    updateCurveSet(curveSet.id!, {
      curves: cand.curves,
      presetId: cand.id,
    });
    toast.success(`已切换到候选：${cand.labelZh}`);
  };

  const deleteCurve = (index: number) => {
    const curves = Array.isArray(curveSet.curves) ? curveSet.curves.slice() : [];
    if (index < 0 || index >= curves.length) return;
    curves.splice(index, 1);
    updateCurveSet(curveSet.id!, { curves });
    toast.success(index === curves.length ? '已删除最后一条曲线' : '已删除该曲线');
  };

  const doRefit = () => {
    if (polylines.length === 0) {
      toast.error('缺少原始折线，无法重新拟合');
      return;
    }
    setRefitting(true);
    try {
      const result = refitCurveCandidate(polylines, {
        errorThreshold,
        cornerThreshold,
        width: curveSet.width,
        height: curveSet.height,
        flipX: Boolean(curveSet.flipX),
        flipY: curveSet.flipY !== false,
      });
      updateCurveSet(curveSet.id!, { curves: result.curves, presetId: 'custom' });
      toast.success(`已按误差 ${errorThreshold} / 角点 ${cornerThreshold.toFixed(2)} 重新拟合`);
    } catch (e) {
      toast.error('重新拟合失败', { description: (e as Error).message });
    } finally {
      setRefitting(false);
    }
  };

  return (
    <div className="pointer-events-auto absolute bottom-3 left-3 z-30 w-[300px] max-w-[calc(100%-1.5rem)] overflow-hidden rounded-xl border border-border/70 bg-background/85 shadow-lg backdrop-blur-md">
      {/* 头部 */}
      <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1.5 text-xs font-medium text-foreground/90 transition-colors hover:text-primary"
        >
          <SlidersHorizontal className="size-3.5 text-primary" />
          人工修正曲线
          <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-[10px]">
            {curveCount}
          </Badge>
        </button>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            aria-label={open ? '收起' : '展开'}
            onClick={() => setOpen((v) => !v)}
            className="grid size-6 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {open ? <ChevronDown className="size-3.5" /> : <ChevronUp className="size-3.5" />}
          </button>
          <button
            type="button"
            aria-label="移除该曲线集"
            onClick={() => removeCurveSet(curveSet.id!)}
            className="grid size-6 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>

      {open && (
        <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto p-3">
          {/* 1) 切换候选结果 */}
          {candidates.length > 0 && (
            <section className="space-y-1.5">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                候选结果
              </p>
              <div className="flex flex-wrap gap-1.5">
                {candidates.map((cand) => {
                  const active = cand.id === activePresetId;
                  return (
                    <button
                      key={cand.id}
                      type="button"
                      onClick={() => switchCandidate(cand)}
                      className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors ${
                        active
                          ? 'border-primary/50 bg-primary/10 text-primary'
                          : 'border-border bg-muted/30 text-muted-foreground hover:border-primary/30 hover:text-foreground'
                      }`}
                    >
                      {active && <Check className="size-3" />}
                      {cand.labelZh}
                      <span className="text-[10px] opacity-60">
                        {Array.isArray(cand.curves) ? cand.curves.length : 0}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {/* 2) 逐条删除曲线 */}
          <section className="space-y-1.5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              曲线列表
            </p>
            {curveCount === 0 ? (
              <p className="text-xs text-muted-foreground">已无曲线。</p>
            ) : (
              <ul className="space-y-1">
                {curveSet.curves.map((path, idx) => {
                  const segCount = Array.isArray(path.segments) ? path.segments.length : 0;
                  return (
                    <li
                      key={idx}
                      className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-muted/20 px-2 py-1.5"
                    >
                      <span className="truncate font-mono text-[11px] text-foreground/80">
                        #{idx + 1} · {segCount} 段
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 gap-1 px-1.5 text-[11px] text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => deleteCurve(idx)}
                      >
                        <Trash2 className="size-3" />
                        删除
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* 3) 调整参数重新拟合 */}
          <section
            className={`space-y-2 rounded-lg border border-border/60 p-2 ${
              polylines.length === 0 ? 'pointer-events-none opacity-40' : ''
            }`}
          >
            <p className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              <Wand2 className="size-3" />
              重新拟合
              {polylines.length === 0 && (
                <span className="normal-case text-destructive">（缺少原始折线）</span>
              )}
            </p>
            <label className="block space-y-1">
              <span className="flex justify-between text-[11px] text-muted-foreground">
                <span>误差阈值</span>
                <span className="font-mono">{errorThreshold.toFixed(2)}</span>
              </span>
              <Slider
                min={0.1}
                max={5}
                step={0.1}
                value={[errorThreshold]}
                onValueChange={(v) => setErrorThreshold(v[0] ?? 1.5)}
              />
            </label>
            <label className="block space-y-1">
              <span className="flex justify-between text-[11px] text-muted-foreground">
                <span>角点阈值</span>
                <span className="font-mono">{cornerThreshold.toFixed(2)}</span>
              </span>
              <Slider
                min={0.05}
                max={1.5}
                step={0.05}
                value={[cornerThreshold]}
                onValueChange={(v) => setCornerThreshold(v[0] ?? 0.7)}
              />
            </label>
            <Button
              type="button"
              size="sm"
              className="w-full gap-1.5"
              disabled={refitting || polylines.length === 0}
              onClick={doRefit}
            >
              <Wand2 className="size-3.5" />
              {refitting ? '拟合中…' : '按当前参数重新拟合'}
            </Button>
          </section>

          {/* 4) 导出曲线 */}
          <section className="space-y-1.5">
            <p className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              <Download className="size-3" />
              导出曲线
            </p>
            {curveCount === 0 ? (
              <p className="text-xs text-muted-foreground">当前无曲线可导出。</p>
            ) : (
              <div className="grid grid-cols-3 gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 px-1 text-[11px]"
                  onClick={() => exportJSON(curveSet.curves)}
                >
                  <Download className="size-3" />
                  JSON
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 px-1 text-[11px]"
                  onClick={() => exportSVG(curveSet.curves, curveSet.width ?? 800, curveSet.height ?? 600)}
                >
                  <Download className="size-3" />
                  SVG
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 px-1 text-[11px]"
                  onClick={() => exportCSV(curveSet.curves)}
                >
                  <Download className="size-3" />
                  CSV
                </Button>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}