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

## 13.7 クラウド同期 (将来)

- `CloudBackend` の最小契約: `load` / `save` / `lastModified`。
- 単一プロファイルの "last writer wins" を既定。コンフリクト UI は将来。
- 認証は OAuth (Google 等)。MVP 範囲外。

## 13.8 容量

- セーブ全体 ~5KB 程度を想定。IndexedDB の上限 (50MB+) には全く触れない。
- ただし「自由保存スロット」(将来のリプレイ保存) 等を見越し、容量上限の警告 UI を実装 (`navigator.storage.estimate()`)。

## 13.9 プライベートブラウジング

- 一部ブラウザ (Safari 等) では IndexedDB が一時的領域に置かれ、タブ閉じで消える。
- セーブ完了後に `navigator.storage.persist()` を要求し、ストレージの永続化を試みる。失敗時はユーザーに通知。

## 13.10 セキュリティ/プライバシ

- 個人情報を保存しない。
- 本作はサーバとの通信を不要にする (PWA, 完全クライアント)。クラウド同期を入れる際にプライバシーポリシーを別途。

## 13.11 エラーハンドリング

| ケース | 挙動 |
|---|---|
| `load` 失敗 (parse エラー) | 既定セーブで起動、UI で警告表示、壊れたセーブをエクスポート可能に |
| `save` 失敗 (容量不足等) | UI で通知、リトライボタン提示、ゲームは継続 |
| 永続化拒否 (browser policy) | UI で「進行が消える可能性」を通知、続行は許可 |
| 同時開かれた別タブの上書き競合 | `BroadcastChannel` で「他タブで保存された」イベントを通知し、当該タブを再ロード推奨 |
