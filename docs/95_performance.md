# 95. パフォーマンス

## 15.1 目標

| 機種クラス | 目標 |
|---|---|
| ハイエンド PC | 144Hz / 描画補間あり / シェーダ ON で消費 < 50% CPU |
| ミドル PC / 新型 Mac | 60Hz 安定 / シェーダ ON 可 |
| 中位スマホ (3年落ち程度) | 60Hz 安定 / シェーダ OFF / Canvas2D / 電池消費 妥当 |
| 低位スマホ | 30Hz でも遊べる代替モード |

## 15.2 フレームバジェット

60fps 環境で 1 frame = 16.67 ms を以下に分配:

| 区分 | バジェット | 内容 |
|---|---|---|
| Input + Logic | 4 ms | 物理 step、衝突、エンティティ AI |
| Render | 6 ms | スプライト drawImage、レイヤ合成 |
| Audio + GC + 余裕 | 3 ms | Web Audio スケジュール、GC、その他 |
| Reserve | 3.67 ms | 突発スパイク余裕 |

## 15.3 ホットパス最適化

### 15.3.1 配列の reuse

- アクターは固定配列 (TypedArray-of-Structs パターン)。新規生成は GC を発生させる。
- 弾、パーティクルは **オブジェクトプール** で再利用。

### 15.3.2 整数演算

- 物理は整数のみ (Number 但し float 操作なし)。
- **推奨は `Int32Array` の TypedArray + SoA (Struct-of-Arrays) でアクター状態を保持** すること。これにより GC を回避し、JIT が型推論しやすくなる。フィールドアクセスはインデックスでまとめる。
- `x | 0` の整数化は **特定の関数境界での明示** (例: 物理 step の最終代入) に留め、ホットパス全域に多用しない。V8/SpiderMonkey の最近の JIT は過度なビット演算で Deopt を起こすケースがある。
- 浮動小数除算 (`/`) は描画補間時のみ。

### 15.3.3 衝突判定の早期 reject

- AABB の x-axis のみ先に判定 (`if (a.right < b.left || a.left > b.right) skip`)。
- タイル参照は AABB が触れる cell のみ。

### 15.3.4 描画

- `ctx.save() / restore()` を多用しない (高コスト)。state を最小限に変更。
- `drawImage` の引数は事前計算 (毎 frame `Math.round` を回さない)。
- バッチ描画 (WebGL/WebGPU) で同一テクスチャをまとめる。

## 15.4 GC 削減

- ゲームループ内で `new` を避ける (オブジェクトプール)。
- 文字列の concat を避ける (HUD 表示は事前テンプレ化)。
- `Math.hypot` 等のメソッドは `dx*dx+dy*dy` で代替。

## 15.5 モバイルの熱と電池

- 既定: **WebGPU + シェーダ OFF + 60Hz** (Round 2 で WebGPU 既定化, §91.2)。スマホでも初期 OFF は維持 (§11.2.3 / §17.14 G)。
- 熱検知 (バッテリー API は廃止傾向、代替は §15.5.1 の FPS 監視) で動的性能調整に自動切替。
- Background tab で `visibilitychange` を捕捉して BGM/物理を停止 (§92.3.2)。
- 不要な rAF を呼び続けない (タブ非表示で停止)。

### 15.5.1 サーマルスロットリングと動的性能調整 (Round 3 / Issue #18)

スマホで高負荷描画を数分続けると、**OS が CPU/GPU 周波数を強制的に下げて 60→20 fps に落ちる** (サーマルスロットリング, §17.14 G)。本作はこれを検知して **段階的に描画負荷を間引く動的性能調整** を実装する。

#### 検知ロジック

- **計測**: 直近 60 frame の `performance.now()` デルタを移動平均し、`avgFrameMs` を維持。
- **判定**: `avgFrameMs > 22ms` (= 45fps 未満) が **3 秒継続** したら 1 段階降格。回復し 30 秒安定したら 1 段階復帰 (ヒステリシス)。
- **継続時間は ms 蓄積で計測**: フレーム数で「3秒 = 180 frame」と判定すると、低 fps 時 (20fps なら 180 frame に 9秒) に降格判定が遅れて手遅れになる。`degradeStreakMs` / `recoverStreakMs` に各フレームの elapsedMs を加算し、絶対時間で 3000ms / 30000ms と比較する (Round 3 / Gemini Pro 指摘)。
- **ユーザー通知**: 自動降格時に画面端に小さなトースト (例: "性能調整: パーティクル削減") を 2 秒表示。設定で off 可能。

#### 4 段階の優先順位 (Round 3 / Issue #18 で確定)

降格は **見た目への影響が小さい順から先に間引く** こと。逆順は禁止 (フレームスキップを先に入れるとアクションゲームの操作感が直で悪化する)。

