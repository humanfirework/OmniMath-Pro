/**
 * 视频帧提取 — GIF / MP4 / WebM → FrameSequence。
 *
 * 三条路径：
 *   1. `decodeGif(data)`：纯 TS 自实现的最小 GIF89a 解析器（含 LZW 解码）。
 *      不引入任何新依赖；支持静态图与多帧动画 GIF。
 *   2. `extractVideoFrames(src, options)`：用 HTMLVideoElement + Canvas
 *      逐帧 seek 抓取 MP4 / WebM 帧。浏览器环境专用。
 *   3. `extractVideoFramesWebCodecs(src, options)`：用 WebCodecs VideoDecoder
 *      高效解码。若浏览器不支持返回 null（调用方降级到方法 2）。
 *
 * 数据形态遵循视觉引擎的 `ImageDataLike` 约定（{ data, width, height }），
 * 因此帧可直接喂给 `imageToCurves`。
 */
import type { ImageDataLike } from './types';

/* ------------------------------------------------------------------ *
 * 公共类型
 * ------------------------------------------------------------------ */

export interface VideoFrame {
  imageData: ImageDataLike;
  /** 帧时间戳（毫秒）。 */
  timestamp: number;
  /** 帧序号（0-based）。 */
  index: number;
}

export interface FrameSequence {
  frames: VideoFrame[];
  /** 帧率（帧/秒）。 */
  fps: number;
  width: number;
  height: number;
}

/* ------------------------------------------------------------------ *
 * GIF89a 解析器（自实现最小版）
 * ------------------------------------------------------------------ *
 * 实现要点：
 *   - 6 字节 header ("GIF89a" / "GIF87a")
 *   - 7 字节 Logical Screen Descriptor（宽、高、flags、bgColor、aspect）
 *   - Global Color Table（如 flags 指示存在，3 字节/项）
 *   - 遍历块：
 *       0x21 = 扩展（0xF9 = Graphics Control Extension，含 delayTime）
 *       0x2C = Image Descriptor（10 字节：左、上、宽、高、flags）
 *       0x3B = Trailer（结束）
 *   - Local Color Table（如存在）
 *   - 1 字节 LZW minimum code size + 子块序列（LZW 压缩数据）
 *   - LZW 解码：动态字典、变长码字
 *
 * 仅实现逐帧全图重建（不做差分帧 dispose 处理；对静态 GIF 与
 * 单帧 / 全帧刷新动画 GIF 足够。差分合成可作为后续增强）。
 */

/** GIF 解析上下文（字节流游标 + 全局状态）。 */
class GifReader {
  private bytes: Uint8Array;
  private pos = 0;
  /** 全局色板（如存在）。 */
  globalColorTable: Uint8Array | null = null;
  /** 逻辑屏幕宽度。 */
  width = 0;
  /** 逻辑屏幕高度。 */
  height = 0;

  constructor(data: ArrayBuffer | Uint8Array) {
    this.bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  }

  private u16(): number {
    const lo = this.bytes[this.pos++];
    const hi = this.bytes[this.pos++];
    return lo | (hi << 8);
  }

  private u8(): number {
    return this.bytes[this.pos++];
  }

  /** 读取一个子块序列，返回拼接后的字节数组。子块格式：[len, data...]，len=0 终止。 */
  private readSubBlocks(): Uint8Array {
    const chunks: number[] = [];
    while (true) {
      const len = this.u8();
      if (len === 0) break;
      for (let i = 0; i < len; i++) chunks.push(this.bytes[this.pos++]);
    }
    return new Uint8Array(chunks);
  }

