# 91. 描画パイプライン

## 11.1 設計目標

- ピクセルアートの輪郭を保ち、にじまない (nearest-neighbor)。
- HiDPI と任意ウィンドウサイズに**整数倍**スケールで対応 (デバイスごとに最適な scale を選ぶ)。
- ノノグラム (本作) はリアルタイム性低のため、**60Hz 描画で十分**。物理ループや補間は不要 (旧プラットフォーマー仕様の §11.6 / 11.5 補間描画は本作では不要、Round 6 で削除)。
- **既定は WebGPU**、フォールバック順は **WebGPU → WebGL2 → Canvas2D** で安全に縮退。
- ノノグラムの描画対象は **盤面のセル + ヒント数字 + UI** のみで、フィルレート・ドローコールは少ない (15×15 でも 225 セル + ヒント数字 ~60 個 = 約 300 ドローコール、Pixi.js v8 + WebGPU で余裕)。

## 11.2 レンダラ選択 (Round 2 / Issue #11)

2026 年時点でモダンブラウザの WebGPU 普及率と、モバイル端末での消費電力・性能比 (Canvas2D 比 15〜30 倍) を踏まえ、**既定を WebGPU に切り替える**。Canvas2D は低スペック端末・WebGPU 非互換環境向けの安全網として残置する (Round 1 までの「Canvas2D 既定」方針は本 Round 2 で破棄)。

| レンダラ | 採用条件 | 備考 |
|---|---|---|
| **WebGPU** | **既定 (MVP)** | 2026 主要ブラウザで標準対応。モバイル電池に有利。Compute Shader でパーティクル等を GPU 化。Pixi.js v8 系の WebGPU バックエンドを利用 (§14.14)。 |
| WebGL2 | WebGPU 不可時の第 1 フォールバック | Pixi.js v8 系が同 API で自動切替。シェーダ演出 (CRT, Bloom) も維持できる。 |
| Canvas2D | WebGPU/WebGL2 ともに不可、または §17.13 簡易ベンチで低スコア時の最終手段 | 単純で対応広い。シェーダ演出は無効化 (§11.10)。 |

> 出典: WebGPU はモバイル電池消費・スループットの両面で WebGL に対し有利 (W3C WebGPU Working Group, 2026)。Pixi.js v8 は WebGPU/WebGL2 のバックエンドを単一 API で透過に切替できるため、レンダラ選択の分岐をアプリ側に持ち込まずに済む。

### 11.2.1 WebGPU 既定化に伴う具体方針

