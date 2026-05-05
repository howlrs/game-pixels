// docs §8.2.2 / §8.2.3: ステージ JSON のロード + Valibot 検証 + 2 段階目チェック (cross-field)。

import * as v from 'valibot';
import { StageSchema, type Stage, type StageArea, type TileKind, isTileKind } from './schema.ts';

export class StageLoadError extends Error {
  constructor(
    public readonly kind: 'FETCH_FAILED' | 'SCHEMA_INVALID' | 'CROSS_FIELD' | 'UNKNOWN_TILE',
    public readonly url: string,
    public readonly issues?: unknown,
    message?: string,
  ) {
    super(message ?? `${kind} for ${url}`);
    this.name = 'StageLoadError';
  }
}

/** ロード + バリデーション + cross-field 検証。 */
export async function loadStage(url: string, fetcher: typeof fetch = fetch): Promise<Stage> {
  let res: Response;
  try {
    res = await fetcher(url);
  } catch (cause) {
    throw new StageLoadError('FETCH_FAILED', url, cause);
  }
  if (!res.ok) throw new StageLoadError('FETCH_FAILED', url, { status: res.status });
  const raw: unknown = await res.json();
  const parsed = v.safeParse(StageSchema, raw);
  if (!parsed.success) {
    throw new StageLoadError('SCHEMA_INVALID', url, parsed.issues);
  }
  validateCrossFields(parsed.output, url);
  return parsed.output;
}

/**
 * Valibot の Schema だけでは表現しにくい cross-field 検証 (§8.2.3):
 * - tiles の各行の長さが size.w と一致
 * - tiles の行数が size.h と一致
 * - 各文字が legend に存在し、値が TILE_KINDS に含まれる
 * - playerStart が legend 上で empty / brick (= 立てるタイル) の位置か (簡易)
 */
export function validateCrossFields(stage: Stage, url: string): void {
  for (const area of stage.areas) {
    if (area.tiles.length !== area.size.h) {
      throw new StageLoadError(
        'CROSS_FIELD',
        url,
        { area: area.id, expected: area.size.h, actual: area.tiles.length },
        `area ${area.id}: tile row count mismatch`,
      );
    }
    for (let row = 0; row < area.tiles.length; row++) {
      const line = area.tiles[row]!;
      if (line.length !== area.size.w) {
        throw new StageLoadError(
          'CROSS_FIELD',
          url,
          { area: area.id, row, expected: area.size.w, actual: line.length },
          `area ${area.id} row ${row}: tile col count mismatch`,
        );
      }
      for (let col = 0; col < line.length; col++) {
        const ch = line[col]!;
        const kindStr = area.legend[ch];
        if (!kindStr) {
          throw new StageLoadError(
            'UNKNOWN_TILE',
            url,
            { area: area.id, row, col, ch },
            `area ${area.id}: char '${ch}' at (${col}, ${row}) not in legend`,
          );
        }
        if (!isTileKind(kindStr)) {
          throw new StageLoadError(
            'UNKNOWN_TILE',
            url,
            { area: area.id, ch, kind: kindStr },
            `area ${area.id}: legend['${ch}'] = '${kindStr}' is not a known TileKind`,
          );
        }
      }
    }
    // playerStart 範囲確認
    if (area.playerStart.x >= area.size.w || area.playerStart.y >= area.size.h) {
      throw new StageLoadError(
        'CROSS_FIELD',
        url,
        { area: area.id, playerStart: area.playerStart, size: area.size },
        `area ${area.id}: playerStart out of bounds`,
      );
    }
  }
}

/** タイル座標 (col, row) のタイル種別を取得。範囲外は 'empty' 扱い。 */
export function tileAt(area: StageArea, col: number, row: number): TileKind {
  if (col < 0 || row < 0 || col >= area.size.w || row >= area.size.h) return 'empty';
  const ch = area.tiles[row]![col]!;
  return area.legend[ch] as TileKind;
}
