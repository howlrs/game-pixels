# 30. 衝突解像

## 3.1 設計方針

- **タイルベース** (16×16 px グリッド) を主、AABB を副に併用。
- 軸分離 (Sweep-and-Resolve per axis) で実装する。X → Y の順。
- サブピクセル単位で位置を保持しつつ、衝突判定は px 整数化した AABB で行う (決定論)。
- トンネリング (高速通り抜け) は最大移動量で **サブステップ** に分割して回避。

## 3.2 アクター AABB

```
Player (small):  16x16 px
Player (big):    16x32 px
Goomba:          16x16 px
Koopa Troopa:    16x24 px (歩行) / 16x16 px (甲羅)
Item (mushroom): 16x16 px
```

ヒットボックスは描画スプライトと別管理。微妙な「足元の許容」は §3.5 を参照。

## 3.3 タイル分類

| 分類 | 衝突 | メモ |
|---|---|---|
| Solid | 全方向 | 通常の地面/ブロック |
| Empty | なし | 空気、背景 |
| Platform (片道床) | 上のみ | 下から通過、上から落ちる |
| Hazard | "通過するがダメージ" | 棘、溶岩 (足元接触で被弾) |
| Slope (45°) | 全方向 + 高さ補正 | §3.6 |
| Slope (22.5°) | 全方向 + 高さ補正 | §3.6 |
| Pipe entrance | コンテキスト依存 | 入る入力で別ステージへ (§80) |
| Bumpable | 上面 = 通過可能、下面で頭突き発動 | "?" ブロック等 (§60) |
| Breakable | 同上 + 大きいプレイヤーの頭突きで破壊 | レンガ |

## 3.4 アルゴリズム (整数 + subpixel)

```pseudo
function step_actor(a, dx_sub, dy_sub):
    # サブステップ数を最大移動量で決定 (8px 以上動く場合は分割)
    max_step_px = 8
    steps = max(1, ceil(max(|dx_sub|, |dy_sub|) / (max_step_px * 16)))
    sx = dx_sub / steps
    sy = dy_sub / steps
    for s in 1..steps:
        move_x(a, sx)
        move_y(a, sy)

# フェイルセーフ: 1 サブステップ内のループは MAX_RESOLVE_ITERATIONS (8) を超えない。
# 超過時は warn ログ + アクター位置を直前の非衝突位置に固定して脱出する。
MAX_RESOLVE_ITERATIONS = 8

function move_x(a, dx_sub):
    a.x_sub += dx_sub
    iters = 0
    while a moves further than 1 px in this substep:
        iters += 1
        if iters > MAX_RESOLVE_ITERATIONS:
            log_warn("collision resolve loop overflow"); break
        if collides_after_x(a):
            push back to last non-colliding px column
            a.x_sub = a.x_px << 4  # subpixel をリセット (壁にめり込まない)
            a.vx = 0
            a.x_subforce = 0       # 古典挙動: 衝突で subspeed もリセット
            break

function move_y(a, dy_sub):
    similar, plus:
        if dy>0 and contact: on_ground = true; coyote_timer = COYOTE
        if dy<0 and contact: vy = 0; jump_consumed = true   # 頭打ち
```

### 補足

- 「次の位置で衝突するか」を 1 px ずつ進めて判定する (cheap, deterministic)。
- 高速移動 (subpixel >> 16 を超える) はサブステップ分割で回避。8 px/step を上限にすればプレイヤー最高速 (2.5 px/frame) では 1 step で十分。
- 弾 (Bullet Bill, 火球) や落下中の高速プレイヤー用に、最大 4〜8 サブステップ程度を見込む。

## 3.5 ゴーストバーテックス対策 (連続タイルの継ぎ目)

横並びの Solid タイル群を歩いた際に **継ぎ目で引っかかる** 問題を防ぐ。本作は採用方針:

