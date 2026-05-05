// docs §10 / β2.0-α: HUD をタイトル (左上) と TIME+リセット (右上) の 2 ブロックに分離。
// 中央上部を空けることで 25x25 など列ヒント長が大きい盤面と衝突しない。
// 各ブロックは独立 fixed (.hud-title / .hud-stats)、root の .hud は display:contents で透明化。
//
// a11y (β2.0-α / Gemini Pro 指摘 2):
// - HUD 全体に aria-live を付けるとタイマーが毎秒読み上げられて UX 破壊
// - タイマー部分は aria-hidden でスクリーンリーダーから完全に除外
// - クリア通知 (ClearBanner / ResultsPage) 側に aria-live を適切に持たせる方針
//
// β2.0-β: 音響ミュート切替ボタン (muted は Zustand 駆動 / Settings Modal 等とも共有可能)
// β2.0-δ: 「⚙ 設定」ボタンを追加し SettingsModal を開く
// β3.0-γ: TIME の隣に進捗% (PROGRESS xx%) を表示
// β4.0-α: 「?」ヘルプボタン + グローバル ? キーで HelpModal 開閉
// β5.0-α: ↶ Undo / ↷ Redo ボタン + Cmd/Ctrl+Z / Cmd/Ctrl+Shift+Z (or Y) ショートカット
// 並び順: TIME / PROGRESS / ↶ / ↷ / 🔊 ミュート / ? ヘルプ / ⚙ 設定 / リセット

import { useEffect, useMemo, useState } from 'react';
import { computeProgress, formatTime } from '@core/index.ts';
import { useAudio } from '@audio/index.ts';
import { useGame, VIEWPORT_MAX_SCALE, VIEWPORT_MIN_SCALE } from '@game/index.ts';
import { navigate } from '@platform/index.ts';
import { HelpModal } from './HelpModal.tsx';
import { SettingsModal } from './SettingsModal.tsx';

