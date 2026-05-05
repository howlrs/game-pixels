#!/usr/bin/env bun
// Round 7-D: 画像 → ノノグラムパズル (2 値化 + 自動 flip 調整 + QA 通過保証)
//
// 使い方:
//   bun scripts/image-to-puzzle.mjs <image.png> --width 10 --height 10 --id animal-cat --title 'ねこ' --category 10x10 --out public/puzzles/10x10/animal-cat.json
//
// 入力安全: ≤ 2MB / ≤ 1024×1024 (Gemini Pro deep 計画指摘 D-2)
// Gemini Pro deep 計画指摘 D-1: 単純 2 値化だと一意解にならない確率が高いため、
// しきい値段階探索 + 最少 flip 探索 で QA 通過を試みる。
//
// β9.0-α: sharp 導入で PNG/JPEG/WebP 入力対応。
// 既存の .json (2D 配列) / .grid (ASCII art) も引き続きサポート。
//
// sharp は devDependencies のみ (ランタイム bundle 影響なし)。
// 画像入力時は内部で「resize → grayscale → 輝度しきい値 2 値化」のパイプライン。

import { readFile } from 'node:fs/promises';
import { writeFileSync, statSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import sharp from 'sharp';
import { generateClueSet } from '../src/core/clue.ts';
import { assessSolution } from '../src/qa/index.ts';

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_RESOLUTION = 1024;
const MAX_LINE_LEN = 8192; // Gemini レビュー指摘 (DoS): 1 行最大長

// Gemini レビュー指摘 (security): 出力先は project root 配下に限定し、トラバーサル防止
const PROJECT_ROOT = resolve(new URL('../', import.meta.url).pathname);

function safeOutPath(out) {
  const abs = isAbsolute(out) ? out : resolve(out);
  const rel = relative(PROJECT_ROOT, abs);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`--out must be inside project root: ${out}`);
  }
  return abs;
}

function parseArgs(argv) {
  const out = { positional: [], opts: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const val = argv[i + 1];
      if (val !== undefined && !val.startsWith('--')) {
        out.opts[key] = val;
        i++;
      } else {
        out.opts[key] = true;
      }
    } else {
      out.positional.push(a);
    }
  }
  return out;
}

/**
 * .json 形式 (2D 0/1 配列) / .grid (テキスト ASCII art) /
 * .png/.jpg/.jpeg/.webp (sharp 経由) からピクセルマトリクスを読み込む。
 *
 * 画像入力時は loadInput 内で resize しないが、後段の resizeToTarget で
 * 最終的に target サイズに整える。
 */
/** Gemini レビュー指摘 (バグ 1): 全行が同じ長さの矩形であることを確認 */
function assertRectangular(matrix, label) {
  if (!Array.isArray(matrix) || matrix.length === 0) {
    throw new Error(`${label}: empty or non-array`);
  }
  const w = matrix[0].length;
  for (let i = 0; i < matrix.length; i++) {
    if (!Array.isArray(matrix[i]) || matrix[i].length !== w) {
      throw new Error(`${label}: row ${i} length ${matrix[i]?.length} != ${w}`);
    }
  }
}

