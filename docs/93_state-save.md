# 93. セーブ / ステート

## 13.1 設計目標 (Round 5 / ピクセルズ仕様)

- ローカル永続化を **LocalStorage** で実装 (旧 IndexedDB 方針は MVP には過剰、Gemini Pro deep 指摘で変更)
- セーブは小さく (1 パズルあたり ~1KB)、書き込みは **debounce** (数秒、または中断時)
- 進行中のパズル + クリア履歴 + ベストタイム + 設定 を保存
- 将来クラウド同期 (任意) を追加できる抽象層 (`SaveBackend` interface)
- iOS Safari の 7 日無アクセス削除リスクは継続課題 (§13.9)、ホーム画面追加促進で軽減

## 13.2 データモデル

```typescript
// Round 6 で実装する型定義のドラフト:

export type CellState = 'empty' | 'filled' | 'x';
export type PuzzleId = string;

export interface ActivePuzzleSave {
  puzzleId: PuzzleId;
  cells: CellState[];                    // 進行中の盤面 (W*H 要素)
  rowMarks: boolean[][];                 // ヒント取り消し線状態 (§60)
  colMarks: boolean[][];
  startedAtMs: number;                   // 開始時刻 (Date.now())
  elapsedMs: number;                     // 経過時間 (ms)、バックグラウンド中は加算しない
  isPaused: boolean;
}

export interface PuzzleClearRecord {
  puzzleId: PuzzleId;
  bestTimeMs: number;
  clearCount: number;
  firstClearedAt: number;                // Date.now()
  lastClearedAt: number;
}

export interface UserSettings {
  audio: { master: number; bgm: number; se: number; muteOnBlur: boolean };
  a11y: { reduceMotion: boolean; highContrast: boolean };
  display: { renderer: 'auto' | 'canvas2d' | 'webgl' | 'webgpu' };
  input: { keyBindings: Record<string, string> }; // §90.5.2
}

export interface SaveData {
  schemaVersion: number;                 // マイグレーション用
  activePuzzles: Record<PuzzleId, ActivePuzzleSave>; // 中断中のパズル
  clearRecords: Record<PuzzleId, PuzzleClearRecord>;
  settings: UserSettings;
  installedAt: number;                   // 初回起動時刻 (Date.now())
}
```

## 13.3 ストレージ実装 (LocalStorage)

```typescript
const STORAGE_KEY = 'pixels-savedata-v1';

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
      // QuotaExceededError 等
      console.warn('[save] localStorage save failed', e);
    }
  }

  clear(): void {
    localStorage.removeItem(STORAGE_KEY);
  }
}

export interface SaveBackend {
  load(): SaveData | null;
  save(data: SaveData): void;
  clear(): void;
}

// 将来用 (v1.1 以降):
// class IndexedDBBackend implements SaveBackend {} // セーブが大きくなったら
// class CloudBackend implements SaveBackend {}     // §14.15 v1.1 計画
```

## 13.4 debounce 書き込み

セル変更ごとに書き込むと過剰なため、**debounce 1〜2 秒** で最終状態のみ保存:

```typescript
import { debounce } from 'es-toolkit'; // または独自実装

const debouncedSave = debounce((data: SaveData) => {
  backend.save(data);
}, 1500); // 1.5 秒

// セル変更時:
function onCellChange(state: GameState) {
  debouncedSave(state.toSaveData());
}

// 中断時 (visibilitychange / beforeunload) は debounce を flush して即時保存:
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    debouncedSave.flush(); // 即時実行
  }
});
window.addEventListener('beforeunload', () => {
  debouncedSave.flush();
});
```

## 13.5 マイグレーション + Valibot 検証 (改ざん耐性) (Round 5 / Gemini Pro deep 指摘で強化)

LocalStorage はユーザーが DevTools で容易に改ざん可能なため、**読み込み時に Valibot で厳密検証** + **失敗時はフェイルセーフ初期化** が必須:

