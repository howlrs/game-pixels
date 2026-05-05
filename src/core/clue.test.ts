import { describe, expect, test } from 'bun:test';
import { generateClueSet, generateLineClue } from './clue.ts';

describe('generateLineClue', () => {
  test('全空 → [0]', () => {
    expect(generateLineClue([0, 0, 0])).toEqual([0]);
  });
  test('全塗 → [length]', () => {
    expect(generateLineClue([1, 1, 1])).toEqual([3]);
  });
  test('連続塗り 1 + 連続塗り 2', () => {
    expect(generateLineClue([1, 0, 1, 1, 0])).toEqual([1, 2]);
  });
  test('1 連続のみ', () => {
    expect(generateLineClue([0, 1, 0])).toEqual([1]);
  });
  test('境界: 末尾塗り', () => {
    expect(generateLineClue([0, 0, 1])).toEqual([1]);
  });
  test('境界: 先頭塗り', () => {
    expect(generateLineClue([1, 0, 0])).toEqual([1]);
  });
});

describe('generateClueSet', () => {
  test('5×5 ハート', () => {
    // . # . # .
    // # # # # #
    // # # # # #
    // . # # # .
    // . . # . .
    const solution: (0 | 1)[][] = [
      [0, 1, 0, 1, 0],
      [1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1],
      [0, 1, 1, 1, 0],
      [0, 0, 1, 0, 0],
    ];
    const cs = generateClueSet(solution);
    expect(cs.width).toBe(5);
    expect(cs.height).toBe(5);
    expect(cs.rowClues).toEqual([[1, 1], [5], [5], [3], [1]]);
    // col 2 は row 1-4 が連続塗りなので [4] (テスト期待値 [3,1] は誤り、上下分離なし)
    expect(cs.colClues).toEqual([[2], [4], [4], [4], [2]]);
  });

  test('3×3 全空 → 全 [0]', () => {
    const sol: (0 | 1)[][] = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];
    const cs = generateClueSet(sol);
    expect(cs.rowClues).toEqual([[0], [0], [0]]);
    expect(cs.colClues).toEqual([[0], [0], [0]]);
  });
});
