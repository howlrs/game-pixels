// パズル生成スクリプト (docs §80.7 / §30.4)。
// 入力: solution (2D 配列) + メタ
// 出力: PuzzleData JSON (rowClues / colClues 自動生成 + 簡易 backtracking で解の一意性検証)
//
// 使い方:
//   node scripts/generate-puzzles.mjs path/to/solution-spec.json path/to/output.json
//
// solution-spec.json の例:
//   {
//     "meta": { "id": "...", "title": "...", "width": 5, ... },
//     "solution": [[0,1,0,...],[...],...]
//   }

import { readFileSync, writeFileSync } from 'node:fs';

function generateLineClue(line) {
  const result = [];
  let r = 0;
  for (const c of line) {
    if (c === 1) r++;
    else if (r > 0) {
      result.push(r);
      r = 0;
    }
  }
  if (r > 0) result.push(r);
  return result.length === 0 ? [0] : result;
}

function generateClueSet(solution) {
  const height = solution.length;
  const width = solution[0]?.length ?? 0;
  const rowClues = solution.map(generateLineClue);
  const colClues = [];
  for (let col = 0; col < width; col++) {
    const colCells = [];
    for (let row = 0; row < height; row++) colCells.push(solution[row][col]);
    colClues.push(generateLineClue(colCells));
  }
  return { width, height, rowClues, colClues };
}

/**
 * 簡易 backtracking solver (小サイズ用、5×5〜10×10 までは O(2^n) で許容)。
 * 解の数を最大 2 個まで数える (1 個なら一意、2 個以上なら一意ではない)。
 */
function countSolutions(rowClues, colClues, width, height, limit = 2) {
  let solutions = 0;
  const grid = Array.from({ length: height }, () => new Array(width).fill(0));

  function lineMatches(line, clue) {
    return JSON.stringify(generateLineClue(line)) === JSON.stringify(clue);
  }
  function colMatches(col) {
    const line = grid.map((row) => row[col]);
    return lineMatches(line, colClues[col]);
  }

  function backtrack(row) {
    if (solutions >= limit) return;
    if (row === height) {
      // 全列のヒント一致チェック
      for (let c = 0; c < width; c++) {
        if (!colMatches(c)) return;
      }
      solutions++;
      return;
    }
    // 行 row のすべての可能な塗り方を試す
    const targetClue = rowClues[row];
    enumerateRowPatterns(width, targetClue, (pattern) => {
      grid[row] = pattern;
      backtrack(row + 1);
    });
  }

  backtrack(0);
  return solutions;
}

/** 行幅 width に対して clue を満たすすべての塗り方を列挙 (callback 経由)。 */
function enumerateRowPatterns(width, clue, cb) {
  // [0] (全空) のショートカット
  if (clue.length === 1 && clue[0] === 0) {
    cb(new Array(width).fill(0));
    return;
  }
  // 標準パターン列挙: clue[0] を col=start から始める可能性を全て試す
  function place(idx, start, current) {
    if (idx === clue.length) {
      // 残りは全空
      const out = current.slice();
      while (out.length < width) out.push(0);
      cb(out);
      return;
    }
    const remaining = clue.slice(idx).reduce((a, b) => a + b + 1, -1); // 残りの塗 + 必要な空隙
    const maxStart = width - remaining;
    for (let s = start; s <= maxStart; s++) {
      const next = current.slice();
      while (next.length < s) next.push(0);
      for (let i = 0; i < clue[idx]; i++) next.push(1);
      // 次のブロックの間に 1 マス空ける (last 以外)
      if (idx < clue.length - 1) next.push(0);
      place(idx + 1, next.length, next);
    }
  }
  place(0, 0, []);
}

function main(specPath, outPath) {
  const spec = JSON.parse(readFileSync(specPath, 'utf8'));
  const { meta, solution } = spec;
  const { width, height } = meta;
  if (solution.length !== height || solution[0].length !== width) {
    console.error('size mismatch in spec');
    process.exit(1);
  }
  const cs = generateClueSet(solution);
  const solCount = countSolutions(cs.rowClues, cs.colClues, width, height, 2);
  if (solCount === 0) {
    console.error('No solution found — bug in generator');
    process.exit(2);
  }
  const isUniqueSolution = solCount === 1;
  if (!isUniqueSolution) {
    console.warn(`Warning: ${specPath} has multiple solutions, isUniqueSolution=false`);
  }
  const out = { meta, solution, rowClues: cs.rowClues, colClues: cs.colClues, isUniqueSolution };
  writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n');
  console.log(`Wrote ${outPath} (unique=${isUniqueSolution})`);
}

if (process.argv.length < 4) {
  console.error('Usage: node scripts/generate-puzzles.mjs <spec.json> <out.json>');
  process.exit(1);
}
main(process.argv[2], process.argv[3]);
