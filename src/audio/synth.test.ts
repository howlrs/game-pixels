import { describe, expect, test } from 'bun:test';
import { _resetForTest, isMuted, playSe, setMuted, setVolume } from './synth.ts';

// Bun のテスト環境には AudioContext が無いので、playSe は no-op になる。
// API の呼び出しと state 管理だけを検証する。

describe('synth — mute / volume', () => {
  test('isMuted デフォルト false', () => {
    _resetForTest();
    expect(isMuted()).toBe(false);
  });

  test('setMuted で状態が反映される', () => {
    _resetForTest();
    setMuted(true);
    expect(isMuted()).toBe(true);
    setMuted(false);
    expect(isMuted()).toBe(false);
  });

  test('setVolume は 0..1 にクランプ + master/se 部分指定可', () => {
    _resetForTest();
    // 範囲外でもクラッシュしない (内部 clamp01)
    expect(() => setVolume({ master: 2 })).not.toThrow();
    expect(() => setVolume({ se: -1 })).not.toThrow();
    expect(() => setVolume({})).not.toThrow();
  });

  test('playSe は AudioContext 無しで例外を出さない', () => {
    _resetForTest();
    expect(() => playSe('fill')).not.toThrow();
    expect(() => playSe('mark')).not.toThrow();
    expect(() => playSe('erase')).not.toThrow();
    expect(() => playSe('line-complete')).not.toThrow();
    expect(() => playSe('clear')).not.toThrow();
  });

  test('mute 中は playSe が no-op (例外なし)', () => {
    _resetForTest();
    setMuted(true);
    expect(() => playSe('fill')).not.toThrow();
  });
});
