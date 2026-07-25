'use client';

/**
 * OmniMath Pro — 通用导出对话框
 *
 * 用于将 2D/3D 画布导出为 PNG 图片。
 * - 支持选择分辨率（1x / 2x / 4x DPI）
 * - 支持自定义文件名
 * - Tauri 环境：原生保存对话框；Web 环境：浏览器下载
 *
 * 使用方式：
 *   <ExportDialog
 *     open={open}
 *     onOpenChange={setOpen}
 *     canvasRef={canvasWrapperRef}
 *     defaultName="omnimath-plot"
 *     title="导出图像"
 *   />
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  RadioGroup,
  RadioGroupItem,
} from '@/components/ui/radio-group';
import {
  Download,
  FileImage,
  Loader2,
} from 'lucide-react';
import { saveCanvasToFile } from '@/lib/nativeExport';
import { toast } from 'sonner';

export interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 包含 <canvas> 的容器引用 */
  canvasRef: React.RefObject<HTMLElement | null>;
  /** 默认文件名（不含扩展名） */
  defaultName?: string;
  /** 对话框标题 */
  title?: string;
  /** 描述文字 */
  description?: string;
}

type DpiOption = 1 | 2 | 4;

const DPI_OPTIONS: { value: DpiOption; label: string; hint: string }[] = [
  { value: 1, label: '标准', hint: '1× — 体积最小' },
  { value: 2, label: '高清', hint: '2× — 推荐' },
  { value: 4, label: '超清', hint: '4× — 打印质量' },
];

export function ExportDialog({
  open,
  onOpenChange,
  canvasRef,
  defaultName = `omnimath-${Date.now()}`,
  title = '导出图像',
  description = '选择分辨率后导出 PNG 图像',
}: ExportDialogProps) {
  const [dpi, setDpi] = useState<DpiOption>(2);
  const [fileName, setFileName] = useState(defaultName);
  const [exporting, setExporting] = useState(false);

  // 每次打开时重置文件名为默认名
  useEffect(() => {
    if (open) {
      setFileName(defaultName);
      setDpi(2);
      setExporting(false);
    }
  }, [open, defaultName]);

  const handleExport = useCallback(async () => {
    const canvas = canvasRef.current?.querySelector('canvas');
    if (!canvas) {
      toast.error('画布未就绪，请稍后再试');
      return;
    }
    setExporting(true);
    try {
      const trimmed = fileName.trim() || defaultName;
      const ok = await saveCanvasToFile(canvas, {
        defaultName: trimmed,
        dpi,
        format: 'png',
      });
      if (ok) {
        onOpenChange(false);
      }
    } finally {
      setExporting(false);
    }
  }, [canvasRef, fileName, defaultName, dpi, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileImage className="size-4 text-primary" />
            {title}
          </DialogTitle>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* 文件名 */}
          <div className="space-y-1.5">
            <Label htmlFor="export-filename" className="text-xs text-muted-foreground">
              文件名
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="export-filename"
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
                placeholder={defaultName}
                className="h-9"
                disabled={exporting}
              />
              <span className="text-xs text-muted-foreground shrink-0">.png</span>
            </div>
          </div>

          {/* 分辨率 */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">分辨率</Label>
            <RadioGroup
              value={String(dpi)}
              onValueChange={(v) => setDpi(Number(v) as DpiOption)}
              className="grid grid-cols-3 gap-2"
            >
              {DPI_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  htmlFor={`dpi-${opt.value}`}
                  className={(
                    'flex flex-col items-start gap-1 rounded-lg border p-2.5 cursor-pointer transition-colors ' +
                    (dpi === opt.value
                      ? 'border-primary bg-primary/5 '
                      : 'border-border hover:border-primary/40 hover:bg-accent/40 ')
                  ).trim()}
                >
                  <div className="flex items-center gap-1.5">
                    <RadioGroupItem
                      id={`dpi-${opt.value}`}
                      value={String(opt.value)}
                      className="scale-90"
                    />
                    <span className="text-xs font-medium">{opt.label}</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground leading-tight">
                    {opt.hint}
                  </span>
                </label>
              ))}
            </RadioGroup>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <DialogClose asChild>
            <Button variant="ghost" size="sm" disabled={exporting}>
              取消
            </Button>
          </DialogClose>
          <Button
            size="sm"
            onClick={handleExport}
            disabled={exporting}
            className="gap-1.5"
          >
            {exporting ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                导出中…
              </>
            ) : (
              <>
                <Download className="size-3.5" />
                导出 PNG
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