```typescript
import * as v from 'valibot';

// SaveData の Valibot Schema (詳細は別途定義)
const SaveDataSchema = v.object({
  schemaVersion: v.pipe(v.number(), v.integer(), v.minValue(1)),
  activePuzzles: v.record(v.string(), ActivePuzzleSchema),
  clearRecords: v.record(v.string(), PuzzleClearRecordSchema),
  settings: UserSettingsSchema,
  installedAt: v.pipe(v.number(), v.integer(), v.minValue(0)),
});

const migrations: Record<number, (data: any) => any> = {
  1: (d) => d,                       // v1: 初版
  // v2: (d) => ({ ...d, ... })      // 将来
};

export function loadAndMigrate(): SaveData | null {
  const raw = backend.load();         // LocalStorageBackend.load() → SaveData | null
  if (!raw) return null;
  try {
    // 1. マイグレーション
    const startVer = raw?.schemaVersion ?? 1;
    let data = raw;
    for (let v = startVer; v <= CURRENT_SCHEMA_VERSION; v++) {
      data = migrations[v]!(data);
    }
    data.schemaVersion = CURRENT_SCHEMA_VERSION;
    // 2. Valibot で型 + 範囲を厳密検証
    const parsed = v.safeParse(SaveDataSchema, data);
    if (!parsed.success) {
      throw new Error(`SaveData validation failed: ${JSON.stringify(parsed.issues)}`);
    }
    // 3. 追加: cells 配列の長さが size.w * size.h と一致するか等の cross-field 検証
    validateCrossFields(parsed.output);
    return parsed.output;
  } catch (e) {
    // フェイルセーフ: 壊れた / 改ざんされたセーブはバックアップキーに退避してから捨てる
    console.warn('[save] corrupted or tampered savedata, resetting', e);
    const backupKey = `pixels-savedata-backup-${Date.now()}`;
    localStorage.setItem(backupKey, JSON.stringify(raw));
    backend.clear();
    return null;            // 呼び出し側は "新規セーブ" として扱う
  }
}

function validateCrossFields(data: SaveData): void {
  // 各 activePuzzle の cells.length === width * height、CellState は enum 内 など
  // 不正があれば throw new Error()
}
```

> **セキュリティ補足**: LocalStorage は同オリジンの JS から読み書き自由なので、改ざんは "セキュリティ脅威" ではなく "クライアント側のデータ整合性問題"。Valibot 検証で「破損データを物理層に流さない」のが目的。サーバ側で改ざん検知が必要なら v1.1 でクラウドセーブ + ハッシュ検証を実装 (§14.15.2)。

## 13.6 タイマー (経過時間) の扱い

- パズル開始時に `startedAtMs = Date.now()` 記録
- バックグラウンド (visibilitychange で hidden) 中は計測停止
- `elapsedMs` を debounced save と同じタイミングで更新

```typescript
let lastTickAt: number | null = null;
let elapsedMs = 0;

function startTimer() {
  lastTickAt = performance.now();
  requestAnimationFrame(tick);
}

function tick(now: number) {
  if (lastTickAt === null) return;
  elapsedMs += now - lastTickAt;
  lastTickAt = now;
  if (!document.hidden && !isPaused) {
    requestAnimationFrame(tick);
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    lastTickAt = null; // 計測停止
  } else if (!isPaused) {
    startTimer(); // 再開
  }
});
```

## 13.7 容量

- 1 パズル進行中セーブ: ~1KB (15×15 = 225 セル × 2byte JSON 表現)
- クリア履歴: 1 パズルあたり ~100 バイト
- 設定: ~500 バイト
- LocalStorage の上限 (5MB) には全く触れない

## 13.8 プライベートブラウジング

- 一部ブラウザ (Safari 等) では LocalStorage が一時的領域に置かれ、タブ閉じで消える
- 検出方法: `localStorage.setItem('test', '1')` がエラーを投げるかで判定
- 失敗時は UI で「進行が消える可能性」を通知、続行は許可

## 13.9 iOS Safari の 7 日無アクセス削除リスク (継続課題)

旧仕様 §13.9 (Round 3) で詳述した iOS Safari の **「ホーム画面追加なし + 7 日アクセスなし」で OS が無警告全削除** リスクは LocalStorage でも適用される (むしろ IndexedDB と同等)。

緩和策 (継続):
- ホーム画面追加 (PWA インストール) 促進 UI (§13.9.3)
- `navigator.storage.persist()` 要求
- セーブの export / import 機能 (テキスト形式 + クリップボードコピー、§13.9.4)
- v1.1 でクラウドセーブ (§14.15.2 Cloudflare D1 + Firebase Auth)

## 13.10 旧仕様との対応

| 旧 §93 (プラットフォーマー) | 新 §93 (ノノグラム) |
|---|---|
| IndexedDB + 抽象 SaveBackend | **LocalStorage** + debounce (Gemini Pro deep 指摘) |
| Save → Profile → World[] → Stage[] | パズル単位 (PuzzleId キー) のフラット構造 |
| 決定論シード (rngSeed) | 不要 (パズルは静的、RNG なし) |
| ライフ / コイン / スコア / highScore | クリア時間 / クリア回数 / ベストタイム |
| パワーアップ階層 | なし |

旧 §93 のうち、IndexedDB 採用部分は **MVP では撤回**。LocalStorage で代替。v1.1 でクラウドセーブを実装する際に IndexedDB を再評価。
