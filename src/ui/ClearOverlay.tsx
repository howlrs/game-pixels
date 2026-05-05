// docs §10 クリア演出: シンプルな overlay + 「次のパズル」「パズル選択に戻る」ボタン。

import { useGame } from '@game/index.ts';

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const mm = Math.floor(totalSec / 60).toString().padStart(2, '0');
  const ss = (totalSec % 60).toString().padStart(2, '0');
  return `${mm}:${ss}`;
}

interface Props {
  onReturn: () => void;
}

export function ClearOverlay({ onReturn }: Props) {
  const phase = useGame((s) => s.phase);
  const elapsed = useGame((s) => s.elapsedMs);
  const puzzle = useGame((s) => s.currentPuzzle);

  if (phase !== 'cleared') return null;

  return (
    <div className="clear-overlay" role="dialog" aria-label="パズルクリア">
      <div className="clear-card">
        <h2>クリア!</h2>
        <p>{puzzle?.meta.title}</p>
        <p>タイム: {formatTime(elapsed)}</p>
        <button type="button" onClick={onReturn} className="primary">
          パズル選択に戻る
        </button>
      </div>
    </div>
  );
}
