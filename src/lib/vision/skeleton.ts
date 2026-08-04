/**
 * 中心线（骨架）提取：Zhang-Suen 细化 + 骨架→折线。
 * 适合线稿 / 笔画图像。纯 typed array。
 */
import type { Polyline, Point } from './types';

/** 8 邻接的前景邻居数。 */
function neighborCount(b: Uint8Array, w: number, h: number, x: number, y: number): number {
  let c = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      if (b[ny * w + nx] !== 0) c++;
    }
  }
  return c;
}

/**
 * Zhang-Suen 细化算法（两个子迭代），输出 1px 宽骨架。
 */
export function zhangSuenThin(binary: Uint8Array, w: number, h: number): Uint8Array {
  const img = binary.slice();
  const w2 = w;
  const getP = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return 0;
    return img[y * w + x];
  };

  let changed = true;
  while (changed) {
    changed = false;
    // 子迭代 1 & 2
    for (let sub = 0; sub < 2; sub++) {
      const toDelete: number[] = [];
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (img[y * w + x] === 0) continue;
          const p2 = getP(x, y - 1);
          const p3 = getP(x + 1, y - 1);
          const p4 = getP(x + 1, y);
          const p5 = getP(x + 1, y + 1);
          const p6 = getP(x, y + 1);
          const p7 = getP(x - 1, y + 1);
          const p8 = getP(x - 1, y);
          const p9 = getP(x - 1, y - 1);
          const seq = [p2, p3, p4, p5, p6, p7, p8, p9, p2];
          // B = 非零邻居数
          let B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
          if (B < 2 || B > 6) continue;
          // A = 0->1 转变数
          let A = 0;
          for (let i = 0; i < 8; i++) {
            if (seq[i] === 0 && seq[i + 1] === 1) A++;
          }
          if (A !== 1) continue;
          if (sub === 0) {
            if (p2 * p4 * p6 !== 0) continue;
            if (p4 * p6 * p8 !== 0) continue;
          } else {
            if (p2 * p4 * p8 !== 0) continue;
            if (p2 * p6 * p8 !== 0) continue;
          }
          toDelete.push(y * w + x);
        }
      }
      if (toDelete.length > 0) {
        changed = true;
        for (let i = 0; i < toDelete.length; i++) img[toDelete[i]] = 0;
      }
    }
  }
  return img;
}

/** 8 邻接的 fg 邻居列表（返回索引数组）。 */
function fgNeighbors(b: Uint8Array, w: number, h: number, x: number, y: number): number[] {
  const res: number[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      if (b[ny * w + nx] !== 0) res.push(ny * w + nx);
    }
  }
  return res;
}

/**
 * 从骨架像素提取连通折线路径：
 *  - 端点（1 邻居）与交叉点（≥3 邻居）作为节点；
 *  - 在节点之间沿 2-连通路径追踪；
 *  - 纯环（全 2 邻居）单独处理为闭合折线。
 */
export function skeletonToPolylines(skeleton: Uint8Array, w: number, h: number): Polyline[] {
  const n = w * h;
  const count = new Uint8Array(n);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (skeleton[y * w + x] !== 0) count[y * w + x] = neighborCount(skeleton, w, h, x, y);
    }
  }

  const visited = new Uint8Array(n);
  const isNode = (idx: number) => count[idx] === 1 || count[idx] >= 3 || count[idx] === 0;
  const idxToPoint = (idx: number): Point => ({ x: idx % w, y: Math.floor(idx / w) });

  const polylines: Polyline[] = [];

  // 1) 从节点出发追踪路径
  for (let sy = 0; sy < h; sy++) {
    for (let sx = 0; sx < w; sx++) {
      const sIdx = sy * w + sx;
      if (skeleton[sIdx] === 0) continue;
      if (!isNode(sIdx)) continue;
      const neighbors = fgNeighbors(skeleton, w, h, sx, sy);
      for (const startNbr of neighbors) {
        if (visited[startNbr]) continue;
        // 从 sIdx 走到 startNbr，再沿 2-连通前进直到遇到节点
        const path: Point[] = [idxToPoint(sIdx)];
        let prev = sIdx;
        let cur = startNbr;
        visited[cur] = 1;
        path.push(idxToPoint(cur));
        while (!isNode(cur)) {
          const nbrs = fgNeighbors(skeleton, w, h, cur % w, Math.floor(cur / w));
          let next = -1;
          for (const nb of nbrs) {
            if (nb === prev) continue;
            if (visited[nb]) continue;
            next = nb;
            break;
          }
          if (next < 0) {
            // 退化：找不到未访问的下一步，尝试任意非 prev 邻居（可能形成回环尾巴）
            for (const nb of nbrs) {
              if (nb === prev) continue;
              next = nb;
              break;
            }
            if (next < 0) break;
          }
          prev = cur;
          cur = next;
          if (visited[cur]) {
            // 回到已访问点（环或交叉），收尾
            path.push(idxToPoint(cur));
            break;
          }
          visited[cur] = 1;
          path.push(idxToPoint(cur));
        }
        polylines.push({ points: path, closed: false });
      }
    }
  }

  // 2) 处理纯环（无节点的连通环）：所有点 count==2 且未访问
  for (let sy = 0; sy < h; sy++) {
    for (let sx = 0; sx < w; sx++) {
      const sIdx = sy * w + sx;
      if (skeleton[sIdx] === 0) continue;
      if (visited[sIdx]) continue;
      if (count[sIdx] !== 2) continue;
      // 追踪环
      const path: Point[] = [];
      let prev = -1;
      let cur = sIdx;
      while (true) {
        visited[cur] = 1;
        path.push(idxToPoint(cur));
        const nbrs = fgNeighbors(skeleton, w, h, cur % w, Math.floor(cur / w));
        let next = -1;
        for (const nb of nbrs) {
          if (nb === prev) continue;
          next = nb;
          break;
        }
        if (next < 0) break;
        prev = cur;
        cur = next;
        if (cur === sIdx) break; // 回到起点
        if (visited[cur]) break;
      }
      if (path.length >= 2) polylines.push({ points: path, closed: true });
    }
  }

  return polylines;
}
