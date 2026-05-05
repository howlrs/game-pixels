#!/usr/bin/env bun
// Round 7-D/E: tools/puzzle-specs/<size>/*.grid からまとめて public/puzzles/<size>/*.json を生成。
// 使い方: bun scripts/build-puzzles.mjs [size]
//   size 省略 → 全サイズ (10x10 / 15x15 / 25x25)
//
// メタ定義は scripts/puzzle-meta.mjs に集約 (Gemini Pro deep 指摘 5)。

import { readdir, access } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { spawnSync } from 'node:child_process';
import { SIZES, META } from './puzzle-meta.mjs';

async function run() {
  const targetSize = process.argv[2];
  const sizes = targetSize ? [targetSize] : SIZES;

  let okCount = 0;
  let failCount = 0;
  const failedIds = [];

  for (const size of sizes) {
    const specsDir = `tools/puzzle-specs/${size}`;
    const outDir = `public/puzzles/${size}`;
    try {
      await access(specsDir);
    } catch {
      console.warn(`skip ${size}: ${specsDir} not found`);
      continue;
    }
    const files = (await readdir(specsDir)).filter((f) => f.endsWith('.grid')).sort();
    for (const f of files) {
      const id = basename(f, '.grid');
      const meta = META[id];
      if (!meta) {
        console.error(`! ${id}: META 未登録 - skip (scripts/puzzle-meta.mjs を更新してください)`);
        continue;
      }
      const [w, h] = size.split('x').map((s) => parseInt(s, 10));
      const out = join(outDir, `${id}.json`);
      const args = [
        'scripts/image-to-puzzle.mjs',
        join(specsDir, f),
        '--id', id,
        '--title', meta.title,
        '--width', String(w),
        '--height', String(h),
        '--category', size,
        '--difficulty', meta.difficulty,
        '--description', meta.description,
        '--out', out,
      ];
      const result = spawnSync('bun', args, { stdio: 'inherit' });
      if (result.status === 0) okCount++;
      else {
        failCount++;
        failedIds.push(`${size}/${id}`);
      }
    }
  }

  console.log('---');
  console.log(`pass: ${okCount} / fail: ${failCount}`);
  if (failedIds.length > 0) console.log('failed:', failedIds.join(', '));
  process.exit(failCount > 0 ? 1 : 0);
}

if (import.meta.main) {
  await run();
}
