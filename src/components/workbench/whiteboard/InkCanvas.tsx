'use client';

/**
 * React 适配层：只负责挂载 InkEngine 与同步 props。
 * 指针事件、Canvas 绘制、rAF 调度都在引擎内部完成。
 */

import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef } from 'react';
import { InkEngine } from '@/lib/ink/engine';
import type {
  InkBackground,
  InkBrush,
  InkShapeId,
  InkStroke,
  InkStyle,
  InkTool,
  InkView,
} from '@/lib/ink/types';

export interface InkCanvasHandle {
  zoomAt: (factor: number, clientX?: number, clientY?: number) => void;
  setView: (view: InkView) => void;
  getView: () => InkView;
  setStyle: (patch: Partial<InkStyle>) => void;
  exportPNG: (scale?: number) => Promise<Blob | null>;
}

export interface InkCanvasProps {
  strokes: InkStroke[];
  tool: InkTool;
  shapeTool: InkShapeId | null;
  brush: InkBrush;
  color: string;
  width: number;
  eraserSize: number;
  pixelMode: boolean;
  background: InkBackground;
  selectedIds: string[];

  onStrokeEnd: (stroke: InkStroke) => boolean;
  onEraseEnd: (stroke: InkStroke) => boolean;
  onSelect: (ids: string[]) => void;
  onMoveEnd: (dx: number, dy: number, ids: string[]) => void;
  onViewChange: (view: InkView) => void;
  hitTest: (point: { x: number; y: number }, k: number) => string | null;

  className?: string;
}

export const InkCanvas = forwardRef<InkCanvasHandle, InkCanvasProps>(function InkCanvas(props, ref) {
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<InkEngine | null>(null);

  const propsRef = useRef(props);
  propsRef.current = props;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const engine = new InkEngine(host, {
      onStrokeEnd: (stroke) => propsRef.current.onStrokeEnd(stroke),
      onEraseEnd: (stroke) => propsRef.current.onEraseEnd(stroke),
      onSelect: (ids) => propsRef.current.onSelect(ids),
      onMoveEnd: (dx, dy, ids) => propsRef.current.onMoveEnd(dx, dy, ids),
      onViewChange: (view) => propsRef.current.onViewChange(view),
      hitTest: (point, k) => propsRef.current.hitTest(point, k),
    });
    engineRef.current = engine;

    const style: InkStyle = {
      tool: propsRef.current.tool,
      shapeTool: propsRef.current.shapeTool,
      brush: propsRef.current.brush,
      color: propsRef.current.color,
      width: propsRef.current.width,
      eraserSize: propsRef.current.eraserSize,
      pixelMode: propsRef.current.pixelMode,
      background: propsRef.current.background,
    };
    engine.setStyle(style);
    engine.setStrokes(propsRef.current.strokes);
    engine.setSelected(propsRef.current.selectedIds);

    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  const {
    strokes,
    tool,
    shapeTool,
    brush,
    color,
    width,
    eraserSize,
    pixelMode,
    background,
    selectedIds,
  } = props;

  useLayoutEffect(() => {
    engineRef.current?.setStrokes(strokes);
  }, [strokes]);

  useLayoutEffect(() => {
    engineRef.current?.setStyle({
      tool,
      shapeTool,
      brush,
      color,
      width,
      eraserSize,
      pixelMode,
      background,
    });
  }, [tool, shapeTool, brush, color, width, eraserSize, pixelMode, background]);

  useLayoutEffect(() => {
    engineRef.current?.setSelected(selectedIds);
  }, [selectedIds]);

  useImperativeHandle(
    ref,
    () => ({
      zoomAt: (factor, clientX, clientY) => engineRef.current?.zoomAt(factor, clientX, clientY),
      setView: (view) => engineRef.current?.setView(view),
      getView: () => engineRef.current?.getView() ?? { k: 1, x: 0, y: 0 },
      setStyle: (patch) => engineRef.current?.setStyle(patch),
      exportPNG: (scale) => engineRef.current?.exportPNG(scale) ?? Promise.resolve(null),
    }),
    [],
  );

  return (
    <div
      ref={hostRef}
      className={props.className}
      data-ink-surface=""
      aria-label="手写画布"
    />
  );
});
