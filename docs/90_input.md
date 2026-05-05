# 90. 入力 (Input)

## 9.1 設計目標

- **3 系統 (Mouse / Keyboard / Touch) を完全対応**、内部では「カーソル位置 + 入力モード + アクション」に正規化
- リマップを許可 (a11y, §96)
- 入力レイテンシは 1 フレーム (16.7ms) 以内に処理
- 同じ操作を、デバイスを切り替えても再現可能

## 9.2 論理アクション

ピクセルズの操作は以下の 7 アクションに集約される:

| 論理アクション | 説明 | 既定キー (KB) | マウス (PC) | タッチ (スマホ) |
|---|---|---|---|---|
| **CursorMove** (上下左右 + Home/End/PgUp/PgDn) | カーソル移動 | ←→↑↓ | hover | (タップ位置で適用、移動は不可) |
| **Fill** | 現在セルを塗 | Z, Space | 左クリック | モード切替 + タップ |
| **MarkX** | 現在セルに × | X | 右クリック | 同上 |
| **Erase** | 現在セルを空に | C | (上書きトグル, §4.6 ※) | 同上 |
| **ToggleClueRow** (i, hint) | i 行目の hint 番目に取り消し線 | (UI 経由) | クリック | タップ |
| **ToggleClueCol** (j, hint) | 同上 | (UI 経由) | クリック | タップ |
| **ResetBoard** | 盤面リセット (要確認) | R (要確認、KB ショートカット) | リセットボタン | リセットボタン |

## 9.3 入力スナップショット (フレーム境界)

旧仕様 (プラットフォーマー) では物理 60Hz の固定タイムステップで「frame 開始時に入力スナップショット形成」が必須だったが、ノノグラムでは:

- リアルタイム性なし (ユーザー操作のたびに即時反映で十分)
- フレーム境界の概念不要
- イベント駆動: マウス/キーボード/タッチイベントが発火したら即座にハンドラ実行 → store 更新 → React 再レンダリング

```typescript
// Round 6 で実装する型定義のドラフト (シンプルな action 型):

export type GameAction =
  | { type: 'CURSOR_MOVE'; col: number; row: number }
  | { type: 'CELL_FILL'; col: number; row: number }
  | { type: 'CELL_MARK_X'; col: number; row: number }
  | { type: 'CELL_ERASE'; col: number; row: number }
  | { type: 'CLUE_TOGGLE_ROW'; row: number; hintIndex: number }
  | { type: 'CLUE_TOGGLE_COL'; col: number; hintIndex: number }
  | { type: 'RESET_BOARD' }
  | { type: 'TIMER_START' }
  | { type: 'TIMER_PAUSE' }
  | { type: 'TIMER_RESUME' };

// Zustand store の reducer で各 action を処理
```

## 9.4 Mouse (PC)

### 9.4.1 基本操作

- **左クリック** = Fill (空 → 塗)
- **右クリック** = MarkX (空 → ×)
- **左ドラッグ** = 連続 Fill (通過した空セルを全て塗)
- **右ドラッグ** = 連続 MarkX (通過した空セルを全て ×)
- **左クリック (塗 セル)** = Erase (塗 → 空) — トグル動作
- **右クリック (× セル)** = Erase (× → 空) — トグル動作

### 9.4.2 contextmenu 抑止

右クリックで contextmenu が出ないよう `event.preventDefault()`:

```typescript
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
```

ただし `<input>` や `<textarea>` 等の DOM フォーム要素では抑止しない (§9.5.5 旧仕様継承)。

### 9.4.3 ドラッグの実装方針 (起点セル属性保証、Round 5 / Gemini Pro deep 確定)

- `mousedown` で:
  1. 「ドラッグ開始セル」を記録
  2. 「最初の操作内容 (Fill or MarkX or Erase)」を確定
  3. **「起点セルの状態 (空 / 塗 / ×)」も記録** ← 重要
- `mousemove` で通過セルを追跡:
  - **起点セル属性と同じ状態のセルだけ** に同じ操作を適用
  - 例: 空セルから塗ドラッグを開始 → 通過した「空セル」だけ塗る、既に「塗」or「×」のセルは no-op
  - これにより、誤って既存の塗 or × を破壊するリスクを排除 (Undo なしの MVP の救済策)
- `mouseup` でドラッグ終了
- `mouseleave` (canvas 外に出た) でも終了扱い

#### 同セル再タップのトグル仕様

- 単発タップ (ドラッグなし) で同じ入力モードを再選択した場合は **空に戻す (トグル)** とする
- 例: 塗モードで塗セルをタップ → 空に戻る、× モードで × セルをタップ → 空に戻る
- これも Undo なしの MVP の救済策 (Round 5 / Gemini Pro 指摘)

