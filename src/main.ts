// docs §14.1 main.ts: エントリ。
// 実装スケルトン段階では最小: Pixi.js v8 で WebGPU 既定 → WebGL2 → Canvas2D の段階フォールバック (§11.2) を初期化し、
// 「Hello マリオピクセル」を canvas に表示する。React 統合は次フェーズ。

import { Application, Text, TextStyle } from 'pixi.js';
import { detectMobile } from '@platform/detect.ts';
import { mountVisibilityHandler } from '@platform/visibility.ts';

const ROOT_ID = 'game-root';
const INTERNAL_W = 480;
const INTERNAL_H = 270;

async function bootstrap(): Promise<void> {
  const root = document.getElementById(ROOT_ID);
  if (!root) {
    console.error(`#${ROOT_ID} が見つかりません`);
    return;
  }

  const app = new Application();

  // Pixi.js v8: WebGPU 既定 → WebGL2 自動フォールバック (§11.2.1)
  // preference: 'webgpu' を指定すると WebGPU を試行、失敗時は WebGL2 にフォールバック
  await app.init({
    width: INTERNAL_W,
    height: INTERNAL_H,
    backgroundColor: 0x000000,
    antialias: false,
    preference: 'webgpu',
    // §11.5: nearest 既定 (CSS 側で image-rendering: pixelated と組み合わせる)
    roundPixels: true,
  });

  // canvas を root に挿入
  app.canvas.style.imageRendering = 'pixelated';
  app.canvas.style.maxWidth = '100%';
  app.canvas.style.maxHeight = '100%';
  app.canvas.style.objectFit = 'contain';
  root.appendChild(app.canvas);

  // 「Hello マリオピクセル」テキスト
  const style = new TextStyle({
    fill: 0xffffff,
    fontSize: 16,
    fontFamily: 'monospace',
  });
  const greeting = new Text({ text: 'Hello マリオピクセル', style });
  greeting.x = (INTERNAL_W - greeting.width) / 2;
  greeting.y = (INTERNAL_H - greeting.height) / 2;
  app.stage.addChild(greeting);

  // 環境情報を console に出す (実装着手前の確認用)
  // eslint-disable-next-line no-console
  console.info('[mario-pixel] skeleton bootstrap', {
    renderer: app.renderer.type, // 'webgpu' | 'webgl' | 'canvas' (PIXI.RendererType)
    device: detectMobile(),
    pixelRatio: window.devicePixelRatio,
    viewport: { w: window.innerWidth, h: window.innerHeight },
  });

  mountVisibilityHandler();
}

void bootstrap();
