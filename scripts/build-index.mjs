#!/usr/bin/env bun
// Round 7-E: public/puzzles/<size>/*.json を集約して public/puzzles/index.json を生成。
// メタ定義は scripts/puzzle-meta.mjs に集約 (Gemini Pro deep 指摘 5)。

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { SIZE_ORDER, ID_ORDER } from './puzzle-meta.mjs';

function sortByOrder(files, order) {
  const ranked = (id) => {
    const i = order.indexOf(id);
    return i < 0 ? 999 : i;
  };
  return files.slice().sort((a, b) => {
    const ia = a.replace(/\.json$/, '');
    const ib = b.replace(/\.json$/, '');
    return ranked(ia) - ranked(ib) || a.localeCompare(b);
  });
}

const puzzles = [];
for (const size of SIZE_ORDER) {
  const dir = `public/puzzles/${size}`;
  let files;
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith('.json'));
  } catch {
    continue;
  }
  files = sortByOrder(files, ID_ORDER[size] ?? []);
  for (const f of files) {
    const data = JSON.parse(await readFile(join(dir, f), 'utf-8'));
    puzzles.push(data.meta);
  }
}

const out = {
  categoryOrder: SIZE_ORDER,
  puzzles,
};
await writeFile('public/puzzles/index.json', JSON.stringify(out, null, 2) + '\n');
console.log(`✓ public/puzzles/index.json (${puzzles.length} puzzles)`);
