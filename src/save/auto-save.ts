// docs §93 / §94: ストア変更時に LocalStorage への autosave (debounce) と
// 起動時の loadAndMigrate を結合する。

import {
  CURRENT_SCHEMA_VERSION,
  LocalStorageBackend,
  debounce,
  defaultSaveData,
  loadAndMigrate,
  type ActivePuzzleSave,
  type SaveBackend,
  type SaveData,
} from '@core/index.ts';
import { useGame } from '@game/index.ts';

const SAVE_DEBOUNCE_MS = 1500;

let backend: SaveBackend | null = null;
let saved: SaveData = defaultSaveData();

/** 現在の Zustand state を ActivePuzzleSave 形式に変換 */
function toActivePuzzleSave(): ActivePuzzleSave | null {
  const s = useGame.getState();
  if (!s.currentPuzzle) return null;
  return {
    puzzleId: s.currentPuzzle.meta.id,
    cells: s.board.cells.slice(),
    rowMarks: s.marks.rowMarks.map((r) => r.slice()),
    colMarks: s.marks.colMarks.map((c) => c.slice()),
    startedAtMs: s.startedAtMs,
    elapsedMs: s.elapsedMs,
    isPaused: s.phase === 'paused',
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

  const unsub = useGame.subscribe(() => {
    debouncedSave();
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
