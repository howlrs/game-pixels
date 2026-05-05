// docs §14.2.1: bitECS の world と Components を定義する。
// bitECS 0.4.0 の新 API を使用 (createWorld, addEntity, addComponent, query)。
// Components は **TypedArray を直接確保** する形式 (公式 MIGRATION_GUIDE_0.4.0.md Option 2 推奨)。
// これにより決定論 (§14.5) と GC 削減 (§95.3.1) を実現する。

import { createWorld, type World } from 'bitecs';

/** entity の最大数 (Step B 暫定、UGC 拡張時に再検討 §14.2.1)。 */
export const MAX_ENTITIES = 4096;

/**
 * 位置 (subpixel 単位、§2.1 / §20.1.1)。
 * Int32Array により 32 bit 整数化が自動で行われ、決定論を構造的に守る。
 */
export const Position = {
  x: new Int32Array(MAX_ENTITIES),
  y: new Int32Array(MAX_ENTITIES),
};

/** 速度 (subpixel/frame、§2.2)。 */
export const Velocity = {
  x: new Int32Array(MAX_ENTITIES),
  y: new Int32Array(MAX_ENTITIES),
};

/**
 * 矩形当たり判定 (px 単位)。entity 中心からの half extent。
 */
export const AABB = {
  halfW: new Int32Array(MAX_ENTITIES),
  halfH: new Int32Array(MAX_ENTITIES),
};

/**
 * 描画用スプライト ID (将来 SpriteAtlas のキー番号などにマップ)。
 * 0 = なし、1〜 = アトラス内のスプライト index。
 */
export const Sprite = {
  id: new Uint16Array(MAX_ENTITIES),
};

export type GameWorld = World;

/** 新規 world の生成。各ステージ開始時に作り直す。 */
export function createGameWorld(): GameWorld {
  return createWorld();
}
