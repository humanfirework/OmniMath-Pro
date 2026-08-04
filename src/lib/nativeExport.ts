// 原生文件保存导出工具
// - Tauri 环境：使用 @tauri-apps/plugin-dialog 原生保存对话框 + writeFile
// - Web 环境：回退到 <a download> 浏览器下载
// - 支持高 DPI 缩放（参考 MATLAB exportgraphics）

import { save } from '@tauri-apps/plugin-dialog';
import { writeFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { inTauri } from './tauri';
import { toast } from 'sonner';

/**
 * 将 Canvas 导出为图片文件。
 * @param canvas  要导出的画布
 * @param options defaultName 默认文件名；dpi 分辨率倍数（默认 2）；format 格式
 */
export async function saveCanvasToFile(
  canvas: HTMLCanvasElement,
  options: {
    defaultName?: string;
    dpi?: number;
    format?: 'png' | 'svg';
  } = {},
): Promise<boolean> {
  const { defaultName = `omnimath-${Date.now()}`, dpi = 2, format = 'png' } = options;

  // 高 DPI：创建临时 canvas 按倍率放大后 toBlob
  const exportCanvas = dpi === 1 ? canvas : upscaleCanvas(canvas, dpi);
  const blob = await new Promise<Blob | null>((resolve) =>
    exportCanvas.toBlob(resolve, `image/${format}`, 0.95),
  );
  if (!blob) {
    toast.error('画布导出失败');
    return false;
  }

  if (inTauri()) {
    const filePath = await save({
      defaultPath: `${defaultName}.${format}`,
      filters: [{ name: format.toUpperCase(), extensions: [format] }],
    });
    if (!filePath) return false;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    await writeFile(filePath, bytes);
    toast.success(`已导出到 ${filePath}`);
    return true;
  }

  // Web 回退
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${defaultName}.${format}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast.success('已导出图片');
  return true;
}

/** 高分辨率 Canvas 缩放（参考 MATLAB exportgraphics） */
function upscaleCanvas(source: HTMLCanvasElement, scale: number): HTMLCanvasElement {
  const w = source.width;
  const h = source.height;
  const out = document.createElement('canvas');
  out.width = w * scale;
  out.height = h * scale;
  const ctx = out.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, out.width, out.height);
  return out;
}

/**
 * 将文本导出为文件（用于 LaTeX/SVG 文本格式）。
 * @param text    文本内容
 * @param options defaultName 默认文件名；extensions 扩展名列表（第一个为默认）
 */
export async function saveTextToFile(
  text: string,
  options: {
    defaultName?: string;
    extensions?: string[];
  } = {},
): Promise<boolean> {
  const { defaultName = `omnimath-${Date.now()}`, extensions = ['txt'] } = options;

  if (inTauri()) {
    const filePath = await save({
      defaultPath: `${defaultName}.${extensions[0]}`,
      filters: [{ name: extensions[0].toUpperCase(), extensions }],
    });
    if (!filePath) return false;
    await writeTextFile(filePath, text);
    toast.success(`已导出到 ${filePath}`);
    return true;
  }

  // Web 回退
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${defaultName}.${extensions[0]}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast.success('已导出文件');
  return true;
}
