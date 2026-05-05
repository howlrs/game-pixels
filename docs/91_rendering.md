# 91. 描画パイプライン

## 11.1 設計目標

- ピクセルアートの輪郭を保ち、にじまない (nearest-neighbor)。
- HiDPI と任意ウィンドウサイズに**整数倍**スケールで対応 (デバイスごとに最適な scale を選ぶ)。
- 60Hz 物理を **120Hz/144Hz でも滑らか**に表示 (補間)。
- フォールバック: WebGPU → WebGL → Canvas2D の順で安全に縮退。

## 11.2 レンダラ選択

| レンダラ | 採用条件 | 備考 |
|---|---|---|
| **Canvas2D** | 既定 (MVP) | 単純、ブラウザ対応広い、十分な性能 (1ms 以下のステージ) |
| WebGL2 | シェーダ演出 (CRT, Bloom) を入れる時 | 中間層 |
| WebGPU | 2026 標準対応、モバイル電池に有利 | feature detect で有効時のみ |

> 出典: Canvas 2D は数百のドローコールを 60 fps で問題なく処理できる (state of HTML canvas, 2026)。WebGPU はモバイル電池消費で WebGL より優位。

## 11.3 仮想解像度とスケール

- 内部解像度 (論理): **256×240 px** (4:3, NES 互換) を基準に、横長比率向け **480×270 px** (16:9) を選択肢とする。
- 描画パイプライン:
  1. **オフスクリーン Canvas** (= 内部解像度) に物理状態をレンダ。
  2. **メイン Canvas** (= デバイスのビューポート) に **整数倍** に拡大コピー (`drawImage` + `imageSmoothingEnabled = false` + CSS `image-rendering: pixelated`)。
- スケール選択:
  - `scale = floor(min(viewport.w / virtual.w, viewport.h / virtual.h))`
  - スケール 1 未満になる極小ウィンドウは縮小不可とし、UI で最小サイズを通知。
- **整数倍**のメリット: ピクセル比率の歪みを完全回避 (テクセル境界がデバイスピクセル境界と一致)。

## 11.4 レターボックス/ピラーボックス

- 余白は黒 (背景色は変更可能)。
- 16:9 の物理デバイス × 4:3 の内部解像度 → ピラーボックス。
- 縦持ち × 16:9 内部解像度 → レターボックス + ナビゲーション UI を上部に。

## 11.5 サブピクセルモーション (現代化オプション)

- 既定: subpixel 位置を `>> 4` で px に丸めて描画 (古典の硬いドット感)。
- オプション: `>> 4` を行わず、論理座標 × scale をそのままデバイス座標に投影し、線形補間 (この場合 nearest-neighbor は OFF) にする。これで 120Hz 以上でも滑らかに見える。
- どちらも論理 (物理) 計算は subpixel で決定論。表示モードの切替が物理に影響しないこと **必須**。
- §98 で詳述。

## 11.6 60→120Hz の補間描画

- 物理は 60Hz 固定 (§94)。描画は rAF (デバイスのリフレッシュレート) で行う。
- アクター位置を `prev_pos` と `curr_pos` で保持し、`alpha = accumulator / dt` で `lerp(prev, curr, alpha)` を描画位置として採用。
- これにより 144Hz でも見え方が滑らかになる。

## 11.7 レイヤ構成

```
[0] Background (parallax, far)
[1] Background (mid)
[2] Tile (foreground)
[3] Entities (sorted by y or fixed)
[4] Player
[5] Particle (debris, coin)
[6] HUD overlay
[7] Cinematic / Pause overlay
```

- 各レイヤごとに「ワールド空間描画」と「画面空間描画」を分離。
- HUD はワールド座標を持たない。

## 11.8 スプライトシートとアトラス

- 1 スプライトシート (PNG) に **全タイル + 全敵 + プレイヤー** を含める。
- アトラスのメタデータは JSON でスプライト名 → ピクセル矩形の対応を記述。
- ロード時に `<img>` 経由で読み込み、`OffscreenCanvas` にデコードして以降は ImageBitmap として保持 (decode コスト削減)。

## 11.9 アニメーション

- フレーム配列 + 1 frame あたりの "tick 数" で定義。
- 例: Goomba walk: `[ frame_a (8 tick), frame_b (8 tick) ]` を loop。
- アニメーション状態は entity component として保持。state 変更時に reset。

## 11.10 シェーダ演出 (オプション)

- WebGL/WebGPU 採用時のみ:
  - **CRT モード**: scanline + barrel distortion。プリセット ON/OFF を §96 a11y 設定に置く。
  - **HDR-2D 風 Bloom**: 一部光源 (コイン、ファイア) のみ加算合成。
- 既定は OFF (パフォーマンス安全)。
- WebGL/WebGPU 不可環境では UI を表示しない (Canvas2D 単体運用)。

## 11.11 HiDPI 対応

- `devicePixelRatio` は **メイン Canvas にのみ適用**。
- オフスクリーン (内部解像度) は固定 256×240 (or 480×270)。
- 過剰な DPR (例: 3) のスマホでは GPU 帯域に注意。スケール比は整数を維持しつつ DPR 倍率を許容。

## 11.12 描画コスト見積もり

- 1 frame: タイル ~480 (240×14 のうち画面内 ~240) + entity ~16 + particle ~8 = 約 500 sprites。
- Canvas2D: drawImage コール ~500/frame は余裕。
- WebGL: バッチ化 (instanced draw) で 1 ドローコール。

## 11.13 既知の罠と対策

| 罠 | 対策 |
|---|---|
| `imageSmoothingEnabled` が描画後に効かない | コンテキスト取得直後に必ず false (state 変更で再設定) |
| 整数スケール失敗で 1px シフト | スケール後の座標を `Math.round` で丸める |
| 高 DPR で Canvas が巨大化 | メイン Canvas は viewport size × DPR、オフスクリーンは固定 |
| WebGL ロスト (タブ切替) | `webglcontextlost` で再生成 + アセット再ロード手順を持つ |
