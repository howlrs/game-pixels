import { describe, expect, test } from 'bun:test';
import { updateSettings, getSavedData } from './auto-save.ts';

// updateSettings は Bun テスト環境では globalThis.localStorage が存在しないので
// LocalStorageBackend.save() は warn ログを出すが saved 自身は更新される。
// (mountAutoSave をマウントせずに updateSettings だけ呼んでも内部 saved は更新される)

describe('updateSettings (β2.0-δ)', () => {
  test('audio.master を更新できる', () => {
    const before = getSavedData().settings.audio.master;
    const next = updateSettings({ audio: { master: 0.5 } });
    expect(next.audio.master).toBe(0.5);
    expect(getSavedData().settings.audio.master).toBe(0.5);
    // 復元
    updateSettings({ audio: { master: before } });
  });

  test('a11y.reduceMotion を更新できる + 他フィールドを破壊しない', () => {
    const beforeA11y = { ...getSavedData().settings.a11y };
    const beforeAudio = { ...getSavedData().settings.audio };
    const next = updateSettings({ a11y: { reduceMotion: true } });
    expect(next.a11y.reduceMotion).toBe(true);
    expect(next.a11y.highContrast).toBe(beforeA11y.highContrast);
    expect(next.audio).toEqual(beforeAudio);
    // 復元
    updateSettings({ a11y: { reduceMotion: beforeA11y.reduceMotion } });
  });

  test('部分更新が他のフィールドを保持', () => {
    const before = { ...getSavedData().settings.audio };
    const next = updateSettings({ audio: { se: 0.3 } });
    expect(next.audio.se).toBe(0.3);
    expect(next.audio.master).toBe(before.master); // 触らない
    updateSettings({ audio: { se: before.se } });
  });

  // mountAutoSave は document/localStorage 依存のため Bun テスト環境では検証外。
  // E2E (Playwright) で実機検証する。
});
