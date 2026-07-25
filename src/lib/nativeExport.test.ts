/**
 * Unit tests for src/lib/nativeExport.ts
 *
 * 因为该模块依赖 DOM（canvas.toBlob、document.createElement）和 Tauri API，
 * 我们采用 jsdom 环境 + 模拟 Tauri 桥接的方式测试 Web 回退路径。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// 先 mock 依赖，再 import 被测模块
vi.mock('@/lib/tauri', () => ({
  inTauri: () => false, // 测试 Web 回退路径
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  save: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-fs', () => ({
  writeFile: vi.fn(),
  writeTextFile: vi.fn(),
}));

import { saveCanvasToFile, saveTextToFile } from './nativeExport';

/* 工具：在 jsdom 中创建带 getContext 的假 canvas */
function createMockCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 100;
  canvas.height = 50;

  // jsdom 的 canvas 没有 getContext 实现，需要 mock
  const ctx = {
    clearRect: vi.fn(),
    setTransform: vi.fn(),
    drawImage: vi.fn(),
    imageSmoothingEnabled: false,
    imageSmoothingQuality: 'low',
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
  };
  canvas.getContext = vi.fn(() => ctx) as unknown as typeof canvas.getContext;

  // toBlob mock
  canvas.toBlob = vi.fn((callback: BlobCallback) => {
    callback(new Blob([new Uint8Array([0, 1, 2])], { type: 'image/png' }));
  }) as unknown as typeof canvas.toBlob;

  return canvas;
}

/* 工具：spy document.createElement + URL */
let clickSpy: ReturnType<typeof vi.fn>;
let appendSpy: ReturnType<typeof vi.fn<(node: Node) => Node>>;
let removeSpy: ReturnType<typeof vi.fn<(child: Node) => Node>>;

beforeEach(() => {
  // restoreAllMocks 恢复 spyOn 的原始实现，避免上一个测试的 spy 被下一个捕获为 origCreate
  vi.restoreAllMocks();

  // 模拟 <a> 元素的 click 行为
  clickSpy = vi.fn();
  appendSpy = vi.fn<(node: Node) => Node>();
  removeSpy = vi.fn<(child: Node) => Node>();

  // mock URL.createObjectURL / revokeObjectURL
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
  globalThis.URL.revokeObjectURL = vi.fn();
});

/* ----------------------------- saveCanvasToFile ----------------------------- */

describe('saveCanvasToFile', () => {
  it('returns false when canvas.toBlob returns null', async () => {
    const canvas = createMockCanvas();
    canvas.toBlob = vi.fn((cb: BlobCallback) => cb(null)) as unknown as typeof canvas.toBlob;

    const result = await saveCanvasToFile(canvas, { dpi: 1 });
    expect(result).toBe(false);
  });

  it('returns true and triggers web download for dpi=1', async () => {
    const canvas = createMockCanvas();

    // 临时替换 document.createElement 以拦截 <a>
    const origCreate = document.createElement.bind(document);
    const mockAnchor = {
      href: '',
      download: '',
      click: clickSpy,
    };
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'a') return mockAnchor as unknown as HTMLElement;
      return origCreate(tag);
    });
    vi.spyOn(document.body, 'appendChild').mockImplementation(appendSpy);
    vi.spyOn(document.body, 'removeChild').mockImplementation(removeSpy);

    const result = await saveCanvasToFile(canvas, {
      defaultName: 'test-plot',
      dpi: 1,
      format: 'png',
    });

    expect(result).toBe(true);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(mockAnchor.download).toBe('test-plot.png');
  });

  it('uses default name when no defaultName provided', async () => {
    const canvas = createMockCanvas();

    const origCreate = document.createElement.bind(document);
    const mockAnchor = { href: '', download: '', click: clickSpy };
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'a') return mockAnchor as unknown as HTMLElement;
      return origCreate(tag);
    });
    vi.spyOn(document.body, 'appendChild').mockImplementation(appendSpy);
    vi.spyOn(document.body, 'removeChild').mockImplementation(removeSpy);

    const result = await saveCanvasToFile(canvas, { dpi: 1 });

    expect(result).toBe(true);
    expect(mockAnchor.download).toMatch(/^omnimath-\d+\.png$/);
  });

  it('uses dpi=2 default when not specified', async () => {
    const canvas = createMockCanvas();

    // dpi > 1 触发 upscaleCanvas，它会调用 document.createElement('canvas')
    // 为避免递归（mockCanvas 内部也调用 createElement），先准备好备用 canvas
    const upscaledCanvas = createMockCanvas();
    const origCreate = document.createElement.bind(document);
    const mockAnchor = { href: '', download: '', click: clickSpy };
    let canvasCreateCount = 0;
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'a') return mockAnchor as unknown as HTMLElement;
      if (tag === 'canvas') {
        canvasCreateCount++;
        return upscaledCanvas;
      }
      return origCreate(tag);
    });
    vi.spyOn(document.body, 'appendChild').mockImplementation(appendSpy);
    vi.spyOn(document.body, 'removeChild').mockImplementation(removeSpy);

    const result = await saveCanvasToFile(canvas);

    expect(result).toBe(true);
    expect(canvasCreateCount).toBe(1); // 应该创建了放大 canvas
  });

  it('uses svg format when specified', async () => {
    const canvas = createMockCanvas();

    const origCreate = document.createElement.bind(document);
    const mockAnchor = { href: '', download: '', click: clickSpy };
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'a') return mockAnchor as unknown as HTMLElement;
      // 不期望创建 canvas（dpi=1 不触发 upscale）
      return origCreate(tag);
    });
    vi.spyOn(document.body, 'appendChild').mockImplementation(appendSpy);
    vi.spyOn(document.body, 'removeChild').mockImplementation(removeSpy);

    const result = await saveCanvasToFile(canvas, {
      defaultName: 'plot',
      dpi: 1,
      format: 'svg',
    });

    expect(result).toBe(true);
    expect(mockAnchor.download).toBe('plot.svg');
  });
});

