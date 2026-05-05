# 94. アーキテクチャ (Round 5: ピクセルズ仕様)

## 14.1 全体構成

```
src/
├── core/             # 盤面モデル / ヒント / クリア判定 (DOM 非依存)
├── game/             # ゲームロジック (Zustand store + reducer)
├── render/           # 描画レイヤ (Pixi.js v8 で盤面描画)
├── audio/            # 音声レイヤ (Howler)
├── input/            # 入力アダプタ (Mouse / Keyboard / Touch → action)
├── save/             # セーブバックエンド (LocalStorage + debounce, §93)
├── ui/               # メニュー, HUD, パズル選択, モード切替ボタン (React)
├── platform/         # PWA / Service Worker / 環境検出
└── main.tsx          # エントリ
```

- `core/` は **DOM 非依存**。Bun でテスト可能。
- `core/` + `game/` は **決定論** (同じ操作列 + 同じパズルから常に同じ結果)。
- `ui/` は React (HUD, メニュー, モード切替ボタン) で構築。盤面描画は Pixi.js v8 ref 経由 (旧仕様 §14.2.2 のハイブリッドを継続、§91)。

## 14.2 状態管理 (Zustand 中心、bitECS 不採用) (Round 5 で方針変更)

旧 Round 2-4 では bitECS を採用していたが、Round 5 (ノノグラム) では:

- **アクター数 = 1 (カーソル)**、固定盤面 (5×5〜15×15) のみ
- リアルタイム更新がない (ユーザー操作時のみ state 変更)
- bitECS の TypedArray SoA メリットが活きない

→ **bitECS は Round 6 で削除**、シンプルな **Zustand store** で全状態を管理する。

### 14.2.1 Store 構成 (ドラフト)

> **重要 (Round 5 / Gemini Pro deep 指摘)**: 盤面 `cells` は **1 次元配列** で持つ (`cells: CellState[]`、length = W × H、§20.4)。2 次元配列 `cells[row][col]` だと Zustand の参照比較で再描画されないバグ (深いミューテーション時) が起きやすい。1 次元配列なら `cells.slice()` で全コピー or 単一インデックス更新 (`cells.with(i, newValue)` または `[...cells.slice(0, i), newValue, ...cells.slice(i + 1)]`) で安全に更新できる。Immer の使用も検討可能 (依存追加が必要、MVP では標準 spread で済むため後送り)。

```typescript
// Round 6 で実装する Zustand store のドラフト:

import { create } from 'zustand';

interface GameStore {
  // パズルロード
  currentPuzzle: PuzzleData | null;
  puzzleIndex: PuzzleIndex | null;

  // 進行中盤面
  board: Board;                          // §20 セル配列
  cursor: Cursor;                        // §40 カーソル位置 + モード
  clueMarks: ClueMarkState;              // §60 ヒント取り消し線
  elapsedMs: number;                     // §93 経過時間
  isPaused: boolean;
  isCleared: boolean;

  // クリア履歴 + 設定
  clearRecords: Record<PuzzleId, PuzzleClearRecord>;
  settings: UserSettings;

  // Actions (immutable update)
  loadPuzzle: (puzzle: PuzzleData) => void;
  setCursor: (col: number, row: number) => void;
  setMode: (mode: InputMode) => void;
  applyToCell: (col: number, row: number, action: 'fill' | 'mark-x' | 'erase') => void;
  toggleRowMark: (row: number, hintIndex: number) => void;
  toggleColMark: (col: number, hintIndex: number) => void;
  resetBoard: () => void;
  pauseTimer: () => void;
  resumeTimer: () => void;
  finishPuzzle: () => void;
}

export const useGame = create<GameStore>((set, get) => ({
  // ... 実装は Round 6
}));
```

### 14.2.2 ハイブリッド (UI = React / Canvas = Pixi.js)

旧仕様 (Round 2) のハイブリッド構成は **本作でも継続**:

