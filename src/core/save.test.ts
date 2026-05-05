import { describe, expect, test } from 'bun:test';
import {
  CURRENT_SCHEMA_VERSION,
  InMemoryBackend,
  debounce,
  defaultSaveData,
  loadAndMigrate,
} from './save.ts';

describe('SaveBackend (InMemory)', () => {
  test('save → load 往復', () => {
    const b = new InMemoryBackend();
    const d = defaultSaveData();
    b.save(d);
    const loaded = b.load();
    expect(loaded?.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  test('clear で空に', () => {
    const b = new InMemoryBackend();
    b.save(defaultSaveData());
    b.clear();
    expect(b.load()).toBeNull();
  });
});

describe('loadAndMigrate', () => {
  test('空 backend → defaultSaveData', () => {
    const b = new InMemoryBackend();
    const d = loadAndMigrate(b);
    expect(d.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(Object.keys(d.activePuzzles).length).toBe(0);
  });

  test('valid データはそのまま返す', () => {
    const b = new InMemoryBackend();
    const orig = defaultSaveData();
    b.save(orig);
    const loaded = loadAndMigrate(b);
    expect(loaded.installedAt).toBe(orig.installedAt);
  });

  test('破損データはフェイルセーフで defaultSaveData に', () => {
    const b = new InMemoryBackend();
    // schema を満たさない不正データを直接突っ込む
    b.save({ schemaVersion: 1, activePuzzles: 'broken' } as never);
    const d = loadAndMigrate(b);
    expect(d.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(Object.keys(d.activePuzzles).length).toBe(0);
  });
});

describe('debounce', () => {
  test('連続呼び出しは最後の引数のみ実行 (timer 経由)', async () => {
    let called: number[] = [];
    const fn = debounce((n: number) => {
      called.push(n);
    }, 30);
    fn(1);
    fn(2);
    fn(3);
    await new Promise((r) => setTimeout(r, 50));
    expect(called).toEqual([3]);
  });

  test('flush で即時実行', () => {
    let called: number[] = [];
    const fn = debounce((n: number) => {
      called.push(n);
    }, 100);
    fn(1);
    fn(2);
    fn.flush();
    expect(called).toEqual([2]);
  });

  test('cancel で実行されない', async () => {
    let called: number[] = [];
    const fn = debounce((n: number) => {
      called.push(n);
    }, 30);
    fn(1);
    fn.cancel();
    await new Promise((r) => setTimeout(r, 50));
    expect(called).toEqual([]);
  });
});