/* ----------------------------- saveTextToFile ----------------------------- */

describe('saveTextToFile', () => {
  it('triggers web download with default extension', async () => {
    const origCreate = document.createElement.bind(document);
    const mockAnchor = { href: '', download: '', click: clickSpy };
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'a') return mockAnchor as unknown as HTMLElement;
      return origCreate(tag);
    });
    vi.spyOn(document.body, 'appendChild').mockImplementation(appendSpy);
    vi.spyOn(document.body, 'removeChild').mockImplementation(removeSpy);

    const result = await saveTextToFile('hello world');

    expect(result).toBe(true);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(mockAnchor.download).toMatch(/^omnimath-\d+\.txt$/);
  });

  it('uses custom defaultName and extensions', async () => {
    const origCreate = document.createElement.bind(document);
    const mockAnchor = { href: '', download: '', click: clickSpy };
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'a') return mockAnchor as unknown as HTMLElement;
      return origCreate(tag);
    });
    vi.spyOn(document.body, 'appendChild').mockImplementation(appendSpy);
    vi.spyOn(document.body, 'removeChild').mockImplementation(removeSpy);

    const result = await saveTextToFile('\\frac{1}{2}', {
      defaultName: 'formula',
      extensions: ['tex'],
    });

    expect(result).toBe(true);
    expect(mockAnchor.download).toBe('formula.tex');
  });

  it('uses first extension as default when multiple provided', async () => {
    const origCreate = document.createElement.bind(document);
    const mockAnchor = { href: '', download: '', click: clickSpy };
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'a') return mockAnchor as unknown as HTMLElement;
      return origCreate(tag);
    });
    vi.spyOn(document.body, 'appendChild').mockImplementation(appendSpy);
    vi.spyOn(document.body, 'removeChild').mockImplementation(removeSpy);

    const result = await saveTextToFile('<svg></svg>', {
      defaultName: 'image',
      extensions: ['svg', 'xml'],
    });

    expect(result).toBe(true);
    expect(mockAnchor.download).toBe('image.svg');
  });

  it('calls URL.createObjectURL and revokeObjectURL', async () => {
    const origCreate = document.createElement.bind(document);
    const mockAnchor = { href: '', download: '', click: clickSpy };
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'a') return mockAnchor as unknown as HTMLElement;
      return origCreate(tag);
    });
    vi.spyOn(document.body, 'appendChild').mockImplementation(appendSpy);
    vi.spyOn(document.body, 'removeChild').mockImplementation(removeSpy);

    await saveTextToFile('content');

    expect(globalThis.URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(globalThis.URL.revokeObjectURL).toHaveBeenCalledTimes(1);
  });
});
