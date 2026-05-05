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

- 物理は整数のみ (Number 但し float 操作なし)。`x | 0`, `x >> 4` 等で整数化を明示。
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

- 既定: Canvas2D + シェーダ OFF + 60Hz。
- 熱検知 (バッテリー API は廃止傾向、代替は `requestIdleCallback` の遅延) で 30Hz モードに自動切替。
- Background tab で `visibilitychange` を捕捉して BGM/物理を停止。
- 不要な rAF を呼び続けない (タブ非表示で停止)。

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
| 多数の SE 同時で音飛び | プール上限 + ピッチ揺らぎ (§92) |
| シェーダ ON でモバイルが熱で 30fps 落ち | デバイス検出で既定 OFF、ユーザー有効化のみ可 |
