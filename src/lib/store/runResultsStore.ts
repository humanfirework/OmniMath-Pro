/**
 * 独立运行结果面板（MATLAB figure 风格）store。
 *
 * 把蓝图流水线的仿真波形（plot-output / sim-scope）与图像/视频转曲线
 * （plot-curves / curve-animate）结果从「2D 绘图工作台 store」剥离出来，
 * 统一归一化成 `RunCurve` 列表，交给高性能 canvas 渲染，支持多开 / 拖拽 / 缩放。
 */

import { create } from 'zustand';
import type { BezierSegmentData } from '@/components/workbench/plots/Plot2DCanvas';
import { mapPixelPoint } from '@/lib/vision/coords';

export type RunResultKind = 'plot' | 'curves' | 'animation';

/** 一条可渲染的曲线：采样折线（points）或贝塞尔路径段（segments）二选一。 */
export interface RunCurve {
  id: string;
  label?: string;
  color: string;
  width: number;
  /** 采样折线（数学坐标，可直接绘制的 [x, y]）。 */
  points?: Array<[number, number]>;
  /** 贝塞尔路径段（来自 vision 拟合，像素坐标，需按 imageW/imageH 映射）。 */
  segments?: BezierSegmentData[];
  /** 贝塞尔像素空间宽高（用于像素 → 数学坐标映射）。 */
  imageW?: number;
  imageH?: number;
  flipY?: boolean;
  flipX?: boolean;
  visible?: boolean;
}

/** 逐帧动画（视频/GIF → 姿态 → 曲线动画）。 */
export interface RunAnimation {
  /** frames[i] = 第 i 帧的采样折线点集。 */
  frames: Array<Array<[number, number]>>;
  fps: number;
}

/**
 * 原图叠加层（P0-4：图像+轮廓窗）。
 * 图像在 world 坐标中铺满 [0, width]×[0, height]（Y 向上，与已翻转的曲线一致），
 * 作为背景双线性高清渲染，曲线作为矢量路径叠加其上。
 */
export interface RunResultImage {
  /** 图像 data URL / 任意可被 <img> 加载的 src。 */
  src: string;
  /** 像素宽。 */
  width: number;
  /** 像素高。 */
  height: number;
}

export interface RunResultPanel {
  id: string;
  title: string;
  kind: RunResultKind;
  curves: RunCurve[];
  animation?: RunAnimation;
  /** 原图叠加层（图像+轮廓窗）。 */
  image?: RunResultImage;
  createdAt: number;
  /** 自动适配的初始视口（world 坐标）。 */
  autoX?: [number, number];
  autoY?: [number, number];
}

interface RunResultsState {
  panels: RunResultPanel[];
  /** 同时最多保留的运行结果面板数（超出丢弃最旧的）。 */
  maxPanels: number;
  addRunResult: (panel: Omit<RunResultPanel, 'id' | 'createdAt'>) => RunResultPanel;
  closePanel: (id: string) => void;
  clearPanels: () => void;
  /** 切换某面板中单条曲线的显隐（图例交互）。 */
  toggleCurveVisible: (panelId: string, curveId: string) => void;
}

const MAX_PANELS_DEFAULT = 8;

