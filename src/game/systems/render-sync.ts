// docs §11.5.2 / §14.2.2: bitECS world の Position を Pixi.js Container 内の Sprite に同期する。
// 描画前に座標を整数化 (snapToPixel) して高 DPR シマリングを防ぐ。

import { query } from 'bitecs';
import type { Container, Sprite as PixiSprite } from 'pixi.js';
import { Position, Sprite, type GameWorld } from '@core/world.ts';
import { snapToPixel } from '@core/coords.ts';

/** entity ID → Pixi.js Sprite の対応表。Step B では呼び出し側で管理。 */
export type SpriteRegistry = Map<number, PixiSprite>;

/**
 * world の Position を Pixi.js Sprite に同期する。
 * @param world  bitECS world
 * @param sprites entity ID → Pixi.js Sprite のレジストリ
 * @param container 同期対象の Pixi.js Container (Stage や Layer)
 * @param cameraSubX / cameraSubY  カメラのサブピクセル座標 (Step B では 0 固定)
 * @param scale  内部解像度 → デバイス座標の倍率 (Step B では 1)
 */
export function renderSyncSystem(
  world: GameWorld,
  sprites: SpriteRegistry,
  _container: Container,
  cameraSubX: number,
  cameraSubY: number,
  scale: number,
): void {
  const ents = query(world, [Position, Sprite]);
  for (let i = 0; i < ents.length; i++) {
    const eid = ents[i]!;
    const sprite = sprites.get(eid);
    if (!sprite) continue;
    sprite.x = snapToPixel(Position.x[eid]!, cameraSubX, scale);
    sprite.y = snapToPixel(Position.y[eid]!, cameraSubY, scale);
  }
}
