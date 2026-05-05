import { describe, expect, test } from 'bun:test';
import { generateClueSet } from '@core/index.ts';
import { solveBoard } from './board-solver.ts';

describe('solveBoard — 既存パズル一意性', () => {
  test('5x5 ハート → unique + logicallySolvable', () => {
    const heart: (0 | 1)[][] = [
      [0, 1, 0, 1, 0],
      [1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1],
      [0, 1, 1, 1, 0],
      [0, 0, 1, 0, 0],
    ];
    const cs = generateClueSet(heart);
    const r = solveBoard(cs.rowClues, cs.colClues);
    expect(r.status).toBe('unique');
    expect(r.sample).toEqual(heart);
    // ハートは line solver だけで解ける程度に冗長性があるはず
    expect(r.logicallySolvable).toBe(true);
  });

  test('5x5 ダイヤ → unique', () => {
    const diamond: (0 | 1)[][] = [
      [0, 0, 1, 0, 0],
      [0, 1, 1, 1, 0],
      [1, 1, 1, 1, 1],
      [0, 1, 1, 1, 0],
      [0, 0, 1, 0, 0],
    ];
    const cs = generateClueSet(diamond);
    const r = solveBoard(cs.rowClues, cs.colClues);
    expect(r.status).toBe('unique');
    expect(r.sample).toEqual(diamond);
  });

  test('5x5 プラス → unique', () => {
    const plus: (0 | 1)[][] = [
      [0, 0, 1, 0, 0],
      [0, 0, 1, 0, 0],
      [1, 1, 1, 1, 1],
      [0, 0, 1, 0, 0],
      [0, 0, 1, 0, 0],
    ];
    const cs = generateClueSet(plus);
    const r = solveBoard(cs.rowClues, cs.colClues);
    expect(r.status).toBe('unique');
    expect(r.sample).toEqual(plus);
  });
});

describe('solveBoard — 多解パズル検出', () => {
  test('明らかな多解: 2x2 でチェッカーパターン', () => {
    // .#
    // #.
    // と
    // #.
    // .#
    // が同じヒントを持つ
    const checker: (0 | 1)[][] = [
      [0, 1],
      [1, 0],
    ];
    const cs = generateClueSet(checker);
    const r = solveBoard(cs.rowClues, cs.colClues);
    expect(r.status).toBe('multiple');
    expect(r.sample).toBeDefined();
    expect(r.alternative).toBeDefined();
    expect(r.sample).not.toEqual(r.alternative!);
  });
});

describe('solveBoard — 空盤面', () => {
  test('全空 5x5 → unique', () => {
    const empty: (0 | 1)[][] = [
      [0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0],
    ];
    const cs = generateClueSet(empty);
    const r = solveBoard(cs.rowClues, cs.colClues);
    expect(r.status).toBe('unique');
    expect(r.logicallySolvable).toBe(true);
  });
});

describe('solveBoard — Gemini レビュー指摘 5 のコーナーケース', () => {
  test('矛盾検出: 行 vs 列ヒントの整合不能', () => {
    // 3x3 で row=[3,3,3] (全塗) なのに col=[1,1,1] (1セルだけ塗) → 矛盾
    const r = solveBoard([[3], [3], [3]], [[1], [1], [1]]);
    expect(r.status).toBe('unsolvable');
  });

  test('[0] ヒントが [] と同じく扱える', () => {
    // 3x3 で全空、ヒントは [0] と [] を混在させる
    const r1 = solveBoard([[0], [0], [0]], [[0], [0], [0]]);
    expect(r1.status).toBe('unique');
    expect(r1.sample).toEqual([
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ]);
    const r2 = solveBoard([[], [], []], [[], [], []]);
    expect(r2.status).toBe('unique');
    expect(r2.sample).toEqual(r1.sample);
  });

  test('timeout: 極小 maxSteps で打ち切られる', () => {
    // 5x5 チェッカー (多解) を maxSteps=1 で打ち切る
    const cs = generateClueSet([
      [0, 1, 0, 1, 0],
      [1, 0, 1, 0, 1],
      [0, 1, 0, 1, 0],
      [1, 0, 1, 0, 1],
      [0, 1, 0, 1, 0],
    ]);
    const r = solveBoard(cs.rowClues, cs.colClues, { maxSteps: 1, timeoutMs: 100 });
    // 1 step で決着できない場合は timeout (= maxSteps 超過)
    // logically solvable なら 'unique' になるかもしれないので、両方許容
    expect(['unique', 'timeout']).toContain(r.status);
  });
});
