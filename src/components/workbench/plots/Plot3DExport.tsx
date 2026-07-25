'use client';

/**
 * OmniMath Pro — 3D Plot PNG Export Helper
 *
 * T6: 由于 Plot3DScene 使用 `preserveDrawingBuffer: false`，直接读取
 * canvas 会得到黑屏。这里改用 `captureRef` —— 一个由 Plot3DScene 内部
 * `CaptureBridge` 注册的命令式函数：调用它会 `gl.render(scene, camera)`
 * 后立即返回 canvas，我们在同一同步任务里把它交给 `saveCanvasToFile`
 * 转 blob，避免缓冲区被清空。
 *
 * 向后兼容：若 captureRef 未就绪，回退到旧的 `querySelector('canvas')`
 * 路径（此时可能黑屏，但至少不报错）。
 *
 * 暴露为 hook（父组件按需调用）和按钮组件（父组件直接放置）。
 */

import { useCallback } from 'react';
import type { MutableRefObject } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { saveCanvasToFile } from '@/lib/nativeExport';
import { toast } from 'sonner';
import type { CaptureFn } from './Plot3DScene';

/**
 * 返回一个函数：调用 captureRef 强制渲染一帧并导出 PNG。
 */
export function usePlot3DExport(
  wrapperRef: React.RefObject<HTMLElement | null>,
  captureRef?: MutableRefObject<CaptureFn | null>,
) {
  return useCallback(async () => {
    // 优先用命令式 captureRef（T6：保证渲染后再读取）
    if (captureRef?.current) {
      const canvas = captureRef.current();
      if (canvas) {
        try {
          await saveCanvasToFile(canvas, {
            defaultName: `omnimath-3d-${Date.now()}`,
            dpi: 1,
            format: 'png',
          });
        } catch (err) {
          console.error('[Plot3DExport] capture-ref export failed', err);
        }
        return;
      }
    }

    // 回退：直接查询 canvas（可能黑屏，但兜底不崩溃）
    const canvas = wrapperRef.current?.querySelector('canvas');
    if (!canvas) {
      toast.error('3D 画布未就绪');
      return;
    }
    try {
      await saveCanvasToFile(canvas, {
        defaultName: `omnimath-3d-${Date.now()}`,
        dpi: 1,
        format: 'png',
      });
    } catch (err) {
      console.error('[Plot3DExport] export failed', err);
    }
  }, [wrapperRef, captureRef]);
}

/**
 * 便捷按钮组件。
 */
export function Plot3DExportButton({
  wrapperRef,
  captureRef,
}: {
  wrapperRef: React.RefObject<HTMLElement | null>;
  captureRef?: MutableRefObject<CaptureFn | null>;
}) {
  const exportPNG = usePlot3DExport(wrapperRef, captureRef);
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
