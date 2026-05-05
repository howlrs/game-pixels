// docs §10.7 / Round 7-A: 総評 (結果) ページ。
// クリア演出 (ClearOverlay) の後に表示し、ユーザーに達成感 + 次のアクション提案を提供する。
//
// 設計方針 (Gemini Pro deep + review レビュー反映):
// - ミニチュアは Pixi.js Canvas snapshot ではなく SVG (DOM ベース) で描画
//   (preserveDrawingBuffer 罠 / モバイル負荷回避)
// - レスポンシブ: svh + flex/grid + overflow-y:auto でモバイル縦長でも溢れない
// - サニタイズ: タイトル等は React のデフォルトエスケープに依存 (XSS 対策)
// - aria-modal="true" + マウント時に primary ボタンへフォーカス移動 (a11y)
// - 非同期 fetch は cancelled フラグで race condition を回避
//
// アクション:
// 1. もう一度プレイ (同パズルをリロード)
// 2. 同カテゴリの他パズル (一覧から選択)
// 3. 次レベルへ (5x5 → 10x10 → 15x15)
// 4. パズル選択トップへ戻る

import { useEffect, useRef, useState } from 'react';
import {
  loadPuzzle,
  loadPuzzleIndex,
  type PuzzleCategory,
  type PuzzleIndex,
  type PuzzleMeta,
} from '@core/index.ts';
import { useGame } from '@game/index.ts';
import { getSavedData } from '@save/index.ts';

const CATEGORY_ORDER: ReadonlyArray<PuzzleCategory> = ['5x5', '10x10', '15x15', '25x25'];

interface Props {
  /** パズル選択トップへ戻る (App.tsx 側で setPhase('puzzle-select') を実行) */
  onReturnToSelect: () => void;
  /** 今回クリアが新ベスト記録か (App.tsx で recordClear の戻り値から判定済み) */
  isNewBest: boolean;
}

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const mm = Math.floor(totalSec / 60).toString().padStart(2, '0');
  const ss = (totalSec % 60).toString().padStart(2, '0');
  return `${mm}:${ss}`;
}

/**
 * solution (2D 配列) を SVG ミニチュアで描画。
 * セル数によらず最大 200×200px に収める (PR-A 段階の固定サイズ。Round 7-B でアニメ強化予定)
 */
function PuzzleMiniature({
  solution,
  ariaLabel,
}: {
  solution: ReadonlyArray<ReadonlyArray<0 | 1>>;
  ariaLabel: string;
}) {
  const h = solution.length;
  const w = solution[0]?.length ?? 0;
  if (h === 0 || w === 0) return null;
  const cellSize = 12;
  const totalW = w * cellSize;
  const totalH = h * cellSize;
  const rects: React.ReactElement[] = [];
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      if (solution[r]![c] === 1) {
        rects.push(
          <rect
            key={`${r}-${c}`}
            x={c * cellSize}
            y={r * cellSize}
            width={cellSize}
            height={cellSize}
            fill="#55ff77"
          />,
        );
      }
    }
  }
  return (
    <svg
      className="results-miniature"
      viewBox={`0 0 ${totalW} ${totalH}`}
      width={Math.min(200, totalW * 4)}
      height={Math.min(200, totalH * 4)}
      role="img"
      aria-label={ariaLabel}
      preserveAspectRatio="xMidYMid meet"
    >
      <rect x={0} y={0} width={totalW} height={totalH} fill="#1a1a1a" />
      {rects}
    </svg>
  );
}

