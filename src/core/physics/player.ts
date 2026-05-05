// docs §20.2 / §2.2.4 / §2.2.6: プレイヤー物理 step。
// - 二段速度モデル: 入力方向に ACCEL ずつ加算、上限 ±MAX_VX、入力なしで GROUND_FRICTION 減衰
// - 可変ジャンプ高 (二重重力): jump 保持中は GRAVITY_HOLD、離した後 GRAVITY_FALL
// - Coyote Time / Jump Buffer
//
// Step D 以降は実タイル衝突に位置更新と衝突解決を任せる。本モジュールは「入力 → 速度更新」と
// 「衝突結果 (hitBottom) → 接地状態更新」を独立した関数として提供する。
//
// 流れ (呼び出し側):
//   1. stepPlayerInputAndVelocity(player, snapshot, running)  // vx/vy 更新
//   2. resolveTileCollision(body, area, tilePx)               // x/y 更新 + 衝突解決
//   3. updatePlayerGroundState(player, hitBottom)             // onGround / Coyote 更新
//   4. tickPlayerJumpBuffer(player)                            // jumpBuffer デクリメント

import type { InputSnapshot } from '@core/input/snapshot.ts';
import {
  ACCEL,
  COYOTE_FRAMES,
  GRAVITY_FALL,
  GRAVITY_HOLD,
  GROUND_FRICTION,
  JUMP_BUFFER_FRAMES,
  JUMP_VY_INITIAL,
  RUN_MAX_VX,
  SKID_MULTIPLIER,
  SUBPIXEL,
  TERMINAL_VY,
  WALK_MAX_VX,
} from './constants.ts';

export interface PlayerPhysicsState {
  /** position (subpixel) */
  x: number;
  y: number;
  /** velocity (subpixel/frame) */
  vx: number;
  vy: number;
  /** 接地中? */
  onGround: boolean;
  /** 直近に接地していたフレーム数 (Coyote 用)。地面を離れた瞬間にカウント開始 */
  framesSinceLeftGround: number;
  /** ジャンプ中フラグ (jump button を保持しているか)。可変ジャンプ高の二重重力切替に使う */
  jumpHeld: boolean;
  /** Jump Buffer: ジャンプ入力されてから残るフレーム数 */
  jumpBufferFrames: number;
}

export function createPlayerState(initialX: number, initialY: number): PlayerPhysicsState {
  return {
    x: initialX,
    y: initialY,
    vx: 0,
    vy: 0,
    onGround: false,
    framesSinceLeftGround: 1000,
    jumpHeld: false,
    jumpBufferFrames: 0,
  };
}

/** Step D 以降の構成: 入力反映 + 速度更新までを行い、位置更新と衝突解決は呼び出し側に任せる。 */
export function stepPlayerInputAndVelocity(
  player: PlayerPhysicsState,
  snapshot: InputSnapshot,
  running: boolean,
): void {
  // 横運動
  const maxVx = running ? RUN_MAX_VX : WALK_MAX_VX;
  if (snapshot.ax !== 0) {
    const inputDir = snapshot.ax;
    const skidding = player.vx !== 0 && Math.sign(player.vx) !== inputDir;
    const accel = ACCEL * (skidding ? SKID_MULTIPLIER : 1);
    player.vx += inputDir * accel;
  } else if (player.onGround) {
    if (player.vx > 0) player.vx = Math.max(0, player.vx - GROUND_FRICTION);
    else if (player.vx < 0) player.vx = Math.min(0, player.vx + GROUND_FRICTION);
  }
  if (player.vx > maxVx) player.vx = maxVx;
  else if (player.vx < -maxVx) player.vx = -maxVx;

  // ジャンプ入力
  if (snapshot.jump === 'pressed') {
    player.jumpBufferFrames = JUMP_BUFFER_FRAMES;
  }
  const canJump =
    player.jumpBufferFrames > 0 && (player.onGround || player.framesSinceLeftGround <= COYOTE_FRAMES);
  if (canJump) {
    player.vy = JUMP_VY_INITIAL;
    player.jumpHeld = true;
    player.jumpBufferFrames = 0;
    player.onGround = false;
    player.framesSinceLeftGround = 1000; // Coyote 不可 (再ジャンプ防止)
  }
  if (snapshot.jump === 'released' || snapshot.jump === 'up') {
    player.jumpHeld = false;
  }

  // 縦運動 (二重重力)
  const gravity = player.jumpHeld && player.vy < 0 ? GRAVITY_HOLD : GRAVITY_FALL;
  player.vy += gravity;
  if (player.vy > TERMINAL_VY) player.vy = TERMINAL_VY;
}

/** 衝突結果 (hitBottom) を見て、onGround / Coyote タイマーを更新する。 */
export function updatePlayerGroundState(player: PlayerPhysicsState, hitBottom: boolean): void {
  if (hitBottom) {
    if (!player.onGround) {
      player.onGround = true;
    }
    player.framesSinceLeftGround = 0;
  } else {
    if (player.onGround) {
      player.framesSinceLeftGround = 0;
      player.onGround = false;
    } else {
      player.framesSinceLeftGround += 1;
    }
  }
}

export function tickPlayerJumpBuffer(player: PlayerPhysicsState): void {
  if (player.jumpBufferFrames > 0) player.jumpBufferFrames -= 1;
}

/** 表示用に subpixel → px に丸める */
export function toPx(subpixel: number): number {
  return (subpixel / SUBPIXEL) | 0;
}
