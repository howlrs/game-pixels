# 20. 盤面モデル (Grid Model)

## 2.1 盤面の基本構造

ピクセルズの盤面は **W 列 × H 行** の 2D グリッド。各マスを **セル (Cell)** と呼ぶ (用語: §00_glossary)。

```
        col 0  col 1  col 2  ...
row 0  [   ] [   ] [   ] ...
row 1  [   ] [   ] [   ] ...
row 2  [   ] [   ] [   ] ...
...
```

- **座標系**: 左上原点、`(col, row)` (= `(x, y)`)、col は 0 〜 W-1、row は 0 〜 H-1
- **MVP 盤面サイズ** (詳細: §97):
  - 5×5 (25 セル) — 入門
  - 10×10 (100 セル) — 標準、スマホ快適
  - 15×15 (225 セル) — 上級、PC + タブレット
  - 16×16 以上は MVP 範囲外 (v1.1 で 20×20 / 25×25 を検討)

## 2.2 セル状態 (三値 enum)

各セルは以下のいずれか 1 つの状態を持つ:

| 値 | 表記 (内部) | 表示 (描画) | 形状区別 (a11y) |
|---|---|---|---|
| **空 (empty)** | `0` (TypeScript: `'empty'`) | 背景色 | (空白) |
| **塗 (filled)** | `1` (TypeScript: `'filled'`) | 単色 (例: ダークグレー) で塗りつぶし | (塗り) |
| **× (x-marked)** | `2` (TypeScript: `'x'`) | 背景色 + × 記号 (フォントベース or SVG) | × の形状 |

> **§11 a11y 配慮**: 塗 / × の区別は色だけでなく **形状でも判別可能** にする (色覚多様性対応)。色覚シミュレータでは塗 = 暗い四角、× = 細い × 印で区別。

## 2.3 状態遷移

ユーザー入力 (§90) で各セルの状態は以下のとおり遷移する:

| 現在状態 | 入力モード: 塗 (Fill) | 入力モード: × (Mark X) | 入力モード: 消 (Erase) |
|---|---|---|---|
| 空 | 塗 へ | × へ | 空 のまま (no-op) |
| 塗 | 塗 のまま (no-op) or 空 へ ※ | × へ | 空 へ |
| × | 塗 へ | × のまま (no-op) or 空 へ ※ | 空 へ |

> **※ 同じモードで再操作した場合**: PC の左/右クリックは「ドラッグで連続塗り/連続×」を実装するため、既に同状態のセルは no-op (上書きしない)。タップによる単発操作のみ、同状態を再選択した場合の挙動を「トグル (空に戻す)」or 「no-op」のどちらにするかは MVP 実装時に決定 (デフォルト: no-op、消したい時は明示的に消モードを選ぶ)。

## 2.4 内部表現 (TypeScript 型)

```typescript
// Round 6 で実装する型定義のドラフト (本 docs では仕様として固定):

export type CellState = 'empty' | 'filled' | 'x';

export const EMPTY: CellState = 'empty';
export const FILLED: CellState = 'filled';
export const X_MARKED: CellState = 'x';

// 盤面: 1D 配列で W*H 要素を持つ (TypedArray でなくてもよい、サイズは小)
export interface Board {
  readonly width: number;     // 列数 W
  readonly height: number;    // 行数 H
  readonly cells: CellState[]; // length === W * H、cells[row * W + col] でアクセス
}

// インデックス計算
export function indexOf(board: Board, col: number, row: number): number {
  return row * board.width + col;
}

export function getCell(board: Board, col: number, row: number): CellState {
  return board.cells[indexOf(board, col, row)]!;
}

export function setCell(board: Board, col: number, row: number, state: CellState): void {
  board.cells[indexOf(board, col, row)] = state;
}
```

> **設計判断**: 旧プラットフォーマー仕様では `Int32Array` SoA (TypedArray) を採用していたが、ノノグラムでは盤面サイズが小 (最大 15×15 = 225 セル)、毎フレーム更新する必要がない (ユーザー入力時のみ)、決定論よりも可読性を優先するため、**通常の `CellState[]` 配列で十分**。Bun + V8 でも遅延なし。bitECS や TypedArray SoA は **本作では不採用** (Round 6 で削除予定、§94)。

## 2.5 クリア判定

盤面の塗り状態が **正解ビットマップ** (§80) と一致したらクリア:

```typescript
export function isCleared(board: Board, solution: ReadonlyArray<0 | 1>): boolean {
  if (board.cells.length !== solution.length) return false;
  for (let i = 0; i < board.cells.length; i++) {
    const isFilled = board.cells[i] === FILLED;
    const shouldBeFilled = solution[i] === 1;
    if (isFilled !== shouldBeFilled) return false;
  }
  return true;
}
```

- × マークは判定に影響しない (空セル扱い)
- 完全一致 (true) でクリア演出発動 (§91)
- ユーザーが × を全部塗ると一時的に正解状態になる可能性があるが、これは正常な仕様 (× は補助メモであり、ゲーム的には間違いではない)

## 2.6 盤面初期化

新しいパズルを開始するときは全セル `empty` に初期化:

```typescript
export function createBoard(width: number, height: number): Board {
  return {
    width,
    height,
    cells: new Array(width * height).fill(EMPTY),
  };
}

export function resetBoard(board: Board): void {
  board.cells.fill(EMPTY);
}
```

`resetBoard` は §60 の「盤面リセット」ボタンで呼ばれる (Undo の代替)。

## 2.7 永続化 (進行中盤面のセーブ)

§93 で詳述。要点:
- LocalStorage に進行中盤面の `CellState[]` を JSON で保存
- セーブタイミングは debounce (数秒、または中断時)
- パズル ID をキーに複数パズルを同時保存可能

## 2.8 設計上の留意点 (旧仕様からの転換)

旧プラットフォーマー仕様 (Round 4) では「物理 (重力 / 速度 / 加速度) を整数 + subpixel で扱い、`Int32Array` SoA で決定論的に保持する」設計だったが、ノノグラムでは:

- **物理は不要** (リアルタイム性なし、マスごとの離散決定のみ)
- **subpixel 不要** (描画は CSS グリッド + 整数 px、Pixi.js 上でも整数座標)
- **bitECS / SoA 不要** (盤面サイズが小、更新頻度が低い)
- **決定論** は必要だが「セーブ → 復帰時に同じ盤面が再現される」という弱い決定論で十分 (RNG は不要)

旧 §20_physics の構成 (subpixel 単位 / 重力テーブル / ジャンプ初速 / Coyote / Jump Buffer) は **すべて削除** (Round 6 で旧コード削除)。本章 §20_grid-model はそれに代わる新仕様。
