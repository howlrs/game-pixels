import { describe, expect, test } from 'bun:test';
import { countLineSolutions, solveLine, type LineCellState } from './line-solver.ts';

const E: LineCellState = 0;
const F: LineCellState = 1;
const U: LineCellState = -1;

describe('solveLine — overlap inference', () => {
  test('clue=[3] / n=5 → 中央の 1 セルだけ確定 FILLED', () => {
    const result = solveLine([3], [U, U, U, U, U]);
    // 配置パターン: [F,F,F,_,_], [_,F,F,F,_], [_,_,F,F,F]
    // 全パターンで FILLED = index 2 のみ
    expect(result).toEqual([U, U, F, U, U]);
  });
  test('clue=[5] / n=5 → 全マス FILLED', () => {
    const result = solveLine([5], [U, U, U, U, U]);
    expect(result).toEqual([F, F, F, F, F]);
  });
  test('clue=[2,2] / n=5 → 完全確定', () => {
    // 唯一の配置: [F,F,_,F,F]
    const result = solveLine([2, 2], [U, U, U, U, U]);
    expect(result).toEqual([F, F, E, F, F]);
  });
  test('空 clue [] → 全 EMPTY', () => {
    const result = solveLine([], [U, U, U]);
    expect(result).toEqual([E, E, E]);
  });
  test('ゼロ行 [0] → 全 EMPTY', () => {
    const result = solveLine([0], [U, U, U]);
    expect(result).toEqual([E, E, E]);
  });
  test('既知 FILLED から推論補強', () => {
    // clue=[3] / n=5 で index 1 が FILLED 確定済 → 配置可能 = [F,F,F,_,_] と [_,F,F,F,_]
    // 両者の共通: index 1, 2 が FILLED 確定
    const result = solveLine([3], [U, F, U, U, U]);
    expect(result).toEqual([U, F, F, U, E]);
  });
  test('矛盾検出: clue=[3] / n=5, 既知 EMPTY だらけで配置不可', () => {
    // index 0..4 のうち 0, 4 が EMPTY 確定 → 配置 [F,F,F,_,_] や [_,_,F,F,F] は不可
    // 唯一 [_,F,F,F,_] のみ → 矛盾なし
    const result = solveLine([3], [E, U, U, U, E]);
    expect(result).toEqual([E, F, F, F, E]);
  });
  test('矛盾検出: clue=[3] / n=5 で index 1 と 3 が EMPTY → 解無し', () => {
    const result = solveLine([3], [U, E, U, E, U]);
    expect(result).toBeNull();
  });
});

describe('countLineSolutions', () => {
  test('clue=[3] / n=5 → 3 解', () => {
    expect(countLineSolutions([3], [U, U, U, U, U], 10)).toBe(3);
  });
  test('clue=[5] / n=5 → 1 解', () => {
    expect(countLineSolutions([5], [U, U, U, U, U], 10)).toBe(1);
  });
  test('一意性早期検出: limit=2 で 2 を超えない', () => {
    // clue=[1] / n=10 → 10 解あるが limit=2 で打ち切り
    expect(countLineSolutions([1], new Array(10).fill(U), 2)).toBe(2);
  });
  test('解無し', () => {
    expect(countLineSolutions([3], [E, E, E, E, E], 10)).toBe(0);
  });
});
