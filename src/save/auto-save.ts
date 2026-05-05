// docs §93 / §94: ストア変更時に LocalStorage への autosave (debounce) と
// 起動時の loadAndMigrate を結合する。

import {
  CURRENT_SCHEMA_VERSION,
  LocalStorageBackend,
  debounce,
  defaultSaveData,
  loadAndMigrate,
  type ActivePuzzleSave,
  type CellState,
  type SaveBackend,
  type SaveData,
} from '@core/index.ts';
import { useGame } from '@game/index.ts';

const SAVE_DEBOUNCE_MS = 1500;

let backend: SaveBackend | null = null;
let saved: SaveData = defaultSaveData();

// β8.0-β / Gemini Pro 指摘 1: localStorage 容量超過リスク回避のため
// 永続化する履歴は直近 N 件に制限 (25x25 でも 50 件 ≈ 数百 KB に収まる)
const PERSIST_HISTORY_LIMIT = 50;

/** 現在の Zustand state を ActivePuzzleSave 形式に変換 */
function toActivePuzzleSave(): ActivePuzzleSave | null {
  const s = useGame.getState();
  if (!s.currentPuzzle) return null;
  // β8.0-β / Gemini Pro 指摘 1: history を直近 N 件に絞る
  // (Zustand state は immutable なので元配列を破壊しない)
  const fullHistory = s.history;
  const cursor = s.historyCursor;
  let trimmedHistory = fullHistory;
  let trimmedCursor = cursor;
  if (fullHistory.length > PERSIST_HISTORY_LIMIT) {
    // cursor 位置を中心に直近 N 件を取る (cursor 以前を多めに残す)
    const before = Math.min(cursor, PERSIST_HISTORY_LIMIT - 1);
    const start = cursor - before;
    trimmedHistory = fullHistory.slice(start, start + PERSIST_HISTORY_LIMIT);
    trimmedCursor = before;
  }
  // β8.0-β / Gemini Pro 指摘 3: Zustand state は既に immutable なので slice 不要
  return {
    puzzleId: s.currentPuzzle.meta.id,
    cells: s.board.cells as CellState[], // 型上 readonly だが Schema 検証は readonly でも通る
    rowMarks: s.marks.rowMarks as boolean[][],
    colMarks: s.marks.colMarks as boolean[][],
    startedAtMs: s.startedAtMs,
    elapsedMs: s.elapsedMs,
    isPaused: s.phase === 'paused',
    history: trimmedHistory.map((snap) => ({
      cells: snap.board.cells as CellState[],
      rowMarks: snap.marks.rowMarks as boolean[][],
      colMarks: snap.marks.colMarks as boolean[][],
    })),
    historyCursor: trimmedCursor,
  };
}

const debouncedSave = debounce(() => {
  if (!backend) return;
  const ap = toActivePuzzleSave();
  if (ap) saved.activePuzzles[ap.puzzleId] = ap;
  saved.schemaVersion = CURRENT_SCHEMA_VERSION;
  backend.save(saved);
}, SAVE_DEBOUNCE_MS);

/**
 * autosave をマウント。LocalStorage からデータをロードして store に反映 (現状: 設定のみ)、
 * 以降は store 変更を購読して debounced save。
 *
 * 戻り値の cleanup を必ず呼ぶこと (subscribe の解除 + 残保存の flush)。
 */
export function mountAutoSave(): () => void {
  backend = new LocalStorageBackend();
  saved = loadAndMigrate(backend);
  // 設定 (audio/a11y) は将来 store に反映する場所がない (MVP では UI 未実装) ため、saved に保持のみ。

  // β8.0-β / 重要バグ修正 (Gemini Pro 指摘 2 で簡素化):
  // useGame.subscribe を全 state 監視で使うと tickTimer が毎フレーム発火し
  // debouncedSave が永遠に re-arm されて save が走らないバグ (β1.0 から潜在)。
  // Zustand の subscribe は (next, prev) を渡してくれるので、
  // 永続化対象 (board / marks / phase / startedAtMs / historyCursor) の差分だけを見る。
  const unsub = useGame.subscribe((s, prev) => {
    if (
      s.board !== prev.board ||
      s.marks !== prev.marks ||
      s.phase !== prev.phase ||
      s.startedAtMs !== prev.startedAtMs ||
      s.historyCursor !== prev.historyCursor
    ) {
      debouncedSave();
    }
  });

  // 中断時は flush
  const onVisibility = () => {
    if (document.hidden) debouncedSave.flush();
  };
  const onBeforeUnload = () => debouncedSave.flush();
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('beforeunload', onBeforeUnload);

  return () => {
    unsub();
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('beforeunload', onBeforeUnload);
    debouncedSave.flush();
    debouncedSave.cancel();
    backend = null;
  };
}

/** 現在の保存済データを取得 (テスト用) */
export function getSavedData(): SaveData {
  return saved;
}

/**
 * β2.0-δ: 設定 (audio / a11y) を更新する。
 * 部分更新 (partial) を受け取り、現在値とマージして即時 backend.save する。
 * 戻り値は更新後の settings (UI 反映用)。
 */
export function updateSettings(
  patch: { audio?: Partial<SaveData['settings']['audio']>; a11y?: Partial<SaveData['settings']['a11y']> },
): SaveData['settings'] {
  const next = {
    audio: { ...saved.settings.audio, ...(patch.audio ?? {}) },
    a11y: { ...saved.settings.a11y, ...(patch.a11y ?? {}) },
  };
  saved = { ...saved, settings: next };
  if (backend) backend.save(saved);
  return next;
}

/**
 * クリア記録を更新する。
 * 戻り値: 「更新前の bestTimeMs」(初クリアなら null)。
 * App.tsx 側で「今回のタイムが過去ベストより速いか (= NEW!)」を判定するために使う
 * (Round 7-A / Gemini Pro 指摘 ②)。
 */
export function recordClear(puzzleId: string, timeMs: number): number | null {
  const now = Date.now();
  const prev = saved.clearRecords[puzzleId];
  const previousBest = prev?.bestTimeMs ?? null;
  saved.clearRecords[puzzleId] = {
    puzzleId,
    bestTimeMs: prev ? Math.min(prev.bestTimeMs, timeMs) : timeMs,
    clearCount: (prev?.clearCount ?? 0) + 1,
    firstClearedAt: prev?.firstClearedAt ?? now,
    lastClearedAt: now,
  };
  delete saved.activePuzzles[puzzleId]; // クリア済はアクティブから外す
  if (backend) backend.save(saved);
  return previousBest;
}
