// docs §10 クリア演出: overlay + 自動遷移 (3 秒後にパズル選択画面)。
// ユーザー要望 (Round 6 後): クリア成功でゲーム再プレイ画面 (= パズル選択) に自動遷移。
// 達成感を見たいユーザー向けに「いますぐ戻る」ボタンも提供 (即時遷移可能)。

import { useEffect, useState } from 'react';
import { useGame } from '@game/index.ts';

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const mm = Math.floor(totalSec / 60).toString().padStart(2, '0');
  const ss = (totalSec % 60).toString().padStart(2, '0');
  return `${mm}:${ss}`;
}

const AUTO_RETURN_MS = 3000;

interface Props {
  onReturn: () => void;
}

export function ClearOverlay({ onReturn }: Props) {
  const phase = useGame((s) => s.phase);
  const elapsed = useGame((s) => s.elapsedMs);
  const puzzle = useGame((s) => s.currentPuzzle);
  const [remainingMs, setRemainingMs] = useState<number>(AUTO_RETURN_MS);

  // cleared フェーズ突入時に AUTO_RETURN_MS タイマー開始 → 0 になったら onReturn
  useEffect(() => {
    if (phase !== 'cleared') {
      setRemainingMs(AUTO_RETURN_MS);
      return;
    }
    const startedAt = performance.now();
    let raf = 0;
    const tick = () => {
      const elapsedTick = performance.now() - startedAt;
      const left = Math.max(0, AUTO_RETURN_MS - elapsedTick);
      setRemainingMs(left);
      if (left <= 0) {
        onReturn();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [phase, onReturn]);

  if (phase !== 'cleared') return null;

  const remainingSec = Math.ceil(remainingMs / 1000);

  return (
    <div className="clear-overlay" role="dialog" aria-label="パズルクリア">
      <div className="clear-card">
        <h2>クリア!</h2>
        <p>{puzzle?.meta.title}</p>
        <p>タイム: {formatTime(elapsed)}</p>
        <p className="clear-countdown" aria-live="polite">
          {remainingSec} 秒後にパズル選択へ戻ります
        </p>
        <button type="button" onClick={onReturn} className="primary">
          いますぐ戻る
        </button>
      </div>
    </div>
  );
}
