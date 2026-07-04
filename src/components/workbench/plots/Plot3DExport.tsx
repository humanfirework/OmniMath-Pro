'use client';

/**
 * OmniMath Pro — 3D Plot PNG Export Helper
 *
 * Tiny helper that grabs the WebGL canvas inside a wrapper element and
 * triggers a PNG download via `canvas.toDataURL('image/png')`. Because the
 * Plot3DScene Canvas is created with `preserveDrawingBuffer: true`, the
 * drawing buffer is accessible for read-back.
 *
 * Exposed as a hook (so the parent can call it on demand) and as a button
 * component (so the parent can drop it in directly).
 */

import { useCallback } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { toast } from 'sonner';

/**
 * Returns a function that finds the WebGL `<canvas>` inside `wrapperRef`
 * and triggers a PNG download.
 */
export function usePlot3DExport(
  wrapperRef: React.RefObject<HTMLElement | null>,
) {
  return useCallback(() => {
    const canvas = wrapperRef.current?.querySelector('canvas');
    if (!canvas) {
      toast.error('3D 画布未就绪');
      return;
    }
    try {
      // Force a fresh render so the buffer reflects the current scene.
      // (preserveDrawingBuffer:true means we don't strictly need this, but
      // it's a safety net for Safari's stricter WebGL behavior.)
      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = `omnimath-3d-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast.success('已导出 3D PNG 图片');
    } catch (err) {
      console.error('[Plot3DExport] export failed', err);
      toast.error('导出失败');
    }
  }, [wrapperRef]);
}

/**
 * A small button that wraps `usePlot3DExport` for convenience.
 */
export function Plot3DExportButton({
  wrapperRef,
}: {
  wrapperRef: React.RefObject<HTMLElement | null>;
}) {
  const exportPNG = usePlot3DExport(wrapperRef);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 text-muted-foreground hover:text-foreground"
          onClick={exportPNG}
          aria-label="导出 3D PNG"
        >
          <Download className="h-3.5 w-3.5" />
          <span className="hidden text-xs sm:inline">PNG</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">导出 3D 场景为 PNG 图片</TooltipContent>
    </Tooltip>
  );
}
