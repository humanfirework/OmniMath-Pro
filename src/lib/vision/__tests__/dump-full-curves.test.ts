import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { imageToCurves, fineOutline, flipYBezierPaths } from '../index';
import type { ImageDataLike } from '../types';

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

const OUT = '/workspace/_可视化报告/_cache';

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

function countSegments(curves: any[]): number {
  let n = 0;
  for (const c of curves) if (c && Array.isArray(c.segments)) n += c.segments.length;
  return n;
}

function pointToArr(p: any): [number, number] { return [p.x, p.y]; }

describe('dump full curves', () => {
  it('train (600px balanced)', async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const img = await loadImageToImageData('/workspace/测试3-火车.jpeg', 600);
    expect(img.width).toBeGreaterThan(50);
    const inLike: ImageDataLike = img as any;
    const t0 = Date.now();
    const out = imageToCurves(inLike, {
      levels: 4,
      turdsize: 20,
      errorThreshold: 1.5,
      cornerThreshold: 0.8,
    });
    const elapsed = Date.now() - t0;
    expect(out.curves.length).toBeGreaterThan(30);
    const serializable = out.curves.map(c => ({
      closed: c.closed,
      area: (c as any).area,
      segments: c.segments.map(s => [pointToArr(s.p0), pointToArr(s.c1), pointToArr(s.c2), pointToArr(s.p1)]),
    }));
    const totalSegs = countSegments(out.curves);
    fs.writeFileSync(path.join(OUT, 'train_full.json'), JSON.stringify({
      curves: serializable,
      width: out.width, height: out.height, total: out.curves.length,
      totalSegments: totalSegs, mode: 'balanced',
      parameters: { levels: 4, turdsize: 20, errorThreshold: 1.5, cornerThreshold: 0.8 },
      elapsedMs: elapsed,
    }));
    const flipped = flipYBezierPaths(out.curves, out.height);
    const flippedSer = flipped.map(c => ({
      closed: c.closed,
      segments: c.segments.map(s => [pointToArr(s.p0), pointToArr(s.c1), pointToArr(s.c2), pointToArr(s.p1)]),
    }));
    fs.writeFileSync(path.join(OUT, 'train_full_flipY.json'), JSON.stringify({
      curves: flippedSer, width: out.width, height: out.height,
    }));
    const t1 = Date.now();
    const fo = fineOutline(img.data, img.width, img.height, 4, {
      imageType: 'standard',
      low: 50,
      high: 150,
      eps: 0.4,
      minStrand: 25,
      maxPaths: 500,
    });
    const foElapsed = Date.now() - t1;
    const contoursSer = fo.polylines.map(p => ({
      points: p.points.map(pt => pointToArr(pt)),
      closed: p.closed,
    }));
    fs.writeFileSync(path.join(OUT, 'train_contours.json'), JSON.stringify({
      contours: contoursSer, width: img.width, height: img.height,
      count: fo.polylines.length,
      parameters: { low: 50, high: 150, eps: 0.4, minStrand: 25 },
      elapsedMs: foElapsed,
      pipeline: fo.pipeline,
      totalEdgePixels: fo.totalEdgePixels,
    }));
    console.log('[dump] train:', out.curves.length, 'curves,', totalSegs, 'segs,', fo.polylines.length, 'contours,', elapsed, 'ms');
  }, 180000);

  it('hutao (700px precise)', async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const img = await loadImageToImageData('/workspace/测试2-胡桃.webp', 700);
    expect(img.width).toBeGreaterThan(50);
    const inLike: ImageDataLike = img as any;
    const t0 = Date.now();
    const out = imageToCurves(inLike, {
      levels: 6,
      turdsize: 10,
      errorThreshold: 1.0,
      cornerThreshold: 0.6,
    });
    const elapsed = Date.now() - t0;
    expect(out.curves.length).toBeGreaterThan(50);
    const serializable = out.curves.map(c => ({
      closed: c.closed,
      area: (c as any).area,
      segments: c.segments.map(s => [pointToArr(s.p0), pointToArr(s.c1), pointToArr(s.c2), pointToArr(s.p1)]),
    }));
    const totalSegs = countSegments(out.curves);
    fs.writeFileSync(path.join(OUT, 'hutao_full.json'), JSON.stringify({
      curves: serializable,
      width: out.width, height: out.height, total: out.curves.length,
      totalSegments: totalSegs, mode: 'precise',
      parameters: { levels: 6, turdsize: 10, errorThreshold: 1.0, cornerThreshold: 0.6 },
      elapsedMs: elapsed,
    }));
    const flipped = flipYBezierPaths(out.curves, out.height);
    const flippedSer = flipped.map(c => ({
      closed: c.closed,
      segments: c.segments.map(s => [pointToArr(s.p0), pointToArr(s.c1), pointToArr(s.c2), pointToArr(s.p1)]),
    }));
    fs.writeFileSync(path.join(OUT, 'hutao_full_flipY.json'), JSON.stringify({
      curves: flippedSer, width: out.width, height: out.height,
    }));
    const t1 = Date.now();
    const fo = fineOutline(img.data, img.width, img.height, 4, {
      imageType: 'standard',
      low: 30,
      high: 100,
      eps: 0.35,
      minStrand: 15,
      maxPaths: 1500,
    });
    const foElapsed = Date.now() - t1;
    const contoursSer = fo.polylines.map(p => ({
      points: p.points.map(pt => pointToArr(pt)),
      closed: p.closed,
    }));
    fs.writeFileSync(path.join(OUT, 'hutao_contours.json'), JSON.stringify({
      contours: contoursSer, width: img.width, height: img.height,
      count: fo.polylines.length,
      parameters: { low: 30, high: 100, eps: 0.35, minStrand: 15 },
      elapsedMs: foElapsed,
      pipeline: fo.pipeline,
      totalEdgePixels: fo.totalEdgePixels,
    }));
    console.log('[dump] hutao:', out.curves.length, 'curves,', totalSegs, 'segs,', fo.polylines.length, 'contours,', elapsed, 'ms');
  }, 180000);
});