export function makePanelId(): string {
  return `rr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/** 计算一组 (x,y) 采样点的包围盒；空/非法点返回 null。 */
export function computeBounds(points: Array<[number, number]>): {
  minX: number; maxX: number; minY: number; maxY: number;
} | null {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  let n = 0;
  for (const [x, y] of points) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    n++;
  }
  if (n === 0) return null;
  return { minX, maxX, minY, maxY };
}

export const useRunResultsStore = create<RunResultsState>((set, get) => ({
  panels: [],
  maxPanels: MAX_PANELS_DEFAULT,

  addRunResult: (panel) => {
    const id = makePanelId();
    const full: RunResultPanel = { ...panel, id, createdAt: Date.now() };

    // 归一化：为缺少 points 的贝塞尔曲线预计算像素包围盒，作为自动视口。
    let autoX = panel.autoX;
    let autoY = panel.autoY;
    const sampledPoints: Array<[number, number]> = [];
    for (const curve of full.curves) {
      if (curve.points) {
        for (const p of curve.points) sampledPoints.push(p);
      } else if (curve.segments && curve.imageW && curve.imageH) {
        // 贝塞尔段展开为像素点以估算范围（仅用于自动适配，不参与实际渲染）。
        // P0-3：统一像素→数学翻转（y'=H-1-y），与渲染层 curveToWorldPoints 一致。
        const pts = flattenSegments(curve.segments);
        const mapped = pts.map(([px, py]) =>
          mapPixelPoint(px, py, curve.imageW!, curve.imageH!, curve.flipX, curve.flipY),
        );
        sampledPoints.push(...mapped);
      }
    }
    if (!autoX || !autoY) {
      const b = computeBounds(sampledPoints);
      if (b) {
        if (!autoX) autoX = [b.minX, b.maxX];
        if (!autoY) autoY = [b.minY, b.maxY];
      }
    }

    set((s) => {
      const next = [...s.panels, { ...full, autoX, autoY }];
      if (next.length > s.maxPanels) next.splice(0, next.length - s.maxPanels);
      return { panels: next };
    });
    return { ...full, autoX, autoY };
  },

  closePanel: (id) => {
    set((s) => ({ panels: s.panels.filter((p) => p.id !== id) }));
  },

  clearPanels: () => {
    set({ panels: [] });
  },

  toggleCurveVisible: (panelId, curveId) => {
    set((s) => ({
      panels: s.panels.map((p) =>
        p.id !== panelId
          ? p
          : {
              ...p,
              curves: p.curves.map((c) =>
                c.id === curveId ? { ...c, visible: c.visible === false ? true : false } : c,
              ),
            },
      ),
    }));
  },
}));

/** 将贝塞尔段展开为像素折线（用于估算范围 / 测试）。 */
export function flattenSegments(segments: BezierSegmentData[]): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let last: [number, number] | null = null;
  for (const seg of segments) {
    if ('cmd' in seg) {
      if (seg.cmd === 'moveTo' && seg.pts.length > 0) {
        out.push(seg.pts[0]);
        last = seg.pts[0];
      } else if (seg.cmd === 'lineTo') {
        for (const p of seg.pts) { out.push(p); last = p; }
      } else if (seg.cmd === 'quadTo' && seg.pts.length >= 2) {
        const [c, end] = seg.pts;
        if (last) out.push(...sampleQuad(last, c, end));
        else out.push(end);
        last = end;
      } else if (seg.cmd === 'cubicTo' && seg.pts.length >= 3) {
        const [c1, c2, end] = seg.pts;
        if (last) out.push(...sampleCubic(last, c1, c2, end));
        else out.push(end);
        last = end;
      }
    } else {
      // Schneider 三次贝塞尔段 { p0, c1, c2, p1 }：自带起点，始终完整采样。
      const p0 = toXY(seg.p0);
      const c1 = toXY(seg.c1);
      const c2 = toXY(seg.c2);
      const p1 = toXY(seg.p1);
      out.push(p0);
      out.push(...sampleCubic(p0, c1, c2, p1));
      last = p1;
    }
  }
  return out;
}

function toXY(p: { x: number; y: number } | [number, number]): [number, number] {
  return Array.isArray(p) ? [p[0], p[1]] : [p.x, p.y];
}

function sampleQuad(p0: [number, number], c: [number, number], p1: [number, number], steps = 8): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const mt = 1 - t;
    out.push([
      mt * mt * p0[0] + 2 * mt * t * c[0] + t * t * p1[0],
      mt * mt * p0[1] + 2 * mt * t * c[1] + t * t * p1[1],
    ]);
  }
  return out;
}

function sampleCubic(p0: [number, number], c1: [number, number], c2: [number, number], p1: [number, number], steps = 12): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const mt = 1 - t;
    const a = mt * mt * mt;
    const b = 3 * mt * mt * t;
    const c = 3 * mt * t * t;
    const d = t * t * t;
    out.push([
      a * p0[0] + b * c1[0] + c * c2[0] + d * p1[0],
      a * p0[1] + b * c1[1] + c * c2[1] + d * p1[1],
    ]);
  }
  return out;
}