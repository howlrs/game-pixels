# 40. プレイヤー

## 4.1 プレイヤー状態モデル

プレイヤーはサイズ階層 (パワー段階) と動作状態 (state machine) の二軸で管理する。両者は独立。

### 4.1.1 サイズ階層 (3 段階)

| サイズ | AABB | 受けるダメージの結果 |
|---|---|---|
| Small | 16×16 | 1 ヒットで死亡 |
| Big | 16×32 | 1 ヒットで Small に降格 + 無敵 (i-frame) |
| Fire | 16×32 (Big と同サイズ) | 1 ヒットで Small に降格 + 無敵 |

- 拡張可能性: Frog, Tanooki, Cape 等の追加サイズ/能力は MVP 範囲外。アーキテクチャ的には "PowerComponent" に複数フラグを持たせる (§94)。
- ダメージ降格は Big → Small (Fire は Big と同階層、ファイア能力のみ消失)。古典 SMB3 の二段降格は採らない (Big↔Fire は能力差のみ)。

### 4.1.2 動作状態 (State Machine)

```
[Idle] ⇌ [Walk] ⇌ [Run]      (地上の連続体: 速度で決まる)
   ↓
[Jump] → [Fall] → (Land) → [Idle/Walk]
[Skid] (進行方向と反対入力 & 高速時の特殊状態)
[Crouch] (Big/Fire のみ。下入力で AABB 16×16 に縮小)
[Climb] (はしご/ツタ)
[Swim] (水中)
[Ride] (Yoshi 系の派生; MVP 外)
[Hurt] (ダメージ受傷直後の演出フレーム)
[Dead] (死亡演出)
[Goalpole] (ゴール演出。操作不可)
```

- 地上 3 状態 (Idle/Walk/Run) は「速度から動的に表示状態を決める」だけで、内部状態としては "Grounded" 1 つで扱う実装も可。コード簡素化のため "Grounded / Airborne" の 2 状態 + 表示用 sub-state とする。

## 4.2 操作と動作の対応

入力抽象 (§90) を経た論理ボタン:

| 論理ボタン | 効果 |
|---|---|
| Left/Right | 水平入力。加速 (§2.2)。 |
| Up | はしご上り、ドアに入る、垂直配管に入る。 |
| Down | しゃがみ (Big/Fire)、片道床から落ちる、垂直配管に入る。 |
| Jump | ジャンプ。可変高 (§2.2.4)、coyote/buffer (§2.2.5)。 |
| Run/Action | 走り保持 (上限速度切替)、ファイア弾発射 (Fire 状態時)、甲羅を持つ。 |
| Pause | ポーズメニュー (§80)。 |

### 4.2.1 ジャンプ詳細

```pseudo
on_jump_pressed:
    jump_buffer_timer = 6
on_jump_released:
    jump_button_held = false
    if vy < 0: vy = max(vy, FALL_GRAVITY_THRESHOLD)  # 早期落下に切替

every_frame:
    if jump_buffer_timer > 0 and (on_ground or coyote_timer > 0):
        vy = -INITIAL_JUMP_SPEED[speed_idx]
        jump_buffer_timer = 0
        coyote_timer = 0
        on_ground = false
        jump_button_held = true
```

### 4.2.2 ダッシュとスキッド

- Run ボタン保持中は速度上限が ±40 (subpixel/frame)。
- 進行方向と逆方向に入力すると **加速倍率 ×2** で減速 → 反転。SMB1 の独特の足踏みフィールを再現。
- 速度ゼロを超えて反転するときに `vx` の符号反転と `subspeed` のリセットを行う。

### 4.2.3 しゃがみ (Crouch)

- Big/Fire 状態で下入力中。AABB を 16×16 に縮小、移動速度は 1/2、ジャンプ不可。
- 立ち上がり時に上方の AABB が空気でないと立てない。立てない場合は強制継続しゃがみ。

## 4.3 ダメージとライフ

| 状態 | 効果 | i-frame |
|---|---|---|
| Big/Fire → Small | サイズ降格、Hurt 演出 (24 frame) | 96 frame |
| Small → Hurt | ライフ -1 → リスポーン or ゲームオーバー | — |
| 落下死 (画面下) | 即死 (サイズ無関係) | — |
| 時間切れ | 即死 | — |

i-frame 中はダメージを受けない (踏みつけは可能)。i-frame 終了直前にスプライトが点滅 (§91)。

## 4.4 パワーアップ取得時の挙動

- Small + Mushroom → Big。**0.5 秒の演出** (キャラ拡大、操作不可)。
- Big + Fire Flower → Fire。**0.5 秒の演出** (色変化のみ、操作不可)。
- Big + Mushroom → ノーチェンジ + 1000 点。
- Fire + Fire Flower → ノーチェンジ + 1000 点。
- 演出中 (`power_transition_timer > 0`) は物理は停止、スプライトのみアニメ更新。

## 4.5 死亡演出 (古典互換)

```
on_death:
    state = Dead
    vy = -INITIAL_DEATH_BOUNCE   # 約 -0x40
    vx = 0
    physics_paused_for_actor = true (タイル衝突無効, 重力のみ)
    after 60 frames:
        play sequence end animation
        respawn at checkpoint or stage start
```

- カメラはこの間追従しない (§70)。
- 落下死は跳ねず、即時リスポーン。

## 4.6 リスポーン

- ステージ開始 or 直近のチェックポイント (`mid_flag_x`) のうち、より右にあるもの。
- リスポーン時は Small から開始する (古典互換)。Fire/Big 維持を選ぶ場合は §99 で議論。
- リスポーン直後に **ノックバック i-frame 60 frame** を付与し、即死ループを防ぐ。

## 4.7 隠しコマンド/イースターエッグ

- ジャンプ中に Run 押し直しでファイア弾を撃てる (Fire 状態時、上限同時 2 発)。
- 同一フレーム内に L+R 同時入力された場合、`Player_X_MoveForce` のみを倍速で減衰させる (古典の "rapid skid")。

## 4.8 観測 (テスト容易性)

プレイヤーの内部状態をテストから観測するため、以下のデバッグフックを公開する:

```ts
interface PlayerDebugView {
  pos: { x: number; y: number };          // px
  posSub: { x: number; y: number };       // subpixel
  vel: { x: number; y: number };          // subpixel/frame
  state: PlayerState;
  size: PlayerSize;
  iframe: number;
  coyote: number;
  jumpBuffer: number;
  onGround: boolean;
}
```

これらは決定論テスト (リプレイ) に利用する (§94)。
