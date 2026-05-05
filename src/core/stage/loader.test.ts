import { describe, expect, test } from 'bun:test';
import { StageLoadError, loadStage, tileAt, validateCrossFields } from './loader.ts';
import type { Stage } from './schema.ts';

const VALID_STAGE: Stage = {
  id: '1-1',
  name: 'Test',
  tileSize: 16,
  areas: [
    {
      id: 'main',
      size: { w: 8, h: 8 },
      background: 'bg',
      music: 'm',
      tiles: [
        '........',
        '........',
        '........',
        '........',
        '........',
        '..G.....',
        '........',
        'BBBBBBBB',
      ],
      legend: { '.': 'empty', G: 'goal', B: 'ground' },
      playerStart: { x: 0, y: 6 },
      triggers: [],
    },
  ],
};

function fakeFetch(body: unknown, ok = true, status = 200) {
  return async (_url: string) =>
    new Response(JSON.stringify(body), { status, statusText: ok ? 'OK' : 'ERR' });
}

describe('loadStage', () => {
  test('valid JSON でロード成功', async () => {
    const stage = await loadStage('/stages/1-1.json', fakeFetch(VALID_STAGE) as unknown as typeof fetch);
    expect(stage.id).toBe('1-1');
    expect(stage.areas[0]!.size.w).toBe(8);
  });

  test('schema 違反 (id 形式不正) で SCHEMA_INVALID', async () => {
    const bad = { ...VALID_STAGE, id: 'bad' };
    await expect(loadStage('/x', fakeFetch(bad) as unknown as typeof fetch)).rejects.toMatchObject({
      kind: 'SCHEMA_INVALID',
    });
  });

  test('row 数不一致で CROSS_FIELD', async () => {
    const bad: Stage = JSON.parse(JSON.stringify(VALID_STAGE));
    bad.areas[0]!.size.h = 10; // tiles は 8 行のまま (schema OK だが cross-field で reject)
    await expect(loadStage('/x', fakeFetch(bad) as unknown as typeof fetch)).rejects.toMatchObject({
      kind: 'CROSS_FIELD',
    });
  });

  test('col 数不一致で CROSS_FIELD', async () => {
    const bad: Stage = JSON.parse(JSON.stringify(VALID_STAGE));
    bad.areas[0]!.tiles[0] = '...'; // 3 文字 (size.w=8 と不一致)
    await expect(loadStage('/x', fakeFetch(bad) as unknown as typeof fetch)).rejects.toMatchObject({
      kind: 'CROSS_FIELD',
    });
  });

  test('legend に無い文字で UNKNOWN_TILE', async () => {
    const bad: Stage = JSON.parse(JSON.stringify(VALID_STAGE));
    bad.areas[0]!.tiles[0] = 'X.......';
    await expect(loadStage('/x', fakeFetch(bad) as unknown as typeof fetch)).rejects.toMatchObject({
      kind: 'UNKNOWN_TILE',
    });
  });

  test('legend value が TileKind 外で UNKNOWN_TILE', async () => {
    const bad: Stage = JSON.parse(JSON.stringify(VALID_STAGE));
    (bad.areas[0]!.legend as Record<string, string>)['Y'] = 'unknown_kind';
    bad.areas[0]!.tiles[0] = 'Y.......';
    await expect(loadStage('/x', fakeFetch(bad) as unknown as typeof fetch)).rejects.toMatchObject({
      kind: 'UNKNOWN_TILE',
    });
  });

  test('fetch HTTP エラーで FETCH_FAILED', async () => {
    await expect(
      loadStage('/x', fakeFetch({}, false, 500) as unknown as typeof fetch),
    ).rejects.toMatchObject({ kind: 'FETCH_FAILED' });
  });

  test('playerStart が範囲外で CROSS_FIELD', async () => {
    const bad: Stage = JSON.parse(JSON.stringify(VALID_STAGE));
    bad.areas[0]!.playerStart = { x: 100, y: 100 };
    expect(() => validateCrossFields(bad, '/x')).toThrow(StageLoadError);
  });
});

describe('tileAt', () => {
  test('範囲内のタイル種別を返す', () => {
    const area = VALID_STAGE.areas[0]!;
    expect(tileAt(area, 0, 0)).toBe('empty');
    expect(tileAt(area, 2, 5)).toBe('goal'); // VALID_STAGE では (2, 5) が G
    expect(tileAt(area, 0, 7)).toBe('ground'); // 床 row=7
  });
  test('範囲外は empty', () => {
    const area = VALID_STAGE.areas[0]!;
    expect(tileAt(area, -1, 0)).toBe('empty');
    expect(tileAt(area, 100, 0)).toBe('empty');
    expect(tileAt(area, 0, 100)).toBe('empty');
  });
});
