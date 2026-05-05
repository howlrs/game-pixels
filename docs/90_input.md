# 90. 入力

## 9.1 設計目標

- **3 系統 (Keyboard, Pointer/Touch, Gamepad) を完全対応** し、内部では **論理ボタン** に正規化する。
- 同じプレイヤー操作を、デバイスを切り替えても再現可能にする。
- リマップを許可する (a11y, §96)。
- レイテンシは 1 frame (16.7ms) 以内に処理。

## 9.2 論理ボタン

| 論理 | 既定キー | 既定ゲームパッド | 既定タッチ |
|---|---|---|---|
| Left | ArrowLeft, A | DPad Left, LStick X<-0.4 | 左仮想スティック |
| Right | ArrowRight, D | DPad Right, LStick X>0.4 | 同上 |
| Up | ArrowUp, W | DPad Up, LStick Y<-0.4 | 同上 |
| Down | ArrowDown, S | DPad Down, LStick Y>0.4 | 同上 |
| Jump | Space, K, Z | A (face down) | 右下ボタン (大) |
| Run/Action | Shift, J, X | B (face right) | 右上ボタン (小) |
| Pause | Esc, Enter | Start | 画面右上アイコン |

## 9.3 入力スナップショット

各 frame の最初に **イベントキューを論理状態にスナップ**:

```ts
interface InputSnapshot {
  ax: -1 | 0 | 1;       // 横入力 (Pointer はスティック同等の値)
  ay: -1 | 0 | 1;       // 縦入力
  jump: ButtonState;    // pressed | held | released | up
  run:  ButtonState;
  pause: ButtonState;
  // 既存パッドの "edge" を保持 (jump_pressed_this_frame 等)
}
```

- `pressed` フラグはこの frame で押された瞬間のみ true。`held` は継続中。
- イベントは UI スレッド (rAF コールバック前) で受信し、物理 frame 開始時にロックして利用する (§94)。

## 9.4 Keyboard

- `keydown` / `keyup` をキャプチャ。`event.code` を主に使う (キーボード配列に依存しないため)。
- 既知の問題: 同時押し制限 (NKRO/6KRO)。プレイヤーには多くて Jump/Run + 方向キーで 3 同時で済むよう設計。
- ブラウザのフォーカス喪失で `keyup` が来ないケース → `window.blur` で全キー解放。

## 9.5 Pointer / Touch

### 9.5.1 仮想ジョイパッド

- 画面左下: 仮想 D-Pad (固定アンカー型) または スライド型 (initial-touch anchored)。MVP は **固定型** (古典の SMB UI に近い)。
- 画面右下: Jump (大) / Run (小) ボタン。
- ボタン配置はデバイスサイズに応じて拡縮 (§97)。
- 入力受付は **マルチポインタ** (左手スティック + 右手ボタン同時) を必須サポート。

### 9.5.2 PointerEvent vs TouchEvent

- 既定で `PointerEvent` のみ採用 (Pointer Events Level 2 は全モダンブラウザで対応済み, 2026 時点)。
- `pointerdown` / `pointermove` / `pointerup` / `pointercancel` を扱う。
- `touch-action: none` を CSS で当て、ダブルタップズームやスクロールを無効化。
- ただし iOS Safari のエッジスワイプ (戻る) や一部の OS ジェスチャは CSS だけでは止まらない。ゲームキャンバス上の `touchstart` / `touchmove` リスナーを **`{ passive: false }` で登録**し、必要に応じて `e.preventDefault()` を呼ぶことで補強する (PointerEvent と並行登録)。

### 9.5.3 仮想ボタンのデッドゾーンとヒットボックス

- Jump/Run ボタンのヒットボックスは **見た目より 16 px 大きい** (誤押しの逆: 押し損ね対策)。
- 仮想スティックは radius 64 px を中心からの最大移動距離として、X/Y を `-1..+1` に正規化。
- スティックのデッドゾーン: 0.25 (中心の手のずれを許容)。

### 9.5.4 ハプティック

- 着地、ダメージ、コイン取得時に `navigator.vibrate(10)` を呼ぶ (a11y で off 可能)。
- iOS は vibrate 非対応のため、`AudioContext` 経由の触覚は採用せず、視覚 + 音で代替。

## 9.6 Gamepad

- **接続/切断**: `gamepadconnected` / `gamepaddisconnected` イベントで HUD アイコンに反映 (§9.6.4 自動切替)。
- **状態取得**: `requestAnimationFrame` 内で `navigator.getGamepads()` をポーリングし、毎 frame の `Gamepad.buttons[i].pressed` / `Gamepad.axes[i]` を読む (Gamepad API には button イベントが存在しないため、ポーリング + edge 判定で代替する)。
- **edge 生成**: 前 frame の `pressed` を保持し、`now && !prev` を `pressed`、`!now && prev` を `released` として論理ボタン (§9.2) に流す。これを `core/input/gamepad.ts` に集約する (§14.6)。
- **マッピング**: ブラウザが提供する **`Gamepad.mapping === 'standard'`** を一級市民とし、Switch Pro / DualShock / DualSense / Xbox / Stadia は "standard" で吸収。`mapping !== 'standard'` の場合 (一部古い HID コントローラ) は §9.7 のリマップ画面に強制誘導する。
- **デッドゾーン**: 一部 Bluetooth コントローラの `axes` がアイドル時に `0` を返さない問題に対し、デッドゾーン **0.18** (radial) を適用。スティック中心からの距離が 0.18 未満の入力はゼロ扱い。
- **触覚 (Vibration Actuators)**: `Gamepad.vibrationActuator?.playEffect('dual-rumble', { duration, strongMagnitude, weakMagnitude })` を採用。a11y 設定で off 可能 (§96)。Safari は未対応のため optional chaining で安全に no-op 化する。
- **電池残量**: 一部の `Gamepad` 実装は `Gamepad.battery?.level` を持つ (Chromium のみ, 2026 時点で実験的)。HUD 通知のみに使い、ゲームロジックには影響させない。