1. **サブピクセル丸め前に判定** することで、px 単位の微小ジャンプを回避。
2. **接地中の 1 px 段差は「自動上昇」** で吸収 (Auto-step up to 1 px when grounded and moving horizontally)。古典の挙動と差分は感じない範囲。
   - 厳密な発火条件: **(a) 接地中**, **(b) 水平移動中** (`vx ≠ 0`), **(c) 進行方向の足元タイルが Solid**, **(d) その 1 px 上のセルが Empty (= プレイヤーの新 AABB が空中)**, **(e) プレイヤーの頭上 1 px も Empty (= headroom 確保)**。これらすべてを満たす場合のみ 1 px 押し上げ。これに反する場合は通常の壁衝突として処理する (壁伝いに浮遊するグリッチを防止)。
3. 連続タイルの境界をマージしたコリジョン形状を持たない (タイル個別判定)。代わりに、**接地中の Y 衝突は「上から押し戻し」のみ採用** し、横方向の頭突きを発生させない。

> 注: Box2D 等の物理エンジンでよく使われる「接続タイルの仮想頂点 (chain shape)」相当の処理。本作はタイル方式なのでマージは不要だが、押し戻し優先軸を変えることで等価の効果を得る。

## 3.6 坂 (Slope)

- 坂タイルは **タイル内 Y オフセット関数** `slope_y(x_in_tile)` を持つ。例: 45° タイル → `y = 16 - x_in_tile`。
- プレイヤーの **足元 X 中央** がタイル内のどの x に当たるかで `slope_y` を計算し、`expected_y = tile.y + slope_y(x)` に "snap" する。
- **スナップ前に headroom を確認**: スナップ後の AABB の頭上 1 px (= 上方 1 行の cell) に Solid タイルがある場合はスナップを行わず通常衝突 (横方向押し戻し) として処理。これにより坂を登った先に低い天井がある場合に頭がめり込むのを防ぐ。
- 接地中の坂上昇/下降では `vy = 0` (重力分は次フレーム判定で吸収)。下り坂で空中に放り出されないため、接地維持距離 (1〜2 px) を許容する。
- 坂の頂点で連続して別の坂/ブロックがある場合、優先順位は **より上にある y を採用** する (めり込み防止)。

## 3.7 片道床 (Jump-through Platform)

タイマーベースで衝突無効化を行うと、フレーム落ちや重力次第で「タイマー切れ時にまだ床と交差している」状態が発生し地形にスタックする。本作は **状態管理ベース** を採用する。

- アクターごとに `ignored_one_way: Set<TileRef>` を持つ。
- 上昇中 (`vy < 0`) または "下入力 + ジャンプ" を契機に、現在交差している片道床のタイル参照を `ignored_one_way` に追加。
- 毎フレーム、`ignored_one_way` の各エントリについて **AABB の重なりが完全に消えた** タイミングで Set から除外する。除外されるまではそのタイルは衝突無効。
- これにより SMB3 系の「下段に降りる」操作と SMB1 系の「下から通り抜ける」操作の両方を表現可能で、かつスタックしない。
- フェイルセーフ: 同時無視タイル数の上限 (8) を設け、超過時は古い順に解放する (異常系)。

## 3.8 トリガー判定

物理衝突とは別レイヤーの "イベントトリガー":

- アイテム取得、コイン取得、ゴール接触、敵踏みつけ判定 (上半身 vs 下半身)。
- 物理応答は無し、AABB 重なりだけ検出。フレームの最後に処理して位置補正の影響を受けないようにする。

## 3.9 性能の見積もり

- 1 フレームのアクター数: 主 (プレイヤー 1) + サブ (敵 8〜16, 弾 0〜4)。
- 1 アクターあたりタイル参照: 4〜9 個 (AABB が触れうるタイル)。
- 全体: 数百件のセル参照/frame。Canvas2D + 純 JS でも余裕がある (1ms 未満を見込む)。

## 3.10 既知の罠と対策

| 罠 | 対策 |
|---|---|
| 高速落下で床貫通 | terminal velocity を 4 px/frame 以下に保つ + サブステップ |
| 角に挟まる | 軸分離 (X 先) で水平押し戻し優先、垂直は次フレーム |
| 坂頂点で吹っ飛ぶ | 接地維持 (`coyote_grace_y = 2 px`) を許容 |
| 動く床 (移動プラットフォーム) との位置ズレ | プラットフォーム移動 → 乗っているアクターを同方向に同量移動 (carry) する後処理 |
| エッジで足踏み外す | §2.2.5 edge forgiveness 2 px |
