// β11.0-α: BGM モジュールのユニットテスト。
// jsdom 環境では実 AudioContext/OscillatorNode が無いため、構造的テストのみ:
//   - 状態遷移 (enabled / volume / muted) の getter/setter 整合
//   - AudioContext 未接続時の no-op 性 (例外を投げないこと)

import { afterEach, describe, expect, test } from 'bun:test';
import {
  _getBgmState,
  _resetBgmForTest,
  setBgmEnabled,
  setBgmMaster,
  setBgmMuted,
  setBgmVolume,
  startBgm,
  stopBgm,
} from './bgm.ts';

afterEach(() => {
  _resetBgmForTest();
});

describe('bgm', () => {
  test('初期状態: enabled=false, volume=0.5, muted=false, isPlaying=false', () => {
    const s = _getBgmState();
    expect(s.enabled).toBe(false);
    expect(s.volume).toBe(0.5);
    expect(s.master).toBe(0.7);
    expect(s.muted).toBe(false);
    expect(s.isPlaying).toBe(false);
  });

  test('setBgmEnabled(true) で enabled が true になる', () => {
    setBgmEnabled(true);
    expect(_getBgmState().enabled).toBe(true);
    setBgmEnabled(false);
    expect(_getBgmState().enabled).toBe(false);
  });

  test('setBgmVolume は 0..1 にクランプ', () => {
    setBgmVolume(1.5);
    expect(_getBgmState().volume).toBe(1);
    setBgmVolume(-0.3);
    expect(_getBgmState().volume).toBe(0);
    setBgmVolume(0.42);
    expect(_getBgmState().volume).toBeCloseTo(0.42);
  });

  test('setBgmMaster で master が更新', () => {
    setBgmMaster(0.3);
    expect(_getBgmState().master).toBeCloseTo(0.3);
  });

  test('setBgmMuted で muted が反転', () => {
    setBgmMuted(true);
    expect(_getBgmState().muted).toBe(true);
    setBgmMuted(false);
    expect(_getBgmState().muted).toBe(false);
  });

  test('AudioContext 未接続で startBgm/stopBgm は例外を投げない', async () => {
    // attachAudioContext を呼ばないので ctx は null
    setBgmEnabled(true);
    await startBgm();
    expect(_getBgmState().isPlaying).toBe(false);
    stopBgm(); // no-op
    expect(_getBgmState().isPlaying).toBe(false);
  });

  test('AudioContext 未接続で setBgmEnabled(true) しても isPlaying=false', async () => {
    setBgmEnabled(true);
    // setBgmEnabled が内部で startBgm を呼ぶが ctx 無いので no-op
    await new Promise((r) => setTimeout(r, 0));
    expect(_getBgmState().isPlaying).toBe(false);
  });
});
