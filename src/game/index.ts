// docs §14.1 game/: ゲームロジック (プレイヤー, 敵, アイテム, ワールド) — core 依存。

export { physicsSystem } from './systems/physics.ts';
export { renderSyncSystem, type SpriteRegistry } from './systems/render-sync.ts';