export function Hud() {
  const phase = useGame((s) => s.phase);
  const elapsed = useGame((s) => s.elapsedMs);
  const puzzle = useGame((s) => s.currentPuzzle);
  const board = useGame((s) => s.board);
  const reset = useGame((s) => s.resetBoard);
  // β7.0-β: 一時停止
  const pause = useGame((s) => s.pauseTimer);
  const setPhase = useGame((s) => s.setPhase);
  // β12.0-β: パズル一覧へ戻る (URL も pushState で /puzzles/ に書き換え)
  function goToPuzzleSelect() {
    setPhase('puzzle-select');
    navigate({ kind: 'puzzles-index' });
  }
  // β5.0-α: undo/redo
  const undo = useGame((s) => s.undo);
  const redo = useGame((s) => s.redo);
  const historyCursor = useGame((s) => s.historyCursor);
  const historyLength = useGame((s) => s.history.length);
  const canUndo = historyCursor > 0;
  const canRedo = historyCursor < historyLength - 1;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  // β2.0-β: ミュート状態は Zustand 経由 (Settings Modal とも同期可能)
  const muted = useAudio((s) => s.muted);
  const toggleMuted = useAudio((s) => s.toggleMuted);
  // β10.0-α: ズーム+パン UI
  const viewportScale = useGame((s) => s.viewport.scale);
  // Gemini Pro 指摘 1: pan のみでも reset 必要なため pan も購読
  const viewportPanX = useGame((s) => s.viewport.panX);
  const viewportPanY = useGame((s) => s.viewport.panY);
  const setViewport = useGame((s) => s.setViewport);
  const resetViewport = useGame((s) => s.resetViewport);
  const canZoomIn = viewportScale < VIEWPORT_MAX_SCALE - 1e-3;
  const canZoomOut = viewportScale > VIEWPORT_MIN_SCALE + 1e-3;
  // Gemini Pro 指摘 1: pan-only でも reset を有効化 (画面外パン → 復帰不能を防ぐ)
  const isZoomed =
    Math.abs(viewportScale - 1) > 1e-3 ||
    Math.abs(viewportPanX) > 1e-3 ||
    Math.abs(viewportPanY) > 1e-3;
  // zoomAt は canvas 物理 px 座標 (内部解像度系) を anchor として受け取る。
  // ボタン操作では「canvas の物理中心」をそのまま渡せば良い (clientX→canvas 変換は不要)。
  function zoomCenter(factor: number) {
    const cv = document.querySelector<HTMLCanvasElement>('canvas');
    if (cv) {
      useGame.getState().zoomAt(viewportScale * factor, cv.width / 2, cv.height / 2);
    } else {
      setViewport({ scale: viewportScale * factor, panX: 0, panY: 0 });
    }
  }
  function zoomIn() {
    zoomCenter(1.25);
  }
  function zoomOut() {
    zoomCenter(1 / 1.25);
  }

  // β3.0-γ: 進捗% (memoize: board / puzzle が変わった時のみ再計算)
  const progressPct = useMemo(() => {
    if (!puzzle) return 0;
    return Math.round(computeProgress(board, puzzle.solution).ratio * 100);
  }, [board, puzzle]);

  // β4.0-α: グローバル ? キーで HelpModal toggle
  // β5.0-α: Cmd/Ctrl+Z = undo / Cmd/Ctrl+Shift+Z or Cmd/Ctrl+Y = redo
  // INPUT/TEXTAREA/SELECT/contentEditable focus 中は無視 (Gemini 指摘 2)
  // SettingsModal/HelpModal が開いている時は無視 (Modal 競合排他制御)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (target?.isContentEditable) return;

      if (e.key === '?') {
        if (settingsOpen) return;
        e.preventDefault();
        setHelpOpen((cur) => !cur);
        return;
      }

      // Modal 開いてる時は undo/redo もスキップ (背景操作回避)
      if (settingsOpen || helpOpen) return;

      // Cmd/Ctrl + Z (Shift なし) → Undo
      // Cmd/Ctrl + Shift + Z または Cmd/Ctrl + Y → Redo
      // β5.0-α / Gemini 指摘: e.code を併用して IME / 配列依存を回避
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const code = e.code;
      const isZ = code === 'KeyZ' || e.key.toLowerCase() === 'z';
      const isY = code === 'KeyY' || e.key.toLowerCase() === 'y';
      if (isZ && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((isZ && e.shiftKey) || isY) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [settingsOpen, helpOpen, undo, redo]);

  // Round 7-B: cleared 中は HUD を非表示にして ClearBanner / セル回転アニメに集中させる
  if (phase === 'tap-to-start' || phase === 'puzzle-select' || phase === 'cleared') return null;

  return (
    <div className="hud">
      {puzzle && (
        <div className="hud-title-block">
          {/* β12.0-β: パズル一覧へ戻る (URL pushState 同時) */}
          <button
            type="button"
            onClick={goToPuzzleSelect}
            className="hud-back-btn"
            aria-label="パズル一覧へ戻る"
            title="パズル一覧へ戻る"
          >
            ← <span className="hud-back-label">パズル選択</span>
          </button>
          <span className="hud-title" aria-label={`現在のパズル: ${puzzle.meta.title}`}>
            {puzzle.meta.title}
          </span>
        </div>
      )}
      <div className="hud-stats">
        {/* aria-hidden でタイマー読み上げを抑制 (毎秒スパム回避) */}
        <span className="hud-time" aria-hidden="true">
          TIME {formatTime(elapsed)}
        </span>
        {/* β3.0-γ: 進捗% — aria-label で意味を伝達、aria-live なしで連続読み上げ抑制
            (Gemini レビュー a11y 指摘の妥当部分を反映) */}
        <span
          className="hud-progress"
          role="img"
          aria-label={`進捗 ${progressPct} パーセント`}
          title={`進捗 ${progressPct}%`}
        >
          {progressPct}%
        </span>
        {/* β5.0-α: Undo / Redo */}
        <button
          type="button"
          onClick={undo}
          className="hud-icon-btn"
          aria-label="元に戻す"
          disabled={!canUndo}
          title="元に戻す (Cmd/Ctrl+Z)"
        >
          <span aria-hidden="true">↶</span>
        </button>
        <button
          type="button"
          onClick={redo}
          className="hud-icon-btn"
          aria-label="やり直す"
          disabled={!canRedo}
          title="やり直す (Cmd/Ctrl+Shift+Z)"
        >
          <span aria-hidden="true">↷</span>
        </button>
        {/* β10.0-α: ズーム +/- / リセット */}
        <button
          type="button"
          onClick={zoomOut}
          className="hud-icon-btn"
          aria-label="ズームアウト"
          disabled={!canZoomOut}
          title="ズームアウト"
        >
          <span aria-hidden="true">−</span>
        </button>
        <button
          type="button"
          onClick={zoomIn}
          className="hud-icon-btn"
          aria-label="ズームイン"
          disabled={!canZoomIn}
          title="ズームイン"
        >
          <span aria-hidden="true">+</span>
        </button>
        <button
          type="button"
          onClick={resetViewport}
          className="hud-icon-btn"
          aria-label="ズームをリセット"
          disabled={!isZoomed}
          title="ズームをリセット"
        >
          <span aria-hidden="true">⤢</span>
        </button>
        <button
          type="button"
          onClick={toggleMuted}
          className="hud-mute"
          aria-label="ミュート切替"
          aria-pressed={muted}
          title={muted ? '音をオン' : '音をミュート'}
        >
          <span aria-hidden="true">{muted ? '🔇' : '🔊'}</span>
        </button>
        <button
          type="button"
          onClick={() => {
            // Modal 競合排他: 設定モーダル開いている時はヘルプを開かない
            if (settingsOpen) return;
            setHelpOpen(true);
          }}
          className="hud-icon-btn"
          aria-label="ヘルプを開く"
          aria-haspopup="dialog"
          aria-expanded={helpOpen}
          title="ヘルプ (? キー)"
        >
          <span aria-hidden="true">?</span>
        </button>
        <button
          type="button"
          onClick={() => {
            if (helpOpen) return;
            setSettingsOpen(true);
          }}
          className="hud-icon-btn"
          aria-label="設定を開く"
          aria-haspopup="dialog"
          aria-expanded={settingsOpen}
          title="設定"
        >
          <span aria-hidden="true">⚙</span>
        </button>
        <button
          type="button"
          onClick={pause}
          className="hud-icon-btn"
          aria-label="一時停止"
          title="一時停止"
        >
          <span aria-hidden="true">⏸</span>
        </button>
        <button
          type="button"
          onClick={() => {
            if (window.confirm('盤面を最初からやり直しますか?')) reset();
          }}
          className="hud-reset"
          aria-label="盤面をリセット"
        >
          リセット
        </button>
      </div>
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}
