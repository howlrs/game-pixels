# 94. アーキテクチャ

## 14.1 全体構成

```
src/
├── core/             # 物理、衝突、入力スナップショット、シード乱数, ECS world (DOM 非依存)
├── game/             # ゲームロジック (プレイヤー, 敵, アイテム, ワールド) — core 依存。ECS systems を実装。
├── render/           # 描画レイヤ (WebGPU 既定 / WebGL2 / Canvas2D, Pixi.js v8)
├── audio/            # 音声レイヤ (Howler)
├── input/            # 入力アダプタ (Keyboard / Pointer / Gamepad → InputSnapshot)
├── save/             # セーブバックエンド (IndexedDB / LocalStorage / Cloud) + Valibot スキーマ
├── ui/               # メニュー, HUD, 設定, ローディング (React + Zustand, DOM ベース)
├── platform/         # PWA / Service Worker / 環境検出
└── main.ts           # エントリ
```

- `core/` は **DOM 非依存**。Node.js (Bun) でテスト可能。
- `core/` + `game/` は決定論。乱数は外から渡すシード PRNG のみ使用 (`Math.random` 禁止)。
- `ui/` は React (HUD, メニュー, 設定画面) で構築するが、ゲームループそのものは `core/` + `render/` の Vanilla 層で動かす (§14.2.2 ハイブリッド状態管理)。

## 14.2 ECS (採否判断) (Round 2 / Issue #11)

**Round 1 までの「ECS 不採用 (MVP)」方針を Round 2 で破棄し、初期から bitECS を採用する**。理由は以下:

