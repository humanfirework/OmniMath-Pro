// 公式导出工具
// - PNG：使用 KaTeX 渲染到隐藏 DOM 后用 html-to-image 转 PNG
// - SVG：使用 html-to-image 转 SVG
// - LaTeX：直接保存原始 LaTeX 字符串
// - 支持暗/亮主题背景色与高 DPI
// 依赖：katex, html-to-image, ./nativeExport

import katex from 'katex';
import { toPng, toSvg } from 'html-to-image';
import { saveCanvasToFile, saveTextToFile } from './nativeExport';
import { toast } from 'sonner';

export type FormulaFormat = 'png' | 'svg' | 'latex';

export interface FormulaExportOptions {
  /** 文件名（不含扩展名） */
  defaultName?: string;
  /** 输出格式 */
  format?: FormulaFormat;
  /** DPI 倍数（仅 PNG 生效，默认 2） */
  dpi?: number;
  /** 是否显示模式（块级），默认 true */
  displayMode?: boolean;
  /** 主题：暗色用深底浅字，亮色用浅底深字 */
  theme?: 'dark' | 'light';
  /** 字号（px），默认 28 */
  fontSize?: number;
}

/** 在屏幕外创建一个临时容器并渲染 KaTeX，返回该 DOM 节点。 */
function createRenderNode(
  latex: string,
  opts: {
    displayMode: boolean;
    theme: 'dark' | 'light';
    fontSize: number;
  },
): HTMLDivElement {
  const container = document.createElement('div');
  const isDark = opts.theme === 'dark';
  // 透明背景交给 html-to-image 处理（filter 函数注入背景）
  // 这里仅设置文字颜色与字号，确保 KaTeX 渲染正常
  container.style.position = 'fixed';
  container.style.left = '-9999px';
  container.style.top = '0';
  container.style.padding = '16px 24px';
  container.style.fontSize = `${opts.fontSize}px`;
  container.style.fontFamily =
    'KaTeX_Main, "Times New Roman", serif';
  container.style.color = isDark ? '#f1f5f9' : '#0f172a';
  container.style.background = isDark ? '#0b1220' : '#ffffff';
  container.style.lineHeight = '1.5';
  container.style.display = 'inline-block';
  container.setAttribute('aria-hidden', 'true');

  const span = document.createElement('span');
  span.innerHTML = katex.renderToString(latex, {
    displayMode: opts.displayMode,
    throwOnError: false,
    strict: false,
    trust: true,
    macros: {
      '\\R': '\\mathbb{R}',
      '\\N': '\\mathbb{N}',
      '\\Z': '\\mathbb{Z}',
      '\\Q': '\\mathbb{Q}',
      '\\C': '\\mathbb{C}',
    },
  });
  container.appendChild(span);

  document.body.appendChild(container);
  return container;
}

/** 等待 KaTeX 字体加载完毕（最多 1.5s），避免首屏字体未就绪导致 PNG 模糊。 */
async function waitForFonts(): Promise<void> {
  if (typeof document === 'undefined' || !('fonts' in document)) return;
  try {
    await Promise.race([
      (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts!.ready,
      new Promise<void>((resolve) => setTimeout(resolve, 1500)),
    ]);
  } catch {
    // ignore — fonts API 不稳定时直接渲染
  }
}

/**
 * 导出公式到文件。
 * @param latex  KaTeX 源串
 * @param options 见 FormulaExportOptions
 * @returns 是否成功
 */
export async function exportFormula(
  latex: string,
  options: FormulaExportOptions = {},
): Promise<boolean> {
  if (!latex || !latex.trim()) {
    toast.error('公式为空，无法导出');
    return false;
  }

  const {
    defaultName = `omnimath-formula-${Date.now()}`,
    format = 'png',
    dpi = 2,
    displayMode = true,
    theme = 'dark',
    fontSize = 28,
  } = options;

  // LaTeX 源串：直接走文本保存
  if (format === 'latex') {
    return saveTextToFile(latex, {
      defaultName,
      extensions: ['tex'],
    });
  }

  await waitForFonts();

  const node = createRenderNode(latex, { displayMode, theme, fontSize });
  try {
    if (format === 'svg') {
      const dataUrl = await toSvg(node, {
        backgroundColor: theme === 'dark' ? '#0b1220' : '#ffffff',
        pixelRatio: 1,
        cacheBust: true,
      });
      // dataUrl → text → saveTextToFile（svg 是文本）
      const svgText = dataUrlToText(dataUrl);
      if (!svgText) {
        toast.error('SVG 转换失败');
        return false;
      }
      return saveTextToFile(svgText, {
        defaultName,
        extensions: ['svg'],
      });
    }

    // PNG：先转 dataUrl 再画到 canvas，最后交给 saveCanvasToFile（统一处理 DPI 与原生对话框）
    const dataUrl = await toPng(node, {
      backgroundColor: theme === 'dark' ? '#0b1220' : '#ffffff',
      pixelRatio: dpi,
      cacheBust: true,
    });
    const canvas = await dataUrlToCanvas(dataUrl);
    if (!canvas) {
      toast.error('PNG 转换失败');
      return false;
    }
    // saveCanvasToFile 内部会再次按 dpi 放大；这里 dpi=1 避免重复缩放
    return saveCanvasToFile(canvas, {
      defaultName,
      dpi: 1,
      format: 'png',
    });
  } catch (err) {
    console.error('[formulaExport] 导出失败', err);
    toast.error('公式导出失败');
    return false;
  } finally {
    // 清理临时节点
    if (node.parentNode) {
      node.parentNode.removeChild(node);
    }
  }
}

/** 把 data:image/svg+xml;base64,... 解码为 SVG 文本。 */
function dataUrlToText(dataUrl: string): string | null {
  const match = /^data:image\/svg\+xml;base64,(.+)$/.exec(dataUrl);
  if (match) {
    try {
      return atob(match[1]);
    } catch {
      return null;
    }
  }
  // 非标准 dataUrl（可能是 url-encoded）
  const plainMatch = /^data:image\/svg\+xml;charset=utf-8,(.+)$/.exec(dataUrl);
  if (plainMatch) {
    try {
      return decodeURIComponent(plainMatch[1]);
    } catch {
      return null;
    }
  }
  return null;
}

/** 把 PNG dataUrl 解码为 HTMLCanvasElement。 */
function dataUrlToCanvas(dataUrl: string): Promise<HTMLCanvasElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(null);
        return;
      }
      ctx.drawImage(img, 0, 0);
      resolve(canvas);
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}
