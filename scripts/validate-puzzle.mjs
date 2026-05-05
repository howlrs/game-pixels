#!/usr/bin/env bun
// Round 7-C: validate-puzzle CLI
// 使い方:
//   bun scripts/validate-puzzle.mjs                     # public/puzzles/ 配下を全部検証
//   bun scripts/validate-puzzle.mjs path/to/puzzle.json # 個別検証
//
// 出力: 各パズルの QaReport サマリ + 全体 pass/fail カウント。
// 失敗があれば exit code 1 (CI 用)。

import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { assessSolution } from '../src/qa/index.ts';

const ROOT = new URL('../', import.meta.url).pathname;
const PUZZLES_DIR = join(ROOT, 'public/puzzles');

async function findPuzzleFiles(arg) {
  if (arg && arg.endsWith('.json')) return [arg];
  const out = [];
  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) await walk(full);
      else if (e.name.endsWith('.json') && e.name !== 'index.json') out.push(full);
    }
  }
  await walk(PUZZLES_DIR);
  return out.sort();
}

function formatReport(path, r) {
  const rel = relative(ROOT, path);
  const lines = [];
  lines.push(`${r.pass ? '✓' : '✗'} ${rel}`);
  lines.push(
    `  solver: ${r.solver.status} / logicallySolvable=${r.solver.logicallySolvable} / steps=${r.solver.stats.steps} / ${r.solver.stats.elapsedMs}ms`,
  );
  lines.push(
    `  visibility: pixelRatio=${r.visibility.pixelRatio.toFixed(2)}, components=${r.visibility.components}, fillsBounds=${r.visibility.fillsBounds.toFixed(2)}`,
  );
  lines.push(
    `  symmetry: h=${r.symmetry.horizontal.toFixed(2)} v=${r.symmetry.vertical.toFixed(2)} p=${r.symmetry.point.toFixed(2)}`,
  );
  if (!r.pass) lines.push(`  reasons: ${r.reasons.join(' / ')}`);
  return lines.join('\n');
}

const arg = process.argv[2];
const files = await findPuzzleFiles(arg);
let passCount = 0;
let failCount = 0;

for (const file of files) {
  const json = JSON.parse(await readFile(file, 'utf-8'));
  if (!json.solution) {
    console.error(`! ${file}: solution フィールドが無い - skip`);
    continue;
  }
  const report = assessSolution(json.solution, {
    solver: { maxSteps: 200_000, timeoutMs: 10_000 },
  });
  console.log(formatReport(file, report));
  if (report.pass) passCount++;
  else failCount++;
}

console.log('---');
console.log(`pass: ${passCount} / fail: ${failCount} / total: ${passCount + failCount}`);
process.exit(failCount > 0 ? 1 : 0);