| 領域 | 実装 | 状態管理 |
| :--- | :--- | :--- |
| 盤面描画 (Canvas) | Pixi.js v8 + ref 経由マウント | `useGame` store を購読、変更時に再描画 |
| HUD (経過時間 / モード切替ボタン / ベストタイム) | React コンポーネント | `useGame` の Zustand selector |
| メニュー / パズル選択 / 設定 | React + 軽量ルーティング (Zustand state で管理) | 同上 |
| セーブデータ | save/ レイヤが LocalStorage を直接読み書き | debounce で `useGame` から save/ へ Push (§93) |

Pixi.js Canvas は React ツリー内 `<div ref={canvasRef}>` に append (Round 4 / Step A の方針継続)。

### 14.2.3 Valibot Schema-first (継承)

Round 2 で確定した Valibot Schema-first は本作でも継承:
- パズル JSON のロード時検証 (§80.6)
- セーブデータのマイグレーション後検証 (§93.5)
- 入力 action の type guard (§90.3)

> **旧 §14.2.1 bitECS の採用ガイドライン (Round 4 まで存在)**: ピクセルズでは bitECS を不採用とするため、本セクションは廃止。Round 6 で旧コード (src/core/world.ts / game/systems/*.ts 等) を削除する。

### 14.2.2 ハイブリッド状態管理 (コア Vanilla + UI Zustand) (Round 2 / Issue #11)

ゲームループそのものを React の reconciler に乗せると、Web Audio や入力レイテンシが UI レンダリング負荷で阻害され (Round 2 / E10 専門家見解)、アクションゲームには致命的な音ズレ・入力遅延が発生する。本作では下記のハイブリッド構成を採用する:

> **旧 §14.2.2 テーブル + コード例 (bitECS + SMB1 物理ベース、Round 4 まで存在)**: ピクセルズでは bitECS / 物理ループを使わず Zustand store 中心 (上記 §14.2.1 参照) のため、本セクションは Round 5 で要約のみに変更。詳細な Zustand 実装例は §14.2.1 のドラフトに集約。

- **境界**: `ui/` レイヤは `core` / `game` の関数を直接呼ばず、Zustand store を通じて読み出すだけ (一方向データフロー)。
- **更新頻度**: ノノグラムはユーザー操作時のみ更新、HUD はタイマー (1 秒に 1 回) と中断/再開ボタン以外は再描画頻度低。
- **Zustand 採用の根拠**: 軽量、フックベース、selector で再描画範囲を絞れる。Jotai は MVP では不要。

### 14.2.3 Valibot Schema-first (Round 2 / Issue #11)

パズル JSON / セーブデータ / 入力 action の **すべての境界バリデーションを Valibot で行う**。Zod ではなく Valibot を採用する理由:

- **バンドルサイズ**: Valibot 0.33 はモジュラー設計で tree-shake に強く、本作で必要な機能だけで Zod の 1/10 程度。本作のクライアントペイロード予算 (初回 < 500KB, §14.9) に直接効く。
- **型生成**: スキーマから TS 型を `Output<typeof Schema>` で生成可能。エディタ側 (将来) とゲーム側のパースが常に同期 (Round 2 / E8, E9 専門家見解)。
- **エラーメッセージのカスタマイズ**: パズルデザイナ向けに「ヒント数値が範囲外」「solution と meta.size 不一致」等の人間可読メッセージを Cross-field 検証で出せる。

詳細は §80 (パズルデータスキーマ) と §93 (セーブデータスキーマ) で扱う。本章では原則のみ:

- すべての外部入力 (ステージ JSON, セーブ JSON, リプレイ JSON, クラウド同期 payload) は **`safeParse` で型ガード**してから物理層に流す。
- バリデーション失敗時は ① ロード拒否 + ② ユーザー通知 (HUD トースト) + ③ テレメトリ送出 (将来)。
- 型は `Output<typeof StageSchema>` のような derive のみとし、別途手書き interface を作らない (Single Source of Truth)。

## 14.3 ゲームループ (固定タイムステップ)

```ts
const dt = 1 / 60;          // 物理 60Hz
let acc = 0;
let prevTime = performance.now();

function frame(now: number) {
  const elapsed = Math.min((now - prevTime) / 1000, 0.25);  // 上限 250ms (spiral of death 防止)
  prevTime = now;
  acc += elapsed;
  while (acc >= dt) {
    inputBuffer.beginFrame();
    physicsStep(world, inputBuffer.snapshot, dt);
    acc -= dt;
  }
  const alpha = acc / dt;   // 補間係数
  render(world, alpha);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
```

- 物理は固定 dt。描画は rAF + 補間。
- `elapsed` を 250ms にクリップして spiral of death を防ぐ (Gaffer on Games)。
- タブ切替で時間が飛んだ場合も同様にクリップされる。

## 14.4 入力スナップショット境界

- 入力は **frame 開始時** にスナップ。frame 内で値が変わらない (デバウンス効果)。
- 入力イベントはキューに溜め、`beginFrame` で論理状態に反映。

## 14.5 決定論

- すべての乱数は `mulberry32(seed)` 等の seedable PRNG を使用。
- グローバル状態 (singleton) を使わない。`world` をすべての関数の引数で受け渡す。
- 浮動小数を内部で使わない (描画補間のみ float)。
- このルールを守れば、入力列とシードが同じなら **完全再現** 可能。

## 14.6 モジュール境界 (依存関係)

```
core ⇐ game ⇐ render
              ⇐ audio
              ⇐ ui
input → game (snapshotのみ提供)
save  → game (永続化IF)
platform は全モジュールから利用される (環境検出のみ)
```

- 矢印は依存方向 (右が左に依存)。
- `core` は他に依存しない (純粋関数群)。
- `game` は `core` のみに依存 (DOM/Audio 抽象化)。
- 依存を強制するため TypeScript の `references` か `eslint` ルールで違反検出。

## 14.7 コード規約

- TypeScript ベース、`strict: true`。
- 命名: PascalCase (型, クラス), camelCase (変数, 関数), SCREAMING_SNAKE_CASE (定数)。
- 物理定数は `core/physics-constants.ts` にまとめ、SoT を 1 ファイルにする。
- 公開 API には JSDoc を付ける (内部関数は最小限)。

## 14.8 テスト戦略

| レベル | 手段 |
|---|---|
| 単体 (core) | **`bun test` (Bun 内蔵ランナー)**。整数物理の境界値テスト。 |
| 単体 (game) | 入力列 → 期待状態の決定論テスト (bitECS world のスナップショット比較)。 |
| 統合 | ヘッドレスシミュレーション (Pixi.js を mock、bitECS systems のみで物理を完走)。 |
| E2E | **Playwright 1.45+ で実機ブラウザ操作 (Chrome / Firefox / Safari)**。WebGPU/WebGL2/Canvas2D の 3 系統で fallback 動作も確認 (§11.2.1)。 |
| 性能 | フレーム毎 update 時間の percentile を CI で記録 (回帰検出)。`performance.now()` を計測しテレメトリ化。 |

> 詳細は §95.6 (Round 2 / Issue #14 反映予定) で再定義。

## 14.9 ビルドとバンドル

> 各ツールの正確なバージョン番号は §14.14 (T5 PR で正式表に差し替え予定) にまとめる。本節ではツール名 / メジャーバージョンレンジのみで言及する。

- **ランタイム / パッケージマネージャ**: **Bun** (§14.14)。
- **バンドラ**: **Vite 6 系** (dev サーバ + esbuild/Rollup ビルド)。HMR と PWA プラグインの成熟度から本作の MVP に最適 (Round 2 / E11, E12 専門家見解)。
- **言語**: TypeScript (`strict: true`, `exactOptionalPropertyTypes: true`)。
- **リンタ/フォーマッタ**: Biome (ESLint/Prettier の代替, 高速)。
- **出力**: `index.html`, `app.js`, `app.css`, スプライトアトラス、ステージ JSON、Service Worker (`vite-plugin-pwa` が生成)。
- **dev サーバ**: `https://localhost` (Gamepad API は secure context 必須, §9.6.3)。Vite 公式の **`@vitejs/plugin-basic-ssl`** で自己署名証明書を自動生成する (素のまま自己署名するとブラウザの `NET::ERR_CERT_AUTHORITY_INVALID` を毎起動踏むため、本プラグインで初回信頼許可後はキャッシュされる)。
- HTTP/2 + Brotli/GZIP で初回 < 500KB を目標。

## 14.10 PWA (Round 2 / Issue #11 で範囲縮小, Round 3 / Issue #18 で iOS 制約を明記)

**MVP スコープ**: オフラインキャッシュ + フルスクリーン起動の 2 機能のみ。Push / Sync / Background Fetch は **不採用**。

- `vite-plugin-pwa@0.20.0` で Service Worker を自動生成。
- 全アセットを **precache** + ステージ JSON は **stale-while-revalidate** 戦略。
- バージョンアップ時は SW の `activate` で旧キャッシュを破棄。
- 通知を表示してユーザーがリロードを選択するまで旧版を維持 (UX 安定優先)。
- **不採用機能**: Push API (ゲーム体験を阻害する通知ノイズ)、Background Sync (サーバ依存のオンライン専用ゲーム前提でないため不要)、Web Share Target / Periodic Sync (MVP 範囲外)。
- フルスクリーン起動は Web App Manifest の `display: 'standalone'` + `display_override: ['fullscreen', 'standalone']` で対応。

### 14.10.1 iOS Safari の PWA 制約 (Round 3 / Issue #18)

iOS Safari は他ブラウザと比べて PWA 関連 API のサポートが限定的で、本作にも以下の影響がある:

| 機能 | iOS Safari の挙動 | 本作の対応 |
|---|---|---|
| `display_override: ['fullscreen']` | 実質 `standalone` 扱いとなり、上部ステータスバーを完全に隠せないケースがある | フルスクリーン化に依存しないレイアウト (§17.5 の `100svh` 採用)。HUD はステータスバー領域を避けて配置 (§17.5 の safe-area-inset 適用) |
| Push API | 完全非対応 (iOS 16+ で PWA 経由のみ部分対応、本作では不採用 §14.10) | 不採用方針と整合。ゲームに通知は使わない |
| `beforeinstallprompt` イベント | 非対応 (Add-to-Home-Screen は手動操作必須) | iOS では「共有 → ホーム画面に追加」の手順を画像付きで案内するモーダルを §13.9.3 で表示 |
| Background Sync / Periodic Sync | 完全非対応 | 不採用方針と整合 |
| IndexedDB / Cache API の永続性 | 7 日無アクセスで全削除 (§13.9.1) | Add-to-Home-Screen された PWA は対象外。ホーム画面追加促進が必須 |
| `navigator.storage.persist()` | 通常は false を返す (PWA インストール済かつ追加条件成立時のみ true) | best-effort で呼ぶが期待しない (§13.9.2) |
| ServiceWorker のストレージクオータ | 他ブラウザより厳しい (1GB 程度) | アセット合計 < 50MB を目標 (本作は十分収まる) |

**運用方針**: iOS Safari の制約は緩和不可能なものが多いため、「制約を前提にしたデザイン」と「ホーム画面追加で緩和される旨をユーザーに案内」の 2 軸で対応する。PWA 機能の追加採用 (Push 等) を将来検討する際も、iOS の対応状況を最優先で確認する。

## 14.11 開発支援

- `?debug=1` クエリで:
  - AABB 描画
  - 物理パラメータエディタ (実機で reload しないでもチューニング可能)
  - 入力 HUD
  - リプレイ録画/再生
- 本番では tree-shake で除外。

## 14.12 セキュリティ

- ステージ JSON はクライアントが直接ロード (改ざん前提)。サーバへの権限はなくスコアの "信頼ある記録" を目的にしない (将来クラウドで sign する想定)。
- CSP: `default-src 'self'`、Service Worker は同オリジンのみ。

## 14.13 マイクロステート機械 (Game-level FSM)

```
[Boot] -> [TitleScreen] -> [WorldMap] -> [StagePlay] -> [StageClear] -> [WorldMap]
                                              ↓
                                          [Pause]
                                              ↓
                                          [GameOver] -> [TitleScreen]
```

- Pause 中は物理停止、UI のみアクティブ。
- StageClear → WorldMap 遷移時に Save トリガー。

## 14.14 確定技術スタック (2026-05-05) — Round 2 (Issue #10 / T5)

本作の **2026-05-05 時点の確定バージョン** を以下に固定する。すべての主要依存に **絶対バージョン (caret `^` / tilde `~` 禁止)** を記載し、`bun.lockb` を Git 管理する。月次マイナー更新 + 即時/週次のセキュリティパッチを Renovate で運用する (§14.14.3)。

### 14.14.1 確定スタック表

| 区分 | パッケージ | バージョン | dep / dev | 用途 |
| :--- | :--- | :--- | :--- | :--- |
| ランタイム / PM | `bun` | `1.2.0` | (engines) | パッケージ管理 + テストランナー (§14.8) + dev スクリプト |
| 言語 | `typescript` | `5.8.2` | dev | `strict: true`, `exactOptionalPropertyTypes: true` |
| ビルド | `vite` | `6.0.0` | dev | dev サーバ (HTTPS) + 本番ビルド (§14.9) |
| dev HTTPS | `@vitejs/plugin-basic-ssl` | `1.1.0` | dev | Gamepad API は secure context 必須 (§9.6.3 / §14.9) |
| UI フレームワーク | `react` | `19.0.0` | dep | HUD / メニュー / 設定 (§14.2.2 ハイブリッド) |
| UI フレームワーク | `react-dom` | `19.0.0` | dep | React 用 DOM レンダラ |
| 状態管理 (UI) | `zustand` | `5.0.13` | dep | HUD / 設定の store (§14.2.2)。Issue #10 起票時の `5.1.0` は npm 未公開だったため `5.0.13` (2026-05 時点 v5 系最新) に補正 |
| ゲームレンダラ | `pixi.js` | `8.2.1` | dep | WebGPU 既定 / WebGL2 / Canvas2D の透過切替 (§11.2) |
| ECS | `bitecs` | `0.4.0` | dep | TypedArray SoA、systems pipeline (§14.2 / §14.2.1)。Issue #10 起票時の `0.9.6` は npm 未公開だったため `0.4.0` (2026-05 時点最新) に補正 |
| Web Audio | `howler` | `2.2.4` | dep | BGM / SE 軽量再生 (§92) |
| バリデーション | `valibot` | `0.33.0` | dep | ステージ / セーブ / リプレイ / 入力スナップショット (§14.2.3) |
| PWA | `vite-plugin-pwa` | `0.20.0` | dev | Service Worker 自動生成 (§14.10) |
| i18n | `i18next` | `23.11.0` | dep | 多言語 UI コア (§17.9) |
| i18n (React) | `react-i18next` | `14.1.2` | dep | React 用翻訳バインディング |
| リンタ / フォーマッタ | `@biomejs/biome` | `1.8.0` | dev | ESLint / Prettier 代替 (高速) |
| E2E テスト | `@playwright/test` | `1.45.0` | dev | クロスブラウザ E2E + WebGPU/WebGL2/Canvas2D 3 系統 (§14.8) |
| ユニットテスト | `bun test` | (内蔵) | — | Bun 内蔵ランナー (§14.8) |
| 物理 | (なし、ノノグラムのため) | — | — | 旧プラットフォーマー仕様の Custom AABB (整数+subpixel) は Round 5 で削除 |
| CI Action | `actions/checkout` | `v4.1.6` | (CI) | GitHub Actions 用 |
| CI Action | `oven-sh/setup-bun` | `v2.2.0` | (CI) | CI 上での Bun 環境構築 (Step F で実 marketplace の最新版に補正) |
| 型定義 (Bun 内蔵 API) | `@types/bun` | `1.3.13` | dev | `bun:test` 等の Bun 内蔵 API の型。Round 3 / 実装スケルトン構築時に追加 |
| Vite React プラグイン | `@vitejs/plugin-react` | `4.3.1` | dev | React 19 用の Vite プラグイン。Round 3 / 実装スケルトン構築時に追加 |
| 型定義 (Howler) | `@types/howler` | `2.2.11` | dev | Howler 用 |
| 型定義 (React) | `@types/react` | `19.0.0` | dev | React 19 用 |
| 型定義 (React DOM) | `@types/react-dom` | `19.0.0` | dev | React 19 用 |

### 14.14.2 dependencies / devDependencies の分離

- **dependencies (production)**: `pixi.js`, `react`, `react-dom`, `zustand`, `bitecs`, `valibot`, `howler`, `i18next`, `react-i18next`
- **devDependencies**: `typescript`, `vite`, `@vitejs/plugin-basic-ssl`, `@vitejs/plugin-react`, `vite-plugin-pwa`, `@biomejs/biome`, `@playwright/test`, `@types/bun`, `@types/howler`, `@types/react`, `@types/react-dom`
- **engines**: `package.json` の `engines.bun = "1.2.0"` を必須宣言

### 14.14.3 運用ポリシー

- すべての依存に **絶対バージョン** (`"react": "19.0.0"`)。`^` `~` は禁止。
- ロックファイル `bun.lock` (Bun 1.3+ の text 形式) を Git 管理。**Bun 1.2 時代の binary 形式 `bun.lockb` は使わない** (Round 3 / 実装スケルトン構築で確認、`bun.lock` は JSON-like で diff 可能・レビューに有利)。
- 依存追加は `bun add <pkg>@<version>` で常に絶対指定。
- **Renovate** で:
  - **パッチ** (セキュリティ含む): 即時/週次の自動 PR、自動 merge (E2E 通過時のみ)
  - **マイナー**: 月次の自動 PR、レビュー後 merge
  - **メジャー**: 手動レビュー、`needs-review` / `major-update` ラベル付与
- CI (GitHub Actions): E2E (Playwright) と `bun test` を必須化。Renovate PR の自動マージは E2E 通過時のみ。

### 14.14.4 Renovate 設定例 (`renovate.json`)

```json
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": [
    "config:recommended",
    ":dependencyDashboard",
    ":semanticCommits"
  ],
  "rangeStrategy": "pin",
  "prCreation": "not-pending",
  "lockFileMaintenance": { "enabled": true, "schedule": ["before 3am on monday"] },
  "vulnerabilityAlerts": { "enabled": true, "labels": ["security"] },
  "packageRules": [
    {
      "matchUpdateTypes": ["patch"],
      "automerge": true,
      "automergeType": "pr"
    },
    {
      "matchUpdateTypes": ["minor"],
      "schedule": ["before 3am on first day of month"]
    },
    {
      "matchUpdateTypes": ["major"],
      "automerge": false,
      "labels": ["needs-review", "major-update"]
    }
  ]
}
```

> 設計上の選択:
> - **`prCreation: "not-pending"`**: アップストリームのテストが完了するまで PR 作成を待機。CI が落ちた状態の PR が乱立するのを防ぐ。
> - **`automergeType: "pr"`**: PR を作って通常の merge フローで自動マージ (本リポジトリの README 運用ポリシーと合致)。`branch` を選ぶと PR を作らずベースブランチに直接 push してしまうため不採用。
> - **`rangeStrategy: "pin"`**: 依存追加時にも常に絶対バージョンで pin する (caret/tilde 禁止の運用ポリシーを Renovate 側でも強制)。

### 14.14.5 マイグレーションパス

本作は新規プロジェクトのため、初回の `package.json` は §14.14.1 の絶対バージョンで `bun add` を実行して生成すれば足りる:

```bash
# 新規プロジェクトの初回セットアップ
bun add react@19.0.0 react-dom@19.0.0 zustand@5.0.13 \
        pixi.js@8.2.1 bitecs@0.4.0 howler@2.2.4 \
        valibot@0.33.0 i18next@23.11.0 react-i18next@14.1.2

bun add -d typescript@5.8.2 vite@6.0.0 \
           @vitejs/plugin-react@4.3.1 @vitejs/plugin-basic-ssl@1.1.0 \
           vite-plugin-pwa@0.20.0 @biomejs/biome@1.8.0 \
           @playwright/test@1.45.0 \
           @types/bun@1.3.13 @types/howler@2.2.11 \
           @types/react@19.0.0 @types/react-dom@19.0.0
```

**TypeScript 設定の必須項目** (Round 3 / 実装スケルトン構築時に確認):
- `compilerOptions.allowImportingTsExtensions = true`: `import { x } from './foo.ts'` 形式を許可。`verbatimModuleSyntax` と `isolatedModules` を併用する場合に必須
- `compilerOptions.types = ["vite/client", "@types/bun"]`: Vite client + Bun 内蔵 API の型を解決

既存プロジェクトに本ポリシー (絶対バージョン化) を適用する場合は、`npm-check-updates` の `-E` (`--exact`) で一括変換するのが OS ポータブル (sed の BSD/GNU 差異を回避):

```bash
# 既存プロジェクトのワンショット移行
bunx npm-check-updates -u -E --target patch
bun install
```

> `-E` は caret/tilde を取り除いて exact version で書き戻すため、追加で sed 等の正規表現置換は不要。

### 14.14.6 各章との整合チェック

本表の確定パッケージは、以下の章の記述と完全に整合している必要がある (Round 2 / T1 PR で既に整合済):

- §11.2 描画レンダラ: `pixi.js@8.2.1` (WebGPU 既定 / WebGL2 / Canvas2D)
- §14.2 ECS: `bitecs@0.9.6` (TypedArray SoA)
- §14.2.2 ハイブリッド状態管理: `react@19.0.0` + `react-dom@19.0.0` + `zustand@5.1.0`
- §14.2.3 / §80 / §93 バリデーション: `valibot@0.33.0`
- §14.8 テスト: `@playwright/test@1.45.0` + `bun test`
- §14.9 ビルド: `bun@1.2.0` + `vite@6.0.0` + `@vitejs/plugin-basic-ssl@1.1.0` + `typescript@5.8.2` + `@biomejs/biome@1.8.0`
- §14.10 PWA: `vite-plugin-pwa@0.20.0` (Service Worker のみ。Push / Sync は不採用, §18.12)
- §17.9 i18n: `i18next@23.11.0` + `react-i18next@14.1.2`
- §92 オーディオ: `howler@2.2.4`
- §20 盤面モデル: 三値セル (空 / 塗 / ×)、§30 ヒント生成は事前計算 (run-length encoding)。物理エンジンは不採用 (旧仕様 Round 4 までの Custom AABB は Round 5 で削除)

将来 Round 3 (Issue #18) で追加されるサーバ側スタック (Cloudflare Pages / Workers / D1 / R2 / Firebase Auth など) は §14.15 で別途固定する。

## 14.15 デプロイターゲット (Round 3 / Issue #18)

### 14.15.1 確定方針: MVP は Cloudflare 単独で完結

本作の MVP (PWA + シングルプレイヤー + ローカルセーブ) は **Cloudflare Pages 単独で完結** する。サーバ機能は不要、すべて静的アセット配信で済む。コストは Free プラン枠内 ($0/月)。

| 本作の要件 | Cloudflare サービス | 適合度 | 備考 |
| :--- | :--- | :--- | :--- |
| 静的 SPA (Vite 6 ビルド `dist/`) | **Pages** | ◎ | Free 20,000 ファイル / Paid 100,000、単一 25 MiB。Brotli・GZIP 自動。HTTP/2 自動 |
| Service Worker / オフラインキャッシュ | Pages (`vite-plugin-pwa` で生成、`_headers` で Cache-Control 制御) | ◎ | Service Worker 自体は静的アセットとして配信 |
| ステージ JSON / スプライトアトラス | Pages 同梱 (将来差し替え頻発時のみ R2 検討) | ◎ | バンドル同梱で十分 |
| カスタムドメイン (`game-pixels.dev` 等) | Pages | ◎ | Free 100 個 |
| プレビュー環境 (PR ごと) | Pages preview | ◎ | 無制限、`X-Robots-Tag: noindex` 自動 |
| WebGPU 用 COOP/COEP ヘッダ | Pages `_headers` | ◎ | `Cross-Origin-Opener-Policy: same-origin` / `Cross-Origin-Embedder-Policy: require-corp` を宣言可能 |

### 14.15.2 v1.1 拡張: クラウドセーブ + 認証 + リプレイランキング

v1.1 で iOS Safari の IndexedDB 7 日消失リスク (§13.9.1) への完全対策と、リプレイ共有 / リーダーボードを実装する場合の構成:

| 機能 | 採用サービス | 備考 |
|---|---|---|
| **クラウドセーブ** | **Cloudflare D1** (SQLite) | Free 500MB / Paid 10GB。1ユーザー数 KB のセーブで十分。書込 Free 100k/日 / Paid 100M/日 |
| **認証 (Sign in with Apple/Google)** | **Firebase Auth** (GCP) | Cloudflare Access は B2B 寄り。Firebase Auth Spark プランは無料枠が手厚く、本作の OAuth に直結 |
| **リプレイ保存** | **R2** (リプレイ JSON) + **D1** (メタ) | R2 は Cloudflare 内部 egress 無料 ($0/GB)、外向きも無料 |
| **マルチプレイ拡張 (将来)** | **Workers + Durable Objects + WebSocket** | DO で部屋単位の状態管理、無制限 wall clock |
| **テレメトリ (FPS / クラッシュ)** | **Workers Analytics Engine** | Workers Paid プラン ($5/月) に含まれる |

### 14.15.3 GCP 補完判断基準

| シナリオ | Cloudflare で足りるか | GCP 補完候補 |
|---|---|---|
| MVP (PWA, ローカルセーブのみ) | ✅ 完結 | 不要 |
| 認証 (Sign in with Apple/Google) | △ Cloudflare Access は B2B 寄り | **Firebase Auth** (無料枠が手厚い、SDK が枯れている) |
| 大容量アセット (BGM 100MB+) | △ R2 オブジェクトサイズ要確認 | GCS (4.7TB/object 上限)。ただし R2 でも実質問題なし |
| クラウドセーブ 10GB 超 (DB1 単体上限) | × Paid でも 10GB | Cloud SQL (PostgreSQL/MySQL) または Firestore |
| 30 秒超のサーバ処理 (動画変換等) | × Workers は Free 10ms / Paid CPU 5min | Cloud Run (60 分 wall-clock 上限) |
| 重い画像 / 動画処理 | × | Cloud Run + GCS |

> **判断ルール**: 「まず Cloudflare で実装可否を検討 → 制約に当たったときだけ GCP で補完」を原則とする。両方を初期から並走させない (運用複雑度が倍増する)。

### 14.15.4 概算コスト

| 段階 | 構成 | 月額 |
|---|---|---|
| **MVP** | Cloudflare Pages のみ | **$0** (Free) |
| **v1.1 (中規模)** | Pages + Workers Paid + D1 + R2 + Firebase Auth Spark | **$5–15** (1 万 DAU 想定) |
| **v1.1 (大規模 10 万 DAU)** | 同上 + KV / Analytics Engine 増分 | $30–80 |

### 14.15.5 デプロイフロー

```
GitHub (main push) → Pages 連携 → Vite 6 ビルド (bun install → bun run build) → Pages 配信
                  → Pages preview (PR ごと、自動)
```

- Pages の "Connect to Git" で GitHub リポジトリと紐付け、`main` push 時に自動デプロイ。
- ビルドコマンド: `bun install --frozen-lockfile && bun run build`
- 出力ディレクトリ: `dist/`
- 環境変数: `NODE_VERSION` は不要 (Bun ネイティブビルド)、`BUN_VERSION` を設定 (= 1.2.0、§14.14.1 に合わせる)
- **`_headers` ファイル**: `dist/` のルートに配置し、`/index.html` は `Cache-Control: no-cache`、`/assets/*` は `Cache-Control: public, max-age=31536000, immutable` (Vite が hashed filename を出力するため immutable で安全)
- WebGPU の COOP/COEP は `_headers` で全パスに適用 (将来 Web Worker / SharedArrayBuffer を使う場合の準備)

### 14.15.6 リスクと未解決事項

- **iOS Safari の WebGPU 不安定性** (§11.2.3) → MVP リリース時はスマホ向けに自動で WebGL2 fallback を強く推奨する設定にする選択肢あり。実装フェーズで実機検証 (Issue #14 T7) で判断。
- **Pages の URL リライト**: SPA (履歴 API ベース) のためすべてを `/index.html` にフォールバックさせる必要があれば `_redirects` ファイル (`/* /index.html 200`) を配置。MVP のシングルページゲームでは履歴 API を使わない可能性が高く、不要かもしれない。実装時に判断。
- **Renovate 設定 (§14.14.4)** は Cloudflare Pages の自動ビルドと CI 必須化と整合させる必要がある。Renovate PR が来た時に Pages の preview build が CI 一部として走り、E2E (Playwright) と並行して通すフロー。詳細は Issue #14 (T7) で具体化。
