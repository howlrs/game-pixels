// docs §10.7 / §97.11: パズル選択画面。MVP では index.json をフェッチして一覧表示。

import { useEffect, useState } from 'react';
import { loadPuzzle, loadPuzzleIndex, type PuzzleIndex, type PuzzleMeta } from '@core/index.ts';
import { useGame } from '@game/index.ts';

interface Props {
  onLoaded: () => void;
}

export function PuzzleSelect({ onLoaded }: Props) {
  const [index, setIndex] = useState<PuzzleIndex | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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

  return (
    <div className="puzzle-select">
      <h1>パズル選択</h1>
      {index.categoryOrder.map((cat) => {
        const inCat = index.puzzles.filter((p) => p.category === cat);
        if (inCat.length === 0) return null;
        return (
          <section key={cat}>
            <h2>{cat}</h2>
            <ul className="puzzle-list">
              {inCat.map((p) => {
                const unsupported = isUnsupported(p);
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      disabled={loading || unsupported}
                      onClick={() => handleSelect(p)}
                      className={unsupported ? 'unsupported' : ''}
                      title={
                        unsupported ? 'このパズルは画面が小さすぎます。PC または タブレット (≥768px) でお楽しみください。' : ''
                      }
                    >
                      <strong>{p.title}</strong>
                      <small>
                        {p.category} / {p.difficulty}
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
