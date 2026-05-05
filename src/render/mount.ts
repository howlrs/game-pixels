// docs §11.2 / §14.1 / §14.3 / §14.2.1 / §20.2 / §90 / §8.2.2:
// Step D: 最小ステージ (1-1) の Valibot ロード + タイル描画 + AABB タイル衝突 + ゴール接触判定。
// Step C のプレイヤー物理 (二段速度 / 二重重力 / Coyote / JumpBuffer) を実タイル衝突に統合。

import { addComponents, addEntity, deleteWorld } from 'bitecs';
import { Application, Graphics, Sprite as PixiSprite, type Texture } from 'pixi.js';
import { useHud } from '@ui/hud-store.ts';
import { detectMobile } from '@platform/detect.ts';
import {
  AABB,
  Position,
  Sprite as SpriteComp,
  Velocity,
  createGameWorld,
  type GameWorld,
} from '@core/world.ts';
import { PHYSICS_DT_MS, createFixedStepLoop } from '@core/loop.ts';
import { createInputBuffer } from '@core/input/buffer.ts';
import {
  createPlayerState,
  stepPlayerInputAndVelocity,
  tickPlayerJumpBuffer,
  updatePlayerGroundState,
  type PlayerPhysicsState,
} from '@core/physics/player.ts';
import { resolveTileCollision, type AabbBody } from '@core/physics/tile-collision.ts';
import { loadStage } from '@core/stage/loader.ts';
import type { Stage, StageArea } from '@core/stage/schema.ts';
import { attachKeyboard } from '@input/keyboard.ts';
import { renderTilemap, type RenderedTilemap } from './tilemap.ts';
import { renderSyncSystem, type SpriteRegistry } from '@game/index.ts';

const INTERNAL_W = 480;
const INTERNAL_H = 270;
const SUB = 16; // 1 px = 16 subpixel (§2.1)

export interface GameHandle {
  start: () => void;
  destroy: () => void;
}

