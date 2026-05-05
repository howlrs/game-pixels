// docs §20.2: 物理 system (Step B 段階の最小実装)。
// position += velocity を SoA で全 entity に適用。
// 本格的な重力 / 衝突 / 可変ジャンプ高は Step C で実装する。

import { query } from 'bitecs';
import type { GameWorld } from '@core/world.ts';
import { Position, Velocity } from '@core/world.ts';

export function physicsSystem(world: GameWorld): void {
  // query で Position と Velocity を持つ entity を取得 (新 API)
  const ents = query(world, [Position, Velocity]);
  for (let i = 0; i < ents.length; i++) {
    const eid = ents[i]!;
    Position.x[eid]! += Velocity.x[eid]!;
    Position.y[eid]! += Velocity.y[eid]!;
  }
}
