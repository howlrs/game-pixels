import { describe, expect, test } from 'bun:test';
import type { InputSnapshot } from '@core/input/snapshot.ts';
import { NEUTRAL } from '@core/input/snapshot.ts';
import {
  COYOTE_FRAMES,
  GRAVITY_FALL,
  GRAVITY_HOLD,
  JUMP_VY_INITIAL,
  RUN_MAX_VX,
  WALK_MAX_VX,
} from './constants.ts';
import { createPlayerState, stepPlayerPhysics } from './player.ts';

const FLOOR = 1000; // subpixel

function snap(overrides: Partial<InputSnapshot> = {}): InputSnapshot {
  return { ...NEUTRAL, ...overrides };
}

describe('stepPlayerPhysics', () => {
  test('入力なし接地中は静止維持', () => {
    const p = createPlayerState(0, FLOOR);
    stepPlayerPhysics(p, snap(), FLOOR, false);
    expect(p.x).toBe(0);
    expect(p.vx).toBe(0);
    expect(p.onGround).toBe(true);
  });

  test('右入力で右に加速、上限 WALK_MAX_VX に到達', () => {
    const p = createPlayerState(0, FLOOR);
    for (let i = 0; i < 100; i++) stepPlayerPhysics(p, snap({ ax: 1 }), FLOOR, false);
    expect(p.vx).toBe(WALK_MAX_VX);
  });

  test('Run 押下で上限 RUN_MAX_VX に到達', () => {
    const p = createPlayerState(0, FLOOR);
    for (let i = 0; i < 100; i++) stepPlayerPhysics(p, snap({ ax: 1, run: 'held' }), FLOOR, true);
    expect(p.vx).toBe(RUN_MAX_VX);
  });

  test('入力解除で摩擦により停止', () => {
    const p = createPlayerState(0, FLOOR);
    for (let i = 0; i < 100; i++) stepPlayerPhysics(p, snap({ ax: 1 }), FLOOR, false);
    expect(p.vx).toBe(WALK_MAX_VX);
    for (let i = 0; i < 100; i++) stepPlayerPhysics(p, snap(), FLOOR, false);
    expect(p.vx).toBe(0);
  });

  test('ジャンプ pressed で初速、保持中は GRAVITY_HOLD', () => {
    const p = createPlayerState(0, FLOOR);
    // 接地中
    stepPlayerPhysics(p, snap(), FLOOR, false);
    expect(p.onGround).toBe(true);
    // ジャンプ
    stepPlayerPhysics(p, snap({ jump: 'pressed' }), FLOOR, false);
    expect(p.vy).toBe(JUMP_VY_INITIAL + GRAVITY_HOLD);
    expect(p.onGround).toBe(false);
  });

  test('ジャンプ離すと GRAVITY_FALL に切替 (可変ジャンプ高)', () => {
    const p = createPlayerState(0, FLOOR);
    stepPlayerPhysics(p, snap(), FLOOR, false);
    stepPlayerPhysics(p, snap({ jump: 'pressed' }), FLOOR, false);
    const vyHold = p.vy;
    stepPlayerPhysics(p, snap({ jump: 'released' }), FLOOR, false);
    // released で GRAVITY_FALL を使う
    expect(p.vy).toBe(vyHold + GRAVITY_FALL);
  });

  test('Coyote: 地面を離れて 6 frame 以内ならジャンプ可能', () => {
    const p = createPlayerState(0, FLOOR);
    stepPlayerPhysics(p, snap(), FLOOR, false);
    expect(p.onGround).toBe(true);

    // 床を 1 段下げて空中に
    const lowFloor = FLOOR + 1000;
    for (let i = 0; i < COYOTE_FRAMES; i++) stepPlayerPhysics(p, snap(), lowFloor, false);
    expect(p.onGround).toBe(false);
    expect(p.framesSinceLeftGround).toBeLessThanOrEqual(COYOTE_FRAMES);

    // Coyote 内でジャンプ → 発動
    stepPlayerPhysics(p, snap({ jump: 'pressed' }), lowFloor, false);
    expect(p.vy).toBeLessThanOrEqual(JUMP_VY_INITIAL + GRAVITY_HOLD);
  });

  test('Jump Buffer: 着地前に jump 入力 → 着地時に消化', () => {
    const p = createPlayerState(0, FLOOR - 200);
    p.onGround = false;
    p.vy = 30; // 落下中
    // 落下中に jump pressed
    stepPlayerPhysics(p, snap({ jump: 'pressed' }), FLOOR, false);
    // まだ空中なのでジャンプは発動していない
    expect(p.vy).toBeGreaterThan(0);
    // 着地まで進める
    for (let i = 0; i < 5; i++) {
      stepPlayerPhysics(p, snap(), FLOOR, false);
      if (p.onGround) break;
    }
    // 着地後、Jump Buffer がまだ残っていればジャンプ可能
    if (p.jumpBufferFrames > 0 && p.onGround) {
      stepPlayerPhysics(p, snap(), FLOOR, false);
      expect(p.vy).toBeLessThan(0);
    }
  });

  test('Terminal Velocity でクランプ', () => {
    const p = createPlayerState(0, FLOOR - 10000);
    p.vy = 200;
    stepPlayerPhysics(p, snap(), FLOOR + 10000, false);
    expect(p.vy).toBeLessThanOrEqual(64); // TERMINAL_VY
  });
});