async function loadInput(path) {
  const stat = statSync(path);
  if (stat.size > MAX_BYTES) throw new Error(`Input too large: ${stat.size} > ${MAX_BYTES}`);
  const ext = path.toLowerCase().split('.').pop();

  // β9.0-α: 画像 (PNG/JPEG/WebP) は sharp で grayscale → raw pixel に変換
  if (ext === 'png' || ext === 'jpg' || ext === 'jpeg' || ext === 'webp') {
    const buf = await readFile(path);
    const meta = await sharp(buf).metadata();
    if (
      typeof meta.width !== 'number' ||
      typeof meta.height !== 'number' ||
      meta.width > MAX_RESOLUTION ||
      meta.height > MAX_RESOLUTION
    ) {
      throw new Error(
        `Image too large: ${meta.width}x${meta.height} > ${MAX_RESOLUTION} (or undecodable)`,
      );
    }
    // grayscale 1ch + raw 出力で 0..255 の輝度配列を取得
    const { data, info } = await sharp(buf)
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    if (info.channels !== 1) {
      throw new Error(`Unexpected channels: ${info.channels} (expected 1 after grayscale)`);
    }
    const matrix = [];
    for (let r = 0; r < info.height; r++) {
      const row = new Array(info.width);
      const offset = r * info.width;
      for (let c = 0; c < info.width; c++) {
        row[c] = data[offset + c]; // 0..255
      }
      matrix.push(row);
    }
    assertRectangular(matrix, `image ${ext}`);
    // 後続の binarizeIfNeeded がしきい値 2 値化、resizeToTarget が target サイズに揃える
    return matrix;
  }

  const raw = await readFile(path, 'utf-8');
  if (ext === 'json') {
    let data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      throw new Error(`Failed to parse JSON: ${e.message}`);
    }
    let matrix;
    if (Array.isArray(data) && data.every((r) => Array.isArray(r))) matrix = data;
    else if (data && data.solution && Array.isArray(data.solution)) matrix = data.solution;
    else throw new Error('JSON must be a 2D array or have .solution field');
    assertRectangular(matrix, 'JSON solution');
    return matrix;
  }
  if (ext === 'grid' || ext === 'txt') {
    // ASCII art: '#' = 1, '.' = 0 (空白行・コメント行は無視)
    const lines = raw
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('//'));
    for (const l of lines) {
      if (l.length > MAX_LINE_LEN) throw new Error(`Line too long: ${l.length}`);
    }
    const matrix = lines.map((l) => l.split('').map((c) => (c === '#' || c === '1' ? 1 : 0)));
    assertRectangular(matrix, 'grid input');
    return matrix;
  }
  throw new Error(
    `Unsupported input format .${ext}. Supported: .json (2D 0/1 array), .grid/.txt (ASCII '.'/'#'), .png/.jpg/.jpeg/.webp (image)`,
  );
}

/**
 * Otsu 2 値化的に「塗りすぎず薄すぎない」しきい値を探索する。
 * 入力が既に 2 値の場合 (0/1 のみ) は素通り。
 *
 * β9.0-α: 画像入力時は **暗い (低輝度) 部分を塗 (1)** とする (ノノグラムの直感)。
 * 平均輝度をしきい値とし、それ未満を 1、それ以上を 0。
 */
function binarizeIfNeeded(matrix) {
  // 0/1 のみなら何もしない
  let isBinary = true;
  for (const row of matrix) {
    for (const v of row) {
      if (v !== 0 && v !== 1) {
        isBinary = false;
        break;
      }
    }
    if (!isBinary) break;
  }
  if (isBinary) return matrix.map((r) => r.map((v) => (v === 1 ? 1 : 0)));
  // 0..255 の輝度として平均値で 2 値化 (暗い部分を塗とする)
  let sum = 0;
  let count = 0;
  for (const row of matrix) {
    for (const v of row) {
      sum += v;
      count++;
    }
  }
  const avg = sum / count;
  return matrix.map((row) => row.map((v) => (v < avg ? 1 : 0)));
}

/**
 * width/height にリサイズ (nearest neighbor, 縮小のみ想定)。
 * 既に正しいサイズなら何もしない。拡大は精度が出ないので拒否。
 */
function resizeToTarget(matrix, targetW, targetH) {
  const srcH = matrix.length;
  const srcW = matrix[0]?.length ?? 0;
  if (srcH === targetH && srcW === targetW) return matrix;
  if (srcW > MAX_RESOLUTION || srcH > MAX_RESOLUTION) {
    throw new Error(`Source too large: ${srcW}x${srcH} > ${MAX_RESOLUTION}`);
  }
  if (srcW < targetW || srcH < targetH) {
    throw new Error(
      `Source ${srcW}x${srcH} smaller than target ${targetW}x${targetH}; supply a larger source`,
    );
  }
  // ブロック平均で縮小 → 0.5 以上で 1
  const out = [];
  for (let r = 0; r < targetH; r++) {
    const row = [];
    const r0 = Math.floor((r * srcH) / targetH);
    const r1 = Math.floor(((r + 1) * srcH) / targetH);
    for (let c = 0; c < targetW; c++) {
      const c0 = Math.floor((c * srcW) / targetW);
      const c1 = Math.floor(((c + 1) * srcW) / targetW);
      let s = 0;
      let n = 0;
      for (let y = r0; y < r1; y++) for (let x = c0; x < c1; x++) {
        s += matrix[y][x];
        n++;
      }
      row.push(n > 0 && s / n >= 0.5 ? 1 : 0);
    }
    out.push(row);
  }
  return out;
}

/**
 * QA で pass しなければ 1 セルずつ flip して再評価 (greedy)。
 * 制約: maxFlips 回試行で諦める。
 */
