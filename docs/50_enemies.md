# 50. 敵 AI

## 5.1 設計原則

- 敵は **データ駆動の有限状態機械 (FSM)**。共通インターフェース `Enemy` を継承。
- 物理は §20 を共有 (重力、AABB)。ただし水平移動のロジックは敵ごとに異なる。
- スポーン/デスポーンは画面外境界 (左右に 1 タイル分のマージン) で制御 (§5.7)。
- 敵同士の衝突は **基本無し** (古典互換: お互いをすり抜ける)。例外: 甲羅 → 他の敵 (§5.5)。

## 5.2 共通インターフェース

`hp` は **正の整数** で持たせ、踏みつけ・甲羅当たり・ファイア弾命中はすべて整数ダメージで一律処理する (踏み = 1 dmg を既定)。Goomba (`hp: 1`) のような即死敵は 1 hp + ダメージ 1、ボス系 (`hp: 5`) は耐久ヒット数として扱える。耐性 (例: ファイア弾無効) は `damage_resists` で表現する。

```ts
interface Enemy {
  aabb: AABB;
  pos: SubPixelVec2;
  vel: SubPixelVec2;
  state: EnemyState;     // alive | stunned | shell_idle | shell_moving | dead
  hp: number;            // 残り耐久。0 で死亡。
  damage_resists: { stomp?: boolean; shell?: boolean; fireball?: boolean };
  facing: -1 | 1;
  on_ground: boolean;
  stomp_bounce: number;  // プレイヤーが踏んだときの反力 (subpixel/frame)
  step(world): void;
  on_stomp(player): StompResult;
  on_shell_hit(shell): void;
  on_fireball_hit(fireball): void;
  on_screen_exit(): void;
}

type StompResult =
  | { kind: 'killed' }
  | { kind: 'damaged' }       // 耐久が残ったので生存 (HP > 0)
  | { kind: 'shelled' }       // 甲羅化 (Koopa)
  | { kind: 'no_effect' }     // 無効 (棘)
  | { kind: 'damage_player' } // 反撃 (Spiny の上踏み等)
```

## 5.3 敵カタログ (MVP)

### 5.3.1 Goomba (クリボー相当)

- 移動: 一定速度 ±8 subpixel/frame で進行方向に歩く。
- 壁/崖: 壁に当たると反転。崖は **落ちる** (古典 SMB1 互換)。
- 踏みつけ: `killed`。プレイヤーに `stomp_bounce = -3` を返す。
- 甲羅当たり: `dead`。
- ファイア弾: `dead` (得点 +200)。
- スポーン: 画面右端から 16 px 入った時点で active 化。

### 5.3.2 Koopa Troopa (緑)

- 移動: ±8 subpixel/frame。崖は **落ちない** (反転)。
- 踏みつけ: `shelled`。state = `shell_idle`、AABB を 16×16 に縮小、5 秒後に復活 (`shell_idle` 残り 1 秒で点滅)。
- 復活後: `alive` に戻り、起き上がり 16 frame で歩行再開。
- 甲羅 (`shell_idle`) を踏みつけ: 何もしない (`stomp_bounce = -3` のみ返す)。
- 甲羅 (`shell_idle`) を Run 保持で接触: プレイヤーが甲羅を持つ (§5.5)。
- 甲羅 (`shell_idle`) を Run 非保持で接触: 甲羅を蹴る → `shell_moving` (vx = ±56 subpixel/frame, 接触方向の逆向き)。
- ファイア弾: `dead`。

### 5.3.3 Koopa Troopa (赤)

- 移動: 緑と同じだが、**崖の手前で反転**。
- 崖判定は「足元の前方タイルが空か」を **進行方向に 4 subpixel 先 (ルックアヘッド)** で評価する。サブピクセル位置のまま判定すると 1 subpixel 越えで落下する不安定挙動になるため。
- ルックアヘッドの分量は速度 `|vx|` に応じて調整 (`max(4, |vx| / 2)` subpixel)。
- 他の挙動は緑と同じ。

### 5.3.4 Piranha Plant (パックンフラワー)

- 配管 (Pipe) から上下に出入り。サイクル: 2 秒上昇 → 1 秒静止 → 2 秒下降 → 2 秒待機。
- プレイヤーが配管の周辺 (24 px 以内) にいるときは出てこない (古典互換のフェアネス)。
- 踏みつけ不可 (`damage_player`)。ファイア弾で死亡。

### 5.3.5 Bullet Bill (キラー)

- 直線水平移動。±32 subpixel/frame。重力影響なし。壁を貫通。
- スポーン位置から 256 px 進むとデスポーン。
- 踏みつけ可能 (`stomp_bounce = -3`, `killed`)。下/横接触は `damage_player`。

### 5.3.6 Spiny (トゲゾー)

