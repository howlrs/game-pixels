import { describe, expect, test } from 'bun:test';
import { createInputBuffer } from './buffer.ts';

describe('InputBuffer', () => {
  test('beginFrame で snapshot が更新される', () => {
    const buf = createInputBuffer();
    buf.setKey('right', true);
    expect(buf.snapshot().ax).toBe(0); // beginFrame 前は変わらない
    buf.beginFrame();
    expect(buf.snapshot().ax).toBe(1);
  });

  test('Jump 押下 → pressed → held', () => {
    const buf = createInputBuffer();
    buf.setKey('jump', true);
    buf.beginFrame();
    expect(buf.snapshot().jump).toBe('pressed');
    buf.beginFrame(); // 同フレーム継続
    expect(buf.snapshot().jump).toBe('held');
  });

  test('Jump 離す → released → up', () => {
    const buf = createInputBuffer();
    buf.setKey('jump', true);
    buf.beginFrame();
    buf.setKey('jump', false);
    buf.beginFrame();
    expect(buf.snapshot().jump).toBe('released');
    buf.beginFrame();
    expect(buf.snapshot().jump).toBe('up');
  });

  test('左右同時押し → 後押し優先 (last input wins)', () => {
    const buf = createInputBuffer();
    buf.setKey('left', true);
    buf.markLastInputAt('left', 100);
    buf.setKey('right', true);
    buf.markLastInputAt('right', 200);
    buf.beginFrame();
    expect(buf.snapshot().ax).toBe(1); // 右が後

    // 左を押し直し
    buf.markLastInputAt('left', 300);
    buf.beginFrame();
    expect(buf.snapshot().ax).toBe(-1); // 左が後
  });

  test('reset で全ボタン解放', () => {
    const buf = createInputBuffer();
    buf.setKey('right', true);
    buf.setKey('jump', true);
    buf.beginFrame();
    buf.reset();
    buf.beginFrame();
    expect(buf.snapshot().ax).toBe(0);
    expect(buf.snapshot().jump).toBe('up');
  });

  test('1 frame 未満のタップ (押す→離す) も Latch で取りこぼさない', () => {
    const buf = createInputBuffer();
    // beginFrame と beginFrame の間にだけ発生する押下
    buf.setKey('jump', true);
    buf.setKey('jump', false);
    buf.beginFrame();
    expect(buf.snapshot().jump).toBe('pressed');
    // 次フレームは離されたまま → released
    buf.beginFrame();
    expect(buf.snapshot().jump).toBe('released');
  });

  test('Latch は beginFrame でリセットされ、長押し時の挙動を阻害しない', () => {
    const buf = createInputBuffer();
    buf.setKey('jump', true);
    buf.beginFrame();
    expect(buf.snapshot().jump).toBe('pressed');
    // 押しっぱなしの状態で次フレーム (Latch がクリアされても pressed は true なので held に)
    buf.beginFrame();
    expect(buf.snapshot().jump).toBe('held');
  });
});