- **将来の 3D 化 (HD-2D 風, §18.2.2) と描画分離**: 描画とロジックの分離が容易な ECS は、後からのリファクタリングコストが膨大になる OOP 継承ツリーを避ける必要がある (Round 2 / E3 専門家見解)。
- **WebGPU compute shader への布石**: パーティクル (§11.7 [5]) を将来 GPU compute に移す際、SoA レイアウト前提の bitECS は移植コストが低い。
- **Int32Array SoA の徹底**: §20 で物理を Int32Array SoA とした方針 (Round 2 / Issue #11) と完全に整合。bitECS のコンポーネントは内部的に TypedArray の SoA で保持されるため、物理層との接続が自然。
- **アクター数の増加耐性**: UGC / Mario Maker 風や、画面外スポーンを密に行うステージ (§50 / §80) でも O(n) の linear scan が CPU キャッシュに乗りやすく、フレーム落ちが出にくい。

| 項目 | Round 1 | Round 2 (確定) |
|---|---|---|
| ECS ライブラリ | 不採用 | **bitECS を初期採用** |
| データレイアウト | OOP オブジェクト | **TypedArray (Int32Array 等) SoA** |
| パーティクル実装 | 軽量プール (§18.7) | bitECS の component で同等の SoA プール |
| 移行リスク | 後から ECS 化する大規模リファクタが必要 | 初期から ECS のためゼロ |

### 14.2.1 bitECS の採用ガイドライン

- **components**: `Position`, `Velocity`, `AABB`, `Sprite`, `AnimationState`, `EnemyKind`, `PlayerInput`, `ItemKind`, `Lifetime` などを `defineComponent` で定義。すべて Int32Array / Float32Array / Uint8Array の SoA。
- **systems**: 物理 (`physicsSystem`)、衝突 (`collisionSystem`)、入力反映 (`playerInputSystem`)、敵 AI (`enemyAiSystem`)、描画同期 (`renderSyncSystem`) を順序付きで `pipe` で合成。
- **queries**: `defineQuery([Position, Velocity])` で systems 内の対象 entity を絞り込む。
- **world**: 1 ステージ 1 world。Pause/Resume は world の凍結 (system pipeline を呼ばない) で実現。
- **決定論**: bitECS の entity ID は連番で再現性があり、`world` をシードとともに保存すれば §14.5 の決定論を満たす。

### 14.2.2 ハイブリッド状態管理 (コア Vanilla + UI Zustand) (Round 2 / Issue #11)

ゲームループそのものを React の reconciler に乗せると、Web Audio や入力レイテンシが UI レンダリング負荷で阻害され (Round 2 / E10 専門家見解)、アクションゲームには致命的な音ズレ・入力遅延が発生する。本作では下記のハイブリッド構成を採用する:

| 領域 | 実装 | 状態管理 |
| :--- | :--- | :--- |
| ゲームループ | Vanilla TS + bitECS + Pixi.js v8 | **`world` (bitECS) を SoT、React からは隔離** |
| HUD (スコア / コイン / ライフ / タイム) | React コンポーネント | Zustand store。物理 frame 終了時に `setState` で同期 (1 frame に 1 回) |
| メニュー / 設定 / タイトル / ポーズ | React + React Router (任意) | Zustand store |
| セーブデータ | save/ レイヤが IndexedDB を直接読み書き | Zustand を経由しない (§14.5 決定論を Zustand に汚染させない) |

- **境界**: `ui/` レイヤは `core` / `game` の関数を直接呼ばず、Zustand store を通じて読み出すだけ (一方向データフロー)。
- **データフローの向き**: Vanilla 側 (`core` / `game` の物理ループ) が **frame 終了時に Zustand store へ Push** (例: `useHud.getState().setFrameSnapshot(...)`)。React コンポーネントは Zustand のフック (内部で React 19 の `useSyncExternalStore` を利用) で store を購読し、selector が返す値が変わった部分だけ再レンダリングする。`useSyncExternalStore` はあくまで「React コンポーネント ← Zustand」の購読方向で使われ、Vanilla 側 (`world`) の変更を Zustand 自身が subscribe するためのものではない。
- **更新頻度**: HUD の数値は最大 60 Hz で十分。物理 frame 終了の 1 度だけ store を更新するため、React の reconciliation は最大 60 fps に制限される。
- **Zustand 採用の根拠**: 軽量、フックベース、selector で再描画範囲を絞れる。Jotai は MVP では不要 (細粒度 atom が必要になった段階で追加検討)。

```ts
// ui/hud-store.ts
import { create } from 'zustand';

interface HudState {
  score: number;
  coins: number;
  lives: number;
  timer: number;
  setFrameSnapshot: (s: Partial<HudState>) => void;
}

export const useHud = create<HudState>((set) => ({
  score: 0, coins: 0, lives: 3, timer: 400,
  setFrameSnapshot: (s) => set(s),
}));

// game/hud-sync.ts (frame 終了時に呼ぶ)
export function syncHud(world: World) {
  useHud.getState().setFrameSnapshot({
    score: PlayerStats.score[playerEid],
    coins: PlayerStats.coins[playerEid],
    lives: PlayerStats.lives[playerEid],
    timer: WorldClock.remaining[0],
  });
}
```

### 14.2.3 Valibot Schema-first (Round 2 / Issue #11)

ステージ JSON / セーブデータ / リプレイ JSON / 入力スナップショットの **すべての境界バリデーションを Valibot で行う**。Zod ではなく Valibot を採用する理由:

- **バンドルサイズ**: Valibot 0.33 はモジュラー設計で tree-shake に強く、本作で必要な機能だけで Zod の 1/10 程度。本作のクライアントペイロード予算 (初回 < 500KB, §14.9) に直接効く。
- **型生成**: スキーマから TS 型を `Output<typeof Schema>` で生成可能。エディタ側 (将来) とゲーム側のパースが常に同期 (Round 2 / E8, E9 専門家見解)。
- **エラーメッセージのカスタマイズ**: ステージデザイナ向けに「タイル ID が範囲外」等の人間可読メッセージを issue に出せる。

詳細は §80 (ワールドデータのスキーマ) と §93 (セーブデータのスキーマ) で扱う。本章では原則のみ:

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

## 14.10 PWA (Round 2 / Issue #11 で範囲縮小)

**MVP スコープ**: オフラインキャッシュ + フルスクリーン起動の 2 機能のみ。Push / Sync / Background Fetch は **不採用**。

- `vite-plugin-pwa@0.20.0` で Service Worker を自動生成。
- 全アセットを **precache** + ステージ JSON は **stale-while-revalidate** 戦略。
- バージョンアップ時は SW の `activate` で旧キャッシュを破棄。
- 通知を表示してユーザーがリロードを選択するまで旧版を維持 (UX 安定優先)。
- **不採用機能**: Push API (ゲーム体験を阻害する通知ノイズ)、Background Sync (サーバ依存のオンライン専用ゲーム前提でないため不要)、Web Share Target / Periodic Sync (MVP 範囲外)。
- フルスクリーン起動は Web App Manifest の `display: 'standalone'` + `display_override: ['fullscreen', 'standalone']` で対応。

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
| 状態管理 (UI) | `zustand` | `5.1.0` | dep | HUD / 設定の store (§14.2.2) |
| ゲームレンダラ | `pixi.js` | `8.2.1` | dep | WebGPU 既定 / WebGL2 / Canvas2D の透過切替 (§11.2) |
| ECS | `bitecs` | `0.9.6` | dep | TypedArray SoA、systems pipeline (§14.2 / §14.2.1) |
| Web Audio | `howler` | `2.2.4` | dep | BGM / SE 軽量再生 (§92) |
| バリデーション | `valibot` | `0.33.0` | dep | ステージ / セーブ / リプレイ / 入力スナップショット (§14.2.3) |
| PWA | `vite-plugin-pwa` | `0.20.0` | dev | Service Worker 自動生成 (§14.10) |
| i18n | `i18next` | `23.11.0` | dep | 多言語 UI コア (§17.9) |
| i18n (React) | `react-i18next` | `14.1.2` | dep | React 用翻訳バインディング |
| リンタ / フォーマッタ | `@biomejs/biome` | `1.8.0` | dev | ESLint / Prettier 代替 (高速) |
| E2E テスト | `@playwright/test` | `1.45.0` | dev | クロスブラウザ E2E + WebGPU/WebGL2/Canvas2D 3 系統 (§14.8) |
| ユニットテスト | `bun test` | (内蔵) | — | Bun 内蔵ランナー (§14.8) |
| 物理 | (Custom AABB) | (本リポジトリ実装) | — | 整数 + subpixel 自前実装 (§20)、汎用エンジンは不採用 (§2.1.2) |
| CI Action | `actions/checkout` | `v4.1.6` | (CI) | GitHub Actions 用 |
| CI Action | `oven-sh/setup-bun` | `v2.0.0` | (CI) | CI 上での Bun 環境構築 |

### 14.14.2 dependencies / devDependencies の分離

- **dependencies (production)**: `pixi.js`, `react`, `react-dom`, `zustand`, `bitecs`, `valibot`, `howler`, `i18next`, `react-i18next`
- **devDependencies**: `typescript`, `vite`, `@vitejs/plugin-basic-ssl`, `vite-plugin-pwa`, `@biomejs/biome`, `@playwright/test`
- **engines**: `package.json` の `engines.bun = "1.2.0"` を必須宣言

### 14.14.3 運用ポリシー

- すべての依存に **絶対バージョン** (`"react": "19.0.0"`)。`^` `~` は禁止。
- ロックファイル `bun.lockb` を Git 管理。
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
bun add react@19.0.0 react-dom@19.0.0 zustand@5.1.0 \
        pixi.js@8.2.1 bitecs@0.9.6 howler@2.2.4 \
        valibot@0.33.0 i18next@23.11.0 react-i18next@14.1.2

bun add -d typescript@5.8.2 vite@6.0.0 @vitejs/plugin-basic-ssl@1.1.0 \
           vite-plugin-pwa@0.20.0 @biomejs/biome@1.8.0 @playwright/test@1.45.0
```

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
- §20 物理: Custom AABB (整数 + subpixel)、汎用物理エンジンは不採用 (§2.1.2)

将来 Round 3 (Issue #18) で追加されるサーバ側スタック (Cloudflare Pages / Workers / D1 / R2 / Firebase Auth など) は §14.15 (新章, Round 3 で追加予定) で別途固定する。
