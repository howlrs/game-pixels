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

  // β10.0-α: viewport を root に適用 (scale + position)
  // root は createGridRenderer 内で生成された stage の唯一の子 (= boardRoot 相当)。
  // 描画後に毎回 boardRoot だけを変換することで、背景は世界座標、グリッドは zoom される。
  function applyViewport(): void {
    const vp = useGame.getState().viewport;
    renderer.setViewport(vp.scale, vp.panX, vp.panY);
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
    applyViewport();
  };
  const unsub = useGame.subscribe((next, prev) => {
    // 2026-05-07 / Gemini Pro deep 合議: 描画関連 state がいずれも未変化なら何もしない。
    // 旧コードは「viewport だけ変わった時の早期 return」しかなく、tickTimer による
    // elapsedMs の毎フレーム更新で subscribe が発火 → redraw() に到達 → grid.ts の
    // clear() が全 Container を destroy → 再生成する → GC スパイクと Pixi auto render の
    // タイミング競合で「黒と黒に近い色で点滅」する症状を引き起こしていた。
    //
    // 修正: 描画影響のある board / marks / cursor / phase / currentPuzzle / viewport の
    // どれも変化していなければ no-op。viewport だけ変わった時は applyViewport のみ。
    const drawableChanged =
      next.board !== prev.board ||
      next.marks !== prev.marks ||
      next.cursor !== prev.cursor ||
      next.phase !== prev.phase ||
      next.currentPuzzle !== prev.currentPuzzle;
    if (!drawableChanged) {
      if (next.viewport !== prev.viewport) applyViewport();
      // それ以外 (elapsedMs / mode / drag / history 等) は描画影響なし → no-op
      return;
    }
    redraw();
  });

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

  // タイマー (rAF で経過時間を加算)。
  // 2026-05-08: 120Hz / 高 fps ディスプレイ対策 (ユーザー指摘)。
  // 旧コードは app.ticker (rAF ベース) で毎フレーム tickTimer を呼んでいた。
  // 60Hz では 16.6ms 間隔だが 120Hz 端末では 8.3ms 間隔となり、tickTimer の
  // store set が 120 回/秒走り、subscribe コールバック数や React selector 評価が
  // 倍増する。Round 7-A 系のコンポジタバグ顕在化や CPU/GPU 競合の遠因になりうる。
  // 対策: 約 60Hz (16ms) を最小間隔として throttle。経過時間 (elapsedMs) は
  // throttle で実時間が積算されるため計時精度には影響しない。
  let tickerStart: number | null = null;
  let tickerAccumDt = 0;
  const TICK_FLUSH_MS = 16; // ≈ 60Hz cap
  app.ticker.add(() => {
    const now = performance.now();
    if (tickerStart === null) {
      tickerStart = now;
      return;
    }
    const dt = now - tickerStart;
    tickerStart = now;
    tickerAccumDt += dt;
    if (tickerAccumDt >= TICK_FLUSH_MS) {
      const flushed = tickerAccumDt;
      tickerAccumDt = 0;
      useGame.getState().tickTimer(flushed);
    }
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
    applyViewport();
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
