// docs §14.2.2 / Round 7-A: App は phase 駆動で
// TapToStart / PuzzleSelect / GameView (+HUD/Modes/ClearOverlay) / ResultsPage を切り替える。
//
// 遷移フロー (Round 7-A):
//   tap-to-start → puzzle-select → playing → cleared (1.5s overlay)
//                                          → results (総評ページ)
//                                          → puzzle-select (戻る)
//
// Round 7-A / Gemini Pro deep 指摘 (実機空白バグ修正):
// Pixi.js v8 WebGPU Canvas を DOM からアンマウントすると Windows Chrome のコンポジタが
// クラッシュし、DOM 上の他要素 (ResultsPage 等) も真っ白になる既知現象がある。
// 対策: GameView は常時マウントしたまま、display:none で見せ消えする。
// 副次効果: Hud / ModeButtons / ClearOverlay も同じ canvas-related ライフサイクルに依存するため
// 表示制御を一貫して CSS ベースで行う (unmount に伴う再初期化コストもゼロ)。

import { useCallback, useEffect, useRef, useState } from 'react';
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
import { ResultsPage } from './ResultsPage.tsx';
import { TapToStartGate } from './TapToStartGate.tsx';

export function App() {
  const phase = useGame((s) => s.phase);
  const setPhase = useGame((s) => s.setPhase);
  const [_game, setGame] = useState<GameHandle | null>(null);
  // クリア瞬間のタイムを保持し、ResultsPage の NEW! 判定に使う (Gemini 指摘 ②)
  const lastClearWasNewBestRef = useRef<boolean>(false);

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
      // 記録更新前に「今回のタイムが過去ベストより速いか」を確定させる (Gemini 指摘 ②)
      const prevBest = recordClear(s.currentPuzzle.meta.id, s.elapsedMs);
      lastClearWasNewBestRef.current = prevBest === null || s.elapsedMs < prevBest;
    }
  }, [phase]);

  const handleStart = useCallback(() => {
    setPhase('puzzle-select');
  }, [setPhase]);

  const handlePuzzleLoaded = useCallback(() => {
    // GameStore.loadPuzzle が phase='playing' に遷移済
  }, []);

  const handleAdvanceToResults = useCallback(() => {
    setPhase('results');
  }, [setPhase]);

  const handleReturnToSelect = useCallback(() => {
    setPhase('puzzle-select');
  }, [setPhase]);

  // 旧来の null マウント/アンマウントは Windows Chrome WebGPU で空白バグを引き起こすため、
  // GameView / Hud / ModeButtons は常時マウントし、display:none で見せ消えする。
  const showGameView = phase === 'playing' || phase === 'paused' || phase === 'cleared';

  return (
    <>
      <div style={{ display: showGameView ? 'block' : 'none' }} aria-hidden={!showGameView}>
        <GameView onMounted={setGame} />
        <Hud />
        <ModeButtons />
      </div>
      {phase === 'tap-to-start' ? <TapToStartGate onStart={handleStart} /> : null}
      {phase === 'puzzle-select' ? <PuzzleSelect onLoaded={handlePuzzleLoaded} /> : null}
      {phase === 'cleared' ? <ClearOverlay onAdvance={handleAdvanceToResults} /> : null}
      {phase === 'results' ? (
        <ResultsPage
          onReturnToSelect={handleReturnToSelect}
          isNewBest={lastClearWasNewBestRef.current}
        />
      ) : null}
    </>
  );
}
