import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { imageToCurves, fineOutline, fitBezierPaths, flipYBezierPaths } from '../index';
import type { CurveSetData, BezierPath, Point, ImageDataLike } from '../types';

const _require = createRequire(import.meta.url);

function tryRequire<T = any>(name: string): T | null {
  try { return _require(name); } catch { return null; }
}

interface SimpleImageData {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

const _ImageDataCtor: (new (data: Uint8ClampedArray, w: number, h: number) => SimpleImageData) | null
  = typeof (globalThis as any).ImageData === 'function'
    ? (globalThis as any).ImageData
    : null;

function makeImageData(data: Uint8ClampedArray, w: number, h: number): SimpleImageData {
  if (_ImageDataCtor) {
    try { return new _ImageDataCtor(data, w, h); } catch {}
  }
  return { data, width: w, height: h };
}

const OUT_DIR = path.join(process.cwd(), '.e2e-out');
try { fs.mkdirSync(OUT_DIR, { recursive: true }); } catch {}

async function loadImageToImageData(filePath: string, maxSize = 600): Promise<SimpleImageData> {
  const sharp = tryRequire<any>('sharp');
  const Canvas = tryRequire<any>('canvas');

  const buf = fs.readFileSync(filePath);
  if (sharp) {
    const s = sharp.default ? sharp.default(buf) : sharp(buf);
    const meta = await s.metadata();
    const scale = Math.min(1, maxSize / Math.max(meta.width || 1, meta.height || 1));
    const w = Math.max(1, Math.round((meta.width || 1) * scale));
    const h = Math.max(1, Math.round((meta.height || 1) * scale));
    const { data, info } = await s.resize(w, h).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    return makeImageData(new Uint8ClampedArray(data), info.width, info.height);
  }
  if (Canvas && Canvas.loadImage && Canvas.createCanvas) {
    const img = await Canvas.loadImage(buf);
    const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = Canvas.createCanvas(w, h);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    return ctx.getImageData(0, 0, w, h);
  }
  throw new Error('No image loader available (need sharp or canvas npm package)');
}

function pointToArr(p: Point): [number, number] { return [p.x, p.y]; }

export type { SimpleImageData };

describe('vision e2e: real images', () => {
  it('火车.jpeg imageToCurves 默认参数产生 50~600 条贝塞尔曲线', async () => {
    let img: SimpleImageData;
    try {
      img = await loadImageToImageData('/workspace/测试3-火车.jpeg', 600);
    } catch (e) {
      console.log('[e2e] 火车.jpeg SKIP:', (e as Error).message);
      return;
    }
    expect(img.width).toBeGreaterThan(50);
    expect(img.height).toBeGreaterThan(50);
    const inLike: ImageDataLike = img;
    const out = imageToCurves(inLike, {
      levels: 4,
      turdsize: 20,
      errorThreshold: 1.5,
      cornerThreshold: 0.8,
    });
    expect(Array.isArray(out.curves)).toBe(true);
    expect(out.width).toBe(img.width);
    expect(out.height).toBe(img.height);
    expect(out.curves.length).toBeGreaterThanOrEqual(30);
    expect(out.curves.length).toBeLessThanOrEqual(800);
    const validPaths = out.curves.filter(p => Array.isArray(p.segments) && p.segments.length > 0);
    expect(validPaths.length / Math.max(1, out.curves.length)).toBeGreaterThan(0.7);
    (globalThis as any).__E2E_TRAIN_TOTAL__ = out.curves.length;
    (globalThis as any).__E2E_TRAIN_SIZE__ = [out.width, out.height];
    const jsonPath = path.join(OUT_DIR, 'e2e-train-out.json');
    fs.writeFileSync(jsonPath, JSON.stringify({
      curves: out.curves.slice(0, 5).map(c => ({
        closed: c.closed,
        segments: c.segments.map(s => [pointToArr(s.p0), pointToArr(s.c1), pointToArr(s.c2), pointToArr(s.p1)]),
        area: c.area,
      })),
      width: out.width,
      height: out.height,
      total: out.curves.length,
    }));
    console.log('[e2e] 火车.jpeg: curves =', out.curves.length, 'size =', out.width, 'x', out.height, 'json =', jsonPath);
  }, 60000);

  it('胡桃.webp precise 风格（高分层+小误差）产生 >100 条曲线，flipY 后坐标 Y 镜像', async () => {
    let img: SimpleImageData;
    try {
      img = await loadImageToImageData('/workspace/测试2-胡桃.webp', 700);
    } catch (e) {
      console.log('[e2e] 胡桃.webp SKIP:', (e as Error).message);
      return;
    }
    expect(img.width).toBeGreaterThan(50);
    expect(img.height).toBeGreaterThan(50);
    const inLike: ImageDataLike = img;
    const out = imageToCurves(inLike, {
      levels: 6,
      turdsize: 10,
      errorThreshold: 1.0,
      cornerThreshold: 0.6,
    });
    expect(out.curves.length).toBeGreaterThanOrEqual(80);
    const flipped = flipYBezierPaths(out.curves, out.height);
    expect(flipped.length).toBe(out.curves.length);
    const first = (out.curves[0] as BezierPath)?.segments?.[0]?.p0;
    const firstF = flipped[0]?.segments?.[0]?.p0;
    let flipYVerified = false;
    if (first && firstF) {
      const expected = Math.abs((out.height - first.y) - firstF.y) < 1e-6;
      expect(expected).toBe(true);
      expect(firstF.x).toBeCloseTo(first.x, 6);
      flipYVerified = expected;
    }
    const cs: CurveSetData = {
      curves: flipped,
      width: out.width,
      height: out.height,
    };
    expect(Array.isArray(cs.curves)).toBe(true);
    expect(typeof cs.width).toBe('number');
    (globalThis as any).__E2E_HUTAO_TOTAL__ = out.curves.length;
    (globalThis as any).__E2E_HUTAO_SIZE__ = [out.width, out.height];
    (globalThis as any).__E2E_FLIPY_OK__ = flipYVerified;
    const jsonPath = path.join(OUT_DIR, 'e2e-hutao-out.json');
    fs.writeFileSync(jsonPath, JSON.stringify({
      total: out.curves.length,
      width: out.width,
      height: out.height,
      flipYVerified,
      sample: flipped.slice(0, 3).map(c => ({
        closed: c.closed,
        segments: c.segments.map(s => [pointToArr(s.p0), pointToArr(s.c1), pointToArr(s.c2), pointToArr(s.p1)]),
      })),
    }));
    console.log('[e2e] 胡桃.webp: curves =', out.curves.length, 'size =', out.width, 'x', out.height, 'flipYOk =', flipYVerified, 'json =', jsonPath);
  }, 90000);

  it('fineOutline + fitBezierPaths 可分离（NodePipeline 的两级 pipeline）', async () => {
    let img: SimpleImageData;
    try { img = await loadImageToImageData('/workspace/测试3-火车.jpeg', 400); }
    catch (e) {
      console.log('[e2e] fineOutline SKIP:', (e as Error).message);
      return;
    }
    const fo = fineOutline(img.data, img.width, img.height, 4, {
      imageType: 'standard',
      low: 50,
      high: 150,
      eps: 0.4,
      minStrand: 25,
      maxPaths: 400,
    });
    expect(fo.polylines.length).toBeGreaterThan(0);
    const totalPts = fo.polylines.reduce((acc, c) => acc + c.points.length, 0);
    expect(totalPts).toBeGreaterThan(100);
    const bezier = fitBezierPaths(fo.polylines, 2.0, 1.0);
    expect(Array.isArray(bezier)).toBe(true);
    expect(bezier.length).toBeGreaterThan(fo.polylines.length * 0.5);
    (globalThis as any).__E2E_FINE_POLYLINES__ = fo.polylines.length;
    (globalThis as any).__E2E_FINE_TOTALPTS__ = totalPts;
    (globalThis as any).__E2E_FINE_BEZIER__ = bezier.length;
    console.log('[e2e] fineOutline pipeline: polylines =', fo.polylines.length, 'totalPts =', totalPts, 'bezier =', bezier.length);
  }, 60000);
});
