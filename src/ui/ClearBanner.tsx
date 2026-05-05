// docs §10 / Round 7-B: クリア瞬間の祝福バナー (旧 ClearOverlay の置き換え)。
// 盤面のセル回転アニメ (~1.2s) と並行表示し、アニメ完了で App 側が phase='results' に遷移する。
// overlay ではなく上部 banner にすることでセル回転アニメを隠さない。

import { useGame } from '@game/index.ts';

export function ClearBanner() {
  const phase = useGame((s) => s.phase);
  const puzzle = useGame((s) => s.currentPuzzle);
  if (phase !== 'cleared') return null;

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
