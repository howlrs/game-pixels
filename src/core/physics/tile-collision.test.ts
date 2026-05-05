import { describe, expect, test } from 'bun:test';
import type { StageArea } from '@core/stage/schema.ts';
import { resolveTileCollision, type AabbBody } from './tile-collision.ts';

const TILE = 16; // px
const SUB = 16;

function makeArea(rows: string[], legend: Record<string, string>): StageArea {
  return {
    id: 'a',
    size: { w: rows[0]!.length, h: rows.length },
    background: 'b',
    music: 'm',
    tiles: rows,
    legend,
    playerStart: { x: 0, y: 0 },
    triggers: [],
  };
}

describe('resolveTileCollision', () => {
  test('右移動: 壁に当たって vx=0 + hitRight', () => {
    const area = makeArea(['..B..'], { '.': 'empty', B: 'ground' });
    // タイル列 2 (32px-48px) が壁。プレイヤー halfW=4px、x=28px (右端 32px = タイル境界)、
    // vx = 1 px/frame = SUB/frame で 1 step 後に x=29px (右端 33px = 壁内 1px) → 押し戻し x=28px
    const body: AabbBody = { x: 28 * SUB, y: 8 * SUB, halfW: 4, halfH: 4, vx: SUB, vy: 0 };
    const r = resolveTileCollision(body, area, TILE);
    expect(r.hitRight).toBe(true);
    expect(body.vx).toBe(0);
    // 壁の左端 32px、プレイヤー中心 = 32 - halfW(4px) = 28px = 28*SUB subpixel
    expect(body.x).toBe(28 * SUB);
  });

  test('左移動: 壁に当たって vx=0 + hitLeft', () => {
    const area = makeArea(['B....'], { '.': 'empty', B: 'ground' });
    // タイル列 0 (0-16px) が壁。x=20px (左端 16px = 境界)、vx=-SUB で x=19px (左端 15px = 壁内)
    const body: AabbBody = { x: 20 * SUB, y: 8 * SUB, halfW: 4, halfH: 4, vx: -SUB, vy: 0 };
    const r = resolveTileCollision(body, area, TILE);
    expect(r.hitLeft).toBe(true);
    expect(body.vx).toBe(0);
    // 壁の右端 16px、プレイヤー中心 = 16 + halfW(4px) = 20px
    expect(body.x).toBe(20 * SUB);
  });

  test('下方向: 床に着地して vy=0 + hitBottom', () => {
    const area = makeArea(['.....', '.....', 'BBBBB'], { '.': 'empty', B: 'ground' });
    // 床 row=2 (32-48px)。プレイヤー halfH=4px、y=28px (下端 32px = 境界)、vy=SUB で y=29px (下端 33 = 壁内)
    const body: AabbBody = { x: 24 * SUB, y: 28 * SUB, halfW: 4, halfH: 4, vx: 0, vy: SUB };
    const r = resolveTileCollision(body, area, TILE);
    expect(r.hitBottom).toBe(true);
    expect(body.vy).toBe(0);
    // 床の上端 32px、プレイヤー中心 = 32 - halfH(4px) = 28px
    expect(body.y).toBe(28 * SUB);
  });

  test('ゴール接触で touchedGoal = true', () => {
    const area = makeArea(['..G..'], { '.': 'empty', G: 'goal' });
    // ゴール col=2 (32-48px) の中央 40px に置く
    const body: AabbBody = { x: 40 * SUB, y: 8 * SUB, halfW: 4, halfH: 4, vx: 0, vy: 0 };
    const r = resolveTileCollision(body, area, TILE);
    expect(r.touchedGoal).toBe(true);
  });

  test('何も無いところは衝突なし', () => {
    const area = makeArea(['.....'], { '.': 'empty' });
    const body: AabbBody = { x: 24 * SUB, y: 8 * SUB, halfW: 4, halfH: 4, vx: 5, vy: 5 };
    const r = resolveTileCollision(body, area, TILE);
    expect(r.hitLeft).toBe(false);
    expect(r.hitRight).toBe(false);
    expect(r.hitTop).toBe(false);
    expect(r.hitBottom).toBe(false);
    expect(body.x).toBe(24 * SUB + 5);
    expect(body.y).toBe(8 * SUB + 5);
  });
});
