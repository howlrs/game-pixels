// docs §14.2.2 / Round 7-A/B: App は phase 駆動で
// TapToStart / PuzzleSelect / GameView (+HUD/Modes/ClearBanner) / ResultsPage を切り替える。
//
// 遷移フロー (Round 7-B):
//   tap-to-start → puzzle-select → playing → cleared (セル回転アニメ ~1.2s)
//                                          → results (総評ページ)
//                                          → puzzle-select (戻る)
//
// Round 7-A / Gemini Pro deep 指摘 (実機空白バグ修正):
// Pixi.js v8 WebGPU Canvas を DOM からアンマウントすると Windows Chrome のコンポジタが
// クラッシュし、DOM 上の他要素 (ResultsPage 等) も真っ白になる既知現象がある。
// 対策: GameView は常時マウントしたまま、display:none で見せ消えする。
//
// Round 7-B: クリア時のセル回転アニメ (波状) をアニメ完了で results 遷移に統一。
// 旧 ClearOverlay (1.5 秒タイマー) は廃止 (アニメ自体が祝福演出を兼ねる)。
// 控えめな祝福バナー (ClearBanner) を盤面上部に表示してメッセージ性を残す。

import { useCallback, useEffect, useRef } from 'react';
import { mountVisibilityHandler } from '@platform/visibility.ts';
import { isStandalone, mountInstallPromptCapture } from '@platform/install.ts';
import {
  getInitialPath,
  navigate,
  parsePath,
  updateHighContrast,
  updateReduceMotion,
} from '@platform/index.ts';
import { mountAutoSave, recordClear, getSavedData } from '@save/index.ts';
import { mountAudio, setBgmMaster, setVolume, useAudio } from '@audio/index.ts';
import { loadPuzzle as loadPuzzleData } from '@core/index.ts';
import { useGame } from '@game/index.ts';
import type { GameHandle } from '@render/index.ts';
import { ClearBanner } from './ClearBanner.tsx';
import { GameView } from './GameView.tsx';
import { Hud } from './Hud.tsx';
import { ModeButtons } from './ModeButtons.tsx';
import { PuzzleSelect } from './PuzzleSelect.tsx';
import { ResultsPage } from './ResultsPage.tsx';
import { ResumeGate } from './ResumeGate.tsx';
import { TapToStartGate } from './TapToStartGate.tsx';

export function App() {
  const phase = useGame((s) => s.phase);
  const setPhase = useGame((s) => s.setPhase);
  const gameRef = useRef<GameHandle | null>(null);
  const setGame = useCallback((h: GameHandle) => {
    gameRef.current = h;
  }, []);
  // クリア瞬間のタイムを保持し、ResultsPage の NEW! 判定に使う (Gemini 指摘 ②)
  const lastClearWasNewBestRef = useRef<boolean>(false);
  // クリアアニメの二重発火防止 (StrictMode 二重呼び対策)
  const animLaunchedForClearRef = useRef<boolean>(false);

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
    const detachSave = mountAutoSave();
    // β2.0-β: UserSettings.audio から音量を反映 + audio store mount
    // optional chain で migration 漏れに耐性 (Gemini 指摘 6)
    const settings = getSavedData()?.settings;
    setVolume({
      master: settings?.audio?.master ?? 0.7,
      se: settings?.audio?.se ?? 0.7,
    });
    // β11.0-α: BGM 設定リストア (master / volume は Zustand 経由で同期、bgmEnabled はデフォルト false)
    setBgmMaster(settings?.audio?.master ?? 0.7);
    const audioState = useAudio.getState();
    audioState.setBgmVolume(settings?.audio?.bgm ?? 0.5);
    // bgmEnabled は phase=playing になった時に自動 start するので、ここではフラグだけ反映
    audioState.setBgmEnabled(settings?.audio?.bgmEnabled ?? false);
    // β3.0-β: reduceMotion を起動時に body 属性に反映
    updateReduceMotion(settings?.a11y?.reduceMotion ?? false);
    // β4.0-β: highContrast も同様に
    updateHighContrast(settings?.a11y?.highContrast ?? false);
    const detachAudio = mountAudio();
    return () => {
      detachSave();
      detachAudio();
    };
  }, []);

  // β12.0-α: 起動時に URL を読んで該当パズルを直接ロード (SSG された prerender HTML 経由)
  // 失敗時 (puzzle 不在等) はサイレントに 'tap-to-start' のままにする
  useEffect(() => {
    const target = parsePath(getInitialPath());
    switch (target.kind) {
      case 'top':
        return;
      case 'puzzles-index':
      case 'category-index':
        // ユーザー操作なしで puzzle-select に遷移 (TapToStart は省略)
        setPhase('puzzle-select');
        return;
      case 'puzzle': {
        // 該当パズルを直接ロード → playing
        const url = `/puzzles/${target.category}/${target.id}.json`;
        loadPuzzleData(url)
          .then((data) => {
            useGame.getState().loadPuzzle(data);
          })
          .catch((e) => {
            console.warn('[router] puzzle direct load failed', e);
            // フォールバック: tap-to-start のまま
          });
        return;
      }
    }
  }, [setPhase]);

  // クリア時にベストタイム記録 + セル回転アニメ発火 → 完了で results 遷移
  useEffect(() => {
    if (phase !== 'cleared') {
      animLaunchedForClearRef.current = false;
      return;
    }
    if (animLaunchedForClearRef.current) return;
    animLaunchedForClearRef.current = true;
    const s = useGame.getState();
    if (s.currentPuzzle) {
      const prevBest = recordClear(s.currentPuzzle.meta.id, s.elapsedMs);
      lastClearWasNewBestRef.current = prevBest === null || s.elapsedMs < prevBest;
    }
    // GameHandle が未確立なら即遷移 (skip 時保証, Gemini deep 指摘)
    const handle = gameRef.current;
    if (!handle) {
      setPhase('results');
      return;
    }
    handle.playClearAnimation(() => {
      // アニメ完了 → 結果ページへ。phase が cleared 以外に既に遷移していたら何もしない (race 対策)
      if (useGame.getState().phase === 'cleared') setPhase('results');
    });
  }, [phase, setPhase]);

  const handleStart = useCallback(() => {
    setPhase('puzzle-select');
    navigate({ kind: 'puzzles-index' });
  }, [setPhase]);

  const handlePuzzleLoaded = useCallback(() => {
    // GameStore.loadPuzzle が phase='playing' に遷移済 + URL を /puzzles/<cat>/<id>/ に書き換え
    const puzzle = useGame.getState().currentPuzzle;
    if (puzzle) {
      navigate({
        kind: 'puzzle',
        category: puzzle.meta.category,
        id: puzzle.meta.id,
      });
    }
  }, []);

  const handleReturnToSelect = useCallback(() => {
    setPhase('puzzle-select');
    navigate({ kind: 'puzzles-index' });
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
      {phase === 'paused' ? <ResumeGate /> : null}
      {phase === 'cleared' ? <ClearBanner /> : null}
      {phase === 'results' ? (
        <ResultsPage
          onReturnToSelect={handleReturnToSelect}
          isNewBest={lastClearWasNewBestRef.current}
        />
      ) : null}
    </>
  );
}
