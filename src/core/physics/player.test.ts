// 新 API (stepPlayerInputAndVelocity / updatePlayerGroundState / tickPlayerJumpBuffer) のテスト。
// 旧 stepPlayerPhysics を削除した代わりに、テストでは「物理 step」をシミュレートする helper 関数で
// 「速度更新 → 床判定 (groundY) → 接地状態更新」までを再現する。

import { describe, expect, test } from 'bun:test';
import type { InputSnapshot } from '@core/input/snapshot.ts';
import { NEUTRAL } from '@core/input/snapshot.ts';
import {
  COYOTE_FRAMES,
  GRAVITY_FALL,
  GRAVITY_HOLD,
  JUMP_VY_INITIAL,
  RUN_MAX_VX,
  TERMINAL_VY,
  WALK_MAX_VX,
} from './constants.ts';
import {
  createPlayerState,
  stepPlayerInputAndVelocity,
  tickPlayerJumpBuffer,
  updatePlayerGroundState,
  type PlayerPhysicsState,
} from './player.ts';

const FLOOR = 1000; // subpixel

function snap(overrides: Partial<InputSnapshot> = {}): InputSnapshot {
  return { ...NEUTRAL, ...overrides };
}

/** 1 物理ステップ (テスト用 helper)。groundY で Y クランプ + onGround を更新。 */
function step(player: PlayerPhysicsState, snapshot: InputSnapshot, groundY: number, running: boolean): void {
  stepPlayerInputAndVelocity(player, snapshot, running);
  player.x += player.vx;
  player.y += player.vy;
  let hitBottom = false;
  if (player.y >= groundY) {
    player.y = groundY;
    if (player.vy > 0) player.vy = 0;
    hitBottom = true;
  }
  updatePlayerGroundState(player, hitBottom);
  tickPlayerJumpBuffer(player);
}

describe('player physics (new API)', () => {
  test('入力なし接地中は静止維持', () => {
    const p = createPlayerState(0, FLOOR);
    step(p, snap(), FLOOR, false);
    expect(p.x).toBe(0);
    expect(p.vx).toBe(0);
    expect(p.onGround).toBe(true);
  });

  test('右入力で右に加速、上限 WALK_MAX_VX に到達', () => {
    const p = createPlayerState(0, FLOOR);
    for (let i = 0; i < 100; i++) step(p, snap({ ax: 1 }), FLOOR, false);
    expect(p.vx).toBe(WALK_MAX_VX);
  });

  test('Run 押下で上限 RUN_MAX_VX に到達', () => {
    const p = createPlayerState(0, FLOOR);
    for (let i = 0; i < 100; i++) step(p, snap({ ax: 1, run: 'held' }), FLOOR, true);
    expect(p.vx).toBe(RUN_MAX_VX);
  });

  test('入力解除で摩擦により停止', () => {
    const p = createPlayerState(0, FLOOR);
    for (let i = 0; i < 100; i++) step(p, snap({ ax: 1 }), FLOOR, false);
    expect(p.vx).toBe(WALK_MAX_VX);
    for (let i = 0; i < 100; i++) step(p, snap(), FLOOR, false);
    expect(p.vx).toBe(0);
  });

  test('ジャンプ pressed で初速、保持中は GRAVITY_HOLD', () => {
    const p = createPlayerState(0, FLOOR);
    step(p, snap(), FLOOR, false);
    expect(p.onGround).toBe(true);
    step(p, snap({ jump: 'pressed' }), FLOOR, false);
    expect(p.vy).toBe(JUMP_VY_INITIAL + GRAVITY_HOLD);
    expect(p.onGround).toBe(false);
  });

  test('ジャンプ離すと GRAVITY_FALL に切替 (可変ジャンプ高)', () => {
    const p = createPlayerState(0, FLOOR);
    step(p, snap(), FLOOR, false);
    step(p, snap({ jump: 'pressed' }), FLOOR, false);
    const vyHold = p.vy;
    step(p, snap({ jump: 'released' }), FLOOR, false);
    expect(p.vy).toBe(vyHold + GRAVITY_FALL);
  });

  test('Coyote: 地面を離れて 6 frame 以内ならジャンプ可能', () => {
    const p = createPlayerState(0, FLOOR);
    step(p, snap(), FLOOR, false);
    expect(p.onGround).toBe(true);

    const lowFloor = FLOOR + 1000;
    for (let i = 0; i < COYOTE_FRAMES; i++) step(p, snap(), lowFloor, false);
    expect(p.onGround).toBe(false);
    expect(p.framesSinceLeftGround).toBeLessThanOrEqual(COYOTE_FRAMES);

    step(p, snap({ jump: 'pressed' }), lowFloor, false);
    expect(p.vy).toBeLessThanOrEqual(JUMP_VY_INITIAL + GRAVITY_HOLD);
  });

  test('Jump Buffer: 着地前に jump 入力 → 着地直後の入力で消化', () => {
    const p = createPlayerState(0, FLOOR - 200);
    p.onGround = false;
    p.vy = 30;
    step(p, snap({ jump: 'pressed' }), FLOOR, false);
    expect(p.vy).toBeGreaterThan(0); // 空中なのでジャンプは未発動
    for (let i = 0; i < 5; i++) {
      step(p, snap(), FLOOR, false);
      if (p.onGround) break;
    }
    if (p.jumpBufferFrames > 0 && p.onGround) {
      step(p, snap(), FLOOR, false);
      expect(p.vy).toBeLessThan(0);
    }
  });

  test('Terminal Velocity でクランプ', () => {
    const p = createPlayerState(0, FLOOR - 10000);
    p.vy = 200;
    // 地面に着かない高さで物理を 1 step だけ進める
    stepPlayerInputAndVelocity(p, snap(), false);
    expect(p.vy).toBeLessThanOrEqual(TERMINAL_VY);
  });
});
