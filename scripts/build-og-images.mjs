#!/usr/bin/env bun
// β12.0-α: パズル別 OG image (1200x630) を build 時に sharp で生成。
//
// 戦略:
//   - 各 puzzle JSON の solution (0/1 2D 配列) から「絵柄パネル」を SVG で組み立て
//   - sharp で SVG → PNG 1200x630 に rasterize
//   - 出力: dist/og/<category>/<id>.png
//
// 入出力:
//   入力: public/puzzles/<category>/<id>.json (solution 配列)
//   出力: dist/og/<category>/<id>.png
//
// レイアウト:
//   左 60%: 完成パズル盤面 (solution の白セル / 黒セル)
//   右 40%: パズル名 (大) + サイズ・難易度 (中) + サイト名 (小)

import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import { assertSafeCategory, assertSafeId, escapeHtml } from './seo-helpers.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const DIST = join(ROOT, 'dist');
const PUZZLES_DIR = join(ROOT, 'public/puzzles');
const INDEX_JSON = join(PUZZLES_DIR, 'index.json');

if (!existsSync(DIST)) {
  console.error(`✗ ${DIST} not found. Run 'vite build' first.`);
  process.exit(1);
}

const W = 1200;
const H = 630;
const PANEL_W = 720; // 左 60%
const PANEL_PADDING = 32;

const index = JSON.parse(await readFile(INDEX_JSON, 'utf-8'));
const puzzles = index.puzzles;

function difficultyJa(d) {
  return d === 'easy' ? '初級' : d === 'medium' ? '中級' : d === 'hard' ? '上級' : '';
}

function buildSvg(puzzle, solution) {
  const w = puzzle.width;
  const h = puzzle.height;
  const sizeText = `${w}×${h}`;
  const diff = difficultyJa(puzzle.difficulty);
  // 盤面サイズ: panel 内に収まるよう正方形 (cellPx は max 540px / max(w,h))
  const PANEL_INNER = PANEL_W - PANEL_PADDING * 2;
  const BOARD_INNER = Math.min(PANEL_INNER, H - PANEL_PADDING * 2);
  const cellPx = Math.floor(BOARD_INNER / Math.max(w, h));
  const boardW = cellPx * w;
  const boardH = cellPx * h;
  const boardX = PANEL_PADDING + Math.floor((PANEL_INNER - boardW) / 2);
  const boardY = PANEL_PADDING + Math.floor((H - PANEL_PADDING * 2 - boardH) / 2);

  // セル <rect> を生成 (塗りのみ)
  const cellRects = [];
  for (let r = 0; r < h; r++) {
    const row = solution[r];
    for (let c = 0; c < w; c++) {
      if (row[c] !== 1) continue;
      cellRects.push(
        `<rect x="${boardX + c * cellPx + 1}" y="${boardY + r * cellPx + 1}" width="${cellPx - 2}" height="${cellPx - 2}" fill="#eeeeee" />`,
      );
    }
  }

  // グリッド線 (5 セル毎太く)
  const gridLines = [];
  for (let i = 0; i <= w; i++) {
    const strong = i % 5 === 0;
    const x = boardX + i * cellPx;
    gridLines.push(
      `<line x1="${x}" y1="${boardY}" x2="${x}" y2="${boardY + boardH}" stroke="${strong ? '#888888' : '#444444'}" stroke-width="${strong ? 2 : 1}" />`,
    );
  }
  for (let i = 0; i <= h; i++) {
    const strong = i % 5 === 0;
    const y = boardY + i * cellPx;
    gridLines.push(
      `<line x1="${boardX}" y1="${y}" x2="${boardX + boardW}" y2="${y}" stroke="${strong ? '#888888' : '#444444'}" stroke-width="${strong ? 2 : 1}" />`,
    );
  }

  // 右側のテキストエリア
  const TEXT_X = PANEL_W + 40;
  const TEXT_Y = 220;
  // 長すぎるタイトル防止 (面取り)
  const titleSafe = escapeHtml((puzzle.title || '').slice(0, 14));
  const subText = escapeHtml(`${sizeText} ノノグラム · ${diff}`);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#0d1421" />
  <!-- 左 panel: 完成パズル盤面 -->
  <rect x="${PANEL_PADDING / 2}" y="${PANEL_PADDING / 2}" width="${PANEL_W - PANEL_PADDING}" height="${H - PANEL_PADDING}" fill="#1a1a1a" stroke="#2a3a5a" stroke-width="2" rx="12" />
  ${cellRects.join('\n  ')}
  ${gridLines.join('\n  ')}
  <!-- 右 panel: テキスト -->
  <text x="${TEXT_X}" y="${TEXT_Y}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="84" font-weight="700" fill="#ffffff">${titleSafe}</text>
  <text x="${TEXT_X}" y="${TEXT_Y + 60}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="32" font-weight="400" fill="#aaaaaa">${subText}</text>
  <text x="${TEXT_X}" y="${H - 60}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="28" font-weight="600" fill="#ffcc00">ピクセルズ</text>
  <text x="${TEXT_X}" y="${H - 30}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="20" font-weight="400" fill="#888888">pixels.howlrs.net</text>
</svg>`;
}

let count = 0;
let totalSize = 0;
const startMs = Date.now();

for (const meta of puzzles) {
  assertSafeCategory(meta.category);
  assertSafeId(meta.id);
  const puzzlePath = join(PUZZLES_DIR, meta.category, `${meta.id}.json`);
  const data = JSON.parse(await readFile(puzzlePath, 'utf-8'));
  const svg = buildSvg(meta, data.solution);
  const outDir = join(DIST, 'og', meta.category);
  await mkdir(outDir, { recursive: true });
  const outPath = join(outDir, `${meta.id}.png`);
  await sharp(Buffer.from(svg))
    .png({ quality: 90, compressionLevel: 9 })
    .toFile(outPath);
  const stat = await readFile(outPath).then((b) => b.length);
  totalSize += stat;
  count++;
  console.log(`  ✓ /og/${meta.category}/${meta.id}.png (${(stat / 1024).toFixed(1)} KB)`);
}

const elapsedMs = Date.now() - startMs;
console.log(
  `\n✓ Generated ${count} OG images in ${(elapsedMs / 1000).toFixed(2)}s, total ${(totalSize / 1024 / 1024).toFixed(2)} MB`,
);
