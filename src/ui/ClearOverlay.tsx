// docs §10 / Round 7-A: クリア演出 overlay。1.5 秒経過で結果ページへ自動遷移。
// 旧仕様 (3 秒でパズル選択直行) は ResultsPage 導入により短縮。
// 達成感を見たいユーザー向けに「結果を見る」ボタンも提供 (即時遷移可能)。

import { useEffect, useState } from 'react';
import { useGame } from '@game/index.ts';

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const mm = Math.floor(totalSec / 60).toString().padStart(2, '0');
  const ss = (totalSec % 60).toString().padStart(2, '0');
  return `${mm}:${ss}`;
}

const AUTO_ADVANCE_MS = 1500;

interface Props {
  /** 結果ページへ進む (phase='results' に遷移) */
  onAdvance: () => void;
}

export function ClearOverlay({ onAdvance }: Props) {
  const phase = useGame((s) => s.phase);
  const elapsed = useGame((s) => s.elapsedMs);
  const puzzle = useGame((s) => s.currentPuzzle);
  const [remainingMs, setRemainingMs] = useState<number>(AUTO_ADVANCE_MS);

  // cleared フェーズ突入時に AUTO_ADVANCE_MS タイマー開始 → 0 になったら onAdvance
  useEffect(() => {
    if (phase !== 'cleared') {
      setRemainingMs(AUTO_ADVANCE_MS);
      return;
    }
    const startedAt = performance.now();
    let raf = 0;
    const tick = () => {
      const elapsedTick = performance.now() - startedAt;
      const left = Math.max(0, AUTO_ADVANCE_MS - elapsedTick);
      setRemainingMs(left);
      if (left <= 0) {
        onAdvance();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [phase, onAdvance]);

  if (phase !== 'cleared') return null;

  const remainingSec = Math.ceil(remainingMs / 1000);

  return (
    <div className="clear-overlay" role="dialog" aria-label="パズルクリア">
      <div className="clear-card">
        <h2>クリア!</h2>
        <p>{puzzle?.meta.title}</p>
        <p>タイム: {formatTime(elapsed)}</p>
        <p className="clear-countdown" aria-live="polite">
          {remainingSec} 秒後に結果ページへ
        </p>
        <button type="button" onClick={onAdvance} className="primary">
          結果を見る
        </button>
      </div>
    </div>
  );
}
