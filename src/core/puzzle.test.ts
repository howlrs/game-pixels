import { describe, expect, test } from 'bun:test';
import {
  PuzzleLoadError,
  flattenSolution,
  loadPuzzle,
  validatePuzzleConsistency,
  type PuzzleData,
} from './puzzle.ts';

const VALID: PuzzleData = {
  meta: {
    id: '5x5-test',
    title: 'テスト',
    width: 5,
    height: 5,
    difficulty: 'easy',
    estimatedSolveSeconds: 60,
    category: '5x5',
    description: 'ユニットテスト用',
  },
  solution: [
    [0, 1, 0, 1, 0],
    [1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1],
    [0, 1, 1, 1, 0],
    [0, 0, 1, 0, 0],
  ],
  rowClues: [[1, 1], [5], [5], [3], [1]],
  colClues: [[2], [4], [3, 1], [4], [2]],
  isUniqueSolution: true,
};

function fakeFetch(body: unknown, ok = true, status = 200) {
  return async (_url: string) =>
    new Response(JSON.stringify(body), { status, statusText: ok ? 'OK' : 'ERR' });
}

describe('loadPuzzle', () => {
  test('valid JSON で成功', async () => {
    const p = await loadPuzzle('/x', fakeFetch(VALID) as unknown as typeof fetch);
    expect(p.meta.id).toBe('5x5-test');
    expect(p.solution.length).toBe(5);
  });

  test('schema 違反 (width<3) で SCHEMA_INVALID', async () => {
    const bad = JSON.parse(JSON.stringify(VALID));
    bad.meta.width = 2;
    await expect(loadPuzzle('/x', fakeFetch(bad) as unknown as typeof fetch)).rejects.toMatchObject({
      kind: 'SCHEMA_INVALID',
    });
  });

  test('cross-field: solution.length と height 不一致 → CROSS_FIELD', async () => {
    const bad = JSON.parse(JSON.stringify(VALID));
    bad.solution.push([0, 0, 0, 0, 0]); // 6 行に
    await expect(loadPuzzle('/x', fakeFetch(bad) as unknown as typeof fetch)).rejects.toMatchObject({
      kind: 'CROSS_FIELD',
    });
  });

  test('cross-field: row 内 length と width 不一致 → CROSS_FIELD', async () => {
    const bad = JSON.parse(JSON.stringify(VALID));
    bad.solution[0] = [0, 1, 0, 1]; // 4 cols に
    await expect(loadPuzzle('/x', fakeFetch(bad) as unknown as typeof fetch)).rejects.toMatchObject({
      kind: 'CROSS_FIELD',
    });
  });

  test('fetch HTTP エラー → FETCH_FAILED', async () => {
    await expect(loadPuzzle('/x', fakeFetch({}, false, 500) as unknown as typeof fetch)).rejects.toMatchObject({
      kind: 'FETCH_FAILED',
    });
  });
});

describe('validatePuzzleConsistency', () => {
  test('valid は throw しない', () => {
    expect(() => validatePuzzleConsistency(VALID, '/x')).not.toThrow();
  });

  test('rowClues.length 不一致で throw', () => {
    const bad = JSON.parse(JSON.stringify(VALID));
    bad.rowClues.pop();
    expect(() => validatePuzzleConsistency(bad, '/x')).toThrow(PuzzleLoadError);
  });
});

describe('flattenSolution', () => {
  test('2D → 1D 変換', () => {
    const f = flattenSolution(VALID);
    expect(f.length).toBe(25);
    expect(f[0]).toBe(0);
    expect(f[1]).toBe(1);
    expect(f[5]).toBe(1); // (0,1) の塗り
  });
});
