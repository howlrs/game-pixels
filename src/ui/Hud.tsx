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
// 並び順: TIME / PROGRESS / 🔊 ミュート / ? ヘルプ / ⚙ 設定 / リセット

import { useEffect, useMemo, useState } from 'react';
import { computeProgress } from '@core/index.ts';
import { useAudio } from '@audio/index.ts';
import { useGame } from '@game/index.ts';
import { HelpModal } from './HelpModal.tsx';
import { SettingsModal } from './SettingsModal.tsx';

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const mm = Math.floor(totalSec / 60).toString().padStart(2, '0');
  const ss = (totalSec % 60).toString().padStart(2, '0');
  return `${mm}:${ss}`;
}

export function Hud() {
  const phase = useGame((s) => s.phase);
  const elapsed = useGame((s) => s.elapsedMs);
  const puzzle = useGame((s) => s.currentPuzzle);
  const board = useGame((s) => s.board);
  const reset = useGame((s) => s.resetBoard);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  // β2.0-β: ミュート状態は Zustand 経由 (Settings Modal とも同期可能)
  const muted = useAudio((s) => s.muted);
  const toggleMuted = useAudio((s) => s.toggleMuted);

  // β3.0-γ: 進捗% (memoize: board / puzzle が変わった時のみ再計算)
  const progressPct = useMemo(() => {
    if (!puzzle) return 0;
    return Math.round(computeProgress(board, puzzle.solution).ratio * 100);
  }, [board, puzzle]);

  // β4.0-α: グローバル ? キーで HelpModal toggle
  // INPUT/TEXTAREA/SELECT/contentEditable focus 中は無視 (Gemini 指摘 2)
  // SettingsModal が開いている時は無視 (Modal 競合排他制御 / Gemini 指摘 1)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '?') return;
      if (settingsOpen) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (target?.isContentEditable) return;
      e.preventDefault();
      setHelpOpen((cur) => !cur);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [settingsOpen]);

  // Round 7-B: cleared 中は HUD を非表示にして ClearBanner / セル回転アニメに集中させる
  if (phase === 'tap-to-start' || phase === 'puzzle-select' || phase === 'cleared') return null;

  return (
    <div className="hud">
      {puzzle && (
        <span className="hud-title" aria-label={`現在のパズル: ${puzzle.meta.title}`}>
          {puzzle.meta.title}
        </span>
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
