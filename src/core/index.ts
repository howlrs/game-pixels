// docs §14.1 core/: 物理、衝突、入力スナップショット、シード乱数 (DOM 非依存)。

export { snapToPixel, subPixelOffsetForRenderer } from './coords.ts';
export { createGameWorld, AABB, Position, Sprite, Velocity, MAX_ENTITIES } from './world.ts';
export type { GameWorld } from './world.ts';
export { PHYSICS_DT_MS, PHYSICS_HZ, MAX_FRAME_MS, createFixedStepLoop } from './loop.ts';
export type { FixedStepLoopConfig, FixedStepLoopHandle } from './loop.ts';
export { createInputBuffer } from './input/buffer.ts';
export type { InputBuffer, LogicalKey } from './input/buffer.ts';
export { NEUTRAL, deriveButtonState } from './input/snapshot.ts';
export type { InputSnapshot, ButtonState } from './input/snapshot.ts';
export {
  createPlayerState,
  stepPlayerInputAndVelocity,
  tickPlayerJumpBuffer,
  toPx,
  updatePlayerGroundState,
} from './physics/player.ts';
export type { PlayerPhysicsState } from './physics/player.ts';
export { resolveTileCollision } from './physics/tile-collision.ts';
export type { AabbBody, CollisionResult } from './physics/tile-collision.ts';
export { loadStage, tileAt, StageLoadError, validateCrossFields } from './stage/loader.ts';
export { StageSchema, TILE_KINDS, isTileKind } from './stage/schema.ts';
export type { Stage, StageArea, TileKind } from './stage/schema.ts';