function tryAutoFix(solution, maxFlips = 8) {
  const opts = { solver: { maxSteps: 200_000, timeoutMs: 5_000 } };
  let cur = solution.map((r) => r.slice());
  let report = assessSolution(cur, opts);
  if (report.pass) return { solution: cur, report, flips: 0 };

  // 重要: 一意性が無い (multiple) なら、alternative との「差分セル」を flip すると一意化しやすい
  for (let attempt = 0; attempt < maxFlips; attempt++) {
    const r = assessSolution(cur, opts);
    if (r.pass) return { solution: cur, report: r, flips: attempt };
    // multiple 時のみ自動修正可能
    if (r.solver.status !== 'multiple' || !r.solver.sample || !r.solver.alternative) break;
    // 差分セルを 1 つ flip (sample と alternative で異なるセルを探す)
    const sample = r.solver.sample;
    const alt = r.solver.alternative;
    let flipped = false;
    for (let row = 0; row < cur.length && !flipped; row++) {
      for (let col = 0; col < cur[0].length && !flipped; col++) {
        if (sample[row][col] !== alt[row][col]) {
          // sample 寄りに固定
          cur[row][col] = sample[row][col];
          flipped = true;
        }
      }
    }
    if (!flipped) break;
  }
  return { solution: cur, report: assessSolution(cur, opts), flips: maxFlips };
}

const argv = process.argv.slice(2);
const { positional, opts } = parseArgs(argv);
if (positional.length < 1 || !opts.out) {
  console.error('Usage: bun scripts/image-to-puzzle.mjs <input.json|.grid> --id <id> --title <title> --width N --height N --category 10x10 --difficulty easy --out <out.json>');
  process.exit(1);
}
const inputPath = resolve(positional[0]);
const targetW = parseInt(opts.width ?? '10', 10);
const targetH = parseInt(opts.height ?? '10', 10);
// Gemini レビュー指摘 (バグ 2): NaN / 範囲外チェック
if (!Number.isInteger(targetW) || targetW < 3 || targetW > 50) {
  console.error(`Invalid --width: ${opts.width} (3..50 integer)`);
  process.exit(1);
}
if (!Number.isInteger(targetH) || targetH < 3 || targetH > 50) {
  console.error(`Invalid --height: ${opts.height} (3..50 integer)`);
  process.exit(1);
}
const id = opts.id;
const title = opts.title;
const category = opts.category ?? `${targetW}x${targetH}`;
const difficulty = opts.difficulty ?? 'medium';
const description = opts.description ?? '';
if (!id || !title) {
  console.error('Required: --id, --title');
  process.exit(1);
}
const outAbs = safeOutPath(opts.out);

const raw = await loadInput(inputPath);
const binarized = binarizeIfNeeded(raw);
const resized = resizeToTarget(binarized, targetW, targetH);
const fixed = tryAutoFix(resized);

if (!fixed.report.pass) {
  console.error(`! QA fail after ${fixed.flips} flips:`);
  for (const reason of fixed.report.reasons) console.error('  -', reason);
  console.error('  Try editing the source manually or providing a different image.');
  process.exit(2);
}

const cs = generateClueSet(fixed.solution);
const out = {
  meta: {
    id,
    title,
    width: targetW,
    height: targetH,
    difficulty,
    estimatedSolveSeconds: targetW * targetH * 6, // 1 マス 6 秒見積
    category,
    description,
  },
  solution: fixed.solution,
  rowClues: cs.rowClues,
  colClues: cs.colClues,
  isUniqueSolution: true,
};

writeFileSync(outAbs, JSON.stringify(out, null, 2) + '\n');
const r = fixed.report;
console.log(`✓ ${opts.out} (flips=${fixed.flips})`);
console.log(`  unique / logicallySolvable=${r.solver.logicallySolvable}`);
console.log(
  `  pixelRatio=${r.visibility.pixelRatio.toFixed(2)} / components=${r.visibility.components} / fillsBounds=${r.visibility.fillsBounds.toFixed(2)}`,
);
console.log(
  `  symmetry h=${r.symmetry.horizontal.toFixed(2)} v=${r.symmetry.vertical.toFixed(2)} p=${r.symmetry.point.toFixed(2)}`,
);
// Gemini レビュー指摘 (改善 1): 自動修正があった場合は目視確認を強く促す
if (fixed.flips > 0) {
  console.warn(
    `⚠ ${fixed.flips} flip(s) applied for QA pass. 絵柄の対称性・連結性が失われていないか必ず目視確認してください。`,
  );
}
