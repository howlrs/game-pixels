// docs §8.2.2 / §14.2.3: ステージ JSON の Valibot Schema-first バリデーション。
// MVP 段階では tiles は 2D 文字配列 + legend で簡易表現。Step E 以降で base64 LE u16 (§8.2.1) に拡張する。

import * as v from 'valibot';

const Pos = v.object({
  x: v.pipe(v.number(), v.integer(), v.minValue(0)),
  y: v.pipe(v.number(), v.integer(), v.minValue(0)),
});

const Area = v.object({
  id: v.pipe(v.string(), v.minLength(1)),
  size: v.object({
    w: v.pipe(v.number(), v.integer(), v.minValue(8), v.maxValue(8192)),
    h: v.pipe(v.number(), v.integer(), v.minValue(8), v.maxValue(64)),
  }),
  background: v.string(),
  music: v.string(),
  /** 2D 文字配列 (h 行 × w 文字)。各文字は legend キー。 */
  tiles: v.pipe(
    v.array(v.string()),
    v.minLength(1),
  ),
  /** 1 文字 → タイル種別名。 */
  legend: v.record(v.pipe(v.string(), v.length(1)), v.string()),
  playerStart: Pos,
  triggers: v.optional(v.array(v.unknown()), []), // MVP では Trigger は未対応
});

export const StageSchema = v.object({
  id: v.pipe(v.string(), v.regex(/^\d+-\d+$/)),
  name: v.string(),
  tileSize: v.pipe(v.number(), v.integer(), v.minValue(8), v.maxValue(64)),
  areas: v.pipe(v.array(Area), v.minLength(1)),
});

export type Stage = v.InferOutput<typeof StageSchema>;
export type StageArea = v.InferOutput<typeof Area>;

/**
 * タイル種別の MVP enum。
 * legend.value がここに無い場合はロード時に拒否する。
 */
export const TILE_KINDS = ['empty', 'ground', 'brick', 'goal'] as const;
export type TileKind = (typeof TILE_KINDS)[number];

export function isTileKind(s: string): s is TileKind {
  return (TILE_KINDS as readonly string[]).includes(s);
}