| 段階 | 操作 | 期待される負荷削減 | 見た目への影響 |
|---|---|---|---|
| **0 (既定)** | フル描画 | — | 最高品質 |
| **1: パーティクル削減** | パーティクル数を 50% に間引き、残りはランダム選択。土埃・葉・破片を優先削減 | ~10-15% | ほぼ気付かれない |
| **2: 内部解像度動的縮小** | 内部解像度を 480×270 → 320×180 (倍率 0.66) → 256×144 (倍率 0.53) に段階的に縮小、Pixi.js の RenderTarget サイズを書き換え | ~30-40% | スケール後ぼけるが操作可能 |
| **3: シェーダ演出 OFF** | CRT / Bloom / 加算光源を強制 OFF (`display.crt = false` / `display.bloom = false`) | ~15-20% | 演出が消えるが古典モード相当 |
| **4: フレームスキップ (60→30 Hz)** | 描画レイヤを 1 frame おきに skip。物理は 60Hz 維持 | ~50% | 操作感が大きく劣化 — 最終手段 |

#### 復帰の優先順位

降格と逆順 (フレームスキップ → シェーダ → 解像度 → パーティクル) で 1 段階ずつ復帰。

#### 実装スケッチ

```ts
// game/perf/auto-tuner.ts
type Stage = 0 | 1 | 2 | 3 | 4;

const DEGRADE_THRESHOLD_MS = 22;        // 45fps 未満を slow と判定
const DEGRADE_DURATION_MS  = 3_000;     // 3 秒継続で 1 段階降格
const RECOVER_DURATION_MS  = 30_000;    // 30 秒安定で 1 段階復帰 (ヒステリシス)

class PerfAutoTuner {
  private stage: Stage = 0;
  // 継続時間は **ms 蓄積で計測** (フレーム数だと低 fps 時に判定が遅れる, Round 3 / Gemini Pro 指摘)
  private degradeStreakMs = 0;
  private recoverStreakMs = 0;
  private avgFrameMs = 16.67;

  onFrame(elapsedMs: number) {
    this.avgFrameMs = this.avgFrameMs * 0.95 + elapsedMs * 0.05;
    const isSlow = this.avgFrameMs > DEGRADE_THRESHOLD_MS;
    if (isSlow) {
      this.degradeStreakMs += elapsedMs;
      this.recoverStreakMs = 0;
      if (this.degradeStreakMs >= DEGRADE_DURATION_MS && this.stage < 4) {
        this.degrade();
        this.degradeStreakMs = 0;
      }
    } else {
      this.recoverStreakMs += elapsedMs;
      this.degradeStreakMs = 0;
      if (this.recoverStreakMs >= RECOVER_DURATION_MS && this.stage > 0) {
        this.recover();
        this.recoverStreakMs = 0;
      }
    }
  }

  private degrade() {
    this.stage = (this.stage + 1) as Stage;
    switch (this.stage) {
      case 1: ParticleSystem.setBudget(0.5); break;
      case 2: Renderer.setInternalResolution(320, 180); break;
      case 3: Renderer.disableShaderEffects(); break;
      case 4: Renderer.enableFrameSkip(true); break;
    }
    Toast.show(`性能調整: ステージ ${this.stage}`);
  }

  private recover() {
    switch (this.stage) {
      case 4: Renderer.enableFrameSkip(false); break;
      case 3: Renderer.enableShaderEffects(); break;
      case 2: Renderer.setInternalResolution(480, 270); break;
      case 1: ParticleSystem.setBudget(1.0); break;
    }
    this.stage = (this.stage - 1) as Stage;
  }
}
```

- **閾値 (22ms / 3000ms / 30000ms)** は実装フェーズで実機調整する。docs では方針のみ確定。
- **ユーザー手動オーバーライド**: 設定画面で "性能調整: 自動 / オフ / 強制 (Stage X)" を提供 (§93 settings)。

## 15.6 メモリ

- スプライトシート: 最大 1024×1024 px (~1MB)。
- ステージ: 1 ステージ 16KB 以下を目標。
- セッション全体で <100 MB を目標 (ローエンドスマホ含む)。

## 15.7 計測

- `performance.measure()` でフェーズ毎 (input, physics, render, audio) を計測。
- 開発時に **HUD オーバーレイ** で min/avg/max/p99 を表示。
- 本番ではサンプリング (例: 1 分毎) して性能ログを保存 (オプトイン)。

## 15.8 リグレッション検知

- CI で代表 5 ステージを 60 秒分シミュレート (ヘッドレス) し、frame 時間の percentile を JSON 出力。前回比 +20% で alert。

## 15.9 既知の罠と対策

| 罠 | 対策 |
|---|---|
| iOS Safari で 60Hz 出ない | `transform: translateZ(0)` でレイヤ化、必要に応じて canvas を `position: fixed` |
| Chrome の rAF が 30Hz に降格 | `visibilitychange` で再 rAF 起動、`document.hidden` チェック |
| **ProMotion (iPhone 15 Pro / Pixel 7 Pro 等) で rAF が 120Hz 発火 → 物理 2 倍速** (Round 3 / Issue #18) | rAF と物理を完全分離、`performance.now()` デルタ蓄積で 1/60s 固定 (**§14.3 で既に採用済**) |
| **スマホで数分プレイ後に発熱 60→20fps** (Round 3 / Issue #18) | 動的性能調整 4 段階で自動降格 (§15.5.1) |
| 多数の SE 同時で音飛び | プール上限 + ピッチ揺らぎ (§92) |
| シェーダ ON でモバイルが熱で 30fps 落ち | デバイス検出で既定 OFF (§11.2.3 / §17.14)、動的性能調整で stage 3 で強制 OFF |
