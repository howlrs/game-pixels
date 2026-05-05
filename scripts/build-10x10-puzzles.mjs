#!/usr/bin/env bun
// Round 7-D: 10x10 puzzle 8 種をまとめて生成。
// tools/puzzle-specs/10x10/*.grid から public/puzzles/10x10/*.json を作る。

import { readdir } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { spawnSync } from 'node:child_process';

const SPECS_DIR = 'tools/puzzle-specs/10x10';
const OUT_DIR = 'public/puzzles/10x10';

const META = {
  cat: { title: 'ねこ', difficulty: 'medium', description: '猫の顔' },
  house: { title: 'いえ', difficulty: 'medium', description: '屋根のある家' },
  star: { title: 'ほし', difficulty: 'medium', description: '5 角星' },
  mushroom: { title: 'きのこ', difficulty: 'medium', description: 'きのこ' },
  'heart-big': { title: 'ハート (大)', difficulty: 'medium', description: '大きなハート' },
  umbrella: { title: 'かさ', difficulty: 'medium', description: '雨傘' },
  rocket: { title: 'ロケット', difficulty: 'medium', description: '上向きロケット' },
  tree: { title: 'き', difficulty: 'medium', description: '針葉樹' },
};

const files = (await readdir(SPECS_DIR)).filter((f) => f.endsWith('.grid')).sort();
let okCount = 0;
let failCount = 0;
const successIds = [];

for (const f of files) {
  const id = basename(f, '.grid');
  const meta = META[id];
  if (!meta) {
    console.error(`! ${id}: META 未登録 - skip`);
    continue;
  }
  const out = join(OUT_DIR, `${id}.json`);
  const args = [
    'scripts/image-to-puzzle.mjs',
    join(SPECS_DIR, f),
    '--id', id,
    '--title', meta.title,
    '--width', '10',
    '--height', '10',
    '--category', '10x10',
    '--difficulty', meta.difficulty,
    '--description', meta.description,
    '--out', out,
  ];
  const result = spawnSync('bun', args, { stdio: 'inherit' });
  if (result.status === 0) {
    okCount++;
    successIds.push(id);
  } else {
    failCount++;
  }
}

console.log('---');
console.log(`pass: ${okCount} / fail: ${failCount}`);
console.log('successful ids:', successIds.join(', '));
process.exit(failCount > 0 ? 1 : 0);
