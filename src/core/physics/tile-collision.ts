// docs §30: タイルベース AABB 軸分離衝突 (MVP)。
// プレイヤーの移動を X/Y 別々に解決し、X 解決後の AABB をもとに Y 解決を行う (§30 軸分離 = ゴーストバーテックス対策)。
// MVP では「solid: ground/brick」「semi-solid: なし」「one-way: なし」の単純扱い。
// goal は衝突せず、接触判定のみ別 system で行う。

import type { StageArea } from '@core/stage/schema.ts';
import { tileAt } from '@core/stage/loader.ts';
import { SUBPIXEL } from './constants.ts';

export interface AabbBody {
  /** 中心 X (subpixel) */
  x: number;
  /** 中心 Y (subpixel) */
  y: number;
  /** half extent (px) */
  halfW: number;
  halfH: number;
  /** 速度 (subpixel/frame) — 衝突時に 0 にクリップする可能性あり */
  vx: number;
  vy: number;
}

export interface CollisionResult {
  hitLeft: boolean;
  hitRight: boolean;
  hitTop: boolean;
  hitBottom: boolean;
  /** ゴール (goal) タイルに重なった (接触開始フレームでも) */
  touchedGoal: boolean;
}

/** タイル種別が solid (壁/床として衝突する) か */
function isSolid(area: StageArea, col: number, row: number): boolean {
  const k = tileAt(area, col, row);
  return k === 'ground' || k === 'brick';
}

function isGoal(area: StageArea, col: number, row: number): boolean {
  return tileAt(area, col, row) === 'goal';
}

/** AABB と area のタイル群とで衝突解決を 1 frame 進める。X→Y の順。 */
export function resolveTileCollision(body: AabbBody, area: StageArea, tilePx: number): CollisionResult {
  const result: CollisionResult = {
    hitLeft: false,
    hitRight: false,
    hitTop: false,
    hitBottom: false,
    touchedGoal: false,
  };

  // ---- X 軸 ----
  body.x += body.vx;
  {
    // 負の座標で正しく床方向に丸めるため Math.floor を使う (Step D / Gemini Pro 指摘)。
    // | 0 はゼロ方向 truncate のため、x=-0.5 → 0 と誤判定する。
    const leftPx = Math.floor((body.x - body.halfW * SUBPIXEL) / SUBPIXEL);
    const rightPx = Math.floor((body.x + body.halfW * SUBPIXEL - 1) / SUBPIXEL);
    const topPx = Math.floor((body.y - body.halfH * SUBPIXEL) / SUBPIXEL);
    const bottomPx = Math.floor((body.y + body.halfH * SUBPIXEL - 1) / SUBPIXEL);
    const colLeft = Math.floor(leftPx / tilePx);
    const colRight = Math.floor(rightPx / tilePx);
    const rowTop = Math.floor(topPx / tilePx);
    const rowBottom = Math.floor(bottomPx / tilePx);

    if (body.vx > 0) {
      // 右移動 → colRight 列を確認、引っかかれば左に押し戻す
      for (let r = rowTop; r <= rowBottom; r++) {
        if (isSolid(area, colRight, r)) {
          const tileLeftSub = colRight * tilePx * SUBPIXEL;
          body.x = tileLeftSub - body.halfW * SUBPIXEL;
          body.vx = 0;
          result.hitRight = true;
          break;
        }
      }
    } else if (body.vx < 0) {
      for (let r = rowTop; r <= rowBottom; r++) {
        if (isSolid(area, colLeft, r)) {
          const tileRightSub = (colLeft + 1) * tilePx * SUBPIXEL;
          body.x = tileRightSub + body.halfW * SUBPIXEL;
          body.vx = 0;
          result.hitLeft = true;
          break;
        }
      }
    }
  }

  // ---- Y 軸 ----
  body.y += body.vy;
  {
    // 負の座標で正しく床方向に丸めるため Math.floor を使う (Step D / Gemini Pro 指摘)。
    // | 0 はゼロ方向 truncate のため、x=-0.5 → 0 と誤判定する。
    const leftPx = Math.floor((body.x - body.halfW * SUBPIXEL) / SUBPIXEL);
    const rightPx = Math.floor((body.x + body.halfW * SUBPIXEL - 1) / SUBPIXEL);
    const topPx = Math.floor((body.y - body.halfH * SUBPIXEL) / SUBPIXEL);
    const bottomPx = Math.floor((body.y + body.halfH * SUBPIXEL - 1) / SUBPIXEL);
    const colLeft = Math.floor(leftPx / tilePx);
    const colRight = Math.floor(rightPx / tilePx);
    const rowTop = Math.floor(topPx / tilePx);
    const rowBottom = Math.floor(bottomPx / tilePx);

    if (body.vy > 0) {
      // 下方向 → rowBottom 行を確認
      for (let c = colLeft; c <= colRight; c++) {
        if (isSolid(area, c, rowBottom)) {
          const tileTopSub = rowBottom * tilePx * SUBPIXEL;
          body.y = tileTopSub - body.halfH * SUBPIXEL;
          body.vy = 0;
          result.hitBottom = true;
          break;
        }
      }
    } else if (body.vy < 0) {
      for (let c = colLeft; c <= colRight; c++) {
        if (isSolid(area, c, rowTop)) {
          const tileBottomSub = (rowTop + 1) * tilePx * SUBPIXEL;
          body.y = tileBottomSub + body.halfH * SUBPIXEL;
          body.vy = 0;
          result.hitTop = true;
          break;
        }
      }
    }
  }

  // ---- ゴール接触 (重なりだけチェック、衝突解決はしない) ----
  {
    // 負の座標で正しく床方向に丸めるため Math.floor を使う (Step D / Gemini Pro 指摘)。
    // | 0 はゼロ方向 truncate のため、x=-0.5 → 0 と誤判定する。
    const leftPx = Math.floor((body.x - body.halfW * SUBPIXEL) / SUBPIXEL);
    const rightPx = Math.floor((body.x + body.halfW * SUBPIXEL - 1) / SUBPIXEL);
    const topPx = Math.floor((body.y - body.halfH * SUBPIXEL) / SUBPIXEL);
    const bottomPx = Math.floor((body.y + body.halfH * SUBPIXEL - 1) / SUBPIXEL);
    const colLeft = Math.floor(leftPx / tilePx);
    const colRight = Math.floor(rightPx / tilePx);
    const rowTop = Math.floor(topPx / tilePx);
    const rowBottom = Math.floor(bottomPx / tilePx);
    outer: for (let r = rowTop; r <= rowBottom; r++) {
      for (let c = colLeft; c <= colRight; c++) {
        if (isGoal(area, c, r)) {
          result.touchedGoal = true;
          break outer;
        }
      }
    }
  }

  return result;
}
