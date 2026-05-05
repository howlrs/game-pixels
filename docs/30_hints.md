# 30. ヒント (Clue)

## 3.1 ヒントとは

ノノグラムでは、各 **行** と **列** に **連続塗りセルの長さ列** がヒントとして与えられる。例:

```
   1  2  1
   1  1  3
1  ?  ?  ?
2  ?  ?  ?
1  ?  ?  ?
```

- 列ヒント: 列 0 → `[1, 1]` (上から 1 マス + 1 マス、間に 1 マス以上の空)、列 1 → `[2, 1]`、列 2 → `[1, 3]`
- 行ヒント: 行 0 → `[1]`、行 1 → `[2]`、行 2 → `[1]`

ユーザーはこれらのヒントから論理的に推論し、盤面を完成させる。

## 3.2 ヒントの形式 (内部表現)

```typescript
// Round 6 で実装する型定義のドラフト:

export type Clue = number[]; // 例: [3, 1, 2] = "3 連続塗 → 1 マス以上空 → 1 連続塗 → 1 マス以上空 → 2 連続塗"

export interface ClueSet {
  readonly width: number;         // 盤面の列数 W (== colClues.length)
  readonly height: number;        // 盤面の行数 H (== rowClues.length)
  readonly rowClues: Clue[];      // 各行のヒント (length === height)
  readonly colClues: Clue[];      // 各列のヒント (length === width)
}
```

### 例: 5×5 パズル「ハート」
```
正解 (1=塗, 0=空):
. # . # .
# # # # #
# # # # #
. # # # .
. . # . .

行ヒント (rowClues):
  rowClues[0] = [1, 1]
  rowClues[1] = [5]
  rowClues[2] = [5]
  rowClues[3] = [3]
  rowClues[4] = [1]

列ヒント (colClues):
  colClues[0] = [2]
  colClues[1] = [4]
  colClues[2] = [3, 1]
  colClues[3] = [4]
  colClues[4] = [2]
```

## 3.3 ゼロ行/列の扱い

全マス空の行/列のヒントは **`[0]`** で表す (空の `[]` ではない):

```typescript
rowClues[3] = [0]; // 行 3 は全マス空 (一切塗らない)
```

理由 (§00_glossary 用語集 + §96 a11y):
- スクリーンリーダーで「空欄」と読まれるより「ゼロ」と明確に読まれる方が分かりやすい
- 視覚的にも `0` が表示される方が「塗らない行」と即理解できる
- ノノグラムの慣習として `0` 表示が一般的 (任天堂版も `0` 表示)

## 3.4 ヒント生成 (run-length encoding)

正解ビットマップ (`solution: (0 | 1)[][]`) からヒントを生成するアルゴリズム:

```typescript
// パズル生成ツール側で事前計算する関数 (本作では実行時に呼ばない)。
// MVP では「20 個のパズル JSON を事前生成し、ヒント配列を JSON に埋め込み済み」とする。
// 実行時はこの関数を呼ばないため、バグの温床になりにくい。

export function generateRowClue(row: ReadonlyArray<0 | 1>): Clue {
  const result: number[] = [];
  let runLength = 0;
  for (const cell of row) {
    if (cell === 1) {
      runLength++;
    } else if (runLength > 0) {
      result.push(runLength);
      runLength = 0;
    }
  }
  if (runLength > 0) result.push(runLength);
  return result.length === 0 ? [0] : result; // 全空なら [0]
}

export function generateColClue(solution: ReadonlyArray<ReadonlyArray<0 | 1>>, col: number): Clue {
  const colCells = solution.map((row) => row[col]!);
  return generateRowClue(colCells);
}

export function generateClueSet(solution: ReadonlyArray<ReadonlyArray<0 | 1>>): ClueSet {
  const height = solution.length;
  const width = solution[0]?.length ?? 0;
  return {
    width,
    height,
    rowClues: solution.map(generateRowClue),
    colClues: Array.from({ length: width }, (_, col) => generateColClue(solution, col)),
  };
}
```

## 3.5 設計判断: ヒントは事前計算 (MVP)

Gemini Pro deep の独立妥当性検証 (Round 5 / Step A) で:
> 「実行時計算はバグの温床になり、無駄な処理です。パズル数 20 個固定の MVP であれば動的生成のメリットがありません。」

との指摘により、**MVP では実行時生成しない** ことを確定。代わりに:

- **パズル JSON 生成時** に `generateClueSet` を呼んでヒント配列を JSON に埋め込む
- **ゲーム側** はヒントを「単純なデータ」として読み込むだけ (生成ロジックを持たない)
- バグの温床 (run-length のエッジケース、ゼロ行) は生成時に確実に処理済

パズル JSON のフォーマット詳細は §80 で定義。ヒント生成スクリプトは Round 6 で `scripts/generate-puzzles.mjs` として実装。

## 3.6 ヒント表示 (UI)

詳細は §91 描画。ここでは要点のみ:

- 行ヒントは盤面の **左側** に右寄せで表示 (例: `1 2 1` のように space 区切り)
- 列ヒントは盤面の **上側** に下寄せで表示
- 各ヒント数字は **クリック可能 (タップ可能)** で、ユーザーが手動でグレーアウト (取り消し線) できる (§60)
- 自動グレーアウト (現在の盤面で完成した数字を自動検出) は MVP 範囲外、v1.1

## 3.7 解の一意性 (uniqueness)

詳細は §80 で扱うが、要点:
- パズル生成時にツール側で「論理的に解が 1 つしかない」ことを保証する
- ゲーム側は一意の前提で実装 (複数解の検証ロジックを持たない)
- 一意性検証アルゴリズムは Round 6 の `scripts/generate-puzzles.mjs` 内で実装 (簡易 backtracking solver で「解が複数ないか」確認)

## 3.8 旧仕様との対応

| 旧 §30_collision (プラットフォーマー) | 新 §30_hints (ノノグラム) |
|---|---|
| タイル AABB の軸分離衝突 | 不要 (ノノグラムには衝突なし) |
| ゴーストバーテックス対策 | 不要 |
| 片道床 / 坂 | 不要 |
| Y 軸 → X 軸 の解決順序 | 不要 |

旧 §30_collision の全内容は **削除** (Round 6 で旧コード削除)。本章はそれに代わる新仕様。
