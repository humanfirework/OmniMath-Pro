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
import type { CurveSetData, CurveCorrectionCandidate, Pt2 } from './Plot2DCanvas';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { SlidersHorizontal, Trash2, Wand2, X, ChevronDown, ChevronUp, Check } from 'lucide-react';
import { toast } from 'sonner';

/** 把 2D 通用顶点（[x,y] 或 {x,y}）归一化为 vision 的 {x,y} 点。 */
function toPoint(p: Pt2): Point {
  if (Array.isArray(p)) return { x: p[0], y: p[1] };
  return { x: p.x, y: p.y };
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
        </div>
      )}
    </div>
  );
}