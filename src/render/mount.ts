// docs §11.2 / §94: Pixi.js v8 を WebGPU 既定で初期化、grid renderer を装着し、
// Zustand store に subscribe して再描画する。

import { Application } from 'pixi.js';
import { useGame } from '@game/index.ts';
import { attachGridInput } from '@input/index.ts';
import { detectMobile } from '@platform/detect.ts';
import { createGridRenderer } from './grid.ts';

// β6.0-α: パズルサイズに応じて canvas 解像度を動的化 (Round 7-E Gemini deep 指摘 4 解消)。
// 5x5 は 480 で十分、25x25 は 1000 まで広げてヒント数字を読みやすく。
// app.renderer.resize() を puzzle 切替時に呼び、その後 redraw() で grid を再計算。
//
// 設計: puzzleSize → 内部解像度の単純関数 + 初期化時は中央値 720 で確保
// (パズル未ロード時の初期描画用、ロード時に必ず再計算される)。
const INITIAL_INTERNAL = 720;

function resolutionFor(maxDim: number): number {
  // ヒント数字を含む合計セル換算 ≈ maxDim + 余白 → 1 マス約 36px を狙う
  // 5x5 → 480, 10x10 → 600, 15x15 → 720, 25x25 → 1000
  if (maxDim <= 5) return 480;
  if (maxDim <= 10) return 600;
  if (maxDim <= 15) return 720;
  return 1000;
}

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
    width: INITIAL_INTERNAL,
    height: INITIAL_INTERNAL,
    backgroundColor: 0x101010,
    antialias: false,
    preference: 'webgpu',
    roundPixels: true,
  });
  container.appendChild(app.canvas);

  const renderer = createGridRenderer(app);
  const detachInput = attachGridInput(app, () => renderer.layout());

  // β6.0-α: パズル切替を検知して canvas 解像度を動的更新
  // Gemini 指摘: app.canvas.width は物理ピクセル (DPR×論理) なので比較は target 自体をキャッシュ
  let lastTargetResolution = INITIAL_INTERNAL;
  function ensureResolution(puzzle: { meta: { width: number; height: number } }): void {
    const target = resolutionFor(Math.max(puzzle.meta.width, puzzle.meta.height));
    if (target === lastTargetResolution) return;
    app.renderer.resize(target, target);
    lastTargetResolution = target;
  }

  // Zustand subscribe: 関連 state が変わったら redraw
  const redraw = (): void => {
    const s = useGame.getState();
    if (!s.currentPuzzle) return;
    ensureResolution(s.currentPuzzle);
    renderer.draw({
      board: s.board,
      puzzle: s.currentPuzzle,
      marks: s.marks,
      cursor: s.cursor,
      cleared: s.phase === 'cleared',
    });
  };
  const unsub = useGame.subscribe(() => redraw());

  // β4.0-β: body[data-high-contrast] 属性変化で盤面の色パレットも切替が必要
  // → MutationObserver で属性変化を検知して即時 redraw
  let observer: MutationObserver | null = null;
  if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined') {
    observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === 'attributes' && m.attributeName === 'data-high-contrast') {
          redraw();
          break;
        }
      }
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ['data-high-contrast'] });
  }

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
    ensureResolution(s.currentPuzzle);
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
      observer?.disconnect();
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
