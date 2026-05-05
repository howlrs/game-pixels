// docs §11.2 / §14.1 / §14.3 / §14.2.1 / §20.2 / §90:
// Pixi.js v8 + bitECS world + 固定タイムステップループ + プレイヤー物理 + 入力スナップショット の統合。
// Step C: 1 体のプレイヤーを Keyboard で操作 (左右 + ジャンプ)、画面下部の床で着地、可変ジャンプ高、Coyote/JumpBuffer。
// 実タイル衝突 (X 軸 / 任意床) は Step D で実装。

import { addComponents, addEntity, deleteWorld, query, type World } from 'bitecs';
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
import { createPlayerState, stepPlayerPhysics } from '@core/physics/player.ts';
import { attachKeyboard } from '@input/keyboard.ts';
import { physicsSystem, renderSyncSystem, type SpriteRegistry } from '@game/index.ts';

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
    backgroundColor: 0x102030,
    antialias: false,
    preference: 'webgpu',
    roundPixels: true,
  });

  container.appendChild(app.canvas);

  // bitECS world を作る
  const world: GameWorld = createGameWorld();
  const sprites: SpriteRegistry = new Map();
  // 動的生成したテクスチャは destroy 時に明示解放する (Step B / Gemini Pro 指摘 = Pixi.js のメモリリーク防止)。
  const ownedTextures: Texture[] = [];

  // 入力バッファ (Keyboard)
  const inputBuffer = createInputBuffer();
  const detachKeyboard = attachKeyboard(inputBuffer);

  // プレイヤー entity と物理状態
  const playerSize = 16; // px
  const halfPlayerSub = (playerSize / 2) * SUB;
  const groundY = (INTERNAL_H - 16) * SUB; // 床: 画面下端から 16px 上 (subpixel)
  const stageBounds = {
    minX: halfPlayerSub,
    maxX: INTERNAL_W * SUB - halfPlayerSub,
  };
  const playerState = createPlayerState((INTERNAL_W * SUB) / 2, groundY);
  const playerEid = spawnBox(
    app,
    world,
    sprites,
    ownedTextures,
    playerState.x,
    playerState.y,
    0x55aaff,
    playerSize,
  );

  // 床 (見せかけのライン)。本格的なタイルは Step D。
  const floor = new Graphics().rect(0, INTERNAL_H - 1, INTERNAL_W, 1).fill(0x88aacc);
  app.stage.addChild(floor);

  // レンダラ種別を HUD に流す
  const rendererType = (app.renderer as { type: number; name?: string }).name ?? `type:${app.renderer.type}`;
  useHud.getState().setFrameSnapshot({ rendererType });

  console.info('[mario-pixel] mountPixi', {
    rendererType,
    device: detectMobile(),
    pixelRatio: window.devicePixelRatio,
    viewport: { w: window.innerWidth, h: window.innerHeight },
  });

  // 固定タイムステップループ (§94.3): 物理 60Hz / 描画 rAF
  const fixedLoop = createFixedStepLoop({
    physicsStep: () => {
      // Step C: 物理 frame 開始時に入力スナップショットを確定 (§9.3 / §14.4)
      inputBuffer.beginFrame();
      const snap = inputBuffer.snapshot();
      const running = snap.run === 'pressed' || snap.run === 'held';
      stepPlayerPhysics(playerState, snap, groundY, running, stageBounds);
      // bitECS の Position/Velocity に同期 (描画用)
      Position.x[playerEid] = playerState.x;
      Position.y[playerEid] = playerState.y;
      Velocity.x[playerEid] = playerState.vx;
      Velocity.y[playerEid] = playerState.vy;
      // 他の entity (現状なし) を物理 system で進める
      physicsSystem(world);
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

    // FPS 計測 (§14.2.2 で UI に Push)
    fpsAccumMs += dtMs;
    fpsFrames += 1;
    updateAccumMs += dtMs;
    if (fpsAccumMs >= 500) {
      const fps = (fpsFrames * 1000) / fpsAccumMs;
      useHud.getState().setFrameSnapshot({ fps });
      fpsAccumMs = 0;
      fpsFrames = 0;
    }
    // タイマー更新 (見せかけ、1 秒で 1 減)。Step D の実ゲームロジックで置換予定。
    if (updateAccumMs >= 1000) {
      const cur = useHud.getState().timer;
      if (cur > 0) useHud.getState().setFrameSnapshot({ timer: cur - 1 });
      updateAccumMs -= 1000;
    }
  };

  app.ticker.add(onTick);

  return {
    start: () => {
      started = true;
      fixedLoop.reset(); // pause 復帰時の蓄積を破棄
    },
    destroy: () => {
      started = false;
      app.ticker.remove(onTick);
      detachKeyboard();
      sprites.clear();
      // Step B / Gemini Pro 指摘: 生成テクスチャと bitECS world を明示解放してメモリリークを防ぐ。
      // app.destroy はテクスチャを自動解放しないため、generateTexture したものは自前で destroy する。
      for (const tex of ownedTextures) tex.destroy(true);
      ownedTextures.length = 0;
      deleteWorld(world);
      // Pixi.js v8: app.destroy(removeView, opts) で children + textures + context を解放
      app.destroy(true, { children: true, texture: true, textureSource: true });
    },
  };
}

function spawnBox(
  app: Application,
  world: World,
  sprites: SpriteRegistry,
  ownedTextures: Texture[],
  xSub: number,
  ySub: number,
  color: number,
  size: number,
): number {
  const eid = addEntity(world);
  // bitECS 0.4.0 の addComponents は (world, eid, ...components) 形式
  addComponents(world, eid, Position, Velocity, AABB, SpriteComp);
  Position.x[eid] = xSub | 0;
  Position.y[eid] = ySub | 0;
  Velocity.x[eid] = 0;
  Velocity.y[eid] = 0;
  AABB.halfW[eid] = (size / 2) | 0;
  AABB.halfH[eid] = (size / 2) | 0;
  SpriteComp.id[eid] = 1;

  // Pixi.js sprite を生成 (テクスチャは矩形 Graphics → Texture で代用、Step D でアトラスに置換)
  const g = new Graphics().rect(0, 0, size, size).fill(color);
  const tex = app.renderer.generateTexture(g);
  g.destroy();
  ownedTextures.push(tex); // Step B / Gemini Pro 指摘: destroy 時の解放対象に登録
  const sprite = new PixiSprite(tex);
  sprite.anchor.set(0.5);
  app.stage.addChild(sprite);
  sprites.set(eid, sprite);
  return eid;
}

// PHYSICS_DT_MS は他モジュールでの参考用に再 export
export { PHYSICS_DT_MS };