## 9.5 Keyboard

### 9.5.1 既定キーバインド

| キー | アクション |
|---|---|
| `←` `→` `↑` `↓` | カーソル移動 |
| `Home` / `End` | 行頭 / 行末へ |
| `PageUp` / `PageDown` | ±5 行 |
| `Z` / `Space` | Fill |
| `X` | MarkX |
| `C` | Erase |
| `R` | ResetBoard (要確認ダイアログ) |
| `1` 〜 `9` | (将来) よく使うパズル選択ショートカット |
| `Esc` | (将来) ポーズ / メニュー |

### 9.5.2 リマップ (§96)

- すべてのキーは設定画面でリマップ可能 (MVP の最低限実装、設定 UI は v1.1 で本格化)
- 競合チェック (同じキーに複数アクション割り当て不可)
- LocalStorage に保存

### 9.5.3 preventDefault 制御 (§9.5.5 旧仕様継承)

- ゲームに使うキー (`←→↑↓ Z X C R Space`) はブラウザ既定 (スクロール等) を抑止
- ただし **`<input>` / `<textarea>` / `<select>` / contentEditable** にフォーカス時はスキップ (§Step C / Round 4 Gemini Pro 指摘の対応を継続)

## 9.6 Touch (スマホ / タブレット)

### 9.6.1 入力モード切替ボタン

画面下部に 3 ボタンを配置 (常時表示):

```
[ 塗 ] [ × ] [ 消 ]
```

- 現在のモードはハイライト表示
- ボタンサイズは **WCAG 44×44px 以上** (§97 / §11 a11y)

### 9.6.2 タップ操作

- セルをタップ → 現在モードに従って操作 (Fill / MarkX / Erase)
- ヒント数字をタップ → 取り消し線トグル (§60)
- 連続タップは 100ms 未満で 2 回目を無視 (誤操作防止)

### 9.6.3 ドラッグ操作 (任意, MVP に含めるか議論)

- タッチドラッグで連続 Fill / MarkX (PC マウスと同等)
- **MVP に含める方向**: 任天堂ピクロス DS / 3DS で「タッチ + スライドで連続塗り」が標準だったため、慣習として期待される
- 実装: `touchstart` でモードを確定、`touchmove` で通過セルを追跡

### 9.6.4 ピンチ / 2 本指スワイプ

- MVP では非対応 (15×15 はスマホ非サポート、≤10×10 はピンチ不要)
- v1.1 で 15×15 のスマホ対応時に導入検討 (§70.4)

### 9.6.5 long-press / コンテキストメニュー抑止

- iOS Safari の long-press でコンテキストメニュー (画像保存メニュー等) が出ないよう CSS:
  ```css
  .game-canvas, .puzzle-grid {
    -webkit-touch-callout: none;
    user-select: none;
    -webkit-user-select: none;
    touch-action: none;
  }
  ```
- 旧仕様 §9.5.5 と同じ規律を継続

## 9.7 ゲームパッド (任意, MVP 後)

MVP には含めない。v1.1 で対応する場合:

| ボタン | アクション |
|---|---|
| D-pad ←→↑↓ | CursorMove |
| A | Fill |
| B | MarkX |
| X | Erase |
| Y | (空き、将来用) |
| L1 / R1 | カテゴリ切替 (パズル選択時) |
| Start | メニュー |

## 9.8 入力デバイス自動切替 (Last Input Wins)

複数デバイスを併用するユーザー (例: スマホ + Bluetooth キーボード) のため:

- 直近 1.5 秒に検出した入力方式 (Mouse / Keyboard / Touch / Gamepad) を保持
- HUD のキーガイド表示と入力モード切替ボタンの表示を切替
  - Mouse / Keyboard: モード切替ボタンを非表示 (左右クリック / Z X C で代替)
  - Touch: モード切替ボタンを表示

## 9.9 旧仕様との対応

| 旧 §90_input (プラットフォーマー) | 新 §90_input (ノノグラム) |
|---|---|
| 論理ボタン: Left/Right/Up/Down/Jump/Run/Pause | 論理アクション: CursorMove/Fill/MarkX/Erase/ToggleClue/Reset/Timer |
| 入力スナップショット境界 (60Hz frame) | イベント駆動 (即時反映) |
| Coyote Time / Jump Buffer | なし |
| SOCD 後押し優先 | なし (キーボードの ←→ 同時押しは「両方無効」or 直近押下優先 — MVP は両方無効でシンプル) |
| 1 frame 未満タップの Latch | なし (イベント駆動なので Latch 不要) |
| Gamepad API ポーリング | MVP では非対応 (v1.1) |

旧 §90_input の物理操作部分は **すべて削除** (Round 6 で旧コード削除)。本章はそれに代わる新仕様。
