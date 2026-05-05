// docs §20.2 / §2.2.4 / §2.2.6: プレイヤー物理 step (Step C MVP)。
// - 二段速度モデル (簡易): 入力方向に ACCEL ずつ加算、上限 ±MAX_VX、入力なしで GROUND_FRICTION 減衰
// - 可変ジャンプ高 (二重重力): jump 保持中は GRAVITY_HOLD、離した後 GRAVITY_FALL
// - Coyote Time / Jump Buffer
// - 静的床 (groundY) との Y 衝突のみ。X 衝突は Step D の実タイル衝突で扱う

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
  /** ジャンプボタンを離してから / ジャンプ中フラグ。ジャンプ消化済かどうか */
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

export interface StageBounds {
  /** ステージ X 範囲 (subpixel)。Step C 段階では画面端で clamp。Step D で実タイル衝突に置換 */
  minX: number;
  maxX: number;
}

/**
 * 1 物理ステップ。snapshot の入力で player を更新し、groundY (床の Y subpixel) で着地判定する。
 * groundY は player の中心 Y がそれ以上にならないように clamp される。
 * bounds 指定時は X もその範囲で clamp する (Step C / Gemini Pro 指摘で追加)。
 *
 * @param player ミューテートされる
 * @param snapshot 入力スナップショット
 * @param groundY 床の Y subpixel (床より上 = Y がそれ未満)
 * @param running Run ボタン押下時の最大速度に切替
 * @param bounds  X クランプ範囲 (省略時は無制限)
 */
export function stepPlayerPhysics(
  player: PlayerPhysicsState,
  snapshot: InputSnapshot,
  groundY: number,
  running: boolean,
  bounds?: StageBounds,
): void {
  // --- 横運動 ---
  const maxVx = running ? RUN_MAX_VX : WALK_MAX_VX;
  if (snapshot.ax !== 0) {
    const inputDir = snapshot.ax;
    const skidding = player.vx !== 0 && Math.sign(player.vx) !== inputDir;
    const accel = ACCEL * (skidding ? SKID_MULTIPLIER : 1);
    player.vx += inputDir * accel;
  } else if (player.onGround) {
    // 摩擦
    if (player.vx > 0) player.vx = Math.max(0, player.vx - GROUND_FRICTION);
    else if (player.vx < 0) player.vx = Math.min(0, player.vx + GROUND_FRICTION);
  }
  // 速度上限
  if (player.vx > maxVx) player.vx = maxVx;
  else if (player.vx < -maxVx) player.vx = -maxVx;

  // --- ジャンプ入力消化 ---
  if (snapshot.jump === 'pressed') {
    player.jumpBufferFrames = JUMP_BUFFER_FRAMES;
  }
  // Jump Buffer + (接地中 OR Coyote 時間内) でジャンプ発動
  const canJump =
    player.jumpBufferFrames > 0 && (player.onGround || player.framesSinceLeftGround <= COYOTE_FRAMES);
  if (canJump) {
    player.vy = JUMP_VY_INITIAL;
    player.jumpHeld = true;
    player.jumpBufferFrames = 0;
    player.onGround = false;
    player.framesSinceLeftGround = 1000; // Coyote 不可 (再ジャンプ防止)
  }
  // ジャンプボタンを離したら "jumpHeld=false" にして以降 GRAVITY_FALL を使う
  if (snapshot.jump === 'released' || snapshot.jump === 'up') {
    player.jumpHeld = false;
  }

  // --- 縦運動 (二重重力) ---
  const gravity = player.jumpHeld && player.vy < 0 ? GRAVITY_HOLD : GRAVITY_FALL;
  player.vy += gravity;
  if (player.vy > TERMINAL_VY) player.vy = TERMINAL_VY;

  // --- 位置更新 (Step C 簡易: X は壁衝突なし、Y は床のみ) ---
  player.x += player.vx;
  player.y += player.vy;

  // X クランプ (Step C / Gemini Pro 指摘: 画面外への見失い防止、Step D で実タイル衝突に置換)
  if (bounds) {
    if (player.x < bounds.minX) {
      player.x = bounds.minX;
      if (player.vx < 0) player.vx = 0;
    } else if (player.x > bounds.maxX) {
      player.x = bounds.maxX;
      if (player.vx > 0) player.vx = 0;
    }
  }

  // 床判定 (Step D で実タイル衝突に置換)
  if (player.y >= groundY) {
    player.y = groundY;
    if (player.vy > 0) player.vy = 0;
    if (!player.onGround) {
      player.onGround = true;
    }
    player.framesSinceLeftGround = 0;
  } else {
    if (player.onGround) {
      // 地面を離れた瞬間: Coyote 開始
      player.framesSinceLeftGround = 0;
      player.onGround = false;
    } else {
      player.framesSinceLeftGround += 1;
    }
  }

  // Jump Buffer のデクリメント
  if (player.jumpBufferFrames > 0) player.jumpBufferFrames -= 1;
}

/** 表示用に subpixel → px に丸める */
export function toPx(subpixel: number): number {
  return (subpixel / SUBPIXEL) | 0;
}
