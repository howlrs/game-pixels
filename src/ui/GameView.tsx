// docs §14.2.2 ハイブリッド + Gemini #1 申し送り (実装スケルトン PR #21):
// React ツリー内に Canvas コンテナ (<div>) を置き、その ref に Pixi.js Canvas を append する。
// React は ref の中身を一切触らないため、再レンダリングでも Canvas は破棄されない。
//
// 2026-05-06 / モバイル描画バグ対策 (Gemini Pro deep 合議):
// Android Chrome / iOS Safari で DOM の大幅な入れ替え (PuzzleSelect → playing への遷移) と
// WebGPU コンテキスト要求 (Pixi.js 初期化) が同タイミングで走ると、コンポジタが部分的に
// クラッシュ/合成停止し、直前フレーム (PuzzleSelect) が画面に張り付いたまま残る現象がある。
// 対策:
//   1. mountPixi を 1 フレーム以上遅延 (requestAnimationFrame) させ、DOM レイアウト確定後に
//      WebGPU 初期化を走らせる
//   2. mountPixi が reject した時にエラーが握り潰されないよう .catch を追加 (実機調査の手がかり)

import { useEffect, useRef } from 'react';
import { mountPixi, type GameHandle } from '@render/mount.ts';

interface Props {
  /** マウント完了時に呼ばれる。Vanilla 側 (物理ループ等) の起動はここから行う。 */
  onMounted?: (handle: GameHandle) => void;
}

export function GameView({ onMounted }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<GameHandle | null>(null);
  // onMounted 参照は ref で保持し、useEffect の依存から外す (Step A / Gemini Pro 指摘)。
  // 親側でインライン関数を渡されても Pixi.js が再マウントされない (= チラつき防止)。
  const onMountedRef = useRef(onMounted);
  onMountedRef.current = onMounted;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    let handle: GameHandle | null = null;

    // 2026-05-06: 2 フレーム待ってから WebGPU 初期化を走らせる。
    // - 1 frame 目: DOM レイアウト確定
    // - 2 frame 目: コンポジタが PuzzleSelect 等の旧 DOM を片付け終わるまで猶予
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      if (cancelled) return;
      raf2 = requestAnimationFrame(() => {
        if (cancelled) return;
        mountPixi(container)
          .then((h) => {
            if (cancelled) {
              h.destroy();
              return;
            }
            handle = h;
            handleRef.current = h;
            onMountedRef.current?.(h);
          })
          .catch((e) => {
            // モバイル実機で WebGPU/WebGL 初期化が失敗した場合の調査用ログ。
            // 握り潰すと canvas が出ないだけで原因が見えなくなる。
            console.error('[pixels] mountPixi failed:', e);
          });
      });
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
      handle?.destroy();
      handleRef.current = null;
    };
  }, []);

  return <div ref={containerRef} className="canvas-container" />;
}