  parse(): FrameSequence {
    // ── Header ──
    const sig = String.fromCharCode(...this.bytes.subarray(0, 6));
    if (sig !== 'GIF89a' && sig !== 'GIF87a') {
      throw new Error(`invalid GIF signature: ${sig}`);
    }
    this.pos = 6;

    // ── Logical Screen Descriptor ──
    this.width = this.u16();
    this.height = this.u16();
    const flags = this.u8();
    const globalColorTableFlag = (flags & 0x80) !== 0;
    const globalColorTableSize = 1 << ((flags & 0x07) + 1);
    // bg color index (1 byte) + pixel aspect ratio (1 byte)
    this.pos += 2;

    // ── Global Color Table ──
    if (globalColorTableFlag) {
      this.globalColorTable = this.bytes.subarray(this.pos, this.pos + globalColorTableSize * 3);
      this.pos += globalColorTableSize * 3;
    }

    const frames: VideoFrame[] = [];
    let frameIndex = 0;
    // 默认 100ms/帧（10fps）；GCE delayTime 单位为 1/100 秒。
    let delayCentiseconds = 10;

    // ── 遍历块 ──
    while (this.pos < this.bytes.length) {
      const blockType = this.u8();
      if (blockType === 0x3b) break; // Trailer
      if (blockType === 0x21) {
        // Extension
        const label = this.u8();
        if (label === 0xf9) {
          // Graphics Control Extension
          const blockSize = this.u8(); // 4
          const packed = this.u8();
          const delay = this.u16();
          const transparentColorIndex = this.u8();
          this.u8(); // terminator
          if (delay > 0) delayCentiseconds = delay;
          // transparent flag = packed & 0x01; dispose method = (packed >> 2) & 0x07
          void packed;
          void transparentColorIndex;
        } else {
          // 跳过其他扩展（注释 / 文本 / 应用扩展）的子块
          this.readSubBlocks();
        }
      } else if (blockType === 0x2c) {
        // Image Descriptor
        const left = this.u16();
        const top = this.u16();
        const iw = this.u16();
        const ih = this.u16();
        const iflags = this.u8();
        const localColorTableFlag = (iflags & 0x80) !== 0;
        const localColorTableSize = 1 << ((iflags & 0x07) + 1);
        const interlaceFlag = (iflags & 0x40) !== 0;
        let colorTable: Uint8Array | null = null;
        if (localColorTableFlag) {
          colorTable = this.bytes.subarray(this.pos, this.pos + localColorTableSize * 3);
          this.pos += localColorTableSize * 3;
        } else {
          colorTable = this.globalColorTable;
        }
        const minCodeSize = this.u8();
        const compressed = this.readSubBlocks();
        const indices = lzwDecode(compressed, minCodeSize, iw * ih);
        // 反交错（如启用）
        const ordered = interlaceFlag ? deinterlace(indices, iw, ih) : indices;
        // 合成到逻辑屏幕（这里直接重建全图：背景透明，本帧像素覆盖对应区域）
        const rgba = new Uint8ClampedArray(this.width * this.height * 4);
        for (let y = 0; y < ih; y++) {
          for (let x = 0; x < iw; x++) {
            const idx = ordered[y * iw + x];
            const cIdx = idx * 3;
            const r = colorTable ? colorTable[cIdx] : 0;
            const g = colorTable ? colorTable[cIdx + 1] : 0;
            const b = colorTable ? colorTable[cIdx + 2] : 0;
            const px = (top + y) * this.width + (left + x);
            rgba[px * 4] = r;
            rgba[px * 4 + 1] = g;
            rgba[px * 4 + 2] = b;
            rgba[px * 4 + 3] = 255;
          }
        }
        const imageData: ImageDataLike = { data: rgba, width: this.width, height: this.height };
        frames.push({
          imageData,
          timestamp: frameIndex * delayCentiseconds * 10,
          index: frameIndex,
        });
        frameIndex++;
      } else {
        // 未知块：终止以避免死循环
        break;
      }
    }

    // fps：由帧延迟推算（delayCentiseconds 单位 1/100 秒）。
    const fps = delayCentiseconds > 0 ? Math.round(100 / delayCentiseconds) : 10;
    return {
      frames,
      fps: fps > 0 ? fps : 10,
      width: this.width,
      height: this.height,
    };
  }
}

/**
 * LZW 解码（GIF 变体：变长码字，clear code = 2^minCodeSize，end code = clear+1）。
 *
 * 位读取顺序：GIF 使用 LSB-first（最低位在前）打包码字。
 */
