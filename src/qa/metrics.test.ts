import { describe, expect, test } from 'bun:test';
import { computeSymmetry, computeVisibility } from './metrics.ts';

describe('computeVisibility', () => {
  test('全空盤面', () => {
    const v = computeVisibility([
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ]);
    expect(v.pixelRatio).toBe(0);
    expect(v.components).toBe(0);
    expect(v.boundingBox).toBeNull();
    expect(v.fillsBounds).toBe(0);
  });
  test('全塗盤面', () => {
    const v = computeVisibility([
      [1, 1],
      [1, 1],
    ]);
    expect(v.pixelRatio).toBe(1);
    expect(v.components).toBe(1);
    expect(v.fillsBounds).toBe(1);
    expect(v.boundingBox).toEqual({ minRow: 0, maxRow: 1, minCol: 0, maxCol: 1 });
  });
  test('独立した 2 セル → components=2', () => {
    const v = computeVisibility([
      [1, 0, 1],
      [0, 0, 0],
      [0, 0, 0],
    ]);
    expect(v.pixelRatio).toBeCloseTo(2 / 9);
    expect(v.components).toBe(2);
  });
  test('プラス記号 → components=1', () => {
    const v = computeVisibility([
      [0, 0, 1, 0, 0],
      [0, 0, 1, 0, 0],
      [1, 1, 1, 1, 1],
      [0, 0, 1, 0, 0],
      [0, 0, 1, 0, 0],
    ]);
    expect(v.components).toBe(1);
    expect(v.pixelRatio).toBeCloseTo(9 / 25);
  });
});

describe('computeSymmetry', () => {
  test('プラス → 全対称 1.0', () => {
    const sym = computeSymmetry([
      [0, 0, 1, 0, 0],
      [0, 0, 1, 0, 0],
      [1, 1, 1, 1, 1],
      [0, 0, 1, 0, 0],
      [0, 0, 1, 0, 0],
    ]);
    expect(sym.horizontal).toBe(1);
    expect(sym.vertical).toBe(1);
    expect(sym.point).toBe(1);
  });
  test('ハート → horizontal=1, vertical < 1', () => {
    const sym = computeSymmetry([
      [0, 1, 0, 1, 0],
      [1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1],
      [0, 1, 1, 1, 0],
      [0, 0, 1, 0, 0],
    ]);
    expect(sym.horizontal).toBe(1); // 左右対称
    expect(sym.vertical).toBeLessThan(1); // 上下非対称
  });
  test('完全非対称 (左上のみ塗り)', () => {
    const sym = computeSymmetry([
      [1, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ]);
    // 1 マスが対面の 0 と一致しない → match は (3*3 - 2 つの非一致) / 9
    // 横: (0,0)=1 vs (0,2)=0 不一致 / (0,2)=0 vs (0,0)=1 不一致 → 9-2=7
    expect(sym.horizontal).toBeCloseTo(7 / 9);
  });
});
