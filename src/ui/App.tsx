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
//
// 2026-05-06 / モバイル描画バグ対策 (Round 7-A 知見の全 phase 拡張、Gemini Pro deep 合議):
// Android Chrome 実機で puzzle 直接 URL アクセス時、PuzzleSelect が DOM から外れる遷移と
// Pixi.js (WebGPU) 起動が同タイミングで発生し、コンポジタが PuzzleSelect の前回フレームを
// 画面に張り付けたまま canvas 描画を停止する症状を確認 (Round 7-A の Android 版)。
// 対策:
//   1. GameView だけでなく TapToStartGate / PuzzleSelect / ResumeGate / ClearBanner /
//      ResultsPage も常時マウントし、ラッパ div の display で見せ消えする
//   2. GameView の mountPixi を 2 frame 遅延させ DOM レイアウト確定後に WebGPU を起動
//      (詳細は GameView.tsx 内コメント)

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
import { DebugHud } from './DebugHud.tsx';
import { GameView } from './GameView.tsx';
import { Hud } from './Hud.tsx';
import { ModeButtons } from './ModeButtons.tsx';
import { PuzzleSelect } from './PuzzleSelect.tsx';
import { ResultsPage } from './ResultsPage.tsx';
import { ResumeGate } from './ResumeGate.tsx';
import { TapToStartGate } from './TapToStartGate.tsx';

// β12.0-β: 初回 render の前 (モジュール load 直後) に URL を解析して
// 初期 phase を上書きする (TapToStartGate のチラつき防止)。
//
// 2026-05-06 / モバイル描画バグ対策 (Gemini Pro deep 合議):
// puzzle 直接 URL の場合、以前は一旦 'puzzle-select' を経由してから 'playing' に遷移していたが、
// この PuzzleSelect マウント→アンマウント遷移と Pixi.js (WebGPU) 起動が同タイミングで走り、
// Android Chrome のコンポジタが PuzzleSelect の前回フレームを画面に張り付けたままにする
// 描画バグを誘発していた。対策として puzzle 直接 URL は 'puzzle-select' をスキップし、
// 直接 'playing' (board は空) で loadPuzzle 完了を待つ。
const INITIAL_TARGET = parsePath(getInitialPath());
if (INITIAL_TARGET.kind === 'puzzles-index' || INITIAL_TARGET.kind === 'category-index') {
  useGame.setState({ phase: 'puzzle-select' });
} else if (INITIAL_TARGET.kind === 'puzzle') {
  // puzzle 直接 URL: PuzzleSelect を経由せず playing で起動。
  // currentPuzzle = null のまま GameView がマウントされるが、mountPixi の初期描画は
  // currentPuzzle が null なら no-op (render/mount.ts ensureResolution)。
  // loadPuzzle 完了で store が phase='playing' を再 set + 盤面が描画される。
  useGame.setState({ phase: 'playing' });
}
// else: kind === 'top' → 既定の 'tap-to-start' のまま

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

  // β12.0-α / β12.0-β: 起動時に URL を読んで該当パズルを直接ロード (SSG prerender 経由)。
  // 初期 phase はモジュールトップで既に設定済み (puzzle 直接 URL → 'playing')。
  // 2026-05-06 / Gemini Pro deep 指摘: 失敗時 (puzzle 不在等) は puzzle-select にフォールバック。
  // 新しい初期 phase が 'playing' なので、失敗を検知して明示的に戻す必要がある。
  // URL は /puzzles/<cat>/<id>/ のままだと戻る/再読み込み時に同じ失敗を繰り返すため、
  // history.replaceState で /puzzles/ に書き換える (history を汚さず一覧側に固定)。
  useEffect(() => {
    if (INITIAL_TARGET.kind !== 'puzzle') return;
    const url = `/puzzles/${INITIAL_TARGET.category}/${INITIAL_TARGET.id}.json`;
    loadPuzzleData(url)
      .then((data) => {
        useGame.getState().loadPuzzle(data);
      })
      .catch((e) => {
        console.warn('[router] puzzle direct load failed', e);
        useGame.setState({ phase: 'puzzle-select' });
        if (typeof window !== 'undefined') {
          window.history.replaceState({}, '', '/puzzles/');
        }
      });
  }, []);

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
  // 2026-05-06: 同様の症状を Android Chrome 実機でも puzzle 直接URL アクセス時に確認。
  // 対策として全 phase コンポーネントを常時マウント化 (Gemini Pro deep 合議)。
  const showGameView = phase === 'playing' || phase === 'paused' || phase === 'cleared';
  const showTapToStart = phase === 'tap-to-start';
  const showPuzzleSelect = phase === 'puzzle-select';
  const showResume = phase === 'paused';
  const showClearBanner = phase === 'cleared';
  const showResults = phase === 'results';

  return (
    <>
      <div style={{ display: showGameView ? 'block' : 'none' }} aria-hidden={!showGameView}>
        <GameView onMounted={setGame} />
        <Hud />
        <ModeButtons />
      </div>
      <div style={{ display: showTapToStart ? 'block' : 'none' }} aria-hidden={!showTapToStart}>
        <TapToStartGate onStart={handleStart} />
      </div>
      <div style={{ display: showPuzzleSelect ? 'block' : 'none' }} aria-hidden={!showPuzzleSelect}>
        <PuzzleSelect onLoaded={handlePuzzleLoaded} />
      </div>
      <div style={{ display: showResume ? 'block' : 'none' }} aria-hidden={!showResume}>
        <ResumeGate />
      </div>
      <div style={{ display: showClearBanner ? 'block' : 'none' }} aria-hidden={!showClearBanner}>
        <ClearBanner />
      </div>
      <div style={{ display: showResults ? 'block' : 'none' }} aria-hidden={!showResults}>
        <ResultsPage
          onReturnToSelect={handleReturnToSelect}
          isNewBest={lastClearWasNewBestRef.current}
        />
      </div>
      <DebugHud />
    </>
  );
}
