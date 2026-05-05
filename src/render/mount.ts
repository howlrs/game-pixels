// docs §11.2 / §14.1: Pixi.js v8 を WebGPU 既定で初期化、Canvas を指定の DOM コンテナに append。
// 後続フェーズで GameLoop (§94.3 fixed time step) を組み込む。本 PR ではゲートと統合した「Hello マリオピクセル」段階。

import { Application, Text, TextStyle } from 'pixi.js';
import { useHud } from '@ui/hud-store.ts';
import { detectMobile } from '@platform/detect.ts';

const INTERNAL_W = 480;
const INTERNAL_H = 270;

export interface GameHandle {
  /** Tap to Start から呼ばれる。物理ループの開始など。 */
  start: () => void;
  /** ゲームの停止 + Pixi.js リソース解放。React unmount 時に呼ぶ。 */
  destroy: () => void;
}

export async function mountPixi(container: HTMLElement): Promise<GameHandle> {
  const app = new Application();

  await app.init({
    width: INTERNAL_W,
    height: INTERNAL_H,
    backgroundColor: 0x000000,
    antialias: false,
    preference: 'webgpu', // §11.2: WebGPU 既定 → WebGL2 → Canvas2D の段階フォールバック (Pixi.js v8 が自動)
    roundPixels: true,
  });

  container.appendChild(app.canvas);

  // 「Hello マリオピクセル」: 後続フェーズで実ゲームに置換
  const greeting = new Text({
    text: 'Hello マリオピクセル',
    style: new TextStyle({ fill: 0xffffff, fontSize: 16, fontFamily: 'monospace' }),
  });
  greeting.x = (INTERNAL_W - greeting.width) / 2;
  greeting.y = (INTERNAL_H - greeting.height) / 2;
  app.stage.addChild(greeting);

  // HUD store にレンダラ種別を Push (UI 表示)
  // app.renderer.type は数値 (1=WebGL, 2=WebGPU の場合あり)、name で文字列が取れる
  const rendererType = (app.renderer as { type: number; name?: string }).name ?? `type:${app.renderer.type}`;
  useHud.getState().setFrameSnapshot({ rendererType });

  console.info('[mario-pixel] mountPixi', {
    rendererType,
    device: detectMobile(),
    pixelRatio: window.devicePixelRatio,
    viewport: { w: window.innerWidth, h: window.innerHeight },
  });

  let started = false;
  let fpsAccumMs = 0;
  let fpsFrames = 0;

  const tick = () => {
    if (!started) return;
    const dtMs = app.ticker.deltaMS;
    fpsAccumMs += dtMs;
    fpsFrames += 1;
    if (fpsAccumMs >= 500) {
      const fps = (fpsFrames * 1000) / fpsAccumMs;
      useHud.getState().setFrameSnapshot({ fps });
      fpsAccumMs = 0;
      fpsFrames = 0;
    }
  };

  app.ticker.add(tick);

  return {
    start: () => {
      // 後続フェーズで物理ループ accumulator を起動。本 PR では FPS 計測のみ動かす。
      started = true;
    },
    destroy: () => {
      started = false;
      app.ticker.remove(tick);
      app.destroy(true, { children: true });
    },
  };
}