### 9.6.1 ジョイスティック → 4 方向

- `axes[0] < -0.4` で Left, `> 0.4` で Right。同じく `axes[1]` で Up/Down。
- D-Pad と OR で合成 (どちらの入力でも動く)。

### 9.6.2 イベントモデルとポーリングの併用 (Round 2 / Issue #11)

Gamepad API は **接続イベント (gamepadconnected/disconnected) はあるが、ボタン押下イベントは無い** ため、本作では下記のハイブリッド構成を採用する:

| 種別 | 取得方法 | 用途 |
| :--- | :--- | :--- |
| 接続/切断 | `addEventListener('gamepadconnected', ...)` | HUD アイコン点灯、入力モード自動切替 (§17.6) |
| ボタン状態 | rAF 内で `navigator.getGamepads()` ポーリング | 物理 frame 開始時のスナップショット (§9.3) |
| 触覚再生 | `vibrationActuator.playEffect(...)` (Promise) | 着地・ダメージ・コイン取得 |
| リマップ取得 | `mapping` プロパティ + `id` 文字列 | 既知 ID テーブルとの照合 (§9.7) |

ポーリングは rAF と同一フレーム上で行い、入力スナップショット境界 (§9.3 / §14.4) を超えないようにする。

### 9.6.3 ハードウェア毎の罠

| 罠 | 対策 |
|---|---|
| Joy-Con (横持ち) は `mapping = ''` で識別不能 | `id` 文字列の部分一致 (`Joy-Con`) で専用プロファイルに振り分け、リマップ UI へ誘導 |
| DualSense のアダプティブトリガは Web からは不可 | 振動のみ `dual-rumble` で代替 |
| Bluetooth 経由の Xbox コントローラは `pressed` の reporting rate が不安定 | 5 frame 連続未押下を確認してから `released` 確定 (チャタリング防止) |
| Gamepad API は **secure context (https/localhost)** でしか動かない | dev サーバを `https://localhost` で起動 (§14.9) |

### 9.6.4 入力デバイス自動切替 (Last Input Wins)

- 直近 1.5 秒に検出した入力方式 (Keyboard / Pointer / Gamepad) を `lastInputDevice` として保持。
- HUD のヒント表記 (§17.7) と仮想ジョイパッドの表示/非表示 (§17.6) を `lastInputDevice` 駆動で切替。
- ゲームパッドが切断された場合は即座に Keyboard / Pointer に降格 (検出から 200ms 以内)。

## 9.7 リマップ

- 設定画面で論理ボタンに **物理ボタンを再割当て** 可能。
- 保存先: IndexedDB (`settings.input.binding`)。
- リマップ中は他の入力を一時停止 (誤検知防止)。
- "Reset to defaults" を必ず提供。

## 9.8 入力レイテンシ管理

- イベント発生 → ハンドラ呼び出し → スナップショット形成 → 物理 step。
- 1 frame (16.7ms) 以内が目標。`performance.now()` で測定。
- 計測用フックを開発時に有効化、`input_event_to_render_ms` を HUD に表示できるようにする。

## 9.9 自動スクリプト/リプレイ

- 入力スナップショットの列を [frame] -> InputSnapshot で記録 (§94 のリプレイ機能で使用)。
- フォーマット: 各 frame の bitmask + 軸 (8 bit/frame 程度)。
- ゴーストや TAS 用としても使える設計。
- **外部から読み込む InputSnapshot は厳密にバリデーションする**。`ax/ay` は `{-1, 0, 1}` のみ、ボタン状態は列挙値、軸が `NaN` / `Infinity` / 範囲外の場合は読み込み拒否 + 警告。これを怠ると物理エンジンに NaN が伝播し、決定論破壊・無限ループの原因になる。

## 9.10 既知の罠と対策

| 罠 | 対策 |
|---|---|
| ブラウザ標準ショートカット (Ctrl+W 等) | ホットキーは絶対に取らない。ESC pause のみ。 |
| 高 DPI 下でタッチ座標がズレる | `pointer.clientX/Y` をビューポートに合わせて変換 |
| iOS Safari の `100vh` 問題 | viewport を JS で再計算 (`visualViewport`) |
| ゲームパッドの不検出 | UI で接続確認のヒントを表示 (任意のボタン押下を促す) |