export function ResultsPage({ onReturnToSelect, isNewBest }: Props) {
  const phase = useGame((s) => s.phase);
  const elapsed = useGame((s) => s.elapsedMs);
  const puzzle = useGame((s) => s.currentPuzzle);
  const loadPuzzleAction = useGame((s) => s.loadPuzzle);

  const [index, setIndex] = useState<PuzzleIndex | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // β2.0-γ: 共有ステータス (idle / sharing / copied / failed)
  const [shareStatus, setShareStatus] = useState<'idle' | 'sharing' | 'copied' | 'failed'>('idle');

  const primaryButtonRef = useRef<HTMLButtonElement | null>(null);
  // β2.0-γ / Gemini 指摘 1: タイマー競合 + アンマウント時のステート更新を防ぐ
  const shareResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (shareResetTimerRef.current !== null) {
        clearTimeout(shareResetTimerRef.current);
        shareResetTimerRef.current = null;
      }
    };
  }, []);
  function scheduleShareReset(ms: number) {
    if (shareResetTimerRef.current !== null) clearTimeout(shareResetTimerRef.current);
    shareResetTimerRef.current = setTimeout(() => {
      shareResetTimerRef.current = null;
      setShareStatus('idle');
    }, ms);
  }

  // Round 7-A / Gemini Pro 指摘: 非同期 fetch は cancelled フラグで race condition 回避
  useEffect(() => {
    if (phase !== 'results') return;
    let cancelled = false;
    loadPuzzleIndex('/puzzles/index.json')
      .then((idx) => {
        if (!cancelled) setIndex(idx);
      })
      .catch((e) => {
        if (!cancelled) setError(`他のパズル一覧の取得に失敗: ${String(e)}`);
      });
    return () => {
      cancelled = true;
    };
  }, [phase]);

  // Round 7-A / Gemini Pro 指摘 ③ (a11y): マウント直後の DOM 描画完了を待つため
  // requestAnimationFrame 経由で primary ボタンにフォーカスを移す
  // (StrictMode の二重マウント時にも focus 失敗しないことを保証)
  useEffect(() => {
    if (phase !== 'results') return;
    const raf = requestAnimationFrame(() => {
      primaryButtonRef.current?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  if (phase !== 'results' || !puzzle) return null;

  const savedData = getSavedData();
  const bestRecord = savedData.clearRecords[puzzle.meta.id];

  // 同カテゴリの他パズル / 次レベルパズルを抽出
  const sameCategoryOthers: PuzzleMeta[] = [];
  const nextLevelPuzzles: PuzzleMeta[] = [];
  let nextCategory: PuzzleCategory | null = null;
  if (index) {
    const idxOfCurrent = CATEGORY_ORDER.indexOf(puzzle.meta.category);
    const nextCat: PuzzleCategory | null =
      idxOfCurrent >= 0 && idxOfCurrent < CATEGORY_ORDER.length - 1
        ? CATEGORY_ORDER[idxOfCurrent + 1]!
        : null;
    nextCategory = nextCat;
    for (const p of index.puzzles) {
      if (p.category === puzzle.meta.category && p.id !== puzzle.meta.id) {
        sameCategoryOthers.push(p);
      } else if (nextCat && p.category === nextCat) {
        nextLevelPuzzles.push(p);
      }
    }
  }

  async function handleSelect(p: PuzzleMeta) {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const url = `/puzzles/${p.category}/${p.id}.json`;
      const data = await loadPuzzle(url);
      loadPuzzleAction(data); // phase='playing' に自動遷移
    } catch (e) {
      setError(`パズルロード失敗: ${String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  function handleReplay() {
    if (puzzle) {
      loadPuzzleAction(puzzle); // 同パズルをリロード = 盤面リセット + phase='playing'
    }
  }

  // Round 7-A / Gemini 指摘 ①: setPhase 重複を避けるため親の onReturnToSelect に委譲
  function handleBackToSelect() {
    onReturnToSelect();
  }

  // β2.0-γ: クリア結果を共有 (Web Share API → clipboard fallback)
  async function handleShare() {
    if (!puzzle || shareStatus === 'sharing') return;
    setShareStatus('sharing');
    const text = `🎉 ピクセルズ「${puzzle.meta.title}」(${puzzle.meta.category}) を ${formatTime(elapsed)} でクリア!`;
    const url = typeof window !== 'undefined' ? window.location.origin : '';
    const shareData: ShareData = {
      title: 'ピクセルズ — クリア!',
      text,
      url,
    };
    // Web Share API が使え、かつデータが共有可能なら使う
    const canUseShare =
      typeof navigator !== 'undefined' &&
      typeof navigator.share === 'function' &&
      (typeof navigator.canShare !== 'function' || navigator.canShare(shareData));
    if (canUseShare) {
      try {
        await navigator.share(shareData);
        setShareStatus('idle'); // share dialog 完了は idle に戻すだけ (成功/cancel 不問)
        return;
      } catch (e) {
        // ユーザー cancel (AbortError) は静かに idle に戻す
        if (e && typeof e === 'object' && 'name' in e && (e as { name: string }).name === 'AbortError') {
          setShareStatus('idle');
          return;
        }
        // その他は clipboard fallback へフォールスルー
      }
    }
    // clipboard fallback (Gemini 指摘 4: title も含めて見栄えを揃える)
    const titlePrefix = 'ピクセルズ — クリア!\n';
    const fullText = url ? `${titlePrefix}${text}\n${url}` : `${titlePrefix}${text}`;
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(fullText);
        setShareStatus('copied');
        scheduleShareReset(2500);
        return;
      } catch {
        /* fall through to failed */
      }
    }
    setShareStatus('failed');
    scheduleShareReset(2500);
  }

  function renderPuzzleButton(p: PuzzleMeta, extraClass?: string) {
    const cleared = savedData.clearRecords[p.id];
    return (
      <li key={p.id}>
        <button type="button" onClick={() => handleSelect(p)} disabled={loading} className={extraClass}>
          <strong>
            {p.title}
            {cleared && (
              <span className="results-cleared-mark" aria-label="クリア済み">
                ✓
              </span>
            )}
          </strong>
          <small>
            {p.category} / {p.difficulty}
            {cleared && ` · ${formatTime(cleared.bestTimeMs)}`}
          </small>
        </button>
      </li>
    );
  }

  return (
    <div className="results-page" role="dialog" aria-modal="true" aria-label="クリア結果">
      <div className="results-inner">
        <header className="results-header">
          <h1>
            🎉 {puzzle.meta.title} <span className="results-clear">クリア!</span>
          </h1>
          <p className="results-meta">
            {puzzle.meta.category} / {puzzle.meta.difficulty}
          </p>
        </header>

        <section className="results-summary">
          <PuzzleMiniature solution={puzzle.solution} ariaLabel={`${puzzle.meta.title} の完成図`} />
          <div className="results-times">
            <p className="results-time-row">
              <span className="results-label">タイム</span>
              <span className="results-time-value">{formatTime(elapsed)}</span>
            </p>
            {bestRecord && (
              <p className="results-time-row">
                <span className="results-label">ベスト</span>
                <span className="results-time-value">
                  {formatTime(bestRecord.bestTimeMs)}
                  {isNewBest && <em className="results-new-best"> NEW!</em>}
                </span>
              </p>
            )}
            {bestRecord && (
              <p className="results-meta-small">クリア回数: {bestRecord.clearCount}</p>
            )}
          </div>
        </section>

        {error && <p className="results-error">{error}</p>}

        <section className="results-actions">
          <button
            ref={primaryButtonRef}
            type="button"
            onClick={handleReplay}
            className="primary"
            disabled={loading}
          >
            🔁 もう一度
          </button>
          <button
            type="button"
            onClick={handleShare}
            className="share"
            disabled={shareStatus === 'sharing'}
            aria-label="クリア結果をシェア"
          >
            {/* β2.0-γ / Gemini 指摘 2: 視覚ラベルは状況依存だが、ボタンの aria-label は固定。
                ステータス通知は隣接の visually-hidden ライブ領域で読み上げ。 */}
            <span aria-hidden="true">
              {shareStatus === 'sharing' && '共有中…'}
              {shareStatus === 'copied' && '✓ コピーしました'}
              {shareStatus === 'failed' && '✗ 共有失敗'}
              {shareStatus === 'idle' && '📤 シェア'}
            </span>
          </button>
          <span className="visually-hidden" role="status" aria-live="polite">
            {shareStatus === 'copied' && 'クリア結果をクリップボードにコピーしました'}
            {shareStatus === 'failed' && '共有に失敗しました'}
          </span>
          <button type="button" onClick={handleBackToSelect} className="secondary" disabled={loading}>
            🏠 パズル選択へ
          </button>
        </section>

        {sameCategoryOthers.length > 0 && (
          <section className="results-section">
            <h2>同じサイズの他のパズル ({puzzle.meta.category})</h2>
            <ul className="results-puzzle-list">
              {sameCategoryOthers.map((p) => renderPuzzleButton(p))}
            </ul>
          </section>
        )}

        {nextCategory && nextLevelPuzzles.length > 0 && (
          <section className="results-section">
            <h2>次のレベルに挑戦! ({nextCategory})</h2>
            <ul className="results-puzzle-list">
              {nextLevelPuzzles.map((p) => renderPuzzleButton(p, 'next-level'))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
