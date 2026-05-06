// docs §10 / Round 7-B: クリア瞬間の祝福バナー (旧 ClearOverlay の置き換え)。
// 盤面のセル回転アニメ (~1.2s) と並行表示し、アニメ完了で App 側が phase='results' に遷移する。
// overlay ではなく上部 banner にすることでセル回転アニメを隠さない。
//
// 2026-05-06: モバイル描画バグ対策で常時マウント方針に変更 (Round 7-A 拡張)。
// 親 (App.tsx) が display:none / block で見せ消えする前提のため、自身では phase 判定しない。

import { useGame } from '@game/index.ts';

export function ClearBanner() {
  const puzzle = useGame((s) => s.currentPuzzle);
  return (
    <div className="clear-banner" role="status" aria-live="polite">
      <h2>
        <span aria-hidden="true">🎉</span>
        <span>クリア!</span>
      </h2>
      {puzzle && <p>{puzzle.meta.title}</p>}
    </div>
  );
}
