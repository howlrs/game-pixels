// docs §93 セーブ: LocalStorage + debounce。Valibot 厳密検証 + 改ざん時フェイルセーフ初期化。

import * as v from 'valibot';
import type { CellState } from './board.ts';

const STORAGE_KEY = 'pixels-savedata-v1';
export const CURRENT_SCHEMA_VERSION = 1;

const CellStateSchema = v.picklist(['empty', 'filled', 'x'] as const);

// β8.0-β: Undo/Redo 履歴の永続化用 snapshot Schema
// board cells と marks のペア (game/store.ts の HistorySnapshot に対応)
const HistorySnapshotSchema = v.object({
  cells: v.array(CellStateSchema),
  rowMarks: v.array(v.array(v.boolean())),
  colMarks: v.array(v.array(v.boolean())),
});

const ActivePuzzleSchema = v.object({
  puzzleId: v.string(),
  cells: v.array(CellStateSchema),
  rowMarks: v.array(v.array(v.boolean())),
  colMarks: v.array(v.array(v.boolean())),
  startedAtMs: v.pipe(v.number(), v.integer(), v.minValue(0)),
  elapsedMs: v.pipe(v.number(), v.minValue(0)),
  isPaused: v.boolean(),
  // β8.0-β: Undo/Redo 履歴 (optional, 後方互換)
  // 古い保存データには無いので optional + default の代わりに optional で扱う
  history: v.optional(v.array(HistorySnapshotSchema)),
  historyCursor: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
});

const PuzzleClearRecordSchema = v.object({
  puzzleId: v.string(),
  bestTimeMs: v.pipe(v.number(), v.minValue(0)),
  clearCount: v.pipe(v.number(), v.integer(), v.minValue(0)),
  firstClearedAt: v.pipe(v.number(), v.integer(), v.minValue(0)),
  lastClearedAt: v.pipe(v.number(), v.integer(), v.minValue(0)),
});

const UserSettingsSchema = v.object({
  audio: v.object({
    master: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
    bgm: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
    se: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
    muteOnBlur: v.boolean(),
    // β11.0-α: BGM ON/OFF (デフォルト false)。後方互換のため optional。
    bgmEnabled: v.optional(v.boolean()),
  }),
  a11y: v.object({
    reduceMotion: v.boolean(),
    highContrast: v.boolean(),
  }),
});

export const SaveDataSchema = v.object({
  schemaVersion: v.pipe(v.number(), v.integer(), v.minValue(1)),
  activePuzzles: v.record(v.string(), ActivePuzzleSchema),
  clearRecords: v.record(v.string(), PuzzleClearRecordSchema),
  settings: UserSettingsSchema,
  installedAt: v.pipe(v.number(), v.integer(), v.minValue(0)),
});

export type SaveData = v.InferOutput<typeof SaveDataSchema>;
export type ActivePuzzleSave = v.InferOutput<typeof ActivePuzzleSchema>;
export type PuzzleClearRecord = v.InferOutput<typeof PuzzleClearRecordSchema>;
export type UserSettings = v.InferOutput<typeof UserSettingsSchema>;
export type HistorySnapshotSave = v.InferOutput<typeof HistorySnapshotSchema>;

export function defaultSaveData(): SaveData {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    activePuzzles: {},
    clearRecords: {},
    settings: {
      audio: { master: 0.7, bgm: 0.5, se: 0.7, muteOnBlur: true, bgmEnabled: false },
      a11y: { reduceMotion: false, highContrast: false },
    },
    installedAt: Date.now(),
  };
}

export interface SaveBackend {
  load(): SaveData | null;
  save(data: SaveData): void;
  clear(): void;
}

export class LocalStorageBackend implements SaveBackend {
  load(): SaveData | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as SaveData;
    } catch {
      return null;
    }
  }
  save(data: SaveData): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('[save] localStorage save failed', e);
    }
  }
  clear(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
}

/** インメモリ backend (test 用) */
export class InMemoryBackend implements SaveBackend {
  private data: SaveData | null = null;
  load(): SaveData | null {
    return this.data;
  }
  save(d: SaveData): void {
    this.data = d;
  }
  clear(): void {
    this.data = null;
  }
}

const migrations: Record<number, (data: unknown) => unknown> = {
  1: (d) => d,
};

/**
 * load → migrate → Valibot 検証 → 失敗時はバックアップ退避 + 空セーブ初期化 (§93.5)。
 */
export function loadAndMigrate(backend: SaveBackend): SaveData {
  const raw = backend.load();
  if (!raw) return defaultSaveData();
  try {
    const startVer = (raw as { schemaVersion?: number }).schemaVersion ?? 1;
    let data: unknown = raw;
    for (let v = startVer; v <= CURRENT_SCHEMA_VERSION; v++) {
      const m = migrations[v];
      if (m) data = m(data);
    }
    (data as { schemaVersion: number }).schemaVersion = CURRENT_SCHEMA_VERSION;
    const parsed = v.safeParse(SaveDataSchema, data);
    if (!parsed.success) {
      throw new Error(`SaveData validation failed: ${JSON.stringify(parsed.issues).slice(0, 200)}`);
    }
    return parsed.output;
  } catch (e) {
    console.warn('[save] corrupted savedata, resetting', e);
    try {
      const backupKey = `pixels-savedata-backup-${Date.now()}`;
      localStorage.setItem(backupKey, JSON.stringify(raw));
    } catch {
      /* ignore */
    }
    backend.clear();
    return defaultSaveData();
  }
}

/** debounce ヘルパ (es-toolkit 等を使わず最小実装) */
export function debounce<T extends (...args: never[]) => void>(
  fn: T,
  ms: number,
): T & { flush: () => void; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: Parameters<T> | null = null;
  const wrapped = ((...args: Parameters<T>) => {
    lastArgs = args;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (lastArgs) fn(...lastArgs);
      lastArgs = null;
    }, ms);
  }) as T & { flush: () => void; cancel: () => void };
  wrapped.flush = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (lastArgs) {
      fn(...lastArgs);
      lastArgs = null;
    }
  };
  wrapped.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    lastArgs = null;
  };
  return wrapped;
}
