# 93. セーブ/ステート

## 13.1 設計目標

- ローカル永続化を **IndexedDB** で実装。失敗時のフォールバック (`localStorage`) も用意。
- セーブは小さく、トランザクション安全。クリア時の自己修復が容易。
- 将来クラウド同期 (任意) を追加できる抽象層 (`SaveBackend` interface)。
- 決定論シードを保存し、リプレイを再現可能にする。

## 13.2 データモデル

```ts
interface SaveFile {
  version: number;                  // schema version
  profile: { id: string; name: string; createdAt: number };
  progress: {
    worldsUnlocked: number;
    stagesCleared: { [key: string]: { time: number; score: number } };
    coins: number;
    lives: number;
    highScore: number;
  };
  settings: {
    input: { binding: InputBinding };
    audio: { master: number; bgm: number; se: number; muteOnBlur: boolean };
    a11y: { reduceMotion: boolean; highContrast: boolean; subtitles: boolean; coyoteBoost: boolean };
    display: { renderer: 'auto'|'canvas2d'|'webgl'|'webgpu'; subpixelMotion: boolean; crtFilter: boolean };
  };
  rngSeed: number;                  // 決定論用 (新規ステージ開始時に派生)
}
```

- スキーマバージョンは migration 層 (§13.5) で管理。
- 「進行中のステージ状態 (中間旗以降)」はセッション内 (`sessionStorage` 相当のメモリ) のみ。クラッシュ時に再開はしない (古典互換)。

## 13.3 ストレージ実装

```ts
// IndexedDB (object store: "save", key: profileId)
async function loadSave(profileId): Promise<SaveFile | null>;
async function saveSave(file: SaveFile): Promise<void>;

// 抽象化
interface SaveBackend {
  load(): Promise<SaveFile | null>;
  save(file: SaveFile): Promise<void>;
}

class IndexedDBBackend implements SaveBackend { /* 主 */ }
class LocalStorageBackend implements SaveBackend { /* fallback */ }
class CloudBackend implements SaveBackend { /* 将来 */ }
```

- IndexedDB のキーは `profileId`、`version` を必ず含める。
- 大きなオブジェクトを 1 record で保存しない (`structuredClone` がメインスレッド占有)。代わりに `progress` と `settings` を別 record に分割可能。

## 13.4 トランザクション設計

- 「クリア → 新規書込」は **同一トランザクション内**で行う (途中失敗で消失防止)。
- 書込前に schema 整合性をバリデート (Zod や手書きチェック)。

## 13.5 マイグレーション

```ts
const migrations: Record<number, (file: any) => any> = {
  1: (f) => f,
  2: (f) => ({ ...f, settings: { ...f.settings, a11y: defaultA11y() } }),
  // ...
};
```

- ロード時に `file.version` を見て不足分のマイグレーションを順に適用。
- 失敗した場合は壊れたセーブをバックアップして空セーブで起動 (新規プロファイル UI を表示)。

## 13.6 リプレイ用シード

- 各ステージの `RNG seed` をステージ開始時に save 内 `rngSeed` から派生 (`hash(profileId, stageId, attempt)`)。
- 入力スナップショット (§90) と組み合わせれば、同一プロファイル × 同一試行回数で完全再現可能。
- リプレイのエクスポートは MVP 範囲外。

## 13.7 クラウド同期 (v1.1, Round 3 / Issue #18 で計画確定)

- `CloudBackend` の最小契約: `load` / `save` / `lastModified`。
- 単一プロファイルの "last writer wins" を既定。コンフリクト UI は将来。
- **採用サービス (v1.1)**: Cloudflare D1 (セーブメタ + 設定) + Cloudflare R2 (リプレイ等の大物) + Firebase Auth (Sign in with Apple / Google) のハイブリッド構成 (§14.15 参照)。
- **認証**: Firebase Auth (Spark プラン無料枠で十分)。Cloudflare Access は B2B 寄りで本作の OAuth には不向き。
- **MVP には含めない理由**: 認証 + バックエンドの導入は仕様書/実装の複雑度を一気に押し上げる。MVP は IndexedDB + export/import (§13.9.4) + ホーム画面追加促進 UI (§13.9.3) で「ローカル運用 + 緩和策」に留める。
- **v1.1 移行時の互換性**: `SaveBackend` インタフェースを満たす `CloudBackend` を追加するだけで、既存の `IndexedDBBackend` と並走可能。マイグレーションは「初回 Cloud ログイン時に IndexedDB を Cloud にアップロード → 以降 Cloud を主、IndexedDB をオフラインキャッシュとして併用」の流れ。

## 13.8 容量

- セーブ全体 ~5KB 程度を想定。IndexedDB の上限 (50MB+) には全く触れない。
- ただし「自由保存スロット」(将来のリプレイ保存) 等を見越し、容量上限の警告 UI を実装 (`navigator.storage.estimate()`)。

## 13.9 プライベートブラウジング / iOS Safari の 7 日消失リスク (Round 3 / Issue #18)

- 一部ブラウザ (Safari 等) では IndexedDB が一時的領域に置かれ、タブ閉じで消える。
- セーブ完了後に `navigator.storage.persist()` を要求し、ストレージの永続化を試みる。失敗時はユーザーに通知。

