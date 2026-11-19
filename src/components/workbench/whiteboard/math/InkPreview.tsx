'use client';

import { useEffect, useRef } from 'react';
import type { InkPoint } from '@/lib/ink/types';

/**
 * 识别窗口里的「原始笔迹」缩略图：把这一笔公式按比例缩放到小画布里，
 * 让用户一眼对照「我写的」和「识别成的文本 / 图像」。
 */
export function InkPreview({
  strokes,
  className,
}: {
  strokes: InkPoint[][];
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || strokes.length === 0) return;

    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const stroke of strokes) {
      for (const p of stroke) {
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
        if (p.x < x0) x0 = p.x;
        if (p.y < y0) y0 = p.y;
        if (p.x > x1) x1 = p.x;
        if (p.y > y1) y1 = p.y;
      }
    }
    if (!Number.isFinite(x0) || !Number.isFinite(y0)) return;

    const dpr = Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const pad = 5;
    const spanX = Math.max(1, x1 - x0);
    const spanY = Math.max(1, y1 - y0);
    const scale = Math.min((width - pad * 2) / spanX, (height - pad * 2) / spanY);
    const offsetX = (width - spanX * scale) / 2 - x0 * scale;
    const offsetY = (height - spanY * scale) / 2 - y0 * scale;

    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = Math.max(1.1, Math.min(2, scale * 2.2));
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const stroke of strokes) {
      if (stroke.length === 0) continue;
      ctx.beginPath();
      ctx.moveTo(stroke[0].x * scale + offsetX, stroke[0].y * scale + offsetY);
      for (let i = 1; i < stroke.length; i++) {
        ctx.lineTo(stroke[i].x * scale + offsetX, stroke[i].y * scale + offsetY);
      }
      ctx.stroke();
    }
  }, [strokes]);

  if (strokes.length === 0) return null;

  return (
    <canvas
      ref={canvasRef}
      className={className}
      aria-label="原始手写笔迹"
      role="img"
    />
  );
}
