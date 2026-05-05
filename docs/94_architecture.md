# 94. アーキテクチャ

## 14.1 全体構成

```
src/
├── core/             # 物理、衝突、入力スナップショット、シード乱数 (DOM 非依存)
├── game/             # ゲームロジック (プレイヤー, 敵, アイテム, ワールド) — core 依存
├── render/           # 描画レイヤ (Canvas2D / WebGL / WebGPU)
├── audio/            # 音声レイヤ
├── input/            # 入力アダプタ (Keyboard / Pointer / Gamepad → InputSnapshot)
├── save/             # セーブバックエンド (IndexedDB / LocalStorage / Cloud)
├── ui/               # メニュー, HUD, 設定, ローディング (DOM ベース)
├── platform/         # PWA / Service Worker / 環境検出
└── main.ts           # エントリ
```

- `core/` は **DOM 非依存**。Node.js でテスト可能。
- `core/` + `game/` は決定論。乱数は外から渡すシード PRNG のみ使用 (`Math.random` 禁止)。

## 14.2 ECS (採否判断)

- **採用しない (MVP)**: アクター数が小規模 (敵 16 + プレイヤー + 弾) のため、データ指向の利得より OOP のほうが見通しが良い。
- アクターの "コンポーネント分離" 思考は採るが、ライブラリ化はしない。
- 拡張時 (Mario Maker 風 UGC など、アクター数が桁違いに増える局面) は `bitECS` 等への移行を検討する余地を残す (§99)。

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
| 単体 (core) | Vitest / Jest。整数物理の境界値テスト。 |
| 単体 (game) | 入力列 → 期待状態の決定論テスト。 |
| 統合 | ヘッドレス Canvas (jsdom + canvas) でステージ全クリアの再生テスト。 |
| E2E | Playwright で実機ブラウザ操作。 |
| 性能 | フレーム毎 update 時間の percentile を CI で記録 (回帰検出)。 |

## 14.9 ビルドとバンドル

- バンドラ: Vite (dev) + esbuild/Rollup。
- 出力: `index.html`, `app.js`, `app.css`, スプライトアトラス、ステージ JSON。
- HTTP/2 + 圧縮で初回 < 500KB を目標。

## 14.10 PWA

- Service Worker で全アセットを **precache** + ステージ JSON は **stale-while-revalidate** 戦略。
- バージョンアップ時は SW の `activate` で旧キャッシュを破棄。
- 通知を表示してユーザーがリロードを選択するまで旧版を維持 (UX 安定優先)。

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
