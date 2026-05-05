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

## 14.14 確定技術スタック (2026-05-05) — Round 2 暫定 / Issue #10 で正式化

Round 2 / Issue #11 で採否決定したコア技術の **暫定リスト** を以下に置く。各バージョン番号と採否一覧の **正式な表**、Renovate 設定、運用ポリシー (絶対バージョン固定 / `^` `~` 禁止 等) は Issue #10 (T5) を別 PR で取り込む際に確定する。本セクションは Issue #10 PR で表ごと差し替える前提のプレースホルダ。

| 区分 | パッケージ | 用途 |
| :--- | :--- | :--- |
| ランタイム / PM | Bun | パッケージ管理 + テストランナー (§14.8) + dev スクリプト |
| 言語 | TypeScript | `strict: true`, `exactOptionalPropertyTypes` |
| ビルド | Vite | dev サーバ (https) + 本番ビルド (§14.9) |
| UI フレームワーク | React + react-dom | HUD / メニュー / 設定 (§14.2.2 ハイブリッド) |
| 状態管理 (UI) | Zustand | HUD / 設定の store (§14.2.2) |
| ゲームレンダラ | Pixi.js v8 | WebGPU 既定 / WebGL2 / Canvas2D の透過切替 (§11.2) |
| ECS | bitECS | TypedArray SoA、systems pipeline (§14.2 / §14.2.1) |
| Web Audio | Howler | BGM / SE 軽量再生 (§92) |
| バリデーション | Valibot | ステージ / セーブ / リプレイ / 入力スナップショット (§14.2.3) |
| PWA | vite-plugin-pwa | Service Worker 自動生成 (§14.10) |
| i18n | i18next + react-i18next | 多言語 UI (§17.9) |
| リンタ / フォーマッタ | Biome | ESLint / Prettier 代替 |
| E2E テスト | @playwright/test | クロスブラウザ E2E + WebGPU/WebGL2/Canvas2D 3 系統 (§14.8) |
| ユニットテスト | bun test | Bun 内蔵ランナー (§14.8) |
| 物理 | (Custom AABB) | 整数 + subpixel 自前実装 (§20)、汎用エンジンは不採用 |

> **注**: 上表は Round 2 の Issue #11 を反映した暫定。**バージョン番号の絶対固定、Renovate 運用ポリシー、`engines.bun` の指定**は Issue #10 (T5) の PR で本セクションを正式表に差し替える際に確定する。それまでの間、`docs/00_index.md` 以下の他章では本表のパッケージ名のみを参照し、バージョン番号への直接参照は避ける。