function lzwDecode(data: Uint8Array, minCodeSize: number, expectedSize: number): Uint8Array {
  const clearCode = 1 << minCodeSize;
  const endCode = clearCode + 1;
  // 字典：每个码字 = { prev, byte }，沿 prev 链回溯得到字节序列。
  const dictPrev: number[] = [];
  const dictByte: number[] = [];
  let dictSize = 0;

  const initDict = () => {
    dictPrev.length = 0;
    dictByte.length = 0;
    for (let i = 0; i < clearCode; i++) {
      dictPrev.push(-1);
      dictByte.push(i);
    }
    dictPrev.push(-1); dictByte.push(0); // clear
    dictPrev.push(-1); dictByte.push(0); // end
    dictSize = endCode + 1;
  };
  initDict();

  const output: number[] = [];
  let bitPos = 0;
  let codeSize = minCodeSize + 1;

  /** 从 bitPos 起读 codeSize 位（LSB-first）。 */
  const readCode = (): number => {
    let code = 0;
    for (let i = 0; i < codeSize; i++) {
      const byteIdx = (bitPos + i) >> 3;
      const bitIdx = (bitPos + i) & 7;
      const bit = byteIdx < data.length ? (data[byteIdx] >> bitIdx) & 1 : 0;
      code |= bit << i;
    }
    bitPos += codeSize;
    return code;
  };

  let prevCode = -1;
  while (output.length < expectedSize) {
    const code = readCode();
    if (code === clearCode) {
      initDict();
      codeSize = minCodeSize + 1;
      prevCode = -1;
      continue;
    }
    if (code === endCode) break;

    let entry: number[];
    if (code < dictSize) {
      entry = decodeEntry(code, dictPrev, dictByte);
    } else if (code === dictSize && prevCode !== -1) {
      // 标准未在字典中的码字：prevEntry + prevEntry[0]
      const prevEntry = decodeEntry(prevCode, dictPrev, dictByte);
      entry = prevEntry.concat(prevEntry[0]);
    } else {
      // 数据损坏
      break;
    }
    for (const b of entry) output.push(b);
    // 把 prevEntry + entry[0] 加入字典
    if (prevCode !== -1) {
      dictPrev.push(prevCode);
      dictByte.push(entry[0]);
      dictSize++;
      // 码字长度增长规则：当 dictSize 达到 2^codeSize 时增加 codeSize
      // （GIF 上限 12 位）
      if (dictSize === 1 << codeSize && codeSize < 12) {
        codeSize++;
      }
    }
    prevCode = code;
  }
  // 截断到 expectedSize
  const out = new Uint8Array(expectedSize);
  for (let i = 0; i < expectedSize; i++) out[i] = output[i] ?? 0;
  return out;
}

/** 把字典中的码字解码为字节序列（沿 prev 链回溯）。 */
function decodeEntry(code: number, dictPrev: number[], dictByte: number[]): number[] {
  const out: number[] = [];
  let c = code;
  while (c !== -1) {
    out.push(dictByte[c]);
    c = dictPrev[c];
  }
  out.reverse();
  return out;
}

/** GIF 交错序列 → 顺序。交错分 4 个 pass：1,3,5...; 2,6,10...; 4,12,20...; 8,24,40... */
function deinterlace(indices: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(indices.length);
  const passes = [
    { start: 0, step: 8 },
    { start: 4, step: 8 },
    { start: 2, step: 4 },
    { start: 1, step: 2 },
  ];
  let src = 0;
  for (const p of passes) {
    for (let y = p.start; y < h; y += p.step) {
      for (let x = 0; x < w; x++) {
        out[y * w + x] = indices[src++];
      }
    }
  }
  return out;
}

/**
 * GIF 字节流 → FrameSequence。
 */
export async function decodeGif(data: ArrayBuffer): Promise<FrameSequence> {
  const reader = new GifReader(data);
  return reader.parse();
}

/* ------------------------------------------------------------------ *
 * MP4 / WebM 帧提取（HTMLVideoElement seek）
 * ------------------------------------------------------------------ */

