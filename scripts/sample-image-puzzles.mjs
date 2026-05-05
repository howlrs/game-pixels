#!/usr/bin/env bun
// β9.0-β: 画像→パズル変換のサンプルパイプライン。
//
// 1. sharp で簡易シルエット PNG を生成 (実プロジェクトでは画像ファイルを置く想定)
// 2. image-to-puzzle.mjs に渡して puzzle JSON を生成
// 3. validate-puzzles で QA を確認
//
// 用途: image-to-puzzle CLI の動作実証 / 新パズル追加ワークフローのサンプル
// 注意: 生成されるパズルは tools/puzzle-specs/sample/ に出力 (実 deploy 対象外)

import { mkdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import sharp from 'sharp';

const SAMPLE_DIR = 'tools/puzzle-specs/sample';
await mkdir(SAMPLE_DIR, { recursive: true });

// 簡易シルエット定義 (黒=塗、白=空 のレンダリング向け 0/1 値)
const SAMPLES = [
  {
    name: 'circle-15',
    title: 'まる',
    width: 15,
    height: 15,
    pattern: gen15CirclePattern(),
  },
  {
    name: 'arrow-10',
    title: 'やじるし',
    width: 10,
    height: 10,
    pattern: gen10ArrowPattern(),
  },
];

function gen15CirclePattern() {
  // 半径 6 の円
  const N = 15;
  const cx = (N - 1) / 2, cy = (N - 1) / 2, r = 5.5;
  const out = [];
  for (let y = 0; y < N; y++) {
    const row = [];
    for (let x = 0; x < N; x++) {
      const d = Math.hypot(x - cx, y - cy);
      row.push(d <= r ? 1 : 0);
    }
    out.push(row);
  }
  return out;
}

function gen10ArrowPattern() {
  // 上向き矢印
  return [
    [0,0,0,0,1,1,0,0,0,0],
    [0,0,0,1,1,1,1,0,0,0],
    [0,0,1,1,1,1,1,1,0,0],
    [0,1,1,1,1,1,1,1,1,0],
    [1,1,1,1,1,1,1,1,1,1],
    [0,0,0,1,1,1,1,0,0,0],
    [0,0,0,1,1,1,1,0,0,0],
    [0,0,0,1,1,1,1,0,0,0],
    [0,0,0,1,1,1,1,0,0,0],
    [0,0,0,1,1,1,1,0,0,0],
  ];
}

async function patternToPng(pattern, outPath) {
  const H = pattern.length;
  const W = pattern[0].length;
  const buf = new Uint8Array(W * H * 3);
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      const i = (r * W + c) * 3;
      const isBlack = pattern[r][c] === 1;
      buf[i] = isBlack ? 0 : 255;
      buf[i + 1] = isBlack ? 0 : 255;
      buf[i + 2] = isBlack ? 0 : 255;
    }
  }
  await sharp(buf, { raw: { width: W, height: H, channels: 3 } })
    .png()
    .toFile(outPath);
}

let okCount = 0;
let failCount = 0;
for (const s of SAMPLES) {
  const pngPath = `${SAMPLE_DIR}/${s.name}.png`;
  const jsonPath = `${SAMPLE_DIR}/${s.name}.json`;
  await patternToPng(s.pattern, pngPath);
  console.log(`✓ generated ${pngPath}`);

  // image-to-puzzle に渡す
  const cat = `${s.width}x${s.height}`;
  const args = [
    'scripts/image-to-puzzle.mjs',
    pngPath,
    '--id', s.name,
    '--title', s.title,
    '--width', String(s.width),
    '--height', String(s.height),
    '--category', cat,
    '--difficulty', s.height >= 15 ? 'hard' : 'medium',
    '--description', `画像入力サンプル: ${s.title}`,
    '--out', jsonPath,
  ];
  const result = spawnSync('bun', args, { stdio: 'inherit' });
  if (result.status === 0) {
    okCount++;
  } else {
    failCount++;
    console.error(`✗ failed: ${s.name}`);
  }
}

console.log('---');
console.log(`pass: ${okCount} / fail: ${failCount}`);
console.log(`生成物: ${SAMPLE_DIR}/*.png + *.json`);
console.log('注意: これらは tools/puzzle-specs/sample/ に出力されており実 deploy 対象外です');
process.exit(failCount > 0 ? 1 : 0);