- Lakitu (§5.3.7) からドロップ、地面に着地後に水平移動 (±8 subpixel/frame)。
- 上踏みは `damage_player` (棘)。横/下接触も同様。
- ファイア弾 `damage_player` (無効)。甲羅当たりで `dead`。

### 5.3.7 Lakitu (ジュゲム)

- カメラに対して相対位置で移動 (画面の上半分、X はプレイヤー追従)。
- 一定間隔 (4 秒) で Spiny を投下。
- 踏みつけ可能 (`killed`)。ファイア弾でも死亡。

### 5.3.8 Hammer Bro

- 短い水平移動 + ジャンプ (上下プラットフォーム間)。
- 一定間隔でハンマー投擲 (放物線)。
- 踏みつけ・ファイア弾で死亡。

### 5.3.9 Cheep Cheep / Blooper

- 水中の敵。重力負・水流影響あり。詳細は MVP 後。

## 5.4 踏みつけ判定

```pseudo
on_player_overlap_enemy(p, e):
    rel = p.bottom - e.top            # プレイヤーの足元 vs 敵の頭
    if p.vy > 0 and rel > 0 and p.bottom <= e.top + STOMP_TOLERANCE (4 px):
        result = e.on_stomp(p)
        match result:
            killed: e.state = dead; p.vy = e.stomp_bounce; score += 100
            shelled: convert e to shell_idle; p.vy = e.stomp_bounce
            no_effect: p.vy = e.stomp_bounce
            damage_player: damage(p)
    else:
        damage(p)
```

- `STOMP_TOLERANCE` で「角接触の判定揺れ」を吸収する。
- ジャンプ保持中の踏みつけは `stomp_bounce` を **倍** にする (古典挙動: 高くバウンドする)。

## 5.5 甲羅 (Shell)

```ts
type Shell = {
  state: 'idle' | 'moving';
  vel: SubPixelVec2;
  carrier: PlayerRef | null;
};
```

- `idle`: 重力あり、水平 0。プレイヤーが触れると `moving` 化 (蹴る) または `carrier` 化 (持つ; Run 保持時)。
- `moving`: 水平 ±56 subpixel/frame、重力あり、壁/敵に当たる。敵に当たると敵を倒し、甲羅も継続。
- 甲羅 `moving` がプレイヤーに当たると: 同方向移動なら無効、逆方向接触は `damage_player`。
- プレイヤーが持つ甲羅: 投擲時に `vx = ±64` 強制。投擲方向は `facing`。
- 甲羅 `moving` 同士は **すり抜け** (連鎖を防ぐ)。

### 5.5.1 連鎖スコア

甲羅で連続で敵を倒すごとにスコア倍率が増える: 100 → 200 → 400 → 800 → 1000 → 2000 → 4000 → 8000 → 1UP。Goomba/Koopa の踏みつけ連鎖でも同様 (空中連続踏み)。

## 5.6 ファイアボール (プレイヤー側)

- プレイヤー Fire 状態でアクションボタン押下 → 1 個発射。同時上限 2 個。
- 速度: `vx = ±64`、`vy = +24` (重力あり)。地面でバウンドする (`vy *= -0.7` 相当)。
  - 整数で計算する場合は **`Math.trunc(-vy * 7 / 8)`** を採用する。`-(vy * 7) >> 3` は JS の算術右シフト仕様により負数で 0 方向に丸められず誤差を生む (例: `-1 >> 3 === -1`)。決定論を保つため算術シフトは使わない。
- 寿命: 飛距離 256 px or 4 回バウンドで消滅。
- 敵衝突: 敵の `on_fireball_hit` を呼ぶ。

## 5.7 スポーン/デスポーン

- ステージデータには敵の **配置 X**, **配置 Y**, **種別**, **属性** を持たせる。
- カメラの右端 + 16 px に達したらアクター化。
- カメラの左端 - 32 px を超えて左にあるとデスポーン (敵を消去)。
- 例外: ボス、Lakitu はカメラ追従、デスポーンしない。

## 5.8 ボス (将来拡張)

- Bowser 相当: HP 5。ジャンプ + ファイア弾投擲のサイクル。
- ボス戦専用カメラ (§70)、専用 BGM (§92)。
- MVP 範囲外だが、データモデルは予約しておく。

## 5.9 既知の罠と対策

| 罠 | 対策 |
|---|---|
| 高速プレイヤーで敵を貫通 | 物理サブステップ + トリガー判定 (§3.8) |
| 甲羅で自分を倒すループ | 投げてから 8 frame は当たり判定無効 (`shell_safe_timer`) |
| Lakitu が画面外で大量 Spiny を投下 | 同時存在数の上限 (敵テーブル全体で 16 体まで) |
| Piranha Plant がプレイヤー直下で起き上がる | 配管周辺距離フィルタ (24 px) |
