// docs §11.2 / §94: Pixi.js v8 を WebGPU 既定で初期化、grid renderer を装着し、
// Zustand store に subscribe して再描画する。

import { Application } from 'pixi.js';
import { useGame } from '@game/index.ts';
import { attachGridInput } from '@input/index.ts';
import { detectMobile } from '@platform/detect.ts';
import { createGridRenderer } from './grid.ts';

// Round 7-E: 25x25 大型盤面でもヒント数字がはっきり読めるよう 720 に拡大
// (5x5 は CSS 側で contain スケーリングされるので問題なし)
//
// Gemini Pro deep 指摘 4 (将来課題): 5x5/10x10 では 720 は過剰な GPU 負荷。
// 理想は puzzle 切替時に app.renderer.resize() で動的化するが、
// Pixi.js v8 の resize は中身の Container 座標再計算が必要で複雑性増。
// 現状は固定 720 で許容 (モバイルでも 1MP 以下、Pixi.js が DPR 制御)。
const INTERNAL_W = 720;
const INTERNAL_H = 720;

export interface GameHandle {
  start: () => void;
  destroy: () => void;
  /**
   * Round 7-B: クリア時のセル回転アニメ。
   * App.tsx 側で phase 'cleared' に入ったタイミングで発火。完了後 onComplete が呼ばれる。
   */
  playClearAnimation: (onComplete: () => void) => void;
}

export async function mountPixi(container: HTMLElement): Promise<GameHandle> {
  const app = new Application();
  await app.init({
    width: INTERNAL_W,
    height: INTERNAL_H,
    backgroundColor: 0x101010,
    antialias: false,
    preference: 'webgpu',
    roundPixels: true,
  });
  container.appendChild(app.canvas);

  const renderer = createGridRenderer(app);
  const detachInput = attachGridInput(app, () => renderer.layout());

  // Zustand subscribe: 関連 state が変わったら redraw
  const unsub = useGame.subscribe((s) => {
    if (!s.currentPuzzle) return;
    renderer.draw({
      board: s.board,
      puzzle: s.currentPuzzle,
      marks: s.marks,
      cursor: s.cursor,
      cleared: s.phase === 'cleared',
    });
  });

  // タイマー (rAF で経過時間を加算)
  let tickerStart: number | null = null;
  app.ticker.add(() => {
    const now = performance.now();
    if (tickerStart === null) {
      tickerStart = now;
      return;
    }
    const dt = now - tickerStart;
    tickerStart = now;
    useGame.getState().tickTimer(dt);
  });

  const rendererName =
    (app.renderer as { type: number; name?: string }).name ?? `type:${app.renderer.type}`;
  console.info('[pixels] mountPixi', {
    renderer: rendererName,
    device: detectMobile(),
    pixelRatio: window.devicePixelRatio,
  });

  // 初期描画 (パズルが既にロード済の場合)
  const s = useGame.getState();
  if (s.currentPuzzle) {
    renderer.draw({
      board: s.board,
      puzzle: s.currentPuzzle,
      marks: s.marks,
      cursor: s.cursor,
      cleared: s.phase === 'cleared',
    });
  }

  return {
    start: () => {
      tickerStart = null;
    },
    destroy: () => {
      unsub();
      detachInput();
      renderer.destroy();
      app.destroy(true, { children: true, texture: true, textureSource: true });
    },
    playClearAnimation: (onComplete) => {
      const cs = useGame.getState();
      if (!cs.currentPuzzle) {
        // パズル未ロードでは即終了 (skip 時保証, Gemini deep 指摘)
        onComplete();
        return;
      }
      renderer.playClearAnimation(
        {
          board: cs.board,
          puzzle: cs.currentPuzzle,
          marks: cs.marks,
          cursor: cs.cursor,
          cleared: true,
        },
        onComplete,
      );
    },
  };
}