/**
 * 用 HTMLVideoElement 逐帧 seek → canvas drawImage → getImageData。
 * 浏览器环境专用；vitest jsdom 中无法测试。
 */
export async function extractVideoFrames(
  src: string,
  options?: { maxFrames?: number; fps?: number },
): Promise<FrameSequence> {
  const maxFrames = Math.max(1, Math.floor(options?.maxFrames ?? 300));
  const targetFps = Math.max(1, options?.fps ?? 30);

  if (typeof document === 'undefined' || typeof HTMLVideoElement === 'undefined') {
    throw new Error('extractVideoFrames requires a browser environment (HTMLVideoElement)');
  }

  const video = document.createElement('video');
  video.src = src;
  video.muted = true;
  // crossorigin 在 data URL / blob URL 下不影响；本地文件不需要。
  video.preload = 'auto';

  // 等待 loadedmetadata
  await new Promise<void>((resolve, reject) => {
    const onMeta = () => {
      video.removeEventListener('loadedmetadata', onMeta);
      video.removeEventListener('error', onErr);
      resolve();
    };
    const onErr = () => {
      video.removeEventListener('loadedmetadata', onMeta);
      video.removeEventListener('error', onErr);
      reject(new Error('video metadata load failed'));
    };
    video.addEventListener('loadedmetadata', onMeta);
    video.addEventListener('error', onErr);
  });

  const width = video.videoWidth;
  const height = video.videoHeight;
  const duration = video.duration; // 秒
  if (!width || !height || !isFinite(duration) || duration <= 0) {
    throw new Error('invalid video metadata');
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('canvas 2d context unavailable');

  const frameInterval = 1 / targetFps;
  const maxByDuration = Math.ceil(duration / frameInterval);
  const count = Math.min(maxFrames, maxByDuration);

  const frames: VideoFrame[] = [];
  for (let i = 0; i < count; i++) {
    const t = Math.min(duration - 1e-3, i * frameInterval);
    await seekTo(video, t);
    ctx.drawImage(video, 0, 0, width, height);
    const img = ctx.getImageData(0, 0, width, height);
    frames.push({
      imageData: { data: new Uint8ClampedArray(img.data), width, height },
      timestamp: t * 1000,
      index: i,
    });
  }

  return { frames, fps: targetFps, width, height };
}

/** 把 video 元素 seek 到指定时间（秒），等待 seeked 事件完成。 */
function seekTo(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const onSeeked = () => {
      if (settled) return;
      settled = true;
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onErr);
      resolve();
    };
    const onErr = () => {
      if (settled) return;
      settled = true;
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onErr);
      reject(new Error('video seek failed'));
    };
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('error', onErr);
    try {
      video.currentTime = t;
    } catch (e) {
      settled = true;
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onErr);
      reject(e as Error);
    }
  });
}

/* ------------------------------------------------------------------ *
 * WebCodecs 帧提取（如可用）
 * ------------------------------------------------------------------ */

/**
 * 用 WebCodecs VideoDecoder 高效解码视频。
 * 不支持时返回 null（调用方降级到 extractVideoFrames）。
 *
 * 注意：完整 WebCodecs 流程需要 demux（mp4box.js / webm demuxer）才能
 * 从原始容器中提取 EncodedVideoChunk。本函数提供最小可用实现：
 *   - 检测 `VideoDecoder` 是否可用
 *   - 不引入新依赖；调用方应优先尝试此函数，失败时降级
 *
 * 当前实现：返回 null（占位，标记此能力为「未启用」，避免在
 * 无 demuxer 的情况下误用）。未来集成 demuxer 后替换为真实解码。
 */
export async function extractVideoFramesWebCodecs(
  _src: string,
  _options?: { maxFrames?: number },
): Promise<FrameSequence | null> {
  if (typeof VideoDecoder === 'undefined') {
    return null;
  }
  // WebCodecs 可用但缺少 demuxer —— 当前不实现完整解码。
  // 调用方应回退到 extractVideoFrames。
  return null;
}
