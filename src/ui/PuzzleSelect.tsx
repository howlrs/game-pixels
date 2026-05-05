// docs §10.7 / §97.11: パズル選択画面。MVP では index.json をフェッチして一覧表示。
//
// β6.0-β: クリア済マーク (✓ + ベストタイム) と カテゴリ毎の進捗 (5/8 等) を表示。
// ResultsPage と同じ getSavedData().clearRecords を参照する DRY 設計。

import { useEffect, useMemo, useState } from 'react';
import { loadPuzzle, loadPuzzleIndex, type PuzzleIndex, type PuzzleMeta } from '@core/index.ts';
import { useGame } from '@game/index.ts';
import { getSavedData } from '@save/index.ts';

interface Props {
  onLoaded: () => void;
}

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const mm = Math.floor(totalSec / 60).toString().padStart(2, '0');
  const ss = (totalSec % 60).toString().padStart(2, '0');
  return `${mm}:${ss}`;
}

export function PuzzleSelect({ onLoaded }: Props) {
  const [index, setIndex] = useState<PuzzleIndex | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // β6.0-β: SavedData は本画面マウント時の値を読み (描画中の変化は autoSave の debounce 後に反映)
  // ここでは初回 + 画面切替時のみで十分なので useMemo で安定化
  const clearRecords = useMemo(() => getSavedData()?.clearRecords ?? {}, []);

  useEffect(() => {
    loadPuzzleIndex('/puzzles/index.json')
      .then(setIndex)
      .catch((e) => setError(`パズル一覧の取得に失敗: ${String(e)}`));
  }, []);

  // 画面幅判定 (§97.11): スマホ (<768px) で 15×15 / 25×25 はサポート外
  const isSmallScreen = typeof window !== 'undefined' && window.innerWidth < 768;

  function isUnsupported(p: PuzzleMeta): boolean {
    return isSmallScreen && (p.category === '15x15' || p.category === '25x25');
  }

  async function handleSelect(p: PuzzleMeta) {
    if (isUnsupported(p)) return;
    setLoading(true);
    try {
      const url = `/puzzles/${p.category}/${p.id}.json`;
      const data = await loadPuzzle(url);
      useGame.getState().loadPuzzle(data);
      onLoaded();
    } catch (e) {
      setError(`パズルロード失敗: ${String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  if (error) {
    return (
      <div className="puzzle-select error">
        <p>{error}</p>
        <button type="button" onClick={() => window.location.reload()}>リロード</button>
      </div>
    );
  }
  if (!index) {
    return <div className="puzzle-select">読み込み中…</div>;
  }

  // β6.0-β: 全件クリア進捗
  const totalCount = index.puzzles.length;
  const clearedCount = index.puzzles.filter((p) => clearRecords[p.id] != null).length;

  return (
    <div className="puzzle-select">
      <h1>
        パズル選択
        <small className="puzzle-select-overall">
          クリア {clearedCount} / {totalCount}
        </small>
      </h1>
      {index.categoryOrder.map((cat) => {
        const inCat = index.puzzles.filter((p) => p.category === cat);
        if (inCat.length === 0) return null;
        // β6.0-β: カテゴリ毎進捗
        const catCleared = inCat.filter((p) => clearRecords[p.id] != null).length;
        return (
          <section key={cat}>
            <h2>
              {cat}
              <small className="puzzle-select-cat-progress">
                {catCleared} / {inCat.length}
              </small>
            </h2>
            <ul className="puzzle-list">
              {inCat.map((p) => {
                const unsupported = isUnsupported(p);
                const record = clearRecords[p.id];
                const isCleared = record != null;
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      disabled={loading || unsupported}
                      onClick={() => handleSelect(p)}
                      className={unsupported ? 'unsupported' : isCleared ? 'cleared' : ''}
                      title={
                        unsupported
                          ? 'このパズルは画面が小さすぎます。PC または タブレット (≥768px) でお楽しみください。'
                          : isCleared
                            ? `クリア済み (ベスト ${formatTime(record.bestTimeMs)} / ${record.clearCount} 回)`
                            : ''
                      }
                    >
                      <strong>
                        {p.title}
                        {isCleared && (
                          <span className="puzzle-cleared-mark" role="img" aria-label="クリア済み">
                            ✓
                          </span>
                        )}
                      </strong>
                      <small>
                        {p.category} / {p.difficulty}
                        {isCleared && ` · ${formatTime(record.bestTimeMs)}`}
                      </small>
                      {unsupported && <em>PC・タブレット推奨</em>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
