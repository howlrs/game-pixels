// docs §10.7 / §97.11: パズル選択画面。MVP では index.json をフェッチして一覧表示。
//
// β6.0-β: クリア済マーク (✓ + ベストタイム) と カテゴリ毎の進捗 (5/8 等) を表示。
// ResultsPage と同じ getSavedData().clearRecords を参照する DRY 設計。
//
// 2026-05-06: モバイル描画バグ対策で常時マウント方針に変更 (Round 7-A 拡張)。
// 親 (App.tsx) が display:none / block で見せ消えするため、本コンポーネントは self-mount
// 状態を意識しない。clearRecords は phase 変化時に再計算 (results→puzzle-select 戻りで
// クリアマーク ✓ が確実に反映されるよう)。

import { useEffect, useMemo, useState } from 'react';
import {
  formatTime,
  loadPuzzle,
  loadPuzzleIndex,
  type PuzzleClearRecord,
  type PuzzleIndex,
  type PuzzleMeta,
} from '@core/index.ts';
import { useGame } from '@game/index.ts';
import { getSavedData } from '@save/index.ts';
import { Footer } from './Footer.tsx';

interface Props {
  onLoaded: () => void;
}

// 2026-05-06: 非表示時の不要な再レンダリング防止のため空オブジェクトの参照を固定
// (Gemini Pro deep 指摘)。新しい {} を毎回返すと React の Object.is 比較で常に違う参照と
// 判断され、隠れた PuzzleSelect が無駄に再レンダリングされる。
const EMPTY_CLEAR_RECORDS: Record<string, PuzzleClearRecord> = {};

export function PuzzleSelect({ onLoaded }: Props) {
  const [index, setIndex] = useState<PuzzleIndex | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const phase = useGame((s) => s.phase);

  // β6.0-β: SavedData は本画面表示時 (phase=puzzle-select 入った瞬間) の値で安定化。
  // 2026-05-06: 常時マウント化に伴い phase 依存にして results→puzzle-select 戻り時に
  // クリアマーク (✓) を確実に再評価できるようにする。
  const clearRecords = useMemo(() => {
    if (phase !== 'puzzle-select') return EMPTY_CLEAR_RECORDS;
    return getSavedData()?.clearRecords ?? EMPTY_CLEAR_RECORDS;
  }, [phase]);

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
      // β8.0-β: 途中状態 (activePuzzles) があれば自動復元
      const saved = getSavedData()?.activePuzzles?.[p.id];
      if (saved) {
        // exactOptionalPropertyTypes 対応: 未定義 key を含めない形で再構築
        const restore: import('@game/index.ts').RestoreSnapshot = {
          cells: saved.cells,
          rowMarks: saved.rowMarks,
          colMarks: saved.colMarks,
          startedAtMs: saved.startedAtMs,
          elapsedMs: saved.elapsedMs,
          isPaused: saved.isPaused,
          ...(saved.history && saved.history.length > 0 ? { history: saved.history } : {}),
          ...(typeof saved.historyCursor === 'number' ? { historyCursor: saved.historyCursor } : {}),
        };
        useGame.getState().loadPuzzle(data, restore);
      } else {
        useGame.getState().loadPuzzle(data);
      }
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
      {/* index.categoryOrder ループは下で展開、最後にフッターを配置 */}
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
      <Footer />
    </div>
  );
}
