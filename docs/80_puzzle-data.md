# 80. パズルデータ形式 (Puzzle Data)

## 8.1 概要

ピクセルズの 1 つのパズルは **1 つの JSON ファイル** で表現する。各パズルは:

- 正解ビットマップ (W×H の 0/1 配列)
- 事前計算済の行/列ヒント (§30 で生成済)
- メタデータ (タイトル / カテゴリ / 難易度 / 想定解時間)

を含む。

## 8.2 ファイル配置

```
public/puzzles/
├── 5x5/
│   ├── heart.json
│   ├── star.json
│   ├── house.json
│   ├── cat.json
│   └── apple.json
├── 10x10/
│   ├── ... (8 個)
└── 15x15/
    ├── ... (7 個)
```

- `public/` 配下 (Vite が dist にコピー)、Cloudflare Pages から静的配信
- ファイル名 = パズル ID (英小文字 + 数字 + ハイフン、例: `cat-sleeping`)
- カテゴリ別 (5x5 / 10x10 / 15x15) のサブディレクトリで整理
- パズルセット全体のインデックス: `public/puzzles/index.json`

> 旧 `public/stages/` は Round 6 で `public/puzzles/` に rename + 旧 1-1.json 削除。

## 8.3 JSON フォーマット (PuzzleData)

```typescript
// Round 6 で実装する型定義のドラフト:

export type PuzzleId = string; // 英小文字 + 数字 + ハイフン、例: "5x5-heart" / "10x10-cat-sleeping"
export type DifficultyLevel = 'easy' | 'medium' | 'hard'; // 難易度

export interface PuzzleMeta {
  id: PuzzleId;
  title: string;            // 表示名 (日本語可、例: "ハート")
  width: number;            // 列数 W
  height: number;           // 行数 H
  difficulty: DifficultyLevel;
  estimatedSolveSeconds: number; // 想定解時間 (秒)、ベストタイムの目安
  category: '5x5' | '10x10' | '15x15'; // パズルセットの分類
  // SEO / アクセシビリティ用
  description: string;      // クリア絵の解説 (例: "シンプルなハートマーク")
}

export interface PuzzleData {
  meta: PuzzleMeta;
  /**
   * 正解ビットマップ (1 = 塗、0 = 空)。
   * 2D 配列形式: solution[row][col]、length === height、各行の length === width
   */
  solution: ReadonlyArray<ReadonlyArray<0 | 1>>;
  /**
   * 行ヒント (length === height、各行に対応)。事前計算済 (§30)
   */
  rowClues: ReadonlyArray<ReadonlyArray<number>>;
  /**
   * 列ヒント (length === width、各列に対応)。事前計算済 (§30)
   */
  colClues: ReadonlyArray<ReadonlyArray<number>>;
  /**
   * 解の一意性検証フラグ (生成ツール側で確認済)。
   * 通常は true。MVP では false のパズルを含めない。
   */
  isUniqueSolution: boolean;
}
```

## 8.4 例: 5×5 ハート

```json
{
  "meta": {
    "id": "5x5-heart",
    "title": "ハート",
    "width": 5,
    "height": 5,
    "difficulty": "easy",
    "estimatedSolveSeconds": 60,
    "category": "5x5",
    "description": "シンプルなハートマーク"
  },
  "solution": [
    [0, 1, 0, 1, 0],
    [1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1],
    [0, 1, 1, 1, 0],
    [0, 0, 1, 0, 0]
  ],
  "rowClues": [[1, 1], [5], [5], [3], [1]],
  "colClues": [[2], [4], [4], [4], [2]],
  "isUniqueSolution": true
}
```

> 注: 上記 `solution` のヒントが本当に一意解か (= 別の塗り方では同じヒントにならないか) は **生成ツール側で検証必須**。本例は概念説明用 (実 MVP の 20 個は Round 6 で別途生成)。
> ※ Round 6 実装時、`generateClueSet` のテストで `colClues[2]` を `[3, 1]` と誤記していたが正しくは `[4]` (列 2 は row 1-4 まで連続して塗) と判明、本ファイルも同時修正済。

## 8.5 パズルセットのインデックス (`public/puzzles/index.json`)

```typescript
export interface PuzzleIndex {
  /** 全パズルの一覧 (パズル選択画面で使用) */
  puzzles: PuzzleMeta[];
  /** カテゴリ順序 */
  categoryOrder: ('5x5' | '10x10' | '15x15')[];
}
```

- ゲーム起動時に `index.json` を 1 度だけフェッチ
- 個別パズルは選択時に `puzzles/{category}/{id}.json` をフェッチ
- Service Worker で precache (オフライン対応, §14.10)

## 8.6 Valibot スキーマ (実行時バリデーション)

JSON ロード時に **Valibot で必ず検証** (§14.2.3):

