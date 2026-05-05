// docs §14.2.2: React ルート。phase に応じて TapToStart / GameView (+HUD) / ResumeGate を切り替える。
// ゲーム本体 (Pixi.js + 物理ループ) は GameView の ref 経由で起動される。

import { useCallback, useEffect, useState } from 'react';
import { mountVisibilityHandler } from '@platform/visibility.ts';
import { isStandalone, mountInstallPromptCapture } from '@platform/install.ts';
import type { GameHandle } from '@render/mount.ts';
import { GameView } from './GameView.tsx';
import { Hud } from './Hud.tsx';
import { ResumeGate } from './ResumeGate.tsx';
import { TapToStartGate } from './TapToStartGate.tsx';
import { useHud } from './hud-store.ts';

export function App() {
  const phase = useHud((s) => s.phase);
  const [game, setGame] = useState<GameHandle | null>(null);

  useEffect(() => {
    // §92.3.2: visibilitychange を登録し、unmount 時に必ず解除 (Step A / Gemini Pro 指摘でリーク対策)。
    return mountVisibilityHandler();
  }, []);

  useEffect(() => {
    // §13.9.3 / §14.10.1: beforeinstallprompt を捕捉 (Chrome 系のみ)。
    // 実際の促進モーダル UI は Round 5 以降で実装。
    const detach = mountInstallPromptCapture();
    if (isStandalone()) {
      console.info('[install] running in PWA standalone mode');
    }
    return detach;
  }, []);

  const handleStart = useCallback(() => {
    // 将来: AudioContext.resume() (§12.3.1) を同期で呼ぶ
    game?.start();
  }, [game]);

  const handleResume = useCallback(() => {
    // 将来: AudioContext.resume() を同期で呼ぶ (§12.3.2)
    game?.start();
  }, [game]);

  // Canvas は phase に関係なく常時マウント (Tap-to-Start ゲートの裏で初期化)。
  // これにより最初のタップ後に即ゲームが動き始められる。
  return (
    <>
      <GameView onMounted={setGame} />
      {phase === 'playing' ? <Hud /> : null}
      {phase === 'tap-to-start' ? <TapToStartGate onStart={handleStart} /> : null}
      {phase === 'paused' ? <ResumeGate onResume={handleResume} /> : null}
    </>
  );
}