- **初期化**: 起動時に `navigator.gpu?.requestAdapter()` を試行し、`adapter !== null` なら WebGPU バックエンドで Pixi.js を初期化。失敗時は WebGL2、それも失敗したら Canvas2D。`display.renderer` (§93) で手動上書きも可能。
- **Compute Shader の段階導入**: パーティクル (§11.7 [5] レイヤ) を WebGPU の compute pipeline に乗せる構成を初期段階から見越す。MVP では CPU 側の SoA プール実装で先行し、v1.1 で compute 化する (§95)。
- **HDR / 高精度カラー**: WebGPU 採用により Pixi.js v8 の `RenderTarget` で 16bit float カラーを扱える。Bloom / 高精細 CRT シェーダの表現幅が広がる (§11.10 / §18.5)。
- **CI E2E**: WebGPU 既定 + WebGL2 フォールバック + Canvas2D 降格の 3 系統を Playwright (§14.8) で必ず実機ブラウザ (Chrome / Firefox / Safari TP) でスクリーンショット差分テストする (Round 2 リスク事項, Issue #11)。
- **未解決リスク (CI 上の WebGPU 実行)**: GitHub Actions の `ubuntu-latest` 等の標準ヘッドレス環境では WebGPU はそのまま動作せず、SwiftShader / Dawn / `--enable-unsafe-webgpu` フラグなどの追加設定が必須となる (Round 2 / Gemini Pro 指摘)。本作の CI で WebGPU 経路を実行可能にする手段は Issue #14 (T7 テスト戦略) で具体化する。それまでの間、CI では WebGL2 経路と Canvas2D 経路のみを必須通過対象とし、WebGPU 経路はローカル / プレビュー環境での手動確認に依存する。

### 11.2.3 モバイル WebGPU 特有の罠 (Round 3 / Issue #18)

PC ブラウザでは概ね安定する WebGPU も、スマホブラウザでは以下の固有問題が発生する (Round 3 / Gemini Pro deep, §17.14 A)。

| 環境 | 罠 | 対策 |
|---|---|---|
| **iOS Safari (iOS 26+)** | WebGPU の利用可能 GPU メモリが iPad/iPhone で厳しく制限されている。`OffscreenCanvas` や RenderTarget を多重に取ると `OutOfMemoryError` で初期化失敗 | RenderTarget は最大 2 枚 (主 + bloom) に制限、不要時は即 `destroy()`。`adapter.limits` を起動時に取得し、`maxBufferSize` / `maxTextureDimension2D` をログに残す |
| **iOS Safari (任意機種)** | バックグラウンド復帰時に WebGPU コンテキストが失われる (`webgpucontextlost` イベント発火、または静かに無効化) | `device.lost` Promise を必ず購読し、復帰時はアセット再アップロード + パイプライン再構築 (`onWebGpuLost()` ハンドラを `render/lifecycle.ts` に集約)。**ハンドラ未実装で実機リリースしてはならない** |
| **Android Chrome (Adreno GPU 一部世代)** | 特定の WGSL シェーダ (特に `discard` を含む fragment shader) でドライバが GPU プロセスごとクラッシュ | 本作のシェーダは MVP では既定で **`discard` を使わない** こと。CRT / Bloom 等の演出用シェーダで使う場合はデバイス検出 (`navigator.userAgent` の `Adreno` 混入確認) で WebGL2 経路へフォールバック |
| **Android Chrome (Mali GPU 一部世代)** | 16bit float RenderTarget で精度不足によるバンディング | 16bit float が必要な経路 (HD-2D Bloom) は Mali では 8bit に降格、または演出 OFF |
| **WebGL2 fallback 時の iOS Safari** | `highp` (高精度浮動小数点) のサポートが不完全。`mediump` 扱いになりシェーダの見た目が変わる | シェーダで `precision highp float;` を宣言しても iOS では実質 `mediump` のことがある。本作の演出シェーダは **`mediump` で破綻しないように実装** (大きな数値を扱わない、座標は normalized [0,1] で渡す) |

#### スマホ判定での自動プロファイル

```ts
// render/profile.ts
function detectMobile(): 'ios-safari' | 'android-chrome' | 'desktop' {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return 'ios-safari';
  if (/Android/.test(ua)) return 'android-chrome';
  return 'desktop';
}

export function defaultRenderProfile() {
  const m = detectMobile();
  if (m === 'desktop') return { crt: false, bloom: false, hd2d: false };  // ユーザー任意で ON
  // モバイルは初期 OFF。発熱と GPU 不安定を避ける (§95 / §11.2.3)
  return { crt: false, bloom: false, hd2d: false, lockToCanvas2DIfWebGPULostTwice: true };
}
```

- WebGPU コンテキストロストが 1 セッション中に **2 回連続** 発生したら、設定を `display.renderer = 'canvas2d'` に強制降格してリロードを促す (発生頻度の閾値は §95 性能調整と整合させる)。
- **シェーダ言語**: WebGPU は WGSL、WebGL2 は GLSL ES 3.00。Pixi.js v8 が両方を内部で吸収するため、本作のアプリ側コードはシェーダ言語を意識しない。独自シェーダを書く局面 (CRT, Bloom) のみ WGSL を主、GLSL を副とし、両言語版を `render/shaders/` に並置する。

### 11.2.2 Canvas2D フォールバック時の制約

WebGPU/WebGL2 のいずれも不可の場合、以下の機能を自動的に無効化する:

- CRT モード / Bloom / 加算光源 (§11.10 / §18.5)
- 60→120Hz の補間描画は `lerp` のみ (extrapolate は線形変換負荷で重いため off, §11.6)
- HD-2D 風モード (§18.2.2) は選択 UI から非表示

これらの無効化は §93 のセーブデータの `display.featureFlags` にスナップ保存し、設定画面 (§96) で「現在の環境では使用不可」とグレーアウト表示する。

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
- ノノグラム (本作) では物理計算が無いため subpixel 演算は不要。本節の「サブピクセル / シマーリング対策」は本作では使わないが、Pixi.js v8 を採用する事実は変わらないため、将来 v1.1 で別ジャンル拡張時の参考として残置。
- §98 で詳述。

### 11.5.1 シマーリング (Shimmering) 対策

「モダン」モードでは subpixel 位置がそのまま画面に反映されるため、カメラとエンティティの座標スナップ順序が崩れると、ピクセル幅が瞬間的に伸縮して見える。固定の順序を採用する:

1. **カメラ位置**を計算 (§70 の補間)。サブピクセル単位で保持。
2. すべての描画対象アクター/タイルの **ワールド座標 - カメラ位置** をデバイス座標に変換。
3. デバイス座標は `Math.round` で **同一の丸め関数** を使う (各 entity に独自丸めを適用しない)。
4. nearest-neighbor 描画モードでは scale が整数で、丸め後は必ずデバイスピクセル境界に落ちる。線形補間モードでは丸めを行わない。

カメラとエンティティで丸め方が違うとシマーリングが発生する。順序と丸め関数を 1 ファイル (`render/coords.ts`) に集約する。

#### 11.5.2 高 DPR (DPR = 3) でのシマリング (Round 3 / Issue #18, 深刻度: 中)

iPhone (DPR=3 が一般的) では `imageSmoothingEnabled = false` / WebGPU の nearest sampling を指定しても、**Pixi.js / WebGPU に渡す座標が小数点を持つと、エッジが補間されて滲む** (Round 3 / Gemini Pro deep, §17.14 I)。

##### 必須対応 (Pixel Perfect Rendering)

```ts
// render/coords.ts (集約箇所)
export function snapToPixel(worldSubpixel: number, cameraSubpixel: number, scale: number): number {
  // worldSubpixel - cameraSubpixel を subpixel 単位で計算 → px に変換 → 整数化
  const px = (worldSubpixel - cameraSubpixel) >> 4;   // Int32Array 由来なので確実に整数
  return (px * scale) | 0;                            // Pixi.js 渡し前の最終整数化
}

// 描画呼び出し側
sprite.x = snapToPixel(actor.x_sub, camera.x_sub, scale);
sprite.y = snapToPixel(actor.y_sub, camera.y_sub, scale);
```

- **`Math.floor()` / `(x | 0)` を Pixi.js (またはレンダラ) に座標を渡す直前で必ず通す**。Int32Array SoA の物理側 (§20.1.1) は決定論のため `>> 4` で px を整数化しているが、レンダラに渡す前の `* scale` で再び小数化するケースがあるため、**最終呼び出しで `| 0`** が必須。
- 集約箇所: `render/coords.ts` の 1 ファイル。各 entity が独自の丸めを実装するのは禁止 (§11.5.1 と同じ規律)。
- nearest sampling 自体は Pixi.js v8 の `BaseTexture.style.scaleMode = 'nearest'` で設定済 (Round 2 で確定)。
- 「モダン」モード (subpixel motion 有効) では `snapToPixel` ではなく `subPixelOffsetForRenderer` という別関数を用意し、scale が整数 (= nearest mode 有効時) のみ `| 0` を通す。線形補間モードでは小数を保持。

## 11.6 60→120Hz の補間描画

- 物理は 60Hz 固定 (§94)。描画は rAF (デバイスのリフレッシュレート) で行う。
- 既定モード (低レイテンシ重視ではない場合): アクター位置を `prev_pos` と `curr_pos` で保持し、`alpha = accumulator / dt` で `lerp(prev, curr, alpha)` を描画位置として採用。
- このモードは見え方が滑らかになる代わりに、**描画が物理から最大 1 frame (16.7ms) 遅れる**。アクション性 (入力レイテンシ §9.8) を最優先する場合は次の外挿モードを選ぶ。
- 低レイテンシモード (オプション、競技性重視): `curr_pos + vel * dt * alpha` で **外挿 (extrapolation)** する。衝突直前のアクターが物理境界を 1〜2 px 越えて見える可能性があるため、視覚に影響しない範囲のクランプを併用する (画面端などの境界では外挿しない)。
- ユーザー設定で `display.frameInterpolation: 'lerp' | 'extrapolate' | 'none'` を切替可能 (§93)。`none` は単に `curr_pos` を使い、見た目は古典 60Hz に固定される (低 Hz 端末向けの最軽量)。

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

- ノノグラム (本作) ではアセットは「セル背景 / 塗りセル / × 記号 / ヒント数字フォント」程度で十分、スプライトシートは MVP では不要。Pixi.js の `Graphics` で矩形 + フォント描画で代替 (Round 6 で実装)。本節の「スプライトシート構成」は別ジャンル拡張時の参考として残置。
- アトラスのメタデータは JSON でスプライト名 → ピクセル矩形の対応を記述。
- ロード時に `<img>` 経由で読み込み、`OffscreenCanvas` にデコードして以降は ImageBitmap として保持 (decode コスト削減)。

## 11.9 アニメーション

- フレーム配列 + 1 frame あたりの "tick 数" で定義。
- 例: Goomba walk: `[ frame_a (8 tick), frame_b (8 tick) ]` を loop。
- アニメーション状態は entity component として保持。state 変更時に reset。

## 11.10 シェーダ演出 (オプション)

- 既定レンダラ (WebGPU) または WebGL2 フォールバック時のみ提供:
  - **CRT モード**: scanline + barrel distortion + 残光。プリセット ON/OFF を §96 a11y 設定に置く。WebGPU では WGSL fragment shader、WebGL2 では GLSL ES 3.00 で同一の見た目を再現。
  - **HD-2D 風 Bloom**: 一部光源 (コイン、ファイア、Star) のみ加算合成。WebGPU 採用時は 16bit float の RenderTarget により低輝度ブルーミングまで階調を保てる (§11.2.1)。
- 既定は OFF (パフォーマンス安全)。性能ばらつき対応 (§17.13) で自動 OFF にされる場合あり。
- Canvas2D フォールバック時は UI から非表示にする (§11.2.2)。

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