```typescript
import * as v from 'valibot';

const PuzzleMetaSchema = v.object({
  id: v.pipe(v.string(), v.regex(/^[a-z0-9-]+$/)),
  title: v.pipe(v.string(), v.minLength(1)),
  width: v.pipe(v.number(), v.integer(), v.minValue(3), v.maxValue(50)),
  height: v.pipe(v.number(), v.integer(), v.minValue(3), v.maxValue(50)),
  difficulty: v.picklist(['easy', 'medium', 'hard']),
  estimatedSolveSeconds: v.pipe(v.number(), v.integer(), v.minValue(10)),
  category: v.picklist(['5x5', '10x10', '15x15']),
  description: v.string(),
});

const ClueSchema = v.array(v.pipe(v.number(), v.integer(), v.minValue(0)));

export const PuzzleDataSchema = v.object({
  meta: PuzzleMetaSchema,
  solution: v.array(v.array(v.picklist([0, 1]))),
  rowClues: v.array(ClueSchema),
  colClues: v.array(ClueSchema),
  isUniqueSolution: v.boolean(),
});

export type PuzzleData = v.InferOutput<typeof PuzzleDataSchema>;
```

### Cross-field 検証 (loader 側)

Valibot だけでは表現しにくい整合性を loader 側で検証 (§8.2.3 旧仕様の方針を継承):

- `solution.length === meta.height`
- `solution[i].length === meta.width` (全 i)
- `rowClues.length === meta.height`
- `colClues.length === meta.width`
- `rowClues[i]` は `solution[i]` から生成した結果と一致 (§30 generateRowClue)
- `colClues[j]` は同様に一致

```typescript
export function validatePuzzleConsistency(puzzle: PuzzleData): void {
  // 行/列の長さチェック
  if (puzzle.solution.length !== puzzle.meta.height) {
    throw new Error(`solution row count mismatch`);
  }
  for (const row of puzzle.solution) {
    if (row.length !== puzzle.meta.width) {
      throw new Error(`solution col count mismatch`);
    }
  }
  // ヒント一致チェック (§30)
  // (実装は §30 の generateRowClue / generateColClue を呼ぶ)
}
```

## 8.7 解の一意性 (uniqueness) 検証

パズル生成ツール (`scripts/generate-puzzles.mjs`) 側で:

1. 正解ビットマップから `rowClues` / `colClues` を生成
2. 簡易 backtracking solver で `(rowClues, colClues)` から解を全探索
3. 解が 1 つしか見つからなければ `isUniqueSolution: true` を設定

実装は Round 6 で行う。MVP の 20 パズルはすべて `isUniqueSolution: true` を確認済の状態でリリース。

### 責務分担 (Round 5 / Gemini Pro deep 指摘で明確化)

| レイヤ | 責務 | 検証内容 |
|---|---|---|
| **生成ツール** (`scripts/generate-puzzles.mjs`、Round 6) | パズルの **論理的整合性を 100% 保証** | 1. solution からの rowClues/colClues 生成、2. 解の一意性 backtracking 検証、3. JSON 書き出し |
| **ゲーム側 loader** (Round 6) | Valibot で **型 + 範囲のみ検証** (パフォーマンス重視) | 型一致、数値範囲 (`width: 3〜50` 等)、文字列形式 (`id` regex 等) |
| **ゲーム側 cross-field 検証** (本章 §8.6) | データ構造の整合性のみ確認 | `solution.length === height`、`rowClues.length === height`、`colClues.length === width` |

> **明示的な非責務**: ゲーム側は `rowClues[i]` が `solution[i]` から生成される実際の run-length encoding と一致するかを **再計算して検証しない** (パフォーマンス + 重複コード削減)。生成ツールが正しく出力していることを前提とする。万一不整合な JSON が混入した場合はクリア判定で `isCleared: false` のまま進められなくなり、ユーザーが「このパズル変だ」と気付ける (= バグレポート可能なフェイルセーフ)。

## 8.8 セキュリティ / 改ざん耐性

- パズル JSON はクライアント側に配信されるため、ユーザーは中身を見れる (= 答えを盗み見れる)
- これは MVP では許容 (シングルプレイヤー、競争性が低い)
- v1.1 でランキング機能を入れる場合、サーバー側でクリア時間 + 盤面ハッシュを検証する設計を §94.15 / Cloudflare D1 で別途実装

## 8.9 旧仕様との対応

| 旧 §80_world (プラットフォーマー) | 新 §80_puzzle-data (ノノグラム) |
|---|---|
| Save → Profile → World[] → Stage[] → Area[] → Tile[][] | Puzzle (1 個 = 盤面 + ヒント + メタ) のフラットな集合 |
| タイル ID 16bit + 属性フラグ | 不要 (盤面は 0/1 のみ) |
| エリア間遷移 (パイプワープ等) | 不要 |
| 自動スクロール / チェックポイント | 不要 |
| 隠しゾーン | 不要 |

旧 §80_world の全内容は **削除** (Round 6 で旧コード削除)。本章はそれに代わる新仕様。
