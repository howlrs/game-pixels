// docs §14.2.2 App: phase 駆動で TapToStart / PuzzleSelect / GameView (+HUD/Modes/Clear) を切り替え。

import { useCallback, useEffect, useState } from 'react';
import { mountVisibilityHandler } from '@platform/visibility.ts';
import { isStandalone, mountInstallPromptCapture } from '@platform/install.ts';
import { mountAutoSave, recordClear } from '@save/index.ts';
import { useGame } from '@game/index.ts';
import type { GameHandle } from '@render/index.ts';
import { ClearOverlay } from './ClearOverlay.tsx';
import { GameView } from './GameView.tsx';
import { Hud } from './Hud.tsx';
import { ModeButtons } from './ModeButtons.tsx';
import { PuzzleSelect } from './PuzzleSelect.tsx';
import { TapToStartGate } from './TapToStartGate.tsx';

export function App() {
  const phase = useGame((s) => s.phase);
  const setPhase = useGame((s) => s.setPhase);
  const [_game, setGame] = useState<GameHandle | null>(null);

  useEffect(() => {
    return mountVisibilityHandler();
  }, []);

  useEffect(() => {
    const detach = mountInstallPromptCapture();
    if (isStandalone()) {
      console.info('[install] running in PWA standalone mode');
    }
    return detach;
  }, []);

  // Round 6 / Gemini Pro 指摘: autosave 結合 (LocalStorage への debounced save + visibilitychange flush)
  useEffect(() => {
    return mountAutoSave();
  }, []);

  // クリア時にベストタイム記録 (cleared phase に遷移した瞬間のみ)
  useEffect(() => {
    if (phase !== 'cleared') return;
    const s = useGame.getState();
    if (s.currentPuzzle) {
      recordClear(s.currentPuzzle.meta.id, s.elapsedMs);
    }
  }, [phase]);

  const handleStart = useCallback(() => {
    setPhase('puzzle-select');
  }, [setPhase]);

  const handlePuzzleLoaded = useCallback(() => {
    // GameStore.loadPuzzle が phase='playing' に遷移済
  }, []);

  const handleReturnToSelect = useCallback(() => {
    setPhase('puzzle-select');
  }, [setPhase]);

  // GameView は playing / paused / cleared の間だけマウント
  const showGameView = phase === 'playing' || phase === 'paused' || phase === 'cleared';

  return (
    <>
      {showGameView ? <GameView onMounted={setGame} /> : null}
      {showGameView ? <Hud /> : null}
      {showGameView ? <ModeButtons /> : null}
      {phase === 'tap-to-start' ? <TapToStartGate onStart={handleStart} /> : null}
      {phase === 'puzzle-select' ? <PuzzleSelect onLoaded={handlePuzzleLoaded} /> : null}
      {phase === 'cleared' ? <ClearOverlay onReturn={handleReturnToSelect} /> : null}
    </>
  );
}
