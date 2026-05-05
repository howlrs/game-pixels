// docs §20.2: SMB1 互換の物理定数 (subpixel/frame、Step C MVP のチューニング起点)。
// 本作は Web 向けに調整済み。値は §20.2.1 の表を起点に Step C で実機調整する。

/** 1 px = 16 subpixel (§2.1) */
export const SUBPIXEL_SHIFT = 4;
export const SUBPIXEL = 1 << SUBPIXEL_SHIFT; // = 16

/** 走り速度上限 (subpixel/frame, §20.2.1) — Run 保持時 */
export const RUN_MAX_VX = 40;
/** 歩き速度上限 (subpixel/frame) */
export const WALK_MAX_VX = 24;

/** 加速 (subpixel/frame の MoveForce 単位、§2.2.2)。簡易: フレームあたり加算 */
export const ACCEL = 2;
/** スキッド倍率 (進行方向と入力方向が逆) */
export const SKID_MULTIPLIER = 2;
/** 摩擦 (地上、入力なし) — 1 frame あたり |vx| を減らす量 */
export const GROUND_FRICTION = 1;

/** 重力 (subpixel/frame^2) — ジャンプボタン保持中 (低い = 高く飛ぶ) */
export const GRAVITY_HOLD = 4;
/** 重力 (ボタン解放後 / 落下中) */
export const GRAVITY_FALL = 7;
/** ジャンプ初速 (subpixel/frame, 上向き=負) */
export const JUMP_VY_INITIAL = -64;
/** 終速 (subpixel/frame) */
export const TERMINAL_VY = 64;

/** Coyote Time (frame, §2.2.6) */
export const COYOTE_FRAMES = 6;
/** Jump Buffer (frame, §2.2.6) */
export const JUMP_BUFFER_FRAMES = 6;
