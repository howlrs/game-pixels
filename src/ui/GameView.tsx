// docs §14.2.2 ハイブリッド + Gemini #1 申し送り (実装スケルトン PR #21):
// React ツリー内に Canvas コンテナ (<div>) を置き、その ref に Pixi.js Canvas を append する。
// React は ref の中身を一切触らないため、再レンダリングでも Canvas は破棄されない。

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

    void mountPixi(container).then((h) => {
      if (cancelled) {
        h.destroy();
        return;
      }
      handle = h;
      handleRef.current = h;
      onMountedRef.current?.(h);
    });

    return () => {
      cancelled = true;
      handle?.destroy();
      handleRef.current = null;
    };
  }, []);

  return <div ref={containerRef} className="canvas-container" />;
}