export async function mountPixi(container: HTMLElement): Promise<GameHandle> {
  const app = new Application();

  await app.init({
    width: INTERNAL_W,
    height: INTERNAL_H,
    backgroundColor: 0x6b8cff, // 空色背景
    antialias: false,
    preference: 'webgpu',
    roundPixels: true,
  });

  container.appendChild(app.canvas);

  // ステージロード (§8.2.2 Schema-first)。失敗時は console + HUD に表示。
  let stage: Stage;
  try {
    stage = await loadStage('/stages/1-1.json');
  } catch (e) {
    console.error('[mario-pixel] stage load failed', e);
    return makeFailureHandle(app);
  }
  const area = stage.areas[0]!;
  const tilePx = stage.tileSize;

  // タイル描画
  const tilemap: RenderedTilemap = renderTilemap(app, area, tilePx);
  app.stage.addChild(tilemap.container);

  // bitECS world (Step E 以降で全 entity 管理に拡張)
  const world: GameWorld = createGameWorld();
  const sprites: SpriteRegistry = new Map();
  const ownedTextures: Texture[] = [];

  // 入力バッファ
  const inputBuffer = createInputBuffer();
  const detachKeyboard = attachKeyboard(inputBuffer);

  // プレイヤー entity 生成 (player の物理状態は別途 Vanilla で管理し、Position/Velocity に同期)
  const playerSize = 14; // 16px タイルより小さくして衝突に余裕
  const startX = (area.playerStart.x + 0.5) * tilePx * SUB;
  const startY = (area.playerStart.y + 0.5) * tilePx * SUB;
  const playerState: PlayerPhysicsState = createPlayerState(startX, startY);
  const playerEid = spawnSprite(app, world, sprites, ownedTextures, startX, startY, 0x55aaff, playerSize);

  // HUD にレンダラ種別 + ステージ名
  const rendererType = (app.renderer as { type: number; name?: string }).name ?? `type:${app.renderer.type}`;
  useHud.getState().setFrameSnapshot({ rendererType });
  console.info('[mario-pixel] mountPixi (Step D)', {
    rendererType,
    stageId: stage.id,
    areaId: area.id,
    device: detectMobile(),
    pixelRatio: window.devicePixelRatio,
    viewport: { w: window.innerWidth, h: window.innerHeight },
  });

  // ゴール到達フラグ
  let cleared = false;

  // 固定タイムステップループ
  const fixedLoop = createFixedStepLoop({
    physicsStep: () => {
      inputBuffer.beginFrame();
      const snap = inputBuffer.snapshot();
      const running = snap.run === 'pressed' || snap.run === 'held';

      if (!cleared) {
        // 1. 入力反映 + 速度更新
        stepPlayerInputAndVelocity(playerState, snap, running);

        // 2. 位置更新 + タイル衝突解決
        const body: AabbBody = {
          x: playerState.x,
          y: playerState.y,
          halfW: playerSize / 2,
          halfH: playerSize / 2,
          vx: playerState.vx,
          vy: playerState.vy,
        };
        const collision = resolveTileCollision(body, area, tilePx);
        playerState.x = body.x;
        playerState.y = body.y;
        playerState.vx = body.vx;
        playerState.vy = body.vy;

        // 3. 地面状態更新 (Coyote)
        updatePlayerGroundState(playerState, collision.hitBottom);

        // 4. JumpBuffer デクリメント
        tickPlayerJumpBuffer(playerState);

        // 5. ゴール接触
        if (collision.touchedGoal) {
          cleared = true;
          // HUD にスコア加算 (見せかけ): 残りタイマー × 50 (§8.3.1 SMB1 互換)
          const t = useHud.getState().timer;
          useHud.getState().setFrameSnapshot({ score: t * 50 });
          console.info('[mario-pixel] STAGE CLEAR!', { score: t * 50 });
        }
      }

      // bitECS Position/Velocity に同期 (描画用)
      Position.x[playerEid] = playerState.x;
      Position.y[playerEid] = playerState.y;
      Velocity.x[playerEid] = playerState.vx;
      Velocity.y[playerEid] = playerState.vy;
    },
    render: (_alpha) => {
      renderSyncSystem(world, sprites, app.stage, 0, 0, 1);
    },
  });

  let started = false;
  let fpsAccumMs = 0;
  let fpsFrames = 0;
  let updateAccumMs = 0;

  const onTick = () => {
    if (!started) return;
    const dtMs = app.ticker.deltaMS;
    fixedLoop.onFrame(dtMs);

    fpsAccumMs += dtMs;
    fpsFrames += 1;
    updateAccumMs += dtMs;
    if (fpsAccumMs >= 500) {
      const fps = (fpsFrames * 1000) / fpsAccumMs;
      useHud.getState().setFrameSnapshot({ fps });
      fpsAccumMs = 0;
      fpsFrames = 0;
    }
    if (updateAccumMs >= 1000 && !cleared) {
      const cur = useHud.getState().timer;
      if (cur > 0) useHud.getState().setFrameSnapshot({ timer: cur - 1 });
      updateAccumMs -= 1000;
    }
  };

  app.ticker.add(onTick);

  return {
    start: () => {
      started = true;
      fixedLoop.reset();
    },
    destroy: () => {
      started = false;
      app.ticker.remove(onTick);
      detachKeyboard();
      sprites.clear();
      tilemap.destroy();
      for (const tex of ownedTextures) tex.destroy(true);
      ownedTextures.length = 0;
      deleteWorld(world);
      app.destroy(true, { children: true, texture: true, textureSource: true });
    },
  };
}

function spawnSprite(
  app: Application,
  world: GameWorld,
  sprites: SpriteRegistry,
  ownedTextures: Texture[],
  xSub: number,
  ySub: number,
  color: number,
  size: number,
): number {
  const eid = addEntity(world);
  addComponents(world, eid, Position, Velocity, AABB, SpriteComp);
  Position.x[eid] = xSub | 0;
  Position.y[eid] = ySub | 0;
  Velocity.x[eid] = 0;
  Velocity.y[eid] = 0;
  AABB.halfW[eid] = (size / 2) | 0;
  AABB.halfH[eid] = (size / 2) | 0;
  SpriteComp.id[eid] = 1;

  const g = new Graphics().rect(0, 0, size, size).fill(color);
  const tex = app.renderer.generateTexture(g);
  g.destroy();
  ownedTextures.push(tex);
  const sprite = new PixiSprite(tex);
  sprite.anchor.set(0.5);
  app.stage.addChild(sprite);
  sprites.set(eid, sprite);
  return eid;
}

/** ステージロード失敗時のフォールバック handle (Pixi.js だけ生かして空表示)。 */
function makeFailureHandle(app: Application): GameHandle {
  const errText = document.createElement('div');
  errText.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);color:#fff;font:16px monospace';
  errText.textContent = 'ステージロード失敗 — console を確認してください';
  document.body.appendChild(errText);
  return {
    start: () => {},
    destroy: () => {
      errText.remove();
      app.destroy(true);
    },
  };
}

export { PHYSICS_DT_MS };
