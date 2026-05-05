import { describe, expect, test } from 'bun:test';
import {
  EMPTY,
  FILLED,
  X_MARKED,
  applyAt,
  computeProgress,
  createBoard,
  getCell,
  isCleared,
  resetBoard,
  setCell,
} from './board.ts';

describe('Board', () => {
  test('createBoard: 全セル empty', () => {
    const b = createBoard(3, 2);
    expect(b.width).toBe(3);
    expect(b.height).toBe(2);
    expect(b.cells.length).toBe(6);
    expect(b.cells.every((c) => c === EMPTY)).toBe(true);
  });

  test('setCell: 該当セルだけ変更、他は同参照保持', () => {
    const b1 = createBoard(3, 3);
    const b2 = setCell(b1, 1, 1, FILLED);
    expect(getCell(b2, 1, 1)).toBe(FILLED);
    expect(getCell(b2, 0, 0)).toBe(EMPTY);
    expect(b1).not.toBe(b2); // 別参照
    expect(b1.cells[4]).toBe(EMPTY); // 元は不変
  });

  test('setCell: 同じ値なら同参照を返す (再レンダリング抑止)', () => {
    const b1 = createBoard(3, 3);
    const b2 = setCell(b1, 1, 1, EMPTY);
    expect(b1).toBe(b2); // 同参照
  });

  test('resetBoard: 全セル empty', () => {
    let b = createBoard(2, 2);
    b = setCell(b, 0, 0, FILLED);
    b = setCell(b, 1, 1, X_MARKED);
    const r = resetBoard(b);
    expect(r.cells.every((c) => c === EMPTY)).toBe(true);
  });

  test('isCleared: 完全一致でのみ true', () => {
    const b = createBoard(2, 2);
    const sol: (0 | 1)[] = [1, 0, 0, 1];
    expect(isCleared(b, sol)).toBe(false);
    let b2 = setCell(b, 0, 0, FILLED);
    b2 = setCell(b2, 1, 1, FILLED);
    expect(isCleared(b2, sol)).toBe(true);
  });

  test('isCleared: × は空セル扱い (判定に影響しない)', () => {
    const b = createBoard(2, 2);
    const sol: (0 | 1)[] = [1, 0, 0, 1];
    let b2 = setCell(b, 0, 0, FILLED);
    b2 = setCell(b2, 0, 1, X_MARKED); // 空 (本来 0) に × をつけても OK
    b2 = setCell(b2, 1, 0, X_MARKED);
    b2 = setCell(b2, 1, 1, FILLED);
    expect(isCleared(b2, sol)).toBe(true);
  });

  test('applyAt: 起点セル属性保証 — 同じ状態のセルだけ変更', () => {
    let b = createBoard(3, 1);
    b = setCell(b, 0, 0, FILLED); // [F, E, E]
    // FILLED → X はスキップ (起点 EMPTY が違うから)
    const b2 = applyAt(b, 0, 0, EMPTY, X_MARKED);
    expect(getCell(b2, 0, 0)).toBe(FILLED); // 変更されない
    // EMPTY → X は適用される
    const b3 = applyAt(b, 1, 0, EMPTY, X_MARKED);
    expect(getCell(b3, 1, 0)).toBe(X_MARKED);
  });

  test('applyAt: 範囲外は no-op', () => {
    const b = createBoard(2, 2);
    expect(applyAt(b, -1, 0, EMPTY, FILLED)).toBe(b);
    expect(applyAt(b, 2, 0, EMPTY, FILLED)).toBe(b);
    expect(applyAt(b, 0, 5, EMPTY, FILLED)).toBe(b);
  });
});

describe('computeProgress (β3.0-γ)', () => {
  test('全空盤面 → ratio 0', () => {
    const b = createBoard(3, 3);
    const sol: (0 | 1)[][] = [
      [1, 0, 1],
      [0, 1, 0],
      [1, 0, 1],
    ];
    const p = computeProgress(b, sol);
    expect(p.completedRows).toBe(0);
    expect(p.completedCols).toBe(0);
    expect(p.totalRows).toBe(3);
    expect(p.totalCols).toBe(3);
    expect(p.ratio).toBe(0);
  });

  test('完全クリア → ratio 1', () => {
    let b = createBoard(2, 2);
    b = setCell(b, 0, 0, FILLED);
    b = setCell(b, 1, 1, FILLED);
    const sol: (0 | 1)[][] = [
      [1, 0],
      [0, 1],
    ];
    const p = computeProgress(b, sol);
    expect(p.completedRows).toBe(2);
    expect(p.completedCols).toBe(2);
    expect(p.ratio).toBe(1);
  });

  test('部分完成', () => {
    // 3x3, sol = 主対角線
    const sol: (0 | 1)[][] = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ];
    let b = createBoard(3, 3);
    b = setCell(b, 0, 0, FILLED); // 主対角の左上だけ完璧
    // この時点で row 0 と col 0 は完成 (FILLED + EMPTY×2 が正解と一致)
    const p = computeProgress(b, sol);
    expect(p.completedRows).toBeGreaterThanOrEqual(1);
    expect(p.completedCols).toBeGreaterThanOrEqual(1);
    expect(p.ratio).toBeGreaterThan(0);
    expect(p.ratio).toBeLessThan(1);
  });

  test('X_MARKED は EMPTY と同じ扱い', () => {
    let b = createBoard(2, 2);
    b = setCell(b, 0, 0, FILLED);
    b = setCell(b, 1, 0, X_MARKED);
    b = setCell(b, 0, 1, X_MARKED);
    b = setCell(b, 1, 1, FILLED);
    const sol: (0 | 1)[][] = [
      [1, 0],
      [0, 1],
    ];
    const p = computeProgress(b, sol);
    expect(p.ratio).toBe(1); // X は塗っていない扱いで一致
  });
});
