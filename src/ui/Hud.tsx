// docs §10 HUD: 経過時間 + 現在モード + リセットボタン。

import { useGame } from '@game/index.ts';

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
  const reset = useGame((s) => s.resetBoard);

  if (phase === 'tap-to-start' || phase === 'puzzle-select') return null;

  return (
    <div className="hud" role="status" aria-live="polite">
      <span>{puzzle?.meta.title ?? ''}</span>
      <span>TIME {formatTime(elapsed)}</span>
      <button
        type="button"
        onClick={() => {
          if (window.confirm('盤面を最初からやり直しますか?')) reset();
        }}
        className="hud-reset"
      >
        リセット
      </button>
    </div>
  );
}
