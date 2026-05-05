import { describe, expect, test } from 'bun:test';
import { assessSolution } from './index.ts';

describe('assessSolution — 既存 5x5 puzzles', () => {
  test('ハート → pass=true', () => {
    const heart: (0 | 1)[][] = [
      [0, 1, 0, 1, 0],
      [1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1],
      [0, 1, 1, 1, 0],
      [0, 0, 1, 0, 0],
    ];
    const r = assessSolution(heart);
    expect(r.pass).toBe(true);
    expect(r.reasons).toEqual([]);
    expect(r.solver.status).toBe('unique');
    expect(r.symmetry.horizontal).toBe(1);
  });

  test('ダイヤ → pass=true (全対称)', () => {
    const diamond: (0 | 1)[][] = [
      [0, 0, 1, 0, 0],
      [0, 1, 1, 1, 0],
      [1, 1, 1, 1, 1],
      [0, 1, 1, 1, 0],
      [0, 0, 1, 0, 0],
    ];
    const r = assessSolution(diamond);
    expect(r.pass).toBe(true);
    expect(r.symmetry.horizontal).toBe(1);
    expect(r.symmetry.vertical).toBe(1);
    expect(r.symmetry.point).toBe(1);
  });

  test('プラス → pass=true', () => {
    const plus: (0 | 1)[][] = [
      [0, 0, 1, 0, 0],
      [0, 0, 1, 0, 0],
      [1, 1, 1, 1, 1],
      [0, 0, 1, 0, 0],
      [0, 0, 1, 0, 0],
    ];
    const r = assessSolution(plus);
    expect(r.pass).toBe(true);
  });
});

describe('assessSolution — 不合格パターン', () => {
  test('多解 (チェッカー 2x2) → pass=false', () => {
    const checker: (0 | 1)[][] = [
      [0, 1],
      [1, 0],
    ];
    const r = assessSolution(checker);
    expect(r.pass).toBe(false);
    expect(r.reasons.some((s) => s.includes("status='multiple'"))).toBe(true);
  });

  test('薄すぎる (1 セルのみ) → pass=false', () => {
    const thin: (0 | 1)[][] = [
      [1, 0, 0, 0, 0],
      [0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0],
    ];
    const r = assessSolution(thin);
    expect(r.pass).toBe(false);
    expect(r.reasons.some((s) => s.includes('pixelRatio'))).toBe(true);
  });

  test('散らばりすぎ → pass=false', () => {
    // 5x5 に独立 5 セル
    const scattered: (0 | 1)[][] = [
      [1, 0, 1, 0, 1],
      [0, 0, 0, 0, 0],
      [1, 0, 1, 0, 0],
      [0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0],
    ];
    const r = assessSolution(scattered);
    expect(r.pass).toBe(false);
    // 5 components > 4 (デフォルト max)
    expect(r.reasons.some((s) => s.includes('components'))).toBe(true);
  });
});

describe('assessSolution — オプション緩和', () => {
  test('requireUnique=false で多解パズルも一部緩和できる', () => {
    const checker: (0 | 1)[][] = [
      [0, 1],
      [1, 0],
    ];
    const r = assessSolution(checker, {
      pass: { requireUnique: false, requireLogicallySolvable: false, minPixelRatio: 0 },
    });
    // 一意性チェックを緩和 + pixelRatio = 0.5 で OK + components=2 (max=4) で通過
    expect(r.pass).toBe(true);
  });
});