### 13.9.1 iOS Safari の 7 日無アクセスでの全削除 (深刻度: 高, Round 3 / Gemini Pro deep)

iOS Safari (および iPadOS) では、**ホーム画面に追加されていない通常 Safari タブ** からアクセスしている場合、
**最後のユーザー操作から 7 日間アクセスが無いと、IndexedDB / Cache API / LocalStorage を OS が無警告で全削除** する (Apple ITP, Intelligent Tracking Prevention 由来の仕様)。
これは本作のような長期プレイ前提のゲームにとって、**セーブデータが突然全消失する致命的リスク** となる。

#### 13.9.2 緩和策 (MVP)

| 対策 | 実装範囲 | 効果 |
|---|---|---|
| **ホーム画面追加 (PWA インストール) 促進 UI** | MVP 必須 | Add-to-Home-Screen された PWA は ITP 7 日タイマーの対象外 (Apple 公式)。最も確実な緩和策 |
| **`navigator.storage.persist()` 要求** | MVP 必須 | "persisted storage" として宣言できれば 7 日タイマー対象外。ただし iOS Safari は通常 false を返す (PWA インストール済かつ追加条件成立時のみ true) |
| **セーブの export / import 機能** | **MVP 必須**: テキスト形式 (Base64 圧縮 JSON) でクリップボードコピー可能にする。万一消失しても復旧可能 | 最低限の保険 |
| **クラウドセーブ (Cloudflare D1/R2 + 認証)** | v1.1 で正式実装 (§14.15 参照) | 完全な永続化。MVP 範囲外 |

#### 13.9.3 ホーム画面追加促進 UI の方針

- 初回起動時 + 30 分プレイ達成時の 2 タイミングで、`beforeinstallprompt` イベントを保持して install prompt を発火 (Android Chrome / Desktop Chrome)。
- iOS Safari は `beforeinstallprompt` をサポートしないため、「共有 → ホーム画面に追加」の手順を画像付きで案内するモーダルを表示する。
- 「あとで」を選んだ場合は次回起動時の表示頻度を下げる (1 週間後)。
- すでにホーム画面追加済 (PWA standalone モード) の判定: `window.matchMedia('(display-mode: standalone)').matches`。

### 13.9.4 export / import 機能の最小実装

UTF-8 safe な Base64 変換は **`TextEncoder` / `TextDecoder` を使う** (Round 3 / Gemini Pro 指摘)。`escape` / `unescape` は ECMAScript で deprecated 扱いのため使用禁止。

```ts
// save/export.ts
export function exportSave(file: SaveFile): string {
  const json = JSON.stringify(file);
  const bytes = new TextEncoder().encode(json);                 // UTF-8 bytes
  // btoa は ASCII しか受け付けないため bytes → binary string に変換
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export function importSave(blob: string): SaveFile {
  const binary = atob(blob);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const json = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const raw: unknown = JSON.parse(json);
  const parsed = v.safeParse(SaveSchema, raw);                  // §13.4 / §14.2.3 と同じ Valibot 検証
  if (!parsed.success) throw new SaveImportError(parsed.issues);
  return parsed.output;
}

// ui/settings/save-export.tsx の挙動
// - "セーブをコピー" ボタン → exportSave → navigator.clipboard.writeText
// - "セーブを読み込む" ボタン → textarea から貼り付け → importSave → 上書き確認 → save
```

- セーブサイズ ~5KB (§13.8) なら Base64 化して 7KB 程度。クリップボード経由で共有可能。
- iOS Safari は `navigator.clipboard.writeText` をユーザージェスチャー内同期呼び出しのみ許可するため、Audio と同じ制約 (§12.3.1)。
- バリデーションは Valibot で行い、改ざんセーブを物理層に流さない (§14.2.3)。
- `TextDecoder` は `{ fatal: true }` で不正バイト列を例外化 (Base64 改ざん検知の最初の防御線)。

## 13.10 セキュリティ/プライバシ

- 個人情報を保存しない。
- 本作はサーバとの通信を不要にする (PWA, 完全クライアント)。クラウド同期を入れる際にプライバシーポリシーを別途。
- セーブデータの **HMAC 署名** はローカル単独運用では過剰。シングルプレイ前提のため改ざんは事実上ユーザーの自由。
- ただし将来 **クラウド同期** や **リーダーボード** を実装する場合、サーバ側でスコア・コインの同期受信時に妥当性検証 (時系列・最大増分のサニティチェック) を行うこと。送信前にクライアント署名を加える方式は採らない (秘密鍵がクライアントに置けないため)。

## 13.11 エラーハンドリング

| ケース | 挙動 |
|---|---|
| `load` 失敗 (parse エラー) | 壊れたセーブを `save_backup_v<schema-version>_<timestamp>` キーに退避してから既定セーブで起動。UI で警告表示。退避領域はユーザー操作でエクスポート可能 |
| `save` 失敗 (容量不足等) | UI で通知、リトライボタン提示、ゲームは継続 |
| 永続化拒否 (browser policy) | UI で「進行が消える可能性」を通知、続行は許可 |
| 同時開かれた別タブの上書き競合 | `BroadcastChannel` で「他タブで保存された」イベントを通知し、当該タブを再ロード推奨 |
