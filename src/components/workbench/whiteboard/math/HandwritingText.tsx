'use client';

/**
 * Render a short string using the user's own ink glyphs where possible.
 *
 * Apple Math Notes makes the computed answer look like it was written by the
 * same hand. We approximate that by replaying the recognized glyph strokes
 * collected from the expression; characters that were not written by the
 * user fall back to a handwriting-style system font.
 */

import { useEffect, useRef } from 'react';
import type { RecognizedGlyph } from '@/lib/mathnotes/recognize';

export interface HandwritingTextProps {
  text: string;
  glyphs?: RecognizedGlyph[];
  size?: number;
  color?: string;
  className?: string;
}

interface GlyphPath {
  char: string;
  points: Array<Array<{ x: number; y: number }>>;
  x0: number;
  y0: number;
  width: number;
  height: number;
}

function buildGlyphBank(glyphs?: RecognizedGlyph[]): Map<string, GlyphPath> {
  const bank = new Map<string, GlyphPath>();
  if (!glyphs) return bank;
  for (const g of glyphs) {
    if (!g.char || g.char === '?' || g.superscript) continue;
    if (bank.has(g.char)) continue;
    const paths = g.strokes
      .map((s) => s.points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y)))
      .filter((p) => p.length > 0);
    if (paths.length === 0) continue;
    bank.set(g.char, {
      char: g.char,
      points: paths,
      x0: g.bbox.x0,
      y0: g.bbox.y0,
      width: Math.max(1, g.bbox.x1 - g.bbox.x0),
      height: Math.max(1, g.bbox.y1 - g.bbox.y0),
    });
  }
  return bank;
}

export function HandwritingText({
  text,
  glyphs,
  size = 34,
  color = 'currentColor',
  className,
}: HandwritingTextProps) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;

    const draw = () => {
      const canvas = ref.current;
      if (!canvas || cancelled) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const bank = buildGlyphBank(glyphs);
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      const lineHeight = Math.round(size * 1.5);
      const font = `${size}px "OmniHand", "Segoe Script", "Bradley Hand", "Comic Sans MS", cursive, sans-serif`;

      // ── measure pass ──────────────────────────────────────────────
      const advances: number[] = [];
      let total = 0;
      for (const ch of text) {
        const path = bank.get(ch);
        let advance: number;
        if (path) {
          const scale = size / Math.max(path.width, path.height);
          advance = Math.max(size * 0.28, path.width * scale + size * 0.06);
        } else {
          ctx.font = font;
          advance = ctx.measureText(ch).width + size * 0.02;
        }
        advances.push(advance);
        total += advance;
      }

      const width = Math.max(size, Math.ceil(total) + Math.ceil(size * 0.2));
      canvas.width = Math.ceil(width * dpr);
      canvas.height = Math.ceil(lineHeight * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${lineHeight}px`;

      // ── draw pass ─────────────────────────────────────────────────
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, lineHeight);
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      const baseline = lineHeight * 0.78;
      let x = size * 0.1;
      let index = 0;
      for (const ch of text) {
        const path = bank.get(ch);
        if (path) {
          const scale = size / Math.max(path.width, path.height);
          const glyphH = path.height * scale;
          const top = baseline - glyphH;
          ctx.lineWidth = Math.max(1.2, size * 0.055);
          for (const points of path.points) {
            ctx.beginPath();
            let first = true;
            for (const p of points) {
              const px = x + (p.x - path.x0) * scale;
              const py = top + (p.y - path.y0) * scale;
              if (first) {
                ctx.moveTo(px, py);
                first = false;
              } else {
                ctx.lineTo(px, py);
              }
            }
            ctx.stroke();
          }
          x += advances[index];
        } else {
          ctx.font = font;
          ctx.textBaseline = 'alphabetic';
          ctx.fillText(ch, x, baseline);
          x += advances[index];
        }
        index++;
      }
    };

    // Canvas 的 ctx.font 不会自动等待 WebFont：先显式加载 OmniHand，
    // 否则首次渲染会退到系统字体，等字体到位也不会重画。
    const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
    if (fonts?.load) {
      void fonts
        .load(`500 ${size}px "OmniHand"`)
        .catch(() => {})
        .finally(() => {
          if (!cancelled) draw();
        });
    } else {
      draw();
    }

    return () => {
      cancelled = true;
    };
  }, [text, glyphs, size, color]);

  return (
    <canvas
      ref={ref}
      className={className}
      role="img"
      aria-label={text}
    />
  );
}
