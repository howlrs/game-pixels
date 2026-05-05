# 60. ヒント補助 + 補助機能 (Assists)

## 6.1 概要

ノノグラムは「論理的に解ける」が、実際にはプレイヤーが **どこまで進めたか / どこで詰まったか** を補助する仕組みが UX に大きく影響する。本章では MVP に含む補助機能を定義する。

## 6.2 MVP 含む機能

### 6.2.1 ヒント手動マニュアルマーク (取り消し線)

プレイヤーが「この行/列ヒントの数字は塗り終わった」と判断したとき、その数字をクリック/タップして **手動でグレーアウト + 取り消し線** をつけられる。

```
取り消し線をつけた状態の例:
   ̶1̶  2  1
   ̶1̶  1  3
1  □  □  □
2  □  □  □
1  □  □  □
```

- 紙のノノグラムでは鉛筆で線を引く慣習があるため、その UX を再現
- 自動判定 (現在の盤面で完成した数字を自動グレーアウト) は **MVP 範囲外** (§5 v1.1)
- 同じ数字を再クリックで取り消し線解除 (トグル)

#### 実装方針 (TypeScript ドラフト)

```typescript
export interface ClueMarkState {
  /** rowMarks[row][i] = true なら row 行目の i 番目のヒント数字に取り消し線 */
  rowMarks: boolean[][];
  /** colMarks[col][i] = true なら col 列目の i 番目のヒント数字に取り消し線 */
  colMarks: boolean[][];
}

export function toggleRowMark(state: ClueMarkState, row: number, hintIndex: number): void {
  state.rowMarks[row]![hintIndex] = !state.rowMarks[row]![hintIndex];
}

export function toggleColMark(state: ClueMarkState, col: number, hintIndex: number): void {
  state.colMarks[col]![hintIndex] = !state.colMarks[col]![hintIndex];
}

// パズルロード時に空配列で初期化
export function createClueMarkState(rowClues: Clue[], colClues: Clue[]): ClueMarkState {
  return {
    rowMarks: rowClues.map((c) => new Array(c.length).fill(false)),
    colMarks: colClues.map((c) => new Array(c.length).fill(false)),
  };
}
```

- 進行中盤面と一緒に LocalStorage 保存 (§93)

### 6.2.2 盤面リセット (Undo の代替)

「最初からやり直す」ボタンで全セルを空に戻す。

- 確認ダイアログ必須 (誤タップ事故防止)
- 経過時間タイマーは継続 (リセットしない、ベストタイム狙いは無効化)
- ヒントマニュアルマーク (§6.2.1) も同時にリセット

```typescript
export function resetPuzzle(board: Board, marks: ClueMarkState, clues: ClueSet): void {
  resetBoard(board); // §20.6
  // ヒントマークも初期化
  for (let row = 0; row < clues.rowClues.length; row++) {
    marks.rowMarks[row]!.fill(false);
  }
  for (let col = 0; col < clues.colClues.length; col++) {
    marks.colMarks[col]!.fill(false);
  }
  // 経過時間は継続 (リセットしない)
}
```

### 6.2.3 経過時間表示 (タイマー)

- パズル開始から **mm:ss** 形式で経過時間を表示
- HUD 領域 (画面上端) に常時表示
- クリア時に「クリアタイム」として保存 (§93)
- ペナルティはなし (フリーモードのみ、MVP)
- バックグラウンド (タブ非表示) 中はタイマー停止 (`visibilitychange` で `pause/resume`、不正計測防止)

### 6.2.4 完成率インジケータ (任意 / MVP に含めるか議論)

- 「正解セル数 / 全塗りセル数」のパーセンテージを表示
- 「現在の塗りが正解と何%一致しているか」を可視化
- **MVP 含めない方向** で確定: ノノグラムは「論理的に詰める」ものであり、完成率を見せるとパズルの面白さが減る
- v1.1 で「ヒント (5 マス分追加) ボタン」のような救済機能と合わせて検討

### 6.2.5 ベストタイム表示

- パズル選択画面で各パズルのベストタイムを表示
- 同じパズルを再プレイして更新可能
- LocalStorage に保存 (§93)

## 6.3 MVP 含まない機能 (v1.1 以降)

| 機能 | 理由 |
|---|---|
| Undo / Redo | LocalStorage オートセーブとの整合性管理が複雑、MVP では盤面リセットで代替 |
| ヒント自動グレーアウト判定 | 「どの数字ブロックが完成したか」の判定アルゴリズムがエッジケースで複雑 |
| ヒント (救済) ボタン | ノノグラム本来の論理性を損なう、要検討 |
| ペナルティ式 (Hard モード) | 任天堂式の時間ペナルティ + ミス上限。MVP は単一モードに集中 |
| 完成率インジケータ | パズルの面白さを減らす可能性 |
| 一手だけヒント表示 | 同上 |

## 6.4 旧仕様との対応

| 旧 §60_items (プラットフォーマー) | 新 §60_assists (ノノグラム) |
|---|---|
| アイテム (キノコ / ファイア / スター) | なし (アイテム概念なし) |
| ?ブロックの内容物抽選 | なし |
| コインと得点 | なし |
| 取得効果 (パワーアップ / 体力回復) | なし (ヒント手動マーク + 盤面リセットが補助) |

旧 §60_items の全内容は **削除** (Round 6 で旧コード削除)。本章はそれに代わる新仕様。
