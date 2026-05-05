// Round 7-C QA 機構: 可視性 + 対称性メトリクス。
//
// 目的: パズルの「ぱっと見の絵としての品質」を数値化する。
// 自動生成パイプライン (PR-D) で大量のパズルを篩い分けるために使う。
//
// 公開:
// - computeVisibility(solution): { pixelRatio, components, boundingBox, fillsBounds }
// - computeSymmetry(solution): { horizontal, vertical, point } (0.0-1.0)

export interface BoundingBox {
  minRow: number;
  maxRow: number;
  minCol: number;
  maxCol: number;
}

export interface VisibilityMetrics {
  /** 全マス中の塗りマス比率 (0.0-1.0) */
  pixelRatio: number;
  /** 4 連結 connected components 数 (1 が「絵として一つにまとまっている」) */
  components: number;
  /** bounding box (空盤面なら null) */
  boundingBox: BoundingBox | null;
  /** bounding box 内に占める塗り比率 (0.0-1.0) — 高いほど密な絵 */
  fillsBounds: number;
}

export interface SymmetryMetrics {
  /** 横 (左右) 対称スコア: 1.0 = 完全対称, 0.0 = 全部違う */
  horizontal: number;
  /** 縦 (上下) 対称スコア */
  vertical: number;
  /** 点 (180°) 対称スコア */
  point: number;
}

type Solution = ReadonlyArray<ReadonlyArray<0 | 1>>;

export function computeVisibility(solution: Solution): VisibilityMetrics {
  const h = solution.length;
  const w = solution[0]?.length ?? 0;
  if (h === 0 || w === 0) {
    return { pixelRatio: 0, components: 0, boundingBox: null, fillsBounds: 0 };
  }

  let filledCount = 0;
  let minR = Infinity,
    maxR = -1,
    minC = Infinity,
    maxC = -1;
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      if (solution[r]![c] === 1) {
        filledCount++;
        if (r < minR) minR = r;
        if (r > maxR) maxR = r;
        if (c < minC) minC = c;
        if (c > maxC) maxC = c;
      }
    }
  }

  const total = w * h;
  const pixelRatio = filledCount / total;

  if (filledCount === 0) {
    return { pixelRatio: 0, components: 0, boundingBox: null, fillsBounds: 0 };
  }

  const bbox: BoundingBox = { minRow: minR, maxRow: maxR, minCol: minC, maxCol: maxC };
  const bboxArea = (maxR - minR + 1) * (maxC - minC + 1);
  const fillsBounds = filledCount / bboxArea;

  // 4 連結 connected components (BFS)
  const visited = new Uint8Array(w * h);
  let components = 0;
  const queue: number[] = [];
  for (let r0 = 0; r0 < h; r0++) {
    for (let c0 = 0; c0 < w; c0++) {
      if (solution[r0]![c0] !== 1) continue;
      if (visited[r0 * w + c0]) continue;
      components++;
      queue.length = 0;
      queue.push(r0 * w + c0);
      visited[r0 * w + c0] = 1;
      while (queue.length > 0) {
        const idx = queue.pop()!;
        const r = Math.floor(idx / w);
        const c = idx % w;
        const neighbors = [
          [r - 1, c],
          [r + 1, c],
          [r, c - 1],
          [r, c + 1],
        ];
        for (const [nr, nc] of neighbors) {
          if (nr! < 0 || nr! >= h || nc! < 0 || nc! >= w) continue;
          if (solution[nr!]![nc!] !== 1) continue;
          const nidx = nr! * w + nc!;
          if (visited[nidx]) continue;
          visited[nidx] = 1;
          queue.push(nidx);
        }
      }
    }
  }

  return { pixelRatio, components, boundingBox: bbox, fillsBounds };
}

export function computeSymmetry(solution: Solution): SymmetryMetrics {
  const h = solution.length;
  const w = solution[0]?.length ?? 0;
  if (h === 0 || w === 0) return { horizontal: 0, vertical: 0, point: 0 };
  const total = w * h;

  let hMatch = 0;
  let vMatch = 0;
  let pMatch = 0;
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const v = solution[r]![c];
      if (v === solution[r]![w - 1 - c]) hMatch++;
      if (v === solution[h - 1 - r]![c]) vMatch++;
      if (v === solution[h - 1 - r]![w - 1 - c]) pMatch++;
    }
  }
  return {
    horizontal: hMatch / total,
    vertical: vMatch / total,
    point: pMatch / total,
  };
}
