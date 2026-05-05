// docs §14.8: bun test (内蔵ランナー) で動作確認用の smoke test。
// 物理→描画の整数化 (§11.5.1, §17.14 I) が正しく動くかを最低限担保する。

import { describe, expect, test } from 'bun:test';
import { snapToPixel, subPixelOffsetForRenderer } from './coords.ts';

describe('snapToPixel', () => {
  test('subpixel 0 / camera 0 / scale 1 → 0', () => {
    expect(snapToPixel(0, 0, 1)).toBe(0);
  });

  test('subpixel 16 (=1px) / camera 0 / scale 1 → 1', () => {
    expect(snapToPixel(16, 0, 1)).toBe(1);
  });

  test('subpixel 24 (=1.5px) / camera 0 / scale 1 → 1 (整数化で切り捨て)', () => {
    // (24 >> 4) = 1, (1 * 1) | 0 = 1
    expect(snapToPixel(24, 0, 1)).toBe(1);
  });

  test('camera を加味して負方向もサポート', () => {
    expect(snapToPixel(160, 80, 2)).toBe(10); // (160-80)>>4 = 5, * 2 = 10
  });

  test('scale 2 で整数倍スケールのピクセル境界に乗る', () => {
    expect(snapToPixel(48, 0, 2)).toBe(6); // 48>>4=3, 3*2=6
  });
});

describe('subPixelOffsetForRenderer', () => {
  test('nearestMode=true は整数化される', () => {
    // (160 - 0) / 16 = 10.0, * 2 = 20.0, | 0 = 20
    expect(subPixelOffsetForRenderer(160, 0, 2, true)).toBe(20);
  });

  test('nearestMode=false は小数を保持する (モダンモード)', () => {
    // (24 - 0) / 16 = 1.5, * 2 = 3.0
    expect(subPixelOffsetForRenderer(24, 0, 2, false)).toBe(3.0);
    // (40 - 0) / 16 = 2.5, * 2 = 5.0
    expect(subPixelOffsetForRenderer(40, 0, 2, false)).toBe(5.0);
  });
});
